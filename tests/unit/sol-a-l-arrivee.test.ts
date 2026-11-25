/**
 * **Le sol tel que le joueur l'a trouvé** (#509).
 *
 * `v1.md` demande que le sol qui s'appauvrit se voie avant d'être
 * irréversible. La carte montrait l'état, jamais l'écart depuis l'arrivée : le
 * repère n'existait nulle part. Le worker le relève maintenant à l'arrivée
 * (`arriverSurLaParcelle`), l'envoie avec la station et le range dans le bloc
 * de reprise.
 *
 * Ces épreuves passent par le **worker lui-même**, avec les messages que
 * l'interface envoie, et défendent trois promesses :
 *
 *  - le relevé est le premier instantané, lu de la même façon ;
 *  - il se garde : la reprise depuis le bloc et le rejeu du journal rendent le
 *    même, au bit près, que la partie quittée ;
 *  - une sauvegarde d'avant lui se charge encore, depuis son bloc, sans rien
 *    rejouer — simplement sans repère.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SANS_EAU } from "../../src/engine/eau_surface";
import { bordersUniformes } from "../../src/engine/paysage";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type {
  FromWorker,
  SaveGame,
  Snapshot,
  SolALArrivee,
  StationInfo,
} from "../../src/game/protocol";
import { ecrireReprise, empreinteDeLaPartie, lireReprise } from "../../src/game/reprise";

const recus: FromWorker[] = [];
let ecoute: ((e: { data: unknown }) => void) | undefined;
const envoyer = (data: unknown) => ecoute?.({ data });
const globaux = globalThis as unknown as Record<string, unknown>;
const avant = { self: globaux.self, postMessage: globaux.postMessage };

function dernier<T extends FromWorker["type"]>(
  type: T,
  depuis = 0,
): Extract<FromWorker, { type: T }> | undefined {
  for (let i = recus.length - 1; i >= depuis; i--) {
    const m = recus[i];
    if (m?.type === type) return m as Extract<FromWorker, { type: T }>;
  }
  return undefined;
}

function station(depuis = 0): StationInfo {
  const m = dernier("ready", depuis);
  if (!m) throw new Error("pas de station");
  return m.station;
}

function instantane(depuis = 0): Snapshot {
  const m = dernier("snapshot", depuis);
  if (!m) throw new Error("pas d'instantané");
  return m.snapshot;
}

interface Sauvegarde {
  save: SaveGame;
  etat?: Uint8Array;
}

/** Ce que fait le fil principal : la sauvegarde passe par le JSON, le bloc par IndexedDB. */
function sauvegarder(): Sauvegarde {
  const n = recus.length;
  envoyer({ type: "requestSave" });
  const m = recus.slice(n).find((r) => r.type === "save");
  if (m?.type !== "save") throw new Error("pas de sauvegarde");
  return {
    save: JSON.parse(JSON.stringify(m.save)) as SaveGame,
    ...(m.etat ? { etat: m.etat.slice() } : {}),
  };
}

/** Reprendre ; rend la station envoyée et vrai si le worker a rejoué. */
function reprendre(save: SaveGame, etat?: Uint8Array): { station: StationInfo; rejoue: boolean } {
  const n = recus.length;
  envoyer(etat ? { type: "resume", save, etat: etat.slice() } : { type: "resume", save });
  return {
    station: station(n),
    rejoue: recus.slice(n).some((r) => r.type === "progress"),
  };
}

function avancer(n: number): void {
  envoyer({ type: "avancerDe", semaines: n, weeksPerSecond: 52, libelle: "" });
  vi.advanceTimersByTime(100 * Math.ceil(n / 5) + 300);
}

/** Le relevé, en tableaux simples : `toEqual` compare alors chaque flottant. */
const enClair = (s: SolALArrivee | undefined) =>
  s && {
    ph: Array.from(s.ph),
    azote: Array.from(s.azote),
    potassium: Array.from(s.potassium),
    humusTHa: s.humusTHa,
    phosphoreMoyenGM2: s.phosphoreMoyenGM2,
  };

let arrivee: SolALArrivee;
let premier: Snapshot;
let quittee: Sauvegarde;

beforeAll(async () => {
  vi.useFakeTimers();
  globaux.self = {
    addEventListener: (_type: string, fn: (e: { data: unknown }) => void) => {
      ecoute = fn;
    },
    postMessage: (m: FromWorker) => recus.push(m),
  };
  globaux.postMessage = (m: FromWorker) => recus.push(m);
  await import("../../src/game/worker");

  envoyer({
    type: "init",
    stationId: FRICHE_LIMON.station.id,
    seed: 5,
    meteo: "synthetique",
    scenario: "ssp245",
    bordures: bordersUniformes("lisiere-forestiere"),
    relief: FRICHE_LIMON.station.relief,
    eau: SANS_EAU,
    nappeCm: FRICHE_LIMON.station.profondeurNappeEquilibreCm ?? 300,
    partBassin: 0,
    // Une année de vieillissement : le relevé doit être celui d'**après**, pas
    // le pH déclaré par la station.
    maturationAns: 1,
    anneeDepart: 2026,
    economie: true,
    faune: false,
  });
  const solRecu = station().solALArrivee;
  if (!solRecu) throw new Error("la station n'emporte pas le sol d'arrivée");
  arrivee = solRecu;
  premier = instantane();
  avancer(10);
  envoyer({
    type: "action",
    action: {
      type: "planter",
      week: 0,
      especeId: "castanea_sativa",
      positions: [
        { x: 12.5, y: 12.5 },
        { x: 16.5, y: 12.5 },
      ],
    },
  });
  avancer(40);
  quittee = sauvegarder();
});

afterAll(() => {
  vi.useRealTimers();
  globaux.self = avant.self;
  globaux.postMessage = avant.postMessage;
});

describe("le sol d'arrivée part avec la station", () => {
  it("c'est le premier instantané, lu de la même façon", () => {
    expect(Array.from(arrivee.ph)).toEqual(Array.from(premier.soilPh));
    expect(Array.from(arrivee.azote)).toEqual(Array.from(premier.soilN));
    expect(Array.from(arrivee.potassium)).toEqual(Array.from(premier.soilPotassiumMgKg));
    expect(arrivee.humusTHa).toBe(premier.inventory.humusTHa);
    // Une parcelle vieillie arrive avec les flux de sa dernière semaine (#505) :
    // le phosphore de l'arrivée est celui que la ligne « Sol » affiche.
    expect(premier.fluxes).toBeDefined();
    expect(arrivee.phosphoreMoyenGM2).toBeCloseTo(premier.fluxes?.phosphoreMoyenGM2 ?? 0, 5);
  });

  it("et c'est celui d'après le vieillissement, pas le pH de la station", () => {
    // Une année de friche a déjà déplacé le pH de quelques cellules : prendre
    // `phInitial` pour repère aurait compté le vieillissement comme une perte du
    // joueur.
    const differentes = Array.from(arrivee.ph).filter(
      (v) => Math.abs(v - FRICHE_LIMON.station.phInitial) > 1e-6,
    );
    expect(differentes.length).toBeGreaterThan(0);
  });

  it("il ne bouge plus de la partie, alors que le sol, lui, bouge", () => {
    const maintenant = instantane();
    expect(maintenant.week).toBe(50);
    expect(Array.from(maintenant.soilN)).not.toEqual(Array.from(arrivee.azote));
    // La station n'est envoyée qu'une fois : la dernière reçue est encore celle
    // de l'arrivée.
    expect(enClair(station().solALArrivee)).toEqual(enClair(arrivee));
  });
});

describe("le sol d'arrivée se garde dans la sauvegarde", () => {
  it("la reprise depuis le bloc le rend au bit près, sans rien rejouer", () => {
    expect(quittee.etat).toBeDefined();
    const { station: reprise, rejoue } = reprendre(quittee.save, quittee.etat);
    expect(rejoue).toBe(false);
    expect(enClair(reprise.solALArrivee)).toEqual(enClair(arrivee));
  });

  it("le rejeu du journal le retrouve, en repassant par l'arrivée", () => {
    const { station: rejouee, rejoue } = reprendre(quittee.save);
    expect(rejoue).toBe(true);
    expect(enClair(rejouee.solALArrivee)).toEqual(enClair(arrivee));
  });

  it("une partie neuve ne garde pas celui de la partie d'avant", () => {
    // Le bloc d'une autre partie est refusé, le rejeu relève le sien.
    const autre = { ...quittee.save, seed: quittee.save.seed + 1 };
    const { station: neuve } = reprendre(autre, quittee.etat);
    expect(neuve.solALArrivee).toBeDefined();
    expect(enClair(neuve.solALArrivee)).not.toEqual(enClair(arrivee));
  });
});

describe("une sauvegarde d'avant le relevé se charge encore", () => {
  /**
   * Le bloc tel que l'écrivait le worker avant #509 : le même conteneur, la
   * même version, sans les sections du sol d'arrivée ni leur entrée d'en-tête.
   */
  function blocDAvant(s: Sauvegarde): Uint8Array {
    if (!s.etat) throw new Error("sauvegarde sans bloc");
    const lu = lireReprise(s.etat, s.save, FRICHE_LIMON.station);
    if (!lu) throw new Error("bloc illisible");
    const { solALArrivee: _oublie, ...annexes } = lu.annexes;
    return ecrireReprise(lu.etat, annexes, empreinteDeLaPartie(s.save, s.save.weeks));
  }

  it("depuis son bloc, sans rejouer, et sans repère", () => {
    const ancien = blocDAvant(quittee);
    expect(lireReprise(ancien, quittee.save, FRICHE_LIMON.station)?.annexes.solALArrivee).toBe(
      undefined,
    );
    const { station: reprise, rejoue } = reprendre(quittee.save, ancien);
    expect(rejoue).toBe(false);
    expect(reprise.solALArrivee).toBeUndefined();
    // La partie, elle, est bien la partie quittée.
    expect(instantane().week).toBe(quittee.save.weeks);
  });

  it("et la sauvegarde suivante part sans repère plutôt qu'avec un faux", () => {
    reprendre(quittee.save, blocDAvant(quittee));
    avancer(1);
    const suivante = sauvegarder();
    if (!suivante.etat) throw new Error("pas de bloc");
    const relu = lireReprise(suivante.etat, suivante.save, FRICHE_LIMON.station);
    expect(relu).toBeDefined();
    expect(relu?.annexes.solALArrivee).toBeUndefined();
  });
});
