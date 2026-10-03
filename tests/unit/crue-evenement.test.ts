/**
 * **Le contrat de l'événement de crue** (crue.ts, #288).
 *
 * Le rendu joue la crue comme il joue l'incendie : il lit l'événement tel
 * quel et ne reconstruit rien. Ce fichier tient ce qu'il a le droit d'en
 * attendre, sur des semaines fabriquées à la main — les faits (une crue en
 * fond de vallée, aucune sur un plateau) sont dans eau-surface.test.ts.
 *
 *  - une crue s'ouvre, dure, se ferme ; toutes ses semaines portent le même
 *    identifiant, et deux crues n'en partagent jamais un ;
 *  - ses phases se suivent dans un ordre lisible : montée, pic, retrait, et
 *    une seconde vague repart en montée ;
 *  - ses cellules sont rangées par semaine d'arrivée croissante, puis du plus
 *    bas au plus haut ;
 *  - ses lames ne sont jamais négatives, et ne comptent pas l'eau de passage ;
 *  - ses victimes sont les morts d'engorgement de la semaine **sur l'emprise**,
 *    et seulement elles.
 */

import { describe, expect, it } from "vitest";
import {
  type CrueResult,
  type MemoireDeCrue,
  NAPPE_AFFLEURANTE_CM,
  SEUIL_DEBUT_CRUE,
  SEUIL_FIN_CRUE,
  type SemaineDeCrue,
  suivreLaCrue,
} from "../../src/engine/crue";

const N = 100;
/** Rang d'altitude : la cellule 0 est la plus basse, la 99 la plus haute. */
const RANGS = Array.from({ length: N }, (_, i) => i);

/** Une semaine où les cellules `0 … inondees-1` (les plus basses) ont la nappe à la surface. */
function semaine(n: number, inondees: number, extra: Partial<SemaineDeCrue> = {}): SemaineDeCrue {
  return {
    semaine: n,
    nCells: N,
    nappeCm: Array.from({ length: N }, (_, i) => (i < inondees ? 0 : 80)),
    rangDAltitude: RANGS,
    crueCm: 0,
    nappeReposCm: new Array(N).fill(Number.POSITIVE_INFINITY),
    refusPropreMm: new Array(N).fill(0),
    morts: [],
    ...extra,
  };
}

/** Rejoue une suite d'emprises et rend les événements de chaque semaine. */
function derouler(emprises: number[]): (CrueResult | undefined)[] {
  let memoire: MemoireDeCrue | undefined;
  return emprises.map((e, k) => {
    const r = suivreLaCrue(memoire, semaine(100 + k, e));
    memoire = r.memoire;
    return r.crue;
  });
}

describe("une crue s'ouvre, dure et se ferme", () => {
  it("rien sous le seuil de début, quelque chose dès qu'il est atteint", () => {
    const sous = Math.ceil(SEUIL_DEBUT_CRUE * N) - 1;
    expect(suivreLaCrue(undefined, semaine(0, sous))).toEqual({});
    const r = suivreLaCrue(undefined, semaine(0, sous + 1));
    expect(r.crue?.phase).toBe("montée");
    expect(r.crue?.semaine).toBe(0);
    expect(r.memoire?.id).toBe(r.crue?.id);
  });

  it("une fois ouverte, elle tient jusque sous le seuil de fin, puis s'efface de l'état", () => {
    const fin = Math.ceil(SEUIL_FIN_CRUE * N);
    // 3 % : sous le seuil de début, au-dessus du seuil de fin — elle continue.
    const suite = derouler([8, 12, fin + 1, fin - 1, fin + 1]);
    expect(suite[2]).toBeDefined();
    expect(suite[3]).toBeUndefined();
    // Repartir à 3 % ne la rouvre pas : il faut repasser le seuil de début.
    expect(suite[4]).toBeUndefined();
    let memoire: MemoireDeCrue | undefined;
    for (const e of [8, fin - 1]) memoire = suivreLaCrue(memoire, semaine(0, e)).memoire;
    expect(memoire).toBeUndefined();
  });

  it("toutes ses semaines portent le même identifiant, numérotées sans trou", () => {
    const suite = derouler([6, 9, 12, 10, 7, 4, 0, 0, 7, 9, 3, 0]);
    const premiere = suite.slice(0, 6);
    const ids = new Set(premiere.map((c) => c?.id));
    expect(ids.size).toBe(1);
    expect(premiere.map((c) => c?.semaine)).toEqual([0, 1, 2, 3, 4, 5]);
    // La semaine de jeu se lit sur l'identifiant : id + semaine.
    for (const [k, c] of premiere.entries()) expect((c?.id ?? 0) + (c?.semaine ?? 0)).toBe(100 + k);
    // La seconde crue a son propre identifiant.
    expect(suite[8]?.id).not.toBe(suite[0]?.id);
    expect(suite[8]?.semaine).toBe(0);
  });
});

describe("ses phases", () => {
  it("montée, pic, retrait — et une seconde vague repart en montée sans rouvrir l'événement", () => {
    const suite = derouler([6, 9, 12, 12, 10, 7, 11, 9, 1]);
    expect(suite.map((c) => c?.phase)).toEqual([
      "montée",
      "montée",
      "montée",
      "pic",
      "retrait",
      "retrait",
      "montée",
      "pic",
      undefined,
    ]);
    expect(new Set(suite.slice(0, 8).map((c) => c?.id)).size).toBe(1);
  });

  it("le pic n'arrive qu'après une montée, le retrait qu'après un pic ou un retrait", () => {
    // Une suite d'emprises quelconque, mais déterministe.
    const emprises = Array.from({ length: 80 }, (_, k) => Math.round(10 + 9 * Math.sin(k * 0.7)));
    const suite = derouler(emprises);
    for (let k = 1; k < suite.length; k++) {
      const c = suite[k];
      const avant = suite[k - 1];
      if (!c || !avant || c.id !== avant.id) continue;
      if (c.phase === "pic") expect(avant.phase).toBe("montée");
      if (c.phase === "retrait") expect(["pic", "retrait"]).toContain(avant.phase);
    }
  });

  it("l'emprise au pic ne redescend jamais au cours d'un événement", () => {
    const suite = derouler([6, 9, 12, 10, 7, 11, 4]);
    expect(suite.map((c) => c?.emprisePic)).toEqual([6, 9, 12, 12, 12, 12, 12]);
  });
});

describe("ses cellules, rangées par arrivée de l'eau", () => {
  it("par semaine d'arrivée croissante, puis du plus bas au plus haut", () => {
    const suite = derouler([6, 9, 12]);
    const derniere = suite[2];
    if (!derniere) throw new Error("la crue devrait durer");
    // Les six premières cellules sont arrivées en semaine 0, puis trois en 1,
    // puis trois en 2 — chacune gardant son rang tant qu'elle reste inondée.
    expect(Array.from(derniere.rangs)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(Array.from(derniere.cellules)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const c of suite) {
      if (!c) continue;
      for (let k = 1; k < c.rangs.length; k++) {
        expect(c.rangs[k] ?? 0).toBeGreaterThanOrEqual(c.rangs[k - 1] ?? 0);
      }
    }
  });

  it("une cellule asséchée puis reprise compte comme une arrivée neuve", () => {
    // La cellule 5 sèche en semaine 1, revient en semaine 2.
    let memoire: MemoireDeCrue | undefined;
    memoire = suivreLaCrue(memoire, semaine(0, 6)).memoire;
    const sansLa5 = semaine(1, 6, {
      nappeCm: Array.from({ length: N }, (_, i) => (i < 6 && i !== 5 ? 0 : 80)),
    });
    memoire = suivreLaCrue(memoire, sansLa5).memoire;
    const r = suivreLaCrue(memoire, semaine(2, 6)).crue;
    if (!r) throw new Error("la crue devrait durer");
    const k = Array.from(r.cellules).indexOf(5);
    expect(r.rangs[k]).toBe(2);
  });

  it("l'eau libre elle-même n'est pas dans l'emprise : un ruisseau dans son lit n'est pas une crue", () => {
    const enEau = Array.from({ length: N }, (_, i) => i < 10);
    const r = suivreLaCrue(undefined, semaine(0, 10, { enEau }));
    expect(r.crue).toBeUndefined();
  });

  it("la nappe compte inondée jusqu'à cinq centimètres sous la surface, pas au-delà", () => {
    const nappeCm = new Array(N).fill(80);
    for (let i = 0; i < 6; i++) nappeCm[i] = NAPPE_AFFLEURANTE_CM;
    expect(suivreLaCrue(undefined, semaine(0, 0, { nappeCm })).crue?.cellules.length).toBe(6);
    for (let i = 0; i < 6; i++) nappeCm[i] = NAPPE_AFFLEURANTE_CM + 0.1;
    expect(suivreLaCrue(undefined, semaine(0, 0, { nappeCm })).crue).toBeUndefined();
  });
});

describe("ses lames", () => {
  it("jamais négatives, et nulles sur un sol détrempé qu'aucune eau n'a couvert", () => {
    const refusPropreMm = new Array(N).fill(0);
    refusPropreMm[0] = 12;
    refusPropreMm[1] = -3; // un arrondi de soustraction ne doit pas passer
    const r = suivreLaCrue(undefined, semaine(0, 6, { refusPropreMm })).crue;
    if (!r) throw new Error("la crue devrait s'ouvrir");
    expect(r.lamesMm[0]).toBeCloseTo(12);
    expect(r.lamesMm[1]).toBe(0);
    for (const l of r.lamesMm) expect(l).toBeGreaterThanOrEqual(0);
  });

  it("un plan d'eau qui monte au-dessus d'une cellule y pose sa hauteur", () => {
    // Le ruisseau monte de 30 cm ; la cellule 0 a sa nappe de repos à 10 cm.
    const nappeReposCm = new Array(N).fill(Number.POSITIVE_INFINITY);
    nappeReposCm[0] = 10;
    const r = suivreLaCrue(undefined, semaine(0, 6, { crueCm: 30, nappeReposCm })).crue;
    if (!r) throw new Error("la crue devrait s'ouvrir");
    expect(r.lamesMm[0]).toBeCloseTo(200);
    expect(r.monteeM).toBeCloseTo(0.3);
  });

  it("sans eau libre, la montée vaut zéro : la nappe monte sous terre", () => {
    expect(suivreLaCrue(undefined, semaine(0, 8)).crue?.monteeM).toBe(0);
  });
});

describe("ses victimes", () => {
  it("les morts d'engorgement sur l'emprise, et seulement elles", () => {
    const morts = [
      { id: 1, cause: "engorgement" as const, heightM: 4, cellule: 2 },
      { id: 2, cause: "engorgement" as const, heightM: 3, cellule: 50 }, // hors emprise
      { id: 3, cause: "secheresse" as const, heightM: 5, cellule: 3 }, // autre cause
    ];
    const r = suivreLaCrue(undefined, semaine(0, 6, { morts })).crue;
    expect(r?.victimes).toEqual([{ id: 1, hauteurM: 4 }]);
  });
});
