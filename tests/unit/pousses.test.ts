/**
 * **Le gel des jeunes pousses, côté jeu** (#425) : le dessin, le couvert du
 * givre, l'avis et la fiche lisent le feuillage que le moteur laisse à l'arbre.
 */

import { describe, expect, it } from "vitest";
import {
  REFEUILLAISON_ATTENTE_SEMAINES,
  REFEUILLAISON_DUREE_SEMAINES,
  refeuillaison,
} from "../../src/engine/gelPousses";
import {
  feuillageRevenu,
  feuillageRevenuDe,
  poussesGeleesALaSemaine,
} from "../../src/game/pousses";
import { phraseDuGel } from "../../src/game/useAvisDuGel";

describe("le feuillage revenu après le gel des pousses (#425)", () => {
  it("vaut tout le feuillage pour un arbre jamais gelé, et la semaine même du gel", () => {
    expect(feuillageRevenu(undefined, 30)).toBe(1);
    expect(feuillageRevenu(30, 30)).toBe(1);
  });

  it("suit la courbe du moteur ensuite : nu, puis refeuillé", () => {
    for (let semaines = 1; semaines <= 10; semaines++) {
      expect(feuillageRevenu(20, 20 + semaines)).toBe(refeuillaison(semaines));
    }
    expect(feuillageRevenu(20, 21)).toBe(0);
    const plein = REFEUILLAISON_ATTENTE_SEMAINES + REFEUILLAISON_DUREE_SEMAINES;
    expect(feuillageRevenu(20, 20 + plein)).toBe(1);
  });
});

describe("les arbres que ce gel-ci a touchés", () => {
  const arbres = [
    { id: 1, chandelle: false, gelPousseSemaine: 17 },
    { id: 2, chandelle: false, gelPousseSemaine: 12 },
    { id: 3, chandelle: true, gelPousseSemaine: 17 },
    { id: 4, chandelle: false },
  ];

  it("sont ceux dont la date est la dernière semaine simulée, et vivants", () => {
    expect(poussesGeleesALaSemaine(arbres, 18).map((t) => t.id)).toEqual([1]);
  });
});

describe("l'avis dit ce que le gel a fait (#425)", () => {
  it("nomme les arbres dont les pousses ont grillé, et le temps qu'ils restent nus", () => {
    const phrase = phraseDuGel(-4.2, [
      "fraxinus_excelsior",
      "fraxinus_excelsior",
      "quercus_pubescens",
    ]);
    expect(phrase).toContain("Les jeunes pousses de 3 arbres ont grillé");
    expect(phrase).toMatch(/2 frênes/);
    expect(phrase).toContain(`ils restent nus ${REFEUILLAISON_ATTENTE_SEMAINES} semaines`);
  });

  it("s'accorde au singulier", () => {
    const phrase = phraseDuGel(-4.2, ["fraxinus_excelsior"]);
    expect(phrase).toContain("Les jeunes pousses de 1 arbre ont grillé");
    expect(phrase).toContain("il reste nu ");
  });

  it("sans pousse touchée, dit ce que le gel peut faire, et rien de plus", () => {
    const phrase = phraseDuGel(-1);
    expect(phrase).toContain("fleurs ouvertes et les feuilles à peine sorties");
    expect(phrase).not.toContain("ont grillé");
  });
});

describe("le dessin et la fiche suivent (#425)", () => {
  it("un arbre aux pousses gelées se pose nu, puis refeuille", async () => {
    const { arbresAPoser } = await import("../../src/game/parcelle");
    const cote = 40;
    const frene = {
      id: 1,
      especeId: "fraxinus_excelsior",
      x: 20,
      y: 20,
      heightM: 6,
      chandelle: false,
      gelPousseSemaine: 17,
    };
    const ctx = (week: number) => ({
      coteM: cote,
      week,
      altitudesM: new Array(cote * cote).fill(0),
    });
    expect(arbresAPoser([frene], ctx(18))[0]?.partFoliaire).toBe(0);
    const plein = REFEUILLAISON_ATTENTE_SEMAINES + REFEUILLAISON_DUREE_SEMAINES;
    expect(arbresAPoser([frene], ctx(17 + plein))[0]?.partFoliaire).toBe(1);
  });
});

describe("la défeuillaison par la soif (#446)", () => {
  it("revient sur la même courbe que le gel, et la plus basse des deux pertes l'emporte", () => {
    // Comme le tick (`feuillageRevenu`, tick.ts) : le minimum des deux.
    expect(feuillageRevenuDe({}, 30)).toBe(1);
    expect(feuillageRevenuDe({ defeuillaisonSemaine: 30 }, 31)).toBe(0);
    for (let semaines = 1; semaines <= 10; semaines++) {
      expect(feuillageRevenuDe({ defeuillaisonSemaine: 30 }, 30 + semaines)).toBe(
        refeuillaison(semaines),
      );
    }
    // Un gel de mai bien refait ne rend pas ses feuilles à l'arbre défeuillé en août.
    expect(feuillageRevenuDe({ gelPousseSemaine: 18, defeuillaisonSemaine: 32 }, 33)).toBe(0);
    // Et dans l'autre sens, la soif refaite ne cache pas un gel récent.
    expect(feuillageRevenuDe({ gelPousseSemaine: 70, defeuillaisonSemaine: 32 }, 72)).toBe(0);
  });

  it("un feuillu que la soif a défeuillé se pose nu, puis refeuille", async () => {
    const { arbresAPoser } = await import("../../src/game/parcelle");
    const cote = 40;
    const hetre = {
      id: 1,
      especeId: "fagus_sylvatica",
      x: 20,
      y: 20,
      heightM: 14,
      chandelle: false,
      defeuillaisonSemaine: 32,
    };
    const ctx = (week: number) => ({
      coteM: cote,
      week,
      altitudesM: new Array(cote * cote).fill(0),
    });
    // La semaine qui suit la chute : nu, en plein été.
    expect(arbresAPoser([hetre], ctx(33))[0]?.partFoliaire).toBe(0);
    // À mi-reverdissement : éclairci.
    const mi = arbresAPoser([hetre], ctx(32 + REFEUILLAISON_ATTENTE_SEMAINES + 1))[0];
    expect(mi?.partFoliaire).toBeGreaterThan(0);
    expect(mi?.partFoliaire).toBeLessThan(1);
    const plein = REFEUILLAISON_ATTENTE_SEMAINES + REFEUILLAISON_DUREE_SEMAINES;
    expect(arbresAPoser([hetre], ctx(32 + plein))[0]?.partFoliaire).toBe(1);
  });
});
