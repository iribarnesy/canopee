/**
 * Le limon acide sur socle : la station qui manquait.
 *
 * La station de référence du moteur est à pH 7. Or le châtaignier s'arrête à
 * 6,5 et le houx à 7 : deux espèces de l'atlas ne pouvaient vivre sur AUCUNE
 * station de comparaison, et l'essai des hauteurs devait s'en fabriquer une à
 * la volée. Ce n'était pas un défaut du modèle de pH — un châtaignier ne pousse
 * pas sur calcaire — mais une lacune du catalogue.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_ACIDE, LIMON_RICHE, STATIONS_V0 } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Hauteur moyenne des sujets plantés après `ans` années, moyennée sur deux graines. */
function apres(
  station: (typeof LIMON_ACIDE)["station"],
  climat: (typeof LIMON_ACIDE)["climat"],
  especeId: string,
  ans: number,
) {
  const meteo = syntheticYear(climat);
  let somme = 0;
  let vivants = 0;
  for (const graine of [11, 29]) {
    let state = createGameState(
      { ...station, coteM: 40, gibierParHa: 0, voisinage: [] },
      rngStateFromSeed(graine),
    );
    state = plantScattered(state, especeId, 8, 0.3);
    for (let i = 0; i < ans * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    const v = state.trees.filter((t) => t.alive && t.id <= 8);
    somme += v.reduce((s, t) => s + t.heightM, 0);
    vivants += v.length;
  }
  return { hauteurMoyenne: vivants > 0 ? somme / vivants : 0, vivants };
}

describe("la station acide est dans le catalogue", () => {
  it("elle y est, et elle est vraiment acide", () => {
    expect(STATIONS_V0.some((s) => s.station.id === "limon-acide")).toBe(true);
    expect(LIMON_ACIDE.station.phInitial).toBeLessThan(5.5);
  });

  it("ce n'est pas le limon riche avec un pH baissé", () => {
    // Un sol lessivé sur socle acide diffère par plus que son pH : plus
    // sableux, matière organique accumulée parce qu'elle se minéralise
    // lentement, azote minéral plus bas pour la même raison.
    const acide = LIMON_ACIDE.station.profil[0];
    const riche = LIMON_RICHE.station.profil[0];
    expect(acide?.sable).toBeGreaterThan(riche?.sable ?? 1);
    expect(acide?.moPct).toBeGreaterThan(riche?.moPct ?? 0);
  });
});

describe("les acidiphiles y sont enfin chez eux", () => {
  it("le châtaignier vit sur l'acide et meurt sur le riche", () => {
    const gamme = getEspece("castanea_sativa").ph;
    expect(gamme[1]).toBeLessThan(LIMON_RICHE.station.phInitial);

    const surAcide = apres(LIMON_ACIDE.station, LIMON_ACIDE.climat, "castanea_sativa", 12);
    expect(surAcide.vivants).toBeGreaterThan(0);
    expect(surAcide.hauteurMoyenne).toBeGreaterThan(2);

    const surRiche = apres(LIMON_RICHE.station, LIMON_RICHE.climat, "castanea_sativa", 12);
    expect(surRiche.vivants).toBe(0);
  });

  it("le houx aussi, lui qui s'arrête juste au pH de la station de référence", () => {
    const surAcide = apres(LIMON_ACIDE.station, LIMON_ACIDE.climat, "ilex_aquifolium", 12);
    expect(surAcide.vivants).toBeGreaterThan(0);
  });
}, 300_000);
