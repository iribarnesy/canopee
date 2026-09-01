/**
 * Croissance des ligneux — loi du minimum (docs/regles.md §7) :
 * pousse = potentiel(espèce, saison, taille)
 *        × min(f_sécheresse, f_engorgement, f_lumière, f_azote).
 * Mortalité déterministe par accumulation de stress quand l'eau, l'anoxie ou
 * la lumière s'effondrent (la faim d'azote rabougrit mais ne tue pas en V0 ;
 * le stress létal par carence viendra avec le budget carbone, §7.3).
 * V0.5 : lumière « bien mélangée » (light.ts), pas encore de positions ni de
 * couplage transpiration↔ETR.
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

/** Conditions de la semaine vues par UN arbre (sol, météo, canopée). */
export interface TreeEnvironment {
  /** ETR/ETP de la parcelle ∈ [0,1] */
  waterSatisfaction: number;
  /** engorgement ∈ [0,1] */
  waterloggingRatio: number;
  /** lumière relative reçue par CET arbre ∈ [0,1] (light.ts) */
  light: number;
  /** satisfaction du besoin d'azote de CET arbre ∈ [0,1] (nitrogen.ts) */
  nitrogenSatisfaction: number;
  /** °C moyenne de la semaine */
  tMean: number;
}

const STRESS_LETHAL = 10;
/**
 * Facteur de survie sous ce seuil → l'arbre puise dans ses réserves. Les
 * facteurs sont déjà normalisés par les tolérances de l'espèce, donc ce seuil
 * unique produit des mortalités différenciées par espèce.
 */
const STRESS_ONSET = 0.45;
const STRESS_RECOVERY = 0.5; // facteur de survie au-dessus → récupération lente
/** semaines de croissance effectives/an en tempéré, pour convertir la pousse annuelle */
const GROWING_WEEKS = 30;

/** Taille « métabolique » d'un arbre (proxy feuillage + bois neuf), kg N/semaine max. */
function metabolicSizeKgWeek(heightM: number): number {
  return (0.06 * heightM ** 1.5) / 52;
}

/** Besoin d'azote de l'arbre, kg/semaine : exigence de l'espèce × taille. */
export function treeNitrogenNeedKgWeek(espece: EspeceV0, heightM: number): number {
  return espece.azote.demandeRelative * metabolicSizeKgWeek(heightM);
}

/**
 * Capacité d'extraction racinaire, kg/semaine : dépend de la taille seulement —
 * c'est le besoin qui varie selon l'espèce, pas l'appareil racinaire.
 */
export function treeExtractionCapacityKgWeek(heightM: number): number {
  return metabolicSizeKgWeek(heightM);
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

/**
 * f_lumière : 0 au point de compensation (l'arbre vit sur ses réserves),
 * 1 à saturation — les sciaphiles saturent bas, les héliophiles exigent le plein soleil (ch3-B).
 */
function lightFactor(espece: EspeceV0, light: number): number {
  const { compensation, saturation } = espece.lumiere;
  return Math.min(1, Math.max(0, (light - compensation) / (saturation - compensation)));
}

export interface TreeTickResult {
  tree: TreeState;
  /** facteur limitant de la semaine (débogage/UI) */
  limitingFactor: number;
}

export function tickTree(tree: TreeState, env: TreeEnvironment): TreeTickResult {
  if (!tree.alive) return { tree, limitingFactor: 0 };

  const espece = getEspece(tree.especeId);
  const season = seasonFactor(espece, env.tMean);
  const fSec = droughtFactor(espece, env.waterSatisfaction);
  const fEng = waterloggingFactor(espece, env.waterloggingRatio);
  const fLum = lightFactor(espece, env.light);
  const fN = espece.azote.fixateur ? 0.95 : env.nitrogenSatisfaction;
  const limitingFactor = Math.min(fSec, fEng, fLum, fN);
  // Seuls l'eau, l'anoxie et l'ombre SOUS le point de compensation épuisent
  // les réserves : au-dessus, l'arbre « survit » même s'il ne pousse plus
  // (méthode pousse / s'épanouit / survit, ch3-C). L'ombre ne compte qu'en
  // saison de végétation : un arbre dormant ne consomme presque rien.
  const fLumSurvival =
    season > 0 ? Math.min(1, (0.5 * env.light) / espece.lumiere.compensation) : 1;
  const survivalFactor = Math.min(fSec, fEng, fLumSurvival);

  // Croissance : potentiel × loi du minimum, asymptote vers la hauteur max.
  // Un arbre stressé pousse moins (il puise dans ses réserves, docs/regles.md §7.1).
  const stressPenalty = 1 - tree.stress / STRESS_LETHAL;
  const potentialM =
    (espece.pousseMaxMAn / GROWING_WEEKS) * season * (1 - tree.heightM / espece.hauteurMaxM);
  const heightM = tree.heightM + Math.max(0, potentialM) * limitingFactor * stressPenalty;

  // Stress : il s'accumule quand le facteur de survie s'effondre, se résorbe sinon.
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
