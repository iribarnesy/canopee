/**
 * QUI EST LÀ : les essences présentes, comptées, triées par effectif (#156).
 *
 * **Une capacité entière du moteur était inatteignable faute de cette
 * liste.** `eclaircir` accepte depuis longtemps `critere: "espece"`, et
 * `choisirTigesAEclaircir` prélève alors toutes les tiges de l'essence dans le
 * disque — c'est le seul outil de nettoyage sélectif du jeu. Les deux autres
 * critères étaient exposés, celui-ci non : on ne pouvait pas le demander.
 *
 * **Ce n'est pas une règle du moteur recalculée, c'est un recensement.** On
 * compte ce que l'instantané porte, dans le cercle que le joueur vise. Pour ce
 * critère-là, le compte et ce qui tombera coïncident — le moteur dit en une
 * ligne « toutes les tiges de l'essence dans la zone » — mais c'est une
 * coïncidence de définition, pas une heuristique reproduite : le choix des
 * tiges reste au moteur.
 *
 * Module **pur** : pas de React, pas de DOM.
 */

import { ESPECES_V0 } from "../../engine/especes";

/**
 * Le nom qu'on lit, sans jamais lever d'exception.
 *
 * **`getEspece` LÈVE sur un identifiant inconnu**, elle ne rend pas
 * `undefined` : le `getEspece(id)?.nom ?? id` que j'avais écrit d'abord était
 * un filet qui n'attrape rien, et l'essai l'a montré du premier coup. Un
 * recensement est de l'affichage — il ne doit pas faire tomber le panneau
 * parce qu'une tige porte un identifiant que l'atlas ne connaît pas.
 */
function nomDe(especeId: string): string {
  return ESPECES_V0.find((e) => e.id === especeId)?.nom ?? especeId;
}

/** Une essence présente, avec ce qu'elle pèse en tiges. */
export interface EssencePresente {
  especeId: string;
  /** Le nom qu'on lit, ou l'identifiant si l'atlas ne connaît pas l'espèce. */
  nom: string;
  tiges: number;
  /** La plus haute tige de l'essence dans la zone, m — de quoi juger la strate. */
  hauteurMaxM: number;
}

/** Un arbre, réduit à ce que le recensement lit. */
export interface TigeRecensee {
  especeId: string;
  x: number;
  y: number;
  heightM: number;
}

/**
 * Les essences présentes dans le disque visé, ou sur toute la parcelle si
 * aucune zone n'est visée, triées par effectif DÉCROISSANT.
 *
 * Le tri est celui que l'issue demande, et il a une raison : sur une friche,
 * ce qu'on vient nettoyer est presque toujours le plus nombreux.
 */
export function essencesPresentes(
  tiges: readonly TigeRecensee[],
  zone: { x: number; y: number; rayonM: number } | undefined,
): EssencePresente[] {
  const r2 = zone ? zone.rayonM * zone.rayonM : 0;
  const compte = new Map<string, { tiges: number; hauteurMaxM: number }>();
  for (const t of tiges) {
    if (zone) {
      const dx = t.x - zone.x;
      const dy = t.y - zone.y;
      if (dx * dx + dy * dy > r2) continue;
    }
    const deja = compte.get(t.especeId);
    if (deja) {
      deja.tiges++;
      deja.hauteurMaxM = Math.max(deja.hauteurMaxM, t.heightM);
    } else {
      compte.set(t.especeId, { tiges: 1, hauteurMaxM: t.heightM });
    }
  }
  return (
    [...compte.entries()]
      .map(([especeId, c]) => ({
        especeId,
        nom: nomDe(especeId),
        tiges: c.tiges,
        hauteurMaxM: c.hauteurMaxM,
      }))
      // À effectif égal, l'ordre alphabétique : sans second critère, deux
      // essences à égalité permuteraient d'une image à l'autre et la liste
      // clignoterait sous le curseur.
      .sort((a, b) => b.tiges - a.tiges || a.nom.localeCompare(b.nom, "fr"))
  );
}
