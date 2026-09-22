/**
 * LE BILAN DE PÉRIODE (`src/game/bilan.ts`, #128 / §6.8 №2).
 *
 * Ce que l'essai tient, et c'est tout ce qui compte pour ce module :
 *
 * 1. **il ADDITIONNE** — cinquante instantanés qui disent chacun deux morts
 *    font une ligne à cent, et c'est la raison d'être du bilan face au fil du
 *    journal, qui les dirait cinquante fois ;
 * 2. **il SITUE** — chaque ligne rend un centre de gravité, celui sur lequel la
 *    caméra ira se poser, et il est bien la moyenne des membres et non la
 *    position du premier arrivé ;
 * 3. **il ACCORDE** — « 1 aulne mort asphyxié par l'eau » et « 4 aulnes morts
 *    asphyxiés par l'eau », deux tables de cause différentes ;
 * 4. **il ne montre pas ce qu'il ne sait pas** — un identifiant d'arbre inconnu
 *    fait une ligne sans endroit, et pas une ligne au coin de la parcelle.
 */

import { describe, expect, it } from "vitest";
import type { GesteVisible } from "../../src/engine/actions";
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
} from "../../src/engine/tick";
import { agreger, BILAN_VIDE, lignesDuBilan, soustraire, surface } from "../../src/game/bilan";

const COTE_M = 100;

function mort(
  x: number,
  y: number,
  especeId = "alnus_glutinosa",
  cause = "engorgement",
): MortDeLaSemaine {
  return { id: Math.round(x * 1000 + y), x, y, especeId, cause: cause as never, heightM: 4 };
}

describe("agreger", () => {
  it("additionne les morts de même essence et même cause à travers les semaines", () => {
    let b = BILAN_VIDE;
    for (let semaine = 0; semaine < 50; semaine++) {
      b = agreger(b, { morts: [mort(10, 10), mort(30, 30)] }, semaine, COTE_M);
    }
    const lignes = lignesDuBilan(b);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.combien).toBe(100);
    expect(lignes[0]?.texte).toBe("100 aulnes glutineux morts asphyxiés par l'eau");
    expect(lignes[0]?.premiereSemaine).toBe(0);
    expect(lignes[0]?.derniereSemaine).toBe(49);
  });

  it("sépare les causes et les essences", () => {
    let b = BILAN_VIDE;
    b = agreger(b, { morts: [mort(1, 1, "alnus_glutinosa", "secheresse")] }, 0, COTE_M);
    b = agreger(b, { morts: [mort(2, 2, "alnus_glutinosa", "engorgement")] }, 0, COTE_M);
    b = agreger(b, { morts: [mort(3, 3, "fagus_sylvatica", "secheresse")] }, 0, COTE_M);
    expect(lignesDuBilan(b)).toHaveLength(3);
  });

  it("rend le centre de gravité, pas la première position", () => {
    let b = BILAN_VIDE;
    b = agreger(b, { morts: [mort(0, 0), mort(10, 20), mort(20, 40)] }, 0, COTE_M);
    const [ligne] = lignesDuBilan(b);
    expect(ligne?.ou).toEqual({ x: 10, y: 20 });
  });

  it("accorde le singulier et le pluriel sur deux tables de cause", () => {
    const une = lignesDuBilan(agreger(BILAN_VIDE, { morts: [mort(1, 1)] }, 0, COTE_M));
    expect(une[0]?.texte).toBe("1 aulne glutineux mort asphyxié par l'eau");
    const quatre = lignesDuBilan(
      agreger(BILAN_VIDE, { morts: [mort(1, 1), mort(2, 2), mort(3, 3), mort(4, 4)] }, 0, COTE_M),
    );
    expect(quatre[0]?.texte).toBe("4 aulnes glutineux morts asphyxiés par l'eau");
  });

  it("accorde en GENRE avec l'essence", () => {
    // Vu sur l'écran de fin d'un niveau : « 90 ronces morts étouffés par
    // l'ombre ». Trois essences du catalogue sont féminines.
    const une = agreger(
      BILAN_VIDE,
      { morts: [mort(1, 1, "rubus_fruticosus", "ombre")] },
      0,
      COTE_M,
    );
    expect(lignesDuBilan(une)[0]?.texte).toBe("1 ronce morte étouffée par l'ombre");
    const trois = agreger(
      BILAN_VIDE,
      {
        morts: [
          mort(1, 1, "rubus_fruticosus", "ombre"),
          mort(2, 2, "rubus_fruticosus", "ombre"),
          mort(3, 3, "rubus_fruticosus", "ombre"),
        ],
      },
      0,
      COTE_M,
    );
    expect(lignesDuBilan(trois)[0]?.texte).toBe("3 ronces mortes étouffées par l'ombre");
  });

  it("compte un geste sur arbres tige par tige, et un geste de zone en m²", () => {
    const gestes: GesteVisible[] = [
      { type: "elaguer", ids: [1, 2, 3] },
      { type: "chauler", cellules: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    ];
    const b = agreger(BILAN_VIDE, { gestes }, 0, COTE_M, (id) => ({ x: id, y: id }));
    const textes = lignesDuBilan(b).map((l) => l.texte);
    expect(textes).toContain("3 tiges élaguées");
    expect(textes).toContain("10 m² chaulés");
  });

  it("laisse une ligne SANS endroit quand aucun membre n'est situé", () => {
    const franchissements: FranchissementDeStade[] = [
      { id: 7, deStade: "semis", versStade: "gaulis" },
    ];
    // `positionDe` ne connaît pas l'arbre 7 : la ligne existe, sans endroit.
    const b = agreger(BILAN_VIDE, { franchissements }, 0, COTE_M);
    const [ligne] = lignesDuBilan(b);
    expect(ligne?.texte).toBe("1 tige passée au stade gaulis");
    expect(ligne?.ou).toBeUndefined();
  });

  it("met les catastrophes en tête, quel que soit le compte", () => {
    const gestes: GesteVisible[] = [
      { type: "brouter", ids: Array.from({ length: 2000 }, (_, i) => i) },
    ];
    let b = agreger(BILAN_VIDE, { gestes }, 0, COTE_M);
    b = agreger(
      b,
      {
        incendie: {
          cellulesBrulees: 40,
          arbresTues: 3,
          rejets: 0,
          victimes: [],
          carboneTHa: 0,
          origine: 0,
          brulees: Int32Array.from([0, 1, 2]),
          rangs: Int32Array.from([0, 1, 1]),
          charges: Float32Array.from([1, 1, 1]),
        } as never,
      },
      1,
      COTE_M,
    );
    const lignes = lignesDuBilan(b);
    expect(lignes[0]?.texte).toBe("40 m² brûlés");
    expect(lignes[1]?.combien).toBe(2000);
  });

  it("ne replie pas en place : le bilan d'avant reste ce qu'il était", () => {
    const avant = agreger(BILAN_VIDE, { morts: [mort(1, 1)] }, 0, COTE_M);
    const apres = agreger(avant, { morts: [mort(2, 2)] }, 1, COTE_M);
    expect(lignesDuBilan(avant)[0]?.combien).toBe(1);
    expect(lignesDuBilan(apres)[0]?.combien).toBe(2);
    expect(apres).not.toBe(avant);
  });

  it("compte les naissances et les chutes par essence", () => {
    const naissances: NaissanceDeLaSemaine[] = [
      { id: 1, x: 1, y: 1, especeId: "corylus_avellana", heightM: 0.1 },
      { id: 2, x: 3, y: 3, especeId: "corylus_avellana", heightM: 0.1 },
    ];
    const chutes: ChuteDeChandelle[] = [
      {
        id: 9,
        x: 5,
        y: 5,
        especeId: "fagus_sylvatica",
        heightM: 12,
        directionRad: 0,
        masseKgC: 40,
        empreinte: [],
      },
    ];
    const textes = lignesDuBilan(agreger(BILAN_VIDE, { naissances, chutes }, 0, COTE_M)).map(
      (l) => l.texte,
    );
    expect(textes).toContain("2 semis de noisetier");
    expect(textes).toContain("1 chandelle de hêtre tombée");
  });

  it("accorde le PARTICIPE et pas la fin de la phrase", () => {
    // Vu en jouant : « 27 279 tiges broutée par le gibiers ».
    const gestes: GesteVisible[] = [{ type: "brouter", ids: [1, 2, 3] }];
    const b = agreger(BILAN_VIDE, { gestes }, 0, COTE_M, (id) => ({ x: id, y: id }));
    expect(lignesDuBilan(b)[0]?.texte).toBe("3 tiges broutées par le gibier");
  });

  it("dit une grande surface en hectares, au singulier", () => {
    const gestes: GesteVisible[] = [
      { type: "labourer", cellules: Array.from({ length: 12000 }, (_, i) => i) },
    ];
    const b = agreger(BILAN_VIDE, { gestes }, 0, COTE_M);
    expect(lignesDuBilan(b)[0]?.texte).toBe("1,2 ha labouré");
  });
});

describe("soustraire", () => {
  it("rend ce qui s'est passé DEPUIS la référence", () => {
    const avant = agreger(BILAN_VIDE, { morts: [mort(1, 1), mort(2, 2)] }, 10, COTE_M);
    const apres = agreger(avant, { morts: [mort(3, 3), mort(4, 4), mort(5, 5)] }, 20, COTE_M);
    const [ligne] = lignesDuBilan(soustraire(apres, avant, 15));
    expect(ligne?.combien).toBe(3);
    expect(ligne?.texte).toBe("3 aulnes glutineux morts asphyxiés par l'eau");
  });

  it("rend le centre de gravité de la SEULE période", () => {
    const avant = agreger(BILAN_VIDE, { morts: [mort(0, 0)] }, 0, COTE_M);
    const apres = agreger(avant, { morts: [mort(50, 60), mort(70, 80)] }, 10, COTE_M);
    const [ligne] = lignesDuBilan(soustraire(apres, avant, 5));
    // Le mort à l'origine ne doit PAS tirer le centre vers le coin.
    expect(ligne?.ou).toEqual({ x: 60, y: 70 });
  });

  it("fait disparaître une ligne que la période n'a pas fait bouger", () => {
    const avant = agreger(BILAN_VIDE, { morts: [mort(1, 1)] }, 0, COTE_M);
    expect(lignesDuBilan(soustraire(avant, avant, 5))).toHaveLength(0);
  });

  it("garde une ligne née PENDANT la période, entière", () => {
    const avant = agreger(BILAN_VIDE, { morts: [mort(1, 1, "alnus_glutinosa")] }, 0, COTE_M);
    const apres = agreger(avant, { morts: [mort(2, 2, "fagus_sylvatica")] }, 10, COTE_M);
    const lignes = lignesDuBilan(soustraire(apres, avant, 5));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.texte).toContain("hêtre");
  });

  it("ne fait pas remonter une date avant le début de la période", () => {
    const avant = agreger(BILAN_VIDE, { morts: [mort(1, 1)] }, 0, COTE_M);
    const apres = agreger(avant, { morts: [mort(2, 2)] }, 300, COTE_M);
    const [ligne] = lignesDuBilan(soustraire(apres, avant, 260));
    // La ligne existe depuis l'an 1, mais la PÉRIODE commence à la semaine 260.
    expect(ligne?.premiereSemaine).toBe(260);
    expect(ligne?.derniereSemaine).toBe(300);
  });
});

describe("surface", () => {
  it("passe aux hectares quand les mètres carrés ne se lisent plus", () => {
    expect(surface(340)).toBe("340 m²");
    expect(surface(4999)).toBe("4999 m²");
    expect(surface(12000)).toBe("1,2 ha");
  });
});
