/**
 * Le lecteur d'un plan d'ellipse.
 *
 * **Deux décisions portent ce module, et les essais les gardent** : un arbre
 * déjà tombé reste tombé, et les sujets d'un même acte ne bougent pas au même
 * millième de seconde. Les deux sont des choses qu'on ne voit qu'en les
 * regardant tourner, et qu'un essai peut tenir fermées.
 */

import { describe, expect, it } from "vitest";
import type { ChuteDeChandelle, MortDeLaSemaine } from "../../src/engine/tick";
import { type Vue, vueInitiale } from "../../src/render/camera";
import { DEBOUT } from "../../src/render/temps/chute";
import { planDEllipse } from "../../src/render/temps/ellipse";
import {
  deformationDe,
  indexerLesChutes,
  ouEnEst,
  PART_ECHELONNEE,
} from "../../src/render/temps/lecteur";

const vue = (): Vue => vueInitiale(100, 900, 640, 0);

const chute = (id: number): ChuteDeChandelle => ({
  id,
  x: 40 + (id % 10),
  y: 50,
  especeId: "betula_pendula",
  heightM: 14,
  // Un azimut de profil, pour que la rotation soit franche et mesurable.
  directionRad: -Math.PI / 4,
  masseKgC: 300,
  empreinte: [],
});

const mort = (id: number): MortDeLaSemaine => ({
  id,
  x: 20,
  y: 20,
  especeId: "fagus_sylvatica",
  cause: "secheresse",
  heightM: 10,
});

describe("où en est l'ellipse", () => {
  it("trouve l'acte en cours et son avancement", () => {
    const plan = planDEllipse([{ morts: [mort(1)], chutes: [chute(9)] }], 2000);
    expect(plan.actes).toHaveLength(2);
    expect(ouEnEst(plan, 0).acte?.sujet.quoi).toBe("mort");
    expect(ouEnEst(plan, 500).avancement).toBeCloseTo(0.5, 6);
    expect(ouEnEst(plan, 1500).acte?.sujet.quoi).toBe("chute");
    expect(ouEnEst(plan, 2000).fini).toBe(true);
    expect(ouEnEst(plan, 99999).fini).toBe(true);
  });

  it("ne prétend rien sur un plan vide", () => {
    const plan = planDEllipse([], 2000);
    expect(ouEnEst(plan, 0).fini).toBe(true);
    expect(ouEnEst(plan, 0).acte).toBeUndefined();
  });
});

describe("un arbre déjà tombé reste tombé", () => {
  /**
   * **La décision n° 1, et le défaut qu'elle évite.** Le premier réflexe est de
   * rendre « debout » pour tout ce qui n'est pas l'acte en cours — et alors
   * chaque arbre se relève dès l'acte suivant. Une ellipse serait une suite de
   * choses qui se défont.
   */
  it("garde l'état final quand l'acte de chute est passé", () => {
    // La chute passe en DERNIER dans l'ordre du plan : on met donc un acte
    // après elle en trichant sur l'ordre — impossible — donc on vérifie
    // autrement : au-delà de la fin du plan, l'arbre est toujours couché.
    const plan = planDEllipse([{ chutes: [chute(7)] }], 1000);
    const couche = deformationDe(indexerLesChutes(plan), 1000, 7, vue());
    const bienApres = deformationDe(indexerLesChutes(plan), 60000, 7, vue());
    expect(couche.rotationRad).not.toBeCloseTo(DEBOUT.rotationRad, 3);
    expect(bienApres.rotationRad).toBeCloseTo(couche.rotationRad, 6);
    expect(bienApres.hauteur).toBeCloseTo(couche.hauteur, 6);
  });

  it("laisse debout un arbre dont l'acte n'a pas commencé", () => {
    // Un geste passe avant la chute : pendant le geste, l'arbre est debout.
    const plan = planDEllipse(
      [{ gestes: [{ type: "elaguer", ids: [1] }], chutes: [chute(7)] }],
      2000,
    );
    expect(deformationDe(indexerLesChutes(plan), 100, 7, vue())).toEqual(DEBOUT);
  });

  it("ne touche pas un arbre qui n'est dans aucun acte", () => {
    const plan = planDEllipse([{ chutes: [chute(7)] }], 1000);
    expect(deformationDe(indexerLesChutes(plan), 500, 999, vue())).toEqual(DEBOUT);
  });

  /**
   * Les autres actes ne passent PAS par la pose : une mort de sécheresse
   * jaunit puis se défeuille, ce qui est un changement de cuisson que la
   * classe porte déjà. Confondre les deux canaux ferait recuire l'atlas
   * pendant une animation, ce que le §5.11 interdit.
   */
  it("ne déforme rien pour un acte qui n'est pas une chute", () => {
    const plan = planDEllipse([{ morts: [mort(3)] }], 1000);
    expect(deformationDe(indexerLesChutes(plan), 500, 3, vue())).toEqual(DEBOUT);
  });
});

describe("les sujets d'un acte ne tombent pas en cadence", () => {
  /**
   * **La décision n° 2.** Trente-quatre arbres qui tombent au même millième de
   * seconde font une chorégraphie, pas une forêt. Le décalage vient de
   * l'identifiant, donc il est déterministe : rejouer la même ellipse rend la
   * même chorégraphie (§2.1).
   */
  it("échelonne les départs, et pas tous au même instant", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const plan = planDEllipse([{ chutes: ids.map(chute) }], 1000);
    // À un tiers du créneau, certains sont partis et d'autres pas.
    const angles = ids.map((id) =>
      Math.abs(deformationDe(indexerLesChutes(plan), 330, id, vue()).rotationRad),
    );
    expect(angles.some((a) => a === 0)).toBe(true);
    expect(angles.some((a) => a > 0)).toBe(true);
  });

  it("les fait tous arriver au bout du créneau", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const plan = planDEllipse([{ chutes: ids.map(chute) }], 1000);
    const fins = ids.map(
      (id) => deformationDe(indexerLesChutes(plan), 1000, id, vue()).rotationRad,
    );
    // Même azimut, même hauteur : à l'arrivée ils sont tous identiques.
    for (const f of fins) expect(f).toBeCloseTo(fins[0] ?? 0, 6);
  });

  it("est déterministe : deux lectures du même instant donnent le même angle", () => {
    const plan = planDEllipse([{ chutes: [chute(42), chute(43)] }], 1000);
    for (const id of [42, 43]) {
      expect(deformationDe(indexerLesChutes(plan), 400, id, vue()).rotationRad).toBe(
        deformationDe(indexerLesChutes(plan), 400, id, vue()).rotationRad,
      );
    }
  });

  it("réserve bien la part annoncée à l'échelonnement", () => {
    // Le dernier parti doit encore avoir le temps de tomber en entier : son
    // retard vaut au plus `PART_ECHELONNEE` du créneau.
    expect(PART_ECHELONNEE).toBeGreaterThan(0);
    expect(PART_ECHELONNEE).toBeLessThan(1);
    const plan = planDEllipse([{ chutes: [chute(1)] }], 1000);
    const acte = plan.actes[0];
    expect(acte).toBeDefined();
    if (!acte) return;
    // Au tout dernier instant du créneau, même le plus retardé est arrivé.
    const d = deformationDe(indexerLesChutes(plan), acte.debutMs + acte.dureeMs, 1, vue());
    const final = deformationDe(indexerLesChutes(plan), 1e6, 1, vue());
    expect(d.rotationRad).toBeCloseTo(final.rotationRad, 6);
  });
});
