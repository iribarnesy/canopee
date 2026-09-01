/**
 * Ce que la météo réelle apporte que la synthétique ne peut pas (ch4-B) :
 * la colonisation de la lande ne se fait pas à débit constant mais par
 * VAGUES, au gré des séquences humides — quelques semis les années sèches,
 * des dizaines les années favorables. Seules les frugales (bouleau, pin)
 * passent ; les exigeantes sont exclues (cf. tolerances.test.ts).
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

describe("colonisation de la lande (météo réelle 1964→)", () => {
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
  const lastBetula = betulaByYear[betulaByYear.length - 1] ?? 0;
  const lastPinus = pinusByYear[pinusByYear.length - 1] ?? 0;

  it("les deux pionnières frugales colonisent durablement le sable", () => {
    expect(lastBetula).toBeGreaterThan(50);
    expect(lastPinus).toBeGreaterThan(50);
  });

  it("l'installation se fait par vagues, pas à débit constant (météo réelle)", () => {
    // Gains annuels pendant la phase de colonisation : la variabilité du climat
    // ouvre des fenêtres — c'est ce que la météo synthétique ne peut pas donner.
    const gains: number[] = [];
    for (let i = 1; i < 25; i++) {
      gains.push((betulaByYear[i] ?? 0) - (betulaByYear[i - 1] ?? 0));
    }
    const tries = [...gains].sort((a, b) => a - b);
    const median = tries[Math.floor(tries.length / 2)] ?? 0;
    const best = Math.max(...gains);
    expect(best).toBeGreaterThan(20);
    expect(best).toBeGreaterThan(4 * Math.max(1, median));
  });

  it("la colonisation part de rien et met des décennies", () => {
    expect(betulaByYear[2] ?? 0).toBeLessThan(30);
    expect(lastBetula).toBeGreaterThan(5 * (betulaByYear[2] ?? 1));
  });
});
