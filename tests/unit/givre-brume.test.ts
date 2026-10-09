/**
 * **Le givre et la brume disent le moteur** (#130, lot L10).
 *
 * Le givre tombe là où la nuit la plus froide est passée sous zéro **au sol**,
 * couvert compris, et c'est la fonction du moteur qui le décide ; il reste la
 * semaine qui a gelé. La brume se pose là où la nappe affleure, le vent la
 * chasse, et c'est un matin : à la fin, il n'en reste rien.
 */

import { describe, expect, it } from "vitest";
import { fermetureDuCouvert, tMinimumSousCouvert } from "../../src/engine/microclimat";
import { phraseDuGel } from "../../src/game/useAvisDuGel";
import {
  brumeEnCours,
  cellulesAffleurantes,
  LEVEE_DE_LA_BRUME_MS,
  VENT_QUI_CHASSE_MS,
} from "../../src/render/temps/brume";
import {
  cellulesGelees,
  givreDeLaSemaine,
  HAUTEUR_DU_BRIN_GIVRE_M,
  HERBE_QUI_GIVRE,
  OPACITE_DU_GIVRE,
} from "../../src/render/temps/givre";
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

  it("est un état de la semaine : un calque, une opacité, sur les cellules gelées", () => {
    // −0,5 °C à découvert : sous un couvert fermé, le moteur remonte le minimum.
    const gelees = cellulesGelees(-0.5, Float32Array.from([1, 1, 0.05, 1]));
    const givre = givreDeLaSemaine(gelees);
    expect(givre?.cellules).toEqual([0, 1, 3]);
    expect(givre?.opacite).toBeGreaterThan(0);
    // Léger : une gelée blanche laisse voir le sol.
    expect(givre?.opacite).toBeLessThanOrEqual(OPACITE_DU_GIVRE);
  });

  it("une nuit franche blanchit plus qu'une gelée légère", () => {
    const leger = givreDeLaSemaine(cellulesGelees(-0.5, [1, 1]));
    const franc = givreDeLaSemaine(cellulesGelees(-6, [1, 1]));
    expect(franc?.opacite ?? 0).toBeGreaterThan(leger?.opacite ?? 0);
  });

  it("pose ses brins givrés sur l'herbe, et un simple voile sur la terre nue", () => {
    const gelees = cellulesGelees(-3, [1, 1, 1]);
    const givre = givreDeLaSemaine(gelees, [0.8, HERBE_QUI_GIVRE / 2, HERBE_QUI_GIVRE]);
    expect(givre?.cellules).toEqual([0, 1, 2]);
    expect(givre?.brins).toEqual([0, 2]);
  });

  it("une semaine sans gel n'a pas de givre", () => {
    expect(givreDeLaSemaine(cellulesGelees(3, [1, 1]))).toBeUndefined();
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

describe("le givre à l'échelle des arbres (#357) et dit en clair (#355)", () => {
  it("ses brins sont plus bas qu'un semis de 0,7 m", () => {
    expect(HAUTEUR_DU_BRIN_GIVRE_M).toBeLessThan(0.7 / 2);
  });

  it("l'avis dit la température avec un vrai signe moins, et seulement ce que le gel fait", () => {
    const phrase = phraseDuGel(-5.6);
    expect(phrase).toContain("−6 °C");
    expect(phrase).not.toContain("-6");
    // Le moteur ne gèle que les fleurs ouvertes : l'avis ne promet rien d'autre.
    expect(phrase).toContain("fleurs ouvertes");
    expect(phrase).not.toMatch(/pousse/);
  });
});
