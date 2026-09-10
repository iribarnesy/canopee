/**
 * Le plan d'une ellipse : ce qui a changé, et dans quel ordre le montrer.
 *
 * **La propriété centrale à garder est celle que le commanditaire a énoncée** :
 * « c'est le même principe peu importe la durée de l'ellipse ». Une semaine et
 * dix ans doivent produire un plan de même FORME — même budget, mêmes types
 * d'actes, mêmes regroupements — avec seulement plus de sujets dedans. La
 * plupart des essais ci-dessous ne vérifient que ça, sous différents angles.
 */

import { describe, expect, it } from "vitest";
import type { GesteVisible } from "../../src/engine/actions";
import type { ChuteDeChandelle, IncendieResult, MortDeLaSemaine } from "../../src/engine/tick";
import type { CauseMort } from "../../src/engine/trees";
import {
  ACTE_LE_PLUS_COURT_MS,
  type JournalDeSemaine,
  planDEllipse,
} from "../../src/render/temps/ellipse";

const mort = (id: number, cause: CauseMort): MortDeLaSemaine => ({
  id,
  x: 10 + id,
  y: 20,
  especeId: "fagus_sylvatica",
  cause,
  heightM: 12,
});

const chute = (id: number): ChuteDeChandelle => ({
  id,
  x: 30,
  y: 40,
  especeId: "betula_pendula",
  heightM: 14,
  directionRad: 0.7,
  masseKgC: 400,
  empreinte: [],
});

const feu = (origine: number): IncendieResult => ({
  cellulesBrulees: 3,
  arbresTues: 2,
  rejets: 1,
  carboneTHa: 0.4,
  origine,
  brulees: Int32Array.from([origine, origine + 1, origine + 2]),
  rangs: Int32Array.from([0, 1, 2]),
  charges: Float32Array.from([1.2, 0.8, 0.4]),
});

const geste = (type: GesteVisible["type"], ids: number[]): GesteVisible =>
  ({ type, ids }) as GesteVisible;

describe("le plan d'ellipse regroupe au lieu d'égrener", () => {
  it("fait UN acte de tous les morts d'une même cause", () => {
    // La demande littérale : « animer tous les arbres qui sont morts dans la
    // semaine ». Trente-quatre bouleaux font un acte, pas trente-quatre.
    const morts = Array.from({ length: 34 }, (_, i) => mort(i, "secheresse"));
    const plan = planDEllipse([{ morts }], 2000);
    expect(plan.actes).toHaveLength(1);
    const sujet = plan.actes[0]?.sujet;
    expect(sujet?.quoi).toBe("mort");
    if (sujet?.quoi === "mort") expect(sujet.morts).toHaveLength(34);
  });

  it("sépare les causes, parce qu'elles ne se montrent pas pareil", () => {
    // Le §6.3 demande une animation par cause : une sécheresse ne tombe pas
    // comme un engorgement. Les mélanger effacerait ce que le joueur doit lire.
    const plan = planDEllipse(
      [{ morts: [mort(1, "secheresse"), mort(2, "engorgement"), mort(3, "secheresse")] }],
      3000,
    );
    expect(plan.actes).toHaveLength(2);
  });

  it("fusionne les gestes de même type sur toute la période", () => {
    const plan = planDEllipse(
      [
        { gestes: [geste("elaguer", [1, 2])] },
        { gestes: [geste("elaguer", [3])] },
        { gestes: [geste("couper", [4])] },
      ],
      3000,
    );
    expect(plan.actes).toHaveLength(2);
    const elagage = plan.actes.find(
      (a) => a.sujet.quoi === "geste" && a.sujet.geste.type === "elaguer",
    )?.sujet;
    if (elagage?.quoi === "geste" && "ids" in elagage.geste) {
      expect(elagage.geste.ids).toEqual([1, 2, 3]);
    }
  });
});

describe("l'ordre : les causes avant leurs conséquences", () => {
  it("passe le feu avant les morts qu'il a faites, et les chutes en dernier", () => {
    const plan = planDEllipse(
      [
        {
          gestes: [geste("couper", [9])],
          incendie: feu(500),
          morts: [mort(1, "feu")],
          chutes: [chute(1)],
        },
      ],
      4000,
    );
    expect(plan.actes.map((a) => a.sujet.quoi)).toEqual(["geste", "feu", "mort", "chute"]);
  });

  it("rend le même plan pour le même journal : le rendu est déterministe", () => {
    const journal: JournalDeSemaine[] = [
      { morts: [mort(1, "ombre"), mort(2, "vieillesse")], chutes: [chute(3)] },
    ];
    const a = planDEllipse(journal, 2000);
    const b = planDEllipse(journal, 2000);
    expect(a.actes.map((x) => x.sujet.quoi)).toEqual(b.actes.map((x) => x.sujet.quoi));
    expect(a.dureeMs).toBe(b.dureeMs);
  });
});

describe("le budget : la même mécanique quelle que soit la durée franchie", () => {
  /**
   * **La propriété que le commanditaire a demandée, mise à l'épreuve.** Une
   * semaine et dix ans doivent tenir dans le MÊME budget : le joueur qui saute
   * dix ans n'attend pas cinq cents fois plus longtemps, il voit plus de choses
   * dans le même temps.
   */
  it("tient dans le budget, qu'on franchisse une semaine ou dix ans", () => {
    const uneSemaine: JournalDeSemaine[] = [{ morts: [mort(1, "secheresse")] }];
    const dixAns: JournalDeSemaine[] = Array.from({ length: 520 }, (_, i) => ({
      morts: [mort(i, i % 2 === 0 ? "secheresse" : "vieillesse")],
      chutes: i % 50 === 0 ? [chute(i)] : [],
    }));
    expect(planDEllipse(uneSemaine, 2000).dureeMs).toBe(2000);
    expect(planDEllipse(dixAns, 2000).dureeMs).toBe(2000);
  });

  it("ne déborde pas sur dix ans de morts : le regroupement s'en charge", () => {
    // Dix ans de sécheresse ne font pas dix ans d'actes — ils font UN acte de
    // dix ans d'arbres. Sans ce regroupement sur toute la période, une longue
    // ellipse déborderait pour de mauvaises raisons.
    const dixAns: JournalDeSemaine[] = Array.from({ length: 520 }, (_, i) => ({
      morts: [mort(i, "secheresse")],
    }));
    const plan = planDEllipse(dixAns, 2000);
    expect(plan.actes).toHaveLength(1);
    expect(plan.deborde).toBe(false);
  });

  it("remplit le budget sans trou : les créneaux se suivent", () => {
    const plan = planDEllipse(
      [{ morts: [mort(1, "secheresse"), mort(2, "ombre")], chutes: [chute(3)] }],
      3000,
    );
    expect(plan.actes).toHaveLength(3);
    let attendu = 0;
    for (const acte of plan.actes) {
      expect(acte.debutMs).toBeCloseTo(attendu, 6);
      attendu += acte.dureeMs;
    }
    expect(attendu).toBeCloseTo(plan.dureeMs, 6);
  });

  /**
   * **Et il DIT quand il n'y arrive pas.** C'est là que les mécanismes du §6.8
   * reprennent la main — calque des changements, bilan de période — non plus
   * comme une alternative à l'animation mais comme son repli assumé. Un plan
   * qui mentirait ici ferait défiler des actes de trois millisecondes en
   * prétendant les montrer.
   */
  it("signale le débordement au lieu de rendre des actes illisibles", () => {
    // Douze causes de mort, tous les gestes : plus d'actes que de créneaux au
    // plancher de lisibilité.
    const causes: CauseMort[] = [
      "secheresse",
      "engorgement",
      "ombre",
      "vieillesse",
      "solHorsGamme",
      "feu",
      "abroutissement",
      "ravageurs",
      "labour",
      "maladie",
    ];
    const journal: JournalDeSemaine = { morts: causes.map((c, i) => mort(i, c)) };
    const etroit = planDEllipse([journal], ACTE_LE_PLUS_COURT_MS * 3);
    expect(etroit.deborde).toBe(true);
    expect(etroit.actesOmis).toBe(causes.length - 3);
    // Ce qui reste est lisible : c'est toute la raison de tronquer.
    for (const a of etroit.actes) {
      expect(a.dureeMs).toBeGreaterThanOrEqual(ACTE_LE_PLUS_COURT_MS);
    }
    // Le même journal dans un budget large ne déborde pas.
    expect(planDEllipse([journal], ACTE_LE_PLUS_COURT_MS * 20).deborde).toBe(false);
  });

  it("rend un plan vide sans rien inventer", () => {
    expect(planDEllipse([], 2000).actes).toHaveLength(0);
    expect(planDEllipse([{}], 2000).dureeMs).toBe(0);
    // Un budget nul n'est pas une erreur : c'est « montre tout de suite ».
    expect(planDEllipse([{ morts: [mort(1, "feu")] }], 0).actes).toHaveLength(0);
  });
});
