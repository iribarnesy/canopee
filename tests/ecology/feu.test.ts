/**
 * Le feu (critère F10, ch5 « concevoir contre le FEU »).
 * Ce qu'il doit produire :
 *  - il ne part que si saison, sécheresse et combustible s'alignent ;
 *  - il ne franchit pas une coupure sans combustible ;
 *  - il trie les espèces : le liège traverse ce qui carbonise le pin ;
 *  - les pyrophytes repartent de souche ;
 *  - il renvoie d'un coup le carbone accumulé.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getEspece } from "../../src/engine/especes";
import { chargeCombustible, departDeFeu, propager, survitAuFeu } from "../../src/engine/feu";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";

const serie = serieMeteoPour("lande-seche");
if (!serie) throw new Error("série manquante");
const WEATHER = serieToWeeks(serie);

function arbre(especeId: string, heightM: number): TreeState {
  return {
    id: 1,
    especeId,
    x: 5,
    y: 5,
    ageWeeks: 52 * 20,
    heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 60,
  };
}

describe("départ de feu : il faut que tout s'aligne", () => {
  const charge = { parCellule: new Array(100).fill(1), moyenne: 1 };
  const rng = rngStateFromSeed(1);

  it("rien ne part en hiver, même sur un terrain sec et chargé", () => {
    expect(departDeFeu(rng, 5, 0.05, charge, 10).origine).toBeUndefined();
    expect(departDeFeu(rng, 48, 0.05, charge, 10).origine).toBeUndefined();
  });

  it("rien ne part si le sol est humide", () => {
    expect(departDeFeu(rng, 30, 0.8, charge, 10).origine).toBeUndefined();
  });

  it("rien ne part s'il n'y a pas de combustible", () => {
    const vide = { parCellule: new Array(100).fill(0), moyenne: 0 };
    expect(departDeFeu(rng, 30, 0.05, vide, 10).origine).toBeUndefined();
  });
});

describe("propagation : une coupure arrête le feu", () => {
  it("le feu ne franchit pas une bande sans combustible", () => {
    const cote = 11;
    const parCellule = new Array(cote * cote).fill(1);
    // Colonne centrale rase (fauchée) : le feu ne doit pas passer à droite.
    for (let y = 0; y < cote; y++) parCellule[y * cote + 5] = 0;
    const brulees = propager(0, { parCellule, moyenne: 1 }, cote);
    const droite = [...brulees].filter((i) => i % cote > 5);
    expect(brulees.size).toBeGreaterThan(30);
    expect(droite).toHaveLength(0);
  });

  it("sans coupure, il parcourt tout le terrain", () => {
    const cote = 11;
    const brulees = propager(0, { parCellule: new Array(cote * cote).fill(1), moyenne: 1 }, cote);
    expect(brulees.size).toBe(cote * cote);
  });
});

describe("le feu trie les espèces", () => {
  it("le chêne-liège traverse un incendie qui tue le pin", () => {
    const intensite = 0.8;
    expect(survitAuFeu(arbre("quercus_suber", 8), intensite)).toBe(true);
    expect(survitAuFeu(arbre("pinus_sylvestris", 8), intensite)).toBe(false);
  });

  it("l'ajonc et la callune sont détruits (mais leur souche repart)", () => {
    expect(survitAuFeu(arbre("ulex_europaeus", 2), 0.5)).toBe(false);
    expect(getEspece("ulex_europaeus").feu.rejetteApresFeu).toBe(true);
  });

  it("un grand arbre échappe mieux au feu courant qu'un jeune", () => {
    expect(survitAuFeu(arbre("castanea_sativa", 20), 0.5)).toBe(true);
    expect(survitAuFeu(arbre("castanea_sativa", 1), 0.5)).toBe(false);
  });
});

describe("la charge de combustible", () => {
  it("un résineux charge plus qu'un feuillu frais, à taille égale", () => {
    const cote = 20;
    const herbe = new Array(cote * cote).fill(0);
    const litiere = new Array(cote * cote).fill(0);
    const pin = chargeCombustible(
      [{ ...arbre("pinus_sylvestris", 8), x: 10, y: 10 }],
      herbe,
      litiere,
      cote,
    );
    const aulne = chargeCombustible(
      [{ ...arbre("alnus_glutinosa", 8), x: 10, y: 10 }],
      herbe,
      litiere,
      cote,
    );
    expect(pin.moyenne).toBeGreaterThan(2 * aulne.moyenne);
  });

  it("l'herbe sèche porte le feu même sans arbres", () => {
    const cote = 10;
    const charge = chargeCombustible([], new Array(100).fill(1), new Array(100).fill(0), cote);
    expect(charge.moyenne).toBeGreaterThan(0.3);
  });
});

describe("un incendie sur la lande, en conditions de jeu", () => {
  const station: Station = { ...LANDE_SECHE.station, coteM: 50, voisinage: [] };
  let state = createGameState(station, rngStateFromSeed(12));
  for (let i = 0; i < 20; i++) {
    state = plantAt(state, "pinus_sylvestris", 5 + (i % 5) * 10, 5 + Math.floor(i / 5) * 10, 6);
  }
  for (let i = 0; i < 10; i++) {
    state = plantAt(state, "quercus_suber", 10 + (i % 5) * 9, 12 + Math.floor(i / 5) * 14, 5);
  }
  let incendies = 0;
  let carboneParti = 0;
  for (let i = 0; i < 40 * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, []);
    state = r.state;
    if (r.incendie) {
      incendies++;
      carboneParti += r.incendie.carboneTHa;
    }
  }

  it("la lande finit par brûler", () => {
    expect(incendies).toBeGreaterThan(0);
    expect(carboneParti).toBeGreaterThan(1);
  });

  it("après le feu, c'est le chêne-liège qui tient le terrain", () => {
    const pins = state.trees.filter((t) => t.alive && t.especeId === "pinus_sylvestris").length;
    const lieges = state.trees.filter((t) => t.alive && t.especeId === "quercus_suber").length;
    expect(lieges).toBeGreaterThan(pins);
  });

  it("le feu est déterministe : même graine, mêmes incendies", () => {
    let bis = createGameState(station, rngStateFromSeed(12));
    for (let i = 0; i < 20; i++) {
      bis = plantAt(bis, "pinus_sylvestris", 5 + (i % 5) * 10, 5 + Math.floor(i / 5) * 10, 6);
    }
    for (let i = 0; i < 10; i++) {
      bis = plantAt(bis, "quercus_suber", 10 + (i % 5) * 9, 12 + Math.floor(i / 5) * 14, 5);
    }
    let n = 0;
    for (let i = 0; i < 40 * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      const r = advanceWeek(bis, w, []);
      bis = r.state;
      if (r.incendie) n++;
    }
    expect(n).toBe(incendies);
  });
});
