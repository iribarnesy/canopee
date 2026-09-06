/**
 * Abricotier — *Prunus armeniaca*. Famille : **fruitier greffé**.
 *
 * Même famille de port que le pommier — le **gobelet** est une forme de taille,
 * et le voir, c'est voir que quelqu'un l'a faite — mais l'abricotier n'est pas
 * un pommier : charpentières plus dressées, houppier plus haut que large, bois
 * plus rouge. Un verger mixte doit laisser lire les deux.
 *
 * Sa singularité de jeu est ailleurs et le moteur la porte : il fleurit
 * TÔT, et le gel de mars lui prend sa récolte (`gelFatalC`). La feuille est
 * **cordée**, presque ronde, à long pétiole rougeâtre.
 */
import type { FicheGraphique } from "../fiche";

export const ABRICOTIER: FicheGraphique = {
  especeId: "prunus_armeniaca",
  port: "gobelet",
  branchement: {
    // Plus dressé que le pommier : c'est ce qui sépare les deux gobelets.
    angleDeg: 40,
    divergenceDeg: 112,
    ratioLongueur: 0.7,
    dominance: 0.24,
    branchesParNoeud: 3,
    conicite: 0.84,
    tortuosite: 0.26,
  },
  feuillage: { forme: "cordee", feuillesParBouquet: 4, longueurFeuilleM: 0.08, densite: 0.68 },
  couleurs: {
    printemps: { r: 138, g: 170, b: 96 },
    ete: { r: 92, g: 124, b: 70 },
    automne: { r: 184, g: 156, b: 82 },
  },
  // Rougeâtre : les Prunus ont l'écorce plus chaude que les Malus.
  fruit: {
    // Orange franc : c'est la couleur la plus chaude de l'atlas, et sur un
    // verger mixte elle sépare l'abricotier du pommier d'un coup d'œil, ce que
    // le port en gobelet ne fait pas.
    forme: "charnu",
    couleur: { r: 222, g: 138, b: 60 },
    longueurM: 0.05,
    parRameau: 3,
  },
  ecorce: { r: 124, g: 90, b: 74 },
  references: [
    "Coutanceau, Arboriculture fruitière — maturité et coloration de l'abricot",
    "Bretaudeau & Fauré, Atlas d'arboriculture fruitière — l'abricotier en gobelet",
    "Coutanceau, Arboriculture fruitière — port et floraison précoce du Prunus armeniaca",
  ],
};
