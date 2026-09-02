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
  // Le chêne-liège tolère l'ombre en jeunesse : pour lui, l'abri est tout bénéfice.
  const liegeNu = hauteurApres("quercus_suber", 0, 0, 12);
  const liegeAbrite = hauteurApres("quercus_suber", 6, 3, 12);
  const liegeColle = hauteurApres("quercus_suber", 6, 1.2, 12);
  // Le pin est franchement héliophile : trop près, l'ombre lui coûte plus que
  // l'abri ne lui rapporte.
  const pinNu = hauteurApres("pinus_sylvestris", 0, 0, 12);
  const pinAbrite = hauteurApres("pinus_sylvestris", 6, 3, 12);
  const pinColle = hauteurApres("pinus_sylvestris", 6, 1.2, 12);

  it("le chêne-liège, adapté au sable acide, s'installe même nu (mais végète)", () => {
    // Sans entretien, la strate herbacée lui dispute l'eau et l'azote : il
    // survit sur la lande, il n'y prospère pas.
    expect(liegeNu).toBeGreaterThan(0.35);
  });

  it("abrité, il pousse mieux qu'à découvert — le vent lui coûte plus que l'ombre", () => {
    expect(liegeAbrite).toBeGreaterThan(liegeNu);
    expect(liegeColle).toBeGreaterThan(liegeNu);
  });

  it("l'héliophile, lui, paie l'ombre : collé à la nurse il fait moins bien qu'à distance", () => {
    expect(pinColle).toBeLessThan(pinAbrite);
  });

  it("à bonne distance, l'abri profite aux deux tempéraments", () => {
    expect(pinAbrite).toBeGreaterThan(pinNu);
  });
});

describe("le brise-vent porte plus loin que l'ombre", () => {
  it("une nurse à 5 m protège encore, sans faire d'ombre", () => {
    // 8 ans : sur cette lande, un incendie finit par passer au-delà et
    // brouillerait la comparaison (cf. feu.test.ts).
    const nu = hauteurApres("pinus_sylvestris", 0, 0, 8);
    const loin = hauteurApres("pinus_sylvestris", 6, 5, 8);
    expect(loin).toBeGreaterThan(nu);
  });
});
