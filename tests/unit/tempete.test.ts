/**
 * L'ACTE DE LA TEMPÊTE : la rafale qui passe, et les tiges qui vont au sol
 * ensemble.
 *
 * Deux propriétés portent tout le reste.
 *
 * **L'événement, et pas l'état.** Un chablis n'est rapporté mort qu'un an
 * après la rafale (`CHABLIS_RECUPERABLE_SEMAINES`), une semaine où `tempete`
 * vaut `undefined`. Un rendu qui se raccrocherait aux `morts` jouerait donc la
 * rafale avec un an de retard, sur une semaine sans vent. C'est pour ça que le
 * moteur envoie l'événement, et c'est la première chose vérifiée ici.
 *
 * **Toutes du même côté.** `versRad` est le même pour toutes les victimes
 * d'une même semaine ; qu'elles partent dans le même sens est la signature
 * d'une tempête sur le terrain — par opposition à une chandelle isolée, qui
 * tombe dans le sens de la pente.
 */

import { describe, expect, it } from "vitest";
import type { TempeteResult } from "../../src/engine/tick";
import { type Vue, vueInitiale } from "../../src/render/camera";
import { DEBOUT } from "../../src/render/temps/chute";
import { type JournalDeSemaine, planDEllipse } from "../../src/render/temps/ellipse";
import { poseDeLaRafale, trouverLaTempete } from "../../src/render/temps/lecteur";

const COTE = 100;
const vue = (orientation: 0 | 1 | 2 | 3 = 0): Vue => {
  const v = vueInitiale(COTE, 900, 640, 0);
  return { ...v, cam: { ...v.cam, orientation } };
};

/** Une rafale qui verse deux arbres vers l'est. */
const tempete = (versRad = 0): TempeteResult => ({
  rafaleMs: 33.3,
  versRad,
  arbresVerses: 2,
  arbresCasses: 0,
  arbresEbranches: 0,
  volumeM3: 4.2,
  victimes: [
    { id: 1, hauteurM: 18 },
    { id: 2, hauteurM: 22 },
  ],
});

const ARBRES = new Map([
  [1, { x: 30, y: 30, heightM: 18 }],
  [2, { x: 70, y: 60, heightM: 22 }],
  [3, { x: 50, y: 50, heightM: 15 }], // épargné
]);
const ou = (id: number) => ARBRES.get(id);

const planAvecTempete = (t = tempete()) =>
  planDEllipse([{ tempete: t } satisfies JournalDeSemaine], 1000);

describe("la tempête entre dans le plan", () => {
  it("une rafale fait un acte", () => {
    const plan = planAvecTempete();
    expect(plan.actes.map((a) => a.sujet.quoi)).toEqual(["tempete"]);
  });

  it("l'acte vient APRÈS le geste et le feu, AVANT les morts qu'il laisse", () => {
    const plan = planDEllipse(
      [
        {
          tempete: tempete(),
          morts: [
            { id: 9, x: 1, y: 1, especeId: "fagus_sylvatica", cause: "secheresse", heightM: 8 },
          ],
        },
      ],
      1000,
    );
    const ordre = plan.actes.map((a) => a.sujet.quoi);
    expect(ordre.indexOf("tempete")).toBeLessThan(ordre.indexOf("mort"));
  });

  it("deux rafales de deux hivers font DEUX actes : leurs caps diffèrent", () => {
    const plan = planDEllipse([{ tempete: tempete(0) }, { tempete: tempete(Math.PI) }], 2000);
    const caps = plan.actes.flatMap((a) => (a.sujet.quoi === "tempete" ? [a.sujet.versRad] : []));
    expect(caps).toEqual([0, Math.PI]);
  });
});

describe("l'acte, joué", () => {
  it("les victimes partent TOUTES du même côté", () => {
    const t = trouverLaTempete(planAvecTempete(), ou);
    const a = poseDeLaRafale(t, 500, 1, vue());
    const b = poseDeLaRafale(t, 500, 2, vue());
    expect(Math.sign(a.rotationRad)).toBe(Math.sign(b.rotationRad));
    expect(a.rotationRad).not.toBe(0);
  });

  it("à la fin de l'acte, une victime est couchée et y reste", () => {
    const t = trouverLaTempete(planAvecTempete(), ou);
    const finie = poseDeLaRafale(t, 1000, 1, vue());
    const plusTard = poseDeLaRafale(t, 5000, 1, vue());
    expect(Math.abs(finie.rotationRad)).toBeGreaterThan(1); // au moins 57°
    expect(plusTard.rotationRad).toBeCloseTo(finie.rotationRad, 6);
  });

  it("un arbre épargné plie, puis se redresse — le coup de vent ne s'installe pas", () => {
    const t = trouverLaTempete(planAvecTempete(), ou);
    const auMilieu = poseDeLaRafale(t, 500, 3, vue());
    const apres = poseDeLaRafale(t, 1100, 3, vue());
    expect(Math.abs(auMilieu.rotationRad)).toBeGreaterThan(0.02);
    // Il plie, il ne verse pas : sept degrés, pas un quart de tour.
    expect(Math.abs(auMilieu.rotationRad)).toBeLessThan(0.3);
    expect(auMilieu.hauteur).toBe(1);
    expect(apres).toEqual(DEBOUT);
  });

  it("l'arbre épargné penche du MÊME côté que celui qui verse", () => {
    const t = trouverLaTempete(planAvecTempete(), ou);
    // 600 ms et non 300 : les victimes démarrent en ordre échelonné, et à 300
    // celle-ci n'a pas encore bougé — comparer un signe à zéro ne dirait rien.
    const victime = poseDeLaRafale(t, 600, 1, vue());
    const epargne = poseDeLaRafale(t, 600, 3, vue());
    expect(Math.sign(epargne.rotationRad)).toBe(Math.sign(victime.rotationRad));
  });

  it("la caméra tourne, le vent tourne avec elle", () => {
    const t = trouverLaTempete(planAvecTempete(tempete(0)), ou);
    const face = poseDeLaRafale(t, 400, 3, vue(0));
    const demiTour = poseDeLaRafale(t, 400, 3, vue(2));
    // Un vent d'est vu de face pousse à droite ; vu d'un demi-tour, à gauche.
    expect(Math.sign(face.rotationRad)).toBe(-Math.sign(demiTour.rotationRad));
  });

  it("avant l'acte, personne ne bouge", () => {
    const plan = planDEllipse(
      [{ gestes: [{ type: "chauler", cellules: [1] }] }, { tempete: tempete() }],
      1000,
    );
    const t = trouverLaTempete(plan, ou);
    expect(poseDeLaRafale(t, 10, 1, vue())).toEqual(DEBOUT);
    expect(poseDeLaRafale(t, 10, 3, vue())).toEqual(DEBOUT);
  });

  it("une victime absente de l'instantané est ignorée, pas inventée", () => {
    const t = trouverLaTempete(planAvecTempete(), () => undefined);
    expect(t?.victimes.size).toBe(0);
    expect(poseDeLaRafale(t, 500, 1, vue()).hauteur).toBe(1); // elle plie, elle ne verse pas
  });

  it("sans tempête, rien ne bouge", () => {
    expect(poseDeLaRafale(undefined, 500, 1, vue())).toEqual(DEBOUT);
  });
});
