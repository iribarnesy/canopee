/**
 * État du jeu : une station, une grille de sol 1 m² (eau + azote par cellule),
 * des arbres positionnés. Chaque étape de la feuille de route
 * (docs/regles.md §17) enrichit ces types.
 */

import type { EconomyState } from "./actions";
import { createEconomy } from "./actions";
import type { CarbonState } from "./carbon";
import { createCarbonState, T_HA_TO_G_M2 } from "./carbon";
import { getEspece } from "./especes";
import type { GridDims } from "./grid";
import { cellCount } from "./grid";
import { KG_PER_HA_TO_G_PER_M2 } from "./nitrogen";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
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
  /** stock initial de carbone du sol (humus), t C/ha — LE gros stock (§12) */
  initialSoilCTHa: number;
  /** pH initial du sol (nuancier acidiphile→calcicole des espèces, atlas) */
  phInitial: number;
  /** remontée capillaire de nappe, mm/semaine (0 = pas de nappe accessible) */
  remonteeNappeMmSemaine: number;
  /** côté de la parcelle carrée, m (grille de widthM × heightM cellules de 1 m²) */
  coteM: number;
  /** pluie de semis annuelle venant du paysage voisin (docs/regles.md §8) */
  voisinage: { especeId: string; semisParAn: number }[];
}

export function gridDims(station: Station): GridDims {
  return { widthM: station.coteM, heightM: station.coteM };
}

/** État dynamique du sol : une valeur par cellule, index `i = y*width + x`. */
export interface SoilState {
  /** eau de la réserve utile, mm */
  waterMm: number[];
  /** eau gravitaire au-dessus de la capacité au champ (engorgement), mm */
  excessMm: number[];
  /** azote minéral, g/m² (1 kg/ha = 0,1 g/m²) */
  mineralNG: number[];
  /** azote de la litière au sol, g/m² (libéré vers le minéral en se décomposant) */
  litterNG: number[];
  /** carbone de la litière au sol, g/m² (se décompose avec l'azote) */
  litterCG: number[];
  /** carbone de l'humus, g/m² — pool lent, alimenté par l'humification */
  humusCG: number[];
  /** pH de la cellule (modifiable par chaulage ; dérive lente en V1) */
  ph: number[];
  /** vitesse de décomposition de la litière de la cellule, /semaine à T°/humidité optimales
   * (moyenne pondérée des apports : litière d'aulne rapide, aiguilles de pin lentes, ch2-B) */
  litterK: number[];
}

export interface GameState {
  /** semaine absolue depuis le début de partie (0, 1, 2, …) */
  week: number;
  station: Station;
  soil: SoilState;
  trees: TreeState[];
  nextTreeId: number;
  economy: EconomyState;
  carbon: CarbonState;
  /** degrés-jours base 5 °C cumulés depuis le 1er janvier (phénologie, §7.2) */
  ddYearBase5: number;
  rng: RngState;
}

/** Flux de la semaine, moyennés sur la parcelle (affichage + tests de conservation). */
export interface TickFluxes {
  rainMm: number;
  etpMm: number;
  /** évaporation du sol, mm moyen */
  evapMm: number;
  /** remontée de nappe absorbée, mm moyen (flux entrant) */
  nappeMm: number;
  /** transpiration des arbres, mm moyen (Σ L / surface) */
  transpirationMm: number;
  drainageMm: number;
  overflowMm: number;
  /** engorgement moyen ∈ [0,1] */
  waterloggingMean: number;
  mineralizationKgHa: number;
  uptakeKgHa: number;
  leachedKgHa: number;
  /** N retourné au sol par la chute des feuilles (recyclage interne), kg/ha */
  litterfallKgHa: number;
  /** N libéré par la décomposition de la litière, kg/ha */
  litterDecayKgHa: number;
  /** N NOUVEAU entré par la fixation symbiotique (litière des fixateurs), kg/ha */
  fixationKgHa: number;
}

export function createGameState(
  station: Station,
  rng: RngState,
  options: { treasuryEur?: number } = {},
): GameState {
  const n = cellCount(gridDims(station));
  return {
    week: 0,
    station,
    economy: createEconomy(options.treasuryEur ?? 20_000),
    carbon: createCarbonState(),
    ddYearBase5: 0,
    // Début de partie au 1er janvier : réserve utile rechargée, pas d'eau gravitaire.
    soil: {
      waterMm: new Array(n).fill(station.ruMm),
      excessMm: new Array(n).fill(0),
      mineralNG: new Array(n).fill(station.initialMineralNKgHa * KG_PER_HA_TO_G_PER_M2),
      litterNG: new Array(n).fill(0),
      litterCG: new Array(n).fill(0),
      humusCG: new Array(n).fill(station.initialSoilCTHa * T_HA_TO_G_M2),
      ph: new Array(n).fill(station.phInitial),
      litterK: new Array(n).fill(0),
    },
    trees: [],
    nextTreeId: 1,
    rng,
  };
}

/** Proto-action : planter un plant à une position donnée (30 cm par défaut). */
export function plantAt(
  state: GameState,
  especeId: string,
  x: number,
  y: number,
  heightM = 0.3,
): GameState {
  getEspece(especeId); // valide l'id
  const tree: TreeState = {
    id: state.nextTreeId,
    especeId,
    x,
    y,
    ageWeeks: 0,
    heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
  };
  return { ...state, trees: [...state.trees, tree], nextTreeId: state.nextTreeId + 1 };
}

/**
 * Proto-action : planter n plants à des positions pseudo-aléatoires SEEDÉES
 * (consomme le rng de la partie — deux parties de même seed plantent pareil).
 */
export function plantScattered(
  state: GameState,
  especeId: string,
  count: number,
  heightM = 0.3,
): GameState {
  getEspece(especeId);
  const side = state.station.coteM;
  let rng = state.rng;
  const trees = [...state.trees];
  for (let i = 0; i < count; i++) {
    const rx = rngFloat(rng);
    const ry = rngFloat(rx.state);
    rng = ry.state;
    trees.push({
      id: state.nextTreeId + i,
      especeId,
      x: rx.value * side,
      y: ry.value * side,
      ageWeeks: 0,
      heightM,
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
    });
  }
  return { ...state, trees, nextTreeId: state.nextTreeId + count, rng };
}

/** Semaine dans l'année (0–51). */
export function weekOfYear(state: GameState): number {
  return state.week % 52;
}
