/**
 * **La crue passe, et elle ne laisse rien derrière elle** (#127).
 *
 * Deux choses à défendre ici, et elles tiennent le module entier.
 *
 * D'abord que le rendu ne fabrique pas d'événement : il n'y a pas de
 * `CrueResult` dans le moteur, et ce qu'on joue est la grandeur **de la
 * semaine** — `debordementParCellule`, dont le moteur dit qu'elle est « la
 * seule base honnête pour une crue ». Une cellule que le moteur ne noie pas ne
 * doit donc jamais apparaître, et le seuil de « noyée » doit rester celui du
 * terrain.
 *
 * Ensuite que l'onde soit un **passage** : la lame d'eau est déjà cuite dans le
 * terrain, et une seconde eau qui resterait à l'écran mettrait la même
 * information sur deux chemins (§2.1). À la fin de l'acte, l'onde est vide.
 */

import { describe, expect, it } from "vitest";
import { DEBORDEMENT_PLEIN_MM, DEBORDEMENT_VISIBLE_MM } from "../../src/render/palette";
import { crueDeLaSemaine, LARGEUR_DU_FRONT, ondeDeLaCrue } from "../../src/render/temps/crue";
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

describe("ce que la crue de la semaine retient", () => {
  it("rien du tout quand aucune cellule ne déborde", () => {
    expect(crueDeLaSemaine(new Float32Array(COTE * COTE), versant())).toBeUndefined();
    expect(crueDeLaSemaine(undefined, versant())).toBeUndefined();
  });

  it("le seuil est celui du terrain, pas un second", () => {
    // Une cellule juste sous le seuil n'est pas dessinée comme mouillée par le
    // terrain : elle ne doit pas l'être ici non plus.
    const sous = crueDeLaSemaine(debordement({ 7: DEBORDEMENT_VISIBLE_MM - 0.1 }), versant());
    const juste = crueDeLaSemaine(debordement({ 7: DEBORDEMENT_VISIBLE_MM }), versant());
    expect(sous).toBeUndefined();
    expect(juste?.cellules).toEqual([7]);
  });

  it("l'eau descend : les cellules sont rangées du haut vers le bas", () => {
    // Trois cellules sur trois lignes différentes du versant.
    const crue = crueDeLaSemaine(debordement({ 30: 60, 6: 60, 18: 60 }), versant());
    expect(crue?.cellules).toEqual([6, 18, 30]);
    expect(crue?.rangs).toEqual([0, 0.5, 1]);
  });

  it("sur un terrain plat, aucune direction n'est inventée", () => {
    // Pas de dénivelé, donc pas de sens : tout monte ensemble, ce qui est ce
    // qu'on voit d'une flaque de plat.
    const crue = crueDeLaSemaine(debordement({ 3: 60, 20: 60, 33: 60 }), plat());
    expect(crue?.rangs).toEqual([0, 0, 0]);
  });

  it("porte la lame de chaque cellule, dans le même ordre", () => {
    const crue = crueDeLaSemaine(debordement({ 30: 12, 6: 80 }), versant());
    expect(crue?.cellules).toEqual([6, 30]);
    expect(crue?.lamesMm).toEqual([80, 12]);
  });
});

describe("l'onde, qui passe et s'en va", () => {
  const crue = crueDeLaSemaine(debordement({ 6: 80, 18: 80, 30: 80 }), versant());

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
    const deux = crueDeLaSemaine(
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
  const crue = crueDeLaSemaine(debordement({ 6: 80, 18: 80, 30: 80 }), versant());

  it("donne un acte quand la semaine a noyé quelque chose", () => {
    const plan = planAuRythmeNaturel([{ ...journalVide, crue }]);
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
        crue,
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
    const autre = crueDeLaSemaine(debordement({ 7: 40 }), versant());
    const plan = planAuRythmeNaturel([
      { ...journalVide, crue },
      { ...journalVide, crue: autre },
    ]);
    expect(plan.actes.filter((a) => a.sujet.quoi === "crue")).toHaveLength(2);
  });
});
