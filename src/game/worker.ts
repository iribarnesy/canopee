/**
 * Worker de simulation : le moteur (pur) tourne ici, hors du thread UI
 * (docs/stack.md). L'état vit toujours « semaine ouverte » (beginWeek fait) :
 * une action reçue s'applique immédiatement — même en pause — et est datée de
 * la semaine courante dans le journal ; le rejeu du journal (sauvegarde)
 * reproduit exactement la même partie.
 */

import { serieMeteoPour } from "../data/meteo";
import type { ActionRefusal, GameAction } from "../engine/actions";
import { applyAction, valeurSurPied } from "../engine/actions";
import { indiceBiodiversite } from "../engine/biodiversite";
import { carbonInventory } from "../engine/carbon";
import { getEspece } from "../engine/especes";
import { advanceWeek, beginWeek } from "../engine/game";
import { partMecanisable } from "../engine/mecanisation";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../engine/meteo";
import { rngStateFromSeed } from "../engine/rng";
import { ruHorizonMm } from "../engine/soil";
import { createGameState, type GameState, type TickFluxes } from "../engine/state";
import { STATIONS_V0, type StationClimat } from "../engine/stations";
import { tick } from "../engine/tick";
import { type CauseMort, LIBELLE_CAUSE } from "../engine/trees";
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

/**
 * Dire au joueur POURQUOI un chantier a coûté ce qu'il a coûté : c'est la
 * disposition de ses arbres qui décide si l'engin entre.
 */
function moyen(
  state: GameState,
  action: Extract<GameAction, { type: "faucher" | "chauler" }>,
): string {
  const part = partMecanisable(state.trees, action.x, action.y, action.rayonM);
  if (part >= 0.85) return "à la machine";
  if (part <= 0.15) return "à la main : l'engin ne passe pas";
  return `${Math.round(part * 100)} % à la machine, le reste à la main`;
}

function event(icone: string, message: string) {
  if (!state) return;
  pendingEvents.push({ week: state.week, icone, message });
}

function nomEspece(id: string): string {
  return getEspece(id).nom.toLowerCase();
}

/** Dit si la coupe part en scierie ou en bûches, pour le journal. */
function qualiteVente(avant: GameState, treeIds: readonly number[]): string {
  let oeuvre = 0;
  for (const id of treeIds) {
    const t = avant.trees.find((x) => x.id === id);
    if (t && valeurSurPied(getEspece(t.especeId), t).qualite === "oeuvre") oeuvre++;
  }
  if (oeuvre === 0) return "bois de chauffage";
  if (oeuvre === treeIds.length) return "bois d'œuvre";
  return `${oeuvre} en bois d'œuvre, le reste en chauffage`;
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
            ? `${n} arbre${n > 1 ? "s" : ""} vendu${n > 1 ? "s" : ""} (${qualiteVente(before, action.treeIds)}) : ${eur}`
            : `${n} arbre${n > 1 ? "s" : ""} broyé${n > 1 ? "s" : ""} et épandu${n > 1 ? "s" : ""} en BRF (azote et carbone au sol)`,
        );
      break;
    }
    case "recolter": {
      if (dEur <= 0) break;
      // Détail par espèce : ce qui a été ramassé, et combien.
      const parEspece = new Map<string, number>();
      for (const id of action.treeIds) {
        const avant = before.trees.find((t) => t.id === id);
        if (!avant || avant.fruitsKg <= 0) continue;
        parEspece.set(avant.especeId, (parEspece.get(avant.especeId) ?? 0) + avant.fruitsKg);
      }
      const detail = [...parEspece]
        .map(([id, kg]) => `${kg.toFixed(0)} kg de ${nomEspece(id)}`)
        .join(", ");
      event("🧺", `Récolte : ${detail || "fruits"} → ${eur} (${dHeures.toFixed(1)} h)`);
      break;
    }
    case "embaucher":
      if (dEur < 0)
        event(
          "👷",
          action.contrat === "saisonnier"
            ? `Saisonnier embauché ${Math.max(1, Math.round(action.semaines ?? 4))} semaines (${eur})`
            : `Ouvrier embauché en CDI (600 €/sem, 1re semaine payée d'avance)`,
        );
      break;
    case "licencier":
      if (dEur < 0) event("👋", `CDI rompu : ${eur} d'indemnités`);
      break;
    case "chauler": {
      event("🪨", `Chaulage : ${eur} (${dHeures.toFixed(1)} h, ${moyen(before, action)})`);
      break;
    }
    case "faucher": {
      event(
        "🌾",
        `Fauche : ${dHeures.toFixed(1)} h ${eur} (${moyen(before, action)}) — les jeunes plants respirent`,
      );
      break;
    }
    case "eclaircir": {
      const n = before.trees.length - state.trees.length;
      if (n > 0)
        event(
          "🌲",
          `Éclaircie ${action.critere === "parLeBas" ? "par le bas" : action.critere === "parLeHaut" ? "par le haut" : "sélective"} : ${n} tiges prélevées, ${eur}`,
        );
      break;
    }
    case "proteger": {
      const n =
        state.trees.filter((t) => t.protege).length - before.trees.filter((t) => t.protege).length;
      if (n > 0)
        event("🛡️", `${n} plant${n > 1 ? "s" : ""} protégé${n > 1 ? "s" : ""} du gibier, ${eur}`);
      break;
    }
    case "leverEcorce": {
      if (dEur > 0)
        event("🟤", `Liège levé : ${eur} (${dHeures.toFixed(1)} h) — les arbres restent debout`);
      break;
    }
    case "elaguer": {
      const n = action.treeIds.length;
      event(
        "✂️",
        `${n} arbre${n > 1 ? "s" : ""} élagué${n > 1 ? "s" : ""} (${dHeures.toFixed(1)} h) — une bille propre pour la scierie`,
      );
      break;
    }
    case "receper": {
      const n = action.treeIds.length;
      event(
        "🪵",
        `${n} cépée${n > 1 ? "s" : ""} recépée${n > 1 ? "s" : ""} : ${eur} — la souche repartira`,
      );
      break;
    }
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
    herbeCouvertureMean: 0,
    broutageKg: 0,
    ravageurMoyen: 0,
    auxiliairesMoyen: 0,
    mineralizationKgHa: 0,
    uptakeKgHa: 0,
    leachedKgHa: 0,
    litterfallKgHa: 0,
    litterDecayKgHa: 0,
    fixationKgHa: 0,
  };
}

/** Eau de l'horizon de surface, par cellule (le sol est stratifié, cf. soil.ts). */
function surfaceWater(s: GameState, nH: number): Float32Array {
  const nCells = s.soil.mineralNG.length;
  const out = new Float32Array(nCells);
  for (let i = 0; i < nCells; i++) out[i] = s.soil.waterMm[i * nH] ?? 0;
  return out;
}

function postSnapshot() {
  if (!state || !sc) return;
  const nHorizons = Math.max(1, sc.station.profil.length);
  const w = weather[state.week % weather.length];
  if (!w) return;
  const snapshot: Snapshot = {
    week: state.week,
    weather: w,
    economy: state.economy,
    inventory: carbonInventory(state, sc.station.initialSoilCTHa),
    biodiversite: indiceBiodiversite(
      state.trees,
      state.carbon.deadWoodKgC,
      (sc.station.coteM * sc.station.coteM) / 10_000,
    ),
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
        hauteurElagueeM: t.hauteurElagueeM,
        protege: t.protege,
      })),
    // Carte : on montre l'eau de l'horizon de SURFACE, celle que voient les
    // semis et l'évaporation (le sol est stratifié, cf. soil.ts).
    soilWater: surfaceWater(state, nHorizons),
    soilPh: Float32Array.from(state.soil.ph),
    soilN: Float32Array.from(state.soil.mineralNG),
    soilHerbe: Float32Array.from(state.soil.herbeCouverture),
    refusals: pendingRefusals,
  };
  pendingRefusals = [];
  pendingEvents = [];
  post({ type: "snapshot", snapshot }, [
    snapshot.soilWater.buffer,
    snapshot.soilPh.buffer,
    snapshot.soilN.buffer,
    snapshot.soilHerbe.buffer,
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
    const finis =
      before.economy.saisonniersFinSemaine.length - state.economy.saisonniersFinSemaine.length;
    if (finis > 0) {
      event(
        "👋",
        `Fin de contrat : ${finis} saisonnier${finis > 1 ? "s" : ""} reparti${finis > 1 ? "s" : ""}`,
      );
    }

    // ── Fil d'événements : ce qui a changé cette semaine ────────────────────
    const weekOfYear = before.week % 52;
    // Morts : regroupées par espèce ET par cause, pour que le joueur sache
    // ce qui a tué ses arbres et puisse corriger le tir.
    const parEspeceEtCause = new Map<string, { n: number; hMax: number }>();
    for (const mort of ticked.morts) {
      const cle = `${mort.especeId}|${mort.cause}`;
      const agg = parEspeceEtCause.get(cle) ?? { n: 0, hMax: 0 };
      agg.n++;
      agg.hMax = Math.max(agg.hMax, mort.heightM);
      parEspeceEtCause.set(cle, agg);
    }
    for (const [cle, agg] of parEspeceEtCause) {
      const [id, cause] = cle.split("|");
      if (!id) continue;
      const libelle = LIBELLE_CAUSE[(cause ?? "secheresse") as CauseMort] ?? "";
      const taille = agg.hMax >= 1 ? ` (jusqu'à ${agg.hMax.toFixed(1)} m)` : " (semis)";
      event("💀", `${agg.n} ${nomEspece(id)}${agg.n > 1 ? "s" : ""} ${libelle}${taille}`);
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
      const recruits = state.trees.length - before.trees.length + ticked.morts.length;
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
    // Incendie : l'événement le plus marquant d'une partie sur lande.
    if (ticked.incendie) {
      const f = ticked.incendie;
      const are = Math.round(f.cellulesBrulees / 100);
      event(
        "🔥",
        `INCENDIE : ${are > 0 ? `${are} ares` : `${f.cellulesBrulees} m²`} brûlés, ` +
          `${f.arbresTues} arbres tués${f.rejets > 0 ? `, ${f.rejets} repartent de souche` : ""} — ` +
          `${f.carboneTHa.toFixed(1)} t C/ha parties en fumée`,
      );
      if (weeksPerSecond > 1) {
        weeksPerSecond = 0;
        post({ type: "autopause", reason: `Incendie : ${f.arbresTues} arbres perdus` });
        postSnapshot();
        return;
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
              "récolte auto incomplète : plus assez d'heures cette semaine — embauchez un saisonnier ou récoltez à la main",
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
    ruMm: sc.station.profil[0] ? ruHorizonMm(sc.station.profil[0]) : sc.station.ruMm,
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
