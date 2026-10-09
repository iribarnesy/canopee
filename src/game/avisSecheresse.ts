/**
 * **L'avis « Sécheresse »** : la réserve du sol presque à sec en saison de
 * végétation (#343).
 *
 * `soil.waterMm` est une grille **cellule × horizon**. L'avis prenait sa
 * moyenne sur toutes les cases — une moyenne **par horizon** — et la comparait
 * à la réserve utile du **profil entier** : à deux horizons il se déclenchait
 * sous 40 % de la réserve, à trois sous 60 %. Mesuré sur la lande sèche, sol
 * nu : affiché 31 semaines d'été sur 42 alors que le profil ne descendait
 * jamais sous 47 %, et jamais affiché sur les stations à deux horizons.
 *
 * On somme donc l'eau de tous les horizons, et on divise par le nombre de
 * **cellules** : c'est l'eau d'un profil moyen, la même grandeur que `ruMm`.
 */

/** Part de la réserve utile sous laquelle le profil est « presque à sec ». */
export const PART_A_SEC = 0.2;

/** L'eau d'un profil moyen de la parcelle, mm — tous horizons confondus. */
export function eauDuProfilMoyenMm(waterMm: ArrayLike<number>, nCellules: number): number {
  let somme = 0;
  for (let k = 0; k < waterMm.length; k++) somme += waterMm[k] ?? 0;
  return somme / Math.max(1, nCellules);
}

/** Le profil moyen est-il presque à sec ? */
export function solPresqueASec(
  waterMm: ArrayLike<number>,
  nCellules: number,
  ruProfilMm: number,
): boolean {
  return eauDuProfilMoyenMm(waterMm, nCellules) < PART_A_SEC * ruProfilMm;
}
