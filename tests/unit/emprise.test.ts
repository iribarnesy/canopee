/**
 * **Le contour d'une zone de chantier** (#205).
 *
 * Ce que ces épreuves défendent : que le rendu dessine la zone **que le moteur
 * traitera**, et qu'un tracé de deux points donne la bande que le joueur a
 * montrée. L'orientation en radians est la seule chose qu'il ne saisit jamais ;
 * c'est donc la seule qu'on vérifie de près.
 */

import { describe, expect, it } from "vitest";
import { cellulesDeLaZone, zoneContient } from "../../src/engine/zone";
import { bandeDuTrace, contourDeLaZone, PAS_DU_CONTOUR_M } from "../../src/render/emprise";

describe("le contour suit la forme du moteur", () => {
  it("un disque se ferme sur lui-même, à son rayon", () => {
    const contour = contourDeLaZone({ x: 20, y: 30, rayonM: 8 });
    expect(contour.length).toBeGreaterThan(16);
    for (const p of contour) {
      expect(Math.hypot(p.x - 20, p.y - 30)).toBeCloseTo(8, 6);
    }
    // Le contour se **referme** : le dernier jalon retombe sur le premier, au
    // flottant près (cos(2π) n'est pas cos(0) au bit près).
    const premier = contour[0];
    const dernier = contour[contour.length - 1];
    expect(
      Math.hypot((dernier?.x ?? 0) - (premier?.x ?? 0), (dernier?.y ?? 0) - (premier?.y ?? 0)),
    ).toBeLessThan(1e-9);
  });

  it("un rayon nul ne dessine rien : c'est la plantation, qui vise un point", () => {
    expect(contourDeLaZone({ x: 5, y: 5, rayonM: 0 })).toEqual([]);
  });

  it("une bande passe par ses quatre coins, et par eux seuls", () => {
    // Orientation nulle = vers l'est, comme partout dans le moteur.
    const bande = {
      zone: "bande" as const,
      x: 50,
      y: 50,
      longueurM: 40,
      largeurM: 4,
      orientationRad: 0,
    };
    const contour = contourDeLaZone(bande);
    const xs = contour.map((p) => p.x);
    const ys = contour.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(30, 6);
    expect(Math.max(...xs)).toBeCloseTo(70, 6);
    expect(Math.min(...ys)).toBeCloseTo(48, 6);
    expect(Math.max(...ys)).toBeCloseTo(52, 6);
  });

  it("le contour est jalonné, parce qu'un côté de bande suit le relief", () => {
    // Un côté droit à plat ne l'est plus sur une butte : la scène relève
    // l'altitude de chaque jalon, encore faut-il qu'il y en ait.
    const contour = contourDeLaZone({
      zone: "bande",
      x: 50,
      y: 50,
      longueurM: 40,
      largeurM: 4,
      orientationRad: 0,
    });
    expect(contour.length).toBeGreaterThanOrEqual((2 * (40 + 4)) / PAS_DU_CONTOUR_M);
  });

  it("tout le contour d'une bande lui appartient, selon le MOTEUR", () => {
    // La garantie qui compte : ce qu'on dessine est ce qui sera traité. On
    // rentre d'un chouïa pour ne pas juger le bord au flottant près.
    const bande = {
      zone: "bande" as const,
      x: 40,
      y: 60,
      longueurM: 30,
      largeurM: 6,
      orientationRad: Math.PI / 5,
    };
    for (const p of contourDeLaZone(bande)) {
      const versLeCentre = { x: p.x + (bande.x - p.x) * 0.02, y: p.y + (bande.y - p.y) * 0.02 };
      expect(zoneContient(bande, versLeCentre.x, versLeCentre.y), `${p.x},${p.y}`).toBe(true);
    }
  });

  it("une bande tournée d'un quart de tour couvre les mêmes cellules, à l'échange près", () => {
    const est = cellulesDeLaZone(100, {
      zone: "bande",
      x: 50,
      y: 50,
      longueurM: 30,
      largeurM: 6,
      orientationRad: 0,
    });
    const nord = cellulesDeLaZone(100, {
      zone: "bande",
      x: 50,
      y: 50,
      longueurM: 30,
      largeurM: 6,
      orientationRad: Math.PI / 2,
    });
    expect(nord.length).toBe(est.length);
  });
});

describe("le tracé, qui épargne les radians au joueur", () => {
  it("prend le milieu pour centre, la distance pour longueur", () => {
    const bande = bandeDuTrace({ x: 10, y: 20 }, { x: 40, y: 20 }, 4);
    expect(bande?.zone).toBe("bande");
    if (bande?.zone !== "bande") throw new Error("pas une bande");
    expect([bande.x, bande.y]).toEqual([25, 20]);
    expect(bande.longueurM).toBeCloseTo(30, 6);
    expect(bande.largeurM).toBe(4);
    expect(bande.orientationRad).toBeCloseTo(0, 6);
  });

  it("l'orientation vient des deux points, zéro vers l'est", () => {
    const versLeNord = bandeDuTrace({ x: 10, y: 10 }, { x: 10, y: 40 }, 3);
    if (versLeNord?.zone !== "bande") throw new Error("pas une bande");
    expect(versLeNord.orientationRad).toBeCloseTo(Math.PI / 2, 6);
    const enDiagonale = bandeDuTrace({ x: 0, y: 0 }, { x: 10, y: 10 }, 3);
    if (enDiagonale?.zone !== "bande") throw new Error("pas une bande");
    expect(enDiagonale.orientationRad).toBeCloseTo(Math.PI / 4, 6);
  });

  it("deux clics au même endroit ne font pas une bande", () => {
    // Il n'y a pas d'orientation à tirer d'un point, et une bande de longueur
    // nulle ne couvre rien : mieux vaut ne rien facturer.
    expect(bandeDuTrace({ x: 7, y: 7 }, { x: 7, y: 7 }, 4)).toBeUndefined();
    expect(bandeDuTrace({ x: 7, y: 7 }, { x: 20, y: 7 }, 0)).toBeUndefined();
  });

  it("la bande tracée contient ses deux extrémités", () => {
    // C'est la promesse faite au joueur : ce qu'il a montré est dedans.
    const depart = { x: 12, y: 34 };
    const arrivee = { x: 56, y: 78 };
    const bande = bandeDuTrace(depart, arrivee, 5);
    if (!bande) throw new Error("pas de bande");
    for (const p of [depart, arrivee]) {
      const versLeCentre = { x: p.x + (bande.x - p.x) * 0.01, y: p.y + (bande.y - p.y) * 0.01 };
      expect(zoneContient(bande, versLeCentre.x, versLeCentre.y)).toBe(true);
    }
  });
});
