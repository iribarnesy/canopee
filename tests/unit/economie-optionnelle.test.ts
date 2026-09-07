/**
 * L'économie comme OPTION.
 *
 * Certaines questions ne sont pas économiques. « Quelle succession sur cette
 * lande en deux siècles », « le chêne-liège protège-t-il du feu », « où planter
 * pour retenir la terre » : aucune ne demande de savoir si le joueur peut payer
 * ses plants. Y répondre en devant d'abord tenir une trésorerie n'ajoute pas de
 * réalisme, ça ajoute une contrainte hors sujet.
 */

import { describe, expect, it } from "vitest";
import { applyAction, OVERDRAFT_LIMIT_EUR, WEEK_HOURS_CAP } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION = { ...LIMON_RICHE.station, coteM: 30, voisinage: [] };
const METEO = syntheticYear(LIMON_RICHE.climat);

/** Une partie déjà bien dans le rouge, économie active ou non. */
function ruinee(economie: boolean) {
  const depart = createGameState(STATION, rngStateFromSeed(3), { economie });
  return {
    ...depart,
    economy: { ...depart.economy, treasuryEur: OVERDRAFT_LIMIT_EUR - 5_000 },
  };
}

describe("l'argent contraint, ou ne contraint pas", () => {
  it("économie active : le découvert refuse la plantation", () => {
    const { refusals } = applyAction(ruinee(true), {
      type: "planter",
      week: 10,
      especeId: "fagus_sylvatica",
      positions: [{ x: 10, y: 10 }],
    });
    expect(refusals.length).toBeGreaterThan(0);
  });

  it("économie désactivée : la même plantation passe", () => {
    const { state, refusals } = applyAction(ruinee(false), {
      type: "planter",
      week: 10,
      especeId: "fagus_sylvatica",
      positions: [{ x: 10, y: 10 }],
    });
    expect(refusals).toEqual([]);
    expect(state.trees).toHaveLength(1);
    // Le compte tourne quand même, et il est plus négatif qu'avant : savoir ce
    // qu'aurait coûté une conduite reste instructif même quand on ne la paie pas.
    expect(state.economy.treasuryEur).toBeLessThan(OVERDRAFT_LIMIT_EUR - 5_000);
  });

  it("économie désactivée : la faillite ne se déclenche jamais", () => {
    let state = ruinee(false);
    for (let i = 0; i < 52; i++) state = advanceWeek(state, METEO[i % 52] as never, []).state;
    expect(state.economy.bankrupt).toBe(false);
    // Le témoin : la même partie avec l'économie active y passe.
    let temoin = ruinee(true);
    for (let i = 0; i < 52; i++) temoin = advanceWeek(temoin, METEO[i % 52] as never, []).state;
    expect(temoin.economy.bankrupt).toBe(true);
  });

  it("mais le plafond d'HEURES reste : ce n'est pas une contrainte d'argent", () => {
    // Une journée fait le même nombre d'heures qu'on ait de l'argent ou non.
    // C'est le point qui distingue une option d'économie d'un mode « tout est
    // permis » : la limite physique du travail ne bouge pas.
    const depart = createGameState(STATION, rngStateFromSeed(3), { economie: false });
    const { refusals } = applyAction(
      { ...depart, economy: { ...depart.economy, hoursUsedWeek: WEEK_HOURS_CAP } },
      {
        type: "planter",
        week: 10,
        especeId: "fagus_sylvatica",
        positions: [{ x: 10, y: 10 }],
      },
    );
    expect(refusals.length).toBeGreaterThan(0);
  });
});
