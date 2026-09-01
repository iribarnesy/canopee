/**
 * Bilan hydrique V0 : réservoir mono-horizon (« bucket model »).
 * Invariant testé (tests/properties) : pluie = ETR + drainage + Δstock, exactement.
 * V1 : horizons multiples, interception par les couronnes, ruissellement (pente),
 * prélèvements par individu selon la profondeur racinaire.
 */

export interface WaterBalanceInput {
  /** stock d'eau du sol en début de semaine, mm (0 ≤ stock ≤ ru) */
  soilWaterMm: number;
  /** réserve utile du sol, mm */
  ruMm: number;
  /** pluie de la semaine, mm */
  rainMm: number;
  /** évapotranspiration potentielle de la semaine, mm */
  etpMm: number;
}

export interface WaterBalanceOutput {
  /** stock en fin de semaine, mm */
  soilWaterMm: number;
  /** évapotranspiration réelle, mm */
  etrMm: number;
  /** eau perdue par drainage profond, mm (lessivera les nitrates en V0.5) */
  drainageMm: number;
  /** ETR / ETP ∈ [0,1] — indicateur de stress hydrique pour la croissance */
  satisfactionRatio: number;
}

/**
 * L'ETR est plafonnée par la demande (ETP) et freinée quand le sol se vide :
 * en dessous de `DRYNESS_THRESHOLD × RU`, l'évapotranspiration décroît
 * linéairement (comportement standard des modèles à réservoir type FAO-56).
 */
const DRYNESS_THRESHOLD = 0.6;

export function weeklyWaterBalance(input: WaterBalanceInput): WaterBalanceOutput {
  const { soilWaterMm, ruMm, rainMm, etpMm } = input;

  // La pluie remplit le réservoir ; l'excédent au-delà de la RU draine.
  const afterRain = soilWaterMm + rainMm;
  const drainageMm = Math.max(0, afterRain - ruMm);
  const available = afterRain - drainageMm;

  // Frein de sécheresse basé sur le taux de remplissage après pluie.
  const fillRatio = ruMm > 0 ? available / ruMm : 0;
  const drynessFactor = Math.min(1, fillRatio / DRYNESS_THRESHOLD);
  const etrMm = Math.min(available, etpMm * drynessFactor);

  return {
    soilWaterMm: available - etrMm,
    etrMm,
    drainageMm,
    satisfactionRatio: etpMm > 0 ? etrMm / etpMm : 1,
  };
}
