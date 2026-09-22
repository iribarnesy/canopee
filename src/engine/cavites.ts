/**
 * LES CAVITÉS D'UN ARBRE VIVANT (critère J3).
 *
 * Le moteur savait déjà que les trognes se creusent (`trogne.ts`) et comptait
 * ce creux en LITRES, parce que c'est le volume — et lui seul — qui décide de
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
 * **Ce que ce module a d'abord laissé de côté, et qui est arrivé depuis** : le
 * calibre de la chambre, qui dans la réalité trie les espèces autant que le
 * volume (28 mm d'entrée pour une mésange bleue, 70 pour une chevêche), et la
 * hauteur de la loge au-dessus du sol. Les deux appelaient une fiche de faune,
 * qui existe maintenant (`faune.ts`, #187), et les deux se déduisent de ce qui
 * était déjà là — voir `diametreCaviteCm` et `hauteurCaviteM` en fin de fichier.
 */

import type { TreeState } from "./trees";
import { volumeTigeM3 } from "./trees";
import {
  CAVITE_HABITAT_L,
  diametreTeteCm,
  volumeCaviteL as volumeTeteCreuseL,
  volumeTeteL,
} from "./trogne";

/**
 * Part du bois carié qui est réellement CREUSE *(à calibrer)*.
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
 * SECTIONS, soit `p²` où `p` est la part du rayon cariée. La puissance deux
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
  // Le creux se calcule sur la colonne ELLE-MÊME, et non en part du fût
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

/**
 * Le CALIBRE de la chambre, cm — le diamètre du creux lui-même, pas celui de
 * l'arbre qui le porte.
 *
 * Il ne demande aucune constante nouvelle : il se lit sur les deux volumes que
 * ce module assemble déjà, en rendant à chacun sa forme.
 *
 *  - **La colonne de carie est un cylindre.** À hauteur donnée, son volume va
 *    comme le carré de son diamètre, donc la chambre creuse à `CARIE_EVIDEE` de
 *    la colonne a le diamètre de la colonne fois la racine de cette part.
 *  - **La tête de têtard est une boule** (`volumeTeteL`). À forme donnée, son
 *    volume va comme le cube de son diamètre, donc l'exposant est un tiers.
 *
 * On garde la plus grande des deux : un arbre offre le meilleur creux qu'il a,
 * et c'est celui-là qu'un occupant choisira.
 *
 * **Ce que ce nombre est, et ce qu'il n'est pas.** C'est le calibre de la
 * CHAMBRE. L'entrée, dans la réalité, est bien plus étroite — un pic creuse un
 * trou à sa taille dans un fût de quarante centimètres. Ce que la géométrie
 * permet d'affirmer sans rien inventer, c'est qu'**une entrée ne peut pas être
 * plus large que la chambre qu'elle dessert**. C'est donc une condition
 * NÉCESSAIRE au tri des espèces, et pas une condition suffisante.
 */
export function diametreCaviteCm(
  tree: Pick<TreeState, "carie" | "diametreCm" | "heightM" | "teteTrogneM" | "recepages">,
): number {
  const rayonCm = tree.carie?.rayonCm ?? 0;
  const colonneCm = rayonCm > 0 ? Math.min(tree.diametreCm, 2 * rayonCm) : 0;
  const troncCm = colonneCm * Math.sqrt(CARIE_EVIDEE);

  const teteL = volumeTeteL(tree);
  const creuxTeteL = volumeTeteCreuseL(tree);
  const teteCm = teteL > 0 ? diametreTeteCm(tree) * Math.cbrt(creuxTeteL / teteL) : 0;

  return Math.max(troncCm, teteCm);
}

/**
 * La HAUTEUR du creux au-dessus du sol, m — celle qui décide de l'accès des
 * prédateurs terrestres, et donc de qui accepte d'y nicher.
 *
 * Une carie du bois de cœur suit le fût sur toute sa longueur : sa loge peut
 * être aussi haute que l'arbre. Une tête de têtard, elle, est là où on a étêté,
 * et pas plus haut — c'est même tout l'intérêt de la conduite. On rend donc la
 * hauteur du creux le plus haut que l'arbre offre.
 */
export function hauteurCaviteM(
  tree: Pick<TreeState, "carie" | "diametreCm" | "heightM" | "teteTrogneM" | "recepages">,
): number {
  const parLeFut = volumeCaviteTroncL(tree) > 0 ? tree.heightM : 0;
  const parLaTete = volumeTeteCreuseL(tree) > 0 ? (tree.teteTrogneM ?? 0) : 0;
  return Math.max(parLeFut, parLaTete);
}
