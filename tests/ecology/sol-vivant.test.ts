/**
 * Le sol comme capital (critères A12, C8, C9, I6 ; docs/regles.md §2 et §12).
 *
 * Trois boucles se referment ici, et elles vont ensemble :
 *  - l'humus EST le stock d'azote organique : ce qui s'en minéralise rend de
 *    l'azote aux plantes, au rapport C/N de l'humus ;
 *  - l'humus retient l'eau : en construire améliore la réserve utile ;
 *  - le labour brûle du capital pour un gain immédiat.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { applyAction, LABOUR_PERTE_HUMUS } from "../../src/engine/actions";
import { CN_HUMUS, T_HA_TO_G_M2 } from "../../src/engine/carbon";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { azoteNetDecomposition } from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ruHorizonMm } from "../../src/engine/soil";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const WEATHER = serieToWeeks(SERIE);

const STATION: Station = {
  ...LIMON_RICHE.station,
  coteM: 30,
  voisinage: [],
  gibierParHa: 0,
};

function partie(actions: GameAction[], semaines: number) {
  let state = createGameState(STATION, rngStateFromSeed(2));
  let mineralisationCum = 0;
  const serieN: number[] = [];
  for (let i = 0; i < semaines; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, actions);
    state = r.state;
    mineralisationCum += r.fluxes.mineralizationKgHa;
    serieN.push(r.fluxes.mineralizationKgHa);
  }
  const moyenne = (a: readonly number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    state,
    mineralisationCum,
    serieN,
    humusTHa: moyenne(state.soil.humusCG) / T_HA_TO_G_M2,
    azoteMineralGM2: moyenne(state.soil.mineralNG),
  };
}

describe("l'humus rend l'azote", () => {
  it("deux sols identiques, celui qui a plus d'humus minéralise plus", () => {
    const riche = partie([], 52);
    const pauvre = (() => {
      let state = createGameState(STATION, rngStateFromSeed(2));
      // Moitié moins d'humus, tout le reste identique.
      state = { ...state, soil: { ...state.soil, humusCG: state.soil.humusCG.map((v) => v / 2) } };
      let cum = 0;
      for (let i = 0; i < 52; i++) {
        const w = WEATHER[i % WEATHER.length];
        if (!w) throw new Error("météo manquante");
        const r = advanceWeek(state, w, []);
        state = r.state;
        cum += r.fluxes.mineralizationKgHa;
      }
      return cum;
    })();
    // Proportionnalité stricte au stock, à quelques pour cent près (le
    // peuplement réagit à l'azote qu'il reçoit, donc les deux sols ne vivent
    // pas exactement la même année).
    expect(pauvre).toBeGreaterThan(0.45 * riche.mineralisationCum);
    expect(pauvre).toBeLessThan(0.55 * riche.mineralisationCum);
  });

  it("la minéralisation reste dans les ordres de grandeur agronomiques", () => {
    // Un limon profond et vivant rend quelques dizaines de kilos d'azote à
    // l'hectare et par an — pas deux cents, comme le donnait le potentiel figé
    // qu'on utilisait avant (il comptait deux fois la litière fraîche).
    const an = partie([], 52).mineralisationCum;
    expect(an).toBeGreaterThan(25);
    expect(an).toBeLessThan(110);
  });
});

describe("l'humus retient l'eau (A12)", () => {
  it("un horizon plus riche en matière organique a une réserve utile plus grande", () => {
    const h = STATION.profil[0];
    if (!h) throw new Error("profil vide");
    expect(ruHorizonMm({ ...h, moPct: h.moPct * 2 })).toBeGreaterThan(ruHorizonMm(h));
  });
});

describe("le labour : un gain immédiat payé par le capital", () => {
  const zone = { x: 15, y: 15, rayonM: 10 };
  const avant = createGameState(STATION, rngStateFromSeed(2));
  const apres = applyAction(avant, { type: "labourer", week: 1, ...zone });

  it("il libère d'un coup une bouffée d'azote", () => {
    const cellule = 15 * 30 + 15;
    const gagne = (apres.state.soil.mineralNG[cellule] ?? 0) - (avant.soil.mineralNG[cellule] ?? 0);
    const attendu = ((avant.soil.humusCG[cellule] ?? 0) * LABOUR_PERTE_HUMUS) / CN_HUMUS;
    expect(gagne).toBeGreaterThan(0.9 * attendu);
    // Quelques grammes par m², soit des dizaines de kilos à l'hectare : le
    // « coup de fouet » qui a fait la réputation de la charrue.
    expect(gagne * 10).toBeGreaterThan(20);
  });

  it("…et il brûle du capital sol, qui met des décennies à revenir", () => {
    const cellule = 15 * 30 + 15;
    expect(apres.state.soil.humusCG[cellule] ?? 0).toBeLessThan(
      (avant.soil.humusCG[cellule] ?? 0) * 0.96,
    );
  });

  it("il fait table rase : herbe et jeunes plants y passent", () => {
    let state = createGameState(STATION, rngStateFromSeed(2));
    state = plantAt(state, "quercus_pubescens", 15, 15, 0.5);
    state = plantAt(state, "quercus_pubescens", 15, 15.5, 3);
    const r = applyAction(state, { type: "labourer", week: 1, ...zone });
    const vivants = r.state.trees.filter((t) => t.alive);
    expect(vivants).toHaveLength(1);
    expect(vivants[0]?.heightM).toBe(3);
    expect(r.state.soil.herbeCouverture[15 * 30 + 15]).toBe(0);
  });

  it("on ne laboure pas là où l'engin ne passe pas", () => {
    let state = createGameState(STATION, rngStateFromSeed(2));
    for (let a = 0; a < 16; a++) {
      for (let b = 0; b < 16; b++) {
        state = plantAt(state, "quercus_pubescens", 1 + a * 1.8, 1 + b * 1.8, 4);
      }
    }
    const r = applyAction(state, { type: "labourer", week: 1, ...zone });
    expect(r.refusals).toHaveLength(1);
    expect(r.refusals[0]?.reason).toMatch(/manœuvrer/);
  });

  it("labourer tous les ans épuise le sol, et l'azote finit par manquer", () => {
    const chaque: GameAction[] = [];
    for (let an = 0; an < 25; an++) {
      chaque.push({ type: "labourer", week: an * 52 + 10, ...zone });
    }
    const laboure = partie(chaque, 25 * 52);
    const tranquille = partie([], 25 * 52);
    // Un quart de siècle de charrue : le stock d'humus s'effondre…
    expect(laboure.humusTHa).toBeLessThan(0.75 * tranquille.humusTHa);
    // …et à la fin, le sol rend moins d'azote qu'un sol qu'on a laissé vivre,
    // alors même que chaque labour en libérait beaucoup sur le moment.
    const cinqDerniers = (s: readonly number[]) => s.slice(-5 * 52).reduce((a, b) => a + b, 0) / 5;
    expect(cinqDerniers(laboure.serieN)).toBeLessThan(cinqDerniers(tranquille.serieN));
  });
});

describe("la faim d'azote (C9)", () => {
  it("le seuil est vers C/N 27 : en dessous ça libère, au-dessus ça ponctionne", () => {
    // 100 g de carbone décomposé, avec des substrats de plus en plus pauvres.
    const net = (cn: number) => azoteNetDecomposition(100, 100 / cn);
    expect(net(15)).toBeGreaterThan(0); // litière d'aulne : elle nourrit
    expect(net(50)).toBeLessThan(0); // BRF ligneux : il affame
    expect(net(27)).toBeCloseTo(0, 1); // le point de bascule
  });

  it("épandre du BRF ponctionne l'azote du sol avant de le rendre", () => {
    // Deux parcelles identiques ; sur l'une, on broie vingt aulnes sur place.
    const construire = () => {
      let state = createGameState(STATION, rngStateFromSeed(2));
      const ids: number[] = [];
      for (let i = 0; i < 20; i++) {
        state = plantAt(state, "alnus_glutinosa", 11 + (i % 5) * 2, 11 + Math.floor(i / 5) * 2, 6);
        const dernier = state.trees[state.trees.length - 1];
        if (dernier) ids.push(dernier.id);
      }
      return { state, ids };
    };
    const base = construire();
    const cellules = () => {
      const idx: number[] = [];
      for (let y = 8; y < 23; y++) for (let x = 8; x < 23; x++) idx.push(y * 30 + x);
      return idx;
    };
    const azoteMineral = (s: typeof base.state) => {
      const idx = cellules();
      return idx.reduce((a, i) => a + (s.soil.mineralNG[i] ?? 0), 0) / idx.length;
    };
    const suivre = (epandre: boolean) => {
      let state = construire().state;
      const actions: GameAction[] = epandre
        ? [{ type: "couper", week: 5, treeIds: base.ids, devenir: "epandre" }]
        : [];
      const serie: number[] = [];
      for (let i = 0; i < 60; i++) {
        const w = WEATHER[i % WEATHER.length];
        if (!w) throw new Error("météo manquante");
        state = advanceWeek(state, w, actions).state;
        serie.push(azoteMineral(state));
      }
      return serie;
    };
    const avecBrf = suivre(true);
    const sans = suivre(false);
    // Un mois après le broyage, le sol EN A MOINS que s'il n'avait rien reçu :
    // les décomposeurs se servent avant les plantes. C'est la raison pour
    // laquelle on n'enfouit pas du BRF juste avant de planter.
    const apresUnMois = 5 + 4;
    expect(avecBrf[apresUnMois] ?? 0).toBeLessThan(sans[apresUnMois] ?? 0);
    // Rien n'est perdu pour autant : le total (minéral + litière) reste
    // supérieur, c'est ce que vérifie epandre-vs-vendre.test.ts.
  });
});
