/**
 * Worker de simulation : le moteur (pur) tourne ici, hors du thread UI
 * (docs/stack.md). L'état vit toujours « semaine ouverte » (beginWeek fait) :
 * une action reçue s'applique immédiatement — même en pause — et est datée de
 * la semaine courante dans le journal ; le rejeu du journal (sauvegarde)
 * reproduit exactement la même partie.
 */

import { serieMeteoPour } from "../data/meteo";
import type { ActionRefusal, GameAction } from "../engine/actions";
import { applyAction } from "../engine/actions";
import { carbonInventory } from "../engine/carbon";
import { advanceWeek, beginWeek } from "../engine/game";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../engine/meteo";
import { rngStateFromSeed } from "../engine/rng";
import { createGameState, type GameState, type TickFluxes } from "../engine/state";
import { STATIONS_V0, type StationClimat } from "../engine/stations";
import { tick } from "../engine/tick";
import type { FromWorker, SaveGame, Snapshot, ToWorker } from "./protocol";

let sc: StationClimat | undefined;
let weather: WeekWeather[] = [];
/** état courant, toujours « semaine ouverte » */
let state: GameState | undefined;
let journal: GameAction[] = [];
let meteoMode: "reelle" | "synthetique" = "reelle";
let seed = 1;
let weeksPerSecond = 0;
let pendingRefusals: ActionRefusal[] = [];
let lastFluxes: TickFluxes | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let fractionalWeeks = 0;
let prevFruitsReadyKg = 0;

const post = (msg: FromWorker, transfer: Transferable[] = []) =>
  (postMessage as (m: FromWorker, t?: Transferable[]) => void)(msg, transfer);

function loadWeather(stationId: string, mode: "reelle" | "synthetique"): WeekWeather[] {
  const serie = mode === "reelle" ? serieMeteoPour(stationId) : undefined;
  if (serie) return serieToWeeks(serie);
  const station = STATIONS_V0.find((s) => s.station.id === stationId);
  if (!station) throw new Error(`station inconnue : ${stationId}`);
  return syntheticYear(station.climat);
}

function emptyFluxes(): TickFluxes {
  return {
    rainMm: 0,
    etpMm: 0,
    evapMm: 0,
    nappeMm: 0,
    transpirationMm: 0,
    drainageMm: 0,
    overflowMm: 0,
    waterloggingMean: 0,
    mineralizationKgHa: 0,
    uptakeKgHa: 0,
    leachedKgHa: 0,
    litterfallKgHa: 0,
    litterDecayKgHa: 0,
    fixationKgHa: 0,
  };
}

function postSnapshot() {
  if (!state || !sc) return;
  const w = weather[state.week % weather.length];
  if (!w) return;
  const snapshot: Snapshot = {
    week: state.week,
    weather: w,
    economy: state.economy,
    inventory: carbonInventory(state, sc.station.initialSoilCTHa),
    fluxes: lastFluxes ?? emptyFluxes(),
    trees: state.trees
      .filter((t) => t.alive)
      .map((t) => ({
        id: t.id,
        especeId: t.especeId,
        x: t.x,
        y: t.y,
        heightM: t.heightM,
        ageWeeks: t.ageWeeks,
        stress: t.stress,
        fruitsKg: t.fruitsKg,
      })),
    soilWater: Float32Array.from(state.soil.waterMm),
    soilPh: Float32Array.from(state.soil.ph),
    soilN: Float32Array.from(state.soil.mineralNG),
    refusals: pendingRefusals,
  };
  pendingRefusals = [];
  post({ type: "snapshot", snapshot }, [
    snapshot.soilWater.buffer,
    snapshot.soilPh.buffer,
    snapshot.soilN.buffer,
  ]);
}

/**
 * Ferme la semaine courante (tick) puis ouvre la suivante, n fois.
 * Pause automatique quand des fruits arrivent à maturité : à grande vitesse,
 * le joueur raterait la fenêtre de récolte (3 semaines) sans s'en apercevoir.
 */
function stepWeeks(n: number) {
  if (!state) return;
  for (let i = 0; i < n; i++) {
    const w = weather[state.week % weather.length];
    if (!w) return;
    const ticked = tick(state, w);
    lastFluxes = ticked.fluxes;
    state = beginWeek(ticked.state);
    const readyKg = state.trees.reduce((s, t) => (t.alive ? s + t.fruitsKg : s), 0);
    if (readyKg > 1 && prevFruitsReadyKg <= 1 && weeksPerSecond > 4) {
      prevFruitsReadyKg = readyKg;
      weeksPerSecond = 0;
      post({ type: "autopause", reason: `${Math.round(readyKg)} kg de fruits sont mûrs` });
      return;
    }
    prevFruitsReadyKg = readyKg;
  }
}

function startLoop() {
  if (timer) clearInterval(timer);
  fractionalWeeks = 0;
  timer = setInterval(() => {
    if (!state || weeksPerSecond <= 0) return;
    fractionalWeeks += weeksPerSecond / 10;
    const n = Math.floor(fractionalWeeks);
    if (n > 0) {
      fractionalWeeks -= n;
      stepWeeks(Math.min(n, 26));
      postSnapshot();
    }
  }, 100);
}

function stationInfo() {
  if (!sc) throw new Error("pas de station");
  const serie = meteoMode === "reelle" ? serieMeteoPour(sc.station.id) : undefined;
  return {
    id: sc.station.id,
    nom: sc.station.nom,
    coteM: sc.station.coteM,
    ruMm: sc.station.ruMm,
    phInitial: sc.station.phInitial,
    meteoLabel: serie
      ? `${serie.stationMeteo} ${serie.periode[0]}-${serie.periode[1]} (Météo-France)`
      : "année synthétique répétée",
  };
}

function init(stationId: string, newSeed: number, mode: "reelle" | "synthetique") {
  sc = STATIONS_V0.find((s) => s.station.id === stationId);
  if (!sc) throw new Error(`station inconnue : ${stationId}`);
  meteoMode = mode;
  seed = newSeed;
  weather = loadWeather(stationId, mode);
  state = beginWeek(createGameState(sc.station, rngStateFromSeed(newSeed)));
  journal = [];
  pendingRefusals = [];
  lastFluxes = undefined;
  weeksPerSecond = 0;
  post({ type: "ready", station: stationInfo() });
  postSnapshot();
  startLoop();
}

onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      init(msg.stationId, msg.seed, msg.meteo);
      break;
    case "resume": {
      // Rejoue la sauvegarde : même séquence beginWeek → actions → tick.
      sc = STATIONS_V0.find((s) => s.station.id === msg.save.stationId);
      if (!sc) throw new Error(`station inconnue : ${msg.save.stationId}`);
      meteoMode = msg.save.meteo;
      seed = msg.save.seed;
      weather = loadWeather(msg.save.stationId, msg.save.meteo);
      journal = msg.save.actions;
      let replayed = createGameState(sc.station, rngStateFromSeed(seed));
      for (let i = 0; i < msg.save.weeks; i++) {
        const w = weather[i % weather.length];
        if (!w) break;
        const step = advanceWeek(replayed, w, journal);
        replayed = step.state;
        lastFluxes = step.fluxes;
        if (i % 104 === 0) post({ type: "progress", done: i, total: msg.save.weeks });
      }
      state = beginWeek(replayed);
      pendingRefusals = [];
      weeksPerSecond = 0;
      post({ type: "ready", station: stationInfo() });
      postSnapshot();
      startLoop();
      break;
    }
    case "speed":
      weeksPerSecond = msg.weeksPerSecond;
      break;
    case "action": {
      if (!state) return;
      const action = { ...msg.action, week: state.week } as GameAction;
      journal.push(action);
      // La semaine est déjà « ouverte » : l'action s'applique immédiatement,
      // en pause comme en lecture — le rejeu donnera le même résultat.
      const result = applyAction(state, action);
      state = result.state;
      pendingRefusals.push(...result.refusals);
      postSnapshot();
      break;
    }
    case "requestSave": {
      if (!state) return;
      const save: SaveGame = {
        version: 1,
        stationId: sc?.station.id ?? "",
        seed,
        meteo: meteoMode,
        weeks: state.week,
        actions: journal,
      };
      post({ type: "save", save });
      break;
    }
  }
};
