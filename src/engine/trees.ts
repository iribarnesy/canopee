/**
 * Croissance des ligneux — loi du minimum (docs/regles.md §7) :
 * pousse = potentiel(espèce, saison, taille)
 *        × min(f_sécheresse, f_engorgement, f_lumière, f_azote).
 * Tous les facteurs sont désormais LOCAUX : eau et azote prélevés dans les
 * cellules de la zone racinaire (tick.ts), lumière reçue à la position de
 * l'arbre (light.ts). Mortalité déterministe par accumulation de stress quand
 * l'eau, l'anoxie ou la lumière s'effondrent (la faim d'azote rabougrit mais
 * ne tue pas en V0 ; le stress létal par carence viendra avec le budget
 * carbone, §7.3). Pas encore de profondeur racinaire par âge (horizons V1).
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { crownRadiusM } from "./light";

export interface TreeState {
  id: number;
  especeId: string;
  /** position du tronc sur la parcelle, m (continu) */
  x: number;
  y: number;
  ageWeeks: number;
  heightM: number;
  /** points de stress cumulés ; l'arbre meurt à STRESS_LETHAL */
  stress: number;
  alive: boolean;
  /** azote acquis depuis la dernière chute des feuilles, g (recyclé en litière) */
  uptakeYearG: number;
  /** fruits mûrs en attente de récolte, kg (perdus après la fenêtre, §10) */
  fruitsKg: number;
  /** avancement de la croissance des fruits de l'année ∈ [0,1] */
  fruitProgress: number;
  /** fleurs détruites par un gel tardif cette année (§7.2) */
  bloomFrosted: boolean;
}

/** Conditions de la semaine vues par UN arbre (sol local, canopée, météo). */
export interface TreeEnvironment {
  /** transpiration obtenue / demandée ∈ [0,1] (zone racinaire de CET arbre) */
  waterSatisfaction: number;
  /** engorgement moyen de la zone racinaire ∈ [0,1] */
  waterloggingRatio: number;
  /** lumière relative reçue à la position de CET arbre ∈ [0,1] (light.ts) */
  light: number;
  /** satisfaction du besoin d'azote de CET arbre ∈ [0,1] */
  nitrogenSatisfaction: number;
  /** pH moyen de la zone racinaire */
  phMean: number;
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
/** rayon de la zone racinaire / rayon du houppier *(à confirmer)* */
const ROOT_CROWN_RATIO = 1.2;
/** part de l'ETP transpirée par une couronne en pleine feuille *(à calibrer)* */
const TRANSPIRATION_COEFF = 0.9;

/**
 * Profondeur explorée par les racines, cm : elle s'approfondit avec la taille
 * de l'arbre (un semis n'a que la surface) et bute sur ce que le sol permet
 * (roche, alios — `profondeurPenetrableCm`). C'est la dimension verticale de
 * la compétition : deux espèces peuvent partager le même mètre carré sans
 * puiser dans la même eau (critère E7).
 */
export function profondeurRacinesCm(
  espece: EspeceV0,
  heightM: number,
  solPenetrableCm: number,
): number {
  // Un jeune plant explore déjà 20-30 cm ; l'approfondissement suit la
  // croissance et sature quand l'arbre atteint sa taille adulte.
  const maturite = Math.min(1, (heightM / (0.6 * espece.hauteurMaxM)) ** 0.7);
  const potentiel = 25 + (espece.racines.profondeurMaxCm - 25) * maturite;
  return Math.max(15, Math.min(potentiel, solPenetrableCm));
}

/**
 * Répartition verticale des racines : densité décroissante avec la profondeur
 * (modèle exponentiel classique). Rend la fraction de racines présente dans
 * chaque horizon, dans l'ordre du profil, en tenant compte de la profondeur
 * réellement explorée.
 */
export function fractionsRacinairesParHorizon(
  epaisseursCm: readonly number[],
  profondeurExploreeCm: number,
): number[] {
  const fractions: number[] = [];
  let sommet = 0;
  let total = 0;
  for (const epaisseur of epaisseursCm) {
    const bas = Math.min(sommet + epaisseur, profondeurExploreeCm);
    if (bas <= sommet) {
      fractions.push(0);
    } else {
      // Densité ∝ exp(-z / L) : la moitié des racines dans le premier tiers.
      const L = Math.max(15, profondeurExploreeCm / 2.2);
      const part = Math.exp(-sommet / L) - Math.exp(-bas / L);
      fractions.push(part);
      total += part;
    }
    sommet += epaisseur;
  }
  if (total <= 0) {
    // Sol si mince que tout tient dans le premier horizon.
    return epaisseursCm.map((_, i) => (i === 0 ? 1 : 0));
  }
  return fractions.map((f) => f / total);
}

/** Rayon de prospection racinaire, m (au moins 1 m — le semis a sa cellule). */
export function rootRadiusM(espece: EspeceV0, heightM: number): number {
  return Math.max(1, ROOT_CROWN_RATIO * crownRadiusM(heightM, espece.lumiere.houppierRatio));
}

/**
 * Part de la demande évaporatoire qui subsiste à l'ombre totale (advection,
 * déficit de saturation de l'air) : sous couvert, l'essentiel du rayonnement
 * net disparaît et la transpiration s'effondre *(à calibrer)*.
 */
const SHADE_TRANSPIRATION_FLOOR = 0.25;
/**
 * Surcroît de demande en plein vent sur une station très exposée *(à calibrer)*.
 * Un sujet abrité (par une nurse, une haie, la canopée) y échappe : c'est
 * l'effet brise-vent, le gain agroforestier le mieux documenté (ch5).
 */
const WIND_MAX_EXTRA = 0.6;

/**
 * Demande de transpiration de l'arbre, L/semaine : demande évaporatoire ×
 * surface de couronne × saison × **rayonnement reçu** (un caduc sans feuilles
 * ne transpire pas).
 * Le facteur rayonnement est le moteur de l'effet nurse (ch1-A) : un sujet
 * abrité transpire bien moins qu'en plein soleil, donc survit là où l'eau
 * manque — au prix d'une croissance bridée par f_lumière. En milieu frais le
 * marché s'inverse : l'ombre ne protège de rien et coûte de la croissance.
 */
export function treeWaterDemandL(
  espece: EspeceV0,
  heightM: number,
  etpMm: number,
  season: number,
  light = 1,
  ventExposition = 0,
  abriVent = 0,
): number {
  const r = crownRadiusM(heightM, espece.lumiere.houppierRatio);
  const crownAreaM2 = Math.max(0.05, Math.PI * r * r);
  const rayonnement = SHADE_TRANSPIRATION_FLOOR + (1 - SHADE_TRANSPIRATION_FLOOR) * light;
  const vent = 1 + WIND_MAX_EXTRA * ventExposition * (1 - abriVent);
  // Efficience d'usage de l'eau : les xérophiles (cuticule épaisse, stomates
  // régulés) transpirent moins par unité de couronne que les hygrophiles.
  const wue = 0.35 + 0.65 * espece.eau.seuilConfortSecheresse;
  return etpMm * crownAreaM2 * TRANSPIRATION_COEFF * wue * season * rayonnement * vent;
}

/** Taille « métabolique » d'un arbre (proxy feuillage + bois neuf), g N/semaine max. */
function metabolicSizeGWeek(heightM: number): number {
  return (60 * heightM ** 1.5) / 52;
}

/** Besoin d'azote de l'arbre, g/semaine : exigence de l'espèce × taille. */
export function treeNitrogenNeedGWeek(espece: EspeceV0, heightM: number): number {
  return espece.azote.demandeRelative * metabolicSizeGWeek(heightM);
}

/**
 * Capacité d'extraction racinaire, g/semaine : dépend de la taille seulement —
 * c'est le besoin qui varie selon l'espèce, pas l'appareil racinaire.
 */
export function treeExtractionCapacityGWeek(heightM: number): number {
  return metabolicSizeGWeek(heightM);
}

/** Facteur saison : 0 sous la température de base, 1 à base+8 °C. */
export function seasonFactor(espece: EspeceV0, tMean: number): number {
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
 * f_pH : 1 dans la gamme de l'espèce, bordure douce de ±0,7 pH, 0 au-delà
 * (chlorose puis mort — la bio-indication de l'atlas : calcicoles vs acidiphiles).
 */
export function phFactor(espece: EspeceV0, ph: number): number {
  const [min, max] = espece.ph;
  return Math.min(1, Math.max(0, Math.min((ph - min) / 0.7, (max - ph) / 0.7)));
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
  // Survie hydrique : seuil découplé du confort (le hêtre pousse mal en sec
  // mais son semis survit ; l'aulne, lui, meurt vite hors sol frais).
  const fSecSurvie = Math.min(1, env.waterSatisfaction / espece.eau.seuilStressSecheresse);
  const fEng = waterloggingFactor(espece, env.waterloggingRatio);
  const fLum = lightFactor(espece, env.light);
  const fPH = phFactor(espece, env.phMean);
  const fN = espece.azote.fixateur ? 0.95 : env.nitrogenSatisfaction;
  const limitingFactor = Math.min(fSec, fEng, fLum, fPH, fN);
  // Seuls l'eau, l'anoxie et l'ombre SOUS le point de compensation épuisent
  // les réserves : au-dessus, l'arbre « survit » même s'il ne pousse plus
  // (méthode pousse / s'épanouit / survit, ch3-C). L'ombre ne compte qu'en
  // saison de végétation : un arbre dormant ne consomme presque rien.
  const fLumSurvival =
    season > 0 ? Math.min(1, (0.5 * env.light) / espece.lumiere.compensation) : 1;
  // Sénescence : passé ~85 % de la longévité, la vigueur décline puis l'arbre
  // meurt (déterministe) — le moteur du cycle sylvigénétique (ch4-A).
  const ageYears = tree.ageWeeks / 52;
  const longevite = espece.regeneration.longeviteAns;
  const fAge =
    ageYears < 0.85 * longevite
      ? 1
      : Math.max(0, 1 - (ageYears - 0.85 * longevite) / (0.3 * longevite));
  const survivalFactor = Math.min(fSecSurvie, fEng, fLumSurvival, fPH, fAge);

  // Croissance : potentiel × loi du minimum, asymptote vers la hauteur max.
  // Un arbre stressé pousse moins (il puise dans ses réserves, docs/regles.md §7.1).
  const stressPenalty = 1 - tree.stress / STRESS_LETHAL;
  const potentialM =
    (espece.pousseMaxMAn / GROWING_WEEKS) * season * fAge * (1 - tree.heightM / espece.hauteurMaxM);
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
