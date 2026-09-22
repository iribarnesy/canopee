/**
 * LA RÈGLE DE RÉCOLTE COMPARAIT DEUX GRANDEURS DIFFÉRENTES (#191).
 *
 * Le constat : le journal d'une partie de treize ans ne montrait qu'une récolte
 * par an, toujours de la ronce, alors que treize pommiers vivants portaient
 * jusqu'à 115 kg en semaine 39.
 *
 * La cause, et elle est invisible à la lecture : ce qu'on CUEILLE se filtre à
 * `SEUIL_ARBRE_KG` par pied, ce à quoi on le COMPARAIT additionnait tous les
 * arbres sans seuil. Les miettes d'un sous-bois de ronces — vingt-huit kilos,
 * jamais cueillables — tenaient le compteur en l'air toute l'année.
 *
 * Ces essais tiennent la règle par ses deux bouts, et l'un d'eux rejoue
 * exprès le défaut : si quelqu'un remettait un jour le total brut d'un côté de
 * la comparaison, il échouerait.
 *
 * Deux d'entre eux gardent la trace d'une conclusion trop rapide que j'avais
 * tirée en chemin — que le front confisquait la récolte pour une raison de
 * calendrier. Ils la contredisent, et c'est pour ça qu'ils restent.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import {
  type ArbrePorteur,
  arbresMurs,
  fautIlCueillir,
  fautIlPrevenir,
  SEUIL_ARBRE_KG,
  SEUIL_PARCELLE_KG,
} from "../../src/game/recolteAuto";

/** Les semaines de récolte viennent de l'atlas, pas d'un chiffre écrit ici. */
const fruitsDe = (id: string) => {
  const f = getEspece(id).fruits;
  if (!f) throw new Error(`${id} n'a pas de fiche de fruits`);
  return f;
};
const RONCE = fruitsDe("rubus_fruticosus");
const POMMIER = fruitsDe("malus_domestica");

/**
 * Une parcelle avec de la ronce et des pommiers, rejouée de la semaine 30 à la
 * 48. Chaque essence porte pendant SA fenêtre, et rien en dehors — c'est ce que
 * le moteur fait (`tick.ts` pose `fruitsKg` à `recolteWeek` et le remet à zéro
 * à `recolteWeek + fenetreRecolteWeeks`).
 */
function saison(cueillies: Set<number>): (semaine: number) => ArbrePorteur[] {
  return (semaine) =>
    [
      { id: 1, espece: RONCE, kg: 40 },
      { id: 2, espece: POMMIER, kg: 30 },
    ].map(({ id, espece, kg }) => {
      const dansLaFenetre =
        semaine >= espece.recolteWeek && semaine < espece.recolteWeek + espece.fenetreRecolteWeeks;
      return {
        id,
        alive: true,
        fruitsKg: dansLaFenetre && !cueillies.has(id) ? kg : 0,
      };
    });
}

/** Rejoue la saison sous une règle donnée, et rend ce qui a été cueilli. */
function rejouer(regle: (kg: number, kgAvant: number) => boolean): Set<number> {
  const cueillies = new Set<number>();
  const parcelle = saison(cueillies);
  let kgAvant = 0;
  for (let semaine = 30; semaine <= 48; semaine++) {
    const murs = arbresMurs(parcelle(semaine));
    if (regle(murs.kg, kgAvant)) for (const id of murs.ids) cueillies.add(id);
    kgAvant = arbresMurs(parcelle(semaine)).kg;
  }
  return cueillies;
}

describe("les arbres mûrs", () => {
  it("écarte les morts et ce qui ne vaut pas le geste", () => {
    const arbres: ArbrePorteur[] = [
      { id: 1, alive: true, fruitsKg: 12 },
      { id: 2, alive: false, fruitsKg: 40 },
      { id: 3, alive: true, fruitsKg: SEUIL_ARBRE_KG },
      { id: 4, alive: true, fruitsKg: 8 },
    ];
    const murs = arbresMurs(arbres);
    expect(murs.ids).toEqual([1, 4]);
    expect(murs.kg).toBe(20);
  });

  it("ne rend rien sur une parcelle sans fruits", () => {
    expect(arbresMurs([{ id: 1, alive: true, fruitsKg: 0 }])).toEqual({ ids: [], kg: 0 });
  });
});

describe("une saison à deux essences", () => {
  it("les deux se cueillent, chacune dans sa fenêtre", () => {
    // La ronce mûrit en semaine 34, le pommier en 38 : deux fenêtres qui ne se
    // touchent pas, et pourtant l'une masquait l'autre.
    expect(RONCE.recolteWeek).toBeLessThan(POMMIER.recolteWeek);
    expect(rejouer((kg) => fautIlCueillir(kg))).toEqual(new Set([1, 2]));
  });

  it("le front les cueille toutes DEUX quand le calendrier seul est en jeu", () => {
    // Cet essai a servi à ÉCARTER une conclusion trop rapide : j'avais accusé
    // le chevauchement des fenêtres de récolte. Avec ces deux essences-là, la
    // cueillette de la semaine 35 vide la parcelle et remet le compte à zéro,
    // donc le front remonte sans difficulté pour les pommes de la semaine 38.
    // Le calendrier n'y était pour rien : c'est l'asymétrie des deux mesures,
    // éprouvée plus bas, qui privait le jeu de ses pommes.
    expect(rejouer((kg, kgAvant) => kg > 1 && kgAvant <= 1)).toEqual(new Set([1, 2]));
  });
});

describe("la même mesure des deux côtés (#191)", () => {
  /**
   * Le vrai défaut, et il est invisible à la lecture : ce qu'on CUEILLE se
   * filtre à `SEUIL_ARBRE_KG` par pied, ce à quoi on le COMPARAIT ne se
   * filtrait pas. Sur une parcelle où des milliers de ronces portent chacune
   * quelques grammes, le résidu tenait le total au-dessus du seuil toute
   * l'année : le front ne retombait jamais, et plus rien n'était cueilli après
   * la première essence mûre.
   *
   * Mesuré en jeu avant correction : 115 kg de pommes sur l'arbre en semaine
   * 39, comparés à un « précédent » de 28 kg de miettes de ronce.
   */
  const MIETTES: ArbrePorteur[] = Array.from({ length: 200 }, (_, i) => ({
    id: 1000 + i,
    alive: true,
    fruitsKg: 0.14,
  }));

  it("les miettes pèsent lourd ensemble et ne se cueillent pas une par une", () => {
    const brut = MIETTES.reduce((s, t2) => s + t2.fruitsKg, 0);
    expect(brut).toBeGreaterThan(SEUIL_PARCELLE_KG);
    // …et pourtant il n'y a rien à cueillir : chaque pied est sous le seuil.
    expect(arbresMurs(MIETTES).kg).toBe(0);
    expect(arbresMurs(MIETTES).ids).toEqual([]);
  });

  it("comparé à la BONNE grandeur, le front se lève pour l'essence suivante", () => {
    const pommiers: ArbrePorteur[] = [{ id: 1, alive: true, fruitsKg: 115 }];
    const parcelle = [...MIETTES, ...pommiers];
    // La semaine d'avant : rien de cueillable, seulement des miettes.
    const precedentJuste = arbresMurs(MIETTES).kg;
    expect(fautIlPrevenir(arbresMurs(parcelle).kg, precedentJuste)).toBe(true);
  });

  it("comparé au total BRUT, il ne se lève jamais — c'est ce qui se passait", () => {
    const pommiers: ArbrePorteur[] = [{ id: 1, alive: true, fruitsKg: 115 }];
    const parcelle = [...MIETTES, ...pommiers];
    const precedentBrut = MIETTES.reduce((s, t2) => s + t2.fruitsKg, 0);
    expect(fautIlPrevenir(arbresMurs(parcelle).kg, precedentBrut)).toBe(false);
  });
});

describe("prévenir n'est pas cueillir", () => {
  it("le front reste pour la pause : on ne prévient qu'à l'arrivée d'une maturité", () => {
    expect(fautIlPrevenir(40, 0)).toBe(true);
    // La semaine suivante, la même maturité dure : plus d'avis.
    expect(fautIlPrevenir(40, 40)).toBe(false);
  });

  it("ne prévient pas pour une miette", () => {
    expect(fautIlPrevenir(0.8, 0)).toBe(false);
    expect(fautIlCueillir(0.8)).toBe(false);
  });
});
