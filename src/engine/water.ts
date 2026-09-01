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

/** Frein de sécheresse d'une cellule ∈ [0,1] selon son remplissage (racines). */
export function drynessFactor(soilWaterMm: number, ruMm: number): number {
  if (ruMm <= 0) return 0;
  return Math.min(1, soilWaterMm / ruMm / DRYNESS_THRESHOLD);
}

/**
 * Frein propre à l'ÉVAPORATION du sol : quadratique, car un sol qui sèche
 * s'auto-protège — la couche superficielle desséchée devient une barrière
 * (« mulch naturel », phase 2 de l'évaporation). Les racines, elles, vont
 * chercher l'eau liée bien plus efficacement, d'où deux courbes distinctes.
 */
export function soilEvapFactor(soilWaterMm: number, ruMm: number): number {
  const f = drynessFactor(soilWaterMm, ruMm);
  return f * f;
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

  // 4. Évaporation du sol, freinée (quadratiquement) quand la cellule se vide.
  const evapMm = Math.min(soilWaterMm, evapDemandMm * soilEvapFactor(soilWaterMm, ruMm));
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

/** Un horizon vu par le bilan hydrique d'une cellule. */
export interface HorizonHydro {
  /** réserve utile de l'horizon, mm */
  ruMm: number;
  /** eau gravitaire que l'horizon peut contenir, mm */
  porositeMm: number;
  /** conductivité vers l'horizon du dessous, mm/semaine */
  conductiviteMm: number;
}

export interface ProfilHydroInput {
  horizons: readonly HorizonHydro[];
  /** eau de la réserve utile de chaque horizon, mm */
  eauMm: readonly number[];
  /** eau gravitaire de chaque horizon, mm */
  excesMm: readonly number[];
  rainMm: number;
  /** demande évaporatoire (elle ne touche QUE l'horizon de surface) */
  evapDemandMm: number;
  /** remontée capillaire depuis la nappe, alimente l'horizon le plus profond */
  nappeMm: number;
  /** ce que l'exutoire peut évacuer sous le dernier horizon, mm/semaine */
  drainageExterneMm: number;
}

export interface ProfilHydroOutput {
  eauMm: number[];
  excesMm: number[];
  evapMm: number;
  /** eau sortie sous le profil */
  drainageMm: number;
  /** eau refusée en surface (sol saturé) */
  overflowMm: number;
  nappeMm: number;
  /** engorgement de chaque horizon ∈ [0,1] */
  engorgementParHorizon: number[];
}

/**
 * Bilan hydrique d'une cellule STRATIFIÉE (critère A10). Deux passes :
 *  1. remplissage descendant — la pluie remplit la réserve utile puis la
 *     macroporosité de chaque horizon, le surplus descend ;
 *  2. ressuyage gravitaire — chaque horizon vidange son eau libre vers le bas,
 *     à la vitesse que sa texture permet et dans la place disponible.
 * L'évaporation ne prélève qu'en surface, la nappe recharge par le bas, et ce
 * que l'exutoire refuse remonte en nappe perchée. L'engorgement devient LOCAL
 * à chaque horizon : de l'eau bloquée en profondeur n'asphyxie pas les racines
 * de surface.
 * Invariant : pluie + nappe = évaporation + drainage + débordement + Δstock.
 */
export function profilHydro(input: ProfilHydroInput, out?: ProfilHydroOutput): ProfilHydroOutput {
  const { horizons } = input;
  const n = horizons.length;
  // Réutilisation des tableaux fournis : la boucle sur les cellules du tick
  // appelle cette fonction des dizaines de milliers de fois par semaine.
  const eauMm = out?.eauMm ?? new Array<number>(n);
  const excesMm = out?.excesMm ?? new Array<number>(n);
  for (let i = 0; i < n; i++) {
    eauMm[i] = input.eauMm[i] ?? 0;
    excesMm[i] = input.excesMm[i] ?? 0;
  }

  // ── Passe 1 : la pluie s'infiltre de haut en bas ──────────────────────────
  let flux = input.rainMm;
  for (let i = 0; i < n && flux > 0; i++) {
    const h = horizons[i];
    if (!h) continue;
    const versRu = Math.min(flux, Math.max(0, h.ruMm - (eauMm[i] ?? 0)));
    eauMm[i] = (eauMm[i] ?? 0) + versRu;
    flux -= versRu;
    const versPorosite = Math.min(flux, Math.max(0, h.porositeMm - (excesMm[i] ?? 0)));
    excesMm[i] = (excesMm[i] ?? 0) + versPorosite;
    flux -= versPorosite;
    // Ce qui reste ne peut descendre plus vite que la conductivité de l'horizon.
    const peutDescendre = Math.min(flux, h.conductiviteMm);
    flux = peutDescendre; // le surplus non descendu reflue (traité ci-dessous)
  }
  let drainageBrut = flux;

  // ── Passe 2 : ressuyage de l'eau gravitaire, du bas vers le haut ──────────
  // (du bas d'abord, pour libérer la place avant que le dessus ne descende)
  for (let i = n - 1; i >= 0; i--) {
    const h = horizons[i];
    if (!h) continue;
    const dispo = excesMm[i] ?? 0;
    if (dispo <= 0) continue;
    if (i === n - 1) {
      const sortie = Math.min(dispo, h.conductiviteMm);
      excesMm[i] = dispo - sortie;
      drainageBrut += sortie;
    } else {
      const hBas = horizons[i + 1];
      if (!hBas) continue;
      const place =
        Math.max(0, hBas.ruMm - (eauMm[i + 1] ?? 0)) +
        Math.max(0, hBas.porositeMm - (excesMm[i + 1] ?? 0));
      const transfert = Math.min(dispo, h.conductiviteMm, place);
      excesMm[i] = dispo - transfert;
      const versRu = Math.min(transfert, Math.max(0, hBas.ruMm - (eauMm[i + 1] ?? 0)));
      eauMm[i + 1] = (eauMm[i + 1] ?? 0) + versRu;
      excesMm[i + 1] = (excesMm[i + 1] ?? 0) + (transfert - versRu);
    }
  }

  // ── L'exutoire limite la sortie ; le refus remonte en nappe perchée ───────
  const drainageMm = Math.min(drainageBrut, input.drainageExterneMm);
  let remontant = drainageBrut - drainageMm;
  for (let i = n - 1; i >= 0 && remontant > 0; i--) {
    const h = horizons[i];
    if (!h) continue;
    const place = Math.max(0, h.porositeMm - (excesMm[i] ?? 0));
    const pris = Math.min(place, remontant);
    excesMm[i] = (excesMm[i] ?? 0) + pris;
    remontant -= pris;
  }
  const overflowMm = remontant; // le sol est plein : ça ruisselle

  // ── Évaporation (surface seule) et remontée capillaire (fond) ─────────────
  const h0 = horizons[0];
  let evapMm = 0;
  if (h0) {
    evapMm = Math.min(eauMm[0] ?? 0, input.evapDemandMm * soilEvapFactor(eauMm[0] ?? 0, h0.ruMm));
    eauMm[0] = (eauMm[0] ?? 0) - evapMm;
  }
  let nappeMm = 0;
  const hd = horizons[n - 1];
  if (hd && input.nappeMm > 0) {
    nappeMm = Math.min(input.nappeMm, Math.max(0, hd.ruMm - (eauMm[n - 1] ?? 0)));
    eauMm[n - 1] = (eauMm[n - 1] ?? 0) + nappeMm;
  }

  const engorgementParHorizon = out?.engorgementParHorizon ?? new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const h = horizons[i];
    engorgementParHorizon[i] =
      h && h.porositeMm > 0 ? Math.min(1, (excesMm[i] ?? 0) / h.porositeMm) : 0;
  }
  if (out) {
    out.evapMm = evapMm;
    out.drainageMm = drainageMm;
    out.overflowMm = overflowMm;
    out.nappeMm = nappeMm;
    return out;
  }
  return { eauMm, excesMm, evapMm, drainageMm, overflowMm, nappeMm, engorgementParHorizon };
}
