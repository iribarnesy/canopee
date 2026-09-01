/**
 * Tests écologiques — la lumière spatiale (docs/regles.md §5, §16) :
 * un héliophile meurt sous canopée fermée, un sciaphile y survit et attend.
 * L'ombre d'un arbre de 25 m est décalée de ~10 m vers le nord : les semis
 * sont placés au centre des ombres, pas au pied des troncs.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE, type StationClimat } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { aliveCount, meanHeight, runYears } from "../helpers";

/** Limon riche à climat plus arrosé et régulier : la vieille futaie ne manque pas d'eau. */
const LIMON_FRAIS: StationClimat = {
  station: { ...LIMON_RICHE.station, id: "limon-frais", nom: "Limon frais" },
  climat: { ...LIMON_RICHE.climat, rainAnnualMm: 1100, rainWinterShare: 0.5 },
};

const SPACING = 12.5;
const CANOPY_H = 25;
/** décalage nord des ombres pour un arbre de 25 m (0,4 × H, cf. light.ts) */
const SHADOW_OFFSET = 0.4 * CANOPY_H;

/**
 * Futaie fermée : hêtres adultes en grille 8×8 (l'ombre des couronnes couvre
 * le cœur de parcelle), puis semis plantés au centre exact de quelques ombres.
 */
function underClosedCanopy(understoreyEspece: string, years: number) {
  const weather = syntheticYear(LIMON_FRAIS.climat);
  let state = createGameState(LIMON_FRAIS.station, rngStateFromSeed(42));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      state = plantAt(state, "fagus_sylvatica", 6.25 + i * SPACING, 6.25 + j * SPACING, CANOPY_H);
    }
  }
  const semisPositions = [1, 2, 3, 4, 5].map((k) => ({
    x: 6.25 + k * SPACING,
    y: 6.25 + k * SPACING + SHADOW_OFFSET,
  }));
  for (const p of semisPositions) {
    state = plantAt(state, understoreyEspece, p.x, p.y, 0.3);
  }
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
  }
  return state;
}

describe("lumière — sous futaie fermée de hêtres", () => {
  it("le semis de pin sylvestre (très héliophile) meurt en quelques années", () => {
    const state = underClosedCanopy("pinus_sylvestris", 5);
    expect(aliveCount(state, "pinus_sylvestris")).toBe(0);
    // Et la futaie, elle, n'a pas souffert.
    expect(aliveCount(state, "fagus_sylvatica")).toBe(64);
  });

  it("le semis de hêtre (sciaphile) survit et pousse lentement", () => {
    const state = underClosedCanopy("fagus_sylvatica", 5);
    const semis = state.trees.filter((t) => t.heightM < 20);
    expect(semis).toHaveLength(5);
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
