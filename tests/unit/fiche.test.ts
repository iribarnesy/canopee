/**
 * LA FICHE D'UN ARBRE SUIVI (#149).
 *
 * « On aimerait bien voir ses stats détaillées — sa vigueur, son feuillage. »
 *
 * Ce que ces épreuves défendent : que la fiche LISE et n'invente pas. Chaque
 * ligne doit venir d'un champ de l'instantané ou d'une fonction du moteur, et
 * une grandeur absente ne doit pas faire une ligne vide — un « Fruits : 0 % »
 * sur un arbre qui n'a jamais fleuri dit quelque chose de faux.
 */

import { describe, expect, it } from "vitest";
import { contextePhenologique } from "../../src/engine/phenologie";
import { diametreInitialCm, type TreeState } from "../../src/engine/trees";
import { depuis, ficheDeLArbre, ilYA } from "../../src/game/panneaux/fiche";
import { arbreDuSnapshot } from "../../src/game/snapshot";

const ARBRE: TreeState = {
  id: 1,
  especeId: "quercus_pubescens",
  x: 3,
  y: 4,
  ageWeeks: 52 * 31,
  heightM: 9,
  diametreCm: diametreInitialCm(9),
  stress: 0,
  alive: true,
  uptakeYearG: 10,
  fruitsKg: 0,
  fruitProgress: 0,
  bloomFrosted: false,
  hauteurElagueeM: 0,
  recepages: 0,
  teteTrogneM: 0,
  rootDepthCm: 80,
  pousseTendreM: 0,
  dommageHydraulique: 0,
  vigueur: 1,
  vigueurIndividuelle: 1,
  protege: false,
};

/**
 * Un été franc : le feuillage est déployé, la sénescence n'a pas commencé.
 *
 * Construit par la fonction du MOTEUR et non à la main : la durée du jour et
 * le compteur de chute s'en déduisent, et un contexte bricolé donnerait une
 * part foliaire `NaN` — mesuré, en écrivant cet essai.
 */
const ETE = contextePhenologique(45, 24, 1400, 12);

const fiche = (champs: Partial<TreeState> = {}, semaine = 52 * 31) =>
  ficheDeLArbre(arbreDuSnapshot({ ...ARBRE, ...champs } as TreeState, 1400), {
    semaine,
    pheno: ETE,
  });

const valeur = (lignes: ReturnType<typeof fiche>, quoi: string) =>
  lignes.find((l) => l.quoi === quoi)?.valeur;

describe("ce que la fiche montre toujours", () => {
  it("la taille avec son stade, et l'âge en années", () => {
    const l = fiche();
    expect(valeur(l, "Taille")).toContain("9.0 m");
    expect(valeur(l, "Taille")).toMatch(/semis|gaulis|perchis|futaie/);
    expect(valeur(l, "Âge")).toBe("31 ans");
  });

  it("la vigueur et le feuillage, que la sélection ne disait pas", () => {
    const l = fiche({ vigueur: 0.42 });
    expect(valeur(l, "Vigueur")).toBe("42 %");
    // Le feuillage vient du calendrier du moteur : en juin, un chêne est
    // déployé. On ne fixe pas le nombre exact — ce serait recopier le modèle —
    // mais un feuillage nul en été serait un bug.
    const feuillage = valeur(l, "Feuillage") ?? "";
    expect(feuillage).toMatch(/^\d+ % déployé/);
    expect(Number.parseInt(feuillage, 10)).toBeGreaterThan(50);
  });
});

describe("ce qu'elle ne montre que s'il y a lieu", () => {
  it("un arbre sans histoire n'a ni stress, ni trogne, ni manchon, ni fruits", () => {
    const quoi = fiche().map((l) => l.quoi);
    expect(quoi).not.toContain("Stress");
    expect(quoi).not.toContain("Trogne");
    expect(quoi).not.toContain("Manchon");
    expect(quoi).not.toContain("Fruits");
    expect(quoi).not.toContain("Cime sèche");
  });

  it("le stress nomme ses parts, dans les mots du journal", () => {
    const l = fiche({ stress: 3.2, stressLent: 0.4, causeLente: "secheresse", stressMaladie: 0.1 });
    expect(valeur(l, "Stress")).toBe("3.2/10 — de sécheresse 40 %, maladie 10 %");
  });

  it("la trogne dit sa tête, son diamètre et son creux", () => {
    const l = fiche({ teteTrogneM: 2, recepages: 3 });
    expect(valeur(l, "Trogne")).toContain("tête à 2.0 m");
    expect(valeur(l, "Recépages")).toBe("3");
  });

  it("les dégâts du gibier se disent en durée, pas en numéro de semaine", () => {
    const l = fiche({ brouteSemaine: 52 * 30, frotteSemaine: 52 * 31 - 3 }, 52 * 31);
    expect(valeur(l, "Brouté")).toBe("il y a 1 an");
    expect(valeur(l, "Frotté")).toBe("il y a 3 semaines");
  });
});

describe("une chandelle", () => {
  it("n'a plus ni vigueur ni feuillage — elle a un âge de mort et une cause", () => {
    const l = fiche({ alive: false, mortSemaine: 52 * 29, causeMort: "secheresse" }, 52 * 31);
    const quoi = l.map((x) => x.quoi);
    expect(quoi).not.toContain("Vigueur");
    expect(quoi).not.toContain("Feuillage");
    expect(valeur(l, "Morte")).toBe("de sécheresse");
    expect(valeur(l, "Sur pied depuis")).toBe("il y a 2 ans");
  });
});

describe("une marque plus vieille que la partie", () => {
  it("ne se raconte pas comme une nouvelle", () => {
    // Le défaut mesuré dans le navigateur : sur une parcelle vieillie de
    // quarante ans, le compteur du joueur repart de zéro mais les arbres
    // gardent leurs marques d'avant. « Brouté il y a 0 semaine » sur un pin
    // que personne n'avait touché depuis dix ans.
    const l = fiche({ brouteSemaine: 1800 }, 12);
    expect(valeur(l, "Brouté")).toBe("avant votre arrivée");
    expect(depuis(12, 1800)).toBe("avant votre arrivée");
    expect(depuis(60, 8)).toBe("il y a 1 an");
  });
});

describe("les durées", () => {
  it("se disent en semaines sous l'année, en années au-delà", () => {
    expect(ilYA(0)).toBe("il y a 0 semaine");
    expect(ilYA(1)).toBe("il y a 1 semaine");
    expect(ilYA(30)).toBe("il y a 30 semaines");
    expect(ilYA(52)).toBe("il y a 1 an");
    expect(ilYA(129)).toBe("il y a 2 ans");
  });
});
