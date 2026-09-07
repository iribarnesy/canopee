/**
 * Le microclimat sous couvert : un couvert ne fait pas que de l'ombre.
 *
 * Le moteur savait qu'une litière reste humide sous les arbres. Il ignorait
 * l'autre moitié du microclimat forestier, pourtant la mieux mesurée : sous un
 * couvert, les jours sont plus frais, les nuits plus douces, et les extrêmes
 * rabotés des deux côtés (De Frenne et al. 2019, méta-analyse de 98 sites et
 * 714 paires de mesures).
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { serieToWeeks, syntheticYear } from "../../src/engine/meteo";
import {
  fermetureDuCouvert,
  TAMPON_MAXIMUM_C,
  TAMPON_MINIMUM_C,
  TAMPON_MOYENNE_C,
  tMaximumSousCouvert,
  tMinimumSousCouvert,
  tMoyenneSousCouvert,
} from "../../src/engine/microclimat";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

describe("un couvert tamponne la température", () => {
  it("plus frais le jour, plus doux la nuit, et rien en plein découvert", () => {
    // Les trois offsets de De Frenne, appliqués à proportion de la fermeture.
    // En plein découvert (lumière 1), le couvert ne peut rien : c'est la
    // continuité qui garantit qu'aucun seuil n'a été codé en dur.
    expect(tMoyenneSousCouvert(10, fermetureDuCouvert(1))).toBe(10);
    expect(tMinimumSousCouvert(-3, fermetureDuCouvert(1))).toBe(-3);
    expect(tMaximumSousCouvert(30, fermetureDuCouvert(1))).toBe(30);

    // Sous une futaie fermée (lumière ~0), les trois offsets publiés.
    expect(tMoyenneSousCouvert(10, fermetureDuCouvert(0))).toBeCloseTo(10 - TAMPON_MOYENNE_C, 9);
    expect(tMinimumSousCouvert(-3, fermetureDuCouvert(0))).toBeCloseTo(-3 + TAMPON_MINIMUM_C, 9);
    expect(tMaximumSousCouvert(30, fermetureDuCouvert(0))).toBeCloseTo(30 - TAMPON_MAXIMUM_C, 9);

    // Le jour se rafraîchit PLUS que la nuit ne se réchauffe : la forêt écrête
    // surtout les maxima, et c'est le résultat le plus net de la méta-analyse.
    expect(TAMPON_MAXIMUM_C).toBeGreaterThan(TAMPON_MINIMUM_C);
  });

  it("à mi-ombre, la moitié du tampon — pas de seuil, pas de palier", () => {
    const plein = tMinimumSousCouvert(-3, fermetureDuCouvert(1));
    const demi = tMinimumSousCouvert(-3, fermetureDuCouvert(0.5));
    const ferme = tMinimumSousCouvert(-3, fermetureDuCouvert(0));
    expect(demi).toBeGreaterThan(plein);
    expect(demi).toBeLessThan(ferme);
    expect(demi - plein).toBeCloseTo((ferme - plein) / 2, 9);
  });
});

describe("un fruitier abrité échappe au gel tardif", () => {
  /**
   * L'argument agroforestier, et il n'est écrit nulle part dans le moteur :
   * mettre les fruitiers à l'abri d'une haie plutôt qu'en plein découvert
   * protège la floraison. Ça tombe de la composition du tampon nocturne et du
   * seuil de gel de l'espèce (`gelFatalC`, especes.ts).
   */
  const STATION = { ...LIMON_RICHE.station, coteM: 30, gibierParHa: 0, voisinage: [] };

  /** Un abricotier — le plus précoce de l'atlas, donc le plus exposé — abrité ou nu. */
  function floraisonGelee(abrite: boolean) {
    let state = createGameState(STATION, rngStateFromSeed(4));
    if (abrite) {
      // Une haie de charmes serrée autour du fruitier : de l'ombre, donc de la
      // fermeture, donc un minimum nocturne relevé.
      for (const [dx, dy] of [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
        [-2, -2],
        [2, 2],
      ] as const) {
        state = plantAt(state, "carpinus_betulus", 15 + dx, 15 + dy, 12);
      }
    }
    state = plantAt(state, "prunus_armeniaca", 15, 15, 5);
    const id = state.nextTreeId - 1;
    // Un printemps dur : on abaisse les minima absolus pour provoquer le gel.
    const meteo = syntheticYear(LIMON_RICHE.climat).map((w, i) => ({
      ...w,
      // Un printemps dur, tous les ans : −2,5 °C là où l'abricotier fleurit.
      tMinAbsC: i >= 2 && i <= 26 ? -2.5 : w.tMinAbsC,
    }));
    // Huit ans, parce que `plantAt` plante un arbre d'âge ZÉRO quelle que soit
    // sa taille, et que l'abricotier ne fleurit qu'à quatre ans (`maturiteAns`).
    // Un essai de trois ans ne mesurait rien : l'arbre n'avait jamais fleuri.
    let gele = false;
    for (let i = 0; i < 52 * 8; i++) {
      state = tick(state, meteo[i % 52] as never).state;
      const arbre = state.trees.find((t) => t.id === id);
      if (arbre?.bloomFrosted) gele = true;
    }
    return gele;
  }

  it("le seuil de gel de l'abricotier est bien au-dessus du minimum imposé", () => {
    // Sans quoi l'essai ne mesurerait rien : il faut que le gel SOIT fatal en
    // découvert pour que l'abri puisse faire une différence.
    const gelFatal = getEspece("prunus_armeniaca").fruits?.gelFatalC;
    expect(gelFatal).toBeDefined();
    expect(gelFatal ?? 0).toBeGreaterThan(-2.5);
    // Et l'abri doit suffire à repasser au-dessus : −2,5 + 1,1 > le seuil.
    expect(tMinimumSousCouvert(-2.5, 1)).toBeGreaterThan(gelFatal ?? 0);
  });

  it("à découvert la floraison gèle, à l'abri d'une haie elle passe", () => {
    expect(floraisonGelee(false)).toBe(true);
    expect(floraisonGelee(true)).toBe(false);
  });
});
