/**
 * QUAND RÉCOLTER, ET CE QU'IL Y A À PRENDRE.
 *
 * **Une extraction, pas un changement.** La règle vivait au milieu du worker,
 * où rien ne pouvait l'éprouver : il a fallu treize ans de jeu dans un
 * navigateur pour se demander ce qu'elle faisait, et le doute n'est pas levé
 * (#191). Elle est ici pour qu'un essai puisse la prendre en faute.
 *
 * Ce qu'elle dit aujourd'hui, sans rien y ajouter : on agit à l'ARRIVÉE d'une
 * maturité — le total des fruits mûrs franchit le seuil alors qu'il était
 * dessous la semaine d'avant — et pas à chaque semaine où cette maturité dure.
 * Sans ce front, le jeu s'arrêterait à chaque semaine de chaque fenêtre de
 * récolte quand la cueillette automatique est coupée.
 *
 * **Ce qui reste à instruire (#191)** : ce front se juge sur le TOTAL, toutes
 * essences confondues, alors que les semaines de récolte s'échelonnent de la 34
 * (ronce, cornouiller) à la 46 (arbousier) et que les fenêtres se chevauchent.
 * Une essence qui mûrit pendant qu'une autre porte encore pourrait n'être ni
 * cueillie ni annoncée. Ce n'est pas démontré — c'est justement ce que ces
 * fonctions, une fois sorties d'ici, permettront de démontrer ou d'écarter.
 */

/** En dessous, un arbre n'a rien qui vaille un geste. */
export const SEUIL_ARBRE_KG = 0.5;
/** En dessous, la parcelle entière n'a rien qui vaille une action. */
export const SEUIL_PARCELLE_KG = 1;

/** Ce qu'un arbre porte, vu d'ici. */
export interface ArbrePorteur {
  id: number;
  alive: boolean;
  fruitsKg: number;
}

/** Les arbres qu'il y a lieu de cueillir, et ce qu'ils portent en tout. */
export function arbresMurs(arbres: readonly ArbrePorteur[]): {
  ids: number[];
  kg: number;
} {
  const ids: number[] = [];
  let kg = 0;
  for (const a of arbres) {
    if (!a.alive || a.fruitsKg <= SEUIL_ARBRE_KG) continue;
    ids.push(a.id);
    kg += a.fruitsKg;
  }
  return { ids, kg };
}

/**
 * Faut-il cueillir maintenant ? Oui dès qu'il y a de quoi.
 *
 * Pas de front : chaque essence est cueillie dans SA fenêtre, et rien ne peut
 * être pris deux fois.
 */
export function fautIlCueillir(kgMurs: number): boolean {
  return kgMurs > SEUIL_PARCELLE_KG;
}

/**
 * Faut-il ARRÊTER LE TEMPS pour laisser le joueur cueillir lui-même ?
 *
 * Ici le front montant est justifié : on ne prévient qu'à l'arrivée d'une
 * maturité, pas à chaque semaine où elle dure. Il garde l'angle mort que #191
 * laisse à instruire — dans une parcelle variée, seule la première essence mûre
 * déclenche l'avis.
 */
export function fautIlPrevenir(kgMurs: number, kgSemainePrecedente: number): boolean {
  return kgMurs > SEUIL_PARCELLE_KG && kgSemainePrecedente <= SEUIL_PARCELLE_KG;
}
