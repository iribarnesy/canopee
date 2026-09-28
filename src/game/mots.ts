/**
 * **Les mots du jeu** : comment on nomme, et comment on accorde.
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
import type { CauseDepart } from "../engine/faune";
import type { CauseMort } from "../engine/trees";

/**
 * Les mots qui **arrêtent** l'accord dans un nom composé.
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
 * À partir de **deux**, et pas au-delà de un : la différence ne se voit pas sur un
 * compte d'arbres, qui est entier, mais sur une surface — « 1,2 hectare
 * brûlé » est au singulier en français, et `n > 1` l'aurait mis au pluriel.
 */
export function s(n: number): string {
  return n >= 2 ? "s" : "";
}

/**
 * **le genre de chaque essence**.
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
 * Une ligne qui compte des **tiges** est au féminin quelle que soit l'espèce.
 */
export function accord(feminin: boolean, n: number): string {
  return `${feminin ? "e" : ""}${s(n)}`;
}

/**
 * **ce qui a tué**, accordé.
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
 * `pl` n'existe que là où le **complément** change avec le nombre — « hors de sa
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
  boutis: { participe: "arraché", sg: " par le boutis du sanglier" },
  fauche: { participe: "emporté", sg: " par la fauche" },
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

// ── **la faune en individus** (#187, #255) ───────────────────────────────────────

/**
 * Le genre des noms d'espèces de faune, pour l'article et l'accord.
 *
 * La jumelle de `GENRE` et pour la même raison : le moteur nomme l'espèce, le
 * jeu la fait entrer dans une phrase française. La table couvre l'atlas entier
 * (`faune.ts`) ; une espèce ajoutée sans son genre passera au masculin, ce qui
 * est le défaut français et se corrige en une ligne.
 */
const GENRE_FAUNE: Record<string, "m" | "f"> = {
  mesange_bleue: "f",
  mesange_charbonniere: "f",
  pic_epeiche: "m",
  chouette_cheveche: "f",
  loir_gris: "m",
  ecureuil_roux: "m",
  buse_variable: "f",
  murin_de_bechstein: "m",
  noctule_commune: "f",
  pique_prune: "m",
  grand_capricorne: "m",
  rosalie_des_alpes: "f",
};

/**
 * L'espèce, avec son article défini — « la mésange bleue », « le pic épeiche ».
 *
 * **Défini et non indéfini, et ce n'est pas un détail de style.** « Une mésange
 * bleue » affirmerait un individu ; or ce que le moteur installe est tantôt un
 * couple, tantôt une colonie de parturition, tantôt la population d'un arbre —
 * `faune.ts` l'écrit en toutes lettres, mais **en commentaire** : aucun champ ne
 * le dit, donc le jeu ne peut pas le savoir sans le recopier, et recopier une
 * vérité du moteur est ce que le §2.1 nous interdit. L'article défini nomme
 * l'espèce sans compter les bêtes, ce qui est vrai dans les trois cas.
 *
 * L'issue #259 demande au moteur le champ qui lèverait la réserve.
 */
export function laFaune(especeId: string, nom: string): string {
  const feminin = GENRE_FAUNE[especeId] === "f";
  const voyelle = /^[aeiouyéèêàâîôûh]/i.test(nom);
  return `${voyelle ? "l'" : feminin ? "la " : "le "}${nom}`;
}

/**
 * La même chaîne, première lettre en capitale — pour ouvrir une phrase.
 *
 * Écrit ici et pas en ligne : « l'écureuil » doit donner « L'écureuil », donc
 * la capitale ne tombe pas toujours sur la même lettre que l'article.
 */
export function capitale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Pourquoi un habitant s'en va, dit en clair (`CauseDepart`). */
const DEPART_DIT: Record<CauseDepart, string> = {
  arbreDisparu: "son arbre n'est plus là",
  giteTropPetit: "son gîte ne lui suffit plus",
  tableVide: "il n'y a plus assez à manger",
};

/** La cause d'un départ, telle qu'on la lit dans le journal. */
export function departDit(cause: CauseDepart): string {
  return DEPART_DIT[cause];
}
