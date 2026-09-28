/**
 * **Les arbres suivis** : leur journal à eux (#149).
 *
 * Retour de partie : « Je plante des abricotiers, je veux surveiller très
 * précisément ce qui leur arrive — pas qu'ils meurent sans que je comprenne
 * rien. » La sélection montre l'état **courant** d'un arbre ; rien ne
 * s'accumulait, et à ×52 une année passe entre deux images.
 *
 * **Rien n'est recalculé, tout est relu.** Le moteur nomme déjà les identités :
 * `morts {id, cause}`, `gestes {ids}` — gibier compris —, `franchissements
 * {id, deStade, versStade}`. Ce module ne fait que retenir ce qui concerne les
 * arbres suivis et le ranger en événements datés.
 *
 * **Ces listes-là sont des événements, et le worker les accumule** jusqu'à
 * l'instantané suivant : à ×52 un instantané couvre une demi-année, et pas une
 * coupe ni un brout ne s'y perd. On peut donc les recopier sans se demander
 * quelle semaine ils portent.
 *
 * **Une mémoire, en revanche, pour ce qui est un état** : un gel de floraison
 * et une souffrance lente ne s'annoncent nulle part, ils se **lisent** sur l'arbre.
 * Les redire à chaque instantané ferait un journal illisible, et les tester
 * contre la semaine courante les raterait dès qu'on avance vite. On retient
 * donc ce qu'on a déjà dit, et seul un changement fait un événement.
 *
 * Module **pur** : pas de React, pas de DOM, pas d'horloge.
 */

import { estGesteSurArbres, type GesteTypeArbre } from "../engine/actions";
import type { CauseMort } from "../engine/trees";
import type { PorteurDeJournal } from "./journal";
import { causeDite, estFeminin } from "./mots";

/**
 * Ce qu'il faut savoir d'un arbre pour lire ce qui lui arrive.
 *
 * **Structurel, comme `PorteurDeJournal`**, et pour la même raison : l'arbre du
 * moteur et celui de l'instantané portent ces champs-là sous les mêmes noms.
 * Le worker n'a donc pas à fabriquer un instantané pour dépouiller une semaine
 * qu'il vient de simuler.
 */
export interface ArbreSuivable {
  id: number;
  especeId: string;
  bloomFrosted: boolean;
  causeLente?: CauseMort;
  stressLent?: number;
}

/**
 * Ce qu'un geste a **fait** à l'arbre, dit au passé, et sous quelle rubrique.
 *
 * Les deux derniers ne sont pas du joueur : le moteur range le **gibier** parmi les
 * gestes sur arbres (`actions.ts`), et c'est une bonne nouvelle pour ici — un
 * brout arrive daté et nommé, sans avoir à guetter le changement de
 * `brouteSemaine`. Le `Record` complet fait le reste : un geste ajouté au
 * moteur ne compile plus tant qu'on ne lui a pas donné sa phrase.
 */
const GESTE_SUBI: Record<GesteTypeArbre, { quoi: QuoiSuivi; texte: string }> = {
  planter: { quoi: "geste", texte: "planté" },
  couper: { quoi: "geste", texte: "abattu" },
  eclaircir: { quoi: "geste", texte: "abattu par une éclaircie" },
  elaguer: { quoi: "geste", texte: "élagué" },
  trogner: { quoi: "geste", texte: "étêté en trogne" },
  receper: { quoi: "geste", texte: "recépé" },
  recolter: { quoi: "geste", texte: "récolté" },
  leverEcorce: { quoi: "geste", texte: "démasclé" },
  brouter: { quoi: "brout", texte: "brouté par le gibier" },
  frotter: { quoi: "frottis", texte: "frotté par un cervidé" },
};

/** Ce qui peut arriver à un arbre suivi. */
export type QuoiSuivi = "geste" | "stade" | "brout" | "frottis" | "gel" | "souffre" | "mort";

export interface EvenementSuivi {
  /** semaine de jeu où on l'a **appris** — celle de l'instantané qui le porte */
  semaine: number;
  idArbre: number;
  quoi: QuoiSuivi;
  /** la phrase qu'on lit, déjà accordée */
  texte: string;
}

/** Ce qu'on a déjà vu d'un arbre, pour ne pas le redire à chaque semaine. */
export interface EtatVu {
  gel: boolean;
  /** la souffrance **déjà annoncée**, et non celle qu'on lit : voir plus bas */
  causeDite?: CauseMort;
  /** l'arbre était-il encore là au dernier instantané ? */
  present: boolean;
}

/** La mémoire du suivi, par identifiant d'arbre. */
export type MemoireDesSuivis = ReadonlyMap<number, EtatVu>;

/**
 * Seuil de stress lent au-delà duquel on annonce que l'arbre souffre.
 *
 * `stressLent` est une part du stress, amortie avec lui : sous un dixième, il
 * s'agit d'un arbre qui a soif un été et non d'un arbre qui dépérit. Annoncer
 * plus bas ferait un journal qui crie tous les mois de juillet.
 */
export const SEUIL_SOUFFRANCE = 0.1;

/**
 * Ce qui est arrivé aux arbres cette semaine.
 *
 * **Plus de filtre, et c'est tout le lot de #225.** Ce module ne retenait que
 * les arbres déjà suivis, si bien qu'un arbre dont on venait de remarquer la
 * mort n'avait, par construction, aucun passé — « j'ai commencé à le suivre
 * après qu'il soit mort ». Or tout ce qui arrive est déjà **nommé** par le
 * moteur : il n'y avait rien à demander, seulement à cesser de jeter.
 *
 * Rend les événements **et** la mémoire à garder pour la fois suivante ;
 * l'appelant n'a rien à comprendre de ce qui est retenu.
 */
export function accumulerLesSuivis(
  memoire: MemoireDesSuivis,
  semaine: number,
  porteur: PorteurDeJournal,
  arbres: readonly ArbreSuivable[],
): { evenements: EvenementSuivi[]; memoire: MemoireDesSuivis } {
  const evenements: EvenementSuivi[] = [];
  const suite = new Map<number, EtatVu>();
  const dire = (idArbre: number, quoi: QuoiSuivi, texte: string) =>
    evenements.push({ semaine, idArbre, quoi, texte });

  // Les gestes : le moteur nomme les arbres touchés, on n'a qu'à les lire.
  for (const geste of porteur.gestes ?? []) {
    if (!estGesteSurArbres(geste)) continue;
    for (const id of geste.ids) {
      const subi = GESTE_SUBI[geste.type];
      dire(id, subi.quoi, subi.texte);
    }
  }
  // Les franchissements de stade, de même.
  for (const f of porteur.franchissements ?? []) {
    dire(f.id, "stade", `passe de ${f.deStade} à ${f.versStade}`);
  }
  // Les morts, avec leur cause en clair : c'est la demande de la v1.
  for (const m of porteur.morts ?? []) {
    // Accordé à l'**essence** : « la ronce meurt étouffée », pas « étouffé ».
    dire(m.id, "mort", `meurt ${causeDite(m.cause, 1, estFeminin(m.especeId))}`);
  }

  for (const arbre of arbres) {
    const vu = memoire.get(arbre.id);
    if (arbre.bloomFrosted && !vu?.gel) {
      dire(arbre.id, "gel", "fleurs grillées par un gel tardif");
    }
    // **Une souffrance s'annonce une fois par cause, et pas une fois par été.**
    // Mesuré dans le navigateur : `stressLent` redescend l'hiver et remonte en
    // juillet, si bien qu'oublier la cause dès qu'elle repasse sous le seuil
    // refaisait l'annonce tous les ans, pour chaque arbre suivi. On retient
    // donc ce qu'on a **dit** — et rien d'autre ne l'efface qu'une cause nouvelle,
    // qui est une autre nouvelle. En dessous du seuil, on ne dit rien et on ne
    // retient rien : l'arbre qui a soif un peu pendant dix ans avant de
    // dépérir pour de bon doit garder son annonce pour le jour où il dépérit.
    const cause = arbre.causeLente;
    const souffre = cause !== undefined && (arbre.stressLent ?? 0) >= SEUIL_SOUFFRANCE;
    const dite = souffre && cause !== vu?.causeDite ? cause : vu?.causeDite;
    if (souffre && cause !== vu?.causeDite) {
      dire(arbre.id, "souffre", `souffre : ${causeDite(cause, 1, estFeminin(arbre.especeId))}`);
    }
    suite.set(arbre.id, {
      gel: arbre.bloomFrosted,
      ...(dite === undefined ? {} : { causeDite: dite }),
      present: true,
    });
  }
  // Un arbre qui a quitté la parcelle sans mort rapportée : abattu, tombé,
  // consumé. On le dit plutôt que de laisser son journal s'arrêter net.
  for (const [id, vu] of memoire) {
    if (suite.has(id) || !vu.present) continue;
    const nomme = evenements.some((e) => e.idArbre === id);
    if (!nomme) dire(id, "mort", "a quitté la parcelle");
    suite.set(id, { ...vu, present: false });
  }
  return { evenements, memoire: suite };
}

/** Les suivis morts dans cet instantané : de quoi arrêter le temps et cadrer. */
export function suivisMorts(
  porteur: PorteurDeJournal,
  suivis: ReadonlySet<number>,
): { id: number; x: number; y: number; cause: CauseMort }[] {
  return (porteur.morts ?? [])
    .filter((m) => suivis.has(m.id))
    .map((m) => ({ id: m.id, x: m.x, y: m.y, cause: m.cause }));
}

/** Un événement, ou plusieurs identiques qui se suivent. */
export interface LigneDeSuivi extends EvenementSuivi {
  /** combien de fois de suite, la même chose — 1 dans le cas ordinaire */
  fois: number;
  /** la semaine du plus **ancien** du groupe ; `semaine` porte le plus récent */
  depuisSemaine: number;
}

/**
 * Ranger un événement à la suite d'un journal, en groupant ce qui se répète.
 *
 * Mesuré à l'écran : un jeune pin sylvestre est brouté toutes les semaines, et
 * son journal n'était plus qu'une colonne de « brouté par le gibier » — le
 * geste qu'on cherchait et la mort qu'on attendait passaient dessous. Mesuré
 * dans le navigateur une seconde fois, en gardant l'histoire complète (#225) :
 * **806 lignes pour un seul arbre** sur trente ans de maturation, dont 800
 * brouts. C'est pourquoi le groupage se fait à l'écriture et pas seulement à
 * la lecture : ce qui n'est pas écrit ne pèse rien.
 *
 * **Seulement ce qui se suit**, et le texte doit être le même mot pour mot :
 * un brout, un gel, un brout redevient trois lignes. On ne perd donc pas
 * l'histoire, on cesse de la répéter — et les deux semaines du groupe sont
 * gardées, la plus ancienne et la plus récente, quel que soit le **sens** dans
 * lequel on l'a parcourue : le worker écrit du passé vers le présent, l'écran
 * relit du présent vers le passé.
 */
export function ajouterAuJournal(lignes: LigneDeSuivi[], e: EvenementSuivi): void {
  const derniere = lignes[lignes.length - 1];
  if (derniere && derniere.idArbre === e.idArbre && derniere.texte === e.texte) {
    derniere.fois += 1;
    derniere.depuisSemaine = Math.min(derniere.depuisSemaine, e.semaine);
    derniere.semaine = Math.max(derniere.semaine, e.semaine);
    return;
  }
  lignes.push({ ...e, fois: 1, depuisSemaine: e.semaine });
}

/** Le même groupage, sur une liste entière : une seule règle pour les deux. */
export function grouperLesSuivis(evenements: readonly EvenementSuivi[]): LigneDeSuivi[] {
  const lignes: LigneDeSuivi[] = [];
  for (const e of evenements) ajouterAuJournal(lignes, e);
  return lignes;
}
