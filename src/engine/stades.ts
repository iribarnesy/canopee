/**
 * Les stades de développement d'une tige — semis, gaulis, perchis, futaie.
 *
 * Ce n'est pas de la mécanique : rien dans la simulation ne lit un stade, et
 * changer ces bornes ne change aucune trajectoire. C'est un NOM donné à une
 * taille, pour que le journal de la semaine puisse dire « celui-là vient de
 * passer perchis » — un franchissement se voit en comparant deux instants, et
 * le rendu, qui ne garde pas d'état de simulation, ne peut pas le faire seul
 * (docs/interface-visuelle.md §2.1).
 *
 * Les bornes sont celles de la sylviculture française, et elles s'expriment en
 * DIAMÈTRE, pas en hauteur : gaules sous 7,5 cm, perches de 7,5 à 17,5 cm,
 * futaie au-delà. On les fait donc passer par `diametreCm` (actions.ts) plutôt
 * que de recopier des hauteurs : le jour où ce proxy sera calibré sur l'IFN,
 * les stades suivront sans qu'on y retouche.
 *
 * Deux choses à savoir sur ce que ces bornes valent aujourd'hui :
 *
 * - `diametreCm` est un proxy assumé (`2 × hauteur`, « à calibrer »). Les
 *   bornes en diamètre sont conventionnelles, les hauteurs auxquelles elles
 *   tombent en héritent : 1,25 m, 3,75 m, 8,75 m. Tant que le proxy est
 *   linéaire, ces bornes-là sont des bornes de hauteur déguisées, et il faut
 *   les lire comme telles.
 * - le **fourré** ne figure pas dans l'échelle, pour deux raisons. D'abord il
 *   décrit un PEUPLEMENT dense, pas un individu : un arbre n'est pas un
 *   fourré. Ensuite, avec ce proxy, sa classe serait vide — une tige qui
 *   atteint 1,30 m aurait déjà 2,6 cm de diamètre, au-dessus de la borne du
 *   fourré (2,5 cm). Le proxy surestime le diamètre des petites tiges, et
 *   c'est là qu'il le montre.
 *
 * La borne basse tombe bien : à 2,5 cm de diamètre, ce proxy place la tige à
 * 1,25 m, soit la hauteur de poitrine. En dessous, un arbre n'a pas de
 * diamètre à 1,30 m — on ne peut pas le mesurer. « Semis » et « trop court
 * pour avoir un diamètre » désignent donc le même arbre, ce qui est la seule
 * façon honnête de border le bas de l'échelle.
 */

import { diametreCm } from "./actions";

/**
 * Les quatre stades, du plus petit au plus grand. L'ordre du tableau EST
 * l'ordre de l'échelle : le rendu peut comparer deux stades en comparant leurs
 * index, sans table de correspondance.
 */
export const STADES = ["semis", "gaulis", "perchis", "futaie"] as const;

export type StadeDeDeveloppement = (typeof STADES)[number];

/** Bornes INFÉRIEURES de chaque stade, en diamètre à 1,30 m (cm). */
export const SEUIL_GAULIS_CM = 2.5;
export const SEUIL_PERCHIS_CM = 7.5;
export const SEUIL_FUTAIE_CM = 17.5;

/** Le stade d'une tige, d'après sa seule hauteur. Pur, sans état. */
export function stadeDe(heightM: number): StadeDeDeveloppement {
  const d = diametreCm(heightM);
  if (d < SEUIL_GAULIS_CM) return "semis";
  if (d < SEUIL_PERCHIS_CM) return "gaulis";
  if (d < SEUIL_FUTAIE_CM) return "perchis";
  return "futaie";
}

/** Rang d'un stade dans l'échelle : `< 0` en descend, `> 0` y monte. */
export function rangDuStade(stade: StadeDeDeveloppement): number {
  return STADES.indexOf(stade);
}
