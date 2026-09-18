/**
 * Ce que la réponse au pH a le droit d'affirmer.
 *
 * Trouvé en jouant : « 2 pins sylvestres sur un sol hors de leur gamme de pH —
 * sol à pH 4,5, il leur en faut 4 à 7,5 ». Les deux moitiés de la phrase se
 * démentaient, et c'était le calcul qui avait tort : la rampe touchait zéro AUX
 * BORNES de l'amplitude, si bien que chaque espèce mourait à coup sûr au pH que
 * l'atlas lui donne pour tolérable.
 *
 * La réponse est désormais unimodale, ce que mesurent les relevés (modèles de
 * Huisman-Olff-Fresco). Ces essais tiennent les trois points qui la définissent.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { facteurGammePh, VIGUEUR_A_LA_BORNE } from "../../src/engine/soil";

describe("la réponse au pH est unimodale, pas un plateau à falaise", () => {
  it("aux bornes de l'atlas, l'espèce est handicapée mais VIVANTE", () => {
    // Le défaut d'origine, épinglé à l'envers : `f(borne)` valait 0 pour les 26.
    // Une amplitude de présence dit où l'espèce se trouve, pas où elle meurt.
    for (const espece of ESPECES_V0) {
      for (const borne of espece.ph) {
        const f = facteurGammePh(espece.ph, borne);
        expect(f).toBeGreaterThan(0.3);
        expect(f).toBeLessThan(0.7);
      }
    }
  });

  it("l'optimum est plein, et il est seul à l'être", () => {
    for (const espece of ESPECES_V0) {
      const [min, max] = espece.ph;
      const centre = (min + max) / 2;
      expect(facteurGammePh(espece.ph, centre)).toBe(1);
      // Strictement décroissant en s'écartant : c'est ce que « unimodal » veut
      // dire, et c'est ce qui permet au pH de TRIER les espèces (bio-indication).
      expect(facteurGammePh(espece.ph, centre + 0.4)).toBeLessThan(1);
      expect(facteurGammePh(espece.ph, centre - 0.4)).toBeLessThan(1);
    }
  });

  it("au-delà de la marge, plus rien — et la marge a un mécanisme", () => {
    // Vers l'acide c'est l'aluminium échangeable qui prend le relais, vers le
    // basique la chlorose calcaire. Le zéro est dehors, pas sur la borne.
    for (const espece of ESPECES_V0) {
      const [min, max] = espece.ph;
      // PILE à la marge, l'arrondi flottant laisse parfois 9·10⁻¹⁶ : c'est zéro
      // pour tout ce qui s'en sert, et le prétendre exact serait un test qui
      // ment. Au-delà, en revanche, on exige le zéro franc.
      expect(facteurGammePh(espece.ph, min - VIGUEUR_A_LA_BORNE)).toBeLessThan(1e-12);
      expect(facteurGammePh(espece.ph, max + VIGUEUR_A_LA_BORNE)).toBeLessThan(1e-12);
      expect(facteurGammePh(espece.ph, min - VIGUEUR_A_LA_BORNE - 0.01)).toBe(0);
      expect(facteurGammePh(espece.ph, max + VIGUEUR_A_LA_BORNE + 0.01)).toBe(0);
    }
  });

  it("le pin sylvestre à pH 4,5 : le cas du journal, chiffré", () => {
    const pin = getEspece("pinus_sylvestris");
    expect(pin.ph).toEqual([4, 7.5]);
    // Il souffre — le journal avait raison de le dire — mais il n'est plus
    // condamné à sa propre borne : à pH 4 il lui reste la moitié de son régime.
    expect(facteurGammePh(pin.ph, 4.5)).toBeCloseTo(0.74, 2);
    expect(facteurGammePh(pin.ph, 4)).toBeCloseTo(0.49, 2);
    // Et le pin est l'essence des podzols : à 4, il vit.
    expect(facteurGammePh(pin.ph, 4)).toBeGreaterThan(0);
  });

  it("le pH trie toujours : un calcicole ne pousse pas sur un podzol", () => {
    // La bio-indication est la raison d'être de ce facteur (C7). Elle doit
    // survivre au correctif, sinon on a réparé une borne et cassé le tri.
    const podzol = 4.2;
    expect(facteurGammePh(getEspece("cornus_mas").ph, podzol)).toBe(0);
    expect(facteurGammePh(getEspece("juglans_regia").ph, podzol)).toBe(0);
    expect(facteurGammePh(getEspece("calluna_vulgaris").ph, podzol)).toBeGreaterThan(0.8);
    expect(facteurGammePh(getEspece("ulex_europaeus").ph, podzol)).toBeGreaterThan(0.8);
  });
});
