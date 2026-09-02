/**
 * Ravageurs et auxiliaires (critères G2, G3, J5).
 *
 * Le test qui compte est le dernier : à station, densité et météo identiques,
 * une aulnaie pure se fait décimer là où le même nombre d'aulnes mélangés
 * passe. Rien n'est codé pour ça — c'est la chaîne « arbre qui végète →
 * ressource → pullulation → dégâts » d'un côté, et l'habitat des auxiliaires
 * de l'autre.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import {
  carteBiotique,
  disperser,
  facteurChaleur,
  prochainePression,
  vulnerabilite,
} from "../../src/engine/ravageurs";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";

function arbre(id: number, especeId: string, x: number, y: number, vigueur: number): TreeState {
  return {
    id,
    especeId,
    x,
    y,
    ageWeeks: 52 * 20,
    heightM: 8,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 80,
    hauteurElagueeM: 0,
    recepages: 0,
    pousseTendreM: 0,
    vigueur,
    protege: false,
  };
}

describe("qui se fait attaquer", () => {
  it("un arbre qui végète est bien plus exploitable qu'un arbre vigoureux", () => {
    const vigoureux = vulnerabilite("pinus_sylvestris", 1);
    const affaibli = vulnerabilite("pinus_sylvestris", 0.2);
    expect(affaibli).toBeGreaterThan(4 * vigoureux);
  });

  it("à vigueur égale, la sensibilité d'espèce fait la différence", () => {
    // Le résineux en peuplement pur et le fruitier cultivé paient ; l'ajonc non.
    expect(vulnerabilite("pinus_sylvestris", 0.5)).toBeGreaterThan(
      3 * vulnerabilite("ulex_europaeus", 0.5),
    );
  });
});

describe("dynamique de population", () => {
  it("sans chaleur, rien ne se développe", () => {
    expect(facteurChaleur(2)).toBe(0);
    expect(prochainePression(0.5, 1, 0.3, facteurChaleur(2))).toBeLessThan(0.5);
  });

  it("la population hiverne : elle attend, elle ne disparaît pas", () => {
    let p = 0.5;
    for (let i = 0; i < 20; i++) p = prochainePression(p, 1, 0.3, 0);
    // Vingt semaines d'hiver : la population est entamée, pas effacée — c'est
    // ce qui permet aux pullulations de s'installer sur plusieurs années.
    expect(p).toBeGreaterThan(0.25);
  });

  it("un habitat riche en auxiliaires fait reculer une pullulation lancée", () => {
    const chaleur = facteurChaleur(20);
    let pauvre = 0.3;
    let riche = 0.3;
    for (let i = 0; i < 10; i++) {
      pauvre = prochainePression(pauvre, 1, 0.15, chaleur);
      riche = prochainePression(riche, 1, 0.95, chaleur);
    }
    expect(pauvre).toBeGreaterThan(0.6);
    expect(riche).toBeLessThan(pauvre / 2);
  });

  it("sans ressource, la population s'éteint", () => {
    let p = 0.8;
    for (let i = 0; i < 60; i++) p = prochainePression(p, 0, 0.3, facteurChaleur(20));
    expect(p).toBeLessThan(0.01);
  });

  it("les insectes essaiment vers les cellules voisines", () => {
    const dims = { widthM: 5, heightM: 5 };
    const p = new Float64Array(25);
    p[12] = 1;
    const apres = disperser(p, dims);
    expect(apres[12] ?? 0).toBeLessThan(1);
    expect(apres[11] ?? 0).toBeGreaterThan(0);
    // Rien ne se crée : la dispersion déplace, elle n'ajoute pas.
    expect(apres.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe("les auxiliaires jugent le voisinage, pas le mètre carré", () => {
  const dims = { widthM: 40, heightM: 40 };
  const herbe = new Array(1600).fill(0.4);

  it("un mélange d'essences vaut un bien meilleur habitat qu'une monoculture", () => {
    const especes = ["alnus_glutinosa", "betula_pendula", "fagus_sylvatica", "quercus_pubescens"];
    const pur: TreeState[] = [];
    const mixte: TreeState[] = [];
    for (let i = 0; i < 100; i++) {
      const x = 2 + (i % 10) * 4;
      const y = 2 + Math.floor(i / 10) * 4;
      pur.push(arbre(i + 1, "alnus_glutinosa", x, y, 1));
      mixte.push(arbre(i + 1, especes[i % 4] ?? "alnus_glutinosa", x, y, 1));
    }
    const moyenne = (v: Float64Array) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(moyenne(carteBiotique(mixte, herbe, 0, dims).habitat)).toBeGreaterThan(
      1.3 * moyenne(carteBiotique(pur, herbe, 0, dims).habitat),
    );
  });

  it("le bois mort laissé sur place améliore l'habitat", () => {
    const trees = [arbre(1, "alnus_glutinosa", 20, 20, 1)];
    const sans = carteBiotique(trees, herbe, 0, dims).habitat[820] ?? 0;
    const avec = carteBiotique(trees, herbe, 25, dims).habitat[820] ?? 0;
    expect(avec).toBeGreaterThan(sans);
  });
});

describe("à l'échelle du peuplement : ce que coûte la monoculture", () => {
  function peuplement(especes: string[], focal: string, ans: number) {
    const station: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(4));
    for (let i = 0; i < 144; i++) {
      const esp = especes[i % especes.length];
      if (!esp) throw new Error("espèce manquante");
      state = plantAt(state, esp, 2 + (i % 12) * 3, 2 + Math.floor(i / 12) * 3, 0.5);
    }
    const plantes = (144 / especes.length) * especes.filter((e) => e === focal).length;
    let tuesParRavageurs = 0;
    let pressionMax = 0;
    for (let i = 0; i < ans * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      const r = advanceWeek(state, w, []);
      state = r.state;
      pressionMax = Math.max(pressionMax, r.fluxes.ravageurMoyen);
      tuesParRavageurs += r.morts.filter((m) => m.cause === "ravageurs").length;
    }
    return { tauxMortalite: tuesParRavageurs / plantes, pressionMax };
  }

  const pur = peuplement(["alnus_glutinosa"], "alnus_glutinosa", 40);
  const mixte = peuplement(
    ["alnus_glutinosa", "quercus_pubescens", "betula_pendula", "fagus_sylvatica"],
    "alnus_glutinosa",
    40,
  );

  it("l'aulnaie pure se fait décimer, le mélange encaisse", () => {
    expect(pur.tauxMortalite).toBeGreaterThan(0.15);
    expect(mixte.tauxMortalite).toBeLessThan(pur.tauxMortalite / 3);
  });

  it("la pullulation elle-même est bien plus forte en peuplement pur", () => {
    expect(pur.pressionMax).toBeGreaterThan(2 * mixte.pressionMax);
  });
});
