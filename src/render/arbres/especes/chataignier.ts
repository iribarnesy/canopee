/**
 * Châtaignier — *Castanea sativa*. Famille : **feuillu de futaie**.
 *
 * « Fût sillonné en spirale, longue feuille dentée en scie, bogues » (§5.4). La
 * spirale de l'écorce est le signe le plus sûr sur un vieux sujet, mais elle ne
 * se lit pas à la taille où l'on dessine ; ce qui porte l'identification ici,
 * c'est **la feuille** — longue, étroite, à dents aiguës régulières, la plus
 * grande des feuillus de futaie de l'atlas.
 *
 * Port large et bas branchu, houppier lourd : un châtaignier de plein vent est
 * un arbre massif, et le dessin doit le montrer avant même la feuille.
 */
import type { FicheGraphique } from "../fiche";

export const CHATAIGNIER: FicheGraphique = {
  especeId: "castanea_sativa",
  port: "boule",
  branchement: {
    angleDeg: 54,
    divergenceDeg: 144,
    ratioLongueur: 0.7,
    dominance: 0.34,
    branchesParNoeud: 3,
    conicite: 0.78,
    tortuosite: 0.3,
  },
  feuillage: { forme: "lanceolee", feuillesParBouquet: 4, longueurFeuilleM: 0.18, densite: 0.86 },
  couleurs: {
    printemps: { r: 134, g: 172, b: 78 },
    ete: { r: 74, g: 108, b: 52 },
    // Le jaune-roux du châtaignier, plus chaud que celui du frêne.
    automne: { r: 186, g: 146, b: 66 },
  },
  ecorce: { r: 104, g: 90, b: 74 },
  references: [
    "Rameau et al., Flore forestière française, t. 2 — Castanea sativa",
    "Conedera et al. (2016), Castanea sativa in Europe — port et écologie",
  ],
};
