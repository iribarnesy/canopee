import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cellLeachedG,
  cellMineralization,
  nitrogenAvailabilityFactor,
} from "../../src/engine/nitrogen";

/**
 * Briques du cycle de l'azote, niveau cellule. La conservation du cycle
 * complet (minéralisation = prélèvements + lessivage + Δstock) est testée au
 * niveau du tick (tests/properties/tick-conservation), car l'allocation est
 * spatiale.
 */
describe("cycle de l'azote — briques cellule", () => {
  it("gel → pas de minéralisation", () => {
    expect(
      cellMineralization({
        potentialGWeek: 0.3,
        tMean: -2,
        moistureRatio: 0.8,
        waterloggingRatio: 0,
      }),
    ).toBe(0);
  });

  it("la minéralisation est positive et croît avec la température", () => {
    fc.assert(
      fc.property(
        fc.record({
          potentialGWeek: fc.double({ min: 0, max: 0.5, noNaN: true }),
          moistureRatio: fc.double({ min: 0, max: 1, noNaN: true }),
          waterloggingRatio: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        (base) => {
          const cold = cellMineralization({ ...base, tMean: 5 });
          const warm = cellMineralization({ ...base, tMean: 20 });
          expect(cold).toBeGreaterThanOrEqual(0);
          expect(warm).toBeGreaterThanOrEqual(cold);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("le lessivage ne dépasse jamais le stock, et vaut 0 sans drainage", () => {
    fc.assert(
      fc.property(
        fc.record({
          stockG: fc.double({ min: 0, max: 20, noNaN: true }),
          drainageMm: fc.double({ min: 0, max: 100, noNaN: true }),
          soilWaterMm: fc.double({ min: 0, max: 300, noNaN: true }),
        }),
        ({ stockG, drainageMm, soilWaterMm }) => {
          const leached = cellLeachedG(stockG, drainageMm, soilWaterMm);
          expect(leached).toBeGreaterThanOrEqual(0);
          expect(leached).toBeLessThanOrEqual(stockG + 1e-12);
          if (drainageMm === 0) expect(leached).toBe(0);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("gros drainage hivernal → lessivage substantiel du stock", () => {
    // 5 g/m² (50 kg/ha), autant d'eau qui part que d'eau qui reste → moitié lessivée.
    expect(cellLeachedG(5, 60, 60)).toBeCloseTo(2.5, 6);
  });

  it("frein de dilution : nul à stock nul, saturé à 3 g/m²", () => {
    expect(nitrogenAvailabilityFactor(0)).toBe(0);
    expect(nitrogenAvailabilityFactor(1.5)).toBeCloseTo(0.5, 9);
    expect(nitrogenAvailabilityFactor(10)).toBe(1);
  });
});
