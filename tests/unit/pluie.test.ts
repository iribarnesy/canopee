/**
 * **Le ciel dit la pluie du moteur, et rien d'autre** (#130, lot L10).
 *
 * Une semaine sèche a un ciel dégagé et pas une goutte ; une averse charge le
 * ciel et fonce le sol ; le rideau penche du côté où le vent souffle, et pas
 * de l'autre ; ce qu'on voit et ce qu'on entend suivent la même courbe.
 */

import { describe, expect, it } from "vitest";
import { type EntreeDuSon, niveauxDuSon } from "../../src/game/son/niveaux";
import type { Vue } from "../../src/render/camera";
import {
  cielDeLaSemaine,
  couvertDuCiel,
  GOUTTES_MAX,
  gouttesDeLaPluie,
  INCLINAISON_MAX_RAD,
  inclinaisonDuRideau,
  intensiteDeLaPluie,
  PLUIE_MUETTE_MM,
  type TempsQuIlFait,
} from "../../src/render/temps/pluie";

const vue = (orientation: 0 | 1 | 2 | 3 = 0, largeurPx = 1200, hauteurPx = 800): Vue => ({
  cam: { zoom: 2, coteM: 64, orientation },
  centre: { x: 32, y: 32 },
  largeurPx,
  hauteurPx,
});

const temps = (pluieMm: number, versRad = 0, recuMs = 0): TempsQuIlFait => ({
  pluieMm,
  neigeMm: 0,
  manteauNeigeMm: 0,
  vent: { versRad, recuMs },
});

describe("une semaine sèche", () => {
  it("a un ciel dégagé, un sol sec et pas une goutte", () => {
    expect(cielDeLaSemaine(temps(0))).toEqual({ couvert: 0, mouille: 0, blanc: 0 });
    expect(gouttesDeLaPluie(temps(0), vue(), 1234)).toEqual([]);
  });

  it("une rosée de semaine ne fait pas pleuvoir", () => {
    expect(gouttesDeLaPluie(temps(PLUIE_MUETTE_MM), vue(), 0)).toEqual([]);
    expect(couvertDuCiel(PLUIE_MUETTE_MM)).toBe(0);
  });
});

describe("la pluie", () => {
  it("charge le ciel et fonce le sol à mesure qu'elle tombe", () => {
    const bruine = cielDeLaSemaine(temps(5));
    const averse = cielDeLaSemaine(temps(40));
    expect(averse.couvert).toBeGreaterThan(bruine.couvert);
    expect(averse.mouille).toBeGreaterThan(bruine.mouille);
    expect(cielDeLaSemaine(temps(500))).toEqual({ couvert: 1, mouille: 1, blanc: 0 });
  });

  it("le ciel se couvre avant que l'averse soit franche", () => {
    expect(couvertDuCiel(10)).toBeGreaterThan(intensiteDeLaPluie(10));
  });

  it("une averse fait plus de gouttes qu'une bruine, et jamais plus que le plafond", () => {
    const bruine = gouttesDeLaPluie(temps(4), vue(), 0).length;
    const averse = gouttesDeLaPluie(temps(35), vue(), 0).length;
    expect(averse).toBeGreaterThan(bruine);
    expect(gouttesDeLaPluie(temps(35), vue(0, 4000, 3000), 0).length).toBe(GOUTTES_MAX);
  });

  it("les gouttes tombent : un instant plus tard, elles sont plus bas", () => {
    const avant = gouttesDeLaPluie(temps(30), vue(), 1000);
    const apres = gouttesDeLaPluie(temps(30), vue(), 1050);
    let plusBas = 0;
    for (let i = 0; i < avant.length; i++) {
      if ((apres[i]?.sy ?? 0) > (avant[i]?.sy ?? 0)) plusBas++;
    }
    // Celles qui ont rebouclé en haut de l'écran font l'exception.
    expect(plusBas / avant.length).toBeGreaterThan(0.85);
  });

  it("le même instant rend les mêmes gouttes : rien n'est tiré au hasard", () => {
    expect(gouttesDeLaPluie(temps(30), vue(), 777)).toEqual(
      gouttesDeLaPluie(temps(30), vue(), 777),
    );
  });
});

describe("le vent", () => {
  it("sans vent, le rideau tombe droit", () => {
    expect(inclinaisonDuRideau({ versRad: 0, recuMs: 0 }, vue())).toBe(0);
  });

  it("penche du côté où il souffle, et à l'opposé s'il souffle à l'opposé", () => {
    const versEst = inclinaisonDuRideau({ versRad: 0, recuMs: 8 }, vue());
    const versOuest = inclinaisonDuRideau({ versRad: Math.PI, recuMs: 8 }, vue());
    expect(versEst).toBeGreaterThan(0);
    expect(versOuest).toBeCloseTo(-versEst, 10);
    expect(Math.abs(versEst)).toBeLessThanOrEqual(INCLINAISON_MAX_RAD);
  });

  it("tourner la vue tourne le vent avec la carte", () => {
    // Un vent vers l'est penche à droite vue du sud ; la vue retournée le voit
    // souffler vers la gauche.
    const vent = { versRad: 0, recuMs: 8 };
    expect(inclinaisonDuRideau(vent, vue(2))).toBeCloseTo(-inclinaisonDuRideau(vent, vue(0)), 10);
  });

  it("un vent faible penche moins qu'un vent fort", () => {
    const faible = inclinaisonDuRideau({ versRad: 0, recuMs: 2 }, vue());
    const fort = inclinaisonDuRideau({ versRad: 0, recuMs: 8 }, vue());
    expect(fort).toBeGreaterThan(faible);
  });

  it("les gouttes dérivent du côté où le trait penche", () => {
    const t = temps(30, 0, 8);
    const avant = gouttesDeLaPluie(t, vue(), 1000);
    const apres = gouttesDeLaPluie(t, vue(), 1030);
    const g = avant.findIndex((a, i) => (apres[i]?.sy ?? 0) > a.sy);
    expect(apres[g]?.sx ?? 0).toBeGreaterThan(avant[g]?.sx ?? 0);
  });
});

describe("ce qu'on voit et ce qu'on entend", () => {
  it("l'averse du son est celle de l'image", () => {
    const calme: EntreeDuSon = {
      ventMoyMs: 0,
      ventExposition: 0.5,
      lumiereAuSol: new Float32Array(4).fill(1),
      pluieMm: 0,
      eau: "aucune",
      partNoyee: 0,
      particulesDeFeu: 0,
      chantier: 0,
      semaineAnnee: 30,
      nicheurs: {},
      geais: 0,
    };
    for (const mm of [0, 1, 4, 12, 35, 80]) {
      expect(niveauxDuSon({ ...calme, pluieMm: mm }).ambiances.pluie).toBe(intensiteDeLaPluie(mm));
    }
  });
});
