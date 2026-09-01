/**
 * L'effet nurse (docs/regles.md §7.5, ch1-A) : sur la lande sèche et ventée,
 * un couvert d'ajoncs abrite ses voisins — moins de vent, moins de
 * rayonnement, donc moins de transpiration — mais leur dispute aussi l'eau.
 * Tout se joue à la DISTANCE : à bonne distance la facilitation l'emporte,
 * collé à la nurse c'est la compétition qui gagne.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";

const STATION = { ...LANDE_SECHE.station, coteM: 40, voisinage: [] };
const serie = serieMeteoPour("lande-seche");
if (!serie) throw new Error("série lande manquante");
const WEATHER = serieToWeeks(serie);

/** Hauteur atteinte par un sujet planté au centre, entouré ou non d'ajoncs. */
function hauteurApres(especeId: string, nurses: number, distanceM: number, years: number) {
  let state = createGameState(STATION, rngStateFromSeed(11));
  for (let a = 0; a < nurses; a++) {
    const angle = (2 * Math.PI * a) / Math.max(1, nurses);
    state = plantAt(
      state,
      "ulex_europaeus",
      20 + distanceM * Math.cos(angle),
      20 + distanceM * Math.sin(angle),
      2.2, // ajoncs déjà installés (une lande, quoi)
    );
  }
  state = plantAt(state, especeId, 20, 20, 0.3);
  const id = state.nextTreeId - 1;
  for (let i = 0; i < years * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    state = advanceWeek(state, w, []).state;
  }
  const sujet = state.trees.find((t) => t.id === id);
  return sujet?.alive ? sujet.heightM : 0;
}

describe("effet nurse sur lande sèche et ventée", () => {
  const nu = hauteurApres("quercus_suber", 0, 0, 12);
  const abrite = hauteurApres("quercus_suber", 6, 3, 12);
  const etouffe = hauteurApres("quercus_suber", 6, 1.2, 12);

  it("le chêne-liège, adapté au sable acide, s'installe même nu", () => {
    expect(nu).toBeGreaterThan(0.5);
  });

  it("abrité à bonne distance, il pousse mieux qu'à découvert", () => {
    expect(abrite).toBeGreaterThan(nu);
  });

  it("collé aux ajoncs, la concurrence racinaire l'emporte sur l'abri", () => {
    expect(etouffe).toBeLessThan(abrite);
  });
});

describe("le brise-vent porte plus loin que l'ombre", () => {
  it("une nurse à 5 m protège encore, sans faire d'ombre", () => {
    const nu = hauteurApres("pinus_sylvestris", 0, 0, 12);
    const loin = hauteurApres("pinus_sylvestris", 6, 5, 12);
    expect(loin).toBeGreaterThan(nu);
  });
});
