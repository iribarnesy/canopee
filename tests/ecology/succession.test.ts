/**
 * LE test de bout en bout (docs/regles.md §11, §16) : sur une friche nue, la
 * succession écologique doit ÉMERGER des règles (dispersion, lumière, stress,
 * sénescence) sans être codée en dur :
 *   friche → colonisation par les pionniers → canopée pionnière avec les
 *   climaciques qui s'installent dessous → effondrement des pionniers
 *   (longévité) → les climaciques prennent la canopée.
 * Critères volontairement larges, robustes aux recalibrages.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { FRICHE_LIMON } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Les pionnières, au sens de l'atlas (colonne « Succ. » = `pion`). La liste ne
 * comptait que les deux ARBRES pionniers parce que l'atlas moteur s'arrêtait
 * là ; la strate arbustive — ronce, prunellier, aubépine, sureau — en fait
 * partie de plein droit, et c'est même elle qui prend une friche en premier.
 */
const PIONNIERS = new Set([
  "betula_pendula",
  "pinus_sylvestris",
  "rubus_fruticosus",
  "prunus_spinosa",
  "crataegus_monogyna",
  "sambucus_nigra",
]);

function snapshotStats(state: GameState) {
  const alive = state.trees.filter((t) => t.alive);
  const canopy = alive.filter((t) => t.heightM > 10);
  return {
    alive,
    aliveCount: alive.length,
    pioneerShare:
      alive.length > 0 ? alive.filter((t) => PIONNIERS.has(t.especeId)).length / alive.length : 0,
    canopy,
    canopyPioneerShare:
      canopy.length > 0
        ? canopy.filter((t) => PIONNIERS.has(t.especeId)).length / canopy.length
        : 0,
    canopyFagusShare:
      canopy.length > 0
        ? canopy.filter((t) => t.especeId === "fagus_sylvatica").length / canopy.length
        : 0,
    fagusAlive: alive.filter((t) => t.especeId === "fagus_sylvatica"),
    betulaAlive: alive.filter((t) => t.especeId === "betula_pendula").length,
    /** Bouleaux plus âgés que la longévité de l'espèce : la cohorte de départ. */
    betulaVieux: alive.filter((t) => t.especeId === "betula_pendula" && t.ageWeeks / 52 > 90)
      .length,
  };
}

describe("succession émergente sur friche (200 ans, rien n'est planté)", () => {
  // Une seule longue simulation, snapshots aux années 15, 60 et 120.
  const weather = syntheticYear(FRICHE_LIMON.climat);
  let state = createGameState(FRICHE_LIMON.station, rngStateFromSeed(2026));
  const snapshots = new Map<number, ReturnType<typeof snapshotStats>>();
  for (let i = 0; i < 200 * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
    const year = (i + 1) / 52;
    if (year === 15 || year === 60 || year === 120 || year === 200)
      snapshots.set(year, snapshotStats(state));
  }
  const an15 = snapshots.get(15);
  const an60 = snapshots.get(60);
  const an120 = snapshots.get(120);
  const an200 = snapshots.get(200);
  if (!an15 || !an60 || !an120 || !an200) throw new Error("snapshot manquant");

  it("an 15 : la friche est colonisée, très majoritairement par les pionniers", () => {
    expect(an15.aliveCount).toBeGreaterThan(20);
    expect(an15.pioneerShare).toBeGreaterThan(0.8);
  });

  it("an 60 : canopée pionnière, les hêtres attendent dans le sous-étage", () => {
    expect(an60.canopy.length).toBeGreaterThan(15);
    expect(an60.canopyPioneerShare).toBeGreaterThan(0.7);
    expect(an60.fagusAlive.length).toBeGreaterThan(3);
    const fagusSousEtage = an60.fagusAlive.filter((t) => t.heightM < 10).length;
    expect(fagusSousEtage).toBeGreaterThan(an60.fagusAlive.length / 2);
  });

  it("an 120 : la cohorte pionnière initiale s'est éteinte (longévité du bouleau ~90 ans)", () => {
    // On compte ce que le titre annonce : les VIEUX bouleaux, ceux de la
    // vague de colonisation. Le nombre total, lui, ne dit rien — le bouleau se
    // maintient en se ressemant dans ses propres trouées, et c'est justement
    // ce qui fait de lui un pionnier qui dure sans jamais vieillir.
    // Pas tout à fait zéro : la sénescence s'étale, et quelques sujets
    // dépassent leur longévité avant de céder. Mais il n'en reste qu'une
    // poignée sur la centaine qui tenait le terrain à soixante ans.
    expect(an120.betulaVieux).toBeLessThan(0.1 * an60.betulaAlive);
    // La banque de hêtres ne recule pas : elle attend sous le couvert. Elle
    // grossit franchement plus tard — c'est le test de l'an 200 qui le dit —
    // mais à cent vingt ans elle a surtout cessé de perdre du terrain.
    expect(an120.fagusAlive.length).toBeGreaterThanOrEqual(an60.fagusAlive.length);
  });

  it("an 200 : des hêtres ont pris la canopée, leur part y progresse (le vrai tempo : 150-250 ans)", () => {
    // Le critère, c'est d'ÊTRE dans la canopée — au seuil que ce test se donne
    // lui-même (10 m) — et non d'atteindre une taille absolue : un hêtre passé
    // deux siècles sous un couvert de pionniers monte lentement.
    const fagusEnCanopee = an200.canopy.filter((t) => t.especeId === "fagus_sylvatica").length;
    expect(fagusEnCanopee).toBeGreaterThan(0);
    expect(an200.canopyFagusShare).toBeGreaterThan(an60.canopyFagusShare);
    expect(an200.canopyFagusShare).toBeGreaterThan(an120.canopyFagusShare);
  });

  it("le peuplement reste sous le plafond d'auto-éclaircie", () => {
    expect(an200.aliveCount).toBeLessThanOrEqual(0.15 * 50 * 50);
  });
});
