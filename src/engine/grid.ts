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
 * Une grille de sol en **double** précision, et c'est délibéré. Deux raisons de
 * l'être, et une grille peut avoir les deux :
 *
 *  1. **un stock à longue mémoire**, qui s'ajuste par différences minuscules
 *     sur des décennies — l'humus décroît de 1,5 % l'an, donc cinq tonnes
 *     bougent de quelques kilos par décennie, et un incrément plus petit que
 *     l'ulp du stock ne s'arrondit pas : il disparaît ;
 *  2. **un stock qu'un bilan audite.** `tick-conservation.test.ts` exige que
 *     l'azote se referme à 5e-7 près ; la simple précision plafonne à ~1e-7 par
 *     cellule, et sur dix mille cellules l'écart sort à 3e-6. Mesuré : le
 *     bilan cassait des quatre côtés. **On ne desserre pas la tolérance** — la
 *     fermeture du bilan est la garantie, l'économie de mémoire n'est qu'un
 *     confort. Ce sont donc les stocks que la propriété compte qui restent
 *     longs : `mineralNG` et `litterNG` pour l'azote, `humusCG` pour les deux
 *     raisons à la fois.
 *
 * **La règle est mécanique, et c'est ce qui la rend tenable** : une grille
 * qu'une propriété de conservation **somme** reste longue. Ce sont `waterMm`,
 * `excessMm` et `nappeMm` pour l'eau, `mineralNG` et `litterNG` pour l'azote,
 * `litterCG`, `humusCG` et `boisAuSolCG` pour le carbone, `phosphoreFixeG` et
 * `potassiumReserveG` pour les réserves que `pk.test.ts` additionne à leurs
 * pools assimilables, `basesEq` et `basesProfondEq` pour les bases. Le jour où
 * une propriété nouvelle compte une grille de plus, c'est elle qui le dira — en
 * rougissant.
 *
 * ## La règle compagne : **ce qu'on retire d'un stock se lit sur le stock**
 *
 * Être conservatif ne suffit pas, et l'issue #234 l'a montré au prix d'un défaut
 * de cent ans. Le pool de bases échangeables passait sous zéro pendant que son
 * bilan se refermait à 1e-13 : il était cohérent avec lui-même et comptait un
 * stock physiquement impossible. **Une conservation interdit d'en perdre ou
 * d'en fabriquer en route ; elle ne dit rien de ce que le stock a le droit de
 * valoir.**
 *
 * L'audit qui a suivi a passé tous les pools au même crible, site de débit par
 * site de débit. Il n'a **rien trouvé d'autre**, et la raison est structurelle :
 * partout ailleurs, ce qu'on retire est soit une **proportion du stock
 * lui-même** — décomposition, lessivage, érosion, rétrogradation —, soit un
 * `Math.min` contre lui — prélèvement racinaire, réserve de potassium, pompe à
 * bases. Un tel débit ne peut pas dépasser ce qu'il débite.
 *
 * Les bases étaient le seul endroit où une quantité **absolue**, calculée à
 * partir d'autre chose (le budget calcium de la litière), était retranchée d'un
 * stock. C'est cette forme-là qu'il faut reconnaître, et elle n'est pas
 * interdite : elle demande seulement de borner le retrait par le stock **et** de
 * compter le reliquat quelque part, sans quoi on remplace un stock négatif par
 * une destruction silencieuse du flux (`bases.ts`, `acideTamponnable`).
 *
 * Le garde-fou est dans `tests/properties/pools-positifs.test.ts`, et ses décors
 * sont calibrés à l'envers : plancher retiré, ils tombent. Un essai de
 * non-négativité qui ne sait pas rougir décore la suite sans rien garder — le
 * premier jet, un plant tous les trois mètres sur les sept stations, restait
 * vert sur le défaut de #234 lui-même.
 */
export type GrilleLongue = Float64Array;

/**
 * Une grille qu'on **lit** sans avoir à connaître sa précision — ni même savoir
 * que c'en est une. C'est le type des paramètres de lecture : il accepte les
 * deux tableaux typés ET un `number[]`, ce qui laisse les essais construire
 * leurs grilles à la main.
 */
export type GrilleLue = ArrayLike<number>;

/**
 * Une grille qu'on **écrit**, même indifférence. `ArrayLike` ne suffit pas ici :
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
