/**
 * **Le givre** : le sol blanchi d'une semaine qui a gelé (#130, lot L10).
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **la nuit la plus froide de la semaine**, `weather.tMinAbsC` ;
 * - **ce que le couvert en retient** : le moteur tamponne ce minimum sous les
 *   houppiers (`tMinimumSousCouvert`, `microclimat.ts`), à la mesure de la
 *   fermeture que la lumière au sol trahit (`fermetureDuCouvert`). C'est la
 *   même fonction qui décide, dans le tick, si les fleurs d'un fruitier ont
 *   gelé. Le rendu l'**appelle**, il ne la refait pas.
 *
 * Une cellule blanchit donc quand la nuit y est passée sous zéro, et c'est la
 * définition d'une gelée. Sous une futaie fermée, le même froid ne blanchit
 * rien : la forêt protège du gel, et le moteur le sait.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * **Le givre est un état de la semaine, pas une animation.** Le premier jet le
 * faisait fondre en trois secondes au début de chaque semaine — un matin qui
 * se lève. Le retour de jeu : un sol qui passe du blanc au vert sans qu'on
 * sache pourquoi, chaque semaine d'hiver, et dès l'ouverture de la partie
 * (janvier gèle). Une animation qu'on ne comprend pas est pire que pas
 * d'animation. Le givre reste donc toute la semaine qui a gelé, **léger** — une
 * gelée blanche n'est pas de la neige —, et le bandeau dit « gel » à côté de la
 * température : on voit le blanc et on lit pourquoi.
 *
 * **Un seul calque, et non un carreau par cellule.** Des carreaux
 * semi-transparents qui débordent l'un sur l'autre se recouvrent sur leurs
 * bords, deux fois plus opaques : sur une friche gelée d'un bout à l'autre, cela
 * dessinait un quadrillage gris-bleu. La scène pose des losanges opaques et
 * règle l'opacité du calque entier (`givrer`).
 */

import { fermetureDuCouvert, tMinimumSousCouvert } from "../../engine/microclimat";
import type { Teinte } from "../palette";

/** La teinte du givre : un blanc un peu bleu, celui d'une gelée blanche. */
export const TEINTE_DU_GIVRE: Teinte = { r: 236, g: 242, b: 248 };
/**
 * Opacité du calque de givre sous une nuit franchement gelée. Les brins sont
 * des traits fins : même presque opaques, ils laissent voir le sol entre eux.
 */
export const OPACITE_DU_GIVRE = 0.75;
/** Opacité du voile posé sous les brins, en part de celle du calque : la terre blanchit à peine. */
export const VOILE_SOUS_LES_BRINS = 0.45;
/**
 * Opacité du voile quand les brins sont trop petits pour être posés : de loin,
 * c'est lui seul qui dit que la parcelle a blanchi.
 */
export const VOILE_SANS_BRINS = 1;
/**
 * **La hauteur d'un brin givré, m** (#357) — celle des touffes du tapis
 * (`terrain.ts`, une trentaine de centimètres).
 *
 * Le moteur ne publie pas la hauteur du tapis herbacé : il en donne la
 * couverture, la biomasse et l'humidité, pas la taille. C'est donc une
 * convention de dessin, la même pour toute la parcelle — mais en mètres, à
 * l'échelle des arbres, et un semis de 0,7 m dépasse franchement l'herbe gelée.
 */
export const HAUTEUR_DU_BRIN_GIVRE_M = 0.25;
/**
 * Combien le décor blanchit sous une gelée, rapporté à l'opacité du givre de la
 * parcelle (#355). Autant que la parcelle : c'est la même nuit et la même
 * lecture de la météo. Le décor n'a pas de brins, sa teinte dit la gelée.
 */
export const GIVRE_SUR_LE_DECOR = 1;
/**
 * Degrés sous zéro auxquels le givre est plein, °C. Une nuit à −0,5 °C ne fait
 * qu'une gelée légère : le blanc monte avec le froid, jusqu'à ce seuil.
 */
export const GEL_FRANC_C = 4;

/** Une cellule qui a gelé cette semaine, et de combien sous zéro. */
export interface CelluleGelee {
  cellule: number;
  /** ∈ ]0,1] : la part du blanc plein */
  force: number;
}

/**
 * Les cellules où la nuit la plus froide est passée sous zéro, **au sol**.
 *
 * Une fois par instantané : c'est un balayage de la grille, pas un calcul par
 * image.
 */
export function cellulesGelees(tMinAbsC: number, lumiereAuSol: ArrayLike<number>): CelluleGelee[] {
  const sorties: CelluleGelee[] = [];
  for (let i = 0; i < lumiereAuSol.length; i++) {
    const t = tMinimumSousCouvert(tMinAbsC, fermetureDuCouvert(lumiereAuSol[i] ?? 1));
    if (t >= 0) continue;
    sorties.push({ cellule: i, force: Math.min(1, -t / GEL_FRANC_C) });
  }
  return sorties;
}

/** Ce que la scène pose : les cellules gelées, celles qui ont de l'herbe, et l'opacité. */
export interface GivreDeLaSemaine {
  cellules: readonly number[];
  /** les cellules gelées où pousse de l'herbe : on y dessine des brins givrés */
  brins: readonly number[];
  opacite: number;
}

/** Couverture herbacée à partir de laquelle une cellule porte des brins givrés. */
export const HERBE_QUI_GIVRE = 0.2;

/**
 * Le givre de la semaine, ou rien.
 *
 * L'opacité suit le froid moyen des cellules gelées : une nuit à −1 °C pose un
 * givre à peine visible, une nuit à −6 °C une vraie gelée blanche. Les brins
 * vont là où l'herbe pousse (`soilHerbe`) : c'est elle qui se couvre de rime ;
 * la terre nue ne reçoit qu'un voile.
 */
export function givreDeLaSemaine(
  gelees: readonly CelluleGelee[],
  herbe?: ArrayLike<number>,
): GivreDeLaSemaine | undefined {
  if (gelees.length === 0) return undefined;
  let force = 0;
  for (const g of gelees) force += g.force;
  force /= gelees.length;
  return {
    cellules: gelees.map((g) => g.cellule),
    brins: gelees.filter((g) => (herbe?.[g.cellule] ?? 1) >= HERBE_QUI_GIVRE).map((g) => g.cellule),
    opacite: OPACITE_DU_GIVRE * (0.4 + 0.6 * force),
  };
}
