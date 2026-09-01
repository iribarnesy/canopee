import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellWaterBalance } from "../../src/engine/water";

/**
 * Invariant de conservation (docs/regles.md §16), niveau cellule :
 * pluie = évaporation + drainage + débordement + Δstock — l'eau ne peut ni
 * fuir ni apparaître. (La transpiration est testée au niveau du tick,
 * tests/properties/tick-conservation.)
 */
describe("bilan hydrique d'une cellule — conservation de l'eau", () => {
  const arbitraries = fc
    .record({
      ruMm: fc.double({ min: 20, max: 300, noNaN: true }),
      fillRatio: fc.double({ min: 0, max: 1, noNaN: true }),
      excessCapacityMm: fc.double({ min: 0, max: 100, noNaN: true }),
      excessRatio: fc.double({ min: 0, max: 1, noNaN: true }),
      drainagePerWeekMm: fc.double({ min: 0, max: 100, noNaN: true }),
      rainMm: fc.double({ min: 0, max: 150, noNaN: true }),
      evapDemandMm: fc.double({ min: 0, max: 30, noNaN: true }),
      nappeMm: fc.double({ min: 0, max: 20, noNaN: true }),
    })
    .map(({ ruMm, fillRatio, excessCapacityMm, excessRatio, ...rest }) => ({
      ruMm,
      soilWaterMm: ruMm * fillRatio,
      excessCapacityMm,
      excessMm: excessCapacityMm * excessRatio,
      ...rest,
    }));

  it("pluie + nappe absorbée = évaporation + drainage + débordement + Δstock (à 1e-9 près)", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = cellWaterBalance(input);
        const deltaStock = out.soilWaterMm + out.excessMm - (input.soilWaterMm + input.excessMm);
        expect(out.evapMm + out.drainageMm + out.overflowMm + deltaStock).toBeCloseTo(
          input.rainMm + out.nappeMm,
          9,
        );
      }),
      { numRuns: 2000 },
    );
  });

  it("les stocks restent dans leurs bornes et les flux sont positifs", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const out = cellWaterBalance(input);
        expect(out.soilWaterMm).toBeGreaterThanOrEqual(0);
        expect(out.soilWaterMm).toBeLessThanOrEqual(input.ruMm + 1e-9);
        expect(out.excessMm).toBeGreaterThanOrEqual(0);
        expect(out.excessMm).toBeLessThanOrEqual(input.excessCapacityMm + 1e-9);
        expect(out.evapMm).toBeGreaterThanOrEqual(0);
        expect(out.evapMm).toBeLessThanOrEqual(input.evapDemandMm + 1e-9);
        expect(out.drainageMm).toBeGreaterThanOrEqual(0);
        expect(out.overflowMm).toBeGreaterThanOrEqual(0);
        expect(out.waterloggingRatio).toBeGreaterThanOrEqual(0);
        expect(out.waterloggingRatio).toBeLessThanOrEqual(1 + 1e-9);
      }),
      { numRuns: 2000 },
    );
  });

  it("drainage lent + pluie forte → engorgement durable", () => {
    let soil = { soilWaterMm: 140, excessMm: 0 };
    const common = { ruMm: 140, excessCapacityMm: 60, drainagePerWeekMm: 4 };
    for (let i = 0; i < 7; i++) {
      const out = cellWaterBalance({ ...common, ...soil, rainMm: 30, evapDemandMm: 2, nappeMm: 0 });
      soil = { soilWaterMm: out.soilWaterMm, excessMm: out.excessMm };
    }
    const out = cellWaterBalance({ ...common, ...soil, rainMm: 30, evapDemandMm: 2, nappeMm: 0 });
    expect(out.waterloggingRatio).toBeGreaterThan(0.5);
  });
});
