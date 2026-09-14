/**
 * Le marché du bois : un prix qui bouge, et qui s'effondre quand tout le monde
 * vend en même temps.
 *
 * Les prix du moteur étaient FIXES — 35 €/m³ pour le chauffage, une valeur par
 * espèce pour l'œuvre, quelle que soit l'année et quelle que soit la quantité
 * mise sur le marché. C'est faux de deux façons, et les deux comptent pour un
 * gestionnaire.
 *
 * ─── LE CYCLE ────────────────────────────────────────────────────────────────
 * L'indice des prix des bois sur pied en forêt privée française a fait **+7 %
 * en 2024, −4 % en 2025, et +46 % depuis 2020** (Observatoire économique France
 * Bois Forêt). Les écarts par essence sont plus larges encore sur une seule
 * année : le douglas a pris 24 % et le peuplier 26 % en 2024, quand le chêne
 * reculait de 3 %.
 *
 * Des variations annuelles de l'ordre de ±10 %, avec des cycles pluriannuels
 * qui s'additionnent, sont donc la norme et non l'accident. C'est ce que rend
 * l'indice ci-dessous.
 *
 * ─── L'ENGORGEMENT ───────────────────────────────────────────────────────────
 * Et surtout : **le prix s'effondre quand tout le monde vend en même temps.**
 * C'est ce que la France a vécu après Lothar en 1999 et Klaus en 2009 — des
 * millions de m³ de chablis jetés d'un coup sur un marché qui ne pouvait pas
 * les absorber, et des cours divisés par deux. Pour un gestionnaire, c'est LA
 * raison d'étaler ses coupes : vendre tout son bois la même année, c'est le
 * vendre moins cher.
 *
 * Le moteur ne simule pas le marché national — il simule une parcelle. Ce qu'on
 * modélise ici est donc l'engorgement du débouché LOCAL : au-delà d'un certain
 * volume dans l'année, le prix baisse *(à calibrer : l'ampleur des chutes
 * post-tempête est documentée, le seuil local ne l'est pas)*.
 */

import { rngFloat, rngStateFromSeed } from "./rng";

/** Amplitude du cycle pluriannuel, en part du prix. */
export const AMPLITUDE_CYCLE = 0.18;
/** Durée du cycle long, années. */
export const PERIODE_CYCLE_ANS = 11;
/** Amplitude du bruit annuel, en part du prix. */
export const BRUIT_ANNUEL = 0.08;
/** Bornes de l'indice : le marché bouge, il ne s'envole pas. */
export const INDICE_MIN = 0.6;
export const INDICE_MAX = 1.5;

/**
 * Indice du marché pour une année donnée ∈ [0,6 ; 1,5].
 *
 * Déterministe et dérivé de la graine de la partie : deux parties identiques
 * voient le même marché, et le marché ne PUISE PAS dans le flux aléatoire
 * principal — un mécanisme qui y prendrait un nombre décalerait tous les
 * suivants et ferait basculer les conclusions écologiques du dépôt.
 */
export function indiceDuMarche(grainePartie: number, annee: number): number {
  const cycle = AMPLITUDE_CYCLE * Math.sin((2 * Math.PI * annee) / PERIODE_CYCLE_ANS);
  // Une graine par (partie, année) : le bruit d'une année ne dépend pas de
  // l'ordre dans lequel on l'interroge.
  const graine = (grainePartie * 2654435761 + annee * 40503) >>> 0;
  const bruit = (rngFloat(rngStateFromSeed(graine)).value * 2 - 1) * BRUIT_ANNUEL;
  return Math.min(INDICE_MAX, Math.max(INDICE_MIN, 1 + cycle + bruit));
}

/**
 * Volume vendu dans l'année au-delà duquel le débouché local sature, m³.
 *
 * Une parcelle d'un hectare bien conduite produit quelques m³ par an. Vendre
 * dix fois cela d'un coup, c'est chercher un acheteur pour un lot que le marché
 * local n'attendait pas *(à calibrer)*.
 */
export const VOLUME_SANS_DECOTE_M3 = 30;
/** Part du prix qu'on garde au pire de l'engorgement. */
export const PLANCHER_ENGORGEMENT = 0.5;
/** Volume auquel on atteint ce plancher, m³. */
export const VOLUME_ENGORGEMENT_MAX_M3 = 200;

/**
 * Ce que vaut encore le prix quand on a déjà vendu `dejaVenduM3` cette année.
 *
 * Décroissance linéaire entre le seuil et le plancher : ce n'est pas la forme
 * exacte d'un marché — un vrai débouché sature plus brutalement — mais elle a
 * le mérite d'être continue, donc de ne pas créer de falaise qu'un joueur
 * pourrait raser au m³ près.
 */
export function decoteEngorgement(dejaVenduM3: number): number {
  if (dejaVenduM3 <= VOLUME_SANS_DECOTE_M3) return 1;
  const part =
    (dejaVenduM3 - VOLUME_SANS_DECOTE_M3) / (VOLUME_ENGORGEMENT_MAX_M3 - VOLUME_SANS_DECOTE_M3);
  return Math.max(PLANCHER_ENGORGEMENT, 1 - (1 - PLANCHER_ENGORGEMENT) * Math.min(1, part));
}
