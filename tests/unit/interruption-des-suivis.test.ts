/**
 * **Une mort suivie coupe « +1 an », et l'année va quand même à son terme**
 * (#359, premier test humain de la v0.4).
 *
 * Le joueur suivait des arbres et demandait un an : la première mort arrêtait le
 * temps en juin, l'avis n'offrait que « revoir », et choisir une vitesse annulait
 * la traversée. Il ne pouvait pas non plus dire « ça m'est égal ».
 *
 * L'essai passe par le **worker**, avec les messages de l'interface : c'est lui
 * qui s'arrête, et lui seul sait si une traversée est en cours.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SANS_EAU } from "../../src/engine/eau_surface";
import { bordersUniformes } from "../../src/engine/paysage";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { FromWorker, SaveGame, Snapshot } from "../../src/game/protocol";

const recus: FromWorker[] = [];
let ecoute: ((e: { data: unknown }) => void) | undefined;
const envoyer = (data: unknown) => ecoute?.({ data });
const globaux = globalThis as unknown as Record<string, unknown>;
const avant = { self: globaux.self, postMessage: globaux.postMessage };

function dernierInstantane(): Snapshot {
  for (let i = recus.length - 1; i >= 0; i--) {
    const m = recus[i];
    if (m?.type === "snapshot") return m.snapshot;
  }
  throw new Error("aucun instantané");
}

/** Laisse tourner l'horloge du worker jusqu'à la prochaine pause, et la rend. */
function jusquALaPause(): Extract<FromWorker, { type: "autopause" }> {
  const n = recus.length;
  for (let k = 0; k < 400; k++) {
    vi.advanceTimersByTime(100);
    const p = recus.slice(n).find((r) => r.type === "autopause");
    if (p?.type === "autopause") return p;
  }
  throw new Error("le temps ne s'est jamais arrêté");
}

function partieNeuve(): void {
  envoyer({
    type: "init",
    stationId: FRICHE_LIMON.station.id,
    seed: 5,
    meteo: "synthetique",
    scenario: "ssp245",
    bordures: bordersUniformes("bocage"),
    relief: FRICHE_LIMON.station.relief,
    eau: SANS_EAU,
    nappeCm: FRICHE_LIMON.station.profondeurNappeEquilibreCm ?? 300,
    partBassin: 0,
    // Une friche de huit ans : assez serrée pour qu'un arbre suivi meure dans
    // l'année (à trois ans, aucun des 174 ne mourait avec cette graine).
    maturationAns: 8,
    anneeDepart: 2026,
    economie: false,
    faune: false,
  });
  envoyer({ type: "suivre", ids: dernierInstantane().trees.map((t) => t.id) });
}

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
});

afterAll(() => {
  vi.useRealTimers();
  globaux.self = avant.self;
  globaux.postMessage = avant.postMessage;
});

describe("la mort d'un arbre suivi pendant « +1 an »", () => {
  it("arrête le temps en route, et « continuer » mène l'année à son terme", () => {
    partieNeuve();
    const depart = dernierInstantane().week;
    envoyer({ type: "avancerDe", semaines: 52, weeksPerSecond: 13, libelle: "un an plus tard" });

    const premiere = jusquALaPause();
    expect(premiere.motif).toBe("mortSuivie");
    expect(premiere.enRoute).toBe(true);
    expect(dernierInstantane().week).toBeLessThan(depart + 52);

    // « Continuer » autant de fois qu'il le faut : chaque pause en route se
    // reprend, et la dernière est l'arrivée, à la semaine demandée.
    let pause = premiere;
    let reprises = 0;
    while (pause.enRoute && reprises < 60) {
      envoyer({ type: "continuer" });
      pause = jusquALaPause();
      reprises++;
    }
    expect(pause.reason).toBe("un an plus tard");
    expect(pause.enRoute).toBeUndefined();
    expect(dernierInstantane().week).toBe(depart + 52);
  });

  it("ne s'arrête plus quand le joueur l'a refusé, et la sauvegarde s'en souvient", () => {
    partieNeuve();
    expect(recus.filter((r) => r.type === "arretSurLesMorts").at(-1)).toEqual({
      type: "arretSurLesMorts",
      oui: true,
    });
    envoyer({ type: "arretSurLesMorts", oui: false });
    const depart = dernierInstantane().week;
    envoyer({ type: "avancerDe", semaines: 52, weeksPerSecond: 13, libelle: "un an plus tard" });

    const pause = jusquALaPause();
    expect(pause.motif).toBeUndefined();
    expect(dernierInstantane().week).toBe(depart + 52);

    const n = recus.length;
    envoyer({ type: "requestSave" });
    const m = recus.slice(n).find((r) => r.type === "save");
    if (m?.type !== "save") throw new Error("pas de sauvegarde");
    const save = JSON.parse(JSON.stringify(m.save)) as SaveGame;
    expect(save.sansArretSurLesMorts).toBe(true);

    // Une partie neuve repart du réglage par défaut : c'est un choix de partie.
    partieNeuve();
    expect(recus.filter((r) => r.type === "arretSurLesMorts").at(-1)).toEqual({
      type: "arretSurLesMorts",
      oui: true,
    });
  });
});
