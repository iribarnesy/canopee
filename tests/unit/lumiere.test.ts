/**
 * La lumière : l'ombrage de pente et la direction des ombres portées.
 *
 * Le point de ces tests : le soleil du dessin doit être le soleil du MOTEUR.
 * Une ombre dessinée ailleurs que là où `light.ts` la calcule mentirait sur qui
 * ombrage qui — c'est le genre d'écart qui ne se voit pas à l'œil et qui rend
 * l'image fausse. D'où les deux propriétés vérifiées ici : le sud éclaire, et
 * l'ombre part au nord aux quatre orientations.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SHADOW_NORTH_OFFSET } from "../../src/engine/light";
import {
  AMPLITUDE_PENTE,
  directionOmbreEcran,
  facteurPente,
  gradient,
  longueurOmbreEcran,
  SOLEIL_HAUTEUR_DEG,
} from "../../src/render/lumiere";
import type { Camera, Orientation } from "../../src/render/projection";
import { versEcran } from "../../src/render/projection";

const COTE = 9;

/** Terrain plat à l'altitude donnée. */
function plat(z = 0): number[] {
  return new Array(COTE * COTE).fill(z);
}

/** Versant régulier : `pente` mètres de dénivelé par mètre vers le nord (+y). */
function versantVersLeNord(pente: number): number[] {
  const a: number[] = [];
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) a.push(y * pente);
  return a;
}

function cam(orientation: Orientation, zoom = 1): Camera {
  return { coteM: COTE, zoom, orientation };
}

describe("le gradient du terrain", () => {
  it("est nul sur un terrain plat, partout, bords compris", () => {
    const a = plat(12);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) {
        const [dx, dy] = gradient(a, COTE, x, y);
        expect(dx).toBeCloseTo(0, 12);
        expect(dy).toBeCloseTo(0, 12);
      }
    }
  });

  it("rend la pente exacte d'un versant régulier, y compris au bord", () => {
    // Le repli sur la différence simple au bord doit donner la même pente que
    // la différence centrée au milieu — sinon le bord de la parcelle s'éclaire
    // autrement que son intérieur et ça fait un liseré lumineux.
    const a = versantVersLeNord(0.05);
    for (let y = 0; y < COTE; y++) {
      const [dx, dy] = gradient(a, COTE, 4, y);
      expect(dx).toBeCloseTo(0, 12);
      expect(dy).toBeCloseTo(0.05, 12);
    }
  });
});

describe("l'ombrage de pente", () => {
  it("vaut exactement 1 sur le plat : c'est la référence", () => {
    expect(facteurPente(plat(), COTE, 4, 4)).toBeCloseTo(1, 12);
    expect(facteurPente(plat(50), COTE, 0, 0)).toBeCloseTo(1, 12);
  });

  it("un versant tourné vers le SUD est plus clair qu'un versant vers le nord", () => {
    // Le soleil est au sud dans `light.ts`. Un versant qui descend vers le sud
    // lui fait face ; celui qui descend vers le nord se détourne.
    const versLeNord = versantVersLeNord(0.2); // monte vers le nord → face au sud
    const versLeSud = versantVersLeNord(-0.2);
    const faceAuSoleil = facteurPente(versLeNord, COTE, 4, 4);
    const dosAuSoleil = facteurPente(versLeSud, COTE, 4, 4);
    expect(faceAuSoleil).toBeGreaterThan(1);
    expect(dosAuSoleil).toBeLessThan(1);
    expect(faceAuSoleil).toBeGreaterThan(dosAuSoleil);
  });

  it("l'est et l'ouest sont éclairés pareil : le soleil n'a pas d'azimut oblique", () => {
    // C'est la conséquence assumée d'avoir suivi le moteur plutôt que le §4,
    // qui voulait une lumière au sud-ouest. Si ce test tombe, c'est qu'on a
    // introduit un azimut sans le dire au moteur.
    const versLEst: number[] = [];
    for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) versLEst.push(x * 0.2);
    const versLOuest: number[] = [];
    for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) versLOuest.push(-x * 0.2);
    expect(facteurPente(versLEst, COTE, 4, 4)).toBeCloseTo(
      facteurPente(versLOuest, COTE, 4, 4),
      10,
    );
  });

  it("reste dans une plage utilisable, même sur une pente absurde", () => {
    // L'éditeur de terrain laisse creuser sans limite (D3) : un facteur négatif
    // donnerait une couleur négative, et un facteur énorme un aplat blanc.
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), (pente) => {
        const f = facteurPente(versantVersLeNord(pente), COTE, 4, 4);
        expect(f).toBeGreaterThan(1 - 2 * AMPLITUDE_PENTE);
        expect(f).toBeLessThan(1 + 2 * AMPLITUDE_PENTE);
      }),
    );
  });
});

describe("l'ombre portée", () => {
  it("part vers le NORD de la parcelle, aux quatre orientations", () => {
    // La direction écran change à chaque quart de tour, mais elle doit toujours
    // désigner le même point du terrain : celui décalé de +y.
    for (const o of [0, 1, 2, 3] as const) {
      const c = cam(o);
      const d = directionOmbreEcran(c);
      const pied = versEcran({ x: 4, y: 4, z: 0 }, c);
      const nord = versEcran({ x: 4, y: 5, z: 0 }, c);
      const attendu = Math.hypot(nord.sx - pied.sx, nord.sy - pied.sy);
      expect(d.sx).toBeCloseTo((nord.sx - pied.sx) / attendu, 10);
      expect(d.sy).toBeCloseTo((nord.sy - pied.sy) / attendu, 10);
    }
  });

  it("est un vecteur unité, aux quatre orientations et à tout zoom", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 1, 2, 3),
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (o, zoom) => {
          const d = directionOmbreEcran(cam(o as Orientation, zoom));
          expect(Math.hypot(d.sx, d.sy)).toBeCloseTo(1, 10);
        },
      ),
    );
  });

  it("tourne vraiment : deux orientations opposées donnent des ombres opposées", () => {
    const a = directionOmbreEcran(cam(0));
    const b = directionOmbreEcran(cam(2));
    expect(a.sx).toBeCloseTo(-b.sx, 10);
    expect(a.sy).toBeCloseTo(-b.sy, 10);
  });

  it("s'allonge avec la hauteur, proportionnellement, et avec le zoom", () => {
    const c = cam(0);
    const courte = longueurOmbreEcran(5, c);
    const longue = longueurOmbreEcran(15, c);
    expect(longue).toBeCloseTo(3 * courte, 8);
    expect(longueurOmbreEcran(5, cam(0, 4))).toBeCloseTo(4 * courte, 8);
  });

  it("la hauteur du soleil est celle qui reproduit le décalage du moteur", () => {
    // Si ces deux nombres divergent, l'ombre dessinée ne tombe plus là où la
    // concurrence pour la lumière la met. C'est le seul vrai risque du module.
    const hauteur = (SOLEIL_HAUTEUR_DEG * Math.PI) / 180;
    expect(1 / Math.tan(hauteur)).toBeCloseTo(SHADOW_NORTH_OFFSET, 12);
  });
});
