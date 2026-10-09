import { describe, expect, it } from "vitest";
import {
  agreger,
  COTE_MASSE_M,
  TIGES_PLEINES,
  type TigeFourre,
} from "../../src/render/couches/fourre";

let prochain = 1;
const tige = (p: Partial<TigeFourre> = {}): TigeFourre => ({
  id: prochain++,
  especeId: "rubus_fruticosus",
  x: 10,
  y: 10,
  z: 0,
  heightM: 0.8,
  ...p,
});

describe("l'agrégation du fourré", () => {
  it("regroupe les tiges d'un même carreau en UNE masse", () => {
    // Le point : sur la friche de l'an 30, la ronce est l'espèce la plus
    // abondante du peuplement. Une vignette par tige, c'est le budget entier
    // dépensé pour du sous-étage.
    const masses = agreger([tige({ x: 1.1 }), tige({ x: 1.5 }), tige({ x: 1.9 })]);
    expect(masses).toHaveLength(1);
    expect(masses[0]?.tiges).toBe(3);
  });

  it("sépare les carreaux", () => {
    const masses = agreger([tige({ x: 1, y: 1 }), tige({ x: 1 + COTE_MASSE_M * 2, y: 1 })]);
    expect(masses).toHaveLength(2);
  });

  it("sépare les ESPÈCES : un roncier n'est pas une lande à callune", () => {
    const masses = agreger([
      tige({ especeId: "rubus_fruticosus" }),
      tige({ especeId: "calluna_vulgaris" }),
    ]);
    expect(masses).toHaveLength(2);
    expect(new Set(masses.map((m) => m.especeId)).size).toBe(2);
  });

  it("garde la hauteur MOYENNE des tiges", () => {
    const masses = agreger([tige({ heightM: 0.4 }), tige({ heightM: 1.2 })]);
    expect(masses[0]?.hauteurM).toBeCloseTo(0.8, 6);
  });

  it("compte la densité, et la sature", () => {
    // Une tige seule laisse voir le sol, deux sur le même mètre le couvrent —
    // et une troisième ne change rien à l'image.
    expect(agreger([tige(), tige()])[0]?.densite).toBeCloseTo(2 / TIGES_PLEINES, 6);
    const plein = agreger(Array.from({ length: TIGES_PLEINES * 3 }, () => tige()));
    expect(plein[0]?.densite).toBe(1);
  });

  it("place la masse au BARYCENTRE de ses tiges, pas au centre du carreau (#361)", () => {
    // Au centre, une friche qui se ferme se lisait en damier : un roncier par
    // carreau, chacun au milieu du sien.
    const masses = agreger([tige({ x: 3.1, y: 7.2 }), tige({ x: 3.3, y: 7.6 })]);
    expect(masses[0]?.x).toBeCloseTo(3.2, 6);
    expect(masses[0]?.y).toBeCloseTo(7.4, 6);
  });

  it("des tiges éparses ne tombent pas sur une grille (#361)", () => {
    // Des positions continues, comme le moteur les donne : les masses doivent
    // les garder, et non se ranger sur les centres d'un quadrillage.
    let graine = 7;
    const hasard = () => {
      graine = (graine * 16807) % 2147483647;
      return graine / 2147483647;
    };
    const tiges = Array.from({ length: 200 }, () => tige({ x: hasard() * 50, y: hasard() * 50 }));
    const centres = agreger(tiges).filter(
      (m) => Math.abs((m.x % COTE_MASSE_M) - COTE_MASSE_M / 2) < 1e-9,
    );
    expect(centres.length).toBeLessThan(3);
  });

  it("garde les identifiants de ses tiges, pour qu'on puisse la cliquer (#356)", () => {
    const a = tige({ x: 5.2, y: 5.2 });
    const b = tige({ x: 5.6, y: 5.4 });
    const masses = agreger([b, a]);
    expect(masses[0]?.ids).toEqual([a.id, b.id]);
  });

  it("ignore les tiges de hauteur nulle", () => {
    expect(agreger([tige({ heightM: 0 })])).toHaveLength(0);
  });

  it("rend les masses dans l'ordre du peintre", () => {
    const masses = agreger([tige({ x: 40, y: 40 }), tige({ x: 4, y: 4 }), tige({ x: 20, y: 20 })]);
    for (let i = 1; i < masses.length; i++) {
      const a = masses[i - 1];
      const b = masses[i];
      if (!a || !b) continue;
      expect(a.x + a.y).toBeLessThanOrEqual(b.x + b.y);
    }
  });

  it("est déterministe", () => {
    const tiges = Array.from({ length: 50 }, (_, i) =>
      tige({ x: (i % 7) * 3, y: Math.floor(i / 7) * 3, heightM: 0.3 + i * 0.02 }),
    );
    expect(agreger(tiges)).toEqual(agreger(tiges));
  });

  it("n'invente ni ne perd aucune tige", () => {
    const tiges = Array.from({ length: 137 }, (_, i) =>
      tige({ x: (i % 11) * 2.5, y: Math.floor(i / 11) * 2.5 }),
    );
    const total = agreger(tiges).reduce((n, m) => n + m.tiges, 0);
    expect(total).toBe(tiges.length);
  });

  it("rend un tableau vide sans tige", () => {
    expect(agreger([])).toHaveLength(0);
  });
});
