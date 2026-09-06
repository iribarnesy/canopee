/**
 * Prunellier — *Prunus spinosa*. Famille : **arbuste épineux drageonnant**.
 *
 * Ce n'est pas un fourré bas — il fait quatre mètres et il a du bois — mais ce
 * n'est pas non plus un petit arbre : il avance par DRAGEONS, et un buisson de
 * prunellier est une colonie, pas un individu. D'où la cépée nombreuse, la
 * dominance très basse (aucun brin ne prend la tête) et la tortuosité forte.
 *
 * Sa signature graphique tient à ses **rameaux terminés en épine** : la
 * conicité basse et le grand angle donnent cette ramure raide et divariquée
 * qui, en février, se couvre de fleurs blanches AVANT les feuilles.
 */
import type { FicheGraphique } from "../fiche";

export const PRUNELLIER: FicheGraphique = {
  especeId: "prunus_spinosa",
  port: "boule",
  // Une colonie de drageons : le nombre est ce qui la distingue d'un arbuste.
  brinsDeCepee: 9,
  branchement: {
    angleDeg: 68,
    divergenceDeg: 144,
    ratioLongueur: 0.58,
    dominance: 0.12,
    branchesParNoeud: 2,
    // Basse : un rameau de prunellier s'effile jusqu'à l'épine.
    conicite: 0.6,
    tortuosite: 0.46,
  },
  feuillage: { forme: "dentee", feuillesParBouquet: 4, longueurFeuilleM: 0.03, densite: 0.74 },
  couleurs: {
    printemps: { r: 124, g: 158, b: 84 },
    ete: { r: 80, g: 110, b: 62 },
    automne: { r: 172, g: 150, b: 80 },
  },
  fruit: {
    // Bleu-noir pruineux : la prunelle est le seul fruit BLEU de l'atlas, et
    // c'est à ça qu'on la nomme — un buisson épineux couvert de points bleus
    // en octobre ne peut être que ça.
    forme: "charnu",
    couleur: { r: 62, g: 66, b: 96 },
    longueurM: 0.013,
    parRameau: 4,
    // prunelles serrées le long du rameau : le groupe a sa dimension propre, et ce n'est pas
    // une fonction de la taille de la baie.
    grappeM: 0.05,
  },
  ecorce: { r: 78, g: 68, b: 60 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Prunus spinosa, drupe pruineuse",
    "Rameau et al., Flore forestière française, t. 1 — Prunus spinosa",
    "Guide des haies bocagères (CAUE) — l'ourlet épineux et son drageonnement",
  ],
};
