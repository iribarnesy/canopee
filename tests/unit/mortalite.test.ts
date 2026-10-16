/**
 * **Ce que dit une mortalité de masse** (`src/game/mortalite.ts`, #401).
 *
 * Le bandeau relevé par le joueur : « ⏸ 16 arbres meurent d'un coup, dont 0 de
 * plus d'un mètre ». L'essai borne les trois défauts qu'il avait : seize semis
 * arrêtaient le temps, la phrase ne disait pas de quoi ils mouraient, et elle
 * pouvait écrire « 0 ».
 */

import { describe, expect, it } from "vitest";
import type { CauseMort } from "../../src/engine/trees";
import {
  CAUSES_NOMMEES,
  ceQuiLesATues,
  direLaMortaliteDesArbres,
  direLaMortaliteDesSemis,
  estUnArbre,
  lireLaMortalite,
} from "../../src/game/mortalite";
import { TIGES_POUR_UNE_SCENE } from "../../src/game/scenes";
import { HAUTEUR_TROUVABLE_M } from "../../src/render/temps/changements";

/** `n` morts d'une cause, à une taille donnée. */
function morts(n: number, cause: CauseMort, heightM = 5) {
  return Array.from({ length: n }, (_, i) => ({ id: i, cause, heightM }));
}

/** Un peuplement vivant : `arbres` d'un mètre et plus, `semis` en dessous. */
function peuplement(arbres: number, semis: number, chandelles = 0) {
  return [
    ...Array.from({ length: arbres }, () => ({ alive: true, heightM: 8 })),
    ...Array.from({ length: semis }, () => ({ alive: true, heightM: 0.3 })),
    ...Array.from({ length: chandelles }, () => ({ alive: false, heightM: 12 })),
  ];
}

describe("deux tas, deux niveaux d'alerte", () => {
  it("coupe à la hauteur que l'écran sait montrer", () => {
    expect(estUnArbre(HAUTEUR_TROUVABLE_M)).toBe(true);
    expect(estUnArbre(HAUTEUR_TROUVABLE_M - 0.01)).toBe(false);
  });

  it("ne s'arrête pas pour seize semis — le cas relevé par le joueur", () => {
    const m = lireLaMortalite(morts(16, "secheresse", 0.2), peuplement(40, 200));
    expect(m.arbres).toHaveLength(0);
    expect(m.semis).toHaveLength(16);
    expect(m.scene).toBe(false);
  });

  it("une hécatombe de semis seule va au journal, sans arrêter le temps", () => {
    const m = lireLaMortalite(morts(140, "secheresse", 0.3), peuplement(30, 1000));
    expect(m.scene).toBe(false);
    expect(m.semisEnMasse).toBe(true);
  });

  it("le bruit de fond des semis n'écrit rien", () => {
    // Quinze brins sur deux mille : une semaine d'été ordinaire.
    const m = lireLaMortalite(morts(15, "ombre", 0.3), peuplement(30, 2000));
    expect(m.semisEnMasse).toBe(false);
  });

  it("juge les arbres contre les arbres, et pas contre deux mille ronces", () => {
    // Douze pommiers sur trente : le tiers du verger. Jugés contre toutes les
    // tiges, comme avant, ils passaient sous le seuil de part.
    const m = lireLaMortalite(morts(12, "secheresse", 4), peuplement(30, 2000));
    expect(m.arbres).toHaveLength(12);
    expect(m.scene).toBe(true);
  });

  it("ne compte pas les chandelles dans le peuplement d'avant", () => {
    // Dix morts sur deux cents vivants, c'est 5 % — le seuil. Les cent
    // chandelles debout ne sont pas un peuplement qui dilue la part.
    const m = lireLaMortalite(morts(TIGES_POUR_UNE_SCENE, "ombre", 3), peuplement(200, 0, 100));
    expect(m.scene).toBe(true);
  });
});

describe("de quoi ils meurent", () => {
  it("une seule cause se dit « tous », sans répéter le compte", () => {
    expect(ceQuiLesATues(morts(12, "secheresse"))).toBe(", tous de sécheresse");
    expect(ceQuiLesATues(morts(12, "ombre"))).toBe(", tous étouffés par l'ombre");
  });

  it("plusieurs causes, les plus fréquentes d'abord, accordées une à une", () => {
    const melange = [
      ...morts(3, "ombre"),
      ...morts(9, "secheresse"),
      ...morts(1, "abroutissement"),
    ];
    expect(ceQuiLesATues(melange)).toBe(
      " — 9 de sécheresse, 3 étouffés par l'ombre, 1 brouté par le gibier",
    );
  });

  it("à égalité, la cause rencontrée la première passe devant", () => {
    const egalite = [...morts(2, "vieillesse"), ...morts(2, "secheresse")];
    expect(ceQuiLesATues(egalite)).toBe(" — 2 de vieillesse, 2 de sécheresse");
  });

  it(`n'en nomme que ${CAUSES_NOMMEES}, et compte le reste ensemble`, () => {
    const cinq = [
      ...morts(5, "secheresse"),
      ...morts(4, "ombre"),
      ...morts(3, "maladie"),
      ...morts(2, "ravageurs"),
      ...morts(1, "vieillesse"),
    ];
    expect(ceQuiLesATues(cinq)).toBe(
      " — 5 de sécheresse, 4 étouffés par l'ombre, 3 emportés par la maladie, 3 d'autres causes",
    );
    const quatre = [...morts(5, "secheresse"), ...morts(4, "ombre"), ...morts(3, "maladie")];
    quatre.push(...morts(1, "vieillesse"));
    expect(ceQuiLesATues(quatre)).toMatch(/, 1 d'une autre cause$/);
  });

  it("l'accord suit le nombre là où le complément change", () => {
    expect(ceQuiLesATues(morts(4, "solHorsGamme"))).toBe(
      ", tous sur un sol hors de leur gamme de pH",
    );
  });

  it("ne dit rien quand il n'y a rien", () => {
    expect(ceQuiLesATues([])).toBe("");
  });
});

describe("le bandeau des arbres", () => {
  it("nomme les arbres, leurs causes, et les semis à part", () => {
    const arbres = [...morts(9, "secheresse"), ...morts(3, "ombre")];
    expect(direLaMortaliteDesArbres(arbres, 40)).toBe(
      "12 arbres meurent d'un coup — 9 de sécheresse, 3 étouffés par l'ombre ; et 40 semis",
    );
  });

  it("sans semis, il n'en parle pas — jamais de « 0 »", () => {
    const phrase = direLaMortaliteDesArbres(morts(12, "secheresse"), 0);
    expect(phrase).toBe("12 arbres meurent d'un coup, tous de sécheresse");
    expect(phrase).not.toMatch(/\b0\b/);
    expect(phrase).not.toContain("semis");
    expect(phrase).not.toContain("dont");
  });

  it("un semis se dit au singulier, et « semis » ne prend pas d's", () => {
    expect(direLaMortaliteDesArbres(morts(10, "chablis"), 1)).toBe(
      "10 arbres meurent d'un coup, tous couchés par la tempête ; et 1 semis",
    );
  });

  it("un seul arbre : le verbe et la cause au singulier", () => {
    expect(direLaMortaliteDesArbres(morts(1, "ombre"), 0)).toBe(
      "1 arbre meurt d'un coup, étouffé par l'ombre",
    );
  });
});

describe("la ligne du journal des semis", () => {
  it("dit combien, et de quoi", () => {
    const semis = [...morts(31, "secheresse", 0.2), ...morts(9, "ombre", 0.2)];
    expect(direLaMortaliteDesSemis(semis)).toBe(
      "40 semis meurent cette semaine — 31 de sécheresse, 9 étouffés par l'ombre",
    );
  });

  it("une seule cause : « tous »", () => {
    expect(direLaMortaliteDesSemis(morts(140, "abroutissement", 0.4))).toBe(
      "140 semis meurent cette semaine, tous broutés par le gibier",
    );
  });
});
