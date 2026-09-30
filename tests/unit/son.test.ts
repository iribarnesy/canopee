/**
 * **Ce qu'on entend est ce que le moteur dit** (#129, lot L9).
 *
 * Les niveaux ne s'écoutent pas dans un essai, mais ils se défendent : du vent
 * sans feuillage bruisse moins, une mare ne coule pas, une parcelle sans
 * nicheur ne chante pas, un chantier de mille tiges ne tourne pas un quart
 * d'heure.
 */

import { describe, expect, it } from "vitest";
import {
  CADENCE_MAX,
  CHANTIER_MAX_MS,
  couvert,
  dureeDuChantier,
  type EntreeDuSon,
  niveauxDuSon,
} from "../../src/game/son/niveaux";

const CALME: EntreeDuSon = {
  ventMoyMs: 0,
  ventExposition: 0.5,
  lumiereAuSol: new Float32Array(100).fill(1),
  pluieMm: 0,
  eau: "aucune",
  partNoyee: 0,
  particulesDeFeu: 0,
  chantier: 0,
  semaineAnnee: 30,
  nicheurs: {},
  geais: 0,
};

const avec = (e: Partial<EntreeDuSon>) => niveauxDuSon({ ...CALME, ...e });

describe("le silence", () => {
  it("une parcelle calme, nue et sans nicheur ne fait aucun bruit", () => {
    const n = avec({});
    expect(Object.values(n.ambiances).every((v) => v === 0)).toBe(true);
    expect(Object.values(n.cadences).every((v) => v === 0)).toBe(true);
  });
});

describe("le vent", () => {
  it("monte avec le vent que la parcelle reçoit", () => {
    const faible = avec({ ventMoyMs: 4, ventExposition: 1 }).ambiances.vent;
    const fort = avec({ ventMoyMs: 12, ventExposition: 1 }).ambiances.vent;
    expect(fort).toBeGreaterThan(faible);
  });

  it("une parcelle abritée entend moins le même vent", () => {
    const expose = avec({ ventMoyMs: 8, ventExposition: 1 }).ambiances.vent;
    const abrite = avec({ ventMoyMs: 8, ventExposition: 0.2 }).ambiances.vent;
    expect(abrite).toBeLessThan(expose);
  });

  it("bruisse plus sous un couvert de feuilles que sur la friche nue", () => {
    const nu = avec({ ventMoyMs: 8, ventExposition: 1 }).ambiances.vent;
    const sousCouvert = avec({
      ventMoyMs: 8,
      ventExposition: 1,
      lumiereAuSol: new Float32Array(100).fill(0.2),
    }).ambiances.vent;
    expect(sousCouvert).toBeGreaterThan(nu);
    expect(couvert(new Float32Array(10).fill(0.2))).toBeCloseTo(0.8, 5);
  });
});

describe("l'eau", () => {
  it("un ruisseau coule toujours, une mare seulement quand la crue la déborde", () => {
    expect(avec({ eau: "ruisseau" }).ambiances.ruisseau).toBeGreaterThan(0);
    expect(avec({ eau: "mare" }).ambiances.ruisseau).toBe(0);
    expect(avec({ eau: "mare", partNoyee: 0.2 }).ambiances.ruisseau).toBeGreaterThan(0);
  });

  it("la pluie suit la pluie de la semaine, plafonnée", () => {
    const bruine = avec({ pluieMm: 4 }).ambiances.pluie;
    const averse = avec({ pluieMm: 30 }).ambiances.pluie;
    expect(averse).toBeGreaterThan(bruine);
    expect(avec({ pluieMm: 400 }).ambiances.pluie).toBe(1);
  });
});

describe("le feu et les chantiers", () => {
  it("un grand front gronde plus qu'une lisière qui fume", () => {
    expect(avec({ particulesDeFeu: 100 }).ambiances.feu).toBeGreaterThan(
      avec({ particulesDeFeu: 5 }).ambiances.feu,
    );
  });

  it("la tronçonneuse tourne pour les tiges qu'on démonte, pas pour une plantation", () => {
    expect(dureeDuChantier([{ type: "planter", ids: [1, 2, 3] }])).toBe(0);
    expect(dureeDuChantier([{ type: "brouter", ids: [1, 2, 3] }])).toBe(0);
    expect(dureeDuChantier([{ type: "couper", ids: [1, 2] }])).toBeGreaterThan(0);
  });

  it("un éclaircissage de mille tiges ne fait pas un quart d'heure de moteur", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i);
    expect(dureeDuChantier([{ type: "eclaircir", ids }])).toBe(CHANTIER_MAX_MS);
  });
});

describe("les oiseaux", () => {
  it("chantent les espèces qui nichent, et elles seules", () => {
    const n = avec({ nicheurs: { mesange_bleue: 2 }, semaineAnnee: 15 });
    expect(n.cadences.mesange_bleue).toBeGreaterThan(0);
    expect(n.cadences.mesange_charbonniere).toBe(0);
    expect(n.cadences.buse_variable).toBe(0);
  });

  it("le printemps chante plus que l'été", () => {
    const printemps = avec({ nicheurs: { mesange_charbonniere: 1 }, semaineAnnee: 15 });
    const ete = avec({ nicheurs: { mesange_charbonniere: 1 }, semaineAnnee: 30 });
    expect(printemps.cadences.mesange_charbonniere).toBeGreaterThan(
      ete.cadences.mesange_charbonniere,
    );
  });

  it("le geai ne crie que quand il vient à un semis", () => {
    expect(avec({}).cadences.geai).toBe(0);
    expect(avec({ geais: 1 }).cadences.geai).toBeGreaterThan(0);
  });

  it("jamais une volière", () => {
    const n = avec({ nicheurs: { mesange_bleue: 40 }, semaineAnnee: 15 });
    expect(n.cadences.mesange_bleue).toBe(CADENCE_MAX);
  });
});
