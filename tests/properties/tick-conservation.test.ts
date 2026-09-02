import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LANDE_SECHE, VALLEE_ENGORGEE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Conservation au niveau du TICK complet, grille + arbres (docs/regles.md §16) :
 * chaque semaine, pluie = évaporation + transpiration + drainage + débordement
 * + Δstock, et minéralisation = prélèvements + lessivage + Δstock d'azote.
 */

/** Stock d'eau moyen par CELLULE, tous horizons confondus (sol stratifié). */
function meanWaterStock(state: GameState): number {
  const nCells = state.soil.mineralNG.length;
  let sum = 0;
  for (let i = 0; i < state.soil.waterMm.length; i++) {
    sum += (state.soil.waterMm[i] ?? 0) + (state.soil.excessMm[i] ?? 0);
  }
  return sum / nCells;
}

/** Stock d'azote du sol = minéral + litière, kg/ha. */
function meanNStockKgHa(state: GameState): number {
  const n = state.soil.mineralNG.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (state.soil.mineralNG[i] ?? 0) + (state.soil.litterNG[i] ?? 0);
  // Le tas de broyat en attente compte lui aussi : sinon, broyer un arbre
  // ferait disparaître son azote du bilan.
  return ((sum + state.stockBrf.azoteG) / n) * 10;
}

function checkConservation(sc: StationClimat, years: number) {
  const weather = syntheticYear(sc.climat);
  let state = createGameState(sc.station, rngStateFromSeed(7));
  state = plantScattered(state, "fagus_sylvatica", 40);
  state = plantScattered(state, "pinus_sylvestris", 40);
  state = plantScattered(state, "alnus_glutinosa", 40, 8);

  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    const before = meanWaterStock(state);
    const beforeN = meanNStockKgHa(state);
    const { state: next, fluxes } = tick(state, w);

    const deltaWater = meanWaterStock(next) - before;
    expect(
      fluxes.ruissellementSortantMm +
        fluxes.evapMm +
        fluxes.transpirationMm +
        fluxes.drainageMm +
        fluxes.overflowMm +
        deltaWater,
      // Entrées : pluie, remontée de nappe, et l'eau qui arrive de l'amont
      // par ruissellement. Sortie supplémentaire : celle qui quitte la
      // parcelle par le point bas (relief.ts).
    ).toBeCloseTo(fluxes.rainMm + fluxes.nappeMm + fluxes.ruissellementEntrantMm, 5);

    // Entrées : minéralisation de l'humus + retour de litière (recyclage des
    // arbres) + fixation symbiotique. Sorties : prélèvements + lessivage.
    const deltaN = meanNStockKgHa(next) - beforeN;
    // Entrées : minéralisation de l'humus, retours de litière, fixation
    // symbiotique et dépôts atmosphériques (ces derniers sont un apport venu
    // de l'extérieur du système, au même titre que la fixation).
    expect(fluxes.uptakeKgHa + fluxes.leachedKgHa + deltaN).toBeCloseTo(
      fluxes.mineralizationKgHa +
        fluxes.litterfallKgHa +
        fluxes.fixationKgHa +
        fluxes.depositionKgHa,
      6,
    );
    state = next;
  }
}

describe("conservation eau + azote sur le tick complet (grille + arbres)", () => {
  it("lande sèche, 3 ans, peuplement mixte", () => {
    checkConservation(LANDE_SECHE, 3);
  });

  it("vallée engorgée, 3 ans, peuplement mixte", () => {
    checkConservation(VALLEE_ENGORGEE, 3);
  });
});
