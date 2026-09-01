import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { STATIONS_V0 } from "../../src/engine/stations";

/**
 * Séries météo réelles (Météo-France, hebdomadaires 1964-2023) : intégrité et
 * plausibilité. La variabilité interannuelle est LE point : c'est elle qui
 * crée les fenêtres d'installation et les crises (ch4-B, ch8).
 */
describe("séries météo réelles", () => {
  const ids = ["lande-seche", "vallee-engorgee", "limon-riche", "friche-limon"];

  it("chaque station du jeu a une série (le limon pauvre partage Abbeville)", () => {
    for (const sc of STATIONS_V0) {
      expect(serieMeteoPour(sc.station.id), sc.station.id).toBeDefined();
    }
  });

  for (const id of ids) {
    const serie = serieMeteoPour(id);
    if (!serie) throw new Error(`série manquante : ${id}`);
    const weeks = serieToWeeks(serie);

    it(`${id} (${serie.stationMeteo}) : 60 ans × 52 semaines, valeurs saines`, () => {
      expect(weeks).toHaveLength(60 * 52);
      for (const w of weeks) {
        expect(Number.isFinite(w.tMean)).toBe(true);
        expect(w.tMin).toBeLessThanOrEqual(w.tMean + 1e-9);
        expect(w.tMax).toBeGreaterThanOrEqual(w.tMean - 1e-9);
        expect(w.rainMm).toBeGreaterThanOrEqual(0);
        expect(w.tMean).toBeGreaterThan(-25);
        expect(w.tMean).toBeLessThan(40);
      }
    });

    it(`${id} : pluie annuelle plausible et VARIABLE d'une année à l'autre`, () => {
      const rains: number[] = [];
      for (let y = 0; y < 60; y++) {
        let sum = 0;
        for (let w = 0; w < 52; w++) sum += weeks[y * 52 + w]?.rainMm ?? 0;
        rains.push(sum);
      }
      const min = Math.min(...rains);
      const max = Math.max(...rains);
      expect(min).toBeGreaterThan(300);
      expect(max).toBeLessThan(1500);
      // La variabilité réelle : l'année la plus humide fait ≥ 1,5× la plus sèche.
      expect(max).toBeGreaterThan(1.5 * min);
    });
  }
});
