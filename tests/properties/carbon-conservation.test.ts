/**
 * Conservation du carbone (docs/regles.md §12, §16) : chaque semaine — actions
 * du joueur comprises — la production primaire nette égale la variation des
 * stocks (vivant + bois mort + litière + humus) plus les émissions et les
 * exports. Le carbone ne peut ni fuir ni apparaître.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { livingCarbonKg } from "../../src/engine/carbon";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION = { ...LIMON_RICHE.station, coteM: 50 };
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/** Stock total de carbone de la parcelle, kg C (cellules de 1 m² : g → kg). */
function totalStockKgC(state: GameState): number {
  let soilG = 0;
  for (let i = 0; i < state.soil.litterCG.length; i++) {
    soilG += (state.soil.litterCG[i] ?? 0) + (state.soil.humusCG[i] ?? 0);
  }
  return livingCarbonKg(state.trees) + state.carbon.deadWoodKgC + soilG / 1000;
}

describe("conservation du carbone sur le tick complet (actions comprises)", () => {
  it("NPP = Δstocks + émissions + exports, chaque semaine pendant 8 ans", () => {
    const actions: GameAction[] = [
      {
        type: "planter",
        week: 0,
        especeId: "alnus_glutinosa",
        positions: Array.from({ length: 30 }, (_, i) => ({
          x: 5 + (i % 6) * 3,
          y: 5 + Math.floor(i / 6) * 3,
        })),
      },
      {
        type: "planter",
        week: 1,
        especeId: "pinus_sylvestris",
        positions: Array.from({ length: 20 }, (_, i) => ({
          x: 30 + (i % 5) * 3,
          y: 30 + Math.floor(i / 5) * 3,
        })),
      },
      { type: "couper", week: 5 * 52 + 20, treeIds: [1, 2, 3, 4, 5], devenir: "epandre" },
      { type: "couper", week: 6 * 52 + 20, treeIds: [31, 32, 33, 34], devenir: "vendre" },
    ];

    let state = createGameState(STATION, rngStateFromSeed(13));
    for (let i = 0; i < 8 * 52; i++) {
      const w = WEATHER[i % 52];
      if (!w) throw new Error("météo manquante");
      const before = totalStockKgC(state);
      const c0 = state.carbon;
      const step = advanceWeek(state, w, actions);
      state = step.state;
      const c1 = state.carbon;

      const deltaStock = totalStockKgC(state) - before;
      const npp = c1.nppCumKgC - c0.nppCumKgC;
      const emitted = c1.emittedCumKgC - c0.emittedCumKgC;
      const exported = c1.exportedEnergyCumKgC - c0.exportedEnergyCumKgC;
      const imported = c1.importedPlantsCumKgC - c0.importedPlantsCumKgC;
      // Entrées : photosynthèse + plants achetés. Sorties : CO2 + bois vendu.
      expect(deltaStock + emitted + exported).toBeCloseTo(npp + imported, 4);
    }
    // Sanity : de vrais flux ont eu lieu.
    expect(state.carbon.nppCumKgC).toBeGreaterThan(100);
    expect(state.carbon.exportedEnergyCumKgC).toBeGreaterThan(0);
    expect(state.carbon.deadWoodKgC).toBeGreaterThan(0);
  });
});
