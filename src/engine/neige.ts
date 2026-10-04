/**
 * **La neige** : la part de la précipitation qui tombe solide, le manteau qui
 * la garde d'une semaine à l'autre, et la fonte qui la rend au sol (#303).
 *
 * `WeekWeather.rainMm` est **toute** la précipitation de la semaine. Le bilan
 * d'eau la recevait la semaine même, qu'il ait plu ou neigé. Une neige de
 * janvier rechargeait donc le sol en janvier, alors qu'elle attend le redoux :
 * c'est quand elle fond qu'elle doit recharger le sol.
 *
 * ── **trois lois** ──────────────────────────────────────────────────────────────
 *
 * 1. **Le partage pluie/neige** : toute la précipitation tombe en neige sous
 *    0 °C, toute en pluie au-dessus de 2 °C, et la part solide décroît
 *    linéairement entre les deux. La rampe est centrée sur 1,0 °C, le seuil
 *    moyen où pluie et neige tombent aussi souvent l'une que l'autre sur les
 *    stations de l'hémisphère nord (Jennings et al. 2018, *Nature
 *    Communications* 9 : 1148 ; 95 % des stations entre −0,4 et 2,4 °C, les
 *    climats maritimes plutôt dans le bas). Ce seuil est mesuré sur la
 *    température de l'air **au moment** de l'observation, et on l'applique à une
 *    moyenne *(à confirmer)*. La **largeur** de la rampe, deux degrés, est une
 *    convention *(à confirmer)*.
 *
 * 2. **La fonte** suit les degrés-jours : le manteau perd `FACTEUR_FONTE`
 *    millimètres d'eau par jour et par degré au-dessus de 0 °C. C'est la méthode
 *    que recense Hock (2003, *J. Hydrol.* 282 : 104-115). Les facteurs qu'elle
 *    rassemble viennent surtout de la montagne et des glaciers, à découvert, et
 *    elle note qu'ils baissent sous forêt, où l'ombre et l'abri du vent
 *    retiennent l'énergie : ils ne valent donc ni pour la plaine, ni sous un
 *    couvert. Le facteur retenu est celui que Kuusisto (1980, *Nordic
 *    Hydrology* 11 : 235-242) a mesuré en plaine, sur vingt ans (1959-1978) et
 *    douze stations finlandaises : **3,51 mm/°C/j à découvert**, 2,42 sous
 *    forêt. C'est la valeur **à découvert**, et c'est un choix : voir plus bas.
 *
 * 3. **Le manteau** est un stock : ce qui tombe solide s'y ajoute, ce qui fond
 *    en sort et part au sol **cette semaine-là**, avec la pluie.
 *
 * ── **de la journée à la semaine** ──────────────────────────────────────────────
 *
 * Les deux lois sont journalières ; le moteur ne connaît que la semaine, et on
 * les applique à sa température **moyenne**. C'est exact tant que les sept
 * journées restent du même côté de chaque coude des deux lois — une moyenne de
 * droites est la droite de la moyenne —, et c'est faux dans les semaines qui
 * mêlent des jours froids et des jours doux : une semaine à 3 °C qui a eu deux
 * jours de gel ne neige pas, une semaine à −1 °C qui a eu un redoux ne fond pas.
 *
 * Une variante qui étalait les journées a été écrite et mesurée, et elle est
 * écartée. Elle supposait les moyennes journalières réparties uniformément
 * autour de la moyenne de la semaine, sur l'écart que la nuit la plus froide
 * (`tMinAbsC`) creuse sous la moyenne des nuits. Sur les soixante ans de séries
 * réelles, elle faisait neiger 12,5 mm par an au Luc, la station de la subéraie
 * des Maures, et plus de cinq semaines par an y portaient un peu de neige ; la
 * moyenne seule en donne 1,7 mm, et une semaine de neige tous les trois ou
 * quatre ans. La raison est physique : **la nuit la plus froide d'une**
 * **semaine est une nuit claire, donc sèche**. L'écart qu'elle mesure est celui
 * des jours où il ne tombe rien ; les jours de précipitation, nuageux, ont un
 * faible écart diurne et suivent la moyenne. Étaler la précipitation sur cet
 * écart, c'est faire neiger un jour de ciel bleu.
 *
 * Conséquence voulue : une semaine dont la moyenne reste au-dessus de 2 °C ne
 * neige **rien**, exactement, et une station sans semaine froide traverse ce
 * module sans qu'un seul bit du bilan d'eau ne bouge.
 *
 * ── **ce que ce module ne fait pas** ────────────────────────────────────────────
 *
 *  - Le manteau est **un** pour la parcelle. Les houppiers en interceptent une
 *    part, qui se sublime sans jamais toucher le sol, et leur ombre ralentit la
 *    fonte (le facteur de Kuusisto baisse de 0,16 mm/°C/j par dix points de
 *    couvert). Les deux effets jouent en sens contraire ; n'en coder qu'un
 *    serait pire que n'en coder aucun. D'où le facteur **à découvert** : faute
 *    de savoir ce que le couvert intercepte, on prend la parcelle telle
 *    qu'elle est au départ de la plupart des parties, une friche ou un champ.
 *    Passer à la cellule demanderait trois choses : un manteau par cellule
 *    (une grille du sol, donc une grille de plus dans la sauvegarde) ; une
 *    interception lue sur la lumière au sol que le moteur calcule déjà, avec
 *    une loi sourcée pour la part qui se sublime *(à trouver)* ; et un facteur
 *    de fonte qui glisse de 3,51 à 2,42 avec la fermeture du couvert
 *    (Kuusisto). La conservation resterait la même, cellule par cellule.
 *  - Ni sublimation, ni regel de l'eau de fonte, ni eau liquide retenue dans le
 *    manteau, ni sol gelé qui refuse l'infiltration, ni pluie qui accélère la
 *    fonte (Kuusisto la voit, surtout en forêt). L'eau se conserve sans eux : ce
 *    qui tombe est au sol, dans le manteau, ou parti.
 */

import type { WeekWeather } from "./meteo";

/**
 * Sous cette température moyenne, toute la précipitation est solide, °C. La
 * rampe est centrée sur 1,0 °C (Jennings et al. 2018) ; sa largeur de deux
 * degrés est une convention *(à confirmer)*.
 */
export const NEIGE_TOUTE_SOUS_C = 0;
/** Au-dessus, toute la précipitation est liquide, °C (même rampe, même source). */
export const PLUIE_TOUTE_AU_DESSUS_C = 2;
/**
 * Facteur de fonte de la neige, mm d'eau par degré-jour au-dessus de
 * `SEUIL_FONTE_C`. Kuusisto (1980) : 3,51 en terrain découvert, moyenne des
 * jalons à découvert sur 1959-1978. La valeur **à découvert** est retenue parce
 * que le manteau est celui de la parcelle, qui n'est pas une forêt fermée.
 */
export const FACTEUR_FONTE_MM_PAR_C_JOUR = 3.51;
/** Température au-dessus de laquelle la neige fond, °C (convention des modèles degré-jour, Hock 2003). */
export const SEUIL_FONTE_C = 0;

/** Ce que la neige fait d'une semaine. */
export interface NeigeDeLaSemaine {
  /** part de `rainMm` tombée en neige, mm d'eau */
  neigeMm: number;
  /** eau rendue par le manteau cette semaine, mm */
  fonteMm: number;
  /** manteau en fin de semaine, mm d'équivalent en eau */
  manteauNeigeMm: number;
  /** ce qui arrive au sol : la pluie, plus la fonte, mm */
  eauLiquideMm: number;
}

/** Part de la précipitation de la semaine qui tombe en neige ∈ [0,1]. */
export function partSolide(w: WeekWeather): number {
  if (w.tMean >= PLUIE_TOUTE_AU_DESSUS_C) return 0;
  if (w.tMean <= NEIGE_TOUTE_SOUS_C) return 1;
  return (PLUIE_TOUTE_AU_DESSUS_C - w.tMean) / (PLUIE_TOUTE_AU_DESSUS_C - NEIGE_TOUTE_SOUS_C);
}

/** Neige tombée cette semaine, mm d'eau. C'est ce que le rendu dessine en flocons. */
export function neigeDeLaSemaine(w: WeekWeather): number {
  const part = partSolide(w);
  return part > 0 ? w.rainMm * part : 0;
}

/** Ce que le manteau pourrait perdre cette semaine s'il était assez épais, mm. */
export function fontePotentielleMm(w: WeekWeather): number {
  return FACTEUR_FONTE_MM_PAR_C_JOUR * 7 * Math.max(0, w.tMean - SEUIL_FONTE_C);
}

/**
 * Une semaine de neige : ce qui tombe solide rejoint le manteau, le manteau
 * fond au degré-jour, et ce qui arrive au sol est la pluie plus la fonte.
 *
 * Entre 0 et 2 °C, il neige **et** il fond la même semaine : la neige de la
 * semaine peut repartir aussitôt, c'est la neige qui ne tient pas. Sans neige
 * et sans manteau, la précipitation passe **telle quelle** — le même nombre, et
 * non une somme qui lui serait égale à l'arrondi près.
 */
export function neigeEtFonte(w: WeekWeather, manteauMm: number): NeigeDeLaSemaine {
  const neigeMm = neigeDeLaSemaine(w);
  if (neigeMm <= 0 && manteauMm <= 0) {
    return { neigeMm: 0, fonteMm: 0, manteauNeigeMm: 0, eauLiquideMm: w.rainMm };
  }
  const stock = manteauMm + neigeMm;
  const fonteMm = Math.min(stock, fontePotentielleMm(w));
  return {
    neigeMm,
    fonteMm,
    manteauNeigeMm: stock - fonteMm,
    eauLiquideMm: w.rainMm - neigeMm + fonteMm,
  };
}
