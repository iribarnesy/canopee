import { describe, expect, it } from "vitest";
import { rngFloat, rngInt, rngStateFromSeed } from "../../src/engine/rng";

function drawFloats(seed: number, n: number): number[] {
  let state = rngStateFromSeed(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rngFloat(state);
    state = r.state;
    out.push(r.value);
  }
  return out;
}

describe("rng (xoshiro128**)", () => {
  it("est déterministe : même seed → même séquence", () => {
    expect(drawFloats(42, 1000)).toEqual(drawFloats(42, 1000));
  });

  it("deux seeds différentes divergent", () => {
    expect(drawFloats(1, 100)).not.toEqual(drawFloats(2, 100));
  });

  it("produit des flottants dans [0, 1) raisonnablement répartis", () => {
    const values = drawFloats(7, 10_000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("rngInt reste dans [0, n)", () => {
    let state = rngStateFromSeed(123);
    for (let i = 0; i < 1000; i++) {
      const r = rngInt(state, 6);
      state = r.state;
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
      expect(Number.isInteger(r.value)).toBe(true);
    }
  });
});
