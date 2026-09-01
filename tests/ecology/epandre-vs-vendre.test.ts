/**
 * LA mécanique fondatrice du game design (docs/regles.md §4.2, §16) : le
 * joueur qui coupe ses fixateurs choisit — VENDRE la récolte (argent) ou
 * ÉPANDRE sur place (l'azote fixé retourne au sol et nourrit les voisins).
 * Les deux parties sont identiques jusqu'à la coupe (même seed, même journal
 * amont) ; seul le devenir diffère.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { carbonInventory } from "../../src/engine/carbon";
import { runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { LIMON_PAUVRE_N } from "../../src/engine/stations";

const STATION = { ...LIMON_PAUVRE_N.station, coteM: 60 };
const WEATHER = syntheticYear(LIMON_PAUVRE_N.climat);

// 20 aulnes (ids 1-20) en bosquet serré, 8 hêtres (ids 21-28) intercalés.
const AULNES: { x: number; y: number }[] = [];
for (let i = 0; i < 20; i++) {
  AULNES.push({ x: 24 + (i % 5) * 3, y: 24 + Math.floor(i / 5) * 3 });
}
const HETRES: { x: number; y: number }[] = [];
for (let i = 0; i < 8; i++) {
  HETRES.push({ x: 25.5 + (i % 4) * 3, y: 25.5 + Math.floor(i / 4) * 3 });
}

const CUT_WEEK = 10 * 52 + 30; // fin d'été de l'an 10 (l'azote de l'année est dans les feuilles)

function journal(devenir: "vendre" | "epandre") {
  return {
    stationId: STATION.id,
    seed: 5,
    actions: [
      { type: "planter", week: 0, especeId: "alnus_glutinosa", positions: AULNES },
      { type: "planter", week: 1, especeId: "fagus_sylvatica", positions: HETRES },
      {
        type: "couper",
        week: CUT_WEEK,
        treeIds: Array.from({ length: 20 }, (_, i) => i + 1),
        devenir,
      },
    ] as GameAction[],
  };
}

describe("couper les aulnes : épandre ou vendre (15 ans, limon pauvre en N)", () => {
  const vendre = runJournal(STATION, journal("vendre"), WEATHER, 15 * 52);
  const epandre = runJournal(STATION, journal("epandre"), WEATHER, 15 * 52);

  it("aucune action n'est refusée dans les deux parties", () => {
    expect(vendre.refusals).toEqual([]);
    expect(epandre.refusals).toEqual([]);
  });

  it("vendre rapporte de l'argent, épandre coûte du temps pour rien... en euros", () => {
    expect(vendre.state.economy.treasuryEur).toBeGreaterThan(
      epandre.state.economy.treasuryEur + 20,
    );
    expect(epandre.state.economy.hoursUsedYear).toBeGreaterThanOrEqual(0);
  });

  it("épandre enrichit le sol : plus d'azote (minéral + litière) dans le bosquet", () => {
    const nTotal = (s: typeof vendre.state, cx: number, cy: number) => {
      let sum = 0;
      for (let y = cy - 6; y <= cy + 6; y++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
          const i = y * STATION.coteM + x;
          sum += (s.soil.mineralNG[i] ?? 0) + (s.soil.litterNG[i] ?? 0);
        }
      }
      return sum;
    };
    expect(nTotal(epandre.state, 30, 30)).toBeGreaterThan(1.2 * nTotal(vendre.state, 30, 30));
  });

  it("côté carbone : épandre garde les stocks sur la parcelle, vendre les émet (§12)", () => {
    const invVendre = carbonInventory(vendre.state, STATION.initialSoilCTHa);
    const invEpandre = carbonInventory(epandre.state, STATION.initialSoilCTHa);
    expect(invVendre.exporteCumTHa).toBeGreaterThan(0);
    expect(invEpandre.exporteCumTHa).toBe(0);
    expect(invEpandre.totalTHa).toBeGreaterThan(invVendre.totalTHa);
  });

  it("les hêtres voisins poussent mieux quand les aulnes ont été épandus", () => {
    const meanFagus = (s: typeof vendre.state) => {
      const alive = s.trees.filter((t) => t.id > 20 && t.id <= 28 && t.alive);
      expect(alive.length).toBeGreaterThan(0);
      return alive.reduce((sum, t) => sum + t.heightM, 0) / alive.length;
    };
    expect(meanFagus(epandre.state)).toBeGreaterThan(1.05 * meanFagus(vendre.state));
  });
});
