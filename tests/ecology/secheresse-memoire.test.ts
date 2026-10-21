/**
 * La mémoire des sécheresses (critère D11).
 *
 * Question posée : les trajectoires GIEC produisent-elles déjà des sécheresses
 * pluriannuelles ? Réponse mesurée : **le sol, lui, n'a aucune mémoire**. Même
 * sous SSP5-8.5, la réserve profonde est à 94-100 % à chaque sortie d'hiver —
 * chaque été repart à plein.
 *
 * La mémoire existe pourtant, et elle est dans l'**arbre**. Quand la tension
 * devient extrême, l'eau casse en colonnes dans les vaisseaux : la cavitation.
 * Ces vaisseaux ne se réparent pas — l'arbre ne récupère qu'en fabriquant du
 * bois neuf, ce qui prend des années. C'est ce qui explique les mortalités
 * différées observées après 1976, 2003 et 2018 : les arbres ne meurent pas
 * l'année de la sécheresse, mais deux ou trois ans plus tard, à la suivante.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import {
  ANS_D_INSTALLATION,
  embolieLetale,
  prochainDommageHydraulique,
  type TreeEnvironment,
  type TreeState,
  tickTree,
} from "../../src/engine/trees";

describe("la cavitation s'installe vite et se dilue lentement", () => {
  const seuilSurvie = 0.5;

  it("un simple inconfort ne casse rien : il faut une tension extrême", () => {
    // Un arbre passe des étés à souffrir sans s'emboliser.
    expect(prochainDommageHydraulique(0, 0.45, seuilSurvie)).toBe(0);
    expect(prochainDommageHydraulique(0, 0.3, seuilSurvie)).toBe(0);
    // En dessous de la moitié du seuil de survie, en revanche, ça casse.
    expect(prochainDommageHydraulique(0, 0.05, seuilSurvie)).toBeGreaterThan(0);
  });

  it("quelques semaines de sécheresse sévère laissent une marque durable", () => {
    let dommage = 0;
    for (let i = 0; i < 8; i++) dommage = prochainDommageHydraulique(dommage, 0.02, seuilSurvie);
    expect(dommage).toBeGreaterThan(0.15);

    // Deux ans de conditions correctes : la marque s'estompe, elle ne disparaît
    // pas. L'arbre ne répare pas ses vaisseaux, il les dilue en poussant.
    let apres = dommage;
    for (let i = 0; i < 104; i++) apres = prochainDommageHydraulique(apres, 1, seuilSurvie);
    expect(apres).toBeLessThan(dommage);
    expect(apres).toBeGreaterThan(0);
  });

  it("la seconde sécheresse trouve un arbre déjà entamé", () => {
    // Premier épisode.
    let dommage = 0;
    for (let i = 0; i < 6; i++) dommage = prochainDommageHydraulique(dommage, 0.02, seuilSurvie);
    const apresPremier = dommage;
    // Une année de répit.
    for (let i = 0; i < 52; i++) dommage = prochainDommageHydraulique(dommage, 1, seuilSurvie);
    // Second épisode, identique au premier.
    for (let i = 0; i < 6; i++) dommage = prochainDommageHydraulique(dommage, 0.02, seuilSurvie);
    // L'arbre en sort plus abîmé qu'après le premier : c'est le cumul, et
    // c'est ce qui tue à la deuxième ou troisième sécheresse.
    expect(dommage).toBeGreaterThan(apresPremier * 1.4);
  });
});

/** Un hêtre de deux mètres, en plein soleil, à l'âge et à l'embolie qu'on veut. */
function hetre(ageAns: number, dommageHydraulique = 0, especeId = "fagus_sylvatica"): TreeState {
  return {
    id: 1,
    especeId,
    x: 5,
    y: 5,
    ageWeeks: Math.round(ageAns * 52),
    heightM: 2,
    diametreCm: 2,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 40,
    hauteurElagueeM: 0,
    recepages: 0,
    vigueurIndividuelle: 1,
    pousseTendreM: 0,
    vigueur: 1,
    protege: false,
    dommageHydraulique,
  };
}

/** Tout au large sauf l'eau. */
const sousLaSoif = (waterSatisfaction: number): TreeEnvironment => ({
  waterSatisfaction,
  waterloggingRatio: 0,
  light: 1,
  nitrogenSatisfaction: 1,
  phMean: 6.5,
  solPenetrableCm: 80,
  tMean: 18,
});

describe("l'embolie tue à son seuil, et seul le plant meurt du compteur (#391)", () => {
  it("88 % de conductivité perdue chez un feuillu, la moitié chez un résineux", () => {
    // Le dommage plafonnait à 85 %, « un arbre à 85 % d'embolie est déjà mort
    // debout » : c'était dire la mort sans la compter, et un feuillu se relève
    // encore à 85 % (Urli et al. 2013). Le plafond est retiré, et c'est la mort
    // qui borne le dommage : à son seuil, l'arbre meurt de sécheresse.
    expect(embolieLetale(getEspece("fagus_sylvatica"))).toBe(0.88);
    expect(embolieLetale(getEspece("pinus_sylvestris"))).toBe(0.5);
    let dommage = 0;
    for (let i = 0; i < 500; i++) dommage = prochainDommageHydraulique(dommage, 0, 0.5);
    expect(dommage).toBeGreaterThan(0.88);

    const feuillu = tickTree(hetre(20, 0.87), sousLaSoif(0)).tree;
    expect(feuillu.alive).toBe(false);
    expect(feuillu.causeMort).toBe("secheresse");
    // Le même dommage, loin du seuil : il vit.
    expect(tickTree(hetre(20, 0.6), sousLaSoif(0)).tree.alive).toBe(true);
    const resineux = tickTree(hetre(20, 0.49, "pinus_sylvestris"), sousLaSoif(0)).tree;
    expect(resineux.alive).toBe(false);
    expect(resineux.causeMort).toBe("secheresse");
  });

  it("dix semaines à 0,05 de satisfaction tuent un plant, pas un arbre installé", () => {
    // Le compteur immédiat menait un aulne de douze ans au seuil en sept
    // semaines, comme un plant de l'année. Il ne vaut plus que pour un plant :
    // en 1976, les plantations de l'année et de deux à trois ans sont mises à
    // part, celles de cinq à dix ans ont souffert « moins sérieusement »
    // (Aussenac 1978, p. 104).
    const dixSemaines = (t: TreeState) => {
      let a = t;
      for (let s = 0; s < 10; s++) a = tickTree(a, sousLaSoif(0.05)).tree;
      return a;
    };
    const plant = dixSemaines(hetre(1));
    expect(plant.alive).toBe(false);
    expect(plant.causeMort).toBe("secheresse");
    const installe = dixSemaines(hetre(ANS_D_INSTALLATION + 1));
    expect(installe.alive).toBe(true);
    // Il ne s'en tire pas pour rien : son bois a commencé à casser.
    expect(installe.dommageHydraulique).toBeGreaterThan(0.1);
  });
});
