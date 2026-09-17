/**
 * Ajonc d'Europe — *Ulex europaeus*. Famille : **fourré bas**.
 *
 * « Boule épineuse jaune vif en fleur » (§5.4). Deux traits, et ils sont
 * extrêmes : la forme, une boule dense et piquante, et la couleur — l'ajonc en
 * fleur est **le jaune le plus saturé du jeu**, au point qu'une lande d'ajoncs
 * se repère à l'autre bout de la parcelle. C'est aussi la plante la plus
 * inflammable de l'atlas, et le rendu le laissera voir au lot L6.
 */
import type { FicheGraphique } from "../fiche";

export const AJONC: FicheGraphique = {
  especeId: "ulex_europaeus",
  fourre: true,
  port: "boule",
  branchement: {
    angleDeg: 44,
    divergenceDeg: 137,
    ratioLongueur: 0.68,
    dominance: 0.3,
    branchesParNoeud: 3,
    conicite: 0.9,
    tortuosite: 0.3,
  },
  // Les « feuilles » d'un ajonc adulte sont des ÉPINES : c'est ce qu'on dessine.
  feuillage: { forme: "aiguille", feuillesParBouquet: 7, longueurFeuilleM: 0.025, densite: 0.96 },
  couleurs: {
    // Le vert sombre presque noir d'un ajonc, sur lequel le jaune tranche.
    printemps: { r: 78, g: 104, b: 56 },
    ete: { r: 66, g: 92, b: 50 },
    automne: { r: 68, g: 92, b: 52 },
    hiver: { r: 62, g: 86, b: 48 },
  },
  ecorce: { r: 78, g: 74, b: 58 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Ulex europaeus",
    "Conservatoire botanique de Brest — landes à ajoncs, phénologie de floraison",
  ],
};
