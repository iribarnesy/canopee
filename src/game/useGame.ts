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

/** Combien de temps on attend la sauvegarde avant de fermer quand même, ms. */
const DELAI_SAUVEGARDE_MS = 2000;

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
    economie: boolean,
  ) => void;
  resume: (save: SaveGame) => void;
  dispatch: (action: ActionSansSemaine) => void;
  /**
   * Demande au moteur si ce geste passerait, sans le faire. La réponse arrive
   * dans `prevision`, marquée de la même `cle` — le survol pose la question
   * plusieurs fois par seconde et les réponses peuvent se doubler.
   */
  prevoir: (cle: string, action: ActionSansSemaine) => void;
  /** La dernière réponse du moteur à `prevoir`. */
  prevision?: { cle: string; refusals: ActionRefusal[] };
  /**
   * Combien d'instantanés sont arrivés. Ce n'est pas un compteur de semaines :
   * une action en pause en produit un aussi.
   *
   * Un préavis porte sur un ÉTAT, pas seulement sur une position — planter un
   * arbre rend refusée la place qu'on survolait il y a une seconde. Sans ce
   * numéro dans la clé, la réponse restait celle d'avant le geste, et le
   * fantôme restait vert sur une place devenue interdite.
   */
  revision: number;
  setSpeed: (weeksPerSecond: number) => void;
  /**
   * Met en marche ou en pause, d'un seul geste.
   *
   * La reprise repart à la DERNIÈRE vitesse choisie, et c'est tout l'intérêt
   * d'avoir une bascule : mettre en pause et reprendre étaient deux cibles
   * différentes qu'il fallait chercher à chaque fois.
   */
  basculer: () => void;
  /** Avance de tant de semaines à la vitesse dite, puis s'arrête tout seul. */
  avancerDe: (semaines: number, weeksPerSecond: number, libelle: string) => void;
  /**
   * RETIENT le temps du jeu, sans toucher à la vitesse (#163).
   *
   * Le temps attend qu'une animation bloquante aille jusqu'au bout. Ce n'est
   * pas une pause : la vitesse choisie et la traversée en cours sont intactes
   * au relâchement, et le bandeau continue d'afficher ce que le joueur a
   * demandé — il n'a pas changé d'avis, il regarde un arbre tomber.
   */
  attendre: (retenu: boolean) => void;
  quit: () => void;
}

export function useGame(): GameApi {
  const workerRef = useRef<Worker>(null);
  /**
   * Ce qu'il reste à faire pour quitter, une fois la sauvegarde écrite.
   * Non nul seulement pendant le court instant où l'on attend la réponse du
   * worker à `requestSave` — voir `quit`.
   */
  const arretRef = useRef<(() => void) | null>(null);
  const [station, setStation] = useState<StationInfo>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [refusals, setRefusals] = useState<WithUid<ActionRefusal>[]>([]);
  const [speed, setSpeedState] = useState(0);
  /**
   * La dernière vitesse de lecture demandée, pour savoir à quoi reprendre.
   *
   * Une référence et non un état : elle ne change rien à l'écran, et la faire
   * rendre à chaque pause serait payer un rendu pour une mémoire.
   */
  const vitessePrecedente = useRef(1);
  const [replayProgress, setReplayProgress] = useState<{
    done: number;
    total: number;
    phase?: "vieillissement" | "rejeu";
  }>();
  const [notice, setNotice] = useState<string>();
  const [events, setEvents] = useState<WithUid<GameEvent>[]>([]);
  const [autoHarvest, setAutoHarvestState] = useState(true);
  const [prevision, setPrevision] = useState<{ cle: string; refusals: ActionRefusal[] }>();
  const [revision, setRevision] = useState(0);
  /** La dernière question posée : les réponses en retard sont jetées. */
  const cleDemandee = useRef("");

  const send = useCallback((msg: ToWorker) => workerRef.current?.postMessage(msg), []);

  /**
   * STABLE, et c'est nécessaire et pas décoratif : l'appelant s'en sert dans
   * l'effet qui retient l'horloge. Une fonction recréée à chaque rendu ferait
   * relâcher puis reprendre la retenue à chaque image — le jeu avancerait par
   * à-coups au lieu d'attendre.
   */
  const attendre = useCallback((retenu: boolean) => send({ type: "attendre", retenu }), [send]);

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
          setRevision((n) => n + 1);
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
        case "prevision":
          // Une réponse qui ne concerne plus la position survolée est périmée :
          // la garder ferait clignoter le fantôme entre rouge et normal.
          if (msg.cle === cleDemandee.current)
            setPrevision({ cle: msg.cle, refusals: msg.refusals });
          break;
        case "save":
          try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(msg.save));
          } catch {
            /* stockage plein ou indisponible : la partie continue sans autosave */
          }
          // Si l'on attendait cette sauvegarde pour quitter, c'est le moment.
          arretRef.current?.();
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
    prevision,
    revision,
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
      economie,
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
        economie,
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
    prevoir: (cle, action) => {
      if (cle === cleDemandee.current) return; // déjà demandé, la réponse vient
      cleDemandee.current = cle;
      send({ type: "prevoir", cle, action });
    },
    setSpeed: (weeksPerSecond) => {
      if (weeksPerSecond > 0) vitessePrecedente.current = weeksPerSecond;
      send({ type: "speed", weeksPerSecond });
      setSpeedState(weeksPerSecond);
      setNotice(undefined);
    },
    basculer: () => {
      const cible = speed > 0 ? 0 : vitessePrecedente.current;
      send({ type: "speed", weeksPerSecond: cible });
      setSpeedState(cible);
      setNotice(undefined);
    },
    avancerDe: (semaines, weeksPerSecond, libelle) => {
      send({ type: "avancerDe", semaines, weeksPerSecond, libelle });
      setSpeedState(weeksPerSecond);
      setNotice(undefined);
    },
    // Pas de `setSpeedState` ici, et c'est tout l'intérêt : l'état affiché ne
    // bouge pas, seul le worker suspend ses pas.
    attendre,
    /**
     * Quitter, c'est sauvegarder PUIS fermer — dans cet ordre.
     *
     * Le worker ne répond pas à `requestSave` sur place : il renvoie un
     * message que le fil principal écrit dans `localStorage`. Terminer le
     * worker dans la foulée de la demande, comme on le faisait, ne laissait
     * jamais cette réponse arriver : la sauvegarde du dernier instant était
     * perdue, et seul l'autosave précédent survivait. On attend donc le
     * message, avec un délai de grâce : mieux vaut quitter en ayant perdu la
     * dernière minute que rester coincé sur un worker muet.
     */
    quit: () => {
      if (arretRef.current) return; // déjà en train de quitter
      let minuteur: ReturnType<typeof setTimeout>;
      const fermer = () => {
        arretRef.current = null;
        clearTimeout(minuteur);
        workerRef.current?.terminate();
        workerRef.current = null;
        setStation(undefined);
        setSnapshot(undefined);
        setSpeedState(0);
      };
      arretRef.current = fermer;
      minuteur = setTimeout(fermer, DELAI_SAUVEGARDE_MS);
      // La partie s'arrête d'avancer pendant qu'on écrit, sinon la sauvegarde
      // décrit une semaine qui n'est déjà plus celle du moteur.
      send({ type: "speed", weeksPerSecond: 0 });
      send({ type: "requestSave" });
    },
  };
}
