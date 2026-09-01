/**
 * PRNG seedé (xoshiro128**), seul générateur d'aléa autorisé dans le moteur.
 * `Math.random` est interdit dans src/engine (voir scripts/check-boundaries.sh) :
 * tout l'aléa du jeu doit être rejouable depuis la seed stockée dans la sauvegarde.
 */

export type RngState = readonly [number, number, number, number];

/** splitmix32 : étale une seed 32 bits en un état xoshiro de 128 bits. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function rngStateFromSeed(seed: number): RngState {
  const next = splitmix32(seed);
  // xoshiro exige un état non entièrement nul ; splitmix32 le garantit en pratique,
  // on force un bit par sécurité.
  const s = [next(), next(), next(), next()] as [number, number, number, number];
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 1;
  return s;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Un pas de xoshiro128** : retourne le nouvel état et un uint32. */
export function rngNext(state: RngState): { state: RngState; value: number } {
  let [s0, s1, s2, s3] = state;
  const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  s3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  s0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  s3 = rotl(s3, 11);
  return { state: [s0, s1, s2, s3], value: result };
}

/** Flottant dans [0, 1). */
export function rngFloat(state: RngState): { state: RngState; value: number } {
  const { state: s, value } = rngNext(state);
  return { state: s, value: value / 2 ** 32 };
}

/** Entier uniforme dans [0, n). */
export function rngInt(state: RngState, n: number): { state: RngState; value: number } {
  const { state: s, value } = rngFloat(state);
  return { state: s, value: Math.floor(value * n) };
}
