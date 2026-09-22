/**
 * LES NIVEAUX : un objectif, des paliers, et une fin (#188).
 *
 * `v1.md` pose la demande — *« Un niveau a un objectif général et des objectifs
 * intermédiaires »*, *« Une fin de niveau qui dit ce qui s'est passé et si
 * l'objectif est atteint »* — et le tag v0.3 constate qu'il n'y a rien de tout
 * ça. Ce module est le mécanisme, pas encore le contenu : **un niveau est une
 * FICHE**, au même titre qu'une espèce ou qu'un paysage, et un seul code les
 * joue tous. Un `if (niveau === "verger")` quelque part signerait l'échec.
 *
 * Ce module ne parle ni à React ni au worker, et ne connaît ni `window` ni
 * l'horloge : on lui DONNE un instantané et un cumul, il rend un avancement.
 * C'est ce qui permet de l'éprouver sans navigateur — la même discipline que
 * `suivis.ts` et `facture.ts`.
 *
 * ## Ce qu'un palier a le droit de lire
 *
 * Deux choses, et rien d'autre :
 *
 * - **l'instantané**, tel que le moteur le donne — trésorerie, carbone,
 *   biodiversité, arbres, sol ;
 * - **les cumuls**, qui sont la SOMME d'événements que le moteur a rapportés
 *   (les kilos d'une récolte voyagent dans `GesteSurArbres.masseKg`).
 *
 * Additionner ce que le moteur rapporte n'est pas recalculer une de ses
 * règles : c'est ce que `suivis.ts` fait déjà des morts et des franchissements.
 * En revanche, un palier qui aurait besoin d'une grandeur que personne n'émet
 * ne se contourne pas — il part en issue et le niveau attend.
 */

import { estGesteSurArbres, type GesteVisible } from "../engine/actions";
import type { ProfilDepart } from "./profils";
import type { Snapshot } from "./protocol";

/**
 * Ce qui s'est ACCUMULÉ depuis le début du niveau.
 *
 * Un instantané dit ce qui est là ; il ne dit pas ce qui est passé. « Récolter
 * une tonne de pommes » — l'exemple de `v1.md` — porte sur des fruits qui ont
 * quitté la parcelle, donc sur rien que l'instantané puisse encore montrer.
 *
 * **Chaque champ est la somme d'un geste rapporté**, jamais une déduction. Ce
 * qui n'est pas rapporté n'est pas ici : le volume de bois sorti, par exemple,
 * ne voyage pas (`ArbreRetire` porte la géométrie, pas le volume), donc aucun
 * palier ne peut encore s'écrire dessus.
 */
export interface Cumuls {
  /** fruits réellement cueillis, toutes essences confondues, kg (`recolter`) */
  fruitsKg: number;
  /**
   * Les mêmes kilos, PAR ESSENCE.
   *
   * **Sans quoi « récolter deux cents kilos de pommes » se gagne sans pommier.**
   * Mesuré : sur un limon riche bordé de bocage, une parcelle où l'on ne plante
   * RIEN se couvre de semis — soixante tiges la première année, mille quatre
   * cents à la neuvième — et la récolte automatique y cueille noisettes,
   * prunelles et sureau. Quinze cents kilos au compteur, pas un pommier.
   *
   * L'essence ne voyage pas dans le geste (`GesteSurArbres` n'a que des
   * identifiants), mais elle est dans l'ÉTAT : un arbre récolté est toujours
   * debout après sa cueillette. Joindre deux faits que le moteur rapporte n'est
   * pas recalculer une de ses règles.
   */
  fruitsParEspece: Record<string, number>;
  /** écorce réellement levée, kg (`leverEcorce`) */
  ecorceKg: number;
  /** tiges mises en terre (`planter`) */
  plantes: number;
  /** tiges qui ont quitté la carte (`couper`, `eclaircir`) */
  abattues: number;
}

export const CUMULS_VIDES: Cumuls = {
  fruitsKg: 0,
  fruitsParEspece: {},
  ecorceKg: 0,
  plantes: 0,
  abattues: 0,
};

/**
 * Ajouter au cumul ce que la semaine a produit.
 *
 * Pur, et c'est nécessaire : la partie se REJOUE depuis son journal d'actions à
 * chaque reprise (`SaveGame` = la graine + les actions). Un cumul qui vivrait
 * ailleurs que dans ce rejeu divergerait de la partie à la première
 * sauvegarde.
 */
export function accumuler(
  cumuls: Cumuls,
  gestes: readonly GesteVisible[],
  /**
   * Les arbres tels qu'ils sont APRÈS le geste, pour retrouver l'essence de
   * chaque récolte. Absents, les kilos ne comptent que dans le total : mieux
   * vaut un compte par essence vide qu'un compte faux.
   */
  arbres?: readonly { id: number; especeId: string }[],
): Cumuls {
  let { fruitsKg, ecorceKg, plantes, abattues } = cumuls;
  const fruitsParEspece = { ...cumuls.fruitsParEspece };
  let especeDe: Map<number, string> | undefined;
  for (const geste of gestes) {
    // Les gestes de ZONE portent parfois le même nom (`planter`,
    // `leverEcorce`) : c'est un seul geste qui touche deux mailles (#124), et
    // c'est la FORME qui les sépare, pas le type.
    if (!estGesteSurArbres(geste)) continue;
    switch (geste.type) {
      case "recolter": {
        fruitsKg += somme(geste.masseKg);
        if (arbres) {
          // La table ne se construit qu'à la première récolte, et une seule
          // fois : chercher chaque identifiant dans la liste coûterait le
          // carré du peuplement, qui passe le millier de tiges en dix ans.
          if (!especeDe) especeDe = new Map(arbres.map((a) => [a.id, a.especeId]));
          geste.ids.forEach((id, i) => {
            const espece = especeDe?.get(id);
            if (!espece) return;
            fruitsParEspece[espece] = (fruitsParEspece[espece] ?? 0) + (geste.masseKg?.[i] ?? 0);
          });
        }
        break;
      }
      case "leverEcorce":
        ecorceKg += somme(geste.masseKg);
        break;
      case "planter":
        plantes += geste.ids.length;
        break;
      case "couper":
      case "eclaircir":
        abattues += geste.ids.length;
        break;
      default:
        break;
    }
  }
  return { fruitsKg, fruitsParEspece, ecorceKg, plantes, abattues };
}

function somme(masses: readonly number[] | undefined): number {
  let total = 0;
  for (const m of masses ?? []) total += m;
  return total;
}

/** L'état sur lequel un palier se mesure. */
export interface EtatDuNiveau {
  snapshot: Snapshot;
  cumuls: Cumuls;
  /** semaines écoulées DEPUIS LE DÉBUT du niveau */
  semaines: number;
}

/**
 * Un objectif, général ou intermédiaire.
 *
 * L'énoncé et la condition sont la MÊME donnée : la phrase que le joueur lit
 * s'écrit à partir de `quoi`, `cible` et `unite` (`libelleDuPalier`), jamais à
 * côté d'eux. Écrire « Récolter 200 kg » dans un texte ET 200 dans la condition,
 * c'est deux copies d'une règle, donc deux copies qui divergeront (§2.1).
 */
export interface Palier {
  id: string;
  /** ce qu'il faut faire, sans le chiffre : « Récolter des fruits » */
  quoi: string;
  /** ce qu'on en a, lu sur l'état */
  mesure: (etat: EtatDuNiveau) => number;
  /** ce qu'il en faut */
  cible: number;
  /** l'unité affichée derrière les deux chiffres */
  unite: string;
  /**
   * Un palier ACQUIS le reste, même si la grandeur redescend.
   *
   * C'est le cas des objectifs intermédiaires de `v1.md`, qui « font découvrir
   * les gestes nécessaires dans l'ordre » : planter douze arbres est une chose
   * apprise, et en perdre un ensuite ne la désapprend pas. Un objectif qui doit
   * tenir à la fin — une trésorerie positive — porte `acquis: false`.
   */
  acquis?: boolean;
  /** un mot pour savoir par où commencer, si ce n'est pas évident */
  aide?: string;
}

/** Une fiche de niveau. */
export interface Niveau {
  id: string;
  nom: string;
  /** l'objectif général, en une phrase, lue avant de commencer */
  enonce: string;
  /**
   * Les réglages de la partie — ceux que le joueur ne voit pas (#189).
   *
   * C'est un `ProfilDepart`, celui de `profils.ts`, et non une seconde
   * description du même terrain : station, bordures, relief, eau, nappe,
   * bassin, scénario, année, vieillissement y sont déjà.
   */
  depart: ProfilDepart;
  /** la graine, qui ne fait pas partie du profil — ici un niveau la fixe */
  seed: number;
  /** météo réelle de la station, ou année type répétée */
  meteo: "reelle" | "synthetique";
  /** l'argent contraint-il ce niveau ? */
  economie: boolean;
  /**
   * Le temps imparti, en semaines simulées. Zéro = pas de limite.
   *
   * Ce n'est PAS la durée réelle d'une partie : `v1.md` demande dix à trente
   * minutes de temps réel, ce qui dépend de la vitesse à laquelle on avance, et
   * se mesure en jouant.
   */
  semainesImparties: number;
  paliers: readonly Palier[];
}

/** Où en est un palier. */
export interface AvancementPalier {
  palier: Palier;
  valeur: number;
  atteint: boolean;
  /** de 0 à 1, pour une jauge */
  part: number;
}

export type Issue = "en-cours" | "reussi" | "echoue";

export interface Avancement {
  paliers: AvancementPalier[];
  /** le premier palier non atteint : celui sur lequel on travaille */
  courant?: AvancementPalier;
  issue: Issue;
  /** pourquoi c'est fini, quand ça l'est */
  raison?: string;
  /** semaines restantes, si le niveau en impartit */
  restantes?: number;
}

/**
 * Où en est le niveau.
 *
 * `acquis` est la MÉMOIRE des paliers déjà franchis, donnée de l'extérieur —
 * même procédé que la mémoire de `suivis.ts`, et pour la même raison : ce
 * module reste pur, et ce qui doit survivre à un rejeu vit là où le rejeu passe.
 */
export function avancementDuNiveau(
  niveau: Niveau,
  etat: EtatDuNiveau,
  acquis: ReadonlySet<string> = new Set(),
): Avancement {
  const paliers = niveau.paliers.map((palier) => {
    const valeur = palier.mesure(etat);
    const atteint = valeur >= palier.cible || (palier.acquis !== false && acquis.has(palier.id));
    return {
      palier,
      valeur,
      atteint,
      part: palier.cible > 0 ? Math.min(1, Math.max(0, valeur / palier.cible)) : atteint ? 1 : 0,
    };
  });
  const courant = paliers.find((p) => !p.atteint);
  const restantes =
    niveau.semainesImparties > 0
      ? Math.max(0, niveau.semainesImparties - etat.semaines)
      : undefined;

  if (!courant) return { paliers, issue: "reussi", raison: RAISON_REUSSI, restantes };
  // La faillite passe avant le temps : c'est une fin, pas un retard, et le
  // moteur la déclare lui-même (`economy.bankrupt`).
  if (etat.snapshot.economy.bankrupt) {
    return { paliers, courant, issue: "echoue", raison: RAISON_FAILLITE, restantes };
  }
  if (restantes === 0) {
    return { paliers, courant, issue: "echoue", raison: RAISON_TEMPS, restantes };
  }
  return { paliers, courant, issue: "en-cours", restantes };
}

const RAISON_REUSSI = "Tous les objectifs sont atteints.";
const RAISON_FAILLITE = "La trésorerie est à sec : la parcelle ne se tient plus.";
const RAISON_TEMPS = "Le temps imparti est écoulé.";

/** Les paliers franchis à cet instant, pour nourrir la mémoire. */
export function paliersFranchis(avancement: Avancement): string[] {
  return avancement.paliers.filter((p) => p.atteint).map((p) => p.palier.id);
}

/** L'énoncé chiffré d'un palier : « Récolter des fruits — 40 / 200 kg ». */
export function libelleDuPalier(a: AvancementPalier): string {
  return `${a.palier.quoi} — ${arrondi(a.valeur)} / ${arrondi(a.palier.cible)} ${a.palier.unite}`;
}

/**
 * Un chiffre lisible : pas de décimale inutile, jamais plus d'une.
 *
 * Exporté, et pas recopié là où il resservait : l'écran de fin affiche « il
 * manquait 3,4 kg » avec la même règle que la ligne d'avancement, et deux
 * copies d'une règle finissent par ne plus dire la même chose (§2.1).
 */
export function arrondi(v: number): string {
  return v % 1 === 0 || v >= 100 ? v.toFixed(0) : v.toFixed(1);
}
