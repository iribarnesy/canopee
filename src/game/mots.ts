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
import { type CauseDepart, especeFaune } from "../engine/faune";
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

// ── **les mots de la faune** (issue #255) ──────────────────────────────────────
//
// Ils vivent ici pour la raison qui a fait naître ce fichier : **plusieurs
// lecteurs vont nommer les mêmes bêtes**. Le fil d'actualité annonce une
// arrivée, un panneau listera les pensionnaires, un bilan de fin de partie les
// recomptera. Trois façons d'écrire « une colonie de murins de Bechstein », et
// deux au moins seront fausses.

/**
 * **le genre de chaque espèce de faune**, comme `GENRE` pour les essences.
 *
 * Rien dans les données ne le donne, et il n'y a pas de règle : « le loir » et
 * « la buse » se ressemblent trait pour trait. Un essai vérifie que la table
 * couvre l'atlas et rien de plus, donc une guilde qui s'ajoute sans son genre
 * se fait prendre avant le joueur.
 */
export const GENRE_FAUNE: Record<string, "m" | "f"> = {
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
 * Les noms de faune que la règle de `pluriel` ne sait pas accorder.
 *
 * Un seul, et il montre bien pourquoi la règle ne peut pas s'en tirer seule :
 * « pique-prune » est un composé **verbe + nom**, dont le verbe reste invariable
 * (« pique-prunes »), alors que « chêne-liège » est un composé nom + nom, dont
 * les deux s'accordent (« chênes-lièges »). Rien dans la **forme** ne les
 * distingue — il faudrait savoir que « pique » est un verbe. La règle traite le
 * cas général, la liste traite ce qu'elle ne peut pas savoir.
 */
const PLURIELS_FAUNE: Record<string, string> = {
  pique_prune: "pique-prunes",
};

/**
 * Le nom d'une espèce de faune au fil du texte, au singulier.
 *
 * **Il n'est pas mis en minuscules**, contrairement à celui d'une essence, et
 * c'est une différence entre les deux atlas et non un oubli : les essences y
 * sont écrites en tête de fiche (« Bouleau verruqueux »), la faune au fil du
 * texte (« mésange bleue »). Abaisser la casse ici donnerait « murin de
 * bechstein » et « rosalie des alpes » — un nom propre reste un nom propre.
 */
export function nomFaune(especeId: string): string {
  return especeFaune(especeId)?.nom ?? especeId;
}

/** Le nom d'une espèce de faune, accordé au nombre : « deux mésanges bleues ». */
export function nomFaunes(especeId: string, n: number): string {
  if (n <= 1) return nomFaune(especeId);
  return PLURIELS_FAUNE[especeId] ?? pluriel(nomFaune(especeId), n);
}

/**
 * « de » ou « d' », selon ce qui suit. Aucune espèce de l'atlas ne commence
 * aujourd'hui par une voyelle au pluriel, mais « une colonie d'oreillards » est
 * exactement le genre de phrase qu'une fiche de plus fabriquerait.
 */
function de(mot: string): string {
  return /^[aeiouyâàéèêëîïôöûüh]/i.test(mot) ? `d'${mot}` : `de ${mot}`;
}

/**
 * **Ce qui s'installe**, nommé juste : un groupe nominal avec son article.
 *
 * > « un couple de mésanges bleues », « une colonie de murins de Bechstein »,
 * > « une population de pique-prunes », « un écureuil roux ».
 *
 * **Et c'est tout l'objet de la fonction.** Le moteur appelle « individu » ce qui
 * est tantôt une bête, tantôt un couple nicheur, tantôt quarante femelles dans
 * une loge de pic noir, tantôt des dizaines de larves dans un fût. Écrire « une
 * noctule s'installe » serait faux d'un facteur quarante, et surtout faux dans
 * ce que ça raconte : une noctule solitaire n'est pas un événement de la
 * parcelle, une colonie de parturition en est un. Ce que le moteur en dit est le
 * champ `unite` de la fiche (`faune.ts`) ; cette fonction ne fait que le mettre
 * en français, et aucune espèce n'y est nommée.
 *
 * Le sujet rendu est toujours **singulier** — un couple, une colonie, une
 * population, une bête — donc le verbe qui suit ne s'accorde jamais :
 * « s'installe », « quitte la parcelle », quelle que soit l'espèce. C'est
 * délibéré, et ça épargne une seconde table d'accord à tous les appelants.
 */
export function libelleFaune(especeId: string): string {
  const espece = especeFaune(especeId);
  if (!espece) return especeId;
  switch (espece.unite) {
    case "couple":
      return `un couple ${de(nomFaunes(especeId, 2))}`;
    case "colonie":
      return `une colonie ${de(nomFaunes(especeId, 2))}`;
    case "population":
      return `une population ${de(nomFaunes(especeId, 2))}`;
    default:
      return `${GENRE_FAUNE[especeId] === "f" ? "une" : "un"} ${nomFaune(especeId)}`;
  }
}

/**
 * **Pourquoi il est parti** (`CauseDepart`, faune.ts).
 *
 * Aucune des trois phrases ne s'accorde, et c'est voulu : le sujet peut être un
 * couple, une colonie ou une population, et « la parcelle ne **le** nourrit plus »
 * aurait obligé à savoir lequel. Des compléments impersonnels disent la même
 * chose et restent justes partout.
 *
 * `arbreDisparu` est la seule des trois qui soit une **conséquence directe de la
 * conduite du joueur** — il vient d'abattre l'arbre porteur, ou la chandelle
 * qu'il a laissée debout s'est abattue. Elle se dit donc franchement.
 */
const DEPART_DIT: Record<CauseDepart, string> = {
  arbreDisparu: "son arbre porteur a disparu",
  giteTropPetit: "son gîte a cessé de convenir",
  tableVide: "deux saisons de suite sans assez à manger",
};

/** La cause d'un départ de faune, en clair. */
export function departDit(cause: CauseDepart): string {
  return DEPART_DIT[cause];
}

/**
 * Un groupe nominal devient un **début de phrase**.
 *
 * `libelleFaune` rend « un couple de mésanges bleues », qui s'écrit tel quel au
 * fil du texte et prend une capitale en tête de ligne. Mettre la capitale dans
 * le libellé aurait obligé chaque autre appelant à la retirer.
 */
export function capitale(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
