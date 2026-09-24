/**
 * **Une animation va jusqu'au bout**, **et le temps l'attend** (#163).
 *
 * **Le commanditaire a renversé la politique du §5.11, et c'est écrit tel
 * quel** : « c'est mieux d'attendre la fin d'une animation que de couper. Par
 * exemple, si on chaule pendant que les semaines s'écoulent, actuellement ça
 * coupe l'animation ». Jusqu'ici la vitesse imposait sa durée à l'animation ;
 * désormais l'animation impose la sienne au temps, en deçà d'un seuil.
 *
 * Trois troncatures existaient, et elles sont distinctes — la mesure les a
 * séparées : la **compression** (un acte seul tombait à 77 ms en ×13, sous le
 * plancher de lisibilité que le module se donne), l'**omission** (13 % des actes
 * au-delà de ×13), et le **remplacement** (le plan reconstruit à chaque
 * instantané). Le rythme naturel ferme les trois en deçà du seuil.
 */

import { describe, expect, it } from "vitest";
import type { ChuteDeChandelle, MortDeLaSemaine } from "../../src/engine/tick";
import {
  ACTE_LE_PLUS_COURT_MS,
  DUREE_NATURELLE_MS,
  dureeBloquanteMs,
  type JournalDeSemaine,
  planAuRythmeNaturel,
  planDEllipse,
} from "../../src/render/temps/ellipse";

const mort = (id: number, cause: MortDeLaSemaine["cause"]): MortDeLaSemaine => ({
  id,
  x: 10,
  y: 10,
  especeId: "betula_pendula",
  cause,
  heightM: 12,
});

const chute = (id: number): ChuteDeChandelle => ({
  id,
  x: 20,
  y: 20,
  especeId: "betula_pendula",
  heightM: 12,
  directionRad: 0,
  masseKgC: 100,
  empreinte: [],
});

const chaulage: JournalDeSemaine = { gestes: [{ type: "chauler", cellules: [1, 2, 3] }] };

describe("le rythme naturel", () => {
  it("donne à chaque acte la durée que sa nature demande", () => {
    const plan = planAuRythmeNaturel([chaulage]);
    expect(plan.actes).toHaveLength(1);
    expect(plan.actes[0]?.dureeMs).toBe(DUREE_NATURELLE_MS.geste);
    expect(plan.dureeMs).toBe(DUREE_NATURELLE_MS.geste);
  });

  it("les enchaîne sans trou ni recouvrement", () => {
    const plan = planAuRythmeNaturel([
      { ...chaulage, morts: [mort(1, "secheresse")], chutes: [chute(2)] },
    ]);
    expect(plan.actes.map((a) => a.sujet.quoi)).toEqual(["geste", "mort", "chute"]);
    let attendu = 0;
    for (const acte of plan.actes) {
      expect(acte.debutMs).toBe(attendu);
      attendu += acte.dureeMs;
    }
    expect(plan.dureeMs).toBe(attendu);
  });

  it("n'omet RIEN, et ne comprime rien sous le plancher de lisibilité", () => {
    // Le contraste avec le budget, sur le même journal : c'est toute la
    // différence entre les deux régimes.
    const charge: JournalDeSemaine = {
      ...chaulage,
      morts: [mort(1, "secheresse"), mort(2, "ombre"), mort(3, "vieillesse")],
      chutes: [chute(9)],
    };
    const naturel = planAuRythmeNaturel([charge]);
    const serre = planDEllipse([charge], 1000 / 13);
    expect(naturel.actesOmis).toBe(0);
    expect(naturel.deborde).toBe(false);
    expect(serre.actesOmis).toBeGreaterThan(0);
    for (const acte of naturel.actes) {
      expect(acte.dureeMs).toBeGreaterThanOrEqual(ACTE_LE_PLUS_COURT_MS);
    }
  });

  it("ne prétend rien sur un journal vide", () => {
    const plan = planAuRythmeNaturel([]);
    expect(plan.actes).toHaveLength(0);
    expect(plan.dureeMs).toBe(0);
    expect(dureeBloquanteMs(plan)).toBe(0);
  });

  it("garde l'ordre des causes : le geste ouvre, la chute ferme", () => {
    const plan = planAuRythmeNaturel([
      { chutes: [chute(1)], morts: [mort(2, "feu")], ...chaulage },
    ]);
    expect(plan.actes.map((a) => a.sujet.quoi)).toEqual(["geste", "mort", "chute"]);
  });

  it("fusionne plusieurs semaines en un seul acte par sujet", () => {
    // La propriété du §5.11 que le rythme naturel ne doit pas casser : dix ans
    // de sécheresse font **un** acte, pas dix.
    const dix: JournalDeSemaine[] = Array.from({ length: 10 }, (_, i) => ({
      morts: [mort(i, "secheresse")],
    }));
    const plan = planAuRythmeNaturel(dix);
    expect(plan.actes).toHaveLength(1);
    expect(plan.dureeMs).toBe(DUREE_NATURELLE_MS.mort);
  });
});

describe("ce qui retient l'horloge", () => {
  it("tout ce qui vient du journal est bloquant", () => {
    const plan = planAuRythmeNaturel([
      { ...chaulage, morts: [mort(1, "ombre")], chutes: [chute(2)] },
    ]);
    for (const acte of plan.actes) expect(acte.bloquant).toBe(true);
  });

  it("l'attente est la fin du dernier acte bloquant", () => {
    const plan = planAuRythmeNaturel([{ ...chaulage, chutes: [chute(2)] }]);
    expect(dureeBloquanteMs(plan)).toBe(DUREE_NATURELLE_MS.geste + DUREE_NATURELLE_MS.chute);
  });

  it("un plan dont rien ne bloque ne retient rien", () => {
    // Le drapeau existe pour le jour où une animation d'ambiance entrera dans
    // un plan : elle ne doit pas arrêter le temps pour souffler dans les
    // feuilles. L'épreuve tient la mécanique en attendant ce jour-là.
    const plan = planAuRythmeNaturel([chaulage]);
    const sansBlocage = {
      ...plan,
      actes: plan.actes.map((a) => ({ ...a, bloquant: false })),
    };
    expect(dureeBloquanteMs(sansBlocage)).toBe(0);
    expect(sansBlocage.dureeMs).toBeGreaterThan(0);
  });

  it("le budget porte le même drapeau : les deux régimes ne divergent pas", () => {
    const plan = planDEllipse([chaulage], 2500);
    expect(plan.actes[0]?.bloquant).toBe(true);
  });
});

describe("les durées naturelles elles-mêmes", () => {
  it("sont toutes au-dessus du plancher de lisibilité", () => {
    for (const [quoi, ms] of Object.entries(DUREE_NATURELLE_MS)) {
      expect(ms, quoi).toBeGreaterThanOrEqual(ACTE_LE_PLUS_COURT_MS);
    }
  });

  it("le feu est le plus long : c'est un front qui traverse (#157)", () => {
    const autres = Object.entries(DUREE_NATURELLE_MS).filter(([q]) => q !== "feu");
    for (const [quoi, ms] of autres) {
      expect(DUREE_NATURELLE_MS.feu, quoi).toBeGreaterThan(ms);
    }
  });
});
