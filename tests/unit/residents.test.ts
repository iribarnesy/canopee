/**
 * **Les habitants qu'on voit sont ceux du moteur, et ils restent chez eux**
 * (#129).
 *
 * Ce qu'on défend :
 *
 * - **qui** : chaque entrée de `Snapshot.faune` et rien d'autre — un couple fait
 *   deux oiseaux, une colonie de chauves-souris ne se pose pas ;
 * - **où** : autour de l'arbre que le moteur a donné, jamais au loin ;
 * - **comment** : sans jamais sauter d'un point à un autre entre deux images ;
 * - **le dérangement** : un chantier proche fait fuir, un chantier lointain non,
 *   et tout le monde revient.
 */

import { describe, expect, it } from "vitest";
import type { IndividuFaune } from "../../src/engine/faune";
import {
  CERCLE_BUSE_M,
  corpsDe,
  derangementsDuJournal,
  FUITE_MS,
  type MondeDesHabitants,
  type Perchoir,
  type PoseDHabitant,
  RAYON_GRIMPE_M,
  RAYON_SAUTILLE_M,
  Residents,
} from "../../src/render/faune/residents";

/** Un bosquet régulier : un arbre tous les 6 m sur 60 m. */
function bosquet(): Perchoir[] {
  const arbres: Perchoir[] = [];
  let id = 1;
  for (let x = 3; x < 60; x += 6) {
    for (let y = 3; y < 60; y += 6) {
      arbres.push({ id: id++, x, y, heightM: 14, houppierRatio: 0.25, baseHouppierM: 5 });
    }
  }
  return arbres;
}

const ARBRES = bosquet();
const CENTRE = ARBRES.find((a) => a.x === 27 && a.y === 27) as Perchoir;

function habitant(id: number, especeId: string, arbre = CENTRE): IndividuFaune {
  return { id, especeId, arbreId: arbre.id, x: arbre.x, y: arbre.y, depuisSemaine: 0 };
}

/** Joue le monde de 0 à `dureeMs`, une image toutes les `pasMs`. */
function jouer(monde: MondeDesHabitants, dureeMs: number, pasMs = 50) {
  const r = new Residents();
  const images: { t: number; poses: PoseDHabitant[] }[] = [];
  for (let t = 0; t <= dureeMs; t += pasMs) images.push({ t, poses: r.poses(monde, t) });
  return images;
}

describe("qui se pose", () => {
  it("un couple fait deux oiseaux, un individu une bête", () => {
    expect(corpsDe("couple")).toBe(2);
    expect(corpsDe("individu")).toBe(1);
    const images = jouer(
      { habitants: [habitant(1, "mesange_bleue")], arbres: ARBRES },
      60_000,
      250,
    );
    const cles = new Set(images.flatMap((i) => i.poses.map((p) => p.cle)));
    expect(cles).toEqual(new Set(["1:0", "1:1"]));
  });

  it("ni les chauves-souris, ni les larves, ni le loir : le rendu n'a pas de nuit", () => {
    for (const especeId of [
      "murin_de_bechstein",
      "noctule_commune",
      "grand_capricorne",
      "loir_gris",
    ]) {
      const images = jouer({ habitants: [habitant(1, especeId)], arbres: ARBRES }, 20_000, 500);
      expect(
        images.every((i) => i.poses.length === 0),
        especeId,
      ).toBe(true);
    }
  });

  it("un habitant dont l'arbre a quitté l'instantané ne se pose pas", () => {
    const orphelin: IndividuFaune = { ...habitant(1, "mesange_bleue"), arbreId: 9999 };
    const images = jouer({ habitants: [orphelin], arbres: ARBRES }, 10_000, 500);
    expect(images.every((i) => i.poses.length === 0)).toBe(true);
  });

  it("un habitant parti du moteur disparaît de la scène", () => {
    const r = new Residents();
    const avec = { habitants: [habitant(1, "pic_epeiche")], arbres: ARBRES };
    for (let t = 0; t < 10_000; t += 100) r.poses(avec, t);
    expect(r.poses({ habitants: [], arbres: ARBRES }, 10_100)).toEqual([]);
  });
});

describe("chez eux", () => {
  const cas: [string, number][] = [
    ["mesange_bleue", RAYON_SAUTILLE_M + 4],
    ["mesange_charbonniere", RAYON_SAUTILLE_M + 4],
    ["pic_epeiche", RAYON_GRIMPE_M + 1],
    ["chouette_cheveche", 10],
    ["ecureuil_roux", 16],
    ["buse_variable", CERCLE_BUSE_M * 1.25],
  ];
  for (const [especeId, rayon] of cas) {
    it(`${especeId} reste autour de son arbre`, () => {
      const images = jouer({ habitants: [habitant(3, especeId)], arbres: ARBRES }, 300_000, 200);
      let vus = 0;
      for (const { poses } of images) {
        for (const p of poses) {
          vus++;
          expect(Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y)).toBeLessThanOrEqual(rayon);
        }
      }
      expect(vus).toBeGreaterThan(0);
    });
  }

  it("la mésange rentre dans sa loge : on cesse de la voir un moment", () => {
    const images = jouer(
      { habitants: [habitant(1, "mesange_bleue")], arbres: ARBRES },
      180_000,
      200,
    );
    const absente = images.filter((i) => !i.poses.some((p) => p.cle === "1:0")).length;
    expect(absente).toBeGreaterThan(0);
    expect(absente).toBeLessThan(images.length / 2);
  });

  it("le pic va chercher les chandelles quand il y en a", () => {
    const arbres = ARBRES.map((a) =>
      a.x === 33 && (a.y === 27 || a.y === 21) ? { ...a, chandelle: true } : a,
    );
    const chandelles = new Set(arbres.filter((a) => a.chandelle).map((a) => a.id));
    const images = jouer({ habitants: [habitant(2, "pic_epeiche")], arbres }, 600_000, 500);
    const surChandelle = images.filter((i) =>
      i.poses.some((p) => p.surArbre !== undefined && chandelles.has(p.surArbre)),
    ).length;
    expect(surChandelle).toBeGreaterThan(0);
  });

  it("la buse tourne haut, au-dessus de tout ce qui pousse", () => {
    const images = jouer(
      { habitants: [habitant(4, "buse_variable")], arbres: ARBRES },
      400_000,
      500,
    );
    const enCiel = images.filter((i) => i.poses.some((p) => p.enCiel)).length;
    expect(enCiel).toBeGreaterThan(images.length / 4);
  });
});

describe("sans sauter", () => {
  for (const especeId of [
    "mesange_bleue",
    "pic_epeiche",
    "chouette_cheveche",
    "ecureuil_roux",
    "buse_variable",
  ]) {
    it(`${especeId} ne se téléporte jamais d'une image à l'autre`, () => {
      const images = jouer({ habitants: [habitant(5, especeId)], arbres: ARBRES }, 400_000, 50);
      const avant = new Map<string, PoseDHabitant>();
      for (const { t, poses } of images) {
        for (const p of poses) {
          const q = avant.get(p.cle);
          if (q) {
            const saut = Math.hypot(p.x - q.x, p.y - q.y, p.hauteurM - q.hauteurM);
            expect(saut, `${p.cle} à ${t} ms`).toBeLessThan(1);
          }
          avant.set(p.cle, p);
        }
        // Une bête cachée qui réapparaît repart d'où elle a disparu : on ne
        // compare qu'entre images consécutives.
        for (const cle of [...avant.keys()])
          if (!poses.some((p) => p.cle === cle)) avant.delete(cle);
      }
    });
  }
});

describe("le dérangement", () => {
  it("un chantier proche fait fuir, et la bête revient", () => {
    const derangement = { x: CENTRE.x + 5, y: CENTRE.y, depuisMs: 30_000 };
    const monde = {
      habitants: [habitant(1, "mesange_bleue")],
      arbres: ARBRES,
      derangements: [derangement],
    };
    const images = jouer(monde, 30_000 + FUITE_MS + 60_000, 250);
    const pendant = images.filter((i) => i.t > 36_000 && i.t < 30_000 + FUITE_MS);
    expect(pendant.every((i) => i.poses.length === 0)).toBe(true);
    const apres = images.filter((i) => i.t > 30_000 + FUITE_MS + 20_000);
    expect(apres.some((i) => i.poses.length > 0)).toBe(true);
  });

  it("un chantier lointain ne dérange personne", () => {
    const monde = {
      habitants: [habitant(1, "mesange_bleue")],
      arbres: ARBRES,
      derangements: [{ x: CENTRE.x + 200, y: CENTRE.y, depuisMs: 30_000 }],
    };
    const images = jouer(monde, 30_000 + FUITE_MS, 250);
    const pendant = images.filter((i) => i.t > 36_000);
    expect(pendant.some((i) => i.poses.length > 0)).toBe(true);
  });

  it("l'écureuil file à sa hutte au lieu de s'envoler", () => {
    const monde = {
      habitants: [habitant(1, "ecureuil_roux")],
      arbres: ARBRES,
      derangements: [{ x: CENTRE.x, y: CENTRE.y + 4, depuisMs: 20_000 }],
    };
    const images = jouer(monde, 20_000 + FUITE_MS, 100);
    for (const { t, poses } of images) {
      if (t < 20_000) continue;
      for (const p of poses) expect(p.geste === "vol", `${t}`).toBe(false);
    }
  });
});

describe("les dérangements du journal", () => {
  const position = (id: number) => ARBRES.find((a) => a.id === id);

  it("le gibier ne dérange personne, le joueur si", () => {
    const d = derangementsDuJournal(
      [
        { type: "brouter", ids: [1, 2, 3] },
        { type: "frotter", ids: [4] },
      ],
      position,
      100,
      0,
    );
    expect(d).toEqual([]);
    const coupe = derangementsDuJournal([{ type: "couper", ids: [CENTRE.id] }], position, 100, 7);
    expect(coupe).toEqual([{ x: CENTRE.x, y: CENTRE.y, depuisMs: 7 }]);
  });

  it("un arbre coupé se retrouve par ce que le geste a retiré", () => {
    const d = derangementsDuJournal(
      [
        {
          type: "couper",
          ids: [4242],
          retire: [
            {
              id: 4242,
              x: 70,
              y: 12,
              especeId: "quercus_robur",
              diametreCm: 30,
              hauteurAvantM: 18,
              hauteurApresM: 0,
              baseHouppierAvantM: 6,
              baseHouppierApresM: 0,
              mortAvantLeGeste: false,
            },
          ],
        },
      ],
      () => undefined,
      100,
      0,
    );
    expect(d.map((p) => [p.x, p.y])).toEqual([[70, 12]]);
  });

  it("un grand chantier se résume à des points espacés", () => {
    const cellules = Array.from({ length: 100 * 100 }, (_, i) => i);
    const d = derangementsDuJournal([{ type: "faucher", cellules }], position, 100, 0);
    expect(d.length).toBeGreaterThan(4);
    expect(d.length).toBeLessThan(80);
  });
});
