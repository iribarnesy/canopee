import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateUptake, weeklyLeaching, weeklyMineralization } from "../../src/engine/nitrogen";

/**
 * Invariant de conservation (docs/regles.md §16), sur le cycle composé comme
 * dans tick.ts : minéralisation = prélèvements + lessivage + Δstock.
 */
describe("cycle de l'azote — conservation", () => {
  const requestArb = fc.record({
    needKg: fc.double({ min: 0, max: 0.5, noNaN: true }),
    extractionCapacityKg: fc.double({ min: 0, max: 0.5, noNaN: true }),
  });

  const arbitraries = fc.record({
    mineralNKgHa: fc.double({ min: 0, max: 200, noNaN: true }),
    mineralizationPotentialKgHaWeek: fc.double({ min: 0, max: 5, noNaN: true }),
    tMean: fc.double({ min: -10, max: 35, noNaN: true }),
    moistureRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    waterloggingRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    requests: fc.array(requestArb, { maxLength: 50 }),
    drainageMm: fc.double({ min: 0, max: 100, noNaN: true }),
    soilWaterMm: fc.double({ min: 0, max: 300, noNaN: true }),
  });

  it("minéralisation = prélèvements + lessivage + Δstock (à 1e-9 près)", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const mineralization = weeklyMineralization(input);
        const pool = input.mineralNKgHa + mineralization;
        const uptake = allocateUptake(pool, input.requests);
        const leaching = weeklyLeaching(
          pool - uptake.totalUptakeKg,
          input.drainageMm,
          input.soilWaterMm,
        );
        const deltaStock = leaching.mineralNKgHa - input.mineralNKgHa;
        expect(uptake.totalUptakeKg + leaching.leachedKgHa + deltaStock).toBeCloseTo(
          mineralization,
          9,
        );
      }),
      { numRuns: 2000 },
    );
  });

  it("stocks et flux positifs, satisfactions dans [0,1], jamais plus que le pool", () => {
    fc.assert(
      fc.property(arbitraries, (input) => {
        const mineralization = weeklyMineralization(input);
        const pool = input.mineralNKgHa + mineralization;
        const uptake = allocateUptake(pool, input.requests);
        expect(uptake.totalUptakeKg).toBeLessThanOrEqual(pool + 1e-9);
        for (const [i, u] of uptake.uptakesKg.entries()) {
          const req = input.requests[i];
          if (!req) throw new Error("index invalide");
          expect(u).toBeGreaterThanOrEqual(0);
          expect(u).toBeLessThanOrEqual(req.needKg + 1e-9);
        }
        for (const s of uptake.satisfactions) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1 + 1e-9);
        }
        const leaching = weeklyLeaching(
          pool - uptake.totalUptakeKg,
          input.drainageMm,
          input.soilWaterMm,
        );
        expect(leaching.mineralNKgHa).toBeGreaterThanOrEqual(-1e-9);
        expect(leaching.leachedKgHa).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 2000 },
    );
  });

  it("gel → pas de minéralisation", () => {
    expect(
      weeklyMineralization({
        mineralizationPotentialKgHaWeek: 3,
        tMean: -2,
        moistureRatio: 0.8,
        waterloggingRatio: 0,
      }),
    ).toBe(0);
  });

  it("le frugal est comblé là où l'exigeant a faim (sol pauvre, mêmes tailles)", () => {
    // Pool bas → disponibilité faible. Deux arbres de même taille : le « pin »
    // (besoin 0,25 × taille) est servi, le « hêtre » (besoin 0,7 × taille) non.
    const size = 0.1; // capacité d'extraction commune, kg/semaine
    const pool = 6; // kg/ha, sous le seuil de saturation (30)
    const result = allocateUptake(pool, [
      { needKg: 0.25 * size, extractionCapacityKg: size },
      { needKg: 0.7 * size, extractionCapacityKg: size },
    ]);
    const pin = result.satisfactions[0];
    const hetre = result.satisfactions[1];
    if (pin === undefined || hetre === undefined) throw new Error("index invalide");
    expect(pin).toBeCloseTo(0.8, 5); // dispo 0,2 × capacité / besoin 0,025
    expect(hetre).toBeCloseTo(0.2 / 0.7, 5);
    expect(pin).toBeGreaterThan(hetre * 2);
  });

  it("gros drainage hivernal → lessivage substantiel du stock", () => {
    const { leachedKgHa } = weeklyLeaching(50, 60, 60);
    expect(leachedKgHa).toBeCloseTo(25, 5);
  });
});
