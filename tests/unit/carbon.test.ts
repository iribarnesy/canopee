import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { carbonInventory, treeAboveCarbonKg, treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { runYears } from "../helpers";

describe("allométrie carbone", () => {
  it("un grand hêtre (25 m) stocke quelques tonnes de carbone", () => {
    const kg = treeTotalCarbonKg(getEspece("fagus_sylvatica"), 25);
    expect(kg).toBeGreaterThan(1500);
    expect(kg).toBeLessThan(6000);
  });

  it("un semis stocke un carbone négligeable, et racines < aérien", () => {
    const espece = getEspece("betula_pendula");
    expect(treeTotalCarbonKg(espece, 0.3)).toBeLessThan(1);
    expect(treeTotalCarbonKg(espece, 10)).toBeGreaterThan(treeAboveCarbonKg(espece, 10));
    expect(treeTotalCarbonKg(espece, 10)).toBeLessThan(2 * treeAboveCarbonKg(espece, 10));
  });
});

describe("inventaire carbone d'une parcelle", () => {
  it("l'humus domine les stocks, et une jeune plantation stocke du vivant", () => {
    const state = runYears(LIMON_RICHE, 15, {
      plantations: [
        { especeId: "betula_pendula", count: 40 },
        { especeId: "fagus_sylvatica", count: 40 },
      ],
    });
    const inv = carbonInventory(state, LIMON_RICHE.station.initialSoilCTHa);
    // Le sol reste LE stock dominant en tempéré (§12).
    expect(inv.humusTHa).toBeGreaterThan(inv.vivantTHa);
    expect(inv.humusTHa).toBeGreaterThan(50);
    expect(inv.humusTHa).toBeLessThan(70);
    expect(inv.vivantTHa).toBeGreaterThan(0.5);
    expect(inv.nppCumTHa).toBeGreaterThan(0);
    // Rien vendu ni brûlé dans ce run.
    expect(inv.exporteCumTHa).toBe(0);
  });
});

/**
 * Une chandelle brûlée qu'on vient chercher trop tard. Tant que l'arbre tué par
 * le feu est récupérable, son carbone attend sur pied : le tick n'a rien versé
 * au pool de bois mort. Passé ce délai (CHABLIS_RECUPERABLE_SEMAINES), le tick
 * verse la TOTALITÉ du carbone de l'arbre au pool et pose `mortSemaine` — une
 * fois pour toutes. Le couper ensuite, ce n'est plus abattre un arbre : c'est
 * puiser dans le pool, qui a d'ailleurs commencé à se décomposer.
 */
describe("couper une chandelle déjà versée au bois mort", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 50 };
  const WEATHER = syntheticYear(LIMON_RICHE.climat);
  const PIN = getEspece("pinus_sylvestris");
  const AERIEN = treeAboveCarbonKg(PIN, 15);
  const TOTAL = treeTotalCarbonKg(PIN, 15);

  /** Un pin de 15 m tué par le feu en semaine 0, laissé debout `semaines`. */
  function pinBrule(semaines: number): GameState {
    let state = createGameState(STATION, rngStateFromSeed(13));
    state = plantAt(state, "pinus_sylvestris", 25, 25, 15);
    state = {
      ...state,
      trees: state.trees.map((t) => ({ ...t, alive: false, causeMort: "feu", brulEeSemaine: 0 })),
    };
    for (let i = 0; i < semaines; i++) {
      const w = WEATHER[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    return state;
  }

  function couper(state: GameState) {
    const { state: apres, refusals } = applyAction(state, {
      type: "couper",
      week: state.week,
      treeIds: [1],
      devenir: "vendre",
    });
    expect(refusals).toEqual([]);
    return apres;
  }

  it("encore récupérable : rien n'a été versé, la coupe laisse les racines au sol", () => {
    const avant = pinBrule(10);
    expect(avant.trees.find((t) => t.id === 1)?.mortSemaine).toBeUndefined();
    const poolAvant = avant.carbon.deadWoodKgC;
    const apres = couper(avant);
    expect(apres.carbon.exportedEnergyCumKgC).toBeCloseTo(AERIEN, 6);
    expect(apres.carbon.deadWoodKgC - poolAvant).toBeCloseTo(TOTAL - AERIEN, 6);
  });

  it("passé le délai : le bois est déjà au pool, la coupe l'en RETIRE", () => {
    const avant = pinBrule(60);
    // Le tick a posé la mort en semaine 52 et versé les 933 kgC de l'arbre.
    expect(avant.trees.find((t) => t.id === 1)?.mortSemaine).toBe(52);
    const poolAvant = avant.carbon.deadWoodKgC;
    expect(poolAvant).toBeGreaterThan(900);

    const apres = couper(avant);
    expect(apres.carbon.exportedEnergyCumKgC).toBeCloseTo(AERIEN, 6);
    // Le pool BAISSE de ce qu'on emporte, au lieu de gonfler des racines une
    // deuxième fois : plus de carbone créé de rien, et plus de tronc au pool
    // pour un arbre qui n'est plus debout.
    expect(poolAvant - apres.carbon.deadWoodKgC).toBeCloseTo(AERIEN, 6);
    // Il ne reste au pool que les racines, déjà entamées par la décomposition.
    expect(apres.carbon.deadWoodKgC).toBeGreaterThan(0);
    expect(apres.carbon.deadWoodKgC).toBeLessThan(TOTAL - AERIEN);
  });

  it("on n'en sort pas plus que ce que la décomposition a laissé", () => {
    const vieilli = pinBrule(60);
    // Une chandelle presque entièrement retournée au sol : 100 kgC au pool.
    const avant = { ...vieilli, carbon: { ...vieilli.carbon, deadWoodKgC: 100 } };
    const apres = couper(avant);
    expect(apres.carbon.exportedEnergyCumKgC).toBeCloseTo(100, 6);
    expect(apres.carbon.deadWoodKgC).toBeCloseTo(0, 9);
    expect(apres.carbon.deadWoodKgC).toBeGreaterThanOrEqual(0);
  });
});
