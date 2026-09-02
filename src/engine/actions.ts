/**
 * Actions du joueur (docs/regles.md §9-10) et économie V0 : argent (€) et
 * temps de travail (heures, plafond hebdomadaire par UTH). Les actions sont
 * DATÉES (semaine absolue) : le journal d'actions + la seed + la station
 * forment la sauvegarde rejouable (docs/stack.md).
 * Une action refusée l'est déterministiquement, avec sa raison ; une action
 * partiellement exécutée traite ses éléments dans l'ordre et s'arrête au
 * plafond (heures ou découvert).
 */

import { treeAboveCarbonKg, treeTotalCarbonKg } from "./carbon";
import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { HAUTEUR_BROUTAGE_M } from "./gibier";
import { crownRadiusM } from "./light";
import type { GameState } from "./state";
import { treeNitrogenNeedGWeek } from "./trees";

/** plafond d'heures de travail par UTH et par semaine (docs/regles.md §10) */
export const WEEK_HOURS_CAP = 60;
/** heures d'une UTH sur l'année (~1 800 h) */
export const UTH_HOURS_PER_YEAR = 1800;
/** découvert autorisé avant faillite, € (décision §15) */
export const OVERDRAFT_LIMIT_EUR = -20_000;
/** temps de plantation d'un arbre (trouaison, plant, protection), h *(à calibrer)* */
export const PLANT_HOURS = 1;
/** espacement minimal imposé à la plantation, m */
export const PLANT_MIN_SPACING_M = 1;
/** prix de vente du bois de chauffage, €/m³ *(à calibrer)* */
export const WOOD_PRICE_EUR_M3 = 35;
/** diamètre minimal pour qu'une bille intéresse une scierie, cm *(à calibrer)* */
export const DIAMETRE_OEUVRE_MIN_CM = 30;
/** hauteur de bille élaguée minimale pour vendre en bois d'œuvre, m */
export const BILLE_OEUVRE_MIN_M = 4;
/** temps d'élagage, h par mètre de tronc et par arbre *(à calibrer)* */
export const ELAGAGE_HOURS_PAR_M = 0.35;
/** hauteur maximale atteignable à l'élagage (au-delà, il faut une nacelle) */
export const ELAGAGE_MAX_M = 8;
/** Prix d'une protection individuelle (manchon/gaine + tuteur), € *(à calibrer)*. */
export const PROTECTION_EUR = 3;
/** Temps de pose d'une protection, h. */
export const PROTECTION_HEURES = 0.08;
/** temps de recépage d'une cépée, h *(à calibrer)* */
export const RECEPAGE_HOURS = 0.8;
/**
 * Décote d'un bois brûlé récupéré en coupe sanitaire : il vaut encore quelque
 * chose (chauffage, trituration), mais l'œuvre est perdue *(à calibrer)*.
 */
export const DECOTE_CHABLIS = 0.4;
/** salaire hebdomadaire chargé d'un ouvrier en CDI, € *(à calibrer)* */
export const SALARY_EUR_WEEK = 600;
/** salaire hebdomadaire d'un saisonnier (précarité incluse), payé d'avance, € */
export const SEASONAL_EUR_WEEK = 700;
/** indemnités + préavis à la rupture d'un CDI, € */
export const SEVERANCE_EUR = 1200;

/** chaulage : coût et temps par m² *(à calibrer)* */
export const LIME_EUR_M2 = 0.02;
export const LIME_HOURS_M2 = 0.002;
/** fauche/dégagement : temps par m² (débroussailleuse) *(à calibrer)* */
export const FAUCHE_HOURS_M2 = 0.006;
/** couverture herbacée restant juste après un passage */
export const FAUCHE_COUVERTURE_RESIDUELLE = 0.1;
/** effet d'un chaulage sur le pH (plafonné à 7,5) */
export const LIME_PH_STEP = 0.5;
/**
 * C/N du bois raméal fragmenté épandu : du BOIS, pas des feuilles — libération
 * lente sur plusieurs années, c'est toute la valeur du BRF (ch2-B).
 */
export const BRF_CN_RATIO = 40;

export interface EconomyState {
  treasuryEur: number;
  /** heures consommées cette semaine (remis à zéro chaque tick par le runner) */
  hoursUsedWeek: number;
  /** heures consommées depuis le début de l'année (affichage UTH) */
  hoursUsedYear: number;
  /** UTH disponibles = 1 (le joueur) + CDI + saisonniers actifs (recalculé chaque semaine) */
  uth: number;
  /** ouvriers permanents (salaire hebdo ; rupture = indemnités) */
  ouvriersCdi: number;
  /** contrats saisonniers en cours : semaine de fin (exclusive) de chacun */
  saisonniersFinSemaine: number[];
  bankrupt: boolean;
}

export function createEconomy(treasuryEur: number): EconomyState {
  return {
    treasuryEur,
    hoursUsedWeek: 0,
    hoursUsedYear: 0,
    uth: 1,
    ouvriersCdi: 0,
    saisonniersFinSemaine: [],
    bankrupt: false,
  };
}

export type GameAction =
  | {
      type: "planter";
      week: number;
      especeId: string;
      positions: { x: number; y: number }[];
    }
  | {
      type: "couper";
      week: number;
      treeIds: number[];
      /** vendre (bois énergie) ou broyer/épandre sur place (litière, BRF) */
      devenir: "vendre" | "epandre";
    }
  | {
      type: "recolter";
      week: number;
      treeIds: number[];
    }
  | {
      /**
       * Embauche (§10). CDI : 600 €/sem (1re semaine payée à l'embauche),
       * rupture 1 200 €. Saisonnier : 700 €/sem payées d'avance pour
       * `semaines` semaines, le contrat expire tout seul — l'outil des
       * pointes de récolte. `contrat` absent = CDI (vieux journaux).
       */
      type: "embaucher";
      week: number;
      contrat?: "cdi" | "saisonnier";
      semaines?: number;
    }
  | {
      /** rupture d'un CDI : indemnités + préavis (1 200 €) */
      type: "licencier";
      week: number;
    }
  | {
      /** chauler un disque : pH +0,5 (plafond 7,5) — pour les calcicoles (§9) */
      type: "chauler";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    }
  | {
      /**
       * Lever l'écorce (démasclage du liège) : une récolte qui ne tue pas
       * l'arbre et qui revient tous les dix ans.
       */
      type: "leverEcorce";
      week: number;
      treeIds: number[];
    }
  | {
      /**
       * Éclaircir une zone jusqu'à une densité cible, en désignant les tiges
       * par un CRITÈRE plutôt qu'une par une (ch5-A « les coupes »).
       *  - `parLeBas` : on retire les dominés — l'éclaircie classique, qui
       *    concentre la croissance sur les plus beaux sujets ;
       *  - `parLeHaut` : on prélève les gros — récolte du capital ;
       *  - `espece` : on retire une essence (dégager une nurse, diversifier
       *    une pinède pour couper la continuité du combustible).
       */
      type: "eclaircir";
      week: number;
      x: number;
      y: number;
      rayonM: number;
      /** tiges/ha visées après passage */
      densiteCibleParHa: number;
      critere: "parLeBas" | "parLeHaut" | "espece";
      /** pour le critère « espece » */
      especeId?: string;
      devenir: "vendre" | "epandre";
    }
  | {
      /**
       * Élaguer : monter une bille propre sur les arbres choisis. C'est ce
       * qui fera plus tard du bois d'œuvre au lieu du chauffage (ch5-A).
       */
      type: "elaguer";
      week: number;
      treeIds: number[];
      /** hauteur de tronc à dégager, m */
      hauteurM: number;
    }
  | {
      /**
       * Protéger : poser un manchon ou une gaine sur des plants. C'est le
       * geste qui décide du sort d'une plantation là où il y a du gibier —
       * il faut tenir jusqu'à ce que la flèche passe la hauteur de dent.
       */
      type: "proteger";
      week: number;
      treeIds: number[];
    }
  | {
      /**
       * Recéper : couper au ras pour faire repartir la souche en cépée
       * (taillis, trogne). Seules les espèces qui rejettent le supportent.
       */
      type: "receper";
      week: number;
      treeIds: number[];
    }
  | {
      /**
       * Faucher/dégager un disque : rabat la strate herbacée, qui repartira.
       * C'est l'entretien qui sauve une plantation de la concurrence (ch4-B) —
       * et l'herbe coupée reste au sol en litière.
       */
      type: "faucher";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    };

export interface ActionRefusal {
  week: number;
  action: GameAction["type"];
  reason: string;
}

export interface ApplyResult {
  state: GameState;
  refusals: ActionRefusal[];
}

/** Volume de bois récoltable, m³ — proxy allométrique V0 *(à calibrer IFN)*. */
export function woodVolumeM3(heightM: number): number {
  return 0.015 * heightM * heightM;
}

/**
 * Diamètre à hauteur de poitrine, cm — proxy tiré de la hauteur *(à calibrer)*.
 * Un arbre de 20 m fait environ 40 cm de diamètre.
 */
export function diametreCm(heightM: number): number {
  return 2 * heightM;
}

/**
 * Ce que vaut un arbre sur pied, € — et à quel titre. Une bille droite,
 * élaguée et de bon diamètre part en scierie à plusieurs centaines d'euros le
 * m³ ; le reste finit en bûches. C'est l'écart qui justifie l'élagage et la
 * patience (ch5-A).
 */
export function valeurSurPied(
  espece: EspeceV0,
  tree: { heightM: number; hauteurElagueeM: number },
): { eur: number; qualite: "oeuvre" | "chauffage" } {
  const volume = woodVolumeM3(tree.heightM);
  const assezGros = diametreCm(tree.heightM) >= DIAMETRE_OEUVRE_MIN_CM;
  const assezElague = tree.hauteurElagueeM >= BILLE_OEUVRE_MIN_M;
  if (assezGros && assezElague) {
    // Seule la bille élaguée fait de l'œuvre ; le houppier reste du chauffage.
    const partOeuvre = Math.min(0.6, tree.hauteurElagueeM / tree.heightM);
    return {
      eur:
        volume * partOeuvre * espece.bois.prixOeuvreEurM3 +
        volume * (1 - partOeuvre) * WOOD_PRICE_EUR_M3,
      qualite: "oeuvre",
    };
  }
  return { eur: volume * WOOD_PRICE_EUR_M3, qualite: "chauffage" };
}

/** Temps d'abattage + façonnage d'un arbre, h *(à calibrer)*. */
export function fellingHours(heightM: number): number {
  return 0.3 + 0.15 * heightM;
}

function refuse(week: number, action: GameAction["type"], reason: string): ActionRefusal {
  return { week, action, reason };
}

function applyPlanter(
  state: GameState,
  action: Extract<GameAction, { type: "planter" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  const espece = getEspece(action.especeId);
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  let nextTreeId = state.nextTreeId;
  let planted = 0;
  let importedKgC = 0;

  for (const pos of action.positions) {
    if (hoursUsedWeek + PLANT_HOURS > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(
        refuse(action.week, "planter", `plafond hebdomadaire atteint (${planted} plantés)`),
      );
      break;
    }
    if (treasuryEur - espece.economie.prixPlantEur < OVERDRAFT_LIMIT_EUR) {
      refusals.push(refuse(action.week, "planter", `découvert plafonné (${planted} plantés)`));
      break;
    }
    if (pos.x < 0 || pos.x >= state.station.coteM || pos.y < 0 || pos.y >= state.station.coteM) {
      refusals.push(refuse(action.week, "planter", "position hors parcelle"));
      continue;
    }
    const tooClose = trees.some((t) => {
      if (!t.alive) return false;
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      return dx * dx + dy * dy < PLANT_MIN_SPACING_M * PLANT_MIN_SPACING_M;
    });
    if (tooClose) {
      refusals.push(refuse(action.week, "planter", "trop proche d'un arbre vivant (< 1 m)"));
      continue;
    }
    trees.push({
      id: nextTreeId++,
      especeId: action.especeId,
      x: pos.x,
      y: pos.y,
      ageWeeks: 0,
      heightM: 0.3,
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 20,
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      protege: false,
      recepages: 0,
    });
    planted++;
    treasuryEur -= espece.economie.prixPlantEur;
    hoursUsedWeek += PLANT_HOURS;
    hoursUsedYear += PLANT_HOURS;
    importedKgC += treeTotalCarbonKg(espece, 0.3); // le plant arrive avec sa biomasse
  }

  return {
    state: {
      ...state,
      trees,
      nextTreeId,
      carbon: {
        ...state.carbon,
        importedPlantsCumKgC: state.carbon.importedPlantsCumKgC + importedKgC,
      },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

function applyCouper(
  state: GameState,
  action: Extract<GameAction, { type: "couper" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const litterK = state.soil.litterK.slice();
  let { deadWoodKgC, exportedEnergyCumKgC, oeuvreCumKgC } = state.carbon;
  const dims = { widthM: state.station.coteM, heightM: state.station.coteM };

  for (const id of action.treeIds) {
    // Un arbre tué par le feu mais encore debout se récolte aussi.
    const idx = trees.findIndex((t) => t.id === id && (t.alive || t.brulEeSemaine !== undefined));
    if (idx < 0) {
      refusals.push(refuse(action.week, "couper", `arbre ${id} introuvable`));
      continue;
    }
    const tree = trees[idx];
    if (!tree) continue;
    const espece = getEspece(tree.especeId);
    // Broyer/épandre demande ~30 % de travail en plus que vendre bord de route.
    const hours = fellingHours(tree.heightM) * (action.devenir === "epandre" ? 1.3 : 1);
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "couper", `plafond hebdomadaire atteint (arbre ${id})`));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;

    // Les souches et racines restent au sol dans les deux cas (bois mort).
    deadWoodKgC +=
      treeTotalCarbonKg(espece, tree.heightM) - treeAboveCarbonKg(espece, tree.heightM);
    if (action.devenir === "vendre") {
      const vente = valeurSurPied(espece, tree);
      const brule = tree.brulEeSemaine !== undefined;
      treasuryEur += vente.eur * (brule ? DECOTE_CHABLIS : 1);
      if (vente.qualite === "oeuvre" && !brule) {
        // Bois d'œuvre : le carbone reste piégé dans le produit (charpente,
        // meuble) pour des décennies — ce n'est pas une émission (§12).
        oeuvreCumKgC += treeAboveCarbonKg(espece, tree.heightM);
      } else {
        // Bois de chauffage : brûlé chez le client → émis immédiatement.
        exportedEnergyCumKgC += treeAboveCarbonKg(espece, tree.heightM);
      }
    } else {
      // Épandre : l'azote du feuillage de l'année + le houppier broyé (BRF)
      // retournent en litière sous l'ancienne couronne (docs/regles.md §4.2).
      // Pour un fixateur, c'est de l'azote NOUVEAU — la mécanique fondatrice
      // « couper les légumineuses et les épandre » (§16).
      const depositG = 0.5 * tree.uptakeYearG + treeNitrogenNeedGWeek(espece, tree.heightM) * 52;
      // On ÉPAND le broyat sur la zone (pas en tas au pied) : rayon large,
      // pour que les racines des voisins y accèdent.
      const crownR = Math.max(2.5, 2 * crownRadiusM(tree.heightM, espece.lumiere.houppierRatio));
      const cells: number[] = [];
      const x0 = Math.max(0, Math.floor(tree.x - crownR));
      const x1 = Math.min(dims.widthM - 1, Math.floor(tree.x + crownR));
      const y0 = Math.max(0, Math.floor(tree.y - crownR));
      const y1 = Math.min(dims.heightM - 1, Math.floor(tree.y + crownR));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - tree.x;
          const dy = y + 0.5 - tree.y;
          if (dx * dx + dy * dy <= crownR * crownR) cells.push(y * dims.widthM + x);
        }
      }
      if (cells.length === 0) cells.push(0);
      const share = depositG / cells.length;
      // Tout le carbone aérien broyé reste sur place, dans la litière.
      const shareC = (treeAboveCarbonKg(espece, tree.heightM) * 1000) / cells.length;
      const kSpecies = 0.6 / BRF_CN_RATIO;
      for (const i of cells) {
        const oldN = litterNG[i] ?? 0;
        litterK[i] = (oldN * (litterK[i] ?? 0) + share * kSpecies) / (oldN + share);
        litterNG[i] = oldN + share;
        litterCG[i] = (litterCG[i] ?? 0) + shareC;
      }
    }
    trees.splice(idx, 1); // l'arbre coupé quitte la carte (bois mort/carbone en V1)
  }

  return {
    state: {
      ...state,
      trees,
      soil: { ...state.soil, litterNG, litterCG, litterK },
      carbon: { ...state.carbon, deadWoodKgC, exportedEnergyCumKgC, oeuvreCumKgC },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

function applyRecolter(
  state: GameState,
  action: Extract<GameAction, { type: "recolter" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];

  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "recolter", `arbre ${id} introuvable ou mort`));
      continue;
    }
    if (tree.fruitsKg <= 0) {
      refusals.push(refuse(action.week, "recolter", `arbre ${id} : rien à récolter`));
      continue;
    }
    const espece = getEspece(tree.especeId);
    const prix = espece.fruits?.prixEurKg ?? 0;
    // Cadence de cueillette propre à l'espèce (ramasser 19 kg de noisettes
    // n'a rien à voir avec cueillir 19 kg de pommes).
    const hours = tree.fruitsKg * (espece.fruits?.recolteHKg ?? 0.03);
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "recolter", `plafond hebdomadaire atteint (arbre ${id})`));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    treasuryEur += tree.fruitsKg * prix;
    trees[idx] = { ...tree, fruitsKg: 0 };
  }
  return {
    state: {
      ...state,
      trees,
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

function applyChauler(
  state: GameState,
  action: Extract<GameAction, { type: "chauler" }>,
): ApplyResult {
  const areaM2 = Math.PI * action.rayonM * action.rayonM;
  const cost = areaM2 * LIME_EUR_M2;
  const hours = areaM2 * LIME_HOURS_M2;
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "chauler", "plafond hebdomadaire atteint")] };
  }
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "chauler", "découvert plafonné")] };
  }
  const ph = state.soil.ph.slice();
  const cote = state.station.coteM;
  const r2 = action.rayonM * action.rayonM;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - action.x;
      const dy = y + 0.5 - action.y;
      if (dx * dx + dy * dy <= r2) {
        ph[y * cote + x] = Math.min(7.5, (ph[y * cote + x] ?? 7) + LIME_PH_STEP);
      }
    }
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, ph },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - cost,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
  };
}

function applyFaucher(
  state: GameState,
  action: Extract<GameAction, { type: "faucher" }>,
): ApplyResult {
  const areaM2 = Math.PI * action.rayonM * action.rayonM;
  const hours = areaM2 * FAUCHE_HOURS_M2;
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "faucher", "plafond hebdomadaire atteint")] };
  }
  const herbeCouverture = state.soil.herbeCouverture.slice();
  const herbeBiomasse = state.soil.herbeBiomasse.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const cote = state.station.coteM;
  const r2 = action.rayonM * action.rayonM;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - action.x;
      const dy = y + 0.5 - action.y;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * cote + x;
      const avant = herbeCouverture[i] ?? 0;
      if (avant <= FAUCHE_COUVERTURE_RESIDUELLE) continue;
      const coupe = avant - FAUCHE_COUVERTURE_RESIDUELLE;
      herbeCouverture[i] = FAUCHE_COUVERTURE_RESIDUELLE;
      herbeBiomasse[i] = FAUCHE_COUVERTURE_RESIDUELLE;
      // L'herbe coupée reste sur place : litière tendre, vite recyclée.
      litterNG[i] = (litterNG[i] ?? 0) + coupe * 4;
      litterCG[i] = (litterCG[i] ?? 0) + coupe * 4 * 25;
    }
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, herbeCouverture, herbeBiomasse, litterNG, litterCG },
      economy: {
        ...state.economy,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
  };
}

function applyElaguer(
  state: GameState,
  action: Extract<GameAction, { type: "elaguer" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "elaguer", `arbre ${id} introuvable`));
      continue;
    }
    // On n'élague que jusqu'à la moitié de la hauteur : au-delà, on ampute
    // la couronne et on prive l'arbre de sa croissance.
    const cible = Math.min(action.hauteurM, ELAGAGE_MAX_M, tree.heightM / 2);
    if (cible <= tree.hauteurElagueeM + 0.1) {
      refusals.push(
        refuse(action.week, "elaguer", `arbre ${id} : trop petit pour monter la bille plus haut`),
      );
      continue;
    }
    const hours = (cible - tree.hauteurElagueeM) * ELAGAGE_HOURS_PAR_M;
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "elaguer", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    trees[idx] = { ...tree, hauteurElagueeM: cible };
  }
  return {
    state: { ...state, trees, economy: { ...state.economy, hoursUsedWeek, hoursUsedYear } },
    refusals,
  };
}

function applyProteger(
  state: GameState,
  action: Extract<GameAction, { type: "proteger" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "proteger", `arbre ${id} introuvable`));
      continue;
    }
    if (tree.protege) {
      refusals.push(refuse(action.week, "proteger", `arbre ${id} : déjà protégé`));
      continue;
    }
    if (tree.heightM > HAUTEUR_BROUTAGE_M) {
      // Il est sorti tout seul : dépenser pour lui serait de l'argent perdu.
      refusals.push(
        refuse(action.week, "proteger", `arbre ${id} : hors d'atteinte, protection inutile`),
      );
      continue;
    }
    if (hoursUsedWeek + PROTECTION_HEURES > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "proteger", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += PROTECTION_HEURES;
    hoursUsedYear += PROTECTION_HEURES;
    treasuryEur -= PROTECTION_EUR;
    trees[idx] = { ...tree, protege: true };
  }
  return {
    state: {
      ...state,
      trees,
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

function applyReceper(
  state: GameState,
  action: Extract<GameAction, { type: "receper" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  let { exportedEnergyCumKgC } = state.carbon;
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "receper", `arbre ${id} introuvable`));
      continue;
    }
    const espece = getEspece(tree.especeId);
    if (!espece.bois.rejetteDeSouche) {
      refusals.push(
        refuse(action.week, "receper", `${espece.nom} ne rejette pas de souche : il en mourrait`),
      );
      continue;
    }
    if (hoursUsedWeek + RECEPAGE_HOURS > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "receper", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += RECEPAGE_HOURS;
    hoursUsedYear += RECEPAGE_HOURS;
    // On récolte la tige et la souche repart : c'est tout l'intérêt du taillis.
    treasuryEur += woodVolumeM3(tree.heightM) * WOOD_PRICE_EUR_M3;
    exportedEnergyCumKgC += treeAboveCarbonKg(espece, tree.heightM);
    trees[idx] = {
      ...tree,
      heightM: 0.5,
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      protege: false,
      stress: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      uptakeYearG: 0,
      recepages: tree.recepages + 1,
    };
  }
  return {
    state: {
      ...state,
      trees,
      carbon: { ...state.carbon, exportedEnergyCumKgC },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

/**
 * Désigne les arbres à retirer pour ramener une zone à sa densité cible.
 * C'est le cœur de l'éclaircie : le joueur dit ce qu'il veut obtenir, le
 * moteur choisit les tiges selon le critère demandé.
 */
export function choisirTigesAEclaircir(
  state: GameState,
  action: Extract<GameAction, { type: "eclaircir" }>,
): number[] {
  const r2 = action.rayonM * action.rayonM;
  const dansZone = state.trees.filter((t) => {
    if (!t.alive) return false;
    const dx = t.x - action.x;
    const dy = t.y - action.y;
    return dx * dx + dy * dy <= r2;
  });
  if (action.critere === "espece") {
    return dansZone.filter((t) => t.especeId === action.especeId).map((t) => t.id);
  }
  const surfaceHa = (Math.PI * r2) / 10_000;
  const aGarder = Math.max(0, Math.round(action.densiteCibleParHa * surfaceHa));
  if (dansZone.length <= aGarder) return [];
  // Par le bas : on sacrifie les dominés. Par le haut : on prélève les gros.
  const ordre = [...dansZone].sort((a, b) =>
    action.critere === "parLeBas" ? a.heightM - b.heightM : b.heightM - a.heightM,
  );
  return ordre.slice(0, dansZone.length - aGarder).map((t) => t.id);
}

/** L'arbre est-il en état de donner son écorce (âge, délai depuis la dernière levée) ? */
export function ecorceRecoltable(
  tree: { especeId: string; ageWeeks: number; heightM: number; derniereLeveeSemaine?: number },
  semaine: number,
): boolean {
  const espece = getEspece(tree.especeId);
  const ecorce = espece.ecorce;
  if (!ecorce) return false;
  if (tree.ageWeeks < ecorce.premierAge * 52) return false;
  if (tree.derniereLeveeSemaine === undefined) return true;
  return semaine - tree.derniereLeveeSemaine >= ecorce.rotationAns * 52;
}

function applyLeverEcorce(
  state: GameState,
  action: Extract<GameAction, { type: "leverEcorce" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "leverEcorce", `arbre ${id} introuvable`));
      continue;
    }
    const ecorce = getEspece(tree.especeId).ecorce;
    if (!ecorce) {
      refusals.push(
        refuse(
          action.week,
          "leverEcorce",
          `${getEspece(tree.especeId).nom} n'a pas d'écorce à lever`,
        ),
      );
      continue;
    }
    if (!ecorceRecoltable(tree, action.week)) {
      refusals.push(
        refuse(
          action.week,
          "leverEcorce",
          `arbre ${id} : trop jeune ou levé il y a moins de ${ecorce.rotationAns} ans`,
        ),
      );
      continue;
    }
    // Le rendement suit la taille : un gros arbre porte plus de planches.
    const kg = ecorce.rendementKg * Math.min(1.5, tree.heightM / 12);
    const hours = kg * ecorce.recolteHKg;
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "leverEcorce", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    treasuryEur += kg * ecorce.prixEurKg;
    trees[idx] = { ...tree, derniereLeveeSemaine: action.week };
  }
  return {
    state: {
      ...state,
      trees,
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

export function applyAction(state: GameState, action: GameAction): ApplyResult {
  if (state.economy.bankrupt) {
    return { state, refusals: [refuse(action.week, action.type, "faillite")] };
  }
  switch (action.type) {
    case "planter":
      return applyPlanter(state, action);
    case "couper":
      return applyCouper(state, action);
    case "recolter":
      return applyRecolter(state, action);
    case "embaucher": {
      const contrat = action.contrat ?? "cdi";
      if (contrat === "saisonnier") {
        const semaines = Math.max(1, Math.round(action.semaines ?? 4));
        const cost = semaines * SEASONAL_EUR_WEEK;
        if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
          return { state, refusals: [refuse(action.week, "embaucher", "découvert plafonné")] };
        }
        return {
          state: {
            ...state,
            economy: {
              ...state.economy,
              uth: state.economy.uth + 1,
              treasuryEur: state.economy.treasuryEur - cost,
              saisonniersFinSemaine: [
                ...state.economy.saisonniersFinSemaine,
                action.week + semaines,
              ],
            },
          },
          refusals: [],
        };
      }
      // CDI : la première semaine se paie à l'embauche, le reste chaque semaine.
      if (state.economy.treasuryEur - SALARY_EUR_WEEK < OVERDRAFT_LIMIT_EUR) {
        return { state, refusals: [refuse(action.week, "embaucher", "découvert plafonné")] };
      }
      return {
        state: {
          ...state,
          economy: {
            ...state.economy,
            uth: state.economy.uth + 1,
            ouvriersCdi: state.economy.ouvriersCdi + 1,
            treasuryEur: state.economy.treasuryEur - SALARY_EUR_WEEK,
          },
        },
        refusals: [],
      };
    }
    case "licencier": {
      if (state.economy.ouvriersCdi === 0) {
        return {
          state,
          refusals: [
            refuse(
              action.week,
              "licencier",
              "aucun ouvrier en CDI (les saisonniers expirent seuls)",
            ),
          ],
        };
      }
      // Indemnités dues même en difficulté : licencier n'est jamais refusé.
      return {
        state: {
          ...state,
          economy: {
            ...state.economy,
            uth: Math.max(1, state.economy.uth - 1),
            ouvriersCdi: state.economy.ouvriersCdi - 1,
            treasuryEur: state.economy.treasuryEur - SEVERANCE_EUR,
          },
        },
        refusals: [],
      };
    }
    case "chauler":
      return applyChauler(state, action);
    case "faucher":
      return applyFaucher(state, action);
    case "eclaircir": {
      const treeIds = choisirTigesAEclaircir(state, action);
      if (treeIds.length === 0) {
        return {
          state,
          refusals: [refuse(action.week, "eclaircir", "rien à prélever : la zone est déjà claire")],
        };
      }
      return applyCouper(state, {
        type: "couper",
        week: action.week,
        treeIds,
        devenir: action.devenir,
      });
    }
    case "leverEcorce":
      return applyLeverEcorce(state, action);
    case "elaguer":
      return applyElaguer(state, action);
    case "proteger":
      return applyProteger(state, action);
    case "receper":
      return applyReceper(state, action);
  }
}
