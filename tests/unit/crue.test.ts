/**
 * **La crue : l'eau qui reste, qui monte, qui court et qui s'en va** (#127,
 * #288).
 *
 * Trois choses à défendre ici, et elles tiennent le module entier.
 *
 * D'abord que la **lame** — l'eau qui reste — vienne de l'événement du moteur
 * (`CrueResult`), et pas du débit `soilDebordementMm`, qui cumule tout l'amont
 * le long d'un talweg. Le débit fait le **courant**, qui ne pose rien.
 *
 * Ensuite que la montée et le retrait suivent l'emprise du moteur d'une semaine
 * à l'autre, sans rien deviner : une cellule que le moteur n'a pas noyée
 * n'apparaît jamais, et un instantané de la même semaine ne fait rien partir.
 *
 * Enfin que chaque onde soit un **passage** : la lame est cuite dans le
 * terrain, et une seconde eau qui resterait à l'écran mettrait la même
 * information sur deux chemins (§2.1). À la fin de l'acte, l'onde est vide.
 */

import { describe, expect, it } from "vitest";
import type { CrueResult } from "../../src/engine/crue";
import { suivreLaCrueALEcran } from "../../src/game/useCrue";
import { DEBORDEMENT_PLEIN_MM, DEBORDEMENT_VISIBLE_MM } from "../../src/render/palette";
import {
  courantDeLaSemaine,
  LAME_DETREMPEE_MM,
  LARGEUR_DU_FRONT,
  lameDeLaCrue,
  monteeDeLaCrue,
  ondeDeLaCrue,
  retraitDeLaCrue,
} from "../../src/render/temps/crue";
import { DUREE_NATURELLE_MS, planAuRythmeNaturel } from "../../src/render/temps/ellipse";

const COTE = 6;
/** Un versant régulier : la première ligne en haut, la dernière en bas. */
const versant = () => Array.from({ length: COTE * COTE }, (_, i) => 10 - Math.floor(i / COTE));
const plat = () => new Array(COTE * COTE).fill(3);

/** Une grille de débordement où seules les cellules nommées sont noyées. */
function debordement(noyees: Record<number, number>): Float32Array {
  const g = new Float32Array(COTE * COTE);
  for (const [i, mm] of Object.entries(noyees)) g[Number(i)] = mm;
  return g;
}

describe("le courant de la semaine : le débit, qui passe", () => {
  it("rien du tout quand aucune cellule ne déborde", () => {
    expect(courantDeLaSemaine(new Float32Array(COTE * COTE), versant())).toBeUndefined();
    expect(courantDeLaSemaine(undefined, versant())).toBeUndefined();
  });

  it("le seuil est celui du terrain, pas un second", () => {
    // Une cellule juste sous le seuil n'est pas dessinée comme mouillée par le
    // terrain : elle ne doit pas l'être ici non plus.
    const sous = courantDeLaSemaine(debordement({ 7: DEBORDEMENT_VISIBLE_MM - 0.1 }), versant());
    const juste = courantDeLaSemaine(debordement({ 7: DEBORDEMENT_VISIBLE_MM }), versant());
    expect(sous).toBeUndefined();
    expect(juste?.cellules).toEqual([7]);
  });

  it("l'eau descend : les cellules sont rangées du haut vers le bas", () => {
    // Trois cellules sur trois lignes différentes du versant.
    const crue = courantDeLaSemaine(debordement({ 30: 60, 6: 60, 18: 60 }), versant());
    expect(crue?.cellules).toEqual([6, 18, 30]);
    expect(crue?.rangs).toEqual([0, 0.5, 1]);
  });

  it("sur un terrain plat, aucune direction n'est inventée", () => {
    // Pas de dénivelé, donc pas de sens : tout monte ensemble, ce qui est ce
    // qu'on voit d'une flaque de plat.
    const crue = courantDeLaSemaine(debordement({ 3: 60, 20: 60, 33: 60 }), plat());
    expect(crue?.rangs).toEqual([0, 0, 0]);
  });

  it("porte la lame de chaque cellule, dans le même ordre", () => {
    const crue = courantDeLaSemaine(debordement({ 30: 12, 6: 80 }), versant());
    expect(crue?.cellules).toEqual([6, 30]);
    expect(crue?.lamesMm).toEqual([80, 12]);
  });
});

describe("l'onde, qui passe et s'en va", () => {
  const crue = courantDeLaSemaine(debordement({ 6: 80, 18: 80, 30: 80 }), versant());

  it("ne montre jamais une cellule que le moteur n'a pas noyée", () => {
    const noyees = new Set(crue?.cellules ?? []);
    for (let t = 0; t <= 1.0001; t += 0.05) {
      for (const c of ondeDeLaCrue(crue, t, 10)) {
        expect(noyees.has(c.cellule), `t=${t.toFixed(2)} cellule ${c.cellule}`).toBe(true);
      }
    }
  });

  it("est vide à la fin de l'acte : la lame cuite reprend la main", () => {
    expect(ondeDeLaCrue(crue, 1, 10)).toEqual([]);
  });

  it("se voit en cours de route", () => {
    expect(ondeDeLaCrue(crue, 0.5, 10).length).toBeGreaterThan(0);
  });

  it("descend le versant : le haut passe avant le bas", () => {
    const quand = (cellule: number) => {
      let max = 0;
      let quandMax = 0;
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const o = ondeDeLaCrue(crue, t, 10).find((c) => c.cellule === cellule)?.opacite ?? 0;
        if (o > max) {
          max = o;
          quandMax = t;
        }
      }
      return quandMax;
    };
    expect(quand(6)).toBeLessThan(quand(18));
    expect(quand(18)).toBeLessThan(quand(30));
  });

  it("un torrent brille plus qu'une flaque", () => {
    // Deux cellules voisines sur la même ligne : même rang, lames opposées.
    const deux = courantDeLaSemaine(
      debordement({ 6: DEBORDEMENT_PLEIN_MM, 7: DEBORDEMENT_VISIBLE_MM }),
      plat(),
    );
    const onde = ondeDeLaCrue(deux, LARGEUR_DU_FRONT / 2, 10);
    const torrent = onde.find((c) => c.cellule === 6)?.opacite ?? 0;
    const flaque = onde.find((c) => c.cellule === 7)?.opacite ?? 0;
    expect(torrent).toBeGreaterThan(flaque);
    expect(flaque).toBeGreaterThan(0);
  });

  it("rien à jouer quand il n'y a pas de crue", () => {
    expect(ondeDeLaCrue(undefined, 0.5, 10)).toEqual([]);
  });
});

/**
 * **La crue prend sa place dans l'ellipse**, comme les autres catastrophes.
 *
 * Elle retient l'horloge (c'est un événement de la semaine, pas de l'ambiance)
 * et elle passe **après** la rafale et **avant** les morts : les causes avant
 * leurs conséquences, ce qui est la règle de l'ordre des actes.
 */
describe("la crue dans le plan d'ellipse", () => {
  const journalVide = {
    morts: [],
    chutes: [],
    gestes: [],
    naissances: [],
    franchissements: [],
  };
  const crue = courantDeLaSemaine(debordement({ 6: 80, 18: 80, 30: 80 }), versant());

  it("donne un acte quand la semaine a noyé quelque chose", () => {
    const plan = planAuRythmeNaturel([{ ...journalVide, crues: crue ? [crue] : [] }]);
    expect(plan.actes.map((a) => a.sujet.quoi)).toEqual(["crue"]);
    expect(plan.actes[0]?.bloquant).toBe(true);
    expect(plan.actes[0]?.dureeMs).toBe(DUREE_NATURELLE_MS.crue);
  });

  it("n'en donne aucun quand la semaine est sèche", () => {
    expect(planAuRythmeNaturel([journalVide]).actes).toEqual([]);
  });

  it("passe après la tempête et avant les morts", () => {
    const plan = planAuRythmeNaturel([
      {
        ...journalVide,
        crues: crue ? [crue] : [],
        morts: [
          { id: 1, especeId: "alnus_glutinosa", x: 1, y: 1, heightM: 4, cause: "engorgement" },
        ],
        tempete: {
          rafaleMs: 33,
          versRad: 0,
          victimes: [],
          arbresCasses: 0,
          arbresEbranches: 0,
          arbresVerses: 0,
          volumeM3: 0,
        },
      },
    ]);
    expect(plan.actes.map((a) => a.sujet.quoi)).toEqual(["tempete", "crue", "mort"]);
  });

  it("une crue par semaine noyée, jamais fusionnées", () => {
    // Deux semaines de crue ne noient pas les mêmes cellules : les confondre
    // ferait courir l'onde de l'une sur l'emprise de l'autre.
    const autre = courantDeLaSemaine(debordement({ 7: 40 }), versant());
    const plan = planAuRythmeNaturel([
      { ...journalVide, crues: crue ? [crue] : [] },
      { ...journalVide, crues: autre ? [autre] : [] },
    ]);
    expect(plan.actes.filter((a) => a.sujet.quoi === "crue")).toHaveLength(2);
  });
});

/** Une semaine de crue telle que le moteur l'émet. */
function semaineDeCrue(
  id: number,
  semaine: number,
  cellules: number[],
  rangs: number[],
  lames: number[] = cellules.map(() => 30),
): CrueResult {
  return {
    id,
    semaine,
    phase: "montée",
    monteeM: 0,
    cellules: Int32Array.from(cellules),
    rangs: Int32Array.from(rangs),
    lamesMm: Float32Array.from(lames),
    victimes: [],
    emprisePic: cellules.length,
  };
}

describe("la lame : l'eau qui reste, celle du moteur", () => {
  it("se pose sur l'emprise de la crue, et nulle part ailleurs", () => {
    const lame = lameDeLaCrue(semaineDeCrue(10, 0, [3, 9], [0, 0], [80, 0]), COTE * COTE);
    expect(lame?.[3]).toBe(80);
    // Une lame nulle sur l'emprise est un sol détrempé : il brille un peu.
    expect(lame?.[9]).toBe(LAME_DETREMPEE_MM);
    expect([...(lame ?? [])].filter((v) => v > 0)).toHaveLength(2);
  });

  it("pas de crue, pas de lame — quel que soit le débit", () => {
    expect(lameDeLaCrue(undefined, 36)).toBeUndefined();
  });
});

describe("la montée : les cellules gagnées cette semaine, dans l'ordre du moteur", () => {
  it("ne rejoue pas l'arrivée des cellules déjà tenues", () => {
    const m = monteeDeLaCrue(semaineDeCrue(10, 2, [4, 5, 6, 7], [0, 1, 2, 2]));
    expect(m?.sens).toBe("monte");
    expect(m?.cellules).toEqual([6, 7]);
    expect(m?.rangs).toEqual([0, 1]);
  });

  it("rien quand l'emprise ne grandit pas", () => {
    expect(monteeDeLaCrue(semaineDeCrue(10, 3, [4, 5], [0, 1]))).toBeUndefined();
  });
});

describe("le retrait : l'eau s'en va, et ne laisse rien", () => {
  const retrait = retraitDeLaCrue([30, 6, 18], versant());

  it("va du haut vers le bas", () => {
    expect(retrait?.sens).toBe("retire");
    expect(retrait?.cellules).toEqual([6, 18, 30]);
  });

  it("toutes les cellules sont mouillées au début, et sèches à la fin", () => {
    expect(ondeDeLaCrue(retrait, 0, 10)).toHaveLength(3);
    expect(ondeDeLaCrue(retrait, 1, 10)).toEqual([]);
  });

  it("le haut sèche avant le bas", () => {
    const aMi = ondeDeLaCrue(retrait, 0.6, 10);
    const o = (c: number) => aMi.find((v) => v.cellule === c)?.opacite ?? 0;
    expect(o(6)).toBeLessThan(o(30));
  });
});

describe("la crue suivie d'un instantané à l'autre", () => {
  const alt = versant();
  const n = COTE * COTE;

  it("l'emprise de la dernière semaine simulée fait la lame", () => {
    const suite = suivreLaCrueALEcran(
      undefined,
      12,
      [semaineDeCrue(10, 0, [30], [0]), semaineDeCrue(10, 1, [30, 24], [0, 1])],
      n,
      alt,
    );
    expect(suite?.ecran.lameMm?.[24]).toBeGreaterThan(0);
    expect(suite?.ecran.partNoyee).toBeCloseTo(2 / n, 10);
    // Deux montées, une par semaine : 30 puis 24.
    expect(suite?.ecran.actes.map((a) => [a.sens, a.cellules])).toEqual([
      ["monte", [30]],
      ["monte", [24]],
    ]);
  });

  it("un instantané de la même semaine ne dit rien de neuf : l'eau reste", () => {
    const avant = { semaine: 12, emprise: new Set([30, 24]) };
    expect(suivreLaCrueALEcran(avant, 12, [], n, alt)).toBeUndefined();
  });

  it("quand des semaines passent sans la crue, tout ce qu'elle tenait se retire", () => {
    const avant = { semaine: 12, emprise: new Set([30, 24]) };
    const suite = suivreLaCrueALEcran(avant, 13, [], n, alt);
    expect(suite?.ecran.lameMm).toBeUndefined();
    expect(suite?.ecran.partNoyee).toBe(0);
    expect(suite?.ecran.actes.map((a) => a.sens)).toEqual(["retire"]);
    expect([...(suite?.ecran.actes[0]?.cellules ?? [])].sort()).toEqual([24, 30]);
  });

  it("une emprise qui rétrécit fait partir ce qu'elle quitte, et cela seul", () => {
    const avant = { semaine: 12, emprise: new Set([30, 24, 18]) };
    const suite = suivreLaCrueALEcran(avant, 13, [semaineDeCrue(10, 2, [30], [0])], n, alt);
    expect(suite?.ecran.actes.map((a) => [a.sens, [...a.cellules].sort()])).toEqual([
      ["retire", [18, 24]],
    ]);
    expect(suite?.ecran.lameMm?.[30]).toBeGreaterThan(0);
    expect(suite?.ecran.lameMm?.[24]).toBe(0);
  });
});
