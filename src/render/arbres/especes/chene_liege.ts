/**
 * Chêne-liège — *Quercus suber*. Famille : **sempervirent méditerranéen**.
 *
 * Écorce **épaisse et crevassée**, gris clair — le liège — qui devient
 * **ocre-rouge vif après démasclage** et grisonne ensuite sur quelques années.
 * C'est le seul arbre du jeu dont le tronc change de couleur par une action du
 * joueur, et `derniereLeveeSemaine` du protocole existe pour ça.
 *
 * Feuille petite, coriace, persistante, souvent un peu enroulée sur les bords ;
 * houppier large et bas, tortueux, typique d'un arbre de plein vent qui a
 * poussé sans concurrence. D'où la faible dominance et la forte tortuosité.
 */
import type { FicheGraphique } from "../fiche";

export const CHENE_LIEGE: FicheGraphique = {
  especeId: "quercus_suber",
  port: "boule",
  branchement: {
    angleDeg: 58,
    divergenceDeg: 128,
    ratioLongueur: 0.68,
    // Faible : le chêne-liège fourche bas et souvent. Il n'a pas de flèche.
    dominance: 0.28,
    branchesParNoeud: 3,
    conicite: 0.78,
    // Forte : les branches serpentent, c'est une bonne part de la silhouette.
    tortuosite: 0.52,
  },
  feuillage: { forme: "coriace", feuillesParBouquet: 6, longueurFeuilleM: 0.045, densite: 0.78 },
  couleurs: {
    printemps: { r: 116, g: 146, b: 84 },
    ete: { r: 82, g: 110, b: 68 },
    automne: { r: 80, g: 106, b: 66 },
    hiver: { r: 76, g: 100, b: 64 },
  },
  // Le liège en place : gris clair, très clair pour une écorce.
  ecorce: { r: 158, g: 148, b: 132 },
  references: [
    "Rameau et al., Flore forestière française, t. 2 — Quercus suber",
    "Institut méditerranéen du liège — cycle de démasclage et couleur du tronc",
  ],
};
