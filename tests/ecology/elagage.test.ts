/**
 * La profondeur du houppier (light.ts, docs/realisme.md B10).
 *
 * Elle était un ratio fixe, donc un trait d'espèce — ce qu'elle n'est pas :
 * le même chêne garde ses branches jusqu'en bas au milieu d'un pré et
 * s'auto-élague sur quinze mètres en futaie serrée. Elle se calcule
 * maintenant, à partir du point de compensation de l'espèce (le seuil auquel
 * une branche cesse de payer sa respiration) et de la lumière qu'elle reçoit.
 *
 * Les deux causes se rejoignent dans `baseHouppierM` : l'ombre tue les
 * branches basses, ou le joueur les coupe. L'arbre ne les distingue pas.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import {
  baseHouppierCible,
  computeGroundLight,
  lightAtPoint,
  PROFONDEUR_HOUPPIER_MAX,
  partHouppier,
} from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";

function arbre(especeId: string, baseHouppierM: number, heightM = 16): TreeState {
  return {
    id: 1,
    especeId,
    x: 10,
    y: 10,
    ageWeeks: 40 * 52,
    heightM,
    stress: 1,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    hauteurElagueeM: 0,
    baseHouppierM,
    recepages: 0,
    rootDepthCm: 120,
    pousseTendreM: 0,
    dommageHydraulique: 0,
    vigueur: 1,
    vigueurIndividuelle: 1,
    protege: false,
  };
}

/** Base de houppier en fraction de la hauteur, plus lisible qu'en mètres. */
function partNue(especeId: string, lumiere: number, heightM = 16): number {
  const { compensation, lai } = getEspece(especeId).lumiere;
  return baseHouppierCible(heightM, lumiere, compensation, lai) / heightM;
}

describe("la base du houppier sort de la compétition, pas de l'espèce", () => {
  it("en pleine lumière, tout le monde est branchu jusqu'en bas", () => {
    // L'arbre de plein vent, quelle que soit l'essence : c'est le plafond
    // PROFONDEUR_HOUPPIER_MAX qui mord, pas le point de compensation.
    for (const id of ["fagus_sylvatica", "pinus_sylvestris", "quercus_pubescens"]) {
      expect(partNue(id, 1)).toBeCloseTo(1 - PROFONDEUR_HOUPPIER_MAX, 6);
    }
  });

  it("sous l'ombre, l'héliophile s'auto-élague et le sciaphile patiente", () => {
    // MÊME lumière, deux espèces : c'est le point de compensation qui tranche.
    // Le hêtre (0,01) ne bouge pas d'un pouce ; le pin (0,25) se dénude.
    const hetre = partNue("fagus_sylvatica", 0.3);
    const pin = partNue("pinus_sylvestris", 0.3);
    expect(hetre).toBeCloseTo(1 - PROFONDEUR_HOUPPIER_MAX, 6);
    expect(pin).toBeGreaterThan(0.6);
  });

  it("et pour une MÊME espèce, c'est la lumière seule qui décide", () => {
    // Le cœur de B10 : deux pins identiques, l'un au large, l'autre serré.
    const auLarge = partNue("pinus_sylvestris", 1);
    const serre = partNue("pinus_sylvestris", 0.3);
    expect(auLarge).toBeLessThan(serre);
    // Et le dénudement est monotone : plus c'est sombre, plus le fût monte.
    const paliers = [1, 0.7, 0.5, 0.4, 0.3, 0.2].map((l) => partNue("pinus_sylvestris", l));
    for (let i = 1; i < paliers.length; i++) {
      expect(paliers[i] ?? 0).toBeGreaterThanOrEqual(paliers[i - 1] ?? 0);
    }
  });

  it("une cime déjà sous son point de compensation n'a plus de houppier", () => {
    // C'est la limite continue du calcul, et c'est un arbre qui se meurt.
    expect(partNue("pinus_sylvestris", 0.25)).toBe(1);
    expect(partNue("pinus_sylvestris", 0.1)).toBe(1);
  });
});

describe("la part de couronne qui reste", () => {
  it("vaut 1 pour un arbre branchu et 0 pour un fût sans houppier", () => {
    expect(partHouppier(16, 0)).toBe(1);
    expect(partHouppier(16, 16)).toBe(0);
  });

  it("décroît avec la tranche basse retirée", () => {
    // Couronne pleine sur 0,9 × 16 = 14,4 m. Une base à 8 m en retire 1,6.
    expect(partHouppier(16, 8)).toBeCloseTo(8 / 14.4, 6);
  });

  it("borne une base héritée qui dépasse la hauteur — un arbre rabattu", () => {
    // Recépage, trogne, rejet de souche : la hauteur tombe d'un coup, et une
    // profondeur négative n'aurait aucun sens.
    expect(partHouppier(0.5, 8)).toBe(0);
    expect(partHouppier(0, 8)).toBe(1);
  });
});

describe("un fût nu fait moins d'ombre en dessous", () => {
  it("éclaircit son propre pied", () => {
    const branchu = lightAtPoint([arbre("fagus_sylvatica", 0)], 10, 10 + 0.4 * 16, () => 1);
    const nu = lightAtPoint([arbre("fagus_sylvatica", 8)], 10, 10 + 0.4 * 16, () => 1);
    expect(nu).toBeGreaterThan(branchu);
  });

  it("ne déplace ni n'élargit l'ombre : seule sa densité change", () => {
    const cote = 24;
    const sombre = computeGroundLight([arbre("fagus_sylvatica", 0)], cote, cote, () => 1);
    const clair = computeGroundLight([arbre("fagus_sylvatica", 8)], cote, cote, () => 1);
    // Mêmes cellules touchées — le rendu garde son emprise d'ombre, qui suit
    // `crownRadiusM` et ne bouge pas.
    const ombrees = (g: number[]) => g.map((v) => v < 0.999).join("");
    expect(ombrees(clair)).toBe(ombrees(sombre));
    for (let i = 0; i < sombre.length; i++) {
      expect(clair[i] ?? 0).toBeGreaterThanOrEqual(sombre[i] ?? 0);
    }
  });
});

describe("l'auto-élagage ÉMERGE d'une partie simulée", () => {
  /**
   * Le test qui compte : rien de ce qui précède ne prouve qu'une plantation
   * dense finit par produire du fût nu. Deux parcelles de pins, tout
   * identique sauf l'écartement — c'est la leçon sylvicole que le jeu doit
   * faire sentir : on plante serré pour avoir du bois droit.
   */
  function pineraie(ecartementM: number, ans: number): TreeState[] {
    const station: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(station, rngStateFromSeed(11));
    for (let y = 4; y < 36; y += ecartementM) {
      for (let x = 4; x < 36; x += ecartementM) {
        state = plantAt(state, "pinus_sylvestris", x, y, 2);
      }
    }
    for (let i = 0; i < ans * 52; i++) {
      const w = meteo[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    return state.trees.filter((t) => t.alive);
  }

  it("la futaie serrée fait du fût nu, la plantation lâche reste branchue", () => {
    const serree = pineraie(2, 25);
    const lache = pineraie(10, 25);
    const partNueMoyenne = (trees: TreeState[]) =>
      trees.reduce((s, t) => s + (t.baseHouppierM ?? 0) / Math.max(0.01, t.heightM), 0) /
      Math.max(1, trees.length);

    expect(serree.length).toBeGreaterThan(0);
    expect(lache.length).toBeGreaterThan(0);
    // Personne n'a touché une scie : tout vient de l'ombre mutuelle.
    expect(serree.every((t) => t.hauteurElagueeM === 0)).toBe(true);
    expect(partNueMoyenne(serree)).toBeGreaterThan(partNueMoyenne(lache));
    // La plantation lâche reste au plancher : branchue jusqu'en bas.
    expect(partNueMoyenne(lache)).toBeCloseTo(1 - PROFONDEUR_HOUPPIER_MAX, 2);
  });

  it("la base ne redescend jamais, même quand l'ombre se lève", () => {
    // Une branche morte ne repousse pas. On simule, on retire tous les
    // voisins, on resimule : le fût nu reste.
    const station: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [], gibierParHa: 0 };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(station, rngStateFromSeed(3));
    for (let y = 6; y < 24; y += 2) {
      for (let x = 6; x < 24; x += 2) state = plantAt(state, "pinus_sylvestris", x, y, 2);
    }
    for (let i = 0; i < 20 * 52; i++) {
      const w = meteo[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    const survivant = state.trees.find((t) => t.alive);
    if (!survivant) throw new Error("aucun survivant");
    const nuAvant = survivant.baseHouppierM ?? 0;
    expect(nuAvant).toBeGreaterThan(0);

    // Coupe rase autour de lui : il est désormais en pleine lumière.
    state = { ...state, trees: [survivant] };
    for (let i = 0; i < 5 * 52; i++) {
      const w = meteo[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    const apres = state.trees[0]?.baseHouppierM ?? 0;
    expect(apres).toBeGreaterThanOrEqual(nuAvant);
  });
});
