/**
 * Croissance des ligneux V0 — loi du minimum (docs/regles.md §7) :
 * pousse = potentiel(espèce, saison, taille) × min(f_sécheresse, f_engorgement, f_azote).
 * Mortalité déterministe par accumulation de stress quand le facteur limitant
 * s'effondre. V0 : pas encore de lumière ni de compétition spatiale (V0.5),
 * ni de couplage transpiration↔ETR (les arbres subissent le bilan hydrique
 * de la parcelle sans encore l'influencer).
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";

export interface TreeState {
  id: number;
  especeId: string;
  ageWeeks: number;
  heightM: number;
  /** points de stress cumulés ; l'arbre meurt à STRESS_LETHAL */
  stress: number;
  alive: boolean;
}

/** Conditions de la semaine vues par les arbres (issues du sol et de la météo). */
export interface TreeEnvironment {
  /** ETR/ETP de la parcelle ∈ [0,1] */
  waterSatisfaction: number;
  /** engorgement ∈ [0,1] */
  waterloggingRatio: number;
  /** part de la demande d'azote servie ∈ [0,1] */
  nitrogenSatisfaction: number;
  /** °C moyenne de la semaine */
  tMean: number;
}

const STRESS_LETHAL = 10;
/**
 * Facteur limitant sous ce seuil → l'arbre puise dans ses réserves. Le facteur
 * est déjà normalisé par la tolérance de l'espèce (fSec = satisfaction/seuil),
 * donc ce seuil unique produit des mortalités différenciées par espèce.
 */
const STRESS_ONSET = 0.45;
const STRESS_RECOVERY = 0.5; // facteur limitant au-dessus → récupération lente
/** semaines de croissance effectives/an en tempéré, pour convertir la pousse annuelle */
const GROWING_WEEKS = 30;

/**
 * Demande d'azote d'un arbre, kg/semaine — proxy en H^1,5 (feuillage + bois neuf).
 * Ordre de grandeur visé : un jeune peuplement dense (150 tiges/ha, H ≈ 5 m)
 * demande ~25-50 kg N/ha/an *(à calibrer)*.
 */
export function treeNitrogenDemandKgWeek(espece: EspeceV0, heightM: number): number {
  return (espece.azote.demandeRelative * 0.06 * heightM ** 1.5) / 52;
}

/** Facteur saison : 0 sous la température de base, 1 à base+8 °C. */
function seasonFactor(espece: EspeceV0, tMean: number): number {
  return Math.min(1, Math.max(0, (tMean - espece.tBaseCroissanceC) / 8));
}

/** f_sécheresse : la tolérance de l'espèce décale le seuil où l'eau devient limitante. */
function droughtFactor(espece: EspeceV0, satisfaction: number): number {
  return Math.min(1, satisfaction / espece.eau.seuilConfortSecheresse);
}

/** f_engorgement : 1 tant que l'anoxie reste sous la tolérance, 0 à saturation totale. */
function waterloggingFactor(espece: EspeceV0, waterlogging: number): number {
  const tol = espece.eau.toleranceEngorgement;
  if (waterlogging <= tol) return 1;
  return Math.max(0, 1 - (waterlogging - tol) / Math.max(1e-9, 1 - tol));
}

export interface TreeTickResult {
  tree: TreeState;
  /** facteur limitant de la semaine (débogage/UI) */
  limitingFactor: number;
}

export function tickTree(tree: TreeState, env: TreeEnvironment): TreeTickResult {
  if (!tree.alive) return { tree, limitingFactor: 0 };

  const espece = getEspece(tree.especeId);
  const fSec = droughtFactor(espece, env.waterSatisfaction);
  const fEng = waterloggingFactor(espece, env.waterloggingRatio);
  // f_azote normalisé par la frugalité (même logique que la sécheresse) : un
  // oligotrophe se contente d'une faible disponibilité, un eutrophe non.
  const fN = espece.azote.fixateur
    ? 0.95
    : Math.min(1, env.nitrogenSatisfaction / espece.azote.demandeRelative);
  const limitingFactor = Math.min(fSec, fEng, fN);
  // La faim d'azote rabougrit mais ne tue pas : seuls l'eau et l'anoxie
  // épuisent les réserves (le stress létal par carence viendra avec un vrai
  // budget carbone, docs/regles.md §7.3).
  const survivalFactor = Math.min(fSec, fEng);

  // Croissance : potentiel × loi du minimum, asymptote vers la hauteur max.
  // Un arbre stressé pousse moins (il puise dans ses réserves, docs/regles.md §7.1).
  const stressPenalty = 1 - tree.stress / STRESS_LETHAL;
  const potentialM =
    (espece.pousseMaxMAn / GROWING_WEEKS) *
    seasonFactor(espece, env.tMean) *
    (1 - tree.heightM / espece.hauteurMaxM);
  const heightM = tree.heightM + Math.max(0, potentialM) * limitingFactor * stressPenalty;

  // Stress : il s'accumule quand l'eau ou l'anoxie s'effondrent, se résorbe sinon.
  let stress = tree.stress;
  if (survivalFactor < STRESS_ONSET) {
    stress += (STRESS_ONSET - survivalFactor) * 5;
  } else if (survivalFactor > STRESS_RECOVERY) {
    stress = Math.max(0, stress - 0.25);
  }
  const alive = stress < STRESS_LETHAL;

  return {
    tree: { ...tree, ageWeeks: tree.ageWeeks + 1, heightM, stress, alive },
    limitingFactor,
  };
}
