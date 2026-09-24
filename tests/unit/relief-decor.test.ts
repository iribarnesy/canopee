/**
 * **Le versant se lit dans le décor** (#150).
 *
 * Retour de partie : sur une station en pente, les voisins paraissent posés au
 * même niveau que la parcelle.
 *
 * **Rien n'était débranché**, contrairement à ce que l'issue envisageait en
 * second : `penteMoyenne` rend la bonne pente, `altitudeDecor` la prolonge, et
 * les quads du décor comme ses masses sont dessinés à leur propre altitude.
 * Le défaut est ailleurs, et il est géométrique : **une projection isométrique
 * d'un plan uniformément incliné est indiscernable d'un plan horizontal**.
 * Elle le décale à l'écran, elle ne le déforme pas ; sa pente est constante,
 * donc l'ombrer par la pente donnerait une teinte uniforme.
 *
 * L'altitude, elle, varie d'un bout de l'image à l'autre sur un versant. C'est
 * elle qu'on teint — la perspective aérienne des peintres, et la grandeur que
 * le décor calcule déjà pour se placer.
 */

import { describe, expect, it } from "vitest";
import { altitudeParCellule } from "../../src/engine/relief";
import {
  altitudeDecor,
  altitudeMoyenneParcelle,
  clarteDuRelief,
  penteMoyenne,
} from "../../src/render/couches/decor";

const COTE = 100;

function terrain(pentePct: number) {
  return altitudeParCellule(
    { altitudeM: 100, pentePct, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
    { widthM: COTE, heightM: COTE },
  );
}

describe("la teinte du décor suit l'altitude", () => {
  it("au niveau de la parcelle, elle ne change rien", () => {
    expect(clarteDuRelief(12, 12)).toBe(1);
  });

  it("l'amont s'éclaircit, l'aval s'assombrit", () => {
    expect(clarteDuRelief(5, 0)).toBeGreaterThan(1);
    expect(clarteDuRelief(-5, 0)).toBeLessThan(1);
  });

  /**
   * La borne existe pour que le décor ne se mette pas à concurrencer la
   * parcelle sur un versant à 40 %, ce que l'issue interdit nommément.
   */
  it("et la teinte sature, quelle que soit la hauteur du versant", () => {
    const tresHaut = clarteDuRelief(1000, 0);
    expect(tresHaut).toBeLessThanOrEqual(1.25);
    expect(clarteDuRelief(-1000, 0)).toBeGreaterThanOrEqual(0.75);
    // Symétrique : un versant qui monte et un qui descend s'écartent d'autant.
    expect(tresHaut - 1).toBeCloseTo(1 - clarteDuRelief(-1000, 0), 10);
  });

  /**
   * La propriété qui compte vraiment : sur un versant, deux points opposés du
   * décor n'ont **pas** la même teinte — et sur un plat, si.
   */
  it("un plat ne crée pas de versant, un versant en crée un", () => {
    const ecartDeTeinte = (pentePct: number) => {
      const alt = terrain(pentePct);
      const moy = altitudeMoyenneParcelle(alt, COTE);
      const p = penteMoyenne(alt, COTE);
      const amont = altitudeDecor(alt, COTE, moy, 50, -30, p);
      const aval = altitudeDecor(alt, COTE, moy, 50, COTE + 30, p);
      return Math.abs(clarteDuRelief(amont, moy) - clarteDuRelief(aval, moy));
    };
    expect(ecartDeTeinte(0)).toBeCloseTo(0, 6);
    expect(ecartDeTeinte(6)).toBeGreaterThan(0.05);
    expect(ecartDeTeinte(20)).toBeGreaterThan(ecartDeTeinte(6));
  });

  /**
   * Et le contrôle qui dit que le mécanisme du décor n'était **pas** en cause :
   * la pente moyenne d'un versant sud est bien lue, sur l'axe qui porte la
   * pente et sur lui seul.
   */
  it("la pente moyenne d'un versant sud se lit sur y, et vaut la pente", () => {
    for (const pct of [1, 6, 20, 40]) {
      const [dzdx, dzdy] = penteMoyenne(terrain(pct), COTE);
      expect(dzdx).toBeCloseTo(0, 6);
      expect(dzdy).toBeCloseTo(pct / 100, 4);
    }
  });
});
