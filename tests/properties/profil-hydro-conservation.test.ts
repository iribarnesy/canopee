/**
 * Conservation de l'eau au niveau du PROFIL stratifié (docs/regles.md §16).
 *
 * Le bilan d'une cellule était testé (water-conservation.test.ts) mais pas
 * celui du profil à plusieurs horizons, et il fuyait : ce qu'un horizon ne
 * pouvait pas laisser descendre dans la semaine était simplement perdu. Sur
 * une pluie ordinaire ça ne se voyait pas ; sur un orage tombant sur un sol
 * saturé — ou sur l'eau arrivant d'un grand bassin d'amont — la moitié de
 * l'eau disparaissait du bilan au lieu de ruisseler.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type HorizonHydro, profilHydro } from "../../src/engine/water";

const horizonArb = fc.record({
  ruMm: fc.double({ min: 5, max: 150, noNaN: true }),
  porositeMm: fc.double({ min: 1, max: 60, noNaN: true }),
  conductiviteMm: fc.double({ min: 0.1, max: 2000, noNaN: true }),
  epaisseurCm: fc.double({ min: 5, max: 80, noNaN: true }),
});

const casArb = fc
  .record({
    horizons: fc.array(horizonArb, { minLength: 1, maxLength: 4 }),
    remplissage: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    }),
    saturation: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    }),
    // Jusqu'à 250 mm : un orage cévenol, ou l'apport d'un bassin d'amont.
    rainMm: fc.double({ min: 0, max: 250, noNaN: true }),
    evapDemandMm: fc.double({ min: 0, max: 30, noNaN: true }),
    nappeMm: fc.double({ min: 0, max: 25, noNaN: true }),
    drainageExterneMm: fc.double({ min: 0, max: 60, noNaN: true }),
    nappeProfondeurCm: fc.oneof(
      fc.constant(Number.POSITIVE_INFINITY),
      fc.double({ min: 0, max: 300, noNaN: true }),
    ),
  })
  .map((c) => ({
    ...c,
    eauMm: c.horizons.map((h, i) => h.ruMm * (c.remplissage[i] ?? 0)),
    excesMm: c.horizons.map((h, i) => h.porositeMm * (c.saturation[i] ?? 0)),
  }));

function stock(eauMm: readonly number[], excesMm: readonly number[]): number {
  return eauMm.reduce((s, v) => s + v, 0) + excesMm.reduce((s, v) => s + v, 0);
}

describe("bilan hydrique d'un profil stratifié", () => {
  it("pluie + nappe = évaporation + drainage + ruissellement + Δstock", () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const avant = stock(c.eauMm, c.excesMm);
        const out = profilHydro(c as { horizons: HorizonHydro[] } & typeof c);
        const delta = stock(out.eauMm, out.excesMm) - avant;
        expect(out.evapMm + out.drainageMm + out.overflowMm + delta).toBeCloseTo(
          c.rainMm + out.nappeMm,
          6,
        );
      }),
      { numRuns: 3000 },
    );
  });

  it("aucun horizon ne dépasse sa capacité, aucun flux n'est négatif", () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const out = profilHydro(c as { horizons: HorizonHydro[] } & typeof c);
        c.horizons.forEach((h, i) => {
          expect(out.eauMm[i] ?? 0).toBeGreaterThanOrEqual(-1e-9);
          expect(out.eauMm[i] ?? 0).toBeLessThanOrEqual(h.ruMm + 1e-6);
          expect(out.excesMm[i] ?? 0).toBeGreaterThanOrEqual(-1e-9);
          expect(out.excesMm[i] ?? 0).toBeLessThanOrEqual(h.porositeMm + 1e-6);
        });
        expect(out.overflowMm).toBeGreaterThanOrEqual(-1e-9);
        expect(out.drainageMm).toBeGreaterThanOrEqual(-1e-9);
        expect(out.evapMm).toBeGreaterThanOrEqual(-1e-9);
      }),
      { numRuns: 3000 },
    );
  });

  it("un orage sur sol saturé ruisselle en entier au lieu de disparaître", () => {
    const horizons: HorizonHydro[] = [
      { ruMm: 60, porositeMm: 30, conductiviteMm: 50, epaisseurCm: 30 },
      { ruMm: 90, porositeMm: 45, conductiviteMm: 30, epaisseurCm: 55 },
    ];
    const out = profilHydro({
      horizons,
      eauMm: [60, 90],
      excesMm: [30, 45],
      rainMm: 200,
      evapDemandMm: 0,
      nappeMm: 0,
      drainageExterneMm: 5,
    });
    // Sol plein : tout part en surface, à ce que l'exutoire évacue près.
    expect(out.overflowMm).toBeGreaterThan(190);
  });
});
