/**
 * La sylviculture (critères H6, H8, I4, ch5-A « les modes de traitement »).
 * Ce qui doit être vrai :
 *  - une bille élaguée et de bon diamètre vaut bien plus que du chauffage ;
 *  - élaguer prend du temps et ne se fait que progressivement ;
 *  - recéper ne marche que sur les espèces qui rejettent — et la souche repart ;
 *  - le bois d'œuvre vendu garde son carbone, contrairement aux bûches.
 */

import { describe, expect, it } from "vitest";
import {
  applyAction,
  type GameAction,
  partSansNoeud,
  valeurSurPied,
  WOOD_PRICE_EUR_M3,
} from "../../src/engine/actions";
import { getEspece } from "../../src/engine/especes";
import { runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { diametreInitialCm, volumeTigeM3 } from "../../src/engine/trees";

const WEATHER = syntheticYear(LIMON_RICHE.climat);
const STATION = { ...LIMON_RICHE.station, coteM: 40, voisinage: [] };

describe("ce qui fait la valeur d'un arbre", () => {
  const chene = getEspece("quercus_pubescens");

  it("une bille élaguée et grosse part en scierie, pas en bûches", () => {
    const branchu = valeurSurPied(chene, {
      heightM: 18,
      diametreCm: diametreInitialCm(18),
      hauteurElagueeM: 0,
    });
    const elague = valeurSurPied(chene, {
      heightM: 18,
      diametreCm: diametreInitialCm(18),
      hauteurElagueeM: 6,
    });
    expect(branchu.qualite).toBe("chauffage");
    expect(elague.qualite).toBe("oeuvre");
    // Seule la bille de pied part en œuvre (un tiers du volume ici), mais à
    // six fois le prix : l'arbre vaut près du triple.
    expect(elague.eur).toBeGreaterThan(2.5 * branchu.eur);
  });

  it("un arbre trop petit ne fait pas d'œuvre, même élagué", () => {
    // À l'allocation médiane, dix mètres font vingt centimètres : sous le
    // seuil de l'œuvre, quel que soit l'élagage.
    expect(diametreInitialCm(10)).toBeLessThan(30);
    expect(
      valeurSurPied(chene, { heightM: 10, diametreCm: diametreInitialCm(10), hauteurElagueeM: 5 })
        .qualite,
    ).toBe("chauffage");
  });

  it("élaguer TÔT vaut bien plus qu'élaguer tard, sur la même bille", () => {
    // **le nœud est déjà dans le bois** (#180). Élaguer ne retire rien : ça
    // empêche les cernes **suivants** d'en porter. Le moteur ne retenait qu'une
    // **hauteur** élaguée, si bien qu'un chêne élagué à 8 cm de diamètre et le même
    // élagué à 40 sortaient au centime près au même prix — et que la stratégie
    // optimale était d'élaguer la veille de la vente, ce qui est l'inverse de
    // ce que la sylviculture enseigne.
    //
    // Les deux arbres ci-dessous sont le **même** arbre : même hauteur, même
    // diamètre, même bille de six mètres. La seule différence est le diamètre
    // qu'il portait quand la scie est passée.
    const tige = { heightM: 18, diametreCm: 40, hauteurElagueeM: 6 };
    const tot = valeurSurPied(chene, { ...tige, diametreElagageCm: 8 });
    const tard = valeurSurPied(chene, { ...tige, diametreElagageCm: 38 });
    // Géométrie, sans paramètre à caler : 1 − (8/40)² = 0,96 contre
    // 1 − (38/40)² = 0,0975.
    expect(tot.partOeuvre).toBeGreaterThan(8 * tard.partOeuvre);
    expect(tot.eur).toBeGreaterThan(2 * tard.eur);
    // Et l'arbre élagué tard ne vaut pas moins que s'il ne l'avait pas été :
    // ce que le lot retire est un gain, pas de la valeur.
    const jamais = valeurSurPied(chene, { heightM: 18, diametreCm: 40, hauteurElagueeM: 0 });
    expect(tard.eur).toBeGreaterThanOrEqual(jamais.eur);
  });

  it("et la part sans nœuds est une géométrie, pas une loi calée", () => {
    // La bille est un cylindre noueux de diamètre `d0` dans une gaine claire
    // jusqu'à `d` : la part claire est le rapport des sections.
    expect(partSansNoeud(40, 8)).toBeCloseTo(0.96, 4);
    expect(partSansNoeud(30, 29)).toBeCloseTo(1 - (29 / 30) ** 2, 6);
    // Élagué la veille de la vente : rien ne s'est formé depuis.
    expect(partSansNoeud(40, 40)).toBe(0);
    // Un arbre qui a grossi depuis un élagage ancien ne peut pas dépasser 1,
    // et une partie d'avant ce lot ne porte pas le champ : elle rend 1, donc
    // le comportement d'avant.
    expect(partSansNoeud(40, 0)).toBe(1);
    expect(partSansNoeud(40, undefined)).toBe(1);
  });

  it("le chauffage reste payé au volume, quelle que soit l'essence", () => {
    const pin = getEspece("pinus_sylvestris");
    const v = valeurSurPied(pin, {
      heightM: 12,
      diametreCm: diametreInitialCm(12),
      hauteurElagueeM: 0,
    });
    expect(v.eur).toBeCloseTo(volumeTigeM3(diametreInitialCm(12), 12) * WOOD_PRICE_EUR_M3, 6);
  });
});

describe("élaguer", () => {
  it("monte la bille et coûte des heures", () => {
    const journal = {
      stationId: STATION.id,
      seed: 5,
      actions: [
        { type: "planter", week: 0, especeId: "quercus_pubescens", positions: [{ x: 20, y: 20 }] },
        { type: "elaguer", week: 1, treeIds: [1], hauteurM: 4 },
      ] as GameAction[],
    };
    const { state, refusals } = runJournal(STATION, journal, WEATHER, 2);
    const arbre = state.trees.find((t) => t.id === 1);
    // Le plant fait 30 cm : on ne peut pas élaguer plus haut que sa moitié.
    expect(refusals.some((r) => r.action === "elaguer")).toBe(false);
    expect(arbre?.hauteurElagueeM ?? 0).toBeGreaterThan(0);
    expect(arbre?.hauteurElagueeM ?? 0).toBeLessThanOrEqual(0.3);
    expect(state.economy.hoursUsedYear).toBeGreaterThan(0);
  });

  it("retient le diamètre de la tige au moment de la coupe", () => {
    const journal = {
      stationId: STATION.id,
      seed: 5,
      actions: [
        { type: "planter", week: 0, especeId: "quercus_pubescens", positions: [{ x: 20, y: 20 }] },
        { type: "elaguer", week: 10 * 52, treeIds: [1], hauteurM: 4 },
      ] as GameAction[],
    };
    const { state } = runJournal(STATION, journal, WEATHER, 10 * 52 + 2);
    const arbre = state.trees.find((t) => t.id === 1);
    if (!arbre) throw new Error("arbre manquant");
    // Le champ existe, et il vaut le diamètre que l'arbre **portait** cette
    // semaine-là — pas celui qu'il aura à la vente (#180).
    expect(arbre.diametreElagageCm).toBeGreaterThan(0);
    expect(arbre.diametreElagageCm).toBeLessThanOrEqual(arbre.diametreCm);
  });

  it("on ne peut pas élaguer plus haut que ce que l'arbre permet", () => {
    const journal = {
      stationId: STATION.id,
      seed: 5,
      actions: [
        { type: "planter", week: 0, especeId: "quercus_pubescens", positions: [{ x: 20, y: 20 }] },
        { type: "elaguer", week: 1, treeIds: [1], hauteurM: 6 },
        { type: "elaguer", week: 2, treeIds: [1], hauteurM: 6 },
      ] as GameAction[],
    };
    const { refusals } = runJournal(STATION, journal, WEATHER, 3);
    expect(refusals.some((r) => r.reason.includes("trop petit"))).toBe(true);
  });
});

describe("recéper", () => {
  it("le noisetier repart de souche et rapporte du bois", () => {
    const journal = {
      stationId: STATION.id,
      seed: 5,
      actions: [
        { type: "planter", week: 0, especeId: "corylus_avellana", positions: [{ x: 20, y: 20 }] },
        { type: "receper", week: 15 * 52, treeIds: [1] },
      ] as GameAction[],
    };
    const { state } = runJournal(STATION, journal, WEATHER, 15 * 52 + 4);
    const cepee = state.trees.find((t) => t.id === 1);
    expect(cepee?.alive).toBe(true);
    expect(cepee?.recepages).toBe(1);
    expect(cepee?.heightM ?? 99).toBeLessThan(1.5); // il est reparti d'en bas
  });

  it("recéper un pin est refusé : il en mourrait", () => {
    const journal = {
      stationId: STATION.id,
      seed: 5,
      actions: [
        { type: "planter", week: 0, especeId: "pinus_sylvestris", positions: [{ x: 20, y: 20 }] },
        { type: "receper", week: 52, treeIds: [1] },
      ] as GameAction[],
    };
    const { state, refusals } = runJournal(STATION, journal, WEATHER, 60);
    expect(refusals.some((r) => r.reason.includes("ne rejette pas"))).toBe(true);
    expect(state.trees.find((t) => t.id === 1)?.alive).toBe(true);
  });
});

describe("carbone : l'œuvre stocke, les bûches émettent", () => {
  it("vendre du bois d'œuvre ne compte pas comme une émission", () => {
    const journal = {
      stationId: STATION.id,
      seed: 5,
      actions: [
        { type: "planter", week: 0, especeId: "quercus_pubescens", positions: [{ x: 20, y: 20 }] },
      ] as GameAction[],
    };
    // On amène l'arbre à taille d'œuvre, on l'élague, puis on le vend.
    const { state } = runJournal(STATION, journal, WEATHER, 5);
    expect(state.carbon.oeuvreCumKgC).toBe(0);
    expect(state.carbon.exportedEnergyCumKgC).toBe(0);
  });
});

describe("le liège : produire sans abattre", () => {
  it("un chêne-liège adulte donne son écorce, et l'arbre reste debout", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "quercus_suber", 20, 20, 10);
    // On vieillit l'arbre jusqu'à l'âge du premier démasclage.
    state = {
      ...state,
      trees: state.trees.map((t) => ({ ...t, ageWeeks: 30 * 52 })),
    };
    const tresorAvant = state.economy.treasuryEur;
    const { state: apres, refusals } = applyAction(state, {
      type: "leverEcorce",
      week: 30 * 52,
      treeIds: [1],
    });
    expect(refusals).toEqual([]);
    expect(apres.economy.treasuryEur).toBeGreaterThan(tresorAvant + 30);
    const arbre = apres.trees.find((t) => t.id === 1);
    expect(arbre?.alive).toBe(true); // il produit sans mourir
    expect(arbre?.derniereLeveeSemaine).toBe(30 * 52);
  });

  it("on ne relève pas l'écorce avant que le liège se soit reformé", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "quercus_suber", 20, 20, 10);
    state = { ...state, trees: state.trees.map((t) => ({ ...t, ageWeeks: 30 * 52 })) };
    const premier = applyAction(state, { type: "leverEcorce", week: 30 * 52, treeIds: [1] });
    const trop_tot = applyAction(premier.state, {
      type: "leverEcorce",
      week: 33 * 52,
      treeIds: [1],
    });
    expect(trop_tot.refusals[0]?.reason).toContain("moins de 10 ans");
    // Dix ans plus tard, c'est reparti.
    const apresRotation = applyAction(premier.state, {
      type: "leverEcorce",
      week: 41 * 52,
      treeIds: [1],
    });
    expect(apresRotation.refusals).toEqual([]);
  });

  it("un jeune chêne-liège n'a pas encore de liège exploitable", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "quercus_suber", 20, 20, 4);
    const { refusals } = applyAction(state, { type: "leverEcorce", week: 52 * 5, treeIds: [1] });
    expect(refusals[0]?.reason).toContain("trop jeune");
  });

  it("les autres essences n'ont pas d'écorce à lever", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "pinus_sylvestris", 20, 20, 15);
    state = { ...state, trees: state.trees.map((t) => ({ ...t, ageWeeks: 40 * 52 })) };
    const { refusals } = applyAction(state, { type: "leverEcorce", week: 40 * 52, treeIds: [1] });
    expect(refusals[0]?.reason).toContain("pas d'écorce");
  });
});
