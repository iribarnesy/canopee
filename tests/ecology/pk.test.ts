/**
 * Phosphore et potassium (critère C11, docs/regles.md §4).
 *
 * Les deux cycles sont complets et conservatifs, mais ils ne freinent pas
 * encore la croissance (voir la note en tête de `pk.ts`). Ce qu'on vérifie ici,
 * ce sont donc les cycles eux-mêmes — et surtout ce qui distingue ces deux
 * éléments de l'azote, car c'est là qu'un copier-coller aurait été faux.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import {
  capaciteEchange,
  disponibilitePhosphore,
  echangeReserveK,
  lessivagePotassiumG,
  retrogradationHebdo,
  SATURATION_K_G_M2,
  SATURATION_P_G_M2,
} from "../../src/engine/pk";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon } from "../../src/engine/soil";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const WEATHER = serieToWeeks(SERIE);

describe("le phosphore ne circule pas, il se bloque", () => {
  it("il est au mieux vers pH 6,5, et piégé aux deux extrêmes", () => {
    expect(disponibilitePhosphore(6.5)).toBeCloseTo(1, 2);
    // En sol acide, le fer et l'aluminium ; en sol calcaire, le calcium.
    expect(disponibilitePhosphore(4.5)).toBeLessThan(0.35);
    expect(disponibilitePhosphore(8.2)).toBeLessThan(0.45);
  });

  it("un sol hors de l'optimum rétrograde plus vite ce qu'on lui donne", () => {
    expect(retrogradationHebdo(4.5)).toBeGreaterThan(2 * retrogradationHebdo(6.5));
  });

  it("un sol peut être riche en phosphore TOTAL et pauvre en assimilable", () => {
    // C'est le paradoxe des sols acides : le stock est là, il est inatteignable.
    const acide = { ...LIMON_RICHE.station, coteM: 10 };
    const state = createGameState(acide, rngStateFromSeed(1));
    const total = (state.soil.phosphoreG[0] ?? 0) + (state.soil.phosphoreFixeG[0] ?? 0);
    expect(state.soil.phosphoreG[0] ?? 0).toBeLessThan(total / 5);
  });
});

describe("le potassium circule trop, le complexe le retient", () => {
  it("une argile retient bien mieux qu'un sable", () => {
    const argileux = horizon(30, { sable: 20, limon: 30, argile: 50 }, { moPct: 3, ph: 6.5 });
    const sableux = horizon(30, { sable: 95, limon: 4, argile: 1 }, { moPct: 1, ph: 5 });
    expect(capaciteEchange(argileux)).toBeGreaterThan(5 * capaciteEchange(sableux));
    // À drainage égal, le sable en perd bien davantage.
    const perte = (h: typeof argileux) => lessivagePotassiumG(10, 40, 60, capaciteEchange(h));
    expect(perte(sableux)).toBeGreaterThan(5 * perte(argileux));
  });

  it("la réserve du sol tamponne : elle relargue quand on puise, absorbe quand il y a trop", () => {
    // Sol appauvri : la réserve rend.
    expect(echangeReserveK(1, 50, 5)).toBeGreaterThan(0);
    // Sol trop riche : elle reprend.
    expect(echangeReserveK(9, 50, 5)).toBeLessThan(0);
    // Une réserve vide ne peut rien rendre.
    expect(echangeReserveK(1, 0, 5)).toBe(0);
  });
});

describe("les cycles, et ce qui leur manque encore", () => {
  function soixanteAns() {
    const station: Station = {
      ...LIMON_RICHE.station,
      coteM: 30,
      voisinage: [],
      gibierParHa: 0,
    };
    let state = createGameState(station, rngStateFromSeed(5));
    for (let i = 0; i < 25; i++) {
      state = plantAt(state, "betula_pendula", 5 + (i % 5) * 5, 5 + Math.floor(i / 5) * 5, 2);
    }
    const moyenne = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const debut = {
      p: moyenne(state.soil.phosphoreG),
      pTotal: moyenne(state.soil.phosphoreG) + moyenne(state.soil.phosphoreFixeG),
      k: moyenne(state.soil.potassiumG),
      kTotal: moyenne(state.soil.potassiumG) + moyenne(state.soil.potassiumReserveG),
    };
    let preleveP = 0;
    let preleveK = 0;
    let lessiveK = 0;
    for (let i = 0; i < 60 * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      const r = advanceWeek(state, w, []);
      state = r.state;
      preleveP += r.fluxes.uptakePKgHa;
      preleveK += r.fluxes.uptakeKKgHa;
      lessiveK += r.fluxes.leachedKKgHa;
    }
    return {
      debut,
      fin: {
        p: moyenne(state.soil.phosphoreG),
        pTotal: moyenne(state.soil.phosphoreG) + moyenne(state.soil.phosphoreFixeG),
        k: moyenne(state.soil.potassiumG),
        kTotal: moyenne(state.soil.potassiumG) + moyenne(state.soil.potassiumReserveG),
      },
      parAn: { p: preleveP / 60, k: preleveK / 60, lessivageK: lessiveK / 60 },
    };
  }

  const run = soixanteAns();

  it("les flux annuels sont ceux qu'on mesure en forêt tempérée", () => {
    // Quelques kilos de phosphore, quelques dizaines de potassium, et des
    // pertes par lessivage faibles sous couvert.
    expect(run.parAn.p).toBeGreaterThan(1);
    expect(run.parAn.p).toBeLessThan(15);
    expect(run.parAn.k).toBeGreaterThan(5);
    expect(run.parAn.k).toBeLessThan(60);
    expect(run.parAn.lessivageK).toBeLessThan(15);
  });

  it("rien ne se perd : le phosphore change de forme, il ne disparaît pas", () => {
    expect(run.fin.pTotal).toBeGreaterThan(0.8 * run.debut.pTotal);
  });

  it("les stocks tiennent sur soixante ans — une forêt ne se vide pas son sol", () => {
    // C'est le test qui a débloqué le couplage à la croissance. Il échouait
    // tant que l'altération restait purement chimique ; il passe depuis que la
    // rhizosphère l'accélère (pk.ts). Une forêt installée fabrique une partie
    // de sa propre fertilité minérale — ce n'est pas une correction de
    // confort, c'est un mécanisme mesuré sur le terrain.
    expect(run.fin.p).toBeGreaterThan(run.debut.p);
    expect(run.fin.k).toBeGreaterThan(run.debut.k / 2);
  });
});

describe("où le phosphore et le potassium limitent — et où ils ne limitent pas", () => {
  function croissance(base: typeof LIMON_RICHE, meteoId: string, especeId: string, ans: number) {
    const serie = serieMeteoPour(meteoId);
    if (!serie) throw new Error("série manquante");
    const w = serieToWeeks(serie);
    const station: Station = { ...base.station, coteM: 30, voisinage: [], gibierParHa: 0 };
    let state = createGameState(station, rngStateFromSeed(5));
    for (let i = 0; i < 9; i++) {
      state = plantAt(state, especeId, 8 + (i % 3) * 7, 8 + Math.floor(i / 3) * 7, 0.5);
    }
    // On dégage la strate herbacée, sinon c'est elle qui décide de tout sur un
    // sol pauvre (cf. herbe.test.ts) et on ne verrait plus le phosphore.
    const entretien: GameAction[] = [];
    for (let an = 0; an < ans; an++) {
      entretien.push({ type: "faucher", week: an * 52 + 20, x: 15, y: 15, rayonM: 12 });
    }
    for (let i = 0; i < ans * 52; i++) {
      const semaine = w[i % w.length];
      if (!semaine) throw new Error("météo manquante");
      state = advanceWeek(state, semaine, entretien).state;
    }
    const vivants = state.trees.filter((t) => t.alive && t.especeId === especeId);
    const moyenne = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    return {
      hauteur: Math.max(0, ...vivants.map((t) => t.heightM)),
      pDisponible: moyenne(state.soil.phosphoreG) * disponibilitePhosphore(state.station.phInitial),
      k: moyenne(state.soil.potassiumG),
    };
  }

  it("sur un limon profond, ils ne freinent rien : l'azote et l'eau commandent", () => {
    const limon = croissance(LIMON_RICHE, "limon-riche", "betula_pendula", 25);
    // Bien au-dessus des seuils de carence : le phosphore et le potassium ne
    // sont pas le sujet sur un bon sol, et c'est le résultat attendu.
    expect(limon.pDisponible).toBeGreaterThan(SATURATION_P_G_M2 * 3);
    expect(limon.k).toBeGreaterThan(SATURATION_K_G_M2 * 2);
  });

  it("sur un podzol sableux et acide, le phosphore devient le facteur qui manque", () => {
    const lande = croissance(LANDE_SECHE, "lande-seche", "pinus_sylvestris", 25);
    // Un sol que l'agronomie qualifierait de stérile : c'est bien le phosphore
    // qui y est rare, pas le potassium (le sable en garde un peu, le complexe
    // d'échange est simplement trop faible pour le retenir longtemps).
    expect(lande.pDisponible).toBeLessThan(SATURATION_P_G_M2 * 2);
    // Et l'écart avec le limon est d'un ordre de grandeur : c'est bien un sol
    // à phosphore, pas une nuance. (Que la pinède landaise tienne malgré tout
    // est vérifié ailleurs — `tolerances.test.ts` et `feu.test.ts` la font
    // vivre des décennies ; ici on regarde le sol, pas les arbres.)
    const limon = croissance(LIMON_RICHE, "limon-riche", "betula_pendula", 25);
    expect(limon.pDisponible).toBeGreaterThan(10 * lande.pDisponible);
  });
});

describe("le seuil de carence appartient à la plante, pas au moteur", () => {
  it("un fruitier cultivé est bien plus exigeant qu'une essence forestière", () => {
    // C'est par ce nombre — et non par un cas particulier dans le moteur — que
    // les cultures s'ajouteront : une céréale sera simplement à 10 ou 20.
    expect(getEspece("malus_domestica").exigenceMinerale).toBeGreaterThan(
      2 * getEspece("pinus_sylvestris").exigenceMinerale,
    );
    expect(getEspece("quercus_suber").exigenceMinerale).toBe(1);
  });

  it("sur le même sol pauvre, le fruitier souffre là où le pin se contente", () => {
    const serie = serieMeteoPour("lande-seche");
    if (!serie) throw new Error("série manquante");
    const w = serieToWeeks(serie);
    const station: Station = {
      ...LANDE_SECHE.station,
      coteM: 20,
      voisinage: [],
      gibierParHa: 0,
    };
    const pousse = (especeId: string) => {
      let state = createGameState(station, rngStateFromSeed(4));
      state = plantAt(state, especeId, 10, 10, 1);
      const id = state.nextTreeId - 1;
      for (let i = 0; i < 10 * 52; i++) {
        const semaine = w[i % w.length];
        if (!semaine) throw new Error("météo manquante");
        state = advanceWeek(state, semaine, []).state;
      }
      const arbre = state.trees.find((t) => t.id === id);
      return { vivant: arbre?.alive === true, hauteur: arbre?.heightM ?? 0 };
    };
    // Sur ce podzol, le phosphore assimilable est dix fois sous le seuil d'un
    // fruitier et proche de celui d'une essence forestière.
    const pin = pousse("pinus_sylvestris");
    const pommier = pousse("malus_domestica");
    expect(pin.hauteur).toBeGreaterThan(pommier.hauteur);
  });
});
