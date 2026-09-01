/**
 * Lumière spatiale (docs/regles.md §5) : chaque arbre reçoit la lumière qui
 * traverse les couronnes des arbres PLUS HAUTS dont l'ombre couvre sa
 * position (Beer-Lambert par couronne traversée, k = 0,5). L'ombre d'une
 * couronne est décalée vers le NORD (+y) d'une fraction de la hauteur —
 * le soleil est au sud en France : planter en lignes est-ouest ou nord-sud
 * n'a pas le même effet. Les caducs n'ombragent pas hors saison de végétation.
 */

import { getEspece } from "./especes";
import type { TreeState } from "./trees";

const BEER_LAMBERT_K = 0.5;
/** Décalage de l'ombre vers le nord, en fraction de la hauteur (moyenne annuelle, lat ~45°). */
const SHADOW_NORTH_OFFSET = 0.4;

/** Rayon du houppier, m. */
export function crownRadiusM(heightM: number, houppierRatio: number): number {
  return houppierRatio * heightM;
}

/**
 * Lumière relative ∈ [0,1] reçue par chaque arbre vivant (index aligné sur
 * `trees`, 1 pour les morts). `leavesOn` : true si les caducs sont en feuilles.
 * O(n²) borné par les rayons — index spatial quand la régénération multipliera
 * les tiges.
 */
export function computeLight(trees: readonly TreeState[], leavesOn: boolean): number[] {
  const light = trees.map(() => 1);
  for (let i = 0; i < trees.length; i++) {
    const target = trees[i];
    if (!target || !target.alive) continue;
    let extinction = 0;
    for (let j = 0; j < trees.length; j++) {
      if (i === j) continue;
      const shader = trees[j];
      if (!shader || !shader.alive || shader.heightM <= target.heightM) continue;
      const espece = getEspece(shader.especeId);
      if (espece.lumiere.caduc && !leavesOn) continue;
      const r = crownRadiusM(shader.heightM, espece.lumiere.houppierRatio);
      const shadowY = shader.y + SHADOW_NORTH_OFFSET * shader.heightM;
      const dx = target.x - shader.x;
      const dy = target.y - shadowY;
      if (dx * dx + dy * dy <= r * r) {
        extinction += BEER_LAMBERT_K * espece.lumiere.lai;
      }
    }
    light[i] = Math.exp(-extinction);
  }
  return light;
}
