/**
 * LA mécanique fondatrice du game design (docs/regles.md §4.2, §16) : le
 * joueur qui coupe ses fixateurs choisit — VENDRE la récolte (argent) ou
 * ÉPANDRE sur place (l'azote fixé retourne au sol et nourrit les voisins).
 * Les deux parties sont identiques jusqu'à la coupe (même seed, même journal
 * amont) ; seul le devenir diffère. La litière annuelle des aulnes vivants
 * fertilise les deux scénarios à l'identique jusqu'à la coupe ; après, la
 * zone « vendre » s'épuise, la zone « épandre » tient des années grâce au
 * BRF (C/N ligneux, libération lente — ch2-B).
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import { carbonInventory } from "../../src/engine/carbon";
import { advanceWeek, runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
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

const CUT_WEEK = 8 * 52 + 30; // fin d'été de l'an 8 (l'azote de l'année est dans les feuilles)

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

describe("couper les aulnes : épandre ou vendre (16 ans, limon pauvre en N)", () => {
  const vendre = runJournal(STATION, journal("vendre"), WEATHER, 16 * 52);
  const epandre = runJournal(STATION, journal("epandre"), WEATHER, 16 * 52);

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
    // Le gain est passé de 5 % à 2 % le jour où le besoin d'azote des arbres
    // a été ramené à un budget réel (`AZOTE_HOUPPIER_G_M2_AN`, trees.ts) : il
    // était auparavant une quinzaine de fois trop gros, si bien que le hêtre
    // était affamé en permanence et que le moindre apport se voyait. Un hêtre
    // de trois mètres consomme une quinzaine de grammes d'azote par an, pas
    // deux cents ; l'apport des aulnes le sert donc moins. Le mécanisme tient
    // toujours — c'est son AMPLEUR qui était exagérée par un bug.
    expect(meanFagus(epandre.state)).toBeGreaterThan(1.02 * meanFagus(vendre.state));
  });
});

describe("le tas de broyat : transporter la fertilité", () => {
  it("broyer met en réserve au lieu de nourrir le sol tout de suite", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "alnus_glutinosa", 10, 10, 6);
    const id = state.nextTreeId - 1;
    for (let i = 0; i < 60; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const litiereAvant = state.soil.litterNG.reduce((a, b) => a + b, 0);
    const apres = applyAction(state, {
      type: "couper",
      week: 60,
      treeIds: [id],
      devenir: "broyer",
    }).state;
    // Rien n'est tombé au sol : tout est dans la remorque.
    expect(apres.stockBrf.azoteG).toBeGreaterThan(0);
    expect(apres.soil.litterNG.reduce((a, b) => a + b, 0)).toBeCloseTo(litiereAvant, 6);
  });

  it("on l'épand où l'on veut, et l'azote y va — pas ailleurs", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "alnus_glutinosa", 10, 10, 6);
    const id = state.nextTreeId - 1;
    for (let i = 0; i < 60; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const broye = applyAction(state, {
      type: "couper",
      week: 60,
      treeIds: [id],
      devenir: "broyer",
    }).state;
    const stock = broye.stockBrf.azoteG;
    // On porte le tas à l'autre bout de la parcelle, loin de l'aulne coupé.
    const epandu = applyAction(broye, {
      type: "epandreBrf",
      week: 61,
      x: 30,
      y: 30,
      rayonM: 4,
      part: 1,
    }).state;
    const cote = STATION.coteM;
    const litiere = (x: number, y: number) => epandu.soil.litterNG[y * cote + x] ?? 0;
    expect(litiere(30, 30)).toBeGreaterThan(0);
    // Là où l'arbre a été coupé, rien n'a été déposé.
    expect(litiere(10, 10)).toBeCloseTo(broye.soil.litterNG[10 * cote + 10] ?? 0, 6);
    // Le tas est vidé, et rien ne s'est perdu en route.
    expect(epandu.stockBrf.azoteG).toBeCloseTo(0, 6);
    const depose =
      epandu.soil.litterNG.reduce((a, b) => a + b, 0) -
      broye.soil.litterNG.reduce((a, b) => a + b, 0);
    expect(depose).toBeCloseTo(stock, 4);
  });

  it("épandre un gros tas coûte des heures : la manutention n'est pas gratuite", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = { ...state, stockBrf: { carboneG: 400_000, azoteG: 4_000 } };
    const apres = applyAction(state, {
      type: "epandreBrf",
      week: 1,
      x: 20,
      y: 20,
      rayonM: 6,
      part: 1,
    });
    expect(apres.state.economy.hoursUsedWeek).toBeGreaterThan(2);
  });

  it("on ne peut pas épandre un tas vide", () => {
    const state = createGameState(STATION, rngStateFromSeed(3));
    const r = applyAction(state, {
      type: "epandreBrf",
      week: 1,
      x: 20,
      y: 20,
      rayonM: 5,
      part: 1,
    });
    expect(r.refusals).toHaveLength(1);
  });
});
