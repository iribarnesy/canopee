/**
 * La tête d'une trogne (docs/regles.md §11 ; critères H8 et J3).
 *
 * `trees.ts` l'annonçait sans le modéliser : « une trogne se recoupe toujours
 * au même endroit ; la tête grossit, se creuse, et c'est ce creux qui fait sa
 * valeur pour la faune ». L'état portait `teteTrogneM` (OÙ l'on coupe) et
 * `recepages` (COMBIEN DE FOIS), jamais une dimension. La conséquence
 * écologique, elle, était déjà tirée — et à l'emporte-pièce :
 *
 *     if (t.heightM >= 15 || (t.teteTrogneM !== undefined && t.recepages >= 2))
 *
 * Un têtard coupé deux fois valait donc autant qu'un têtard coupé quinze fois,
 * et autant qu'un arbre de quinze mètres. Or c'est le VOLUME de cavité qui
 * décide de qui peut nicher : une mésange se contente de quelques litres, une
 * chouette chevêche en demande des dizaines, et l'écart entre une tête de
 * trois coupes et un saule têtard centenaire va du litre à la centaine.
 *
 * Le modèle retenu est le plus simple qui ne soit pas faux : le renflement
 * s'accumule coupe après coupe (chaque étêtage laisse un bourrelet de
 * cicatrisation, et les rejets repartent tous du même point), et le cœur se
 * creuse derrière, parce que le bois de cœur mis à nu pourrit pendant que
 * l'aubier continue de s'épaissir autour.
 *
 * TOUTES les valeurs ci-dessous sont à calibrer : elles donnent le bon ordre
 * de grandeur et la bonne monotonie, pas davantage. Aucune ne sort de l'atlas,
 * qui ne couvre pas l'architecture des arbres — les inventer en les créditant
 * d'une source aurait été pire que les assumer.
 */

/** Diamètre d'une tête qui vient d'être formée, cm *(à calibrer)*. */
export const DIAMETRE_TETE_INITIAL_CM = 25;
/** Ce que chaque étêtage suivant ajoute au diamètre, cm *(à calibrer)*. */
export const RENFLEMENT_PAR_ETETAGE_CM = 6;
/**
 * Plafond du diamètre de tête, cm : un têtard ne gonfle pas indéfiniment — la
 * tête finit par se fendre et se démanteler *(à calibrer)*.
 */
export const DIAMETRE_TETE_MAX_CM = 120;
/**
 * Part du volume de tête que la cavité finit par occuper *(à calibrer)*. Elle
 * ne va pas à 1 : ce qui reste debout, c'est l'aubier vivant tout autour.
 */
export const CAVITE_PART_MAX = 0.45;
/** Étêtages au bout desquels la cavité atteint sa part maximale *(à calibrer)*. */
export const CAVITE_PLEINE_ETETAGES = 12;
/**
 * Volume de cavité à partir duquel une tête vaut un arbre-habitat entier, L
 * *(à calibrer)*. L'ordre de grandeur est celui d'une loge de chouette
 * chevêche ; en dessous, la tête compte pour une fraction.
 */
export const CAVITE_HABITAT_L = 100;

/** Un arbre a-t-il une tête de trogne ? */
function estTrogne(tree: { teteTrogneM?: number; recepages: number }): boolean {
  return tree.teteTrogneM !== undefined && tree.recepages > 0;
}

/**
 * Diamètre de la tête, cm — 0 pour un arbre qui n'a jamais été étêté.
 *
 * Le premier étêtage forme la tête ; chaque suivant l'épaissit d'un bourrelet.
 */
export function diametreTeteCm(tree: { teteTrogneM?: number; recepages: number }): number {
  if (!estTrogne(tree)) return 0;
  const brut = DIAMETRE_TETE_INITIAL_CM + RENFLEMENT_PAR_ETETAGE_CM * (tree.recepages - 1);
  return Math.min(DIAMETRE_TETE_MAX_CM, brut);
}

/**
 * Volume de la tête, litres. On la traite comme une boule de ce diamètre —
 * une tête de têtard est effectivement plus proche d'un globe que d'un fût.
 */
export function volumeTeteL(tree: { teteTrogneM?: number; recepages: number }): number {
  const d = diametreTeteCm(tree);
  if (d <= 0) return 0;
  // (π/6)·d³ cm³, et 1000 cm³ = 1 L.
  return ((Math.PI / 6) * d * d * d) / 1000;
}

/**
 * Volume de la CAVITÉ, litres — ce qui vaut habitat.
 *
 * Nulle au premier étêtage : une coupe est une plaie, pas encore un creux. Il
 * faut que le bois de cœur mis à nu ait le temps de pourrir, et c'est
 * justement pour ça qu'un vieux têtard ne se remplace pas.
 */
export function volumeCaviteL(tree: { teteTrogneM?: number; recepages: number }): number {
  if (!estTrogne(tree)) return 0;
  const avancement = Math.min(1, Math.max(0, (tree.recepages - 1) / (CAVITE_PLEINE_ETETAGES - 1)));
  return volumeTeteL(tree) * CAVITE_PART_MAX * avancement;
}

/**
 * Ce que la tête vaut en arbre-habitat ∈ [0,1] (biodiversite.ts).
 *
 * Continu, là où le seuil d'avant était binaire : c'est toute la différence
 * entre « cet arbre est un habitat » et « cet arbre offre tant de litres de
 * creux », et la seconde formulation est la seule qui distingue un têtard de
 * trois coupes d'un têtard centenaire.
 */
export function partHabitatDeTrogne(tree: { teteTrogneM?: number; recepages: number }): number {
  return Math.min(1, volumeCaviteL(tree) / CAVITE_HABITAT_L);
}
