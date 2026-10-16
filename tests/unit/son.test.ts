/**
 * **Ce qu'on entend est ce que le moteur dit** (#129, lot L9).
 *
 * Les niveaux ne s'écoutent pas dans un essai, mais ils se défendent : du vent
 * sans feuillage bruisse moins, une mare ne coule pas, une parcelle sans
 * nicheur ne chante pas, une coupe s'entend comme un coup bref, et vingt
 * coupes enchaînées ne font pas tourner la scie plus de trois secondes et
 * demie après la dernière (#403).
 */

import { describe, expect, it } from "vitest";
import type { GesteVisible } from "../../src/engine/actions";
import {
  CADENCE_MAX,
  CHANTIER_MAX_MS,
  COUP_MAX_MS,
  COUP_MS,
  couvert,
  dureeDuCoup,
  type EntreeDuSon,
  MS_PAR_TIGE_DE_PLUS,
  niveauxDuSon,
  prolongerLeChantier,
  RELANCE_MS,
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
    expect(dureeDuCoup([{ type: "planter", ids: [1, 2, 3] }])).toBe(0);
    expect(dureeDuCoup([{ type: "brouter", ids: [1, 2, 3] }])).toBe(0);
    expect(dureeDuCoup([{ type: "labourer", cellules: [4, 5] }])).toBe(0);
    expect(dureeDuCoup([{ type: "couper", ids: [] }])).toBe(0);
    expect(dureeDuCoup([{ type: "couper", ids: [1, 2] }])).toBeGreaterThan(0);
  });
});

/**
 * **Des bouts de tronçonneuse, prolongés quand on enchaîne** (#403) : « le son
 * est trop long, beaucoup trop long […] si on enchaîne les actions alors le
 * bruit dure un peu plus, sans repartir à zéro à chaque fois qu'on clique ».
 */
describe("les coups de tronçonneuse", () => {
  const coupe = (n = 1): GesteVisible[] => [
    { type: "couper", ids: Array.from({ length: n }, (_, i) => i) },
  ];
  const T = 100_000;

  it("une coupe seule est un coup bref, la scie arrêtée", () => {
    expect(prolongerLeChantier(0, T, coupe())).toBe(T + COUP_MS);
    // Une échéance passée depuis un instant ne compte plus : coup neuf.
    expect(prolongerLeChantier(T - 1, T, coupe())).toBe(T + COUP_MS);
    expect(COUP_MS).toBeLessThanOrEqual(1500);
  });

  it("beaucoup de tiges d'un geste font un coup à peine plus long, plafonné", () => {
    expect(dureeDuCoup(coupe(3))).toBe(COUP_MS + 2 * MS_PAR_TIGE_DE_PLUS);
    expect(dureeDuCoup(coupe(3))).toBeGreaterThan(dureeDuCoup(coupe(1)));
    const ids = Array.from({ length: 1000 }, (_, i) => i);
    expect(dureeDuCoup([{ type: "eclaircir", ids }])).toBe(COUP_MAX_MS);
    // Les tiges de tous les gestes de l'instantané comptent ensemble.
    expect(
      dureeDuCoup([
        { type: "couper", ids: [1] },
        { type: "elaguer", ids: [2] },
        { type: "planter", ids: [3] },
      ]),
    ).toBe(COUP_MS + MS_PAR_TIGE_DE_PLUS);
    expect(COUP_MAX_MS).toBeLessThan(CHANTIER_MAX_MS);
  });

  it("une coupe pendant que la scie tourne prolonge l'échéance, elle ne la remplace pas", () => {
    const fin = prolongerLeChantier(0, T, coupe());
    const ensuite = prolongerLeChantier(fin, T + 300, coupe());
    expect(ensuite).toBe(fin + RELANCE_MS);
    // Remplacer, c'eût été repartir d'un coup entier depuis le second clic.
    expect(ensuite).toBeGreaterThan(T + 300 + COUP_MS);
  });

  it("une coupe à la toute fin d'une autre ne s'entend pas plus courte qu'une coupe seule", () => {
    const fin = prolongerLeChantier(0, T, coupe());
    const tard = fin - 50;
    expect(prolongerLeChantier(fin, tard, coupe())).toBe(tard + COUP_MS);
  });

  it(`vingt coupes enchaînées : jamais plus de ${CHANTIER_MAX_MS} ms de moteur devant soi`, () => {
    let fin = 0;
    let maintenant = T;
    for (let i = 0; i < 20; i++) {
      fin = prolongerLeChantier(fin, maintenant, coupe(5));
      expect(fin - maintenant).toBeLessThanOrEqual(CHANTIER_MAX_MS);
      maintenant += 200;
    }
    // Au rythme d'un clic tous les deux dixièmes, la scie a atteint son
    // plafond : elle se tait trois secondes et demie après le dernier.
    expect(fin).toBe(maintenant - 200 + CHANTIER_MAX_MS);
  });

  it("des gestes qui ne démontent rien laissent l'échéance où elle était", () => {
    const planter: GesteVisible[] = [{ type: "planter", ids: [1, 2] }];
    const labour: GesteVisible[] = [{ type: "labourer", cellules: [1, 2] }];
    // La scie arrêtée reste arrêtée…
    expect(prolongerLeChantier(0, T, planter)).toBe(0);
    expect(prolongerLeChantier(0, T, [])).toBe(0);
    // … et celle qui tourne n'est ni prolongée ni coupée.
    expect(prolongerLeChantier(T + 800, T, labour)).toBe(T + 800);
    expect(prolongerLeChantier(T + 800, T, [{ type: "brouter", ids: [7] }])).toBe(T + 800);
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
