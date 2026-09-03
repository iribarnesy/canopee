/**
 * Protocole UI ↔ worker de simulation (docs/stack.md : le moteur tourne dans
 * un Web Worker, l'UI ne reçoit que des instantanés). La sauvegarde est le
 * journal d'actions datées + la seed (rejouable, src/engine/game.ts).
 */

import type { ActionRefusal, EconomyState, GameAction } from "../engine/actions";
import type { IndiceBiodiversite } from "../engine/biodiversite";
import type { CarbonInventory } from "../engine/carbon";
import type { ScenarioId } from "../engine/climat";
import type { EauDeSurface } from "../engine/eau_surface";
import type { WeekWeather } from "../engine/meteo";
import type { Bordures } from "../engine/paysage";
import type { Relief } from "../engine/relief";
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
  /** trajectoire climatique GIEC suivie par la partie (climat.ts) */
  scenario: ScenarioId;
  /** paysage autour de la parcelle (paysage.ts) */
  paysageId: string;
  /** ce qu'il y a de chaque côté ; absent = ancienne sauvegarde uniforme */
  bordures?: Bordures;
  /** relief choisi ; absent = celui d'origine de la station */
  relief?: Relief;
  /** eau libre choisie ; absent = aucune */
  eau?: EauDeSurface;
  /** profondeur d'équilibre de la nappe choisie, cm ; absent = celle de la station */
  nappeCm?: number;
  /** années simulées à vide avant l'arrivée du joueur ; absent = 0 */
  maturationAns?: number;
  /** année civile du début de partie */
  anneeDepart: number;
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
  /** hauteur de bille élaguée, m (ce qui fera du bois d'œuvre) */
  hauteurElagueeM: number;
  /** plant sous manchon : le gibier ne l'atteint pas */
  protege: boolean;
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
  biodiversite: IndiceBiodiversite;
  /** année civile en cours (climat.ts) */
  anneeCivile: number;
  /** nom du paysage autour de la parcelle */
  paysage: string;
  /** CO₂ de l'année, ppm */
  co2Ppm: number;
  /** broyat en réserve, kg de matière sèche */
  stockBrfKg: number;
  /** pression de gibier locale ∈ [0,1] (la chasse la fait baisser, l'immigration la relève) */
  pressionGibier: number;
  fluxes: TickFluxes;
  trees: SnapshotTree[];
  soilWater: Float32Array;
  soilPh: Float32Array;
  soilN: Float32Array;
  /** couverture herbacée par cellule ∈ [0,1] */
  soilHerbe: Float32Array;
  /** profondeur de la nappe sous chaque cellule, cm — elle vit, elle (nappe.ts) */
  soilNappeCm: Float32Array;
  /** engorgement moyen du profil par cellule ∈ [0,1] : ce qui asphyxie les racines */
  soilEngorgement: Float32Array;
  /** cellules closes (1) — le gibier n'y entre pas */
  soilCloture: Uint8Array;
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
  /** eau libre de la parcelle : l'UI la dessine (eau_surface.ts) */
  eau: EauDeSurface;
  /** cellules occupées par l'eau libre, telles que le moteur les voit */
  enEau: boolean[];
  /** profondeur d'équilibre de la nappe, cm */
  nappeEquilibreCm: number;
  /** profondeur de la nappe sous chaque cellule, cm — fixe, envoyée une fois */
  nappeCm: Float32Array;
}

export type ToWorker =
  | {
      type: "init";
      stationId: string;
      seed: number;
      meteo: "reelle" | "synthetique";
      scenario: ScenarioId;
      bordures: Bordures;
      relief: Relief;
      eau: EauDeSurface;
      /** profondeur d'équilibre de la nappe, cm */
      nappeCm: number;
      /** années à faire passer sur le terrain avant que le joueur n'arrive */
      maturationAns: number;
      anneeDepart: number;
    }
  | { type: "resume"; save: SaveGame }
  | { type: "speed"; weeksPerSecond: number }
  | { type: "action"; action: ActionSansSemaine }
  | { type: "autoHarvest"; enabled: boolean }
  | { type: "requestSave" };

export type FromWorker =
  | { type: "ready"; station: StationInfo }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "save"; save: SaveGame }
  | { type: "progress"; done: number; total: number; phase?: "vieillissement" | "rejeu" }
  /** le temps s'est arrêté tout seul (fruits mûrs…) : l'UI resynchronise la vitesse */
  | { type: "autopause"; reason: string };
