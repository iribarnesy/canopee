import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cellLeachedG,
  cellMineralization,
  DEMI_SATURATION_G_M2,
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

  it("frein de dilution : nul à stock nul, à moitié levé dès 5 kg N/ha", () => {
    // La forme est celle d'une cinétique de prélèvement, pas d'une rampe :
    // elle monte vite au début et n'atteint jamais tout à fait 1. La rampe
    // précédente saturait à 3 g/m² — 30 kg N/ha — un stock qu'un sol
    // FORESTIER ne porte jamais, si bien que le frein était actif en
    // permanence sur toutes les stations (nitrogen.ts).
    expect(nitrogenAvailabilityFactor(0)).toBe(0);
    expect(nitrogenAvailabilityFactor(DEMI_SATURATION_G_M2)).toBeCloseTo(0.5, 9);
    // Un sol riche du jeu tourne autour de 1,6 g/m² : le frein y est levé aux
    // trois quarts, sans l'être tout à fait.
    expect(nitrogenAvailabilityFactor(1.6)).toBeGreaterThan(0.7);
    expect(nitrogenAvailabilityFactor(1.6)).toBeLessThan(0.8);
    // Une lande à 0,5 g/m², elle, reste bridée de moitié : le contraste entre
    // stations tient, et c'est ce qui comptait.
    expect(nitrogenAvailabilityFactor(0.5)).toBeCloseTo(0.5, 9);
    expect(nitrogenAvailabilityFactor(1e6)).toBeLessThan(1);
  });
});
