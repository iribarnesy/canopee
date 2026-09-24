/**
 * Présenter la carte du sol comme la **vue** la montre (#145).
 *
 * La carte était dessinée nord en haut, en carré ; la vue est en dimétrique
 * 2:1 et tourne par quarts de tour. Situer une tache demandait donc de faire
 * la rotation de tête, et de la refaire autrement dès qu'on avait tourné la
 * vue.
 *
 * **La donnée ne bouge pas.** Le canvas reste celui qu'on dessinait, cellule
 * par cellule, nord en haut : c'est sa **présentation** qui change, par une
 * transformation CSS. Redessiner en losange aurait mis une seconde copie de la
 * projection en face de la vraie, et le §2.1 dit ce qui arrive à deux copies
 * d'une même règle.
 */

import type { Orientation } from "../../render/projection";

/**
 * La matrice qui envoie un écart de **pixels** du canvas sur un écart d'écran,
 * rendue dans l'ordre de `matrix(a, b, c, d)` de CSS — donc
 * `(u, v) → (a·u + c·v, b·u + d·v)`.
 *
 * Elle se dérive, elle ne se devine pas. Le canvas pose la cellule `(x, y)` au
 * pixel `(x, C−1−y)` : le nord en haut demande d'inverser `y`. Un écart au
 * centre du canvas vaut donc `u ∝ x − m` et `v ∝ −(y − m)`. La projection,
 * elle, pose la même cellule en `sx ∝ x′ − y′` et `sy ∝ (x′ + y′) / 2`, où
 * `(x′, y′)` est la cellule tournée du quart de tour de la caméra.
 *
 * À l'orientation 0, en substituant : `sx ∝ u + v` et `sy ∝ (u − v) / 2`.
 * C'est une **réflexion** et pas une simple rotation — l'inversion du `y` du canvas
 * l'introduit — d'où le `scaleY(-1)` qui la défait avant la rotation. Le quart
 * de tour de la caméra, lui, se retranche de l'angle : `tourner` envoie
 * `(x, y)` sur `(y, C − x)`, ce qui fait tourner le losange dans l'autre sens
 * que le compte des quarts.
 *
 * Le test `carte-orientee.test.ts` compare, aux quatre orientations, la
 * direction que cette matrice donne à celle que `versEcran` donne vraiment ;
 * sans lui, un signe faux se serait vu comme une carte plausible et fausse.
 */
export function matriceDeLaCarte(orientation: Orientation): [number, number, number, number] {
  const angle = ((45 - 90 * orientation) * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // scaleY(0.5) · rotate(angle) · scaleY(-1), à plat dans l'ordre de CSS.
  return [c, 0.5 * s, s, -0.5 * c];
}

/** La même chose, dans la forme que `style.transform` attend. */
export function transformeDeLaCarte(orientation: Orientation): string {
  return `scaleY(0.5) rotate(${45 - 90 * orientation}deg) scaleY(-1)`;
}

/**
 * Le rapport entre le côté du canvas et la **largeur** que le losange occupe.
 *
 * La rotation étire la boîte : un carré de côté `c` devient un losange de
 * `c√2` de large et, après l'écrasement dimétrique, de `c√2 / 2` de haut. Pour
 * tenir dans un volet large de `L`, le canvas doit donc mesurer `L / √2`, et
 * la place verticale qu'il demande est exactement `L / 2`.
 */
export const LARGEUR_DU_LOSANGE = Math.SQRT2;

/**
 * De quel côté se trouve le **nord**, une fois la carte présentée : en degrés,
 * zéro vers le haut de l'écran, positif dans le sens des aiguilles.
 *
 * Sans ce repère, une carte qui tourne avec la vue ne dit plus où est le nord,
 * et on a perdu ce qu'on avait gagné.
 */
export function capDuNord(orientation: Orientation): number {
  const [, , c, d] = matriceDeLaCarte(orientation);
  // Le nord est le sens des `y` croissants de la parcelle, donc des `v`
  // **décroissants** du canvas — encore l'inversion. Un écart `(0, −1)` traverse
  // la matrice en `(−c, −d)`.
  const dx = -c;
  const dy = -d;
  // L'écran a son `y` vers le bas : une aiguille qui monte pointe vers −y.
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/**
 * La cellule sous un point de la carte **présentée**, ou `undefined` hors parcelle.
 *
 * `dxPx`/`dyPx` sont l'écart au centre de la carte, en pixels d'écran ;
 * `cotePx` est le côté du canvas **avant** transformation (sa taille de mise en
 * page, que la transformation CSS ne change pas). C'est l'inverse de la
 * présentation : le survol arrive en coordonnées d'écran et il faut remonter
 * jusqu'à la cellule pour en lire la valeur (#144).
 */
export function celluleSousLaCarte(
  dxPx: number,
  dyPx: number,
  cotePx: number,
  coteM: number,
  orientation: Orientation,
): { x: number; y: number } | undefined {
  const [a, b, c, d] = matriceDeLaCarte(orientation);
  const det = a * d - b * c;
  if (det === 0) return undefined;
  // L'inverse de la matrice 2×2, appliqué à l'écart au centre.
  const u = (d * dxPx - c * dyPx) / det;
  const v = (-b * dxPx + a * dyPx) / det;
  const px = u + cotePx / 2;
  const py = v + cotePx / 2;
  if (px < 0 || py < 0 || px >= cotePx || py >= cotePx) return undefined;
  const x = Math.floor((px / cotePx) * coteM);
  const y = coteM - 1 - Math.floor((py / cotePx) * coteM);
  if (x < 0 || y < 0 || x >= coteM || y >= coteM) return undefined;
  return { x, y };
}
