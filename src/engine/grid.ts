/**
 * Grille spatiale 1 m² (docs/regles.md §1.2). Les positions des arbres sont
 * continues (m) ; les cellules de sol sont indexées `i = y*width + x`.
 * Les itérations de disque passent par un callback pour rester sans allocation
 * dans les boucles chaudes du tick.
 */

/**
 * Une grille de sol en simple précision : un état que la semaine réécrit
 * (issue #203, voir `SoilState` pour la mesure qui a fait ce partage).
 */
export type Grille = Float32Array;

/**
 * Une grille de sol en DOUBLE précision, et c'est délibéré. Deux raisons de
 * l'être, et une grille peut avoir les deux :
 *
 *  1. **un stock à longue mémoire**, qui s'ajuste par différences minuscules
 *     sur des décennies — l'humus décroît de 1,5 % l'an, donc cinq tonnes
 *     bougent de quelques kilos par décennie, et un incrément plus petit que
 *     l'ulp du stock ne s'arrondit pas : il disparaît ;
 *  2. **un stock qu'un BILAN AUDITE.** `tick-conservation.test.ts` exige que
 *     l'azote se referme à 5e-7 près ; la simple précision plafonne à ~1e-7 par
 *     cellule, et sur dix mille cellules l'écart sort à 3e-6. Mesuré : le
 *     bilan cassait des quatre côtés. **On ne desserre pas la tolérance** — la
 *     fermeture du bilan est la garantie, l'économie de mémoire n'est qu'un
 *     confort. Ce sont donc les stocks que la propriété compte qui restent
 *     longs : `mineralNG` et `litterNG` pour l'azote, `humusCG` pour les deux
 *     raisons à la fois.
 *
 * **La règle est mécanique, et c'est ce qui la rend tenable** : une grille
 * qu'une propriété de conservation SOMME reste longue. Ce sont `waterMm`,
 * `excessMm` et `nappeMm` pour l'eau, `mineralNG` et `litterNG` pour l'azote,
 * `litterCG`, `humusCG` et `boisAuSolCG` pour le carbone, `basesEq` et
 * `basesProfondEq` pour les bases. Le jour où une propriété nouvelle compte une
 * grille de plus, c'est elle qui le dira — en rougissant.
 */
export type GrilleLongue = Float64Array;

/**
 * Une grille qu'on LIT sans avoir à connaître sa précision — ni même savoir
 * que c'en est une. C'est le type des paramètres de lecture : il accepte les
 * deux tableaux typés ET un `number[]`, ce qui laisse les essais construire
 * leurs grilles à la main.
 */
export type GrilleLue = ArrayLike<number>;

/**
 * Une grille qu'on ÉCRIT, même indifférence. `ArrayLike` ne suffit pas ici :
 * il ne déclare pas l'écriture indexée.
 */
export type GrilleEcrite = Float32Array | Float64Array | number[];

export interface GridDims {
  /** largeur et hauteur en mètres (= en cellules de 1 m²) */
  widthM: number;
  heightM: number;
}

export function cellCount(dims: GridDims): number {
  return dims.widthM * dims.heightM;
}

export function cellIndexAt(dims: GridDims, xM: number, yM: number): number {
  const x = Math.min(dims.widthM - 1, Math.max(0, Math.floor(xM)));
  const y = Math.min(dims.heightM - 1, Math.max(0, Math.floor(yM)));
  return y * dims.widthM + x;
}

/**
 * Appelle `fn(index)` pour chaque cellule dont le centre est dans le disque
 * (cx, cy, r). Garantit au moins une cellule (celle du centre) — un semis a
 * toujours un sol sous les pieds.
 */
export function forEachDiscCell(
  dims: GridDims,
  cx: number,
  cy: number,
  r: number,
  fn: (index: number) => void,
): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(dims.widthM - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(dims.heightM - 1, Math.floor(cy + r));
  const r2 = r * r;
  let found = false;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        fn(y * dims.widthM + x);
        found = true;
      }
    }
  }
  if (!found) fn(cellIndexAt(dims, cx, cy));
}

/** Nombre de cellules du disque (même règle que forEachDiscCell). */
export function discCellCount(dims: GridDims, cx: number, cy: number, r: number): number {
  let n = 0;
  forEachDiscCell(dims, cx, cy, r, () => {
    n++;
  });
  return n;
}
