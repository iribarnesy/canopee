/**
 * Le paysage autour de la parcelle (docs/regles.md §10 ter).
 *
 * Question posée : a-t-on le droit de démarrer une lande sableuse « au cœur
 * d'un massif forestier » ? Tel quel, non — un massif de hêtres n'existe pas
 * sur un podzol à pH 4,5, le hêtre n'y tient pas plus dehors que dedans.
 *
 * La réponse n'est pas d'interdire des combinaisons, mais de comprendre que
 * les voisins **subissent le même sol** : « un massif », sur ce sable, c'est
 * une pinède. Le paysage dit une intention et une intensité ; le terrain dit
 * quelles essences la portent.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import {
  depositionNKgHaAn,
  especeTenable,
  frequentationHumaine,
  getPaysage,
  gibierParHa,
  PAYSAGES,
  ventExposition,
  voisinageSemencier,
} from "../../src/engine/paysage";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

function semenciers(stationClimat: typeof LANDE_SECHE, paysageId: string) {
  const { phInitial, ruMm } = stationClimat.station;
  return voisinageSemencier(
    getPaysage(paysageId),
    (id) => especeTenable(getEspece(id), phInitial, ruMm),
    () => ESPECES_V0.filter((e) => especeTenable(e, phInitial, ruMm)).map((e) => e.id),
  ).map((s) => s.especeId);
}

describe("les voisins subissent le même sol que nous", () => {
  it("« au cœur d'un massif » sur un podzol sableux, ce sont des pins — pas des hêtres", () => {
    const surSable = semenciers(LANDE_SECHE, "massif-forestier");
    expect(surSable).toContain("pinus_sylvestris");
    expect(surSable).not.toContain("fagus_sylvatica");
  });

  it("le même massif sur un limon profond, ce sont bien des hêtres et des chênes", () => {
    const surLimon = semenciers(LIMON_RICHE, "massif-forestier");
    expect(surLimon).toContain("fagus_sylvatica");
    expect(surLimon).toContain("quercus_pubescens");
  });

  it("l'intensité, elle, reste celle du paysage : un massif sème plus qu'une banlieue", () => {
    const total = (paysageId: string) =>
      voisinageSemencier(getPaysage(paysageId)).reduce((s, x) => s + x.semisParAn, 0);
    expect(total("massif-forestier")).toBeGreaterThan(3 * total("peri-urbain"));
    expect(total("plaine-cerealiere")).toBe(0);
  });
});

describe("ce que l'entourage décide, et qui n'était pas cohérent avant", () => {
  it("le gibier a besoin de couvert : beaucoup en massif, presque rien en ville", () => {
    expect(gibierParHa(getPaysage("massif-forestier"))).toBeGreaterThan(
      4 * gibierParHa(getPaysage("peri-urbain")),
    );
  });

  it("l'azote tombe du ciel là où il y a des élevages et des voitures", () => {
    expect(depositionNKgHaAn(getPaysage("plaine-cerealiere"))).toBeGreaterThan(
      2 * depositionNKgHaAn(getPaysage("massif-forestier")),
    );
  });

  it("les boisements voisins cassent le vent", () => {
    expect(ventExposition(getPaysage("massif-forestier"))).toBeLessThan(
      ventExposition(getPaysage("plaine-cerealiere")) / 2,
    );
  });

  it("et c'est là où passent les gens que partent les feux", () => {
    expect(frequentationHumaine(getPaysage("peri-urbain"))).toBeGreaterThan(
      1.5 * frequentationHumaine(getPaysage("massif-forestier")),
    );
  });

  it("chaque paysage est décrit pour le joueur, pas seulement chiffré", () => {
    for (const p of PAYSAGES) {
      expect(p.nom.length).toBeGreaterThan(3);
      expect(p.description.length).toBeGreaterThan(40);
    }
  });
});
