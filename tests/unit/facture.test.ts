/**
 * LA SEMAINE RAMENÉE SOUS LE PLAFOND (#133).
 *
 * Le plafond de soixante heures ne refuse plus rien : il se paie. L'autre
 * branche de l'arbitrage — « ou on s'en tient à vos 60 h » — suppose de revenir
 * en arrière sur des actions DÉJÀ appliquées, ce que l'issue désignait comme le
 * point dur : couper un arbre change beaucoup de choses.
 *
 * La réponse n'est pas de défaire, c'est de REJOUER la semaine depuis son début
 * avec une liste élaguée. Ces épreuves défendent les trois promesses de cet
 * élagage : il tient dans le plafond, il tombe par la FIN, et il ne touche à
 * rien quand il n'y a rien à élaguer.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { depassementHoraire, PLANT_HOURS, WEEK_HOURS_CAP } from "../../src/engine/actions";
import { beginWeek } from "../../src/engine/game";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { prefixeSousLePlafond } from "../../src/game/facture";

const STATION: Station = { ...LIMON_RICHE.station, coteM: 100, voisinage: [], gibierParHa: 0 };
/** Le pas entre deux plants : assez large pour que le moteur les accepte tous. */
const PAS_M = 4;

/** Une semaine ouverte, comme le worker la tient. */
const semaineNeuve = () => beginWeek(createGameState(STATION, rngStateFromSeed(3)));

/** Planter coûte `PLANT_HOURS` par plant : de quoi composer une semaine à l'heure près. */
const planter = (n: number, depuis: number): GameAction => ({
  type: "planter",
  week: 0,
  especeId: "quercus_pubescens",
  // Une grille dans la parcelle : hors d'elle, ou trop près d'une tige, le
  // moteur refuse — et un refus ne coûte pas d'heures, donc la semaine ne se
  // remplirait jamais. Mesuré en écrivant cet essai : vingt-cinq plants sur
  // une ligne de deux mètres n'en posaient que vingt.
  positions: Array.from({ length: n }, (_, i) => {
    const rang = depuis + i;
    const parLigne = Math.floor(STATION.coteM / PAS_M) - 1;
    return {
      x: (rang % parLigne) * PAS_M + 2.5,
      y: Math.floor(rang / parLigne) * PAS_M + 2.5,
    };
  }),
});

describe("l'élagage d'une semaine trop chargée", () => {
  it("ne touche à rien quand la semaine tient dans le plafond", () => {
    const depart = semaineNeuve();
    const actions = [planter(5, 0), planter(5, 5)];
    const elaguee = prefixeSousLePlafond(depart, actions);
    expect(elaguee.annulees).toBe(0);
    expect(elaguee.gardees).toEqual(actions);
    expect(depassementHoraire(elaguee.etat.economy)).toBe(0);
  });

  it("garde le plus long PRÉFIXE qui tienne : ce sont les derniers gestes qui tombent", () => {
    const depart = semaineNeuve();
    // Trois lots de vingt-cinq plants : le troisième fait passer la semaine
    // au-dessus des soixante heures (un plant, une heure, plus le dégagement).
    const actions = [planter(25, 0), planter(25, 25), planter(25, 50)];
    const elaguee = prefixeSousLePlafond(depart, actions);
    expect(elaguee.annulees).toBeGreaterThan(0);
    // Un préfixe, donc : ce qui reste est le DÉBUT de la liste, dans l'ordre.
    expect(elaguee.gardees).toEqual(actions.slice(0, elaguee.gardees.length));
    expect(depassementHoraire(elaguee.etat.economy)).toBe(0);
    expect(elaguee.etat.economy.hoursUsedWeek).toBeLessThanOrEqual(WEEK_HOURS_CAP);
  });

  it("une seule action qui dépasse à elle seule tombe entière", () => {
    // Le plafond ne se négocie pas à la demi-action : si le premier geste posé
    // dépasse déjà, la semaine revient à zéro geste — et l'écran doit le dire.
    const depart = semaineNeuve();
    const gros = planter(WEEK_HOURS_CAP + 10, 0);
    const elaguee = prefixeSousLePlafond(depart, [gros]);
    expect(elaguee.gardees).toEqual([]);
    expect(elaguee.annulees).toBe(1);
    expect(elaguee.etat).toBe(depart);
  });

  it("rend l'état REJOUÉ, pas l'état d'arrivée rapiécé", () => {
    // C'est toute la différence avec « défaire » : l'état rendu est celui du
    // début de semaine auquel on a réappliqué ce qu'on garde. Les arbres
    // plantés par les actions annulées n'y sont donc pas.
    const depart = semaineNeuve();
    const elaguee = prefixeSousLePlafond(depart, [planter(25, 0), planter(50, 25)]);
    const plantes = elaguee.etat.trees.length - depart.trees.length;
    expect(plantes).toBe(25);
    expect(elaguee.etat.economy.hoursUsedWeek).toBeCloseTo(25 * PLANT_HOURS, 0);
  });

  it("rend aussi les gestes à mettre en scène — ceux des actions gardées", () => {
    const depart = semaineNeuve();
    const elaguee = prefixeSousLePlafond(depart, [planter(3, 0), planter(200, 3)]);
    expect(elaguee.gestes.length).toBeGreaterThan(0);
    // Rien des actions tombées : la scène ne doit pas jouer un geste annulé.
    const plantesAnnoncees = elaguee.gestes
      .filter((g) => "ids" in g && g.type === "planter")
      .reduce((n, g) => n + ("ids" in g ? g.ids.length : 0), 0);
    expect(plantesAnnoncees).toBe(3);
  });
});
