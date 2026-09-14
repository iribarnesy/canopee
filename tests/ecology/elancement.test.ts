/**
 * « Serré = élancé » (docs/realisme.md E10) — et rien ne le déclare.
 *
 * Aucune règle du moteur ne dit qu'un peuplement dense fabrique des perches.
 * Les parties ci-dessous tournent avec la même espèce, les mêmes constantes et
 * la MÊME graine ; seul l'écartement change. Si le gradient apparaît, c'est
 * qu'il émerge de la compétition pour la lumière, ce qui est tout l'intérêt.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { elancement } from "../../src/engine/trees";

const COTE = 40;
const ANS = 30;

/** Une hêtraie plantée à cet écartement, trente ans plus tard. */
function hetraie(ecartM: number) {
  const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
  const weather = syntheticYear(LIMON_RICHE.climat);
  let state = createGameState(station, rngStateFromSeed(7));
  for (let x = 2; x < COTE - 1; x += ecartM) {
    for (let y = 2; y < COTE - 1; y += ecartM) {
      state = plantAt(state, "fagus_sylvatica", x, y);
    }
  }
  for (let w = 0; w < ANS * 52; w++) {
    const m = weather[w % weather.length];
    if (!m) throw new Error("météo manquante");
    state = tick(state, m).state;
  }
  const vivants = state.trees.filter((t) => t.alive);
  // LES DOMINANTS SEULEMENT, et c'est une précaution nécessaire : un peuplement
  // serré porte une foule de dominés que le peuplement clair n'a pas, et leur
  // moyenne noierait le signal. On compare ce qui est comparable.
  const tri = [...vivants].sort((a, b) => b.heightM - a.heightM);
  const dom = tri.slice(0, Math.max(1, Math.round(tri.length * 0.2)));
  const moyenne = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  return {
    tiges: vivants.length,
    elancementDom: moyenne(dom.map((t) => elancement(t.diametreCm, t.heightM))),
    diametreDom: moyenne(dom.map((t) => t.diametreCm)),
  };
}

describe("la densité de plantation fait la forme de la tige", () => {
  const serre = hetraie(2);
  const moyen = hetraie(4);
  const clair = hetraie(10);

  it("plus on plante serré, plus la tige est élancée", () => {
    // Mesuré à 2 / 4 / 6 / 10 m d'écartement : H/D des dominants vaut
    // 42,1 / 38,8 / 38,0 / 37,4. Le gradient est MONOTONE — serrer davantage
    // élance davantage, sans palier sur la gamme testée.
    expect(serre.elancementDom).toBeGreaterThan(moyen.elancementDom);
    expect(moyen.elancementDom).toBeGreaterThan(clair.elancementDom);
  });

  it("et la tige de plein vent est plus grosse, à âge égal", () => {
    // La contrepartie du même mécanisme : ce que l'arbre serré met en hauteur,
    // l'arbre au large le met en diamètre.
    expect(clair.diametreDom).toBeGreaterThan(serre.diametreDom);
  });

  it("l'amplitude reste TROP FAIBLE, et la cause est ailleurs", () => {
    // La sylviculture mesure H/D de 25–40 pour un sujet de plein vent et de
    // 90–100 pour une perche de plantation serrée. Le moteur couvre 35–49 : le
    // bon ORDRE, un cinquième de l'étendue.
    //
    // La cause est identifiée et ANTÉRIEURE à l'élancement : dans
    // `light.ts:extinctionAt`, un codominant n'ombrage qu'au poids 0,4 contre 1
    // pour un dominant — or en plantation régulière tout le monde est
    // codominant de tout le monde, soit précisément le cas où la concurrence
    // latérale est la plus forte dans la réalité.
    //
    // Ce coefficient gouverne aussi l'auto-éclaircie, la succession et le tri
    // des espèces : le bouger déplacerait toutes les conclusions écologiques du
    // dépôt d'un coup. Cet essai FIXE donc l'insuffisance au lieu de la taire,
    // pour qu'elle soit retrouvée le jour où ce lot-là sera pris.
    expect(serre.elancementDom).toBeLessThan(60);
  });
});
