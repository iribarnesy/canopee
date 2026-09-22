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
import type { CauseMort } from "../engine/trees";

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

/**
 * LE GENRE DE CHAQUE ESSENCE.
 *
 * Trois féminins sur vingt-six, et ils suffisent à rendre faux tout ce qui
 * s'accorde avec eux : l'écran de fin d'un niveau écrivait « 90 ronces morts
 * étouffés par l'ombre ».
 *
 * **Le worker avait déjà buté là-dessus et s'en était sorti autrement** :
 * `raisonDesMorts` fait porter l'accord par le mot « arbre » et nomme
 * l'essence en apposition. C'est juste, et ça ne marche que pour une phrase
 * dont on écrit soi-même le sujet. Une ligne de bilan compte des ronces, pas
 * des arbres.
 *
 * Le `Record` complet est la garantie qui compte : l'essai vérifie que la table
 * couvre le catalogue du moteur, et rien d'autre.
 */
export const GENRE: Record<string, "m" | "f"> = {
  alnus_glutinosa: "m",
  fagus_sylvatica: "m",
  quercus_pubescens: "m",
  pinus_sylvestris: "m",
  betula_pendula: "m",
  juglans_regia: "m",
  malus_domestica: "m",
  prunus_armeniaca: "m",
  corylus_avellana: "m",
  prunus_spinosa: "m",
  crataegus_monogyna: "f",
  rubus_fruticosus: "f",
  sambucus_nigra: "m",
  carpinus_betulus: "m",
  ilex_aquifolium: "m",
  salix_alba: "m",
  cornus_mas: "m",
  euonymus_europaeus: "m",
  ligustrum_vulgare: "m",
  ulex_europaeus: "m",
  cytisus_scoparius: "m",
  calluna_vulgaris: "f",
  castanea_sativa: "m",
  quercus_suber: "m",
  fraxinus_excelsior: "m",
  arbutus_unedo: "m",
};

/** Une essence dont le nom est féminin ? Inconnue = masculin, le défaut. */
export function estFeminin(especeId: string): boolean {
  return GENRE[especeId] === "f";
}

/**
 * La terminaison d'un participe accordé : rien, « e », « s » ou « es ».
 *
 * `feminin` et non une essence : ce qui s'accorde n'est pas toujours l'essence.
 * Une ligne qui compte des TIGES est au féminin quelle que soit l'espèce.
 */
export function accord(feminin: boolean, n: number): string {
  return `${feminin ? "e" : ""}${s(n)}`;
}

/**
 * CE QUI A TUÉ, accordé.
 *
 * **Une table qui en remplace une, et non une de plus.** Le moteur en a une au
 * masculin pluriel (`LIBELLE_CAUSE`), pour ses messages collectifs ; le jeu en
 * tenait une seconde au masculin singulier, parce qu'un arbre suivi est un
 * individu. Il en aurait fallu deux de plus pour le féminin. Celle-ci sépare ce
 * qui s'accorde — le participe — de ce qui ne s'accorde pas, et couvre donc les
 * quatre cas d'un coup.
 *
 * Deux causes n'ont pas de participe du tout : on ne meurt pas « mort de
 * sécheresse » par un participe, on en meurt tout court. Leur phrase est alors
 * le complément seul.
 *
 * `pl` n'existe que là où le COMPLÉMENT change avec le nombre — « hors de sa
 * gamme de pH » contre « hors de leur gamme ».
 */
const CAUSE_DITE: Record<CauseMort, { participe?: string; sg: string; pl?: string }> = {
  ecrasement: { participe: "écrasé", sg: " par la chute d'un arbre mort" },
  secheresse: { sg: "de sécheresse" },
  engorgement: { participe: "asphyxié", sg: " par l'eau" },
  ombre: { participe: "étouffé", sg: " par l'ombre" },
  vieillesse: { sg: "de vieillesse" },
  solHorsGamme: {
    sg: "sur un sol hors de sa gamme de pH",
    pl: "sur un sol hors de leur gamme de pH",
  },
  feu: { sg: "dans l'incendie" },
  abroutissement: { participe: "brouté", sg: " par le gibier" },
  ravageurs: { participe: "achevé", sg: " par les ravageurs" },
  labour: { participe: "retourné", sg: " par le labour" },
  maladie: { participe: "emporté", sg: " par la maladie" },
  frottis: { participe: "annelé", sg: " par les frottis de cervidés" },
  chablis: { participe: "couché", sg: " par la tempête" },
  volis: { participe: "cassé", sg: " net par la tempête" },
};

/** La cause de mort, accordée au nombre et au genre de ce qu'elle a tué. */
export function causeDite(cause: CauseMort, n = 1, feminin = false): string {
  const dite = CAUSE_DITE[cause];
  const complement = (n >= 2 && dite.pl) || dite.sg;
  return dite.participe ? `${dite.participe}${accord(feminin, n)}${complement}` : complement;
}
