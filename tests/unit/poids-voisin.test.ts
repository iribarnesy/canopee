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
import { getEspece } from "../../src/engine/especes";
import {
  baseHouppierCible,
  computeGroundLight,
  computeLight,
  lumieresDesArbres,
  PROFONDEUR_HOUPPIER_MAX,
  poidsDuVoisin,
  profondeurVivanteParNiveaux,
  type VoisinsOmbre,
} from "../../src/engine/light";
import type { TreeState } from "../../src/engine/trees";
import { diametreInitialCm } from "../../src/engine/trees";

/** Poids d'un voisin de hauteur `rapport` pour une cible de hauteur 1, houppiers pleins. */
function poids(rapport: number): number {
  const p = PROFONDEUR_HOUPPIER_MAX;
  return poidsDuVoisin(rapport, p * rapport, 1, 1 - p);
}

function arbre(
  id: number,
  x: number,
  y: number,
  heightM: number,
  especeId = "fagus_sylvatica",
): TreeState {
  return {
    id,
    especeId,
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
    expect(poidsDuVoisin(1.1, 0.99, 1, 1 - 1e-4)).toBeCloseTo(0.1 / 0.99, 3);
  });

  it("un voisin sans houppier ne pèse rien", () => {
    expect(poidsDuVoisin(20, 0, 10, 1)).toBe(0);
  });
});

describe("la lumière des arbres", () => {
  it("un arbre seul ne s'ombrage pas lui-même", () => {
    const seul = [arbre(1, 10, 10, 20, "pinus_sylvestris")];
    expect(computeLight(seul, () => 1)[0]).toBe(1);
    // En pleine lumière, le houppier garde toute sa profondeur.
    const { profondeurVivante } = lumieresDesArbres(seul, () => 1);
    expect(profondeurVivante[0]).toBe(PROFONDEUR_HOUPPIER_MAX);
  });

  it("deux pins égaux s'ombragent sur le houppier, et le bas du houppier meurt", () => {
    // Le voisin du sud, de même hauteur : son ombre tombe sur le houppier de
    // l'autre et pèse un demi. Aucune de ses feuilles ne dépasse la cime, mais
    // la moitié haute de son houppier dépasse la moitié basse de l'autre : les
    // branches basses d'un héliophile y passent sous leur compensation.
    const h = 20;
    const egaux = [
      arbre(1, 10, 10, h, "pinus_sylvestris"),
      arbre(2, 10, 10 - 0.4 * h, h, "pinus_sylvestris"),
    ];
    const { houppier, profondeurVivante } = lumieresDesArbres(egaux, () => 1);
    expect(houppier[0]).toBeLessThan(0.9);
    expect(profondeurVivante[0]).toBeLessThan(PROFONDEUR_HOUPPIER_MAX);
    expect(profondeurVivante[0]).toBeGreaterThan(0);
  });

  it("au sol, tout houppier pèse à plein, le petit comme le grand", () => {
    // Les extinctions s'additionnent : la lumière sous les deux est le produit
    // des lumières sous chacun. Depuis que l'ombre ne sature plus (#484), c'est
    // vrai partout, là où les deux ombres se recouvrent le plus aussi.
    const grand = arbre(1, 8, 8, 12);
    const petit = arbre(2, 9, 10, 6);
    const part = () => 0.3;
    const deux = computeGroundLight([grand, petit], 20, 20, part);
    const sousGrand = computeGroundLight([grand], 20, 20, part);
    const sousPetit = computeGroundLight([petit], 20, 20, part);
    let comparees = 0;
    for (let i = 0; i < deux.length; i++) {
      const a = sousGrand[i] ?? 1;
      const b = sousPetit[i] ?? 1;
      if (a >= 1 || b >= 1) continue;
      expect(deux[i]).toBeCloseTo(a * b, 12);
      comparees++;
    }
    expect(comparees).toBeGreaterThan(5);
  });
});

/**
 * La même profondeur, par dichotomie fine sur la lumière de chaque niveau : la
 * référence. L'extinction des voisins y passe telle quelle, sans plafond (#484) :
 * la référence recopiait la saturation de light.ts tant qu'elle existait.
 */
function profondeurDeReference(
  H: number,
  v: VoisinsOmbre,
  facteur: number,
  compensation: number,
  lai: number,
): number {
  const lumiere = (p: number) => {
    const y = H * (1 - p);
    let e = 0;
    for (let i = 0; i < v.n; i++) {
      const d = v.profondeurM[i] ?? 0;
      e += (v.ombre[i] ?? 0) * Math.max(0, Math.min(1, ((v.cimeM[i] ?? 0) - y) / d));
    }
    return facteur * Math.exp(-e) * Math.exp(-0.5 * lai * p);
  };
  if (lumiere(0) <= compensation) return 0;
  if (lumiere(PROFONDEUR_HOUPPIER_MAX) >= compensation) return PROFONDEUR_HOUPPIER_MAX;
  let lo = 0;
  let hi = PROFONDEUR_HOUPPIER_MAX;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (lumiere(mid) >= compensation) lo = mid;
    else hi = mid;
  }
  return lo;
}

const voisinsArb = fc
  .array(
    fc.record({
      h: fc.double({ min: 0.5, max: 40, noNaN: true }),
      part: fc.double({ min: 0.05, max: 1, noNaN: true }),
      ombre: fc.double({ min: 0, max: 4, noNaN: true }),
    }),
    { maxLength: 8 },
  )
  .map(
    (l): VoisinsOmbre => ({
      n: l.length,
      cimeM: l.map((x) => x.h),
      profondeurM: l.map((x) => x.part * PROFONDEUR_HOUPPIER_MAX * x.h),
      ombre: l.map((x) => x.ombre),
    }),
  );

describe("l'élagage naturel, niveau par niveau", () => {
  it("sans voisin, c'est la formule de la lumière uniforme", () => {
    for (const id of ["fagus_sylvatica", "pinus_sylvestris", "betula_pendula"]) {
      const { compensation, lai } = getEspece(id).lumiere;
      for (const l of [1, 0.7, 0.4, 0.3, 0.2, 0.1, 0.02]) {
        const parNiveaux = profondeurVivanteParNiveaux(16, null, l, compensation, lai);
        expect(1 - parNiveaux).toBeCloseTo(baseHouppierCible(16, l, compensation, lai) / 16, 12);
      }
    }
  });

  it("la forme fermée redonne la dichotomie fine, voisins quelconques", () => {
    fc.assert(
      fc.property(
        voisinsArb,
        fc.double({ min: 1, max: 30, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0.005, max: 0.3, noNaN: true }),
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        (v, H, facteur, compensation, lai) => {
          const p = profondeurVivanteParNiveaux(H, v, facteur, compensation, lai);
          expect(p).toBeCloseTo(profondeurDeReference(H, v, facteur, compensation, lai), 9);
        },
      ),
    );
  });

  it("un voisin de plus n'approfondit jamais le houppier", () => {
    fc.assert(
      fc.property(voisinsArb, fc.double({ min: 1, max: 30, noNaN: true }), (v, H) => {
        const { compensation, lai } = getEspece("pinus_sylvestris").lumiere;
        const avec = profondeurVivanteParNiveaux(H, v, 1, compensation, lai);
        const moins: VoisinsOmbre = { ...v, n: Math.max(0, v.n - 1) };
        const sans = profondeurVivanteParNiveaux(H, moins, 1, compensation, lai);
        expect(avec).toBeLessThanOrEqual(sans + 1e-12);
      }),
    );
  });
});
