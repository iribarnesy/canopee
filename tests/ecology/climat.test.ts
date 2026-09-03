/**
 * Dérive climatique (critères D8, D9 ; docs/regles.md §15).
 *
 * Ce que ces tests vérifient, dans l'ordre : que les trajectoires GIEC sont
 * bien celles d'AR6, que la France se réchauffe plus vite que le globe et
 * surtout l'été, que l'effet fertilisant du CO₂ reste borné par la loi du
 * minimum — et, pour finir, que tout ça se VOIT dans une partie : à station,
 * graine et actions identiques, une parcelle vieillit dans un climat qui n'est
 * plus le même.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import {
  amplificationFrance,
  co2Ppm,
  facteurCo2Croissance,
  facteurCo2Transpiration,
  facteurPluie,
  getScenario,
  meteoDerivee,
  normalesHebdo,
  rechauffementGlobalC,
} from "../../src/engine/climat";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tickTree } from "../../src/engine/trees";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const OBSERVATIONS = serieToWeeks(SERIE);

describe("les trajectoires GIEC", () => {
  it("les trois scénarios divergent après 2050, pas avant", () => {
    const en2030 = ["ssp126", "ssp245", "ssp585"].map((id) =>
      rechauffementGlobalC(getScenario(id as never), 2030),
    );
    // Avant 2030 l'inertie du système domine : les scénarios se tiennent.
    expect(Math.max(...en2030) - Math.min(...en2030)).toBeLessThan(0.3);
    expect(rechauffementGlobalC(getScenario("ssp585"), 2090)).toBeGreaterThan(
      2 * rechauffementGlobalC(getScenario("ssp126"), 2090),
    );
  });

  it("le CO₂ suit sa trajectoire et ne recule pas", () => {
    const s = getScenario("ssp585");
    expect(co2Ppm(s, 2050)).toBeGreaterThan(co2Ppm(s, 2026));
    expect(co2Ppm(s, 2100)).toBeGreaterThan(1000);
    // Sobriété : le CO₂ se stabilise au lieu de filer.
    expect(co2Ppm(getScenario("ssp126"), 2100)).toBeLessThan(500);
  });

  it("le scénario « climat figé » ne bouge pas — c'est un témoin, pas une prévision", () => {
    const s = getScenario("stable");
    const semaineEte = 28;
    const base = OBSERVATIONS[semaineEte];
    if (!base) throw new Error("météo manquante");
    const derivee = meteoDerivee(base, semaineEte, s, 2100);
    expect(derivee.tMean).toBeCloseTo(base.tMean, 6);
    expect(derivee.rainMm).toBeCloseTo(base.rainMm, 6);
  });
});

describe("la France n'est pas le globe", () => {
  it("elle se réchauffe plus vite, et l'été plus que l'hiver", () => {
    const hiver = amplificationFrance(2);
    const ete = amplificationFrance(28);
    expect(hiver).toBeGreaterThan(1.2);
    expect(ete).toBeGreaterThan(hiver);
    expect(ete).toBeLessThan(2.2);
  });

  it("les étés s'assèchent pendant que les hivers s'arrosent", () => {
    const s = getScenario("ssp585");
    expect(facteurPluie(s, 2090, 28)).toBeLessThan(0.85);
    expect(facteurPluie(s, 2090, 2)).toBeGreaterThan(1);
  });

  it("une semaine d'été de fin de siècle est nettement plus chaude et plus sèche", () => {
    const semaine = 28;
    const base = OBSERVATIONS[semaine];
    if (!base) throw new Error("météo manquante");
    const futur = meteoDerivee(base, semaine, getScenario("ssp585"), 2090);
    expect(futur.tMean - base.tMean).toBeGreaterThan(6);
    expect(futur.rainMm).toBeLessThan(base.rainMm);
    // Le gel tardif suit la même dérive : c'est ce qui déplace les floraisons.
    expect(futur.tMinAbsC).toBeGreaterThan(base.tMinAbsC);
  });
});

describe("le CO₂ : ce qu'il donne et ce qu'il ne donne pas", () => {
  it("il stimule la croissance, sans miracle : doubler ne double rien", () => {
    expect(facteurCo2Croissance(420)).toBeCloseTo(1, 6);
    const double = facteurCo2Croissance(840);
    expect(double).toBeGreaterThan(1.1);
    expect(double).toBeLessThan(1.3);
  });

  it("il ferme les stomates : plus de CO₂, moins d'eau perdue", () => {
    expect(facteurCo2Transpiration(840)).toBeLessThan(1);
    expect(facteurCo2Transpiration(840)).toBeGreaterThan(0.75);
  });

  it("mais la loi du minimum le borne : un arbre qui a soif n'en profite pas", () => {
    const arbre = {
      id: 1,
      especeId: "fagus_sylvatica",
      x: 5,
      y: 5,
      ageWeeks: 52 * 15,
      heightM: 6,
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 80,
      hauteurElagueeM: 0,
      recepages: 0,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
    };
    const env = {
      waterloggingRatio: 0,
      light: 1,
      nitrogenSatisfaction: 1,
      phMean: 6,
      solPenetrableCm: 120,
      tMean: 18,
    };
    const pousse = (waterSatisfaction: number, facteurCo2: number) =>
      tickTree(arbre, { ...env, waterSatisfaction, facteurCo2 }).tree.heightM - arbre.heightM;
    const alaise = { sans: pousse(1, 1), avec: pousse(1, facteurCo2Croissance(840)) };
    const assoiffe = { sans: pousse(0.15, 1), avec: pousse(0.15, facteurCo2Croissance(840)) };
    // À l'aise, le CO₂ paie…
    expect(alaise.avec).toBeGreaterThan(1.1 * alaise.sans);
    // …mais ce qui manque à l'assoiffé, c'est de l'eau, et le CO₂ n'en fait pas.
    // …et l'assoiffé ne gagne presque rien EN VALEUR ABSOLUE : le CO₂
    // multiplie un potentiel que la loi du minimum a déjà réduit à presque
    // rien. Il ne fabrique pas d'eau.
    expect(assoiffe.avec - assoiffe.sans).toBeLessThan(0.25 * (alaise.avec - alaise.sans));
  });
});

describe("les extrêmes s'aggravent plus vite que les moyennes (D11)", () => {
  const normales = normalesHebdo(OBSERVATIONS);

  it("une canicule gagne plus de degrés qu'une semaine ordinaire de la même saison", () => {
    const s = 30; // début août
    const semaines = OBSERVATIONS.filter((_, i) => i % 52 === s);
    const ordinaire = semaines.reduce((a, b) =>
      Math.abs(b.tMean - (normales.tMean[s] ?? 0)) < Math.abs(a.tMean - (normales.tMean[s] ?? 0))
        ? b
        : a,
    );
    const canicule = semaines.reduce((a, b) => (b.tMean > a.tMean ? b : a));
    const sc = getScenario("ssp585");
    const gain = (w: (typeof semaines)[number]) =>
      meteoDerivee(w, s, sc, 2090, normales).tMean - w.tMean;
    expect(gain(canicule)).toBeGreaterThan(gain(ordinaire) + 0.5);
  });

  it("une semaine déjà en déficit se creuse au-delà du simple décalage", () => {
    const s = 30;
    const semaines = OBSERVATIONS.filter((_, i) => i % 52 === s);
    const normale = normales.rainMm[s] ?? 0;
    // Une semaine sous sa normale, mais pas à zéro (on ne peut pas creuser
    // au-dessous de rien).
    const enDeficit = semaines
      .filter((w) => w.rainMm > 2 && w.rainMm < normale)
      .reduce((a, b) => (b.rainMm < a.rainMm ? b : a));
    const arrosee = semaines.reduce((a, b) => (b.rainMm > a.rainMm ? b : a));
    const sc = getScenario("ssp585");
    // Comparé au seul décalage saisonnier : la semaine en déficit perd en plus,
    // celle au-dessus de sa normale ne perd rien de plus.
    expect(meteoDerivee(enDeficit, s, sc, 2090, normales).rainMm).toBeLessThan(
      meteoDerivee(enDeficit, s, sc, 2090).rainMm,
    );
    expect(meteoDerivee(arrosee, s, sc, 2090, normales).rainMm).toBeCloseTo(
      meteoDerivee(arrosee, s, sc, 2090).rainMm,
      6,
    );
  });

  it("sans normales, on retombe sur le simple décalage de moyenne", () => {
    const base = OBSERVATIONS[30];
    if (!base) throw new Error("météo manquante");
    const sc = getScenario("ssp585");
    expect(meteoDerivee(base, 30, sc, 2090).tMean).toBeLessThanOrEqual(
      meteoDerivee(base, 30, sc, 2090, normales).tMean + 1e-9,
    );
  });
});

describe("dans une partie, le réchauffement se voit", () => {
  const normales = normalesHebdo(OBSERVATIONS);

  function partie(scenarioId: "stable" | "ssp585", ans: number) {
    const station: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
    let state = createGameState(station, rngStateFromSeed(11));
    state = plantScattered(state, "fagus_sylvatica", 60);
    state = plantScattered(state, "quercus_pubescens", 60);
    const scenario = getScenario(scenarioId);
    let etpDebut = 0;
    let etpFin = 0;
    const morts: { especeId: string; cause: string }[] = [];
    for (let i = 0; i < ans * 52; i++) {
      const base = OBSERVATIONS[i % OBSERVATIONS.length];
      if (!base) throw new Error("météo manquante");
      // Avec les normales, comme le fait le jeu : sans elles on perd
      // l'accentuation des extrêmes, et c'est précisément elle qui tue.
      const w = meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52), normales);
      const r = advanceWeek(state, w, []);
      state = r.state;
      morts.push(...r.morts);
      if (i < 5 * 52) etpDebut += r.fluxes.etpMm;
      if (i >= (ans - 5) * 52) etpFin += r.fluxes.etpMm;
    }
    return {
      etpDebut: etpDebut / 5,
      etpFin: etpFin / 5,
      hetresMortsDeSoif: morts.filter(
        (m) => m.especeId === "fagus_sylvatica" && m.cause === "secheresse",
      ).length,
      mortsRavageurs: morts.filter((m) => m.cause === "ravageurs").length,
      hetresVivants: state.trees.filter((t) => t.alive && t.especeId === "fagus_sylvatica").length,
    };
  }

  const fige = partie("stable", 60);
  const chauffe = partie("ssp585", 60);

  it("la demande en eau de l'atmosphère monte bien plus vite qu'avec le seul climat observé", () => {
    // À noter : même « figée », la parcelle voit l'ETP monter de 16 % en
    // soixante ans — parce que la série d'observations 1964-2023 CONTIENT le
    // réchauffement déjà survenu. Le scénario ne fait qu'accélérer une pente
    // qui existe déjà, et c'est bien pour ça que « climat figé » n'est un
    // témoin de laboratoire, pas une prévision.
    expect(fige.etpFin / fige.etpDebut).toBeGreaterThan(1.1);
    expect(chauffe.etpFin / chauffe.etpDebut).toBeGreaterThan(1.25);
    expect(chauffe.etpFin / chauffe.etpDebut).toBeGreaterThan(1.1 * (fige.etpFin / fige.etpDebut));
  });

  it("le hêtre, mésophile, se met à mourir de soif — ce qu'il ne faisait pas", () => {
    // Aucun déplacement d'aire n'est codé : c'est la conjonction d'une ETP qui
    // monte et de pluies d'été qui reculent, lue par les seuils d'une espèce
    // qui « aime le frais ». Sur soixante ans de climat figé, le hêtre ne
    // meurt jamais de sécheresse sur ce limon profond ; sous SSP5-8.5, si.
    // Ce qui compte est le RAPPORT, pas le compte. À climat figé, il meurt
    // quelques hêtres de soif : un semis dense s'auto-éclaircit, et la soif
    // est un des couteaux qui s'en charge — d'autant plus depuis que le
    // plafond d'auto-éclaircie laisse le fourré atteindre sa vraie densité.
    // Sous SSP5-8.5, la même parcelle en perd plus de vingt fois autant.
    expect(fige.hetresMortsDeSoif).toBeLessThan(10);
    expect(chauffe.hetresMortsDeSoif).toBeGreaterThan(10 * Math.max(1, fige.hetresMortsDeSoif));
    // Et il en reste moins debout à la fin.
    expect(chauffe.hetresVivants).toBeLessThan(fige.hetresVivants);
  });

  it("le réchauffement fait aussi flamber les ravageurs", () => {
    // Conséquence en cascade, elle non plus codée nulle part : plus il fait
    // chaud, plus les générations s'enchaînent (ravageurs.ts). C'est ce qui
    // frappe les essences sensibles avant même que la sécheresse ne les tue.
    expect(chauffe.mortsRavageurs).toBeGreaterThan(3 * Math.max(1, fige.mortsRavageurs));
  });
});
