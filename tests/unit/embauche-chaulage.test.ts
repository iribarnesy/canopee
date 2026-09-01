import { describe, expect, it } from "vitest";
import { type GameAction, PLANT_HOURS, WEEK_HOURS_CAP } from "../../src/engine/actions";
import { runJournal } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

const WEATHER = syntheticYear(LIMON_RICHE.climat);

function positionsGrid(n: number, x0: number, y0: number, spacing: number) {
  const side = Math.ceil(Math.sqrt(n));
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % side) * spacing,
    y: y0 + Math.floor(i / side) * spacing,
  }));
}

describe("embauche (§10) : saisonnier vs CDI", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 60 };

  it("un saisonnier double la capacité de la semaine, puis repart tout seul", () => {
    const maxSeul = Math.floor(WEEK_HOURS_CAP / PLANT_HOURS);
    const journal = {
      stationId: STATION.id,
      seed: 3,
      actions: [
        { type: "embaucher", week: 0, contrat: "saisonnier", semaines: 2 },
        {
          type: "planter",
          week: 1,
          especeId: "pinus_sylvestris",
          positions: positionsGrid(2 * maxSeul + 10, 2, 2, 2),
        },
      ] as GameAction[],
    };
    const { state } = runJournal(STATION, journal, WEATHER, 5);
    expect(state.trees).toHaveLength(2 * maxSeul);
    // Le contrat de 2 semaines est expiré : retour à 1 UTH sans licencier.
    expect(state.economy.uth).toBe(1);
    expect(state.economy.saisonniersFinSemaine).toEqual([]);
    // Coût : 2 semaines × 700 € payées d'avance + les plants.
    expect(state.economy.treasuryEur).toBeCloseTo(20_000 - 1_400 - 2 * maxSeul * 1.5, 6);
  });

  it("le tour de passe-passe CDI (embaucher-récolter-licencier) coûte son vrai prix", () => {
    const journal = {
      stationId: STATION.id,
      seed: 3,
      actions: [
        { type: "embaucher", week: 0, contrat: "cdi" },
        { type: "licencier", week: 0 },
      ] as GameAction[],
    };
    const { state } = runJournal(STATION, journal, WEATHER, 1);
    // 600 € (1re semaine payée d'avance) + 1 200 € d'indemnités de rupture.
    expect(state.economy.treasuryEur).toBeCloseTo(20_000 - 600 - 1_200, 6);
    expect(state.economy.uth).toBe(1);
  });

  it("les salaires d'un CDI drainent la trésorerie jusqu'à la faillite", () => {
    const journal = {
      stationId: STATION.id,
      seed: 3,
      treasuryEur: 5_000,
      actions: [{ type: "embaucher", week: 0, contrat: "cdi" }] as GameAction[],
    };
    // 5 000 € + découvert 20 000 € / 600 €·sem ≈ 41 semaines avant la faillite.
    const { state } = runJournal(STATION, journal, WEATHER, 60);
    expect(state.economy.bankrupt).toBe(true);
    const apresLicenciement = runJournal(
      STATION,
      {
        ...journal,
        actions: [...journal.actions, { type: "licencier", week: 10 } as GameAction],
      },
      WEATHER,
      60,
    );
    expect(apresLicenciement.state.economy.bankrupt).toBe(false);
  });

  it("licencier sans CDI est refusé (les saisonniers ne se licencient pas)", () => {
    const journal = {
      stationId: STATION.id,
      seed: 3,
      actions: [
        { type: "embaucher", week: 0, contrat: "saisonnier", semaines: 4 },
        { type: "licencier", week: 1 },
      ] as GameAction[],
    };
    const { state, refusals } = runJournal(STATION, journal, WEATHER, 2);
    expect(refusals[0]?.reason).toContain("aucun ouvrier en CDI");
    expect(state.economy.uth).toBe(2); // le saisonnier est toujours là
  });
});

describe("chaulage (§9) : rendre un sable acide vivable pour un calcicole", () => {
  const STATION = { ...LANDE_SECHE.station, coteM: 60, voisinage: [] };
  const WEATHER_LANDE = syntheticYear(LANDE_SECHE.climat);

  it("le chêne pubescent survit dans la zone chaulée (pH 4,5 → 6), meurt dehors", () => {
    const journal = {
      stationId: STATION.id,
      seed: 3,
      actions: [
        // Trois chaulages sur le même disque : pH 4,5 → 6,0.
        { type: "chauler", week: 0, x: 20, y: 20, rayonM: 8 },
        { type: "chauler", week: 1, x: 20, y: 20, rayonM: 8 },
        { type: "chauler", week: 2, x: 20, y: 20, rayonM: 8 },
        {
          type: "planter",
          week: 3,
          especeId: "quercus_pubescens",
          positions: [
            { x: 18, y: 18 },
            { x: 20, y: 20 },
            { x: 22, y: 22 },
            { x: 45, y: 45 }, // témoin hors zone chaulée
            { x: 48, y: 45 },
          ],
        },
      ] as GameAction[],
    };
    const { state, refusals } = runJournal(STATION, journal, WEATHER_LANDE, 8 * 52);
    expect(refusals).toEqual([]);
    const dansZone = state.trees.filter((t) => t.alive && t.x < 30);
    const horsZone = state.trees.filter((t) => t.alive && t.x > 30);
    expect(dansZone.length).toBe(3);
    expect(horsZone.length).toBe(0);
  });
});
