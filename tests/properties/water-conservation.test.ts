import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weeklyWaterBalance } from "../../src/engine/water";

/**
 * Invariant de conservation (docs/regles.md §16) :
 * pluie = ETR + drainage + Δstock — l'eau ne peut ni fuir ni apparaître.
 */
describe("bilan hydrique — conservation de l'eau", () => {
  const arbitraries = fc
    .record({
      ruMm: fc.double({ min: 20, max: 300, noNaN: true }),
      fillRatio: fc.double({ min: 0, max: 1, noNaN: true }),
      rainMm: fc.double({ min: 0, max: 150, noNaN: true }),
      etpMm: fc.double({ min: 0, max: 60, noNaN: true }),
    })
    .map(({ ruMm, fillRatio, rainMm, etpMm }) => ({
      ruMm,
      soilWaterMm: ruMm * fillRatio,
      rainMm,
      etpMm,
    }));

  it("pluie = ETR + drainage + Δstock (à 1e-9 près)", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyWaterBalance(input);
        const deltaStock = out.soilWaterMm - input.soilWaterMm;
        expect(out.etrMm + out.drainageMm + deltaStock).toBeCloseTo(input.rainMm, 9);
      }),
      { numRuns: 2000 },
    );
  });

  it("le stock reste dans [0, RU] et les flux sont positifs", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyWaterBalance(input);
        expect(out.soilWaterMm).toBeGreaterThanOrEqual(0);
        expect(out.soilWaterMm).toBeLessThanOrEqual(input.ruMm + 1e-9);
        expect(out.etrMm).toBeGreaterThanOrEqual(0);
        expect(out.drainageMm).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 2000 },
    );
  });

  it("l'ETR ne dépasse jamais la demande (ETP)", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyWaterBalance(input);
        expect(out.etrMm).toBeLessThanOrEqual(input.etpMm + 1e-9);
      }),
      { numRuns: 2000 },
    );
  });

  it("sol sec + forte demande → stress (satisfaction < 1)", () => {
    const out = weeklyWaterBalance({ soilWaterMm: 5, ruMm: 100, rainMm: 0, etpMm: 40 });
    expect(out.satisfactionRatio).toBeLessThan(0.2);
  });
});
