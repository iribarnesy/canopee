/**
 * **Le gel des jeunes pousses, côté jeu** (#425, suite de #371).
 *
 * Le moteur le décide (`gelPousses.ts`) : une nuit de printemps sous le seuil
 * de l'essence grille le feuillage qui venait de sortir, l'arbre reste nu
 * quelques semaines puis refeuille. Il date le gel par arbre
 * (`gelPousseSemaine`), et c'est tout ce qui voyage.
 *
 * Ce module n'ajoute **aucune règle** : il compose la date et la courbe du moteur
 * (`refeuillaison`) exactement comme le tick le fait pour l'ombre, la croissance
 * et la transpiration (`feuillageRevenu`, tick.ts). Le dessin, le couvert du
 * givre et la fiche lisent ainsi le même feuillage que le moteur.
 *
 * Module **pur**.
 */

import { refeuillaison } from "../engine/gelPousses";

/**
 * La part du feuillage revenue, `semaine` étant celle de l'instantané ∈ [0,1].
 *
 * 1 pour un arbre jamais gelé. La composition est celle du tick : la semaine
 * même du gel ou avant, rien n'est perdu ; ensuite, la courbe du moteur.
 */
export function feuillageRevenu(gelPousseSemaine: number | undefined, semaine: number): number {
  if (gelPousseSemaine === undefined) return 1;
  const semaines = semaine - gelPousseSemaine;
  return semaines <= 0 ? 1 : refeuillaison(semaines);
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
