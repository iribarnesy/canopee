/**
 * Le point zéro du bilan carbone (issue #202, critères I1 à I9).
 *
 * Le compteur n'a jamais parti de zéro tonne : `bilanNetTHa` est un **écart**, et
 * une parcelle nue démarre à 0,00 alors qu'elle porte déjà soixante-quatorze
 * tonnes de carbone dans son profil. C'était l'intention, et elle est juste.
 *
 * Ce que ce fichier vérifie est l'autre moitié : que l'écart se compte à partir
 * de ce que le joueur **trouve en arrivant**, arbres compris, et non à partir d'une
 * constante de la fiche de station.
 */

import { describe, expect, it } from "vitest";
import { carbonInventory, figerCarboneDeReference } from "../../src/engine/carbon";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const STATION = { ...LIMON_RICHE.station, coteM: 30 };
const METEO = syntheticYear(LIMON_RICHE.climat);

/** Ce que `faireVieillir` fait avant l'arrivée du joueur (worker.ts, A26). */
function vieillir(annees: number): GameState {
  let s = createGameState(STATION, rngStateFromSeed(4));
  for (let i = 0; i < annees * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return { ...s, week: 0 };
}

describe("le bilan part de ce que le joueur trouve", () => {
  it("sur une parcelle neuve, figer ne change rien : la référence EST le carbone du profil", () => {
    // Le témoin exact du lot, et il est gratuit : à maturation nulle, la valeur
    // figée doit valoir `station.initialSoilCTHa` au centième près, sans quoi
    // toutes les parties qui ne vieillissent pas la parcelle auraient changé de
    // point zéro pour rien.
    const neuf = createGameState(STATION, rngStateFromSeed(4));
    expect(neuf.carboneDeReferenceTHa).toBeCloseTo(STATION.initialSoilCTHa, 6);
    const fige = figerCarboneDeReference(neuf);
    expect(fige.carboneDeReferenceTHa).toBeCloseTo(STATION.initialSoilCTHa, 2);
    expect(carbonInventory(fige).bilanNetTHa).toBeCloseTo(0, 2);
  });

  it("sur une parcelle vieillie, le joueur arrive à zéro — et il arrivait à cent tonnes", () => {
    // **le défaut, et son ordre de grandeur.** `faireVieillir` fait tourner le
    // moteur pendant des décennies avant l'arrivée du joueur : la friche se
    // boise toute seule. La référence, elle, restait la constante de la fiche.
    // Relevé à l'écriture de l'issue, limon riche, à la semaine 0 du joueur :
    //
    //     maturation    bilan net     dont vivant   humus   (référence 73,97)
    //        0 ans      −0,00 t/ha       0,00       73,97
    //       10 ans      +0,06 t/ha       8,86       64,52
    //       30 ans     +45,48 t/ha      55,55       56,31
    //       60 ans    +107,61 t/ha     119,91       56,32
    //
    // Le joueur lisait « vous avez stocké 108 tonnes à l'hectare » avant d'avoir
    // posé un plant, et ces tonnes étaient celles d'arbres venus tout seuls.
    //
    // Et le défaut avait une seconde face : pendant la maturation l'humus **baisse**
    // (73,97 → 56,31), donc la référence surestimait le sol en même temps
    // qu'elle ignorait les arbres. Les deux erreurs ne se compensaient pas,
    // elles s'additionnaient dans deux cases du même total.
    const vieux = vieillir(30);
    // Ce que l'ancien calcul rendait — on le mesure ici plutôt que de le citer,
    // pour que l'essai tombe le jour où la maturation cesse de boiser.
    const ancien = carbonInventory(vieux, STATION.initialSoilCTHa).bilanNetTHa;
    expect(ancien).toBeGreaterThan(10);
    // Et ce qu'il rend maintenant : zéro, quelle que soit la maturation.
    const fige = figerCarboneDeReference(vieux);
    expect(carbonInventory(fige).bilanNetTHa).toBeCloseTo(0, 6);
  });

  it("le bois sur pied entre dans l'acquis, pas dans le mérite", () => {
    // La différence entre les deux références **est** le carbone des arbres venus
    // tout seuls, moins l'humus que la maturation a consommé. C'est ce que le
    // joueur trouve : son acquis. Ce qu'il en fera sera son mérite.
    const fige = figerCarboneDeReference(vieillir(30));
    const inv = carbonInventory(fige);
    expect(inv.vivantTHa).toBeGreaterThan(5);
    expect(fige.carboneDeReferenceTHa).toBeGreaterThan(STATION.initialSoilCTHa);
  });

  it("et raser ce qu'on a trouvé fait PLONGER le bilan, ce qui est le sens du jeu", () => {
    // Conséquence voulue de #202 : arriver sur une vieille chênaie et la raser
    // coûte, là où l'ancien calcul offrait cent tonnes d'avance gratuite. On le
    // vérifie sans passer par un geste : le bilan d'un état dont les arbres sont
    // morts et le bois parti se lit directement sur la référence figée.
    const fige = figerCarboneDeReference(vieillir(30));
    const rase: GameState = {
      ...fige,
      trees: [],
      carbon: { ...fige.carbon, deadWoodKgC: 0 },
    };
    expect(carbonInventory(rase).bilanNetTHa).toBeLessThan(-5);
  });
});
