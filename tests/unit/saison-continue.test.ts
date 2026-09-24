/**
 * **La saison court sans faire recuire** (#163, débloqué par #164).
 *
 * Un hêtre gagne 51 % de sa part foliaire en un pas de temps : c'est la
 * résolution hebdomadaire du moteur, pas une quantification du rendu. Le
 * moteur livre maintenant sa phénologie à un instant intermédiaire, et le
 * rendu peut donc étaler la marche sur la semaine au lieu de l'empiler sur une
 * image.
 *
 * **Mais la classe de vignette est quantifiée, et c'est là qu'est le piège.**
 * Remplacer l'arbre à chaque image ferait croire à la scène — qui compare des
 * références — que tout a changé, et ferait recuire l'atlas soixante fois par
 * seconde pour une image identique. C'est exactement ce que le §5.11 interdit.
 * D'où la règle que ces épreuves tiennent : on ne remplace qu'au
 * **franchissement** de palier.
 */

import { describe, expect, it } from "vitest";
import { appliquerLesActes, type SaisonDUneEssence } from "../../src/game/VueParcelle";
import type { ArbreAPoser } from "../../src/render/couches/arbres";
import { PALIERS_FEUILLAGE, palierDe } from "../../src/render/couches/arbres";
import type { EtatMourant } from "../../src/render/temps/mort";

const arbre = (id: number, partFoliaire: number, senescence = 0): ArbreAPoser => ({
  id,
  especeId: "fagus_sylvatica",
  x: 10,
  y: 10,
  z: 0,
  heightM: 12,
  houppierRatio: 0.4,
  baseHouppierM: 3,
  partFoliaire,
  senescence,
  vigueur: 1,
});

/** Un état de mourant complet : le type en demande plus que les trois valeurs. */
const mourantA = (partFoliaire: number, senescence: number, vigueur: number): EtatMourant => ({
  partFoliaire,
  senescence,
  vigueur,
  dommageHydraulique: 0.5,
  chandelle: false,
  opacite: 1,
  hauteur: 1,
});

const saisonA = (partFoliaire: number, senescence = 0) => {
  const table = new Map<string, SaisonDUneEssence>([
    ["fagus_sylvatica", { partFoliaire, senescence }],
  ]);
  return () => table;
};

describe("la saison ne recuit qu'au franchissement", () => {
  it("rend le tableau D'ORIGINE tant qu'on reste dans le palier", () => {
    // La propriété qui compte : l'**identité** du tableau. La scène s'en sert pour
    // décider quoi recuire ; un tableau neuf par image lui ferait tout refaire.
    const arbres = [arbre(1, 0.5)];
    const memePalier = 0.5 + 0.5 / PALIERS_FEUILLAGE / 2;
    expect(palierDe(memePalier, PALIERS_FEUILLAGE)).toBe(palierDe(0.5, PALIERS_FEUILLAGE));
    expect(appliquerLesActes(arbres, undefined, undefined, saisonA(memePalier), 0)).toBe(arbres);
  });

  it("remplace quand le palier change, et seulement l'arbre concerné", () => {
    const arbres = [arbre(1, 0.1), arbre(2, 0.9)];
    // 0,1 et 0,9 ne sont pas dans le même palier : une saison à 0,9 déplace le
    // premier et laisse le second tranquille.
    const sortie = appliquerLesActes(arbres, undefined, undefined, saisonA(0.9), 0);
    expect(sortie).not.toBe(arbres);
    expect(sortie[0]).not.toBe(arbres[0]);
    expect(sortie[0]?.partFoliaire).toBe(0.9);
    expect(sortie[1]).toBe(arbres[1]);
  });

  it("suit aussi la sénescence, qui fait l'automne", () => {
    const arbres = [arbre(1, 0.9, 0)];
    const sortie = appliquerLesActes(arbres, undefined, undefined, saisonA(0.9, 0.9), 0);
    expect(sortie[0]?.senescence).toBe(0.9);
    // Et la part foliaire suit avec, même si c'est elle qui n'a pas bougé :
    // les deux vont ensemble dans la classe.
    expect(sortie[0]?.partFoliaire).toBe(0.9);
  });

  it("ne touche pas une essence que la table ne nomme pas", () => {
    const arbres = [{ ...arbre(1, 0.1), especeId: "betula_pendula" }];
    expect(appliquerLesActes(arbres, undefined, undefined, saisonA(0.9), 0)).toBe(arbres);
  });

  it("sans saison ni acte, rien n'est recopié", () => {
    const arbres = [arbre(1, 0.5)];
    expect(appliquerLesActes(arbres, undefined, undefined, undefined, 0)).toBe(arbres);
  });

  it("une table vide ne fabrique pas de tableau neuf", () => {
    // Le cas de la première semaine d'une partie : pas de semaine précédente,
    // donc rien à interpoler.
    const arbres = [arbre(1, 0.5)];
    const vide = () => undefined;
    expect(appliquerLesActes(arbres, undefined, undefined, vide, 0)).toBe(arbres);
  });

  it("combien de franchissements sur un débourrement complet", () => {
    // Le gain se chiffre : une part foliaire qui passe de 0 à 1 en une semaine
    // traverse tous les paliers. Empilés sur une image, c'est **une** marche de
    // 100 % ; répartis sur la semaine, c'est autant de marches que de paliers.
    let arbres: readonly ArbreAPoser[] = [arbre(1, 0)];
    let franchissements = 0;
    for (let i = 1; i <= 60; i++) {
      const suite = appliquerLesActes(arbres, undefined, undefined, saisonA(i / 60), 0);
      if (suite !== arbres) franchissements++;
      arbres = suite;
    }
    expect(franchissements).toBe(PALIERS_FEUILLAGE - 1);
    // Et l'arbre reste sur la valeur du **dernier** franchissement, pas sur 1 :
    // au-delà, la saison est dans le même palier et ne remplace plus rien.
    expect(arbres[0]?.partFoliaire).toBeCloseTo((PALIERS_FEUILLAGE - 1) / PALIERS_FEUILLAGE, 6);
  });

  it("au bout de la semaine, l'arbre reprend la valeur du moteur", () => {
    // C'est pour ça que le canal rend `undefined` à `t = 1` (`useEllipse`) :
    // sinon l'arbre resterait sur la valeur du dernier franchissement — une
    // grandeur que le moteur n'a jamais dite, et que l'ombre portée lit.
    const arbres = [arbre(1, 1)];
    const traverse = appliquerLesActes(arbres, undefined, undefined, saisonA(0.1), 0);
    expect(traverse[0]?.partFoliaire).toBe(0.1);
    const arrivee = appliquerLesActes(traverse, undefined, undefined, () => undefined, 0);
    expect(arrivee).toBe(traverse);
    // Le tableau de l'instantané, lui, n'a jamais été modifié : c'est lui que
    // la vue repasse à l'image suivante.
    expect(arbres[0]?.partFoliaire).toBe(1);
  });
});

/**
 * La réécriture en copie paresseuse touche un chemin délicat : celui des morts
 * et des gestes, qui n'avait pas d'essai à lui parce que la fonction était
 * privée. Ces épreuves sont le filet qui manquait.
 */
describe("les autres canaux, après la réécriture en copie paresseuse", () => {
  it("un mourant est remplacé, ses voisins gardent leur objet", () => {
    const arbres = [arbre(1, 1), arbre(2, 1)];
    const sortie = appliquerLesActes(
      arbres,
      (id) => (id === 1 ? mourantA(0.2, 0.8, 0.1) : undefined),
      undefined,
      undefined,
      0,
    );
    expect(sortie).not.toBe(arbres);
    expect(sortie[0]?.partFoliaire).toBe(0.2);
    expect(sortie[0]?.vigueur).toBe(0.1);
    // L'identité du **voisin** est la propriété qui compte : la scène s'en sert
    // pour ne pas le recuire.
    expect(sortie[1]).toBe(arbres[1]);
  });

  it("un geste qui remodèle passe, même sans personne qui meurt", () => {
    const arbres = [arbre(1, 1)];
    const sortie = appliquerLesActes(arbres, undefined, () => ({ heightM: 3 }), undefined, 0);
    expect(sortie).not.toBe(arbres);
    expect(sortie[0]?.heightM).toBe(3);
    // L'original n'est pas modifié : c'est lui que la vue repasse ensuite.
    expect(arbres[0]?.heightM).toBe(12);
  });

  it("un rappel qui ne rend rien ne fabrique pas de tableau", () => {
    const arbres = [arbre(1, 1), arbre(2, 1)];
    expect(
      appliquerLesActes(
        arbres,
        () => undefined,
        () => undefined,
        undefined,
        0,
      ),
    ).toBe(arbres);
  });

  it("saison et mort se composent sur le même arbre", () => {
    const arbres = [arbre(1, 0.1)];
    const sortie = appliquerLesActes(
      arbres,
      () => mourantA(0.05, 0.9, 0),
      undefined,
      saisonA(0.9),
      0,
    );
    // La mort a le dernier mot sur la part foliaire — elle vient après — et
    // l'arbre n'a été copié qu'une fois.
    expect(sortie[0]?.partFoliaire).toBe(0.05);
    expect(sortie[0]?.senescence).toBe(0.9);
  });
});
