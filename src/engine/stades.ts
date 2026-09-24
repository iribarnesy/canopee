/**
 * Les stades de développement d'une tige — semis, gaulis, perchis, futaie.
 *
 * Ce n'est pas de la mécanique : rien dans la simulation ne lit un stade, et
 * changer ces bornes ne change aucune trajectoire. C'est un **nom** donné à une
 * taille, pour que le journal de la semaine puisse dire « celui-là vient de
 * passer perchis » — un franchissement se voit en comparant deux instants, et
 * le rendu, qui ne garde pas d'état de simulation, ne peut pas le faire seul
 * (docs/interface-visuelle.md §2.1).
 *
 * Les bornes sont celles de la sylviculture française, et elles s'expriment en
 * **diamètre**, pas en hauteur : gaules sous 7,5 cm, perches de 7,5 à 17,5 cm,
 * futaie au-delà. On les fait donc passer par `diametreCm` (actions.ts) plutôt
 * que de recopier des hauteurs : le jour où ce proxy sera calibré sur l'IFN,
 * les stades suivront sans qu'on y retouche.
 *
 * **Ces bornes sont redevenues des bornes.** Elles lisent maintenant le
 * diamètre que l'arbre **porte** (`TreeState.diametreCm`), et non plus un proxy
 * tiré de sa hauteur. Tant que ce proxy était linéaire (`2 × hauteur`), ces
 * bornes-là n'étaient que des bornes de hauteur déguisées — ce fichier le
 * disait déjà, en attendant le jour où le diamètre serait calibré (#62).
 *
 * Ce que ça change concrètement : deux arbres de même hauteur peuvent
 * désormais être à des stades différents, parce que celui qui a poussé au
 * large a épaissi quand l'autre filait à l'ombre. C'est exactement ce qu'un
 * forestier voit sur le terrain, et que l'échelle ne pouvait pas exprimer.
 *
 * Le **fourré** reste hors de l'échelle, mais pour **une** seule raison
 * maintenant, et c'est la bonne : il décrit un **peuplement** dense, pas un
 * individu — un arbre n'est pas un fourré. La seconde raison a disparu avec le
 * proxy : sa classe n'est plus structurellement vide.
 */

/**
 * Les quatre stades, du plus petit au plus grand. L'ordre du tableau **est**
 * l'ordre de l'échelle : le rendu peut comparer deux stades en comparant leurs
 * index, sans table de correspondance.
 */
export const STADES = ["semis", "gaulis", "perchis", "futaie"] as const;

export type StadeDeDeveloppement = (typeof STADES)[number];

/** Bornes **inférieures** de chaque stade, en diamètre à 1,30 m (cm). */
export const SEUIL_GAULIS_CM = 2.5;
export const SEUIL_PERCHIS_CM = 7.5;
export const SEUIL_FUTAIE_CM = 17.5;

/**
 * Le stade d'une tige, d'après son diamètre à 1,30 m. Pur, sans état.
 *
 * En dessous de la borne du gaulis, un arbre est trop court pour avoir un
 * diamètre à hauteur de poitrine : « semis » et « pas mesurable » désignent le
 * même arbre, ce qui est la seule façon honnête de border le bas de l'échelle.
 */
export function stadeDe(diametreCm: number): StadeDeDeveloppement {
  const d = diametreCm;
  if (d < SEUIL_GAULIS_CM) return "semis";
  if (d < SEUIL_PERCHIS_CM) return "gaulis";
  if (d < SEUIL_FUTAIE_CM) return "perchis";
  return "futaie";
}

/** Rang d'un stade dans l'échelle : `< 0` en descend, `> 0` y monte. */
export function rangDuStade(stade: StadeDeDeveloppement): number {
  return STADES.indexOf(stade);
}
