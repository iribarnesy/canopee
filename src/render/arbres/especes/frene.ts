/**
 * Frêne commun — *Fraxinus excelsior*. Famille : **feuillu de futaie**.
 *
 * Trois signes, et le premier est le meilleur : les **bourgeons noirs** sur des
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
    // **trois**, c'est-à-dire la flèche **plus** deux latérales opposées : le frêne
    // a des rameaux par paires, et c'est ce qui donne son port en éventail.
    // Le compte disait deux, donc une seule latérale — la paire n'existait
    // pas, et avec 180° de divergence toutes les latérales tombaient dans un
    // même plan. Le houppier sortait en C.
    branchesParNoeud: 3,
    conicite: 0.86,
    tortuosite: 0.14,
  },
  feuillage: {
    forme: "composee",
    // **Onze, le milieu de la plage** : neuf à treize folioles en général, sept à
    // quinze au plus (Flora Gallica ; Rameau et al., *Flore forestière
    // française*). La fiche n'en disait rien, et le défaut lui en donnait cinq —
    // la main du noyer commun, alors que le compte est l'un des traits qui
    // séparent les deux feuilles à l'œil (#398).
    folioles: 11,
    feuillesParBouquet: 3,
    // **La feuille entière, rachis compris** — c'est le sens du champ (#376), et
    // 22 cm le tient : les flores donnent vingt à trente-cinq centimètres pour
    // la feuille, une foliole n'en fait qu'une fraction. On la garde. À onze
    // folioles sur la même longueur, chacune sort plus petite qu'à cinq, et
    // c'est ce qui fait de la main une plume.
    longueurFeuilleM: 0.22,
    densite: 0.66,
  },
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
    "Tison & de Foucault (2014), Flora Gallica — Fraxinus excelsior, compte des folioles",
    "Dobrowolska et al. (2011), A review of European ash — port et phénologie",
  ],
};
