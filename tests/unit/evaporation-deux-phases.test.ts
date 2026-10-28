/**
 * **L'évaporation d'un sol en deux phases** (FAO-56, Allen et al. 1998, éq. 71 à
 * 75 ; #391), intégrée sur la semaine.
 *
 * Tant que la couche de surface a perdu moins que REW, elle évapore à la
 * demande ; au-delà, de moins en moins ; une fois TEW perdu, plus rien. Ce que
 * ces essais gardent, ce sont les quatre propriétés qui font la différence avec
 * la quadratique d'avant, qui asséchait l'horizon entier.
 */

import { describe, expect, it } from "vitest";
import { horizon, ruHorizonMm } from "../../src/engine/soil";
import { eauFletrissementMmParCm } from "../../src/engine/tranches";
import {
  EPAISSEUR_EVAPORANTE_CM,
  eauEvaporableMm,
  evaporationEnDeuxPhases,
  PART_EVAPORABLE_A_PLEIN,
} from "../../src/engine/water";

const TEW = 25;
const REW = PART_EVAPORABLE_A_PLEIN * TEW;

describe("l'évaporation d'un sol en deux phases (FAO-56)", () => {
  it("mouillé, il évapore à la demande tant qu'elle reste sous REW", () => {
    expect(evaporationEnDeuxPhases(5, 0, TEW)).toBeCloseTo(5, 10);
    expect(evaporationEnDeuxPhases(REW, 0, TEW)).toBeCloseTo(REW, 10);
  });

  it("au-delà de REW, il rend de moins en moins que la demande", () => {
    const demande = 40;
    const e = evaporationEnDeuxPhases(demande, 0, TEW);
    expect(e).toBeGreaterThan(REW);
    expect(e).toBeLessThan(demande);
    // et jamais plus que son eau évaporable, quelle que soit la demande
    expect(evaporationEnDeuxPhases(10_000, 0, TEW)).toBeLessThanOrEqual(TEW + 1e-9);
  });

  it("une surface qui a perdu TEW n'évapore plus : l'eau du dessous est gardée", () => {
    expect(evaporationEnDeuxPhases(30, TEW, TEW)).toBe(0);
    expect(evaporationEnDeuxPhases(30, TEW + 10, TEW)).toBe(0);
  });

  it("plus la surface est sèche, moins elle évapore, et jamais plus que la demande", () => {
    let precedent = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= TEW; d += 0.5) {
      const e = evaporationEnDeuxPhases(20, d, TEW);
      expect(e).toBeLessThanOrEqual(precedent + 1e-12);
      expect(e).toBeLessThanOrEqual(20 + 1e-12);
      precedent = e;
    }
  });

  it("l'eau évaporable tombe dans les fourchettes du tableau 19 de FAO-56", () => {
    // Le limon riche (limon fin : 18 à 25 mm pour Ze = 0,10 m) et l'horizon de
    // surface de la lande (sable limoneux : 9 à 14 mm).
    const limon = horizon(35, { sable: 15, limon: 70, argile: 15 }, { moPct: 2.2, ph: 7 });
    const sable = horizon(20, { sable: 85, limon: 10, argile: 5 }, { moPct: 1.8, ph: 4.5 });
    const tew = (h: typeof limon) =>
      eauEvaporableMm(ruHorizonMm(h), h.epaisseurCm, eauFletrissementMmParCm(h));
    expect(EPAISSEUR_EVAPORANTE_CM).toBe(10);
    expect(tew(limon)).toBeGreaterThanOrEqual(18);
    expect(tew(limon)).toBeLessThanOrEqual(25);
    expect(tew(sable)).toBeGreaterThanOrEqual(9);
    expect(tew(sable)).toBeLessThanOrEqual(14);
  });
});
