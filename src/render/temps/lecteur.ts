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

import type { ChuteDeChandelle } from "../../engine/tick";
import type { Vue } from "../camera";
import { chuteEnCours, DEBOUT, type Deformation } from "./chute";
import type { Acte, PlanDEllipse } from "./ellipse";

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
