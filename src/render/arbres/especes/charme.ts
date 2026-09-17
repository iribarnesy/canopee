/**
 * Charme — *Carpinus betulus*. Famille : **feuillu de futaie** (sous-étage).
 *
 * « Le charme monte à la canopée, le houx tient l'ombre en dessous. » Le charme
 * est l'essence du sous-étage des chênaies, et deux traits le désignent : le
 * **fût cannelé** — une section qui n'est pas ronde mais godronnée, unique dans
 * l'atlas — et la **marcescence**, qui lui laisse ses feuilles brunes tout
 * l'hiver.
 *
 * Le fût cannelé ne se dessine pas à cette échelle ; ce qui reste, c'est un
 * houppier dense de sous-étage, une écorce gris clair lisse, et un feuillage
 * d'hiver que presque personne d'autre n'a. C'est ce dernier trait qui, en
 * janvier, le rend reconnaissable d'un coup d'œil.
 */
import type { FicheGraphique } from "../fiche";

export const CHARME: FicheGraphique = {
  especeId: "carpinus_betulus",
  port: "boule",
  branchement: {
    angleDeg: 44,
    divergenceDeg: 137,
    ratioLongueur: 0.73,
    dominance: 0.46,
    branchesParNoeud: 3,
    conicite: 0.84,
    tortuosite: 0.24,
  },
  feuillage: { forme: "ovale", feuillesParBouquet: 5, longueurFeuilleM: 0.08, densite: 0.88 },
  couleurs: {
    printemps: { r: 136, g: 174, b: 82 },
    ete: { r: 78, g: 112, b: 56 },
    automne: { r: 176, g: 140, b: 66 },
    // **Le trait qui le fait reconnaître en hiver** : marcescent, il garde ses
    // feuilles mortes jusqu'à ce que les bourgeons les poussent au printemps.
    hiver: { r: 156, g: 128, b: 92 },
  },
  ecorce: { r: 140, g: 138, b: 128 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Carpinus betulus",
    "Sikkema et al. (2016), Carpinus betulus in Europe — port et marcescence",
  ],
};
