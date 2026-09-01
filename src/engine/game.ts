/**
 * Le runner de partie : rejoue un JOURNAL d'actions datées sur une station et
 * une seed — c'est le format de sauvegarde (docs/stack.md). Chaque semaine :
 * remise à zéro du compteur d'heures → actions datées de la semaine (dans
 * l'ordre du journal) → tick de simulation. Entièrement déterministe.
 */

import type { ActionRefusal, GameAction } from "./actions";
import { applyAction, OVERDRAFT_LIMIT_EUR, SALARY_EUR_WEEK } from "./actions";
import type { WeekWeather } from "./meteo";
import { rngStateFromSeed } from "./rng";
import type { GameState, Station } from "./state";
import { createGameState } from "./state";
import { tick } from "./tick";

export interface Journal {
  stationId: string;
  seed: number;
  treasuryEur?: number;
  actions: GameAction[];
}

export interface RunResult {
  state: GameState;
  refusals: ActionRefusal[];
}

/** Avance d'une semaine : actions de la semaine courante, puis tick. */
export function advanceWeek(
  state: GameState,
  weather: WeekWeather,
  actions: readonly GameAction[],
): { state: GameState; refusals: ActionRefusal[] } {
  // Salaires des ouvriers embauchés (au-delà du joueur lui-même, §10).
  const salaries = (state.economy.uth - 1) * SALARY_EUR_WEEK;
  let s: GameState = {
    ...state,
    economy: {
      ...state.economy,
      treasuryEur: state.economy.treasuryEur - salaries,
      hoursUsedWeek: 0,
      hoursUsedYear: state.week % 52 === 0 ? 0 : state.economy.hoursUsedYear,
    },
  };
  const refusals: ActionRefusal[] = [];
  for (const action of actions) {
    if (action.week !== s.week) continue;
    const result = applyAction(s, action);
    s = result.state;
    refusals.push(...result.refusals);
  }
  if (s.economy.treasuryEur < OVERDRAFT_LIMIT_EUR && !s.economy.bankrupt) {
    s = { ...s, economy: { ...s.economy, bankrupt: true } };
  }
  return { state: tick(s, weather).state, refusals };
}

/** Rejoue une partie complète depuis sa sauvegarde (station + seed + journal). */
export function runJournal(
  station: Station,
  journal: Journal,
  weather: readonly WeekWeather[],
  weeks: number,
): RunResult {
  let state = createGameState(station, rngStateFromSeed(journal.seed), {
    treasuryEur: journal.treasuryEur,
  });
  const refusals: ActionRefusal[] = [];
  for (let i = 0; i < weeks; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    const step = advanceWeek(state, w, journal.actions);
    state = step.state;
    refusals.push(...step.refusals);
  }
  return { state, refusals };
}
