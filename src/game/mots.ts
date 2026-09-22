/**
 * LES MOTS DU JEU : comment on nomme, et comment on accorde.
 *
 * Un fichier minuscule et une seule raison d'être : **le jeu compose des
 * phrases à partir de comptes, à plusieurs endroits**. Le journal du worker dit
 * « 34 bouleaux morts de sécheresse », le bilan de période le redit pour un
 * intervalle plus long, la fin de niveau le redit pour la partie entière. Si
 * chacun accorde à sa façon, les trois divergeront — et ils ont commencé à le
 * faire : le journal écrivait `nom + "s"` sans condition, donc « 3 bouleau
 * verruqueuxs » et « 2 houxs ».
 *
 * Ce n'est pas un module d'intelligence linguistique. Il couvre exactement le
 * catalogue d'espèces du moteur, et un essai le passe en entier : le jour où
 * une essence s'ajoute avec une forme que la règle ne sait pas, l'essai le dit.
 */

import { getEspece } from "../engine/especes";

/**
 * Les mots qui ARRÊTENT l'accord dans un nom composé.
 *
 * « Ajonc d'Europe » fait « ajoncs d'Europe » et non « ajoncs d'Europes » :
 * ce qui suit la préposition est un complément, il ne s'accorde pas avec le
 * nombre. Un mot qui porte une apostrophe est traité pareil — c'est toujours
 * une élision de préposition dans ce catalogue (« d'Europe »).
 */
const ARRETS = new Set(["à", "a", "de", "du", "des", "en"]);

/**
 * Un mot simple au pluriel.
 *
 * Trois cas, et ils suffisent au catalogue : ce qui finit déjà par une
 * sifflante ne bouge pas (houx, aulne glutineux), ce qui finit en -eau ou -eu
 * prend un x (bouleaux, sureaux), le reste prend un s.
 */
function motAuPluriel(mot: string): string {
  if (/[sxz]$/i.test(mot)) return mot;
  if (/(eau|eu)$/i.test(mot)) return `${mot}x`;
  return `${mot}s`;
}

/**
 * Un nom d'essence accordé au nombre.
 *
 * Les traits d'union s'accordent des deux côtés (« chênes-lièges »), les
 * espaces jusqu'à la première préposition (« chênes pubescents », mais
 * « genêts à balais »).
 */
export function pluriel(nom: string, n: number): string {
  if (n <= 1) return nom;
  const mots = nom.split(" ");
  const sortie: string[] = [];
  let accorde = true;
  for (const mot of mots) {
    if (ARRETS.has(mot.toLowerCase()) || mot.includes("'") || mot.includes("’")) accorde = false;
    sortie.push(accorde ? mot.split("-").map(motAuPluriel).join("-") : mot);
  }
  return sortie.join(" ");
}

/** Le nom d'une essence, tel qu'on l'écrit au fil du texte : en minuscules. */
export function nomEspece(id: string): string {
  return getEspece(id).nom.toLowerCase();
}

/** Le nom d'une essence, accordé au nombre : « 34 bouleaux verruqueux ». */
export function nomEspeces(id: string, n: number): string {
  return pluriel(nomEspece(id), n);
}

/**
 * « s » quand il en faut un — pour les mots que le jeu écrit lui-même.
 *
 * À partir de DEUX, et pas au-delà de un : la différence ne se voit pas sur un
 * compte d'arbres, qui est entier, mais sur une surface — « 1,2 hectare
 * brûlé » est au singulier en français, et `n > 1` l'aurait mis au pluriel.
 */
export function s(n: number): string {
  return n >= 2 ? "s" : "";
}
