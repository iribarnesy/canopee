/**
 * **Papillons, abeilles et oiseaux de passage disent le moteur** (#129, #296,
 * #299).
 *
 * Pas d'insecte là où le moteur n'en met pas, plus d'insectes là où il en met
 * plus. Pas d'oiseau de passage sans oiseau dans la fréquentation, et jamais
 * ailleurs que sur les arbres qu'elle nomme.
 */

import { describe, expect, it } from "vitest";
import {
  OISEAUX_MAX_PAR_GUILDE,
  type PassageDUneGuilde,
  posesDesOiseauxDePassage,
} from "../../src/render/faune/passage";
import {
  butinages,
  INSECTES_PAR_BLOC,
  insectesEnVol,
  MAX_BLOCS,
} from "../../src/render/faune/pollinisateurs";
import type { Perchoir } from "../../src/render/faune/residents";

describe("papillons et abeilles", () => {
  it("personne sans pollinisateurs, ni hors floraison", () => {
    expect(butinages(new Float32Array(400), 20)).toEqual([]);
    expect(butinages(undefined, 20)).toEqual([]);
  });

  it("volent là où le moteur les met, et seulement là", () => {
    const grille = new Float32Array(400);
    // Une haie fleurie sur la colonne x ∈ [0,4[.
    for (let y = 0; y < 20; y++) for (let x = 0; x < 4; x++) grille[y * 20 + x] = 0.9;
    const blocs = butinages(grille, 20);
    expect(blocs.length).toBeGreaterThan(0);
    for (const b of blocs) expect(b.x).toBeLessThan(4);
    for (const i of insectesEnVol(blocs, 12345)) {
      // Ils louvoient autour de leur bloc, ils ne traversent pas la parcelle.
      expect(i.x).toBeLessThan(8);
    }
  });

  it("une haie qui loge et nourrit en porte plus qu'un verger presque nu", () => {
    const riche = butinages(new Float32Array(400).fill(0.9), 20);
    const pauvre = butinages(new Float32Array(400).fill(0.2), 20);
    const compte = (bs: typeof riche) => bs.reduce((s, b) => s + b.insectes, 0);
    expect(compte(riche)).toBeGreaterThan(compte(pauvre));
    expect(Math.max(...riche.map((b) => b.insectes))).toBeLessThanOrEqual(INSECTES_PAR_BLOC);
  });

  it("le plafond de blocs tient sur une grande parcelle en fleurs", () => {
    expect(butinages(new Float32Array(200 * 200).fill(1), 200).length).toBe(MAX_BLOCS);
  });

  it("le même instant rend les mêmes insectes, et ils battent des ailes", () => {
    const blocs = butinages(new Float32Array(400).fill(0.8), 20);
    expect(insectesEnVol(blocs, 5000)).toEqual(insectesEnVol(blocs, 5000));
    const a = insectesEnVol(blocs, 5000).map((i) => i.ouvert);
    const b = insectesEnVol(blocs, 5100).map((i) => i.ouvert);
    expect(a).not.toEqual(b);
  });
});

const arbre = (id: number, x: number): Perchoir => ({
  id,
  x,
  y: 5,
  heightM: 4,
  houppierRatio: 0.3,
  baseHouppierM: 0.8,
});
const ARBRES = new Map([1, 2, 3, 4, 5].map((id) => [id, arbre(id, id * 10)]));

const guilde = (g: Partial<PassageDUneGuilde>): PassageDUneGuilde => ({
  guildeId: "passereaux_de_haie",
  ressource: "fourre",
  oiseaux: 3,
  arbres: [1, 2],
  ...g,
});

describe("les oiseaux de passage", () => {
  it("une entrée à zéro oiseau ne pose rien", () => {
    expect(posesDesOiseauxDePassage([guilde({ oiseaux: 0 })], ARBRES, 1, 0)).toEqual([]);
    expect(posesDesOiseauxDePassage(undefined, ARBRES, 1, 0)).toEqual([]);
  });

  it("autant d'oiseaux que le moteur en compte, jusqu'au plafond", () => {
    expect(posesDesOiseauxDePassage([guilde({ oiseaux: 5 })], ARBRES, 1, 0)).toHaveLength(5);
    const bande = guilde({ guildeId: "hivernants_frugivores", ressource: "baies", oiseaux: 300 });
    expect(posesDesOiseauxDePassage([bande], ARBRES, 1, 0)).toHaveLength(OISEAUX_MAX_PAR_GUILDE);
  });

  it("ne se posent que sur les arbres nommés", () => {
    for (let t = 0; t < 60000; t += 777) {
      for (const p of posesDesOiseauxDePassage([guilde({ arbres: [2, 4] })], ARBRES, 7, t)) {
        if (p.surArbre !== undefined) expect([2, 4]).toContain(p.surArbre);
        // Posés ou en vol, ils restent entre leurs deux arbres.
        expect(p.x).toBeGreaterThan(15);
        expect(p.x).toBeLessThan(45);
      }
    }
  });

  it("une guilde sans arbre vivant nommé ne pose rien, une guilde inconnue non plus", () => {
    expect(posesDesOiseauxDePassage([guilde({ arbres: [99] })], ARBRES, 1, 0)).toEqual([]);
    expect(posesDesOiseauxDePassage([guilde({ guildeId: "inconnue" })], ARBRES, 1, 0)).toEqual([]);
  });

  it("les passereaux de haie restent bas, les frugivores montent dans la couronne", () => {
    const bas = posesDesOiseauxDePassage([guilde({ oiseaux: 20 })], ARBRES, 3, 0).filter(
      (p) => p.geste !== "vol",
    );
    const haut = posesDesOiseauxDePassage(
      [guilde({ guildeId: "hivernants_frugivores", ressource: "baies", oiseaux: 20 })],
      ARBRES,
      3,
      0,
    ).filter((p) => p.geste !== "vol");
    const moyenne = (ps: typeof bas) => ps.reduce((s, p) => s + p.hauteurM, 0) / ps.length;
    expect(moyenne(bas)).toBeLessThan(moyenne(haut));
    for (const p of bas) expect(p.hauteurM).toBeLessThanOrEqual(1.5);
  });

  it("la bande de cette semaine n'est pas celle de la suivante, mais un instant est un instant", () => {
    const g = [guilde({ oiseaux: 6, arbres: [1, 2, 3, 4, 5] })];
    expect(posesDesOiseauxDePassage(g, ARBRES, 10, 4000)).toEqual(
      posesDesOiseauxDePassage(g, ARBRES, 10, 4000),
    );
    expect(posesDesOiseauxDePassage(g, ARBRES, 10, 4000)).not.toEqual(
      posesDesOiseauxDePassage(g, ARBRES, 11, 4000),
    );
  });
});
