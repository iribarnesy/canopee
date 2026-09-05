/**
 * Aulne glutineux — *Alnus glutinosa*. Famille : **ripisylve**.
 *
 * Port **dressé étroit**, souvent en cépée : c'est le `fastigie` de la liste
 * des ports, et l'aulne est la seule essence d'arbre de l'atlas qui le porte.
 * Écorce brun foncé écailleuse, feuille arrondie **tronquée au sommet** — une
 * feuille qui a l'air coupée, ce qui ne ressemble à rien d'autre — et de petits
 * **cônes ligneux qui persistent l'hiver**, seuls fruits en cône d'un feuillu.
 *
 * Sa place dans le jeu est le bord de l'eau : il pousse là où le ruisseau et la
 * mare mettent la nappe à moins d'un mètre, et le moteur en tient compte. Le
 * dessin ne l'exprime pas — c'est la position qui le dira.
 */
import type { FicheGraphique } from "../fiche";

export const AULNE_GLUTINEUX: FicheGraphique = {
  especeId: "alnus_glutinosa",
  port: "fastigie",
  branchement: {
    // Petit angle : tout monte. C'est ce qui fait le port dressé.
    angleDeg: 26,
    divergenceDeg: 150,
    ratioLongueur: 0.76,
    dominance: 0.66,
    branchesParNoeud: 2,
    conicite: 0.88,
    tortuosite: 0.12,
  },
  feuillage: { forme: "tronquee", feuillesParBouquet: 4, longueurFeuilleM: 0.08, densite: 0.7 },
  couleurs: {
    printemps: { r: 108, g: 152, b: 78 },
    // L'aulne reste vert sombre tout l'été, il ne pâlit pas.
    ete: { r: 62, g: 98, b: 56 },
    // Et il tombe VERT : pas de couleur d'automne, c'est un trait de l'espèce.
    automne: { r: 84, g: 108, b: 62 },
  },
  ecorce: { r: 74, g: 62, b: 54 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Alnus glutinosa",
    "Claessens et al. (2010), Alnus glutinosa: a review — port et écologie",
  ],
};
