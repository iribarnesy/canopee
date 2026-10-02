import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { neigeEtFonte } from "../../src/engine/neige";

/**
 * Invariant de conservation du manteau neigeux (neige.ts, #303) : ce qui tombe
 * arrive au sol ou reste dans le manteau, et rien d'autre.
 *
 *   précipitation + manteau avant = eau arrivée au sol + manteau après
 *
 * Et les bornes : un manteau ne descend jamais sous zéro, ne fond pas plus que
 * ce qu'il porte, et la neige n'est jamais plus que la précipitation.
 */
describe("le manteau neigeux — conservation de l'eau", () => {
  const semaines = fc.record({
    tMean: fc.double({ min: -15, max: 25, noNaN: true }),
    rainMm: fc.double({ min: 0, max: 150, noNaN: true }),
    manteauMm: fc.double({ min: 0, max: 400, noNaN: true }),
  });

  it("précipitation + manteau = eau au sol + manteau après (à 1e-9 près)", () => {
    fc.assert(
      fc.property(semaines, ({ tMean, rainMm, manteauMm }) => {
        const w = {
          tMean,
          tMin: tMean - 4,
          tMax: tMean + 4,
          rainMm,
          tMinAbsC: tMean - 8,
          ventVersRad: 0,
          ventMoyMs: 4,
        };
        const r = neigeEtFonte(w, manteauMm);
        expect(r.eauLiquideMm + r.manteauNeigeMm).toBeCloseTo(rainMm + manteauMm, 9);
        expect(r.manteauNeigeMm).toBeGreaterThanOrEqual(0);
        expect(r.neigeMm).toBeGreaterThanOrEqual(0);
        expect(r.neigeMm).toBeLessThanOrEqual(rainMm);
        expect(r.fonteMm).toBeGreaterThanOrEqual(0);
        expect(r.fonteMm).toBeLessThanOrEqual(manteauMm + r.neigeMm + 1e-12);
        expect(r.eauLiquideMm).toBeGreaterThanOrEqual(-1e-12);
      }),
      { numRuns: 2000 },
    );
  });
});
