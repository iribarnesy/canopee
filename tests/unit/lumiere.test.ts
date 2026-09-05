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
  AZIMUT_MODELE_DEG,
  courbure,
  directionOmbreEcran,
  expositionMoyenne,
  facteurPente,
  facteurRelief,
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

  it("un versant qui monte au NORD-EST fait face au soleil du modelé", () => {
    // La lumière qui modèle est au sud-ouest (`AZIMUT_MODELE_DEG`). Un versant
    // qui s'élève à l'opposé lui fait face.
    const versLeNord = versantVersLeNord(0.2);
    const versLeSud = versantVersLeNord(-0.2);
    expect(facteurPente(versLeNord, COTE, 4, 4)).toBeGreaterThan(1);
    expect(facteurPente(versLeSud, COTE, 4, 4)).toBeLessThan(1);
  });

  it("l'EST et l'OUEST ne sont PAS éclairés pareil — et c'est le point", () => {
    // Renversement assumé d'un choix précédent. J'avais aligné l'ombrage sur le
    // soleil plein sud du moteur, en refusant le sud-ouest du §4. Mesuré :
    // `dz/dy` vaut 0,0900 partout sur les trois formes de relief du moteur —
    // `plan`, `croupe`, `vallon` — qui ne diffèrent QUE par leur profil
    // est-ouest. Un ombrage plein sud rendait donc une croupe et un vallon
    // identiques, c'est-à-dire ne montrait aucun relief.
    //
    // La distinction : l'ombre PORTÉE affirme un mécanisme — qui ombrage qui —
    // et doit suivre le moteur. L'ombrage de pente donne du volume à une
    // surface et n'affirme rien ; un azimut oblique n'y ment sur rien.
    const versLEst: number[] = [];
    for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) versLEst.push(x * 0.2);
    const versLOuest: number[] = [];
    for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) versLOuest.push(-x * 0.2);
    expect(facteurPente(versLEst, COTE, 4, 4)).toBeGreaterThan(
      facteurPente(versLOuest, COTE, 4, 4) + 0.1,
    );
  });

  it("mais l'OMBRE PORTÉE, elle, reste plein nord : les deux lumières diffèrent", () => {
    // Le garde-fou de la distinction ci-dessus. Si un jour quelqu'un aligne les
    // deux « pour la cohérence », ce test doit tomber.
    expect(AZIMUT_MODELE_DEG).not.toBe(180);
    const d = directionOmbreEcran(cam(0));
    const pied = versEcran({ x: 4, y: 4, z: 0 }, cam(0));
    const nord = versEcran({ x: 4, y: 5, z: 0 }, cam(0));
    const norme = Math.hypot(nord.sx - pied.sx, nord.sy - pied.sy);
    expect(d.sx).toBeCloseTo((nord.sx - pied.sx) / norme, 10);
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

describe("la pente de référence, sans laquelle l'ombrage n'ombre rien", () => {
  it("rend zéro sur un terrain plat", () => {
    expect(expositionMoyenne(plat(), COTE)).toBeCloseTo(0, 12);
    expect(expositionMoyenne(plat(30), COTE)).toBeCloseTo(0, 12);
  });

  it("rend l'exposition d'un plan incliné, exactement", () => {
    // Un versant nord-sud ne présente au soleil du sud-ouest que la projection
    // de sa pente sur cette direction, d'où le cosinus de 45°.
    const projection = Math.cos(Math.PI / 4);
    expect(expositionMoyenne(versantVersLeNord(0.09), COTE)).toBeCloseTo(0.09 * projection, 6);
    expect(expositionMoyenne(versantVersLeNord(-0.04), COTE)).toBeCloseTo(-0.04 * projection, 6);
  });

  it("neutralise un plan incliné : c'est tout l'intérêt", () => {
    // Sans référence, l'ombrage éclaircissait la parcelle ENTIÈRE — pas du
    // relief, une palette virée au jaune.
    const a = versantVersLeNord(0.09);
    const reference = expositionMoyenne(a, COTE);
    for (let y = 1; y < COTE - 1; y++) {
      expect(facteurPente(a, COTE, 4, y, reference)).toBeCloseTo(1, 6);
    }
  });

  it("laisse ressortir ce qui S'ÉCARTE du plan : une butte s'éclaire encore", () => {
    // Un versant régulier, plus une bosse au milieu. La bosse doit se voir même
    // si le versant, lui, s'efface.
    const a = versantVersLeNord(0.09);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) {
        const d = Math.hypot(x - 4, y - 4);
        a[y * COTE + x] = (a[y * COTE + x] ?? 0) + Math.max(0, 2 - d * 0.6);
      }
    }
    const reference = expositionMoyenne(a, COTE);
    const versantSeul = facteurPente(versantVersLeNord(0.09), COTE, 4, 2, reference);
    const surLaBosse = facteurPente(a, COTE, 4, 2, reference);
    expect(Math.abs(surLaBosse - 1)).toBeGreaterThan(Math.abs(versantSeul - 1) + 0.02);
  });
});

describe("la courbure, qui rend le relief lisible", () => {
  const coteM = 40;

  /** Un plan incliné pur : pente constante, aucune courbure nulle part. */
  function plan(pente: number): number[] {
    return Array.from({ length: coteM * coteM }, (_, i) => Math.floor(i / coteM) * pente);
  }

  /** Le même plan, creusé d'un talweg le long de la colonne du milieu. */
  function talweg(pente: number, creuxM: number): number[] {
    const z = plan(pente);
    for (let y = 0; y < coteM; y++) {
      for (let x = 0; x < coteM; x++) {
        const d = Math.abs(x - coteM / 2);
        if (d < 6) z[y * coteM + x] = (z[y * coteM + x] ?? 0) - creuxM * (1 - d / 6);
      }
    }
    return z;
  }

  it("est nulle sur un plan, même très incliné", () => {
    const z = plan(0.2);
    expect(courbure(z, coteM, 20, 20)).toBeCloseTo(0, 9);
  });

  it("est négative dans un creux et positive sur ses épaules", () => {
    const z = talweg(0.09, 0.5);
    expect(courbure(z, coteM, 20, 20)).toBeLessThan(0);
    expect(courbure(z, coteM, 26, 20)).toBeGreaterThan(0);
  });

  it("**c'est elle qui voit ce que la pente ne peut pas voir**", () => {
    // Le défaut signalé : « relief peu lisible ». On compare le FOND du
    // talweg au plan qui l'entoure — deux points où la pente est rigoureusement
    // la même (le fond est symétrique, donc `dz/dx` y est nul comme sur le
    // plan). L'ombrage de pente les rend donc identiques et le talweg est
    // invisible. La courbure, elle, les sépare.
    const z = talweg(0.09, 0.5);
    const reference = expositionMoyenne(z, coteM);
    const creuxPente = facteurPente(z, coteM, 20, 20, reference);
    const plainePente = facteurPente(z, coteM, 34, 20, reference);
    expect(creuxPente).toBeCloseTo(plainePente, 9);

    const creux = facteurRelief(z, coteM, 20, 20, reference);
    const plaine = facteurRelief(z, coteM, 34, 20, reference);
    expect(plaine - creux).toBeGreaterThan(0.15);
  });

  it("laisse un plan uni : elle n'invente pas de relief là où il n'y en a pas", () => {
    const z = plan(0.09);
    const reference = expositionMoyenne(z, coteM);
    for (const [x, y] of [
      [10, 10],
      [20, 30],
      [30, 15],
    ] as const) {
      expect(facteurRelief(z, coteM, x, y, reference)).toBeCloseTo(1, 6);
    }
  });

  it("sature, donc un accident violent n'éteint pas la palette", () => {
    const z = talweg(0.09, 20);
    const reference = expositionMoyenne(z, coteM);
    const f = facteurRelief(z, coteM, 20, 20, reference);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(2);
  });

  it("ne dépend pas de l'orientation du terrain", () => {
    // Une butte ronde vue par ses quatre axes : même courbure, sinon le
    // relief se lirait différemment selon qu'on est nord-sud ou est-ouest.
    const z = Array.from({ length: coteM * coteM }, (_, i) => {
      const x = i % coteM;
      const y = Math.floor(i / coteM);
      return Math.exp(-(((x - 20) ** 2 + (y - 20) ** 2) / 80));
    });
    const a = courbure(z, coteM, 26, 20);
    const b = courbure(z, coteM, 20, 26);
    expect(a).toBeCloseTo(b, 6);
  });
});
