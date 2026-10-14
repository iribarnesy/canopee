/**
 * Noyer hybride — *Juglans × intermedia*. Famille : **feuillu de futaie**.
 *
 * Entré à l'atlas du moteur pour le bois (#213), il avait d'abord une fiche
 * d'attente : le dessin du commun, sans fruit et la flèche plus dominante. Ce
 * qu'elle devient ici (#376), c'est ce que les sources donnent pour le
 * reconnaître, et elles le placent **à côté du commun, pas loin de lui** : même
 * famille, même écorce pâle, même feuille composée — c'est par le compte des
 * folioles et par la conduite de l'arbre qu'il s'en sépare.
 *
 *  - **la feuille**, d'abord : onze à vingt-trois folioles contre cinq à neuf
 *    chez le commun, la terminale très marquée (Le Mesle & Trembleau 2023).
 *    C'est le signe qui ne trompe pas, et c'est `folioles` qui le porte : une
 *    plume là où le commun montre une main, et de loin un bouquet plus étiré
 *    (`portDuBouquet`) ;
 *  - **une flèche qui domine** : les hybrides ont « une meilleure dominance de
 *    la cime » que le commun et sont « moins sensibles au phototropisme »
 *    (Coello et al. 2013). L'un donne un axe qui monte au lieu de fourcher tôt,
 *    l'autre un axe moins tordu par la recherche de la lumière ;
 *  - **pas de fruit** : il est planté pour le bois, le moteur ne suit pas sa
 *    fructification, et une fiche ne dessine un fruit que si le moteur en suit
 *    un.
 *
 * **Ce que la fiche ne porte pas, parce que le moteur le porte.** La hauteur
 * (35 m contre 25 pour le commun) et le rayon du houppier viennent de
 * `especes.ts`. Le **fût élagué** — « généralement entre 3 et 6 m » pour les
 * noyers à bois (Coello 2013 ; les quatre à six mètres du même guide sont ceux
 * du frêne et de l'alisier) — est une base de houppier (`baseHouppierM`), que
 * le moteur fait monter par l'élagage du joueur ou par l'ombre : un trait de
 * conduite et non d'espèce, le même hybride est branchu jusqu'en bas s'il
 * pousse seul en pré. Et le **houppier dégagé** du fichier
 * wallon — « héliophile, exigeant en espace vital » — est une distance aux
 * voisins, c'est-à-dire un espacement de plantation que le joueur choisit.
 *
 * **Ce qu'elle ne sait pas dire.** Le contour de la foliole est celui de toutes
 * les feuilles composées de l'atlas : sa forme « intermédiaire entre les deux
 * parents » et son bord « plus progressivement denté que celui du noyer noir »
 * (CNPF 2023) ne se dessinent pas — `feuilles.ts` ne trace pas les dents une à
 * une, et à la taille où une foliole s'affiche, un ou deux pixels, elles ne se
 * verraient pas. La terminale est dessinée la plus grande, comme pour toute
 * feuille composée ; la fiche ne sait pas dire qu'elle l'est davantage ici.
 */
import type { FicheGraphique } from "../fiche";
import { NOYER } from "./noyer";

export const NOYER_HYBRIDE: FicheGraphique = {
  especeId: "juglans_x_intermedia",
  // Une boule, comme le commun : le houppier d'un noyer est aussi large que
  // haut, et c'est le moteur qui en donne le rayon. L'hybride ne s'en distingue
  // pas par l'enveloppe mais par ce qu'il y a dedans — un axe qui monte.
  port: "boule",
  branchement: {
    // Repris du commun : aucune source ne dit que ses charpentières s'insèrent
    // autrement. La taille de formation retire les fourches et les branches
    // **redressées** (Coello 2013) — elle garde les étalées, donc rien ne
    // pousse à refermer l'angle.
    angleDeg: NOYER.branchement.angleDeg,
    divergenceDeg: NOYER.branchement.divergenceDeg,
    ratioLongueur: NOYER.branchement.ratioLongueur,
    // **0,45 au lieu de 0,3** : « une meilleure dominance de la cime » (Coello
    // 2013). La valeur est un réglage, pas une mesure — assez pour que la
    // flèche monte jusqu'en haut du houppier là où celle du commun se perd
    // dans ses fourches, assez peu pour ne pas faire un mât (le piège que
    // `Branchement.dominance` documente).
    dominance: 0.45,
    // Trois, comme le commun, et pour la même raison : à deux, un houppier ne
    // s'équilibre qu'en moyenne, sur plus de nœuds qu'il n'en a.
    branchesParNoeud: NOYER.branchement.branchesParNoeud,
    conicite: NOYER.branchement.conicite,
    // **Moins tortueux que le commun** (0,24), parce que « moins sensible au
    // phototropisme » (Coello 2013) : un axe qui se tord moins vers la lumière.
    // Réglage, comme la dominance — c'est le sens de l'écart qui est sourcé,
    // pas sa grandeur.
    tortuosite: 0.16,
  },
  feuillage: {
    forme: "composee",
    // **Dix-sept, le milieu de la fourchette** de onze à vingt-trois (CNPF
    // 2023) : plus du double des cinq à neuf du commun, et assez pour que la
    // feuille se lise en plume à côté de la sienne.
    folioles: 17,
    // Trois, comme le commun : la pousse d'un noyer porte quelques grandes
    // feuilles, pas une rosette.
    feuillesParBouquet: 3,
    // **Plus longue que celle du commun** (0,28), et c'est une conséquence, pas
    // une mesure : aucune source ne donne la longueur de la feuille de
    // l'hybride. Elle porte plus de deux fois plus de folioles ; à longueur
    // égale, elles sortiraient d'un bon tiers plus petites que celles du
    // commun. Quarante centimètres leur rend à peu près sa taille — un
    // réglage, qui suppose des folioles comparables chez les deux noyers.
    longueurFeuilleM: 0.4,
    // Celle du commun, et cette fois c'est sourcé pour l'hybride lui-même : son
    // fichier écologique parle de son « couvert peu dense ». On voit le ciel à
    // travers les deux noyers.
    densite: NOYER.feuillage.densite,
  },
  // Les couleurs du commun : aucune source ne sépare le feuillage des deux
  // noyers, ni au débourrement ni à l'automne. C'est le moteur qui sépare leur
  // saison, s'il y a lieu (`phenologie`).
  couleurs: NOYER.couleurs,
  // Lisse dans le jeune âge, elle « rappelle celle du commun » (CNPF 2023) :
  // le même gris pâle, dit en le reprenant plutôt qu'en le recopiant.
  ecorce: NOYER.ecorce,
  references: [
    "Le Mesle & Trembleau (2023), Les noyers à bois, fiche essence 4, CNPF — feuille et écorce de l'hybride",
    "Coello, Becquey et al. (2013), Le noyer hybride et le noyer commun à bois, CPF Catalogne — dominance de la cime, phototropisme, hauteur élaguée",
    "Fichier écologique des essences (Wallonie), fiche Noyer hybride — couvert peu dense, héliophile, houppier dégagé",
  ],
};
