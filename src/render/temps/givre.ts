/**
 * **Le givre** : le sol blanchi au petit matin d'une semaine qui a gelé (#130,
 * lot L10).
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
 * **Le givre est un matin, pas un état**, et il fond : au début de l'ellipse
 * de la semaine, il est là ; il s'en va en quelques secondes. Le moteur donne
 * la nuit la plus froide, pas l'heure où elle a eu lieu. Le rendu ne laisse
 * rien derrière lui, comme le voile d'un geste ; ce que le gel a vraiment
 * changé, les fleurs grillées, est déjà dans l'instantané.
 */

import { fermetureDuCouvert, tMinimumSousCouvert } from "../../engine/microclimat";
import { hacher } from "../hachage";
import type { Teinte } from "../palette";
import type { CelluleVoilee } from "./voile";

/** La teinte du givre : un blanc un peu bleu, celui d'une gelée blanche. */
export const TEINTE_DU_GIVRE: Teinte = { r: 236, g: 242, b: 248 };
/** Opacité du givre au lever du jour, sous une nuit franchement gelée. */
export const OPACITE_DU_GIVRE = 0.8;
/** Temps que le givre met à fondre, en temps d'ellipse, ms. */
export const FONTE_DU_GIVRE_MS = 3500;
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

/**
 * Le givre à cet instant de l'ellipse, pour la couche des voiles.
 *
 * **Un carreau et non une tache.** La tache étalée d'une brûlure a été essayée
 * d'abord : sur une friche gelée d'un bout à l'autre, quatre mille taches
 * donnaient un grillage de points gris, pas un sol blanc. Une gelée couvre
 * tout ce qui est à découvert, et c'est un film continu qui le dit. La fonte
 * ne tombe pas partout d'un coup : chaque cellule a son instant, et le blanc
 * s'en va par plaques.
 */
export function givreEnCours(gelees: readonly CelluleGelee[], ecouleMs: number): CelluleVoilee[] {
  if (gelees.length === 0 || ecouleMs >= FONTE_DU_GIVRE_MS || ecouleMs < 0) return [];
  const sorties: CelluleVoilee[] = [];
  for (const g of gelees) {
    // Chaque cellule fond entre 55 % et 100 % de la durée : les plaques
    // restent là où il faisait le plus froid, un peu plus longtemps.
    const fin = FONTE_DU_GIVRE_MS * (0.55 + 0.45 * Math.max(g.force, hacher(g.cellule, 0, 0x61e0)));
    const reste = 1 - ecouleMs / fin;
    if (reste <= 0) continue;
    sorties.push({
      cellule: g.cellule,
      teinte: TEINTE_DU_GIVRE,
      opacite: OPACITE_DU_GIVRE * (0.35 + 0.65 * g.force) * Math.min(1, reste * 1.6),
    });
  }
  return sorties;
}
