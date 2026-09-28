import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import {
  cellLeachedG,
  cellMineralization,
  DEMI_SATURATION_G_M2,
  nitrogenAvailabilityFactor,
} from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE, type StationClimat } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Briques du cycle de l'azote, niveau cellule. La conservation du cycle
 * complet (minéralisation = prélèvements + lessivage + Δstock) est testée au
 * niveau du tick (tests/properties/tick-conservation), car l'allocation est
 * spatiale.
 */
describe("cycle de l'azote — briques cellule", () => {
  it("gel → pas de minéralisation", () => {
    expect(
      cellMineralization({
        potentialGWeek: 0.3,
        tMean: -2,
        moistureRatio: 0.8,
        waterloggingRatio: 0,
      }),
    ).toBe(0);
  });

  it("la minéralisation est positive et croît avec la température", () => {
    fc.assert(
      fc.property(
        fc.record({
          potentialGWeek: fc.double({ min: 0, max: 0.5, noNaN: true }),
          moistureRatio: fc.double({ min: 0, max: 1, noNaN: true }),
          waterloggingRatio: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        (base) => {
          const cold = cellMineralization({ ...base, tMean: 5 });
          const warm = cellMineralization({ ...base, tMean: 20 });
          expect(cold).toBeGreaterThanOrEqual(0);
          expect(warm).toBeGreaterThanOrEqual(cold);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("le lessivage ne dépasse jamais le stock, et vaut 0 sans drainage", () => {
    fc.assert(
      fc.property(
        fc.record({
          stockG: fc.double({ min: 0, max: 20, noNaN: true }),
          drainageMm: fc.double({ min: 0, max: 100, noNaN: true }),
          soilWaterMm: fc.double({ min: 0, max: 300, noNaN: true }),
        }),
        ({ stockG, drainageMm, soilWaterMm }) => {
          const leached = cellLeachedG(stockG, drainageMm, soilWaterMm);
          expect(leached).toBeGreaterThanOrEqual(0);
          expect(leached).toBeLessThanOrEqual(stockG + 1e-12);
          if (drainageMm === 0) expect(leached).toBe(0);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("gros drainage hivernal → lessivage substantiel du stock", () => {
    // 5 g/m² (50 kg/ha), autant d'eau qui part que d'eau qui reste → moitié lessivée.
    expect(cellLeachedG(5, 60, 60)).toBeCloseTo(2.5, 6);
  });

  it("frein de dilution : nul à stock nul, à moitié levé dès 5 kg N/ha", () => {
    // La forme est celle d'une cinétique de prélèvement, pas d'une rampe :
    // elle monte vite au début et n'atteint jamais tout à fait 1. La rampe
    // précédente saturait à 3 g/m² — 30 kg N/ha — un stock qu'un sol
    // **forestier** ne porte jamais, si bien que le frein était actif en
    // permanence sur toutes les stations (nitrogen.ts).
    expect(nitrogenAvailabilityFactor(0)).toBe(0);
    expect(nitrogenAvailabilityFactor(DEMI_SATURATION_G_M2)).toBeCloseTo(0.5, 9);
    // Un sol riche du jeu tourne autour de 1,6 g/m² : le frein y est levé aux
    // trois quarts, sans l'être tout à fait.
    expect(nitrogenAvailabilityFactor(1.6)).toBeGreaterThan(0.7);
    expect(nitrogenAvailabilityFactor(1.6)).toBeLessThan(0.8);
    // Une lande à 0,5 g/m², elle, reste bridée de moitié : le contraste entre
    // stations tient, et c'est ce qui comptait.
    expect(nitrogenAvailabilityFactor(0.5)).toBeCloseTo(0.5, 9);
    expect(nitrogenAvailabilityFactor(1e6)).toBeLessThan(1);
  });
});

describe("le sous-sol de l'azote : ce que la surface perd, elle le passe (#247 lot A)", () => {
  /**
   * Une station à deux horizons, et une à un seul : les deux clauses du lot.
   *
   * On plante peu et on laisse filer : ce qu'on regarde est la **plomberie**, et
   * un peuplement dense la masquerait en prélevant tout avant le drainage.
   */
  function partie(sc: StationClimat, ans: number, unSeulHorizon = false) {
    const premier = sc.station.profil[0];
    if (premier === undefined) throw new Error("profil vide");
    const profil = unSeulHorizon ? [premier] : sc.station.profil;
    const station: Station = { ...sc.station, coteM: 20, voisinage: [], profil };
    const weather = syntheticYear(sc.climat);
    let state = createGameState(station, rngStateFromSeed(5));
    let sortiSumKgHa = 0;
    for (let w = 0; w < ans * 52; w++) {
      const m = weather[w % weather.length];
      if (!m) throw new Error("météo manquante");
      const r = tick(state, m);
      state = r.state;
      sortiSumKgHa += r.fluxes.leachedKgHa;
    }
    const n = state.soil.mineralNG.length;
    let surface = 0;
    let profond = 0;
    for (let i = 0; i < n; i++) {
      surface += state.soil.mineralNG[i] ?? 0;
      profond += state.soil.mineralNProfondG[i] ?? 0;
    }
    return { surface: (surface / n) * 10, profond: (profond / n) * 10, sortiSumKgHa };
  }

  it("sur un profil à deux horizons, le sous-sol se remplit — il ne restait rien avant", () => {
    // **L'énoncé du lot.** `cellLeachedG` lisait déjà `waterMm[i * nH]`, l'eau de
    // l'horizon 0 : le lessivage de l'azote était donc **déjà** un flux de
    // surface, et ce qu'il emportait quittait le monde. Il descend maintenant,
    // comme les bases depuis #170.
    const r = partie(LIMON_RICHE, 6);
    expect(r.profond).toBeGreaterThan(0);
    // Et il n'est pas né de rien : la station part à zéro en profondeur
    // (`state.ts`), donc tout ce qui est là a traversé la surface.
    expect(r.surface).toBeGreaterThan(0);
  });

  it("et un profil d'UN SEUL horizon n'a pas de sous-sol : ça sort du monde, comme avant", () => {
    // La clause que les bases ont écrite avant nous, reprise au mot près. Sans
    // elle, un profil mono-horizon accumulerait dans un compartiment que rien ne
    // vide — l'azote lessivé ne quitterait jamais la parcelle.
    const r = partie(LIMON_RICHE, 6, true);
    expect(r.profond).toBe(0);
    expect(r.sortiSumKgHa).toBeGreaterThan(0);
  });

  it("le flux publié cesse de compter la surface pour compter la PARCELLE", () => {
    // Ce que le lot change vraiment, et il faut le dire : `leachedKgHa` ne
    // mesurait pas ce que la littérature mesure. Ce qui sort d'un horizon
    // labouré n'est pas perdu pour le peuplement ; ce qui passe sous la zone
    // racinaire, si. À profil égal, la parcelle perd donc **moins** que la
    // surface ne lâchait, et la différence est exactement ce qui est en bas.
    const deux = partie(LIMON_RICHE, 6);
    const un = partie(LIMON_RICHE, 6, true);
    expect(deux.sortiSumKgHa).toBeLessThan(un.sortiSumKgHa);
    expect(deux.profond).toBeGreaterThan(0);
  });

  it("le sous-sol est un BUDGET à l'équilibre, pas un puits qui se remplit", () => {
    // **j'attendais qu'il monte, et il plafonne — c'est le moteur qui avait
    // raison.** Un compartiment qui reçoit un flux et en perd un proportionnel
    // ne s'accumule pas : il s'équilibre. Le premier jet de cet essai affirmait
    // le contraire et il est tombé, ce qui est exactement ce qu'on lui demande.
    //
    // Relevé sur trente ans, parcelle nue :
    //
    //     an  1   surface 8,81   profond 24,26   rapport 2,75
    //     an  3   surface 8,96   profond 23,31           2,60
    //     an  6   surface 8,68   profond 22,76           2,62
    //     an 15   surface 7,67   profond 20,15           2,63
    //     an 30   surface 6,23   profond 16,47           2,64
    //
    // **Le rapport tient à 1 % près pendant que les deux stocks perdent un
    // tiers.** Ce n'est pas un chiffre calé — il tombe des deux vitesses de
    // lessivage, celle de la surface et celle du fond — et c'est la signature
    // d'un régime permanent : le fond suit la surface au lieu de vivre sa vie.
    const six = partie(LIMON_RICHE, 6);
    const trente = partie(LIMON_RICHE, 30);
    // Les deux stocks se vident — la parcelle nue perd son azote.
    expect(trente.surface).toBeLessThan(six.surface * 0.8);
    expect(trente.profond).toBeLessThan(six.profond * 0.8);
    // Et pourtant leur rapport ne bouge pas.
    const rapport = (r: { surface: number; profond: number }) => r.profond / r.surface;
    expect(rapport(trente)).toBeCloseTo(rapport(six), 1);
  });
});
