/**
 * Tests écologiques V0.5 — la lumière (docs/regles.md §5, §16) :
 * un héliophile meurt sous canopée fermée, un sciaphile y survit et attend.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plant } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { aliveCount, meanHeight, runYears } from "../helpers";

/** Canopée fermée : 150 hêtres adultes de 25 m, puis semis en sous-étage. */
function underClosedCanopy(understoreyEspece: string, years: number) {
  const weather = syntheticYear(LIMON_RICHE.climat);
  let state = createGameState(LIMON_RICHE.station, rngStateFromSeed(42));
  state = plant(state, "fagus_sylvatica", 150, 25);
  state = plant(state, understoreyEspece, 20, 0.3);
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
  }
  return state;
}

describe("lumière — sous canopée fermée de hêtres", () => {
  it("le semis de pin sylvestre (très héliophile) meurt en quelques années", () => {
    const state = underClosedCanopy("pinus_sylvestris", 5);
    // Les 150 adultes sont vivants, les 20 semis de pin sont morts d'ombre.
    expect(aliveCount(state, "pinus_sylvestris")).toBe(0);
  });

  it("le semis de hêtre (sciaphile) survit et pousse lentement", () => {
    const state = underClosedCanopy("fagus_sylvatica", 5);
    const semis = state.trees.filter((t) => t.heightM < 20);
    expect(semis.every((t) => t.alive)).toBe(true);
    const hMoy = semis.reduce((s, t) => s + t.heightM, 0) / semis.length;
    expect(hMoy).toBeGreaterThan(0.3);
    expect(hMoy).toBeLessThan(1.5); // il végète, il ne file pas
  });
});

describe("lumière — en plein découvert, personne n'est limité", () => {
  it("les héliophiles poussent normalement à ciel ouvert (peuplement clair)", () => {
    const state = runYears(LIMON_RICHE, 10, {
      plantations: [{ especeId: "betula_pendula", count: 10 }],
    });
    expect(aliveCount(state, "betula_pendula")).toBe(10);
    expect(meanHeight(state, "betula_pendula")).toBeGreaterThan(4);
  });
});
