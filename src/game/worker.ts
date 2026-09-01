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
import { getEspece } from "../engine/especes";
import { advanceWeek, beginWeek } from "../engine/game";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../engine/meteo";
import { rngStateFromSeed } from "../engine/rng";
import { createGameState, type GameState, type TickFluxes } from "../engine/state";
import { STATIONS_V0, type StationClimat } from "../engine/stations";
import { tick } from "../engine/tick";
import type { FromWorker, GameEvent, SaveGame, Snapshot, ToWorker } from "./protocol";

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
let autoHarvest = true;
let pendingEvents: GameEvent[] = [];
let droughtYearFlagged = -1;
let bankruptcyAnnounced = false;

function event(icone: string, message: string) {
  if (!state) return;
  pendingEvents.push({ week: state.week, icone, message });
}

function nomEspece(id: string): string {
  return getEspece(id).nom.toLowerCase();
}

/** Applique une action, la date, la journalise et raconte son résultat. */
function performAction(action: GameAction) {
  if (!state) return;
  journal.push(action);
  const before = state;
  const result = applyAction(state, action);
  state = result.state;
  pendingRefusals.push(...result.refusals);
  const dEur = state.economy.treasuryEur - before.economy.treasuryEur;
  const dHeures = state.economy.hoursUsedWeek - before.economy.hoursUsedWeek;
  const eur = dEur >= 0 ? `+${dEur.toFixed(0)} €` : `${dEur.toFixed(0)} €`;
  switch (action.type) {
    case "planter": {
      const n = state.trees.length - before.trees.length;
      if (n > 0)
        event(
          "🌱",
          `${n} ${nomEspece(action.especeId)}${n > 1 ? "s" : ""} planté${n > 1 ? "s" : ""} (${eur}, ${dHeures.toFixed(0)} h)`,
        );
      break;
    }
    case "couper": {
      const n = before.trees.length - state.trees.length;
      if (n > 0)
        event(
          "🪓",
          action.devenir === "vendre"
            ? `${n} arbre${n > 1 ? "s" : ""} vendu${n > 1 ? "s" : ""} en bois énergie : ${eur}`
            : `${n} arbre${n > 1 ? "s" : ""} broyé${n > 1 ? "s" : ""} et épandu${n > 1 ? "s" : ""} en BRF (azote et carbone au sol)`,
        );
      break;
    }
    case "recolter":
      if (dEur > 0) event("🧺", `Récolte : ${eur} (${dHeures.toFixed(1)} h)`);
      break;
    case "embaucher":
      if (dEur < 0) event("👷", `Ouvrier embauché (600 €/sem, 1re semaine payée d'avance)`);
      break;
    case "licencier":
      event("👋", "Ouvrier licencié");
      break;
    case "chauler":
      event("🪨", `Chaulage : ${eur} (${dHeures.toFixed(1)} h)`);
      break;
  }
}

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
    events: pendingEvents,
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
  pendingEvents = [];
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
    const before = state;
    const ticked = tick(state, w);
    lastFluxes = ticked.fluxes;
    state = beginWeek(ticked.state);

    // ── Fil d'événements : ce qui a changé cette semaine ────────────────────
    const weekOfYear = before.week % 52;
    // Morts (par espèce)
    const deadBySpecies = new Map<string, number>();
    const aliveAfter = new Set(state.trees.filter((t) => t.alive).map((t) => t.id));
    for (const t of before.trees) {
      if (t.alive && !aliveAfter.has(t.id)) {
        deadBySpecies.set(t.especeId, (deadBySpecies.get(t.especeId) ?? 0) + 1);
      }
    }
    for (const [id, n2] of deadBySpecies) {
      event("💀", `${n2} ${nomEspece(id)}${n2 > 1 ? "s" : ""} mort${n2 > 1 ? "s" : ""}`);
    }
    // Gel des fleurs
    const frostedBefore = new Set(before.trees.filter((t) => t.bloomFrosted).map((t) => t.id));
    const frosted = new Map<string, number>();
    for (const t of state.trees) {
      if (t.bloomFrosted && !frostedBefore.has(t.id)) {
        frosted.set(t.especeId, (frosted.get(t.especeId) ?? 0) + 1);
      }
    }
    for (const [id, n2] of frosted) {
      event(
        "❄️",
        `Gel tardif (${w.tMinAbsC.toFixed(0)} °C) : fleurs de ${n2} ${nomEspece(id)}${n2 > 1 ? "s" : ""} détruites — récolte perdue`,
      );
    }
    // Semis naturels (semaine du recrutement)
    if (weekOfYear === 14) {
      const recruits =
        state.trees.length -
        before.trees.length +
        (deadBySpecies.size > 0 ? [...deadBySpecies.values()].reduce((a, b) => a + b, 0) : 0);
      if (recruits > 0) event("🌿", `${recruits} semis naturels se sont installés`);
    }
    // Sécheresse (sol moyen presque à sec en saison de végétation)
    const year = Math.floor(before.week / 52);
    if (weekOfYear >= 20 && weekOfYear <= 40 && droughtYearFlagged !== year && sc) {
      const arr = state.soil.waterMm;
      let sum = 0;
      for (let k = 0; k < arr.length; k++) sum += arr[k] ?? 0;
      if (sum / arr.length < 0.2 * sc.station.ruMm) {
        droughtYearFlagged = year;
        event("🔥", "Sécheresse : la réserve du sol est presque à sec — les sensibles souffrent");
      }
    }
    // Faillite : le temps s'arrête, le joueur doit regarder ses comptes.
    if (state.economy.bankrupt && !bankruptcyAnnounced) {
      bankruptcyAnnounced = true;
      event("💸", "FAILLITE : le découvert a dépassé −20 000 €");
      weeksPerSecond = 0;
      post({
        type: "autopause",
        reason: "FAILLITE — le découvert a dépassé −20 000 €. Vendez, licenciez, ou recommencez.",
      });
      return;
    }
    // Fruits mûrs : récolte auto, ou pause pour laisser la main
    const ready = state.trees.filter((t) => t.alive && t.fruitsKg > 0.5);
    const readyKg = ready.reduce((s, t) => s + t.fruitsKg, 0);
    if (readyKg > 1 && prevFruitsReadyKg <= 1) {
      if (autoHarvest) {
        const refusalsBefore = pendingRefusals.length;
        performAction({ type: "recolter", week: state.week, treeIds: ready.map((t) => t.id) });
        if (pendingRefusals.length > refusalsBefore) {
          weeksPerSecond = 0;
          post({
            type: "autopause",
            reason:
              "récolte auto incomplète : plus assez d'heures cette semaine — embauchez ou récoltez à la main",
          });
          prevFruitsReadyKg = 0;
          return;
        }
      } else if (weeksPerSecond > 4) {
        prevFruitsReadyKg = readyKg;
        weeksPerSecond = 0;
        post({ type: "autopause", reason: `${Math.round(readyKg)} kg de fruits sont mûrs` });
        return;
      }
    }
    prevFruitsReadyKg = state.trees.reduce((s, t) => (t.alive ? s + t.fruitsKg : s), 0);
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
  pendingEvents = [];
  lastFluxes = undefined;
  weeksPerSecond = 0;
  bankruptcyAnnounced = false;
  droughtYearFlagged = -1;
  prevFruitsReadyKg = 0;
  post({ type: "ready", station: stationInfo() });
  postSnapshot();
  startLoop();
}

self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
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
      // La semaine est déjà « ouverte » : l'action s'applique immédiatement,
      // en pause comme en lecture — le rejeu donnera le même résultat.
      performAction({ ...msg.action, week: state.week } as GameAction);
      postSnapshot();
      break;
    }
    case "autoHarvest":
      autoHarvest = msg.enabled;
      break;
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
});
