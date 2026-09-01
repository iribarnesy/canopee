/**
 * Le cœur du moteur : une fonction pure `état + météo → état`, spatialisée.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → bilan hydrique par cellule → minéralisation humus + décomposition
 * de la litière par cellule → lumière par arbre → prélèvements eau/azote par
 * arbre dans SA zone racinaire (deux passes, indépendantes de l'ordre des
 * arbres) → lessivage → croissance des arbres → chute des feuilles (semaine 44)
 * → morts en litière → régénération annuelle (semaine 14).
 */

import {
  DEADWOOD_DECAY_PER_YEAR,
  DEADWOOD_HUMIFICATION,
  HUMUS_DECAY_PER_YEAR,
  LITTER_HUMIFICATION,
  treeAboveCarbonKg,
  treeTotalCarbonKg,
} from "./carbon";
import { getEspece } from "./especes";
import { cellCount, forEachDiscCell } from "./grid";
import { computeGroundLight, computeLight, crownRadiusM } from "./light";
import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import {
  cellLeachedG,
  cellMineralization,
  decompositionClimateFactor,
  litterDecayRate,
  nitrogenAvailabilityFactor,
} from "./nitrogen";
import { yearlyRecruitment } from "./regeneration";
import type { GameState, TickFluxes } from "./state";
import { gridDims, weekOfYear } from "./state";
import type { TreeState } from "./trees";
import {
  rootRadiusM,
  seasonFactor,
  tickTree,
  treeExtractionCapacityGWeek,
  treeNitrogenNeedGWeek,
  treeWaterDemandL,
} from "./trees";
import type { CellWaterOutput } from "./water";
import { cellWaterBalanceInto, drynessFactor } from "./water";

/** °C moyenne hebdo au-dessus de laquelle les caducs sont en feuilles (proxy V0). */
const LEAVES_ON_TMEAN_C = 6;
/**
 * Part de l'ETP consommée par le sol et sa strate herbacée implicite
 * (évaporation + transpiration des herbes, non modélisées avant la V1).
 * Uniforme en V0.5 — le microclimat sous couvert viendra la moduler.
 */
const SOIL_EVAP_FRACTION = 0.65;
/**
 * Microclimat forestier (docs/regles.md §3, volet humidité) : sous couvert
 * fermé, l'évaporation du sol tombe à cette fraction de sa valeur plein soleil
 * (ombre + air calme + humidité) *(à calibrer)*. Le volet température (−x °C
 * en canicule) viendra avec les vraies séries météo.
 */
const CANOPY_EVAP_FLOOR = 0.35;
const G_PER_M2_TO_KG_PER_HA = 10;
/** semaine du recrutement annuel des semis (printemps) */
const RECRUITMENT_WEEK = 14;
/** semaine de la chute des feuilles (automne) */
const LITTERFALL_WEEK = 44;
/**
 * Part de l'azote acquis dans l'année qui retourne au sol avec les feuilles ;
 * le reste est retenu dans le bois *(à calibrer — rétranslocation ch3-B)*.
 */
const LITTER_RETURN_FRACTION = 0.5;

export interface TickResult {
  state: GameState;
  fluxes: TickFluxes;
}

export function tick(state: GameState, weather: WeekWeather): TickResult {
  const { station } = state;
  const dims = gridDims(station);
  const nCells = cellCount(dims);
  const week = weekOfYear(state);
  const etpMm = weeklyEtpHargreaves(station.latitudeDeg, week, weather);
  const potentialG = station.mineralizationPotentialKgHaWeek / G_PER_M2_TO_KG_PER_HA;
  const trees = state.trees;

  // ── 0. Ombrage au sol (microclimat : le couvert freine l'évaporation) ─────
  const leavesOn = weather.tMean > LEAVES_ON_TMEAN_C;
  const groundLight = computeGroundLight(trees, dims.widthM, dims.heightM, leavesOn);

  // ── 1. Bilan hydrique + minéralisation + décomposition de la litière ──────
  const waterMm = state.soil.waterMm.slice();
  const excessMm = state.soil.excessMm.slice();
  const mineralNG = state.soil.mineralNG.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const humusCG = state.soil.humusCG.slice();
  const litterK = state.soil.litterK.slice();
  const waterlogging = new Array<number>(nCells);
  const availFactor = new Array<number>(nCells);
  const drainageMmArr = new Array<number>(nCells);
  const cellOut: CellWaterOutput = {
    soilWaterMm: 0,
    excessMm: 0,
    evapMm: 0,
    drainageMm: 0,
    overflowMm: 0,
    waterloggingRatio: 0,
  };
  let evapSum = 0;
  let drainageSum = 0;
  let overflowSum = 0;
  let waterloggingSum = 0;
  let mineralizationSumG = 0;
  let litterDecaySumG = 0;
  let climateSum = 0;
  let emittedG = 0; // CO2 des décompositions (litière + humus), g C

  for (let i = 0; i < nCells; i++) {
    cellWaterBalanceInto(
      {
        soilWaterMm: waterMm[i] ?? 0,
        excessMm: excessMm[i] ?? 0,
        ruMm: station.ruMm,
        excessCapacityMm: station.excessCapacityMm,
        drainagePerWeekMm: station.drainagePerWeekMm,
        rainMm: weather.rainMm,
        evapDemandMm:
          etpMm *
          SOIL_EVAP_FRACTION *
          (CANOPY_EVAP_FLOOR + (1 - CANOPY_EVAP_FLOOR) * (groundLight[i] ?? 1)),
      },
      cellOut,
    );
    waterMm[i] = cellOut.soilWaterMm;
    excessMm[i] = cellOut.excessMm;
    waterlogging[i] = cellOut.waterloggingRatio;
    drainageMmArr[i] = cellOut.drainageMm;
    evapSum += cellOut.evapMm;
    drainageSum += cellOut.drainageMm;
    overflowSum += cellOut.overflowMm;
    waterloggingSum += cellOut.waterloggingRatio;

    const moistureRatio = station.ruMm > 0 ? (waterMm[i] ?? 0) / station.ruMm : 0;
    const climate = decompositionClimateFactor(
      weather.tMean,
      moistureRatio,
      cellOut.waterloggingRatio,
    );
    climateSum += climate;
    const mineralized = potentialG * climate;
    // La litière se décompose selon son C/N (aulne vite, pin lentement, ch2-B) ;
    // son carbone part pour partie en humus (humification), le reste en CO2.
    const decayFraction = Math.min(1, (litterK[i] ?? 0) * climate);
    const decayedN = (litterNG[i] ?? 0) * decayFraction;
    const decayedC = (litterCG[i] ?? 0) * decayFraction;
    litterNG[i] = (litterNG[i] ?? 0) - decayedN;
    litterCG[i] = (litterCG[i] ?? 0) - decayedC;
    humusCG[i] = (humusCG[i] ?? 0) + LITTER_HUMIFICATION * decayedC;
    emittedG += (1 - LITTER_HUMIFICATION) * decayedC;
    // L'humus, pool lent, respire aussi (V1 : couplage avec la minéralisation N
    // et le labour qui déstocke — docs/regles.md §12).
    const humusLoss = (humusCG[i] ?? 0) * ((HUMUS_DECAY_PER_YEAR / 52) * climate);
    humusCG[i] = (humusCG[i] ?? 0) - humusLoss;
    emittedG += humusLoss;
    mineralNG[i] = (mineralNG[i] ?? 0) + mineralized + decayedN;
    mineralizationSumG += mineralized;
    litterDecaySumG += decayedN;
    availFactor[i] = nitrogenAvailabilityFactor(mineralNG[i] ?? 0);
  }

  // ── 2. Lumière reçue par chaque arbre (ombres portées, décalées au nord) ──
  const light = computeLight(trees, leavesOn);

  // ── 3. Prélèvements eau + azote, en deux passes (ordre-indépendant) ───────
  const nTrees = trees.length;
  const waterDemandL = new Array<number>(nTrees).fill(0);
  const nNeedG = new Array<number>(nTrees).fill(0);
  const rootCells = new Array<number>(nTrees).fill(1);
  const wlMean = new Array<number>(nTrees).fill(0);
  const cellWaterDemand = new Array<number>(nCells).fill(0);
  const cellNWanted = new Array<number>(nCells).fill(0);

  for (let t = 0; t < nTrees; t++) {
    const tree = trees[t];
    if (!tree || !tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const season = seasonFactor(espece, weather.tMean);
    const rootR = rootRadiusM(espece, tree.heightM);
    let n = 0;
    let wlSum = 0;
    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      n++;
      wlSum += waterlogging[i] ?? 0;
    });
    rootCells[t] = n;
    wlMean[t] = wlSum / n;
    waterDemandL[t] = treeWaterDemandL(espece, tree.heightM, etpMm, season);
    nNeedG[t] = espece.azote.fixateur ? 0 : treeNitrogenNeedGWeek(espece, tree.heightM);
    const capG = espece.azote.fixateur ? 0 : treeExtractionCapacityGWeek(tree.heightM);
    const wPerCell = (waterDemandL[t] ?? 0) / n;
    const needPerCell = (nNeedG[t] ?? 0) / n;
    const capPerCell = capG / n;
    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      cellWaterDemand[i] = (cellWaterDemand[i] ?? 0) + wPerCell;
      cellNWanted[i] =
        (cellNWanted[i] ?? 0) + Math.min(needPerCell, capPerCell * (availFactor[i] ?? 0));
    });
  }

  const waterServedRatio = new Array<number>(nCells).fill(0);
  const nServedRatio = new Array<number>(nCells).fill(0);
  let transpirationSumL = 0;
  let uptakeSumG = 0;
  for (let i = 0; i < nCells; i++) {
    const wDemand = cellWaterDemand[i] ?? 0;
    if (wDemand > 0) {
      const water = waterMm[i] ?? 0;
      const extracted = Math.min(water, wDemand * drynessFactor(water, station.ruMm));
      waterServedRatio[i] = extracted / wDemand;
      waterMm[i] = water - extracted;
      transpirationSumL += extracted;
    }
    const nWanted = cellNWanted[i] ?? 0;
    if (nWanted > 0) {
      const stock = mineralNG[i] ?? 0;
      const taken = Math.min(stock, nWanted);
      nServedRatio[i] = taken / nWanted;
      mineralNG[i] = stock - taken;
      uptakeSumG += taken;
    }
  }

  const waterSatisfaction = new Array<number>(nTrees).fill(1);
  const nSatisfaction = new Array<number>(nTrees).fill(1);
  const acquiredNG = new Array<number>(nTrees).fill(0);
  for (let t = 0; t < nTrees; t++) {
    const tree = trees[t];
    if (!tree || !tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const rootR = rootRadiusM(espece, tree.heightM);
    const n = rootCells[t] ?? 1;
    const wPerCell = (waterDemandL[t] ?? 0) / n;
    const needPerCell = (nNeedG[t] ?? 0) / n;
    const capPerCell = (espece.azote.fixateur ? 0 : treeExtractionCapacityGWeek(tree.heightM)) / n;
    let gotW = 0;
    let gotN = 0;
    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      gotW += wPerCell * (waterServedRatio[i] ?? 0);
      gotN += Math.min(needPerCell, capPerCell * (availFactor[i] ?? 0)) * (nServedRatio[i] ?? 0);
    });
    const wd = waterDemandL[t] ?? 0;
    const nd = nNeedG[t] ?? 0;
    waterSatisfaction[t] = wd > 0 ? Math.min(1, gotW / wd) : 1;
    nSatisfaction[t] = nd > 0 ? Math.min(1, gotN / nd) : 1;
    // Les fixateurs couvrent leur besoin par la symbiose : azote NOUVEAU (air),
    // comptabilisé comme fixation quand il retombe en litière.
    acquiredNG[t] = espece.azote.fixateur
      ? 0.95 * treeNitrogenNeedGWeek(espece, tree.heightM) * seasonFactor(espece, weather.tMean)
      : gotN;
  }

  // ── 4. Lessivage de l'azote minéral restant ────────────────────────────────
  let leachedSumG = 0;
  for (let i = 0; i < nCells; i++) {
    const leached = cellLeachedG(mineralNG[i] ?? 0, drainageMmArr[i] ?? 0, waterMm[i] ?? 0);
    mineralNG[i] = (mineralNG[i] ?? 0) - leached;
    leachedSumG += leached;
  }

  // ── 5. Croissance de chaque arbre — loi du minimum, facteurs locaux ───────
  let nppKgC = 0; // production primaire nette de la semaine (bois + racines)
  let nextTrees: TreeState[] = trees.map((tree, t) => {
    const next = tickTree(tree, {
      waterSatisfaction: waterSatisfaction[t] ?? 1,
      waterloggingRatio: wlMean[t] ?? 0,
      light: light[t] ?? 1,
      nitrogenSatisfaction: nSatisfaction[t] ?? 1,
      tMean: weather.tMean,
    }).tree;
    if (tree.alive && next.heightM > tree.heightM) {
      const espece = getEspece(tree.especeId);
      nppKgC += treeTotalCarbonKg(espece, next.heightM) - treeTotalCarbonKg(espece, tree.heightM);
    }
    const acquired = acquiredNG[t] ?? 0;
    return acquired > 0 ? { ...next, uptakeYearG: next.uptakeYearG + acquired } : next;
  });

  // ── 6. Retours de litière : chute des feuilles + arbres morts ─────────────
  let litterfallSumG = 0;
  let fixationSumG = 0;
  let leafNppKgC = 0; // le feuillage tombé a été produit dans l'année (NPP feuilles)
  const depositLitter = (tree: TreeState, amountG: number) => {
    if (amountG <= 0) return;
    const espece = getEspece(tree.especeId);
    const crownR = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio);
    let n = 0;
    forEachDiscCell(dims, tree.x, tree.y, crownR, () => {
      n++;
    });
    const share = amountG / n;
    const shareC = share * espece.litiere.cnRatio;
    const kSpecies = litterDecayRate(espece.litiere.cnRatio);
    forEachDiscCell(dims, tree.x, tree.y, crownR, (i) => {
      const oldN = litterNG[i] ?? 0;
      litterK[i] = (oldN * (litterK[i] ?? 0) + share * kSpecies) / (oldN + share);
      litterNG[i] = oldN + share;
      litterCG[i] = (litterCG[i] ?? 0) + shareC;
    });
    leafNppKgC += (amountG * espece.litiere.cnRatio) / 1000;
    if (espece.azote.fixateur) fixationSumG += amountG;
    else litterfallSumG += amountG;
  };

  if (week === LITTERFALL_WEEK) {
    nextTrees = nextTrees.map((tree) => {
      if (!tree.alive || tree.uptakeYearG <= 0) return tree;
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      return { ...tree, uptakeYearG: 0 };
    });
  }

  // Les morts de la semaine rendent leur azote de l'année, leur carbone part
  // au pool de bois mort, et ils quittent la carte.
  let deadWoodKgC = state.carbon.deadWoodKgC;
  const survivors: TreeState[] = [];
  for (const tree of nextTrees) {
    if (tree.alive) {
      survivors.push(tree);
    } else {
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      deadWoodKgC += treeTotalCarbonKg(getEspece(tree.especeId), tree.heightM);
    }
  }
  nextTrees = survivors;

  // Le bois mort se décompose : une part s'humifie, le reste part en CO2.
  const meanClimate = climateSum / nCells;
  const deadDecayKgC = deadWoodKgC * ((DEADWOOD_DECAY_PER_YEAR / 52) * meanClimate);
  deadWoodKgC -= deadDecayKgC;
  const humifiedPerCellG = (deadDecayKgC * DEADWOOD_HUMIFICATION * 1000) / nCells;
  for (let i = 0; i < nCells; i++) humusCG[i] = (humusCG[i] ?? 0) + humifiedPerCellG;
  emittedG += deadDecayKgC * (1 - DEADWOOD_HUMIFICATION) * 1000;

  // ── 7. Régénération annuelle (semis de la parcelle + du voisinage) ────────
  let rng = state.rng;
  let nextTreeId = state.nextTreeId;
  if (week === RECRUITMENT_WEEK) {
    const recruitment = yearlyRecruitment({
      trees: nextTrees,
      rng,
      coteM: station.coteM,
      voisinage: station.voisinage,
      leavesOn,
      nextTreeId,
    });
    nextTrees = [...nextTrees, ...recruitment.newTrees];
    rng = recruitment.rng;
    nextTreeId = recruitment.nextTreeId;
  }

  return {
    state: {
      ...state,
      week: state.week + 1,
      soil: { waterMm, excessMm, mineralNG, litterNG, litterCG, humusCG, litterK },
      trees: nextTrees,
      carbon: {
        ...state.carbon,
        deadWoodKgC,
        nppCumKgC: state.carbon.nppCumKgC + nppKgC + leafNppKgC,
        emittedCumKgC: state.carbon.emittedCumKgC + emittedG / 1000,
      },
      rng,
      nextTreeId,
    },
    fluxes: {
      rainMm: weather.rainMm,
      etpMm,
      evapMm: evapSum / nCells,
      transpirationMm: transpirationSumL / nCells,
      drainageMm: drainageSum / nCells,
      overflowMm: overflowSum / nCells,
      waterloggingMean: waterloggingSum / nCells,
      mineralizationKgHa: (mineralizationSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      uptakeKgHa: (uptakeSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      leachedKgHa: (leachedSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      litterfallKgHa: (litterfallSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      litterDecayKgHa: (litterDecaySumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      fixationKgHa: (fixationSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
    },
  };
}

/**
 * Hash déterministe de l'état (FNV-1a : grilles de sol en binaire, arbres en
 * JSON). Sert au test de non-régression « même seed + mêmes actions → même partie ».
 */
export function stateHash(state: GameState): number {
  let hash = 0x811c9dc5;
  const mixString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const view = new DataView(new ArrayBuffer(8));
  const mixNumber = (v: number) => {
    view.setFloat64(0, v);
    hash ^= view.getUint32(0);
    hash = Math.imul(hash, 0x01000193);
    hash ^= view.getUint32(4);
    hash = Math.imul(hash, 0x01000193);
  };
  mixNumber(state.week);
  for (const arr of [
    state.soil.waterMm,
    state.soil.excessMm,
    state.soil.mineralNG,
    state.soil.litterNG,
    state.soil.litterCG,
    state.soil.humusCG,
    state.soil.litterK,
  ]) {
    for (const v of arr) mixNumber(v);
  }
  mixString(JSON.stringify(state.trees));
  mixString(JSON.stringify(state.economy));
  mixString(JSON.stringify(state.carbon));
  mixString(JSON.stringify(state.rng));
  return hash >>> 0;
}
