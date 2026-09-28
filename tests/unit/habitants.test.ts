/**
 * **Où se pose un habitant** (#255, le rendu de #187).
 *
 * Ce que ces épreuves défendent : que le rendu **lise** l'ancrage du moteur et
 * n'en invente pas un second. Un habitant est attaché à un `arbreId` ; sa
 * position vient de lui, sa hauteur de l'arbre et du minimum de sa fiche, et
 * rien ne se pose sur un arbre qui n'est plus là.
 */

import { describe, expect, it } from "vitest";
import { especeFaune, type IndividuFaune } from "../../src/engine/faune";
import { gitesOccupes, PART_DE_LA_HAUTEUR } from "../../src/render/temps/habitants";

const habitant = (champs: Partial<IndividuFaune> = {}): IndividuFaune => ({
  id: 1,
  especeId: "mesange_bleue",
  arbreId: 7,
  x: 12.5,
  y: 30.5,
  depuisSemaine: 40,
  ...champs,
});

/** Un seul arbre sur la parcelle, aussi haut qu'on le demande. */
const arbre = (hauteurM: number) => (id: number) => (id === 7 ? hauteurM : undefined);

describe("le gîte se pose sur son arbre", () => {
  it("à la position que le moteur donne, et pas à celle de la cellule", () => {
    const [gite] = gitesOccupes([habitant()], arbre(18));
    expect(gite?.x).toBe(12.5);
    expect(gite?.y).toBe(30.5);
  });

  it("aux deux tiers de l'arbre, là où sont les fourches et les vieilles loges", () => {
    const [gite] = gitesOccupes([habitant()], arbre(18));
    expect(gite?.hauteurM).toBeCloseTo(18 * PART_DE_LA_HAUTEUR, 6);
  });

  it("jamais sous ce que l'espèce exige, même sur une tige basse", () => {
    // La mésange bleue demande deux mètres : sur un arbre de deux mètres, les
    // deux tiers en feraient 1,33 — un gîte sous son propre plancher.
    const minimum = especeFaune("mesange_bleue")?.hauteurGiteMinM ?? 0;
    expect(minimum).toBeGreaterThan(0);
    const [gite] = gitesOccupes([habitant()], arbre(2));
    expect(gite?.hauteurM).toBe(minimum);
  });

  it("ne se pose pas du tout quand l'arbre a quitté l'instantané", () => {
    // Un chablis consumé, une coupe : l'habitant est sur le départ et le moteur
    // le dira la semaine d'après. Le poser en l'air serait pire que rien.
    expect(gitesOccupes([habitant()], () => undefined)).toEqual([]);
  });

  it("ignore une espèce que l'atlas ne connaît pas, sans faire tomber la scène", () => {
    expect(gitesOccupes([habitant({ especeId: "licorne" })], arbre(18))).toEqual([]);
  });
});

describe("la teinte dit la famille de gîte", () => {
  it("un trou, une hutte et une aire ne portent pas la même couleur", () => {
    const de = (especeId: string) => gitesOccupes([habitant({ especeId })], arbre(18))[0]?.teinte;
    // Trois espèces de l'atlas, trois familles de gîte (`faune.ts`).
    const cavite = de("mesange_bleue");
    const hutte = de("ecureuil_roux");
    const aire = de("buse_variable");
    expect(cavite).toBeDefined();
    const toutes = [cavite, hutte, aire].map((t) => JSON.stringify(t));
    expect(new Set(toutes).size).toBe(3);
  });

  it("deux espèces du même gîte partagent la teinte : c'est la famille qu'on lit", () => {
    const une = gitesOccupes([habitant({ especeId: "mesange_bleue" })], arbre(18))[0];
    const autre = gitesOccupes([habitant({ especeId: "pic_epeiche" })], arbre(18))[0];
    expect(une?.teinte).toEqual(autre?.teinte);
  });
});
