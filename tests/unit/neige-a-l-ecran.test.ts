/**
 * **La neige à l'écran est celle du moteur** (#130, #303).
 *
 * La même eau ne tombe pas deux fois : sous une semaine de neige, le rideau de
 * pluie ne garde que la part liquide. Le sol blanchit avec le manteau du moteur,
 * et seulement avec lui ; les flocons suivent la neige de la semaine.
 */

import { describe, expect, it } from "vitest";
import type { Vue } from "../../src/render/camera";
import {
  blancheurDuSol,
  FLOCONS_MAX,
  floconsDeLaNeige,
  intensiteDeLaNeige,
  NEIGE_MUETTE_MM,
} from "../../src/render/temps/neige";
import {
  cielDeLaSemaine,
  gouttesDeLaPluie,
  pluieLiquide,
  type TempsQuIlFait,
} from "../../src/render/temps/pluie";

const vue = (largeurPx = 1200, hauteurPx = 800): Vue => ({
  cam: { zoom: 2, coteM: 64, orientation: 0 },
  centre: { x: 32, y: 32 },
  largeurPx,
  hauteurPx,
});

const semaine = (pluieMm: number, neigeMm: number, manteauNeigeMm = 0): TempsQuIlFait => ({
  pluieMm,
  neigeMm,
  manteauNeigeMm,
  vent: { versRad: 0, recuMs: 0 },
});

describe("la même eau ne tombe pas deux fois", () => {
  it("une semaine toute en neige ne fait tomber aucune goutte", () => {
    const t = semaine(20, 20);
    expect(pluieLiquide(t)).toBe(0);
    expect(gouttesDeLaPluie(t, vue(), 1000)).toEqual([]);
    expect(floconsDeLaNeige(t.neigeMm, 0, vue(), 1000).length).toBeGreaterThan(0);
  });

  it("une semaine mêlée partage le ciel entre gouttes et flocons", () => {
    const melee = semaine(20, 10);
    expect(pluieLiquide(melee)).toBe(10);
    expect(gouttesDeLaPluie(melee, vue(), 0).length).toBeLessThan(
      gouttesDeLaPluie(semaine(20, 0), vue(), 0).length,
    );
  });

  it("la neige grise le ciel comme la pluie, mais ne mouille pas le sol", () => {
    const neige = cielDeLaSemaine(semaine(20, 20));
    expect(neige.couvert).toBe(cielDeLaSemaine(semaine(20, 0)).couvert);
    expect(neige.mouille).toBe(0);
  });
});

describe("les flocons", () => {
  it("ne tombent pas sans neige, ni pour une poussière", () => {
    expect(floconsDeLaNeige(0, 0, vue(), 0)).toEqual([]);
    expect(floconsDeLaNeige(NEIGE_MUETTE_MM, 0, vue(), 0)).toEqual([]);
  });

  it("sont plus serrés sous une franche chute, sans dépasser le plafond", () => {
    expect(floconsDeLaNeige(12, 0, vue(), 0).length).toBeGreaterThan(
      floconsDeLaNeige(2, 0, vue(), 0).length,
    );
    expect(floconsDeLaNeige(40, 0, vue(5000, 4000), 0).length).toBe(FLOCONS_MAX);
    expect(intensiteDeLaNeige(400)).toBe(1);
  });

  it("tombent lentement : bien moins vite qu'une goutte", () => {
    const avant = floconsDeLaNeige(10, 0, vue(), 1000);
    const apres = floconsDeLaNeige(10, 0, vue(), 1100);
    const g0 = gouttesDeLaPluie(semaine(30, 0), vue(), 1000);
    const g1 = gouttesDeLaPluie(semaine(30, 0), vue(), 1100);
    const chute = (a: { sy: number }[], b: { sy: number }[]) => {
      const d = a.map((x, i) => (b[i]?.sy ?? 0) - x.sy).filter((v) => v > 0);
      return d.reduce((s, v) => s + v, 0) / Math.max(1, d.length);
    };
    expect(chute(avant, apres)).toBeLessThan(chute(g0, g1) / 4);
  });

  it("le vent les emporte du côté où il emporte la pluie", () => {
    // Sur une seconde, un flocon descend d'environ cent cinquante pixels : la
    // dérive du vent l'emporte sur son balancement.
    const avant = floconsDeLaNeige(10, 0.4, vue(), 2000);
    const apres = floconsDeLaNeige(10, 0.4, vue(), 3000);
    const suivis = avant
      .map((f, i) => ({ f, g: apres[i] }))
      .filter(({ f, g }) => g !== undefined && g.sy > f.sy);
    const versLaDroite = suivis.filter(({ f, g }) => (g?.sx ?? 0) > f.sx).length;
    expect(versLaDroite).toBeGreaterThan(suivis.length * 0.8);
  });
});

describe("le manteau", () => {
  it("blanchit le sol avec le manteau du moteur, et sans lui rien", () => {
    expect(blancheurDuSol(0)).toBe(0);
    expect(blancheurDuSol(2)).toBeGreaterThan(0);
    expect(blancheurDuSol(20)).toBe(1);
    expect(blancheurDuSol(6)).toBeGreaterThan(blancheurDuSol(2));
  });

  it("passe dans le ciel de la semaine, qu'il neige ou non", () => {
    // Un manteau tient sous un ciel dégagé : il est tombé les semaines d'avant.
    expect(cielDeLaSemaine(semaine(0, 0, 8)).blanc).toBeGreaterThan(0);
    expect(cielDeLaSemaine(semaine(0, 0, 8)).couvert).toBe(0);
  });
});
