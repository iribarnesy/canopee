/**
 * Troène commun — *Ligustrum vulgare*. Famille : **arbuste semi-persistant**.
 *
 * **Le seul semi-persistant de l'atlas**, et le moteur le porte explicitement :
 * `retentionHivernale: 0.45` dans `especes.ts` — il ne se dénude jamais tout à
 * fait, c'est ce qui lui vaut sa place dans les haies puisqu'il abrite encore
 * en février. La fiche doit donc lui donner une **couleur d'hiver**, ce qui
 * serait faux pour n'importe quel autre caduc de la liste.
 *
 * Port dressé, presque en balai : les rameaux montent tous, ce qui explique
 * qu'il supporte la taille et qu'on en fasse des haies au cordeau. Feuille
 * **lancéolée** entière, luisante, opposée.
 */
import type { FicheGraphique } from "../fiche";

export const TROENE: FicheGraphique = {
  especeId: "ligustrum_vulgare",
  port: "fastigie",
  brinsDeCepee: 6,
  branchement: {
    // Serré : tout monte, c'est ce qui fait le balai.
    angleDeg: 28,
    divergenceDeg: 174,
    ratioLongueur: 0.71,
    dominance: 0.3,
    branchesParNoeud: 2,
    conicite: 0.84,
    tortuosite: 0.2,
  },
  feuillage: { forme: "lanceolee", feuillesParBouquet: 4, longueurFeuilleM: 0.05, densite: 0.86 },
  couleurs: {
    printemps: { r: 118, g: 154, b: 84 },
    ete: { r: 68, g: 102, b: 58 },
    // Il ne jaunit pas vraiment : il fonce et vire au bronze.
    automne: { r: 92, g: 100, b: 66 },
    // Ce qui reste en février : moins de feuilles, mais encore vertes.
    hiver: { r: 60, g: 88, b: 58 },
  },
  ecorce: { r: 112, g: 106, b: 92 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Ligustrum vulgare",
    "Atlas des essences (dépôt) — « semi-persistant ; supporte la taille → haies »",
  ],
};
