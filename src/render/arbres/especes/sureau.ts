/**
 * Sureau noir — *Sambucus nigra*. Famille : **arbuste en cépée, grossier**.
 *
 * Le sureau pousse vite et mal : bois tendre, moelle épaisse, rameaux qui
 * cassent. Graphiquement, cela donne peu de segments TRÈS longs — le contraire
 * d'une aubépine — et un houppier lâche qu'on voit à travers.
 *
 * Sa signature est la **feuille composée** à cinq folioles, la plus grande de
 * la haie : vingt centimètres, portée par un pétiole raide. Elle et le corymbe
 * blanc de juin suffisent à le nommer de loin, ce qu'aucun autre arbuste
 * bocager ne permet.
 */
import type { FicheGraphique } from "../fiche";

export const SUREAU: FicheGraphique = {
  especeId: "sambucus_nigra",
  port: "gobelet",
  brinsDeCepee: 5,
  branchement: {
    angleDeg: 46,
    divergenceDeg: 180,
    // Long : le sureau fait des pousses d'un mètre dans l'année.
    ratioLongueur: 0.78,
    dominance: 0.22,
    // Deux : les rameaux du sureau sont OPPOSÉS, par paires.
    branchesParNoeud: 2,
    conicite: 0.88,
    tortuosite: 0.3,
  },
  // Lâche : le houppier d'un sureau se voit à travers, même en juillet.
  feuillage: { forme: "composee", feuillesParBouquet: 3, longueurFeuilleM: 0.2, densite: 0.6 },
  couleurs: {
    printemps: { r: 128, g: 164, b: 90 },
    ete: { r: 74, g: 108, b: 58 },
    // Le sureau ne flambe pas : il jaunit sale et tombe tôt.
    automne: { r: 158, g: 152, b: 86 },
  },
  ecorce: { r: 118, g: 106, b: 88 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Sambucus nigra",
    "Guide des haies bocagères (CAUE) — les arbustes à bois tendre",
  ],
};
