import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { stateHash, tick } from "../../src/engine/tick";

const STATION: Station = {
  id: "test-gironde",
  nom: "Lande test",
  latitudeDeg: 44.5,
  ruMm: 70,
};

const CLIMATE = {
  tMeanAnnual: 13.5,
  tSeasonalAmplitude: 7,
  tDiurnalRange: 10,
  rainAnnualMm: 900,
  rainWinterShare: 0.65,
};

function runYears(seed: number, years: number): number[] {
  const weather = syntheticYear(CLIMATE);
  let state = createGameState(STATION, rngStateFromSeed(seed));
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
    expect(runYears(42, 10)).toEqual(runYears(42, 10));
  });

  it("le sol se vide en été et se recharge en hiver (cycle annuel visible)", () => {
    const weather = syntheticYear(CLIMATE);
    let state = createGameState(STATION, rngStateFromSeed(1));
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
    expect(yearEnd).toBeGreaterThan(STATION.ruMm * 0.8);
  });
});
