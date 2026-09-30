/**
 * **Où poser un habitant sur la parcelle** (#255, le rendu de #187).
 *
 * Le moteur ancre chaque individu à un arbre et donne la position du gîte en
 * mètres ; il ne reste qu'à dire **à quelle hauteur** le poser et **de quelle
 * couleur**. Rien n'est calculé ici qui le soit ailleurs : la position vient de
 * `IndividuFaune`, la famille de gîte vient de la fiche d'espèce.
 *
 * **Une présence, pas un changement.** Le calque des changements pointe ce qui
 * vient d'arriver et s'accumule ; celui-ci montre ce qui **est là** et disparaît
 * quand l'habitant s'en va. C'est pourquoi le glyphe est une forme pleine et
 * non un trait (`marqueurs.ts`).
 *
 * Module **pur** : pas de Pixi, pas de DOM.
 */

import { especeFaune, type IndividuFaune, type TypeDeGite } from "../../engine/faune";
import type { Teinte } from "../palette";

/** Un gîte occupé, prêt à poser. */
export interface GiteOccupe {
  /** position en mètres de parcelle */
  x: number;
  y: number;
  /** hauteur du gîte au-dessus du sol, m */
  hauteurM: number;
  teinte: Teinte;
}

/**
 * La teinte de chaque famille de gîte.
 *
 * **La matière, pas une gravité** — la même règle que les teintes de mort : un
 * habitant n'est ni une bonne ni une mauvaise nouvelle, c'est un fait de la
 * parcelle. On nomme donc ce qu'on voit : le noir d'un trou d'entrée, le roux
 * d'un fagot de branches, le gris-blanc d'une grande aire, le brun-rouge du
 * bois de cœur, l'ivoire d'une chandelle sèche.
 */
const TEINTE_DU_GITE: Record<TypeDeGite, Teinte> = {
  cavite: { r: 90, g: 108, b: 150 },
  hutte: { r: 176, g: 120, b: 66 },
  aire: { r: 206, g: 206, b: 196 },
  boisDeCoeur: { r: 152, g: 84, b: 72 },
  chandelle: { r: 214, g: 200, b: 160 },
};

/**
 * Où le gîte se pose sur l'arbre, en mètres.
 *
 * **La hauteur de la fiche est un minimum, pas une position** (`hauteurGiteMinM`
 * — « hauteur minimale du gîte au-dessus du sol »), et il ne faut pas la
 * prendre pour l'autre : une mésange accepte à partir de deux mètres et niche
 * bien plus haut. Faute d'une hauteur exacte, on pose le gîte aux deux tiers de
 * l'arbre — là où sont les fourches et les vieilles loges — sans jamais
 * descendre sous ce que l'espèce exige.
 *
 * **Ce que ça vaut est dit ici plutôt que caché** : c'est un placement de
 * rendu, pas une donnée du moteur. S'il devient gênant, c'est une hauteur de
 * gîte qu'il faudra demander à `faune.ts`, pas une formule à raffiner ici.
 */
export const PART_DE_LA_HAUTEUR = 0.66;

/**
 * La hauteur du gîte sur un arbre de `hauteurArbreM`, m : aux deux tiers, sans
 * descendre sous ce que l'espèce exige. Une fonction parce que deux lecteurs
 * la veulent — le dôme du gîte et l'oiseau qui y rentre (#129) —, et deux
 * copies de la règle poseraient l'oiseau à côté de sa loge (§2.1).
 */
export function hauteurDuGite(hauteurGiteMinM: number, hauteurArbreM: number): number {
  return Math.max(hauteurGiteMinM, hauteurArbreM * PART_DE_LA_HAUTEUR);
}

/**
 * Les gîtes occupés, prêts à poser — un par habitant.
 *
 * L'arbre est cherché par `arbreId` et non par la position : c'est l'ancrage du
 * moteur, et c'est lui qui reste juste quand deux arbres se touchent. Un
 * habitant dont l'arbre a quitté l'instantané ne se pose pas — il est sur le
 * départ, et le moteur le dira la semaine d'après.
 */
export function gitesOccupes(
  habitants: readonly IndividuFaune[],
  hauteurDeLArbre: (id: number) => number | undefined,
): GiteOccupe[] {
  const gites: GiteOccupe[] = [];
  for (const habitant of habitants) {
    const espece = especeFaune(habitant.especeId);
    if (!espece) continue;
    const hauteurArbreM = hauteurDeLArbre(habitant.arbreId);
    if (hauteurArbreM === undefined) continue;
    const teinte = TEINTE_DU_GITE[espece.gite];
    gites.push({
      x: habitant.x,
      y: habitant.y,
      hauteurM: hauteurDuGite(espece.hauteurGiteMinM, hauteurArbreM),
      teinte,
    });
  }
  return gites;
}
