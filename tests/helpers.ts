import { syntheticYear, type WeekWeather } from "../src/engine/meteo";
import { rngStateFromSeed } from "../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../src/engine/state";
import type { StationClimat } from "../src/engine/stations";
import { tick } from "../src/engine/tick";

export interface RunOptions {
  /** densité de cervidés ; 0 par défaut pour isoler ce qu'on mesure */
  gibierParHa?: number;
  seed?: number;
  /** plantations initiales, positions pseudo-aléatoires seedées */
  plantations?: { especeId: string; count: number; heightM?: number }[];
  /** série météo à rejouer (défaut : année synthétique de la station) */
  weather?: WeekWeather[];
}

/** Simule n années sur une station, avec plantation initiale optionnelle. */
export function runYears(sc: StationClimat, years: number, opts: RunOptions = {}): GameState {
  const weather = opts.weather ?? syntheticYear(sc.climat);
  // Ces essais isolent une tolérance (eau, engorgement, lumière, pH) : on met
  // donc le gibier de côté, sans quoi c'est lui qu'on mesure. Les dégâts de
  // cervidés ont leurs propres tests (gibier.test.ts).
  const station = { ...sc.station, gibierParHa: opts.gibierParHa ?? 0 };
  let state = createGameState(station, rngStateFromSeed(opts.seed ?? 42));
  for (const p of opts.plantations ?? []) {
    state = plantScattered(state, p.especeId, p.count, p.heightM ?? 0.3);
  }
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
  }
  return state;
}

/**
 * Hauteur moyenne des arbres vivants d'une espèce (0 si tous morts).
 * `maxId` restreint à la cohorte plantée au départ (les recrues de la
 * régénération naturelle ont des ids supérieurs).
 */
export function meanHeight(state: GameState, especeId: string, maxId = Infinity): number {
  const alive = state.trees.filter((t) => t.especeId === especeId && t.alive && t.id <= maxId);
  if (alive.length === 0) return 0;
  return alive.reduce((s, t) => s + t.heightM, 0) / alive.length;
}

export function aliveCount(state: GameState, especeId: string, maxId = Infinity): number {
  return state.trees.filter((t) => t.especeId === especeId && t.alive && t.id <= maxId).length;
}
