/**
 * Cycle de l'azote d'UNE cellule de 1 m², en grammes (1 kg/ha = 0,1 g/m²) :
 *   1. minéralisation (f(T°, humidité, anoxie)) ;
 *   2. prélèvement par les arbres dont les racines occupent la cellule —
 *      alloué spatialement par tick.ts : chaque arbre a un besoin en grammes
 *      (exigence de l'espèce × taille) et une capacité d'extraction (∝ taille
 *      × disponibilité locale). Un frugal est comblé là où un exigeant a faim ;
 *   3. lessivage proportionnel au drainage de la cellule.
 * Invariant testé : minéralisation = prélèvements + lessivage + Δstock.
 * V1 : litières avec C/N, immobilisation (faim d'azote), restitutions.
 */

export const KG_PER_HA_TO_G_PER_M2 = 0.1;

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

/**
 * Facteur climatique commun de l'activité des décomposeurs (humus ET litière) :
 * T°, humidité, anoxie — la boucle microbienne du ch2-B.
 */
export function decompositionClimateFactor(
  tMean: number,
  moistureRatio: number,
  waterloggingRatio: number,
): number {
  return temperatureFactor(tMean) * moistureFactor(moistureRatio, waterloggingRatio);
}

/**
 * Vitesse de décomposition de base d'une litière, /semaine à conditions
 * optimales, dérivée de son C/N : aulne (C/N 15) ≈ 0,04, aiguilles de pin
 * (C/N 60) ≈ 0,01 *(à calibrer)*.
 */
export function litterDecayRate(cnRatio: number): number {
  return 0.6 / Math.max(1, cnRatio);
}

export interface CellMineralizationInput {
  /** minéralisation potentielle de la cellule, g/m²/semaine en conditions optimales */
  potentialGWeek: number;
  tMean: number;
  /** remplissage de la réserve utile de la cellule ∈ [0,1] */
  moistureRatio: number;
  waterloggingRatio: number;
}

/** Azote libéré par l'humus de la cellule cette semaine, g. */
export function cellMineralization(input: CellMineralizationInput): number {
  return (
    input.potentialGWeek *
    decompositionClimateFactor(input.tMean, input.moistureRatio, input.waterloggingRatio)
  );
}

/**
 * Stock au-delà duquel l'extraction racinaire n'est plus freinée par la
 * dilution de l'azote dans le sol : 3 g/m² = 30 kg/ha *(à calibrer)*.
 */
export const AVAILABILITY_SATURATION_G_M2 = 3;

/** Frein de dilution ∈ [0,1] : un sol pauvre se prélève lentement. */
export function nitrogenAvailabilityFactor(stockG: number): number {
  return Math.min(1, stockG / AVAILABILITY_SATURATION_G_M2);
}

/**
 * Lessivage d'une cellule : l'azote en solution part avec l'eau qui draine
 * (modèle de mélange : fraction = eau partie / eau totale).
 */
export function cellLeachedG(stockG: number, drainageMm: number, soilWaterMm: number): number {
  const leachFraction = drainageMm / Math.max(1e-9, drainageMm + soilWaterMm);
  return stockG * leachFraction;
}
