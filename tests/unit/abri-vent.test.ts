/**
 * L'abri au vent indexé donne EXACTEMENT ce que donnait le balayage complet.
 *
 * `windShelterAt` coûtait le peuplement entier par arbre et par semaine — un n²
 * hebdomadaire, premier poste de calcul du tick dès qu'une parcelle se peuple
 * (#99). `abriVentIndexe` ne lit que le panier du point interrogé.
 *
 * CE QU'IL FAUT PROUVER N'EST PAS « À PEU PRÈS PAREIL ». Une somme de flottants
 * n'est pas associative : changer l'ORDRE des voisins changerait les derniers
 * chiffres, et un seuil quelque part dans la suite pourrait basculer sans que
 * personne comprenne pourquoi. L'égalité est donc exigée STRICTE, `toBe` et non
 * `toBeCloseTo`, sur des peuplements où la somme a beaucoup de termes.
 */

import { describe, expect, it } from "vitest";
import { abriVentIndexe, indexerAbriVent, windShelterAt } from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Une parcelle qu'on laisse se peupler pour de bon : la somme doit avoir des termes. */
function peuplement(station: typeof LIMON_RICHE, ans: number, seed: number) {
  const meteo = syntheticYear(station.climat);
  let state = createGameState({ ...station.station, coteM: 40 }, rngStateFromSeed(seed));
  state = plantScattered(state, "pinus_sylvestris", 40);
  state = plantScattered(state, "betula_pendula", 40);
  for (let w = 0; w < ans * 52; w++) {
    const m = meteo[w % 52];
    if (!m) throw new Error("météo manquante");
    state = tick(state, m).state;
  }
  return state;
}

describe("l'abri au vent, rangé par paniers", () => {
  it("rend exactement le même nombre que le balayage complet, arbre par arbre", () => {
    const state = peuplement(LIMON_RICHE, 12, 3);
    const trees = state.trees;
    const paniers = indexerAbriVent(trees, 40);
    // Il y a quelque chose à vérifier : un peuplement, et des abris non nuls.
    const vivants = trees.filter((t) => t.alive);
    expect(vivants.length).toBeGreaterThan(30);
    let nonNuls = 0;
    for (const arbre of vivants) {
      const balayage = windShelterAt(trees, arbre.x, arbre.y, arbre.id);
      const indexe = abriVentIndexe(paniers, arbre.x, arbre.y, arbre.id);
      expect(indexe, `arbre ${arbre.id}`).toBe(balayage);
      if (balayage > 0) nonNuls++;
    }
    expect(nonNuls).toBeGreaterThan(vivants.length / 2);
  });

  it("et aussi en des points quelconques du sol, y compris les coins", () => {
    const state = peuplement(LANDE_SECHE, 10, 5);
    const paniers = indexerAbriVent(state.trees, 40);
    for (let i = 0; i < 200; i++) {
      const x = ((i * 7919) % 400) / 10;
      const y = ((i * 6277) % 400) / 10;
      expect(abriVentIndexe(paniers, x, y), `point ${x},${y}`).toBe(
        windShelterAt(state.trees, x, y),
      );
    }
  });

  it("une parcelle vide n'abrite personne, et un arbre seul ne s'abrite pas lui-même", () => {
    expect(abriVentIndexe(indexerAbriVent([], 40), 20, 20)).toBe(0);
    const state = peuplement(LIMON_RICHE, 1, 9);
    const seul = state.trees[0];
    if (!seul) throw new Error("parcelle vide");
    const paniers = indexerAbriVent([seul], 40);
    expect(abriVentIndexe(paniers, seul.x, seul.y, seul.id)).toBe(0);
  });
});
