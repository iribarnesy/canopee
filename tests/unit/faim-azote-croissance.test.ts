/**
 * **La faim d'azote freine la croissance deux fois** (#461).
 *
 * La carence freine la croissance des feuilles et l'efficience du rayonnement,
 * deux freins qui suivent l'indice de nutrition azotée de la même façon et qui
 * se multiplient (STICS, Beaudoin et al. 2022, § 4.4.2) : la croissance suit le
 * carré de l'indice, borné au plancher de 0,3 que STICS donne à ses indices.
 */

import { describe, expect, it } from "vitest";
import {
  azoteCritiqueG,
  facteurAzoteDeLaCroissance,
  INDICE_NUTRITION_PLANCHER,
} from "../../src/engine/herbe";

describe("ce que la faim d'azote laisse de la croissance", () => {
  const matiere = 400; // g/m², 4 t/ha
  const critique = azoteCritiqueG(matiere);

  it("une plante nourrie pousse à son potentiel, et l'excès n'y ajoute rien", () => {
    expect(facteurAzoteDeLaCroissance(matiere, critique)).toBe(1);
    expect(facteurAzoteDeLaCroissance(matiere, 2 * critique)).toBe(1);
  });

  it("sous la courbe critique, la croissance suit le carré de l'indice", () => {
    expect(facteurAzoteDeLaCroissance(matiere, 0.5 * critique)).toBeCloseTo(0.25, 12);
    expect(facteurAzoteDeLaCroissance(matiere, 0.8 * critique)).toBeCloseTo(0.64, 12);
  });

  it("sous le plancher, la carence ne freine plus davantage", () => {
    const auPlancher = INDICE_NUTRITION_PLANCHER ** 2;
    expect(facteurAzoteDeLaCroissance(matiere, 0.2 * critique)).toBeCloseTo(auPlancher, 12);
    expect(facteurAzoteDeLaCroissance(matiere, 0)).toBeCloseTo(auPlancher, 12);
  });

  it("une plante sans matière n'a pas de teneur : elle est tenue pour nourrie", () => {
    expect(facteurAzoteDeLaCroissance(0, 0)).toBe(1);
  });
});
