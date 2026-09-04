/**
 * Conservation du carbone (docs/regles.md §12, §16) : chaque semaine — actions
 * du joueur comprises — la production primaire nette égale la variation des
 * stocks (vivant + bois mort + litière + humus) plus les émissions et les
 * exports. Le carbone ne peut ni fuir ni apparaître.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { livingCarbonKg, treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

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
  // Un arbre tué par le feu et encore récupérable n'est ni dans le vivant ni
  // dans le pool de bois mort : son carbone attend sur pied, le temps que le
  // joueur décide (tick.ts, CHABLIS_RECUPERABLE_SEMAINES). Sans ce terme, le
  // versement au pool au bout du délai ressemblerait à une création.
  let surPiedKgC = 0;
  for (const t of state.trees) {
    if (!t.alive && t.mortSemaine === undefined) {
      surPiedKgC += treeTotalCarbonKg(getEspece(t.especeId), t.heightM);
    }
  }
  return livingCarbonKg(state.trees) + surPiedKgC + state.carbon.deadWoodKgC + soilG / 1000;
}

/** NPP + plants achetés − (Δstocks + émissions + exports) : doit rester nul. */
function residuKgC(before: GameState, after: GameState, stockAvant: number): number {
  const c0 = before.carbon;
  const c1 = after.carbon;
  const deltaStock = totalStockKgC(after) - stockAvant;
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
  return deltaStock + emitted + exported - npp - imported;
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
      const stockAvant = totalStockKgC(state);
      const avant = state;
      state = advanceWeek(state, w, actions).state;
      // Entrées : photosynthèse + plants achetés. Sorties : CO2 + bois vendu.
      expect(residuKgC(avant, state, stockAvant)).toBeCloseTo(0, 4);
    }
    // Sanity : de vrais flux ont eu lieu.
    expect(state.carbon.nppCumKgC).toBeGreaterThan(100);
    expect(state.carbon.exportedEnergyCumKgC).toBeGreaterThan(0);
    expect(state.carbon.deadWoodKgC).toBeGreaterThan(0);
  });
});

/**
 * Le cas où le carbone se dédoublait : une chandelle brûlée coupée APRÈS le
 * délai de récupération. Le tick a déjà versé la totalité de son carbone au
 * pool de bois mort ; la coupe exportait quand même sa partie aérienne et
 * rajoutait ses racines au pool — soit un arbre entier créé de rien, et un
 * tronc qui restait au pool alors qu'il n'était plus debout.
 */
describe("couper une chandelle brûlée passé le délai de récupération", () => {
  it("le bois exporté sort du pool de bois mort au lieu de s'y ajouter", () => {
    const SEMAINE_COUPE = 60; // > CHABLIS_RECUPERABLE_SEMAINES (52)
    const actions: GameAction[] = [
      { type: "couper", week: SEMAINE_COUPE, treeIds: [1], devenir: "vendre" },
    ];

    let state = createGameState(STATION, rngStateFromSeed(13));
    state = plantAt(state, "pinus_sylvestris", 25, 25, 15);
    // Tué par le feu en semaine 0, mais toujours debout : le scénario du §7.4.
    state = {
      ...state,
      trees: state.trees.map((t) => ({ ...t, alive: false, causeMort: "feu", brulEeSemaine: 0 })),
    };
    const arbreKgC = treeTotalCarbonKg(getEspece("pinus_sylvestris"), 15);

    let poolAvantCoupe = 0;
    let exporteALaCoupe = 0;
    for (let i = 0; i <= SEMAINE_COUPE; i++) {
      const w = WEATHER[i % 52];
      if (!w) throw new Error("météo manquante");
      const stockAvant = totalStockKgC(state);
      if (i === SEMAINE_COUPE) poolAvantCoupe = state.carbon.deadWoodKgC;
      const avant = state;
      state = advanceWeek(state, w, actions).state;
      if (i === SEMAINE_COUPE) {
        exporteALaCoupe = state.carbon.exportedEnergyCumKgC - avant.carbon.exportedEnergyCumKgC;
      }
      expect(residuKgC(avant, state, stockAvant)).toBeCloseTo(0, 4);
    }

    // Le tronc a bien été versé au pool à la semaine 52, puis emporté.
    expect(poolAvantCoupe).toBeGreaterThan(0.9 * arbreKgC);
    expect(exporteALaCoupe).toBeGreaterThan(0);
    expect(state.trees.some((t) => t.id === 1)).toBe(false);
    // Ce qui reste au pool, ce sont les racines — pas l'arbre entier.
    expect(state.carbon.deadWoodKgC).toBeLessThan(poolAvantCoupe - exporteALaCoupe + 1e-6);
    expect(state.carbon.deadWoodKgC).toBeGreaterThan(0);
  });
});

/**
 * L'autre bout du même fil : la chandelle qui REBRÛLE. Son bois sec est le
 * meilleur combustible de la parcelle (`chargeCombustible`), mais il est déjà
 * compté au pool de bois mort. Le feu l'émettait sans l'en retirer — et pire,
 * pour une essence qui rejette de souche, il faisait « repartir » un arbre
 * mort : 40 charmes morts de 15 m fabriquaient 51 840 kgC en une semaine.
 */
describe("un incendie qui emporte des chandelles", () => {
  // Une lande sèche, sans gibier ni pluie de semis du voisinage : il ne reste
  // sur la parcelle que les chandelles, et le feu qui finit par passer.
  const LANDE = { ...LANDE_SECHE.station, coteM: 50, gibierParHa: 0, voisinage: [] };
  const METEO_SECHE = syntheticYear(LANDE_SECHE.climat);

  it("le bois brûlé sort du pool, et un arbre mort ne rejette pas de souche", () => {
    let state = createGameState(LANDE, rngStateFromSeed(5));
    // Le charme rejette de souche : c'est l'essence qui déclenchait la
    // résurrection d'une chandelle, et donc la création de carbone.
    state = plantScattered(state, "carpinus_betulus", 40, 15);
    state = {
      ...state,
      trees: state.trees.map((t) => ({ ...t, alive: false, causeMort: "secheresse" })),
    };

    let feux = 0;
    let poolAvantFeu = 0;
    let brulKgC = 0;
    let chandellesEmportees = 0;
    for (let i = 0; i < 5 * 52; i++) {
      const w = METEO_SECHE[i % 52];
      if (!w) throw new Error("météo manquante");
      const stockAvant = totalStockKgC(state);
      const avant = state;
      const step = advanceWeek(state, w, []);
      state = step.state;
      expect(residuKgC(avant, state, stockAvant)).toBeCloseTo(0, 4);
      if (step.incendie) {
        feux++;
        poolAvantFeu = avant.carbon.deadWoodKgC;
        brulKgC = state.carbon.emittedCumKgC - avant.carbon.emittedCumKgC;
        chandellesEmportees = avant.trees.length - state.trees.length;
        // Aucun arbre vivant sur la parcelle : le feu ne tue personne, et
        // surtout ne fait rejeter aucun mort.
        expect(step.incendie.arbresTues).toBe(0);
        expect(step.incendie.rejets).toBe(0);
      }
    }

    expect(feux).toBeGreaterThan(0);
    // Les chandelles ont brûlé : elles quittent la carte, et le bois parti en
    // fumée a été PRIS au pool, pas émis en plus de lui.
    expect(chandellesEmportees).toBe(40);
    expect(state.trees).toEqual([]);
    expect(brulKgC).toBeGreaterThan(0);
    expect(state.carbon.deadWoodKgC).toBeLessThan(poolAvantFeu - brulKgC + 1e-6);
    // Il reste les racines : le feu emporte l'aérien, pas ce qui est en terre.
    expect(state.carbon.deadWoodKgC).toBeGreaterThan(0);
  });
});
