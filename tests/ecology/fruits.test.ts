/**
 * Phénologie fruitière (docs/regles.md §7.2) sur la météo réelle de Dijon :
 * l'abricotier (floraison très précoce, atlas : « gel des fleurs = risque »)
 * perd régulièrement sa récolte aux gels tardifs ; le pommier (floraison
 * tardive) ne gèle pas. La pollinisation croisée (§7.5) : un pommier
 * auto-stérile isolé ne produit presque rien.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { FRICHE_LIMON } from "../../src/engine/stations";

const STATION = { ...FRICHE_LIMON.station, coteM: 40, voisinage: [], phInitial: 7 };
const serie = serieMeteoPour("friche-limon");
if (!serie) throw new Error("série Dijon manquante");
const WEATHER = serieToWeeks(serie);

function run(actions: GameAction[], years: number, onWeek: (s: GameState, i: number) => void) {
  let state = createGameState(STATION, rngStateFromSeed(3));
  for (let i = 0; i < years * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    state = advanceWeek(state, w, actions).state;
    onWeek(state, i);
  }
  return state;
}

describe("gel tardif à Dijon (série réelle 1964→) : précoce vs tardif", () => {
  const actions: GameAction[] = [
    {
      type: "planter",
      week: 0,
      especeId: "prunus_armeniaca",
      positions: [
        { x: 10, y: 10 },
        { x: 14, y: 10 },
        { x: 10, y: 14 },
      ],
    },
    {
      type: "planter",
      week: 1,
      especeId: "malus_domestica",
      positions: [
        { x: 25, y: 25 },
        { x: 29, y: 25 },
        { x: 25, y: 29 },
      ],
    },
  ];
  let abricotGel = 0;
  let abricotFruit = 0;
  let pommeGel = 0;
  let pommeFruit = 0;
  run(actions, 20, (state, i) => {
    if (Math.floor(i / 52) < 7) return; // après l'entrée en production
    const w = i % 52;
    if (w === 27) {
      const kg = state.trees
        .filter((t) => t.especeId === "prunus_armeniaca")
        .reduce((s, t) => s + t.fruitsKg, 0);
      if (kg > 1) abricotFruit++;
      if (state.trees.some((t) => t.especeId === "prunus_armeniaca" && t.bloomFrosted))
        abricotGel++;
    }
    if (w === 38) {
      const kg = state.trees
        .filter((t) => t.especeId === "malus_domestica")
        .reduce((s, t) => s + t.fruitsKg, 0);
      if (kg > 1) pommeFruit++;
      if (state.trees.some((t) => t.especeId === "malus_domestica" && t.bloomFrosted)) pommeGel++;
    }
  });

  it("l'abricotier perd régulièrement des récoltes au gel, mais produit les bonnes années", () => {
    expect(abricotGel).toBeGreaterThanOrEqual(2);
    expect(abricotFruit).toBeGreaterThanOrEqual(5);
  });

  it("le pommier, à floraison tardive, ne gèle jamais sur cette période", () => {
    expect(pommeGel).toBe(0);
    expect(pommeFruit).toBeGreaterThanOrEqual(4);
  });
});

describe("pollinisation croisée (§7.5) et récolte (§10)", () => {
  it("un pommier auto-stérile isolé produit ~5× moins qu'un couple", () => {
    const runYield = (positions: { x: number; y: number }[]) => {
      const actions: GameAction[] = [
        { type: "planter", week: 0, especeId: "malus_domestica", positions },
      ];
      let bestKg = 0;
      run(actions, 10, (state, i) => {
        if (i % 52 === 38) {
          const first = state.trees.find((t) => t.id === 1);
          bestKg = Math.max(bestKg, first?.fruitsKg ?? 0);
        }
      });
      return bestKg;
    };
    const seul = runYield([{ x: 20, y: 20 }]);
    const couple = runYield([
      { x: 20, y: 20 },
      { x: 25, y: 20 },
    ]);
    expect(seul).toBeGreaterThan(0);
    expect(couple).toBeGreaterThan(4 * seul);
  });

  it("récolter rapporte ; ne pas récolter = fruits perdus après la fenêtre", () => {
    const base: GameAction[] = [
      {
        type: "planter",
        week: 0,
        especeId: "malus_domestica",
        positions: [
          { x: 20, y: 20 },
          { x: 25, y: 20 },
        ],
      },
      // Un verger se protège du gibier : sans manchon, des pommiers (parmi
      // les essences les plus appétentes) ne montent jamais à fruit. Ce test
      // porte sur la récolte, pas sur le broutage — on met donc l'arboriculteur
      // dans les conditions où il travaille vraiment.
      { type: "proteger", week: 1, treeIds: [1, 2] },
    ];
    // Les fruits mûrissent pendant le tick de la semaine 38 : on récolte la
    // semaine suivante (les actions s'exécutent avant le tick).
    const harvestWeek = 8 * 52 + 39;
    const avecRecolte: GameAction[] = [
      ...base,
      { type: "recolter", week: harvestWeek, treeIds: [1, 2] },
    ];
    let treasuryAvec = 0;
    let treasurySans = 0;
    let fruitsApresFenetre = -1;
    run(avecRecolte, 9, (state, i) => {
      if (i === harvestWeek) treasuryAvec = state.economy.treasuryEur;
    });
    run(base, 9, (state, i) => {
      if (i === harvestWeek) treasurySans = state.economy.treasuryEur;
      if (i === 8 * 52 + 42) {
        fruitsApresFenetre = state.trees.reduce((s, t) => s + t.fruitsKg, 0);
      }
    });
    expect(treasuryAvec).toBeGreaterThan(treasurySans + 10);
    expect(fruitsApresFenetre).toBe(0); // récolte non faite = perdue (§10)
  });
});

describe("service de pollinisation (§7.4, critère G4)", () => {
  it("un verger nu produit moins que le même verger dans un environnement diversifié", () => {
    const positions = [
      { x: 20, y: 20 },
      { x: 25, y: 20 },
    ];
    const recolte = (accompagnement: GameAction[]): number => {
      const actions: GameAction[] = [
        { type: "planter", week: 0, especeId: "malus_domestica", positions },
        { type: "proteger", week: 1, treeIds: [1, 2] },
        ...accompagnement,
      ];
      let best = 0;
      run(actions, 12, (state) => {
        for (const t of state.trees) {
          if (t.especeId === "malus_domestica") best = Math.max(best, t.fruitsKg);
        }
      });
      return best;
    };
    const nu = recolte([]);
    // Une haie d'essences variées et étagées autour du verger : c'est de là que
    // viennent les pollinisateurs, et les mêmes habitats servent aux auxiliaires.
    const haie: GameAction[] = [
      {
        type: "planter",
        week: 0,
        especeId: "corylus_avellana",
        positions: [
          { x: 14, y: 20 },
          { x: 14, y: 24 },
        ],
      },
      {
        type: "planter",
        week: 0,
        especeId: "quercus_pubescens",
        positions: [
          { x: 14, y: 16 },
          { x: 31, y: 20 },
        ],
      },
      {
        type: "planter",
        week: 0,
        especeId: "betula_pendula",
        positions: [
          { x: 31, y: 16 },
          { x: 31, y: 24 },
        ],
      },
    ];
    const accompagne = recolte(haie);
    expect(accompagne).toBeGreaterThan(1.15 * nu);
  });
});
