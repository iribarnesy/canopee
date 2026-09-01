/**
 * État du jeu, V0 : une station minimale, un sol mono-zone, un compteur de temps.
 * Chaque étape de la feuille de route (docs/regles.md §17) enrichit ces types.
 */

import type { RngState } from "./rng";

/** Paramètres immuables de la station (extrait V0 de docs/regles.md §2). */
export interface Station {
  id: string;
  nom: string;
  latitudeDeg: number;
  /** réserve utile du sol, mm (dérivée de texture × profondeur en V1) */
  ruMm: number;
}

/** État dynamique du sol, mono-zone en V0. */
export interface SoilState {
  waterMm: number;
}

export interface GameState {
  /** semaine absolue depuis le début de partie (0, 1, 2, …) */
  week: number;
  station: Station;
  soil: SoilState;
  rng: RngState;
}

/** Flux de la semaine, pour l'affichage et les tests de conservation. */
export interface TickFluxes {
  rainMm: number;
  etpMm: number;
  etrMm: number;
  drainageMm: number;
  waterSatisfaction: number;
}

export function createGameState(station: Station, rng: RngState): GameState {
  return {
    week: 0,
    station,
    // On démarre sol plein : début de partie au 1er janvier, réserve rechargée.
    soil: { waterMm: station.ruMm },
    rng,
  };
}

/** Semaine dans l'année (0–51). */
export function weekOfYear(state: GameState): number {
  return state.week % 52;
}
