import { describe, expect, it } from "vitest";
import {
  extraterrestrialRadiation,
  syntheticYear,
  weeklyEtpHargreaves,
} from "../../src/engine/meteo";

// Climat synthétique proche de Bordeaux (lat ~44,8°N).
const BORDEAUX = {
  tMeanAnnual: 13.8,
  tSeasonalAmplitude: 7.5,
  tDiurnalRange: 9,
  rainAnnualMm: 950,
  rainWinterShare: 0.6,
};
const LAT = 44.8;

describe("rayonnement extraterrestre (FAO-56)", () => {
  it("est plus fort au solstice d'été qu'au solstice d'hiver à 45°N", () => {
    const summer = extraterrestrialRadiation(45, 172);
    const winter = extraterrestrialRadiation(45, 355);
    expect(summer).toBeGreaterThan(winter * 2);
    // Ordres de grandeur FAO : ~40 MJ/m²/j en été, ~10 en hiver à 45°N.
    expect(summer).toBeGreaterThan(35);
    expect(summer).toBeLessThan(45);
    expect(winter).toBeGreaterThan(5);
    expect(winter).toBeLessThan(15);
  });
});

describe("ETP Hargreaves", () => {
  const year = syntheticYear(BORDEAUX);

  it("suit la saison : ETP d'été >> ETP d'hiver", () => {
    const winterWeek = year[2];
    const summerWeek = year[29];
    if (!winterWeek || !summerWeek) throw new Error("année synthétique incomplète");
    const etpWinter = weeklyEtpHargreaves(LAT, 2, winterWeek);
    const etpSummer = weeklyEtpHargreaves(LAT, 29, summerWeek);
    expect(etpSummer).toBeGreaterThan(3 * etpWinter);
    // Plausibilité : ~4-6 mm/j en été, ~0.5-1.5 mm/j en hiver à Bordeaux.
    expect(etpSummer / 7).toBeGreaterThan(3);
    expect(etpSummer / 7).toBeLessThan(7);
    expect(etpWinter / 7).toBeLessThan(2);
  });

  it("cumul annuel plausible pour un climat océanique tempéré (600–1100 mm)", () => {
    let total = 0;
    year.forEach((w, i) => {
      total += weeklyEtpHargreaves(LAT, i, w);
    });
    expect(total).toBeGreaterThan(600);
    expect(total).toBeLessThan(1100);
  });

  it("n'est jamais négative", () => {
    year.forEach((w, i) => {
      expect(weeklyEtpHargreaves(LAT, i, w)).toBeGreaterThanOrEqual(0);
    });
  });
});
