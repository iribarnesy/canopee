import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plant } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";

function runHashes(seed: number, years: number): number[] {
  const weather = syntheticYear(LANDE_SECHE.climat);
  let state = createGameState(LANDE_SECHE.station, rngStateFromSeed(seed));
  state = plant(state, "pinus_sylvestris", 5);
  state = plant(state, "betula_pendula", 5);
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
  it("même seed + même météo + mêmes actions → hash identique à chaque tick (10 ans)", () => {
    expect(runHashes(42, 10)).toEqual(runHashes(42, 10));
  });

  it("le sol se vide en été et se recharge en hiver (cycle annuel visible)", () => {
    const weather = syntheticYear(LANDE_SECHE.climat);
    let state = createGameState(LANDE_SECHE.station, rngStateFromSeed(1));
    const waterByWeek: number[] = [];
    for (let i = 0; i < 52 * 3; i++) {
      const w = weather[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
      waterByWeek.push(state.soil.waterMm);
    }
    // Année 3 : fin d'été (semaine 36) nettement plus sec que fin d'hiver (semaine 8).
    const lateWinter = waterByWeek[52 * 2 + 8];
    const lateSummer = waterByWeek[52 * 2 + 36];
    if (lateWinter === undefined || lateSummer === undefined) throw new Error("index invalide");
    expect(lateSummer).toBeLessThan(lateWinter * 0.6);
    // Et la réserve se recharge : retour proche du plein en fin d'année.
    const yearEnd = waterByWeek[52 * 3 - 1];
    if (yearEnd === undefined) throw new Error("index invalide");
    expect(yearEnd).toBeGreaterThan(LANDE_SECHE.station.ruMm * 0.8);
  });
});
