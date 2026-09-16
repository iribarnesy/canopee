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
  const parElancement = [...vivants].sort(
    (a, b) => elancement(b.diametreCm, b.heightM) - elancement(a.diametreCm, a.heightM),
  );
  const perche = parElancement[0];
  if (!perche) throw new Error("peuplement vide");
  const hMax = tri[0]?.heightM ?? 1;
  return {
    tiges: vivants.length,
    elancementDom: moyenne(dom.map((t) => elancement(t.diametreCm, t.heightM))),
    diametreDom: moyenne(dom.map((t) => t.diametreCm)),
    /** l'élancement de la tige la plus élancée du peuplement */
    elancementMax: elancement(perche.diametreCm, perche.heightM),
    /** où cette tige-là se situe dans le peuplement : 1 = c'est la plus haute */
    rangDeLaPerche: perche.heightM / hMax,
  };
}

describe("la densité de plantation fait la forme de la tige", () => {
  const serre = hetraie(2);
  const moyen = hetraie(4);
  const clair = hetraie(10);

  it("plus on plante serré, plus la tige est élancée", () => {
    // Mesuré à 2 / 4 / 10 m d'écartement, H/D des dominants : 44,8 / 41,1 /
    // 37,4. Le gradient est MONOTONE — serrer davantage élance davantage, sans
    // palier sur la gamme testée.
    expect(serre.elancementDom).toBeGreaterThan(moyen.elancementDom);
    expect(moyen.elancementDom).toBeGreaterThan(clair.elancementDom);
  });

  it("et la tige de plein vent est plus grosse, à âge égal", () => {
    // La contrepartie du même mécanisme : ce que l'arbre serré met en hauteur,
    // l'arbre au large le met en diamètre.
    expect(clair.diametreDom).toBeGreaterThan(serre.diametreDom);
  });

  it("le peuplement serré FABRIQUE des perches, le peuplement clair n'en fait aucune", () => {
    // C'est l'amplitude, et elle a longtemps manqué. La sylviculture mesure
    // H/D 25–40 pour un sujet de plein vent et 90–100 pour une perche de
    // plantation serrée ; le moteur ne couvrait que 35–49 — le bon ordre, un
    // cinquième de l'étendue — parce que l'ombre rabotait la pousse au lieu de
    // déplacer l'arbitrage (étiolement, #97).
    //
    // Mesuré maintenant, à trente ans : la tige la plus élancée vaut H/D 87 à
    // 2 m d'écartement, 59 à 4 m, 38 à 10 m. À quatre-vingts ans la hêtraie
    // serrée monte à 129. L'étendue est couverte.
    expect(serre.elancementMax).toBeGreaterThan(80);
    expect(clair.elancementMax).toBeLessThan(45);
  });

  it("et la perche est un arbre de MILIEU DE CANOPÉE, pas un nabot", () => {
    // Le contrôle qui distingue l'étiolement d'un simple rabougrissement. Une
    // tige dominée qui stagne finit TRAPUE : elle garde le H/D 50 de sa
    // naissance. Celle qui file est à mi-hauteur du peuplement — elle a encore
    // de quoi courir après la lumière, et c'est elle qui casse au vent.
    //
    // Mesuré : la plus élancée est à 62 % de la hauteur du plus haut à 2 m
    // d'écartement, contre 84 % à 10 m (où il n'y a plus de perche du tout).
    expect(serre.rangDeLaPerche).toBeGreaterThan(0.4);
    expect(serre.rangDeLaPerche).toBeLessThan(0.85);
  });
});
