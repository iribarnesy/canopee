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
  diametreCm,
  type GameAction,
  valeurSurPied,
  WOOD_PRICE_EUR_M3,
  woodVolumeM3,
} from "../../src/engine/actions";
import { getEspece } from "../../src/engine/especes";
import { runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { LIMON_RICHE } from "../../src/engine/stations";

const WEATHER = syntheticYear(LIMON_RICHE.climat);
const STATION = { ...LIMON_RICHE.station, coteM: 40, voisinage: [] };

describe("ce qui fait la valeur d'un arbre", () => {
  const chene = getEspece("quercus_pubescens");

  it("une bille élaguée et grosse part en scierie, pas en bûches", () => {
    const branchu = valeurSurPied(chene, { heightM: 18, hauteurElagueeM: 0 });
    const elague = valeurSurPied(chene, { heightM: 18, hauteurElagueeM: 6 });
    expect(branchu.qualite).toBe("chauffage");
    expect(elague.qualite).toBe("oeuvre");
    // Seule la bille de pied part en œuvre (un tiers du volume ici), mais à
    // six fois le prix : l'arbre vaut près du triple.
    expect(elague.eur).toBeGreaterThan(2.5 * branchu.eur);
  });

  it("un arbre trop petit ne fait pas d'œuvre, même élagué", () => {
    expect(diametreCm(10)).toBeLessThan(30);
    expect(valeurSurPied(chene, { heightM: 10, hauteurElagueeM: 5 }).qualite).toBe("chauffage");
  });

  it("le chauffage reste payé au volume, quelle que soit l'essence", () => {
    const pin = getEspece("pinus_sylvestris");
    const v = valeurSurPied(pin, { heightM: 12, hauteurElagueeM: 0 });
    expect(v.eur).toBeCloseTo(woodVolumeM3(12) * WOOD_PRICE_EUR_M3, 6);
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
