/**
 * Ce que la météo réelle apporte que la synthétique ne peut pas (ch4-B) :
 * sur la lande sableuse, le bouleau S'INSTALLE lors des séquences humides
 * puis CRASHE lors des vraies sécheresses (2003…), pendant que la pinède,
 * xérophile, s'installe durablement. Avec l'année synthétique répétée, le
 * bouleau mourait systématiquement — le climat réel crée les fenêtres.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

describe("fenêtres d'installation du bouleau sur la lande (météo réelle 1964→)", () => {
  const serie = serieMeteoPour("lande-seche");
  if (!serie) throw new Error("série manquante");
  const weather = serieToWeeks(serie);
  // Parcelle réduite (60 × 60 m) : mêmes dynamiques, test plus rapide.
  const station = { ...LANDE_SECHE.station, coteM: 60 };
  let state = createGameState(station, rngStateFromSeed(7));
  const betulaByYear: number[] = [];
  const pinusByYear: number[] = [];
  for (let i = 0; i < 42 * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
    if ((i + 1) % 52 === 0) {
      betulaByYear.push(
        state.trees.filter((t) => t.alive && t.especeId === "betula_pendula").length,
      );
      pinusByYear.push(
        state.trees.filter((t) => t.alive && t.especeId === "pinus_sylvestris").length,
      );
    }
  }
  const maxBetula = Math.max(...betulaByYear);
  const lastBetula = betulaByYear[betulaByYear.length - 1] ?? 0;
  const lastPinus = pinusByYear[pinusByYear.length - 1] ?? 0;

  it("des fenêtres humides permettent au bouleau de s'installer en nombre", () => {
    expect(maxBetula).toBeGreaterThan(50);
  });

  it("les sécheresses réelles (2003…) font crasher la population de bouleaux", () => {
    expect(lastBetula).toBeLessThan(0.5 * maxBetula);
  });

  it("le pin sylvestre, xérophile, s'installe durablement : la pinède émerge", () => {
    expect(lastPinus).toBeGreaterThan(100);
    expect(lastPinus).toBeGreaterThan(lastBetula);
  });
});
