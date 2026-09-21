/**
 * LA CLÉ D'UN PORTRAIT : ce qui vaut la peine d'être recuit (#149).
 *
 * « Voir le sprite de l'arbre » a un prix, et il se mesure : **175 ms par
 * cuisson** sur la machine d'essai, soit cinq secondes de fil principal bloqué
 * par instantané quand on redessinait quinze arbres et leurs témoins. La clé
 * est ce qui évite tout ça — elle dit si l'image a changé sans la peindre.
 *
 * Ces épreuves défendent donc les deux moitiés de la promesse : qu'elle IGNORE
 * ce qui ne se voit pas, et qu'elle SUIVE ce qui se voit.
 */

import { describe, expect, it } from "vitest";
import { cleDuPortrait } from "../../src/game/panneaux/portraits";
import type { ArbreAPoser } from "../../src/render/couches/arbres";

const POSE: ArbreAPoser = {
  id: 7,
  especeId: "quercus_pubescens",
  x: 10,
  y: 10,
  z: 0,
  heightM: 9,
  houppierRatio: 0.45,
  baseHouppierM: 2,
  partFoliaire: 1,
  senescence: 0,
  vigueur: 1,
};

const cle = (champs: Partial<ArbreAPoser> = {}) => cleDuPortrait({ ...POSE, ...champs }, 25);

describe("ce que la clé ignore", () => {
  it("dix centimètres de pousse ne valent pas une cuisson", () => {
    expect(cle({ heightM: 9.1 })).toBe(cle());
  });

  it("ni la position sur la parcelle : un portrait n'a pas de lieu", () => {
    expect(cle({ x: 80, y: 3, z: 12 })).toBe(cle());
  });
});

describe("ce que la clé suit", () => {
  it("un demi-mètre de plus, oui : c'est là que la silhouette change", () => {
    expect(cle({ heightM: 9.6 })).not.toBe(cle());
  });

  it("la vigueur, le feuillage et la cime sèche — ce qu'on vient justement voir", () => {
    expect(cle({ vigueur: 0.3 })).not.toBe(cle());
    expect(cle({ partFoliaire: 0.2 })).not.toBe(cle());
    expect(cle({ senescence: 1 })).not.toBe(cle());
    expect(cle({ dommageHydraulique: 0.8 })).not.toBe(cle());
  });

  it("et la conduite : une trogne, un manchon, une chandelle", () => {
    expect(cle({ teteTrogneM: 2, diametreTeteCm: 40, recepages: 3 })).not.toBe(cle());
    expect(cle({ protege: true })).not.toBe(cle());
    expect(cle({ chandelle: true })).not.toBe(cle());
  });
});

describe("la taille de cuisson", () => {
  it("ne dépend PAS de la hauteur de l'arbre : chaque portrait coûte pareil", () => {
    // Un zoom fixe faisait cuire un semis en 16 pixels et un chêne en 256 :
    // le premier flou, le second quatre fois trop cher pour une image de 74.
    // La taille de cuisson est le dernier champ de la clé de classe.
    const taille = (h: number) => cle({ heightM: h }).split("|").at(-3);
    expect(taille(1)).toBe(taille(20));
    expect(taille(4)).toBe(taille(12));
  });
});
