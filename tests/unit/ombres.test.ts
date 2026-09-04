/**
 * Les ombres portées.
 *
 * Ce qui compte ici, c'est que l'ombre tombe là où le MOTEUR la met : `light.ts`
 * décale l'ombre d'une couronne vers le nord de `SHADOW_NORTH_OFFSET` fois sa
 * hauteur, et c'est ce décalage exact qu'on doit retrouver au sol. Une ombre
 * dessinée ailleurs mentirait sur qui ombrage qui — le genre d'écart qui ne se
 * voit pas à l'œil et qui rend l'image fausse.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crownRadiusM, SHADOW_NORTH_OFFSET } from "../../src/engine/light";
import { type Vue, versEcranVue, vueInitiale, zoomer } from "../../src/render/camera";
import {
  APLATISSEMENT,
  type ArbreOmbre,
  DENSITES,
  indexDensite,
  MODE_ACCUMULATION,
  MODE_COMPOSITION,
  ombreDeLArbre,
  ombresAPoser,
} from "../../src/render/couches/ombres";
import { TUILE_HAUTEUR_PX, TUILE_LARGEUR_PX } from "../../src/render/projection";

const COTE = 100;

function vue(): Vue {
  return vueInitiale(COTE, 1600, 900);
}

function arbre(patch: Partial<ArbreOmbre> = {}): ArbreOmbre {
  return { x: 50, y: 50, z: 0, heightM: 10, houppierRatio: 0.3, partOmbrageante: 1, ...patch };
}

describe("où tombe l'ombre", () => {
  it("au NORD du pied, du décalage exact du moteur — aux quatre orientations", () => {
    // La propriété centrale : on reprojette et on doit retomber sur la cellule
    // que `light.ts` désigne, c'est-à-dire (x, y + 0,4 h).
    for (const o of [0, 1, 2, 3] as const) {
      const v: Vue = { ...vue(), cam: { ...vue().cam, orientation: o } };
      const a = arbre();
      const ombre = ombreDeLArbre(a, v);
      expect(ombre).toBeDefined();
      if (!ombre) return;
      const attendu = versEcranVue({ x: a.x, y: a.y + SHADOW_NORTH_OFFSET * a.heightM, z: a.z }, v);
      expect(ombre.sx).toBeCloseTo(attendu.sx, 6);
      expect(ombre.sy).toBeCloseTo(attendu.sy, 6);
    }
  });

  it("suit l'altitude du sol : une ombre sur une butte est plus haut à l'écran", () => {
    const bas = ombreDeLArbre(arbre({ z: 0 }), vue());
    const haut = ombreDeLArbre(arbre({ z: 8 }), vue());
    expect(bas).toBeDefined();
    expect(haut).toBeDefined();
    if (!bas || !haut) return;
    // « Plus haut à l'écran » veut dire un `sy` plus petit.
    expect(haut.sy).toBeLessThan(bas.sy);
  });

  it("s'éloigne du pied à mesure que l'arbre grandit", () => {
    const v = vue();
    const pied = versEcranVue({ x: 50, y: 50, z: 0 }, v);
    let precedent = 0;
    for (const h of [2, 6, 12, 20]) {
      const ombre = ombreDeLArbre(arbre({ heightM: h }), v);
      if (!ombre) throw new Error("pas d'ombre");
      const distance = Math.hypot(ombre.sx - pied.sx, ombre.sy - pied.sy);
      expect(distance).toBeGreaterThan(precedent);
      precedent = distance;
    }
  });
});

describe("la taille de l'ombre", () => {
  it("est le diamètre du houppier que le MOTEUR calcule, projeté", () => {
    const v = vue();
    const a = arbre({ heightM: 14, houppierRatio: 0.35 });
    const ombre = ombreDeLArbre(a, v);
    expect(ombre).toBeDefined();
    if (!ombre) return;
    const rayonM = crownRadiusM(a.heightM, a.houppierRatio);
    expect(ombre.largeurPx).toBeCloseTo(2 * rayonM * TUILE_LARGEUR_PX * v.cam.zoom, 6);
  });

  it("est aplatie exactement comme une tuile : un disque au sol se projette ainsi", () => {
    const ombre = ombreDeLArbre(arbre(), vue());
    if (!ombre) throw new Error("pas d'ombre");
    expect(ombre.hauteurPx / ombre.largeurPx).toBeCloseTo(APLATISSEMENT, 12);
    expect(APLATISSEMENT).toBeCloseTo(TUILE_HAUTEUR_PX / TUILE_LARGEUR_PX, 12);
  });

  it("grandit avec le zoom, proportionnellement", () => {
    const v = vue();
    const proche = zoomer(v, 4, { sx: 800, sy: 450 });
    const a = ombreDeLArbre(arbre(), v);
    const b = ombreDeLArbre(arbre(), proche);
    if (!a || !b) throw new Error("pas d'ombre");
    expect(b.largeurPx / a.largeurPx).toBeCloseTo(proche.cam.zoom / v.cam.zoom, 6);
  });
});

describe("ce qui ne porte pas d'ombre", () => {
  it("un houppier nu n'en porte aucune — un caduc de janvier ne fait pas d'ombre", () => {
    expect(ombreDeLArbre(arbre({ partOmbrageante: 0 }), vue())).toBeUndefined();
  });

  it("ni un arbre de hauteur nulle, ni une espèce sans houppier", () => {
    expect(ombreDeLArbre(arbre({ heightM: 0 }), vue())).toBeUndefined();
    expect(ombreDeLArbre(arbre({ houppierRatio: 0 }), vue())).toBeUndefined();
  });
});

describe("la densité, et pourquoi elle n'est pas une opacité", () => {
  it("choisit une tache cuite, jamais une transparence variable", () => {
    // Le mécanisme entier tient à ça : les ombres se composent en `darken`
    // (donc en MINIMUM) puis se multiplient une fois. Une opacité par ombre
    // ferait s'empiler les couches et rendrait une bouillie noire sous un
    // fourré — c'est ce que la première capture de ce lot montrait.
    expect(MODE_ACCUMULATION).toBe("darken");
    expect(MODE_COMPOSITION).toBe("multiply");
    const ombre = ombreDeLArbre(arbre({ partOmbrageante: 0.5 }), vue());
    if (!ombre) throw new Error("pas d'ombre");
    expect(Number.isInteger(ombre.densite)).toBe(true);
  });

  it("reste dans les taches cuites, quelle que soit la part ombrageante", () => {
    fc.assert(
      fc.property(fc.double({ min: -2, max: 3, noNaN: true }), (part) => {
        const d = indexDensite(part);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(DENSITES);
      }),
    );
  });

  it("croît avec la part ombrageante", () => {
    expect(indexDensite(0.1)).toBeLessThanOrEqual(indexDensite(0.5));
    expect(indexDensite(0.5)).toBeLessThanOrEqual(indexDensite(1));
    expect(indexDensite(1)).toBe(DENSITES - 1);
  });
});

describe("la liste des ombres", () => {
  it("est triée par profondeur, comme le sol et les arbres", () => {
    // Pas pour l'ombre elle-même — deux ombres qui se croisent donnent le même
    // résultat dans les deux ordres — mais pour pouvoir ENTRELACER les couches
    // au lot L2 sans retrier.
    const v = vue();
    const arbres = [
      arbre({ x: 80, y: 80 }),
      arbre({ x: 10, y: 10 }),
      arbre({ x: 50, y: 20 }),
      arbre({ x: 20, y: 50 }),
    ];
    const liste = ombresAPoser(arbres, v);
    expect(liste).toHaveLength(4);
    for (let i = 1; i < liste.length; i++) {
      expect(liste[i]?.profondeur).toBeGreaterThanOrEqual(liste[i - 1]?.profondeur ?? 0);
    }
  });

  it("laisse tomber ce qui n'a pas d'ombre, sans trou dans la liste", () => {
    const liste = ombresAPoser(
      [arbre(), arbre({ partOmbrageante: 0 }), arbre({ heightM: 0 }), arbre({ x: 20 })],
      vue(),
    );
    expect(liste).toHaveLength(2);
  });
});
