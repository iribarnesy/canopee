/**
 * **Quand récolter**, **et ce qu'il y a à prendre** (#191).
 *
 * **Une seule mesure de ce qui est mûr**, et c'est tout l'objet de ce module.
 * La règle vivait au milieu du worker, où elle s'était dédoublée sans que
 * personne le voie : ce qu'on **cueillait** se filtrait à `SEUIL_ARBRE_KG` par
 * pied, ce à quoi on le **comparait** additionnait tous les arbres sans seuil.
 *
 * Deux mesures de la même chose finissent toujours par diverger. Celles-là
 * divergeaient dès le premier sous-bois un peu dense : sur une parcelle où des
 * milliers de ronces portent chacune quelques grammes, ces miettes — jamais
 * cueillables — tenaient le compteur au-dessus du seuil toute l'année. Le front
 * ne retombait plus, et plus rien n'était cueilli après la première essence
 * mûre. Mesuré en jeu : 115 kg de pommes sur l'arbre en semaine 39, comparés à
 * un « précédent » de 28 kg de miettes, treize années de suite.
 *
 * Les deux décisions que ce module sert :
 *
 * - **cueillir** est sans conséquence si on le fait trop souvent : `fruitsKg`
 *   n'est non nul que pendant la fenêtre de récolte de l'essence (`tick.ts` le
 *   pose à `recolteWeek`, le remet à zéro à `recolteWeek + fenetreRecolteWeeks`),
 *   et une cueillette vide l'arbre ;
 * - **prévenir** — arrêter le temps pour laisser la main — serait insupportable
 *   chaque semaine. Là, et là seulement, il faut un front montant : `arbresMurs`
 *   des deux côtés de la comparaison, jamais autre chose.
 *
 * Ces fonctions sont ici, et pas dans le worker, pour qu'un essai puisse les
 * prendre en faute — c'est l'essai qui manquait, et il a coûté treize ans de
 * jeu dans un navigateur.
 */

/** En dessous, un arbre n'a rien qui vaille un geste. */
export const SEUIL_ARBRE_KG = 0.5;
/** En dessous, la parcelle entière n'a rien qui vaille une action. */
export const SEUIL_PARCELLE_KG = 1;

/**
 * Les essences que le joueur a **semées** lui-même, d'après son propre journal.
 *
 * **Rien à demander au moteur** : chaque action `planter` porte son essence, et
 * le journal est la sauvegarde. C'est la seule chose qui distingue un verger
 * d'une friche, et le moteur n'a aucune raison de la connaître — pour lui, un
 * pommier planté et une ronce venue de la haie sont deux tiges.
 */
export function especesSemees(
  actions: readonly { type: string; especeId?: string }[],
): Set<string> {
  const vues = new Set<string>();
  for (const a of actions) {
    if (a.type === "planter" && a.especeId) vues.add(a.especeId);
  }
  return vues;
}

/**
 * Ce que le joueur a **décidé**, essence par essence — et rien d'autre.
 *
 * Seules les essences qu'il a touchées y figurent. Les autres suivent la règle
 * par défaut (« on cueille ce qu'on a semé »), et c'est ce qui permet à une
 * décision de **survivre** à une plantation ultérieure : retirer la ronce de la
 * récolte automatique, puis semer de la ronce, ne doit pas la réintroduire en
 * douce.
 */
export type ChoixRecolte = Record<string, boolean>;

/**
 * Les essences que la récolte automatique cueille : ce qu'on a semé, plus ce
 * qu'on a explicitement ajouté, moins ce qu'on a explicitement retiré.
 *
 * Une seule fonction pour cette règle, appelée par le worker **et** par l'écran :
 * l'un décide qui est cueilli, l'autre affiche des pastilles allumées ou
 * éteintes, et les deux doivent dire la même chose.
 */
export function especesRecoltees(
  semees: ReadonlySet<string>,
  choix: ChoixRecolte = {},
): Set<string> {
  const actives = new Set(semees);
  for (const [especeId, actif] of Object.entries(choix)) {
    if (actif) actives.add(especeId);
    else actives.delete(especeId);
  }
  return actives;
}

/**
 * Ce qu'une pastille doit montrer pour une essence : allumée ou éteinte, et
 * si c'est le joueur qui l'a dit.
 */
export function etatDeLaRecolte(
  especeId: string,
  semees: ReadonlySet<string>,
  choix: ChoixRecolte = {},
): { active: boolean; choisi: boolean } {
  const choisi = especeId in choix;
  return { active: choisi ? choix[especeId] === true : semees.has(especeId), choisi };
}

/** Ce qu'un arbre porte, vu d'ici. */
export interface ArbrePorteur {
  id: number;
  especeId: string;
  alive: boolean;
  fruitsKg: number;
}

/**
 * Les arbres qu'il y a lieu de cueillir, et ce qu'ils portent en tout.
 *
 * **On ne cueille que ce qu'on a semé**, quand `semees` est donné. La récolte
 * automatique existe pour qu'on ne rate pas **sa** fenêtre de récolte en avançant
 * vite ; cueillir la friche qui a envahi la parcelle n'est pas ça. Mesuré dans
 * une partie : « Récolte : 382 kg de ronce → +1527 € (152,7 h) », cent
 * cinquante-deux heures dans une semaine qui en compte soixante, passées sur
 * des ronces que personne n'avait plantées — dans un niveau qui parle de
 * pommes.
 *
 * Le joueur garde la main : une essence qu'il n'a pas semée se récolte en la
 * sélectionnant, comme n'importe quel geste.
 */
export function arbresMurs(
  arbres: readonly ArbrePorteur[],
  semees?: ReadonlySet<string>,
): {
  ids: number[];
  kg: number;
} {
  const ids: number[] = [];
  let kg = 0;
  for (const a of arbres) {
    if (!a.alive || a.fruitsKg <= SEUIL_ARBRE_KG) continue;
    if (semees && !semees.has(a.especeId)) continue;
    ids.push(a.id);
    kg += a.fruitsKg;
  }
  return { ids, kg };
}

/**
 * Faut-il cueillir maintenant ? Oui dès qu'il y a de quoi.
 *
 * Pas de front : chaque essence est cueillie dans **sa** fenêtre, et rien ne peut
 * être pris deux fois.
 */
export function fautIlCueillir(kgMurs: number): boolean {
  return kgMurs > SEUIL_PARCELLE_KG;
}

/**
 * Faut-il **arrêter le temps** pour laisser le joueur cueillir lui-même ?
 *
 * Ici le front montant est justifié : on ne prévient qu'à l'arrivée d'une
 * maturité, pas à chaque semaine où elle dure. Il garde l'angle mort que #191
 * laisse à instruire — dans une parcelle variée, seule la première essence mûre
 * déclenche l'avis.
 */
export function fautIlPrevenir(kgMurs: number, kgSemainePrecedente: number): boolean {
  return kgMurs > SEUIL_PARCELLE_KG && kgSemainePrecedente <= SEUIL_PARCELLE_KG;
}
