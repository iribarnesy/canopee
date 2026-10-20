/**
 * **Ce qui se cueille dans une sélection** (#416) : les vivants qui portent des
 * fruits, et eux seuls — le moteur refuse de récolter un mort.
 */

import { describe, expect, it } from "vitest";
import { recoltables } from "../../src/game/panneaux/PanneauSelection";

const arbre = (id: number, chandelle: boolean, fruitsKg: number) => ({ id, chandelle, fruitsKg });

describe("ce qui se cueille dans une sélection (#416)", () => {
  it("laisse les chandelles, même chargées de fruits", () => {
    // Les morts d'une sécheresse d'octobre gardent leurs fruits jusqu'au
    // 1er janvier ; le moteur répondrait « introuvable ou mort » à chacun.
    expect(recoltables([arbre(1, true, 12), arbre(2, true, 70)])).toEqual([]);
  });

  it("garde les vivants qui portent quelque chose, et seulement eux", () => {
    const choisis = recoltables([arbre(1, false, 8), arbre(2, true, 70), arbre(3, false, 0)]);
    expect(choisis.map((t) => t.id)).toEqual([1]);
  });
});
