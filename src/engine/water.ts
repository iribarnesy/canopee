/**
 * Bilan hydrique d'UNE cellule de 1 m² : réservoir à deux compartiments.
 * - la réserve utile (RU) : l'eau disponible pour les plantes ;
 * - l'eau gravitaire au-dessus de la capacité au champ : elle draine à une
 *   vitesse limitée (conductivité) et, tant qu'elle stagne, crée de
 *   l'**engorgement** (anoxie racinaire).
 * La cellule gère pluie, débordement, drainage et évaporation du sol nu ;
 * la TRANSPIRATION des arbres est prélevée ensuite, cellule par cellule,
 * par l'allocation spatiale de tick.ts (docs/regles.md §4.2).
 * Invariant testé : pluie = évaporation + drainage + débordement + Δstock.
 * 1 mm sur 1 m² = 1 L.
 */

export interface CellWaterInput {
  /** eau de la réserve utile en début de semaine, mm (0 ≤ x ≤ ru) */
  soilWaterMm: number;
  /** eau gravitaire (au-dessus de la capacité au champ), mm */
  excessMm: number;
  /** réserve utile de la cellule, mm */
  ruMm: number;
  /** porosité de drainage : eau gravitaire max avant débordement en surface, mm */
  excessCapacityMm: number;
  /** vitesse max de drainage de l'eau gravitaire, mm/semaine (conductivité) */
  drainagePerWeekMm: number;
  /** pluie de la semaine, mm */
  rainMm: number;
  /** demande évaporatoire du sol nu, mm (fraction de l'ETP, cf. tick.ts) */
  evapDemandMm: number;
  /** remontée capillaire de nappe disponible, mm/semaine (fond de vallée, §2) */
  nappeMm: number;
}

export interface CellWaterOutput {
  soilWaterMm: number;
  excessMm: number;
  /** évaporation du sol, mm */
  evapMm: number;
  /** drainage profond, mm (lessive les nitrates, cf. nitrogen.ts) */
  drainageMm: number;
  /** eau refusée par le sol saturé (ruissellement de surface), mm */
  overflowMm: number;
  /** remontée de nappe réellement absorbée, mm (flux entrant, conservation) */
  nappeMm: number;
  /** part de la porosité de drainage occupée en fin de semaine ∈ [0,1] — anoxie */
  waterloggingRatio: number;
}

/**
 * En dessous de `DRYNESS_THRESHOLD × RU`, évaporation et prélèvements
 * décroissent linéairement (modèles à réservoir type FAO-56).
 */
export const DRYNESS_THRESHOLD = 0.6;

/** Frein de sécheresse d'une cellule ∈ [0,1] selon son remplissage. */
export function drynessFactor(soilWaterMm: number, ruMm: number): number {
  if (ruMm <= 0) return 0;
  return Math.min(1, soilWaterMm / ruMm / DRYNESS_THRESHOLD);
}

/** Version sans allocation : écrit le résultat dans `out` (boucles de grille). */
export function cellWaterBalanceInto(input: CellWaterInput, out: CellWaterOutput): void {
  const { ruMm, excessCapacityMm, drainagePerWeekMm, rainMm, evapDemandMm } = input;

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

  // 4. Évaporation du sol, freinée quand la cellule se vide.
  const evapMm = Math.min(soilWaterMm, evapDemandMm * drynessFactor(soilWaterMm, ruMm));
  soilWaterMm -= evapMm;

  // 5. Remontée capillaire de la nappe : recharge la réserve utile par le bas
  //    (fond de vallée : engorgé l'hiver, jamais à sec l'été — docs/regles.md §2).
  const nappeMm = Math.min(input.nappeMm, ruMm - soilWaterMm);
  soilWaterMm += nappeMm;

  out.nappeMm = nappeMm;
  out.soilWaterMm = soilWaterMm;
  out.excessMm = excessMm;
  out.evapMm = evapMm;
  out.drainageMm = drainageMm;
  out.overflowMm = overflowMm;
  out.waterloggingRatio = excessCapacityMm > 0 ? Math.min(1, excessMm / excessCapacityMm) : 0;
}

export function cellWaterBalance(input: CellWaterInput): CellWaterOutput {
  const out: CellWaterOutput = {
    soilWaterMm: 0,
    excessMm: 0,
    evapMm: 0,
    drainageMm: 0,
    overflowMm: 0,
    nappeMm: 0,
    waterloggingRatio: 0,
  };
  cellWaterBalanceInto(input, out);
  return out;
}
