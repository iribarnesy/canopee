/**
 * Le dessin des FRUITS, forme par forme (docs/interface-visuelle.md §4).
 *
 * Le pendant de `feuilles.ts`, et pour la même raison : la forme d'un fruit est
 * un fait botanique que le moteur ne porte pas et n'a aucune raison de porter —
 * il compte des kilos, pas des silhouettes. Elle vit donc dans la fiche
 * graphique, sourcée comme le reste.
 *
 * **Ce qui vient du moteur, en revanche, c'est l'ÉTAT**, et c'est lui qui décide
 * si l'on dessine quelque chose : `fruitProgress` dit où en est le fruit de
 * l'année, `fruitsKg` dit combien de kilos mûrs attendent la récolte. Aucun
 * fruit n'est dessiné sans que l'une des deux le dise, et le rendu n'invente ni
 * la date de floraison ni la maturité — il les lirait faux, et il les lirait
 * deux fois (`docs/interface-visuelle.md` §0, principe n° 1).
 *
 * **Conséquence assumée : trois espèces qui portent des fruits bien visibles
 * n'en auront pas à l'écran.** L'aubépine et ses cenelles, le houx et ses
 * baies rouges, le fusain et ses capsules roses — aucune des trois n'a de bloc
 * `fruits` dans `especes.ts`, donc le moteur ne suit pas leur fructification.
 * Leur en dessiner serait inventer un état. C'est visible, c'est dommage, et
 * c'est la bonne décision : un fruit peint sans état derrière ne se fanerait
 * jamais, ne se récolterait pas, et masquerait le fait qu'il manque quelque
 * chose au modèle.
 *
 * Module **pur** : des contours en coordonnées unitaires, aucun tracé.
 */

import type { Teinte } from "../palette";

/**
 * Les formes de fruits qu'on distingue.
 *
 * Peu nombreuses, et c'est voulu : à la taille où un fruit se lit, ce qui
 * l'identifie n'est pas son contour mais sa COULEUR et son GROUPEMENT. Une
 * cenelle et une prunelle ont la même silhouette ; l'une est rouge et solitaire,
 * l'autre bleu-noir et par deux. Multiplier les contours coûterait du code pour
 * une différence que l'œil ne voit pas à trois pixels.
 */
export type FormeFruit =
  /** un fruit charnu isolé : pomme, abricot, prunelle, cornouille, arbouse */
  | "charnu"
  /** une grappe ou un corymbe : sureau, troène — beaucoup de petits, groupés */
  | "grappe"
  /** une bogue épineuse : la châtaigne, et rien d'autre ici */
  | "bogue"
  /** un fruit sec à cupule : la noisette dans son involucre */
  | "cupule";

/** Ce qu'il faut savoir pour dessiner le fruit d'une espèce. */
export interface Fruit {
  forme: FormeFruit;
  /**
   * La couleur du fruit MÛR.
   *
   * Le fruit vert n'est pas déclaré : il s'obtient en interpolant vers
   * `FRUIT_VERT` selon l'avancement que le moteur donne. Déclarer les deux
   * inviterait à les faire diverger, et surtout la couleur du fruit vert ne
   * distingue à peu près aucune espèce.
   */
  couleur: Teinte;
  /** longueur du fruit, en mètres — comme la feuille, tout est à l'échelle */
  longueurM: number;
  /**
   * Nombre de fruits par rameau fructifère.
   *
   * Un pommier porte ses pommes une par une ou par deux ; un sureau porte des
   * corymbes de dizaines de baies. C'est ce nombre, plus que le contour, qui
   * fait qu'on reconnaît l'un de l'autre.
   */
  parRameau: number;
  /**
   * Diamètre réel du GROUPE de fruits porté par un rameau, en mètres.
   *
   * **Une dimension de plus, et elle était nécessaire — la déduire était une
   * erreur.** J'estimais d'abord la taille de l'amas depuis celle du fruit
   * (`√n × longueurFruit`), ce qui la sous-estime grossièrement pour les
   * petites baies : le calcul donnait deux pixels au corymbe d'un sureau là où
   * il en fait cinq, et le corymbe passait sous le seuil de dessin. Résultat,
   * la fonctionnalité ne marchait que pour la pomme et l'abricot.
   *
   * Or la taille d'un corymbe n'est pas une fonction de la taille de ses
   * baies : un corymbe de sureau fait dix à vingt centimètres, que ses baies
   * fassent cinq ou huit millimètres. C'est une grandeur botanique propre, elle
   * se déclare et se source comme les autres.
   *
   * Absent = le fruit se porte assez isolément pour que sa propre taille
   * suffise ; on retombe alors sur l'estimation.
   */
  grappeM?: number;
}

/**
 * La couleur d'un fruit qui n'est pas mûr : vert, et le même pour tous.
 *
 * Un fruit vert est un fruit vert — une pomme d'août et une prunelle d'août
 * sont toutes deux d'un vert mat que rien ne distingue à cette taille. C'est
 * précisément ce qui rend le mûrissement lisible : la couleur ARRIVE, et
 * l'arrivée est l'information.
 */
export const FRUIT_VERT: Teinte = { r: 118, g: 134, b: 82 };

/**
 * Part de rameaux terminaux qui portent des fruits.
 *
 * Pas tous, et de loin : un arbre fruitier ne fructifie que sur une fraction de
 * ses rameaux — les autres sont du bois de l'année ou des rameaux à bois. À un
 * sur cinq, un pommier chargé se lit comme chargé sans que le houppier
 * disparaisse sous les fruits.
 *
 * Ce n'est pas une grandeur du moteur et ça n'en usurpe pas une : le moteur dit
 * COMBIEN DE KILOS l'arbre porte, pas sur quels rameaux. Répartir cette masse
 * sur les rameaux est un travail de dessin, comme répartir le feuillage.
 */
export const PART_RAMEAUX_FRUITIERS = 0.2;

/**
 * Contour d'un fruit, en coordonnées unitaires : longueur 1, centré sur (0,0).
 *
 * Même convention que `contourFeuille` — le pédoncule est vers le haut, le
 * fruit pend en dessous.
 */
export function contourFruit(forme: FormeFruit): { x: number; y: number }[] {
  if (forme === "bogue") {
    // Une bogue est HÉRISSÉE, et c'est tout ce qui la distingue d'une pomme
    // verte à cette taille : une couronne de pointes autour d'une sphère.
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.5 : 0.32;
      points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return points;
  }
  if (forme === "cupule") {
    // La noisette et son involucre : une sphère coiffée d'une collerette
    // frangée, qui la dépasse. C'est la collerette qu'on voit.
    return [
      { x: -0.5, y: -0.18 },
      { x: -0.3, y: -0.42 },
      { x: -0.1, y: -0.2 },
      { x: 0.1, y: -0.44 },
      { x: 0.3, y: -0.2 },
      { x: 0.5, y: -0.16 },
      { x: 0.42, y: 0.24 },
      { x: 0.16, y: 0.5 },
      { x: -0.16, y: 0.5 },
      { x: -0.42, y: 0.24 },
    ];
  }
  // Charnu et grappe : une sphère, à peine plus haute que large. La différence
  // entre les deux se joue au NOMBRE (`parRameau`), pas au contour.
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    points.push({ x: Math.cos(a) * 0.48, y: Math.sin(a) * 0.5 });
  }
  return points;
}

/**
 * Diamètre du groupe de fruits d'un rameau, en MÈTRES.
 *
 * La fiche le déclare quand elle le connaît (`grappeM`) ; sinon on l'estime
 * depuis la taille du fruit et leur nombre, ce qui vaut pour un fruit porté
 * isolément — deux pommes sur un rameau occupent la place de deux pommes.
 *
 * L'estimation ne vaut PAS pour les petites baies groupées, et c'est
 * précisément pourquoi `grappeM` existe : un corymbe de sureau fait dix
 * centimètres, pas quatorze fois six millimètres.
 */
export function diametreDuGroupeM(fruit: Fruit): number {
  if (fruit.grappeM !== undefined) return fruit.grappeM;
  return 1.5 * Math.sqrt(fruit.parRameau) * fruit.longueurM;
}
