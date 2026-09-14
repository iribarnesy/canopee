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
import { allocationDiametreCmParM, diametreInitialCm, elancement } from "../../src/engine/trees";

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

  it("l'amplitude reste TROP FAIBLE, et j'avais accusé le mauvais coupable", () => {
    // La sylviculture mesure H/D de 25–40 pour un sujet de plein vent et de
    // 90–100 pour une perche de plantation serrée. Le moteur couvre 35–49 : le
    // bon ORDRE, un cinquième de l'étendue.
    //
    // CE COMMENTAIRE DÉSIGNAIT `light.ts` ET IL AVAIT TORT. Il accusait le
    // poids 0,4 des codominants (#65) : en plantation régulière tout le monde
    // est codominant de tout le monde, donc la concurrence latérale serait
    // atténuée là où elle est la plus forte. C'était plausible et c'est faux.
    // La campagne de #65 a porté ce poids à 1 — l'atténuation supprimée — et
    // les dominants de la hêtraie à 2 m sont passés de H/D 42,1 à 41,7. Avec en
    // plus le seuil à 0 (tout voisin plus court ombrage à plein) et le plafond
    // d'extinction doublé : 45,0. Rien dans `light.ts` n'ouvre cette amplitude.
    //
    // Ce qui borne, c'est la paire d'allocation de CE fichier, et c'est de
    // l'arithmétique — d'où l'essai suivant, qui l'épingle.
    expect(serre.elancementDom).toBeLessThan(60);
  });
});

describe("ce que la paire d'allocation rend ATTEIGNABLE", () => {
  // La borne qui manquait, et qui a laissé chercher la cause dans le mauvais
  // fichier pendant deux lots. Elle ne coûte aucune simulation : un arbre qui
  // pousse de bout en bout à l'allocation `a` porte H/D = 100/a, et `a` est
  // bornée par les deux constantes. Aucun réglage de la lumière ne peut sortir
  // de cette fenêtre — c'est ce qu'il faut savoir AVANT d'aller régler la
  // lumière.

  /** H/D d'un semis de 0,3 m mené jusqu'à 20 m à lumière constante. */
  function elancementApresUneVie(lumiere: number): number {
    let h = 0.3;
    let d = diametreInitialCm(0.3);
    for (let i = 0; i < 400; i++) {
      d += 0.05 * allocationDiametreCmParM(lumiere);
      h += 0.05;
    }
    return elancement(d, h);
  }

  it("la pleine lumière plafonne l'arbre à H/D 40, l'ombre la plus noire à 79", () => {
    // Mesuré sur le code livré : 40,1 en pleine lumière, 78,5 sous
    // exp(−MAX_EXTINCTION), la lumière la plus faible que `light.ts` produise.
    const auLarge = elancementApresUneVie(1);
    const sousCouvert = elancementApresUneVie(Math.exp(-4.5));
    expect(auLarge).toBeGreaterThan(39);
    expect(auLarge).toBeLessThan(42);
    expect(sousCouvert).toBeGreaterThan(75);
    expect(sousCouvert).toBeLessThan(80);
  });

  it("donc 90–100 est hors d'atteinte, et 25 aussi : la sylviculture déborde des deux côtés", () => {
    // L'énoncé de E10 demande 25–40 au large et 90–100 en perche. Les deux
    // bouts sont HORS de ce que ces constantes permettent, quelle que soit la
    // lumière. Tant que cette assertion tient, le critère ne peut pas passer ✅,
    // et ce n'est pas en réglant l'ombrage qu'on le fera passer.
    //
    // Élargir la fenêtre demande d'écarter la paire en gardant sa médiane à 2 —
    // l'ancre de volume — par exemple 1,0 / 3,0, qui donne [33 ; 100].
    expect(elancementApresUneVie(0)).toBeLessThan(90);
    expect(elancementApresUneVie(1)).toBeGreaterThan(25);
  });

  it("et le gradient va bien dans le sens de la lumière, sans trou", () => {
    // Le garde-fou des deux précédents : une fenêtre bornée ne vaut rien si la
    // grandeur n'y varie pas de façon monotone.
    const paliers = [0, 0.25, 0.5, 0.75, 1].map(elancementApresUneVie);
    for (let i = 1; i < paliers.length; i++) {
      expect(paliers[i]).toBeLessThan(paliers[i - 1] as number);
    }
  });
});
