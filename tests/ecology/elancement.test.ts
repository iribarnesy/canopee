/**
 * « Serré = élancé » (docs/realisme.md E10) — et rien ne le déclare.
 *
 * Aucune règle du moteur ne dit qu'un peuplement dense fabrique des perches.
 * Les parties ci-dessous tournent avec la même espèce, les mêmes constantes et
 * la **même** graine ; seul l'écartement change. Si le gradient apparaît, c'est
 * qu'il émerge de la compétition pour la lumière, ce qui est tout l'intérêt.
 */

import { describe, expect, it } from "vitest";
import { MAX_EXTINCTION } from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  ELANCEMENT_CRITIQUE,
  ELANCEMENT_STABLE,
  facteurElancement,
} from "../../src/engine/tempete";
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
  // **les dominants seulement**, et c'est une précaution nécessaire : un peuplement
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
    // Le gradient est **monotone** — serrer davantage élance davantage, sans palier
    // sur la gamme testée. C'est le résultat le plus ancien de ce fichier, et
    // le seul que l'étiolement (#97) n'ait pas déplacé : il tenait déjà quand
    // l'amplitude, elle, manquait.
    expect(serre.elancementDom).toBeGreaterThan(moyen.elancementDom);
    expect(moyen.elancementDom).toBeGreaterThan(clair.elancementDom);
  });

  it("et la tige de plein vent est plus grosse, à âge égal", () => {
    // La contrepartie du même mécanisme : ce que l'arbre serré met en hauteur,
    // l'arbre au large le met en diamètre.
    expect(clair.diametreDom).toBeGreaterThan(serre.diametreDom);
  });

  it("le peuplement serré FABRIQUE des perches, le peuplement clair n'en fait aucune", () => {
    // **C'est l'amplitude**, **et il a fallu innocenter deux coupables pour l'avoir**.
    //
    // La sylviculture mesure H/D 25–40 pour un sujet de plein vent et 90–100
    // pour une perche de plantation serrée. Ce commentaire a longtemps accusé,
    // et il s'est trompé deux fois.
    //
    // D'abord `light.ts` et le poids 0,4 des codominants (#65) : porter ce poids
    // à 1 déplace les dominants serrés de H/D 42,1 à 41,7, et pousser les trois
    // constantes de la lumière à fond n'atteint que 45,0.
    //
    // Ensuite la paire d'allocation (#79). Elle borne bien une **fenêtre** — [40 ;
    // 80] — mais une fenêtre n'est pas une amplitude : ouverte à [40 ; 100] elle
    // ne gagne que 49 → 53, et poussée à l'absurde ([40 ; 200]) la même hêtraie
    // ne monte qu'à 38–62.
    //
    // Le vrai verrou était ailleurs, et c'est #97 qui l'a levé : l'ombre
    // **rabotait** la pousse au lieu de la rediriger, donc une tige dominée
    // stagnait au lieu de filer. Depuis que l'allongement se sert avant le
    // diamètre, la tige la plus élancée du peuplement passe de 49 à 87 à 2 m
    // d'écartement, contre 38 à 10 m — et la hêtraie serrée atteint 129 à
    // quatre-vingts ans. L'étendue est couverte.
    expect(serre.elancementMax).toBeGreaterThan(80);
    expect(clair.elancementMax).toBeLessThan(45);
  });

  it("la rampe de chablis n'est plus à moitié morte", () => {
    // L'essai que ce fichier portait en négatif, et qui vient de basculer.
    // `facteurElancement` (tempete.ts) interpole entre ELANCEMENT_STABLE (40) et
    // ELANCEMENT_CRITIQUE (100), deux valeurs de la sylviculture européenne. Or
    // tant que le diamètre suivait l'allocation pas à pas, H/D plafonnait à 79
    // (essai arithmétique plus bas) : la moitié haute de cette rampe ne pouvait
    // **jamais** servir, et #79 l'avait épinglé comme du code mort en attendant.
    //
    // L'étiolement l'a réveillée. Le diamètre ne suit plus l'allocation — il
    // encaisse le résidu — donc l'élancement réalisé dépasse la projection : la
    // perche de la hêtraie serrée passe 80 à trente ans et 129 à quatre-vingts,
    // et la rampe rend enfin ce qu'elle annonce.
    // Au-delà de la borne basse de la rampe, et bien engagé dans sa moitié
    // haute : à mi-chemin de ELANCEMENT_CRITIQUE, le facteur passe sous 0,6.
    expect(serre.elancementMax).toBeGreaterThan(ELANCEMENT_STABLE);
    expect(serre.elancementMax).toBeGreaterThan((ELANCEMENT_STABLE + ELANCEMENT_CRITIQUE) / 2);
    expect(facteurElancement(20, (100 * 20) / serre.elancementMax)).toBeLessThan(0.6);
  });

  it("et la perche est un arbre de MILIEU DE CANOPÉE, pas un nabot", () => {
    // Le contrôle qui distingue l'étiolement d'un simple rabougrissement, et
    // qui dit pourquoi l'ancienne intégrale bloquait. Une tige dominée qui
    // stagne finit **trapue** : elle garde le H/D 50 de sa naissance, et le moteur
    // d'avant faisait précisément ça — ses tiges les moins élancées étaient ses
    // plus dominées. Celle qui file est à mi-hauteur du peuplement : elle a
    // encore de quoi courir après la lumière, et c'est elle qui casse au vent.
    //
    // Mesuré : la plus élancée est à 62 % de la hauteur du plus haut à 2 m
    // d'écartement, contre 84 % à 10 m (où il n'y a plus de perche du tout).
    expect(serre.rangDeLaPerche).toBeGreaterThan(0.4);
    expect(serre.rangDeLaPerche).toBeLessThan(0.85);
  });
});

describe("la fenêtre de la paire d'allocation, et pourquoi le moteur en sort", () => {
  // La borne qui manquait, et qui a laissé chercher la cause dans le mauvais
  // fichier pendant deux lots. Elle ne coûte aucune simulation : un arbre dont
  // le diamètre **suit** l'allocation `a` pas à pas porte H/D = 100/a, et `a` est
  // bornée par les deux constantes.
  //
  // **Ce bloc décrit désormais une projection, plus le moteur**, et c'est le
  // résultat de #97 : depuis que le diamètre encaisse le résidu au lieu de
  // suivre l'allocation, l'élancement réalisé **dépasse** cette fenêtre — 129
  // mesurés contre 79 projetés. Les bornes restent justes pour ce qu'elles
  // disent, et utiles pour comprendre ce que l'allocation seule peut faire ;
  // elles ne bornent simplement plus la tige.

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
    const sousCouvert = elancementApresUneVie(Math.exp(-MAX_EXTINCTION));
    expect(auLarge).toBeGreaterThan(39);
    expect(auLarge).toBeLessThan(42);
    expect(sousCouvert).toBeGreaterThan(75);
    expect(sousCouvert).toBeLessThan(80);
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
