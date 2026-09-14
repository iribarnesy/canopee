/**
 * Le drageonnement : la conquête par la racine, pas par la graine.
 *
 * La fiche du prunellier le disait elle-même : « faute de savoir modéliser le
 * drageonnement, on compense par un taux de semis généreux ». La compensation
 * donnait à peu près le bon NOMBRE de prunelliers et la mauvaise MANIÈRE — des
 * semis d'oiseaux essaimés au hasard au lieu d'un fourré qui s'épaissit.
 *
 * Un drageon n'est pas un semis, et deux choses le distinguent :
 *  - il naît sur une racine traçante, donc à quelques mètres de sa mère ;
 *  - il reste RELIÉ à elle, qui le nourrit, donc il n'a pas besoin de trouver
 *    sa lumière tout seul.
 *
 * C'est la seconde qui fait le fourré : un drageon s'installe SOUS le couvert
 * de sa propre espèce, là où aucune graine de la même espèce ne lèverait.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { positionDeDrageon } from "../../src/engine/regeneration";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";

const STATION = { ...LIMON_RICHE.station, coteM: 40, gibierParHa: 0, voisinage: [] };
const METEO = syntheticYear(LIMON_RICHE.climat);

describe("un drageon sort près de sa mère, et c'est tout le mécanisme", () => {
  it("le prunellier a le trait, l'aubépine ne l'a pas", () => {
    // Un trait d'espèce, pas une règle générale : toutes les épineuses de haie
    // ne drageonnent pas. L'aubépine se sème par les oiseaux et reste où elle
    // est ; c'est ce qui en fait le témoin de tous les essais qui suivent.
    expect(getEspece("prunus_spinosa").regeneration.drageonne).toBeDefined();
    expect(getEspece("crataegus_monogyna").regeneration.drageonne).toBeUndefined();
  });

  it("il tombe dans l'anneau de la portée, jamais au loin ni au pied", () => {
    const espece = getEspece("prunus_spinosa");
    const portee = espece.regeneration.drageonne?.porteeM ?? 0;
    const mere = { x: 20, y: 20 } as TreeState;
    let rng = rngStateFromSeed(3);
    for (let k = 0; k < 200; k++) {
      const p = positionDeDrageon(rng, mere, 40, espece);
      rng = p.rng;
      const d = Math.hypot(p.x - 20, p.y - 20);
      expect(d).toBeLessThanOrEqual(portee + 1e-9);
      // On ne tire pas au pied : un drageon qui sortirait là serait de toute
      // façon écarté par l'espacement minimal, et le tirer gâcherait une
      // tentative.
      expect(d).toBeGreaterThan(portee / 4);
    }
  });

  it("sans mère, pas de drageon — le mécanisme ne se déclenche pas tout seul", () => {
    const p = positionDeDrageon(rngStateFromSeed(1), null, 40, getEspece("prunus_spinosa"));
    expect(p.x).toBeLessThan(0);
  });
});

describe("le fourré s'épaissit là où la haie se contente de s'étendre", () => {
  /** Cinq pieds au milieu d'une parcelle nue, et vingt-cinq ans. */
  function fourre(especeId: string) {
    let state = createGameState(STATION, rngStateFromSeed(5));
    for (let i = 0; i < 5; i++) state = plantAt(state, especeId, 20, 14 + i * 3, 1.5);
    for (let i = 0; i < 25 * 52; i++) state = tick(state, METEO[i % 52] as never).state;
    const pieds = state.trees.filter((t) => t.alive && t.especeId === especeId);
    const auPlusProche = pieds
      .map((t) => {
        const autres = pieds.filter((o) => o.id !== t.id);
        return autres.length
          ? Math.min(...autres.map((o) => Math.hypot(t.x - o.x, t.y - o.y)))
          : Number.POSITIVE_INFINITY;
      })
      .sort((a, b) => a - b);
    return {
      pieds: pieds.length,
      voisinMedian: auPlusProche[Math.floor(auPlusProche.length / 2)] ?? 0,
    };
  }

  it("le prunellier fait bien plus de pieds, et les serre plus", () => {
    // 423 pieds contre 170, et 1,36 m entre voisins contre 1,78. Le nombre de
    // TENTATIVES est pourtant le même qu'avant (0,4 semis + 0,8 drageons contre
    // 1,2 semis) : ce qui change est le taux de RÉUSSITE, parce qu'un drageon
    // échappe au filtre de lumière et s'installe sous le couvert des siens.
    const prunellier = fourre("prunus_spinosa");
    const aubepine = fourre("crataegus_monogyna");
    expect(prunellier.pieds).toBeGreaterThan(2 * aubepine.pieds);
    expect(prunellier.voisinMedian).toBeLessThan(aubepine.voisinMedian);
  });

  it("mais sur cette parcelle-là, les deux finissent par occuper tout l'espace", () => {
    // Ce que l'essai NE montre pas, et qu'il vaut mieux dire : sur quarante
    // mètres et en vingt-cinq ans, les oiseaux ont le temps de semer partout.
    // La différence n'est donc pas dans l'emprise, elle est dans la DENSITÉ.
    // Mesurer une tache qui avance demanderait une parcelle plus grande et une
    // partie plus longue que ce qu'une suite d'essais peut se payer.
    const prunellier = fourre("prunus_spinosa");
    expect(prunellier.pieds).toBeGreaterThan(100);
  });
}, 300_000);
