/**
 * Pont React ↔ worker de simulation : cycle de vie du worker, dernier
 * instantané, journal de refus, sauvegarde locale (localStorage).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionRefusal } from "../engine/actions";
import type { ScenarioId } from "../engine/climat";
import type { EauDeSurface } from "../engine/eau_surface";
import type { Bordures } from "../engine/paysage";
import type { Relief } from "../engine/relief";

let uid = 0;
export type WithUid<T> = T & { uid: number };
const withUid = <T>(x: T): WithUid<T> => ({ ...x, uid: ++uid });

import type {
  ActionSansSemaine,
  FromWorker,
  GameEvent,
  SaveGame,
  Snapshot,
  StationInfo,
  ToWorker,
} from "./protocol";

const SAVE_KEY = "canopee-sauvegarde";

export function loadSave(): SaveGame | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const save = JSON.parse(raw) as SaveGame;
    return save.version === 1 ? save : undefined;
  } catch {
    return undefined;
  }
}

export interface GameApi {
  station?: StationInfo;
  snapshot?: Snapshot;
  refusals: WithUid<ActionRefusal>[];
  events: WithUid<GameEvent>[];
  speed: number;
  autoHarvest: boolean;
  setAutoHarvest: (enabled: boolean) => void;
  /** message de pause automatique (fruits mûrs…) */
  notice?: string;
  replayProgress?: { done: number; total: number; phase?: "vieillissement" | "rejeu" };
  newGame: (
    stationId: string,
    seed: number,
    meteo: "reelle" | "synthetique",
    scenario: ScenarioId,
    bordures: Bordures,
    relief: Relief,
    eau: EauDeSurface,
    nappeCm: number,
    partBassin: number,
    maturationAns: number,
    anneeDepart: number,
  ) => void;
  resume: (save: SaveGame) => void;
  dispatch: (action: ActionSansSemaine) => void;
  setSpeed: (weeksPerSecond: number) => void;
  quit: () => void;
}

export function useGame(): GameApi {
  const workerRef = useRef<Worker>(null);
  const [station, setStation] = useState<StationInfo>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [refusals, setRefusals] = useState<WithUid<ActionRefusal>[]>([]);
  const [speed, setSpeedState] = useState(0);
  const [replayProgress, setReplayProgress] = useState<{
    done: number;
    total: number;
    phase?: "vieillissement" | "rejeu";
  }>();
  const [notice, setNotice] = useState<string>();
  const [events, setEvents] = useState<WithUid<GameEvent>[]>([]);
  const [autoHarvest, setAutoHarvestState] = useState(true);

  const send = useCallback((msg: ToWorker) => workerRef.current?.postMessage(msg), []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const msg = event.data;
      switch (msg.type) {
        case "ready":
          setStation(msg.station);
          setReplayProgress(undefined);
          break;
        case "snapshot":
          setSnapshot(msg.snapshot);
          if (msg.snapshot.refusals.length > 0) {
            setRefusals((prev) => [...msg.snapshot.refusals.map(withUid), ...prev].slice(0, 4));
          }
          if (msg.snapshot.events.length > 0) {
            setEvents((prev) =>
              [...msg.snapshot.events.map(withUid).reverse(), ...prev].slice(0, 60),
            );
          }
          break;
        case "progress":
          setReplayProgress({ done: msg.done, total: msg.total, phase: msg.phase });
          break;
        case "autopause":
          setSpeedState(0);
          setNotice(msg.reason);
          break;
        case "save":
          try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(msg.save));
          } catch {
            /* stockage plein ou indisponible : la partie continue sans autosave */
          }
          break;
      }
    };
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    // Autosave : demande la sauvegarde au worker toutes les 30 s de jeu réel.
    const id = setInterval(() => {
      if (workerRef.current && station) send({ type: "requestSave" });
    }, 30_000);
    return () => clearInterval(id);
  }, [send, station]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return {
    station,
    snapshot,
    refusals,
    events,
    speed,
    autoHarvest,
    setAutoHarvest: (enabled) => {
      setAutoHarvestState(enabled);
      send({ type: "autoHarvest", enabled });
    },
    notice,
    replayProgress,
    newGame: (
      stationId,
      seed,
      meteo,
      scenario,
      bordures,
      relief,
      eau,
      nappeCm,
      partBassin,
      maturationAns,
      anneeDepart,
    ) => {
      ensureWorker();
      setRefusals([]);
      setEvents([]);
      setSnapshot(undefined);
      send({
        type: "init",
        stationId,
        seed,
        meteo,
        scenario,
        bordures,
        relief,
        eau,
        nappeCm,
        partBassin,
        maturationAns,
        anneeDepart,
      });
      send({ type: "autoHarvest", enabled: true });
      setAutoHarvestState(true);
      setSpeedState(0);
    },
    resume: (save) => {
      ensureWorker();
      setRefusals([]);
      setEvents([]);
      setSnapshot(undefined);
      send({ type: "resume", save });
      send({ type: "autoHarvest", enabled: true });
      setAutoHarvestState(true);
      setSpeedState(0);
    },
    dispatch: (action) => {
      send({ type: "action", action });
      send({ type: "requestSave" });
    },
    setSpeed: (weeksPerSecond) => {
      send({ type: "speed", weeksPerSecond });
      setSpeedState(weeksPerSecond);
      setNotice(undefined);
    },
    quit: () => {
      send({ type: "requestSave" });
      workerRef.current?.terminate();
      workerRef.current = null;
      setStation(undefined);
      setSnapshot(undefined);
      setSpeedState(0);
    },
  };
}
