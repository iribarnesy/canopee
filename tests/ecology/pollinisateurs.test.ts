/**
 * Où sont les pollinisateurs (issue #299).
 *
 * Le service de pollinisation lisait, pour chaque arbre en fleur, le minimum
 * du gîte (l'habitat des auxiliaires) et de la table (la mémoire florale). Le
 * rendu veut poser des abeilles et des papillons là où ils sont : le moteur
 * lui donne ce minimum, cellule par cellule, plutôt que de le laisser refaire
 * la règle de son côté.
 *
 * Ce que ce fichier vérifie :
 *   1. la règle elle-même : le plus rare décide, et le plancher n'y est pas ;
 *   2. le contrat de la grille que rend le tick : sa taille, ses bornes, et
 *      qu'elle ne dépasse jamais la table de la semaine ;
 *   3. qu'elle suit un fait de terrain simple : une haie fleurie loge et
 *      nourrit des insectes que la prairie seule ne loge pas.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { pollinisateursParCellule, tick } from "../../src/engine/tick";

describe("la règle : un gîte et une table, et le plus rare décide", () => {
  it("rend le minimum des deux, cellule par cellule", () => {
    const habitat = [0, 0.8, 0.3, 1, 0.5];
    const table = [0.6, 0.2, 0.3, 1, 0];
    expect([...pollinisateursParCellule(habitat, table)]).toEqual([0, 0.2, 0.3, 1, 0]);
  });

  it("n'ajoute pas le plancher : sans gîte ni table, personne", () => {
    // Le plancher du service (0,35) dit ce qui noue **sans** insecte sauvage :
    // le vent, les abeilles d'un voisin, l'autogamie. Il n'a rien à faire dans
    // une carte qui dit où les insectes sont.
    const carte = pollinisateursParCellule(new Float64Array(4), new Float32Array(4).fill(1));
    expect([...carte].every((v) => v === 0)).toBe(true);
  });
});

describe("la grille du tick", () => {
  const COTE = 50;
  const HAIE = ["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus", "arbutus_unedo"];
  // Assez pour que la mémoire florale se remplisse au printemps de la
  // deuxième année, et pas plus : c'est un essai de contrat, pas de croissance.
  const SEMAINES = 52 + 26;
  const SEMAINE_LUE = 52 + 25;

  const partie = (avecHaie: boolean) => {
    const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [], gibierParHa: 0 };
    const weather = syntheticYear(LIMON_RICHE.climat);
    let state: GameState = createGameState(station, rngStateFromSeed(3));
    if (avecHaie) {
      // Une haie double le long du bord ouest, déjà en âge de fleurir : c'est
      // la floraison qu'on veut voir agir, pas l'attente de la maturité.
      let k = 0;
      for (const x of [3, 6]) {
        for (let y = 2; y < COTE - 1; y += 3) {
          const id = HAIE[k++ % HAIE.length];
          if (!id) throw new Error("haie");
          state = plantAt(state, id, x, y, 3);
        }
      }
      state = { ...state, trees: state.trees.map((t) => ({ ...t, ageWeeks: 20 * 52 })) };
    }
    const nCells = COTE * COTE;
    let lue: Float32Array = new Float32Array(0);
    for (let w = 0; w < SEMAINES; w++) {
      const m = weather[w % weather.length];
      if (!m) throw new Error("météo manquante");
      const r = tick(state, m);
      state = r.state;
      // Le contrat vaut **chaque** semaine, pas seulement celle qu'on lit.
      const g = r.pollinisateurs;
      expect(g).toHaveLength(nCells);
      for (let i = 0; i < nCells; i++) {
        const v = g[i] ?? Number.NaN;
        if (!(v >= 0 && v <= 1)) throw new Error(`semaine ${w}, cellule ${i} : ${v} hors de [0,1]`);
        // Le minimum ne dépasse jamais la table. La comparaison est exacte : la
        // mémoire florale est déjà en simple précision, et arrondir un nombre
        // qui lui est inférieur ne peut pas la dépasser.
        const table = state.soil.ressourceFlorale[i] ?? 0;
        if (v > table) throw new Error(`semaine ${w}, cellule ${i} : ${v} > table ${table}`);
      }
      if (w === SEMAINE_LUE) lue = g;
    }
    const moyenne = (pred: (x: number) => boolean) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < nCells; i++) {
        if (!pred(i % COTE)) continue;
        s += lue[i] ?? 0;
        n++;
      }
      return s / n;
    };
    // Les blocs de 10 m et leur fenêtre de 3×3 portent la haie jusqu'à ~20 m :
    // au-delà de 30 m, on est hors de sa portée.
    return { pres: moyenne((x) => x < 10), loin: moyenne((x) => x >= 30) };
  };

  it("est plus haute près d'une haie fleurie que dans la prairie seule", () => {
    const haie = partie(true);
    const temoin = partie(false);
    // Mesuré en juin de la deuxième année (trois graines, au millième près) :
    // 0,035 au pied de la haie, 0,004 à trente mètres comme dans la prairie
    // sans haie. Un facteur deux laisse toute la marge à l'écart observé, qui
    // est de neuf.
    expect(haie.pres).toBeGreaterThan(2 * haie.loin);
    expect(haie.pres).toBeGreaterThan(2 * temoin.pres);
    // Et la haie ne fabrique pas d'insectes là où elle ne porte pas.
    expect(haie.loin).toBeCloseTo(temoin.loin, 2);
  }, 120_000);
});
