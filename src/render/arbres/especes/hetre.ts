/**
 * Hêtre commun — *Fagus sylvatica*. Famille : **feuillu de futaie**.
 *
 * Ce qui doit se reconnaître, dans l'ordre où l'œil l'attrape :
 * le **fût lisse gris argenté**, sans crevasse, qui monte droit et longtemps ;
 * le **houppier dense et bas branchu**, opaque au point qu'il ne pousse rien
 * dessous ; la feuille ovale luisante, ondulée sur le bord, et sa **couleur
 * d'automne cuivrée** qui tient longtemps (le jeune hêtre est marcescent).
 *
 * La densité de 0,92 n'est pas un réglage esthétique : le hêtre est l'essence
 * la plus sciaphile de l'atlas, son houppier laisse passer très peu de lumière,
 * et le moteur le sait déjà (`lumiere.lai = 5`, `compensation = 0.03`). Ce que
 * le dessin montre doit être ce que la simulation calcule.
 */
import type { FicheGraphique } from "../fiche";

export const HETRE: FicheGraphique = {
  especeId: "fagus_sylvatica",
  port: "boule",
  branchement: {
    angleDeg: 48,
    divergenceDeg: 137,
    ratioLongueur: 0.74,
    // Modérée : le hêtre de futaie file droit, mais en plein vent il fourche
    // bas. C'est le même arbre, et c'est la dominance moyenne qui donne les
    // deux selon la hauteur atteinte.
    dominance: 0.5,
    branchesParNoeud: 3,
    conicite: 0.86,
    tortuosite: 0.18,
  },
  feuillage: { forme: "ovale", feuillesParBouquet: 5, longueurFeuilleM: 0.09, densite: 0.92 },
  couleurs: {
    printemps: { r: 138, g: 176, b: 84 },
    ete: { r: 66, g: 104, b: 52 },
    // Le cuivre de novembre, la couleur la plus reconnaissable d'une hêtraie.
    automne: { r: 168, g: 106, b: 52 },
    // Marcescent jeune : les feuilles mortes tiennent tout l'hiver.
    hiver: { r: 148, g: 116, b: 82 },
  },
  // Gris argenté LISSE : c'est la signature, et elle ne se lit que si le sol
  // reste soutenu (contrainte L0 sur la palette).
  ecorce: { r: 148, g: 148, b: 140 },
  references: [
    "Rameau, Mansion & Dumé, Flore forestière française, t. 1 — port et écorce",
    "Roloff, Bäume — architecture du houppier de Fagus sylvatica",
  ],
};
