/**
 * Le cœur du moteur : une fonction pure `état + météo → état`.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → bilan hydrique → lumière → cycle N (minéralisation, prélèvements
 * par individu, lessivage) → croissance des arbres → [biotique → économie : à venir].
 */

import { getEspece } from "./especes";
import { computeLight } from "./light";
import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import { allocateUptake, weeklyLeaching, weeklyMineralization } from "./nitrogen";
import type { GameState, TickFluxes } from "./state";
import { weekOfYear } from "./state";
import { tickTree, treeExtractionCapacityKgWeek, treeNitrogenNeedKgWeek } from "./trees";
import { weeklyWaterBalance } from "./water";

/** °C moyenne hebdo au-dessus de laquelle les caducs sont en feuilles (proxy V0). */
const LEAVES_ON_TMEAN_C = 6;

export interface TickResult {
  state: GameState;
  fluxes: TickFluxes;
}

export function tick(state: GameState, weather: WeekWeather): TickResult {
  const { station } = state;
  const etpMm = weeklyEtpHargreaves(station.latitudeDeg, weekOfYear(state), weather);

  // 1. Bilan hydrique.
  const water = weeklyWaterBalance({
    soilWaterMm: state.soil.waterMm,
    excessMm: state.soil.excessMm,
    ruMm: station.ruMm,
    excessCapacityMm: station.excessCapacityMm,
    drainagePerWeekMm: station.drainagePerWeekMm,
    rainMm: weather.rainMm,
    etpMm,
  });

  // 2. Lumière reçue par chaque arbre (compétition verticale).
  const leavesOn = weather.tMean > LEAVES_ON_TMEAN_C;
  const light = computeLight(state.trees, station.parcelAreaM2, leavesOn);

  // 3. Cycle de l'azote : minéralisation, puis prélèvement PAR INDIVIDU
  //    (besoin en kg selon l'exigence de l'espèce, extraction selon la taille),
  //    puis lessivage de ce qui reste.
  const mineralizationKgHa = weeklyMineralization({
    mineralizationPotentialKgHaWeek: station.mineralizationPotentialKgHaWeek,
    tMean: weather.tMean,
    moistureRatio: station.ruMm > 0 ? water.soilWaterMm / station.ruMm : 0,
    waterloggingRatio: water.waterloggingRatio,
  });
  const pool = state.soil.mineralNKgHa + mineralizationKgHa;

  const requests = state.trees.map((tree) => {
    const espece = getEspece(tree.especeId);
    // Les fixateurs couvrent leur besoin par la symbiose : rien demandé au sol en V0.
    if (!tree.alive || espece.azote.fixateur) {
      return { needKg: 0, extractionCapacityKg: 0 };
    }
    return {
      needKg: treeNitrogenNeedKgWeek(espece, tree.heightM),
      extractionCapacityKg: treeExtractionCapacityKgWeek(tree.heightM),
    };
  });
  const uptake = allocateUptake(pool, requests);
  const leaching = weeklyLeaching(pool - uptake.totalUptakeKg, water.drainageMm, water.soilWaterMm);

  // 4. Croissance de chaque arbre — loi du minimum, facteurs individuels.
  const trees = state.trees.map(
    (tree, i) =>
      tickTree(tree, {
        waterSatisfaction: water.satisfactionRatio,
        waterloggingRatio: water.waterloggingRatio,
        light: light[i] ?? 1,
        nitrogenSatisfaction: uptake.satisfactions[i] ?? 1,
        tMean: weather.tMean,
      }).tree,
  );

  return {
    state: {
      ...state,
      week: state.week + 1,
      soil: {
        waterMm: water.soilWaterMm,
        excessMm: water.excessMm,
        mineralNKgHa: leaching.mineralNKgHa,
      },
      trees,
    },
    fluxes: {
      rainMm: weather.rainMm,
      etpMm,
      etrMm: water.etrMm,
      drainageMm: water.drainageMm,
      overflowMm: water.overflowMm,
      waterSatisfaction: water.satisfactionRatio,
      waterloggingRatio: water.waterloggingRatio,
      mineralizationKgHa,
      uptakeKgHa: uptake.totalUptakeKg,
      leachedKgHa: leaching.leachedKgHa,
    },
  };
}

/**
 * Hash déterministe de l'état (FNV-1a sur sa sérialisation JSON).
 * Sert au test de non-régression « même seed + mêmes actions → même partie ».
 */
export function stateHash(state: GameState): number {
  const json = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
