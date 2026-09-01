import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weeklyWaterBalance } from "../../src/engine/water";

/**
 * Invariant de conservation (docs/regles.md §16) :
 * pluie = ETR + drainage + débordement + Δstock — l'eau ne peut ni fuir ni apparaître.
 */
describe("bilan hydrique — conservation de l'eau", () => {
  const arbitraries = fc
    .record({
      ruMm: fc.double({ min: 20, max: 300, noNaN: true }),
      fillRatio: fc.double({ min: 0, max: 1, noNaN: true }),
      excessCapacityMm: fc.double({ min: 0, max: 100, noNaN: true }),
      excessRatio: fc.double({ min: 0, max: 1, noNaN: true }),
      drainagePerWeekMm: fc.double({ min: 0, max: 100, noNaN: true }),
      rainMm: fc.double({ min: 0, max: 150, noNaN: true }),
      etpMm: fc.double({ min: 0, max: 60, noNaN: true }),
    })
    .map(({ ruMm, fillRatio, excessCapacityMm, excessRatio, ...rest }) => ({
      ruMm,
      soilWaterMm: ruMm * fillRatio,
      excessCapacityMm,
      excessMm: excessCapacityMm * excessRatio,
      ...rest,
    }));

  it("pluie = ETR + drainage + débordement + Δstock (à 1e-9 près)", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyWaterBalance(input);
        const deltaStock = out.soilWaterMm + out.excessMm - (input.soilWaterMm + input.excessMm);
        expect(out.etrMm + out.drainageMm + out.overflowMm + deltaStock).toBeCloseTo(
          input.rainMm,
          9,
        );
      }),
      { numRuns: 2000 },
    );
  });

  it("les stocks restent dans leurs bornes et les flux sont positifs", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = weeklyWaterBalance(input);
        expect(out.soilWaterMm).toBeGreaterThanOrEqual(0);
        expect(out.soilWaterMm).toBeLessThanOrEqual(input.ruMm + 1e-9);
        expect(out.excessMm).toBeGreaterThanOrEqual(0);
        expect(out.excessMm).toBeLessThanOrEqual(input.excessCapacityMm + 1e-9);
        expect(out.etrMm).toBeGreaterThanOrEqual(0);
        expect(out.drainageMm).toBeGreaterThanOrEqual(0);
        expect(out.overflowMm).toBeGreaterThanOrEqual(0);
        expect(out.waterloggingRatio).toBeGreaterThanOrEqual(0);
        expect(out.waterloggingRatio).toBeLessThanOrEqual(1 + 1e-9);
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
    const out = weeklyWaterBalance({
      soilWaterMm: 5,
      excessMm: 0,
      ruMm: 100,
      excessCapacityMm: 50,
      drainagePerWeekMm: 30,
      rainMm: 0,
      etpMm: 40,
    });
    expect(out.satisfactionRatio).toBeLessThan(0.2);
  });

  it("drainage lent + pluie forte → engorgement durable", () => {
    let soil = { soilWaterMm: 140, excessMm: 0 };
    const common = { ruMm: 140, excessCapacityMm: 60, drainagePerWeekMm: 4 };
    for (let i = 0; i < 6; i++) {
      const out = weeklyWaterBalance({ ...common, ...soil, rainMm: 30, etpMm: 4 });
      soil = { soilWaterMm: out.soilWaterMm, excessMm: out.excessMm };
    }
    const out = weeklyWaterBalance({ ...common, ...soil, rainMm: 30, etpMm: 4 });
    expect(out.waterloggingRatio).toBeGreaterThan(0.5);
  });
});
