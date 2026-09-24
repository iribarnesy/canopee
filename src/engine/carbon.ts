/**
 * Comptabilité carbone (docs/regles.md §12). Pools suivis :
 * - biomasse vivante (dérivée des arbres, allométrie hauteur → volume → C) ;
 * - bois mort (troncs des morts et souches des coupés) ;
 * - carbone de la litière (par cellule, décomposé avec l'azote) ;
 * - humus du sol (par cellule : **le** plus gros stock en tempéré).
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
 * Demi-vie d'un produit en bois de **sciage**, années.
 *
 * Trente-cinq ans, et ce n'est pas un chiffre de confort : c'est la valeur par
 * défaut de l'IPCC pour les sciages (lignes directrices 2006, volume 4,
 * chapitre 12 « Harvested Wood Products »), celle qu'utilisent les inventaires
 * nationaux dans la méthode de décroissance de premier ordre. Les deux autres
 * catégories de la même table donnent 25 ans pour les panneaux et 2 ans pour le
 * papier ; le moteur ne sait pas distinguer ce que devient une bille, donc il
 * retient celle qui correspond à ce qu'il produit — du sciage.
 *
 * Une demi-vie n'est **pas** une durée de vie : au bout de trente-cinq ans il reste
 * la moitié du carbone, au bout de soixante-dix le quart. Une charpente vendue
 * au début d'une partie de cinquante ans en aura rendu à peine plus du tiers à
 * la fin, ce qui est le bon comportement — l'issue #72 prévient explicitement
 * contre la tentation de raccourcir « pour que ça se voie ».
 */
export const DEMI_VIE_OEUVRE_ANS = 35;

/**
 * Part du stock de produits bois qui sort d'usage chaque semaine.
 *
 * Décroissance de premier ordre, la méthode de l'IPCC : un taux constant
 * appliqué au stock, dérivé de la demi-vie par ln(2) / durée.
 */
export const SORTIE_OEUVRE_PAR_SEMAINE = Math.LN2 / (DEMI_VIE_OEUVRE_ANS * 52);
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
 * que l'arbre **porte** (`volumeAerienM3`, trees.ts). Ce module gardait sa propre
 * copie de la règle allométrique — deux copies d'une même règle finissent
 * toujours par diverger, et celle-ci impliquait un tronc plus lourd que son
 * cylindre (#62).
 *
 * Le diamètre et la hauteur restent **séparés**, et ce n'est pas une coquetterie :
 * rabattre un arbre lui retire de la hauteur sans toucher au diamètre de ce
 * qui reste, et c'est ainsi que la trogne et le recépage comptent ce qu'ils
 * emportent.
 *
 * `bois.densite` porte bien l'**infradensité** depuis #68 — masse anhydre sur
 * volume vert, essence par essence et depuis une source citée. C'était la
 * réserve de ce module : elle est levée, et l'ancre de `carbon.test.ts` la
 * tient désormais sur la tige, où elle discrimine.
 */
export function treeAboveCarbonKg(espece: EspeceV0, diametreCm: number, heightM: number): number {
  return volumeAerienM3(diametreCm, heightM) * espece.bois.densite * 1000 * CARBON_FRACTION;
}

/** Carbone total (aérien + racinaire) d'un arbre, kg C. */
export function treeTotalCarbonKg(espece: EspeceV0, diametreCm: number, heightM: number): number {
  return treeAboveCarbonKg(espece, diametreCm, heightM) * (1 + ROOT_SHOOT_RATIO);
}

/**
 * Carbone **racinaire** d'un arbre, kg C.
 *
 * Il se déduit de l'aérien par un rapport fixe, donc **rabattre** un arbre lui
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
 * Carbone racinaire qu'un arbre **rabattu** cesse de porter, kg C — recépage,
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
   * Bois d'**œuvre** vendu, kg C, **cumulé** depuis le début de la partie : tout ce
   * qui est un jour parti en scierie. Ce n'est plus un stock — c'est
   * l'historique, et il ne redescend jamais.
   *
   * L'invariant qui le relie aux deux suivants, et que le test vérifie :
   * `oeuvreCumKgC === oeuvreStockKgC + oeuvreFinDeVieCumKgC`.
   */
  oeuvreCumKgC: number;
  /**
   * Ce qui est **encore** dans les produits, kg C — la charpente qui tient, le
   * plancher qui sert. C'est lui, et non le cumul, qui compte au crédit du
   * bilan : un puits qui ne se vide jamais n'est pas un puits, c'est une
   * erreur de comptabilité (issue #72, critère I4).
   */
  oeuvreStockKgC: number;
  /**
   * Ce que les produits ont rendu à l'atmosphère en fin de vie, kg C, cumulé.
   * Séparé des émissions de décomposition parce qu'il ne se passe **pas** sur la
   * parcelle : c'est la benne, la chaudière ou la décharge du client.
   */
  oeuvreFinDeVieCumKgC: number;
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
    oeuvreStockKgC: 0,
    oeuvreFinDeVieCumKgC: 0,
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
  /** bois d'œuvre vendu depuis le début, t C/ha — l'historique, pas un stock */
  oeuvreCumTHa: number;
  /** ce qui est **encore** dans les produits, t C/ha — c'est lui qui compte au crédit */
  oeuvreStockTHa: number;
  /** ce que les produits ont rendu en fin de vie, t C/ha, cumulé */
  oeuvreFinDeVieCumTHa: number;
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

/**
 * Fige le point zéro du bilan carbone sur ce que la parcelle porte **maintenant**
 * (issue #202).
 *
 * À appeler une fois, au moment où le joueur prend la main — c'est-à-dire après
 * la maturation, et seulement là. Avant, la couche jeu passait
 * `station.initialSoilCTHa` au bilan, qui est le carbone du **profil** : une
 * parcelle boisée toute seule pendant soixante ans offrait cent tonnes d'avance
 * gratuite (`state.ts`, `carboneDeReferenceTHa`).
 *
 * Le total figé est celui du bilan, bois d'œuvre en stock compris, pour que
 * `bilanNetTHa` vaille exactement zéro à la semaine d'arrivée quelle que soit
 * la maturation. **Conséquence voulue, et c'est le sens du jeu : arriver sur
 * une vieille chênaie et la raser fait plonger le bilan.**
 */
export function figerCarboneDeReference(state: GameState): GameState {
  const areaHa = (state.station.coteM * state.station.coteM) / 10_000;
  const inv = carbonInventory(state);
  return {
    ...state,
    carboneDeReferenceTHa: inv.totalTHa + state.carbon.oeuvreStockKgC / 1000 / areaHa,
  };
}

/**
 * L'inventaire carbone de la parcelle, et son écart au point de départ.
 *
 * `reference` n'est là que pour les bancs qui veulent un autre point zéro (zéro
 * tout court, par exemple, pour lire des stocks bruts). **Une partie n'en passe
 * pas** : le point zéro appartient à l'état, et le lui passer de l'extérieur est
 * exactement le défaut qu'a corrigé #202.
 */
export function carbonInventory(
  state: GameState,
  reference: number = state.carboneDeReferenceTHa,
): CarbonInventory {
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
    oeuvreStockTHa: state.carbon.oeuvreStockKgC / 1000 / areaHa,
    oeuvreFinDeVieCumTHa: state.carbon.oeuvreFinDeVieCumKgC / 1000 / areaHa,
    // Le bois d'œuvre compte au crédit — mais seulement **ce qui est encore**
    // **dedans**. Avant l'issue #72, c'est le cumul qui était crédité : une
    // palette vendue en 2030 comptait encore en 2090, et vendre du bois
    // devenait un geste climatique gratuit et définitif.
    bilanNetTHa: totalTHa + state.carbon.oeuvreStockKgC / 1000 / areaHa - reference,
  };
}
