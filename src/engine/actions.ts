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
import { getEspece } from "./especes";
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
/** prix de vente du bois énergie, €/m³ *(à calibrer ; bois d'œuvre en V1)* */
export const WOOD_PRICE_EUR_M3 = 35;

export interface EconomyState {
  treasuryEur: number;
  /** heures consommées cette semaine (remis à zéro chaque tick par le runner) */
  hoursUsedWeek: number;
  /** heures consommées depuis le début de l'année (affichage UTH) */
  hoursUsedYear: number;
  /** nombre d'UTH disponibles (1 = le joueur seul ; embauche en V1) */
  uth: number;
  bankrupt: boolean;
}

export function createEconomy(treasuryEur: number): EconomyState {
  return { treasuryEur, hoursUsedWeek: 0, hoursUsedYear: 0, uth: 1, bankrupt: false };
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

/** Temps d'abattage + façonnage d'un arbre, h *(à calibrer)*. */
export function fellingHours(heightM: number): number {
  return 0.3 + 0.15 * heightM;
}

function hoursAvailable(state: GameState): number {
  return WEEK_HOURS_CAP * state.economy.uth - state.economy.hoursUsedWeek;
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
  let { deadWoodKgC, exportedEnergyCumKgC } = state.carbon;
  const dims = { widthM: state.station.coteM, heightM: state.station.coteM };

  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    if (idx < 0) {
      refusals.push(refuse(action.week, "couper", `arbre ${id} introuvable ou mort`));
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
      treasuryEur += woodVolumeM3(tree.heightM) * WOOD_PRICE_EUR_M3;
      // Bois énergie : brûlé chez le client → carbone émis immédiatement (§12).
      exportedEnergyCumKgC += treeAboveCarbonKg(espece, tree.heightM);
    } else {
      // Épandre : l'azote du feuillage de l'année + le houppier broyé (BRF)
      // retournent en litière sous l'ancienne couronne (docs/regles.md §4.2).
      // Pour un fixateur, c'est de l'azote NOUVEAU — la mécanique fondatrice
      // « couper les légumineuses et les épandre » (§16).
      const depositG = 0.5 * tree.uptakeYearG + treeNitrogenNeedGWeek(espece, tree.heightM) * 52;
      const crownR = Math.max(1, crownRadiusM(tree.heightM, espece.lumiere.houppierRatio));
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
      const kSpecies = 0.6 / Math.max(1, espece.litiere.cnRatio);
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
      carbon: { ...state.carbon, deadWoodKgC, exportedEnergyCumKgC },
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
  }
}
