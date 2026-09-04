/**
 * Conservation du carbone (docs/regles.md §12, §16) : chaque semaine — actions
 * du joueur comprises — la production primaire nette égale la variation des
 * stocks (vivant + bois mort + litière + humus) plus les émissions et les
 * exports. Le carbone ne peut ni fuir ni apparaître.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { applyAction, RECEPAGE_HAUTEUR_M } from "../../src/engine/actions";
import {
  livingCarbonKg,
  racinesPerduesEnRabattant,
  treeAboveCarbonKg,
} from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION = { ...LIMON_RICHE.station, coteM: 50 };
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/** Stock total de carbone de la parcelle, kg C (cellules de 1 m² : g → kg). */
function totalStockKgC(state: GameState): number {
  let soilG = 0;
  for (let i = 0; i < state.soil.litterCG.length; i++) {
    soilG +=
      (state.soil.litterCG[i] ?? 0) +
      (state.soil.humusCG[i] ?? 0) +
      // Le bois couché est un stock à part entière : sans cette ligne, une
      // chandelle qui s'abat ferait apparaître du carbone venu de nulle part
      // (boisMort.ts).
      (state.soil.boisAuSolCG[i] ?? 0);
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
      // Rabattre un arbre VIVANT : la tige s'exporte, mais les racines qu'il
      // cesse de porter restent au sol. Sans elles au bilan, un aulne de
      // quelques mètres recépé fait disparaître son carbone racinaire.
      { type: "receper", week: 6 * 52 + 30, treeIds: [6, 7, 8] },
      { type: "trogner", week: 7 * 52 + 10, treeIds: [9, 10], hauteurTeteM: 2 },
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
      // L'érosion est une sortie comme une autre : le carbone du sol emporté
      // n'est ni émis ni vendu, il est parti ailleurs (erosion.ts).
      const exported =
        c1.exportedEnergyCumKgC -
        c0.exportedEnergyCumKgC +
        (c1.oeuvreCumKgC - c0.oeuvreCumKgC) +
        (c1.erosionCumKgC - c0.erosionCumKgC);
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

/**
 * Rabattre un arbre VIVANT — recéper, étêter, rejeter après feu — est le
 * troisième cas de la même famille, et le plus discret : l'arbre reste en
 * jeu, sa hauteur baisse, et comme son carbone racinaire se déduit de sa
 * hauteur, il en perd sans que personne le reçoive.
 */
describe("rabattre un arbre vivant ne détruit pas son carbone", () => {
  const espece = getEspece("carpinus_betulus");
  const STATION_20 = { ...LIMON_RICHE.station, coteM: 20, voisinage: [] };

  function charmeDe(hauteurM: number) {
    let state = createGameState(STATION_20, rngStateFromSeed(1));
    state = plantAt(state, "carpinus_betulus", 10, 10, hauteurM);
    return { state, id: state.nextTreeId - 1 };
  }

  /** Ce qui doit être conservé : stocks + ce qui est sorti du système. */
  function bilanKgC(state: GameState): number {
    let solG = 0;
    for (let i = 0; i < state.soil.boisAuSolCG.length; i++) {
      solG += state.soil.boisAuSolCG[i] ?? 0;
    }
    return (
      livingCarbonKg(state.trees) +
      state.carbon.deadWoodKgC +
      solG / 1000 +
      state.carbon.exportedEnergyCumKgC +
      state.carbon.oeuvreCumKgC +
      state.carbon.emittedCumKgC
    );
  }

  it("le recépage : la tige s'exporte, les racines restent au sol", () => {
    const { state, id } = charmeDe(12);
    const r = applyAction(state, { type: "receper", week: 0, treeIds: [id] });
    expect(r.refusals).toEqual([]);
    // Rien n'est créé, rien ne disparaît : la litière ne bouge pas ici, donc
    // le bilan se referme exactement.
    expect(bilanKgC(r.state)).toBeCloseTo(bilanKgC(state), 6);
    // Et ce qui reste au sol est bien la part racinaire perdue, pas zéro.
    const attendu = racinesPerduesEnRabattant(espece, 12, RECEPAGE_HAUTEUR_M);
    expect(attendu).toBeGreaterThan(100);
    expect(r.state.carbon.deadWoodKgC - state.carbon.deadWoodKgC).toBeCloseTo(attendu, 6);
  });

  it("l'étêtage : même règle, à la hauteur de la tête", () => {
    const { state, id } = charmeDe(12);
    const r = applyAction(state, {
      type: "trogner",
      week: 0,
      treeIds: [id],
      hauteurTeteM: 2,
    });
    expect(r.refusals).toEqual([]);
    expect(bilanKgC(r.state)).toBeCloseTo(bilanKgC(state), 6);
    expect(r.state.carbon.deadWoodKgC - state.carbon.deadWoodKgC).toBeCloseTo(
      racinesPerduesEnRabattant(espece, 12, 2),
      6,
    );
  });

  it("on ne vend pas la souche qu'on laisse debout", () => {
    // Exporter l'aérien ENTIER d'un arbre recépé créait le carbone du demi-
    // mètre resté sur place — et le facturait au client.
    const { state, id } = charmeDe(12);
    const r = applyAction(state, { type: "receper", week: 0, treeIds: [id] });
    const exporte = r.state.carbon.exportedEnergyCumKgC - state.carbon.exportedEnergyCumKgC;
    expect(exporte).toBeCloseTo(
      treeAboveCarbonKg(espece, 12) - treeAboveCarbonKg(espece, RECEPAGE_HAUTEUR_M),
      6,
    );
    expect(exporte).toBeLessThan(treeAboveCarbonKg(espece, 12));
  });
});
