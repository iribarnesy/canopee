/**
 * Le LECTEUR d'un plan d'ellipse : où en est-on, et qu'est-ce que ça fait à
 * chaque arbre (docs/interface-visuelle.md §5.11).
 *
 * `ellipse.ts` dit CE QU'IL FAUT MONTRER et dans quel ordre ; ce module dit
 * OÙ ON EN EST à un instant donné. La séparation n'est pas cosmétique : un plan
 * se construit une fois par ellipse, un lecteur est interrogé une fois par
 * arbre et par image. L'un peut se permettre de trier et de regrouper, l'autre
 * doit répondre en quelques opérations.
 *
 * **Deux décisions portent tout ce module, et elles ne sont pas évidentes.**
 *
 * 1. **Un arbre déjà tombé reste tombé.** Le premier réflexe est de rendre
 *    « debout » pour tout ce qui n'est pas l'acte en cours — et alors chaque
 *    arbre se relève dès que l'acte suivant démarre. Une ellipse serait une
 *    suite de choses qui se défont. Le lecteur cherche donc l'acte qui
 *    concerne un arbre, et si cet acte est PASSÉ, il rend son état FINAL.
 * 2. **Les sujets d'un acte ne bougent pas en même temps.** « Animer tous les
 *    arbres morts dans la semaine » ne veut pas dire les animer au même
 *    millième de seconde : trente-quatre arbres qui tombent en cadence font une
 *    chorégraphie, pas une forêt. Chacun part avec un décalage tiré de son
 *    identifiant — déterministe, comme tout le reste du rendu — dans la
 *    première moitié de son créneau.
 *
 * Module **pur** : aucune horloge à lui, aucun canvas. On lui donne le temps
 * écoulé, il rend des nombres.
 */

import { estGesteSurZone, type GesteSurZone } from "../../engine/actions";
import type { ChuteDeChandelle } from "../../engine/tick";
import type { CauseMort } from "../../engine/trees";
import type { Vue } from "../camera";
import { chuteEnCours, DEBOUT, type Deformation } from "./chute";
import type { Acte, PlanDEllipse } from "./ellipse";
import { type ArbreVivant, type EtatMourant, mortAccomplie, mourirEnCours } from "./mort";
import { type CelluleVoilee, cellulesVoilees, rangsDuBalayage } from "./voile";

/**
 * Part du créneau d'un acte réservée à l'ÉCHELONNEMENT de ses sujets.
 *
 * La moitié : les derniers partent à mi-créneau et finissent avec lui. Plus
 * serré, l'acte se lit comme un seul mouvement ; plus étalé, les premiers sont
 * couchés depuis longtemps quand les derniers s'ébranlent.
 */
export const PART_ECHELONNEE = 0.5;

/** Où en est l'ellipse, et dans quel acte. */
export interface OuEnEst {
  /** l'acte en cours, s'il y en a un */
  acte?: Acte;
  /** avancement dans cet acte ∈ [0,1] */
  avancement: number;
  /** vrai quand le plan est joué jusqu'au bout */
  fini: boolean;
}

/** L'acte en cours à un instant donné, et son avancement. */
export function ouEnEst(plan: PlanDEllipse, ecouleMs: number): OuEnEst {
  if (ecouleMs >= plan.dureeMs) return { avancement: 1, fini: true };
  for (const acte of plan.actes) {
    if (ecouleMs < acte.debutMs) break;
    if (ecouleMs < acte.debutMs + acte.dureeMs) {
      return {
        acte,
        avancement: acte.dureeMs > 0 ? (ecouleMs - acte.debutMs) / acte.dureeMs : 1,
        fini: false,
      };
    }
  }
  return { avancement: 0, fini: false };
}

/**
 * Un plan INDEXÉ par arbre, prêt à être interrogé image après image.
 *
 * **Le premier jet cherchait linéairement, et il ne tenait pas.** `deformationDe`
 * parcourait les actes puis leurs sujets à chaque appel — or il est appelé une
 * fois par arbre et par image. Sur un banc à trois mille chutes, ça fait neuf
 * millions de comparaisons par image : la page ne finissait jamais de charger.
 * C'est exactement la « recherche linéaire par image » que le lot L0 proscrit,
 * et l'index est la réponse évidente une fois la question posée.
 *
 * On indexe UNE FOIS par ellipse — un plan ne change pas pendant qu'il se joue
 * — et on interroge par identifiant.
 */
export type PlanIndexe = Map<number, { acte: Acte; chute: ChuteDeChandelle }>;

/** Indexe les chutes d'un plan par identifiant d'arbre. */
export function indexerLesChutes(plan: PlanDEllipse): PlanIndexe {
  const index: PlanIndexe = new Map();
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "chute") continue;
    for (const chute of acte.sujet.chutes) index.set(chute.id, { acte, chute });
  }
  return index;
}

/**
 * Ce qu'il faut faire du sprite d'un arbre, à cet instant de cette ellipse.
 *
 * **Ne rend une déformation que pour ce qu'un panneau peut montrer**, c'est-à-
 * dire la chute. Les autres actes du plan — une mort de sécheresse qui jaunit
 * puis se défeuille, un élagage — passent par la CUISSON de la vignette et non
 * par la pose : ce sont des changements de couleur et de feuillage, que la
 * classe porte déjà. Le §5.11 sépare les deux exprès, et confondre les deux
 * canaux ferait recuire l'atlas pendant une animation.
 */
export function deformationDe(
  index: PlanIndexe,
  ecouleMs: number,
  idArbre: number,
  vue: Vue,
): Deformation {
  const trouve = index.get(idArbre);
  if (!trouve) return DEBOUT;
  const { acte, chute } = trouve;
  // **L'état final si l'acte est passé, et c'est la décision n° 1.** Sans
  // cette ligne, un arbre tombé se relève à l'acte suivant.
  if (ecouleMs >= acte.debutMs + acte.dureeMs) return chuteEnCours(chute, 1, vue);
  if (ecouleMs < acte.debutMs) return DEBOUT;
  const t = avancementDuSujet(acte, idArbre, ecouleMs);
  return t <= 0 ? DEBOUT : chuteEnCours(chute, t, vue);
}

/**
 * L'avancement d'UN sujet dans son acte, décalage compris.
 *
 * Le décalage vient de l'identifiant, donc il est stable d'une image à l'autre
 * et d'une partie à l'autre : rejouer la même ellipse doit donner la même
 * chorégraphie (§2.1, le rendu est déterministe).
 */
function avancementDuSujet(acte: Acte, idArbre: number, ecouleMs: number): number {
  const retard = acte.dureeMs * PART_ECHELONNEE * decalageDe(idArbre);
  const utile = acte.dureeMs * (1 - PART_ECHELONNEE);
  if (utile <= 0) return 1;
  return Math.min(1, (ecouleMs - acte.debutMs - retard) / utile);
}

/** Un décalage ∈ [0,1[ tiré d'un identifiant. Le même hachage que le reste. */
function decalageDe(id: number): number {
  let h = Math.imul(id | 0, 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Les gestes de ZONE d'un plan, avec leur balayage déjà calculé.
 *
 * Même raison que l'index des chutes, et une raison de plus : le rang d'une
 * cellule dans le balayage demande un centre de gravité et une distance par
 * cellule. Le faire par image sur une fauche d'un hectare coûterait dix mille
 * racines carrées soixante fois par seconde, pour un résultat qui ne change
 * pas — un plan ne bouge pas pendant qu'il se joue.
 */
export interface VoileIndexe {
  acte: Acte;
  geste: GesteSurZone;
  rangs: Float32Array;
}

/**
 * Indexe les voiles d'un plan. `coteM` est le côté de la parcelle, celui qui
 * décode les indices de cellule du moteur.
 *
 * **Les gestes sur ARBRES ne sont pas ici, et c'est délibéré.** Un broutage et
 * un frottis sont des marques d'écorce que la classe de vignette porte déjà :
 * les animer à la pose dessinerait la même information deux fois. Une coupe,
 * un étêtage, un recépage font tomber quelque chose, et le protocole ne dit
 * pas encore QUOI — voir l'issue ouverte pour ça et la note du §5.11.
 */
export function indexerLesVoiles(plan: PlanDEllipse, coteM: number): VoileIndexe[] {
  const voiles: VoileIndexe[] = [];
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "geste") continue;
    const geste = acte.sujet.geste;
    if (!estGesteSurZone(geste)) continue;
    voiles.push({ acte, geste, rangs: rangsDuBalayage(geste, coteM) });
  }
  return voiles;
}

/**
 * Les cellules à voiler à cet instant, tous actes confondus.
 *
 * Rend un tableau vide dès que plus aucun front n'est en cours, ce qui est
 * l'état ordinaire : un plan de dix actes n'en a qu'un d'ouvert à la fois, et
 * les gestes de zone y sont rares. L'appelant peut donc poser zéro sprite sans
 * rien tester lui-même.
 */
export function voilesEnCours(voiles: readonly VoileIndexe[], ecouleMs: number): CelluleVoilee[] {
  let sorties: CelluleVoilee[] = [];
  for (const { acte, geste, rangs } of voiles) {
    if (ecouleMs < acte.debutMs || ecouleMs >= acte.debutMs + acte.dureeMs) continue;
    const avancement = acte.dureeMs > 0 ? (ecouleMs - acte.debutMs) / acte.dureeMs : 1;
    const ici = cellulesVoilees(geste, rangs, avancement);
    // Presque toujours un seul acte ouvert : on évite la concaténation quand
    // il n'y a rien à concaténer.
    sorties = sorties.length === 0 ? ici : sorties.concat(ici);
  }
  return sorties;
}

/**
 * Les MORTS d'un plan, indexées par arbre.
 *
 * Même raison que les chutes : une fois par ellipse, pas une fois par arbre et
 * par image. Une mort porte sa cause, et c'est la cause qui décide de la mise
 * en scène (`mort.ts`).
 */
export type MortsIndexees = Map<number, { acte: Acte; cause: CauseMort }>;

/** Indexe les morts d'un plan par identifiant d'arbre. */
export function indexerLesMorts(plan: PlanDEllipse): MortsIndexees {
  const index: MortsIndexees = new Map();
  for (const acte of plan.actes) {
    if (acte.sujet.quoi !== "mort") continue;
    for (const m of acte.sujet.morts) index.set(m.id, { acte, cause: acte.sujet.cause });
  }
  return index;
}

/**
 * Ce qu'il faut faire de l'arbre `idArbre` s'il est en train de mourir.
 *
 * Rend `undefined` quand il ne meurt pas dans cette ellipse — l'immense
 * majorité —, ce qui laisse l'appelant poser l'arbre tel que l'instantané le
 * donne, sans copie ni allocation.
 *
 * **La même décision que pour les chutes** : une mort passée reste accomplie.
 * Sans ça, un arbre mort au premier acte reverdirait au second, et l'ellipse
 * serait une suite de choses qui se défont.
 */
export function etatMourantDe(
  index: MortsIndexees,
  ecouleMs: number,
  idArbre: number,
  vivant: ArbreVivant,
): EtatMourant | undefined {
  const trouve = index.get(idArbre);
  if (!trouve) return undefined;
  const { acte, cause } = trouve;
  if (ecouleMs >= acte.debutMs + acte.dureeMs) return mortAccomplie(cause, vivant);
  if (ecouleMs < acte.debutMs) return undefined;
  const t = avancementDuSujet(acte, idArbre, ecouleMs);
  return t <= 0 ? undefined : mourirEnCours(cause, vivant, t);
}

/**
 * La part POSE d'une mort : ce qui rapetisse et ce qui s'effface.
 *
 * Séparée de `etatMourantDe` parce que les deux canaux n'ont pas le même
 * client : la classe part à la cuisson avant la pose, la déformation part à la
 * pose. Et parce que celle-ci ne demande PAS l'état vivant de l'arbre — un
 * effacement ne dépend que du temps —, ce qui permet à la boucle d'images de
 * l'appeler sans rien reconstruire.
 */
export function poseDeLaMort(index: MortsIndexees, ecouleMs: number, idArbre: number): Deformation {
  const trouve = index.get(idArbre);
  if (!trouve) return DEBOUT;
  const { acte, cause } = trouve;
  const fini = ecouleMs >= acte.debutMs + acte.dureeMs;
  if (!fini && ecouleMs < acte.debutMs) return DEBOUT;
  const t = fini ? 1 : avancementDuSujet(acte, idArbre, ecouleMs);
  if (t <= 0) return DEBOUT;
  // L'état vivant ne sert qu'aux grandeurs de classe ; les zéros suffisent ici.
  const e = mourirEnCours(cause, VIVANT_NEUTRE, t);
  return { rotationRad: 0, hauteur: e.hauteur, opacite: e.opacite };
}

/**
 * Un arbre vivant « neutre », pour les calculs qui n'en dépendent pas.
 *
 * `mourirEnCours` prend l'état de départ pour interpoler le feuillage ; la
 * hauteur et l'opacité, elles, n'en dépendent pas. Passer un état bidon est
 * donc sûr ICI et nulle part ailleurs — d'où la constante nommée, plutôt qu'un
 * objet anonyme qu'on finirait par recopier là où il ferait un faux.
 */
const VIVANT_NEUTRE: ArbreVivant = {
  partFoliaire: 0,
  senescence: 0,
  vigueur: 0,
  dommageHydraulique: 0,
};
