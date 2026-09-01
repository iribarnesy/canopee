/**
 * Le cœur du moteur : une fonction pure `état + météo → état`.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → bilan hydrique → cycle N → croissance des arbres
 * → [lumière → biotique → économie : à venir].
 */

import { getEspece } from "./especes";
import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import { weeklyNitrogenCycle } from "./nitrogen";
import type { GameState, TickFluxes } from "./state";
import { weekOfYear } from "./state";
import { tickTree, treeNitrogenDemandKgWeek } from "./trees";
import { weeklyWaterBalance } from "./water";

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

  // 2. Cycle de l'azote. Les fixateurs ne demandent rien au sol (Frankia/Rhizobium).
  const uptakeDemandKgHa = state.trees.reduce((sum, tree) => {
    if (!tree.alive) return sum;
    const espece = getEspece(tree.especeId);
    if (espece.azote.fixateur) return sum;
    return sum + treeNitrogenDemandKgWeek(espece, tree.heightM);
  }, 0);

  const nitrogen = weeklyNitrogenCycle({
    mineralNKgHa: state.soil.mineralNKgHa,
    mineralizationPotentialKgHaWeek: station.mineralizationPotentialKgHaWeek,
    tMean: weather.tMean,
    moistureRatio: station.ruMm > 0 ? water.soilWaterMm / station.ruMm : 0,
    waterloggingRatio: water.waterloggingRatio,
    uptakeDemandKgHa,
    drainageMm: water.drainageMm,
    soilWaterMm: water.soilWaterMm,
  });

  // 3. Croissance de chaque arbre — loi du minimum.
  const env = {
    waterSatisfaction: water.satisfactionRatio,
    waterloggingRatio: water.waterloggingRatio,
    nitrogenSatisfaction: nitrogen.demandSatisfaction,
    tMean: weather.tMean,
  };
  const trees = state.trees.map((tree) => tickTree(tree, env).tree);

  return {
    state: {
      ...state,
      week: state.week + 1,
      soil: {
        waterMm: water.soilWaterMm,
        excessMm: water.excessMm,
        mineralNKgHa: nitrogen.mineralNKgHa,
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
      mineralizationKgHa: nitrogen.mineralizationKgHa,
      uptakeKgHa: nitrogen.uptakeKgHa,
      leachedKgHa: nitrogen.leachedKgHa,
      nitrogenSatisfaction: nitrogen.demandSatisfaction,
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
