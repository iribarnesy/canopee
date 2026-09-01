/**
 * État du jeu, V0 : une station minimale, un sol mono-zone (eau + azote),
 * des arbres sans position spatiale (la grille arrive en V0.5).
 * Chaque étape de la feuille de route (docs/regles.md §17) enrichit ces types.
 */

import { getEspece } from "./especes";
import type { RngState } from "./rng";
import type { TreeState } from "./trees";

/** Paramètres immuables de la station (extrait V0 de docs/regles.md §2). */
export interface Station {
  id: string;
  nom: string;
  latitudeDeg: number;
  /** réserve utile du sol, mm (dérivée de texture × profondeur en V1) */
  ruMm: number;
  /** porosité de drainage (eau gravitaire max avant débordement), mm */
  excessCapacityMm: number;
  /** vitesse max de drainage, mm/semaine (conductivité du sol) */
  drainagePerWeekMm: number;
  /** minéralisation potentielle de l'humus, kg N/ha/semaine en conditions optimales */
  mineralizationPotentialKgHaWeek: number;
  /** azote minéral au démarrage, kg/ha */
  initialMineralNKgHa: number;
  /** surface de la parcelle, m² (grille spatiale en V1 — docs/regles.md §1.2) */
  parcelAreaM2: number;
}

/** État dynamique du sol, mono-zone en V0. */
export interface SoilState {
  waterMm: number;
  /** eau gravitaire au-dessus de la capacité au champ (engorgement), mm */
  excessMm: number;
  mineralNKgHa: number;
}

export interface GameState {
  /** semaine absolue depuis le début de partie (0, 1, 2, …) */
  week: number;
  station: Station;
  soil: SoilState;
  trees: TreeState[];
  nextTreeId: number;
  rng: RngState;
}

/** Flux de la semaine, pour l'affichage et les tests de conservation. */
export interface TickFluxes {
  rainMm: number;
  etpMm: number;
  etrMm: number;
  drainageMm: number;
  overflowMm: number;
  waterSatisfaction: number;
  waterloggingRatio: number;
  mineralizationKgHa: number;
  uptakeKgHa: number;
  leachedKgHa: number;
}

export function createGameState(station: Station, rng: RngState): GameState {
  return {
    week: 0,
    station,
    // Début de partie au 1er janvier : réserve utile rechargée, pas d'eau gravitaire.
    soil: { waterMm: station.ruMm, excessMm: 0, mineralNKgHa: station.initialMineralNKgHa },
    trees: [],
    nextTreeId: 1,
    rng,
  };
}

/**
 * Proto-action V0 : planter n plants d'une espèce (jeune plant de 30 cm par
 * défaut ; `heightM` permet d'initialiser un peuplement déjà en place).
 */
export function plant(state: GameState, especeId: string, count: number, heightM = 0.3): GameState {
  getEspece(especeId); // valide l'id
  const trees = [...state.trees];
  for (let i = 0; i < count; i++) {
    trees.push({
      id: state.nextTreeId + i,
      especeId,
      ageWeeks: 0,
      heightM,
      stress: 0,
      alive: true,
    });
  }
  return { ...state, trees, nextTreeId: state.nextTreeId + count };
}

/** Semaine dans l'année (0–51). */
export function weekOfYear(state: GameState): number {
  return state.week % 52;
}
