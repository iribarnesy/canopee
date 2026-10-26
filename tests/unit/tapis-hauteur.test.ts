/**
 * **Le tapis à la hauteur que le moteur publie, et sa paille** (#436).
 *
 * Depuis #370, l'instantané donne par espèce la hauteur des touffes là où elle
 * se tient (`soilHerbeHauteursCm`) et la part morte de ce qui est sur pied
 * (`soilHerbePartsMortes`). Le rendu les compose sur l'emprise, comme le moteur
 * le dit, et en tire la taille des touffes et la paille du tapis. Les essais
 * ci-dessous gardent trois choses : la composition, la finesse des paliers de
 * hauteur (une fauche doit se voir), et le fait que la paille vient de la part
 * morte et non plus de la biomasse.
 */

import { describe, expect, it } from "vitest";
import { donneesSolDe, type SolSource } from "../../src/game/parcelle";
import { composerLeTapis } from "../../src/render/couches/tapis";
import {
  couleurHerbe,
  HAUTEUR_DU_TAPIS_PLEINE_M,
  hauteurDuPalier,
  PALIERS_DE_HAUTEUR,
  palierDeHauteur,
  quantifier,
  signatureCellule,
} from "../../src/render/palette";

const octets = (...v: number[]) => Uint8Array.from(v);

describe("la composition d'une cellule sur l'emprise des espèces", () => {
  it("pondère la hauteur et la part morte par l'emprise", () => {
    // Cellule 0 : dactyle aux trois quarts (40 cm, vert), anémone au quart
    // (12 cm, toute morte). Cellule 1 : dactyle seul.
    const { hauteurM, partMorte } = composerLeTapis(
      [octets(192, 255), octets(64, 0)],
      [octets(40, 30), octets(12, 99)],
      [octets(0, 51), octets(255, 255)],
      2,
    );
    expect(hauteurM[0]).toBeCloseTo((0.75 * 40 + 0.25 * 12) / 100, 5);
    expect(partMorte[0]).toBeCloseTo(0.25, 5);
    // L'anémone n'y est pas : sa hauteur ne compte pas, si grande soit-elle.
    expect(hauteurM[1]).toBeCloseTo(0.3, 5);
    expect(partMorte[1]).toBeCloseTo(0.2, 5);
  });

  it("une cellule que personne ne tient n'a ni hauteur ni paille", () => {
    const { hauteurM, partMorte } = composerLeTapis([octets(0)], [octets(50)], [octets(200)], 1);
    expect(hauteurM[0]).toBe(0);
    expect(partMorte[0]).toBe(0);
  });

  it("le jeu les compose quand l'instantané les porte, et pas sinon", () => {
    const base: SolSource = {
      coteM: 1,
      ruMm: 100,
      altitudesM: [0],
      waterMm: [0],
      herbe: [1],
      herbeBiomasse: [0.5],
      litiereCG: [0],
      herbeEmprises: [octets(255)],
      herbesIds: ["dactylis_glomerata"],
    };
    const sans = donneesSolDe(base);
    expect(sans.herbeHauteurM).toBeUndefined();
    expect(sans.herbePartMorte).toBeUndefined();
    const avec = donneesSolDe({
      ...base,
      herbeHauteursCm: [octets(36)],
      herbePartsMortes: [octets(128)],
    });
    expect(avec.herbeHauteurM?.[0]).toBeCloseTo(0.36, 5);
    expect(avec.herbePartMorte?.[0]).toBeCloseTo(128 / 255, 5);
  });
});

describe("les paliers de hauteur", () => {
  it("une fauche ne tombe pas dans le palier d'une pelouse de février", () => {
    // Après un pré de juin, 3 à 6 cm ; le dactyle de février, 12 cm.
    expect(palierDeHauteur(0.04)).not.toBe(palierDeHauteur(0.12));
    expect(palierDeHauteur(0.12)).not.toBe(palierDeHauteur(0.36));
  });

  it("chaque palier se relit dans sa tranche", () => {
    for (let p = 1; p < PALIERS_DE_HAUTEUR; p++) {
      expect(palierDeHauteur(hauteurDuPalier(p))).toBe(p);
    }
  });

  it("sans matière sur pied, pas de touffe ; au-delà du mètre, le dernier palier", () => {
    expect(hauteurDuPalier(palierDeHauteur(0))).toBe(0);
    expect(palierDeHauteur(2.55)).toBe(PALIERS_DE_HAUTEUR - 1);
    expect(hauteurDuPalier(PALIERS_DE_HAUTEUR - 1)).toBeLessThanOrEqual(HAUTEUR_DU_TAPIS_PLEINE_M);
  });

  it("une fauche change la signature : le morceau se recuit", () => {
    const base = { humidite: 0.5, herbe: 0.8, herbeBiomasse: 0.4, litiereCG: 0 };
    const pre = signatureCellule(quantifier({ ...base, hauteurM: 0.36, partMorte: 0.2 }));
    const fauche = signatureCellule(quantifier({ ...base, hauteurM: 0.04, partMorte: 0.2 }));
    const paille = signatureCellule(quantifier({ ...base, hauteurM: 0.36, partMorte: 0.8 }));
    const sans = signatureCellule(quantifier(base));
    expect(fauche).not.toBe(pre);
    expect(paille).not.toBe(pre);
    // « Absente » n'est pas « nulle » : une scène sans la donnée ne se confond
    // pas avec un tapis ras et vert.
    expect(sans).not.toBe(signatureCellule(quantifier({ ...base, hauteurM: 0, partMorte: 0 })));
  });
});

describe("la paille vient de la part morte", () => {
  const ETE = 26;
  const clarte = (t: { r: number; g: number; b: number }) => t.r + t.g + t.b;

  it("un tapis mort à moitié est plus blond qu'un tapis vert, à biomasse égale", () => {
    const vert = couleurHerbe(ETE, 0.6, 1, undefined, 0);
    const mi = couleurHerbe(ETE, 0.6, 1, undefined, 0.5);
    const mort = couleurHerbe(ETE, 0.6, 1, undefined, 1);
    expect(clarte(mi)).toBeGreaterThan(clarte(vert));
    expect(clarte(mort)).toBeGreaterThan(clarte(mi));
  });

  it("une prairie haute et verte n'est plus prise pour du foin", () => {
    // La biomasse en tenait lieu : beaucoup de matière, donc blonde.
    const pleine = couleurHerbe(ETE, 1, 1, undefined, 0);
    const rase = couleurHerbe(ETE, 0, 1, undefined, 0);
    expect(pleine).toEqual(rase);
  });

  it("sans la part morte, la teinte ne bouge pas de ce qu'elle était", () => {
    const avant = couleurHerbe(ETE, 0.8, 1);
    expect(couleurHerbe(ETE, 0.8, 1, undefined, undefined)).toEqual(avant);
    expect(avant).not.toEqual(couleurHerbe(ETE, 0, 1));
  });
});
