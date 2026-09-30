/**
 * **Le givre et la brume disent le moteur, et ne restent pas** (#130, lot L10).
 *
 * Le givre tombe là où la nuit la plus froide est passée sous zéro **au sol**,
 * couvert compris, et c'est la fonction du moteur qui le décide. La brume se
 * pose là où la nappe affleure, et le vent la chasse. Tous deux sont des
 * matins : à la fin, il n'en reste rien.
 */

import { describe, expect, it } from "vitest";
import { fermetureDuCouvert, tMinimumSousCouvert } from "../../src/engine/microclimat";
import {
  brumeEnCours,
  cellulesAffleurantes,
  LEVEE_DE_LA_BRUME_MS,
  VENT_QUI_CHASSE_MS,
} from "../../src/render/temps/brume";
import { cellulesGelees, FONTE_DU_GIVRE_MS, givreEnCours } from "../../src/render/temps/givre";
import { CIEL_D_ETE, CIEL_D_HIVER, fondDuCiel, GRIS_DE_PLUIE } from "../../src/render/temps/pluie";

describe("le givre", () => {
  it("ne blanchit rien quand la nuit n'a pas gelé", () => {
    expect(cellulesGelees(2, new Float32Array(16).fill(1))).toEqual([]);
  });

  it("blanchit le découvert et épargne ce que la futaie protège", () => {
    // −0,5 °C à découvert : sous un couvert fermé, le moteur remonte le
    // minimum au-dessus de zéro.
    const lumiere = Float32Array.from([1, 1, 0.05, 0.05]);
    expect(tMinimumSousCouvert(-0.5, fermetureDuCouvert(0.05))).toBeGreaterThan(0);
    expect(cellulesGelees(-0.5, lumiere).map((g) => g.cellule)).toEqual([0, 1]);
  });

  it("suit le froid : une nuit à −6 °C blanchit plus qu'une à −1 °C", () => {
    const [leger] = cellulesGelees(-1, [1]);
    const [franc] = cellulesGelees(-6, [1]);
    expect(franc?.force ?? 0).toBeGreaterThan(leger?.force ?? 0);
    expect(franc?.force).toBe(1);
  });

  it("est un matin : là à l'arrivée de la semaine, fondu ensuite, sans rien laisser", () => {
    // Une gelée légère : les plaques ne fondent pas toutes au même instant.
    const gelees = cellulesGelees(-1, new Float32Array(64).fill(1));
    expect(givreEnCours(gelees, 0).length).toBe(64);
    expect(givreEnCours(gelees, FONTE_DU_GIVRE_MS * 0.8).length).toBeLessThan(64);
    expect(givreEnCours(gelees, FONTE_DU_GIVRE_MS)).toEqual([]);
    // Et à aucun instant, un voile ne dépasse ce que la cellule a à dire.
    for (const t of [0, 500, 1500, 3000]) {
      for (const v of givreEnCours(gelees, t)) expect(v.opacite).toBeLessThanOrEqual(1);
    }
  });

  it("s'estompe sans remonter : le blanc d'une cellule ne revient pas", () => {
    const gelees = cellulesGelees(-3, [1]);
    let avant = Number.POSITIVE_INFINITY;
    for (let t = 0; t < FONTE_DU_GIVRE_MS; t += 100) {
      const o = givreEnCours(gelees, t)[0]?.opacite ?? 0;
      expect(o).toBeLessThanOrEqual(avant);
      avant = o;
    }
  });
});

describe("la brume", () => {
  it("se pose là où la nappe affleure, et seulement là", () => {
    expect(cellulesAffleurantes([0, 40, 0, 300, Number.POSITIVE_INFINITY])).toEqual([0, 2]);
  });

  it("est un matin : elle se lève, et il n'en reste rien", () => {
    const creux = Array.from({ length: 400 }, (_, i) => i);
    expect(brumeEnCours(creux, 20, 0, 0).length).toBeGreaterThan(0);
    expect(brumeEnCours(creux, 20, 0, LEVEE_DE_LA_BRUME_MS)).toEqual([]);
  });

  it("une brise la chasse, un matin calme la garde", () => {
    const creux = Array.from({ length: 400 }, (_, i) => i);
    const calme = brumeEnCours(creux, 20, 0, 0);
    const brise = brumeEnCours(creux, 20, VENT_QUI_CHASSE_MS / 2, 0);
    expect(Math.max(...brise.map((b) => b.opacite))).toBeLessThan(
      Math.max(...calme.map((b) => b.opacite)),
    );
    expect(brumeEnCours(creux, 20, VENT_QUI_CHASSE_MS, 0)).toEqual([]);
    // Et elle se lève plus tôt sous la brise.
    const tard = LEVEE_DE_LA_BRUME_MS * 0.8;
    expect(brumeEnCours(creux, 20, VENT_QUI_CHASSE_MS / 2, tard).length).toBeLessThan(
      brumeEnCours(creux, 20, 0, tard).length,
    );
  });

  it("ses bouffées restent dans leur cellule", () => {
    for (const b of brumeEnCours([0, 21, 399], 20, 0, 0)) {
      const cellule = Math.floor(b.y) * 20 + Math.floor(b.x);
      expect([0, 21, 399]).toContain(cellule);
    }
  });
});

describe("le fond du ciel", () => {
  it("porte la saison : l'hiver froid, l'été chaud", () => {
    expect(fondDuCiel(0, 0)).toEqual(CIEL_D_HIVER);
    const juillet = fondDuCiel(26, 0);
    expect(juillet.r).toBeCloseTo(CIEL_D_ETE.r, 0);
    expect(juillet.b).toBeCloseTo(CIEL_D_ETE.b, 0);
    expect(fondDuCiel(0, 0).b).toBeGreaterThan(fondDuCiel(26, 0).b);
  });

  it("grisonne sous la pluie", () => {
    const beau = fondDuCiel(20, 0);
    const pluie = fondDuCiel(20, 1);
    const distance = (a: typeof beau, b: typeof beau) =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(distance(pluie, GRIS_DE_PLUIE)).toBeLessThan(distance(beau, GRIS_DE_PLUIE));
  });
});
