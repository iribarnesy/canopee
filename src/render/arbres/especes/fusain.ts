/**
 * Fusain d'Europe — *Euonymus europaeus*. Famille : **arbuste grêle de lisière**.
 *
 * Le plus léger de la haie : quelques brins fins, dressés, à rameaux VERTS et
 * nettement quadrangulaires, et un houppier qu'on traverse du regard. C'est
 * l'écorce qui le trahit hors saison, et elle est ici franchement verdâtre —
 * le seul fût de l'atlas dans ce cas avec le genêt.
 *
 * Puis vient octobre, et il devient l'arbuste le plus voyant du bocage : la
 * feuille passe au **rouge sang** pendant que les fruits roses à quatre lobes
 * s'ouvrent sur des graines orange. La couleur d'automne porte donc ici plus
 * d'information d'identification que la forme de la feuille.
 */
import type { FicheGraphique } from "../fiche";

export const FUSAIN: FicheGraphique = {
  especeId: "euonymus_europaeus",
  port: "gobelet",
  brinsDeCepee: 4,
  branchement: {
    angleDeg: 42,
    divergenceDeg: 90,
    ratioLongueur: 0.74,
    dominance: 0.26,
    // Trois : la flèche et une paire de latérales opposées — le fusain a
    // les rameaux opposés, et ses quatre angles avec.
    branchesParNoeud: 3,
    conicite: 0.86,
    tortuosite: 0.24,
  },
  // La plus basse de l'atlas hors fourré : on voit à travers un fusain.
  feuillage: { forme: "lanceolee", feuillesParBouquet: 3, longueurFeuilleM: 0.06, densite: 0.52 },
  couleurs: {
    printemps: { r: 132, g: 166, b: 92 },
    ete: { r: 88, g: 120, b: 68 },
    // Rouge sang : c'est ce qui le fait repérer d'un bout du champ à l'autre.
    automne: { r: 198, g: 96, b: 86 },
  },
  // Verdâtre : les jeunes rameaux du fusain sont verts et à quatre angles.
  ecorce: { r: 104, g: 116, b: 86 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Euonymus europaeus",
    "Jacamon, Guide de dendrologie — rameaux quadrangulaires du fusain",
  ],
};
