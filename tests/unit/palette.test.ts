/**
 * La palette du sol. Ce qui est vérifié ici n'est pas « la couleur est jolie »
 * — ça ne se teste pas — mais les propriétés dont le reste du rendu dépend :
 * la quantification tient (sinon le cache de morceaux ne sert à rien), et les
 * couleurs vont dans le bon sens (sinon on affiche l'inverse de ce que le
 * moteur calcule, ce qui est le seul vrai bug possible ici).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { couvertureMax } from "../../src/engine/herbe";
import {
  type CelluleSol,
  COUVERT_LE_PLUS_SOMBRE,
  couleurHerbe,
  couleurSol,
  eclairer,
  LITIERE_PLEINE_CG,
  melange,
  NIVEAUX,
  ombreDuCouvert,
  palier,
  phaseAnnuelle,
  quantifier,
  satisfactionEnEau,
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
            vues.add(
              signatureCellule({
                humidite: a,
                herbe: b,
                herbeBiomasse: c,
                litiere: d,
                lumiere: 0,
                herbeHumidite: 0,
              }),
            );
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
                {
                  humidite: h,
                  herbe: g,
                  herbeBiomasse: b,
                  litiere: l,
                  lumiere: NIVEAUX - 1,
                  herbeHumidite: NIVEAUX - 1,
                },
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
            couleurSol(
              {
                humidite: h,
                herbe: g,
                herbeBiomasse: g,
                litiere: 0,
                lumiere: palier(1),
                herbeHumidite: palier(1),
              },
              semaine,
            ),
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

describe("la soif de l'herbe, lue du moteur et non décrétée", () => {
  const chaleur = (t: { r: number; g: number; b: number }) => t.r - t.b;
  const pleine = (herbeHumidite: number) =>
    couleurSol(
      quantifier({ humidite: 0.5, herbe: 1, herbeBiomasse: 0.25, litiereCG: 0, herbeHumidite }),
      28,
    );

  it("**une pelouse pleine brunit quand l'eau de SURFACE manque**", () => {
    // Ce que le rendu ne pouvait pas montrer avant que le moteur ne l'expose
    // (issue #12) : sur une cellule bien couverte — c'est-à-dire partout où
    // l'herbe compte — la soif était strictement invisible, parce que
    // l'humidité ne colorait que le sol nu et que l'herbe le recouvre.
    expect(chaleur(pleine(0.02))).toBeGreaterThan(chaleur(pleine(0.9)) + 15);
  });

  it("**le seuil est celui du MOTEUR, pas une constante d'ici**", () => {
    // Le garde-fou de la faute, et il est précis. Le premier jet décrétait
    // `SEUIL_GRILLE = 0.42` sur la réserve utile : faux de valeur, faux de
    // grandeur, faux de nature. La valeur juste — 0,35 de l'eau de SURFACE —
    // vit dans `couvertureMax`, et le rendu l'obtient en APPELANT cette
    // fonction plutôt qu'en recopiant son seuil.
    //
    // Recopier serait l'autre façon de se tromper, celle du §2.1 : deux copies
    // d'une règle dérivent, et personne ne le voit. Cet essai vérifie donc
    // l'égalité exacte avec le moteur, à plusieurs valeurs — il casse si l'un
    // des deux bouge sans l'autre.
    for (const h of [0, 0.1, 0.2, 0.35, 0.5, 1]) {
      expect(satisfactionEnEau(h), `humidité ${h}`).toBeCloseTo(couvertureMax(1, h), 10);
    }
  });

  it("au-dessus du seuil du moteur, l'herbe ne brunit plus du tout", () => {
    // La conséquence de lire la bonne fonction : le plateau est là où le
    // moteur le met. Un sol à moitié plein n'a aucune raison de jaunir, et le
    // faire jaunir rendrait la couleur illisible — tout serait toujours un peu
    // grillé.
    expect(satisfactionEnEau(0.5)).toBe(1);
    expect(chaleur(pleine(0.5))).toBeCloseTo(chaleur(pleine(0.95)), 6);
  });
});

describe("ce que le rendu N'A PAS le droit d'inventer", () => {
  it("la couleur de l'herbe prend sa soif du moteur, jamais d'un seuil local", () => {
    // Le garde-fou de la règle, et il vient d'une faute réelle : j'avais ajouté
    // ici un troisième paramètre `secheresse`, dérivé d'un seuil sur la réserve
    // utile décrété dans le rendu. Le rendu n'a pas à décider à partir de quelle
    // humidité une herbe souffre — c'est une affirmation de modèle.
    //
    // Le moteur, lui, sait le dire : `herbe.ts` porte `humiditeVecue`,
    // l'humidité de l'horizon de surface lissée sur ~6 semaines, et son seuil
    // d'eau pour l'herbe vaut 0,35 de l'eau de SURFACE — ni la même valeur, ni
    // la même grandeur que ce que j'avais inventé. Elle n'est pas encore dans
    // l'instantané : c'est une issue moteur, pas une constante de palette.
    //
    // Cet essai compte les paramètres. C'est grossier, et c'est exactement ce
    // qu'il faut : il se déclenche à la SIGNATURE, donc avant qu'on ait eu le
    // temps de rebrancher un seuil quelque part.
    // Le troisième paramètre est revenu, mais il a changé de nature : ce n'est
    // plus une « sécheresse » calculée ici depuis un seuil décrété, c'est
    // `soilHerbeHumidite` transporté tel quel, dont la lecture passe par
    // `satisfactionEnEau` — donc par `couvertureMax`, donc par le moteur.
    //
    // L'essai vérifie ce qui compte : que la valeur neutre soit l'ABSENCE
    // d'affirmation. Une scène qui ne transporte pas la grandeur doit rendre
    // une herbe non assoiffée, jamais une herbe grillée par défaut.
    expect(couleurHerbe(28, 0.25)).toEqual(couleurHerbe(28, 0.25, 1));
  });

  it("aucune constante de palette ne porte un seuil sur une grandeur du moteur", () => {
    // La palette a le droit de choisir des COULEURS et des façons de les
    // afficher — `LITIERE_PLEINE_CG` est un plafond visuel, `OPACITE_OMBRE` un
    // choix de dessin, `COUVERT_LE_PLUS_SOMBRE` une correspondance entre une
    // lumière que le moteur calcule et une clarté à l'écran. Ce qu'elle n'a pas
    // le droit de faire, c'est décider qu'une grandeur physique fait basculer
    // un état — « en dessous de tant, l'herbe grille ».
    //
    // La distinction en une phrase : le rendu choisit COMMENT montrer ce que le
    // moteur dit ; il ne choisit pas CE QUE le moteur dit.
    expect(ombreDuCouvert(1)).toBeCloseTo(1, 6);
    expect(ombreDuCouvert(0)).toBeGreaterThan(0);
  });
});

describe("l'ombre du couvert : ce que le moteur savait et que le rendu ignorait", () => {
  it("**un sol sous couvert fermé est plus sombre qu'une trouée**", () => {
    // Le défaut, et c'est celui qui empêchait le plus la scène de ressembler à
    // une forêt : `computeGroundLight` calcule la lumière au sol de chaque
    // cellule à chaque tick, le protocole la transporte sous
    // `soilLumiere`, et le rendu ne la lisait pas. Le sol d'une futaie fermée
    // avait donc exactement la couleur de celui d'une clairière.
    //
    // L'ombre PORTÉE ne pouvait pas y suppléer, et pas par accident : elle
    // SATURE à l'opacité d'un seul arbre (`OPACITE_OMBRE`), ce qui est voulu
    // pour éviter les puits d'encre. Un couvert fermé ne pouvait donc jamais
    // assombrir le sol de plus d'un tiers, quel que soit le nombre d'arbres.
    const sol = (lumiere: number) =>
      couleurSol(
        quantifier({ humidite: 0.5, herbe: 0.6, herbeBiomasse: 0.4, litiereCG: 200, lumiere }),
        28,
      );
    expect(clarte(sol(0.02))).toBeLessThan(clarte(sol(1)) * 0.75);
  });

  it("croît avec la lumière, sans saut ni palier vide", () => {
    let precedent = -1;
    for (const l of [0, 0.05, 0.2, 0.4, 0.7, 1]) {
      const c = ombreDuCouvert(l);
      expect(c).toBeGreaterThanOrEqual(precedent);
      precedent = c;
    }
    expect(ombreDuCouvert(1)).toBeCloseTo(1, 6);
    expect(ombreDuCouvert(0)).toBeCloseTo(COUVERT_LE_PLUS_SOMBRE, 6);
  });

  it("**ne descend jamais au noir, même sous une hêtraie fermée**", () => {
    // La physique dirait ~1 % de lumière sous un couvert fermé
    // (`MAX_EXTINCTION`). La rendre au pied de la lettre ferait un trou d'encre
    // au milieu de la parcelle, et on ne verrait plus rien de ce qui s'y
    // passe : ni les semis, ni le bois au sol, ni les marques d'action. C'est
    // un choix de dessin, et il est borné pour qu'on ne puisse pas le
    // durcir par inadvertance jusqu'à rendre le sous-bois illisible.
    expect(COUVERT_LE_PLUS_SOMBRE).toBeGreaterThan(0.4);
  });

  it("la grandeur absente vaut PLEINE LUMIÈRE, jamais l'obscurité", () => {
    // Le repli compte : une scène qui ne transporte pas la lumière au sol doit
    // rendre ce qu'elle rendait avant, pas une parcelle noire.
    const sans = quantifier({ humidite: 0.5, herbe: 0.6, herbeBiomasse: 0.4, litiereCG: 200 });
    const pleine = quantifier({
      humidite: 0.5,
      herbe: 0.6,
      herbeBiomasse: 0.4,
      litiereCG: 200,
      lumiere: 1,
    });
    expect(sans.lumiere).toBe(pleine.lumiere);
  });
});
