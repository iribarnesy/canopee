/**
 * L'effet de bord : ce qu'il y a AUTOUR de la parcelle ombrage ses lisières.
 *
 * Le moteur traitait la limite de parcelle comme une limite du monde : au-delà,
 * rien. Un carré de bocage au milieu d'un massif recevait donc autant de
 * lumière sur ses bords qu'une clairière isolée — faux, et faux dans le sens
 * qui compte, puisque la lisière est l'endroit où l'agroforesterie se joue.
 */

import { describe, expect, it } from "vitest";
import {
  lumiereApresBordures,
  OMBRAGE_MAX_LISIERE,
  profondeurOmbrageM,
} from "../../src/engine/lisiere";
import { syntheticYear } from "../../src/engine/meteo";
import { bordersUniformes, getPaysage } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const DIMS = { widthM: 60, heightM: 60 };
const MASSIF = bordersUniformes("massif-forestier");
const CHAMPS = bordersUniformes("plaine-cerealiere");

describe("ce qui ombrage une parcelle est ce qui est au SUD", () => {
  it("le massif au sud coûte de la lumière, le même au nord n'en coûte pas", () => {
    // C'est le point qui rend ce mécanisme non trivial. Le soleil est au sud en
    // France, les ombres tombent vers le nord : un bois planté au NORD d'une
    // parcelle ne lui prend pas une heure de soleil — c'est elle qui l'ombrage.
    const sudBoise = { ...CHAMPS, sud: "massif-forestier" };
    const nordBoise = { ...CHAMPS, nord: "massif-forestier" };
    const aLaLisiereSud = lumiereApresBordures(30, 0.5, DIMS, sudBoise);
    const aLaLisiereNord = lumiereApresBordures(30, 59.5, DIMS, nordBoise);
    expect(aLaLisiereSud).toBeLessThan(1);
    expect(aLaLisiereNord).toBe(1);
  });

  it("l'est et l'ouest comptent, mais moins : le soleil y est bas", () => {
    const sud = lumiereApresBordures(30, 0.5, DIMS, { ...CHAMPS, sud: "massif-forestier" });
    const ouest = lumiereApresBordures(0.5, 30, DIMS, { ...CHAMPS, ouest: "massif-forestier" });
    expect(ouest).toBeLessThan(1);
    expect(ouest).toBeGreaterThan(sud);
  });
});

describe("l'ombrage ne porte que sur une bande", () => {
  it("il s'estompe avec la distance et disparaît au cœur de la parcelle", () => {
    const profondeur = profondeurOmbrageM(getPaysage("massif-forestier").partBoisee);
    const bord = lumiereApresBordures(30, 0.5, DIMS, MASSIF);
    const milieu = lumiereApresBordures(30, profondeur / 2, DIMS, MASSIF);
    const coeur = lumiereApresBordures(30, 30, DIMS, MASSIF);
    expect(bord).toBeLessThan(milieu);
    expect(milieu).toBeLessThan(coeur);
    expect(coeur).toBe(1);
  });

  it("il dépend de la part BOISÉE de l'entourage, pas de sa seule présence", () => {
    // Une plaine céréalière n'ombrage rien : c'est bien le bois qui compte, et
    // le mécanisme lit `partBoisee` plutôt que de traiter tout voisinage
    // comme opaque.
    expect(getPaysage("plaine-cerealiere").partBoisee).toBeLessThan(
      getPaysage("massif-forestier").partBoisee,
    );
    expect(lumiereApresBordures(30, 0.5, DIMS, CHAMPS)).toBeGreaterThan(
      lumiereApresBordures(30, 0.5, DIMS, MASSIF),
    );
  });

  it("même au pire, il reste de la lumière : un bord n'est pas un mur", () => {
    const pire = lumiereApresBordures(30, 0, DIMS, MASSIF);
    expect(pire).toBeGreaterThan(0);
    expect(pire).toBeGreaterThanOrEqual(1 - OMBRAGE_MAX_LISIERE);
  });
});

describe("dans une partie, l'entourage se paie — ou se gagne", () => {
  it("un héliophile de lisière sud pousse moins à l'ombre d'un massif", () => {
    const METEO = syntheticYear(LIMON_RICHE.climat);
    const hauteurApres = (bordures: typeof MASSIF) => {
      const station = {
        ...LIMON_RICHE.station,
        coteM: 60,
        gibierParHa: 0,
        voisinage: [],
        bordures,
      };
      let state = createGameState(station, rngStateFromSeed(6));
      // Au ras de la limite sud, là où l'entourage porte.
      state = plantAt(state, "pinus_sylvestris", 30, 1, 0.5);
      const id = state.nextTreeId - 1;
      for (let i = 0; i < 20 * 52; i++) state = tick(state, METEO[i % 52] as never).state;
      return state.trees.find((t) => t.id === id)?.heightM ?? 0;
    };
    expect(hauteurApres(MASSIF)).toBeLessThan(hauteurApres(CHAMPS));
  });

  it("mais un SCIAPHILE assoiffé y gagne, et ce n'est pas un bug", () => {
    // Résultat contre-intuitif, trouvé en écrivant l'essai précédent : le même
    // dispositif avec un hêtre donne 8,7 m à l'ombre du massif contre 7,4 en
    // plaine découverte. L'ombre lui PROFITE.
    //
    // La raison tient en une ligne : sur le limon riche, à 750 mm de pluie, le
    // hêtre est limité par l'EAU et non par la lumière (voir la section des
    // hauteurs). Moins de rayonnement, c'est moins de transpiration, donc moins
    // de stress hydrique — et il supporte l'ombre par tempérament. C'est
    // exactement le mécanisme de l'effet nurse, appliqué à une lisière.
    //
    // On l'éprouve ici pour qu'il ne passe pas pour une régression le jour où
    // quelqu'un le remarquera.
    const METEO = syntheticYear(LIMON_RICHE.climat);
    const hetreApres = (bordures: typeof MASSIF) => {
      const station = {
        ...LIMON_RICHE.station,
        coteM: 60,
        gibierParHa: 0,
        voisinage: [],
        bordures,
      };
      let state = createGameState(station, rngStateFromSeed(6));
      state = plantAt(state, "fagus_sylvatica", 30, 1, 0.5);
      const id = state.nextTreeId - 1;
      for (let i = 0; i < 20 * 52; i++) state = tick(state, METEO[i % 52] as never).state;
      return state.trees.find((t) => t.id === id)?.heightM ?? 0;
    };
    expect(hetreApres(MASSIF)).toBeGreaterThan(hetreApres(CHAMPS));
  });
}, 300_000);
