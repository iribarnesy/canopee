/**
 * Pommier — *Malus domestica*. Famille : **fruitier greffé**.
 *
 * Houppier **en gobelet** : c'est une forme de TAILLE et non un port naturel,
 * et c'est justement ce qui doit se voir — un pommier de verger a été fait
 * ainsi par quelqu'un. Le centre est ouvert, les charpentières divergent, et le
 * sommet reste dégagé pour que la lumière descende sur les fruits.
 *
 * Deux moments de l'année portent l'identification : la **floraison
 * blanc-rosé** d'avril, et les **fruits ronds** de septembre. Le protocole
 * donne les deux (`fruitProgress`, `bloomFrosted`) — le gel tardif qui brunit
 * les fleurs est un événement de jeu, pas un détail.
 */
import type { FicheGraphique } from "../fiche";

export const POMMIER: FicheGraphique = {
  especeId: "malus_domestica",
  port: "gobelet",
  branchement: {
    angleDeg: 52,
    divergenceDeg: 120,
    ratioLongueur: 0.66,
    // Très faible : la taille en gobelet SUPPRIME la flèche. C'est le geste
    // qui définit la forme.
    dominance: 0.14,
    branchesParNoeud: 3,
    conicite: 0.8,
    tortuosite: 0.34,
  },
  feuillage: { forme: "dentee", feuillesParBouquet: 5, longueurFeuilleM: 0.07, densite: 0.72 },
  couleurs: {
    printemps: { r: 132, g: 168, b: 88 },
    ete: { r: 88, g: 122, b: 66 },
    automne: { r: 178, g: 152, b: 74 },
  },
  ecorce: { r: 112, g: 96, b: 78 },
  references: [
    "Bretaudeau & Fauré, Atlas d'arboriculture fruitière — taille en gobelet",
    "Coutanceau, Arboriculture fruitière — port et conduite du pommier",
  ],
};
