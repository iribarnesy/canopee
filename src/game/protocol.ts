/**
 * Protocole UI ↔ worker de simulation (docs/stack.md : le moteur tourne dans
 * un Web Worker, l'UI ne reçoit que des instantanés). La sauvegarde est le
 * journal d'actions datées + la seed (rejouable, src/engine/game.ts).
 */

import type { ActionRefusal, EconomyState, GameAction } from "../engine/actions";
import type { CarbonInventory } from "../engine/carbon";
import type { WeekWeather } from "../engine/meteo";
import type { TickFluxes } from "../engine/state";

/** Omit distributif sur l'union des actions (Omit natif écrase l'union). */
type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
/** Une action sans sa date : le worker la datera de la semaine courante. */
export type ActionSansSemaine = DistributiveOmit<GameAction, "week">;

export interface SaveGame {
  version: 1;
  stationId: string;
  seed: number;
  meteo: "reelle" | "synthetique";
  /** semaines déjà simulées (pour rejouer jusqu'au même point) */
  weeks: number;
  actions: GameAction[];
}

export interface SnapshotTree {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  ageWeeks: number;
  stress: number;
  fruitsKg: number;
}

/** Événement de jeu pour le fil d'actualité (morts, gels, récoltes, ventes…). */
export interface GameEvent {
  week: number;
  icone: string;
  message: string;
}

export interface Snapshot {
  week: number;
  weather: WeekWeather;
  economy: EconomyState;
  inventory: CarbonInventory;
  fluxes: TickFluxes;
  trees: SnapshotTree[];
  soilWater: Float32Array;
  soilPh: Float32Array;
  soilN: Float32Array;
  /** couverture herbacée par cellule ∈ [0,1] */
  soilHerbe: Float32Array;
  /** refus d'actions depuis le dernier instantané */
  refusals: ActionRefusal[];
  /** événements depuis le dernier instantané */
  events: GameEvent[];
}

export interface StationInfo {
  id: string;
  nom: string;
  coteM: number;
  /** réserve utile de l'horizon de surface, mm (échelle de la carte) */
  ruMm: number;
  phInitial: number;
  meteoLabel: string;
}

export type ToWorker =
  | { type: "init"; stationId: string; seed: number; meteo: "reelle" | "synthetique" }
  | { type: "resume"; save: SaveGame }
  | { type: "speed"; weeksPerSecond: number }
  | { type: "action"; action: ActionSansSemaine }
  | { type: "autoHarvest"; enabled: boolean }
  | { type: "requestSave" };

export type FromWorker =
  | { type: "ready"; station: StationInfo }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "save"; save: SaveGame }
  | { type: "progress"; done: number; total: number }
  /** le temps s'est arrêté tout seul (fruits mûrs…) : l'UI resynchronise la vitesse */
  | { type: "autopause"; reason: string };
