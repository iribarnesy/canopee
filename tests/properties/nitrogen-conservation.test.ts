import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weeklyNitrogenCycle } from "../../src/engine/nitrogen";

/**
 * Invariant de conservation (docs/regles.md §16) :
 * minéralisation = prélèvement + lessivage + Δstock.
 */
describe("cycle de l'azote — conservation", () => {
  const arbitraries = fc.record({
    mineralNKgHa: fc.double({ min: 0, max: 200, noNaN: true }),
    mineralizationPotentialKgHaWeek: fc.double({ min: 0, max: 5, noNaN: true }),
    tMean: fc.double({ min: -10, max: 35, noNaN: true }),
    moistureRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    waterloggingRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    uptakeDemandKgHa: fc.double({ min: 0, max: 10, noNaN: true }),
    drainageMm: fc.double({ min: 0, max: 100, noNaN: true }),
    soilWaterMm: fc.double({ min: 0, max: 300, noNaN: true }),
  });

  it("minéralisation = prélèvement + lessivage + Δstock (à 1e-9 près)", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyNitrogenCycle(input);
        const deltaStock = out.mineralNKgHa - input.mineralNKgHa;
        expect(out.uptakeKgHa + out.leachedKgHa + deltaStock).toBeCloseTo(
          out.mineralizationKgHa,
          9,
        );
      }),
      { numRuns: 2000 },
    );
  });

  it("le stock reste positif, les flux aussi, la satisfaction dans [0,1]", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyNitrogenCycle(input);
        expect(out.mineralNKgHa).toBeGreaterThanOrEqual(-1e-9);
        expect(out.mineralizationKgHa).toBeGreaterThanOrEqual(0);
        expect(out.uptakeKgHa).toBeGreaterThanOrEqual(0);
        expect(out.leachedKgHa).toBeGreaterThanOrEqual(0);
        expect(out.demandSatisfaction).toBeGreaterThanOrEqual(0);
        expect(out.demandSatisfaction).toBeLessThanOrEqual(1 + 1e-9);
      }),
      { numRuns: 2000 },
    );
  });

  it("gel → pas de minéralisation ; drainage nul → pas de lessivage", () => {
    const frozen = weeklyNitrogenCycle({
      mineralNKgHa: 50,
      mineralizationPotentialKgHaWeek: 3,
      tMean: -2,
      moistureRatio: 0.8,
      waterloggingRatio: 0,
      uptakeDemandKgHa: 0,
      drainageMm: 0,
      soilWaterMm: 100,
    });
    expect(frozen.mineralizationKgHa).toBe(0);
    expect(frozen.leachedKgHa).toBe(0);
    expect(frozen.mineralNKgHa).toBe(50);
  });

  it("gros drainage hivernal → lessivage substantiel du stock", () => {
    const out = weeklyNitrogenCycle({
      mineralNKgHa: 50,
      mineralizationPotentialKgHaWeek: 0,
      tMean: 8,
      moistureRatio: 1,
      waterloggingRatio: 0,
      uptakeDemandKgHa: 0,
      drainageMm: 60,
      soilWaterMm: 60,
    });
    expect(out.leachedKgHa).toBeCloseTo(25, 5);
  });
});
