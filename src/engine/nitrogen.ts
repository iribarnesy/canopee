/**
 * Cycle de l'azote V0 (docs/regles.md §4.2, version minimale), en trois étapes
 * orchestrées par tick.ts :
 *   1. minéralisation (f(T°, humidité, anoxie)) ;
 *   2. prélèvement PAR INDIVIDU : chaque arbre a un besoin en kg (∝ taille ×
 *      exigence de l'espèce) et une capacité d'extraction (∝ taille ×
 *      disponibilité du sol, identique entre espèces). Un frugal est comblé
 *      là où un exigeant a faim — c'est émergent, pas normalisé ;
 *   3. lessivage des nitrates proportionnel au drainage.
 * Invariant testé : minéralisation = prélèvements + lessivage + Δstock.
 * V0.5+ : litières avec C/N, immobilisation (faim d'azote), restitutions.
 */

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

export interface MineralizationInput {
  mineralizationPotentialKgHaWeek: number;
  tMean: number;
  moistureRatio: number;
  waterloggingRatio: number;
}

/** Azote libéré par l'humus cette semaine, kg/ha. */
export function weeklyMineralization(input: MineralizationInput): number {
  return (
    input.mineralizationPotentialKgHaWeek *
    temperatureFactor(input.tMean) *
    moistureFactor(input.moistureRatio, input.waterloggingRatio)
  );
}

/**
 * Stock au-delà duquel l'extraction racinaire n'est plus freinée par la
 * dilution de l'azote dans le sol, kg/ha *(à calibrer)*.
 */
const AVAILABILITY_SATURATION_KG_HA = 30;

export interface UptakeRequest {
  /** besoin de l'individu, kg/semaine (exigence de l'espèce × taille) */
  needKg: number;
  /** capacité d'extraction max, kg/semaine (taille seule — identique entre espèces) */
  extractionCapacityKg: number;
}

export interface UptakeResult {
  /** prélèvement de chaque individu, kg (même ordre que les requêtes) */
  uptakesKg: number[];
  /** satisfaction de chaque individu = prélèvement / besoin ∈ [0,1] */
  satisfactions: number[];
  totalUptakeKg: number;
}

/**
 * Répartit le pool d'azote entre les individus.
 * L'extraction de chacun est bornée par : son besoin, sa capacité racinaire
 * pondérée par la disponibilité (un sol dilué se prélève lentement), et la
 * part restante du pool (rationnement proportionnel en cas de pénurie).
 */
export function allocateUptake(poolKgHa: number, requests: UptakeRequest[]): UptakeResult {
  const availability = Math.min(1, poolKgHa / AVAILABILITY_SATURATION_KG_HA);
  const wanted = requests.map((r) => Math.min(r.needKg, r.extractionCapacityKg * availability));
  const totalWanted = wanted.reduce((a, b) => a + b, 0);
  const scale = totalWanted > poolKgHa ? poolKgHa / totalWanted : 1;

  const uptakesKg = wanted.map((w) => w * scale);
  const satisfactions = requests.map((r, i) => {
    const uptake = uptakesKg[i] ?? 0;
    return r.needKg > 0 ? Math.min(1, uptake / r.needKg) : 1;
  });
  return {
    uptakesKg,
    satisfactions,
    totalUptakeKg: uptakesKg.reduce((a, b) => a + b, 0),
  };
}

export interface LeachingResult {
  mineralNKgHa: number;
  leachedKgHa: number;
}

/**
 * Lessivage : l'azote en solution part avec l'eau qui draine
 * (modèle de mélange : fraction = eau partie / eau totale).
 */
export function weeklyLeaching(
  mineralNKgHa: number,
  drainageMm: number,
  soilWaterMm: number,
): LeachingResult {
  const leachFraction = drainageMm / Math.max(1e-9, drainageMm + soilWaterMm);
  const leachedKgHa = mineralNKgHa * leachFraction;
  return { mineralNKgHa: mineralNKgHa - leachedKgHa, leachedKgHa };
}
