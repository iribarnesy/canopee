/**
 * Les aides publiques, et l'hypothèse qu'on gèle pour pouvoir en parler.
 *
 * ─── L'AVERTISSEMENT D'ABORD ─────────────────────────────────────────────────
 * **Les règles ci-dessous sont FIGÉES, et la réalité ne l'est pas.** La PAC se
 * renégocie tous les cinq à sept ans, ses montants sont révisés en cours de
 * programmation, et les enveloppes régionales varient. Ce module prend les
 * règles de la programmation 2023-2027 françaises, suppose qu'elles ne bougent
 * plus, et le dit — parce qu'un jeu qui simule deux siècles avec la PAC de 2023
 * ment forcément, et qu'il vaut mieux mentir en le disant.
 *
 * Ce qu'on garde de vrai malgré le gel : la STRUCTURE de l'arbitrage. Une aide
 * à l'hectare conditionnée à un plafond d'arbres, un bonus pour les
 * infrastructures agroécologiques, un autre pour les haies. Ces trois leviers
 * existent sous une forme ou une autre depuis vingt ans et existeront encore ;
 * ce sont les montants qui bougent.
 *
 * ─── LA RÈGLE QUI FAIT LA DÉCISION ───────────────────────────────────────────
 * Une parcelle agroforestière reste éligible aux aides surfaciques tant qu'elle
 * porte **au plus 100 arbres par hectare** — plafond maintenu pour 2023-2027.
 * Au-delà, ce n'est plus une parcelle agricole avec des arbres, c'est un
 * boisement : elle sort du régime, et l'aide avec elle.
 *
 * C'est le seul endroit du jeu où planter un arbre de plus peut coûter de
 * l'argent, et c'est un vrai arbitrage de terrain.
 *
 * ─── LES MONTANTS RETENUS ────────────────────────────────────────────────────
 * Aide de base au revenu (ex-DPB) : moyenne visée de **127 €/ha** en 2023,
 * contre 114 en 2021 — la convergence continue sur la programmation, on prend
 * la valeur cible.
 *
 * Écorégime, voie des pratiques : **54 €/ha** au niveau de base et **76 €/ha**
 * au niveau supérieur. Le niveau supérieur est acquis à partir de **10 %**
 * d'infrastructures agroécologiques ou de jachères sur la surface.
 *
 * Bonus haies : **7 €/ha**, en présence d'au moins **6 %** de haies et sous
 * certification de gestion durable. *(Une source donne 20 €/ha ; les documents
 * départementaux consultés donnent 7 €/ha sous certification. On retient 7 et
 * on signale l'écart — à confirmer.)*
 */

/** Densité au-delà de laquelle la parcelle n'est plus agricole mais boisée. */
export const DENSITE_MAX_AGROFORESTERIE_PAR_HA = 100;
/** Aide de base au revenu, €/ha/an. */
export const AIDE_BASE_REVENU_EUR_HA = 127;
/** Écorégime, niveau de base, €/ha/an. */
export const ECOREGIME_BASE_EUR_HA = 54;
/** Écorégime, niveau supérieur, €/ha/an. */
export const ECOREGIME_SUPERIEUR_EUR_HA = 76;
/** Bonus haies, €/ha/an. */
export const BONUS_HAIES_EUR_HA = 7;
/** Part d'infrastructures agroécologiques ouvrant le niveau supérieur. */
export const PART_IAE_NIVEAU_SUPERIEUR = 0.1;
/** Part de haies ouvrant le bonus. */
export const PART_HAIES_BONUS = 0.06;

/** Le détail d'une année d'aides, pour pouvoir le RACONTER au joueur. */
export interface AidesAnnuelles {
  /** total versé, € */
  totalEur: number;
  /** la parcelle est-elle encore une parcelle agricole aux yeux de la PAC ? */
  eligible: boolean;
  baseEur: number;
  ecoregimeEur: number;
  bonusHaiesEur: number;
  /** densité constatée, arbres/ha — c'est elle qui décide de l'éligibilité */
  densiteParHa: number;
  /** part d'infrastructures agroécologiques constatée ∈ [0,1] */
  partIae: number;
}

/**
 * Ce que la parcelle touche cette année.
 *
 * `partIae` est la part de la surface occupée par des infrastructures
 * agroécologiques — couvert arboré, eau, bandes enherbées. Le moteur la mesure
 * par le couvert, ce qui est une approximation : la PAC compte des LINÉAIRES de
 * haies convertis en surface équivalente, pas une projection de houppiers
 * *(approximation assumée)*.
 */
export function aidesAnnuelles(
  surfaceHa: number,
  arbresVivants: number,
  partIae: number,
): AidesAnnuelles {
  const densiteParHa = surfaceHa > 0 ? arbresVivants / surfaceHa : 0;
  const eligible = densiteParHa <= DENSITE_MAX_AGROFORESTERIE_PAR_HA;
  if (!eligible) {
    return {
      totalEur: 0,
      eligible: false,
      baseEur: 0,
      ecoregimeEur: 0,
      bonusHaiesEur: 0,
      densiteParHa,
      partIae,
    };
  }
  const baseEur = AIDE_BASE_REVENU_EUR_HA * surfaceHa;
  const ecoregimeEur =
    (partIae >= PART_IAE_NIVEAU_SUPERIEUR ? ECOREGIME_SUPERIEUR_EUR_HA : ECOREGIME_BASE_EUR_HA) *
    surfaceHa;
  const bonusHaiesEur = partIae >= PART_HAIES_BONUS ? BONUS_HAIES_EUR_HA * surfaceHa : 0;
  return {
    totalEur: baseEur + ecoregimeEur + bonusHaiesEur,
    eligible: true,
    baseEur,
    ecoregimeEur,
    bonusHaiesEur,
    densiteParHa,
    partIae,
  };
}
