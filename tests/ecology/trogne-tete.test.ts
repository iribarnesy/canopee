/**
 * La tête d'une trogne (trogne.ts, critères H8 et J3).
 *
 * `trees.ts` annonçait depuis le début que « la tête grossit, se creuse, et
 * c'est ce creux qui fait sa valeur pour la faune ». Rien ne le portait :
 * l'état comptait les étêtages, jamais une dimension. `biodiversite.ts` en
 * tirait pourtant une conséquence, avec un seuil binaire à deux étêtages —
 * si bien qu'un têtard de trois coupes valait un têtard centenaire.
 */

import { describe, expect, it } from "vitest";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import type { TreeState } from "../../src/engine/trees";
import {
  CAVITE_HABITAT_L,
  CAVITE_PART_MAX,
  CAVITE_PLEINE_ETETAGES,
  DIAMETRE_TETE_MAX_CM,
  diametreTeteCm,
  partHabitatDeTrogne,
  volumeCaviteL,
  volumeTeteL,
} from "../../src/engine/trogne";

/**
 * `avecTete: false` fait un arbre RECÉPÉ : il a été rabattu, mais au ras du
 * sol et non sur un tronc conservé — pas de tête, donc pas de cavité.
 *
 * Le drapeau plutôt qu'un `teteTrogneM` optionnel : passer `undefined` à un
 * paramètre qui a une valeur par défaut déclenche la valeur par défaut, et le
 * « têtard sans tête » redevenait un têtard sans que rien ne le dise.
 */
function tetard(recepages: number, avecTete = true): TreeState {
  return {
    id: 1,
    especeId: "salix_alba",
    x: 5,
    y: 5,
    ageWeeks: 60 * 52,
    heightM: 6,
    stress: 1,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    hauteurElagueeM: 0,
    recepages,
    teteTrogneM: avecTete ? 2 : undefined,
    rootDepthCm: 100,
    pousseTendreM: 0,
    dommageHydraulique: 0,
    vigueur: 1,
    vigueurIndividuelle: 1,
    protege: false,
  };
}

describe("la tête grossit à chaque étêtage", () => {
  it("n'existe pas sans étêtage", () => {
    expect(diametreTeteCm(tetard(0, false))).toBe(0);
    expect(volumeTeteL(tetard(0, false))).toBe(0);
    // Un arbre recépé n'est pas un têtard : pas de tête, donc pas de cavité.
    expect(volumeCaviteL(tetard(4, false))).toBe(0);
  });

  it("croît, et plafonne", () => {
    const diametres = [1, 2, 5, 10, 20].map((r) => diametreTeteCm(tetard(r)));
    for (let i = 1; i < diametres.length; i++) {
      expect(diametres[i] ?? 0).toBeGreaterThanOrEqual(diametres[i - 1] ?? 0);
    }
    // Une tête finit par se fendre : elle ne gonfle pas indéfiniment.
    expect(diametreTeteCm(tetard(200))).toBe(DIAMETRE_TETE_MAX_CM);
  });

  it("donne les ordres de grandeur d'un têtard réel", () => {
    // Une tête neuve : quelques litres. Un saule centenaire : des centaines.
    expect(volumeTeteL(tetard(1))).toBeGreaterThan(5);
    expect(volumeTeteL(tetard(1))).toBeLessThan(15);
    expect(volumeTeteL(tetard(20))).toBeGreaterThan(500);
  });
});

describe("le creux vient après la plaie", () => {
  it("une seule coupe ne creuse rien", () => {
    // Une plaie n'est pas encore un creux : il faut que le bois de cœur mis à
    // nu ait le temps de pourrir.
    expect(volumeCaviteL(tetard(1))).toBe(0);
  });

  it("se creuse ensuite, jusqu'à une part du volume et pas au-delà", () => {
    expect(volumeCaviteL(tetard(3))).toBeGreaterThan(0);
    expect(volumeCaviteL(tetard(6))).toBeGreaterThan(volumeCaviteL(tetard(3)));
    const pleine = tetard(CAVITE_PLEINE_ETETAGES);
    expect(volumeCaviteL(pleine)).toBeCloseTo(volumeTeteL(pleine) * CAVITE_PART_MAX, 6);
    // L'aubier vivant reste debout tout autour : la cavité ne prend pas tout.
    const tresVieux = tetard(40);
    expect(volumeCaviteL(tresVieux)).toBeCloseTo(volumeTeteL(tresVieux) * CAVITE_PART_MAX, 6);
  });

  it("l'écart entre un jeune têtard et un vieux se compte en dizaines de fois", () => {
    // C'est l'écart que le seuil binaire écrasait à zéro : le rapport dit
    // qui peut nicher — une mésange se contente de peu, une chevêche non.
    const jeune = volumeCaviteL(tetard(3));
    const vieux = volumeCaviteL(tetard(20));
    expect(vieux / jeune).toBeGreaterThan(20);
  });
});

describe("la biodiversité lit des litres, plus un oui/non", () => {
  it("un têtard vaut l'arbre-habitat entier seulement quand son creux le vaut", () => {
    expect(partHabitatDeTrogne(tetard(1))).toBe(0);
    expect(partHabitatDeTrogne(tetard(3))).toBeLessThan(1);
    expect(volumeCaviteL(tetard(20))).toBeGreaterThan(CAVITE_HABITAT_L);
    expect(partHabitatDeTrogne(tetard(20))).toBe(1);
  });

  it("la note distingue enfin trois coupes de quinze", () => {
    // Le seuil d'avant (`recepages >= 2`) leur donnait exactement la même.
    const jeune = indiceBiodiversite([tetard(3)], 0, 0.1).grosArbres;
    const vieux = indiceBiodiversite([tetard(15)], 0, 0.1).grosArbres;
    expect(vieux).toBeGreaterThan(jeune);
  });

  it("ne compte pas deux fois un gros arbre qui est aussi une trogne", () => {
    const grosTetard = { ...tetard(20), heightM: 18 } as TreeState;
    const grosSimple = { ...tetard(0, false), heightM: 18 } as TreeState;
    expect(indiceBiodiversite([grosTetard], 0, 0.1).grosArbres).toBe(
      indiceBiodiversite([grosSimple], 0, 0.1).grosArbres,
    );
  });
});
