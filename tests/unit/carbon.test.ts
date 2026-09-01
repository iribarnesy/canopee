import { describe, expect, it } from "vitest";
import { carbonInventory, treeAboveCarbonKg, treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { LIMON_RICHE } from "../../src/engine/stations";
import { runYears } from "../helpers";

describe("allométrie carbone", () => {
  it("un grand hêtre (25 m) stocke quelques tonnes de carbone", () => {
    const kg = treeTotalCarbonKg(getEspece("fagus_sylvatica"), 25);
    expect(kg).toBeGreaterThan(1500);
    expect(kg).toBeLessThan(6000);
  });

  it("un semis stocke un carbone négligeable, et racines < aérien", () => {
    const espece = getEspece("betula_pendula");
    expect(treeTotalCarbonKg(espece, 0.3)).toBeLessThan(1);
    expect(treeTotalCarbonKg(espece, 10)).toBeGreaterThan(treeAboveCarbonKg(espece, 10));
    expect(treeTotalCarbonKg(espece, 10)).toBeLessThan(2 * treeAboveCarbonKg(espece, 10));
  });
});

describe("inventaire carbone d'une parcelle", () => {
  it("l'humus domine les stocks, et une jeune plantation stocke du vivant", () => {
    const state = runYears(LIMON_RICHE, 15, {
      plantations: [
        { especeId: "betula_pendula", count: 40 },
        { especeId: "fagus_sylvatica", count: 40 },
      ],
    });
    const inv = carbonInventory(state, LIMON_RICHE.station.initialSoilCTHa);
    // Le sol reste LE stock dominant en tempéré (§12).
    expect(inv.humusTHa).toBeGreaterThan(inv.vivantTHa);
    expect(inv.humusTHa).toBeGreaterThan(50);
    expect(inv.humusTHa).toBeLessThan(70);
    expect(inv.vivantTHa).toBeGreaterThan(0.5);
    expect(inv.nppCumTHa).toBeGreaterThan(0);
    // Rien vendu ni brûlé dans ce run.
    expect(inv.exporteCumTHa).toBe(0);
  });
});
