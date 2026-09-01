/**
 * Bilan hydrique V0 : réservoir à deux compartiments.
 * - la réserve utile (RU) : l'eau disponible pour les plantes ;
 * - l'eau gravitaire au-dessus de la capacité au champ : elle draine à une
 *   vitesse limitée (conductivité du sol) et, tant qu'elle stagne, elle crée
 *   de l'**engorgement** (anoxie racinaire — aulne OK, chêne pubescent KO).
 * Invariant testé : pluie = ETR + drainage + débordement + Δstock, exactement.
 * V1 : horizons multiples, interception par les couronnes, ruissellement (pente),
 * prélèvements par individu selon la profondeur racinaire.
 */

export interface WaterBalanceInput {
  /** eau de la réserve utile en début de semaine, mm (0 ≤ x ≤ ru) */
  soilWaterMm: number;
  /** eau gravitaire (au-dessus de la capacité au champ), mm */
  excessMm: number;
  /** réserve utile du sol, mm */
  ruMm: number;
  /** porosité de drainage : eau gravitaire max avant débordement en surface, mm */
  excessCapacityMm: number;
  /** vitesse max de drainage de l'eau gravitaire, mm/semaine (conductivité) */
  drainagePerWeekMm: number;
  /** pluie de la semaine, mm */
  rainMm: number;
  /** évapotranspiration potentielle de la semaine, mm */
  etpMm: number;
}

export interface WaterBalanceOutput {
  soilWaterMm: number;
  excessMm: number;
  /** évapotranspiration réelle, mm */
  etrMm: number;
  /** drainage profond, mm (lessive les nitrates, cf. nitrogen.ts) */
  drainageMm: number;
  /** eau refusée par le sol saturé (ruissellement de surface), mm */
  overflowMm: number;
  /** ETR / ETP ∈ [0,1] — indicateur de stress de sécheresse */
  satisfactionRatio: number;
  /** part de la porosité de drainage occupée en fin de semaine ∈ [0,1] — anoxie */
  waterloggingRatio: number;
}

/**
 * En dessous de `DRYNESS_THRESHOLD × RU`, l'évapotranspiration décroît
 * linéairement (comportement standard des modèles à réservoir type FAO-56).
 */
const DRYNESS_THRESHOLD = 0.6;

export function weeklyWaterBalance(input: WaterBalanceInput): WaterBalanceOutput {
  const { ruMm, excessCapacityMm, drainagePerWeekMm, rainMm, etpMm } = input;

  // 1. La pluie remplit d'abord la réserve utile, puis la porosité de drainage.
  const total = input.soilWaterMm + input.excessMm + rainMm;
  let soilWaterMm = Math.min(ruMm, total);
  let excessMm = total - soilWaterMm;

  // 2. Ce que la porosité ne peut pas contenir déborde (ruissellement).
  const overflowMm = Math.max(0, excessMm - excessCapacityMm);
  excessMm -= overflowMm;

  // 3. L'eau gravitaire draine à vitesse limitée par la conductivité.
  const drainageMm = Math.min(drainagePerWeekMm, excessMm);
  excessMm -= drainageMm;

  // 4. ETR depuis la réserve utile, freinée quand le sol se vide.
  const fillRatio = ruMm > 0 ? soilWaterMm / ruMm : 0;
  const drynessFactor = Math.min(1, fillRatio / DRYNESS_THRESHOLD);
  const etrMm = Math.min(soilWaterMm, etpMm * drynessFactor);
  soilWaterMm -= etrMm;

  return {
    soilWaterMm,
    excessMm,
    etrMm,
    drainageMm,
    overflowMm,
    satisfactionRatio: etpMm > 0 ? etrMm / etpMm : 1,
    waterloggingRatio: excessCapacityMm > 0 ? Math.min(1, excessMm / excessCapacityMm) : 0,
  };
}
