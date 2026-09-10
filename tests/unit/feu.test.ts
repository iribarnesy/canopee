/**
 * Le front d'incendie.
 *
 * **Ce que ces essais gardent : que le front COURT.** C'est la seule chose qui
 * distingue un incendie pédagogique d'une tache noire, et le §6.4 le dit —
 * « une ligne de flammes qui court de cellule en cellule dans l'ordre du rang
 * d'arrivée […] c'est la carte de combustibilité qui devient visible ».
 */

import { describe, expect, it } from "vitest";
import { propager, rangsDuFront } from "../../src/engine/feu";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  CENDRE,
  FLAMME,
  type FrontDIncendie,
  frontEnCours,
  OPACITE_DE_LA_CENDRE,
  OPACITE_DE_LA_FLAMME,
  porteeDuFront,
  RANGS_DU_FRONT,
} from "../../src/render/temps/feu";

const COTE = 40;

/**
 * Un front produit par le MOTEUR, pas par moi.
 *
 * **C'est la leçon du banc de bois mort** : un banc qui fabrique un état
 * inatteignable accuse le rendu. On fait donc propager un vrai feu sur une
 * charge de combustible uniforme, et on lui demande ses rangs par la fonction
 * du moteur — de sorte que ce qu'on teste est ce que le jeu produira.
 */
function frontDuMoteur(chargeParCellule: number): FrontDIncendie & { origine: number } {
  const n = COTE * COTE;
  const parCellule = new Array<number>(n).fill(chargeParCellule);
  const origine = Math.floor(COTE / 2) * COTE + Math.floor(COTE / 2);
  const { brulees } = propager(
    origine,
    { parCellule, moyenne: chargeParCellule },
    COTE,
    rngStateFromSeed(1234),
  );
  const rangs = rangsDuFront(brulees, origine, COTE);
  const liste = [...brulees].sort((a, b) => (rangs.get(a) ?? 0) - (rangs.get(b) ?? 0));
  return {
    origine,
    brulees: liste,
    rangs: liste.map((c) => rangs.get(c) ?? 0),
  };
}

/** La teinte d'une cellule dans une sortie de front, si elle y est. */
function teinteDe(cellules: ReturnType<typeof frontEnCours>, cellule: number) {
  return cellules.find((c) => c.cellule === cellule)?.teinte;
}

describe("frontEnCours", () => {
  const front = frontDuMoteur(2);

  it("ne dessine RIEN avant que le feu ne parte", () => {
    // Un feu qui noircirait d'avance raconterait le contraire de ce qui se
    // passe : la parcelle est intacte jusqu'au passage du front.
    expect(frontEnCours(front, 0)).toEqual([]);
  });

  it("part de l'ORIGINE et de nulle part ailleurs", () => {
    const debut = frontEnCours(front, 0.01);
    expect(debut.length).toBeGreaterThan(0);
    for (const c of debut) {
      // au tout début, seules les cellules de rang le plus bas sont touchées
      const i = (front.brulees as number[]).indexOf(c.cellule);
      expect(front.rangs[i] ?? 99).toBeLessThan(RANGS_DU_FRONT);
    }
    expect(debut.some((c) => c.cellule === front.origine)).toBe(true);
  });

  it("COURT : ce qui brûle à un instant n'est pas ce qui brûle à un autre", () => {
    const flamboie = (a: number) =>
      new Set(
        frontEnCours(front, a)
          .filter((c) => c.opacite >= OPACITE_DE_LA_FLAMME - 1e-9)
          .map((c) => c.cellule),
      );
    const tot = flamboie(0.2);
    const tard = flamboie(0.8);
    expect(tot.size).toBeGreaterThan(0);
    expect(tard.size).toBeGreaterThan(0);
    // Un front qui court : les deux ensembles sont largement disjoints.
    const communes = [...tot].filter((c) => tard.has(c));
    expect(communes.length).toBeLessThan(Math.min(tot.size, tard.size) * 0.35);
  });

  it("laisse de la CENDRE derrière lui, pas des flammes", () => {
    const milieu = frontEnCours(front, 0.5);
    const cendre = milieu.filter((c) => c.opacite < OPACITE_DE_LA_FLAMME - 1e-9);
    expect(cendre.length).toBeGreaterThan(0);
    // L'origine a brûlé la première : à mi-parcours elle est froide.
    expect(teinteDe(milieu, front.origine)).toEqual(CENDRE);
  });

  it("finit TOUT en cendre, et n'oublie aucune cellule brûlée", () => {
    const fin = frontEnCours(front, 1);
    expect(fin.length).toBe(front.brulees.length);
    for (const c of fin) {
      expect(c.teinte).toEqual(CENDRE);
      expect(c.opacite).toBeCloseTo(OPACITE_DE_LA_CENDRE, 6);
    }
  });

  it("borne l'avancement au lieu d'extrapoler", () => {
    expect(frontEnCours(front, 4)).toEqual(frontEnCours(front, 1));
    expect(frontEnCours(front, -1)).toEqual([]);
  });

  it("ne sort JAMAIS d'une cellule que le moteur n'a pas brûlée", () => {
    const permises = new Set(front.brulees as number[]);
    for (let a = 0; a <= 1; a += 0.05) {
      for (const c of frontEnCours(front, a)) expect(permises.has(c.cellule)).toBe(true);
    }
  });

  it("la flamme est CLAIRE et la cendre est SOMBRE", () => {
    // C'est le contraste qui rend le front lisible, et donc la carte de
    // combustibilité visible. S'il s'inversait, le feu se lirait comme une
    // ombre qui avance.
    const clarte = (t: { r: number; g: number; b: number }) => (t.r + t.g + t.b) / 3;
    expect(clarte(FLAMME)).toBeGreaterThan(clarte(CENDRE) * 4);
  });

  it("accepte un incendie vide sans se plaindre", () => {
    expect(frontEnCours({ brulees: [], rangs: [] }, 0.5)).toEqual([]);
    expect(porteeDuFront({ brulees: [], rangs: [] })).toBe(0);
  });
});

describe("porteeDuFront", () => {
  it("rend le rang le plus élevé, donc jusqu'où le feu est allé", () => {
    const petit = frontDuMoteur(0.35);
    const grand = frontDuMoteur(3);
    expect(porteeDuFront(grand)).toBeGreaterThan(porteeDuFront(petit));
  });

  it("croît avec la charge de combustible : c'est la carte qui décide", () => {
    // La propriété pédagogique du §6.4 — « le front s'essouffle dans le feuillu
    // frais, fonce dans la lande » — tient à ce que la portée SUIVE le
    // combustible. Ce n'est pas le rendu qui la produit, c'est le moteur ; mais
    // le rendu la perdrait s'il cessait de lire les rangs.
    const portees = [0.35, 1, 2, 4].map((c) => porteeDuFront(frontDuMoteur(c)));
    for (let i = 1; i < portees.length; i++) {
      expect(portees[i] ?? 0).toBeGreaterThanOrEqual(portees[i - 1] ?? 0);
    }
  });
});
