/**
 * La trogne (docs/regles.md §11 ; critères H8 et J3).
 *
 * Ni un recépage — on garde le tronc — ni un élagage — on coupe la charpente.
 * C'est une troisième chose : on coupe la tête au-dessus de la dent du bétail,
 * elle repart, on y revient tous les dix ans. Ce qu'il faut que le moteur
 * produise : du bois et du fourrage sans jamais tuer l'arbre, une longévité
 * bien supérieure à celle d'un arbre de plein vent, et une tête qui se creuse
 * et vaut habitat.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction, TROGNE_HAUTEUR_M } from "../../src/engine/actions";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";
import { tickTree } from "../../src/engine/trees";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const WEATHER = serieToWeeks(SERIE);
const STATION: Station = {
  ...LIMON_RICHE.station,
  coteM: 20,
  voisinage: [],
  gibierParHa: 0,
  // Sans herbe : ce test porte sur le geste de trogne, pas sur la survie d'un
  // frêne isolé au milieu d'une prairie — qui se joue, elle, à peu de chose.
  herbeInitiale: 0,
};

function frene(recepages: number, heightM = 8): TreeState {
  return {
    vigueurIndividuelle: 1,
    id: 1,
    especeId: "fraxinus_excelsior",
    x: 10,
    y: 10,
    ageWeeks: 52 * 190,
    heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 100,
    hauteurElagueeM: 0,
    recepages,
    teteTrogneM: recepages > 0 ? TROGNE_HAUTEUR_M : undefined,
    pousseTendreM: 0,
    vigueur: 1,
    dommageHydraulique: 0,
    protege: false,
  };
}

describe("le geste", () => {
  function pousserUnFrene(ans: number) {
    let state = createGameState(STATION, rngStateFromSeed(3));
    // On part d'un baliveau déjà formé : ce test porte sur le GESTE de trogne,
    // pas sur les aléas des dix premières années d'un frêne isolé, qui se
    // jouent à peu de chose et brouillent ce qu'on veut mesurer.
    state = plantAt(state, "fraxinus_excelsior", 10, 10, 6);
    const id = state.nextTreeId - 1;
    for (let i = 0; i < ans * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    return { state, id };
  }

  it("étêter rapporte du bois et laisse l'arbre vivant", () => {
    const { state, id } = pousserUnFrene(8);
    const avant = state.trees.find((t) => t.id === id);
    if (!avant) throw new Error("arbre disparu");
    expect(avant.heightM).toBeGreaterThan(TROGNE_HAUTEUR_M + 1);
    const apres = applyAction(state, {
      type: "trogner",
      week: 8 * 52,
      treeIds: [id],
      hauteurTeteM: TROGNE_HAUTEUR_M,
    });
    const trogne = apres.state.trees.find((t) => t.id === id);
    expect(trogne?.alive).toBe(true);
    expect(trogne?.heightM).toBe(TROGNE_HAUTEUR_M);
    expect(trogne?.teteTrogneM).toBe(TROGNE_HAUTEUR_M);
    expect(apres.state.economy.treasuryEur).toBeGreaterThan(state.economy.treasuryEur);
  });

  it("la tête repart, et on peut y revenir", () => {
    const { state, id } = pousserUnFrene(8);
    let courant = applyAction(state, {
      type: "trogner",
      week: 8 * 52,
      treeIds: [id],
      hauteurTeteM: TROGNE_HAUTEUR_M,
    }).state;
    for (let i = 0; i < 15 * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      courant = advanceWeek(courant, w, []).state;
    }
    const repousse = courant.trees.find((t) => t.id === id);
    expect(repousse?.alive).toBe(true);
    // Quinze ans plus tard, il y a de nouveau de quoi couper.
    expect(repousse?.heightM ?? 0).toBeGreaterThan(TROGNE_HAUTEUR_M + 1);
  });

  it("on ne trogne pas une espèce qui ne rejette pas", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "pinus_sylvestris", 10, 10, 8);
    const r = applyAction(state, {
      type: "trogner",
      week: 1,
      treeIds: [state.nextTreeId - 1],
      hauteurTeteM: TROGNE_HAUTEUR_M,
    });
    expect(r.refusals[0]?.reason).toMatch(/ne rejette pas/);
  });

  it("ni un arbre trop court pour la tête visée", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "fraxinus_excelsior", 10, 10, 1.5);
    const r = applyAction(state, {
      type: "trogner",
      week: 1,
      treeIds: [state.nextTreeId - 1],
      hauteurTeteM: TROGNE_HAUTEUR_M,
    });
    expect(r.refusals[0]?.reason).toMatch(/trop court/);
  });
});

describe("ce que la trogne change à la vie de l'arbre", () => {
  const env = {
    waterSatisfaction: 1,
    waterloggingRatio: 0,
    light: 1,
    nitrogenSatisfaction: 1,
    phMean: 6.5,
    solPenetrableCm: 120,
    tMean: 16,
  };

  it("un vieux frêne de plein vent décline là où une trogne pousse encore", () => {
    // 190 ans : au-delà de 0,85 × 200, la sénescence est engagée pour l'arbre
    // de plein vent. La trogne, elle, a été rajeunie à chaque étêtage.
    const pleinVent = tickTree(frene(0), env);
    const tetard = tickTree(frene(3), env);
    const pousse = (r: ReturnType<typeof tickTree>, t: TreeState) => r.tree.heightM - t.heightM;
    // Une fois et demie plus, très exactement : le rapport des facteurs d'âge.
    expect(pousse(tetard, frene(3))).toBeGreaterThan(1.4 * pousse(pleinVent, frene(0)));
  });

  it("une tête recoupée plusieurs fois compte comme arbre-habitat", () => {
    // Elle se creuse : pour la faune, ce creux vaut mieux qu'un fût sain.
    const jeuneTrogne = indiceBiodiversite([frene(1, 3)], 0, 0.1);
    const vieilleTrogne = indiceBiodiversite([frene(3, 3)], 0, 0.1);
    expect(vieilleTrogne.grosArbres).toBeGreaterThan(jeuneTrogne.grosArbres);
  });
});
