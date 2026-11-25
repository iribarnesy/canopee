/**
 * **L'atlas des espèces, à un clic** (#513).
 *
 * `v1.md` : « Consultable depuis le jeu, mais **pas à réimplémenter** : le site
 * existe déjà et fait le travail. Un lien suffit pour la V1. » Les essences du
 * moteur sont tirées de cet atlas (`engine/especes.ts`) : le lien renvoie le
 * joueur à la source de ce qu'il plante.
 *
 * **Le lien d'une essence est une recherche, pas une fiche.** L'atlas range ses
 * fiches sous un identifiant à lui (`#/espece/pommier`), qui n'est pas celui
 * du moteur (`malus_domestica`) ; une table de correspondance tenue ici serait
 * une seconde copie des noms de l'atlas, qui dériverait au premier renommage.
 * Sa recherche, elle, lit le nom latin, et l'identifiant d'une essence du
 * moteur **est** son nom latin : `#/atlas?q=Malus domestica` montre la carte du
 * pommier, à un clic de sa fiche. Une essence que l'atlas n'a pas encore — le
 * noyer hybride — y donne une recherche vide, pas une page cassée.
 *
 * Module pur : il ne lit ni `window` ni le moteur, on lui donne l'identifiant.
 */

/** L'atlas, page de la liste des espèces (`v1.md`, « L'atlas »). */
export const ATLAS = "https://iribarnesy.github.io/atlas-especes/#/atlas";

/** Le nom latin d'une essence, tiré de son identifiant : `malus_domestica` → « Malus domestica ». */
export function nomLatin(especeId: string): string {
  const mots = especeId.replace(/_/g, " ").trim();
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/** Le lien vers l'atlas : la liste entière, ou la recherche d'une essence. */
export function lienAtlas(especeId?: string): string {
  if (!especeId) return ATLAS;
  return `${ATLAS}?q=${encodeURIComponent(nomLatin(especeId))}`;
}
