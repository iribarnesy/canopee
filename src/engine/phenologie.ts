/**
 * Phénologie foliaire : quand les feuilles sortent, et quand elles tombent
 * (docs/regles.md §7.2).
 *
 * Le moteur travaillait avec un booléen — `leavesOn = tMean > 6 °C` — et
 * faisait tomber toute la litière en une semaine. Deux couperets, et le premier
 * était en plus IDENTIQUE POUR TOUTES LES ESPÈCES : un bouleau et un frêne
 * débourraient le même jour, ce qui est faux de six semaines. Or l'ordre de
 * débourrement est un fait de terrain massif — c'est lui qui décide de qui
 * profite de la lumière d'avril sous un couvert encore nu.
 *
 * Le modèle retenu combine les deux commandes que la littérature donne comme
 * indissociables :
 *
 *  - le FORÇAGE : un cumul de degrés-jours base 5 °C depuis le 1ᵉʳ janvier,
 *    propre à chaque espèce ;
 *  - la PHOTOPÉRIODE : un seuil de durée du jour en dessous duquel rien ne
 *    part, quelle que soit la chaleur.
 *
 * Le second n'est pas un raffinement : sans lui, le modèle est absurde au sud.
 * Notre propre série le montre — au 12 avril, la lande girondine a cumulé
 * 341 °C·j quand le limon du Nord n'en a que 123. Un seuil de forçage seul
 * ferait donc débourrer les Landes six semaines avant le Nord, là où l'écart
 * réel est de deux à trois. C'est précisément ce que la photopériode empêche,
 * et c'est pourquoi le hêtre, le chêne et l'épicéa y sont notoirement
 * sensibles : elle ne se réchauffe pas, elle.
 *
 * L'automne suit la même logique en sens inverse : la sénescence part quand le
 * jour raccourcit sous un seuil, et l'étalement fait tomber la litière sur un
 * mois au lieu d'une semaine.
 *
 * *Ce qui n'est pas modélisé* : le besoin de FROID (chilling) qui doit être
 * satisfait avant que le forçage ne compte. Sans lui, un hiver anormalement
 * doux avance le débourrement là où, en réalité, il le retarde. La limite
 * porte sur les scénarios les plus chauds de fin de siècle.
 */

import type { EspeceV0 } from "./especes";

/** Sur combien de degrés-jours le feuillage se déploie, une fois parti. */
export const ETALEMENT_DEBOURREMENT_DJ = 90;
/** Durée du jour à partir de laquelle la sénescence s'enclenche, heures. */
export const SEUIL_SENESCENCE_H = 11.5;
/** Semaines sur lesquelles les feuilles tombent une fois la sénescence lancée. */
export const ETALEMENT_CHUTE_SEMAINES = 5;
/** Largeur de la porte photopériodique, heures : elle ne s'ouvre pas d'un coup. */
export const LARGEUR_PORTE_H = 1.2;

/**
 * Part du feuillage déployé ∈ [0,1] pour une espèce donnée.
 *
 * `ddYearBase5` est le cumul de degrés-jours depuis le 1ᵉʳ janvier,
 * `dureeJourH` la durée du jour de la semaine, `automne` true après le
 * solstice d'été (c'est le raccourcissement qui déclenche, pas la durée seule :
 * onze heures de jour en mars ne veulent pas dire la même chose qu'en octobre).
 */
export function partFoliaire(
  espece: EspeceV0,
  ddYearBase5: number,
  dureeJourH: number,
  automne: boolean,
  semainesDepuisSenescence: number,
): number {
  // Les sempervirents gardent leur feuillage : ni débourrement ni chute.
  if (!espece.lumiere.caduc) return 1;

  if (automne) {
    if (dureeJourH > SEUIL_SENESCENCE_H) return 1;
    return Math.max(0, 1 - semainesDepuisSenescence / ETALEMENT_CHUTE_SEMAINES);
  }

  const pheno = espece.phenologie;
  // Forçage : le cumul de chaleur depuis janvier.
  const forcage = Math.min(
    1,
    Math.max(0, (ddYearBase5 - pheno.debourrementDJ) / ETALEMENT_DEBOURREMENT_DJ),
  );
  // Porte photopériodique : tant que le jour est trop court, rien ne part.
  const porte = Math.min(1, Math.max(0, (dureeJourH - pheno.seuilJourH) / LARGEUR_PORTE_H));
  return Math.min(forcage, porte);
}

/**
 * Part du feuillage MOYENNE d'un peuplement, pour les usages qui n'ont pas
 * d'espèce sous la main (l'ombre au sol se calcule arbre par arbre, mais le
 * calendrier de la litière est commun).
 */
export function senescenceEnCours(dureeJourH: number, automne: boolean): boolean {
  return automne && dureeJourH <= SEUIL_SENESCENCE_H;
}
