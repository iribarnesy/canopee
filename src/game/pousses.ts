/**
 * **Le gel des jeunes pousses et la soif, côté jeu** (#425, suite de #371 ;
 * #446, suite de #391).
 *
 * Le moteur décide des deux pertes de feuillage. Une nuit de printemps sous le
 * seuil de l'essence grille le feuillage qui venait de sortir (`gelPousses.ts`) ;
 * en été, un feuillu installé que la soif embolise lâche ses feuilles encore
 * vertes plutôt que de laisser casser son bois (tick.ts). Dans les deux cas
 * l'arbre reste nu quelques semaines puis refeuille, sur la même courbe. Le
 * moteur date chaque perte par arbre (`gelPousseSemaine`,
 * `defeuillaisonSemaine`), et c'est tout ce qui voyage.
 *
 * Ce module n'ajoute **aucune règle** : il compose les dates et la courbe du
 * moteur (`refeuillaison`) exactement comme le tick le fait pour l'ombre, la
 * croissance et la transpiration (`feuillageRevenu`, tick.ts). Le dessin, le
 * couvert du givre et la fiche lisent ainsi le même feuillage que le moteur. Il
 * ne décide jamais qu'un arbre **perd** ses feuilles : il lit la date que le
 * moteur a posée.
 *
 * Module **pur**.
 */

import { refeuillaison } from "../engine/gelPousses";

/**
 * La part du feuillage revenue après **une** perte datée, `semaine` étant celle
 * de l'instantané ∈ [0,1].
 *
 * 1 pour un arbre qui n'a jamais perdu ce feuillage-là. La composition est celle
 * du tick : la semaine même de la perte ou avant, rien n'est perdu ; ensuite, la
 * courbe du moteur. Elle vaut pour le gel des pousses comme pour la soif, que
 * le moteur fait revenir de la même façon.
 */
export function feuillageRevenu(perteSemaine: number | undefined, semaine: number): number {
  if (perteSemaine === undefined) return 1;
  const semaines = semaine - perteSemaine;
  return semaines <= 0 ? 1 : refeuillaison(semaines);
}

/**
 * La part du feuillage qu'un arbre porte de nouveau, **toutes pertes comprises**
 * ∈ [0,1] : le gel des pousses (#425) et la soif (#446).
 *
 * La plus basse des deux, comme le tick la prend (`feuillageRevenu`, tick.ts) :
 * un arbre que la soif a défeuillé en août n'est pas plus feuillu parce que son
 * gel de mai est loin. C'est elle que le dessin, le couvert du givre et la fiche
 * multiplient au feuillage de saison.
 */
export function feuillageRevenuDe(
  arbre: { gelPousseSemaine?: number; defeuillaisonSemaine?: number },
  semaine: number,
): number {
  return Math.min(
    feuillageRevenu(arbre.gelPousseSemaine, semaine),
    feuillageRevenu(arbre.defeuillaisonSemaine, semaine),
  );
}

/**
 * Les arbres dont les pousses **viennent** de geler : leur date est la dernière
 * semaine simulée, celle qui précède la semaine ouverte de l'instantané.
 */
export function poussesGeleesALaSemaine<
  T extends { gelPousseSemaine?: number; chandelle: boolean },
>(arbres: readonly T[], semaine: number): T[] {
  return arbres.filter((t) => !t.chandelle && t.gelPousseSemaine === semaine - 1);
}
