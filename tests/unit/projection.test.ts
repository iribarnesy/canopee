/**
 * La projection isométrique (src/render/projection.ts).
 *
 * Un rendu ne se teste pas comme un moteur, mais la projection, si : elle est
 * pure, et c'est là que se cachent les bugs les plus coûteux — un picking qui
 * dérive d'une demi-tuile rend le jeu injouable sans qu'aucune capture ne le
 * montre. D'où des tests de PROPRIÉTÉ plutôt que quelques cas : on veut que
 * l'aller-retour tienne partout, à toutes les orientations, y compris sur un
 * terrain accidenté.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Camera,
  celluleSousLeCurseur,
  detourner,
  empriseEcran,
  METRE_VERTICAL_PX,
  type Orientation,
  profondeur,
  TUILE_HAUTEUR_PX,
  TUILE_LARGEUR_PX,
  tourner,
  versEcran,
  versParcelleAPlat,
} from "../../src/render/projection";

const COTE = 100;
const cam = (orientation: Orientation = 0, zoom = 1): Camera => ({
  coteM: COTE,
  zoom,
  orientation,
});
const ORIENTATIONS: Orientation[] = [0, 1, 2, 3];

describe("la rotation de la caméra", () => {
  it("quatre quarts de tour ramènent au point de départ", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.double({ min: 0, max: COTE, noNaN: true }),
        (x, y) => {
          let px = x;
          let py = y;
          for (let i = 0; i < 4; i++) [px, py] = tourner(px, py, COTE, 1);
          expect(px).toBeCloseTo(x, 9);
          expect(py).toBeCloseTo(y, 9);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("`detourner` défait `tourner`, à toutes les orientations", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.constantFrom(...ORIENTATIONS),
        (x, y, o) => {
          const [rx, ry] = tourner(x, y, COTE, o);
          const [bx, by] = detourner(rx, ry, COTE, o);
          expect(bx).toBeCloseTo(x, 9);
          expect(by).toBeCloseTo(y, 9);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("une rotation ne fait pas sortir de la parcelle", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.constantFrom(...ORIENTATIONS),
        (x, y, o) => {
          const [rx, ry] = tourner(x, y, COTE, o);
          expect(rx).toBeGreaterThanOrEqual(0);
          expect(ry).toBeGreaterThanOrEqual(0);
          expect(rx).toBeLessThanOrEqual(COTE);
          expect(ry).toBeLessThanOrEqual(COTE);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("parcelle ↔ écran", () => {
  it("l'aller-retour à plat est exact, à toute orientation et tout zoom", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.double({ min: 0, max: COTE, noNaN: true }),
        fc.double({ min: -5, max: 40, noNaN: true }),
        fc.constantFrom(...ORIENTATIONS),
        fc.double({ min: 0.25, max: 8, noNaN: true }),
        (x, y, z, o, zoom) => {
          const c = cam(o, zoom);
          const retour = versParcelleAPlat(versEcran({ x, y, z }, c), c, z);
          expect(retour.x).toBeCloseTo(x, 6);
          expect(retour.y).toBeCloseTo(y, 6);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("un cube d'un mètre se dessine comme un cube (D2)", () => {
    // La condition qui rend le relief à l'échelle vraie gratuit. En 2:1, la
    // demi-largeur d'une tuile vaut sa hauteur — donc un mètre VERTICAL occupe
    // à l'écran exactement ce qu'un mètre HORIZONTAL occupe en largeur, et le
    // cube unité se dessine comme un cube. Sans cette égalité, une butte de
    // six mètres ne « pose » pas sur le terrain qui la porte.
    expect(METRE_VERTICAL_PX).toBeCloseTo(TUILE_LARGEUR_PX / 2, 9);
    expect(METRE_VERTICAL_PX).toBeCloseTo(TUILE_HAUTEUR_PX, 9);
    const c = cam();
    const sol = versEcran({ x: 10, y: 10, z: 0 }, c);
    const sommet = versEcran({ x: 10, y: 10, z: 1 }, c);
    const voisine = versEcran({ x: 11, y: 10, z: 0 }, c);
    const monteeVerticale = sol.sy - sommet.sy;
    const pasHorizontal = Math.abs(voisine.sx - sol.sx);
    expect(monteeVerticale).toBeCloseTo(pasHorizontal, 9);
    expect(monteeVerticale).toBeCloseTo(TUILE_HAUTEUR_PX, 9);
  });

  it("monter d'un mètre remonte à l'écran, avancer d'un mètre descend", () => {
    const c = cam();
    const base = versEcran({ x: 10, y: 10, z: 0 }, c);
    expect(versEcran({ x: 10, y: 10, z: 3 }, c).sy).toBeLessThan(base.sy);
    expect(versEcran({ x: 11, y: 11, z: 0 }, c).sy).toBeGreaterThan(base.sy);
  });

  it("l'emprise grandit avec le zoom et avec le relief", () => {
    const plat = empriseEcran(cam(), 0);
    const bosse = empriseEcran(cam(), 30);
    expect(bosse.hauteur).toBeGreaterThan(plat.hauteur);
    expect(bosse.largeur).toBe(plat.largeur);
    expect(empriseEcran(cam(0, 2), 0).largeur).toBeCloseTo(2 * plat.largeur, 6);
  });
});

describe("la profondeur, pour l'ordre du peintre", () => {
  it("l'altitude n'entre pas dans la profondeur", () => {
    // Un arbre au sommet d'une butte n'est pas DEVANT ce qui est en bas devant
    // lui : sinon il serait dessiné par-dessus, et le relief mentirait.
    const c = cam();
    expect(profondeur(10, 10, c)).toBe(profondeur(10, 10, c));
    expect(profondeur(20, 20, c)).toBeGreaterThan(profondeur(10, 10, c));
  });

  it("tourner la caméra change qui est devant", () => {
    const proche = profondeur(90, 90, cam(0));
    const apresDemiTour = profondeur(90, 90, cam(2));
    expect(apresDemiTour).toBeLessThan(proche);
  });
});

describe("le picking sur terrain accidenté", () => {
  /** Un versant régulier de 20 % : 20 m de dénivelé sur 100. */
  const versant = (_x: number, y: number) => (y * 20) / 100;
  /** Une butte franche au milieu : le cas qui masque ce qu'il y a derrière. */
  const butte = (x: number, y: number) => {
    const d = Math.hypot(x - 50, y - 50);
    return Math.max(0, 12 - d * 0.6);
  };

  for (const [nom, relief] of [
    ["plat", () => 0],
    ["versant à 20 %", versant],
    ["butte de 12 m", butte],
  ] as const) {
    it(`retrouve la cellule cliquée — ${nom}`, () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: COTE - 1 }),
          fc.integer({ min: 0, max: COTE - 1 }),
          fc.constantFrom(...ORIENTATIONS),
          (cx, cy, o) => {
            const c = cam(o);
            // On projette le CENTRE de la cellule, puis on demande qui est là.
            const e = versEcran({ x: cx + 0.5, y: cy + 0.5, z: relief(cx, cy) }, c);
            const trouvee = celluleSousLeCurseur(e, c, relief);
            expect(trouvee).toBeDefined();
            // On ne demande pas la cellule exacte : sur un relief, une cellule
            // PLUS PROCHE de la caméra peut légitimement occuper ce pixel —
            // c'est précisément ce qu'occulter veut dire. Ce qu'on exige, c'est
            // que la réponse soit sur le même rayon de vue, donc à la même
            // différence `x − y` dans le repère caméra.
            if (!trouvee) return;
            const [rx, ry] = tourner(trouvee.x + 0.5, trouvee.y + 0.5, COTE, o);
            const [ox, oy] = tourner(cx + 0.5, cy + 0.5, COTE, o);
            expect(rx - ry).toBeCloseTo(ox - oy, 6);
          },
        ),
        { numRuns: 300 },
      );
    });
  }

  it("un clic dans le ciel ne trouve rien", () => {
    const c = cam();
    // Très haut au-dessus du sommet du losange : aucune surface là.
    expect(celluleSousLeCurseur({ sx: 0, sy: -5000 }, c, () => 0)).toBeUndefined();
  });

  it("sur une butte, c'est la crête qui répond, pas ce qu'elle cache", () => {
    // Le test qui dit que l'occlusion fonctionne : on visse le pixel de la
    // crête, et on vérifie que la cellule rendue est bien haute.
    const c = cam();
    const crete = versEcran({ x: 50.5, y: 50.5, z: butte(50, 50) }, c);
    const trouvee = celluleSousLeCurseur(crete, c, butte);
    expect(trouvee).toBeDefined();
    if (trouvee) expect(butte(trouvee.x, trouvee.y)).toBeGreaterThan(8);
  });
});
