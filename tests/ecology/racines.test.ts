/**
 * Profondeur d'enracinement et stratification (critères A10 et E7).
 * Deux espèces peuvent partager le même mètre carré sans puiser dans la même
 * eau : un pivot descend chercher la réserve profonde, un système traçant
 * reste en surface. C'est la base de la complémentarité agroforestière — et
 * ça explique pourquoi un pin tient sur un sable où un bouleau souffre.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear as anneeSynthetique, syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon, profondeurPenetrableCm } from "../../src/engine/soil";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { fractionsRacinairesParHorizon, profondeurRacinesCm } from "../../src/engine/trees";

describe("profondeur explorée", () => {
  const chene = getEspece("quercus_pubescens"); // pivot puissant
  const bouleau = getEspece("betula_pendula"); // traçant

  it("un semis n'explore que la surface, un adulte descend", () => {
    const semis = profondeurRacinesCm(chene, 0.3, 300);
    const adulte = profondeurRacinesCm(chene, 18, 300);
    expect(semis).toBeLessThan(50);
    expect(adulte).toBeGreaterThan(200);
  });

  it("à taille égale, un pivot descend plus bas qu'un traçant", () => {
    expect(profondeurRacinesCm(chene, 15, 300)).toBeGreaterThan(
      profondeurRacinesCm(bouleau, 15, 300),
    );
  });

  it("un sol peu profond bride tout le monde (roche, alios)", () => {
    const surAlios = profondeurRacinesCm(chene, 18, 25);
    expect(surAlios).toBeLessThanOrEqual(25);
  });

  it("la densité racinaire décroît avec la profondeur", () => {
    const fractions = fractionsRacinairesParHorizon([30, 70], 200);
    expect(fractions[0]).toBeGreaterThan(0.3); // beaucoup en surface malgré 30/100 cm
    expect(fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("un enracinement superficiel ignore l'horizon profond", () => {
    const fractions = fractionsRacinairesParHorizon([30, 70], 28);
    expect(fractions[1]).toBe(0);
    expect(fractions[0]).toBeCloseTo(1, 6);
  });
});

describe("complémentarité verticale sur sol contrasté", () => {
  /**
   * Sol à deux étages très différents : une surface sableuse qui sèche vite,
   * sur un horizon limoneux profond qui garde l'eau. Le pivot atteint la
   * réserve profonde, le traçant reste prisonnier de la surface.
   */
  const SOL_CONTRASTE: Station = {
    ...LIMON_RICHE.station,
    id: "sol-contraste",
    nom: "Sable sur limon profond",
    profil: [
      horizon(25, { sable: 90, limon: 8, argile: 2 }, { moPct: 1.5, ph: 6.5 }),
      horizon(120, { sable: 20, limon: 65, argile: 15 }, { moPct: 0.9, ph: 6.8 }),
    ],
    ruMm: 0, // recalculés ci-dessous
    coteM: 30,
    voisinage: [],
    ventExposition: 0.3,
  };
  // Les paramètres dérivés doivent rester cohérents avec le profil.
  const station: Station = {
    ...SOL_CONTRASTE,
    ruMm: 25 * 0.75 + 120 * 1.5,
  };

  it("le sol est profond et pénétrable", () => {
    expect(profondeurPenetrableCm(station.profil)).toBeGreaterThan(100);
  });

  it("un pivot adulte puise majoritairement en profondeur, un traçant en surface", () => {
    const epaisseurs = station.profil.map((h) => h.epaisseurCm);
    const pivot = fractionsRacinairesParHorizon(
      epaisseurs,
      profondeurRacinesCm(getEspece("quercus_pubescens"), 16, 145),
    );
    const tracant = fractionsRacinairesParHorizon(
      epaisseurs,
      profondeurRacinesCm(getEspece("betula_pendula"), 16, 145),
    );
    expect(pivot[1] ?? 0).toBeGreaterThan(tracant[1] ?? 0);
  });

  it("le pivot atteint la réserve profonde et survit ; le traçant reste prisonnier du sable", () => {
    const weather = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(station, rngStateFromSeed(4));
    state = plantAt(state, "quercus_pubescens", 12, 15, 4); // pivot
    state = plantAt(state, "betula_pendula", 18, 15, 4); // traçant
    for (let i = 0; i < 12 * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const pivot = state.trees.find((t) => t.id === 1);
    const tracant = state.trees.find((t) => t.id === 2);
    expect(pivot?.alive).toBe(true);
    // Il est allé chercher l'eau sous le sable superficiel.
    expect(pivot?.rootDepthCm ?? 0).toBeGreaterThan(50);
    expect(tracant?.alive ?? false).toBe(false);
  });
});

describe("plasticité racinaire : on ne creuse que si on a soif", () => {
  /** Sol profond identique ; seul le régime hydrique change. */
  const PROFIL = [
    horizon(25, { sable: 60, limon: 30, argile: 10 }, { moPct: 2, ph: 6.5 }),
    horizon(120, { sable: 30, limon: 55, argile: 15 }, { moPct: 0.9, ph: 6.8 }),
  ];

  function eleverUnChene(nappeMm: number, pluieAnnuelleMm: number, ans: number) {
    const station: Station = {
      ...LIMON_RICHE.station,
      id: "plasticite",
      profil: PROFIL,
      coteM: 30,
      voisinage: [],
      remonteeNappeMmSemaine: nappeMm,
      ventExposition: 0.3,
      ruMm: 200,
    };
    const weather = anneeSynthetique({ ...LIMON_RICHE.climat, rainAnnualMm: pluieAnnuelleMm });
    let state = createGameState(station, rngStateFromSeed(4));
    state = plantAt(state, "quercus_pubescens", 15, 15, 2);
    for (let i = 0; i < ans * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const arbre = state.trees[0];
    if (!arbre?.alive) throw new Error("l'arbre du test est mort");
    return arbre;
  }

  const gate = eleverUnChene(10, 1000, 20); // nappe généreuse, climat arrosé
  const endurci = eleverUnChene(0, 550, 20); // pas de nappe, climat sec

  it("un arbre qui n'a jamais manqué d'eau garde un système superficiel", () => {
    expect(gate.rootDepthCm).toBeLessThan(endurci.rootDepthCm);
  });

  it("l'arbre assoiffé descend chercher la réserve profonde", () => {
    expect(endurci.rootDepthCm).toBeGreaterThan(70);
  });

  it("les deux atteignent des tailles comparables : c'est bien l'allocation qui diffère", () => {
    expect(gate.heightM).toBeGreaterThan(0.7 * endurci.heightM);
  });

  it("un semis démarre en surface, quelles que soient ses capacités d'espèce", () => {
    const jeune = eleverUnChene(10, 1000, 1);
    expect(jeune.rootDepthCm).toBeLessThan(60);
  });
});
