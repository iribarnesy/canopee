/**
 * **L'étiolement se voit sur le fût** (#149, suite de #62).
 *
 * Retour de partie : « c'est pas possible de voir l'étiolement juste sur le
 * sprite de l'arbre ? » — la question portait sur le panneau des suivis, mais
 * la réponse était plus bas que ça : le rendu dessinait le tronc d'après la
 * **hauteur**, par une allométrie à lui, alors que le moteur donne `diametreCm`
 * depuis #62 et que l'instantané le porte nommément pour « dessiner un tronc à
 * la bonne épaisseur, ce qu'il déduisait jusqu'ici d'un proxy faux ».
 *
 * Deux arbres de neuf mètres, l'un trapu au large et l'autre filé sous couvert,
 * sortaient donc identiques — alors que c'est la première chose qu'un
 * forestier lit sur une tige.
 */

import { describe, expect, it } from "vitest";
import { elancement } from "../../src/engine/trees";
import { rayonAuPiedM } from "../../src/render/arbres/squelette";
import { vueInitiale } from "../../src/render/camera";
import {
  type ArbreAPoser,
  classeDe,
  cleClasse,
  EPAISSEUR_NORMALE,
  epaisseurDuFut,
  rayonDeLaClasse,
} from "../../src/render/couches/arbres";

const POSE: ArbreAPoser = {
  id: 3,
  especeId: "quercus_pubescens",
  x: 10,
  y: 10,
  z: 0,
  heightM: 9,
  houppierRatio: 0.4,
  baseHouppierM: 2,
  partFoliaire: 1,
  senescence: 0,
  vigueur: 1,
};

/** Le diamètre qu'il faut pour tel élancement, cm. */
const pourElancement = (hauteurM: number, hd: number) => (100 * hauteurM) / hd;

describe("l'épaisseur du fût", () => {
  it("sans diamètre, rien ne change : c'est l'allométrie de secours", () => {
    expect(epaisseurDuFut(POSE)).toBe(EPAISSEUR_NORMALE);
    const vue = vueInitiale(100, 900, 640, 0);
    const classe = classeDe(POSE, 25, vue);
    expect(rayonDeLaClasse(classe, POSE.heightM)).toBeCloseTo(rayonAuPiedM(POSE.heightM), 9);
  });

  it("un arbre d'élancement ordinaire retombe EXACTEMENT sur l'allométrie", () => {
    // L'allométrie de secours vaut `0,011 × hauteur` de rayon, soit H/D ≈ 45 :
    // le milieu de la gamme forestière. Un arbre qui s'y tient doit donc se
    // dessiner comme avant ce champ — sinon tous les arbres du jeu changeraient
    // d'allure pour une correction qui ne concerne que les extrêmes.
    const d = pourElancement(9, 45.45);
    expect(elancement(d, 9)).toBeCloseTo(45.45, 1);
    expect(epaisseurDuFut({ ...POSE, diametreCm: d })).toBe(EPAISSEUR_NORMALE);
  });

  it("une tige FILÉE est plus mince, une tige trapue plus épaisse", () => {
    const file = epaisseurDuFut({ ...POSE, diametreCm: pourElancement(9, 90) });
    const trapu = epaisseurDuFut({ ...POSE, diametreCm: pourElancement(9, 25) });
    expect(file).toBeLessThan(EPAISSEUR_NORMALE);
    expect(trapu).toBeGreaterThan(EPAISSEUR_NORMALE);
    // Deux fois plus élancé, deux fois plus mince : le rapport est celui des
    // diamètres, sans correction cachée.
    expect(file).toBe(Math.round(EPAISSEUR_NORMALE / 2));
  });

  it("le rayon dessiné suit le palier, et rien d'autre", () => {
    const vue = vueInitiale(100, 900, 640, 0);
    const file = classeDe({ ...POSE, diametreCm: pourElancement(9, 90) }, 25, vue);
    expect(rayonDeLaClasse(file, 9)).toBeCloseTo((rayonAuPiedM(9) * file.epaisseur) / 4, 9);
    expect(rayonDeLaClasse(file, 9)).toBeLessThan(rayonAuPiedM(9));
  });
});

describe("la clé de vignette", () => {
  it("sépare le filé du trapu : ce ne sont pas la même image", () => {
    const vue = vueInitiale(100, 900, 640, 0);
    const file = cleClasse(classeDe({ ...POSE, diametreCm: pourElancement(9, 90) }, 25, vue));
    const trapu = cleClasse(classeDe({ ...POSE, diametreCm: pourElancement(9, 25) }, 25, vue));
    expect(file).not.toBe(trapu);
  });

  it("… mais pas un centimètre de diamètre : la clé reste un cache", () => {
    const vue = vueInitiale(100, 900, 640, 0);
    const a = cleClasse(classeDe({ ...POSE, diametreCm: 20 }, 25, vue));
    const b = cleClasse(classeDe({ ...POSE, diametreCm: 20.4 }, 25, vue));
    expect(a).toBe(b);
  });
});
