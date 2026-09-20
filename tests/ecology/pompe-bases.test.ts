/**
 * LA POMPE À BASES (issue #170, critère C15).
 *
 * Ce que le moteur ne savait pas faire : le calcium de la litière arrivait de
 * NULLE PART. `effetLitiereEq` créditait la surface de ce qu'une feuille rend
 * en se décomposant, sans que rien nulle part n'ait été débité — or l'arbre est
 * allé le chercher, et le critère dit précisément où : en profondeur.
 *
 * Ce fichier vérifie, dans cet ordre : que le prélèvement se lit sur les deux
 * traits de l'atlas et sur rien d'autre ; que le lot n'a RIEN déplacé de ce qui
 * existait (témoin à mécanisme neutralisé, trajectoire identique au bit près) ;
 * que le budget du pool profond se conserve ; et que la profondeur s'appauvrit
 * sous un peuplement, pas sous un sol nu.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import {
  basesLitiereEq,
  capaciteEchangeEqM2,
  capaciteEchangeProfondeEqM2,
  phDepuisSaturation,
  prelevementProfondEq,
} from "../../src/engine/bases";
import { getEspece } from "../../src/engine/especes";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_ACIDE, LIMON_RICHE, type StationClimat } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";
import { fractionsRacinairesParHorizon } from "../../src/engine/trees";

const moyenne = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("ce que la pompe lit, et ce qu'elle refuse de lire", () => {
  it("le même calcium aux deux bouts du voyage", () => {
    // Le piège du lot : compter à la descente autre chose qu'à la remontée.
    // La surface reçoit `basesLitiereEq` (moins les protons, fois trois), la
    // profondeur perd `basesLitiereEq` (fois la part profonde). Si les deux
    // expressions divergeaient un jour, la pompe fabriquerait du calcium.
    expect(prelevementProfondEq(100, 16, 1)).toBe(basesLitiereEq(100, 16));
    // Et l'ordre de grandeur est celui du tableau périodique, pas d'un réglage :
    // 100 g C font 200 g de matière sèche, qui à 16 mg/g portent 3,2 g de
    // calcium, soit 0,16 eq à 20 g par équivalent.
    expect(basesLitiereEq(100, 16)).toBeCloseTo(0.16, 12);
  });

  it("une litière riche pompe plus, à masse et à racines égales", () => {
    const frene = getEspece("fraxinus_excelsior").litiere.calciumMgG;
    const callune = getEspece("calluna_vulgaris").litiere.calciumMgG;
    expect(prelevementProfondEq(100, frene, 0.4)).toBeGreaterThan(
      prelevementProfondEq(100, callune, 0.4),
    );
    // Le rapport EST celui des deux fiches, et rien d'autre ne s'y ajoute.
    expect(
      prelevementProfondEq(100, frene, 0.4) / prelevementProfondEq(100, callune, 0.4),
    ).toBeCloseTo(frene / callune, 12);
  });

  it("un système racinaire qui ne quitte pas la surface ne pompe RIEN", () => {
    // Le cas qui fait la moitié du tri entre essences : la callune ne descend
    // qu'à 40 cm, et sous un horizon de surface plus épais elle ne touche
    // jamais au fond, si acide que soit sa litière.
    const callune = getEspece("calluna_vulgaris");
    const fractions = fractionsRacinairesParHorizon([50, 50], callune.racines.profondeurMaxCm);
    expect(1 - (fractions[0] ?? 1)).toBe(0);
    expect(prelevementProfondEq(100, callune.litiere.calciumMgG, 0)).toBe(0);
  });

  it("le sous-sol est le gros réservoir, et c'est pour ça qu'il tient", () => {
    // Un pool profond plus petit que celui de surface rendrait la pompe
    // spectaculaire en quelques décennies, ce qu'aucune conversion ne montre.
    for (const sc of [LIMON_RICHE, LIMON_ACIDE]) {
      const horizonSurface = sc.station.profil[0];
      if (!horizonSurface) throw new Error("profil vide");
      expect(capaciteEchangeProfondeEqM2(sc.station.profil)).toBeGreaterThan(
        capaciteEchangeEqM2(horizonSurface),
      );
    }
  });
});

/**
 * Fait tourner une parcelle. `fondVide` NEUTRALISE le mécanisme sans toucher au
 * code : un sous-sol à zéro n'a plus rien à céder, donc `Math.min` ramène tout
 * prélèvement à zéro, et tout le reste du tick est inchangé.
 */
function parcelle(sc: StationClimat, especeId: string | null, ans: number, fondVide = false) {
  const COTE = 16;
  const station: Station = { ...sc.station, coteM: COTE, voisinage: [], ventExposition: 0 };
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const METEO = serieToWeeks(serie);
  let s = createGameState(station, rngStateFromSeed(3));
  if (especeId) {
    for (let y = 2; y < COTE; y += 4) {
      for (let x = 2; x < COTE; x += 4) s = plantAt(s, especeId, x, y, 0.4);
    }
  }
  if (fondVide) {
    s = { ...s, soil: { ...s.soil, basesProfondEq: s.soil.basesProfondEq.map(() => 0) } };
  }
  const cecProfond = capaciteEchangeProfondeEqM2(station.profil);
  const profond0 = moyenne(s.soil.basesProfondEq);
  let preleve = 0;
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    const r = tick(s, w);
    s = r.state;
    preleve += r.fluxes.basesPreleveEqHa / 10_000;
  }
  const profond = moyenne(s.soil.basesProfondEq);
  return {
    ph: moyenne(s.soil.ph),
    profond0,
    profond,
    preleve,
    phProfond: cecProfond > 0 ? phDepuisSaturation(profond / cecProfond) : 0,
    hash: stateHash(s),
    tiges: s.trees.filter((t) => t.alive).length,
  };
}

describe("le témoin qui compte : à mécanisme neutralisé, rien n'a bougé", () => {
  it("vider le sous-sol ne change pas d'un bit la trajectoire de la surface", () => {
    // C'est LA garantie du lot, et elle est structurelle avant d'être mesurée :
    // aucun chemin de code ne fait lire `basesProfondEq` à quoi que ce soit. La
    // mesure le confirme sur vingt ans de hêtraie — même pH à dix-sept
    // chiffres, même hash d'état (eau, azote, carbone, arbres, flux aléatoire).
    const normal = parcelle(LIMON_RICHE, "fagus_sylvatica", 20);
    const neutralise = parcelle(LIMON_RICHE, "fagus_sylvatica", 20, true);
    // LA PRÉMISSE D'ABORD. Un témoin qui passe parce que le mécanisme n'a
    // jamais tourné ne prouve rien — et c'est l'erreur que ce dépôt a déjà
    // faite assez souvent pour l'écrire ici.
    expect(normal.preleve).toBeGreaterThan(0);
    expect(neutralise.preleve).toBe(0);
    expect(neutralise.ph).toBe(normal.ph);
    expect(neutralise.hash).toBe(normal.hash);
  });

  it("et la surface vaut toujours ce qu'elle valait AVANT le lot", () => {
    // Les trois valeurs ci-dessous ont été relevées sur `main` avant la
    // première ligne de ce lot (a8d7094), à dix-sept chiffres. Elles ne sont
    // pas une propriété du mécanisme : elles sont la preuve qu'il n'en a
    // déplacé aucune.
    expect(parcelle(LIMON_RICHE, "fagus_sylvatica", 20).ph).toBeCloseTo(6.9444945197111894, 12);
    expect(parcelle(LIMON_RICHE, null, 20).ph).toBeCloseTo(6.954734180137466, 12);
    expect(parcelle(LIMON_ACIDE, "castanea_sativa", 20).ph).toBeCloseTo(4.993231933394311, 12);
  });
});

describe("en partie : la profondeur s'appauvrit, et le budget se referme", () => {
  it("le budget du pool profond se conserve : ce qu'il perd VAUT ce qui est prélevé", () => {
    // La discipline des autres pools (azote, phosphore, potassium, bases de
    // surface). Elle ne valide pas le niveau, elle interdit d'en perdre ou d'en
    // fabriquer en route.
    const r = parcelle(LIMON_ACIDE, "fagus_sylvatica", 30);
    expect(r.profond0 - r.profond).toBeCloseTo(r.preleve, 8);
    expect(r.preleve).toBeGreaterThan(0);
  });

  it("sous un peuplement le fond baisse, sous un sol nu il ne bouge pas d'un iota", () => {
    // Le critère C15 en une ligne. Et le sol nu est le témoin qui manque
    // souvent : ce pool-là n'a AUCUN autre terme que la pompe — ni altération
    // (elle crédite encore la surface), ni lessivage. Sans arbre, il est figé.
    const hetre = parcelle(LIMON_RICHE, "fagus_sylvatica", 50);
    const nu = parcelle(LIMON_RICHE, null, 50);
    expect(nu.profond).toBe(nu.profond0);
    expect(hetre.profond).toBeLessThan(hetre.profond0);
    // Relevé à l'écriture : 695 600 → 687 500 eq/ha en cinquante ans, soit
    // 1,2 % du réservoir. Des dixièmes de pH au fond comme en surface — une
    // pompe qui viderait un sous-sol en une vie d'arbre serait fausse.
    expect(hetre.profond0 - hetre.profond).toBeLessThan(0.1 * hetre.profond0);
    expect(hetre.phProfond).toBeLessThan(nu.phProfond);
  });

  it("c'est le CALCIUM qui décide, pas la profondeur des racines", () => {
    // Le contraste le plus instructif de l'atlas, et il est contre-intuitif :
    // sur la même station, le pin descend deux fois plus bas que le hêtre
    // (80 cm de racines contre 42 à cinquante ans) et porte plus de tiges — et
    // il pompe cinquante fois moins, parce que sa litière est à 3,8 mg/g de
    // calcium contre 7,5. La profondeur donne l'ACCÈS ; la teneur donne la
    // quantité.
    const hetre = parcelle(LIMON_RICHE, "fagus_sylvatica", 50);
    const pin = parcelle(LIMON_RICHE, "pinus_sylvestris", 50);
    expect(pin.tiges).toBeGreaterThan(hetre.tiges);
    expect(pin.preleve).toBeLessThan(0.1 * hetre.preleve);
  });
});
