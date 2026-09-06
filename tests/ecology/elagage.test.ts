/**
 * L'élagage et la lumière (light.ts).
 *
 * `hauteurElagueeM` a longtemps existé sans peser sur l'ombrage : un arbre
 * élagué jusqu'à six mètres ombrageait exactement comme le même arbre branchu,
 * et le geste n'était qu'une écriture comptable au crédit de la bille d'œuvre.
 * Or c'est ce qui relie la sylviculture à l'agroforesterie : on élague pour le
 * bois, et on rend de la lumière au sous-étage.
 */

import { describe, expect, it } from "vitest";
import {
  computeGroundLight,
  lightAtPoint,
  PART_HOUPPIER_HAUTEUR,
  partHouppierApresElagage,
} from "../../src/engine/light";
import type { TreeState } from "../../src/engine/trees";

function arbre(hauteurElagueeM: number): TreeState {
  return {
    id: 1,
    especeId: "fagus_sylvatica", // LAI 3,5 : l'ombre la plus dense du catalogue
    x: 10,
    y: 10,
    ageWeeks: 40 * 52,
    heightM: 16,
    stress: 1,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    hauteurElagueeM,
    recepages: 0,
    rootDepthCm: 120,
    pousseTendreM: 0,
    dommageHydraulique: 0,
    vigueur: 1,
    vigueurIndividuelle: 1,
    protege: false,
  };
}

describe("la part de couronne qui reste après élagage", () => {
  it("vaut 1 tant qu'on reste sous la base naturelle du houppier", () => {
    const h = 16;
    const base = h * (1 - PART_HOUPPIER_HAUTEUR);
    expect(partHouppierApresElagage(h, 0)).toBe(1);
    expect(partHouppierApresElagage(h, base)).toBe(1);
    // Une bille de 4 m sur un arbre de 16 m n'entame pas encore la couronne :
    // ces branches-là étaient déjà mortes d'ombre.
    expect(partHouppierApresElagage(h, 4)).toBe(1);
  });

  it("décroît ensuite avec la profondeur de couronne retirée", () => {
    const h = 16;
    // Base naturelle à 6,4 m, couronne profonde de 9,6 m. Élaguer à 8 m en
    // retire 1,6 m, soit un sixième.
    expect(partHouppierApresElagage(h, 8)).toBeCloseTo(1 - 1.6 / 9.6, 6);
    // Le plafond d'élagage étant la moitié de la hauteur, on ne descend
    // jamais en dessous de ce point-là.
    expect(partHouppierApresElagage(h, h / 2)).toBeGreaterThan(0.7);
  });

  it("s'atténue quand l'arbre grandit : il regagne sa couronne", () => {
    // Même bille de 8 m, deux hauteurs. Le grand a retrouvé sa couronne.
    const jeune = partHouppierApresElagage(14, 8);
    const grand = partHouppierApresElagage(24, 8);
    expect(grand).toBeGreaterThan(jeune);
    expect(grand).toBe(1);
  });
});

describe("un arbre élagué fait moins d'ombre en dessous", () => {
  it("éclaircit son propre pied", () => {
    const branchu = lightAtPoint([arbre(0)], 10, 10 + 0.4 * 16, () => 1);
    const elague = lightAtPoint([arbre(8)], 10, 10 + 0.4 * 16, () => 1);
    expect(elague).toBeGreaterThan(branchu);
    // L'effet est net sans être un coup de gomme : on retire un sixième de la
    // profondeur de couronne, pas la couronne.
    expect(elague / branchu).toBeGreaterThan(1.05);
    expect(elague / branchu).toBeLessThan(1.5);
  });

  it("ne change RIEN tant que la bille reste sous la couronne", () => {
    const branchu = lightAtPoint([arbre(0)], 10, 10 + 0.4 * 16, () => 1);
    const bille = lightAtPoint([arbre(4)], 10, 10 + 0.4 * 16, () => 1);
    expect(bille).toBe(branchu);
  });

  it("ne déplace ni n'élargit l'ombre : seule sa densité change", () => {
    const dims = { widthM: 24, heightM: 24 };
    const sombre = computeGroundLight([arbre(0)], dims.widthM, dims.heightM, () => 1);
    const clair = computeGroundLight([arbre(8)], dims.widthM, dims.heightM, () => 1);
    // Mêmes cellules touchées — le rendu n'a rien de nouveau à dessiner, son
    // ombre portée suit `crownRadiusM`, qui ne bouge pas.
    const ombrees = (g: number[]) => g.map((v) => v < 0.999).join("");
    expect(ombrees(clair)).toBe(ombrees(sombre));
    // Et partout où il y a de l'ombre, elle est plus claire.
    for (let i = 0; i < sombre.length; i++) {
      expect(clair[i] ?? 0).toBeGreaterThanOrEqual(sombre[i] ?? 0);
    }
  });
});
