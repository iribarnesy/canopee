/**
 * Un message de mort ne doit pas se contredire.
 *
 * Le journal annonçait « 2 pins sur un sol hors de leur gamme de pH — sol à
 * pH 4,5, il leur en faut 4 à 7,5 ». Les deux moitiés de la phrase se
 * démentaient : 4,5 est dans [4 ; 7,5]. Deux causes, et aucune n'était le
 * mécanisme de survie, qui lui avait raison.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { facteurGammePh, plateauPh, RAMPE_PH } from "../../src/engine/soil";

describe("ce que le journal a le droit d'affirmer sur le pH", () => {
  it("le plateau annoncé est celui où l'espèce est VRAIMENT à plein régime", () => {
    // Le cœur de l'affaire : citer la gamme déclarée pendant qu'on applique le
    // plateau, c'est écrire un message faux. On vérifie donc les deux bouts du
    // plateau sur toutes les espèces, pas sur un échantillon.
    for (const espece of ESPECES_V0) {
      const [bas, haut] = plateauPh(espece.ph);
      expect(facteurGammePh(espece.ph, bas)).toBeCloseTo(1, 10);
      expect(facteurGammePh(espece.ph, haut)).toBeCloseTo(1, 10);
      // Et juste en dessous, l'espèce n'est plus à l'aise — sinon le message
      // promettrait un confort que le moteur ne donne pas.
      expect(facteurGammePh(espece.ph, bas - 0.1)).toBeLessThan(1);
    }
  });

  it("la gamme DÉCLARÉE, elle, est mortelle à ses propres bornes", () => {
    // Ce n'est pas un souhait, c'est l'état des lieux, et c'est pour ça que le
    // message ne doit surtout pas la citer. Le jour où ce test tombe, c'est que
    // le lot de recalibration est passé — et le message pourra redire la gamme.
    for (const espece of ESPECES_V0) {
      expect(facteurGammePh(espece.ph, espece.ph[0])).toBe(0);
      expect(facteurGammePh(espece.ph, espece.ph[1])).toBe(0);
    }
  });

  it("le pin sylvestre à pH 4,5 : le cas du journal, chiffré", () => {
    const pin = getEspece("pinus_sylvestris");
    expect(pin.ph).toEqual([4, 7.5]);
    // Le joueur lisait « il leur en faut 4 à 7,5 » et voyait mourir à 4,5.
    expect(facteurGammePh(pin.ph, 4.5)).toBeCloseTo(0.714, 3);
    // Ce qu'il faut lui dire : le plein régime commence à 4,7.
    expect(plateauPh(pin.ph)[0]).toBeCloseTo(4.7, 10);
  });

  it("le plateau se déduit de la rampe, il ne la recopie pas", () => {
    // Garde-fou contre la dérive : si quelqu'un change RAMPE_PH, le plateau
    // suit. Un 0,7 écrit en dur dans le worker aurait menti au prochain lot.
    for (const espece of ESPECES_V0) {
      expect(plateauPh(espece.ph)[0] - espece.ph[0]).toBeCloseTo(RAMPE_PH, 10);
      expect(espece.ph[1] - plateauPh(espece.ph)[1]).toBeCloseTo(RAMPE_PH, 10);
    }
  });
});
