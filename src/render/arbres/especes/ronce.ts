/**
 * Ronce — *Rubus fruticosus*. Famille : **fourré bas**.
 *
 * « Masse hérissée, mûres » (§5.4). C'est l'espèce la plus abondante d'une
 * friche à l'an 30, et celle qui décide si un coin est praticable — ce que le
 * joueur lit d'un roncier, c'est une SURFACE à débroussailler, pas des tiges à
 * compter.
 *
 * Dessinée par cellule agrégée (`fourre.ts`), donc ni port ni branchement : ce
 * qui la fait reconnaître, c'est un profil bas et bosselé hérissé de pointes,
 * et rien d'autre à cette échelle.
 */
import type { FicheGraphique } from "../fiche";

export const RONCE: FicheGraphique = {
  especeId: "rubus_fruticosus",
  fourre: true,
  port: "boule",
  branchement: {
    angleDeg: 50,
    divergenceDeg: 137,
    ratioLongueur: 0.7,
    dominance: 0.2,
    branchesParNoeud: 3,
    conicite: 0.9,
    tortuosite: 0.6,
  },
  feuillage: { forme: "lobee", feuillesParBouquet: 3, longueurFeuilleM: 0.09, densite: 0.94 },
  couleurs: {
    printemps: { r: 118, g: 152, b: 78 },
    // Vert sombre et mat : une ronce ne brille pas.
    ete: { r: 72, g: 100, b: 58 },
    // Elle rougit par plaques avant de tomber.
    automne: { r: 132, g: 96, b: 70 },
    // **Pas de couleur d'hiver, alors qu'une ronce est semi-persistante en
    // vrai.** Le moteur la déclare `caduc: true` sans rétention hivernale
    // (`especes.ts`), et c'est lui qui calcule l'ombre portée : lui donner un
    // feuillage d'hiver ici ferait dire deux choses différentes à l'écran et au
    // modèle, et personne ne saurait laquelle croire. Si la ronce doit garder
    // ses feuilles, c'est la fiche écologique qu'il faut corriger, pas
    // celle-ci — un test le vérifie dans les deux sens.
  },
  ecorce: { r: 96, g: 82, b: 68 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Rubus fruticosus agg.",
    "Guide des milieux ouverts (CBN) — dynamique du roncier en friche",
  ],
};
