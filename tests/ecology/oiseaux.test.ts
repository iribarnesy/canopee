/**
 * **Les oiseaux qui fréquentent la parcelle sans y nicher** (`oiseaux.ts`, #296).
 *
 * Deux familles d'essais. Le **contrat** d'abord, celui que le rendu lit : une
 * entrée par guilde présente au calendrier, un nombre entier d'oiseaux, et des
 * arbres nommés qui existent et vivent. Puis des **faits** : une haie fruitière
 * attire plus qu'un verger nu en hiver, aucun hivernant ne vient en été, et pas
 * un passereau de haie sans fourré.
 *
 * Les parcelles sont posées à la main plutôt que poussées par le moteur : ce
 * qu'on éprouve ici est la lecture de la parcelle, pas la croissance des
 * arbustes, que `hauteurs-arbustes.test.ts` tient déjà. Le banc multi-graines
 * de la PR a vérifié le reste de la chaîne, tick compris.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import type { GridDims } from "../../src/engine/grid";
import {
  ARBRES_NOMMES_MAX,
  dansLaFenetre,
  type FrequentationDeGuilde,
  frequentationOiseaux,
  GUILDES_DE_PASSAGE,
  graineDePassage,
} from "../../src/engine/oiseaux";
import type { TreeState } from "../../src/engine/trees";

const DIMS: GridDims = { widthM: 80, heightM: 80 };
const GRAINE = 12345;
const HIVERNANTS = "hivernants_frugivores";
const HAIE = "passereaux_de_haie";

/** Un arbuste ou un arbre, adulte, branchu jusqu'en bas sauf mention contraire. */
function tige(
  id: number,
  especeId: string,
  x: number,
  y: number,
  heightM: number,
  options: { baseHouppierM?: number; alive?: boolean; ageAns?: number } = {},
): TreeState {
  return {
    id,
    especeId,
    x,
    y,
    alive: options.alive ?? true,
    heightM,
    diametreCm: heightM * 2,
    ageWeeks: (options.ageAns ?? 30) * 52,
    baseHouppierM: options.baseHouppierM,
    recepages: 0,
  } as unknown as TreeState;
}

/** Une haie fruitière de 80 m, une tige par mètre, en âge de fructifier. */
function haieFruitiere(): TreeState[] {
  const essences = ["crataegus_monogyna", "prunus_spinosa", "ilex_aquifolium", "ligustrum_vulgare"];
  return Array.from({ length: 80 }, (_, i) =>
    tige(i + 1, essences[i % essences.length] as string, i + 0.5, 40, 3),
  );
}

/**
 * Un verger nu : cent pommiers de six mètres, **conduits en haute tige** (le
 * tronc nu jusqu'à 1,8 m), sur l'herbe et sans haie.
 */
function vergerNu(): TreeState[] {
  const arbres: TreeState[] = [];
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      arbres.push(
        tige(arbres.length + 1, "malus_domestica", 4 + i * 8, 4 + j * 8, 6, { baseHouppierM: 1.8 }),
      );
    }
  }
  return arbres;
}

function entree(f: readonly FrequentationDeGuilde[], guildeId: string) {
  return f.find((e) => e.guildeId === guildeId);
}

/** Oiseaux d'une guilde cumulés sur une plage de semaines de l'année (absolues ici). */
function cumul(trees: readonly TreeState[], guildeId: string, semaines: readonly number[]): number {
  let n = 0;
  for (const s of semaines)
    n += entree(frequentationOiseaux(trees, s, DIMS, GRAINE), guildeId)?.oiseaux ?? 0;
  return n;
}

const HIVER = [44, 45, 46, 47, 52 + 0, 52 + 1, 52 + 2, 52 + 3];

describe("le contrat que lit le rendu", () => {
  it("une entrée par guilde présente au calendrier, et seulement celles-là", () => {
    const trees = haieFruitiere();
    for (let semaine = 0; semaine < 52; semaine++) {
      const f = frequentationOiseaux(trees, semaine, DIMS, GRAINE);
      const attendues = GUILDES_DE_PASSAGE.filter((g) =>
        g.presences.some((p) => dansLaFenetre(semaine, p.debutSemaine, p.finSemaine)),
      ).map((g) => g.id);
      expect(
        f.map((e) => e.guildeId),
        `semaine ${semaine}`,
      ).toEqual(attendues);
    }
  });

  it("des oiseaux entiers, et des arbres nommés qui existent et vivent", () => {
    // Un arbuste mort au milieu de la haie : il ne doit être ni compté ni nommé.
    const trees = haieFruitiere().map((t) => (t.id === 9 ? { ...t, alive: false } : t));
    const vivants = new Set(trees.filter((t) => t.alive).map((t) => t.id));
    let nommes = 0;
    for (let semaine = 0; semaine < 52; semaine++) {
      for (const e of frequentationOiseaux(trees, semaine, DIMS, GRAINE)) {
        expect(Number.isInteger(e.oiseaux)).toBe(true);
        expect(e.oiseaux).toBeGreaterThanOrEqual(0);
        expect(e.arbres.length).toBeLessThanOrEqual(ARBRES_NOMMES_MAX);
        for (const id of e.arbres) expect(vivants.has(id), `arbre ${id}`).toBe(true);
        // Pas d'oiseau, pas d'arbre : le rendu ne pose rien.
        if (e.oiseaux === 0) expect(e.arbres).toEqual([]);
        nommes += e.arbres.length;
      }
    }
    expect(nommes).toBeGreaterThan(0);
  });

  it("une baie nommée est une baie de saison : en novembre, ni sureau ni cornouiller", () => {
    const trees = [
      tige(1, "sambucus_nigra", 10, 10, 4),
      tige(2, "cornus_mas", 30, 10, 4),
      tige(3, "crataegus_monogyna", 50, 10, 4),
    ];
    const novembre = entree(frequentationOiseaux(trees, 46, DIMS, GRAINE), HIVERNANTS);
    expect(novembre?.surfaceM2).toBeGreaterThan(0);
    // Le seul arbre qui porte des baies en novembre est l'aubépine.
    for (const id of novembre?.arbres ?? []) expect(id).toBe(3);
  });

  it("une couronne se compte par la surface qu'elle couvre, pas deux fois", () => {
    const seul = [tige(1, "crataegus_monogyna", 40, 40, 4)];
    const empiles = [1, 2, 3, 4].map((id) => tige(id, "crataegus_monogyna", 40, 40, 4));
    const a = entree(frequentationOiseaux(seul, 46, DIMS, GRAINE), HIVERNANTS);
    const b = entree(frequentationOiseaux(empiles, 46, DIMS, GRAINE), HIVERNANTS);
    expect(b?.surfaceM2).toBe(a?.surfaceM2);
  });

  it("l'arrondi rend l'espérance en moyenne, et deux parties n'arrondissent pas pareil", () => {
    // Une petite haie qui attend une fraction d'oiseau par semaine : tout se
    // joue dans l'arrondi, c'est donc là qu'il faut regarder.
    const trees = [tige(1, "crataegus_monogyna", 40, 40, 2.5)];
    let attendus = 0;
    let tires = 0;
    const suites: number[][] = [[], []];
    for (let annee = 0; annee < 40; annee++) {
      for (const [k, graine] of [1, 2].entries()) {
        const f = frequentationOiseaux(trees, annee * 52 + 46, DIMS, graine);
        const e = entree(f, HIVERNANTS);
        if (!e) throw new Error("les grives sont de saison en novembre");
        expect(e.attendus).toBeGreaterThan(0);
        expect(e.attendus).toBeLessThan(1);
        attendus += e.attendus;
        tires += e.oiseaux;
        suites[k]?.push(e.oiseaux);
      }
    }
    expect(tires / attendus).toBeGreaterThan(0.7);
    expect(tires / attendus).toBeLessThan(1.3);
    expect(suites[0]).not.toEqual(suites[1]);
    // Et la graine change vraiment d'une partie à l'autre, pas de quelques unités.
    expect(
      Math.abs(graineDePassage(HIVERNANTS, 46, 1) - graineDePassage(HIVERNANTS, 46, 2)),
    ).toBeGreaterThan(1_000_000);
  });
});

describe("ce que la parcelle offre décide de qui vient", () => {
  it("une haie fruitière attire plus d'hivernants qu'un verger nu", () => {
    const haie = cumul(haieFruitiere(), HIVERNANTS, HIVER);
    const verger = cumul(vergerNu(), HIVERNANTS, HIVER);
    // Le pommier ne déclare pas de baies d'oiseau : sa pomme tombe.
    expect(verger).toBe(0);
    expect(haie).toBeGreaterThan(0);
  });

  it("aucun hivernant en été, quelle que soit la haie", () => {
    const trees = haieFruitiere();
    for (let semaine = 12; semaine <= 41; semaine++) {
      const e = entree(frequentationOiseaux(trees, semaine, DIMS, GRAINE), HIVERNANTS);
      expect(e, `semaine ${semaine}`).toBeUndefined();
    }
  });

  it("aucun passereau de haie sans fourré", () => {
    // Une parcelle nue, puis une futaie dont l'ombre a élagué les fûts : des
    // arbres partout, et pas une branche sous trois mètres.
    const nue: TreeState[] = [];
    const futaie = Array.from({ length: 50 }, (_, i) =>
      tige(i + 1, "fagus_sylvatica", 4 + (i % 10) * 8, 4 + Math.floor(i / 10) * 16, 20, {
        baseHouppierM: 8,
      }),
    );
    // Et des semis trop bas pour qu'un merle y pose son nid.
    const semis = Array.from({ length: 50 }, (_, i) =>
      tige(i + 1, "crataegus_monogyna", 4 + (i % 10) * 8, 4 + Math.floor(i / 10) * 16, 0.6, {
        ageAns: 2,
      }),
    );
    for (const trees of [nue, futaie, semis]) {
      for (let semaine = 0; semaine < 52; semaine++) {
        const e = entree(frequentationOiseaux(trees, semaine, DIMS, GRAINE), HAIE);
        expect(e?.oiseaux, `semaine ${semaine}`).toBe(0);
        expect(e?.surfaceM2).toBe(0);
      }
    }
  });

  it("et le verger haute tige n'en a pas non plus : son tronc est nu jusqu'à 1,8 m", () => {
    expect(
      cumul(
        vergerNu(),
        HAIE,
        Array.from({ length: 52 }, (_, s) => s),
      ),
    ).toBe(0);
  });

  it("une haie attire des passereaux toute l'année, dans l'ordre de grandeur de Newton", () => {
    // 80 m de haie : 5 à 14 couples par kilomètre (Newton 2017), donc 0,8 à
    // 2,2 oiseaux. La haie posée ici est plus large que deux mètres ; on
    // accepte un facteur trois de part et d'autre.
    const trees = haieFruitiere();
    for (const semaine of [5, 20, 30, 45]) {
      const e = entree(frequentationOiseaux(trees, semaine, DIMS, GRAINE), HAIE);
      expect(e?.attendus).toBeGreaterThan(0.8 / 3);
      expect(e?.attendus).toBeLessThan(2.2 * 3);
    }
  });
});

describe("la lisière, pas la masse", () => {
  /** Un massif carré d'aubépines, une tige par mètre, du côté donné. */
  function massif(cote: number): TreeState[] {
    const arbres: TreeState[] = [];
    const x0 = 40 - cote / 2;
    for (let i = 0; i < cote; i++) {
      for (let j = 0; j < cote; j++) {
        arbres.push(tige(arbres.length + 1, "crataegus_monogyna", x0 + i + 0.5, x0 + j + 0.5, 3));
      }
    }
    return arbres;
  }

  it("un massif fermé ne compte que son pourtour : la surface décuple, les oiseaux non", () => {
    const petit = entree(frequentationOiseaux(massif(10), 20, DIMS, GRAINE), HAIE);
    const grand = entree(frequentationOiseaux(massif(40), 20, DIMS, GRAINE), HAIE);
    if (!petit || !grand) throw new Error("les passereaux de haie sont là toute l'année");
    // Seize fois la surface, quatre fois le pourtour.
    expect(grand.surfaceM2 / petit.surfaceM2).toBeGreaterThan(10);
    expect(grand.lisiereM / petit.lisiereM).toBeLessThan(5);
    expect(grand.attendus / petit.attendus).toBeLessThan(5);
  });

  it("une haie de 80 m vaut ses deux bords, et l'oiseau est nommé au bord", () => {
    const e = entree(frequentationOiseaux(haieFruitiere(), 20, DIMS, GRAINE), HAIE);
    if (!e) throw new Error("les passereaux de haie sont là toute l'année");
    // Deux côtés de 80 m, plus les bouts.
    expect(e.lisiereM).toBeGreaterThanOrEqual(160);
    expect(e.lisiereM).toBeLessThan(260);
    const grand = massif(40);
    const nommes = entree(frequentationOiseaux(grand, 20, DIMS, GRAINE), HAIE)?.arbres ?? [];
    expect(nommes.length).toBeGreaterThan(0);
    // Pas un arbre du cœur : tous à moins de trois mètres du bord du massif.
    for (const id of nommes) {
      const t = grand.find((a) => a.id === id) as TreeState;
      const auBord = Math.min(t.x - 20, 60 - t.x, t.y - 20, 60 - t.y);
      expect(auBord, `arbre ${id}`).toBeLessThan(3);
    }
  });
});

describe("aucune essence n'est un cas particulier", () => {
  it("le module ne nomme aucune essence : il lit le bloc `baies` des fiches", () => {
    const source = readFileSync(new URL("../../src/engine/oiseaux.ts", import.meta.url), "utf8");
    for (const e of ESPECES_V0) expect(source.includes(e.id), e.id).toBe(false);
  });

  it("une baie d'oiseau est une graine que l'oiseau emporte, et inversement", () => {
    for (const e of ESPECES_V0) {
      const parOiseaux = getEspece(e.id).regeneration.dissemination === "oiseaux";
      expect(e.baies !== undefined, e.id).toBe(parOiseaux);
      if (e.baies) {
        for (const s of [e.baies.debutSemaine, e.baies.finSemaine]) {
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(52);
        }
      }
    }
  });
});
