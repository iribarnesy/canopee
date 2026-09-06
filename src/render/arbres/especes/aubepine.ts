/**
 * Aubépine — *Crataegus monogyna*. Famille : **arbuste de haie, tortueux**.
 *
 * Le buisson de haie par excellence, et à huit mètres il devient un petit
 * arbre en boule. Ce qui le désigne, c'est la **tortuosité** : aucune branche
 * d'aubépine ne va droit, et cette ramure emmêlée est ce qui rend la haie
 * impénétrable — c'est la raison même pour laquelle on l'a plantée.
 *
 * Feuille **lobée**, petite, à trois ou cinq lobes profonds : elle ne se
 * confond avec rien d'autre dans la haie, et c'est elle qui porte
 * l'identification quand ni la fleur de mai ni la cenelle d'octobre ne sont là.
 */
import type { FicheGraphique } from "../fiche";

export const AUBEPINE: FicheGraphique = {
  especeId: "crataegus_monogyna",
  port: "boule",
  brinsDeCepee: 4,
  branchement: {
    angleDeg: 58,
    divergenceDeg: 126,
    ratioLongueur: 0.67,
    dominance: 0.2,
    branchesParNoeud: 3,
    conicite: 0.74,
    // La plus forte de l'atlas avec le chêne pubescent : c'est sa signature.
    tortuosite: 0.52,
  },
  feuillage: { forme: "lobee", feuillesParBouquet: 5, longueurFeuilleM: 0.04, densite: 0.82 },
  couleurs: {
    printemps: { r: 126, g: 162, b: 88 },
    ete: { r: 78, g: 114, b: 64 },
    automne: { r: 182, g: 138, b: 72 },
  },
  ecorce: { r: 96, g: 84, b: 70 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Crataegus monogyna",
    "Pointereau & Bazile, Arbres des champs — la haie vive et ses essences",
  ],
};
