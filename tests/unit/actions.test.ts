import { describe, expect, it } from "vitest";
import {
  applyAction,
  fellingHours,
  type GameAction,
  PLANT_HOURS,
  WEEK_HOURS_CAP,
  WOOD_PRICE_EUR_M3,
  woodVolumeM3,
} from "../../src/engine/actions";
import { runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash } from "../../src/engine/tick";

const WEATHER = syntheticYear(LIMON_RICHE.climat);
const STATION = { ...LIMON_RICHE.station, coteM: 50 };

function positionsGrid(n: number, x0: number, y0: number, spacing: number) {
  const side = Math.ceil(Math.sqrt(n));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: x0 + (i % side) * spacing, y: y0 + Math.floor(i / side) * spacing });
  }
  return out;
}

describe("journal d'actions — la sauvegarde rejouable", () => {
  const journal = {
    stationId: STATION.id,
    seed: 11,
    actions: [
      {
        type: "planter",
        week: 2,
        especeId: "betula_pendula",
        positions: positionsGrid(20, 5, 5, 3),
      },
      { type: "couper", week: 260, treeIds: [1, 2, 3], devenir: "vendre" },
    ] as GameAction[],
  };

  it("rejouer le même journal donne exactement la même partie (hash)", () => {
    const a = runJournal(STATION, journal, WEATHER, 6 * 52);
    const b = runJournal(STATION, journal, WEATHER, 6 * 52);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(a.refusals).toEqual(b.refusals);
  });

  it("planter coûte de l'argent et du temps ; couper-vendre rapporte", () => {
    const { state, refusals } = runJournal(STATION, journal, WEATHER, 6 * 52);
    expect(refusals).toEqual([]);
    // 20 bouleaux à 1,50 € plantés, 3 vendus 5 ans plus tard.
    const spent = 20 * 1.5;
    expect(state.economy.treasuryEur).toBeGreaterThan(20_000 - spent);
    expect(state.economy.treasuryEur).toBeLessThan(20_000 + 100); // ventes modestes (jeunes arbres)
    expect(state.trees.filter((t) => t.id <= 20).length).toBe(17); // 3 coupés
  });
});

describe("plafonds économiques (déterministes)", () => {
  it("le plafond hebdomadaire d'heures refuse l'excédent", () => {
    const maxPlants = Math.floor(WEEK_HOURS_CAP / PLANT_HOURS);
    const journal = {
      stationId: STATION.id,
      seed: 3,
      actions: [
        {
          type: "planter",
          week: 0,
          especeId: "pinus_sylvestris",
          positions: positionsGrid(maxPlants + 20, 2, 2, 2),
        } as GameAction,
      ],
    };
    const { state, refusals } = runJournal(STATION, journal, WEATHER, 2);
    expect(state.trees).toHaveLength(maxPlants);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toContain("plafond hebdomadaire");
  });

  it("le découvert plafonné refuse d'acheter plus de plants", () => {
    const journal = {
      stationId: STATION.id,
      seed: 3,
      treasuryEur: -19_996,
      actions: [
        {
          type: "planter",
          week: 0,
          especeId: "fagus_sylvatica", // 3 € le plant
          positions: positionsGrid(5, 2, 2, 2),
        } as GameAction,
      ],
    };
    const { state, refusals } = runJournal(STATION, journal, WEATHER, 1);
    expect(state.trees).toHaveLength(1); // −19 999 ok, le 2e franchirait −20 000
    expect(refusals[0]?.reason).toContain("découvert");
  });

  it("planter trop près d'un arbre vivant est refusé", () => {
    let state = createGameState(STATION, rngStateFromSeed(1));
    state = plantAt(state, "fagus_sylvatica", 10, 10, 5);
    const { state: after, refusals } = applyAction(state, {
      type: "planter",
      week: 0,
      especeId: "betula_pendula",
      positions: [{ x: 10.3, y: 10.3 }],
    });
    expect(after.trees).toHaveLength(1);
    expect(refusals[0]?.reason).toContain("trop proche");
  });

  it("la vente rapporte volume × prix", () => {
    let state = createGameState(STATION, rngStateFromSeed(1));
    state = plantAt(state, "pinus_sylvestris", 10, 10, 20);
    const { state: after } = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [1],
      devenir: "vendre",
    });
    expect(after.economy.treasuryEur).toBeCloseTo(20_000 + woodVolumeM3(20) * WOOD_PRICE_EUR_M3, 6);
    expect(after.economy.hoursUsedWeek).toBeCloseTo(fellingHours(20), 6);
    expect(after.trees).toHaveLength(0);
  });
});
