/**
 * « Serré = élancé » (docs/realisme.md E10) — et rien ne le déclare.
 *
 * Aucune règle du moteur ne dit qu'un peuplement dense fabrique des perches.
 * Les parties ci-dessous tournent avec la même espèce, les mêmes constantes et
 * la MÊME graine ; seul l'écartement change. Si le gradient apparaît, c'est
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
    // 42,0 / 38,8 / 38,0 / 37,4. Le gradient est MONOTONE — serrer davantage
    // élance davantage, sans palier sur la gamme testée.
    expect(serre.elancementDom).toBeGreaterThan(moyen.elancementDom);
    expect(moyen.elancementDom).toBeGreaterThan(clair.elancementDom);
  });

  it("et la tige de plein vent est plus grosse, à âge égal", () => {
    // La contrepartie du même mécanisme : ce que l'arbre serré met en hauteur,
    // l'arbre au large le met en diamètre.
    expect(clair.diametreDom).toBeGreaterThan(serre.diametreDom);
  });

  it("l'amplitude reste TROP FAIBLE, et DEUX coupables ont été innocentés", () => {
    // La sylviculture mesure H/D de 25–40 pour un sujet de plein vent et de
    // 90–100 pour une perche de plantation serrée. Le moteur couvre 37–53.
    //
    // CE COMMENTAIRE A ACCUSÉ DEUX FOIS, ET S'EST TROMPÉ DEUX FOIS.
    //
    // D'abord `light.ts` et le poids 0,4 des codominants (#65) : porter ce poids
    // à 1 déplace les dominants serrés de H/D 42,1 à 41,7, et pousser les trois
    // constantes de la lumière à fond n'atteint que 45,0.
    //
    // Ensuite la paire d'allocation de CE fichier (#79). Elle borne bien une
    // FENÊTRE — [40 ; 80] — mais une fenêtre n'est pas une amplitude : ouverte
    // à [40 ; 100] elle ne gagne que 49 → 53, et poussée à l'absurde
    // ([40 ; 200], allocation d'ombre 0,5) la même hêtraie ne monte qu'à 38–62.
    // Le PIN, héliophile et censé faire les perches, est plus plat encore
    // (41,0 à 2 m contre 38,9 à 10 m). L'ouverture a d'ailleurs été essayée puis
    // rendue : voir `ALLOCATION_DIAMETRE_OMBRE`.
    //
    // Le vrai verrou est que H/D est une INTÉGRALE : une plantation est ouverte
    // ses premières années, le diamètre posé alors est acquis, et un semis naît
    // déjà à H/D 50. Atteindre 90–100 demanderait un arbre qui monte VITE en
    // restant à l'ombre — l'étiolement, que ce moteur ne sait pas faire puisque
    // l'ombre rabote la pousse totale au lieu de la rediriger. C'est une
    // évolution, pas un réglage, et cet essai FIXE l'insuffisance en attendant.
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
    const sousCouvert = elancementApresUneVie(Math.exp(-MAX_EXTINCTION));
    expect(auLarge).toBeGreaterThan(39);
    expect(auLarge).toBeLessThan(42);
    expect(sousCouvert).toBeGreaterThan(75);
    expect(sousCouvert).toBeLessThan(80);
  });

  it("et la tempête lit une gamme que le moteur n'atteint PAS : la rampe est à moitié morte", () => {
    // Le défaut que #79 a trouvé et n'a pas pu réparer, épinglé ici pour qu'il
    // ne se reperde pas. `facteurElancement` (tempete.ts) interpole entre
    // ELANCEMENT_STABLE (40) et ELANCEMENT_CRITIQUE (100), deux valeurs de la
    // sylviculture européenne. Or l'allocation d'ombre plafonne H/D à 79 : la
    // moitié haute de cette rampe ne peut JAMAIS servir.
    //
    // Descendre l'allocation d'ombre ouvre bien la fenêtre, et ç'a été essayé :
    // des tiges plus fines résistent moins au feu, l'incendie vole ses victimes
    // aux causes que `climat.test.ts` compte, et une conclusion climatique se
    // renverse pour quatre points d'amplitude. C'est #97 (l'étiolement) qui
    // lèvera ça, en faisant filer les dominés au lieu de les faire stagner.
    //
    // Le jour où cet essai tombera, c'est que la rampe sera devenue utile.
    const sousCouvert = elancementApresUneVie(Math.exp(-MAX_EXTINCTION));
    expect(sousCouvert).toBeGreaterThan(ELANCEMENT_STABLE);
    expect(sousCouvert).toBeLessThan(ELANCEMENT_CRITIQUE);
    // Ce que la rampe rend au mieux aujourd'hui, contre les 0,45 qu'elle prévoit.
    expect(facteurElancement(20, (100 * 20) / sousCouvert)).toBeGreaterThan(0.6);
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
