import { syntheticYear } from "../src/engine/meteo";
import { rngStateFromSeed } from "../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../src/engine/state";
import type { StationClimat } from "../src/engine/stations";
import { tick } from "../src/engine/tick";

export interface RunOptions {
  seed?: number;
  /** plantations initiales, positions pseudo-aléatoires seedées */
  plantations?: { especeId: string; count: number; heightM?: number }[];
}

/** Simule n années sur une station, avec plantation initiale optionnelle. */
export function runYears(sc: StationClimat, years: number, opts: RunOptions = {}): GameState {
  const weather = syntheticYear(sc.climat);
  let state = createGameState(sc.station, rngStateFromSeed(opts.seed ?? 42));
  for (const p of opts.plantations ?? []) {
    state = plantScattered(state, p.especeId, p.count, p.heightM ?? 0.3);
  }
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
  }
  return state;
}

/** Hauteur moyenne des arbres vivants d'une espèce (0 si tous morts). */
export function meanHeight(state: GameState, especeId: string): number {
  const alive = state.trees.filter((t) => t.especeId === especeId && t.alive);
  if (alive.length === 0) return 0;
  return alive.reduce((s, t) => s + t.heightM, 0) / alive.length;
}

export function aliveCount(state: GameState, especeId: string): number {
  return state.trees.filter((t) => t.especeId === especeId && t.alive).length;
}
