/**
 * La caméra : cadrage, zoom vers le curseur, quarts de tour, emprise visible.
 *
 * L'emprise est ce qui compte le plus ici. Le lot L0 a mesuré que le point de
 * rupture du rendu est le zoom rapproché, parce que le banc dessinait l'hectare
 * entier à toutes les échelles. `celluleVisibles` est la réponse, donc une
 * erreur dedans se paie deux fois : en performance si elle rend trop, et en
 * trous à l'écran si elle rend trop peu. D'où les tests des deux côtés.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  celluleVisibles,
  LARGEUR_MIN_VISIBLE_M,
  tailleEmprise,
  tournerVue,
  type Vue,
  versEcranVue,
  versParcelleVue,
  vueInitiale,
  zoomer,
  zoomMax,
  zoomMin,
} from "../../src/render/camera";

const COTE = 100;
const LARGEUR = 1600;
const HAUTEUR = 900;

function vue(): Vue {
  return vueInitiale(COTE, LARGEUR, HAUTEUR);
}

describe("le cadrage initial", () => {
  it("fait tenir la parcelle entière à l'écran, sans la dépasser", () => {
    const v = vue();
    const coins = [
      { x: 0, y: 0, z: 0 },
      { x: COTE, y: 0, z: 0 },
      { x: 0, y: COTE, z: 0 },
      { x: COTE, y: COTE, z: 0 },
    ];
    for (const c of coins) {
      const e = versEcranVue(c, v);
      expect(e.sx).toBeGreaterThanOrEqual(-1);
      expect(e.sx).toBeLessThanOrEqual(LARGEUR + 1);
      expect(e.sy).toBeGreaterThanOrEqual(-1);
      expect(e.sy).toBeLessThanOrEqual(HAUTEUR + 1);
    }
  });

  it("met le centre de la parcelle au milieu de l'écran", () => {
    const e = versEcranVue({ x: COTE / 2, y: COTE / 2, z: 0 }, vue());
    expect(e.sx).toBeCloseTo(LARGEUR / 2, 8);
    expect(e.sy).toBeCloseTo(HAUTEUR / 2, 8);
  });

  it("tient compte du relief : une butte fait reculer le zoom d'ensemble", () => {
    expect(zoomMin(COTE, LARGEUR, HAUTEUR, 20)).toBeLessThanOrEqual(
      zoomMin(COTE, LARGEUR, HAUTEUR, 0),
    );
  });
});

describe("l'aller-retour écran ↔ parcelle", () => {
  it("est exact aux quatre orientations et à tout zoom", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 1, 2, 3),
        fc.double({ min: 0.5, max: 12, noNaN: true }),
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.double({ min: 0, max: COTE, noNaN: true }),
        (o, zoom, x, y) => {
          const v: Vue = { ...vue(), cam: { coteM: COTE, zoom, orientation: o as 0 | 1 | 2 | 3 } };
          const e = versEcranVue({ x, y, z: 0 }, v);
          const p = versParcelleVue(e, v);
          expect(p.x).toBeCloseTo(x, 8);
          expect(p.y).toBeCloseTo(y, 8);
        },
      ),
    );
  });
});

describe("le zoom", () => {
  it("est borné des deux côtés", () => {
    let v = vue();
    for (let i = 0; i < 50; i++) v = zoomer(v, 1.3, { sx: LARGEUR / 2, sy: HAUTEUR / 2 });
    expect(v.cam.zoom).toBeCloseTo(zoomMax(LARGEUR), 8);
    for (let i = 0; i < 80; i++) v = zoomer(v, 0.75, { sx: LARGEUR / 2, sy: HAUTEUR / 2 });
    expect(v.cam.zoom).toBeCloseTo(zoomMin(COTE, LARGEUR, HAUTEUR), 8);
  });

  it("garde le point survolé SOUS le curseur — c'est tout l'intérêt", () => {
    const v = vue();
    const curseur = { sx: 1200, sy: 300 };
    const avant = versParcelleVue(curseur, v);
    const apres = zoomer(v, 2.5, curseur);
    const dessous = versParcelleVue(curseur, apres);
    expect(dessous.x).toBeCloseTo(avant.x, 6);
    expect(dessous.y).toBeCloseTo(avant.y, 6);
  });

  it("revient au centre quand on dézoome au plus large : pas de vide cadré", () => {
    let v = zoomer(vue(), 6, { sx: 100, sy: 100 });
    expect(v.centre.x).not.toBeCloseTo(COTE / 2, 3);
    for (let i = 0; i < 40; i++) v = zoomer(v, 0.7, { sx: 100, sy: 100 });
    expect(v.centre.x).toBeCloseTo(COTE / 2, 8);
    expect(v.centre.y).toBeCloseTo(COTE / 2, 8);
  });

  it("ne laisse jamais le centre sortir de la parcelle", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            facteur: fc.double({ min: 0.5, max: 2, noNaN: true }),
            sx: fc.double({ min: 0, max: LARGEUR, noNaN: true }),
            sy: fc.double({ min: 0, max: HAUTEUR, noNaN: true }),
          }),
          { maxLength: 25 },
        ),
        (gestes) => {
          let v = vue();
          for (const g of gestes) v = zoomer(v, g.facteur, { sx: g.sx, sy: g.sy });
          expect(v.centre.x).toBeGreaterThanOrEqual(0);
          expect(v.centre.x).toBeLessThanOrEqual(COTE);
          expect(v.centre.y).toBeGreaterThanOrEqual(0);
          expect(v.centre.y).toBeLessThanOrEqual(COTE);
        },
      ),
    );
  });

  it("le zoom le plus rapproché montre bien la largeur annoncée", () => {
    const v: Vue = { ...vue(), cam: { ...vue().cam, zoom: zoomMax(LARGEUR) } };
    const gauche = versParcelleVue({ sx: 0, sy: HAUTEUR / 2 }, v);
    const droite = versParcelleVue({ sx: LARGEUR, sy: HAUTEUR / 2 }, v);
    // La diagonale `x − y` est ce que la largeur d'écran couvre en 2:1.
    const span = Math.abs(droite.x - droite.y - (gauche.x - gauche.y));
    expect(span).toBeCloseTo(LARGEUR_MIN_VISIBLE_M, 6);
  });
});

describe("les quarts de tour", () => {
  it("quatre tours ramènent à l'orientation de départ", () => {
    let v = vue();
    for (let i = 0; i < 4; i++) v = tournerVue(v, 1);
    expect(v.cam.orientation).toBe(0);
  });

  it("tournent dans les deux sens et bouclent", () => {
    expect(tournerVue(vue(), -1).cam.orientation).toBe(3);
    expect(tournerVue(tournerVue(vue(), -1), 1).cam.orientation).toBe(0);
  });

  it("ne déplacent pas le centre : il est en nord VRAI", () => {
    const v = zoomer(vue(), 4, { sx: 400, sy: 400 });
    expect(tournerVue(v, 1).centre).toEqual(v.centre);
  });
});

describe("l'emprise visible", () => {
  it("couvre toute la parcelle au zoom d'ensemble", () => {
    const e = celluleVisibles(vue());
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.x0).toBe(0);
    expect(e.y0).toBe(0);
    expect(e.x1).toBe(COTE - 1);
    expect(e.y1).toBe(COTE - 1);
  });

  it("se restreint franchement au zoom rapproché — la leçon de L0", () => {
    const large = celluleVisibles(vue());
    const proche = celluleVisibles(zoomer(vue(), 8, { sx: LARGEUR / 2, sy: HAUTEUR / 2 }));
    expect(large).toBeDefined();
    expect(proche).toBeDefined();
    if (!large || !proche) return;
    // C'est le chiffre qui justifie le découpage : on doit descendre d'un ordre
    // de grandeur au moins, sinon le zoom coûte autant que la parcelle.
    expect(tailleEmprise(proche) * 10).toBeLessThan(tailleEmprise(large));
  });

  it("contient toute cellule dont le CENTRE est à l'écran", () => {
    // Le sens à ne pas rater : trop rendre coûte du temps, pas assez fait des
    // trous. On vérifie donc l'inclusion, pas l'égalité.
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 8, noNaN: true }),
        fc.constantFrom(0, 1, 2, 3),
        (facteur, o) => {
          const v = tournerVue(zoomer(vue(), facteur, { sx: LARGEUR * 0.3, sy: HAUTEUR * 0.7 }), 1);
          const oriente: Vue = { ...v, cam: { ...v.cam, orientation: o as 0 | 1 | 2 | 3 } };
          const e = celluleVisibles(oriente);
          expect(e).toBeDefined();
          if (!e) return;
          for (let y = 0; y < COTE; y += 7) {
            for (let x = 0; x < COTE; x += 7) {
              const s = versEcranVue({ x: x + 0.5, y: y + 0.5, z: 0 }, oriente);
              const aLEcran =
                s.sx >= 0 && s.sx <= oriente.largeurPx && s.sy >= 0 && s.sy <= oriente.hauteurPx;
              if (aLEcran) {
                expect(x).toBeGreaterThanOrEqual(e.x0);
                expect(x).toBeLessThanOrEqual(e.x1);
                expect(y).toBeGreaterThanOrEqual(e.y0);
                expect(y).toBeLessThanOrEqual(e.y1);
              }
            }
          }
        },
      ),
    );
  });

  it("s'élargit pour les objets hauts : une cime peut entrer sans son pied", () => {
    const v = zoomer(vue(), 6, { sx: LARGEUR / 2, sy: HAUTEUR / 2 });
    const sansArbres = celluleVisibles(v, 0);
    const avecArbres = celluleVisibles(v, 25);
    expect(sansArbres).toBeDefined();
    expect(avecArbres).toBeDefined();
    if (!sansArbres || !avecArbres) return;
    expect(tailleEmprise(avecArbres)).toBeGreaterThan(tailleEmprise(sansArbres));
  });

  it("reste dans la parcelle, quelle que soit la marge demandée", () => {
    const e = celluleVisibles(vue(), 500, 500);
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.x0).toBeGreaterThanOrEqual(0);
    expect(e.y0).toBeGreaterThanOrEqual(0);
    expect(e.x1).toBeLessThanOrEqual(COTE - 1);
    expect(e.y1).toBeLessThanOrEqual(COTE - 1);
  });
});
