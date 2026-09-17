/**
 * Le budget carbone (issue #96, critères B6 et F6) : on meurt de faim, pas de
 * passer sous un seuil.
 *
 * Ce que le moteur ne savait pas faire : rien n'y mourait de manquer de
 * lumière. L'ombre tuait 4 à 7 tiges sur une cohorte de pins de cent vingt ans
 * quand les ravageurs en prenaient 205 à 244, et le hêtre ne mourait JAMAIS
 * d'ombre — 361 plantés, 361 vivants — parce que son seuil de stress passait
 * SOUS le plancher de lumière que le moteur sait produire.
 *
 * Ce que ce fichier vérifie :
 *   1. l'ombre tolérable DÉCROÎT avec la taille — c'est tout le mécanisme ;
 *   2. les réserves tiennent le temps qu'annonce leur ancre ;
 *   3. un peuplement équienne s'auto-éclaircit, et il le fait LE LONG de la
 *      ligne de densité maximale, que personne ne lui a apprise.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import {
  compensationDeLArbre,
  partEntretien,
  partPuiseeSurLesReserves,
  RESERVES_ANS,
} from "../../src/engine/reserves";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { type TreeEnvironment, type TreeState, tickTree } from "../../src/engine/trees";

const HETRE = getEspece("fagus_sylvatica");

function tige(heightM: number): TreeState {
  return {
    id: 1,
    especeId: "fagus_sylvatica",
    x: 5,
    y: 5,
    ageWeeks: 20 * 52,
    heightM,
    diametreCm: 2 * heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 60,
    hauteurElagueeM: 0,
    pousseTendreM: 0,
    vigueur: 1,
    protege: false,
    recepages: 0,
    vigueurIndividuelle: 1,
  } as TreeState;
}

/** Tout au large sauf la lumière : on isole le budget carbone. */
function milieu(light: number): TreeEnvironment {
  return {
    waterSatisfaction: 1,
    waterloggingRatio: 0,
    light,
    nitrogenSatisfaction: 1,
    phMean: 6.5,
    solPenetrableCm: 80,
    tMean: 18,
  };
}

/** Années de végétation avant que cette tige ne meure sous cette lumière. */
function anneesAvantDeMourir(heightM: number, light: number, maxAns = 200): number {
  let t = tige(heightM);
  for (let s = 0; s < maxAns * 26; s++) {
    t = tickTree(t, milieu(light)).tree;
    if (!t.alive) return s / 26;
    // On fige la taille : on mesure la résistance d'un arbre DE CETTE
    // TAILLE-LÀ, pas celle d'un arbre qui grandit en cours de route.
    t = { ...t, heightM, diametreCm: 2 * heightM };
  }
  return Number.POSITIVE_INFINITY;
}

describe("l'ombre tolérable décroît avec la taille, et c'est tout le mécanisme", () => {
  it("la charge d'entretien suit la HAUTEUR, comme la longueur des tuyaux", () => {
    // Modèle du tube : la section d'aubier suit la surface foliaire, donc son
    // volume suit la hauteur. Rien de plus n'est supposé.
    expect(partEntretien(25)).toBeCloseTo(0.5, 10);
    expect(partEntretien(50)).toBeCloseTo(2 * partEntretien(25), 10);
    expect(partEntretien(0)).toBe(0);
  });

  it("un semis survit là où une perche meurt, et un gros arbre encore moins bas", () => {
    // Les trois chiffres du hêtre, et personne ne les a choisis : ils tombent
    // de deux constantes et de la fiche d'espèce.
    const semis = compensationDeLArbre(HETRE, 0.3);
    const perche = compensationDeLArbre(HETRE, 10);
    const adulte = compensationDeLArbre(HETRE, 25);
    expect(semis).toBeCloseTo(0.012, 3);
    expect(perche).toBeCloseTo(0.078, 3);
    expect(adulte).toBeCloseTo(0.18, 3);
    // L'ordre est le fond de l'affaire ; les valeurs n'en sont que la trace.
    expect(semis).toBeLessThan(perche);
    expect(perche).toBeLessThan(adulte);
  });

  it("et le semis de hêtre reste JOIGNABLE sous le couvert le plus sombre", () => {
    // C'était l'impossibilité arithmétique de l'ancien moteur, à l'envers : il
    // faut que le plancher de lumière (exp(−4,5) = 0,0111) puisse à la fois
    // laisser patienter un semis et condamner une perche. Sinon le mécanisme
    // ne sert à rien dans les parties réelles.
    const plancher = Math.exp(-4.5);
    expect(partPuiseeSurLesReserves(HETRE, 0.3, plancher)).toBeGreaterThan(0);
    expect(partPuiseeSurLesReserves(HETRE, 10, plancher)).toBeGreaterThan(
      partPuiseeSurLesReserves(HETRE, 0.3, plancher),
    );
    // La perche y est quasiment à revenu nul.
    expect(partPuiseeSurLesReserves(HETRE, 10, plancher)).toBeGreaterThan(0.95);
  });

  it("au-dessus de sa compensation d'arbre entier, la tige ne puise RIEN", () => {
    const perche = compensationDeLArbre(HETRE, 10);
    expect(partPuiseeSurLesReserves(HETRE, 10, perche + 0.01)).toBe(0);
    expect(partPuiseeSurLesReserves(HETRE, 10, perche - 0.01)).toBeGreaterThan(0);
  });
});

describe("les réserves tiennent le temps qu'annonce leur ancre", () => {
  it("à revenu nul, la perche meurt dans la fenêtre de la défoliation totale", () => {
    // L'ancre est la gradation de bombyx : un arbre entièrement défolié meurt
    // à la deuxième ou troisième année consécutive. Une perche sous le
    // plancher de lumière est dans ce cas — elle ne gagne presque rien.
    const ans = anneesAvantDeMourir(10, Math.exp(-4.5));
    expect(ans).toBeGreaterThan(RESERVES_ANS * 0.8);
    expect(ans).toBeLessThan(RESERVES_ANS * 2);
  });

  it("le SEMIS, sous la même ombre, tient bien plus longtemps", () => {
    // C'est la banque de semis qui attend la trouée, et c'est ce qu'un seuil
    // instantané ne pouvait pas produire : il ne connaissait pas la taille.
    const perche = anneesAvantDeMourir(10, Math.exp(-4.5));
    const semis = anneesAvantDeMourir(0.3, Math.exp(-4.5));
    expect(semis).toBeGreaterThan(3 * perche);
  });

  it("et une tige qui couvre son entretien ne meurt pas, même chichement", () => {
    expect(anneesAvantDeMourir(10, 0.12, 60)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("l'auto-éclaircie : le peuplement trouve la ligne de densité tout seul", () => {
  it("une cohorte équienne serrée s'éclaircit, et la densité DÉCROÎT", () => {
    // Banc réduit (20 m de côté, soixante ans) pour tenir dans la suite ; le
    // banc complet est dans le référentiel — 40 m, cent vingt ans, 361 tiges
    // tombées à 413 et 419/ha, là où le même banc sans le mécanisme en garde
    // 2 231. La trajectoire suit une ligne d'auto-éclaircie de pente −1,48 et
    // −1,52 en moindres carrés, à comparer au −1,605 de Reineke (1933) :
    // dedans la gamme des pentes mesurées par essence, plus plate que la
    // valeur canonique. Personne n'a appris de pente au moteur.
    const COTE = 20;
    const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
    const weather = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(station, rngStateFromSeed(7));
    for (let x = 2; x < COTE - 1; x += 2) {
      for (let y = 2; y < COTE - 1; y += 2) {
        state = plantAt(state, "fagus_sylvatica", x, y);
      }
    }
    const plantes = state.trees.length;
    const jalons: number[] = [];
    for (let w = 0; w < 60 * 52; w++) {
      const m = weather[w % weather.length];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
      if ((w + 1) % (20 * 52) === 0) {
        jalons.push(state.trees.filter((t) => t.alive && t.id <= plantes).length);
      }
    }
    const [a20, a40, a60] = jalons;
    if (a20 === undefined || a40 === undefined || a60 === undefined) {
      throw new Error("jalons manquants");
    }
    // Décroissance stricte : c'est l'exclusion des tiges, et elle continue.
    expect(a40).toBeLessThan(a20);
    expect(a60).toBeLessThan(a40);
    // Et elle est SÉVÈRE : le peuplement perd plus de la moitié de ses tiges.
    expect(a60).toBeLessThan(0.5 * plantes);
    // Sans pour autant s'effondrer : l'issue prévenait qu'empiler cette
    // mortalité sur celle des ravageurs donnerait un peuplement qui meurt deux
    // fois. Il reste un peuplement.
    expect(a60).toBeGreaterThan(0.1 * plantes);
  }, 600_000);
});
