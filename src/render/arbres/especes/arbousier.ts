/**
 * Arbousier — *Arbutus unedo*. Famille : **persistant méditerranéen**.
 *
 * L'espèce la plus méridionale de l'atlas, et celle qui dira le mieux le
 * réchauffement quand elle commencera à tenir plus au nord. Petit arbre
 * tortueux, souvent à plusieurs brins, à cime arrondie et dense.
 *
 * Sa signature est l'**écorce** : brun-rouge, se détachant en fines lanières
 * sur du bois lisse plus clair dessous — avec le bouleau, c'est le seul fût de
 * l'atlas qu'on identifie sans regarder les feuilles. La feuille, elle, est
 * **coriace** et dentée, vernissée, et elle tient l'hiver (`caduc: false`) :
 * l'arbousier porte fleurs blanches et arbouses rouges EN MÊME TEMPS, en
 * novembre, ce qu'aucune autre espèce d'ici ne fait.
 */
import type { FicheGraphique } from "../fiche";

export const ARBOUSIER: FicheGraphique = {
  especeId: "arbutus_unedo",
  port: "boule",
  brinsDeCepee: 3,
  branchement: {
    angleDeg: 56,
    divergenceDeg: 138,
    ratioLongueur: 0.65,
    dominance: 0.28,
    branchesParNoeud: 3,
    conicite: 0.78,
    tortuosite: 0.4,
  },
  feuillage: { forme: "coriace", feuillesParBouquet: 5, longueurFeuilleM: 0.09, densite: 0.88 },
  couleurs: {
    printemps: { r: 104, g: 146, b: 80 },
    ete: { r: 58, g: 96, b: 58 },
    automne: { r: 60, g: 98, b: 60 },
    hiver: { r: 54, g: 90, b: 56 },
  },
  // Brun-rouge : c'est à ça qu'on le reconnaît, feuilles ou pas.
  fruit: {
    // L'arbouse : rouge-orangé, granuleuse, de la taille d'une petite fraise.
    // Elle mûrit en NOVEMBRE, en même temps que la floraison suivante — c'est
    // la signature de l'espèce, et le moteur la porte (`recolteWeek: 46`).
    forme: "charnu",
    couleur: { r: 208, g: 76, b: 44 },
    longueurM: 0.02,
    parRameau: 3,
    // arbouses par petits groupes pendants : le groupe a sa dimension propre, et ce n'est pas
    // une fonction de la taille de la baie.
    grappeM: 0.035,
  },
  ecorce: { r: 152, g: 82, b: 62 },
  references: [
    "Quézel & Médail, Écologie et biogéographie des forêts méditerranéennes — Arbutus unedo",
    "Rameau et al., Flore forestière française, t. 3 — région méditerranéenne, Arbutus unedo",
    "Quézel & Médail, Écologie et biogéographie des forêts du bassin méditerranéen",
  ],
};
