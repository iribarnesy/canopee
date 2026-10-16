/**
 * **Les refus à l'écran** : combien de temps on les montre, et comment on les
 * range (#402).
 *
 * Le premier retour de joueur : « Les erreurs restent affichées beaucoup trop
 * longtemps. » Un refus ne s'effaçait qu'en étant poussé dehors par le suivant —
 * donc un refus isolé restait là toute la partie —, et la même plantation trop
 * serrée en écrivait trois lignes identiques, « ⚠ Planter : trop proche d'une
 * tige vivante (ronce, < 0.3 m) » trois fois de suite. Trois lignes pour dire
 * une chose, c'est une chose que le joueur ne lit plus.
 *
 * D'où deux règles, ici et pures — l'horloge vient de l'appelant :
 *
 * - **un refus s'efface seul**, `DUREE_D_UN_REFUS_MS` après être arrivé ;
 * - **les refus identiques — même geste, même raison — font une ligne**, avec
 *   leur compte (« ×3 »). Le même refus qui revient remonte en tête et son
 *   horloge repart : c'est le plus récent, il a droit au temps d'être lu.
 */

import type { ActionRefusal } from "../engine/actions";

/**
 * Combien de temps une ligne reste à l'écran, ms.
 *
 * Six secondes : une ligne d'une dizaine de mots se lit en trois, mais le
 * regard est sur la parcelle, là où l'on vient de cliquer, et pas dans la
 * colonne des avis — il lui faut le temps d'y aller. Moins, la ligne s'efface
 * pendant qu'on la cherche ; plus, elle est encore là quand le joueur est
 * passé au geste suivant, et c'est la plainte de #402.
 */
export const DUREE_D_UN_REFUS_MS = 6000;

/**
 * Au plus autant de lignes à la fois. Les refus identiques étant regroupés,
 * trois lignes disent trois choses différentes : au-delà, la plus ancienne
 * cède sa place — c'est aussi celle qui allait s'effacer la première.
 */
export const LIGNES_DE_REFUS_MAX = 3;

/** Une ligne de la boîte des refus : un geste, une raison, et combien de fois. */
export interface LigneDeRefus {
  /** le geste et la raison, qui disent si deux refus sont le même */
  cle: string;
  action: ActionRefusal["action"];
  reason: string;
  /** combien de refus identiques depuis que la ligne est à l'écran, ≥ 1 */
  fois: number;
  /** l'instant du plus récent d'entre eux, ms, sur l'horloge de l'appelant */
  dernierMs: number;
}

/**
 * Deux refus sont le même quand le geste et la raison le sont — pas la
 * semaine. Le geste est un identifiant sans deux-points : le premier sépare.
 */
export function cleDuRefus(r: Pick<ActionRefusal, "action" | "reason">): string {
  return `${r.action}:${r.reason}`;
}

/** L'instant où la ligne s'efface, ms. */
export function finDeLaLigne(l: LigneDeRefus): number {
  return l.dernierMs + DUREE_D_UN_REFUS_MS;
}

/**
 * Les lignes encore à l'écran à `maintenantMs`. À l'instant exact de sa fin,
 * une ligne est déjà partie : sa durée est un intervalle semi-ouvert.
 */
export function refusEnCours(
  lignes: readonly LigneDeRefus[],
  maintenantMs: number,
): LigneDeRefus[] {
  return lignes.filter((l) => maintenantMs < finDeLaLigne(l));
}

/**
 * Les lignes après l'arrivée de `arrives` à `maintenantMs`, la plus récente en
 * tête.
 *
 * Les lignes déjà échues partent d'abord : un refus qui revient après s'être
 * effacé repart à « ×1 », et non au compte d'une ligne que le joueur ne voit
 * plus. Puis chaque refus, dans l'ordre où le moteur l'a émis, remonte en tête
 * — le dernier émis finit donc premier — en reprenant le compte de sa ligne
 * s'il en a une.
 */
export function ajouterLesRefus(
  lignes: readonly LigneDeRefus[],
  arrives: readonly Pick<ActionRefusal, "action" | "reason">[],
  maintenantMs: number,
): LigneDeRefus[] {
  const apres = refusEnCours(lignes, maintenantMs);
  for (const r of arrives) {
    const cle = cleDuRefus(r);
    const i = apres.findIndex((l) => l.cle === cle);
    const fois = (apres[i]?.fois ?? 0) + 1;
    if (i >= 0) apres.splice(i, 1);
    apres.unshift({ cle, action: r.action, reason: r.reason, fois, dernierMs: maintenantMs });
  }
  return apres.slice(0, LIGNES_DE_REFUS_MAX);
}

/** L'instant où la prochaine ligne s'efface, ms — rien s'il n'y a rien à effacer. */
export function prochaineFin(lignes: readonly LigneDeRefus[]): number | undefined {
  let fin: number | undefined;
  for (const l of lignes) {
    const f = finDeLaLigne(l);
    if (fin === undefined || f < fin) fin = f;
  }
  return fin;
}
