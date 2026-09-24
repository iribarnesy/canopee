/**
 * **Qui est là** : les essences présentes, comptées, triées par effectif (#156).
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
import type { CauseMort } from "../../engine/trees";
import { SEUIL_SOUFFRANCE } from "../suivis";

/**
 * Le nom qu'on lit, sans jamais lever d'exception.
 *
 * **`getEspece` lève sur un identifiant inconnu**, elle ne rend pas
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
 * aucune zone n'est visée, triées par effectif **décroissant**.
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

/** Une tige, réduite à ce que l'état de santé lit. */
export interface TigeSurveillee extends TigeRecensee {
  /** souffrance **lente**, amortie : celle qui dure (protocol.ts) */
  stressLent?: number;
  /** ce que le moteur nomme, quand il sait le nommer */
  causeLente?: CauseMort;
}

/** Une essence, et l'état de sa population. */
export interface EssenceSurveillee extends EssencePresente {
  /** tiges dont la souffrance lente dépasse le seuil */
  enSouffrance: number;
  /** ∈ [0,1] : la part de l'essence qui souffre — ce que le statut montre */
  part: number;
  /** la cause la plus fréquente parmi celles qui souffrent, si le moteur la nomme */
  cause?: CauseMort;
}

/**
 * **l'état de chaque essence** : combien de tiges souffrent, et de quoi.
 *
 * **Le même seuil et la même règle que le journal des suivis** (`suivis.ts`) :
 * une tige souffre quand le moteur **nomme** sa peine et qu'elle dépasse
 * `SEUIL_SOUFFRANCE`. Deux définitions de « souffrir » dans le même jeu
 * finiraient par se contredire d'un panneau à l'autre.
 *
 * On rend une **part** et non la pire tige : sur deux mille ronces, une seule qui
 * dépérit ne dit rien de l'essence, alors qu'un tiers qui dépérit dit tout. Ce
 * qu'on surveille ici est une population, pas un individu — c'est l'inverse du
 * volet des suivis, et c'est pour ça que les deux existent.
 */
export function etatDesEssences(tiges: readonly TigeSurveillee[]): EssenceSurveillee[] {
  const parEspece = new Map<string, { souffrent: number; causes: Map<CauseMort, number> }>();
  for (const t of tiges) {
    const agg = parEspece.get(t.especeId) ?? { souffrent: 0, causes: new Map() };
    if (t.causeLente !== undefined && (t.stressLent ?? 0) >= SEUIL_SOUFFRANCE) {
      agg.souffrent++;
      agg.causes.set(t.causeLente, (agg.causes.get(t.causeLente) ?? 0) + 1);
    }
    parEspece.set(t.especeId, agg);
  }
  return essencesPresentes(tiges, undefined).map((e) => {
    const agg = parEspece.get(e.especeId);
    const souffrent = agg?.souffrent ?? 0;
    let cause: CauseMort | undefined;
    let pire = 0;
    for (const [c, n] of agg?.causes ?? []) {
      if (n > pire) {
        pire = n;
        cause = c;
      }
    }
    return {
      ...e,
      enSouffrance: souffrent,
      part: e.tiges > 0 ? souffrent / e.tiges : 0,
      ...(cause ? { cause } : {}),
    };
  });
}
