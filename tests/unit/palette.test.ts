/**
 * La palette du sol. Ce qui est vérifié ici n'est pas « la couleur est jolie »
 * — ça ne se teste pas — mais les propriétés dont le reste du rendu dépend :
 * la quantification tient (sinon le cache de morceaux ne sert à rien), et les
 * couleurs vont dans le bon sens (sinon on affiche l'inverse de ce que le
 * moteur calcule, ce qui est le seul vrai bug possible ici).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CelluleSol,
  couleurHerbe,
  couleurSol,
  eclairer,
  LITIERE_PLEINE_CG,
  melange,
  NIVEAUX,
  palier,
  phaseAnnuelle,
  quantifier,
  signatureCellule,
  valeurDuPalier,
  versEntier,
} from "../../src/render/palette";

/** Clarté perçue, pour comparer deux teintes sans se disputer sur la teinte. */
function clarte(t: { r: number; g: number; b: number }): number {
  return 0.299 * t.r + 0.587 * t.g + 0.114 * t.b;
}

describe("la quantification, qui fait vivre le cache de morceaux", () => {
  it("rend toujours un palier dans les bornes, quelle que soit l'entrée", () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (v) => {
        const p = palier(v);
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(NIVEAUX - 1);
      }),
    );
  });

  it("deux valeurs de la même tranche donnent le MÊME palier — tout est là", () => {
    // C'est la propriété qui empêche un tick de tout invalider : l'humidité
    // bouge d'un centième chaque semaine, la couleur ne doit pas.
    const largeur = 1 / NIVEAUX;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: NIVEAUX - 1 }), (p) => {
        const a = p * largeur + largeur * 0.1;
        const b = p * largeur + largeur * 0.9;
        expect(palier(a)).toBe(palier(b));
      }),
    );
  });

  it("le palier se relit au milieu de sa tranche", () => {
    for (let p = 0; p < NIVEAUX; p++) {
      expect(palier(valeurDuPalier(p))).toBe(p);
    }
  });

  it("la signature d'une cellule est injective sur les paliers", () => {
    // Si deux cellules différentes partageaient une signature, un morceau
    // garderait une image périmée — et ça ne se verrait qu'à l'écran.
    const vues = new Set<number>();
    let compte = 0;
    for (let a = 0; a < NIVEAUX; a++) {
      for (let b = 0; b < NIVEAUX; b++) {
        for (let c = 0; c < NIVEAUX; c++) {
          for (let d = 0; d < NIVEAUX; d++) {
            vues.add(signatureCellule({ humidite: a, herbe: b, herbeBiomasse: c, litiere: d }));
            compte++;
          }
        }
      }
    }
    expect(vues.size).toBe(compte);
  });
});

describe("le sol dit ce que le moteur calcule", () => {
  const sec: CelluleSol = { humidite: 0.05, herbe: 0, herbeBiomasse: 0, litiereCG: 0 };
  const mouille: CelluleSol = { humidite: 0.95, herbe: 0, herbeBiomasse: 0, litiereCG: 0 };

  it("une terre mouillée est plus SOMBRE qu'une terre sèche", () => {
    const a = couleurSol(quantifier(sec), 20);
    const b = couleurSol(quantifier(mouille), 20);
    expect(clarte(b)).toBeLessThan(clarte(a));
  });

  it("l'herbe verdit le sol nu : plus de couverture, plus de vert", () => {
    const nu = couleurSol(quantifier(sec), 20);
    const couvert = couleurSol(quantifier({ ...sec, herbe: 0.9, herbeBiomasse: 0.3 }), 20);
    // « Plus vert » se lit sur l'écart vert-rouge, pas sur la clarté.
    expect(couvert.g - couvert.r).toBeGreaterThan(nu.g - nu.r);
  });

  it("la litière passe PAR-DESSUS l'herbe et la masque", () => {
    const herbeuse = { ...sec, herbe: 1, herbeBiomasse: 0.2 };
    const vert = couleurSol(quantifier(herbeuse), 20);
    const sousLitiere = couleurSol(quantifier({ ...herbeuse, litiereCG: LITIERE_PLEINE_CG }), 20);
    // Sous un tapis plein, le vert s'efface : l'écart vert-rouge chute.
    expect(sousLitiere.g - sousLitiere.r).toBeLessThan(vert.g - vert.r);
  });

  it("le sol n'est jamais clair — contrainte de L0, sinon le bouleau disparaît", () => {
    // Constatée sur une capture : l'écorce blanche du bouleau est sa signature
    // la plus forte et elle ne se lit pas sur un fond pâle. Aucune combinaison
    // de paliers ne doit produire un sol clair.
    for (let h = 0; h < NIVEAUX; h++) {
      for (let g = 0; g < NIVEAUX; g++) {
        for (let b = 0; b < NIVEAUX; b++) {
          for (let l = 0; l < NIVEAUX; l++) {
            for (const semaine of [5, 18, 30, 45]) {
              const t = couleurSol(
                { humidite: h, herbe: g, herbeBiomasse: b, litiere: l },
                semaine,
              );
              expect(clarte(t)).toBeLessThan(190);
            }
          }
        }
      }
    }
  });

  it("toute couleur reste dans les bornes d'un canal, même après éclaircissement", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: NIVEAUX - 1 }),
        fc.integer({ min: 0, max: NIVEAUX - 1 }),
        fc.integer({ min: 0, max: 51 }),
        fc.double({ min: 0.5, max: 1.5, noNaN: true }),
        (h, g, semaine, facteur) => {
          const t = eclairer(
            couleurSol({ humidite: h, herbe: g, herbeBiomasse: g, litiere: 0 }, semaine),
            facteur,
          );
          const e = versEntier(t);
          expect(e).toBeGreaterThanOrEqual(0);
          expect(e).toBeLessThanOrEqual(0xffffff);
        },
      ),
    );
  });
});

describe("la saison décale la palette de l'herbe", () => {
  it("l'herbe de janvier est plus terne que celle de mai", () => {
    const janvier = couleurHerbe(3, 0.3);
    const mai = couleurHerbe(18, 0.3);
    expect(mai.g - mai.r).toBeGreaterThan(janvier.g - janvier.r);
  });

  it("le foin sur pied jaunit, à saison égale", () => {
    // Les deux grilles du moteur ne disent pas la même chose : la couverture
    // peut avoir chuté alors que la matière sèche est encore là.
    const rase = couleurHerbe(28, 0.05);
    const foin = couleurHerbe(28, 1);
    expect(foin.r).toBeGreaterThan(rase.r);
    expect(foin.g - foin.b).toBeLessThan(rase.g - rase.b + 40);
    expect(clarte(foin)).toBeGreaterThan(clarte(rase));
  });

  it("la phase de l'année boucle et ne sort jamais de [0,1[", () => {
    fc.assert(
      fc.property(fc.integer({ min: -500, max: 5000 }), (semaine) => {
        const p = phaseAnnuelle(semaine);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(1);
        expect(phaseAnnuelle(semaine + 52)).toBeCloseTo(p, 12);
      }),
    );
  });
});

describe("le mélange", () => {
  it("borne ses extrémités et interpole au milieu", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 100, g: 200, b: 50 };
    expect(melange(a, b, -1)).toEqual(a);
    expect(melange(a, b, 2)).toEqual(b);
    expect(melange(a, b, 0.5)).toEqual({ r: 50, g: 100, b: 25 });
  });
});
