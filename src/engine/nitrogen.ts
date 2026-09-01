/**
 * Cycle de l'azote V0 (docs/regles.md §4.2, version minimale) :
 * minéralisation (f(T°, humidité, anoxie)) → prélèvement des plantes →
 * lessivage des nitrates proportionnel au drainage.
 * Invariant testé : minéralisation = prélèvement + lessivage + Δstock.
 * V0.5 : litières avec C/N, immobilisation (faim d'azote), restitutions.
 */

export interface NitrogenInput {
  /** stock d'azote minéral disponible, kg/ha */
  mineralNKgHa: number;
  /** minéralisation potentielle (T° et humidité optimales), kg/ha/semaine */
  mineralizationPotentialKgHaWeek: number;
  /** °C moyenne de la semaine */
  tMean: number;
  /** remplissage de la réserve utile ∈ [0,1] */
  moistureRatio: number;
  /** engorgement ∈ [0,1] (anoxie : la minéralisation aérobie ralentit) */
  waterloggingRatio: number;
  /** demande totale des plantes cette semaine, kg/ha */
  uptakeDemandKgHa: number;
  /** drainage de la semaine, mm */
  drainageMm: number;
  /** eau restée dans la réserve utile, mm */
  soilWaterMm: number;
}

export interface NitrogenOutput {
  mineralNKgHa: number;
  mineralizationKgHa: number;
  uptakeKgHa: number;
  leachedKgHa: number;
  /** part de la demande servie ∈ [0,1] — facteur f_N de la loi du minimum */
  demandSatisfaction: number;
}

/** Facteur température de la minéralisation (Q10 ≈ 2, référence 12 °C). */
function temperatureFactor(tMean: number): number {
  if (tMean <= 0) return 0;
  return Math.min(3, 2 ** ((tMean - 12) / 10));
}

/** Facteur humidité : optimal sol frais, ralenti sol sec, ralenti par l'anoxie. */
function moistureFactor(moistureRatio: number, waterloggingRatio: number): number {
  const dryness = Math.min(1, moistureRatio / 0.5);
  const anoxia = 1 - 0.7 * waterloggingRatio;
  return dryness * anoxia;
}

export function weeklyNitrogenCycle(input: NitrogenInput): NitrogenOutput {
  const mineralizationKgHa =
    input.mineralizationPotentialKgHaWeek *
    temperatureFactor(input.tMean) *
    moistureFactor(input.moistureRatio, input.waterloggingRatio);

  // 1. Minéralisation : l'humus libère de l'azote minéral.
  const available = input.mineralNKgHa + mineralizationKgHa;

  // 2. Prélèvement des plantes, plafonné par le disponible.
  const uptakeKgHa = Math.min(input.uptakeDemandKgHa, available);
  const afterUptake = available - uptakeKgHa;

  // 3. Lessivage : l'azote en solution part avec l'eau qui draine
  //    (modèle de mélange : fraction = eau partie / eau totale).
  const waterOut = input.drainageMm;
  const leachFraction = waterOut / Math.max(1e-9, waterOut + input.soilWaterMm);
  const leachedKgHa = afterUptake * leachFraction;

  return {
    mineralNKgHa: afterUptake - leachedKgHa,
    mineralizationKgHa,
    uptakeKgHa,
    leachedKgHa,
    demandSatisfaction: input.uptakeDemandKgHa > 0 ? uptakeKgHa / input.uptakeDemandKgHa : 1,
  };
}
