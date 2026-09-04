/**
 * Projection isométrique : de la parcelle (mètres) à l'écran (pixels), et
 * retour (docs/interface-visuelle.md §1, décisions D2 et D3).
 *
 * **Dimétrique 2:1** : une tuile d'un mètre carré se dessine comme un losange
 * deux fois plus large que haut. Ce n'est pas la « vraie » isométrie à 30° —
 * celle-là donne des losanges de hauteur irrationnelle, jolis et pénibles. Le
 * 2:1 fait tomber les diagonales sur des pentes entières, trie la profondeur
 * par `x + y`, et s'inverse analytiquement.
 *
 * **Tout est à l'échelle vraie, relief compris.** La hauteur écran d'un mètre
 * VERTICAL vaut la demi-largeur de tuile, ce qui est exactement ce qu'il faut
 * pour qu'un cube d'un mètre de côté ait l'air d'un cube. Conséquence heureuse :
 * il n'y a rien à exagérer ni à tasser. Sur les stations livrées, qui font 1 à
 * 6 % de pente, cela représente 1 à 6 m de dénivelé sur 100 m — lisible, jamais
 * gênant. La vue oblique actuelle (`GameView`) tasse la hauteur des arbres à
 * 0,55 parce qu'elle projette de dessus ; en isométrique l'emprise horizontale
 * double, et le tassement n'a plus de raison d'être.
 *
 * **Le nord n'est pas figé.** La caméra tourne par quarts de tour (§7) : c'est
 * la façon d'aller voir derrière une butte. La rotation s'applique AVANT la
 * projection, sur les coordonnées de parcelle — le rendu n'a donc qu'une
 * matrice à comprendre, et les arbres, dessinés en panneaux face caméra,
 * n'ont pas à être redessinés.
 *
 * Ce module est **pur** : pas de canvas, pas de DOM, aucun état. C'est ce qui
 * le rend testable, et il l'est (round-trip sur terrain accidenté aux quatre
 * orientations).
 */

/** Hauteur écran d'une tuile d'un mètre, au zoom 1, en pixels. */
export const TUILE_HAUTEUR_PX = 8;
/** Largeur écran d'une tuile d'un mètre : le 2:1 de la décision D2. */
export const TUILE_LARGEUR_PX = 2 * TUILE_HAUTEUR_PX;
/**
 * Hauteur écran d'un mètre VERTICAL, au zoom 1.
 *
 * Égale à la demi-largeur de tuile : c'est la condition pour qu'un cube d'un
 * mètre de côté se dessine comme un cube. La changer casse la cohérence entre
 * ce qui est posé au sol et ce qui s'élève — d'où la constante plutôt qu'un
 * réglage.
 */
export const METRE_VERTICAL_PX = TUILE_LARGEUR_PX / 2;

/** Orientation de la caméra : nombre de quarts de tour, 0 à 3. */
export type Orientation = 0 | 1 | 2 | 3;

export interface Camera {
  /** côté de la parcelle carrée, m */
  coteM: number;
  /** facteur de zoom ; 1 = une tuile de `TUILE_LARGEUR_PX` de large */
  zoom: number;
  orientation: Orientation;
}

/** Un point de la parcelle : mètres au sol, mètres d'altitude. */
export interface PointParcelle {
  x: number;
  y: number;
  z: number;
}

export interface PointEcran {
  sx: number;
  sy: number;
}

/**
 * Applique l'orientation aux coordonnées de parcelle.
 *
 * Une rotation de quart de tour dans un carré de côté c : (x, y) → (y, c − x).
 * On tourne le TERRAIN sous une caméra fixe, ce qui revient au même et évite
 * d'avoir deux repères en tête.
 */
export function tourner(
  x: number,
  y: number,
  coteM: number,
  orientation: Orientation,
): [number, number] {
  switch (orientation) {
    case 0:
      return [x, y];
    case 1:
      return [y, coteM - x];
    case 2:
      return [coteM - x, coteM - y];
    default:
      return [coteM - y, x];
  }
}

/** L'inverse de `tourner` : de l'orientation courante vers le nord vrai. */
export function detourner(
  x: number,
  y: number,
  coteM: number,
  orientation: Orientation,
): [number, number] {
  switch (orientation) {
    case 0:
      return [x, y];
    case 1:
      return [coteM - y, x];
    case 2:
      return [coteM - x, coteM - y];
    default:
      return [y, coteM - x];
  }
}

/**
 * Parcelle → écran. L'origine écran est le sommet du losange de la parcelle
 * (la cellule 0,0 vue de la caméra) ; c'est à la caméra de recentrer.
 */
export function versEcran(p: PointParcelle, cam: Camera): PointEcran {
  const [x, y] = tourner(p.x, p.y, cam.coteM, cam.orientation);
  const demiLargeur = (TUILE_LARGEUR_PX * cam.zoom) / 2;
  const demiHauteur = (TUILE_HAUTEUR_PX * cam.zoom) / 2;
  return {
    sx: (x - y) * demiLargeur,
    sy: (x + y) * demiHauteur - p.z * METRE_VERTICAL_PX * cam.zoom,
  };
}

/**
 * Profondeur d'un point, pour l'ordre du peintre : ce qui a la plus grande
 * profondeur est devant. C'est `x + y` dans le repère de la caméra — donc
 * l'altitude n'y entre PAS, un arbre au sommet d'une butte n'est pas « devant »
 * ce qui est en bas devant lui.
 */
export function profondeur(x: number, y: number, cam: Camera): number {
  const [rx, ry] = tourner(x, y, cam.coteM, cam.orientation);
  return rx + ry;
}

/**
 * Écran → parcelle, **à plat** (z connu). Inversion analytique : la différence
 * `x − y` ne dépend pas de l'altitude, la somme si.
 */
export function versParcelleAPlat(e: PointEcran, cam: Camera, z = 0): PointParcelle {
  const demiLargeur = (TUILE_LARGEUR_PX * cam.zoom) / 2;
  const demiHauteur = (TUILE_HAUTEUR_PX * cam.zoom) / 2;
  const difference = e.sx / demiLargeur;
  const somme = (e.sy + z * METRE_VERTICAL_PX * cam.zoom) / demiHauteur;
  const rx = (somme + difference) / 2;
  const ry = (somme - difference) / 2;
  const [x, y] = detourner(rx, ry, cam.coteM, cam.orientation);
  return { x, y, z };
}

/**
 * Écran → cellule, **sur un terrain accidenté**.
 *
 * Là, l'inversion analytique ne suffit plus : un même pixel peut correspondre à
 * plusieurs cellules d'altitudes différentes — c'est le prix du relief à
 * l'échelle vraie (D3). On remonte donc le rayon de vue, de la cellule la plus
 * PROCHE de la caméra vers la plus lointaine, et on retient la première dont la
 * surface tombe sur ce pixel : c'est celle qu'on voit, les autres sont
 * derrière.
 *
 * `altitudeM(x, y)` rend l'altitude d'une cellule, en mètres. Rend `undefined`
 * quand le pixel ne touche aucune cellule (hors parcelle, ou ciel au-dessus).
 */
export function celluleSousLeCurseur(
  e: PointEcran,
  cam: Camera,
  altitudeM: (x: number, y: number) => number,
): { x: number; y: number } | undefined {
  const demiLargeur = (TUILE_LARGEUR_PX * cam.zoom) / 2;
  const demiHauteur = (TUILE_HAUTEUR_PX * cam.zoom) / 2;
  // `x − y` dans le repère caméra : indépendant de l'altitude, donc connu.
  const difference = e.sx / demiLargeur;
  // On balaie les diagonales `x + y` du plus proche au plus lointain.
  const sommeMax = 2 * cam.coteM;
  for (let somme = sommeMax; somme >= 0; somme -= 1) {
    const rx = Math.floor((somme + difference) / 2);
    const ry = Math.floor((somme - difference) / 2);
    if (rx < 0 || ry < 0 || rx >= cam.coteM || ry >= cam.coteM) continue;
    const [x, y] = detourner(rx + 0.5, ry + 0.5, cam.coteM, cam.orientation);
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= cam.coteM || cy >= cam.coteM) continue;
    const z = altitudeM(cx, cy);
    const attendu = versEcran({ x: x, y: y, z }, cam);
    // Une demi-tuile de tolérance : c'est l'épaisseur de la surface à l'écran.
    if (Math.abs(attendu.sy - e.sy) <= demiHauteur) return { x: cx, y: cy };
  }
  return undefined;
}

/** Emprise écran de la parcelle entière, pour cadrer la caméra. */
export function empriseEcran(
  cam: Camera,
  altitudeMaxM = 0,
): {
  largeur: number;
  hauteur: number;
} {
  const demiLargeur = (TUILE_LARGEUR_PX * cam.zoom) / 2;
  const demiHauteur = (TUILE_HAUTEUR_PX * cam.zoom) / 2;
  return {
    largeur: 2 * cam.coteM * demiLargeur,
    hauteur: 2 * cam.coteM * demiHauteur + altitudeMaxM * METRE_VERTICAL_PX * cam.zoom,
  };
}
