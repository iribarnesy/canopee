/**
 * **La neige** (neige.ts, #303) : le partage pluie/neige, le manteau, la fonte,
 * et ce que le bilan d'eau en reçoit.
 *
 * Trois exigences, et ce fichier tient les trois :
 *
 *  - une neige qui tombe ne rejoint pas le sol la semaine même, elle attend ;
 *  - une neige qui fond rend son eau, toute son eau, et la rend au sol ;
 *  - une station sans semaine froide ne voit **rien** changer : la précipitation
 *    traverse le module comme le même nombre, pas comme une somme égale à
 *    l'arrondi près.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../../src/engine/meteo";
import {
  FACTEUR_FONTE_MM_PAR_C_JOUR,
  neigeDeLaSemaine,
  neigeEtFonte,
  partSolide,
} from "../../src/engine/neige";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { FRICHE_LIMON, LANDE_SECHE, STATIONS_V0, SUBERAIE_MAURES } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { construireSnapshot } from "../../src/game/snapshot";

const semaine = (tMean: number, rainMm: number): WeekWeather => ({
  tMean,
  tMin: tMean - 4,
  tMax: tMean + 4,
  rainMm,
  tMinAbsC: tMean - 7,
  ventVersRad: 0,
  ventMoyMs: 4,
});

describe("le partage pluie/neige", () => {
  it("toute en neige sous 0 °C, toute en pluie au-dessus de 2 °C, moitié-moitié à 1 °C", () => {
    expect(partSolide(semaine(-5, 10))).toBe(1);
    expect(partSolide(semaine(0, 10))).toBe(1);
    expect(partSolide(semaine(1, 10))).toBeCloseTo(0.5, 12);
    expect(partSolide(semaine(2, 10))).toBe(0);
    expect(partSolide(semaine(15, 10))).toBe(0);
  });

  it("une semaine sèche ne neige pas, même par grand froid", () => {
    expect(neigeDeLaSemaine(semaine(-8, 0))).toBe(0);
  });
});

describe("le manteau et sa fonte", () => {
  it("une neige de gel s'accumule et n'arrive pas au sol", () => {
    const r = neigeEtFonte(semaine(-3, 20), 5);
    expect(r.neigeMm).toBe(20);
    expect(r.fonteMm).toBe(0);
    expect(r.manteauNeigeMm).toBe(25);
    expect(r.eauLiquideMm).toBe(0);
  });

  it("le redoux rend l'eau du manteau, au degré-jour, et pas plus que le manteau", () => {
    // +0,5 °C de moyenne : 3,51 × 7 × 0,5 = 12,285 mm de fonte possible.
    const partielle = neigeEtFonte(semaine(0.5, 0), 30);
    expect(partielle.fonteMm).toBeCloseTo(FACTEUR_FONTE_MM_PAR_C_JOUR * 7 * 0.5, 12);
    expect(partielle.manteauNeigeMm).toBeCloseTo(30 - partielle.fonteMm, 12);
    expect(partielle.eauLiquideMm).toBeCloseTo(partielle.fonteMm, 12);
    // +6 °C : tout fond, et la pluie de la semaine passe avec la fonte.
    const totale = neigeEtFonte(semaine(6, 12), 30);
    expect(totale.fonteMm).toBe(30);
    expect(totale.manteauNeigeMm).toBe(0);
    expect(totale.eauLiquideMm).toBe(42);
  });

  it("sans neige et sans manteau, la précipitation passe telle quelle — le même nombre", () => {
    for (const w of syntheticYear(LANDE_SECHE.climat)) {
      const r = neigeEtFonte(w, 0);
      expect(Object.is(r.eauLiquideMm, w.rainMm)).toBe(true);
      expect(r.neigeMm).toBe(0);
      expect(r.manteauNeigeMm).toBe(0);
    }
  });
});

describe("les stations", () => {
  it("aucune année synthétique douce ne neige : leurs parties ne changent pas d'un bit", () => {
    // La lande, la vallée et la subéraie restent au-dessus de 2 °C de moyenne
    // toute l'année synthétique : le module ne doit y toucher à rien.
    for (const sc of STATIONS_V0) {
      if (Math.min(...syntheticYear(sc.climat).map((w) => w.tMean)) < 2) continue;
      let manteau = 0;
      for (const w of syntheticYear(sc.climat)) {
        const r = neigeEtFonte(w, manteau);
        manteau = r.manteauNeigeMm;
        expect(Object.is(r.eauLiquideMm, w.rainMm)).toBe(true);
      }
    }
    expect(Math.min(...syntheticYear(SUBERAIE_MAURES.climat).map((w) => w.tMean))).toBeGreaterThan(
      2,
    );
  });

  it("le tick d'une station douce ne porte ni neige, ni fonte, ni manteau", () => {
    const station: Station = { ...LANDE_SECHE.station, coteM: 12, voisinage: [] };
    let s = createGameState(station, rngStateFromSeed(5));
    for (const w of syntheticYear(LANDE_SECHE.climat)) {
      const r = tick(s, w);
      expect(r.fluxes.neigeMm).toBe(0);
      expect(r.fluxes.fonteMm).toBe(0);
      expect(r.fluxes.manteauNeigeMm).toBe(0);
      s = r.state;
    }
    expect(s.soil.manteauNeigeMm).toBe(0);
  });

  it("à Dijon, un hiver froid garde un manteau plusieurs semaines, et tout fond avant mai", () => {
    const serie = serieMeteoPour(FRICHE_LIMON.station.id);
    if (!serie) throw new Error("série manquante");
    const meteo = serieToWeeks(serie, FRICHE_LIMON.climat);
    let manteau = 0;
    let plusLongueSuite = 0;
    let suite = 0;
    let anneesAvecManteau = 0;
    let vuCetteAnnee = false;
    for (let k = 0; k < meteo.length; k++) {
      const w = meteo[k];
      if (!w) throw new Error("météo manquante");
      manteau = neigeEtFonte(w, manteau).manteauNeigeMm;
      suite = manteau > 0 ? suite + 1 : 0;
      plusLongueSuite = Math.max(plusLongueSuite, suite);
      if (manteau > 0) vuCetteAnnee = true;
      // Semaine 18, début mai : plus de neige au sol en plaine bourguignonne.
      if (k % 52 === 18) expect(manteau).toBe(0);
      if (k % 52 === 51) {
        if (vuCetteAnnee) anneesAvecManteau++;
        vuCetteAnnee = false;
      }
    }
    expect(plusLongueSuite).toBeGreaterThanOrEqual(3);
    // Pas chaque hiver, mais souvent : la plaine n'est pas la montagne.
    expect(anneesAvecManteau).toBeGreaterThan(10);
    expect(anneesAvecManteau).toBeLessThan(60);
  });
});

describe("ce que le bilan d'eau reçoit", () => {
  it("la neige attend dans le manteau, puis entre au sol en fondant ; rien ne se perd", () => {
    // Un hiver de Dijon, au tick complet : on cherche dans la série la première
    // semaine qui laisse au moins 15 mm au sol, et on rejoue autour.
    const serie = serieMeteoPour(FRICHE_LIMON.station.id);
    if (!serie) throw new Error("série manquante");
    const meteo = serieToWeeks(serie, FRICHE_LIMON.climat);
    let pic = -1;
    let m = 0;
    for (let k = 0; k < meteo.length && pic < 0; k++) {
      const w = meteo[k];
      if (!w) throw new Error("météo manquante");
      m = neigeEtFonte(w, m).manteauNeigeMm;
      if (m >= 15) pic = k;
    }
    expect(pic).toBeGreaterThan(0);

    const station: Station = { ...FRICHE_LIMON.station, coteM: 12, voisinage: [] };
    let s = createGameState(station, rngStateFromSeed(5));
    let precipitation = 0;
    let auSol = 0;
    let accumule = false;
    let rendu = false;
    for (let k = pic - 8; k < pic + 12; k++) {
      const w = meteo[k];
      if (!w) throw new Error("météo manquante");
      const avant = s.soil.manteauNeigeMm;
      const r = tick(s, w);
      const liquide = r.fluxes.rainMm - r.fluxes.neigeMm + r.fluxes.fonteMm;
      precipitation += r.fluxes.rainMm;
      auSol += liquide;
      // Le manteau du tick est celui de la loi, semaine après semaine.
      expect(r.state.soil.manteauNeigeMm).toBe(neigeEtFonte(w, avant).manteauNeigeMm);
      expect(r.fluxes.manteauNeigeMm).toBe(r.state.soil.manteauNeigeMm);
      if (r.fluxes.neigeMm > 0 && liquide < r.fluxes.rainMm) accumule = true;
      if (r.fluxes.fonteMm > 0 && liquide > r.fluxes.rainMm) rendu = true;
      s = r.state;
    }
    expect(accumule).toBe(true);
    expect(rendu).toBe(true);
    // Ce qui est tombé est au sol, ou encore dans le manteau.
    expect(precipitation - auSol).toBeCloseTo(s.soil.manteauNeigeMm, 9);
  }, 120_000);
});

describe("l'instantané", () => {
  it("porte la neige de la semaine qui s'ouvre et le manteau sur lequel elle s'ouvre", () => {
    const station: Station = { ...FRICHE_LIMON.station, coteM: 12, voisinage: [] };
    const s0 = createGameState(station, rngStateFromSeed(5));
    const froide = semaine(-4, 18);
    const r = tick(s0, froide);
    const suivante = semaine(1, 10);
    const snap = construireSnapshot({
      state: r.state,
      weather: suivante,
      anneeCivile: 2026,
      paysage: "bocage",
      fluxes: r.fluxes,
      refusals: [],
      events: [],
      morts: [],
      naissances: [],
      franchissements: [],
      gestes: [],
      chutes: [],
      installationsFaune: [],
      departsFaune: [],
    });
    expect(snap.manteauNeigeMm).toBe(18);
    expect(snap.neigeMm).toBeCloseTo(5, 12);
    // La neige de la semaine simulée voyage aussi, dans les flux.
    expect(snap.fluxes.neigeMm).toBe(18);
  });
});
