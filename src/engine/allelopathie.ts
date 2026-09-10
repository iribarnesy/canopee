/**
 * L'allélopathie : empêcher les autres de pousser chez soi.
 *
 * Le moteur ne connaissait que la concurrence — pour la lumière, l'eau, les
 * minéraux. Or certaines plantes ne se contentent pas de prendre : elles
 * ÉMETTENT. Le noyer libère de la juglone par ses racines et sa litière, et
 * cette molécule inhibe la germination et la croissance de nombreuses espèces
 * dans un rayon de **quinze à vingt mètres** autour de l'arbre.
 *
 * C'est la contrainte classique de l'agroforesterie au noyer, et la première
 * chose qu'on apprend en plantant un verger à côté. Pour ce jeu, elle rend le
 * choix des VOISINS décisif là où, ailleurs, seule la lumière compte.
 *
 * ─── CE QUE DIT LA LITTÉRATURE, ET CE QU'ELLE NE DIT PAS ─────────────────────
 * Elle donne un rayon (15-20 m) et des LISTES : le pommier, le pin, le bouleau
 * et le myrtillier souffrent ; la plupart des graminées, et beaucoup de vivaces
 * de sous-bois, ne bronchent pas. Elle ne donne pas de courbe dose-réponse
 * espèce par espèce, et on ne l'invente pas — les fiches où l'on ne sait pas
 * portent une sensibilité médiane, marquée comme telle.
 *
 * ─── LE SOL DÉCIDE AUTANT QUE L'ARBRE ────────────────────────────────────────
 * « Dans un sol lourd et peu drainé, les concentrations peuvent rester élevées
 * près des racines pendant de longues périodes, tandis qu'un sol sableux
 * facilitera le lessivage et une moindre accumulation. »
 *
 * C'est ce qui permet d'en faire une règle générale plutôt qu'une constante :
 * l'intensité dépend de la TEXTURE du sol, que le moteur connaît déjà. Un noyer
 * sur limon lourd stérilise autour de lui ; le même noyer sur sable est
 * beaucoup moins gênant.
 */

/** Sensibilité retenue quand la littérature ne dit rien de l'espèce. */
export const SENSIBILITE_MEDIANE = 0.5;

/**
 * Part de juglone qui subsiste sur un sol entièrement sableux.
 *
 * Le lessivage n'est jamais total — la molécule est émise en continu tant que
 * l'arbre est là *(à calibrer : la littérature donne le SENS de l'effet du sol,
 * pas son ampleur)*.
 */
export const RETENTION_SUR_SABLE = 0.35;

/**
 * Intensité de l'inhibition subie en un point ∈ [0,1].
 *
 * Décroît linéairement du pied de l'émetteur jusqu'à sa portée, où elle
 * s'annule : pas de falaise, et rien au-delà.
 */
export function intensiteAllelopathique(
  distanceM: number,
  porteeM: number,
  partSable: number,
): number {
  if (porteeM <= 0 || distanceM >= porteeM) return 0;
  const proximite = 1 - distanceM / porteeM;
  const retenu = RETENTION_SUR_SABLE + (1 - RETENTION_SUR_SABLE) * (1 - Math.min(1, partSable));
  return proximite * retenu;
}

/**
 * Facteur de croissance qu'il reste à une plante inhibée ∈ [0,1], au sens de la
 * loi du minimum : il entre dans le tableau des facteurs limitants comme
 * l'eau, la lumière ou l'azote.
 *
 * Une espèce insensible (`sensibilite` = 0) garde 1 quelle que soit
 * l'intensité ; une espèce pleinement sensible collée au tronc tombe à zéro.
 */
export function facteurAllelopathie(intensite: number, sensibilite: number): number {
  return Math.max(
    0,
    1 - Math.min(1, Math.max(0, intensite)) * Math.min(1, Math.max(0, sensibilite)),
  );
}
