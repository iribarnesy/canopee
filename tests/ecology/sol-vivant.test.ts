/**
 * Le sol comme capital (critères A12, C8, C9, I6 ; docs/regles.md §2 et §12).
 *
 * Trois boucles se referment ici, et elles vont ensemble :
 *  - l'humus **est** le stock d'azote organique : ce qui s'en minéralise rend de
 *    l'azote aux plantes, au rapport C/N de l'humus ;
 *  - l'humus retient l'eau : en construire améliore la réserve utile ;
 *  - le labour brûle du capital pour un gain immédiat.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { applyAction, LABOUR_PERTE_HUMUS } from "../../src/engine/actions";
import { CN_HUMUS, T_HA_TO_G_M2, treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { azoteNetDecomposition } from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ruHorizonMm } from "../../src/engine/soil";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { cnBois } from "../../src/engine/trees";

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
  const moyenne = (a: ArrayLike<number>) => {
    let t = 0;
    for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
    return a.length === 0 ? 0 : t / a.length;
  };
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
    // Ce qui part est la part de West et Post (2002), pas davantage : le seuil
    // d'avant (« moins de 96 % ») épinglait les 5 % sans source que la
    // constante portait.
    const cellule = 15 * 30 + 15;
    const h0 = avant.soil.humusCG[cellule] ?? 0;
    const h1 = apres.state.soil.humusCG[cellule] ?? 0;
    expect(h1).toBeLessThan(h0);
    expect(1 - h1 / h0).toBeCloseTo(LABOUR_PERTE_HUMUS, 6);
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
    // Un quart de siècle de charrue : le stock d'humus finit sous celui du sol
    // laissé vivre — 52,0 t C/ha contre 56,5, 8 % de moins. Avec la perte de
    // 5 % par passage d'avant, sans source, il « s'effondrait d'un bon quart » ;
    // West et Post (2002) mesurent de l'ordre de 57 g C m⁻² an⁻¹ d'écart entre
    // labour et semis direct, soit une dizaine de tonnes en vingt-cinq ans
    // **sous la même culture**. Ce dispositif-ci oppose un sol nu labouré à une
    // friche qui se recolonise, pas deux conduites d'un même blé : il garde la
    // direction, pas la taille.
    expect(laboure.humusTHa).toBeLessThan(tranquille.humusTHa);
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
    // Vingt aulnes de six mètres, broyés sur place en février, contre les mêmes
    // aulnes coupés et vendus.
    //
    // **L'essai a été réécrit sur son critère** (#328). Il comparait le broyage à
    // des aulnes restés debout, et il passait pour une autre raison que la faim :
    // `plantAt` pose un arbre sans azote dans son bois (le moteur n'en met que
    // dans le bois neuf), et ce bois au C/N infini prenait tout son azote au sol
    // (−0,98 g/m² un mois après). L'essai donne donc à ses aulnes l'azote que
    // le moteur assigne à leur bois (`cnBois`). Le témoin juste fait le même
    // geste moins ce qu'on mesure : une coupe **vendue**, mêmes arbres abattus,
    // mêmes racines laissées, seul le broyat diffère. Depuis que l'azote des
    // racines coupées reste au bois mort avec leur carbone (#328), la coupe
    // vendue et les arbres debout donnent le même minéral en février, et la faim
    // vaut −0,46 g/m² contre l'un comme contre l'autre. Avant, l'azote des
    // racines, versé sans carbone sous les souches, creusait l'écart avec la
    // coupe vendue (−0,72) et le comblait avec les arbres debout (−0,39).
    //
    // Et le broyat abaisse le minéral du bloc même quand il ne se décompose pas :
    // un essai de #309 passait ainsi, sans faim, et la variante où sa vitesse est
    // nulle garde ici −0,19 g/m² contre la coupe vendue (cause non tracée). D'où
    // le second bras : le même broyat, de même masse, rendu riche à la main (bois
    // à C/N 20, sous la bascule de 27). Même tapis, même geste ; seul le C/N
    // diffère, et avec lui la vitesse, qui se lit sur le C/N du broyat.
    const COUPE = 5;
    const construire = (cnBoisImpose?: number) => {
      let state = createGameState(STATION, rngStateFromSeed(2));
      const ids: number[] = [];
      for (let i = 0; i < 20; i++) {
        state = plantAt(state, "alnus_glutinosa", 11 + (i % 5) * 2, 11 + Math.floor(i / 5) * 2, 6);
        const dernier = state.trees[state.trees.length - 1];
        if (dernier) ids.push(dernier.id);
      }
      // Le bois porte l'azote qu'il aurait mis en poussant, au C/N de son
      // espèce, ou celui qu'on lui impose.
      const trees = state.trees.map((t) => {
        const espece = getEspece(t.especeId);
        const cn = cnBoisImpose ?? cnBois(espece);
        return {
          ...t,
          azoteBoisG: (treeTotalCarbonKg(espece, t.diametreCm, t.heightM) * 1000) / cn,
        };
      });
      const avecBois: GameState = { ...state, trees };
      return { state: avecBois, ids };
    };
    const cellules: number[] = [];
    for (let y = 8; y < 23; y++) for (let x = 8; x < 23; x++) cellules.push(y * 30 + x);
    const azoteMineral = (s: GameState) =>
      cellules.reduce((a, i) => a + (s.soil.mineralNG[i] ?? 0), 0) / cellules.length;
    const apresUnMois = (devenir: "epandre" | "vendre", cnBoisImpose?: number) => {
      let { state, ids } = construire(cnBoisImpose);
      const actions: GameAction[] = [{ type: "couper", week: COUPE, treeIds: ids, devenir }];
      for (let i = 0; i <= COUPE + 4; i++) {
        const w = WEATHER[i % WEATHER.length];
        if (!w) throw new Error("météo manquante");
        state = advanceWeek(state, w, actions).state;
      }
      return azoteMineral(state);
    };
    const faim = apresUnMois("epandre") - apresUnMois("vendre");
    const faimRiche = apresUnMois("epandre", 20) - apresUnMois("vendre", 20);
    // Un mois après le broyage, le sol **en a moins** que si le bois était parti :
    // les décomposeurs se servent avant les plantes. C'est la raison pour
    // laquelle on n'enfouit pas du BRF juste avant de planter.
    expect(faim).toBeLessThan(0);
    // Et c'est la faim, pas le tapis : le broyat ligneux prend au sol plus que le
    // même broyat rendu riche, d'au moins 0,1 g/m² (1 kg N/ha). Mesuré : −0,46
    // contre +0,41. Sur la variante où le broyat ne se décompose pas, les deux
    // écarts ne diffèrent que de deux dix-millièmes (−0,1929 et −0,1927), et
    // cette ligne tombe.
    expect(faim).toBeLessThan(faimRiche - 0.1);
    // Rien n'est perdu pour autant : le total (minéral + litière) reste
    // supérieur, c'est ce que vérifie epandre-vs-vendre.test.ts.
  });
});
