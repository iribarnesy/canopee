/**
 * Callune — *Calluna vulgaris*. Famille : **fourré bas**.
 *
 * « Tapis violet ras en fin d'été » (§5.4). C'est la plus basse de l'atlas — un
 * tapis de vingt à cinquante centimètres — et la seule dont la SAISON est le
 * trait principal : verte-grise onze mois, puis violette en août-septembre,
 * assez franchement pour qu'une lande change de couleur d'un instantané à
 * l'autre.
 */
import type { FicheGraphique } from "../fiche";

export const CALLUNE: FicheGraphique = {
  especeId: "calluna_vulgaris",
  fourre: true,
  port: "boule",
  branchement: {
    angleDeg: 30,
    divergenceDeg: 137,
    ratioLongueur: 0.7,
    dominance: 0.35,
    branchesParNoeud: 3,
    conicite: 0.92,
    tortuosite: 0.25,
  },
  feuillage: { forme: "aiguille", feuillesParBouquet: 9, longueurFeuilleM: 0.008, densite: 0.98 },
  couleurs: {
    printemps: { r: 96, g: 110, b: 74 },
    ete: { r: 88, g: 102, b: 68 },
    // **Le violet de la floraison**, qui est ce qu'on retient d'une lande. Il
    // arrive par la couleur d'automne parce que la callune fleurit en fin
    // d'été — le calendrier vient du moteur, pas d'ici.
    automne: { r: 146, g: 100, b: 134 },
    hiver: { r: 92, g: 88, b: 72 },
  },
  ecorce: { r: 88, g: 78, b: 62 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Calluna vulgaris",
    "Conservatoire botanique de Brest — landes à callune, floraison d'août",
  ],
};
