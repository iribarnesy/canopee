/**
 * **La brume de fond de vallon** : une nappe basse là où l'eau du sol affleure
 * (#130, lot L10).
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **où** : les cellules où la nappe **affleure**. Le moteur tient sa
 *   profondeur sous chaque cellule (`soilNappeCm`), et zéro veut dire qu'elle
 *   est à la surface (`nappe.ts`). C'est le moteur qui décide, pas un seuil
 *   d'ici : un creux mouillé respire, une butte sèche non.
 * - **combien de temps elle tient** : le vent que le site reçoit
 *   (`ventRecuParLeSite`). Une brise la chasse ; un matin calme la garde.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * **La brume est un matin**, comme le givre : elle est là au début de
 * l'ellipse de la semaine et se lève en quelques secondes. Le moteur ne
 * connaît ni l'humidité de l'air ni l'heure. Il dit où l'eau est au ras du
 * sol, et c'est là qu'une nappe de brume se pose quand elle se pose. Le rendu
 * ne dit pas qu'elle y reste toute la semaine.
 */

import { hacher } from "../hachage";
import type { Teinte } from "../palette";

/** La teinte de la brume : le blanc gris de l'air mouillé. */
export const TEINTE_DE_LA_BRUME: Teinte = { r: 214, g: 220, b: 222 };
/** Opacité d'une nappe de brume par un matin sans vent. */
export const OPACITE_DE_LA_BRUME = 0.42;
/** Temps que la brume met à se lever sans vent, en temps d'ellipse, ms. */
export const LEVEE_DE_LA_BRUME_MS = 6000;
/** Vent reçu qui chasse la brume d'un coup, m/s : une bonne brise. */
export const VENT_QUI_CHASSE_MS = 6;

/** Les cellules où la nappe affleure. Une fois par instantané. */
export function cellulesAffleurantes(nappeCm: ArrayLike<number>): number[] {
  const sorties: number[] = [];
  for (let i = 0; i < nappeCm.length; i++) {
    if ((nappeCm[i] ?? Number.POSITIVE_INFINITY) <= 0) sorties.push(i);
  }
  return sorties;
}

/** Une bouffée de brume posée au ras du sol, en mètres de parcelle. */
export interface BouffeeDeBrume {
  x: number;
  y: number;
  /** rayon au sol, m */
  rayonM: number;
  opacite: number;
}

/**
 * Part des cellules affleurantes qui portent une bouffée. Chacune est plus
 * large qu'une cellule : une sur trois suffit à couvrir le creux sans poser
 * quatre mille sprites.
 */
export const PART_DES_BOUFFEES = 0.34;
/** Rayon d'une bouffée, m : deux mètres, pour qu'elles se fondent entre elles. */
export const RAYON_DES_BOUFFEES_M = 2.2;

/**
 * La brume à cet instant de l'ellipse, bouffée par bouffée.
 *
 * **Des bouffées parmi les arbres et non un voile sur le sol**, et c'est une
 * leçon de la capture. Posée dans la couche des voiles, sous les arbres, la
 * brume d'un creux boisé disparaissait sous les houppiers : or c'est justement
 * au pied des arbres qu'une nappe de brume se voit, et elle noie les troncs.
 * Chaque bouffée prend donc sa place dans l'ordre du peintre, comme une bête :
 * elle voile l'arbre de derrière, et celui de devant la cache.
 *
 * Le vent raccourcit la levée et amincit la nappe : par six mètres par
 * seconde, il n'y a pas de brume à montrer.
 */
export function brumeEnCours(
  affleurantes: readonly number[],
  coteM: number,
  ventRecuMs: number,
  ecouleMs: number,
): BouffeeDeBrume[] {
  const calme = 1 - Math.min(1, Math.max(0, ventRecuMs) / VENT_QUI_CHASSE_MS);
  if (affleurantes.length === 0 || calme <= 0 || ecouleMs < 0) return [];
  const levee = LEVEE_DE_LA_BRUME_MS * (0.4 + 0.6 * calme);
  if (ecouleMs >= levee) return [];
  const sorties: BouffeeDeBrume[] = [];
  for (const cellule of affleurantes) {
    if (hacher(cellule, 2, 0xb210) >= PART_DES_BOUFFEES) continue;
    // Elle ne se lève pas partout d'un coup : chaque bouffée a son instant,
    // et la nappe se déchire par lambeaux.
    const fin = levee * (0.6 + 0.4 * hacher(cellule, 0, 0xb20e));
    const reste = 1 - ecouleMs / fin;
    if (reste <= 0) continue;
    sorties.push({
      x: (cellule % coteM) + hacher(cellule, 3, 0xb211),
      y: Math.floor(cellule / coteM) + hacher(cellule, 4, 0xb212),
      rayonM: RAYON_DES_BOUFFEES_M * (0.8 + 0.4 * hacher(cellule, 1, 0xb20f)),
      opacite: OPACITE_DE_LA_BRUME * calme * Math.min(1, reste * 1.4),
    });
  }
  return sorties;
}
