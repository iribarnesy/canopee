/**
 * L'économie comme **option**.
 *
 * Certaines questions ne sont pas économiques. « Quelle succession sur cette
 * lande en deux siècles », « le chêne-liège protège-t-il du feu », « où planter
 * pour retenir la terre » : aucune ne demande de savoir si le joueur peut payer
 * ses plants. Y répondre en devant d'abord tenir une trésorerie n'ajoute pas de
 * réalisme, ça ajoute une contrainte hors sujet.
 */

import { describe, expect, it } from "vitest";
import {
  applyAction,
  depassementHoraire,
  type GameAction,
  OVERDRAFT_LIMIT_EUR,
  WEEK_HOURS_CAP,
} from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
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

  it("les heures se COMPTENT toujours, même quand elles ne se paient pas", () => {
    // **Attention**, **ce test a changé de sens avec** #133, et il faut le dire :
    // il affirmait « le plafond d'heures reste, ce n'est pas une contrainte
    // d'argent ». Ce n'est plus vrai. Depuis que le dépassement se facture au
    // lieu de se refuser, la limite de travail **est** devenue une contrainte
    // d'argent — donc économie coupée, plus rien ne borne la semaine.
    //
    // C'est assumé, et c'est acté (docs/regles.md §15-13) : le mode sans
    // économie sert les questions qui n'en sont pas (quelle succession sur deux
    // siècles, le chêne-liège protège-t-il du feu), et personne n'y compose des
    // semaines de 200 h. Ce qui doit rester
    // vrai, et que ce test garde, c'est que la **comptabilité** physique ne dépend
    // pas de l'argent : les heures montent pareil, et le dépassement se lit
    // pareil. Savoir ce qu'aurait coûté une conduite reste instructif même
    // quand on ne la paie pas — exactement ce que dit déjà le test du compte
    // qui tourne plus haut.
    const sans = createGameState(STATION, rngStateFromSeed(3), { economie: false });
    const avec = createGameState(STATION, rngStateFromSeed(3), { economie: true });
    const planter = {
      type: "planter",
      week: 10,
      especeId: "fagus_sylvatica",
      positions: [{ x: 10, y: 10 }],
    } satisfies GameAction;
    const charger = (s: GameState) => ({
      ...s,
      economy: { ...s.economy, hoursUsedWeek: WEEK_HOURS_CAP },
    });

    const r1 = applyAction(charger(sans), planter);
    const r2 = applyAction(charger(avec), planter);
    expect(r1.state.economy.hoursUsedWeek).toBe(r2.state.economy.hoursUsedWeek);
    expect(r1.state.economy.hoursUsedWeek).toBeGreaterThan(WEEK_HOURS_CAP);
    // Le dépassement est rapporté des deux côtés, et il est le même.
    expect(depassementHoraire(r1.state.economy)).toBe(depassementHoraire(r2.state.economy));
    expect(depassementHoraire(r1.state.economy)).toBeGreaterThan(0);
    // Et le plafond ne refuse plus, des deux côtés.
    expect(r1.refusals).toEqual([]);
    expect(r2.refusals).toEqual([]);
  });
});
