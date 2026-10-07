/**
 * **Ce qu'on pose avant de quitter est là quand on revient** (recette v0.4).
 *
 * Le geste le plus ordinaire d'une partie : mettre en pause, planter, quitter.
 * `quit` demande une sauvegarde, prise **semaine ouverte** ; les plants sont
 * dans l'état et dans le journal, datés de la semaine courante. La reprise
 * rejouait le journal jusqu'à l'ouverture de cette semaine, et pas au-delà —
 * `advanceWeek` n'applique les actions d'une semaine qu'en la fermant. Mesuré
 * avant correction : deux pommiers en semaine 6, **zéro** après la reprise, et
 * deux de nouveau à la reprise suivante, puisque le journal les gardait.
 *
 * L'essai passe par le **worker lui-même**, avec les messages que l'interface
 * envoie : c'est son rejeu qui était en faute, et aucun essai du moteur ne
 * pouvait le voir.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SANS_EAU } from "../../src/engine/eau_surface";
import { bordersUniformes } from "../../src/engine/paysage";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { FromWorker, SaveGame, Snapshot } from "../../src/game/protocol";

type Recu = FromWorker;
const recus: Recu[] = [];
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

function sauvegarder(): SaveGame {
  const n = recus.length;
  envoyer({ type: "requestSave" });
  const m = recus.slice(n).find((r) => r.type === "save");
  if (m?.type !== "save") throw new Error("pas de sauvegarde");
  // Ce que fait le fil principal : la sauvegarde passe par localStorage, en JSON.
  return JSON.parse(JSON.stringify(m.save)) as SaveGame;
}

/** Avancer de `n` semaines comme le bouton « +1 mois » : par l'horloge du worker. */
function avancer(n: number): void {
  envoyer({ type: "avancerDe", semaines: n, weeksPerSecond: 52, libelle: "" });
  vi.advanceTimersByTime(100 * Math.ceil(n / 5) + 300);
}

/** Ce qui doit être identique entre la partie quittée et la partie reprise. */
const resume = (s: Snapshot) => ({
  week: s.week,
  arbres: s.trees.map((t) => `${t.id}:${t.especeId}:${t.x}:${t.y}:${t.heightM}`),
  tresorerie: s.economy.treasuryEur,
  heures: s.economy.hoursUsedWeek,
});

beforeAll(async () => {
  vi.useFakeTimers();
  globaux.self = {
    addEventListener: (_type: string, fn: (e: { data: unknown }) => void) => {
      ecoute = fn;
    },
    postMessage: (m: Recu) => recus.push(m),
  };
  globaux.postMessage = (m: Recu) => recus.push(m);
  await import("../../src/game/worker");
});

afterAll(() => {
  vi.useRealTimers();
  globaux.self = avant.self;
  globaux.postMessage = avant.postMessage;
});

describe("reprendre une partie sauvegardée semaine ouverte", () => {
  it("rend les gestes posés dans la semaine, une fois et une seule", () => {
    envoyer({
      type: "init",
      stationId: FRICHE_LIMON.station.id,
      seed: 3,
      meteo: "synthetique",
      scenario: "ssp245",
      bordures: bordersUniformes("bocage"),
      relief: FRICHE_LIMON.station.relief,
      eau: SANS_EAU,
      nappeCm: FRICHE_LIMON.station.profondeurNappeEquilibreCm ?? 300,
      partBassin: 0,
      maturationAns: 0,
      anneeDepart: 2026,
      economie: true,
      faune: true,
    });
    envoyer({ type: "autoHarvest", enabled: true });
    avancer(6);
    const ouverte = dernierInstantane().week;
    expect(ouverte).toBe(6);
    const arbresAvant = dernierInstantane().trees.length;

    // En pause : planter deux pommiers, puis quitter.
    envoyer({
      type: "action",
      action: {
        type: "planter",
        week: 0,
        especeId: "malus_domestica",
        positions: [
          { x: 20.5, y: 20.5 },
          { x: 25.5, y: 20.5 },
        ],
        avecManchon: true,
      },
    });
    const quittee = dernierInstantane();
    expect(quittee.trees.length).toBe(arbresAvant + 2);
    const save = sauvegarder();
    expect(save.weeks).toBe(ouverte);

    envoyer({ type: "resume", save });
    const reprise = dernierInstantane();
    expect(resume(reprise)).toEqual(resume(quittee));

    // La partie reprise continue ; sa propre sauvegarde se reprend à l'identique.
    avancer(3);
    const continuee = dernierInstantane();
    expect(continuee.week).toBe(ouverte + 3);
    envoyer({ type: "resume", save: sauvegarder() });
    expect(resume(dernierInstantane())).toEqual(resume(continuee));
    // Et les pommiers n'ont été plantés qu'une fois : un seul geste au journal.
    expect(sauvegarder().actions.filter((a) => a.type === "planter")).toHaveLength(1);
  });
});
