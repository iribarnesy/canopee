/**
 * L'arrangement spatial dans l'indice de biodiversité (issue #75, critère J4).
 *
 * Ce que l'indice ne savait pas voir : il comptait ce qu'il Y A — les espèces,
 * les strates, le bois mort, les gros sujets — et jamais COMMENT C'EST ARRANGÉ.
 * Deux parcelles portant exactement les mêmes espèces, les mêmes hauteurs et le
 * même bois mort recevaient la même note qu'elles forment un bloc homogène ou
 * une mosaïque de bosquets et de clairières.
 *
 * Ce que ce fichier vérifie : que la disposition paie, que le MITAGE ne paie
 * pas, et que l'étagement local se distingue enfin du damier de blocs.
 */

import { describe, expect, it } from "vitest";
import {
  heterogeneiteVerticale,
  indiceBiodiversite,
  structureHorizontale,
} from "../../src/engine/biodiversite";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const COTE = 30;
const STATION = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };

/** Une parcelle plantée aux positions données, tous les arbres à la même taille. */
function parcelle(positions: readonly (readonly [number, number])[], hauteurM: number): GameState {
  let s = createGameState(STATION, rngStateFromSeed(1));
  for (const [x, y] of positions) s = plantAt(s, "quercus_pubescens", x, y, hauteurM);
  return s;
}

/** Trente-six arbres, quatre dispositions — même nombre, même espèce, même âge. */
const REGULIER: [number, number][] = [];
for (let i = 0; i < 6; i++) {
  for (let j = 0; j < 6; j++) REGULIER.push([2 + i * 5.5, 2 + j * 5.5]);
}
const BLOC: [number, number][] = [];
for (let i = 0; i < 6; i++) {
  for (let j = 0; j < 6; j++) BLOC.push([3 + i * 2.2, 3 + j * 2.2]);
}
const BOSQUETS: [number, number][] = [];
for (let b = 0; b < 4; b++) {
  const bx = 6 + (b % 2) * 15;
  const by = 6 + Math.floor(b / 2) * 15;
  for (let k = 0; k < 9; k++) BOSQUETS.push([bx + (k % 3) * 2.5, by + Math.floor(k / 3) * 2.5]);
}

describe("la mosaïque : ni le bloc plein, ni le mitage", () => {
  it("une mosaïque de bosquets bat le bloc ET la plantation régulière", () => {
    // Relevé à l'écriture, trente-six chênes de 14 m sur 30 m de côté :
    // bosquets 0,790 — bloc serré 0,225 — régulier 0,000.
    const bosquets = structureHorizontale(parcelle(BOSQUETS, 14).trees, COTE);
    const bloc = structureHorizontale(parcelle(BLOC, 14).trees, COTE);
    const regulier = structureHorizontale(parcelle(REGULIER, 14).trees, COTE);
    expect(bosquets.mosaique).toBeGreaterThan(bloc.mosaique);
    expect(bosquets.mosaique).toBeGreaterThan(regulier.mosaique);
  });

  it("une plantation régulière et pleine n'a AUCUNE lisière", () => {
    // Elle est tout entière du cœur : c'est un milieu, pas une mosaïque. Elle
    // ne doit rien gagner au titre de l'arrangement.
    const regulier = structureHorizontale(parcelle(REGULIER, 14).trees, COTE);
    expect(regulier.coeur).toBeGreaterThan(0.9);
    expect(regulier.lisiere).toBeLessThan(0.05);
    expect(regulier.mosaique).toBeCloseTo(0, 3);
  });

  it("LE MITAGE NE PAIE PAS, et c'est la mise en garde de l'issue", () => {
    // « Une lisière a de la valeur, un peuplement qui n'est QUE de la lisière
    // n'en a pas — les espèces de cœur de massif existent aussi. »
    //
    // Des petits arbres éparpillés font des houppiers disjoints : 94 % de la
    // parcelle en frontière, et pas un mètre carré de cœur. Le produit vaut
    // donc zéro — **sans qu'on ait eu à choisir un sommet de courbe**. C'est
    // tout l'intérêt d'avoir multiplié les deux parts plutôt que d'ajuster une
    // cloche : le refus du mitage TOMBE de l'énoncé « il faut les deux ».
    const mitage = structureHorizontale(parcelle(REGULIER, 3).trees, COTE);
    expect(mitage.lisiere).toBeGreaterThan(0.5);
    expect(mitage.coeur).toBeCloseTo(0, 3);
    expect(mitage.mosaique).toBeCloseTo(0, 3);
  });

  it("une parcelle vide n'est ni lisière ni cœur", () => {
    const vide = structureHorizontale([], COTE);
    expect(vide.lisiere).toBe(0);
    expect(vide.mosaique).toBe(0);
  });
});

describe("l'étagement local : ce que le décompte des strates confondait", () => {
  it("un peuplement équienne n'est pas étagé, trois hauteurs le sont", () => {
    // Relevé : 0,000 contre 0,677. L'indice comptait les strates à l'échelle de
    // la PARCELLE, donc il notait pareil une forêt étagée et un damier de blocs
    // monostrates. C'est exactement ce que cette grandeur répare.
    const equienne = parcelle(REGULIER, 14);
    let etage = createGameState(STATION, rngStateFromSeed(1));
    for (let k = 0; k < REGULIER.length; k++) {
      const p = REGULIER[k];
      if (!p) continue;
      etage = plantAt(
        etage,
        "quercus_pubescens",
        p[0],
        p[1],
        k % 3 === 0 ? 20 : k % 3 === 1 ? 8 : 2,
      );
    }
    expect(heterogeneiteVerticale(equienne.trees, COTE)).toBeCloseTo(0, 3);
    expect(heterogeneiteVerticale(etage.trees, COTE)).toBeGreaterThan(0.4);
  });
});

describe("l'indice tout entier : la disposition paie", () => {
  it("à espèces, nombre et âge IDENTIQUES, la mosaïque note mieux", () => {
    // C'est ce que le jeu existe pour enseigner : « le joueur qui dispose ses
    // arbres en bandes, en bosquets ou en semis dispersé ne voit aujourd'hui
    // aucune différence de biodiversité tant que les espèces sont les mêmes ».
    const surfaceHa = (COTE * COTE) / 10_000;
    const bosquets = indiceBiodiversite(parcelle(BOSQUETS, 14).trees, 0, surfaceHa, COTE);
    const regulier = indiceBiodiversite(parcelle(REGULIER, 14).trees, 0, surfaceHa, COTE);
    expect(bosquets.richesse).toBe(regulier.richesse);
    expect(bosquets.note).toBeGreaterThan(regulier.note);
  });

  it("sans géométrie, l'indice se comporte comme avant", () => {
    // Les appelants qui n'ont pas de parcelle — un essai sur une liste d'arbres
    // — ne doivent pas être pénalisés pour une géométrie qu'ils n'ont pas.
    const sans = indiceBiodiversite(parcelle(BOSQUETS, 14).trees, 0, 0.09);
    expect(sans.mosaique).toBe(0);
    expect(sans.etagement).toBe(0);
    expect(sans.note).toBeGreaterThan(0);
  });
});
