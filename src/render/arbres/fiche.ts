/**
 * La **fiche graphique** d'une espèce : ce qu'il faut savoir pour la dessiner
 * (docs/interface-visuelle.md §4).
 *
 * **Ce fichier est écrit AVANT les vingt-cinq fiches, et c'est une consigne
 * explicite du lot L0** : « à écrire dans la structure de la fiche avant les
 * vingt-cinq fiches, sinon on les écrit deux fois ». La pointe technique a
 * montré qu'un paramètre manquant ici ne se rattrape pas en réglant les
 * autres — il faut retoucher les vingt-cinq.
 *
 * **Les trois enseignements de L0 que cette structure encode :**
 *
 * 1. **L'enveloppe du houppier n'émerge PAS du branchement.** C'est le
 *    résultat le plus coûteux de L0, et il est contre-intuitif : on croit
 *    qu'en réglant l'angle et la dominance on obtient un cône, une boule ou un
 *    gobelet. Non. À 0,85 de dominance apicale, le bouleau fait une touffe au
 *    sommet d'un bâton ; aucun réglage d'angle sur un port fourchu ne produit
 *    le cône d'un pin. L'enveloppe est donc un **champ**, `port`, et le
 *    générateur s'y conforme au lieu de l'espérer.
 * 2. **Les étages décroissent vers le sommet par contrainte, pas par
 *    espoir.** Sans écourtement explicite, un pin étagé fait une boule.
 * 3. **Le feuillage s'accroche à tout rameau TERMINAL**, pas au dernier ordre
 *    de récursion : une branche devient trop courte avant d'atteindre l'ordre
 *    maximal, et l'arbre sort nu. C'est une règle du générateur, mais elle
 *    contraint la fiche : `bouquetParRameau` et non `feuilleParRameau`.
 *
 * **Ce que la fiche N'EST PAS** : une source de vérité écologique. La hauteur
 * maximale, le ratio de houppier, la caducité et la marcescence vivent dans
 * `src/engine/especes.ts` et n'ont rien à faire ici — les dupliquer, c'est
 * organiser leur divergence. La fiche graphique ne porte que ce que le moteur
 * ne sait pas : la géométrie du port, le dessin de la feuille, les couleurs.
 *
 * Module **pur** : des données et des types, aucun tracé.
 */

import type { FormeFeuille } from "./feuilles";

/**
 * L'enveloppe du houppier. Six formes, et elles ne sont pas décoratives : ce
 * sont les six géométries que L0 a dû distinguer pour que les ports ne se
 * confondent pas.
 */
export type Port =
  /** cône : un axe droit, des étages qui raccourcissent — le jeune conifère */
  | "conique"
  /** boule : le houppier de plein vent, aussi large que haut */
  | "boule"
  /** gobelet : creux au centre, branches divergentes — le fruitier taillé */
  | "gobelet"
  /** étagé : verticilles presque horizontaux, plateau du vieux pin */
  | "etage"
  /** fastigié : tout dressé, plus haut que large — le peuplier, l'aulne */
  | "fastigie"
  /** retombant : les rameaux terminaux plongent — le bouleau, le saule */
  | "retombant";

/**
 * La géométrie du branchement. Sept nombres, et c'est le minimum : L0 a
 * montré qu'en dessous on ne sépare plus un bouleau d'un chêne.
 */
export interface Branchement {
  /**
   * Angle d'insertion d'une fille sur son axe, en degrés.
   *
   * Petit = port dressé et serré (aulne, peuplier) ; grand = port étalé
   * (pommier, chêne de plein vent).
   */
  angleDeg: number;
  /**
   * Écart d'angle entre les filles d'un même nœud, en degrés.
   *
   * C'est ce qui empêche les filles de se superposer. Zéro donnerait un
   * éventail plat, ce qu'aucun arbre ne fait.
   */
  divergenceDeg: number;
  /** Longueur d'une fille rapportée à celle de son axe ∈ ]0,1[. */
  ratioLongueur: number;
  /**
   * Dominance apicale ∈ [0,1] : de combien l'axe qui prolonge la flèche
   * l'emporte sur ses sœurs.
   *
   * **Le paramètre le plus traître de la liste.** À 0,85 le bouleau faisait
   * une touffe au sommet d'un bâton : il a fallu descendre à 0,62 ET ajouter
   * un ordre. Un fort chiffre ne donne pas un arbre élancé, il donne un mât.
   */
  dominance: number;
  /** Nombre de filles par nœud. Deux ou trois ; au-delà le compte explose. */
  branchesParNoeud: number;
  /** Conicité du fût : rapport diamètre au sommet / diamètre au pied ∈ ]0,1]. */
  conicite: number;
  /**
   * Tortuosité ∈ [0,1] : de combien un axe s'écarte de la ligne droite.
   *
   * Zéro pour un pin, fort pour un chêne pubescent — c'est une bonne part de
   * ce qui les sépare à l'œil.
   */
  tortuosite: number;
}

/**
 * Ce qui règle le feuillage. Séparé du branchement parce qu'un même squelette
 * porte un feuillage différent selon la saison et le stade.
 */
export interface Feuillage {
  /**
   * La forme du contour, dessinée à la main dans `feuilles.ts`.
   *
   * **C'est ce qui identifie l'espèce** (§4). Le port se confond vite — quatre
   * feuillus de futaie ont à peu près la même ramure — mais la feuille
   * tronquée de l'aulne ou la cordée du noisetier ne se confondent avec rien.
   */
  forme: FormeFeuille;
  /**
   * Nombre de feuilles par bouquet terminal.
   *
   * **Un BOUQUET par rameau, pas une feuille** : L0 a montré qu'une feuille
   * par rameau donne une brindille décorée, pas une masse foliaire.
   */
  feuillesParBouquet: number;
  /** Longueur d'une feuille, en mètres — oui, en mètres : tout est à l'échelle. */
  longueurFeuilleM: number;
  /**
   * Densité relative du houppier ∈ [0,1] : combien de rameaux terminaux
   * portent effectivement un bouquet.
   *
   * C'est ce qui sépare le houppier transparent d'un bouleau de la masse
   * opaque d'un hêtre, à squelette comparable.
   */
  densite: number;
}

/** Une couleur, dans la même forme que le reste du rendu. */
export interface Teinte {
  r: number;
  g: number;
  b: number;
}

/**
 * Les couleurs de feuillage aux quatre saisons.
 *
 * Quatre points et non une fonction : l'interpolation est l'affaire du rendu,
 * qui la fait déjà pour le sol, et quatre valeurs se relisent alors qu'une
 * courbe ne se relit pas.
 */
export interface CouleursFeuillage {
  /** débourrement : le vert tendre, souvent le plus clair de l'année */
  printemps: Teinte;
  ete: Teinte;
  /** la couleur de sénescence — c'est elle qui fait octobre */
  automne: Teinte;
  /** persistants et marcescents seulement ; absent = l'arbre est nu */
  hiver?: Teinte;
}

/**
 * La fiche graphique complète d'une espèce.
 *
 * `especeId` fait le lien avec `src/engine/especes.ts`. Un test vérifie que
 * toute fiche graphique désigne une espèce qui existe, et qu'aucune ne
 * redéclare une grandeur que le moteur porte déjà.
 */
export interface FicheGraphique {
  especeId: string;
  port: Port;
  /**
   * Nombre de brins d'une cépée ; absent = un fût unique.
   *
   * **Une cépée n'est pas un petit arbre**, et le générateur ne l'obtient pas
   * en réglant les autres paramètres — c'est le même constat que pour
   * l'enveloppe, à un autre endroit. Un noisetier, un sureau, un aulne de
   * ripisylve partent du SOL en plusieurs brins arqués, sans fût. Sans ce
   * champ, un noisetier et un pommier taillé en gobelet sortent identiques :
   * mesuré, ils l'étaient exactement, au segment près.
   *
   * C'est aussi ce qui rendra le **recépage** lisible au lot L4 : l'action
   * multiplie les brins et les raccourcit, elle ne remplace pas l'arbre.
   */
  brinsDeCepee?: number;
  branchement: Branchement;
  feuillage: Feuillage;
  couleurs: CouleursFeuillage;
  /** couleur du fût — c'est la signature du bouleau et de l'arbousier */
  ecorce: Teinte;
  /**
   * Couleur du haut du fût, quand elle diffère.
   *
   * Le pin sylvestre a le bas gris crevassé et **le haut orangé** : c'est sa
   * signature, et sans ce champ on dessine un pin quelconque.
   */
  ecorceHaute?: Teinte;
  /**
   * Les sources du dessin.
   *
   * **Au même titre que les valeurs du moteur sont sourcées** (§4). Une fiche
   * sans référence est une fiche inventée, et on ne saura pas laquelle.
   */
  references: readonly string[];
}
