/**
 * La fin de vie du bois d'œuvre (issue #72, critère I4).
 *
 * Ce que le moteur faisait : le carbone vendu en scierie entrait dans
 * `oeuvreCumKgC` et n'en sortait **jamais**. Une palette stockait autant qu'une
 * charpente, pour toujours, et vendre du bois devenait un geste climatique
 * gratuit et définitif — faux dans le sens qui flatte le joueur.
 *
 * Ce que ce fichier vérifie : que le partage du carbone suit celui de la
 * caisse, que le stock se vide à la demi-vie de l'IPCC, que l'invariant tient,
 * et ce que ça donne à l'échelle d'une partie — 63 % du carbone d'un produit
 * vendu au départ est reparti au bout de cinquante ans. L'issue attendait le
 * contraire ; le dernier test dit pourquoi elle se trompait.
 */

import { describe, expect, it } from "vitest";
import { applyAction, valeurSurPied } from "../../src/engine/actions";
import {
  carbonInventory,
  DEMI_VIE_OEUVRE_ANS,
  SORTIE_OEUVRE_PAR_SEMAINE,
} from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const METEO = syntheticYear(LIMON_RICHE.climat);

/** Un hêtre marchand, élagué comme il faut, prêt à partir en scierie. */
function parcelleAvecUnArbreVendable(): { state: GameState; id: number } {
  const station = { ...LIMON_RICHE.station, coteM: 12, voisinage: [] };
  let state = createGameState(station, rngStateFromSeed(1));
  state = plantAt(state, "fagus_sylvatica", 6, 6, 24);
  const arbre = state.trees[0];
  if (!arbre) throw new Error("arbre manquant");
  // Élagué haut : c'est ce qui fait la bille d'œuvre (actions.ts).
  state = {
    ...state,
    trees: [{ ...arbre, hauteurElagueeM: 14, diametreCm: 55 }],
  };
  return { state, id: arbre.id };
}

function avancer(state: GameState, semaines: number): GameState {
  let s = state;
  for (let i = 0; i < semaines; i++) {
    const w = METEO[i % 52];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return s;
}

describe("la demi-vie vient de l'IPCC, pas du confort de lecture", () => {
  it("trente-cinq ans, la valeur par défaut des sciages", () => {
    expect(DEMI_VIE_OEUVRE_ANS).toBe(35);
    // Et le taux hebdomadaire en découle, il n'est pas réglé à part.
    expect(SORTIE_OEUVRE_PAR_SEMAINE).toBeCloseTo(Math.LN2 / (35 * 52), 12);
  });

  it("au bout d'une demi-vie, il reste exactement la moitié", () => {
    const restant = (1 - SORTIE_OEUVRE_PAR_SEMAINE) ** (DEMI_VIE_OEUVRE_ANS * 52);
    // Décroissance discrète contre exponentielle continue : l'écart est de
    // l'ordre du dix-millième sur trente-cinq ans, ce qui est acceptable.
    expect(restant).toBeCloseTo(0.5, 3);
  });
});

describe("le carbone se partage comme la caisse", () => {
  it("seule la bille élaguée part en scierie, le houppier part en bûches", () => {
    // **Le** défaut que ce lot corrige, et il était silencieux : un arbre classé
    // « œuvre » envoyait **tout** son carbone au stock de produits, houppier
    // compris, alors que la vente ne facturait en œuvre que la part élaguée.
    const { state, id } = parcelleAvecUnArbreVendable();
    const arbre = state.trees[0];
    if (!arbre) throw new Error("arbre manquant");
    const vente = valeurSurPied(getEspece("fagus_sylvatica"), arbre);
    expect(vente.qualite).toBe("oeuvre");
    expect(vente.partOeuvre).toBeGreaterThan(0);
    expect(vente.partOeuvre).toBeLessThanOrEqual(0.6);

    const apres = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [id],
      devenir: "vendre",
    }).state;
    const c = apres.carbon;
    expect(c.oeuvreStockKgC).toBeGreaterThan(0);
    // Le reste du carbone emporté est parti en chauffage, donc émis.
    expect(c.exportedEnergyCumKgC).toBeGreaterThan(0);
    // Et le partage est **celui de la vente**, pas un autre.
    const emporte = c.oeuvreStockKgC + c.exportedEnergyCumKgC;
    expect(c.oeuvreStockKgC / emporte).toBeCloseTo(vente.partOeuvre, 6);
  });

  it("un arbre non élagué ne fait aucun produit : tout brûle", () => {
    const station = { ...LIMON_RICHE.station, coteM: 12, voisinage: [] };
    let state = createGameState(station, rngStateFromSeed(1));
    state = plantAt(state, "fagus_sylvatica", 6, 6, 24);
    const arbre = state.trees[0];
    if (!arbre) throw new Error("arbre manquant");
    const id = arbre.id;
    const apres = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [id],
      devenir: "vendre",
    }).state;
    expect(apres.carbon.oeuvreCumKgC).toBe(0);
    expect(apres.carbon.exportedEnergyCumKgC).toBeGreaterThan(0);
  });
});

describe("le puits se vide, et l'invariant tient", () => {
  it("cumul = ce qui reste + ce qui est sorti, à toute date", () => {
    const { state, id } = parcelleAvecUnArbreVendable();
    let s = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [id],
      devenir: "vendre",
    }).state;
    for (const semaines of [1, 52, 520, 1560]) {
      s = avancer(s, semaines);
      const c = s.carbon;
      expect(c.oeuvreStockKgC + c.oeuvreFinDeVieCumKgC).toBeCloseTo(c.oeuvreCumKgC, 9);
    }
  });

  it("le crédit au bilan net est le STOCK, pas le cumul", () => {
    const { state, id } = parcelleAvecUnArbreVendable();
    const vendu = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [id],
      devenir: "vendre",
    }).state;
    const tot = vendu.carbon.oeuvreCumKgC;
    const apres = avancer(vendu, DEMI_VIE_OEUVRE_ANS * 52);
    // Une demi-vie plus tard, la moitié du produit est retournée à
    // l'atmosphère. Le cumul, lui, n'a pas bougé d'un gramme : c'est
    // l'historique.
    expect(apres.carbon.oeuvreCumKgC).toBeCloseTo(tot, 9);
    expect(apres.carbon.oeuvreStockKgC).toBeLessThan(0.55 * tot);
    expect(apres.carbon.oeuvreStockKgC).toBeGreaterThan(0.45 * tot);
    const inv = carbonInventory(apres, 0);
    expect(inv.oeuvreStockTHa).toBeLessThan(inv.oeuvreCumTHa);
    expect(inv.oeuvreFinDeVieCumTHa).toBeGreaterThan(0);
  });

  it("sur une partie de cinquante ans, les deux tiers sont déjà repartis", () => {
    // **L'issue attendait le contraire**, et la mesure la corrige. Elle
    // supposait « une charpente centenaire ne rendra rien pendant la partie,
    // ce qui est le bon comportement ». Mais elle demandait aussi **une seule**
    // durée moyenne pour l'œuvre — et une moyenne sur charpente, meuble et
    // emballage ne vaut pas un siècle : l'IPCC la place à trente-cinq ans pour
    // les sciages pris comme classe. À ce rythme, un produit vendu au début
    // d'une partie de cinquante ans en a rendu 63 % à la fin.
    //
    // C'est la bonne leçon, et elle est plus dure que celle que l'issue
    // imaginait : à l'échelle d'une vie de gestionnaire, **vendre du bois
    // n'est pas un geste climatique définitif**. Ce qui reste définitif, c'est
    // ce qu'on laisse pousser.
    const { state, id } = parcelleAvecUnArbreVendable();
    const vendu = applyAction(state, {
      type: "couper",
      week: 0,
      treeIds: [id],
      devenir: "vendre",
    }).state;
    const tot = vendu.carbon.oeuvreCumKgC;
    const apres = avancer(vendu, 50 * 52);
    const rendu = apres.carbon.oeuvreFinDeVieCumKgC / tot;
    // exp(-ln2 × 50/35) = 0,372 restant, donc 0,628 rendu.
    expect(rendu).toBeCloseTo(0.628, 2);
  });
});
