/**
 * L'érosion : le ruissellement n'emporte pas que de l'eau (docs/regles.md §4).
 *
 * Jusqu'ici l'eau descendait la pente en laissant la terre où elle était. Or
 * c'est très exactement le contraire qui fait l'enjeu agroforestier d'un
 * versant : ce qui part en premier, c'est l'horizon de surface, celui qui
 * porte l'humus, l'azote, le phosphore assimilable et la vie du sol. Une
 * parcelle peut perdre sa fertilité sans perdre un gramme d'eau de plus.
 *
 * On garde la **structure** de l'équation universelle de perte en terre (Wischmeier
 * et Smith, puis RUSLE) — une érosivité, une pente, un couvert — mais ramenée
 * au pas de la semaine et à ce que le moteur sait déjà :
 *
 *   terre arrachée = érosivité × ruissellement × √pente × (1 − couverture)²
 *
 * Le carré sur le couvert n'est pas cosmétique : il dit que les premiers
 * pourcents de sol nu coûtent peu et que les derniers coûtent tout. C'est la
 * raison pour laquelle « couvrir le sol » est le premier geste de conservation,
 * avant même les haies.
 *
 * Deux choses distinguent l'érosion d'une simple perte de masse :
 *
 *  - ce qui part est **plus riche** que le sol moyen — la nappe d'eau emporte les
 *    particules fines et les matières organiques légères, pas les cailloux.
 *    C'est le taux d'enrichissement, de 2 à 5 dans la littérature ;
 *  - ce qui part ne disparaît pas forcément : il se **dépose** plus bas dès que
 *    l'eau ralentit, et un sol couvert arrête d'autant mieux les particules.
 *    D'où le colluvium au bas des versants, et l'efficacité des bandes
 *    enherbées et des haies sur courbe de niveau, qui ne sont rien d'autre
 *    qu'un piège à sédiment placé en travers.
 */

import { densiteApparente, type Horizon } from "./soil";

/**
 * Érosivité, kg de terre par m², par mm ruisselé et par racine de pourcent de
 * pente. Calée sur l'ordre de grandeur classique en Europe tempérée : un sol
 * nu à 10 % de pente qui ruisselle 200 mm par an perd environ 10 t/ha/an
 * *(à calibrer)*.
 */
export const EROSIVITE = 0.0016;

/**
 * Enrichissement du sédiment : ce que l'eau emporte est plus riche que le sol
 * qu'elle laisse. Valeur médiane de la fourchette 2-5 *(à calibrer)*.
 */
export const ENRICHISSEMENT = 3;

/** Part du sédiment qui se dépose en arrivant sur une cellule nue. */
export const DEPOT_SOL_NU = 0.2;
/** Part supplémentaire déposée quand la cellule d'arrivée est bien couverte. */
export const DEPOT_PAR_COUVERTURE = 0.7;

/**
 * Plafond de sécurité sur la **charge** : une cellule ne peut pas perdre plus que
 * cette part de ses stocks de surface (humus, azote, P, K) par semaine
 * *(à calibrer)*. Il ne borne pas la **terre** arrachée — celle-ci l'est par ce que
 * l'horizon contient encore (`terreDisponibleKgM2`).
 */
export const PERTE_MAX_PAR_SEMAINE = 0.03;

/**
 * Terre arrachée à une cellule en une semaine, kg/m².
 *
 * `ruissellementMm` est l'eau qui **quitte** la cellule en surface : sans
 * ruissellement, pas d'érosion, quelle que soit la pente. C'est ce qui fait
 * qu'un versant raide sous couvert forestier n'érode pas.
 */
export function terreArracheeKgM2(
  ruissellementMm: number,
  pentePct: number,
  couvertureSol: number,
): number {
  if (ruissellementMm <= 0 || pentePct <= 0) return 0;
  const nu = Math.min(1, Math.max(0, 1 - couvertureSol));
  return EROSIVITE * ruissellementMm * Math.sqrt(pentePct) * nu * nu;
}

/** Masse de l'horizon de surface, kg/m² — la référence dont on retire. */
export function masseHorizonKgM2(horizon: Horizon): number {
  // densité apparente en g/cm³ → t/m³ ; épaisseur en cm → m ; ×1000 pour les kg.
  return densiteApparente(horizon) * (horizon.epaisseurCm / 100) * 1000 * (1 - horizon.pierrosite);
}

/**
 * Fraction des stocks de surface qui part avec la terre arrachée.
 *
 * Ce n'est pas simplement la fraction massique : le sédiment est enrichi. On
 * plafonne, parce qu'une formule linéaire appliquée à un événement extrême
 * viderait une cellule en une semaine — ce qui n'a pas de sens physique, la
 * terre arrachée venant d'une lame de quelques millimètres.
 */
export function fractionEmportee(arracheeKgM2: number, masseHorizonKgM2: number): number {
  if (masseHorizonKgM2 <= 0) return 0;
  return Math.min(PERTE_MAX_PAR_SEMAINE, (ENRICHISSEMENT * arracheeKgM2) / masseHorizonKgM2);
}

/**
 * Épaisseur de sol correspondant à une masse arrachée, cm.
 *
 * C'est la conséquence longue de l'érosion, et la plus grave : un sol qui
 * s'amincit retient moins d'eau, donc ruisselle davantage, donc s'érode plus
 * vite. La boucle se referme sur elle-même, et c'est ainsi que des versants
 * cultivés finissent sur la roche en un siècle ou deux.
 */
export function epaisseurPerdueCm(arracheeKgM2: number, horizon: Horizon): number {
  const densite = densiteApparente(horizon); // t/m³
  if (densite <= 0) return 0;
  // kg/m² ÷ (t/m³ × 10) = cm de sol.
  return arracheeKgM2 / (densite * 10);
}

/**
 * Terre que l'horizon de surface d'une cellule contient encore, kg/m² : son
 * épaisseur de départ, moins ce que l'eau lui a déjà pris, plus le colluvium
 * qu'il a reçu (`perdueCm` est négative là où la terre s'est déposée).
 *
 * C'est le plafond de ce que l'eau peut lui arracher. Sans lui, la boucle que
 * décrit `epaisseurPerdueCm` n'a pas de fond : sur un versant de 25 %, une
 * cellule perdait 1,2 à 1,8 m d'un horizon de 35 cm en quarante ans, et l'aval
 * recevait en colluvium une terre qui n'avait jamais existé (#283). Conversion
 * exactement inverse de `epaisseurPerdueCm`, pour qu'une cellule décapée
 * s'arrête pile à zéro.
 *
 * Ce que le plafond ne fait pas : laisser l'érosion entamer l'horizon suivant,
 * ce que fait pourtant un vrai versant décapé. Le profil est commun à toute la
 * parcelle et seul son premier horizon s'amincit cellule par cellule ; une
 * cellule mise à nu cesse donc de perdre de la terre *(manque connu, #314)*.
 */
export function terreDisponibleKgM2(horizon: Horizon, perdueCm: number): number {
  const densite = densiteApparente(horizon); // t/m³
  if (densite <= 0) return 0;
  return Math.max(0, horizon.epaisseurCm - perdueCm) * densite * 10;
}

/**
 * Part du sédiment en transit qui se dépose sur la cellule où il arrive. Un
 * sol couvert freine l'eau et peigne les particules : c'est le principe de la
 * bande enherbée et de la haie sur courbe de niveau.
 */
export function partDeposee(couvertureCible: number): number {
  const c = Math.min(1, Math.max(0, couvertureCible));
  return Math.min(1, DEPOT_SOL_NU + DEPOT_PAR_COUVERTURE * c);
}
