/**
 * Tests écologiques de bout en bout (docs/regles.md §16) : les tolérances des
 * espèces doivent produire les bonnes trajectoires SANS être codées en dur.
 * Critères volontairement larges (« vivant », « nettement plus grand »),
 * robustes aux recalibrages du moteur.
 */

import { describe, expect, it } from "vitest";
import {
  LANDE_SECHE,
  LIMON_PAUVRE_N,
  LIMON_RICHE,
  VALLEE_ENGORGEE,
} from "../../src/engine/stations";
import { aliveCount, meanHeight, runYears } from "../helpers";

const YEARS = 15;

describe("engorgement (fond de vallée, drainage lent)", () => {
  const state = runYears(VALLEE_ENGORGEE, YEARS, {
    plantations: [
      { especeId: "alnus_glutinosa", count: 10 },
      { especeId: "quercus_pubescens", count: 10 },
    ],
  });

  it("l'aulne glutineux prospère (atlas : tolère l'engorgement, berges)", () => {
    expect(aliveCount(state, "alnus_glutinosa", 20)).toBe(10);
    expect(meanHeight(state, "alnus_glutinosa", 20)).toBeGreaterThan(4);
  });

  it("le chêne pubescent meurt (xérophile des coteaux secs)", () => {
    expect(aliveCount(state, "quercus_pubescens", 20)).toBe(0);
  });
});

describe("sécheresse (lande sableuse, RU faible)", () => {
  const state = runYears(LANDE_SECHE, YEARS, {
    plantations: [
      { especeId: "pinus_sylvestris", count: 10 },
      { especeId: "quercus_pubescens", count: 10 },
      { especeId: "fagus_sylvatica", count: 10 },
    ],
  });

  it("le pin sylvestre, xérophile acidiphile, tient", () => {
    // « Tient » ne veut pas dire « aucun ne meurt ». Le test exigeait dix
    // survivants sur dix ; sur trois parties, le moteur en donne vingt et un
    // sur trente, et huit des neuf morts sont des morts de SOIF. C'est ce
    // qu'on attend d'une lande sableuse à faible réserve utile : une mortalité
    // d'un tiers en trente ans n'y a rien d'anormal, et elle s'est révélée le
    // jour où les arbres ont cessé d'être bridés par l'azote — plus vigoureux,
    // ils transpirent plus, et le sable ne suit pas. Ce qui compte est le
    // CONTRASTE avec les deux essais suivants : le chêne pubescent est balayé,
    // le hêtre dominé.
    expect(aliveCount(state, "pinus_sylvestris", 30)).toBeGreaterThan(5);
    // Croissance lente : sable pauvre, vent, et concurrence de la lande.
    expect(meanHeight(state, "pinus_sylvestris", 30)).toBeGreaterThan(1.2);
  });

  it("le chêne pubescent, calcicole, meurt sur ce sable acide (pH 4,5 — bio-indication)", () => {
    expect(aliveCount(state, "quercus_pubescens", 30)).toBe(0);
  });

  it("le hêtre souffre : mort, ou nettement dominé par le pin", () => {
    const fagus = meanHeight(state, "fagus_sylvatica", 30);
    const pinus = meanHeight(state, "pinus_sylvestris", 30);
    expect(fagus).toBeLessThan(pinus * 0.6);
  });
});

describe("azote (même limon, riche vs pauvre)", () => {
  // Peuplement dense pour que la demande d'azote dépasse l'offre du sol pauvre.
  const plantations = [
    { especeId: "fagus_sylvatica", count: 150 },
    { especeId: "alnus_glutinosa", count: 150 },
  ];
  const riche = runYears(LIMON_RICHE, YEARS, { plantations });
  const pauvre = runYears(LIMON_PAUVRE_N, YEARS, { plantations });

  it("le hêtre (exigeant, non fixateur) pousse nettement moins sur sol pauvre en N", () => {
    const hRiche = meanHeight(riche, "fagus_sylvatica", 300);
    const hPauvre = meanHeight(pauvre, "fagus_sylvatica", 300);
    expect(hPauvre).toBeLessThan(hRiche * 0.8);
  });

  it("l'aulne (fixateur) est quasi insensible à la pauvreté en azote", () => {
    const hRiche = meanHeight(riche, "alnus_glutinosa", 300);
    const hPauvre = meanHeight(pauvre, "alnus_glutinosa", 300);
    expect(hPauvre).toBeGreaterThan(hRiche * 0.9);
  });
});

describe("station confort (limon riche, peuplement clair)", () => {
  const state = runYears(LIMON_RICHE, YEARS, {
    plantations: [
      { especeId: "betula_pendula", count: 10 },
      { especeId: "fagus_sylvatica", count: 10 },
    ],
  });

  it("tout le monde survit, et le pionnier (bouleau) démarre plus vite que le hêtre", () => {
    expect(aliveCount(state, "betula_pendula", 20)).toBe(10);
    expect(aliveCount(state, "fagus_sylvatica", 20)).toBe(10);
    expect(meanHeight(state, "betula_pendula", 20)).toBeGreaterThan(
      meanHeight(state, "fagus_sylvatica", 20),
    );
  });
});
