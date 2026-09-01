import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";

function runHashes(seed: number, years: number): number[] {
  const weather = syntheticYear(LANDE_SECHE.climat);
  let state = createGameState(LANDE_SECHE.station, rngStateFromSeed(seed));
  state = plantScattered(state, "pinus_sylvestris", 5);
  state = plantScattered(state, "betula_pendula", 5);
  const hashes: number[] = [];
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
    hashes.push(stateHash(state));
  }
  return hashes;
}

describe("déterminisme du moteur", () => {
  it("même seed + même météo + mêmes actions → hash identique à chaque tick (5 ans)", () => {
    expect(runHashes(42, 5)).toEqual(runHashes(42, 5));
  });

  it("deux seeds différentes → parties différentes (positions de plantation)", () => {
    const a = runHashes(1, 1);
    const b = runHashes(2, 1);
    expect(a).not.toEqual(b);
  });

  it("le sol se vide en été et se recharge en hiver (cycle annuel visible)", () => {
    const weather = syntheticYear(LANDE_SECHE.climat);
    let state = createGameState(LANDE_SECHE.station, rngStateFromSeed(1));
    const meanWater: number[] = [];
    for (let i = 0; i < 52 * 3; i++) {
      const w = weather[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
      // Horizon de SURFACE : c'est lui qui suit le rythme des saisons
      // (le sol est stratifié, cf. soil.ts).
      const nH = Math.max(1, LANDE_SECHE.station.profil.length);
      const arr = state.soil.waterMm;
      let sum = 0;
      let n = 0;
      for (let c = 0; c < arr.length; c += nH) {
        sum += arr[c] ?? 0;
        n++;
      }
      meanWater.push(sum / n);
    }
    // Année 3 : fin d'été (semaine 36) nettement plus sec que fin d'hiver (semaine 8).
    const lateWinter = meanWater[52 * 2 + 8];
    const lateSummer = meanWater[52 * 2 + 36];
    if (lateWinter === undefined || lateSummer === undefined) throw new Error("index invalide");
    expect(lateSummer).toBeLessThan(lateWinter * 0.75);
    // Et la réserve se recharge : retour proche du plein en fin d'année.
    const yearEnd = meanWater[52 * 3 - 1];
    if (yearEnd === undefined) throw new Error("index invalide");
    // Fin d'année : l'horizon de surface est rechargé (RU de surface, pas du profil).
    const ruSurface = LANDE_SECHE.station.ruMm * 0.4;
    expect(yearEnd).toBeGreaterThan(ruSurface * 0.8);
  });
});
