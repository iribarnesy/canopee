/**
 * Litières et restitutions (docs/regles.md §4.2, ch2-B) : la litière rend
 * l'azote au sol à une vitesse dictée par son C/N, et l'aulne fixateur
 * ENRICHIT réellement son voisinage — l'effet « améliorante » de l'atlas
 * doit émerger.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { litterDecayRate } from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_PAUVRE_N } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

function run(state: GameState, years: number): GameState {
  const weather = syntheticYear(LIMON_PAUVRE_N.climat);
  let s = state;
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return s;
}

/** N total (minéral + litière) d'un disque de cellules, g/m² moyen. */
function meanNAround(state: GameState, cx: number, cy: number, r: number): number {
  const side = state.station.coteM;
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(side - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(side - 1, cx + r); x++) {
      sum += (state.soil.mineralNG[y * side + x] ?? 0) + (state.soil.litterNG[y * side + x] ?? 0);
      n++;
    }
  }
  return sum / n;
}

describe("litières — vitesse selon le C/N (ch2-B)", () => {
  it("la litière d'aulne (C/N 15) se décompose ≥ 3× plus vite que les aiguilles de pin (C/N 60)", () => {
    expect(litterDecayRate(15)).toBeGreaterThan(3 * litterDecayRate(60));
  });
});

describe("l'aulne améliore son sol (fixation → litière → minéral)", () => {
  // Trois aulnes adultes AU NORD du hêtre : leurs ombres partent encore plus
  // au nord (décalage solaire, light.ts), mais leur litière tombe sous leurs
  // couronnes, jusqu'aux racines du hêtre. Témoin : le même hêtre seul.
  const YEARS = 15;
  const AULNES: [number, number][] = [
    [22.75, 26.3],
    [25, 27.6],
    [27.25, 26.3],
  ];

  // Ce test porte sur l'azote apporté par les aulnes : on écarte le gibier,
  // sans quoi c'est lui qu'on mesure (un hêtre isolé est une cible de frottis).
  const station = { ...LIMON_PAUVRE_N.station, gibierParHa: 0 };
  let avecAulnes = createGameState(station, rngStateFromSeed(9));
  avecAulnes = plantAt(avecAulnes, "fagus_sylvatica", 25, 25, 0.5);
  for (const [x, y] of AULNES) {
    avecAulnes = plantAt(avecAulnes, "alnus_glutinosa", x, y, 8);
  }
  const finAvec = run(avecAulnes, YEARS);

  let temoin = createGameState(station, rngStateFromSeed(9));
  temoin = plantAt(temoin, "fagus_sylvatica", 25, 25, 0.5);
  const finTemoin = run(temoin, YEARS);

  it("le sol sous le bosquet d'aulnes est nettement plus riche en N qu'au loin", () => {
    const sousAulnes = meanNAround(finAvec, 25, 27, 3);
    const auLoin = meanNAround(finAvec, 40, 10, 3);
    expect(sousAulnes).toBeGreaterThan(2 * auLoin);
  });

  it("le hêtre pousse mieux entouré d'aulnes que seul (malgré leur ombre)", () => {
    const hetreAvec = finAvec.trees.find((t) => t.id === 1);
    const hetreSeul = finTemoin.trees.find((t) => t.id === 1);
    if (!hetreAvec || !hetreSeul) throw new Error("hêtre manquant");
    expect(hetreAvec.alive).toBe(true);
    expect(hetreSeul.alive).toBe(true);
    expect(hetreAvec.heightM).toBeGreaterThan(hetreSeul.heightM * 1.1);
  });
});
