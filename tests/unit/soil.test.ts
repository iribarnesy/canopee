/**
 * Dérivation des propriétés du sol depuis sa physique (critère de réalisme A9) :
 * un sol se décrit par sa texture, sa profondeur, sa pierrosité et sa matière
 * organique — tout le reste se calcule. C'est ce qui rend possibles des
 * stations générées, et non seulement les quelques profils écrits à la main.
 */

import { describe, expect, it } from "vitest";
import {
  carboneProfilTHa,
  conductiviteHorizonMmSemaine,
  drainageProfilMmSemaine,
  facteurPhBiologie,
  horizon,
  mineralisationPotentielleKgHaSemaine,
  profondeurPenetrableCm,
  ruHorizonMm,
  ruProfilMm,
} from "../../src/engine/soil";
import { STATIONS_V0 } from "../../src/engine/stations";

const SABLE = { sable: 90, limon: 7, argile: 3 };
const LIMON = { sable: 15, limon: 70, argile: 15 };
const ARGILE = { sable: 15, limon: 25, argile: 60 };

describe("réserve utile dérivée de la texture", () => {
  it("un limon retient bien plus qu'un sable, à épaisseur égale", () => {
    const sable = ruHorizonMm(horizon(50, SABLE, { moPct: 1, ph: 6 }));
    const limon = ruHorizonMm(horizon(50, LIMON, { moPct: 1, ph: 6 }));
    expect(limon).toBeGreaterThan(2 * sable);
  });

  it("ordres de grandeur agronomiques : ~0,7 mm/cm sur sable, ~1,8 sur limon", () => {
    expect(ruHorizonMm(horizon(100, SABLE, { moPct: 0, ph: 6 })) / 100).toBeCloseTo(0.68, 1);
    expect(ruHorizonMm(horizon(100, LIMON, { moPct: 0, ph: 6 })) / 100).toBeCloseTo(1.73, 1);
  });

  it("la matière organique augmente la réserve utile (A12)", () => {
    const pauvre = ruHorizonMm(horizon(30, LIMON, { moPct: 1, ph: 7 }));
    const riche = ruHorizonMm(horizon(30, LIMON, { moPct: 5, ph: 7 }));
    expect(riche).toBeGreaterThan(pauvre);
  });

  it("les cailloux retirent autant de sol utile", () => {
    const franc = ruHorizonMm(horizon(40, LIMON, { moPct: 2, ph: 7 }));
    const caillouteux = ruHorizonMm(horizon(40, LIMON, { moPct: 2, ph: 7, pierrosite: 0.5 }));
    expect(caillouteux).toBeCloseTo(franc / 2, 6);
  });
});

describe("drainage dérivé de la texture", () => {
  it("le sable conduit des ordres de grandeur plus vite que l'argile", () => {
    const sable = conductiviteHorizonMmSemaine(horizon(30, SABLE, { moPct: 1, ph: 6 }));
    const argile = conductiviteHorizonMmSemaine(horizon(30, ARGILE, { moPct: 1, ph: 6 }));
    expect(sable).toBeGreaterThan(20 * argile);
  });

  it("un horizon induré (alios, semelle) bride le drainage de tout le profil", () => {
    const libre = [horizon(30, SABLE, { moPct: 1, ph: 5 })];
    const bloque = [
      horizon(30, SABLE, { moPct: 1, ph: 5 }),
      horizon(30, SABLE, { moPct: 0.5, ph: 5, induration: 0.9 }),
    ];
    expect(drainageProfilMmSemaine(bloque)).toBeLessThan(drainageProfilMmSemaine(libre) / 5);
  });

  it("l'induration borne aussi la profondeur d'enracinement", () => {
    const profil = [
      horizon(25, SABLE, { moPct: 1.8, ph: 4.5 }),
      horizon(40, SABLE, { moPct: 0.5, ph: 4.7, induration: 0.95 }),
    ];
    const penetrable = profondeurPenetrableCm(profil);
    expect(penetrable).toBeGreaterThan(20);
    expect(penetrable).toBeLessThan(30); // les racines butent sur l'alios
  });
});

describe("fertilité dérivée de la matière organique et du pH", () => {
  it("la minéralisation croît avec la MO", () => {
    const pauvre = mineralisationPotentielleKgHaSemaine([
      horizon(30, LIMON, { moPct: 0.8, ph: 7 }),
    ]);
    const riche = mineralisationPotentielleKgHaSemaine([horizon(30, LIMON, { moPct: 3, ph: 7 })]);
    expect(riche).toBeGreaterThan(3 * pauvre);
  });

  it("un sol acide minéralise mal, même bien pourvu en MO (humus de type mor)", () => {
    const acide = mineralisationPotentielleKgHaSemaine([horizon(30, LIMON, { moPct: 3, ph: 4 })]);
    const neutre = mineralisationPotentielleKgHaSemaine([horizon(30, LIMON, { moPct: 3, ph: 7 })]);
    expect(acide).toBeLessThan(0.5 * neutre);
    expect(facteurPhBiologie(4)).toBeLessThan(facteurPhBiologie(6.5));
  });

  it("le stock de carbone suit la MO et l'épaisseur", () => {
    const mince = carboneProfilTHa([horizon(15, LIMON, { moPct: 2, ph: 7 })]);
    const epais = carboneProfilTHa([horizon(40, LIMON, { moPct: 2, ph: 7 })]);
    expect(epais).toBeGreaterThan(mince);
    // Un limon à 2 % de MO sur 40 cm : quelques dizaines de t C/ha.
    expect(epais).toBeGreaterThan(20);
    expect(epais).toBeLessThan(90);
  });
});

describe("toutes les stations du jeu sont dérivées, pas saisies", () => {
  it("chaque station a un profil dont découlent ses paramètres", () => {
    for (const { station } of STATIONS_V0) {
      expect(station.profil.length, station.id).toBeGreaterThan(0);
      expect(station.ruMm, station.id).toBeCloseTo(ruProfilMm(station.profil), 6);
      expect(station.phInitial, station.id).toBe(station.profil[0]?.ph);
      expect(station.ruMm, station.id).toBeGreaterThan(20);
      expect(station.drainagePerWeekMm, station.id).toBeGreaterThan(0);
    }
  });

  it("les valeurs dérivées restent dans des plages agronomiques plausibles", () => {
    for (const { station } of STATIONS_V0) {
      expect(station.ruMm, station.id).toBeLessThan(400);
      expect(station.initialSoilCTHa, station.id).toBeGreaterThan(10);
      expect(station.initialSoilCTHa, station.id).toBeLessThan(200);
      expect(station.mineralizationPotentialKgHaWeek, station.id).toBeLessThan(8);
    }
  });
});
