/**
 * LA ZONE D'UN CHANTIER (issue #186).
 *
 * Ce fichier tient d'abord une chose, et c'est la seule qui rende le refactor
 * sûr : **pour un disque, la nouvelle géométrie rend EXACTEMENT les mêmes
 * cellules que l'ancienne.** Pas « à peu près », pas « en moyenne » — les mêmes
 * indices, dans le même ordre. Dix actions vont changer de signature ; sans
 * cette égalité, rien ne distingue un refactor réussi d'un refactor qui déplace
 * silencieusement toutes les parties.
 *
 * Le reste vérifie que la bande est bien une bande.
 */

import { describe, expect, it } from "vitest";
import { forEachDiscCell, type GridDims } from "../../src/engine/grid";
import {
  aireM2DeLaZone,
  cellulesDeLaZone,
  perimetreMDeLaZone,
  pourChaqueCelluleDeLaZone,
  type Zone,
  zoneContient,
} from "../../src/engine/zone";

const DIMS: GridDims = { widthM: 40, heightM: 40 };

/** L'ancienne route, telle quelle, pour comparer. */
function ancien(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  forEachDiscCell(DIMS, cx, cy, r, (i) => out.push(i));
  return out;
}

describe("le disque ne bouge pas d'un indice", () => {
  it("rend exactement les mêmes cellules qu'avant, sur tous les cas de bord", () => {
    // Centré, décentré, à cheval sur le bord, débordant complètement, minuscule
    // au point de ne toucher aucun centre de cellule — le cas que la garantie
    // « au moins une cellule » existe pour couvrir.
    const cas: [number, number, number][] = [
      [20, 20, 5],
      [20, 20, 0.5],
      [20.5, 20.5, 0.1],
      [0, 0, 3],
      [39.9, 39.9, 4],
      [20, 20, 100],
      [-5, 20, 8],
      [20, 20, 1],
      [7.3, 31.8, 6.4],
    ];
    for (const [x, y, rayonM] of cas) {
      const attendu = ancien(x, y, rayonM);
      const obtenu: number[] = [];
      pourChaqueCelluleDeLaZone(DIMS, { x, y, rayonM }, (i) => obtenu.push(i));
      expect(obtenu, `disque (${x}, ${y}, r=${rayonM})`).toEqual(attendu);
    }
  });

  it("et `cellulesDeLaZone` rend la même chose que le parcours", () => {
    const zone: Zone = { x: 12, y: 27, rayonM: 6 };
    expect(cellulesDeLaZone(40, zone)).toEqual(ancien(12, 27, 6));
  });

  it("l'aire et le périmètre restent ceux d'un disque", () => {
    expect(aireM2DeLaZone({ x: 0, y: 0, rayonM: 3 })).toBeCloseTo(Math.PI * 9, 12);
    expect(perimetreMDeLaZone({ x: 0, y: 0, rayonM: 3 })).toBeCloseTo(6 * Math.PI, 12);
  });
});

describe("la bande est une bande", () => {
  const horizontale: Zone = {
    forme: "bande",
    x: 20,
    y: 20,
    longueurM: 30,
    largeurM: 4,
    orientationRad: 0,
  };

  it("elle est longue dans son axe et étroite en travers", () => {
    expect(zoneContient(horizontale, 20, 20)).toBe(true);
    expect(zoneContient(horizontale, 34, 20)).toBe(true); // 14 m le long : dedans
    expect(zoneContient(horizontale, 36, 20)).toBe(false); // 16 m : dehors
    expect(zoneContient(horizontale, 20, 21.9)).toBe(true); // 1,9 m en travers
    expect(zoneContient(horizontale, 20, 22.1)).toBe(false); // 2,1 m : dehors
  });

  it("la tourner d'un quart de tour échange sa longueur et sa largeur", () => {
    const verticale: Zone = { ...horizontale, orientationRad: Math.PI / 2 };
    expect(zoneContient(verticale, 20, 34)).toBe(true);
    expect(zoneContient(verticale, 34, 20)).toBe(false);
    expect(zoneContient(verticale, 21.9, 20)).toBe(true);
    // Et à rotation près, elles couvrent le même nombre de cellules.
    expect(cellulesDeLaZone(40, verticale).length).toBe(cellulesDeLaZone(40, horizontale).length);
  });

  it("une bande en diagonale n'est ni l'une ni l'autre", () => {
    const diagonale: Zone = { ...horizontale, orientationRad: Math.PI / 4 };
    expect(zoneContient(diagonale, 20 + 10 / Math.SQRT2, 20 + 10 / Math.SQRT2)).toBe(true);
    expect(zoneContient(diagonale, 34, 20)).toBe(false);
  });

  it("son aire est celle d'un rectangle, et son périmètre aussi", () => {
    expect(aireM2DeLaZone(horizontale)).toBeCloseTo(120, 12);
    expect(perimetreMDeLaZone(horizontale)).toBeCloseTo(68, 12);
  });

  it("une bande trop fine pour toucher un centre de cellule en touche une quand même", () => {
    // Même garantie que le disque, et pour la même raison : un chantier désigné
    // agit quelque part. Une bande de 10 cm de large sur une grille au mètre ne
    // doit pas être un geste qui ne fait rien en silence.
    const fine: Zone = { ...horizontale, largeurM: 0.1, longueurM: 0.1 };
    expect(cellulesDeLaZone(40, fine).length).toBe(1);
  });

  it("elle se laisse borner par la parcelle, comme le disque", () => {
    const debordante: Zone = { ...horizontale, x: 0, y: 0, longueurM: 200, largeurM: 200 };
    expect(cellulesDeLaZone(40, debordante).length).toBe(40 * 40);
  });
});
