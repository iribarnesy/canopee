/**
 * Le cœur du moteur : une fonction pure `état + météo → état`, spatialisée.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → bilan hydrique par cellule → lumière par arbre → minéralisation par
 * cellule → prélèvements eau/azote par arbre dans SA zone racinaire (deux
 * passes, indépendantes de l'ordre des arbres) → lessivage par cellule →
 * croissance des arbres → [biotique → économie : à venir].
 */

import { getEspece } from "./especes";
import { cellCount, forEachDiscCell } from "./grid";
import { computeLight } from "./light";
import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import { cellLeachedG, cellMineralization, nitrogenAvailabilityFactor } from "./nitrogen";
import type { GameState, TickFluxes } from "./state";
import { gridDims, weekOfYear } from "./state";
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
const G_PER_M2_TO_KG_PER_HA = 10;

export interface TickResult {
  state: GameState;
  fluxes: TickFluxes;
}

export function tick(state: GameState, weather: WeekWeather): TickResult {
  const { station, trees } = state;
  const dims = gridDims(station);
  const nCells = cellCount(dims);
  const etpMm = weeklyEtpHargreaves(station.latitudeDeg, weekOfYear(state), weather);
  const potentialG = station.mineralizationPotentialKgHaWeek / G_PER_M2_TO_KG_PER_HA;

  // ── 1. Bilan hydrique + minéralisation, cellule par cellule ────────────────
  const waterMm = state.soil.waterMm.slice();
  const excessMm = state.soil.excessMm.slice();
  const mineralNG = state.soil.mineralNG.slice();
  const waterlogging = new Array<number>(nCells);
  const availFactor = new Array<number>(nCells);
  const cellOut: CellWaterOutput = {
    soilWaterMm: 0,
    excessMm: 0,
    evapMm: 0,
    drainageMm: 0,
    overflowMm: 0,
    waterloggingRatio: 0,
  };
  const drainageMmArr = new Array<number>(nCells);
  let evapSum = 0;
  let drainageSum = 0;
  let overflowSum = 0;
  let waterloggingSum = 0;
  let mineralizationSumG = 0;

  for (let i = 0; i < nCells; i++) {
    cellWaterBalanceInto(
      {
        soilWaterMm: waterMm[i] ?? 0,
        excessMm: excessMm[i] ?? 0,
        ruMm: station.ruMm,
        excessCapacityMm: station.excessCapacityMm,
        drainagePerWeekMm: station.drainagePerWeekMm,
        rainMm: weather.rainMm,
        evapDemandMm: etpMm * SOIL_EVAP_FRACTION,
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

    const mineralized = cellMineralization({
      potentialGWeek: potentialG,
      tMean: weather.tMean,
      moistureRatio: station.ruMm > 0 ? (waterMm[i] ?? 0) / station.ruMm : 0,
      waterloggingRatio: cellOut.waterloggingRatio,
    });
    mineralNG[i] = (mineralNG[i] ?? 0) + mineralized;
    mineralizationSumG += mineralized;
    availFactor[i] = nitrogenAvailabilityFactor(mineralNG[i] ?? 0);
  }

  // ── 2. Lumière reçue par chaque arbre (ombres portées, décalées au nord) ──
  const leavesOn = weather.tMean > LEAVES_ON_TMEAN_C;
  const light = computeLight(trees, leavesOn);

  // ── 3. Prélèvements eau + azote, en deux passes (ordre-indépendant) ───────
  // Passe A : chaque arbre répartit sa demande sur ses cellules racinaires.
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

  // Passe B : chaque cellule sert ce qu'elle peut (sécheresse et stock locaux).
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

  // Passe C : chaque arbre recompose ce qu'il a obtenu → satisfactions.
  const waterSatisfaction = new Array<number>(nTrees).fill(1);
  const nSatisfaction = new Array<number>(nTrees).fill(1);
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
  }

  // ── 4. Lessivage de l'azote restant, cellule par cellule ──────────────────
  let leachedSumG = 0;
  for (let i = 0; i < nCells; i++) {
    const leached = cellLeachedG(mineralNG[i] ?? 0, drainageMmArr[i] ?? 0, waterMm[i] ?? 0);
    mineralNG[i] = (mineralNG[i] ?? 0) - leached;
    leachedSumG += leached;
  }

  // ── 5. Croissance de chaque arbre — loi du minimum, facteurs locaux ───────
  const nextTrees = trees.map(
    (tree, t) =>
      tickTree(tree, {
        waterSatisfaction: waterSatisfaction[t] ?? 1,
        waterloggingRatio: wlMean[t] ?? 0,
        light: light[t] ?? 1,
        nitrogenSatisfaction: nSatisfaction[t] ?? 1,
        tMean: weather.tMean,
      }).tree,
  );

  return {
    state: {
      ...state,
      week: state.week + 1,
      soil: { waterMm, excessMm, mineralNG },
      trees: nextTrees,
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
  for (const arr of [state.soil.waterMm, state.soil.excessMm, state.soil.mineralNG]) {
    for (const v of arr) mixNumber(v);
  }
  mixString(JSON.stringify(state.trees));
  mixString(JSON.stringify(state.rng));
  return hash >>> 0;
}
