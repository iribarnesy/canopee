/**
 * Comptabilité carbone (docs/regles.md §12). Pools suivis :
 * - biomasse vivante (dérivée des arbres, allométrie hauteur → volume → C) ;
 * - bois mort (troncs des morts et souches des coupés) ;
 * - carbone de la litière (par cellule, décomposé avec l'azote) ;
 * - humus du sol (par cellule : LE plus gros stock en tempéré).
 * Flux : NPP (croissance + feuillage), humification (litière/bois mort →
 * humus), émissions (décompositions → CO₂), export bois énergie (brûlé chez
 * le client = émis immédiatement, §12 : le bois énergie ne stocke rien).
 * Invariant testé : NPP = Δ(tous les pools) + émissions + exports.
 * V1 : bois d'œuvre avec durée de vie, labour qui déstocke, couplage
 * minéralisation N ↔ humus C (prairie retournée).
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import type { GameState } from "./state";
import { type TreeState, volumeAerienM3 } from "./trees";

/** fraction de carbone de la matière sèche (§12 : 47-50 %) */
export const CARBON_FRACTION = 0.48;
/** biomasse racinaire / biomasse aérienne *(à calibrer par type, §12)* */
export const ROOT_SHOOT_RATIO = 0.28;
/** part du C de litière décomposée qui devient humus (le reste part en CO₂) */
export const LITTER_HUMIFICATION = 0.3;
/** part du C de bois mort décomposé qui devient humus */
export const DEADWOOD_HUMIFICATION = 0.25;
/** décomposition du bois mort, /an à climat optimal *(à calibrer)* */
export const DEADWOOD_DECAY_PER_YEAR = 0.05;
/**
 * Minéralisation de l'humus, /an à climat optimal (le « k2 » des agronomes).
 *
 * C'est ce coefficient qui rend l'azote du sol, puisque l'humus est le pool
 * d'azote organique. En le couplant enfin à la minéralisation, sa valeur cesse
 * d'être libre : à C/N 11, un sol de 65 t C/ha doit rendre de l'ordre de
 * 80 kg N/ha/an, ce qui impose ~1,5 %/an — la fourchette agronomique
 * classique (1 à 2 %/an en climat tempéré). Mon 0,5 % initial, choisi sans
 * contrainte, donnait trois fois trop peu.
 */
export const HUMUS_DECAY_PER_YEAR = 0.015;

/**
 * Rapport C/N de l'humus : ~11 en sol biologiquement actif (mull). C'est lui
 * qui convertit le carbone minéralisé en azote rendu aux plantes.
 */
export const CN_HUMUS = 11;
/** 1 t/ha = 100 g/m² */
export const T_HA_TO_G_M2 = 100;

/**
 * Carbone aérien d'un arbre, kg C.
 *
 * Le volume ne se déduit plus de la seule hauteur : il se lit sur le diamètre
 * que l'arbre PORTE (`volumeAerienM3`, trees.ts). Ce module gardait sa propre
 * copie de la règle allométrique — deux copies d'une même règle finissent
 * toujours par diverger, et celle-ci impliquait un tronc plus lourd que son
 * cylindre (#62).
 *
 * Le diamètre et la hauteur restent SÉPARÉS, et ce n'est pas une coquetterie :
 * rabattre un arbre lui retire de la hauteur sans toucher au diamètre de ce
 * qui reste, et c'est ainsi que la trogne et le recépage comptent ce qu'ils
 * emportent.
 *
 * RÉSERVE CONNUE, et elle est instruite à moitié (#68). `bois.densite` porte
 * une densité commerciale à 12 % d'humidité là où la biomasse demande
 * l'INFRADENSITÉ (masse anhydre sur volume vert) : le carbone vivant reste
 * surestimé d'environ 20 %.
 *
 * Ce que le recensement des lecteurs a tranché : il faut UN champ, pas deux.
 * Personne ne réclame la densité commerciale — le prix se compte au m³ et la
 * durée de chandelle ne lit ce champ que comme un proxy de dureté, que les deux
 * grandeurs classent pareil. Reste à saisir les infradensités essence par
 * essence depuis une source citée, et cela n'a pas été fait ici plutôt que fait
 * de mémoire.
 *
 * CE QUE PERSONNE NE VERRAIT : l'unique ancre extérieure du dépôt
 * (`carbon.test.ts`, un hêtre de 25 m et 50 cm entre 1 000 et 1 400 kg C) NE
 * DISCRIMINE PAS. Elle donne 1 333 kg avec la densité d'aujourd'hui et
 * 1 078 avec une infradensité de 0,55 : les deux passent. Le correctif ne fera
 * donc basculer aucun essai, et son absence n'en fait échouer aucun — c'est
 * précisément pourquoi ce défaut a pu vivre si longtemps, et pourquoi la
 * campagne de correction devra resserrer l'ancre en même temps qu'elle corrige
 * les valeurs.
 */
export function treeAboveCarbonKg(espece: EspeceV0, diametreCm: number, heightM: number): number {
  return volumeAerienM3(diametreCm, heightM) * espece.bois.densite * 1000 * CARBON_FRACTION;
}

/** Carbone total (aérien + racinaire) d'un arbre, kg C. */
export function treeTotalCarbonKg(espece: EspeceV0, diametreCm: number, heightM: number): number {
  return treeAboveCarbonKg(espece, diametreCm, heightM) * (1 + ROOT_SHOOT_RATIO);
}

/**
 * Carbone RACINAIRE d'un arbre, kg C.
 *
 * Il se déduit de l'aérien par un rapport fixe, donc RABATTRE un arbre lui
 * retire des racines sur le papier. C'est une simplification qu'il faut
 * connaître : sur le terrain, la souche d'un taillis garde son système
 * racinaire — c'est même ce qui fait la vigueur du rejet. Tant que le modèle
 * déduit les racines de la hauteur, la seule comptabilité honnête est de
 * verser la part perdue au bois mort (`racinesPerduesEnRabattant`) plutôt que
 * de la laisser disparaître.
 */
export function treeRootCarbonKg(espece: EspeceV0, diametreCm: number, heightM: number): number {
  return treeAboveCarbonKg(espece, diametreCm, heightM) * ROOT_SHOOT_RATIO;
}

/**
 * Carbone racinaire qu'un arbre RABATTU cesse de porter, kg C — recépage,
 * étêtage, rejet après feu. C'est du bois mort qui reste dans le sol : il ne
 * s'exporte pas, il ne s'émet pas, il se décompose sur place.
 *
 * Sans ce versement, un charme de douze mètres recépé fait disparaître deux
 * cent trente kilos de carbone de la comptabilité, et la conservation est
 * fausse d'autant.
 */
export function racinesPerduesEnRabattant(
  espece: EspeceV0,
  diametreCm: number,
  hauteurAvantM: number,
  hauteurApresM: number,
): number {
  return Math.max(
    0,
    treeRootCarbonKg(espece, diametreCm, hauteurAvantM) -
      treeRootCarbonKg(espece, diametreCm, hauteurApresM),
  );
}

/** Pools et compteurs cumulés de la partie, kg C à l'échelle de la parcelle. */
export interface CarbonState {
  /** bois mort au sol/debout (troncs des morts, souches des coupés), kg C */
  deadWoodKgC: number;
  /** production primaire nette cumulée (bois + feuillage), kg C */
  nppCumKgC: number;
  /** CO₂ émis cumulé par les décompositions, kg C */
  emittedCumKgC: number;
  /** bois énergie exporté cumulé (brûlé = émis, §12), kg C */
  exportedEnergyCumKgC: number;
  /** carbone importé par les plants achetés en pépinière, kg C */
  importedPlantsCumKgC: number;
  /**
   * Bois d'ŒUVRE vendu, kg C : contrairement au bois de chauffage, il reste
   * stocké dans le produit (charpente, meuble) pendant sa durée de vie (§12).
   */
  oeuvreCumKgC: number;
  /**
   * Carbone du sol emporté hors de la parcelle par l'érosion, kg C. Il n'est
   * ni émis ni vendu : il est parti ailleurs, et sans ce compteur il
   * disparaîtrait du bilan (erosion.ts).
   */
  erosionCumKgC: number;
}

export function createCarbonState(): CarbonState {
  return {
    deadWoodKgC: 0,
    nppCumKgC: 0,
    emittedCumKgC: 0,
    exportedEnergyCumKgC: 0,
    importedPlantsCumKgC: 0,
    oeuvreCumKgC: 0,
    erosionCumKgC: 0,
  };
}

export interface CarbonInventory {
  /** stocks en t C/ha */
  vivantTHa: number;
  boisMortTHa: number;
  litiereTHa: number;
  /** broyat en tas, pas encore épandu, t C/ha */
  brfTHa: number;
  humusTHa: number;
  totalTHa: number;
  /** compteurs cumulés en t C/ha */
  nppCumTHa: number;
  emisCumTHa: number;
  exporteCumTHa: number;
  /** bois d'œuvre vendu, t C/ha — stocké dans les produits, pas émis */
  oeuvreCumTHa: number;
  /** bilan net de la partie : Δstocks depuis le départ, t C/ha (>0 = la parcelle stocke) */
  bilanNetTHa: number;
}

export function livingCarbonKg(trees: readonly TreeState[]): number {
  let sum = 0;
  for (const t of trees) {
    if (t.alive) sum += treeTotalCarbonKg(getEspece(t.especeId), t.diametreCm, t.heightM);
  }
  return sum;
}

export function carbonInventory(state: GameState, initialHumusTHa: number): CarbonInventory {
  const areaHa = (state.station.coteM * state.station.coteM) / 10_000;
  const nCells = state.soil.litterCG.length;
  let litterG = 0;
  let humusG = 0;
  for (let i = 0; i < nCells; i++) {
    litterG += state.soil.litterCG[i] ?? 0;
    humusG += state.soil.humusCG[i] ?? 0;
  }
  const vivantTHa = livingCarbonKg(state.trees) / 1000 / areaHa;
  const boisMortTHa = state.carbon.deadWoodKgC / 1000 / areaHa;
  // moyenne g/m² → t/ha (1 t/ha = 100 g/m²)
  const litiereTHa = litterG / nCells / T_HA_TO_G_M2;
  // Le tas de broyat est un stock comme un autre : tant qu'il n'est pas
  // épandu, son carbone est là, il attend.
  const brfTHa = state.stockBrf.carboneG / 1000 / 1000 / areaHa;
  const humusTHa = humusG / nCells / T_HA_TO_G_M2;
  const totalTHa = vivantTHa + boisMortTHa + litiereTHa + humusTHa + brfTHa;
  return {
    vivantTHa,
    boisMortTHa,
    litiereTHa,
    brfTHa,
    humusTHa,
    totalTHa,
    nppCumTHa: state.carbon.nppCumKgC / 1000 / areaHa,
    emisCumTHa: state.carbon.emittedCumKgC / 1000 / areaHa,
    exporteCumTHa: state.carbon.exportedEnergyCumKgC / 1000 / areaHa,
    oeuvreCumTHa: state.carbon.oeuvreCumKgC / 1000 / areaHa,
    // Le bois d'œuvre compte au crédit : il a quitté la parcelle sans revenir
    // à l'atmosphère.
    bilanNetTHa: totalTHa + state.carbon.oeuvreCumKgC / 1000 / areaHa - initialHumusTHa,
  };
}
