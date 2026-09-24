/**
 * **Ce qui mérite d'être revu** (#128, §6.8) : la règle du « mode cinéma ».
 *
 * *« L'`autopause` existe déjà pour l'incendie et la faillite ; on l'étend à la
 * crue et aux mortalités de masse, puis on rejoue la scène à ×1. »* Et le §5.11
 * dit pourquoi : *« un feu, une crue : on repasse en temps réel. Ce sont les
 * moments où le joueur doit voir se dérouler, pas résumer. »*
 *
 * **Ce sont des seuils de présentation, choisis et non déduits.** Le moteur n'a
 * pas d'opinion sur ce qui mérite d'être regardé — il rapporte des morts et des
 * rafales, pas des scènes. Décider laquelle arrête le temps est un choix de
 * jeu, comme le sont déjà le seuil de cueillette automatique
 * (`recolteAuto.ts`) et celui de la souffrance annoncée (`suivis.ts`).
 *
 * Ils sont ici, et pas en ligne dans le worker, pour qu'un essai puisse les
 * éprouver : une scène qui ne se déclenche jamais et une scène qui se
 * déclenche toutes les trois semaines sont deux défauts qu'on ne voit pas en
 * jouant une heure.
 *
 * Module **pur** : pas de React, pas de DOM, pas d'horloge.
 */

/**
 * À partir de combien de tiges un malheur devient une scène.
 *
 * Dix : en dessous, c'est le bruit de fond d'un peuplement qui vit, et arrêter
 * le temps toutes les trois semaines ferait de la pause automatique une
 * nuisance. Le même nombre pour la tempête et pour la mortalité, parce que
 * c'est la même question — combien d'arbres perdus d'un coup avant qu'on veuille
 * lever les yeux.
 */
export const TIGES_POUR_UNE_SCENE = 10;

/**
 * Et quelle **part** du peuplement, pour une mortalité.
 *
 * Le nombre seul ne suffit pas : dix morts sur deux mille tiges de ronce, c'est
 * une semaine ordinaire ; dix morts sur trente, c'est un tiers du verger.
 */
export const PART_POUR_UNE_SCENE = 0.05;

/**
 * Une mortalité de masse : assez d'arbres, **et** une part assez grande.
 *
 * Les deux conditions, et pas l'une ou l'autre. Sans le compte, une friche de
 * quinze tiges déclencherait une scène pour un seul mort ; sans la part, une
 * ronceraie de deux mille tiges n'en déclencherait jamais malgré ses dizaines
 * de morts hebdomadaires.
 */
export function estUneMortaliteDeMasse(morts: number, tigesAvant: number): boolean {
  return morts >= TIGES_POUR_UNE_SCENE && morts / Math.max(1, tigesAvant) >= PART_POUR_UNE_SCENE;
}

/**
 * Une tempête qui vaut qu'on s'arrête.
 *
 * Pas de condition de **part** ici, à la différence d'une mortalité : la tempête a
 * une cause unique et datée, alors qu'une mortalité est la somme de tout ce qui
 * tue. Trente arbres couchés d'un coup se regardent, qu'il en reste mille ou
 * cinquante.
 *
 * Le worker ne s'arrêtait **pas** sur une tempête, et le raisonnement écrit là-bas
 * était : « un chablis reste récupérable un an, le joueur a le temps de
 * décider ». C'est vrai de la **décision** et faux du **spectacle** — à ×52, une rafale
 * qui couche trente arbres passe entre deux images.
 */
export function estUneTempeteAVoir(arbresVerses: number): boolean {
  return arbresVerses >= TIGES_POUR_UNE_SCENE;
}
