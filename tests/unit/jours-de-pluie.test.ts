/**
 * **Combien de jours il a plu dans la semaine** (#405).
 *
 * Une semaine de 15 mm, ce peut être un orage et six jours secs ou une bruine
 * quotidienne. La météo porte donc, à côté du cumul, le nombre de jours d'au
 * moins 1 mm : compté dans les relevés quotidiens pour la série réelle, tiré du
 * nombre annuel de la station pour l'année synthétique. Le moteur ne le lit
 * pas ; il voyage pour le rendu.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getScenario, meteoDerivee } from "../../src/engine/climat";
import {
  joursDePluieBornes,
  serieToWeeks,
  syntheticYear,
  type WeekWeather,
} from "../../src/engine/meteo";
import { STATIONS_V0 } from "../../src/engine/stations";

const SERIES = ["lande-seche", "vallee-engorgee", "limon-riche", "friche-limon", "suberaie-maures"];

/** Ce qu'un nombre de jours de pluie doit respecter, par définition. */
function expectBorne(w: WeekWeather, ou: string): void {
  const j = w.joursDePluie;
  expect(j, ou).toBeDefined();
  expect(j ?? -1, ou).toBeGreaterThanOrEqual(0);
  expect(j ?? 99, ou).toBeLessThanOrEqual(7);
  // Chaque jour compté apporte au moins un millimètre.
  expect(j ?? 99, ou).toBeLessThanOrEqual(w.rainMm + 1e-9);
}

describe("la série réelle compte ses jours de pluie", () => {
  for (const id of SERIES) {
    it(`${id} : chaque semaine en porte un nombre, entre zéro et le cumul`, () => {
      const serie = serieMeteoPour(id);
      if (!serie) throw new Error(`série manquante : ${id}`);
      expect(serie.colonnes.at(-1)).toBe("joursPluie");
      const weeks = serieToWeeks(serie);
      weeks.forEach((w, i) => {
        expectBorne(w, `${id}, semaine ${i}`);
      });
    });
  }

  it("une série sans la colonne ne l'invente pas", () => {
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const tronquee = { ...serie, semaines: serie.semaines.map((s) => s.slice(0, 5)) };
    for (const w of serieToWeeks(tronquee)) expect(w).not.toHaveProperty("joursDePluie");
  });
});

describe("l'année synthétique tire les siens du nombre annuel de la station", () => {
  it("le nombre déclaré par chaque climat est celui que sa série compte", () => {
    // Le climat synthétique et la série réelle d'une même station doivent dire la
    // même chose : un compte recopié à la main dériverait sans que rien ne le
    // signale. La série compte sur 52 semaines de sept jours (364 jours), le
    // climat sur l'année civile.
    for (const sc of STATIONS_V0) {
      const serie = serieMeteoPour(sc.station.id);
      if (!serie) throw new Error(`série manquante : ${sc.station.id}`);
      const weeks = serieToWeeks(serie);
      const parAn = (weeks.reduce((a, w) => a + (w.joursDePluie ?? 0), 0) / weeks.length) * 52;
      expect(sc.climat.joursDePluieAnnuels, sc.station.id).toBeDefined();
      expect(
        Math.abs((sc.climat.joursDePluieAnnuels ?? 0) - (parAn * 365.25) / 364),
        sc.station.id,
      ).toBeLessThan(1);
    }
  });

  it("sur l'année, la somme est le nombre déclaré ; chaque semaine reste dans ses bornes", () => {
    for (const sc of STATIONS_V0) {
      const annee = syntheticYear(sc.climat);
      annee.forEach((w, i) => {
        expectBorne(w, `${sc.station.id}, semaine ${i}`);
      });
      const somme = annee.reduce((a, w) => a + (w.joursDePluie ?? 0), 0);
      expect(somme).toBeCloseTo(sc.climat.joursDePluieAnnuels ?? -1, 9);
    }
  });

  it("ils suivent la saison de la pluie : plus de jours de pluie en hiver qu'en été", () => {
    const sc = STATIONS_V0.find((s) => s.station.id === "suberaie-maures");
    if (!sc) throw new Error("station manquante");
    const annee = syntheticYear(sc.climat);
    expect(annee[3]?.joursDePluie ?? 0).toBeGreaterThan(2 * (annee[29]?.joursDePluie ?? 99));
  });

  it("un climat qui ne le déclare pas n'en dit rien", () => {
    const sc = STATIONS_V0[0];
    if (!sc) throw new Error("station manquante");
    const { joursDePluieAnnuels: _, ...sans } = sc.climat;
    for (const w of syntheticYear(sans)) expect(w).not.toHaveProperty("joursDePluie");
  });
});

describe("le scénario climatique les laisse passer", () => {
  const base: WeekWeather = {
    tMean: 20,
    tMin: 14,
    tMax: 26,
    tMinAbsC: 10,
    rainMm: 3.2,
    joursDePluie: 3,
    ventVersRad: 0,
    ventMoyMs: 3,
  };

  it("sans assèchement, le nombre de jours ne bouge pas", () => {
    const w = meteoDerivee(base, 2, getScenario("stable"), 2026);
    expect(w.joursDePluie).toBe(3);
  });

  it("une semaine que le scénario assèche ne garde pas plus de jours que de millimètres", () => {
    // Une semaine d'août en 2090 sous ssp585 : la pluie y fond.
    const w = meteoDerivee(base, 32, getScenario("ssp585"), 2090);
    expect(w.rainMm).toBeLessThan(3);
    expect(w.joursDePluie).toBe(w.rainMm);
  });

  it("absent avant, absent après", () => {
    const { joursDePluie: _, ...sans } = base;
    expect(meteoDerivee(sans, 32, getScenario("ssp245"), 2050)).not.toHaveProperty("joursDePluie");
  });

  it("la borne est la définition, rien de plus", () => {
    expect(joursDePluieBornes(9, 30)).toBe(7);
    expect(joursDePluieBornes(4, 2.5)).toBe(2.5);
    expect(joursDePluieBornes(2, 15)).toBe(2);
    expect(joursDePluieBornes(-1, 15)).toBe(0);
  });
});
