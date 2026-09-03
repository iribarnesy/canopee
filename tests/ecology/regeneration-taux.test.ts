/**
 * Les taux de régénération fractionnaires (regeneration.ts).
 *
 * `semisParAn` compte des établissements POTENTIELS, après l'entonnoir de
 * mortalité graine→semis. Pour une espèce à grosses graines convoitées, cet
 * entonnoir est si étroit que le taux tombe sous 1 : la boucle entière n'en
 * produisait alors jamais aucun, ce qui obligeait à arrondir à 1 — et un
 * noisetier plaçait un descendant par an et par pied.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Recrues installées en N années, pour un taux d'arrivée donné. */
function recrues(semisParAn: number, annees: number, seed: number): number {
  const st = {
    ...LIMON_RICHE.station,
    coteM: 30,
    gibierParHa: 0,
    voisinage: [{ especeId: "betula_pendula", semisParAn }],
  };
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let state = createGameState(st, rngStateFromSeed(seed));
  for (let i = 0; i < annees * 52; i++) state = tick(state, meteo[i % 52] as never).state;
  return state.trees.length;
}

describe("un taux de régénération inférieur à 1", () => {
  it("produit des semis, mais bien moins qu'un taux de 1", () => {
    const rare = recrues(0.3, 20, 4);
    const courant = recrues(1, 20, 4);
    expect(rare).toBeGreaterThan(0);
    expect(rare).toBeLessThan(courant);
  });

  it("reste déterministe : même graine, même résultat", () => {
    expect(recrues(0.4, 12, 7)).toBe(recrues(0.4, 12, 7));
  });

  it("le noisetier sème moins d'un plant par pied et par an", () => {
    // Ce que mangent les mulots, les écureuils, les geais et le balanin.
    expect(getEspece("corylus_avellana").regeneration.semisParAn).toBeLessThan(1);
  });
});
