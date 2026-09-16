/**
 * Chêne pubescent — *Quercus pubescens*. Famille : **feuillu de futaie**.
 *
 * « Trapu, tortueux, écorce crevassée, feuille lobée à revers duveteux »
 * (§5.4). C'est le contraire du hêtre à tous points : là où le hêtre file droit
 * et lisse, le chêne pubescent fourche bas, serpente, et son écorce se fend en
 * profondeur. Les deux sont des feuillus de futaie et doivent pourtant se
 * distinguer au premier coup d'œil — c'est le test de la famille.
 *
 * La faible dominance et la forte tortuosité portent l'essentiel : un arbre qui
 * n'a pas de flèche et dont les branches serpentent ne peut pas être pris pour
 * un hêtre, quelle que soit sa feuille.
 */
import type { FicheGraphique } from "../fiche";

export const CHENE_PUBESCENT: FicheGraphique = {
  especeId: "quercus_pubescens",
  port: "boule",
  branchement: {
    angleDeg: 62,
    divergenceDeg: 122,
    ratioLongueur: 0.66,
    // Très faible : le chêne pubescent n'a pas de flèche, il a des bras.
    dominance: 0.2,
    branchesParNoeud: 3,
    conicite: 0.74,
    // La plus forte du catalogue avec le chêne-liège : les branches serpentent,
    // et c'est la moitié de la silhouette.
    tortuosite: 0.58,
  },
  feuillage: { forme: "lobee", feuillesParBouquet: 5, longueurFeuilleM: 0.08, densite: 0.82 },
  couleurs: {
    printemps: { r: 142, g: 168, b: 80 },
    ete: { r: 88, g: 114, b: 58 },
    // Le chêne roussit sans flamber : un brun mat, pas l'or du bouleau.
    automne: { r: 154, g: 118, b: 62 },
    // Marcescent : le jeune chêne garde ses feuilles brunes tout l'hiver.
    hiver: { r: 132, g: 106, b: 76 },
  },
  // Crevassée, donc sombre : les fissures mangent la lumière.
  ecorce: { r: 92, g: 82, b: 70 },
  references: [
    "Rameau et al., Flore forestière française, t. 2 — Quercus pubescens",
    "Roloff, Bäume — architecture des Quercus, fourchaison basse",
  ],
};
