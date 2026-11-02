/**
 * Le poids de l'ombre d'un voisin (light.ts, `poidsDuVoisin`, #467).
 *
 * Un voisin pèse la part de son houppier qui dépasse chaque niveau du houppier
 * de la cible, moyennée de sa base à sa cime. La loi n'a aucune constante : ce
 * que ces essais vérifient, ce sont ses propriétés, et que la lecture à la cime
 * et la lecture au sol en sont les deux limites.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  computeGroundLight,
  computeLight,
  lumieresDesArbres,
  PROFONDEUR_HOUPPIER_MAX,
  poidsDuVoisin,
} from "../../src/engine/light";
import type { TreeState } from "../../src/engine/trees";
import { diametreInitialCm } from "../../src/engine/trees";

/** Poids d'un voisin de hauteur `rapport` pour une cible de hauteur 1, houppiers pleins. */
function poids(rapport: number): number {
  const p = PROFONDEUR_HOUPPIER_MAX;
  return poidsDuVoisin(rapport, p * rapport, 1, 1 - p);
}

function arbre(id: number, x: number, y: number, heightM: number): TreeState {
  return {
    id,
    especeId: "fagus_sylvatica",
    x,
    y,
    ageWeeks: 40 * 52,
    heightM,
    diametreCm: diametreInitialCm(heightM),
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    hauteurElagueeM: 0,
    baseHouppierM: 0,
    recepages: 0,
    rootDepthCm: 120,
    pousseTendreM: 0,
    dommageHydraulique: 0,
    vigueur: 1,
    vigueurIndividuelle: 1,
    protege: false,
  };
}

describe("le poids d'un voisin, lu sur tout le houppier", () => {
  it("vaut un demi pour un voisin de même hauteur, sans constante", () => {
    expect(poids(1)).toBeCloseTo(0.5, 12);
  });

  it("suit la table du commentaire de la loi", () => {
    const table: [number, number][] = [
      [0.5, 0.2],
      [0.75, 0.35],
      [1, 0.5],
      [1.1, 0.56],
      [1.5, 0.7],
      [2, 0.8],
      [3, 0.9],
    ];
    for (const [rapport, attendu] of table) expect(poids(rapport)).toBeCloseTo(attendu, 2);
  });

  it("n'a plus de saut autour de l'égalité des hauteurs", () => {
    // L'ancienne règle donnait 0,4 à un voisin plus court d'un centimètre, 0 à
    // un égal et 1 à un voisin plus haut d'un centimètre.
    expect(Math.abs(poids(1.0001) - poids(0.9999))).toBeLessThan(1e-3);
  });

  it("croît avec la hauteur du voisin et reste dans [0, 1]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 5, noNaN: true }),
        fc.double({ min: 0.01, max: 5, noNaN: true }),
        (a, b) => {
          const [bas, haut] = a <= b ? [a, b] : [b, a];
          expect(poids(bas)).toBeLessThanOrEqual(poids(haut) + 1e-12);
          expect(poids(bas)).toBeGreaterThanOrEqual(0);
          expect(poids(haut)).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it("vaut 1 pour un point au sol, quel que soit le voisin", () => {
    for (const h of [0.3, 2, 12, 35]) {
      for (const part of [1, 0.5, 0.1]) {
        expect(poidsDuVoisin(h, part * PROFONDEUR_HOUPPIER_MAX * h, 0, 0)).toBe(1);
      }
    }
  });

  it("lu à la cime, donne la part du houppier voisin qui dépasse la cime", () => {
    // La lumière de cime, celle que lit l'élagage naturel.
    expect(poidsDuVoisin(1, 0.9, 1, 1)).toBe(0);
    expect(poidsDuVoisin(0.8, 0.72, 1, 1)).toBe(0);
    expect(poidsDuVoisin(1.1, 0.99, 1, 1)).toBeCloseTo(0.1 / 0.99, 12);
    expect(poidsDuVoisin(30, 27, 1, 1)).toBe(1);
    // Et la lecture du houppier tend vers elle quand la profondeur s'annule.
    expect(poidsDuVoisin(1.1, 0.99, 1, 1 - 1e-4)).toBeCloseTo(0.1 / 0.99, 4);
  });

  it("un voisin sans houppier ne pèse rien", () => {
    expect(poidsDuVoisin(20, 0, 10, 1)).toBe(0);
  });
});

describe("la lumière des arbres", () => {
  it("un arbre seul ne s'ombrage pas lui-même", () => {
    const seul = [arbre(1, 10, 10, 20)];
    expect(computeLight(seul, () => 1)[0]).toBe(1);
    const { cime } = lumieresDesArbres(seul, () => 1);
    expect(cime[0]).toBe(1);
  });

  it("deux égaux s'ombragent sur le houppier, pas à la cime", () => {
    // Le voisin du sud, de même hauteur : son ombre tombe sur le houppier de
    // l'autre et pèse un demi ; aucune de ses feuilles ne dépasse la cime.
    const h = 20;
    const egaux = [arbre(1, 10, 10, h), arbre(2, 10, 10 - 0.4 * h, h)];
    const { houppier, cime } = lumieresDesArbres(egaux, () => 1);
    expect(houppier[0]).toBeLessThan(0.9);
    expect(cime[0]).toBe(1);
  });

  it("au sol, tout houppier pèse à plein, le petit comme le grand", () => {
    // Hors saturation, les extinctions s'additionnent : la lumière sous les
    // deux est le produit des lumières sous chacun.
    const grand = arbre(1, 8, 8, 12);
    const petit = arbre(2, 9, 12, 6);
    const deux = computeGroundLight([grand, petit], 20, 20, () => 1);
    const sousGrand = computeGroundLight([grand], 20, 20, () => 1);
    const sousPetit = computeGroundLight([petit], 20, 20, () => 1);
    let comparees = 0;
    for (let i = 0; i < deux.length; i++) {
      const a = sousGrand[i] ?? 1;
      const b = sousPetit[i] ?? 1;
      if (a >= 1 || b >= 1 || -Math.log(a) - Math.log(b) > 2) continue;
      expect(deux[i]).toBeCloseTo(a * b, 12);
      comparees++;
    }
    expect(comparees).toBeGreaterThan(5);
  });
});
