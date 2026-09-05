/**
 * La caméra : cadrage, zoom, quatre quarts de tour, et **l'emprise visible**
 * (docs/interface-visuelle.md §7).
 *
 * `projection.ts` sait passer d'un point de parcelle à un point d'écran. Il ne
 * sait pas ce qu'on regarde. C'est ici.
 *
 * **Pas de pan libre**, c'est décidé : on tourne autour de la parcelle, on ne
 * s'en éloigne pas. Il reste pourtant un CENTRE, et ce n'est pas une
 * contradiction — zoomer vers le curseur suppose de garder le point survolé
 * sous le curseur, donc de déplacer le centre. La différence avec un pan est
 * qu'il est borné à la parcelle : on ne peut pas cadrer le vide.
 *
 * **L'emprise visible est la raison d'être de ce module**, plus que le zoom. La
 * mesure du lot L0 a montré que le point de rupture n'est pas la parcelle
 * entière mais le zoom rapproché — parce que le banc dessinait l'hectare entier
 * à toutes les échelles. Une vraie caméra n'affiche qu'un morceau, et
 * `celluleVisibles()` est ce qui le dit. Découper par emprise n'est donc pas une
 * optimisation à rattraper : c'est la conclusion mesurée du lot précédent.
 *
 * Module **pur** : pas de canvas, pas de DOM, aucun état mutable.
 */

import {
  type Camera,
  METRE_VERTICAL_PX,
  type Orientation,
  type PointEcran,
  type PointParcelle,
  TUILE_HAUTEUR_PX,
  TUILE_LARGEUR_PX,
  versEcran,
  versParcelleAPlat,
} from "./projection";

/**
 * Largeur visée, en mètres de diagonale, au zoom le plus rapproché.
 *
 * « ~15 m de large » du §7 : de quoi voir un arbre entier et ses voisins
 * immédiats, ce qui est l'échelle à laquelle le détail d'illustration de D4 se
 * justifie.
 */
export const LARGEUR_MIN_VISIBLE_M = 15;

export interface Vue {
  /** ce que la projection a besoin de savoir */
  cam: Camera;
  /** point de la parcelle au centre de l'écran, en mètres (nord vrai) */
  centre: { x: number; y: number };
  largeurPx: number;
  hauteurPx: number;
}

/**
 * Zoom auquel la parcelle entière tient tout juste à l'écran. C'est le zoom le
 * plus large qu'on autorise : en dessous, on cadrerait du vide.
 *
 * `altitudeMaxM` compte, parce qu'une butte dépasse par le haut du losange.
 */
export function zoomMin(
  coteM: number,
  largeurPx: number,
  hauteurPx: number,
  altitudeMaxM = 0,
): number {
  const parLargeur = largeurPx / (coteM * TUILE_LARGEUR_PX);
  const parHauteur = hauteurPx / (coteM * TUILE_HAUTEUR_PX + altitudeMaxM * METRE_VERTICAL_PX);
  return Math.min(parLargeur, parHauteur);
}

/** Zoom le plus rapproché : `LARGEUR_MIN_VISIBLE_M` de diagonale plein écran. */
export function zoomMax(largeurPx: number): number {
  return (2 * largeurPx) / (TUILE_LARGEUR_PX * LARGEUR_MIN_VISIBLE_M);
}

/** La vue de départ : parcelle entière, orientation nord, centrée. */
export function vueInitiale(
  coteM: number,
  largeurPx: number,
  hauteurPx: number,
  altitudeMaxM = 0,
): Vue {
  return {
    cam: { coteM, zoom: zoomMin(coteM, largeurPx, hauteurPx, altitudeMaxM), orientation: 0 },
    centre: { x: coteM / 2, y: coteM / 2 },
    largeurPx,
    hauteurPx,
  };
}

/**
 * Parcelle → écran, en tenant compte du cadrage.
 *
 * `versEcran` de la projection place l'origine au sommet du losange ; ici on
 * ramène le CENTRE de la vue au milieu de l'écran. C'est la seule différence,
 * et c'est ce qui fait qu'aucun appelant n'a à connaître le décalage.
 */
export function versEcranVue(p: PointParcelle, vue: Vue): PointEcran {
  const point = versEcran(p, vue.cam);
  const centre = versEcran({ x: vue.centre.x, y: vue.centre.y, z: 0 }, vue.cam);
  return {
    sx: point.sx - centre.sx + vue.largeurPx / 2,
    sy: point.sy - centre.sy + vue.hauteurPx / 2,
  };
}

/** Écran → parcelle à plat, l'inverse exact de `versEcranVue` à `z` donné. */
export function versParcelleVue(e: PointEcran, vue: Vue, z = 0): PointParcelle {
  const centre = versEcran({ x: vue.centre.x, y: vue.centre.y, z: 0 }, vue.cam);
  return versParcelleAPlat(
    {
      sx: e.sx + centre.sx - vue.largeurPx / 2,
      sy: e.sy + centre.sy - vue.hauteurPx / 2,
    },
    vue.cam,
    z,
  );
}

/** Ramène le centre dans la parcelle : on ne cadre jamais le vide. */
function borner(centre: { x: number; y: number }, coteM: number): { x: number; y: number } {
  return {
    x: Math.min(coteM, Math.max(0, centre.x)),
    y: Math.min(coteM, Math.max(0, centre.y)),
  };
}

/**
 * Zoom à la molette, **vers le curseur** : le point de parcelle sous le curseur
 * y reste après le zoom. C'est ce qui fait qu'on zoome sur ce qu'on regarde et
 * non sur le milieu de la parcelle.
 *
 * Le zoom est borné des deux côtés, et le centre reste dans la parcelle. Au
 * zoom le plus large, il revient au milieu : on ne peut pas décadrer une
 * parcelle qui tient déjà entière à l'écran.
 */
export function zoomer(vue: Vue, facteur: number, curseur: PointEcran, altitudeMaxM = 0): Vue {
  const min = zoomMin(vue.cam.coteM, vue.largeurPx, vue.hauteurPx, altitudeMaxM);
  const max = zoomMax(vue.largeurPx);
  const zoom = Math.min(max, Math.max(min, vue.cam.zoom * facteur));
  if (zoom === vue.cam.zoom) return vue;

  // Le point de parcelle visé, AVANT le changement de zoom.
  const vise = versParcelleVue(curseur, vue);
  const zoomee: Vue = { ...vue, cam: { ...vue.cam, zoom } };
  if (zoom <= min) {
    return { ...zoomee, centre: { x: vue.cam.coteM / 2, y: vue.cam.coteM / 2 } };
  }
  // Où ce point tomberait sans bouger le centre, puis on corrige le centre de
  // l'écart — en coordonnées de parcelle, ce qui évite de raisonner en pixels.
  const apres = versParcelleVue(curseur, zoomee);
  return {
    ...zoomee,
    centre: borner(
      { x: vue.centre.x + (vise.x - apres.x), y: vue.centre.y + (vise.y - apres.y) },
      vue.cam.coteM,
    ),
  };
}

/**
 * Quart de tour. `sens` = +1 (horaire) ou −1.
 *
 * Le centre est exprimé en nord VRAI, donc il n'a pas à bouger : c'est la
 * projection qui applique l'orientation. C'est tout l'intérêt d'avoir mis la
 * rotation dans `projection.ts` plutôt que dans la caméra.
 */
export function tournerVue(vue: Vue, sens: 1 | -1): Vue {
  const orientation = (((vue.cam.orientation + sens) % 4) + 4) % 4;
  return { ...vue, cam: { ...vue.cam, orientation: orientation as Orientation } };
}

/** Rectangle de cellules à dessiner, bornes incluses. */
export interface Emprise {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Les cellules visibles à l'écran — **la fonction que L1 devait produire**.
 *
 * On inverse les quatre coins de l'écran vers la parcelle (à plat), on prend la
 * boîte englobante, et on l'élargit de ce qu'il faut pour ne rien perdre :
 *
 * - un objet HAUT dont le pied est sous le bord inférieur peut avoir sa cime à
 *   l'écran. Un mètre de hauteur remonte de `METRE_VERTICAL_PX` pixels, soit
 *   deux cellules de profondeur (`x + y`) puisqu'une cellule en vaut
 *   `TUILE_HAUTEUR_PX / 2`. D'où la marge de `2 × hauteurMaxM`, appliquée aux
 *   deux axes — c'est majorant, et une marge trop large ne coûte que quelques
 *   cellules cuites pour rien ;
 * - le relief joue dans le même sens, d'où `altitudeMaxM` compté avec.
 *
 * Rend `undefined` si rien de la parcelle n'est à l'écran, ce qui ne devrait pas
 * arriver puisque le centre est borné — mais un appelant qui l'ignore mérite de
 * le savoir plutôt que de dessiner une emprise vide.
 */
export function celluleVisibles(vue: Vue, hauteurMaxM = 0, altitudeMaxM = 0): Emprise | undefined {
  const coins: PointEcran[] = [
    { sx: 0, sy: 0 },
    { sx: vue.largeurPx, sy: 0 },
    { sx: 0, sy: vue.hauteurPx },
    { sx: vue.largeurPx, sy: vue.hauteurPx },
  ];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const coin of coins) {
    const p = versParcelleVue(coin, vue);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const marge = 2 * (hauteurMaxM + altitudeMaxM);
  const x0 = Math.max(0, Math.floor(minX - 1));
  const y0 = Math.max(0, Math.floor(minY - 1));
  const x1 = Math.min(vue.cam.coteM - 1, Math.ceil(maxX + marge));
  const y1 = Math.min(vue.cam.coteM - 1, Math.ceil(maxY + marge));
  if (x1 < x0 || y1 < y0) return undefined;
  return { x0, y0, x1, y1 };
}

/** Nombre de cellules d'une emprise : de quoi décider d'un niveau de détail. */
export function tailleEmprise(e: Emprise): number {
  return (e.x1 - e.x0 + 1) * (e.y1 - e.y0 + 1);
}
