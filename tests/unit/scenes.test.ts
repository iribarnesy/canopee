/**
 * LA RÈGLE DU MODE CINÉMA (`src/game/scenes.ts`, #128 / §6.8).
 *
 * Deux défauts qu'on ne voit pas en jouant une heure, et que cet essai borne :
 * une scène qui ne se déclenche JAMAIS, et une scène qui se déclenche toutes
 * les trois semaines. Les chiffres sont ceux des parcelles réelles du jeu — une
 * ronceraie de deux mille huit cents tiges, un verger de treize pommiers.
 */

import { describe, expect, it } from "vitest";
import {
  estUneMortaliteDeMasse,
  estUneTempeteAVoir,
  PART_POUR_UNE_SCENE,
  TIGES_POUR_UNE_SCENE,
} from "../../src/game/scenes";

describe("une mortalité de masse", () => {
  it("ne s'arrête pas pour le bruit de fond d'une ronceraie", () => {
    // Mesuré dans le jeu : vingt ans du verger donnent 90 morts d'ombre
    // étalées sur six ans, sur un peuplement de plus de deux mille tiges.
    expect(estUneMortaliteDeMasse(15, 2800)).toBe(false);
    expect(estUneMortaliteDeMasse(90, 2800)).toBe(false);
  });

  it("s'arrête quand un peuplement perd une vraie part de lui-même", () => {
    expect(estUneMortaliteDeMasse(140, 2800)).toBe(true);
    expect(estUneMortaliteDeMasse(900, 2800)).toBe(true);
  });

  it("demande les DEUX conditions, et pas l'une ou l'autre", () => {
    // Assez grosse en part, trop peu d'arbres : une friche de quinze tiges qui
    // en perd deux n'est pas une catastrophe.
    expect(estUneMortaliteDeMasse(2, 15)).toBe(false);
    // Assez d'arbres, part dérisoire.
    expect(estUneMortaliteDeMasse(TIGES_POUR_UNE_SCENE, 10_000)).toBe(false);
    // Les deux tenues, au seuil exact.
    expect(
      estUneMortaliteDeMasse(TIGES_POUR_UNE_SCENE, TIGES_POUR_UNE_SCENE / PART_POUR_UNE_SCENE),
    ).toBe(true);
  });

  it("ne divise pas par zéro sur une parcelle vide", () => {
    expect(estUneMortaliteDeMasse(0, 0)).toBe(false);
  });
});

describe("une tempête", () => {
  it("s'arrête sur le nombre seul, sans condition de part", () => {
    // Trente arbres couchés se regardent, qu'il en reste mille ou cinquante :
    // la tempête a une cause unique et datée.
    expect(estUneTempeteAVoir(30)).toBe(true);
    expect(estUneTempeteAVoir(TIGES_POUR_UNE_SCENE)).toBe(true);
  });

  it("laisse passer une rafale qui ne couche que quelques tiges", () => {
    expect(estUneTempeteAVoir(TIGES_POUR_UNE_SCENE - 1)).toBe(false);
    expect(estUneTempeteAVoir(0)).toBe(false);
  });
});
