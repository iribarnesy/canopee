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
import type { Horizon, SoilProfile } from "./soil";
import { ruHorizonMm } from "./soil";
import type { TreeState } from "./trees";

/** Paramètres immuables de la station (extrait V0 de docs/regles.md §2). */
export interface Station {
  id: string;
  nom: string;
  latitudeDeg: number;
  /**
   * Profil de sol : la description PHYSIQUE dont tout le reste est dérivé
   * (soil.ts). Les champs qui suivent sont calculés, jamais saisis.
   */
  profil: SoilProfile;
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
  /**
   * Drainage EXTERNE, mm/semaine : ce que l'exutoire peut évacuer, quelle que
   * soit la perméabilité du sol. Un fond de vallée à nappe affleurante ne peut
   * rien évacuer même sur sol sableux — c'est la topographie qui commande.
   * `Infinity` = versant bien drainé.
   */
  drainageExterneMmSemaine: number;
  /**
   * Exposition au vent ∈ [0,1] : 0 = vallon abrité, 1 = lande atlantique ou
   * plateau ouvert. Le vent dessèche les sujets découverts — c'est ce qui rend
   * l'effet brise-vent d'une haie ou d'une nurse payant (ch5, docs §9).
   */
  ventExposition: number;
  /** côté de la parcelle carrée, m (grille de widthM × heightM cellules de 1 m²) */
  coteM: number;
  /** couverture herbacée au démarrage ∈ [0,1] (friche enherbée vs sol nu) */
  herbeInitiale: number;
  /** pluie de semis annuelle venant du paysage voisin (docs/regles.md §8) */
  voisinage: { especeId: string; semisParAn: number }[];
  /**
   * Densité de cervidés du paysage, individus/ha (« équivalent chevreuil »).
   * C'est une donnée de CONTEXTE, au même titre que le voisinage semencier :
   * le domaine vital d'un chevreuil fait des dizaines d'hectares, la parcelle
   * ne détermine pas sa population, elle en reçoit la part que son attrait
   * justifie (gibier.ts). Ordres de grandeur français : 0,05/ha en plaine
   * cultivée, 0,3/ha dans un massif à forte densité.
   */
  gibierParHa: number;
  /**
   * Dépôts atmosphériques d'azote, kg/ha/an. Ce n'est pas un détail : entre
   * les oxydes d'azote de la combustion et l'ammoniac de l'élevage, le ciel
   * français apporte 8 à 25 kg N/ha/an selon la région. Sur un sol pauvre,
   * c'est PLUS que ce que la minéralisation de l'humus fournit — c'est même
   * ce qui fait disparaître les landes et les pelouses maigres d'Europe, en
   * les fertilisant assez pour que les graminées et les ligneux prennent le
   * dessus. L'ignorer rendait nos stations pauvres invivables.
   */
  depositionNKgHaAn: number;
}

export function gridDims(station: Station): GridDims {
  return { widthM: station.coteM, heightM: station.coteM };
}

/**
 * État dynamique du sol. L'eau est stratifiée : indexée par
 * `cellule * nbHorizons + horizon` (critère A10). L'azote, le carbone et le pH
 * restent mono-couche — la vie du sol, l'absorption d'azote et le chaulage se
 * jouent pour l'essentiel dans les premiers centimètres *(approximation
 * assumée, à lever si le besoin apparaît)*.
 */
export interface SoilState {
  /** eau de la réserve utile, mm — par (cellule, horizon) */
  waterMm: number[];
  /** eau gravitaire au-dessus de la capacité au champ, mm — par (cellule, horizon) */
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
  /**
   * Couverture de la strate herbacée ∈ [0,1] par cellule (herbe.ts) : la
   * concurrence que subissent les jeunes plants, et la protection du sol.
   */
  herbeCouverture: number[];
  /**
   * Biomasse herbacée présente ∈ [0,1] : elle SUIT la couverture mais ne
   * disparaît pas quand l'herbe jaunit — le foin sur pied reste le meilleur
   * combustible de l'été. Seuls le feu, la fauche et la décomposition la font
   * baisser.
   */
  herbeBiomasse: number[];
  /**
   * Humidité de surface telle que le tapis la « vit » : moyenne lissée sur
   * plusieurs semaines (herbe.ts). Sans cette mémoire, la couverture réagit à
   * sa propre consommation avec une semaine de retard et se met à osciller.
   */
  herbeHumidite: number[];
  /**
   * Population de ravageurs par cellule ∈ [0,1] (ravageurs.ts). Elle vit là où
   * des hôtes sensibles s'affaiblissent, et recule là où l'habitat nourrit les
   * auxiliaires.
   */
  ravageurs: number[];
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
  /** couverture herbacée moyenne ∈ [0,1] */
  herbeCouvertureMean: number;
  /** matière sèche prélevée par le gibier cette semaine, kg */
  broutageKg: number;
  /** azote apporté par les dépôts atmosphériques, kg/ha (semaine) */
  depositionKgHa: number;
  /** population moyenne de ravageurs sur la parcelle ∈ [0,1] */
  ravageurMoyen: number;
  /** qualité moyenne de l'habitat des auxiliaires ∈ [0,1] */
  auxiliairesMoyen: number;
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
  const nH = Math.max(1, station.profil.length);
  // Chaque horizon démarre à sa propre réserve utile (sol ressuyé du 1er janvier).
  const eauInitiale: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let h = 0; h < nH; h++) eauInitiale.push(ruHorizonMm(station.profil[h] as Horizon));
  }
  return {
    week: 0,
    station,
    economy: createEconomy(options.treasuryEur ?? 20_000),
    carbon: createCarbonState(),
    ddYearBase5: 0,
    // Début de partie au 1er janvier : réserve utile rechargée, pas d'eau gravitaire.
    soil: {
      waterMm: eauInitiale,
      excessMm: new Array(n * nH).fill(0),
      mineralNG: new Array(n).fill(station.initialMineralNKgHa * KG_PER_HA_TO_G_PER_M2),
      litterNG: new Array(n).fill(0),
      litterCG: new Array(n).fill(0),
      humusCG: new Array(n).fill(station.initialSoilCTHa * T_HA_TO_G_M2),
      ph: new Array(n).fill(station.phInitial),
      // Une parcelle nue au départ : la strate s'installe d'elle-même.
      herbeCouverture: new Array(n).fill(station.herbeInitiale),
      herbeBiomasse: new Array(n).fill(station.herbeInitiale),
      // Le 1er janvier, la réserve de surface est pleine.
      herbeHumidite: new Array(n).fill(1),
      ravageurs: new Array(n).fill(0),
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
    rootDepthCm: 20,
    hauteurElagueeM: 0,
    pousseTendreM: 0,
    vigueur: 1,
    protege: false,
    recepages: 0,
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
      rootDepthCm: 20,
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      vigueur: 1,
      protege: false,
      recepages: 0,
    });
  }
  return { ...state, trees, nextTreeId: state.nextTreeId + count, rng };
}

/** Semaine dans l'année (0–51). */
export function weekOfYear(state: GameState): number {
  return state.week % 52;
}
