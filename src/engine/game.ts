/**
 * Le runner de partie : rejoue un JOURNAL d'actions datées sur une station et
 * une seed — c'est le format de sauvegarde (docs/stack.md). Une semaine :
 * `beginWeek` (salaires, remise à zéro des compteurs, faillite) → actions
 * datées de la semaine (dans l'ordre du journal) → tick de simulation.
 * Le worker de l'UI suit exactement la même séquence en appliquant les
 * actions au fil de l'eau : partie vécue et partie rejouée sont identiques.
 */

import type { ActionRefusal, GameAction } from "./actions";
import { applyAction, OVERDRAFT_LIMIT_EUR, SALARY_EUR_WEEK } from "./actions";
import type { WeekWeather } from "./meteo";
import { rngStateFromSeed } from "./rng";
import type { GameState, Station, TickFluxes } from "./state";
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

/**
 * Ouvre la semaine : expiration des contrats saisonniers, salaires des CDI
 * (les saisonniers sont payés d'avance à l'embauche), compteurs, faillite.
 */
export function beginWeek(state: GameState): GameState {
  const saisonniers = state.economy.saisonniersFinSemaine.filter((fin) => fin > state.week);
  const salaries = state.economy.ouvriersCdi * SALARY_EUR_WEEK;
  const treasuryEur = state.economy.treasuryEur - salaries;
  return {
    ...state,
    economy: {
      ...state.economy,
      treasuryEur,
      uth: 1 + state.economy.ouvriersCdi + saisonniers.length,
      saisonniersFinSemaine: saisonniers,
      hoursUsedWeek: 0,
      hoursUsedYear: state.week % 52 === 0 ? 0 : state.economy.hoursUsedYear,
      bankrupt: state.economy.bankrupt || treasuryEur < OVERDRAFT_LIMIT_EUR,
    },
  };
}

/** Avance d'une semaine : ouverture, actions de la semaine courante, tick. */
export function advanceWeek(
  state: GameState,
  weather: WeekWeather,
  actions: readonly GameAction[],
): {
  state: GameState;
  refusals: ActionRefusal[];
  fluxes: TickFluxes;
  morts: { especeId: string; cause: string; heightM: number }[];
  incendie?: { cellulesBrulees: number; arbresTues: number; rejets: number; carboneTHa: number };
} {
  let s = beginWeek(state);
  const refusals: ActionRefusal[] = [];
  for (const action of actions) {
    if (action.week !== s.week) continue;
    const result = applyAction(s, action);
    s = result.state;
    refusals.push(...result.refusals);
  }
  const ticked = tick(s, weather);
  return {
    state: ticked.state,
    refusals,
    fluxes: ticked.fluxes,
    morts: ticked.morts,
    incendie: ticked.incendie,
  };
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
