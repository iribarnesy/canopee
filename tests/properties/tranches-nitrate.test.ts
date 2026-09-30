/**
 * Le nitrate descend en front (#247, `tranches.ts`).
 *
 * Deux ancres du dehors, et la plomberie qui les tient :
 *
 *  - **l'abaque COMIFER/LIXIM** : pour 100 mm de lame drainante sur un limon
 *    profond, la part d'un nitrate perdue sous 90 cm selon l'horizon où il se
 *    trouve au départ — 4,2 % (0-30), 23,7 % (30-60), 82,2 % (60-90). Les deux
 *    cellules de mélange d'avant rendaient 29,9 / 51,7 / 56,1 ;
 *  - **Burns (1975)** : le centre de masse d'un nitrate descend de P/θ, avec θ
 *    l'eau **totale** à la capacité au champ — validé contre des déplacements
 *    mesurés.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { type Horizon, ruHorizonMm } from "../../src/engine/soil";
import { createGameState } from "../../src/engine/state";
import { LIMON_RICHE, STATIONS_V0 } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  cascadeNitrate,
  eauFletrissementMmParCm,
  geometrieTranches,
  reconcilierTranches,
} from "../../src/engine/tranches";

/** Le limon riche ramené à 90 cm, la profondeur de l'abaque : 30 + 60. */
const [H0, H1] = LIMON_RICHE.station.profil as readonly Horizon[];
if (!H0 || !H1) throw new Error("profil du limon riche incomplet");
const LIMON_90: Horizon[] = [
  { ...H0, epaisseurCm: 30 },
  { ...H1, epaisseurCm: 60 },
];

/** Eau totale d'une tranche à la capacité au champ : flétrissement + réserve utile. */
function eauACapacite(profil: readonly Horizon[]) {
  const g = geometrieTranches(profil);
  const eau = g.epaisseurCm.map((e, k) => {
    const h = profil[g.horizon[k] ?? 0] as Horizon;
    return e * eauFletrissementMmParCm(h) + (ruHorizonMm(h) * e) / h.epaisseurCm;
  });
  return { g, eau };
}

/** Part d'un nitrate posé uniformément entre a et b cm qui sort sous le profil. */
function perte(a: number, b: number, lameMm: number, pas: number): number {
  const { g, eau } = eauACapacite(LIMON_90);
  const t = new Float64Array(g.n);
  let z = 0;
  for (let k = 0; k < g.n; k++) {
    const milieu = z + (g.epaisseurCm[k] ?? 0) / 2;
    if (milieu >= a && milieu < b) t[k] = 1;
    z += g.epaisseurCm[k] ?? 0;
  }
  const total = t.reduce((s, v) => s + v, 0);
  for (let k = 0; k < g.n; k++) t[k] = (t[k] ?? 0) / total;
  let sorti = 0;
  const flux = new Array<number>(g.n).fill(lameMm / pas);
  for (let s = 0; s < pas; s++) sorti += cascadeNitrate(t, 0, g.n, g.nSurface, eau, flux).sortiG;
  return sorti;
}

describe("la cascade de tranches contre l'abaque COMIFER/LIXIM", () => {
  it("la profondeur n'abrite pas, elle expose : 4,2 / 23,7 / 82,2 %", () => {
    // Treize pas : la lame d'un hiver, semaine après semaine.
    const haut = perte(0, 30, 100, 13);
    const milieu = perte(30, 60, 100, 13);
    const bas = perte(60, 90, 100, 13);
    // Relevé : 4,3 / 30,6 / 82,9. Les deux cellules d'avant : 29,9 / 51,7 / 56,1.
    expect(haut).toBeGreaterThan(0.02);
    expect(haut).toBeLessThan(0.08);
    expect(bas).toBeGreaterThan(0.75);
    expect(bas).toBeLessThan(0.9);
    // L'horizon du milieu est le moins bien tenu (+7 points), et c'est dit : une
    // épaisseur de tranche calée sur quatre valeurs ne règle pas tout.
    expect(milieu).toBeGreaterThan(0.18);
    expect(milieu).toBeLessThan(0.35);
    // Et l'écart quadratique aux trois chiffres est six à sept fois plus petit
    // qu'avec les deux cellules (46 points).
    const ecart = Math.hypot(haut - 0.042, milieu - 0.237, bas - 0.822);
    expect(ecart).toBeLessThan(0.1);
  });

  it("le pas de temps ne décide pas : une lame en 13 ou en 52 pas donne le même front", () => {
    // Les sous-pas (`IMPULSION_MAX_PART_EAU`) découpent ce qu'une semaine trop
    // grosse étalerait d'un artefact numérique.
    for (const [a, b] of [
      [0, 30],
      [30, 60],
      [60, 90],
    ] as const) {
      expect(Math.abs(perte(a, b, 100, 13) - perte(a, b, 100, 52))).toBeLessThan(0.01);
    }
  });
});

describe("Burns (1975) : le front descend de P / θ, θ l'eau totale", () => {
  it("un nitrate de surface a descendu de la lame divisée par l'eau totale", () => {
    // Un profil homogène et épais, pour que rien ne sorte : on lit le centre de
    // masse. Le lecteur d'avant diluait dans la réserve utile, soit 1,9 fois
    // moins d'eau qu'un limon n'en porte à la capacité au champ.
    const profil: Horizon[] = [
      { ...H0, epaisseurCm: 20 },
      { ...H1, epaisseurCm: 280 },
    ];
    const { g, eau } = eauACapacite(profil);
    const t = new Float64Array(g.n);
    t[0] = 1;
    const lame = 120;
    const flux = new Array<number>(g.n).fill(lame / 60);
    for (let s = 0; s < 60; s++) cascadeNitrate(t, 0, g.n, g.nSurface, eau, flux);
    let z = 0;
    let centre = 0;
    let depart = 0;
    for (let k = 0; k < g.n; k++) {
      const e = g.epaisseurCm[k] ?? 0;
      if (k === 0) depart = e / 2;
      centre += (t[k] ?? 0) * (z + e / 2);
      z += e;
    }
    const theta = (eau[3] ?? 0) / (g.epaisseurCm[3] ?? 1);
    // Dans une cascade, le déplacement moyen vaut la lame sur l'eau par
    // centimètre, quelle que soit l'épaisseur des cellules.
    expect(centre - depart).toBeGreaterThan(0.9 * (lame / theta));
    expect(centre - depart).toBeLessThan(1.1 * (lame / theta));
  });
});

describe("la plomberie se referme", () => {
  it("ce qui sort d'une tranche entre dans la suivante, la dernière rend le reste", () => {
    const { g, eau } = eauACapacite(LIMON_90);
    const t = new Float64Array(g.n).map((_, k) => 0.3 + 0.1 * k);
    const avant = t.reduce((s, v) => s + v, 0);
    const { sortiG, descenduG } = cascadeNitrate(
      t,
      0,
      g.n,
      g.nSurface,
      eau,
      new Array<number>(g.n).fill(37),
    );
    const apres = t.reduce((s, v) => s + v, 0);
    expect(apres + sortiG).toBeCloseTo(avant, 12);
    expect(descenduG).toBeGreaterThan(0);
    for (const v of t) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("une baisse garde la forme du profil, une hausse se range au prorata de l'épaisseur", () => {
    const t = new Float64Array([4, 2, 2]);
    reconcilierTranches(t, 0, 3, [10, 10, 20], 0, 4);
    expect([...t]).toEqual([2, 1, 1]);
    reconcilierTranches(t, 0, 3, [10, 10, 20], 0, 8);
    expect(t[0]).toBeCloseTo(3, 12);
    expect(t[1]).toBeCloseTo(2, 12);
    expect(t[2]).toBeCloseTo(3, 12);
  });

  it("dans la partie, le sous-sol est exactement la somme de ses tranches, et aucune n'est négative", () => {
    for (const sc of STATIONS_V0) {
      const w = syntheticYear(sc.climat);
      let s = createGameState(
        { ...sc.station, coteM: 12, gibierParHa: 0, voisinage: [] },
        rngStateFromSeed(3),
      );
      const g = geometrieTranches(sc.station.profil);
      for (let k = 0; k < 3 * 52; k++) {
        const semaine = w[k % w.length];
        if (!semaine) throw new Error("météo manquante");
        s = tick(s, semaine).state;
      }
      const n = s.soil.mineralNG.length;
      for (let i = 0; i < n; i++) {
        let profond = 0;
        for (let k = 0; k < g.n; k++) {
          const v = s.soil.nitrateTranchesG[i * g.n + k] ?? 0;
          expect(v, sc.station.id).toBeGreaterThanOrEqual(0);
          if (k >= g.nSurface) profond += v;
        }
        if (g.n > g.nSurface) {
          expect(profond, sc.station.id).toBeCloseTo(s.soil.mineralNProfondG[i] ?? 0, 9);
        }
      }
    }
  }, 300_000);
});
