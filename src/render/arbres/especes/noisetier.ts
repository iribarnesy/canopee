/**
 * Noisetier — *Corylus avellana*. Famille : **arbuste en cépée**.
 *
 * **Une cépée n'est pas un petit arbre**, et c'est ce que cette fiche doit
 * faire comprendre au générateur : pas de fût, des **brins arqués** qui partent
 * tous du sol et s'écartent. Le squelette l'obtient par un tronc quasi nul
 * (`houppierRatio` élevé côté moteur) et une dominance basse, qui empêche
 * qu'un brin l'emporte sur les autres.
 *
 * Grande feuille cordée, doublement dentée, un peu molle ; **chatons** pendants
 * dès février, avant tout le monde — c'est le premier signe du printemps dans
 * une haie de bocage.
 */
import type { FicheGraphique } from "../fiche";

export const NOISETIER: FicheGraphique = {
  especeId: "corylus_avellana",
  port: "gobelet",
  // Sept brins : une cépée de noisetier conduite, c'est cet ordre-là.
  brinsDeCepee: 7,
  branchement: {
    angleDeg: 34,
    divergenceDeg: 108,
    ratioLongueur: 0.72,
    // Basse : aucun brin ne domine, sinon la cépée devient un arbre.
    dominance: 0.18,
    branchesParNoeud: 3,
    conicite: 0.9,
    tortuosite: 0.28,
  },
  feuillage: { forme: "cordee", feuillesParBouquet: 4, longueurFeuilleM: 0.1, densite: 0.8 },
  couleurs: {
    printemps: { r: 130, g: 166, b: 82 },
    ete: { r: 86, g: 118, b: 62 },
    automne: { r: 190, g: 162, b: 76 },
  },
  fruit: {
    // La noisette se voit par son INVOLUCRE : une collerette frangée verte qui
    // dépasse du fruit, et qui est ce qu'on distingue avant la coque.
    forme: "cupule",
    couleur: { r: 158, g: 132, b: 84 },
    longueurM: 0.018,
    parRameau: 3,
    // noisettes par 1 à 4 : le groupe a sa dimension propre, et ce n'est pas
    // une fonction de la taille de la baie.
    grappeM: 0.04,
  },
  ecorce: { r: 122, g: 104, b: 84 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — involucre du Corylus avellana",
    "Rameau et al., Flore forestière française, t. 1 — Corylus avellana",
    "Guide des haies bocagères (CAUE) — conduite en cépée",
  ],
};
