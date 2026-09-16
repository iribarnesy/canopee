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
  MODE_ACCUMULATION_GPU,
  MODE_COMPOSITION,
  MODE_LIMITE,
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
  it("**s'étend du PIED jusqu'au décalage exact du moteur — aux quatre orientations**", () => {
    // La propriété centrale, et elle a changé de forme sans changer de fond.
    // L'ombre n'est plus un disque CENTRÉ sur la cellule que `light.ts` désigne
    // — c'est-à-dire (x, y + 0,4 h) — mais le balayage du houppier entre le
    // pied de l'arbre et cette cellule-là. Le décalage du moteur reste donc lu
    // au pixel près : il place l'EXTRÉMITÉ au lieu du milieu.
    //
    // Le disque centré au loin était ce qui faisait flotter les arbres : son
    // bord n'atteignait jamais le tronc, et on voyait un arbre, un trou de
    // lumière, puis une tache sans rapport visible avec lui.
    for (const o of [0, 1, 2, 3] as const) {
      const v: Vue = { ...vue(), cam: { ...vue().cam, orientation: o } };
      const a = arbre();
      const ombre = ombreDeLArbre(a, v);
      expect(ombre).toBeDefined();
      if (!ombre) return;
      const pied = versEcranVue({ x: a.x, y: a.y, z: a.z }, v);
      const cible = versEcranVue({ x: a.x, y: a.y + SHADOW_NORTH_OFFSET * a.heightM, z: a.z }, v);
      // Le centre est à mi-chemin des deux.
      expect(ombre.sx).toBeCloseTo((pied.sx + cible.sx) / 2, 6);
      expect(ombre.sy).toBeCloseTo((pied.sy + cible.sy) / 2, 6);
    }
  });

  it("**couvre le pied de l'arbre : c'est ce qui le pose au sol**", () => {
    // Le test qui garde fermé le défaut « l'arbre flotte ». Quelle que soit
    // l'orientation, le pied du tronc doit tomber DANS l'ellipse — sinon il n'y
    // a rien qui relie l'arbre à son ombre, et l'œil lit un collage.
    for (const o of [0, 1, 2, 3] as const) {
      const v: Vue = { ...vue(), cam: { ...vue().cam, orientation: o } };
      const a = arbre({ heightM: 16, houppierRatio: 0.3 });
      const ombre = ombreDeLArbre(a, v);
      if (!ombre) throw new Error("pas d'ombre");
      const pied = versEcranVue({ x: a.x, y: a.y, z: a.z }, v);
      const u = (pied.sx - ombre.sx) / (ombre.largeurPx / 2);
      const w = (pied.sy - ombre.sy) / (ombre.hauteurPx / 2);
      expect(u * u + w * w, `orientation ${o}`).toBeLessThan(1);
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
  it("part du diamètre du houppier que le MOTEUR calcule, allongé du balayage", () => {
    // La largeur n'est plus le seul diamètre : c'est l'enveloppe du disque
    // balayé du pied jusqu'au point d'ombre. L'invariant garde le diamètre
    // comme SOCLE — c'est toujours `crownRadiusM` qui commande la taille — et y
    // ajoute exactement la course, ni plus ni moins.
    const v = vue();
    const a = arbre({ heightM: 14, houppierRatio: 0.35 });
    const ombre = ombreDeLArbre(a, v);
    expect(ombre).toBeDefined();
    if (!ombre) return;
    const rayonM = crownRadiusM(a.heightM, a.houppierRatio);
    const diametrePx = 2 * rayonM * TUILE_LARGEUR_PX * v.cam.zoom;
    const pied = versEcranVue({ x: a.x, y: a.y, z: a.z }, v);
    const cible = versEcranVue({ x: a.x, y: a.y + SHADOW_NORTH_OFFSET * a.heightM, z: a.z }, v);
    expect(ombre.largeurPx).toBeCloseTo(diametrePx + Math.abs(cible.sx - pied.sx), 6);
    expect(ombre.hauteurPx).toBeCloseTo(
      diametrePx * APLATISSEMENT + Math.abs(cible.sy - pied.sy),
      6,
    );
  });

  it("un houppier plus large fait une ombre plus large, à hauteur égale", () => {
    // Ce que l'invariant précédent garantit sur le fond : la taille de l'ombre
    // suit le houppier du moteur. Une course identique — même hauteur, même
    // décalage — et pourtant deux ombres différentes, parce que les deux
    // houppiers le sont.
    const v = vue();
    const etroit = ombreDeLArbre(arbre({ heightM: 14, houppierRatio: 0.2 }), v);
    const large = ombreDeLArbre(arbre({ heightM: 14, houppierRatio: 0.5 }), v);
    if (!etroit || !large) throw new Error("pas d'ombre");
    expect(large.largeurPx).toBeGreaterThan(etroit.largeurPx);
    expect(large.hauteurPx).toBeGreaterThan(etroit.hauteurPx);
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

describe("le mode d'accumulation tient sur un GPU", () => {
  it("**le mode GPU est un mode de BASE, jamais un mode avancé**", () => {
    // Le défaut, et il ne se voyait que dans la vue Pixi : un escalier de
    // rectangles sombres le long du bord de la parcelle, absent de la même
    // scène passée par le compositeur Canvas. Une ablation l'a désigné — en
    // sautant les taches, les rectangles disparaissaient, et chacun avait sa
    // tache ronde inscrite dedans : c'était le QUAD de la tache qui
    // s'assombrissait, pas son disque.
    //
    // La cause est la classification des modes de fusion. `darken` est un mode
    // AVANCÉ : Pixi l'implémente par un shader qui doit lire le fond déjà
    // dessiné. Dans une `RenderTexture` rendue avec `clear: true`, cette
    // lecture ne trouve pas le rectangle blanc posé juste avant dans la même
    // passe, et `min(blanc, noir)` vaut noir sur tout le quad. Le carré blanc
    // qui entoure le disque, neutre en Canvas 2D, devenait une tache carrée.
    //
    // Les modes ci-dessous se traduisent directement en équation de mélange
    // OpenGL, sans shader ni lecture de fond. En sortir, c'est réintroduire le
    // défaut — et il ne se verra dans aucun essai de rendu Canvas.
    const modesDeBase = ["normal", "add", "multiply", "screen", "min", "max", "none"];
    expect(modesDeBase).toContain(MODE_ACCUMULATION_GPU);
  });

  it("dit la même chose que le mode Canvas : garder le minimum", () => {
    // `min` et `darken` sont la même opération. Ce qui les sépare est la façon
    // dont le moteur de rendu la réalise, pas ce qu'elle calcule — et c'est
    // pour ça que les deux constantes doivent rester couplées : si l'une passe
    // à autre chose que « garder le minimum », l'autre ment.
    expect(MODE_ACCUMULATION).toBe("darken");
    expect(MODE_ACCUMULATION_GPU).toBe("min");
  });

  it("**`multiply` ne convient pas, et c'est mesuré, pas supposé**", () => {
    // Il est pourtant de base, et il fait bien disparaître les rectangles. Mais
    // il COMPOSE au lieu de saturer : sous une lisière où les houppiers se
    // recouvrent, la capture montrait le sol viré au noir et le liseré sableux
    // du bord effacé. C'est le puits d'encre que la saturation existe pour
    // éviter, et `MODE_COMPOSITION` l'emploie déjà pour la passe finale — une
    // seule fois, ce qui est tout l'intérêt.
    expect(MODE_ACCUMULATION_GPU).not.toBe(MODE_COMPOSITION);
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

describe("les ombres s'arrêtent au terrain", () => {
  it("le masque est découpé en `destination-in` avant d'être multiplié", () => {
    // Le défaut qu'on corrige : un arbre du bord projetait son ombre sur le
    // CIEL, et la parcelle avait une frange grise qui la faisait flotter.
    // Découper le masque à la silhouette du sol règle le cas de n'importe quel
    // bord, y compris irrégulier, sans avoir à le décrire.
    expect(MODE_LIMITE).toBe("destination-in");
  });

  it("une ombre PEUT tomber hors parcelle — c'est la composition qui la borne", () => {
    // On ne la supprime pas au calcul : un arbre du bord nord a bien une ombre
    // qui sort, et le jour où il y aura un décor derrière, elle doit s'y poser.
    const v = vue();
    const auBord = ombreDeLArbre(arbre({ x: 50, y: COTE - 0.5, heightM: 20 }), v);
    expect(auBord).toBeDefined();
    if (!auBord) return;
    const limite = versEcranVue({ x: 50, y: COTE, z: 0 }, v);
    // Le soleil est au sud : l'ombre part vers le nord, donc au-delà du bord.
    // Dans cette projection `sy` croît avec `x + y` : aller vers le nord fait
    // DESCENDRE à l'écran, donc la tache est plus bas que la limite.
    expect(auBord.sy).toBeGreaterThan(limite.sy);
  });
});
