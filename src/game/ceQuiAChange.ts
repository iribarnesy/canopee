/**
 * **Ce qui a changé**, à la demande (§6.8 ; retour de jeu du 2026-10-05).
 *
 * L'estompe — tout ce qui n'a pas changé passe en transparence — s'allumait
 * seule à chaque semaine qui portait des événements. En lecture normale, à ×1
 * ou ×4, cela faisait clignoter la parcelle chaque semaine : on ne pouvait plus
 * suivre un arbre des yeux. Le retour est sans ambiguïté : « quand on est en
 * mode normal de lecture il faut pas faire ça, ça n'a aucun sens ».
 *
 * Elle est donc **éteinte par défaut**, et devient une question qu'on pose :
 * « qu'est-ce qui a changé cette semaine, ce mois, cette année ? ». Le bouton du
 * bandeau l'allume ; « +1 mois » et « +1 an » l'allument d'eux-mêmes sur la
 * période qu'ils viennent de sauter, parce que c'est précisément la question
 * qu'on se pose en arrivant.
 *
 * Ce module tient l'**historique** : pour chaque instantané, les arbres qui ont
 * changé (`sujetsDuJournal`, la même porte de taille que le calque des
 * changements), datés de leur semaine. Rien n'est calculé : on se rappelle.
 */

import type { Deformation } from "../render/temps/chute";

/** La période que l'on regarde. */
export type FenetreDuChangement = "semaine" | "mois" | "an";

/** Semaines par fenêtre ; un mois de jeu est un douzième d'année. */
export const SEMAINES_DE_LA_FENETRE: Record<FenetreDuChangement, number> = {
  semaine: 1,
  mois: 52 / 12,
  an: 52,
};

/** Ce qu'un instantané a changé, et quand. */
export interface Changements {
  /** la semaine **sur laquelle** l'instantané s'ouvre (`Snapshot.week`) */
  semaine: number;
  ids: ReadonlySet<number>;
}

/** Une année et un peu : la plus longue fenêtre, avec de la marge. */
export const MEMOIRE_SEMAINES = 60;

/**
 * Ajoute un instantané à l'historique et oublie ce qui est plus vieux que la
 * mémoire. Un retour en arrière (une partie rechargée, un rembobinage) efface
 * l'avenir : ce qui « a changé » après la semaine où l'on revient n'a pas eu
 * lieu dans cette partie-ci.
 */
export function retenir(
  historique: readonly Changements[],
  semaine: number,
  ids: ReadonlySet<number>,
): Changements[] {
  const passe = historique.filter((c) => c.semaine < semaine);
  const meme = historique.find((c) => c.semaine === semaine);
  // Deux instantanés de la même semaine (une action en pause) : on réunit.
  const fusion = meme ? new Set([...meme.ids, ...ids]) : ids;
  return [...passe, { semaine, ids: fusion }].filter((c) => c.semaine > semaine - MEMOIRE_SEMAINES);
}

/**
 * Les arbres qui ont changé dans la fenêtre qui se termine à `semaine`.
 *
 * Un instantané daté de la semaine *s* porte ce qui s'est passé pendant les
 * semaines qui y mènent : la fenêtre d'une semaine retient donc le dernier,
 * celle d'un mois ceux des quatre ou cinq dernières semaines.
 */
export function changesDans(
  historique: readonly Changements[],
  semaine: number,
  fenetre: FenetreDuChangement,
): Set<number> {
  const depuis = semaine - SEMAINES_DE_LA_FENETRE[fenetre];
  const ids = new Set<number>();
  for (const c of historique) {
    if (c.semaine <= depuis || c.semaine > semaine) continue;
    for (const id of c.ids) ids.add(id);
  }
  return ids;
}

/**
 * L'opacité d'un arbre qui n'a pas changé, quand on demande à voir ce qui a
 * changé. **Pas celle du calque des changements** (`OPACITE_HORS_SUJET`, 0,14) :
 * à ce niveau, le retour de jeu disait qu'« on dirait carrément que tous les
 * arbres disparaissent ». À quatre dixièmes, la parcelle reste là, en retrait,
 * et ce qui a changé ressort sans qu'on perde le reste.
 */
export const OPACITE_DE_L_ESTOMPE = 0.4;

/** La pose d'un arbre qui n'a pas changé : debout, en retrait. */
export const ESTOMPE: Deformation = { rotationRad: 0, hauteur: 1, opacite: OPACITE_DE_L_ESTOMPE };
