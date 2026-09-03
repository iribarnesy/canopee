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
  type Bordures,
  bordersUniformes,
  depositionDesBordures,
  depositionNKgHaAn,
  especeTenable,
  frequentationDesBordures,
  frequentationHumaine,
  getPaysage,
  gibierDesBordures,
  gibierParHa,
  PAYSAGES,
  resumeBordures,
  ventDesBordures,
  ventExposition,
  voisinageDesBordures,
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

  it("l'intensité, elle, reste celle du paysage : un massif sème plus qu'une plaine", () => {
    const total = (paysageId: string) =>
      voisinageSemencier(getPaysage(paysageId)).reduce((s, x) => s + x.semisParAn, 0);
    expect(total("massif-forestier")).toBeGreaterThan(3 * total("plaine-cerealiere"));
    // La plaine céréalière n'est pas tout à fait stérile : les oiseaux y
    // sèment de la ronce jusqu'au milieu des champs. Mais c'est tout, et c'est
    // dérisoire à côté d'un massif.
    const plaine = voisinageSemencier(getPaysage("plaine-cerealiere"));
    expect(plaine.map((x) => x.especeId)).toEqual(["rubus_fruticosus"]);
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

describe("un voisinage par côté", () => {
  const forestier = bordersUniformes("massif-forestier");
  const mixte: Bordures = {
    nord: "massif-forestier",
    est: "massif-forestier",
    sud: "plaine-cerealiere",
    ouest: "plaine-cerealiere",
  };
  const champs = bordersUniformes("plaine-cerealiere");

  it("les semis S'ADDITIONNENT : quatre côtés boisés sèment plus que deux", () => {
    const total = (b: Bordures) =>
      voisinageDesBordures(b).reduce((somme, s) => somme + s.semisParAn, 0);
    expect(total(forestier)).toBeGreaterThan(total(mixte));
    expect(total(mixte)).toBeGreaterThan(total(champs));
  });

  it("le gibier et l'azote se MOYENNENT : ils baignent la parcelle", () => {
    expect(gibierDesBordures(mixte)).toBeCloseTo(
      (gibierDesBordures(forestier) + gibierDesBordures(champs)) / 2,
      6,
    );
    expect(depositionDesBordures(mixte)).toBeGreaterThan(depositionDesBordures(forestier));
    expect(depositionDesBordures(mixte)).toBeLessThan(depositionDesBordures(champs));
  });

  it("un seul côté urbanisé suffit à amener les départs de feu", () => {
    const troisForets: Bordures = {
      nord: "massif-forestier",
      est: "massif-forestier",
      sud: "massif-forestier",
      ouest: "peri-urbain",
    };
    // Le maximum, pas la moyenne : il ne faut qu'une source.
    expect(frequentationDesBordures(troisForets)).toBe(
      frequentationDesBordures(bordersUniformes("peri-urbain")),
    );
  });

  it("un seul côté ouvert suffit à laisser passer le vent", () => {
    const abriteSaufUn: Bordures = {
      nord: "massif-forestier",
      est: "massif-forestier",
      sud: "massif-forestier",
      ouest: "plaine-cerealiere",
    };
    expect(ventDesBordures(abriteSaufUn)).toBe(ventDesBordures(champs));
  });

  it("le résumé dit ce qu'il y a autour, côté par côté quand ils diffèrent", () => {
    expect(resumeBordures(forestier)).not.toContain("·");
    expect(resumeBordures(mixte)).toContain("N ");
    expect(resumeBordures(mixte)).toContain("S ");
  });
});
