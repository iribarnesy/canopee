/**
 * Bouleau verruqueux — *Betula pendula*. Famille : **pionnier léger**.
 *
 * « Le plus facile à reconnaître de la liste » (§5.4), et il l'est par deux
 * traits qu'aucune autre essence de l'atlas ne partage : l'**écorce blanche à
 * lenticelles noires**, et les **rameaux retombants** — d'où `pendula`, et
 * d'où le port `retombant`.
 *
 * **C'est cette fiche qui a coûté le plus cher au lot L0.** À 0,85 de dominance
 * apicale, le générateur en faisait *une touffe au sommet d'un bâton* : il a
 * fallu descendre à 0,62 ET ajouter un ordre de récursion. Le chiffre ci-dessous
 * est celui-là, et il ne doit pas être « corrigé » vers le haut au prétexte que
 * le bouleau est élancé — c'est précisément l'erreur qui a été faite.
 *
 * Le houppier est **transparent** : densité 0,45. Le bouleau est l'essence la
 * plus héliophile et la moins ombrageante de l'atlas, et on doit voir le ciel
 * au travers.
 */
import type { FicheGraphique } from "../fiche";

export const BOULEAU: FicheGraphique = {
  especeId: "betula_pendula",
  port: "retombant",
  branchement: {
    angleDeg: 38,
    divergenceDeg: 144,
    ratioLongueur: 0.7,
    // 0,62 et pas davantage : voir l'en-tête. Mesuré au lot L0.
    dominance: 0.62,
    branchesParNoeud: 3,
    conicite: 0.9,
    tortuosite: 0.22,
  },
  feuillage: {
    forme: "triangulaire",
    feuillesParBouquet: 4,
    longueurFeuilleM: 0.05,
    densite: 0.45,
  },
  couleurs: {
    printemps: { r: 154, g: 190, b: 96 },
    ete: { r: 104, g: 146, b: 70 },
    // Le jaune d'or du bouleau, bref et franc.
    automne: { r: 208, g: 176, b: 70 },
  },
  // Blanc, et c'est un problème de palette autant qu'une signature : sur un sol
  // clair il DISPARAÎT (contrainte L0). Ou le sol reste soutenu, ou le fût
  // reçoit un liseré sombre ; il n'y a pas de troisième option.
  //
  // Ramené de 236 à 212, parce que le problème s'est présenté par l'autre bout :
  // sur une friche à l'an 30 — où le bouleau est l'essence dominante — un blanc
  // presque pur donnait une forêt de bâtons éclatants sur un sol sombre, et on
  // ne voyait plus que les troncs. Le bouleau reste le fût le plus clair de
  // l'atlas, ce qui est sa signature ; il cesse d'être le seul objet lumineux
  // de l'image.
  ecorce: { r: 212, g: 209, b: 198 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Betula pendula",
    "Lot L0, planche de silhouettes : dominance ramenée de 0,85 à 0,62",
  ],
};
