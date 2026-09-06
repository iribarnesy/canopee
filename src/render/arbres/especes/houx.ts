/**
 * Houx — *Ilex aquifolium*. Famille : **persistant de sous-bois**.
 *
 * Le seul feuillu **conique** de l'atlas, et ce n'est pas une fantaisie : un
 * houx venu seul sous futaie fait une pyramide dense qui garde ses branches
 * jusqu'au sol. Le port conique est donc juste, et il évite la confusion avec
 * les arbustes en boule qui l'entourent dans la haie.
 *
 * Sa signature est la **feuille coriace**, luisante, aux bords ondulés et
 * épineux — et elle est là DOUZE MOIS SUR DOUZE. Le moteur le sait
 * (`caduc: false`) : en janvier, quand tout est nu, ce vert sombre est la
 * seule masse foliaire du sous-bois, et c'est à ça qu'on le reconnaît de loin.
 * D'où une couleur d'hiver, à peine plus terne que l'été.
 */
import type { FicheGraphique } from "../fiche";

export const HOUX: FicheGraphique = {
  especeId: "ilex_aquifolium",
  port: "conique",
  branchement: {
    angleDeg: 62,
    divergenceDeg: 132,
    ratioLongueur: 0.72,
    // Le houx garde une flèche nette — c'est ce qui fait la pyramide — mais
    // pas au point de se dégarnir : à 0,58, la flèche mangeait ses latérales
    // et il sortait en conifère clairsemé plutôt qu'en buisson pyramidal.
    dominance: 0.42,
    branchesParNoeud: 3,
    conicite: 0.72,
    tortuosite: 0.22,
  },
  // Dense : un houx ne laisse rien passer, c'est même sa fonction d'abri.
  feuillage: { forme: "coriace", feuillesParBouquet: 5, longueurFeuilleM: 0.06, densite: 0.92 },
  couleurs: {
    printemps: { r: 96, g: 140, b: 74 },
    ete: { r: 52, g: 88, b: 54 },
    // Un persistant ne fait pas d'automne : la feuille de trois ans tombe
    // sans jaunir, remplacée en continu.
    automne: { r: 54, g: 90, b: 56 },
    hiver: { r: 46, g: 80, b: 50 },
  },
  ecorce: { r: 120, g: 118, b: 108 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Ilex aquifolium",
    "Tirant & Peterken, Woodland Conservation and Management — le houx sous futaie",
  ],
};
