/**
 * Frêne commun — *Fraxinus excelsior*. Famille : **feuillu de futaie**.
 *
 * Trois signes, et le premier est le meilleur : les **bourgeons NOIRS** sur des
 * rameaux gris clair, visibles tout l'hiver et sur aucune autre essence de
 * l'atlas. Puis la feuille **composée** — neuf à treize folioles sur un même
 * pétiole — et le port en éventail, branches montantes puis retombantes en
 * bout.
 *
 * C'est aussi la **dernière essence à débourrer** et l'une des premières à
 * perdre ses feuilles : sa saison est courte, et le rendu le montre par la part
 * foliaire que le moteur calcule, pas par un réglage d'ici.
 */
import type { FicheGraphique } from "../fiche";

export const FRENE: FicheGraphique = {
  especeId: "fraxinus_excelsior",
  port: "boule",
  branchement: {
    angleDeg: 40,
    divergenceDeg: 90,
    ratioLongueur: 0.72,
    dominance: 0.56,
    // TROIS, c'est-à-dire la flèche PLUS deux latérales opposées : le frêne
    // a des rameaux par paires, et c'est ce qui donne son port en éventail.
    // Le compte disait deux, donc une seule latérale — la paire n'existait
    // pas, et avec 180° de divergence toutes les latérales tombaient dans un
    // même plan. Le houppier sortait en C.
    branchesParNoeud: 3,
    conicite: 0.86,
    tortuosite: 0.14,
  },
  feuillage: { forme: "composee", feuillesParBouquet: 3, longueurFeuilleM: 0.22, densite: 0.66 },
  couleurs: {
    printemps: { r: 132, g: 170, b: 82 },
    ete: { r: 84, g: 124, b: 66 },
    // Le frêne tombe souvent encore vert ; quand il jaunit, c'est pâle.
    automne: { r: 176, g: 172, b: 96 },
  },
  // Gris clair et lisse chez le jeune, se fissurant avec l'âge.
  ecorce: { r: 130, g: 126, b: 112 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Fraxinus excelsior",
    "Dobrowolska et al. (2011), A review of European ash — port et phénologie",
  ],
};
