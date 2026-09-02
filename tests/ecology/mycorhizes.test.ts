/**
 * Réseaux mycorhiziens (critère C12, docs/regles.md §7.5).
 *
 * Ce qu'ils doivent produire :
 *  - un réseau met des ANNÉES à se tisser, et suit les hôtes compatibles ;
 *  - les trois types ne se remplacent pas : un chêne ne profite pas du réseau
 *    d'une lande à bruyères ;
 *  - le labour les tranche, et ce coût-là dure bien après le passage.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction } from "../../src/engine/actions";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import {
  cibleReseau,
  facteurAbsorption,
  prochainReseau,
  reseauSousArbre,
  SURVIE_APRES_LABOUR,
} from "../../src/engine/mycorhizes";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const WEATHER = serieToWeeks(SERIE);
const STATION: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [], gibierParHa: 0 };
const DIMS = { widthM: 30, heightM: 30 };

function arbre(id: number, especeId: string, x: number, y: number, heightM: number): TreeState {
  return {
    id,
    especeId,
    x,
    y,
    ageWeeks: 52 * 20,
    heightM,
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
    vigueur: 1,
    dommageHydraulique: 0,
    protege: false,
  };
}

describe("la compatibilité : trois réseaux qui ne se remplacent pas", () => {
  it("une lande à bruyères n'entretient pas le réseau des chênes", () => {
    const bruyeres = Array.from({ length: 40 }, (_, i) =>
      arbre(i + 1, "calluna_vulgaris", 5 + (i % 8) * 2.5, 5 + Math.floor(i / 8) * 2.5, 0.6),
    );
    const ecto = cibleReseau(bruyeres, "ecto", DIMS);
    const ericoide = cibleReseau(bruyeres, "ericoide", DIMS);
    const somme = (a: Float64Array) => a.reduce((x, y) => x + y, 0);
    expect(somme(ericoide)).toBeGreaterThan(0);
    expect(somme(ecto)).toBe(0);
  });

  it("les essences forestières partagent le même réseau", () => {
    // Chêne, hêtre, pin, bouleau, noisetier : tous ectomycorhiziens. C'est ce
    // qui fait qu'un semis de hêtre s'installe dans une chênaie déjà tissée.
    for (const id of ["quercus_pubescens", "fagus_sylvatica", "pinus_sylvestris"]) {
      expect(getEspece(id).mycorhize).toBe("ecto");
    }
    expect(getEspece("malus_domestica").mycorhize).toBe("arbusculaire");
  });
});

describe("le temps du réseau", () => {
  it("il faut des années, pas des semaines", () => {
    let reseau = 0;
    let semainesPourMoitie = 0;
    for (let i = 0; i < 52 * 20; i++) {
      reseau = prochainReseau(reseau, 1);
      if (reseau < 0.5) semainesPourMoitie = i;
    }
    // Plusieurs années pour arriver à mi-course : c'est l'ordre de grandeur
    // observé sous une jeune plantation.
    expect(semainesPourMoitie).toBeGreaterThan(52 * 2);
    expect(semainesPourMoitie).toBeLessThan(52 * 8);
  });

  it("il reflue quand ses hôtes disparaissent", () => {
    let reseau = 0.9;
    for (let i = 0; i < 52 * 10; i++) reseau = prochainReseau(reseau, 0);
    expect(reseau).toBeLessThan(0.4);
  });
});

describe("ce que le réseau apporte", () => {
  it("il améliore l'absorption d'azote, sans miracle", () => {
    expect(facteurAbsorption(0)).toBe(1);
    expect(facteurAbsorption(1)).toBeGreaterThan(1.2);
    expect(facteurAbsorption(1)).toBeLessThan(1.5);
  });

  it("un peuplement qui prend le terrain tisse son réseau — après l'avoir laissé retomber", () => {
    let state = createGameState(STATION, rngStateFromSeed(5));
    for (let i = 0; i < 25; i++) {
      state = plantAt(state, "betula_pendula", 5 + (i % 5) * 5, 5 + Math.floor(i / 5) * 5, 2);
    }
    const moyenne = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const debut = moyenne(state.soil.mycorhizes.ecto);
    const releves: number[] = [];
    for (let i = 0; i < 30 * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
      if ((i + 1) % (52 * 10) === 0) releves.push(moyenne(state.soil.mycorhizes.ecto));
    }
    // Creux d'abord : de jeunes plants n'occupent pas encore le sol, et le
    // fond de réseau qui préexistait reflue faute d'hôtes.
    expect(releves[0] ?? 1).toBeLessThan(debut);
    // Puis le peuplement prend le terrain et le réseau se tisse pour de bon.
    expect(releves[2] ?? 0).toBeGreaterThan(debut + 0.4);
  });
});

describe("le labour tranche les hyphes", () => {
  it("le réseau est détruit sur la zone travaillée, et pas ailleurs", () => {
    let state = createGameState(STATION, rngStateFromSeed(5));
    // Des arbres en rangs, pour que l'engin passe.
    for (let rang = 0; rang < 5; rang++) {
      for (let i = 0; i < 5; i++) {
        state = plantAt(state, "quercus_pubescens", 3 + rang * 6, 3 + i * 6, 3);
      }
    }
    const avant = [...state.soil.mycorhizes.ecto];
    const apres = applyAction(state, { type: "labourer", week: 1, x: 8, y: 8, rayonM: 6 }).state;
    const dans = 8 * 30 + 8;
    const dehors = 26 * 30 + 26;
    expect(apres.soil.mycorhizes.ecto[dans] ?? 0).toBeCloseTo(
      (avant[dans] ?? 0) * SURVIE_APRES_LABOUR,
      6,
    );
    expect(apres.soil.mycorhizes.ecto[dehors] ?? 0).toBeCloseTo(avant[dehors] ?? 0, 6);
  });

  it("et le coût dure : dix ans après, le réseau n'est pas revenu", () => {
    let reseau = 1 * SURVIE_APRES_LABOUR;
    for (let i = 0; i < 52 * 10; i++) reseau = prochainReseau(reseau, 1);
    expect(reseau).toBeLessThan(0.9);
  });

  it("un arbre planté dans un labour absorbe moins bien qu'un arbre en sol forestier", () => {
    const foret = arbre(1, "quercus_pubescens", 15, 15, 3);
    const laboure = new Array(900).fill(SURVIE_APRES_LABOUR);
    const ancien = new Array(900).fill(0.9);
    const gainLaboure = facteurAbsorption(
      reseauSousArbre(laboure, foret, getEspece("quercus_pubescens"), DIMS),
    );
    const gainForet = facteurAbsorption(
      reseauSousArbre(ancien, foret, getEspece("quercus_pubescens"), DIMS),
    );
    expect(gainForet).toBeGreaterThan(gainLaboure * 1.15);
  });
});
