/**
 * Mécanisation d'un chantier (docs/regles.md §10).
 *
 * Il n'y a pas un temps de fauche : il y en a deux, et ce qui décide, c'est
 * la façon dont la parcelle est plantée. Un engin a besoin d'un passage. Sur
 * des alignements espacés de quatre mètres, un gyrobroyeur fait l'hectare en
 * deux ou trois heures ; dans une régénération naturelle ou une plantation
 * dense et irrégulière, il n'entre pas, et il reste la débroussailleuse — dix
 * à vingt fois plus lent.
 *
 * D'où un mécanisme plutôt qu'une constante : on mesure la part de la zone
 * réellement accessible à l'engin, en cherchant la meilleure direction de
 * passage. Rien n'est déclaré « mécanisable » : ça se déduit de la position
 * des arbres, donc de ce que le joueur a planté. Planter en ligne devient un
 * choix qui se paie toute la vie du peuplement — c'est exactement pourquoi
 * l'agroforesterie moderne aligne ses arbres.
 */

import type { TreeState } from "./trees";

/** Largeur d'un tracteur avec son outil, m *(à calibrer)*. */
export const LARGEUR_ENGIN_M = 2.2;

/** Marge de sécurité de chaque côté d'un tronc, m : on ne frôle pas les arbres. */
export const DEGAGEMENT_M = 0.35;

/** Directions de passage testées (une demi-rotation suffit, un engin va dans les deux sens). */
const N_DIRECTIONS = 24;

/**
 * Part de la zone (disque) qu'un engin peut travailler, ∈ [0,1].
 *
 * On projette les arbres sur l'axe perpendiculaire à chaque direction de
 * passage : deux arbres proches sur cet axe sont dans le même rang, et ce qui
 * sépare deux rangs est un couloir. La meilleure direction l'emporte — c'est
 * ainsi qu'un alignement se révèle de lui-même, sans qu'on ait à déclarer où
 * sont les rangs.
 */
export function partMecanisable(
  trees: readonly TreeState[],
  cx: number,
  cy: number,
  rayonM: number,
  largeurEngin = LARGEUR_ENGIN_M,
): number {
  const obstacles: { x: number; y: number }[] = [];
  for (const tree of trees) {
    if (!tree.alive) continue;
    const dx = tree.x - cx;
    const dy = tree.y - cy;
    if (dx * dx + dy * dy <= rayonM * rayonM) obstacles.push({ x: dx, y: dy });
  }
  if (obstacles.length === 0) return 1;

  const largeurTotale = 2 * rayonM;
  let meilleure = 0;
  const projections = new Float64Array(obstacles.length);
  for (let d = 0; d < N_DIRECTIONS; d++) {
    const theta = (Math.PI * d) / N_DIRECTIONS;
    // Axe perpendiculaire à la direction de passage : c'est sur lui que se
    // lisent les rangs.
    const ux = -Math.sin(theta);
    const uy = Math.cos(theta);
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o) continue;
      projections[i] = o.x * ux + o.y * uy;
    }
    const tries = Array.from(projections).sort((a, b) => a - b);
    let accessible = 0;
    let bord = -rayonM;
    for (const p of tries) {
      const libre = p - DEGAGEMENT_M - bord;
      if (libre >= largeurEngin) accessible += libre;
      bord = Math.max(bord, p + DEGAGEMENT_M);
    }
    const dernier = rayonM - bord;
    if (dernier >= largeurEngin) accessible += dernier;
    const part = accessible / largeurTotale;
    if (part > meilleure) meilleure = part;
    if (meilleure >= 1) break;
  }
  return Math.min(1, meilleure);
}
