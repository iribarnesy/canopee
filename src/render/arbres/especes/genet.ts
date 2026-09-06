/**
 * Genêt à balais — *Cytisus scoparius*. Famille : **fourré bas**.
 *
 * « Rameaux verts dressés, fleurs jaunes » (§5.4). Ce qui le sépare de l'ajonc,
 * avec lequel il partage la couleur et le milieu : le genêt est **dressé et
 * lisse** là où l'ajonc est en boule et piquant. Ses rameaux sont verts — c'est
 * eux qui photosynthétisent, pas ses feuilles minuscules — donc sa masse reste
 * verte même défeuillée.
 */
import type { FicheGraphique } from "../fiche";

export const GENET: FicheGraphique = {
  especeId: "cytisus_scoparius",
  fourre: true,
  port: "fastigie",
  branchement: {
    angleDeg: 22,
    divergenceDeg: 137,
    ratioLongueur: 0.76,
    dominance: 0.5,
    branchesParNoeud: 2,
    conicite: 0.94,
    tortuosite: 0.12,
  },
  feuillage: { forme: "lanceolee", feuillesParBouquet: 4, longueurFeuilleM: 0.02, densite: 0.7 },
  couleurs: {
    printemps: { r: 108, g: 142, b: 72 },
    ete: { r: 92, g: 124, b: 62 },
    // Il reste vert : ce sont ses RAMEAUX qui portent la chlorophylle.
    automne: { r: 88, g: 118, b: 60 },
    hiver: { r: 84, g: 112, b: 58 },
  },
  ecorce: { r: 96, g: 116, b: 62 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Cytisus scoparius",
    "Flore de Coste — rameaux chlorophylliens du genêt à balais",
  ],
};
