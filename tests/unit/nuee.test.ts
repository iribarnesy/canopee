/**
 * **La nuée ne danse que là où le moteur a une pullulation, et quand il fait
 * assez chaud pour qu'elle vole** (#129).
 */

import { describe, expect, it } from "vitest";
import { facteurChaleur, T_BASE_RAVAGEUR } from "../../src/engine/ravageurs";
import {
  BLOC_DE_LA_NUEE_M,
  essaimsDeLaNuee,
  MAX_ESSAIMS,
  POINTS_PAR_ESSAIM,
  pointsDeLaNuee,
  SEUIL_DE_LA_NUEE,
} from "../../src/render/faune/nuee";

const COTE = 100;

function grille(valeur: (x: number, y: number) => number): Float32Array {
  const g = new Float32Array(COTE * COTE);
  for (let i = 0; i < g.length; i++) g[i] = valeur(i % COTE, Math.floor(i / COTE));
  return g;
}

/** Une tache de 10 m à la pression donnée, dans un coin. */
const tache = (p: number) => grille((x, y) => (x >= 10 && x < 20 && y >= 10 && y < 20 ? p : 0.05));

describe("où", () => {
  it("rien sous le seuil : une partie ordinaire n'a pas de nuée", () => {
    expect(
      essaimsDeLaNuee(
        grille(() => SEUIL_DE_LA_NUEE * 0.9),
        COTE,
        22,
      ),
    ).toEqual([]);
  });

  it("les essaims tombent sur la tache, et nulle part ailleurs", () => {
    const e = essaimsDeLaNuee(tache(0.6), COTE, 22);
    expect(e.length).toBeGreaterThan(0);
    for (const s of e) {
      expect(s.x).toBeGreaterThanOrEqual(10);
      expect(s.x).toBeLessThanOrEqual(20);
      expect(s.y).toBeGreaterThanOrEqual(10);
      expect(s.y).toBeLessThanOrEqual(20);
    }
  });

  it("une pullulation plus forte fait une nuée plus dense", () => {
    const faible = essaimsDeLaNuee(tache(0.3), COTE, 22);
    const forte = essaimsDeLaNuee(tache(0.9), COTE, 22);
    const total = (e: typeof faible) => e.reduce((n, s) => n + s.points, 0);
    expect(total(forte)).toBeGreaterThan(total(faible));
  });

  it("jamais plus d'essaims que le plafond, les plus denses d'abord", () => {
    const partout = grille((x) => 0.3 + (x / COTE) * 0.6);
    const e = essaimsDeLaNuee(partout, COTE, 22);
    expect(e).toHaveLength(Math.min(MAX_ESSAIMS, (COTE / BLOC_DE_LA_NUEE_M) ** 2));
    for (let i = 1; i < e.length; i++) {
      expect((e[i - 1]?.pression ?? 0) >= (e[i]?.pression ?? 0)).toBe(true);
    }
    expect(Math.max(...e.map((s) => s.points))).toBeLessThanOrEqual(POINTS_PAR_ESSAIM);
  });
});

describe("quand", () => {
  it("sous la température de base du moteur, la nuée se pose", () => {
    expect(facteurChaleur(T_BASE_RAVAGEUR - 1)).toBe(0);
    expect(essaimsDeLaNuee(tache(0.9), COTE, T_BASE_RAVAGEUR - 1)).toEqual([]);
  });

  it("elle s'étoffe avec la chaleur, comme la croissance du moteur", () => {
    const tiede = essaimsDeLaNuee(tache(0.9), COTE, T_BASE_RAVAGEUR + 3);
    const chaud = essaimsDeLaNuee(tache(0.9), COTE, T_BASE_RAVAGEUR + 14);
    const total = (e: typeof tiede) => e.reduce((n, s) => n + s.points, 0);
    expect(total(chaud)).toBeGreaterThan(total(tiede));
  });
});

describe("la danse", () => {
  it("les points restent autour de leur essaim", () => {
    const e = essaimsDeLaNuee(tache(0.8), COTE, 22);
    for (let t = 0; t < 30_000; t += 700) {
      const points = pointsDeLaNuee(e, t);
      expect(points.length).toBe(e.reduce((n, s) => n + s.points, 0));
      for (const p of points) {
        const plusProche = Math.min(...e.map((s) => Math.hypot(p.x - s.x, p.y - s.y)));
        // Au plus 2,4 m sur chaque axe, donc 2,4 × √2 en diagonale.
        expect(plusProche).toBeLessThan(2.4 * Math.SQRT2 + 1e-9);
        expect(p.hauteurM).toBeGreaterThan(0);
      }
    }
  });

  it("aucune grille, aucun point", () => {
    expect(essaimsDeLaNuee(undefined, COTE, 22)).toEqual([]);
    expect(pointsDeLaNuee([], 1000)).toEqual([]);
  });
});
