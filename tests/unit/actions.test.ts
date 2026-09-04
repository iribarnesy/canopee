import { describe, expect, it } from "vitest";
import {
  applyAction,
  DECOTE_BOIS_MORT,
  DENSITE_BOIS_MORT_KG_M3,
  estGesteSurArbres,
  estGesteSurZone,
  fellingHours,
  type GameAction,
  PLANT_HOURS,
  WEEK_HOURS_CAP,
  WOOD_PRICE_EUR_M3,
  woodVolumeM3,
} from "../../src/engine/actions";
import { CARBON_FRACTION } from "../../src/engine/carbon";
import { chargeCombustible } from "../../src/engine/feu";
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

/**
 * Les retours de geste : quels arbres l'action a RÉELLEMENT touchés.
 *
 * Sans eux, le rendu reçoit un instantané avec un arbre en moins et n'a aucun
 * moyen de savoir lequel : l'arbre s'escamote au lieu de tomber.
 */
describe("ce que l'action rapporte au rendu", () => {
  function troisFrenes() {
    let state = createGameState(STATION, rngStateFromSeed(4));
    state = plantAt(state, "fraxinus_excelsior", 10, 10, 9);
    state = plantAt(state, "fraxinus_excelsior", 16, 10, 9);
    state = plantAt(state, "fraxinus_excelsior", 22, 10, 9);
    const ids = state.trees.map((t) => t.id);
    return { state, ids };
  }

  it("la coupe nomme les tiges tombées", () => {
    const { state, ids } = troisFrenes();
    const r = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [ids[0] ?? 0, ids[1] ?? 0],
      devenir: "vendre",
    });
    expect(r.gestes).toEqual([{ type: "couper", ids: [ids[0], ids[1]] }]);
  });

  it("elle ne nomme que celles qui sont vraiment tombées", () => {
    const { state, ids } = troisFrenes();
    const r = applyAction(state, {
      type: "couper",
      week: 0,
      // 9999 n'existe pas : il est refusé, il ne doit pas s'animer.
      treeIds: [ids[0] ?? 0, 9999],
      devenir: "vendre",
    });
    expect(r.gestes).toEqual([{ type: "couper", ids: [ids[0]] }]);
    expect(r.refusals).toHaveLength(1);
  });

  it("l'éclaircie se distingue de la coupe : ce n'est pas la même animation", () => {
    const { state } = troisFrenes();
    const r = applyAction(state, {
      type: "eclaircir",
      week: 0,
      x: 16,
      y: 10,
      rayonM: 12,
      densiteCibleParHa: 1,
      critere: "parLeBas",
      devenir: "vendre",
    });
    const geste = r.gestes?.[0];
    expect(geste?.type).toBe("eclaircir");
    expect(geste && estGesteSurArbres(geste) ? geste.ids.length : 0).toBeGreaterThan(0);
  });

  it("élaguer, étêter, recéper : chacun se dit", () => {
    const { state, ids } = troisFrenes();
    const elague = applyAction(state, {
      type: "elaguer",
      week: 0,
      treeIds: [ids[0] ?? 0],
      hauteurM: 3,
    });
    expect(elague.gestes).toEqual([{ type: "elaguer", ids: [ids[0]] }]);

    const trogne = applyAction(state, {
      type: "trogner",
      week: 0,
      treeIds: [ids[1] ?? 0],
      hauteurTeteM: 2,
    });
    expect(trogne.gestes).toEqual([{ type: "trogner", ids: [ids[1]] }]);

    const recepe = applyAction(state, {
      type: "receper",
      week: 0,
      treeIds: [ids[2] ?? 0],
    });
    expect(recepe.gestes).toEqual([{ type: "receper", ids: [ids[2]] }]);
  });

  it("une action refusée n'annonce aucun geste", () => {
    const { state } = troisFrenes();
    const r = applyAction(state, { type: "elaguer", week: 0, treeIds: [9999], hauteurM: 3 });
    expect(r.gestes).toEqual([]);
    expect(r.refusals).toHaveLength(1);
  });
});

describe("ramasser le bois mort couché", () => {
  /** Une parcelle où un tronc s'est couché autour de (10, 10). */
  function avecUnTroncAuSol(gParM2 = 4000) {
    const state = createGameState(STATION, rngStateFromSeed(1));
    const boisAuSolCG = state.soil.boisAuSolCG.slice();
    for (let d = 0; d < 12; d++) boisAuSolCG[10 * STATION.coteM + (10 + d)] = gParM2;
    return { ...state, soil: { ...state.soil, boisAuSolCG } };
  }

  it("le bois part, l'argent rentre, et le carbone est compté comme exporté", () => {
    const avant = avecUnTroncAuSol();
    const stock = avant.soil.boisAuSolCG.reduce((a, v) => a + v, 0) / 1000;
    const { state, refusals } = applyAction(avant, {
      type: "ramasserBoisMort",
      week: 10,
      x: 16,
      y: 10.5,
      rayonM: 8,
    });
    expect(refusals).toHaveLength(0);
    const reste = state.soil.boisAuSolCG.reduce((a, v) => a + v, 0) / 1000;
    const ramasse = stock - reste;
    expect(ramasse).toBeGreaterThan(0);
    // Rien ne se perd : ce qui quitte le sol est exactement ce qui est compté
    // comme parti en fumée chez l'acheteur.
    expect(state.carbon.exportedEnergyCumKgC - avant.carbon.exportedEnergyCumKgC).toBeCloseTo(
      ramasse,
      6,
    );
    expect(state.economy.treasuryEur).toBeGreaterThan(avant.economy.treasuryEur);
    expect(state.economy.hoursUsedWeek).toBeGreaterThan(avant.economy.hoursUsedWeek);
  });

  it("il se vend moins cher qu'une bille fraîche du même volume", () => {
    const avant = avecUnTroncAuSol();
    const stock = avant.soil.boisAuSolCG.reduce((a, v) => a + v, 0) / 1000;
    const { state } = applyAction(avant, {
      type: "ramasserBoisMort",
      week: 10,
      x: 16,
      y: 10.5,
      rayonM: 8,
    });
    const gagne = state.economy.treasuryEur - avant.economy.treasuryEur;
    const volumeM3 = stock / CARBON_FRACTION / DENSITE_BOIS_MORT_KG_M3;
    expect(gagne).toBeLessThan(volumeM3 * WOOD_PRICE_EUR_M3);
    expect(gagne).toBeCloseTo(volumeM3 * WOOD_PRICE_EUR_M3 * DECOTE_BOIS_MORT, 6);
  });

  it("ramasser là où il n'y a rien est refusé, pas facturé", () => {
    const avant = createGameState(STATION, rngStateFromSeed(1));
    const { state, refusals } = applyAction(avant, {
      type: "ramasserBoisMort",
      week: 10,
      x: 25,
      y: 25,
      rayonM: 5,
    });
    expect(refusals).toHaveLength(1);
    expect(state.economy.treasuryEur).toBe(avant.economy.treasuryEur);
    expect(state.economy.hoursUsedWeek).toBe(avant.economy.hoursUsedWeek);
  });

  it("le bois couché est du gros combustible : l'enlever fait baisser la charge", () => {
    // Il s'allume mal mais il fait durer le feu. Nettoyer une parcelle de son
    // bois mort réduit donc le risque — au prix de tout ce que le bois mort
    // apportait par ailleurs.
    const avant = avecUnTroncAuSol();
    const herbe = new Array(STATION.coteM * STATION.coteM).fill(0.2);
    const litiere = new Array(STATION.coteM * STATION.coteM).fill(50);
    const avec = chargeCombustible(
      [],
      herbe,
      litiere,
      STATION.coteM,
      undefined,
      avant.soil.boisAuSolCG,
    );
    const sans = chargeCombustible([], herbe, litiere, STATION.coteM);
    expect(avec.moyenne).toBeGreaterThan(sans.moyenne);
  });
});

/**
 * Les gestes de ZONE. `GesteVisible` ne savait désigner que des arbres
 * nommés : toutes les actions de sol étaient donc muettes pour le rendu, et
 * un tronc ramassé disparaissait d'une image à l'autre — indiscernable de sa
 * décomposition, qui est un tout autre phénomène et bien plus lente.
 */
describe("les gestes qui n'ont pas d'arbre pour cible", () => {
  function cellulesDe(r: ReturnType<typeof applyAction>, type: string): readonly number[] {
    const geste = (r.gestes ?? []).filter(estGesteSurZone).find((g) => g.type === type);
    return geste?.cellules ?? [];
  }

  it("le chaulage nomme le disque chaulé, aux indices des grilles", () => {
    const state = createGameState(STATION, rngStateFromSeed(2));
    const r = applyAction(state, { type: "chauler", week: 0, x: 10, y: 10, rayonM: 3 });
    const cellules = cellulesDe(r, "chauler");
    expect(cellules.length).toBeGreaterThan(0);
    // Mêmes indices que `soilPh` : c'est là que le pH a bougé, et nulle part ailleurs.
    for (const i of cellules) {
      expect(r.state.soil.ph[i]).toBeGreaterThan(state.soil.ph[i] ?? 0);
    }
    const touchees = new Set(cellules);
    for (let i = 0; i < state.soil.ph.length; i++) {
      if (!touchees.has(i)) expect(r.state.soil.ph[i]).toBe(state.soil.ph[i]);
    }
  });

  it("le labour et la clôture disent aussi leur zone", () => {
    const state = createGameState(STATION, rngStateFromSeed(2));
    const laboure = applyAction(state, { type: "labourer", week: 0, x: 10, y: 10, rayonM: 4 });
    expect(cellulesDe(laboure, "labourer").length).toBeGreaterThan(0);

    const close = applyAction(state, { type: "cloturer", week: 0, x: 10, y: 10, rayonM: 4 });
    const cellules = cellulesDe(close, "cloturer");
    expect(cellules.length).toBeGreaterThan(0);
    for (const i of cellules) expect(close.state.soil.cloture[i]).toBe(true);
  });

  it("la fauche ne nomme que ce qu'elle a vraiment coupé", () => {
    // Une pelouse déjà rase ne se fauche pas : le rendu n'a rien à y montrer.
    const state = createGameState(STATION, rngStateFromSeed(2));
    const rase = {
      ...state,
      soil: { ...state.soil, herbeCouverture: state.soil.herbeCouverture.map(() => 0) },
    };
    const r = applyAction(rase, { type: "faucher", week: 0, x: 10, y: 10, rayonM: 5 });
    expect(cellulesDe(r, "faucher")).toEqual([]);
  });

  it("le ramassage nomme les cellules d'où le bois est parti", () => {
    const state = createGameState(STATION, rngStateFromSeed(2));
    const cote = STATION.coteM;
    const avecBois = {
      ...state,
      soil: {
        ...state.soil,
        boisAuSolCG: state.soil.boisAuSolCG.map((_, i) => (i === 10 * cote + 10 ? 4000 : 0)),
      },
    };
    const r = applyAction(avecBois, {
      type: "ramasserBoisMort",
      week: 0,
      x: 10.5,
      y: 10.5,
      rayonM: 3,
    });
    // Seule la cellule qui PORTAIT du bois : les voisines vides n'ont rien
    // perdu, et le rendu n'a pas à les animer.
    expect(cellulesDe(r, "ramasserBoisMort")).toEqual([10 * cote + 10]);
    expect(r.state.soil.boisAuSolCG[10 * cote + 10]).toBe(0);
  });
});
