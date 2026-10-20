/**
 * **Les tirages qui reviennent se font sur le temps qu'il fait** (#348, #397).
 *
 * Sur une parcelle vieillie, le compteur du joueur repart de zéro à son
 * arrivée. Les tirages locaux qui reviennent chaque semaine ou chaque année —
 * la rafale, le chablis de chaque arbre, les boutis de chaque cellule, la
 * glandée de chaque espèce, l'arrondi des oiseaux de passage, la tentative
 * d'installation d'un habitant — se faisaient sur ce compteur : la parcelle
 * rejouait un à un ceux de son vieillissement. Mesuré avant ce lot sur la
 * friche du limon vieillie de cinq ans, 84 % des boutis du joueur retombaient
 * sur une cellule déjà retournée la même semaine du vieillissement.
 *
 * Ils se font maintenant sur la semaine continue que la météo porte
 * (`WeekWeather.semaineContinue`). L'essai passe une semaine au tick avec et
 * sans elle, et relève la semaine que chaque tirage reçoit. La chute d'une
 * chandelle n'en est pas : un arbre ne tombe qu'une fois.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeekWeather } from "../../src/engine/meteo";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** La semaine (ou l'année) reçue par chaque tirage, dans l'ordre des appels. */
const recu: Record<string, number[]> = {};
const noter = (nom: string, valeur: number) => {
  recu[nom] ??= [];
  recu[nom].push(valeur);
};

vi.mock("../../src/engine/tempete", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/engine/tempete")>();
  return {
    ...orig,
    // Une rafale de tempête à chaque fois : c'est elle qui fait tirer le chablis.
    rafaleDeLaSemaine: (...a: Parameters<typeof orig.rafaleDeLaSemaine>) => {
      noter("rafale", a[1]);
      return 45;
    },
    verse: (...a: Parameters<typeof orig.verse>) => {
      noter("chablis", a[2]);
      return orig.verse(...a);
    },
  };
});
vi.mock("../../src/engine/sanglier", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/engine/sanglier")>();
  return {
    ...orig,
    retournee: (...a: Parameters<typeof orig.retournee>) => {
      noter("boutis", a[1]);
      return orig.retournee(...a);
    },
  };
});
vi.mock("../../src/engine/glandee", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/engine/glandee")>();
  return {
    ...orig,
    glandeeRelative: (...a: Parameters<typeof orig.glandeeRelative>) => {
      noter("glandée (année)", a[2]);
      return orig.glandeeRelative(...a);
    },
  };
});
vi.mock("../../src/engine/oiseaux", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/engine/oiseaux")>();
  return {
    ...orig,
    frequentationOiseaux: (...a: Parameters<typeof orig.frequentationOiseaux>) => {
      noter("oiseaux", a[1]);
      return orig.frequentationOiseaux(...a);
    },
  };
});
vi.mock("../../src/engine/faune", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/engine/faune")>();
  return {
    ...orig,
    installations: (...a: Parameters<typeof orig.installations>) => {
      noter("installation (date)", a[2]);
      noter("installation (tirage)", a[7] ?? a[2]);
      return orig.installations(...a);
    },
  };
});

/** La semaine du recrutement (`tick.ts`) : la glandée de l'année s'y décide. */
const RECRUTEMENT = 14;

/**
 * Une parcelle à la semaine 14 de son compte, sangliers, vent et faune
 * allumés. Un grand hêtre, assez haut pour qu'une tempête le prenne, et un
 * semis de hêtre, qu'elle ne prend pas : la glandée de l'espèce se tire tant
 * qu'il en reste un vivant.
 */
function parcelle(): GameState {
  const station = {
    ...LIMON_RICHE.station,
    coteM: 20,
    sanglierParHa: 0.05,
    ventExposition: 1,
    faune: true,
  };
  const grand = plantAt(createGameState(station, rngStateFromSeed(5)), "fagus_sylvatica", 5, 5, 25);
  return { ...plantAt(grand, "fagus_sylvatica", 15, 15, 0.5), week: RECRUTEMENT };
}

const meteo = syntheticYear(LIMON_RICHE.climat)[RECRUTEMENT] as WeekWeather;

beforeEach(() => {
  for (const nom of Object.keys(recu)) delete recu[nom];
});

describe("la semaine des tirages (#397)", () => {
  it("sur une parcelle vieillie de dix ans, chaque tirage lit la semaine continue", () => {
    const continue_ = RECRUTEMENT + 520;
    tick(parcelle(), { ...meteo, semaineContinue: continue_ });
    const semaines = ["rafale", "chablis", "boutis", "oiseaux", "installation (tirage)"];
    for (const nom of semaines) {
      expect(recu[nom]?.length, `${nom} n'a pas été tiré`).toBeGreaterThan(0);
      expect(new Set(recu[nom]), nom).toEqual(new Set([continue_]));
    }
    expect(new Set(recu["glandée (année)"])).toEqual(new Set([10]));
    // L'installation, elle, se date dans le compte du joueur.
    expect(new Set(recu["installation (date)"])).toEqual(new Set([RECRUTEMENT]));
  });

  it("sans vieillissement, les deux comptes sont le même nombre", () => {
    tick(parcelle(), meteo);
    for (const nom of ["rafale", "chablis", "boutis", "oiseaux", "installation (tirage)"]) {
      expect(new Set(recu[nom]), nom).toEqual(new Set([RECRUTEMENT]));
    }
    expect(new Set(recu["glandée (année)"])).toEqual(new Set([0]));
  });
});
