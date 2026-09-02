/**
 * L'éclaircie outillée (critère H8) : le joueur dit ce qu'il veut obtenir —
 * une densité, une espèce à retirer — et le moteur désigne les tiges. C'est
 * le geste sylvicole courant (ch5-A), impraticable arbre par arbre.
 * Elle sert aussi à casser la continuité du combustible (ch5, feu).
 */

import { describe, expect, it } from "vitest";
import { choisirTigesAEclaircir, type GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const WEATHER = syntheticYear(LIMON_RICHE.climat);
const STATION = { ...LIMON_RICHE.station, coteM: 60, voisinage: [] };

/** Peuplement dense de tailles variées au centre de la parcelle. */
function peuplement() {
  let state = createGameState(STATION, rngStateFromSeed(7));
  for (let i = 0; i < 24; i++) {
    const angle = (2 * Math.PI * i) / 24;
    const rayon = 3 + (i % 4) * 2;
    state = plantAt(
      state,
      i % 3 === 0 ? "pinus_sylvestris" : "fagus_sylvatica",
      30 + rayon * Math.cos(angle),
      30 + rayon * Math.sin(angle),
      4 + (i % 6), // hauteurs de 4 à 9 m
    );
  }
  return state;
}

describe("désignation des tiges", () => {
  const state = peuplement();
  const base = {
    type: "eclaircir" as const,
    week: 0,
    x: 30,
    y: 30,
    rayonM: 12,
    devenir: "vendre" as const,
  };

  it("par le bas : ce sont les dominés qui tombent", () => {
    const ids = choisirTigesAEclaircir(state, {
      ...base,
      densiteCibleParHa: 200,
      critere: "parLeBas",
    });
    const coupes = state.trees.filter((t) => ids.includes(t.id));
    const restants = state.trees.filter((t) => !ids.includes(t.id));
    expect(coupes.length).toBeGreaterThan(0);
    const plusGrandCoupe = Math.max(...coupes.map((t) => t.heightM));
    const plusPetitRestant = Math.min(...restants.map((t) => t.heightM));
    expect(plusGrandCoupe).toBeLessThanOrEqual(plusPetitRestant);
  });

  it("par le haut : on prélève les plus gros", () => {
    const ids = choisirTigesAEclaircir(state, {
      ...base,
      densiteCibleParHa: 200,
      critere: "parLeHaut",
    });
    const coupes = state.trees.filter((t) => ids.includes(t.id));
    const restants = state.trees.filter((t) => !ids.includes(t.id));
    expect(Math.min(...coupes.map((t) => t.heightM))).toBeGreaterThanOrEqual(
      Math.max(...restants.map((t) => t.heightM)),
    );
  });

  it("par espèce : on retire une essence et elle seule", () => {
    const ids = choisirTigesAEclaircir(state, {
      ...base,
      densiteCibleParHa: 0,
      critere: "espece",
      especeId: "pinus_sylvestris",
    });
    const coupes = state.trees.filter((t) => ids.includes(t.id));
    expect(coupes.length).toBeGreaterThan(0);
    expect(coupes.every((t) => t.especeId === "pinus_sylvestris")).toBe(true);
  });

  it("une zone déjà claire ne donne rien à prélever", () => {
    const ids = choisirTigesAEclaircir(state, {
      ...base,
      densiteCibleParHa: 5000,
      critere: "parLeBas",
    });
    expect(ids).toHaveLength(0);
  });
});

describe("l'éclaircie en jeu", () => {
  it("ramène la densité près de la cible et rapporte du bois", () => {
    const state = peuplement();
    const avant = state.trees.length;
    const tresorAvant = state.economy.treasuryEur;
    const action: GameAction = {
      type: "eclaircir",
      week: 0,
      x: 30,
      y: 30,
      rayonM: 12,
      densiteCibleParHa: 300,
      critere: "parLeBas",
      devenir: "vendre",
    };
    const w = WEATHER[0];
    if (!w) throw new Error("météo manquante");
    const { state: apres, refusals } = advanceWeek(state, w, [action]);
    expect(refusals).toEqual([]);
    // 300 tiges/ha sur un disque de 12 m ≈ 13 arbres gardés sur 24.
    expect(apres.trees.length).toBeLessThan(avant);
    expect(apres.trees.length).toBeGreaterThan(8);
    expect(apres.economy.treasuryEur).toBeGreaterThan(tresorAvant);
  });

  it("retirer une essence casse la continuité du combustible", () => {
    const state = peuplement();
    const ids = choisirTigesAEclaircir(state, {
      type: "eclaircir",
      week: 0,
      x: 30,
      y: 30,
      rayonM: 12,
      densiteCibleParHa: 0,
      critere: "espece",
      especeId: "pinus_sylvestris",
      devenir: "epandre",
    });
    // Les pins (très inflammables) partent, les hêtres (frais) restent.
    const restants = state.trees.filter((t) => !ids.includes(t.id));
    expect(restants.every((t) => t.especeId !== "pinus_sylvestris")).toBe(true);
    expect(restants.length).toBeGreaterThan(10);
  });
});
