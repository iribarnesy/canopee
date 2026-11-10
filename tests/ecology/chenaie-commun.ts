/**
 * La chênaie des essais de la glandée (`glandee.test.ts`,
 * `glandee-sanglier.test.ts`) : seize chênes pubescents de 12 m plantés à 6 m sur
 * 24 m, limon riche, année synthétique, à une densité de sanglier donnée.
 */

import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

export const METEO_CHENAIE = syntheticYear(LIMON_RICHE.climat);

/** Côté de la parcelle de la chênaie, m. */
export const COTE_CHENAIE = 24;

/** Une chênaie mûre, `ans` années, à une densité de sanglier donnée. */
export function chenaie(densite: number, ans: number, graine = 3) {
  const station: Station = {
    ...LIMON_RICHE.station,
    coteM: COTE_CHENAIE,
    voisinage: [],
    ventExposition: 0,
    sanglierParHa: densite,
  };
  let s = createGameState(station, rngStateFromSeed(graine));
  for (let y = 3; y < COTE_CHENAIE; y += 6) {
    for (let x = 3; x < COTE_CHENAIE; x += 6) s = plantAt(s, "quercus_pubescens", x, y, 12);
  }
  const plantes = s.trees.length;
  const parAn = new Map<number, number>();
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO_CHENAIE[i % METEO_CHENAIE.length];
    if (!w) throw new Error("météo manquante");
    const t = tick(s, w);
    s = t.state;
    const n = t.naissances.length;
    if (n > 0) parAn.set(Math.floor(i / 52), (parAn.get(Math.floor(i / 52)) ?? 0) + n);
  }
  return { recrues: s.trees.filter((t) => t.alive).length - plantes, parAn, etat: s };
}
