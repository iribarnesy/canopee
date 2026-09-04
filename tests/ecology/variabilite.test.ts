/**
 * Variabilité individuelle : deux arbres de même essence, plantés côte à côte
 * le même jour, ne font pas le même arbre.
 *
 * Le moteur les traitait comme des clones parfaits : à conditions égales, ils
 * poussaient exactement pareil, et un peuplement pur était une rangée d'arbres
 * identiques. C'est faux, et ce n'est pas un détail cosmétique — c'est cette
 * dispersion qui crée les DOMINANTS et les DOMINÉS, donc la hiérarchie sociale
 * d'un peuplement, donc l'auto-éclaircie, donc le sens même d'une éclaircie
 * par le haut ou par le bas.
 *
 * La vigueur ne touche qu'un point : ce que l'arbre TIRE de conditions données.
 * Elle ne change ni l'eau qu'il reçoit, ni la lumière — deux voisins ont les
 * mêmes ; l'un en fait plus que l'autre.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  DISPERSION_VIGUEUR,
  tirerVigueurIndividuelle,
  VIGUEUR_MAX,
  VIGUEUR_MIN,
} from "../../src/engine/trees";

const STATION = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
const METEO = syntheticYear(LIMON_RICHE.climat);

describe("le tirage de vigueur", () => {
  it("se répartit autour de 1, sans excès dans un sens ni dans l'autre", () => {
    let rng = rngStateFromSeed(7);
    const tirages: number[] = [];
    for (let i = 0; i < 400; i++) {
      const t = tirerVigueurIndividuelle(rng);
      rng = t.rng;
      tirages.push(t.vigueur);
    }
    const moyenne = tirages.reduce((a, b) => a + b, 0) / tirages.length;
    expect(moyenne).toBeGreaterThan(0.95);
    expect(moyenne).toBeLessThan(1.05);
    expect(Math.min(...tirages)).toBeGreaterThanOrEqual(VIGUEUR_MIN);
    expect(Math.max(...tirages)).toBeLessThanOrEqual(VIGUEUR_MAX);
    // Et il y a bien de la dispersion : ce n'est pas une constante déguisée.
    const ecart = Math.max(...tirages) - Math.min(...tirages);
    expect(ecart).toBeGreaterThan(DISPERSION_VIGUEUR);
  });

  it("il est déterministe : deux parties de même graine plantent les mêmes arbres", () => {
    const planter = () => {
      let state = createGameState(STATION, rngStateFromSeed(2026));
      for (let k = 0; k < 5; k++) state = plantAt(state, "fagus_sylvatica", 5 + k * 5, 20, 0.5);
      return state.trees.map((t) => t.vigueurIndividuelle);
    };
    expect(planter()).toEqual(planter());
  });
});

describe("ce que la dispersion produit dans un peuplement", () => {
  it("un peuplement pur cesse d'être une rangée de clones", () => {
    let state = createGameState(STATION, rngStateFromSeed(5));
    for (let k = 0; k < 24; k++) {
      state = plantAt(state, "fagus_sylvatica", 5 + (k % 6) * 5, 5 + Math.floor(k / 6) * 8, 0.5);
    }
    for (let i = 0; i < 30 * 52; i++) state = tick(state, METEO[i % 52] as never).state;
    const hauteurs = state.trees
      .filter((t) => t.alive && t.id < 24)
      .map((t) => t.heightM)
      .sort((a, b) => a - b);
    expect(hauteurs.length).toBeGreaterThan(5);
    const min = hauteurs[0] ?? 0;
    const max = hauteurs[hauteurs.length - 1] ?? 0;
    // Une hiérarchie s'installe : le plus grand dépasse nettement le plus petit.
    expect(max).toBeGreaterThan(1.2 * min);
  });

  it("les dominants sont ceux qui avaient la vigueur, pas ceux qui ont eu de la chance", () => {
    let state = createGameState(STATION, rngStateFromSeed(11));
    for (let k = 0; k < 16; k++) {
      state = plantAt(state, "quercus_pubescens", 6 + (k % 4) * 9, 6 + Math.floor(k / 4) * 9, 0.5);
    }
    for (let i = 0; i < 25 * 52; i++) state = tick(state, METEO[i % 52] as never).state;
    const vivants = state.trees.filter((t) => t.alive && t.id < 16);
    const parVigueur = [...vivants].sort((a, b) => a.vigueurIndividuelle - b.vigueurIndividuelle);
    const moitieFaible = parVigueur.slice(0, Math.floor(parVigueur.length / 2));
    const moitieForte = parVigueur.slice(Math.ceil(parVigueur.length / 2));
    const moyenne = (l: typeof vivants) => l.reduce((s, t) => s + t.heightM, 0) / l.length;
    expect(moyenne(moitieForte)).toBeGreaterThan(moyenne(moitieFaible));
  });
});
