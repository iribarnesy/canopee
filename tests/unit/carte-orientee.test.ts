/**
 * **La carte du sol suit la vue** (#145).
 *
 * La carte est un canvas nord-en-haut ; la vue est en dimétrique 2:1 et tourne
 * par quarts de tour. On ne redessine pas la carte dans l'autre sens — on la
 * **présente** autrement, par une transformation. Reste à prouver que cette
 * transformation est bien celle de la vue, et pas une qui lui ressemble : à
 * l'œil, une carte tournée du mauvais quart ou réfléchie reste une carte
 * plausible. Trois signes possibles, huit combinaisons, une seule juste.
 *
 * L'épreuve compare donc, pour de vraies cellules et aux quatre orientations,
 * la **direction** que la matrice de présentation donne à une cellule depuis le
 * centre de la carte, avec celle que `versEcran` — la projection du rendu,
 * celle qui dessine vraiment — lui donne depuis le centre de la parcelle.
 */

import { describe, expect, it } from "vitest";
import {
  capDuNord,
  celluleSousLaCarte,
  LARGEUR_DU_LOSANGE,
  matriceDeLaCarte,
  transformeDeLaCarte,
} from "../../src/game/panneaux/carteOrientee";
import { type Camera, type Orientation, versEcran } from "../../src/render/projection";

const ORIENTATIONS: Orientation[] = [0, 1, 2, 3];
const COTE_M = 40;
/** Le côté du canvas, en pixels : un cas où un pixel ne vaut **pas** un mètre. */
const COTE_PX = 360;

function camera(orientation: Orientation): Camera {
  return { coteM: COTE_M, zoom: 1, orientation };
}

/** Où la matrice de présentation pose la cellule, en écart au centre de la carte. */
function surLaCarte(x: number, y: number, orientation: Orientation): { dx: number; dy: number } {
  const [a, b, c, d] = matriceDeLaCarte(orientation);
  const echelle = COTE_PX / COTE_M;
  // Le canvas pose la cellule en (x, C−1−y) ; on vise son centre.
  const u = (x + 0.5) * echelle - COTE_PX / 2;
  const v = (COTE_M - 1 - y + 0.5) * echelle - COTE_PX / 2;
  return { dx: a * u + c * v, dy: b * u + d * v };
}

/** Où la **vue** pose la cellule, en écart au centre de la parcelle. */
function surLaVue(x: number, y: number, orientation: Orientation): { dx: number; dy: number } {
  const cam = camera(orientation);
  const p = versEcran({ x: x + 0.5, y: y + 0.5, z: 0 }, cam);
  const centre = versEcran({ x: COTE_M / 2, y: COTE_M / 2, z: 0 }, cam);
  return { dx: p.sx - centre.sx, dy: p.sy - centre.sy };
}

/** Le cosinus de l'angle entre deux directions : 1 = même sens. */
function memeSens(a: { dx: number; dy: number }, b: { dx: number; dy: number }): number {
  const na = Math.hypot(a.dx, a.dy);
  const nb = Math.hypot(b.dx, b.dy);
  return (a.dx * b.dx + a.dy * b.dy) / (na * nb);
}

/** Des cellules dispersées, dont les quatre coins et deux points quelconques. */
const CELLULES = [
  [0, 0],
  [COTE_M - 1, 0],
  [0, COTE_M - 1],
  [COTE_M - 1, COTE_M - 1],
  [3, 27],
  [31, 8],
  [17, 19],
] as const;

describe("la carte présentée pointe où la vue pointe", () => {
  for (const orientation of ORIENTATIONS) {
    it(`même direction qu'à l'écran, orientation ${orientation}`, () => {
      for (const [x, y] of CELLULES) {
        const cos = memeSens(surLaCarte(x, y, orientation), surLaVue(x, y, orientation));
        expect(cos, `cellule ${x},${y}`).toBeCloseTo(1, 6);
      }
    });
  }

  it("le rapport des longueurs est le même pour toutes les cellules", () => {
    // Une présentation qui garderait les directions mais pas les proportions
    // déformerait la parcelle : la carte serait juste au centre et fausse au
    // bord. Le rapport doit donc être une **constante**, à orientation donnée.
    for (const orientation of ORIENTATIONS) {
      const rapports = CELLULES.map(([x, y]) => {
        const carte = surLaCarte(x, y, orientation);
        const vue = surLaVue(x, y, orientation);
        return Math.hypot(carte.dx, carte.dy) / Math.hypot(vue.dx, vue.dy);
      });
      const premier = rapports[0] ?? 0;
      for (const r of rapports) expect(r).toBeCloseTo(premier, 6);
    }
  });

  it("les quatre orientations donnent quatre présentations distinctes", () => {
    const vues = ORIENTATIONS.map((o) => matriceDeLaCarte(o).join(","));
    expect(new Set(vues).size).toBe(4);
  });
});

describe("la matrice et la transformation CSS disent la même chose", () => {
  // La CSS est ce qui s'applique vraiment ; la matrice est ce qui sert au
  // survol. Deux écritures d'une même règle, donc un risque de dérive — d'où
  // l'épreuve qui les recolle.
  for (const orientation of ORIENTATIONS) {
    it(`orientation ${orientation}`, () => {
      const css = transformeDeLaCarte(orientation);
      const angle = Number(/rotate\((-?[\d.]+)deg\)/.exec(css)?.[1]);
      expect(Number.isFinite(angle)).toBe(true);
      expect(css).toBe(`scaleY(0.5) rotate(${angle}deg) scaleY(-1)`);
      const rad = (angle * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      // scaleY(0.5) · rotate(angle) · scaleY(-1), composée à la main.
      const attendue = [c, 0.5 * s, s, -0.5 * c];
      const obtenue = matriceDeLaCarte(orientation);
      for (let i = 0; i < 4; i++) expect(obtenue[i]).toBeCloseTo(attendue[i] ?? 0, 12);
    });
  }

  it("le losange tient dans une largeur de √2 côtés", () => {
    for (const orientation of ORIENTATIONS) {
      const [a, b, c, d] = matriceDeLaCarte(orientation);
      // Les quatre coins du canvas unité, centrés.
      const coins: [number, number][] = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ];
      const xs = coins.map(([u, v]) => a * u + c * v);
      const ys = coins.map(([u, v]) => b * u + d * v);
      const largeur = Math.max(...xs) - Math.min(...xs);
      const hauteur = Math.max(...ys) - Math.min(...ys);
      expect(largeur).toBeCloseTo(LARGEUR_DU_LOSANGE, 10);
      // La dimétrique 2:1 : deux fois plus large que haut, toujours.
      expect(largeur / hauteur).toBeCloseTo(2, 10);
    }
  });
});

describe("l'aiguille du nord", () => {
  for (const orientation of ORIENTATIONS) {
    it(`pointe là où la vue met le nord, orientation ${orientation}`, () => {
      // Le nord, c'est le sens des `y` croissants de la parcelle.
      const cam = camera(orientation);
      const ici = versEcran({ x: 20, y: 20, z: 0 }, cam);
      const nord = versEcran({ x: 20, y: 21, z: 0 }, cam);
      const attendu = (Math.atan2(nord.sx - ici.sx, -(nord.sy - ici.sy)) * 180) / Math.PI;
      expect(capDuNord(orientation)).toBeCloseTo(attendu, 6);
    });
  }

  it("les quatre caps sont distincts, sans être à 90° les uns des autres", () => {
    // **Le piège du premier jet, et il a failli passer.** On attend qu'une
    // caméra qui tourne d'un quart de tour fasse tourner l'aiguille de 90° ;
    // elle ne le fait pas. L'écrasement dimétrique divise le `y` par deux, et
    // une rotation vue à travers un écrasement n'est plus une rotation : les
    // caps réels alternent entre ±116,6° et ±63,4°. C'est la projection qui le
    // veut, pas un signe faux — la preuve étant que chaque cap colle déjà à
    // `versEcran` juste au-dessus.
    const caps = ORIENTATIONS.map(capDuNord);
    expect(new Set(caps.map((c) => c.toFixed(6))).size).toBe(4);
    // Rendue au plan non écrasé, en revanche, la rotation redevient un quart
    // de tour exact.
    const redresses = caps.map((cap) => {
      const rad = (cap * Math.PI) / 180;
      return (Math.atan2(Math.sin(rad), 2 * Math.cos(rad)) * 180) / Math.PI;
    });
    for (let i = 1; i < 4; i++) {
      const ecart = ((((redresses[i] ?? 0) - (redresses[i - 1] ?? 0)) % 360) + 360) % 360;
      expect(ecart).toBeCloseTo(270, 6);
    }
  });
});

describe("remonter de l'écran à la cellule", () => {
  for (const orientation of ORIENTATIONS) {
    it(`aller-retour exact, orientation ${orientation}`, () => {
      for (let y = 0; y < COTE_M; y += 3) {
        for (let x = 0; x < COTE_M; x += 3) {
          const { dx, dy } = surLaCarte(x, y, orientation);
          const cellule = celluleSousLaCarte(dx, dy, COTE_PX, COTE_M, orientation);
          expect(cellule, `cellule ${x},${y}`).toEqual({ x, y });
        }
      }
    });
  }

  it("rend undefined hors du losange", () => {
    // Le coin de la boîte englobante n'est **pas** dans le losange : c'est
    // exactement le point où un carré aurait répondu et où un losange ne doit
    // pas répondre.
    const bord = (COTE_PX * LARGEUR_DU_LOSANGE) / 2;
    expect(celluleSousLaCarte(bord - 1, bord / 2 - 1, COTE_PX, COTE_M, 0)).toBeUndefined();
    expect(celluleSousLaCarte(0, COTE_PX, COTE_PX, COTE_M, 0)).toBeUndefined();
    expect(celluleSousLaCarte(-COTE_PX, 0, COTE_PX, COTE_M, 0)).toBeUndefined();
  });

  it("le centre du losange est le centre de la parcelle", () => {
    for (const orientation of ORIENTATIONS) {
      const cellule = celluleSousLaCarte(0, 0, COTE_PX, COTE_M, orientation);
      expect(cellule).toEqual({ x: COTE_M / 2, y: COTE_M / 2 - 1 });
    }
  });
});
