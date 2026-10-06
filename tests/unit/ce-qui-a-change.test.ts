/**
 * **Ce qui a changé, à la demande** : l'historique se souvient de ce que chaque
 * instantané a changé, et la fenêtre choisie dit ce qu'on montre.
 */

import { describe, expect, it } from "vitest";
import {
  type Changements,
  changesDans,
  MEMOIRE_SEMAINES,
  retenir,
} from "../../src/game/ceQuiAChange";

const ids = (...n: number[]) => new Set(n);

describe("l'historique", () => {
  it("se souvient de chaque instantané à sa semaine", () => {
    let h: Changements[] = [];
    h = retenir(h, 10, ids(1));
    h = retenir(h, 11, ids(2));
    expect(h.map((c) => c.semaine)).toEqual([10, 11]);
  });

  it("deux instantanés de la même semaine se réunissent (une action en pause)", () => {
    let h = retenir([], 10, ids(1));
    h = retenir(h, 10, ids(2));
    expect(h).toHaveLength(1);
    expect([...(h[0]?.ids ?? [])].sort()).toEqual([1, 2]);
  });

  it("revenir en arrière efface l'avenir", () => {
    let h = retenir([], 10, ids(1));
    h = retenir(h, 20, ids(2));
    h = retenir(h, 12, ids(3));
    expect(h.map((c) => c.semaine)).toEqual([10, 12]);
  });

  it("oublie ce qui dépasse la plus longue fenêtre", () => {
    let h = retenir([], 1, ids(1));
    h = retenir(h, 1 + MEMOIRE_SEMAINES, ids(2));
    expect(h.map((c) => c.semaine)).toEqual([1 + MEMOIRE_SEMAINES]);
  });
});

describe("la fenêtre", () => {
  let h: Changements[] = [];
  for (let s = 1; s <= 60; s++) h = retenir(h, s, ids(s));

  it("cette semaine : le dernier instantané seul", () => {
    expect([...changesDans(h, 60, "semaine")]).toEqual([60]);
  });

  it("ce mois-ci : les quatre ou cinq dernières semaines", () => {
    expect([...changesDans(h, 60, "mois")].sort((a, b) => a - b)).toEqual([56, 57, 58, 59, 60]);
  });

  it("cette année : les cinquante-deux dernières", () => {
    expect(changesDans(h, 60, "an").size).toBe(52);
  });

  it("un saut d'un an tient dans un seul instantané, et la fenêtre de l'an le garde", () => {
    const saut = retenir([], 52, ids(7, 8, 9));
    expect(changesDans(saut, 52, "an")).toEqual(ids(7, 8, 9));
    // Mais pas la fenêtre de la semaine d'après, sans rien de neuf.
    expect(changesDans(retenir(saut, 53, ids()), 53, "semaine").size).toBe(0);
  });
});
