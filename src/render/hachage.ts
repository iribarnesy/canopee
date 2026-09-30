/**
 * **Le hachage du rendu**, écrit une fois.
 *
 * Le rendu n'a pas le droit au hasard — `scripts/check-boundaries.sh` interdit
 * `Math.random` dans `src/render`, parce que deux parties de même graine doivent
 * donner la même image (§8). Tout ce qui a l'air d'un tirage est donc une
 * fonction **pure** de quelques entiers : la position d'une touffe, la variante
 * d'un squelette, le chemin d'un chevreuil.
 *
 * Il vivait en cinq copies privées identiques — les arbres, le décor, le
 * tapis, le squelette, le grain —, chacune annonçant « le même que » une autre.
 * La faune en voulait une sixième (#129) : c'est le moment de n'en garder
 * qu'une, avant que l'une d'elles ne dérive (§2.1).
 */

/** Hachage entier → [0,1[, stable et sans allocation. */
export function hacher(a: number, b: number, sel: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
