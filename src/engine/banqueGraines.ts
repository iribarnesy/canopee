/**
 * La banque de graines du sol : la mémoire du passé d'une parcelle.
 *
 * Le moteur ne régénérait que par le PRÉSENT — les adultes qui grainent et le
 * voisinage qui ensemence. Une parcelle n'avait donc aucune mémoire : ce qui y
 * avait poussé vingt ans plus tôt n'y laissait rien.
 *
 * C'est faux pour toute une catégorie d'espèces, et c'est même la clé de la
 * dynamique landaise. Une graine de chêne ou de hêtre est RÉCALCITRANTE : elle
 * ne survit pas à un hiver sec, et ne fait aucune mémoire. Mais une graine de
 * légumineuse à tégument dur attend sous terre pendant des décennies, et le feu
 * la réveille.
 *
 * ─── LES CHIFFRES ────────────────────────────────────────────────────────────
 * L'ajonc est le cas le mieux documenté. Sous une lande installée, sa banque
 * compte **500 à 2 000 graines/m²**, et peut atteindre des dizaines de milliers ;
 * les graines restent viables **25 à 30 ans** dans les six premiers centimètres
 * du sol. Le feu ne la détruit pas — le sol isole assez pour que même un feu
 * intense laisse les graines enfouies intactes — mais il SCARIFIE leur tégument,
 * ce qui lève leur dormance. Non scarifiées, ces graines ne germent qu'à des
 * taux faibles (Element Stewardship Abstract, *Ulex europaeus* ; MDPI *Plants*
 * 8:523, « A World of Gorse »).
 *
 * C'est pour cela qu'une lande brûlée revient en lande : l'ajonc ne recolonise
 * pas depuis le voisinage, il remonte du sol sur place, et il y était déjà.
 *
 * ─── LA SIMPLIFICATION ASSUMÉE ───────────────────────────────────────────────
 * La banque est tenue à l'échelle de la PARCELLE, pas de la cellule : un
 * dictionnaire d'espèce vers un stock moyen en graines/m². Une banque par
 * cellule serait plus juste — la mémoire est spatiale, une tache d'ajoncs laisse
 * sa marque là où elle était — mais elle coûterait vingt-cinq champs de dix
 * mille valeurs pour un gain que la taille d'une parcelle de jeu ne justifie
 * pas. *(À lever si le besoin apparaît.)*
 */

import type { EspeceV0 } from "./especes";

/**
 * Graines déposées par an et par adulte mature, ramenées au m² de parcelle.
 *
 * Calé pour qu'une lande d'ajoncs installée atteigne les 500 à 2 000 graines/m²
 * que mesure la littérature : la banque sature d'elle-même quand le dépôt
 * annuel équilibre la perte de viabilité, et cet équilibre-là est le repère.
 *
 * Le chiffre paraît gros pour un pied. Il ne l'est pas : un ajonc mature porte
 * des centaines de gousses et produit des milliers de graines par an. Et
 * surtout, un « adulte » de ce moteur n'est pas un pied de terrain — le moteur
 * manipule des densités de l'ordre du centième de pied au m² là où une vraie
 * lande en compte plusieurs par m². Un adulte du moteur représente donc une
 * TACHE, et son dépôt celui de la tache *(à calibrer)*.
 */
export const DEPOT_PAR_ADULTE_PAR_AN = 1600;

/** Ce qu'une banque perd en un an, par simple perte de viabilité. */
export function survieAnnuelle(persistanceAns: number): number {
  return Math.exp(-1 / Math.max(1, persistanceAns));
}

/**
 * Stock d'équilibre d'une banque alimentée par `adultes` adultes sur `surfaceM2`.
 * Utile pour dire ce que le modèle vise, et pour le vérifier en essai.
 */
export function stockEquilibreParM2(espece: EspeceV0, adultes: number, surfaceM2: number): number {
  const banque = espece.regeneration.banqueGraines;
  if (!banque || surfaceM2 <= 0) return 0;
  const depot = (DEPOT_PAR_ADULTE_PAR_AN * adultes) / surfaceM2;
  const perte = 1 - survieAnnuelle(banque.persistanceAns) + banque.leveeSpontanee;
  return perte <= 0 ? 0 : depot / perte;
}

/**
 * Graines qui lèvent cette année, par m². Le feu scarifie : il fait lever
 * d'un coup une part de banque que rien d'autre n'aurait réveillée.
 */
export function leveeParM2(espece: EspeceV0, stockParM2: number, aBrule: boolean): number {
  const banque = espece.regeneration.banqueGraines;
  if (!banque || stockParM2 <= 0) return 0;
  return stockParM2 * (aBrule ? banque.leveeParLeFeu : banque.leveeSpontanee);
}

/** La banque après une année : ce qui a levé est parti, le reste vieillit. */
export function banqueApresUneAnnee(
  espece: EspeceV0,
  stockParM2: number,
  depotParM2: number,
  aBrule: boolean,
): number {
  const banque = espece.regeneration.banqueGraines;
  if (!banque) return 0;
  const restant = Math.max(0, stockParM2 - leveeParM2(espece, stockParM2, aBrule));
  return restant * survieAnnuelle(banque.persistanceAns) + depotParM2;
}
