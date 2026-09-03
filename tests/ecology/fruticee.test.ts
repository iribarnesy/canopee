/**
 * La strate arbustive (prunellier, aubépine, ronce, sureau), et ce qu'elle
 * change à la succession.
 *
 * L'atlas les classe tous « pionniers » et trois d'entre eux « nurse » : ce
 * sont eux qui prennent une friche en premier, et sous lesquels les arbres
 * passent leurs premières années. Sans eux, le noisetier — arbuste de
 * sous-étage — jouait à lui seul toute la strate basse.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { bordersUniformes, entourageDeLaStation } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const ARBUSTES = ["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus", "sambucus_nigra"];

function friche(paysageId: string, annees: number[]): Map<number, GameState> {
  const base = LIMON_RICHE.station;
  const b = bordersUniformes(paysageId);
  const st = { ...base, coteM: 40, ...entourageDeLaStation(b, base.phInitial, base.ruMm) };
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let state = createGameState(st, rngStateFromSeed(21));
  const etapes = new Map<number, GameState>();
  for (const an of annees) {
    while (state.week < an * 52) state = tick(state, meteo[state.week % 52] as never).state;
    etapes.set(an, state);
  }
  return etapes;
}

function part(state: GameState, ids: readonly string[]): number {
  const vivants = state.trees.filter((t) => t.alive);
  if (vivants.length === 0) return 0;
  return vivants.filter((t) => ids.includes(t.especeId)).length / vivants.length;
}

describe("la fruticée prend la friche, puis se fait dominer", () => {
  const etapes = friche("lisiere-forestiere", [15, 40, 120]);

  it("à quinze ans, la friche est d'abord un fourré", () => {
    const jeune = etapes.get(15);
    if (!jeune) throw new Error("étape manquante");
    expect(part(jeune, ARBUSTES)).toBeGreaterThan(0.4);
  });

  it("à cent vingt ans, les arbres ont pris le dessus et la ronce s'efface", () => {
    const vieux = etapes.get(120);
    const jeune = etapes.get(15);
    if (!vieux || !jeune) throw new Error("étape manquante");
    // La ronce est héliophile et vit quinze ans : sous futaie, elle disparaît.
    expect(part(vieux, ["rubus_fruticosus"])).toBeLessThan(0.3 * part(jeune, ["rubus_fruticosus"]));
    // L'aubépine, elle, vit deux siècles et tient le sous-étage.
    expect(part(vieux, ["crataegus_monogyna"])).toBeGreaterThan(0.05);
  });
});

describe("ce que les épineux apportent", () => {
  it("le gibier les délaisse : c'est ce qui en fait des nurses", () => {
    // Un chevreuil broute d'abord le noisetier et le pommier ; l'épine noire
    // et l'aubépine, il les contourne. C'est sous elles que les semis passent.
    const epineux = ["prunus_spinosa", "crataegus_monogyna"];
    const appetants = ["corylus_avellana", "malus_domestica"];
    for (const e of epineux) {
      for (const a of appetants) {
        expect(getEspece(e).gibier.appetence).toBeLessThan(getEspece(a).gibier.appetence);
      }
    }
  });

  it("le sureau est nitrophile : il demande plus d'azote que les autres arbustes", () => {
    const sureau = getEspece("sambucus_nigra").azote.demandeRelative;
    for (const id of ["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus"]) {
      expect(sureau).toBeGreaterThan(getEspece(id).azote.demandeRelative);
    }
  });

  it("la ronce est la plus rapide de l'atlas — c'est pour ça qu'elle gagne d'abord", () => {
    const ronce = getEspece("rubus_fruticosus").pousseMaxMAn;
    for (const id of ARBUSTES) {
      if (id === "rubus_fruticosus") continue;
      expect(ronce).toBeGreaterThan(getEspece(id).pousseMaxMAn);
    }
  });
});
