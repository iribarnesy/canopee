/**
 * Le grain du sol : la texture qui manque à un aplat interpolé.
 *
 * **Le défaut que ce module corrige est l'exact inverse du précédent.** Le
 * premier jet coloriait chaque cellule d'un aplat à bord franc, et le sol lisait
 * comme du carrelage. Une fois les couleurs interpolées entre échantillons, le
 * carrelage a disparu — et le sol est devenu *brumeux* : lisse au point qu'on ne
 * savait plus de quelle matière il était fait. Un sol de forêt a du grain :
 * touffes, flaques de litière, cailloux, terre à nu entre les herbes.
 *
 * **Rien n'est inventé sur l'ÉTAT du sol.** Le grain ne dit pas qu'il y a plus
 * d'herbe ici que là — c'est la palette qui le dit, à partir des grilles du
 * moteur. Il ne module que la CLARTÉ, de quelques pour cent, à une échelle
 * inférieure au mètre. Autrement dit il ajoute de la matière sans ajouter
 * d'information : l'œil lit une surface au lieu d'un dégradé, et rien de ce que
 * le joueur peut décider n'en dépend.
 *
 * **Déterministe, et pas par élégance.** `scripts/check-boundaries.sh` interdit
 * `Math.random` dans `src/render`, parce que deux parties de même graine doivent
 * donner la même image (§8) : sans ça une capture n'est pas reproductible et un
 * bug de rendu ne se rejoue pas. Le grain est donc une fonction PURE de la
 * position dans la parcelle. Conséquence agréable : il ne scintille pas quand on
 * tourne la caméra ou qu'on rejoue une semaine, puisqu'il est attaché au
 * terrain et non à l'image.
 */

/**
 * Maille du grain fin, en mètres.
 *
 * 0,4 m : l'échelle d'une touffe d'herbe ou d'une plaque de litière. En dessous,
 * on tomberait sous le pixel dès qu'on dézoome et le grain deviendrait du bruit
 * d'échantillonnage.
 */
export const MAILLE_FINE_M = 0.4;

/** Maille du grain large : les plaques, à l'échelle du mètre et demi. */
export const MAILLE_LARGE_M = 1.6;

/**
 * Amplitude maximale du grain, en fraction de clarté.
 *
 * 6 % : assez pour qu'une surface se lise comme une matière, trop peu pour
 * qu'on la prenne pour une information. Au-delà, les losanges de dessin
 * redeviennent visibles et on retombe dans la mosaïque qu'on vient de supprimer.
 */
export const AMPLITUDE_GRAIN = 0.06;

/**
 * Taille de tuile, en pixels, en dessous de laquelle le grain s'efface
 * complètement.
 *
 * Le grain n'a de sens que si sa maille couvre plusieurs pixels. À la parcelle
 * entière, une maille de 0,4 m fait trois pixels : la dessiner ne donnerait pas
 * de la matière mais du fourmillement — précisément le camouflage dont on
 * vient de sortir. Il monte donc avec le zoom.
 */
export const GRAIN_DES_PX = 24;
/** Taille de tuile à partir de laquelle le grain est à pleine amplitude. */
export const GRAIN_PLEIN_PX = 80;

/**
 * Hachage entier → [0,1[. Un mélange de bits sans multiplication flottante,
 * stable d'une machine à l'autre — ce qui compte ici bien plus que sa qualité
 * statistique, dont on n'a aucun besoin.
 */
function hacher(ix: number, iy: number, sel: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Lissage cubique : sans lui, le bruit fait des carrés au lieu de plaques. */
function adoucir(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bruit de valeur sur une maille donnée, ∈ [0,1], interpolé en douceur. */
function bruitDeMaille(x: number, y: number, maille: number, sel: number): number {
  const u = x / maille;
  const v = y / maille;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = adoucir(u - i);
  const fv = adoucir(v - j);
  const a = hacher(i, j, sel);
  const b = hacher(i + 1, j, sel);
  const c = hacher(i, j + 1, sel);
  const d = hacher(i + 1, j + 1, sel);
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

/**
 * Le grain en un point de la parcelle : un écart de clarté ∈ [−1, 1], centré
 * sur zéro.
 *
 * Deux octaves, parce qu'une seule donne une trame régulière : la maille fine
 * porte le piqué, la maille large porte les plaques. Les coordonnées sont
 * celles de la PARCELLE (nord vrai), donc le grain est solidaire du terrain —
 * il ne glisse pas quand la caméra tourne.
 */
export function grain(x: number, y: number): number {
  const fin = bruitDeMaille(x, y, MAILLE_FINE_M, 0x9e37);
  const large = bruitDeMaille(x, y, MAILLE_LARGE_M, 0x51ed);
  return (fin - 0.5) * 1.2 + (large - 0.5) * 0.8;
}

/**
 * Amplitude effective du grain pour une taille de tuile écran donnée : nulle de
 * loin, pleine de près, avec une montée douce entre les deux.
 */
export function amplitudeGrain(largeurTuilePx: number): number {
  if (largeurTuilePx <= GRAIN_DES_PX) return 0;
  if (largeurTuilePx >= GRAIN_PLEIN_PX) return AMPLITUDE_GRAIN;
  const t = (largeurTuilePx - GRAIN_DES_PX) / (GRAIN_PLEIN_PX - GRAIN_DES_PX);
  return AMPLITUDE_GRAIN * adoucir(t);
}

/**
 * Le facteur de clarté à appliquer à une couleur de sol : 1 sans grain.
 *
 * Rendu sous cette forme plutôt qu'en couleur, pour se composer avec
 * l'ombrage de pente — les deux sont des facteurs de clarté et se multiplient.
 */
export function facteurGrain(x: number, y: number, largeurTuilePx: number): number {
  const amplitude = amplitudeGrain(largeurTuilePx);
  if (amplitude === 0) return 1;
  return 1 + amplitude * grain(x, y);
}
