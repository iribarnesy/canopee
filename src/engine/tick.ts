/**
 * Le cœur du moteur : une fonction pure `état + météo → état`, spatialisée.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → lumière (elle pilote la croissance ET la transpiration) → bilan
 * hydrique + minéralisation + décomposition de la litière, par cellule →
 * prélèvements eau/azote par arbre dans SA zone racinaire (deux passes,
 * indépendantes de l'ordre des arbres) → lessivage → croissance des arbres →
 * chute des feuilles (semaine 44) → morts en litière → régénération (sem. 14).
 */

import type { GesteVisible } from "./actions";
import {
  type CelluleSousLeTronc,
  couvertureDuBoisAuSol,
  DECOMPOSITION_AU_SOL_PAR_AN,
  directionDeChute,
  ecrasePar,
  empreinteDeChute,
  MASSE_LINEIQUE_TRONC_KGC_PAR_M,
} from "./boisMort";
import {
  CN_HUMUS,
  DEADWOOD_DECAY_PER_YEAR,
  DEADWOOD_HUMIFICATION,
  HUMUS_DECAY_PER_YEAR,
  LITTER_HUMIFICATION,
  T_HA_TO_G_M2,
  treeAboveCarbonKg,
  treeTotalCarbonKg,
} from "./carbon";
import { CO2_ACTUEL_PPM, facteurCo2Croissance, facteurCo2Transpiration } from "./climat";
import {
  champDeNappeCm,
  drainageAvecNappe,
  hauteurDeCrueM,
  remonteeCapillaireMm,
} from "./eau_surface";
import {
  epaisseurPerdueCm as epaisseurPerdueCm2,
  fractionEmportee,
  masseHorizonKgM2,
  partDeposee,
  terreArracheeKgM2,
} from "./erosion";
import { getEspece } from "./especes";
import { chargeCombustible, departDeFeu, propager, rangsDuFront, survitAuFeu } from "./feu";
import {
  brouter,
  DIGESTIBILITE,
  FROTTIS_DEGAT,
  frottisDeLaSemaine,
  LIGNIFICATION_PAR_SEMAINE,
  RETOUR_IMMIGRATION,
} from "./gibier";
import { cellCount, cellIndexAt, forEachDiscCell } from "./grid";
import {
  couvertureMax,
  herbeDemandeAzoteG,
  herbeDemandeEauL,
  humiditeVecue,
  prochaineCouverture,
} from "./herbe";
import {
  computeGroundLight,
  computeLight,
  crownRadiusM,
  type PartOmbrageante,
  windShelterAt,
} from "./light";
import { maladiesActives, pressionMaladie, RAYON_INOCULUM_M } from "./maladies";
import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import {
  cibleReseau,
  facteurAbsorption,
  prochainReseau,
  reseauSousArbre,
  TYPES_MYCORHIZE,
} from "./mycorhizes";
import {
  APPORT_REGIONAL_MAX_MM,
  capaciteAquifereMm,
  ECHANGE_REGIONAL,
  nouveauNiveauRegionalMm,
  profondeurPourStock,
  stockEquilibreMm,
  stocksEquilibreParCellule,
  tauxDeVidange,
} from "./nappe";
import {
  azoteNetDecomposition,
  cellLeachedG,
  decompositionClimateFactor,
  litterDecayRate,
  nitrogenAvailabilityFactor,
} from "./nitrogen";
import { frequentationDesBordures } from "./paysage";
import {
  contextePhenologique,
  partFoliaireActiveDans,
  partFoliaireOmbrageanteDans,
  semaineDeFroid,
} from "./phenologie";
import {
  alterationPhosphoreG,
  alterationPotassiumG,
  capaciteEchange,
  DEPOSITION_K_KG_HA_AN,
  DEPOSITION_P_KG_HA_AN,
  disponibilitePhosphore,
  echangeReserveK,
  facteurAlterationBiologique,
  facteurNutriment,
  lessivagePotassiumG,
  RATIO_K_SUR_N,
  RATIO_P_SUR_N,
  RELARGAGE_HEBDO,
  RETOUR_LITIERE_K,
  RETOUR_LITIERE_P,
  retrogradationHebdo,
  SATURATION_K_G_M2,
  SATURATION_P_G_M2,
} from "./pk";
import {
  carteBiotique,
  degatsSurArbre,
  disperser,
  facteurChaleur,
  prochainePression,
} from "./ravageurs";
import { yearlyRecruitment } from "./regeneration";
import {
  altitudeParCellule,
  coefficientRuissellement,
  entreesDAmont,
  facteurExpositionRayonnement,
  fractionRuissellement,
  ordreDeDescente,
  penteParCellule,
  RUISSELLEMENT_AMONT,
  voisineAval,
} from "./relief";
import {
  conductiviteHorizonMmSemaine,
  facteurPhBiologie,
  porositeDrainageMm,
  profondeurPenetrableCm,
  ruHorizonMm,
} from "./soil";
import type { GameState, TickFluxes } from "./state";
import { gridDims, weekOfYear } from "./state";
import { PLUIE_DEFAUT_MM_AN, SEUIL_COURS_DEAU_M2, sourcesDeLaParcelle } from "./terrain";
import type { CauseMort, TreeState } from "./trees";
import {
  dureeChandelleSemaines,
  fractionsRacinairesParHorizon,
  prochainDommageHydraulique,
  rootRadiusM,
  STRESS_LETHAL,
  seasonFactor,
  tickTree,
  treeExtractionCapacityGWeek,
  treeNitrogenNeedGWeek,
  treeWaterDemandL,
} from "./trees";
import type { HorizonHydro } from "./water";
import { drynessFactor, profilHydro } from "./water";

/**
 * Part de l'ETP qu'un sol NU peut évaporer (la strate herbacée, elle, est
 * modélisée explicitement dans herbe.ts et transpire pour son compte).
 */
const SOIL_EVAP_FRACTION = 0.5;
/**
 * Microclimat forestier (docs/regles.md §3, volet humidité) : sous couvert
 * fermé, l'évaporation du sol tombe à cette fraction de sa valeur plein soleil
 * (ombre + air calme + humidité) *(à calibrer)*. Bas, car sous un couvert la
 * transpiration des arbres REMPLACE l'évaporation du sol au lieu de s'y
 * ajouter — c'est la même ETP qui se partage. Le volet température (−x °C en
 * canicule) viendra avec les vraies séries météo.
 */
const CANOPY_EVAP_FLOOR = 0.15;
/**
 * Paillage : une litière fournie coupe l'évaporation du sol nu (ch2, ch7
 * « zéro sol nu »). Plafond d'effet et stock de litière (g C/m²) qui l'atteint
 * — ~250 g C/m² ≈ 5 t MS/ha au sol *(à calibrer)*.
 */
const MULCH_MAX_EFFECT = 0.5;
/**
 * Plafond de transpiration d'une cellule, en multiple de l'ETP. Un couvert
 * rugueux capte un peu plus d'énergie qu'un gazon de référence — advection,
 * turbulence — d'où une valeur légèrement supérieure à 1 *(à calibrer)*.
 */
const PLAFOND_ENERGIE = 1.15;

const MULCH_FULL_CG = 250;
const G_PER_M2_TO_KG_PER_HA = 10;
/** semaine du recrutement annuel des semis (printemps) */
const RECRUITMENT_WEEK = 14;
/**
 * Semaine où l'on remet à zéro le compteur de froid. Mi-septembre : le froid
 * qui lève la dormance est celui de l'automne et de l'hiver qui SUIVENT, pas
 * celui de l'hiver précédent.
 */
const DEBUT_COMPTAGE_FROID = 37;
/** Ce qui reste toujours de l'horizon de surface, même décapé, cm. */
const EPAISSEUR_MINIMALE_CM = 3;
/** Dernière semaine de l'année : le feuillage restant tombe pour de bon. */
const DERNIERE_SEMAINE = 51;
/**
 * Combien de temps un arbre tué par le feu reste récupérable avant que le bois
 * ne se déprécie (bleuissement, insectes) : environ un an *(à calibrer)*.
 */
const CHABLIS_RECUPERABLE_SEMAINES = 52;
/**
 * Part de l'azote acquis dans l'année qui retourne au sol avec les feuilles ;
 * le reste est retenu dans le bois *(à calibrer — rétranslocation ch3-B)*.
 */
const LITTER_RETURN_FRACTION = 0.5;

/** Un arbre mort pendant le tick : de quoi le raconter ET l'animer là où il est. */
export interface MortDeLaSemaine {
  /** l'arbre qui vient de mourir : il reste en jeu comme chandelle */
  id: number;
  /** position du tronc, m — sans elle le rendu ne sait pas où animer la chute */
  x: number;
  y: number;
  especeId: string;
  cause: CauseMort;
  heightM: number;
}

/** L'incendie de la semaine, tel qu'on peut le raconter ET le dessiner. */
export interface IncendieResult {
  cellulesBrulees: number;
  arbresTues: number;
  rejets: number;
  carboneTHa: number;
  /** cellule où le feu est parti */
  origine: number;
  /** cellules brûlées, rangées par rang d'arrivée du front */
  brulees: Int32Array;
  /**
   * Rang d'arrivée du front sur chaque cellule de `brulees`, même ordre : sa
   * distance à l'origine en cellules. C'est ce qui permet de faire COURIR une
   * ligne de flammes au lieu de noircir la tache d'un coup (feu.ts).
   */
  rangs: Int32Array;
}

/**
 * Une chandelle qui s'abat, telle qu'on peut la raconter ET la dessiner : le
 * rendu a besoin de la direction pour coucher le tronc dans le bon sens, et de
 * l'empreinte pour savoir où le poser (boisMort.ts).
 */
export interface ChuteDeChandelle {
  id: number;
  x: number;
  y: number;
  especeId: string;
  heightM: number;
  /** direction de la chute, radians (0 = +x, sens trigonométrique) */
  directionRad: number;
  /** bois déposé au sol par cette chute, kg C */
  masseKgC: number;
  /** cellules recouvertes par le tronc, et sur quelle longueur */
  empreinte: CelluleSousLeTronc[];
}

export interface TickResult {
  state: GameState;
  fluxes: TickFluxes;
  /** arbres morts pendant ce tick, avec ce qui les a tués et où ils sont */
  morts: MortDeLaSemaine[];
  /** incendie de la semaine, s'il y en a eu un */
  incendie?: IncendieResult;
  /**
   * Ce que le GIBIER a fait subir à quels arbres cette semaine (broutage,
   * frottis). Les gestes du joueur remontent par `applyAction` (actions.ts) ;
   * le rendu les traite de la même façon.
   */
  gestes: GesteVisible[];
  /**
   * Ce qui n'a pas pu rentrer dans le sol de chaque cellule cette semaine,
   * mm : débordement du profil + ruissellement refusé à l'infiltration. La
   * seule base honnête pour une crue, une lame d'eau ou une ravine.
   */
  debordementParCellule: Float32Array;
  /** lumière relative arrivant au sol, cellule par cellule ∈ [0,1] (light.ts) */
  lumiereAuSol: Float32Array;
  /** chandelles abattues cette semaine, avec où et comment elles sont tombées */
  chutes: ChuteDeChandelle[];
}

export function tick(state: GameState, weather: WeekWeather): TickResult {
  const { station } = state;
  const dims = gridDims(station);
  const nCells = cellCount(dims);
  const week = weekOfYear(state);
  // Un versant sud reçoit plus de rayonnement qu'un terrain plat, un versant
  // nord moins : c'est l'écart adret/ubac, et il suffit à porter deux
  // végétations différentes de part et d'autre d'une crête (relief.ts).
  const etpMm =
    weeklyEtpHargreaves(station.latitudeDeg, week, weather) *
    facteurExpositionRayonnement(station.relief);
  // Le CO₂ de l'année voyage avec la météo (climat.ts) : c'est lui qui décide
  // du gain de croissance et de la fermeture des stomates.
  const ppmSemaine = weather.co2Ppm ?? CO2_ACTUEL_PPM;
  const facteurCo2 = facteurCo2Croissance(ppmSemaine);
  const trees = state.trees;

  // ── 0. Lumière : au sol (microclimat, évaporation) et par arbre (croissance
  //      ET transpiration — c'est le moteur de l'effet nurse, cf. trees.ts).
  // Phénologie : chaque espèce a son calendrier, et le feuillage se déploie
  // progressivement au lieu de s'allumer d'un coup (phenologie.ts).
  // Le MÊME contexte que celui qui voyagera dans l'instantané : le rendu
  // recalcule les couleurs de saison avec exactement ces cinq scalaires.
  const pheno = contextePhenologique(
    station.latitudeDeg,
    week,
    state.ddYearBase5,
    state.semainesDeFroid,
  );
  // L'ombre porte sur le feuillage qui INTERCEPTE, feuilles mortes des
  // marcescents comprises ; la croissance et la litière suivront la part
  // vivante (phenologie.ts).
  const partOmbrageanteDe: PartOmbrageante = (tree) =>
    partFoliaireOmbrageanteDans(getEspece(tree.especeId), pheno);
  const groundLight = computeGroundLight(trees, dims.widthM, dims.heightM, partOmbrageanteDe);
  const light = computeLight(trees, partOmbrageanteDe);

  // ── 1. Bilan hydrique stratifié + minéralisation + litière ────────────────
  const profil = station.profil;
  const nH = Math.max(1, profil.length);
  const horizonsHydro: HorizonHydro[] = profil.map((h) => ({
    ruMm: ruHorizonMm(h),
    porositeMm: porositeDrainageMm(h),
    conductiviteMm: conductiviteHorizonMmSemaine(h),
    epaisseurCm: h.epaisseurCm,
  }));
  const epaisseurs = profil.map((h) => h.epaisseurCm);
  const solPenetrableCm = profondeurPenetrableCm(profil);
  const ruSurface = horizonsHydro[0]?.ruMm ?? 1;
  // Réserve utile DYNAMIQUE de l'horizon de surface (critère A12) : elle suit
  // l'humus de la cellule. C'est le retour sur investissement de « construire
  // du sol » — et, à l'inverse, ce qu'un labour répété finit par coûter en
  // eau disponible. On raisonne en écart relatif au profil de départ, l'humus
  // étant compté pour tout le profil et non par horizon.
  const horizonSurface = profil[0];
  const humusInitialG = station.initialSoilCTHa * T_HA_TO_G_M2;
  const ruSurfacePourHumus = (humusG: number, perdueCm = 0): number => {
    if (!horizonSurface || humusInitialG <= 0) return ruSurface;
    const rapport = Math.min(3, Math.max(0.2, humusG / humusInitialG));
    // L'érosion amincit l'horizon : moins d'épaisseur, moins de réserve. On
    // garde un plancher — même décapé, il reste toujours un peu de terre.
    const epaisseur = Math.max(
      EPAISSEUR_MINIMALE_CM,
      horizonSurface.epaisseurCm - Math.max(0, perdueCm),
    );
    return ruHorizonMm({
      ...horizonSurface,
      epaisseurCm: epaisseur,
      moPct: horizonSurface.moPct * rapport,
    });
  };
  // Buffer réutilisé : un tableau d'horizons par cellule serait ruineux.
  const horizonsCellule: HorizonHydro[] = horizonsHydro.map((h) => ({ ...h }));

  const waterMm = state.soil.waterMm.slice();
  const excessMm = state.soil.excessMm.slice();
  const mineralNG = state.soil.mineralNG.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const humusCG = state.soil.humusCG.slice();
  const phosphoreG = state.soil.phosphoreG.slice();
  const phosphoreFixeG = state.soil.phosphoreFixeG.slice();
  const potassiumG = state.soil.potassiumG.slice();
  const potassiumReserveG = state.soil.potassiumReserveG.slice();
  const litterK = state.soil.litterK.slice();
  const herbeCouverture = state.soil.herbeCouverture.slice();
  const herbeBiomasse = state.soil.herbeBiomasse.slice();
  const herbeHumidite = state.soil.herbeHumidite.slice();
  /** engorgement par (cellule, horizon) */
  const waterlogging = new Array<number>(nCells * nH).fill(0);
  const availFactor = new Array<number>(nCells);
  const drainageMmArr = new Array<number>(nCells);
  let evapSum = 0;
  let drainageSum = 0;
  let overflowSum = 0;
  let waterloggingSum = 0;
  let mineralizationSumG = 0;
  let litterDecaySumG = 0;
  let climateSum = 0;
  let emittedG = 0; // CO2 des décompositions (litière + humus), g C
  let depositionSumG = 0;
  // Altération de la roche et dépôts, g/m²/semaine (pk.ts).
  const horizonSurface0 = profil[0];
  const alterationPSemaine = alterationPhosphoreG(profil);
  const alterationKSemaine = alterationPotassiumG(profil);
  const depositionPSemaine = DEPOSITION_P_KG_HA_AN / G_PER_M2_TO_KG_PER_HA / 52;
  const depositionKSemaine = DEPOSITION_K_KG_HA_AN / G_PER_M2_TO_KG_PER_HA / 52;
  const cecSurface = horizonSurface0 ? capaciteEchange(horizonSurface0) : 10;
  let uptakePSumG = 0;
  let uptakeKSumG = 0;
  let leachedKSumG = 0;
  // Apport hebdomadaire moyen, g N/m² ; la part humide suit la pluie de la
  // semaine, rapportée à une semaine moyenne de l'année.
  const depositionSemaineG = station.depositionNKgHaAn / G_PER_M2_TO_KG_PER_HA / 52;
  const partPluie = Math.min(3, weather.rainMm / 15);

  // Relief : l'eau ne reste plus dans sa cellule (relief.ts). On précalcule le
  // champ d'altitudes, l'ordre de descente et la voisine aval — ils ne
  // changent pas d'une semaine à l'autre.
  const altitudes = altitudeParCellule(station.relief, dims);
  // L'eau libre (ruisseau, mare) tient une nappe sous la parcelle : elle
  // affleure à la berge et s'enfonce en s'éloignant (eau_surface.ts). Deux
  // effets, cellule par cellule : ce que la capillarité rend aux racines, et
  // ce que l'exutoire peut encore évacuer.
  // D'où vient l'eau libre : soit elle est déclarée (« un ruisseau au sud »),
  // soit c'est le terrain qui la fabrique — les cuvettes se remplissent, les
  // talwegs assez drainés deviennent des cours d'eau (terrain.ts). Les deux
  // produisent le même objet, et la suite ne sait pas laquelle c'est.
  const sourcesEau = sourcesDeLaParcelle(station.eau, altitudes, dims, {
    apportAmontM2: station.relief.bassinAmontHa * 10_000,
    // Une cuvette ne tient l'eau que si son bassin lui en apporte plus qu'elle
    // n'en perd par le fond et par évaporation (terrain.ts).
    pluieAnnuelleMm: station.pluieAnnuelleMm ?? PLUIE_DEFAUT_MM_AN,
    profil: station.profil,
  });
  const nappeReposCm = champDeNappeCm(sourcesEau, altitudes, dims, station.profil);
  // La nappe comme STOCK (nappe.ts) : ce qui percole sous le profil ne
  // disparaît plus, il la recharge ; la région la ramène vers son niveau
  // d'équilibre, dans les deux sens ; et son niveau décide de ce que le sol
  // peut encore évacuer. C'est ce chaînage qui permet à une forêt de faire
  // baisser la nappe en transpirant — et à un incendie de la faire remonter.
  const nappeStockMm = state.soil.nappeMm.slice();
  const capaciteNappeMm = capaciteAquifereMm(station.profil);
  // La nappe est une SURFACE, plus plate que le terrain : profonde sous les
  // buttes, affleurante dans les creux (nappe.ts). Chaque cellule a donc son
  // propre niveau d'équilibre.
  // Décalage du niveau régional par rapport à sa valeur d'origine : c'est lui
  // qui porte l'effet d'un événement à l'échelle du bassin (nappe.ts).
  const nappeRegionaleDepart = stockEquilibreMm(
    station.profil,
    station.remonteeNappeMmSemaine,
    station.drainageExterneMmSemaine,
    station.profondeurNappeEquilibreCm,
  );
  const decalageRegional = state.soil.nappeRegionaleMm - nappeRegionaleDepart;
  const nappeEquilibreParCellule = stocksEquilibreParCellule(
    station.profil,
    altitudes,
    station.remonteeNappeMmSemaine,
    station.drainageExterneMmSemaine,
    station.profondeurNappeEquilibreCm,
  );
  let vidangeNappeMm = 0;
  let apportRegionalMm = 0;
  let remonteeNappeMm = 0;
  let apportEauLibreMm = 0;
  const descente = ordreDeDescente(altitudes);
  const aval = voisineAval(altitudes, dims);
  // La pente se lit CELLULE PAR CELLULE : sur un terrain dessiné, la berge
  // d'une mare et le plateau qui la borde n'ont rien à voir (relief.ts).
  const pentes = penteParCellule(altitudes, dims);
  // Ce qui arrive de l'amont : la pluie tombée sur le bassin versant qui verse
  // sur nous, ramenée à la surface de la parcelle.
  const surfaceHaParcelle = nCells / 10_000;
  const apportAmontMm =
    surfaceHaParcelle > 0
      ? (weather.rainMm * RUISSELLEMENT_AMONT * station.relief.bassinAmontHa) / surfaceHaParcelle
      : 0;
  // L'eau d'amont ne tombe pas du ciel : elle franchit la bordure haute puis
  // traverse la parcelle en s'infiltrant au passage (relief.ts). La répartir
  // uniformément revenait à en faire de la pluie.
  // Au-delà de quelques hectares, ce qui arrive n'est plus du ruissellement
  // diffus mais un cours d'eau : il entre par un point et traverse dans son
  // lit (terrain.ts).
  const amontM2 = station.relief.bassinAmontHa * 10_000;
  const poidsAmont =
    apportAmontMm > 0 ? entreesDAmont(altitudes, dims, amontM2 >= SEUIL_COURS_DEAU_M2) : undefined;
  const apportCelluleMm = (i: number) =>
    poidsAmont ? apportAmontMm * nCells * (poidsAmont[i] ?? 0) : 0;
  // La crue : le cours d'eau reçoit le même ruissellement d'amont que la
  // parcelle, et monte d'autant. Sa nappe monte avec lui, ce qui noie le bas
  // et asphyxie ce qui ne tolère pas l'engorgement (eau_surface.ts).
  const crueCm = 100 * hauteurDeCrueM(station.eau, apportAmontMm);
  const nappeEauLibreCm =
    crueCm > 0 ? nappeReposCm.map((v) => Math.max(0, v - crueCm)) : nappeReposCm;
  // Deux nappes possibles sous une cellule : celle qu'impose l'eau libre
  // voisine, et celle que porte l'aquifère. C'est la plus HAUTE des deux qui
  // gouverne, puisque c'est elle qui sature le sol en premier.
  const nappeCm = new Float32Array(nCells);
  for (let i = 0; i < nCells; i++) {
    nappeCm[i] = Math.min(
      nappeEauLibreCm[i] ?? Number.POSITIVE_INFINITY,
      profondeurPourStock(nappeStockMm[i] ?? 0, station.profil),
    );
  }
  let cellulesInondees = 0;
  for (const v of nappeCm) if (v <= 5) cellulesInondees++;

  const debordementParCellule = new Array<number>(nCells).fill(0);
  let ruissellementEntrantMm = 0;
  let ruissellementSortantMm = 0;
  // Érosion : la terre arrachée voyage avec sa charge de fertilité, et ce
  // qu'elle emporte hors de la parcelle est une perte sèche (erosion.ts).
  const masseSurfaceKgM2 = profil[0] ? masseHorizonKgM2(profil[0]) : 0;
  const epaisseurPerdueCm = state.soil.epaisseurPerdueCm.slice();
  const chargeHumusCG = new Array<number>(nCells).fill(0);
  const chargeLitiereCG = new Array<number>(nCells).fill(0);
  const chargeNminG = new Array<number>(nCells).fill(0);
  const chargeNlitG = new Array<number>(nCells).fill(0);
  const chargePG = new Array<number>(nCells).fill(0);
  const chargeKG = new Array<number>(nCells).fill(0);
  let erosionArracheeKg = 0;
  let erosionSortieKg = 0;
  let erosionSortieHumusCG = 0;
  let erosionSortieLitiereCG = 0;
  let erosionSortieNminG = 0;
  let erosionSortieNlitG = 0;
  let erosionSortiePG = 0;
  let erosionSortieKG = 0;

  const eauCellule = new Array<number>(nH);
  const excesCellule = new Array<number>(nH);
  // Buffer réutilisé : évite des dizaines de milliers d'allocations par semaine.
  const bilanOut = {
    eauMm: new Array<number>(nH).fill(0),
    excesMm: new Array<number>(nH).fill(0),
    evapMm: 0,
    drainageMm: 0,
    overflowMm: 0,
    nappeMm: 0,
    engorgementParHorizon: new Array<number>(nH).fill(0),
  };
  for (let i = 0; i < nCells; i++) {
    const base = i * nH;
    for (let h = 0; h < nH; h++) {
      eauCellule[h] = waterMm[base + h] ?? 0;
      excesCellule[h] = excessMm[base + h] ?? 0;
    }
    const surface = horizonsCellule[0];
    if (surface) {
      surface.ruMm = ruSurfacePourHumus(humusCG[i] ?? humusInitialG, epaisseurPerdueCm[i] ?? 0);
    }
    // Ce qui ruisselle ne rentre pas : on le retire de la pluie qui s'infiltre,
    // et il rejoindra l'aval (relief.ts). La couverture du sol et la litière
    // freinent — c'est là que « couvrir le sol » paie en eau.
    const couvertureSol = Math.min(
      1,
      (herbeCouverture[i] ?? 0) + Math.min(0.6, (litterCG[i] ?? 0) / MULCH_FULL_CG),
    );
    const saturationSurface = ruSurface > 0 ? (waterMm[i * nH] ?? 0) / ruSurface : 0;
    const amontIci = apportCelluleMm(i);
    const ruissele =
      (weather.rainMm + amontIci) *
      coefficientRuissellement(pentes[i] ?? 0, couvertureSol, saturationSurface);
    const bilan = profilHydro(
      {
        horizons: horizonsCellule,
        eauMm: eauCellule,
        excesMm: excesCellule,
        rainMm: weather.rainMm + amontIci - ruissele,
        evapDemandMm:
          etpMm *
          SOIL_EVAP_FRACTION *
          (CANOPY_EVAP_FLOOR + (1 - CANOPY_EVAP_FLOOR) * (groundLight[i] ?? 1)) *
          (1 - MULCH_MAX_EFFECT * Math.min(1, (litterCG[i] ?? 0) / MULCH_FULL_CG)),
        // La remontée capillaire PUISE dans la nappe : ce n'est plus un apport
        // venu de nulle part, c'est un transfert.
        nappeMm: Number.isFinite(nappeCm[i] ?? Number.POSITIVE_INFINITY)
          ? station.remonteeNappeMmSemaine + remonteeCapillaireMm(nappeCm[i] ?? 0, station.profil)
          : station.remonteeNappeMmSemaine,
        nappeProfondeurCm: nappeCm[i] ?? Number.POSITIVE_INFINITY,
        drainageExterneMm: drainageAvecNappe(
          station.drainageExterneMmSemaine,
          nappeCm[i] ?? Number.POSITIVE_INFINITY,
          station.profil,
        ),
      },
      bilanOut,
    );
    for (let h = 0; h < nH; h++) {
      waterMm[base + h] = bilan.eauMm[h] ?? 0;
      excessMm[base + h] = bilan.excesMm[h] ?? 0;
      waterlogging[base + h] = bilan.engorgementParHorizon[h] ?? 0;
    }
    drainageMmArr[i] = bilan.drainageMm;
    ruissellementEntrantMm += amontIci;
    // Le débordement, c'est l'eau que la cellule n'a pas pu absorber. Sur du
    // plat elle stagne puis s'en va ; sur une pente, elle RUISSELLE — et c'est
    // elle qu'il faut router, pas l'eau gravitaire déjà infiltrée.
    debordementParCellule[i] = bilan.overflowMm + ruissele;
    // Ce qui percole recharge la nappe ; ce qu'elle a rendu au sol lui est
    // retiré. L'eau qui remonte n'a pas toujours la même provenance : quand un
    // ruisseau voisin impose une nappe haute, c'est LUI qui fournit, et cette
    // eau-là ENTRE dans la parcelle. On sert donc d'abord sur l'aquifère
    // local, le reste vient de l'eau libre.
    //
    // Ce bloc vient APRÈS l'affectation du débordement, et il faut qu'il y
    // reste : le trop-plein d'aquifère s'y ajoute, et le placer avant le
    // faisait effacer par elle.
    const depuisAquifere = Math.min(nappeStockMm[i] ?? 0, bilan.nappeMm);
    apportEauLibreMm += bilan.nappeMm - depuisAquifere;
    remonteeNappeMm += bilan.nappeMm;
    let stockNappe = (nappeStockMm[i] ?? 0) - depuisAquifere + bilan.drainageMm;
    // Échange avec le réseau régional, dans les deux sens : une parcelle plus
    // chargée que le niveau régional se vide vers lui, un fond de vallée en
    // reçoit. C'est ce terme qui tient le niveau d'une nappe, à l'échelle
    // d'une parcelle où rien d'autre ne le déciderait.
    const echangeRegional = Math.min(
      APPORT_REGIONAL_MAX_MM,
      ((nappeEquilibreParCellule[i] ?? 0) + decalageRegional - stockNappe) * ECHANGE_REGIONAL,
    );
    if (echangeRegional >= 0) apportRegionalMm += echangeRegional;
    else vidangeNappeMm += -echangeRegional;
    stockNappe += echangeRegional;
    if (stockNappe > capaciteNappeMm) {
      // Aquifère plein : le reste ressort en surface. C'est une source.
      debordementParCellule[i] = (debordementParCellule[i] ?? 0) + (stockNappe - capaciteNappeMm);
      nappeStockMm[i] = capaciteNappeMm;
    } else {
      nappeStockMm[i] = Math.max(0, stockNappe);
    }
    evapSum += bilan.evapMm;
    drainageSum += bilan.drainageMm;

    waterloggingSum += bilan.engorgementParHorizon[0] ?? 0;

    // La vie du sol se joue en surface : c'est l'horizon 0 qui pilote.
    const moistureRatio = ruSurface > 0 ? (waterMm[base] ?? 0) / ruSurface : 0;
    const climate = decompositionClimateFactor(
      weather.tMean,
      moistureRatio,
      waterlogging[base] ?? 0,
    );
    climateSum += climate;
    // La litière se décompose selon son C/N (aulne vite, pin lentement, ch2-B) ;
    // son carbone part pour partie en humus (humification), le reste en CO2.
    const decayFraction = Math.min(1, (litterK[i] ?? 0) * climate);
    const decayedN = (litterNG[i] ?? 0) * decayFraction;
    const decayedC = (litterCG[i] ?? 0) * decayFraction;
    // Faim d'azote (C9) : un substrat à C/N élevé oblige les décomposeurs à
    // puiser dans l'azote minéral du sol. Rien ne se perd — l'azote passe du
    // pool minéral au pool en décomposition, et reviendra plus tard.
    const netN = azoteNetDecomposition(decayedC, decayedN);
    const disponible = mineralNG[i] ?? 0;
    // On ne peut pas immobiliser plus que ce qu'il y a : à défaut d'azote, la
    // décomposition ralentit, elle ne s'endette pas.
    const transfere = netN >= 0 ? netN : -Math.min(disponible, -netN);
    litterNG[i] = (litterNG[i] ?? 0) - transfere;
    litterCG[i] = (litterCG[i] ?? 0) - decayedC;
    humusCG[i] = (humusCG[i] ?? 0) + LITTER_HUMIFICATION * decayedC;
    emittedG += (1 - LITTER_HUMIFICATION) * decayedC;
    // L'humus est LE stock d'azote organique du sol : ce qui s'en minéralise
    // part en CO₂ pour le carbone et revient aux plantes pour l'azote, au
    // rapport C/N de l'humus. Les deux cycles ne peuvent plus diverger — et
    // c'est ce couplage qui donne son sens à « construire du sol » (§12).
    // L'acidité freine la vie du sol : un humus mor tient son azote.
    const humusLoss =
      (humusCG[i] ?? 0) *
      ((HUMUS_DECAY_PER_YEAR / 52) * climate * facteurPhBiologie(state.soil.ph[i] ?? 7));
    humusCG[i] = (humusCG[i] ?? 0) - humusLoss;
    emittedG += humusLoss;
    const mineralized = humusLoss / CN_HUMUS;
    // Dépôts atmosphériques : pour moitié lessivés par la pluie, pour moitié
    // secs (poussières, gaz absorbés).
    const depositionG = depositionSemaineG * (0.5 + 0.5 * partPluie);
    depositionSumG += depositionG;
    mineralNG[i] = (mineralNG[i] ?? 0) + mineralized + transfere + depositionG;

    // ── Phosphore et potassium (pk.ts) ─────────────────────────────────────
    const phCell = state.soil.ph[i] ?? 7;
    // Le phosphore libéré par l'humus qui se minéralise. Celui des feuilles
    // tombées, lui, revient à la chute (plus bas) : le compter deux fois
    // reviendrait à en fabriquer.
    const pOrganique = mineralized * RATIO_P_SUR_N;

    // Ce que la roche libère, semaine après semaine — et bien plus vite là où
    // le mycélium l'attaque (pk.ts). C'est ainsi qu'une forêt installée
    // fabrique une partie de sa propre fertilité minérale.
    const bio = facteurAlterationBiologique(
      Math.max(
        state.soil.mycorhizes.ecto[i] ?? 0,
        state.soil.mycorhizes.arbusculaire[i] ?? 0,
        state.soil.mycorhizes.ericoide[i] ?? 0,
      ),
    );
    phosphoreG[i] =
      (phosphoreG[i] ?? 0) + pOrganique + alterationPSemaine * bio + depositionPSemaine;
    potassiumG[i] = (potassiumG[i] ?? 0) + alterationKSemaine * bio + depositionKSemaine;
    // Le tampon du sol : la réserve suit ce que les racines prennent.
    const echange = echangeReserveK(
      potassiumG[i] ?? 0,
      potassiumReserveG[i] ?? 0,
      station.potassiumInitialGM2,
    );
    potassiumG[i] = (potassiumG[i] ?? 0) + echange;
    potassiumReserveG[i] = (potassiumReserveG[i] ?? 0) - echange;
    // Rétrogradation : le phosphore assimilable repasse en formes fixées,
    // d'autant plus vite que le pH s'éloigne de l'optimum. Rien ne se perd —
    // le stock fixé relargue lentement en retour.
    const fixe = (phosphoreG[i] ?? 0) * retrogradationHebdo(phCell);
    const relargue = (phosphoreFixeG[i] ?? 0) * RELARGAGE_HEBDO;
    phosphoreG[i] = (phosphoreG[i] ?? 0) - fixe + relargue;
    phosphoreFixeG[i] = (phosphoreFixeG[i] ?? 0) + fixe - relargue;
    mineralizationSumG += mineralized;
    litterDecaySumG += transfere;
    availFactor[i] = nitrogenAvailabilityFactor(mineralNG[i] ?? 0);
  }

  // ── 2 bis. Ruissellement : l'eau descend la pente ─────────────────────────
  // On parcourt les cellules de la plus haute à la plus basse : ce qui part
  // d'en haut a déjà été calculé quand on arrive en bas, et l'eau cascade donc
  // d'un bout à l'autre du versant en une seule passe. C'est l'eau GRAVITAIRE
  // qui bouge — celle que le sol ne retient pas ; la réserve utile, elle,
  // reste où elle est.
  // ── 2 ter. La nappe s'écoule vers l'aval ─────────────────────────────────
  // Même réseau que le ruissellement, mais bien plus lentement : c'est le
  // débit de base, celui qui fait les bas de pente frais et les sources.
  for (const i of descente) {
    const stock = nappeStockMm[i] ?? 0;
    if (stock <= 0) continue;
    const part = stock * tauxDeVidange(station.profil, pentes[i] ?? 0);
    if (part <= 0) continue;
    nappeStockMm[i] = stock - part;
    const j = aval[i] ?? -1;
    if (j < 0) {
      vidangeNappeMm += part;
      continue;
    }
    const place = Math.max(0, capaciteNappeMm - (nappeStockMm[j] ?? 0));
    const recu = Math.min(part, place);
    nappeStockMm[j] = (nappeStockMm[j] ?? 0) + recu;
    // Si l'aval est plein, l'eau ressort : c'est une source de rupture de pente.
    if (part > recu) debordementParCellule[i] = (debordementParCellule[i] ?? 0) + (part - recu);
  }

  // L'eau qui court emporte la terre : ce qui suit descend avec elle, cellule
  // par cellule (erosion.ts). `sedimentEnTransit` est ce qu'une cellule passe
  // à sa voisine d'aval, en kg de terre par m².
  const sedimentEnTransit = new Array<number>(nCells).fill(0);
  // Un tronc couché en travers protège la terre sous lui comme un paillage, et
  // c'est un effet reconnu du bois mort : ce qui est dessous ne part pas. On
  // lit le bois de la semaine PRÉCÉDENTE — un arbre qui s'abat ce tick-ci
  // protégera la parcelle à partir du suivant.
  const couvertureDe = (i: number) =>
    Math.min(
      1,
      (herbeCouverture[i] ?? 0) +
        Math.min(0.6, (litterCG[i] ?? 0) / MULCH_FULL_CG) +
        couvertureDuBoisAuSol(
          (state.soil.boisAuSolCG[i] ?? 0) / 1000 / MASSE_LINEIQUE_TRONC_KGC_PAR_M,
        ),
    );
  for (const i of descente) {
    const disponible = debordementParCellule[i] ?? 0;
    const partRuisselante = fractionRuissellement(pentes[i] ?? 0);
    const part = disponible * partRuisselante;
    // ── Érosion : ce qui part en surface arrache de la terre au passage ─────
    const arrachee = part > 0 ? terreArracheeKgM2(part, pentes[i] ?? 0, couvertureDe(i)) : 0;
    const emporte = fractionEmportee(arrachee, masseSurfaceKgM2);
    if (emporte > 0) {
      // Le sédiment part avec sa charge : humus, litière, azote, phosphore et
      // potassium de surface s'en vont dans la même proportion.
      const dHumus = (humusCG[i] ?? 0) * emporte;
      const dLitiere = (litterCG[i] ?? 0) * emporte;
      const dNmin = (mineralNG[i] ?? 0) * emporte;
      const dNlit = (litterNG[i] ?? 0) * emporte;
      const dP = (phosphoreG[i] ?? 0) * emporte;
      const dK = (potassiumG[i] ?? 0) * emporte;
      humusCG[i] = (humusCG[i] ?? 0) - dHumus;
      litterCG[i] = (litterCG[i] ?? 0) - dLitiere;
      mineralNG[i] = (mineralNG[i] ?? 0) - dNmin;
      litterNG[i] = (litterNG[i] ?? 0) - dNlit;
      phosphoreG[i] = (phosphoreG[i] ?? 0) - dP;
      potassiumG[i] = (potassiumG[i] ?? 0) - dK;
      chargeHumusCG[i] = (chargeHumusCG[i] ?? 0) + dHumus;
      chargeLitiereCG[i] = (chargeLitiereCG[i] ?? 0) + dLitiere;
      chargeNminG[i] = (chargeNminG[i] ?? 0) + dNmin;
      chargeNlitG[i] = (chargeNlitG[i] ?? 0) + dNlit;
      chargePG[i] = (chargePG[i] ?? 0) + dP;
      chargeKG[i] = (chargeKG[i] ?? 0) + dK;
      sedimentEnTransit[i] = (sedimentEnTransit[i] ?? 0) + arrachee;
      erosionArracheeKg += arrachee;
      // Le sol s'amincit d'autant : c'est la conséquence longue, celle qui
      // ferme la boucle (moins de réserve utile → plus de ruissellement).
      if (horizonSurface) {
        epaisseurPerdueCm[i] =
          (epaisseurPerdueCm[i] ?? 0) + epaisseurPerdueCm2(arrachee, horizonSurface);
      }
    }
    const jSediment = aval[i] ?? -1;
    const enTransit = sedimentEnTransit[i] ?? 0;
    if (enTransit > 0) {
      if (jSediment < 0) {
        // Point bas : la terre quitte la parcelle. C'est une perte sèche, et
        // elle doit apparaître dans les bilans (carbone, azote, P, K).
        erosionSortieKg += enTransit;
        erosionSortieHumusCG += chargeHumusCG[i] ?? 0;
        erosionSortieLitiereCG += chargeLitiereCG[i] ?? 0;
        erosionSortieNminG += chargeNminG[i] ?? 0;
        erosionSortieNlitG += chargeNlitG[i] ?? 0;
        erosionSortiePG += chargePG[i] ?? 0;
        erosionSortieKG += chargeKG[i] ?? 0;
      } else {
        // Une partie se dépose ici, le reste continue : un sol couvert peigne
        // les particules, c'est le principe de la bande enherbée.
        const depose = partDeposee(couvertureDe(jSediment));
        if (horizonSurface) {
          epaisseurPerdueCm[jSediment] =
            (epaisseurPerdueCm[jSediment] ?? 0) -
            epaisseurPerdueCm2(enTransit * depose, horizonSurface);
        }
        humusCG[jSediment] = (humusCG[jSediment] ?? 0) + (chargeHumusCG[i] ?? 0) * depose;
        litterCG[jSediment] = (litterCG[jSediment] ?? 0) + (chargeLitiereCG[i] ?? 0) * depose;
        mineralNG[jSediment] = (mineralNG[jSediment] ?? 0) + (chargeNminG[i] ?? 0) * depose;
        litterNG[jSediment] = (litterNG[jSediment] ?? 0) + (chargeNlitG[i] ?? 0) * depose;
        phosphoreG[jSediment] = (phosphoreG[jSediment] ?? 0) + (chargePG[i] ?? 0) * depose;
        potassiumG[jSediment] = (potassiumG[jSediment] ?? 0) + (chargeKG[i] ?? 0) * depose;
        const reste = 1 - depose;
        sedimentEnTransit[jSediment] = (sedimentEnTransit[jSediment] ?? 0) + enTransit * reste;
        chargeHumusCG[jSediment] =
          (chargeHumusCG[jSediment] ?? 0) + (chargeHumusCG[i] ?? 0) * reste;
        chargeLitiereCG[jSediment] =
          (chargeLitiereCG[jSediment] ?? 0) + (chargeLitiereCG[i] ?? 0) * reste;
        chargeNminG[jSediment] = (chargeNminG[jSediment] ?? 0) + (chargeNminG[i] ?? 0) * reste;
        chargeNlitG[jSediment] = (chargeNlitG[jSediment] ?? 0) + (chargeNlitG[i] ?? 0) * reste;
        chargePG[jSediment] = (chargePG[jSediment] ?? 0) + (chargePG[i] ?? 0) * reste;
        chargeKG[jSediment] = (chargeKG[jSediment] ?? 0) + (chargeKG[i] ?? 0) * reste;
      }
    }
    if (disponible <= 0) continue;
    // Ce qui ne ruisselle pas stagne sur place et finit par s'en aller.
    overflowSum += disponible - part;
    if (part <= 0) continue;
    const j = aval[i] ?? -1;
    if (j < 0) {
      // Point bas de la parcelle : l'eau s'en va pour de bon.
      ruissellementSortantMm += part;
      continue;
    }
    // Elle arrive chez la voisine du dessous, où elle a une seconde chance de
    // s'infiltrer — c'est ce qui fait les bas de pente frais.
    const cible = j * nH;
    const ruCible = ruSurfacePourHumus(humusCG[j] ?? humusInitialG, epaisseurPerdueCm[j] ?? 0);
    const place = Math.max(0, ruCible - (waterMm[cible] ?? 0));
    const infiltre = Math.min(part, place);
    waterMm[cible] = (waterMm[cible] ?? 0) + infiltre;
    const reste = part - infiltre;
    // Ce qu'elle ne peut pas absorber continue sa route à la passe suivante.
    debordementParCellule[j] = (debordementParCellule[j] ?? 0) + reste;
  }

  // ── 3. Prélèvements eau + azote, en deux passes (ordre-indépendant) ───────
  // L'eau est demandée par (cellule, horizon) selon la distribution verticale
  // des racines de chaque arbre : un semis ne puise qu'en surface, un pivot
  // adulte va chercher l'eau profonde. C'est la complémentarité verticale.
  const nTrees = trees.length;
  const waterDemandL = new Array<number>(nTrees).fill(0);
  const pSatisfaction = new Array<number>(nTrees).fill(1);
  const kSatisfaction = new Array<number>(nTrees).fill(1);
  const nNeedG = new Array<number>(nTrees).fill(0);
  const rootCells = new Array<number>(nTrees).fill(1);
  const wlMean = new Array<number>(nTrees).fill(0);
  const phMean = new Array<number>(nTrees).fill(7);
  const rootFractions = new Array<number[]>(nTrees);
  const cellWaterDemand = new Array<number>(nCells * nH).fill(0);
  const cellNWanted = new Array<number>(nCells).fill(0);

  for (let t = 0; t < nTrees; t++) {
    const tree = trees[t];
    if (!tree?.alive) continue;
    const espece = getEspece(tree.especeId);
    // Même règle que pour la croissance : un arbre sans feuilles ne transpire
    // pas, aussi doux que soit l'hiver (trees.ts, phenologie.ts).
    const season = seasonFactor(espece, weather.tMean) * partFoliaireActiveDans(espece, pheno);
    // Le mycélium compatible prolonge les racines : à racines égales, un
    // arbre connecté prospecte un volume de terre plus grand (§7.5). C'est de
    // l'exploration, pas de la création — le bilan reste conservatif.
    const reseauLocal = reseauSousArbre(
      state.soil.mycorhizes[espece.mycorhize],
      tree,
      espece,
      dims,
    );
    const gainMyco = facteurAbsorption(reseauLocal);
    const rootR = rootRadiusM(espece, tree.heightM);
    const fractions = fractionsRacinairesParHorizon(epaisseurs, tree.rootDepthCm);
    rootFractions[t] = fractions;
    let n = 0;
    let wlSum = 0;
    let pSum = 0;
    let kSum = 0;
    let phSum = 0;
    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      n++;
      // L'anoxie ressentie dépend de là où sont les racines : une nappe
      // perchée en profondeur n'asphyxie pas un système superficiel.
      for (let h = 0; h < nH; h++) {
        wlSum += (waterlogging[i * nH + h] ?? 0) * (fractions[h] ?? 0);
      }
      phSum += state.soil.ph[i] ?? 7;
      // Phosphore réellement assimilable ici : le stock, tamisé par le pH.
      pSum += (phosphoreG[i] ?? 0) * disponibilitePhosphore(state.soil.ph[i] ?? 7);
      kSum += potassiumG[i] ?? 0;
    });
    rootCells[t] = n;
    wlMean[t] = wlSum / n;
    phMean[t] = phSum / n;
    // Le phosphore et le potassium se lisent comme une ANALYSE DE SOL : un
    // stock comparé à un seuil, pas une allocation hebdomadaire. C'est ainsi
    // que l'agronomie en parle, et c'est bien plus stable — les coupler au
    // partage semaine par semaine faisait osciller des peuplements entiers.
    // Le seuil de carence est une propriété de LA PLANTE, pas du moteur : un
    // pin se contente de ce qui affamerait un pommier, et un pommier de ce qui
    // affamerait un blé. C'est par ce nombre que les cultures s'ajouteront.
    pSatisfaction[t] = facteurNutriment(pSum / n, SATURATION_P_G_M2 * espece.exigenceMinerale);
    kSatisfaction[t] = facteurNutriment(kSum / n, SATURATION_K_G_M2 * espece.exigenceMinerale);
    // À forte concentration de CO₂, les stomates s'ouvrent moins : l'arbre
    // perd moins d'eau pour le même carbone (climat.ts).
    waterDemandL[t] =
      treeWaterDemandL(
        espece,
        tree.heightM,
        etpMm,
        season,
        light[t] ?? 1,
        station.ventExposition,
        station.ventExposition > 0 ? windShelterAt(trees, tree.x, tree.y, tree.id) : 0,
      ) *
      facteurCo2Transpiration(ppmSemaine) *
      // Un arbre embolisé ne peut plus faire monter l'eau qu'il voudrait :
      // ses vaisseaux cassés ne conduisent plus (trees.ts).
      (1 - tree.dommageHydraulique);
    nNeedG[t] = espece.azote.fixateur ? 0 : treeNitrogenNeedGWeek(espece, tree.heightM);
    const capG = espece.azote.fixateur ? 0 : treeExtractionCapacityGWeek(tree.heightM);
    const needPerCell = (nNeedG[t] ?? 0) / n;
    const capPerCell = capG / n;
    const wPerCell = (waterDemandL[t] ?? 0) / n;
    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      for (let h = 0; h < nH; h++) {
        cellWaterDemand[i * nH + h] =
          (cellWaterDemand[i * nH + h] ?? 0) + wPerCell * (fractions[h] ?? 0);
      }
      // Le mycélium sait capter l'azote DILUÉ, là où une racine nue ne
      // trouverait plus rien : c'est sur ce frein-là qu'il agit, et c'est
      // pourquoi il compte sur les sols pauvres et pas sur les riches
      // (où le frein est déjà levé).
      const dispo = Math.min(1, (availFactor[i] ?? 0) * gainMyco);
      const demandeN = Math.min(needPerCell, capPerCell * dispo);
      cellNWanted[i] = (cellNWanted[i] ?? 0) + demandeN;
    });
  }

  // ── 3 bis. La strate herbacée demande sa part, en surface uniquement ──────
  // C'est la concurrence qui fait échouer les plantations non entretenues.
  const saisonHerbe = Math.min(1, Math.max(0, (weather.tMean - 4) / 8));
  const herbeDemandeL = new Array<number>(nCells).fill(0);
  for (let i = 0; i < nCells; i++) {
    const couverture = herbeCouverture[i] ?? 0;
    if (couverture <= 0) continue;
    const demandeEau = herbeDemandeEauL(couverture, etpMm, groundLight[i] ?? 1, saisonHerbe);
    herbeDemandeL[i] = demandeEau;
    cellWaterDemand[i * nH] = (cellWaterDemand[i * nH] ?? 0) + demandeEau;
    cellNWanted[i] = (cellNWanted[i] ?? 0) + herbeDemandeAzoteG(couverture, saisonHerbe);
  }

  // ── Plafond d'énergie ─────────────────────────────────────────────────────
  // On ne transpire pas plus que le soleil ne le permet. La demande d'un arbre
  // est proportionnelle à la surface de son houppier ; quand les couronnes se
  // superposent — et elles se superposent, jusqu'à deux ou trois épaisseurs —
  // la somme des demandes d'une cellule peut dépasser plusieurs fois ce que
  // l'évapotranspiration potentielle peut fournir. C'est physiquement
  // impossible : l'eau évaporée l'est avec l'énergie reçue, et un mètre carré
  // n'en reçoit qu'un mètre carré. On rabat donc les demandes d'une cellule
  // au prorata quand leur somme dépasse ce plafond.
  //
  // *(Le défaut est apparu avec la nappe : tant que l'eau manquait, c'est elle
  // qui bridait, et le plafond ne servait jamais. Une aulnaie de fond de
  // vallée alimentée par la nappe transpirait 1 021 mm par an.)*
  for (let i = 0; i < nCells; i++) {
    const base = i * nH;
    let demandeCellule = herbeDemandeL[i] ?? 0;
    for (let h = 0; h < nH; h++) demandeCellule += cellWaterDemand[base + h] ?? 0;
    const plafond = etpMm * facteurExpositionRayonnement(station.relief) * PLAFOND_ENERGIE;
    if (demandeCellule <= plafond || demandeCellule <= 0) continue;
    const facteur = plafond / demandeCellule;
    for (let h = 0; h < nH; h++) {
      cellWaterDemand[base + h] = (cellWaterDemand[base + h] ?? 0) * facteur;
    }
    herbeDemandeL[i] = (herbeDemandeL[i] ?? 0) * facteur;
  }

  const waterServedRatio = new Array<number>(nCells * nH).fill(0);
  const nServedRatio = new Array<number>(nCells).fill(0);
  let transpirationSumL = 0;
  let uptakeSumG = 0;
  for (let i = 0; i < nCells; i++) {
    const base = i * nH;
    for (let h = 0; h < nH; h++) {
      const wDemand = cellWaterDemand[base + h] ?? 0;
      if (wDemand <= 0) continue;
      const ruH = horizonsHydro[h]?.ruMm ?? 0;
      const water = waterMm[base + h] ?? 0;
      const extracted = Math.min(water, wDemand * drynessFactor(water, ruH));
      waterServedRatio[base + h] = extracted / wDemand;
      waterMm[base + h] = water - extracted;
      transpirationSumL += extracted;
    }
    let azotePris = 0;
    const nWanted = cellNWanted[i] ?? 0;
    if (nWanted > 0) {
      const stock = mineralNG[i] ?? 0;
      const taken = Math.min(stock, nWanted);
      nServedRatio[i] = taken / nWanted;
      mineralNG[i] = stock - taken;
      uptakeSumG += taken;
      azotePris = taken;
    }
    // Phosphore et potassium suivent l'azote RÉELLEMENT absorbé, pas la
    // demande : une plante bridée par l'azote n'accumule pas du potassium pour
    // autant. C'est la stœchiométrie du vivant qui commande.
    if (azotePris > 0) {
      const offert = (phosphoreG[i] ?? 0) * disponibilitePhosphore(state.soil.ph[i] ?? 7);
      const prisP = Math.min(offert, azotePris * RATIO_P_SUR_N);
      phosphoreG[i] = (phosphoreG[i] ?? 0) - prisP;
      uptakePSumG += prisP;
      const prisK = Math.min(potassiumG[i] ?? 0, azotePris * RATIO_K_SUR_N);
      potassiumG[i] = (potassiumG[i] ?? 0) - prisK;
      uptakeKSumG += prisK;
    }
  }

  // La strate évolue selon la lumière reçue et l'humidité qui RESTE en surface
  // après le passage de tout le monde (état du sol, pas flux : cf. herbe.ts).
  let herbeSum = 0;
  for (let i = 0; i < nCells; i++) {
    const remplissage = ruSurface > 0 ? (waterMm[i * nH] ?? 0) / ruSurface : 0;
    herbeHumidite[i] = humiditeVecue(herbeHumidite[i] ?? remplissage, remplissage);
    const cible = couvertureMax(groundLight[i] ?? 1, herbeHumidite[i] ?? remplissage);
    herbeCouverture[i] = prochaineCouverture(herbeCouverture[i] ?? 0, cible, saisonHerbe);
    // La biomasse suit la croissance mais ne suit pas la régression : le foin
    // reste debout et ne part qu'avec la décomposition, la fauche ou le feu.
    herbeBiomasse[i] = Math.max(
      herbeCouverture[i] ?? 0,
      (herbeBiomasse[i] ?? 0) * (1 - (0.01 * climateSum) / nCells),
    );
    herbeSum += herbeCouverture[i] ?? 0;
  }

  const waterSatisfaction = new Array<number>(nTrees).fill(1);
  const nSatisfaction = new Array<number>(nTrees).fill(1);
  const acquiredNG = new Array<number>(nTrees).fill(0);
  for (let t = 0; t < nTrees; t++) {
    const tree = trees[t];
    if (!tree?.alive) continue;
    const espece = getEspece(tree.especeId);
    const rootR = rootRadiusM(espece, tree.heightM);
    const n = rootCells[t] ?? 1;
    const fractions = rootFractions[t] ?? [1];
    const wPerCell = (waterDemandL[t] ?? 0) / n;
    const needPerCell = (nNeedG[t] ?? 0) / n;
    const capPerCell = (espece.azote.fixateur ? 0 : treeExtractionCapacityGWeek(tree.heightM)) / n;
    let gotW = 0;
    let gotN = 0;

    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      for (let h = 0; h < nH; h++) {
        gotW += wPerCell * (fractions[h] ?? 0) * (waterServedRatio[i * nH + h] ?? 0);
      }
      const demandeCell = Math.min(needPerCell, capPerCell * (availFactor[i] ?? 0));
      gotN += demandeCell * (nServedRatio[i] ?? 0);
    });
    const wd = waterDemandL[t] ?? 0;
    const nd = nNeedG[t] ?? 0;
    // Satisfaction rapportée au besoin d'un arbre INTACT : c'est ce qui fait
    // qu'un sujet embolisé reste en déficit même le sol plein — et qu'il meurt
    // souvent à la sécheresse SUIVANTE, pas à celle qui l'a abîmé.
    const besoinIntact = wd / Math.max(0.15, 1 - tree.dommageHydraulique);
    waterSatisfaction[t] = besoinIntact > 0 ? Math.min(1, gotW / besoinIntact) : 1;
    nSatisfaction[t] = nd > 0 ? Math.min(1, gotN / nd) : 1;
    acquiredNG[t] = espece.azote.fixateur
      ? 0.95 * treeNitrogenNeedGWeek(espece, tree.heightM) * seasonFactor(espece, weather.tMean)
      : gotN;
  }

  // ── 4. Lessivage de l'azote minéral restant ────────────────────────────────
  let leachedSumG = 0;
  for (let i = 0; i < nCells; i++) {
    const leached = cellLeachedG(mineralNG[i] ?? 0, drainageMmArr[i] ?? 0, waterMm[i * nH] ?? 0);
    mineralNG[i] = (mineralNG[i] ?? 0) - leached;
    leachedSumG += leached;
    // Le potassium part lui aussi avec l'eau, mais le complexe d'échange le
    // retient : c'est pourquoi les sables en manquent et les argiles non.
    const perduK = lessivagePotassiumG(
      potassiumG[i] ?? 0,
      drainageMmArr[i] ?? 0,
      waterMm[i * nH] ?? 0,
      cecSurface,
    );
    potassiumG[i] = (potassiumG[i] ?? 0) - perduK;
    leachedKSumG += perduK;
  }

  // ── 5. Croissance de chaque arbre — loi du minimum, facteurs locaux ───────
  let nppKgC = 0; // production primaire nette de la semaine (bois + racines)
  let importedPlantsKgC = 0; // carbone des recrues, venu de la graine
  const limitingFactors = new Array<number>(nTrees).fill(0);
  let nextTrees: TreeState[] = trees.map((tree, t) => {
    const result = tickTree(tree, {
      waterSatisfaction: waterSatisfaction[t] ?? 1,
      waterloggingRatio: wlMean[t] ?? 0,
      light: light[t] ?? 1,
      nitrogenSatisfaction: nSatisfaction[t] ?? 1,
      phosphoreSatisfaction: pSatisfaction[t] ?? 1,
      potassiumSatisfaction: kSatisfaction[t] ?? 1,
      phMean: phMean[t] ?? 7,
      solPenetrableCm,
      tMean: weather.tMean,
      // Le feuillage ACTIF, pas l'ombrageant : des feuilles mortes de
      // marcescence font de l'ombre mais ne travaillent pas (phenologie.ts).
      partFoliaire: partFoliaireActiveDans(getEspece(tree.especeId), pheno),
      facteurCo2,
    });
    const next = result.tree;
    limitingFactors[t] = result.limitingFactor;
    if (tree.alive && next.heightM > tree.heightM) {
      const espece = getEspece(tree.especeId);
      nppKgC += treeTotalCarbonKg(espece, next.heightM) - treeTotalCarbonKg(espece, tree.heightM);
    }
    // La vigueur suit le facteur limitant, lissée sur quelques mois : c'est
    // l'état de santé que les ravageurs lisent, pas la hauteur.
    const vigueur = next.vigueur + ((result.limitingFactor ?? 1) - next.vigueur) * 0.05;
    // La cavitation s'installe vite et se dilue lentement : c'est la mémoire
    // pluriannuelle des sécheresses (trees.ts).
    const dommageHydraulique = prochainDommageHydraulique(
      next.dommageHydraulique,
      waterSatisfaction[t] ?? 1,
      getEspece(tree.especeId).eau.seuilStressSecheresse,
    );
    const acquired = acquiredNG[t] ?? 0;
    return {
      ...next,
      vigueur,
      dommageHydraulique,
      uptakeYearG: next.uptakeYearG + Math.max(0, acquired),
    };
  });

  let moyenneEauSurface = 0;
  for (let i = 0; i < nCells; i++) moyenneEauSurface += waterMm[i * nH] ?? 0;
  moyenneEauSurface /= nCells;
  const boisMortTHa = state.carbon.deadWoodKgC / 1000 / (nCells / 10_000);
  const { ressource, habitat, abriHivernal } = carteBiotique(
    nextTrees,
    herbeCouverture,
    boisMortTHa,
    dims,
  );

  // ── 5 bis. Phénologie fruitière (docs/regles.md §7.2) ─────────────────────
  // Degrés-jours base 5 °C depuis le 1er janvier ; floraison quand le cumul
  // franchit le seuil de l'espèce, gel tardif fatal aux fleurs ouvertes,
  // croissance du fruit au rythme de la loi du minimum, récolte à la semaine
  // de l'espèce — non récoltée, elle est perdue (§10).
  const ddPrev = week === 0 ? 0 : state.ddYearBase5;
  const ddYearBase5 = ddPrev + Math.max(0, weather.tMean - 5) * 7;
  // Le froid se compte à partir de l'automne et sert au printemps suivant : on
  // remet le compteur à zéro en entrant dans l'automne, pas au 1ᵉʳ janvier.
  const semainesDeFroid =
    (week === DEBUT_COMPTAGE_FROID ? 0 : state.semainesDeFroid) +
    (semaineDeFroid(weather.tMean) ? 1 : 0);
  nextTrees = nextTrees.map((tree, t) => {
    const espece = getEspece(tree.especeId);
    const fruits = espece.fruits;
    if (!fruits) return tree;
    let { fruitsKg, fruitProgress, bloomFrosted } = tree;
    if (week === 0) {
      fruitProgress = 0;
      bloomFrosted = false;
      fruitsKg = 0; // les fruits de l'an passé sont perdus depuis longtemps
    }
    const mature = tree.alive && tree.ageWeeks >= espece.regeneration.maturiteAns * 52;
    if (mature) {
      const bloomEnd = fruits.floraisonDJ + 100;
      // Fenêtre de floraison : gel fatal aux fleurs ouvertes (atlas : abricotier).
      if (
        ddPrev < bloomEnd &&
        ddYearBase5 >= fruits.floraisonDJ &&
        weather.tMinAbsC <= fruits.gelFatalC
      ) {
        bloomFrosted = true;
      }
      // Croissance du fruit : au rythme du facteur limitant de la semaine.
      if (ddYearBase5 >= bloomEnd && week < fruits.recolteWeek && !bloomFrosted) {
        fruitProgress = Math.min(
          1,
          fruitProgress + (limitingFactors[t] ?? 0) / fruits.croissanceSem,
        );
      }
      if (week === fruits.recolteWeek) {
        // Pollinisation (§7.5, version espèce en attendant les variétés) : un
        // auto-stérile sans congénère mature à moins de 30 m produit très peu.
        let pollinated = fruits.autofertile;
        if (!pollinated) {
          for (const other of nextTrees) {
            if (other.id === tree.id || !other.alive || other.especeId !== tree.especeId) continue;
            if (other.ageWeeks < espece.regeneration.maturiteAns * 52) continue;
            const dx = other.x - tree.x;
            const dy = other.y - tree.y;
            if (dx * dx + dy * dy <= 30 * 30) {
              pollinated = true;
              break;
            }
          }
        }
        const sizeFactor = Math.min(1, (tree.heightM / (0.7 * espece.hauteurMaxM)) ** 2);
        // Service de pollinisation (§7.4, critère G4) : trouver un congénère ne
        // suffit pas, encore faut-il quelqu'un pour porter le pollen. Les
        // insectes qui le font vivent du même habitat que les auxiliaires —
        // des fleurs étalées dans l'année, des strates, un sol non nu. Un
        // verger nu dans une plaine nue perd une bonne part de sa nouaison ;
        // il n'en perd jamais la totalité (vent, abeilles domestiques).
        const cellArbre = cellIndexAt(dims, tree.x, tree.y);
        const servicePollinisation = 0.35 + 0.65 * Math.min(1, habitat[cellArbre] ?? 0);
        fruitsKg =
          fruits.rendementMaxKg *
          sizeFactor *
          fruitProgress *
          (bloomFrosted ? 0 : 1) *
          (pollinated ? 1 : 0.2) *
          servicePollinisation;
      }
      if (week === fruits.recolteWeek + fruits.fenetreRecolteWeeks) {
        fruitsKg = 0; // récolte non faite = perdue (§10)
      }
    }
    if (
      fruitsKg === tree.fruitsKg &&
      fruitProgress === tree.fruitProgress &&
      bloomFrosted === tree.bloomFrosted
    ) {
      return tree;
    }
    return { ...tree, fruitsKg, fruitProgress, bloomFrosted };
  });

  // ── 5 ter. Le gibier (§7.4, ch4-C) ────────────────────────────────────────
  // Les rameaux de l'année lignifient peu à peu ; ce qui reste tendre est ce
  // que le chevreuil mange. La pression vient du paysage, se répartit sur les
  // cellules selon ce qu'elles offrent, et se prélève arbre par arbre.
  nextTrees = nextTrees.map((tree, t) => {
    const pousse = Math.max(0, tree.heightM - (trees[t]?.heightM ?? tree.heightM));
    const tendre = (tree.pousseTendreM + pousse) * (1 - LIGNIFICATION_PAR_SEMAINE);
    return tendre === tree.pousseTendreM ? tree : { ...tree, pousseTendreM: tendre };
  });
  let broutageAzoteG = 0;
  const couvertArbore = new Array<number>(nCells);
  for (let i = 0; i < nCells; i++) couvertArbore[i] = 1 - (groundLight[i] ?? 1);
  const broutage = brouter(
    nextTrees,
    herbeCouverture,
    couvertArbore,
    station.coteM,
    station.gibierParHa * state.pressionGibier,
    saisonHerbe,
    state.soil.cloture,
  );
  // Frottis : les brocards s'en prennent aux tiges qui ont passé la hauteur de
  // dent — ce n'est pas de la faim, c'est du marquage (gibier.ts).
  const frottis = frottisDeLaSemaine(
    nextTrees,
    station.gibierParHa * state.pressionGibier,
    (nCells * 1) / 10_000,
    week,
    state.week,
    (especeId) => getEspece(especeId).feu.resistanceEcorce,
    (tree) => {
      const cell = Math.floor(tree.y) * station.coteM + Math.floor(tree.x);
      return state.soil.cloture[cell] === true;
    },
  );
  // Ce que le gibier a fait, arbre par arbre : le rendu montre l'écorce
  // arrachée et la pousse mangée la semaine où ça arrive, pas plus tard.
  const gestes: GesteVisible[] = [];
  if (frottis.length > 0) gestes.push({ type: "frotter", ids: frottis.map((f) => f.treeId) });
  if (broutage.parArbre.size > 0)
    gestes.push({ type: "brouter", ids: [...broutage.parArbre.keys()] });
  if (frottis.length > 0) {
    const parId = new Map(frottis.map((f) => [f.treeId, f]));
    nextTrees = nextTrees.map((tree) => {
      const degat = parId.get(tree.id);
      if (!degat) return tree;
      if (degat.mort) return { ...tree, alive: false, causeMort: "frottis" as const };
      const stress = tree.stress + FROTTIS_DEGAT;
      const marque = { ...tree, frotteSemaine: state.week };
      if (stress < STRESS_LETHAL) return { ...marque, stress };
      return { ...marque, stress, alive: false, causeMort: "frottis" as const };
    });
  }

  if (broutage.preleveKg > 0) {
    for (let i = 0; i < nCells; i++) {
      const consommee = broutage.parCellule[i]?.herbeConsommee ?? 0;
      if (consommee > 0) herbeCouverture[i] = Math.max(0, (herbeCouverture[i] ?? 0) - consommee);
    }
    nextTrees = nextTrees.map((tree) => {
      const degat = broutage.parArbre.get(tree.id);
      if (!degat) return tree;
      if (degat.mort) {
        return { ...tree, alive: false, causeMort: "abroutissement" as const };
      }
      const espece = getEspece(tree.especeId);
      const hauteur = Math.max(0.05, tree.heightM - degat.pousseMangeeM);
      // Le carbone mangé ne s'évapore pas : il part en respiration du gibier,
      // et ce qui n'est pas digéré revient au sol en déjections.
      const mangeKgC = treeTotalCarbonKg(espece, tree.heightM) - treeTotalCarbonKg(espece, hauteur);
      // L'azote suit le même chemin : ce qui partait dans le rameau quitte
      // l'arbre et revient au sol. L'herbivore ne détruit rien, il déplace.
      const cell = Math.floor(tree.y) * station.coteM + Math.floor(tree.x);
      const dansLaParcelle = cell >= 0 && cell < nCells;
      const partMangee =
        tree.pousseTendreM > 0 ? Math.min(1, degat.pousseMangeeM / tree.pousseTendreM) : 0;
      // Rien ne sort du bilan : si la cellule est hors grille, l'azote reste
      // dans l'arbre plutôt que de s'évaporer de la comptabilité.
      const azoteRenduG = dansLaParcelle ? tree.uptakeYearG * partMangee : 0;
      if (dansLaParcelle) {
        // Les déjections tombent là où le gibier broute, pas « sur la parcelle » :
        // un herbivore CONCENTRE la fertilité, il ne l'étale pas.
        if (mangeKgC > 0)
          litterCG[cell] = (litterCG[cell] ?? 0) + mangeKgC * (1 - DIGESTIBILITE) * 1000;
        if (azoteRenduG > 0) {
          broutageAzoteG += azoteRenduG;
          const oldN = litterNG[cell] ?? 0;
          litterK[cell] =
            (oldN * (litterK[cell] ?? 0) + azoteRenduG * litterDecayRate(15)) /
            (oldN + azoteRenduG);
          litterNG[cell] = oldN + azoteRenduG;
        }
      }
      if (mangeKgC > 0) emittedG += mangeKgC * DIGESTIBILITE * 1000;
      return {
        ...tree,
        heightM: hauteur,
        pousseTendreM: Math.max(0, tree.pousseTendreM - degat.pousseMangeeM),
        uptakeYearG: tree.uptakeYearG - azoteRenduG,
      };
    });
  }

  // ── 5 ter bis. Réseaux mycorhiziens (§7.5) ────────────────────────────────
  // Ils suivent les hôtes compatibles, très lentement : c'est ce qui fait
  // qu'un sol forestier ancien n'a rien à voir avec un labour de l'an dernier.
  const mycorhizes = {
    ecto: state.soil.mycorhizes.ecto.slice(),
    arbusculaire: state.soil.mycorhizes.arbusculaire.slice(),
    ericoide: state.soil.mycorhizes.ericoide.slice(),
  };
  let mycoSum = 0;
  for (const type of TYPES_MYCORHIZE) {
    const cible = cibleReseau(nextTrees, type, dims);
    const reseau = mycorhizes[type];
    for (let i = 0; i < nCells; i++) {
      reseau[i] = prochainReseau(reseau[i] ?? 0, cible[i] ?? 0);
      mycoSum += reseau[i] ?? 0;
    }
  }

  // ── 5 quater. Ravageurs et auxiliaires (§7.4) ────────────────────────────
  // Les ravageurs prospèrent sur les hôtes sensibles ET affaiblis ; les
  // auxiliaires les freinent à hauteur de ce que l'habitat local leur offre.
  const chaleur = facteurChaleur(weather.tMean);
  let ravageurs = state.soil.ravageurs.slice();
  let ravageurSum = 0;
  let habitatSum = 0;
  for (let i = 0; i < nCells; i++) {
    ravageurs[i] = prochainePression(
      ravageurs[i] ?? 0,
      ressource[i] ?? 0,
      habitat[i] ?? 0,
      chaleur,
      abriHivernal[i] ?? 0,
    );
    habitatSum += habitat[i] ?? 0;
  }
  ravageurs = Array.from(disperser(Float64Array.from(ravageurs), dims));
  for (let i = 0; i < nCells; i++) ravageurSum += ravageurs[i] ?? 0;

  nextTrees = nextTrees.map((tree) => {
    if (!tree.alive) return tree;
    const espece = getEspece(tree.especeId);
    const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio);
    let somme = 0;
    let n = 0;
    forEachDiscCell(dims, tree.x, tree.y, r, (i) => {
      somme += ravageurs[i] ?? 0;
      n++;
    });
    const degats = degatsSurArbre(tree, n > 0 ? somme / n : 0);
    if (degats <= 0) return tree;
    const stress = tree.stress + degats;
    if (stress < STRESS_LETHAL) return { ...tree, stress };
    return { ...tree, stress, alive: false, causeMort: "ravageurs" as const };
  });

  // ── 5 quinquies. Maladies (§7.4) ──────────────────────────────────────────
  // Une épidémie installée dans le pays frappe d'autant plus fort que les
  // hôtes sont serrés et que l'été est humide. C'est ce qui fait de la
  // diversification une assurance, et pas une bonne intention.
  const maladies = maladiesActives(weather.annee ?? 2026);
  if (maladies.length > 0) {
    const humiditeSurface = ruSurface > 0 ? moyenneEauSurface / ruSurface : 0;
    nextTrees = nextTrees.map((tree) => {
      if (!tree.alive) return tree;
      const maladie = maladies.find((m) => m.especeId === tree.especeId);
      if (!maladie) return tree;
      let voisins = 0;
      for (const autre of nextTrees) {
        if (autre.id === tree.id || !autre.alive || autre.especeId !== tree.especeId) continue;
        const dx = autre.x - tree.x;
        const dy = autre.y - tree.y;
        if (dx * dx + dy * dy <= RAYON_INOCULUM_M * RAYON_INOCULUM_M) voisins++;
      }
      const degats =
        maladie.virulence *
        pressionMaladie(maladie, voisins, humiditeSurface) *
        getEspece(tree.especeId).ravageurs.sensibilite;
      if (degats <= 0) return tree;
      const stress = tree.stress + degats;
      if (stress < STRESS_LETHAL) return { ...tree, stress };
      return { ...tree, stress, alive: false, causeMort: "maladie" as const };
    });
  }

  // ── 6. Retours de litière : chute des feuilles + arbres morts ─────────────
  // Les déjections du gibier sont un retour de litière comme un autre : c'est
  // de l'azote qui quitte les arbres pour revenir au sol.
  let litterfallSumG = broutageAzoteG;
  let fixationSumG = 0;
  let leafNppKgC = 0; // le feuillage tombé a été produit dans l'année (NPP feuilles)
  const depositLitter = (tree: TreeState, amountG: number) => {
    if (amountG <= 0) return;
    const espece = getEspece(tree.especeId);
    const crownR = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio);
    let n = 0;
    forEachDiscCell(dims, tree.x, tree.y, crownR, () => {
      n++;
    });
    const share = amountG / n;
    const shareC = share * espece.litiere.cnRatio;
    const kSpecies = litterDecayRate(espece.litiere.cnRatio);
    forEachDiscCell(dims, tree.x, tree.y, crownR, (i) => {
      const oldN = litterNG[i] ?? 0;
      litterK[i] = (oldN * (litterK[i] ?? 0) + share * kSpecies) / (oldN + share);
      litterNG[i] = oldN + share;
      litterCG[i] = (litterCG[i] ?? 0) + shareC;
      // Le phosphore de la feuille rentre au sol avec elle. On le rend
      // disponible dès la chute plutôt que d'ouvrir un pool « P de litière » :
      // une approximation d'un pas de temps, sur un élément qui de toute façon
      // ne bouge pas d'un millimètre.
      phosphoreG[i] =
        (phosphoreG[i] ?? 0) + share * RATIO_P_SUR_N * (RETOUR_LITIERE_P / LITTER_RETURN_FRACTION);
      // Le POTASSIUM revient tout de suite : ce n'est qu'un ion, la pluie le
      // rince de la feuille avant même qu'elle ait fini de se décomposer. Le
      // phosphore, lui, est dans les molécules — il attend la décomposition,
      // et revient donc plus haut, au rythme de la minéralisation.
      potassiumG[i] =
        (potassiumG[i] ?? 0) + share * RATIO_K_SUR_N * (RETOUR_LITIERE_K / LITTER_RETURN_FRACTION);
    });
    leafNppKgC += (amountG * espece.litiere.cnRatio) / 1000;
    if (espece.azote.fixateur) fixationSumG += amountG;
    else litterfallSumG += amountG;
  };

  // La chute des feuilles s'étale sur un mois au lieu de tomber en une
  // semaine : chaque arbre lâche ce que sa propre sénescence lui a fait
  // perdre depuis la semaine précédente (phenologie.ts). Un frêne, qui part
  // tard, garde donc ses feuilles plus longtemps qu'un bouleau.
  nextTrees = nextTrees.map((tree) => {
    if (!tree.alive || tree.uptakeYearG <= 0) return tree;
    const espece = getEspece(tree.especeId);
    if (!espece.lumiere.caduc) return tree;
    const restant = partFoliaireActiveDans(espece, pheno);
    // La même semaine, un cran plus tôt dans la chute : l'écart entre les deux
    // est ce que l'arbre a lâché. Le besoin de froid ne compte pas ici — la
    // branche d'automne de `partFoliaireActive` ne le regarde pas.
    const restantAvant = partFoliaireActiveDans(espece, {
      ...pheno,
      semainesDepuisSenescence: Math.max(0, pheno.semainesDepuisSenescence - 1),
      semainesDeFroid: Number.POSITIVE_INFINITY,
    });
    const tombe = Math.max(0, restantAvant - restant);
    if (tombe <= 0) return tree;
    const part = Math.min(1, tombe / Math.max(1e-9, restantAvant));
    const azote = part * tree.uptakeYearG;
    depositLitter(tree, LITTER_RETURN_FRACTION * azote);
    return { ...tree, uptakeYearG: tree.uptakeYearG - azote };
  });
  // Filet de sécurité : ce qu'un arbre n'a pas lâché avant la fin de l'année
  // tombe quand même, sinon son azote resterait dans un feuillage qui n'existe
  // plus et le bilan azoté ne boucler ait pas.
  if (week === DERNIERE_SEMAINE) {
    nextTrees = nextTrees.map((tree) => {
      if (!tree.alive || tree.uptakeYearG <= 0) return tree;
      if (!getEspece(tree.especeId).lumiere.caduc) return tree;
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      return { ...tree, uptakeYearG: 0 };
    });
  }

  // Les morts de la semaine rendent leur azote de l'année, leur carbone part
  // au pool de bois mort, et ils quittent la carte.
  let deadWoodKgC = state.carbon.deadWoodKgC;
  const boisAuSolCG = state.soil.boisAuSolCG.slice();
  // Le hasard est disponible dès ici parce qu'une chandelle qui s'abat tombe
  // dans une direction. Tant qu'aucune ne tombe, aucun tirage n'est consommé
  // et la suite de la semaine voit exactement les mêmes nombres qu'avant.
  let rng = state.rng;
  const chutes: ChuteDeChandelle[] = [];
  const survivors: TreeState[] = [];
  const morts: MortDeLaSemaine[] = [];
  for (const tree of nextTrees) {
    if (tree.alive) {
      survivors.push(tree);
      continue;
    }
    if (
      tree.brulEeSemaine !== undefined &&
      state.week - tree.brulEeSemaine < CHABLIS_RECUPERABLE_SEMAINES
    ) {
      // Sur pied et encore commercialisable : on le garde tel quel, le temps
      // que le joueur décide d'aller le chercher.
      survivors.push(tree);
      continue;
    }
    if (tree.mortSemaine === undefined) {
      // Il vient de mourir : sa litière tombe et son bois rejoint le pool de
      // bois mort. Ce transfert n'a lieu qu'UNE fois — ensuite l'arbre reste
      // en jeu comme chandelle, sans plus rien à donner.
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      deadWoodKgC += treeTotalCarbonKg(getEspece(tree.especeId), tree.heightM);
      morts.push({
        id: tree.id,
        x: tree.x,
        y: tree.y,
        especeId: tree.especeId,
        cause: tree.causeMort ?? "secheresse",
        heightM: tree.heightM,
      });
      survivors.push({ ...tree, mortSemaine: state.week });
      continue;
    }
    // Chandelle : un tronc mort tient debout des années avant de s'abattre.
    // Elle ne fait pas d'ombre (les morts sont ignorés du calcul de lumière)
    // mais elle occupe la place et sert d'habitat (trees.ts, biodiversite.ts).
    if (state.week - tree.mortSemaine < dureeChandelleSemaines(getEspece(tree.especeId))) {
      survivors.push(tree);
      continue;
    }
    // Elle s'abat. Elle ne s'évapore pas : son bois se couche sur les cellules
    // qu'il recouvre, dans une direction que la pente oriente (boisMort.ts).
    const chute = directionDeChute(altitudes, dims, tree.x, tree.y, rng);
    rng = chute.rng;
    const empreinte = empreinteDeChute(tree.x, tree.y, tree.heightM, chute.radians, dims);
    const longueurTotale = empreinte.reduce((somme, c) => somme + c.longueurM, 0);
    if (longueurTotale <= 0) continue;
    // Ce qu'il reste de son bois après des années à sécher debout. Le pool des
    // chandelles ne sait pas ce qui appartient à qui : on estime la part de cet
    // arbre par sa décroissance, en la bornant au pool pour que le carbone ne
    // puisse pas être compté deux fois.
    const anneesDebout = (state.week - tree.mortSemaine) / 52;
    const restantKgC = Math.min(
      Math.max(0, deadWoodKgC),
      treeTotalCarbonKg(getEspece(tree.especeId), tree.heightM) *
        Math.exp(-DEADWOOD_DECAY_PER_YEAR * anneesDebout),
    );
    deadWoodKgC -= restantKgC;
    // Le bout de tronc qui dépasse la limite est déposé quand même, réparti sur
    // les cellules du dedans : on ne fait pas disparaître du carbone au prétexte
    // qu'un arbre avait poussé au bord.
    for (const c of empreinte) {
      boisAuSolCG[c.cellule] =
        (boisAuSolCG[c.cellule] ?? 0) + restantKgC * (c.longueurM / longueurTotale) * 1000;
    }
    chutes.push({
      id: tree.id,
      x: tree.x,
      y: tree.y,
      especeId: tree.especeId,
      heightM: tree.heightM,
      directionRad: chute.radians,
      masseKgC: restantKgC,
      empreinte,
    });
  }
  nextTrees = survivors;

  // Ce qui poussait sous le tronc. La règle est celle de la masse : ce qui
  // reçoit plus lourd que soi casse (boisMort.ts). Un semis disparaît sous
  // n'importe quel tronc, un arbre fait encaisse. Le bois de l'écrasé rejoint
  // le sol là où il gisait, pas le pool des chandelles : il est déjà couché.
  if (chutes.length > 0) {
    const massePosee = new Map<number, number>();
    for (const chute of chutes) {
      const longueur = chute.empreinte.reduce((somme, c) => somme + c.longueurM, 0);
      for (const c of chute.empreinte) {
        const part = chute.masseKgC * (c.longueurM / longueur);
        massePosee.set(c.cellule, Math.max(massePosee.get(c.cellule) ?? 0, part));
      }
    }
    const debout: TreeState[] = [];
    for (const tree of nextTrees) {
      const cellule = cellIndexAt(dims, tree.x, tree.y);
      const recu = massePosee.get(cellule);
      const espece = getEspece(tree.especeId);
      const masse = treeTotalCarbonKg(espece, tree.heightM);
      if (!tree.alive || recu === undefined || !ecrasePar(recu, masse)) {
        debout.push(tree);
        continue;
      }
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      boisAuSolCG[cellule] = (boisAuSolCG[cellule] ?? 0) + masse * 1000;
      morts.push({
        id: tree.id,
        x: tree.x,
        y: tree.y,
        especeId: tree.especeId,
        cause: "ecrasement",
        heightM: tree.heightM,
      });
    }
    nextTrees = debout;
  }

  // Le bois mort se décompose : une part s'humifie, le reste part en CO2.
  const meanClimate = climateSum / nCells;
  const deadDecayKgC = deadWoodKgC * ((DEADWOOD_DECAY_PER_YEAR / 52) * meanClimate);
  deadWoodKgC -= deadDecayKgC;
  const humifiedPerCellG = (deadDecayKgC * DEADWOOD_HUMIFICATION * 1000) / nCells;
  for (let i = 0; i < nCells; i++) humusCG[i] = (humusCG[i] ?? 0) + humifiedPerCellG;
  emittedG += deadDecayKgC * (1 - DEADWOOD_HUMIFICATION) * 1000;
  // Le bois couché se décompose plus vite que le bois debout, et il fait son
  // humus SUR PLACE : c'est là toute la différence avec le pool de parcelle.
  for (let i = 0; i < nCells; i++) {
    const stock = boisAuSolCG[i] ?? 0;
    if (stock <= 0) continue;
    const decompose = stock * ((DECOMPOSITION_AU_SOL_PAR_AN / 52) * meanClimate);
    boisAuSolCG[i] = stock - decompose;
    humusCG[i] = (humusCG[i] ?? 0) + decompose * DEADWOOD_HUMIFICATION;
    emittedG += decompose * (1 - DEADWOOD_HUMIFICATION);
  }

  // ── 6 bis. Le feu (§7.4, ch5) ─────────────────────────────────────────────
  // Il ne part que si la saison, la sécheresse et le combustible s'alignent,
  // puis se propage là où il trouve à brûler — d'où l'intérêt des coupures.
  let incendie: TickResult["incendie"];
  let carboneFeuKgC = 0;
  {
    let secheresseSum = 0;
    for (let i = 0; i < nCells; i++) secheresseSum += (waterMm[i * nH] ?? 0) / ruSurface;
    const charge = chargeCombustible(
      nextTrees,
      herbeBiomasse,
      litterCG,
      station.coteM,
      groundLight,
      boisAuSolCG,
    );
    const depart = departDeFeu(
      rng,
      week,
      secheresseSum / nCells,
      weather.tMax,
      charge,
      station.ventExposition,
      station.coteM,
      frequentationDesBordures(station.bordures),
    );
    rng = depart.rng;
    if (depart.origine !== undefined) {
      const propagation = propager(depart.origine, charge, station.coteM, rng);
      rng = propagation.rng;
      const brulees = propagation.brulees;
      let tues = 0;
      let rejets = 0;
      const apresFeu: TreeState[] = [];
      for (const tree of nextTrees) {
        const cellule =
          Math.min(station.coteM - 1, Math.max(0, Math.floor(tree.y))) * station.coteM +
          Math.min(station.coteM - 1, Math.max(0, Math.floor(tree.x)));
        if (!brulees.has(cellule)) {
          apresFeu.push(tree);
          continue;
        }
        // L'intensité suit le combustible local.
        const intensite = Math.min(1, (charge.parCellule[cellule] ?? 0) / 1.2);
        const espece = getEspece(tree.especeId);
        if (survitAuFeu(tree, intensite)) {
          apresFeu.push(tree);
          continue;
        }
        tues++;
        if (espece.feu.rejetteApresFeu && tree.heightM > 0.6) {
          // Rejet de souche : l'arbre repart d'en bas, avec ses racines
          // intactes — c'est ce qui fait des pyrophytes des gagnants du feu.
          rejets++;
          // La partie aérienne a brûlé, la souche repart.
          carboneFeuKgC += treeAboveCarbonKg(espece, tree.heightM);
          apresFeu.push({
            ...tree,
            heightM: 0.4,
            stress: 0,
            fruitsKg: 0,
            fruitProgress: 0,
            uptakeYearG: 0,
            hauteurElagueeM: 0,
            pousseTendreM: 0,
            vigueur: 1,
            dommageHydraulique: 0,
            protege: false,
          });
        } else {
          // Arbre tué mais toujours debout : récupérable en coupe sanitaire
          // pendant quelques mois (§7.4). Son carbone n'est pas encore parti.
          apresFeu.push({ ...tree, alive: false, causeMort: "feu", brulEeSemaine: state.week });
        }
      }
      nextTrees = apresFeu;
      // Le feu consume la strate herbacée et la litière des cellules touchées.
      for (const i of brulees) {
        herbeCouverture[i] = 0;
        herbeBiomasse[i] = 0;
        carboneFeuKgC += (litterCG[i] ?? 0) / 1000;
        litterCG[i] = 0;
        // L'azote de la litière part en fumée pour l'essentiel ; le reste
        // reste en cendres, immédiatement disponible.
        mineralNG[i] = (mineralNG[i] ?? 0) + (litterNG[i] ?? 0) * 0.2;
        litterNG[i] = 0;
      }
      const areaHa = (station.coteM * station.coteM) / 10_000;
      // Le front, reconstitué APRÈS coup : aucun tirage, aucun changement au
      // parcours ni au résultat (feu.ts). Rangées par rang d'arrivée, les
      // cellules se découpent en tranches — la ligne de flammes du rendu.
      const rangs = rangsDuFront(brulees, depart.origine, station.coteM);
      const ordonnees = [...rangs].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      incendie = {
        cellulesBrulees: brulees.size,
        arbresTues: tues,
        rejets,
        carboneTHa: carboneFeuKgC / 1000 / areaHa,
        origine: depart.origine,
        brulees: Int32Array.from(ordonnees, ([cellule]) => cellule),
        rangs: Int32Array.from(ordonnees, ([, rang]) => rang),
      };
    }
  }

  // ── 7. Régénération annuelle (semis de la parcelle + du voisinage) ────────
  let nextTreeId = state.nextTreeId;
  if (week === RECRUITMENT_WEEK) {
    const recruitment = yearlyRecruitment({
      trees: nextTrees,
      rng,
      coteM: station.coteM,
      voisinage: station.voisinage,
      partOmbrageante: partOmbrageanteDe,
      ph: state.soil.ph,
      lumiereAuSol: groundLight,
      nextTreeId,
    });
    // Le carbone des recrues vient d'ailleurs : de la graine, produite par un
    // parent hors parcelle ou par les réserves d'un parent qu'on ne débite
    // pas. C'est donc une ENTRÉE, au même titre qu'un plant acheté — sans quoi
    // le bilan carbone fabrique de la matière à chaque printemps.
    for (const recrue of recruitment.newTrees) {
      importedPlantsKgC += treeTotalCarbonKg(getEspece(recrue.especeId), recrue.heightM);
    }
    nextTrees = [...nextTrees, ...recruitment.newTrees];
    rng = recruitment.rng;
    nextTreeId = recruitment.nextTreeId;
  }

  return {
    state: {
      ...state,
      week: state.week + 1,
      soil: {
        waterMm,
        excessMm,
        boisAuSolCG,
        mineralNG,
        litterNG,
        litterCG,
        humusCG,
        ph: state.soil.ph,
        cloture: state.soil.cloture,
        nappeMm: nappeStockMm,
        epaisseurPerdueCm,
        // Le réseau régional suit la parcelle à proportion de ce que le bassin
        // partage avec elle : c'est ainsi qu'un incendie de MASSIF se
        // distingue d'un incendie de parcelle (nappe.ts).
        nappeRegionaleMm: nouveauNiveauRegionalMm(
          state.soil.nappeRegionaleMm,
          nappeStockMm.reduce((a, b) => a + b, 0) / nCells,
          station.partBassinSemblable ?? 0,
          nappeRegionaleDepart,
          station.profil,
        ),
        phosphoreG,
        phosphoreFixeG,
        potassiumG,
        potassiumReserveG,
        litterK,
        herbeCouverture,
        herbeBiomasse,
        herbeHumidite,
        ravageurs,
        mycorhizes,
      },
      trees: nextTrees,
      ddYearBase5,
      semainesDeFroid,
      // Le vide laissé par la chasse se comble : les voisins arrivent.
      pressionGibier: state.pressionGibier + (1 - state.pressionGibier) * RETOUR_IMMIGRATION,
      carbon: {
        ...state.carbon,
        deadWoodKgC,
        nppCumKgC: state.carbon.nppCumKgC + nppKgC + leafNppKgC,
        importedPlantsCumKgC: state.carbon.importedPlantsCumKgC + importedPlantsKgC,
        emittedCumKgC: state.carbon.emittedCumKgC + emittedG / 1000 + carboneFeuKgC,
        erosionCumKgC:
          state.carbon.erosionCumKgC + (erosionSortieHumusCG + erosionSortieLitiereCG) / 1000,
      },
      rng,
      nextTreeId,
    },
    morts,
    chutes,
    incendie,
    gestes,
    // Grandeurs de la semaine, calculées ici et jusqu'ici jetées : elles ne
    // sont pas de l'état (la semaine suivante les recalcule), mais sans elles
    // le rendu n'a ni crue, ni sous-bois sombre, ni tache de lumière.
    debordementParCellule: Float32Array.from(debordementParCellule),
    lumiereAuSol: Float32Array.from(groundLight),
    fluxes: {
      rainMm: weather.rainMm,
      etpMm,
      evapMm: evapSum / nCells,
      nappeMm: remonteeNappeMm / nCells,
      vidangeNappeMm: vidangeNappeMm / nCells,
      apportRegionalMm: apportRegionalMm / nCells,
      apportEauLibreMm: apportEauLibreMm / nCells,
      nappeProfondeurCm:
        nappeStockMm.reduce((a, b) => a + profondeurPourStock(b, station.profil), 0) / nCells,
      transpirationMm: transpirationSumL / nCells,
      drainageMm: drainageSum / nCells,
      overflowMm: overflowSum / nCells,
      waterloggingMean: waterloggingSum / nCells,
      ruissellementEntrantMm: ruissellementEntrantMm / nCells,
      ruissellementSortantMm: ruissellementSortantMm / nCells,
      partInondee: cellulesInondees / nCells,
      erosionArracheeKgM2: erosionArracheeKg / nCells,
      erosionSortieKgM2: erosionSortieKg / nCells,
      erosionNKgHa: ((erosionSortieNminG + erosionSortieNlitG) / nCells) * 10,
      erosionPKgHa: (erosionSortiePG / nCells) * 10,
      erosionKKgHa: (erosionSortieKG / nCells) * 10,
      herbeCouvertureMean: herbeSum / nCells,
      broutageKg: broutage.preleveKg,
      depositionKgHa: (depositionSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      ravageurMoyen: ravageurSum / nCells,
      auxiliairesMoyen: habitatSum / nCells,
      mycorhizesMoyen: mycoSum / (nCells * TYPES_MYCORHIZE.length),
      mineralizationKgHa: (mineralizationSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      uptakeKgHa: (uptakeSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      leachedKgHa: (leachedSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      phosphoreMoyenGM2: phosphoreG.reduce((a, b) => a + b, 0) / nCells,
      potassiumMoyenGM2: potassiumG.reduce((a, b) => a + b, 0) / nCells,
      uptakePKgHa: (uptakePSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      uptakeKKgHa: (uptakeKSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      leachedKKgHa: (leachedKSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      litterfallKgHa: (litterfallSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      litterDecayKgHa: (litterDecaySumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      fixationKgHa: (fixationSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
    },
  };
}

/**
 * Hash déterministe de l'état (FNV-1a : grilles de sol en binaire, arbres en
 * JSON). Sert au test de non-régression « même seed + mêmes actions → même partie ».
 */
export function stateHash(state: GameState): number {
  let hash = 0x811c9dc5;
  const mixString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const view = new DataView(new ArrayBuffer(8));
  const mixNumber = (v: number) => {
    view.setFloat64(0, v);
    hash ^= view.getUint32(0);
    hash = Math.imul(hash, 0x01000193);
    hash ^= view.getUint32(4);
    hash = Math.imul(hash, 0x01000193);
  };
  mixNumber(state.week);
  mixNumber(state.ddYearBase5);
  for (const arr of [
    state.soil.waterMm,
    state.soil.excessMm,
    state.soil.mineralNG,
    state.soil.litterNG,
    state.soil.litterCG,
    state.soil.humusCG,
    state.soil.ph,
    state.soil.litterK,
  ]) {
    for (const v of arr) mixNumber(v);
  }
  mixString(JSON.stringify(state.trees));
  mixString(JSON.stringify(state.economy));
  mixString(JSON.stringify(state.carbon));
  mixString(JSON.stringify(state.rng));
  return hash >>> 0;
}
