/**
 * Le microclimat sous couvert : un couvert ne fait pas que de l'ombre, il
 * TAMPONNE la température.
 *
 * Le moteur savait déjà qu'une litière reste humide sous les arbres. Il ignorait
 * l'autre moitié du microclimat forestier, pourtant la mieux mesurée : sous un
 * couvert, les jours sont plus frais, les nuits plus douces, et les extrêmes
 * rabotés des deux côtés. C'est ce qui permet à un semis de survivre là où le
 * plein découvert le grillerait, et c'est ce qui protège une floraison d'un gel
 * tardif.
 *
 * ─── LES CHIFFRES ────────────────────────────────────────────────────────────
 * De Frenne et al. (2019), « Global buffering of temperatures under forest
 * canopies », *Nature Ecology & Evolution* 3:744-749 — méta-analyse de 98 sites,
 * 74 études, cinq continents, 714 paires de mesures intérieur de forêt / milieu
 * ouvert adjacent :
 *
 *   température MAXIMALE   −4,1 ± 0,5 °C   (la forêt est plus fraîche le jour)
 *   température MOYENNE    −1,7 ± 0,3 °C
 *   température MINIMALE   +1,1 ± 0,2 °C   (la forêt est plus douce la nuit)
 *
 * Toutes à p < 0,001. L'écart se creuse quand le climat général devient plus
 * extrême — ce qui en fait un mécanisme d'autant plus important à mesure que le
 * scénario climatique se réchauffe.
 *
 * Un suivi indépendant en forêt tempérée donne le même ordre : +7,8 °C de
 * maximum journalier moyen et 24 points d'humidité de l'air en moins en
 * peuplement ouvert par rapport au fermé (Breigenzer et al. 2026, *Fire
 * Ecology* 22:72).
 *
 * ─── CE QU'ON EN FAIT, ET CE QU'ON N'EN FAIT PAS ─────────────────────────────
 * Le tampon s'applique proportionnellement à la FERMETURE du couvert au-dessus
 * du point considéré — pas de seuil, pas de cas particulier : un arbre en plein
 * découvert ne gagne rien, un semis sous futaie fermée gagne tout.
 *
 * *(Limite assumée : les chiffres de De Frenne portent sur des moyennes de
 * maxima et de minima, pas sur les extrêmes absolus. Pour un gel radiatif — la
 * nuit claire et calme où le couvert compte le plus — le tampon réel est
 * probablement PLUS grand que 1,1 °C, puisque c'est précisément le rayonnement
 * nocturne vers le ciel que le couvert intercepte. On reste sur la valeur
 * publiée plutôt que d'extrapoler.)*
 */

/** Ce que le couvert fermé retire au maximum journalier, °C. */
export const TAMPON_MAXIMUM_C = 4.1;
/** Ce qu'il retire à la moyenne, °C. */
export const TAMPON_MOYENNE_C = 1.7;
/** Ce qu'il AJOUTE au minimum, °C : la nuit, la forêt est plus douce. */
export const TAMPON_MINIMUM_C = 1.1;

/** Fermeture du couvert au-dessus d'un point, d'après la lumière qu'il reçoit. */
export function fermetureDuCouvert(lumiereRecue: number): number {
  return borne(1 - lumiereRecue);
}

function borne(part: number): number {
  return Math.min(1, Math.max(0, part));
}

/** Température moyenne ressentie sous un couvert de cette fermeture. */
export function tMoyenneSousCouvert(tOuvertC: number, fermeture: number): number {
  return tOuvertC - TAMPON_MOYENNE_C * borne(fermeture);
}

/** Minimum nocturne ressenti sous un couvert : la forêt protège du gel. */
export function tMinimumSousCouvert(tOuvertC: number, fermeture: number): number {
  return tOuvertC + TAMPON_MINIMUM_C * borne(fermeture);
}

/** Maximum diurne ressenti sous un couvert : la forêt protège de la canicule. */
export function tMaximumSousCouvert(tOuvertC: number, fermeture: number): number {
  return tOuvertC - TAMPON_MAXIMUM_C * borne(fermeture);
}
