/**
 * Cornouiller mâle — *Cornus mas*. Famille : **arbuste dressé de calcaire**.
 *
 * Un cornouiller mâle âgé n'est plus un buisson : c'est un petit arbre à cime
 * arrondie et à bois très dur — le plus dense de l'atlas. Il se tient droit là
 * où l'aubépine s'emmêle, et c'est ce contraste-là qui doit se voir : même
 * taille, même haie, ramure opposée et régulière contre ramure tortueuse.
 *
 * La feuille est **ovale entière**, à nervures arquées qui suivent le bord —
 * un caractère de cornouiller qu'on ne trouve nulle part ailleurs dans la
 * haie. Et il fleurit JAUNE en février, sur bois nu, avant le prunellier.
 */
import type { FicheGraphique } from "../fiche";

export const CORNOUILLER_MALE: FicheGraphique = {
  especeId: "cornus_mas",
  port: "boule",
  brinsDeCepee: 3,
  branchement: {
    angleDeg: 50,
    divergenceDeg: 178,
    ratioLongueur: 0.7,
    dominance: 0.34,
    // Opposés, comme chez le sureau et le fusain : c'est une famille de
    // rameaux par paires, et ça se lit sur la silhouette.
    branchesParNoeud: 2,
    conicite: 0.82,
    // Faible : le cornouiller est raide, c'est son bois qui veut ça.
    tortuosite: 0.18,
  },
  feuillage: { forme: "ovale", feuillesParBouquet: 4, longueurFeuilleM: 0.08, densite: 0.84 },
  couleurs: {
    printemps: { r: 130, g: 162, b: 86 },
    ete: { r: 84, g: 116, b: 64 },
    // Les cornouillers virent au pourpre, pas au jaune.
    automne: { r: 160, g: 104, b: 80 },
  },
  ecorce: { r: 108, g: 92, b: 76 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Cornus mas",
    "Jacamon, Guide de dendrologie — le bois du cornouiller, le plus dur d'Europe",
  ],
};
