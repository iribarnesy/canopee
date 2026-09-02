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
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import {
  capaciteEchange,
  disponibilitePhosphore,
  echangeReserveK,
  lessivagePotassiumG,
  retrogradationHebdo,
} from "../../src/engine/pk";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon } from "../../src/engine/soil";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

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
    // L'assimilable baisse, le fixé grossit d'autant — c'est la rétrogradation.
    expect(run.fin.pTotal).toBeGreaterThan(0.8 * run.debut.pTotal);
    expect(run.fin.p).toBeLessThan(run.debut.p);
  });

  it("LIMITE CONNUE : les deux stocks disponibles se vident en soixante ans", () => {
    // Sous un peuplement vigoureux, l'assimilable et l'échangeable descendent
    // bien plus que ne le ferait un vrai sol : l'altération, les dépôts et le
    // retour des feuilles ne couvrent pas ce que la biomasse accumule, et les
    // pools tampons relarguent trop lentement. Un vrai sol tient mieux, parce
    // que les racines profondes atteignent la roche altérable et que la
    // rhizosphère accélère l'altération — deux choses que le moteur n'a pas.
    //
    // C'est ÉCRIT ICI, et testé, parce que c'est exactement pour cette raison
    // que le phosphore et le potassium ne freinent pas encore la croissance
    // (cf. la note de pk.ts). Le jour où ce test tombera en échec parce que
    // les stocks tiennent, le couplage pourra être branché.
    expect(run.fin.p).toBeLessThan(run.debut.p / 2);
    expect(run.fin.k).toBeLessThan(run.debut.k / 2);
  });
});
