/**
 * Maladies (critère G6).
 *
 * Les règles prévoyaient une date scriptée : la chalarose frappe l'année A+12,
 * point. C'est jouable, mais ça n'apprend rien. Ce qui est modélisé, c'est
 * l'épidémie elle-même — et ce qu'elle punit : la densité d'hôtes.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getScenario, meteoDerivee } from "../../src/engine/climat";
import { advanceWeek } from "../../src/engine/game";
import { MALADIES, maladiesActives, pressionMaladie } from "../../src/engine/maladies";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const OBSERVATIONS = serieToWeeks(SERIE);
const CHALAROSE = MALADIES[0];
if (!CHALAROSE) throw new Error("maladie manquante");

describe("ce qui déclenche une épidémie", () => {
  it("elle n'existe pas avant son arrivée dans le pays", () => {
    // Donnée historique, pas un réglage : la chalarose est en France depuis 2008.
    expect(maladiesActives(2000)).toHaveLength(0);
    expect(maladiesActives(2026).length).toBeGreaterThan(0);
  });

  it("la pression suit la densité d'hôtes : l'inoculum vient des voisins", () => {
    const isole = pressionMaladie(CHALAROSE, 0, 0.6);
    const quelques = pressionMaladie(CHALAROSE, 5, 0.6);
    const frenaie = pressionMaladie(CHALAROSE, 60, 0.6);
    expect(isole).toBe(0);
    // La courbe sature : passer de 5 à 60 frênes voisins ne multiplie pas la
    // pression par douze, mais elle est tout de même près de trois fois plus
    // forte — et c'est bien la densité qui commande.
    expect(frenaie).toBeGreaterThan(2.5 * quelques);
  });

  it("et l'humidité : le champignon a besoin d'un été humide pour fructifier", () => {
    expect(pressionMaladie(CHALAROSE, 40, 0.15)).toBe(0);
    expect(pressionMaladie(CHALAROSE, 40, 0.8)).toBeGreaterThan(0.5);
  });
});

describe("à l'échelle du peuplement : la diversification comme assurance", () => {
  function peuplement(especes: readonly string[], ans: number) {
    const station: Station = {
      ...LIMON_RICHE.station,
      coteM: 40,
      voisinage: [],
      gibierParHa: 0,
    };
    let state = createGameState(station, rngStateFromSeed(4));
    const idsFrenes: number[] = [];
    for (let i = 0; i < 144; i++) {
      const esp = especes[i % especes.length];
      if (!esp) throw new Error("espèce manquante");
      state = plantAt(state, esp, 2 + (i % 12) * 3, 2 + Math.floor(i / 12) * 3, 1.5);
      if (esp === "fraxinus_excelsior") idsFrenes.push(state.nextTreeId - 1);
    }
    const scenario = getScenario("stable");
    let mortsMaladie = 0;
    for (let i = 0; i < ans * 52; i++) {
      const base = OBSERVATIONS[i % OBSERVATIONS.length];
      if (!base) throw new Error("météo manquante");
      const r = advanceWeek(
        state,
        meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52)),
        [],
      );
      state = r.state;
      mortsMaladie += r.morts.filter((m) => m.cause === "maladie").length;
    }
    return { tauxMortalite: mortsMaladie / Math.max(1, idsFrenes.length) };
  }

  const frenaie = peuplement(["fraxinus_excelsior"], 30);
  const melange = peuplement(
    ["fraxinus_excelsior", "quercus_pubescens", "betula_pendula", "castanea_sativa"],
    30,
  );

  it("une frênaie pure se fait décimer par la chalarose", () => {
    // Près d'un frêne sur trois en trente ans, sur un limon frais qui plaît
    // au champignon autant qu'à l'arbre.
    expect(frenaie.tauxMortalite).toBeGreaterThan(0.25);
  });

  it("les mêmes frênes noyés dans un mélange s'en tirent bien mieux", () => {
    // Rien n'est codé pour ça : c'est l'inoculum, qui vient des voisins.
    expect(melange.tauxMortalite).toBeLessThan(frenaie.tauxMortalite / 2);
  });
});
