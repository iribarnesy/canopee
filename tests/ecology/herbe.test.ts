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

  it("elle recule quand le sol de surface s'assèche (l'herbe grille la première)", () => {
    expect(couvertureMax(1, 0.1)).toBeLessThan(couvertureMax(1, 1));
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

describe("stabilité du tapis (pas d'oscillation artificielle)", () => {
  it("une zone fauchée rejoint le niveau général et n'y ré-oscille plus", () => {
    const station: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [] };
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(3));
    const actions: GameAction[] = [{ type: "faucher", week: 3 * 52 + 20, x: 10, y: 10, rayonM: 4 }];
    const ecarts: number[] = [];
    for (let i = 0; i < 6 * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, actions).state;
      // Après un an de reprise, la zone fauchée ne doit plus se distinguer.
      if (i > 4 * 52 + 20) {
        const fauchee = state.soil.herbeCouverture[10 * 30 + 10] ?? 0;
        const temoin = state.soil.herbeCouverture[25 * 30 + 25] ?? 0;
        ecarts.push(Math.abs(fauchee - temoin));
      }
    }
    expect(Math.max(...ecarts)).toBeLessThan(0.25);
  });

  it("la couverture ne fait pas le yo-yo d'une semaine sur l'autre", () => {
    // Le tapis ne doit changer de sens qu'au rythme des saisons : il recule en
    // été, repart à l'automne. S'il inverse toutes les deux ou trois semaines,
    // c'est qu'il réagit à sa propre consommation — c'est ce qui se voyait à
    // l'écran sous forme de cercles de fauche clignotants.
    const station: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [] };
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(3));
    const actions: GameAction[] = [{ type: "faucher", week: 3 * 52 + 20, x: 10, y: 10, rayonM: 4 }];
    const fauchee: number[] = [];
    const temoin: number[] = [];
    for (let i = 0; i < 6 * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, actions).state;
      // On observe à partir d'un mois après la fauche : la repousse elle-même
      // est un mouvement légitime.
      if (i > 3 * 52 + 24) {
        fauchee.push(state.soil.herbeCouverture[10 * 30 + 10] ?? 0);
        temoin.push(state.soil.herbeCouverture[25 * 30 + 25] ?? 0);
      }
    }
    /**
     * Inversions de sens VISIBLES : on ignore les variations sous 2 % de
     * couverture (le gibier prélève un peu d'herbe chaque semaine, ce qui
     * dentelle la courbe sans que rien ne se voie à l'écran). Ce qu'on
     * traque, c'est l'alternance ample, celle qui faisait clignoter.
     */
    const inversionsVisibles = (serieCouverture: readonly number[]): number => {
      let n = 0;
      let sens = 0;
      for (let i = 1; i < serieCouverture.length; i++) {
        const delta = (serieCouverture[i] ?? 0) - (serieCouverture[i - 1] ?? 0);
        const sg = Math.sign(delta);
        if (sg !== 0 && sens !== 0 && sg !== sens && Math.abs(delta) > 0.02) n++;
        if (sg !== 0) sens = sg;
      }
      return n;
    };
    // 2,5 ans d'observation, soit une dizaine de saisons : au plus une
    // inversion ample par saison. Sans mémoire hydrique on en comptait 22 et
    // 30 ; avec, 4 et 9 — le rythme des saisons, pas celui des semaines.
    expect(inversionsVisibles(fauchee)).toBeLessThan(14);
    expect(inversionsVisibles(temoin)).toBeLessThan(14);
  });
});
