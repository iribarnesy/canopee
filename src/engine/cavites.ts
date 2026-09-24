/**
 * **Les cavités d'un arbre vivant** (critère J3).
 *
 * Le moteur savait déjà que les trognes se creusent (`trogne.ts`) et comptait
 * ce creux en **litres**, parce que c'est le volume — et lui seul — qui décide de
 * qui peut nicher : une mésange se contente de quelques litres, une chouette
 * chevêche en demande des dizaines. Mais il ne savait le faire que pour une
 * tête de têtard, alors que la carie du tronc (#182) fabrique exactement la
 * même chose sur un arbre qu'on n'a jamais étêté : le vieux chêne creux d'un
 * bocage n'a pas été conduit en trogne, il a été blessé par des coups de vent.
 *
 * Ce module rassemble donc les deux sources en une seule grandeur, et il ne
 * calcule rien de nouveau : la tête vient de `trogne.ts`, le fût vient de la
 * carie, et le tout se lit en litres comme avant.
 *
 * **La boucle qu'il ferme**, et dont chaque maillon existait déjà sans que le
 * dernier soit branché : une tempête arrache une branche (#181) → la plaie
 * installe une carie qui ne guérit pas (#182) → le cœur se vide → l'arbre
 * devient un habitat → les auxiliaires qui y logent écrêtent les pullulations
 * (`ravageurs.ts`, G3). La conduite en trogne et la tempête arrivent au même
 * résultat par deux chemins que rien ne relie dans le code.
 *
 * **Ce qui n'est pas modélisé** : le diamètre de l'entrée, qui dans la réalité
 * trie les espèces autant que le volume (28 mm pour une mésange bleue, 80 pour
 * une chevêche), et la hauteur de la loge au-dessus du sol, qui décide de
 * l'accès aux prédateurs. Les deux appellent une fiche de faune, qui n'existe
 * pas : les auxiliaires sont ici un agrégat, pas des espèces.
 */

import type { TreeState } from "./trees";
import { volumeTigeM3 } from "./trees";
import { CAVITE_HABITAT_L, volumeCaviteL as volumeTeteCreuseL } from "./trogne";

/**
 * Part du bois carié qui est réellement **creuse** *(à calibrer)*.
 *
 * Une colonne de carie n'est pas un trou : c'est d'abord du bois pourri encore
 * en place, que les champignons minéralisent lentement et que la faune finit de
 * curer. Elle ne va pas à 1 — il reste toujours du bois en décomposition au
 * fond —, et c'est le même raisonnement que `CAVITE_PART_MAX` pour une tête de
 * têtard, où ce qui tient debout autour est l'aubier vivant.
 */
export const CARIE_EVIDEE = 0.45;

/**
 * Le creux qu'une colonne de carie ouvre dans un fût, litres.
 *
 * La colonne suit le cœur sur toute la bille — c'est la définition d'une carie
 * du bois de cœur —, donc son volume est celui de la tige dans le rapport des
 * **sections**, soit `p²` où `p` est la part du rayon cariée. La puissance deux
 * n'est pas la même que celle de la résistance (`facteurCarie`, en `1 − p⁴`),
 * et c'est normal : l'une compte du bois, l'autre compte de la raideur.
 *
 * D'où un ordre de grandeur qui tombe tout seul, sans qu'aucun seuil ne le
 * décide : un chêne de 50 cm creux à mi-rayon offre ~180 L — le gîte d'une
 * chevêche —, et une perche de 15 cm creuse au même degré en offre 6 — le nid
 * d'une mésange. La même formule, deux mondes.
 */
export function volumeCaviteTroncL(
  tree: Pick<TreeState, "carie" | "diametreCm" | "heightM">,
): number {
  const rayonCm = tree.carie?.rayonCm ?? 0;
  if (rayonCm <= 0) return 0;
  // Le creux se calcule sur la colonne **elle-même**, et non en part du fût
  // d'aujourd'hui : ce que le champignon a mangé, il l'a mangé, et l'aubier
  // que l'arbre a fabriqué par-dessus depuis ne le rebouche pas. Les deux
  // écritures sont algébriquement les mêmes tant que le rayon ne change pas ;
  // celle-ci reste juste quand il change, ce que la compartimentation rend
  // justement possible (`prochaineCarie`, tempete.ts).
  const diametreCarieCm = Math.min(tree.diametreCm, 2 * rayonCm);
  return volumeTigeM3(diametreCarieCm, tree.heightM) * CARIE_EVIDEE * 1000;
}

/** Tout le creux d'un arbre, litres : sa tête de trogne et son fût carié. */
export function volumeCaviteTotalL(
  tree: Pick<TreeState, "carie" | "diametreCm" | "heightM" | "teteTrogneM" | "recepages">,
): number {
  return volumeTeteCreuseL(tree) + volumeCaviteTroncL(tree);
}

/**
 * Ce qu'un arbre vaut en arbre-habitat par ses cavités ∈ [0,1].
 *
 * Même échelle que `partHabitatDeTrogne`, dont ceci est la généralisation : au
 * -dessus de `CAVITE_HABITAT_L` l'arbre compte pour un habitat entier, en
 * dessous pour une fraction. Un arbre à la fois têtard et carié ne compte pas
 * deux fois — c'est un seul arbre, et ses deux creux s'additionnent en litres
 * avant de se convertir.
 */
export function partHabitatDeCavites(
  tree: Pick<TreeState, "carie" | "diametreCm" | "heightM" | "teteTrogneM" | "recepages">,
): number {
  return Math.min(1, volumeCaviteTotalL(tree) / CAVITE_HABITAT_L);
}
