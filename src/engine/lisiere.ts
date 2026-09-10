/**
 * L'effet de bord : ce qu'il y a AUTOUR de la parcelle ombrage ses lisières.
 *
 * Le moteur traitait la limite de parcelle comme une limite du monde : au-delà,
 * rien. Un carré de bocage au milieu d'un massif forestier recevait donc autant
 * de lumière sur ses bords qu'une clairière isolée, ce qui est faux — et faux
 * dans le sens qui compte, puisque la lisière est justement l'endroit où
 * l'agroforesterie se joue.
 *
 * ─── LA GÉOMÉTRIE, ET ELLE N'EST PAS SYMÉTRIQUE ──────────────────────────────
 * Le point qui rend ce mécanisme non trivial : **ce qui vous ombrage est ce qui
 * est au SUD.** Le soleil est au sud en France, les ombres tombent vers le nord
 * (`SHADOW_NORTH_OFFSET`, light.ts), et un bois planté au NORD d'une parcelle ne
 * lui coûte pas une heure de soleil — c'est elle qui l'ombrage, pas l'inverse.
 *
 * Les quatre bordures ne pèsent donc pas pareil. La bordure sud ombrage
 * pleinement la bande qui la longe ; l'est et l'ouest n'ombragent qu'aux
 * extrémités de la journée, quand le soleil est bas et son rayonnement faible ;
 * la bordure nord ne fait rien du tout.
 *
 * ─── LA PROFONDEUR ───────────────────────────────────────────────────────────
 * On reprend la géométrie du moteur plutôt qu'un chiffre importé : un arbre
 * projette son ombre sur `SHADOW_NORTH_OFFSET` fois sa hauteur. Un peuplement
 * de bordure fait donc de même, et la bande ombragée est d'autant plus profonde
 * que le bois voisin est haut.
 *
 * La hauteur du voisin se DÉDUIT de sa part boisée, faute d'être déclarée : un
 * paysage boisé à 90 % est un massif et ombrage comme une futaie ; un bocage
 * boisé à 20 % ombrage comme une haie, parce que c'est une haie. Supposer une
 * futaie mûre autour de toute parcelle, comme le faisait la première version,
 * revenait à mettre vingt mètres d'arbres au bord d'un champ de blé *(à
 * confirmer : l'interpolation est raisonnée, pas mesurée)*.
 */

import type { GridDims } from "./grid";
import { SHADOW_NORTH_OFFSET } from "./light";
import { type Bordures, getPaysage } from "./paysage";

/** Hauteur d'un voisinage à peine boisé : une haie, m. */
export const HAUTEUR_HAIE_M = 5;
/** Hauteur d'un voisinage entièrement boisé : une futaie, m. */
export const HAUTEUR_FUTAIE_M = 20;

/** Hauteur du peuplement voisin, déduite de sa part boisée. */
export function hauteurVoisineM(partBoisee: number): number {
  const part = Math.min(1, Math.max(0, partBoisee));
  return HAUTEUR_HAIE_M + (HAUTEUR_FUTAIE_M - HAUTEUR_HAIE_M) * part;
}

/**
 * Poids d'ombrage de chaque bordure. Le sud porte tout, l'est et l'ouest un
 * tiers — le soleil y est bas et son rayonnement faible — et le nord rien.
 */
export const POIDS_SUD = 1;
export const POIDS_EST_OUEST = 1 / 3;
export const POIDS_NORD = 0;

/** Ce qu'un bord entièrement boisé retire à la lumière, au ras de la limite. */
export const OMBRAGE_MAX_LISIERE = 0.75;

/** Profondeur de la bande ombragée par une bordure, m. */
export function profondeurOmbrageM(partBoisee: number): number {
  return SHADOW_NORTH_OFFSET * hauteurVoisineM(partBoisee);
}

/**
 * Part de lumière qui reste en (x, y) une fois l'entourage pris en compte
 * ∈ [0,1]. Vaut 1 partout où aucune bordure boisée ne porte.
 *
 * L'atténuation décroît linéairement depuis la limite jusqu'à la profondeur
 * d'ombrage : au cœur de la parcelle, l'entourage ne change rien.
 */
export function lumiereApresBordures(
  x: number,
  y: number,
  dims: GridDims,
  bordures: Bordures,
): number {
  // y croît vers le NORD (light.ts) : la bordure sud est donc en y = 0.
  const cotes: [string, number, number][] = [
    [bordures.sud, y, POIDS_SUD],
    [bordures.nord, dims.heightM - y, POIDS_NORD],
    [bordures.ouest, x, POIDS_EST_OUEST],
    [bordures.est, dims.widthM - x, POIDS_EST_OUEST],
  ];
  let ombrage = 0;
  for (const [paysageId, distance, poids] of cotes) {
    if (poids <= 0) continue;
    const partBoisee = getPaysage(paysageId).partBoisee;
    // Chaque côté a SA profondeur : une haie n'ombrage pas aussi loin qu'une
    // futaie, et c'est ce qui distingue un bocage d'un massif.
    const profondeur = profondeurOmbrageM(partBoisee);
    if (profondeur <= 0 || distance >= profondeur) continue;
    const proximite = 1 - Math.max(0, distance) / profondeur;
    ombrage += OMBRAGE_MAX_LISIERE * poids * proximite * partBoisee;
  }
  return Math.max(0, 1 - Math.min(1, ombrage));
}
