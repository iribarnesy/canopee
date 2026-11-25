/**
 * **La progression** : les niveaux réussis, et ceux qui s'ouvrent (#506).
 *
 * Décision du propriétaire du 25 novembre 2026 (`v1.md`) : **un niveau ne
 * s'ouvre qu'une fois le précédent réussi.** Le premier l'est toujours ; chacun
 * des suivants s'ouvre quand celui d'avant est réussi. L'ordre est celui de la
 * liste des niveaux livrés (`NIVEAUX_LIVRES`), et rien d'autre : un niveau
 * ajouté au bout de la liste se verrouille derrière le dernier, sans qu'on
 * touche à ce fichier.
 *
 * Le bac à sable n'est pas un niveau et ne passe pas par ici : il reste ouvert.
 *
 * Ce module ne parle pas à React et ne connaît pas `window` : le **stockage** lui
 * est donné, comme à `sauvegardes.ts`, et la **liste des niveaux** aussi. C'est
 * ce qui permet d'éprouver le verrouillage sur quatre niveaux alors que le jeu
 * n'en livre encore qu'un.
 *
 * ## Ce qui se retient, et ce qui ne se retient pas
 *
 * Des **identifiants** de niveaux réussis, rien d'autre. Ni la partie, ni le
 * score, ni la date : ce qui a été joué est dans les sauvegardes, et une
 * seconde copie finirait par ne plus dire la même chose qu'elles. Une réussite
 * ne se perd pas : rejouer un niveau réussi et le manquer ne le reverrouille
 * pas, pas plus que celui qui le suit.
 */

import type { Issue } from "./niveaux";

/** La clé de la progression dans le stockage. */
export const CLE_PROGRESSION = "canopee-progression";

/** Ce qui est rangé sous la clé. */
interface ProgressionRangee {
  version: 1;
  reussis: string[];
}

/**
 * Les niveaux réussis, tels que le stockage les garde.
 *
 * Une valeur illisible — tronquée, d'une autre version, ou un stockage que le
 * navigateur refuse — rend une progression **vide** plutôt qu'une erreur : le
 * premier niveau reste ouvert, et le joueur peut toujours jouer.
 */
export function niveauxReussis(stock: Storage): Set<string> {
  try {
    const brut = stock.getItem(CLE_PROGRESSION);
    if (!brut) return new Set();
    const lu = JSON.parse(brut) as Partial<ProgressionRangee> | null;
    if (lu?.version !== 1 || !Array.isArray(lu.reussis)) return new Set();
    return new Set(lu.reussis.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

/**
 * Retenir qu'un niveau est réussi. Rend la progression **après** l'écriture.
 *
 * Idempotent, et il le faut : l'écran de fin se redessine, une partie gagnée se
 * reprend d'une sauvegarde, et chaque fois l'issue « réussi » repasse par ici.
 */
export function retenirLaReussite(stock: Storage, id: string): Set<string> {
  const reussis = niveauxReussis(stock);
  if (reussis.has(id)) return reussis;
  reussis.add(id);
  const rangee: ProgressionRangee = { version: 1, reussis: [...reussis] };
  try {
    stock.setItem(CLE_PROGRESSION, JSON.stringify(rangee));
  } catch {
    /* stockage plein ou refusé : la réussite vaut pour cette visite */
  }
  return reussis;
}

/**
 * Où en est un niveau, vu de l'accueil.
 *
 * - `reussi` : fait ; il se rejoue ;
 * - `prochain` : le premier niveau ouvert et pas encore réussi, celui que
 *   l'accueil met en avant ;
 * - `ouvert` : ouvert et pas réussi, mais un autre passe avant lui. Ça n'arrive
 *   que si la liste change sous une progression déjà rangée — un niveau inséré
 *   avant un niveau réussi — et l'accueil le laisse jouer sans le mettre en avant ;
 * - `verrouille` : le précédent n'est pas réussi ; il ne se lance pas.
 */
export type EtatALAccueil = "reussi" | "prochain" | "ouvert" | "verrouille";

export interface PlaceDuNiveau<N extends { id: string }> {
  niveau: N;
  etat: EtatALAccueil;
  /** le niveau à réussir pour ouvrir celui-ci, quand il est verrouillé */
  requis?: N;
}

/**
 * La place de chaque niveau, dans l'ordre de la liste.
 *
 * Générique sur la forme du niveau, et pas lié à `Niveau` : seul l'identifiant
 * compte pour l'ordre, et c'est ce qui laisse l'essai bâtir une liste factice.
 */
export function placesDesNiveaux<N extends { id: string }>(
  niveaux: readonly N[],
  reussis: ReadonlySet<string>,
): PlaceDuNiveau<N>[] {
  let prochainDonne = false;
  return niveaux.map((niveau, i): PlaceDuNiveau<N> => {
    if (reussis.has(niveau.id)) return { niveau, etat: "reussi" };
    const precedent = i > 0 ? niveaux[i - 1] : undefined;
    if (precedent && !reussis.has(precedent.id)) {
      return { niveau, etat: "verrouille", requis: precedent };
    }
    const etat = prochainDonne ? "ouvert" : "prochain";
    prochainDonne = true;
    return { niveau, etat };
  });
}

/**
 * Le niveau à proposer à la fin de celui-ci : le suivant dans la liste, **si
 * l'objectif est atteint** et s'il y en a un.
 *
 * Un niveau manqué ne propose pas la suite, puisqu'elle n'est pas ouverte ; le
 * dernier niveau réussi n'a rien à proposer.
 */
export function niveauSuivant<N extends { id: string }>(
  niveaux: readonly N[],
  id: string,
  issue: Issue,
): N | undefined {
  if (issue !== "reussi") return undefined;
  const i = niveaux.findIndex((n) => n.id === id);
  return i >= 0 ? niveaux[i + 1] : undefined;
}
