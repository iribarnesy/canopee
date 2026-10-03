import { describe, expect, it } from "vitest";
import { cnHumusDuProfil } from "../../src/engine/carbon";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LANDE_SECHE, VALLEE_ENGORGEE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * Conservation au niveau du **tick** complet, grille + arbres (docs/regles.md §16) :
 * chaque semaine, pluie = évaporation + transpiration + drainage + débordement
 * + Δstock (sol, nappe et manteau neigeux), et minéralisation = prélèvements + lessivage + Δstock d'azote.
 */

/** Stock d'eau moyen par **cellule**, tous horizons confondus (sol stratifié). */
function meanWaterStock(state: GameState): number {
  const nCells = state.soil.mineralNG.length;
  let sum = 0;
  for (let i = 0; i < state.soil.waterMm.length; i++) {
    sum += (state.soil.waterMm[i] ?? 0) + (state.soil.excessMm[i] ?? 0);
  }
  // La nappe est un stock de la parcelle au même titre que le sol (nappe.ts).
  for (const v of state.soil.nappeMm) sum += v;
  // Le manteau neigeux aussi (neige.ts, #303) : la neige y attend le redoux. Il
  // est **un** pour la parcelle, donc déjà par cellule.
  return sum / nCells + state.soil.manteauNeigeMm;
}

/** Stock d'azote du sol = minéral de surface + minéral profond + litière + humus, kg/ha. */
function meanNStockKgHa(state: GameState): number {
  const n = state.soil.mineralNG.length;
  const cnHumus = cnHumusDuProfil(state.station.profil);
  let sum = 0;
  for (let i = 0; i < n; i++)
    sum +=
      (state.soil.mineralNG[i] ?? 0) +
      // **Le sous-sol compte, sinon le lot le ferait disparaître** (#247 lot A).
      // Ce que la surface lessive descend désormais au lieu de sortir du monde ;
      // sans cette ligne, la propriété lirait le transfert comme une perte et
      // fermerait sur un bilan faux — c'est-à-dire qu'elle le ratifierait.
      (state.soil.mineralNProfondG[i] ?? 0) +
      (state.soil.litterNG[i] ?? 0) +
      // **L'humus compte aussi** (#247). Sa minéralisation entrait au bilan comme
      // un apport, ce qui laissait passer sans bruit toute création d'azote
      // dans l'humus — et l'humification en créait : le carbone humifié y
      // entrait seul, son azote implicite venant de nulle part.
      (state.soil.humusCG[i] ?? 0) / cnHumus;
  // Le tas de broyat en attente compte lui aussi : sinon, broyer un arbre
  // ferait disparaître son azote du bilan.
  return ((sum + state.stockBrf.azoteG) / n) * 10;
}

function checkConservation(sc: StationClimat, years: number): number {
  const weather = syntheticYear(sc.climat);
  let manteauMax = 0;
  let state = createGameState(sc.station, rngStateFromSeed(7));
  state = plantScattered(state, "fagus_sylvatica", 40);
  state = plantScattered(state, "pinus_sylvestris", 40);
  state = plantScattered(state, "alnus_glutinosa", 40, 8);

  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    const before = meanWaterStock(state);
    const beforeN = meanNStockKgHa(state);
    const { state: next, fluxes } = tick(state, w);

    const deltaWater = meanWaterStock(next) - before;
    expect(
      fluxes.ruissellementSortantMm +
        fluxes.evapMm +
        fluxes.transpirationMm +
        fluxes.vidangeNappeMm +
        fluxes.overflowMm +
        deltaWater,
      // Depuis que la nappe est un stock (nappe.ts), deux flux ont changé de
      // nature et sortent du bilan : le **drainage** ne quitte plus le système, il
      // recharge l'aquifère ; la **remontée capillaire** n'arrive plus de nulle
      // part, elle y puise. Restent en entrée la pluie, le ruissellement
      // d'amont, ce que le réseau régional donne à la parcelle, et ce qu'un
      // ruisseau voisin fournit en lui imposant une nappe haute.
    ).toBeCloseTo(
      fluxes.rainMm +
        fluxes.ruissellementEntrantMm +
        fluxes.apportRegionalMm +
        fluxes.apportEauLibreMm,
      5,
    );

    const deltaN = meanNStockKgHa(next) - beforeN;
    // Entrées : retours de litière, fixation
    // symbiotique et dépôts atmosphériques (ces derniers sont un apport venu
    // de l'extérieur du système, au même titre que la fixation).
    // Sorties : prélèvements, lessivage, et ce que la terre emporte en
    // ruisselant hors de la parcelle (erosion.ts).
    // La minéralisation de l'humus et l'humification ne sont plus que des
    // transferts entre deux postes du stock.
    expect(
      fluxes.uptakeKgHa +
        fluxes.leachedKgHa +
        fluxes.erosionNKgHa +
        fluxes.erosionNHumusKgHa +
        deltaN,
    ).toBeCloseTo(fluxes.litterfallKgHa + fluxes.fixationKgHa + fluxes.depositionKgHa, 6);

    // **et ce qui sort du sol doit arriver dans une plante** (#115). Le bilan
    // ci-dessus ferme le côté **sol** : il compte `uptakeKgHa`, c'est-à-dire ce que
    // le partage **retire**. Il ne dit rien de ce que les plantes **reçoivent**, et
    // c'est par là qu'un huitième de l'azote d'un limon pauvre s'évaporait —
    // la demande d'un arbre était gonflée par son réseau mycorhizien pour
    // vider la cellule, puis servie sans ce gain. Personne ne recevait
    // l'écart, et aucune propriété ne le regardait.
    expect(fluxes.uptakeArbresKgHa + fluxes.uptakeHerbeKgHa).toBeCloseTo(fluxes.uptakeKgHa, 9);
    manteauMax = Math.max(manteauMax, next.soil.manteauNeigeMm);
    state = next;
  }
  return manteauMax;
}

describe("conservation eau + azote sur le tick complet (grille + arbres)", () => {
  it("lande sèche, 3 ans, peuplement mixte", () => {
    checkConservation(LANDE_SECHE, 3);
  });

  it("vallée engorgée, 3 ans, peuplement mixte", () => {
    checkConservation(VALLEE_ENGORGEE, 3);
  });

  it("un hiver froid : la neige tombée attend dans le manteau, puis fond, et rien ne se perd", () => {
    // Le climat de la vallée, refroidi de huit degrés : des semaines sous zéro
    // tout l'hiver, de quoi tenir un manteau et le faire fondre au printemps.
    // Aucune année synthétique des stations du dépôt ne neige (leur semaine la
    // plus froide reste au-dessus de 2 °C) ; sans ce cas, la propriété ne
    // verrait jamais le manteau.
    const manteauMax = checkConservation(
      { ...VALLEE_ENGORGEE, climat: { ...VALLEE_ENGORGEE.climat, tMeanAnnual: 4 } },
      2,
    );
    expect(manteauMax).toBeGreaterThan(20);
  });

  it("avec un ruisseau : l'eau imposée par la nappe est comptée comme un apport", () => {
    // La nappe ne se contente plus de remonter par capillarité : elle **sature**
    // le sol sous sa surface libre (eau_surface.ts). Cette eau-là vient de
    // l'extérieur de la parcelle et doit apparaître dans le bilan, sinon elle
    // se créerait toute seule au bord de l'eau.
    checkConservation(
      {
        ...LANDE_SECHE,
        station: {
          ...LANDE_SECHE.station,
          coteM: 30,
          eau: { type: "ruisseau", cote: "sud", bergeM: 0.3 },
          relief: { ...LANDE_SECHE.station.relief, pentePct: 4 },
        },
      },
      3,
    );
  });

  it("avec une mare : même bilan, source ponctuelle", () => {
    checkConservation(
      {
        ...VALLEE_ENGORGEE,
        station: {
          ...VALLEE_ENGORGEE.station,
          coteM: 30,
          eau: { type: "mare", xRel: 0.5, yRel: 0.5, rayonM: 3, bergeM: 0.5 },
        },
      },
      3,
    );
  });
});
