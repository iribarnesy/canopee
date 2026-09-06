/**
 * Saule blanc — *Salix alba*. Famille : **ripisylve**.
 *
 * Le second arbre des bords d'eau avec l'aulne, et il ne lui ressemble pas :
 * là où l'aulne est dressé, étroit et sombre, le saule blanc est **large,
 * retombant et argenté**. Sa feuille étroite, blanchâtre au revers, donne au
 * houppier entier un ton clair qui le distingue à distance — c'est de là que
 * vient son nom.
 *
 * Souvent conduit en trogne dans le bocage : c'est l'essence sur laquelle le
 * geste d'étêtage se lit le mieux, et le moteur porte déjà `teteTrogneM`.
 */
import type { FicheGraphique } from "../fiche";

export const SAULE_BLANC: FicheGraphique = {
  especeId: "salix_alba",
  port: "retombant",
  branchement: {
    angleDeg: 46,
    divergenceDeg: 137,
    ratioLongueur: 0.74,
    dominance: 0.4,
    branchesParNoeud: 3,
    conicite: 0.88,
    tortuosite: 0.32,
  },
  feuillage: { forme: "lanceolee", feuillesParBouquet: 6, longueurFeuilleM: 0.09, densite: 0.7 },
  couleurs: {
    // Argenté : le revers blanchâtre des feuilles éclaircit tout le houppier,
    // et c'est ce qui le distingue de l'aulne à cinquante mètres.
    printemps: { r: 158, g: 182, b: 122 },
    ete: { r: 122, g: 148, b: 100 },
    automne: { r: 178, g: 172, b: 104 },
  },
  ecorce: { r: 108, g: 96, b: 78 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Salix alba",
    "Guide des haies bocagères (CAUE) — conduite du saule en trogne",
  ],
};
