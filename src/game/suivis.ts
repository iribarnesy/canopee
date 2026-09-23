/**
 * LES ARBRES SUIVIS : leur journal à eux (#149).
 *
 * Retour de partie : « Je plante des abricotiers, je veux surveiller très
 * précisément ce qui leur arrive — pas qu'ils meurent sans que je comprenne
 * rien. » La sélection montre l'état COURANT d'un arbre ; rien ne
 * s'accumulait, et à ×52 une année passe entre deux images.
 *
 * **Rien n'est recalculé, tout est relu.** Le moteur nomme déjà les identités :
 * `morts {id, cause}`, `gestes {ids}` — gibier compris —, `franchissements
 * {id, deStade, versStade}`. Ce module ne fait que retenir ce qui concerne les
 * arbres suivis et le ranger en événements datés.
 *
 * **Ces listes-là sont des ÉVÉNEMENTS, et le worker les accumule** jusqu'à
 * l'instantané suivant : à ×52 un instantané couvre une demi-année, et pas une
 * coupe ni un brout ne s'y perd. On peut donc les recopier sans se demander
 * quelle semaine ils portent.
 *
 * **Une mémoire, en revanche, pour ce qui est un ÉTAT** : un gel de floraison
 * et une souffrance lente ne s'annoncent nulle part, ils se LISENT sur l'arbre.
 * Les redire à chaque instantané ferait un journal illisible, et les tester
 * contre la semaine courante les raterait dès qu'on avance vite. On retient
 * donc ce qu'on a déjà dit, et seul un changement fait un événement.
 *
 * Module **pur** : pas de React, pas de DOM, pas d'horloge.
 */

import { estGesteSurArbres, type GesteTypeArbre } from "../engine/actions";
import type { CauseMort } from "../engine/trees";
import type { Snapshot } from "./protocol";

/**
 * La cause de mort au SINGULIER.
 *
 * Le moteur en a déjà une table (`LIBELLE_CAUSE`), mais accordée au pluriel —
 * « broutés par le gibier » — parce qu'elle sert aux messages collectifs du
 * journal. Un arbre suivi est un individu. Ce n'est donc pas une copie de la
 * même règle mais l'autre nombre de la même phrase, et le `Record` complet
 * garantit ce qui compte : le jour où le moteur ajoute une cause, ceci ne
 * compile plus tant qu'elle n'a pas sa forme au singulier.
 */
export const CAUSE_AU_SINGULIER: Record<CauseMort, string> = {
  ecrasement: "écrasé par la chute d'un arbre mort",
  secheresse: "de sécheresse",
  engorgement: "asphyxié par l'eau",
  ombre: "étouffé par l'ombre",
  vieillesse: "de vieillesse",
  solHorsGamme: "sur un sol hors de sa gamme de pH",
  feu: "dans l'incendie",
  abroutissement: "brouté par le gibier",
  ravageurs: "achevé par les ravageurs",
  labour: "retourné par le labour",
  boutis: "arraché par le boutis du sanglier",
  maladie: "emporté par la maladie",
  frottis: "annelé par les frottis de cervidés",
  chablis: "couché par la tempête",
  volis: "cassé net par la tempête",
};

/**
 * Ce qu'un geste a FAIT à l'arbre, dit au passé, et sous quelle rubrique.
 *
 * Les deux derniers ne sont pas du joueur : le moteur range le GIBIER parmi les
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
  /** semaine de jeu où on l'a APPRIS — celle de l'instantané qui le porte */
  semaine: number;
  idArbre: number;
  quoi: QuoiSuivi;
  /** la phrase qu'on lit, déjà accordée */
  texte: string;
}

/** Ce qu'on a déjà vu d'un arbre, pour ne pas le redire à chaque semaine. */
export interface EtatVu {
  gel: boolean;
  /** la souffrance DÉJÀ ANNONCÉE, et non celle qu'on lit : voir plus bas */
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
 * Ce qui est arrivé aux arbres suivis depuis le dernier instantané.
 *
 * Rend les événements ET la mémoire à garder pour la fois suivante ; l'appelant
 * n'a rien à comprendre de ce qui est retenu.
 */
export function accumulerLesSuivis(
  memoire: MemoireDesSuivis,
  snapshot: Snapshot,
  suivis: ReadonlySet<number>,
): { evenements: EvenementSuivi[]; memoire: MemoireDesSuivis } {
  const evenements: EvenementSuivi[] = [];
  const suite = new Map<number, EtatVu>();
  if (suivis.size === 0) return { evenements, memoire: suite };
  const semaine = snapshot.week;
  const dire = (idArbre: number, quoi: QuoiSuivi, texte: string) =>
    evenements.push({ semaine, idArbre, quoi, texte });

  // Les gestes : le moteur nomme les arbres touchés, on n'a qu'à filtrer.
  for (const geste of snapshot.gestes ?? []) {
    if (!estGesteSurArbres(geste)) continue;
    for (const id of geste.ids) {
      if (!suivis.has(id)) continue;
      const subi = GESTE_SUBI[geste.type];
      dire(id, subi.quoi, subi.texte);
    }
  }
  // Les franchissements de stade, de même.
  for (const f of snapshot.franchissements ?? []) {
    if (suivis.has(f.id)) dire(f.id, "stade", `passe de ${f.deStade} à ${f.versStade}`);
  }
  // Les morts, avec leur cause en clair : c'est la demande de la v1.
  for (const m of snapshot.morts ?? []) {
    if (suivis.has(m.id)) dire(m.id, "mort", `meurt ${CAUSE_AU_SINGULIER[m.cause]}`);
  }

  for (const arbre of snapshot.trees) {
    if (!suivis.has(arbre.id)) continue;
    const vu = memoire.get(arbre.id);
    if (arbre.bloomFrosted && !vu?.gel) {
      dire(arbre.id, "gel", "fleurs grillées par un gel tardif");
    }
    // **Une souffrance s'annonce une fois par CAUSE, et pas une fois par été.**
    // Mesuré dans le navigateur : `stressLent` redescend l'hiver et remonte en
    // juillet, si bien qu'oublier la cause dès qu'elle repasse sous le seuil
    // refaisait l'annonce tous les ans, pour chaque arbre suivi. On retient
    // donc ce qu'on a DIT — et rien d'autre ne l'efface qu'une cause nouvelle,
    // qui est une autre nouvelle. En dessous du seuil, on ne dit rien et on ne
    // retient rien : l'arbre qui a soif un peu pendant dix ans avant de
    // dépérir pour de bon doit garder son annonce pour le jour où il dépérit.
    const cause = arbre.causeLente;
    const souffre = cause !== undefined && (arbre.stressLent ?? 0) >= SEUIL_SOUFFRANCE;
    const dite = souffre && cause !== vu?.causeDite ? cause : vu?.causeDite;
    if (souffre && cause !== vu?.causeDite) {
      dire(arbre.id, "souffre", `souffre : ${CAUSE_AU_SINGULIER[cause]}`);
    }
    suite.set(arbre.id, {
      gel: arbre.bloomFrosted,
      ...(dite === undefined ? {} : { causeDite: dite }),
      present: true,
    });
  }
  // Un arbre suivi qui a quitté l'instantané sans mort rapportée : abattu,
  // tombé. On le dit plutôt que de laisser son journal s'arrêter net.
  for (const [id, vu] of memoire) {
    if (!suivis.has(id) || suite.has(id) || !vu.present) continue;
    const nomme = evenements.some((e) => e.idArbre === id);
    if (!nomme) dire(id, "mort", "a quitté la parcelle");
    suite.set(id, { ...vu, present: false });
  }
  return { evenements, memoire: suite };
}

/** Les suivis morts dans cet instantané : de quoi arrêter le temps et cadrer. */
export function suivisMorts(
  snapshot: Snapshot,
  suivis: ReadonlySet<number>,
): { id: number; x: number; y: number; cause: CauseMort }[] {
  return (snapshot.morts ?? [])
    .filter((m) => suivis.has(m.id))
    .map((m) => ({ id: m.id, x: m.x, y: m.y, cause: m.cause }));
}

/** Un événement, ou plusieurs identiques qui se suivent. */
export interface LigneDeSuivi extends EvenementSuivi {
  /** combien de fois de suite, la même chose — 1 dans le cas ordinaire */
  fois: number;
  /** la semaine du plus ANCIEN du groupe ; `semaine` porte le plus récent */
  depuisSemaine: number;
}

/**
 * Regrouper ce qui se répète à l'identique et se suit.
 *
 * Mesuré à l'écran : un jeune pin sylvestre est brouté toutes les semaines, et
 * son journal n'était plus qu'une colonne de « brouté par le gibier » — le
 * geste qu'on cherchait et la mort qu'on attendait passaient dessous.
 *
 * **Seulement ce qui se SUIT**, et le texte doit être le même mot pour mot :
 * un brout, un gel, un brout redevient trois lignes. On ne perd donc pas
 * l'histoire, on cesse de la répéter — et les deux semaines du groupe sont
 * gardées, celle où ça a commencé et celle où on en est.
 *
 * Attend la liste déjà triée comme elle sera lue.
 */
export function grouperLesSuivis(evenements: readonly EvenementSuivi[]): LigneDeSuivi[] {
  const lignes: LigneDeSuivi[] = [];
  for (const e of evenements) {
    const derniere = lignes[lignes.length - 1];
    if (derniere && derniere.idArbre === e.idArbre && derniere.texte === e.texte) {
      derniere.fois += 1;
      derniere.depuisSemaine = Math.min(derniere.depuisSemaine, e.semaine);
      continue;
    }
    lignes.push({ ...e, fois: 1, depuisSemaine: e.semaine });
  }
  return lignes;
}
