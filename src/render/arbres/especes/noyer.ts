/**
 * Noyer commun — *Juglans regia*. Famille : **feuillu de futaie**.
 *
 * Arrivé avec l'allélopathie (#49) : c'est l'espèce qui empêche les autres de
 * pousser chez elle, et le joueur doit pouvoir la **reconnaître** pour comprendre
 * pourquoi le dessous de son houppier reste nu. Une fiche générique en aurait
 * fait un feuillu de plus, et la leçon du juglone serait passée inaperçue.
 *
 * Trois signes, et ils tiennent ensemble :
 *
 *  - **un houppier clair et large.** Le noyer de plein vent porte peu de
 *    branches, très grosses, très écartées, sur un fût court. On voit le ciel à
 *    travers, ce qui est rare chez un feuillu de cette taille — et c'est ce que
 *    dit `densite`, la plus basse des feuillus de futaie de l'atlas ;
 *  - **la feuille composée**, cinq à neuf folioles sur un pétiole épais. Elle
 *    le range avec le frêne et le sureau, dont il se sépare par le port : le
 *    frêne monte en éventail, le sureau est un buisson, le noyer s'étale bas ;
 *  - **l'écorce gris pâle**, presque argentée chez le jeune sujet, nettement
 *    plus claire que celle du châtaignier ou des chênes.
 *
 * Ce que la fiche ne règle **pas**, et c'est voulu : le noyer débourre tard et
 * perd ses feuilles tôt — sa saison est courte. Ça vient de la part foliaire
 * que le moteur calcule (`partFoliaireOmbrageanteDans`), comme pour le frêne,
 * et non d'un réglage d'ici.
 */
import type { FicheGraphique } from "../fiche";

export const NOYER: FicheGraphique = {
  especeId: "juglans_regia",
  port: "boule",
  branchement: {
    // Très ouvert : le noyer de plein vent étale ses charpentières à
    // l'horizontale, bien plus que le frêne qui les tient montantes.
    angleDeg: 62,
    // Alterne, donc la divergence des feuillus ordinaires.
    divergenceDeg: 137,
    ratioLongueur: 0.74,
    // Faible : le noyer n'a pas de flèche qui domine longtemps, il fourche tôt
    // et fait un houppier aussi large que haut.
    dominance: 0.3,
    // **Trois**, et l'essai des houppiers me l'a imposé : à deux — donc la flèche
    // plus **une** latérale — le houppier du noyer penchait d'un côté (excentricité
    // 0,46 pour une limite de 0,25). C'est exactement le piège que
    // `Branchement` documente : un arbre qui fourche tôt n'a pas assez de nœuds
    // pour s'équilibrer en moyenne, et il faut la paire.
    branchesParNoeud: 3,
    // Branches **épaisses**, qui s'affinent peu : c'est une part de ce qui donne
    // au noyer son air massif malgré un houppier clair.
    conicite: 0.82,
    tortuosite: 0.24,
  },
  // La densité la plus basse des feuillus de futaie : on voit à travers.
  feuillage: { forme: "composee", feuillesParBouquet: 3, longueurFeuilleM: 0.28, densite: 0.54 },
  couleurs: {
    // Le débourrement du noyer est bronzé avant de verdir — d'où un printemps
    // plus chaud que celui des autres feuillus.
    printemps: { r: 146, g: 158, b: 84 },
    ete: { r: 92, g: 118, b: 70 },
    // Il jaunit peu et tombe tôt : un jaune terne, vite brun.
    automne: { r: 170, g: 156, b: 88 },
  },
  fruit: {
    // Le **brou**, et non la noix : ce qu'on voit sur l'arbre est une drupe verte
    // et lisse, de la taille d'une petite prune. La noix elle-même n'apparaît
    // qu'au sol, une fois le brou fendu et noirci — même distinction que la
    // bogue du châtaignier.
    forme: "charnu",
    // **Jaune-vert et non vert, et la planche l'a imposé** : au vert du brou sur
    // l'arbre (118, 142, 74), le fruit disparaissait dans le feuillage — un
    // fruit qu'on ne distingue pas ne dit pas « il y a quelque chose à
    // récolter », qui est toute la question que cette planche pose. Et le jaune
    // est honnête au moment où le rendu le dessine : cette planche montre le
    // fruit **mûr**, et un brou mûr jaunit avant de se fendre.
    couleur: { r: 186, g: 194, b: 106 },
    longueurM: 0.045,
    parRameau: 2,
  },
  // Gris pâle, presque argenté chez le jeune ; il se fissure en long avec l'âge.
  ecorce: { r: 148, g: 144, b: 132 },
  references: [
    "Rameau et al., Flore forestière française, t. 1 — Juglans regia",
    "Ducousso & Bordacs (2004), EUFORGEN Technical Guidelines — Juglans regia",
  ],
};
