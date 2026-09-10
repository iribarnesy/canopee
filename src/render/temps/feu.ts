/**
 * Le FRONT D'INCENDIE : une ligne de flammes qui court, puis de la cendre
 * (docs/interface-visuelle.md §6.4).
 *
 * **Le moteur a tout préparé pour ça, et il l'a écrit noir sur blanc.** Le
 * commentaire de `rangsDuFront` dans `feu.ts` dit : « c'est ce qui permet de
 * faire COURIR une ligne de flammes au lieu de noircir un patch d'un coup ».
 * `IncendieResult` porte donc l'origine, les cellules brûlées, et le RANG
 * d'arrivée du front sur chacune — sa distance à l'origine à travers ce qui a
 * brûlé. Le rendu n'a aucune propagation à refaire : il lit un rang et le
 * compare à l'avancement de l'acte.
 *
 * **Et il n'a presque aucune machinerie à ajouter, ce qui est le signe que le
 * découpage précédent était bon.** Un front est un ensemble de cellules
 * teintées, animées à la POSE — exactement ce que le voile des gestes de zone
 * dessine déjà (`voile.ts`, `couches/voile.ts`). Les deux rendent des
 * `CelluleVoilee` et passent par la même couche de losanges. Une flamme au sol
 * et un nuage de chaux ne sont pas la même chose, mais ils se DESSINENT de la
 * même façon, et il n'y avait pas de raison d'en écrire deux fois.
 *
 * Ce qui ne passe pas par ici, et c'est délibéré :
 *
 *  - **le torchage d'un arbre** — la couronne qui s'embrase et la chandelle
 *    noire qui reste. La classe de vignette porte déjà `brulee`, et la mort de
 *    cause `feu` la met en place dès le premier instant (`mort.ts`). C'est de
 *    la CUISSON, pas de la pose ;
 *  - **la fumée** (§6.4, charge `M`) : une colonne au-dessus du front, inclinée
 *    par le vent. C'est un système de particules, donc un autre lot ;
 *  - **les rejets de souche au printemps suivant** : ils arriveront comme des
 *    recrues dans un instantané ultérieur, et le calque des changements les
 *    pointera sans rien de plus.
 *
 * Module **pur** : des cellules et des teintes, aucun sprite.
 */

import type { Teinte } from "../palette";
import type { CelluleVoilee } from "./voile";

/**
 * Ce que le rendu lit d'un incendie. Le sous-ensemble de `IncendieResult` dont
 * le dessin a besoin — écrit en clair pour que ce module se teste sans
 * fabriquer un résultat de moteur complet, et pour dire exactement ce qu'il
 * consomme.
 */
export interface FrontDIncendie {
  /** cellules brûlées, dans l'ordre où le front les a atteintes */
  brulees: ArrayLike<number>;
  /** rang d'arrivée du front sur chaque cellule de `brulees`, même ordre */
  rangs: ArrayLike<number>;
}

/**
 * Largeur du front, en rangs.
 *
 * **C'est ce qui fait la différence entre un front et une tache qui grandit.**
 * À un rang, on voit un liseré d'un mètre courir — trop fin pour se lire à la
 * parcelle. À dix, tout ce qui a brûlé flambe en même temps et on ne voit plus
 * où le feu EST. Trois rangs, c'est une ligne de flammes de trois mètres de
 * profondeur : ce qu'on voit d'un feu courant.
 */
export const RANGS_DU_FRONT = 3;

/**
 * Les trois états d'une cellule que le feu traverse.
 *
 * **La flamme est claire et la cendre est sombre, et l'écart entre les deux est
 * ce qui rend le front lisible** : il court comme une ligne claire sur du
 * noir, dans le sens du rang croissant. Le §6.4 en attend la pédagogie des
 * coupures — « c'est la carte de combustibilité qui devient visible » — et
 * c'est le contraste qui la donne, pas la couleur exacte.
 */
export const FLAMME: Teinte = { r: 252, g: 196, b: 82 };
export const BRAISE: Teinte = { r: 196, g: 84, b: 34 };
export const CENDRE: Teinte = { r: 34, g: 30, b: 28 };

/** Opacité de la flamme, au plus fort du front. */
export const OPACITE_DE_LA_FLAMME = 0.92;

/**
 * Opacité de la cendre.
 *
 * Pas totale : le sol brûlé reste du SOL, et ce qu'il portait — un tronc
 * couché, une souche — doit rester lisible dessous. C'est aussi ce qui évite
 * qu'un incendie laisse un trou noir découpé au ciseau dans la parcelle.
 */
export const OPACITE_DE_LA_CENDRE = 0.78;

/** Mélange linéaire de deux teintes. */
function melanger(a: Teinte, b: Teinte, part: number): Teinte {
  const t = Math.min(1, Math.max(0, part));
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * L'état du front à un avancement donné de son acte.
 *
 * Trois zones, du rang le plus haut au plus bas : ce que le front n'a pas
 * encore atteint (rien de dessiné — la parcelle est intacte, et c'est
 * important : un feu qui noircirait d'avance raconterait le contraire de ce
 * qui se passe), la ligne de flammes, et la cendre derrière.
 *
 * À l'avancement 1, tout ce qui a brûlé est en cendre : c'est l'état final, et
 * il correspond à ce que l'instantané d'après dira du sol.
 */
export function frontEnCours(front: FrontDIncendie, avancement: number): CelluleVoilee[] {
  const n = Math.min(front.brulees.length, front.rangs.length);
  if (n === 0) return [];
  let rangMax = 0;
  for (let i = 0; i < n; i++) rangMax = Math.max(rangMax, front.rangs[i] ?? 0);
  const a = Math.min(1, Math.max(0, avancement));
  // **Le front dépasse le dernier rang de sa largeur PLUS UN**, et l'essai a
  // attrapé le « plus un » : sans dépassement du tout, les dernières cellules
  // flamberaient encore à la fin de l'acte et le feu se figerait en pleine
  // flamme ; avec `RANGS_DU_FRONT` seulement, elles finissaient en BRAISE et
  // non en cendre, puisqu'il leur manquait le rang de refroidissement. L'état
  // final doit être celui que l'instantané d'après décrira : du sol brûlé.
  const tete = a * (rangMax + RANGS_DU_FRONT + 1);
  const sorties: CelluleVoilee[] = [];
  for (let i = 0; i < n; i++) {
    const cellule = front.brulees[i] ?? 0;
    const depuis = tete - (front.rangs[i] ?? 0);
    if (depuis <= 0) continue;
    if (depuis < RANGS_DU_FRONT) {
      // Dans le front : la flamme s'assombrit vers la braise à mesure qu'on
      // s'éloigne de sa tête.
      const part = depuis / RANGS_DU_FRONT;
      sorties.push({
        cellule,
        teinte: melanger(FLAMME, BRAISE, part),
        opacite: OPACITE_DE_LA_FLAMME,
      });
      continue;
    }
    // Derrière : la braise se refroidit en cendre sur un rang de plus, sinon la
    // flamme devient noire d'un pixel à l'autre.
    const refroidi = Math.min(1, depuis - RANGS_DU_FRONT);
    sorties.push({
      cellule,
      teinte: melanger(BRAISE, CENDRE, refroidi),
      opacite: OPACITE_DE_LA_FLAMME + (OPACITE_DE_LA_CENDRE - OPACITE_DE_LA_FLAMME) * refroidi,
    });
  }
  return sorties;
}

/**
 * Le rang le plus élevé du front, c'est-à-dire jusqu'où le feu est allé.
 *
 * Utile à l'appelant pour deux choses : savoir si un incendie mérite un acte
 * plus long qu'un autre (un feu de trois cellules et un feu d'un hectare ne se
 * racontent pas dans le même temps), et cadrer la caméra sur l'origine, ce que
 * le §6.4 demande.
 */
export function porteeDuFront(front: FrontDIncendie): number {
  let rangMax = 0;
  const n = Math.min(front.brulees.length, front.rangs.length);
  for (let i = 0; i < n; i++) rangMax = Math.max(rangMax, front.rangs[i] ?? 0);
  return rangMax;
}
