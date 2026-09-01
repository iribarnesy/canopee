/**
 * Le cœur du moteur : une fonction pure `état + météo → état`.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → bilan hydrique → [cycle N → lumière → croissance → biotique → économie : à venir].
 */

import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import type { GameState, TickFluxes } from "./state";
import { weekOfYear } from "./state";
import { weeklyWaterBalance } from "./water";

export interface TickResult {
  state: GameState;
  fluxes: TickFluxes;
}

export function tick(state: GameState, weather: WeekWeather): TickResult {
  const etpMm = weeklyEtpHargreaves(state.station.latitudeDeg, weekOfYear(state), weather);

  const water = weeklyWaterBalance({
    soilWaterMm: state.soil.waterMm,
    ruMm: state.station.ruMm,
    rainMm: weather.rainMm,
    etpMm,
  });

  return {
    state: {
      ...state,
      week: state.week + 1,
      soil: { waterMm: water.soilWaterMm },
    },
    fluxes: {
      rainMm: weather.rainMm,
      etpMm,
      etrMm: water.etrMm,
      drainageMm: water.drainageMm,
      waterSatisfaction: water.satisfactionRatio,
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
