/**
 * La strate herbacée (critères B8 et E9, ch4-B, ch7).
 * Ce qu'elle doit produire, et qu'un sol nu ne produisait pas :
 *  - elle colonise d'elle-même un terrain découvert ;
 *  - elle dispute l'eau et l'azote aux jeunes plants — la première cause
 *    d'échec des plantations, d'autant plus forte que le sol est pauvre ;
 *  - la faucher sauve la plantation ;
 *  - elle disparaît sous un couvert fermé.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { couvertureMax } from "../../src/engine/herbe";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

function simuler(
  sc: StationClimat,
  especeId: string,
  actions: GameAction[],
  ans: number,
  stationOverride: Partial<Station> = {},
) {
  const station: Station = { ...sc.station, coteM: 30, voisinage: [], ...stationOverride };
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const weather = serieToWeeks(serie);
  let state = createGameState(station, rngStateFromSeed(3));
  state = plantAt(state, especeId, 15, 15, 0.3);
  let couvertureFinale = 0;
  for (let i = 0; i < ans * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, actions);
    state = r.state;
    couvertureFinale = r.fluxes.herbeCouvertureMean;
  }
  const arbre = state.trees.find((t) => t.id === 1);
  return { hauteur: arbre?.alive ? arbre.heightM : 0, couverture: couvertureFinale };
}

/** Fauche deux fois par an pendant `ans` années, autour du plant. */
function fauches(ans: number): GameAction[] {
  const actions: GameAction[] = [];
  for (let an = 0; an < ans; an++) {
    for (const decalage of [16, 26]) {
      actions.push({ type: "faucher", week: an * 52 + decalage, x: 15, y: 15, rayonM: 2.5 });
    }
  }
  return actions;
}

describe("dynamique du tapis herbacé", () => {
  it("une parcelle ouverte s'enherbe d'elle-même", () => {
    const { couverture } = simuler(LIMON_RICHE, "betula_pendula", [], 3, { herbeInitiale: 0 });
    expect(couverture).toBeGreaterThan(0.5);
  });

  it("sous un couvert fermé, la strate disparaît", () => {
    expect(couvertureMax(0.05, 1)).toBe(0);
    expect(couvertureMax(0.6, 1)).toBeGreaterThan(0.8);
  });

  it("elle recule quand elle manque d'eau (l'herbe grille avant les arbres)", () => {
    expect(couvertureMax(1, 0.2)).toBeLessThan(couvertureMax(1, 1));
  });
});

describe("concurrence herbacée sur les jeunes plants", () => {
  it("faucher fait nettement mieux pousser un plant sur sol pauvre", () => {
    const sans = simuler(LANDE_SECHE, "pinus_sylvestris", [], 12);
    const avec = simuler(LANDE_SECHE, "pinus_sylvestris", fauches(4), 12);
    expect(avec.hauteur).toBeGreaterThan(1.3 * sans.hauteur);
  });

  it("sur sol riche, l'entretien compte beaucoup moins", () => {
    const sans = simuler(LIMON_RICHE, "betula_pendula", [], 12);
    const avec = simuler(LIMON_RICHE, "betula_pendula", fauches(4), 12);
    const gainPauvre = 1.3;
    expect(avec.hauteur / sans.hauteur).toBeLessThan(gainPauvre);
    expect(sans.hauteur).toBeGreaterThan(3);
  });
});
