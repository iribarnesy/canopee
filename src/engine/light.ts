/**
 * Lumière V0.5 — compétition verticale « parcelle bien mélangée » (docs/regles.md §5).
 * Pas encore de positions : chaque arbre reçoit la lumière qui traverse le
 * feuillage cumulé de tous les arbres PLUS HAUTS que lui (Beer-Lambert,
 * k = 0,5). Les caducs n'ombragent pas hors saison de végétation.
 * V1 : grille spatiale, ombres portées latérales, strates par cellule.
 */

import { getEspece } from "./especes";
import type { TreeState } from "./trees";

const BEER_LAMBERT_K = 0.5;
/**
 * Extinction maximale (saturation douce) : les couronnes se chevauchent au
 * lieu de s'empiler indéfiniment. exp(−4) ≈ 1,8 % de lumière au sol — l'ordre
 * de grandeur mesuré sous hêtraie fermée *(à calibrer)*.
 */
const MAX_EXTINCTION = 4;

/** Surface du houppier, m². */
function crownAreaM2(heightM: number, houppierRatio: number): number {
  const r = houppierRatio * heightM;
  return Math.PI * r * r;
}

/**
 * Lumière relative ∈ [0,1] reçue par chaque arbre vivant (index aligné sur
 * `trees`, 1 pour les morts — sans effet). `leavesOn` : true si les caducs
 * sont en feuilles cette semaine.
 */
export function computeLight(
  trees: readonly TreeState[],
  parcelAreaM2: number,
  leavesOn: boolean,
): number[] {
  // Tri par hauteur décroissante ; cumul de surface foliaire au fur et à mesure.
  const order = trees
    .map((tree, index) => ({ tree, index }))
    .filter(({ tree }) => tree.alive)
    .sort((a, b) => b.tree.heightM - a.tree.heightM);

  const light = trees.map(() => 1);
  let leafAreaAboveM2 = 0;
  for (const { tree, index } of order) {
    // L'arbre reçoit la lumière atténuée par le feuillage strictement au-dessus
    // de lui, avec saturation douce du couvert (chevauchement des couronnes).
    const rawExtinction = (BEER_LAMBERT_K * leafAreaAboveM2) / parcelAreaM2;
    const extinction = MAX_EXTINCTION * (1 - Math.exp(-rawExtinction / MAX_EXTINCTION));
    light[index] = Math.exp(-extinction);
    const espece = getEspece(tree.especeId);
    const shades = leavesOn || !espece.lumiere.caduc;
    if (shades) {
      leafAreaAboveM2 +=
        espece.lumiere.lai * crownAreaM2(tree.heightM, espece.lumiere.houppierRatio);
    }
  }
  return light;
}
