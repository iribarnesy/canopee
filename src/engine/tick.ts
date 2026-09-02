/**
 * Le cœur du moteur : une fonction pure `état + météo → état`, spatialisée.
 * Ordre d'un tick (docs/regles.md §1.1) :
 * météo → lumière (elle pilote la croissance ET la transpiration) → bilan
 * hydrique + minéralisation + décomposition de la litière, par cellule →
 * prélèvements eau/azote par arbre dans SA zone racinaire (deux passes,
 * indépendantes de l'ordre des arbres) → lessivage → croissance des arbres →
 * chute des feuilles (semaine 44) → morts en litière → régénération (sem. 14).
 */

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
import { drainageAvecNappe, profondeurNappeCm, remonteeCapillaireMm } from "./eau_surface";
import { getEspece } from "./especes";
import { chargeCombustible, departDeFeu, propager, survitAuFeu } from "./feu";
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
import { computeGroundLight, computeLight, crownRadiusM, windShelterAt } from "./light";
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
  azoteNetDecomposition,
  cellLeachedG,
  decompositionClimateFactor,
  litterDecayRate,
  nitrogenAvailabilityFactor,
} from "./nitrogen";
import { frequentationDesBordures } from "./paysage";
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
  facteurExpositionRayonnement,
  fractionRuissellement,
  ordreDeDescente,
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
import type { TreeState } from "./trees";
import {
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

/** °C moyenne hebdo au-dessus de laquelle les caducs sont en feuilles (proxy V0). */
const LEAVES_ON_TMEAN_C = 6;
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
const MULCH_FULL_CG = 250;
const G_PER_M2_TO_KG_PER_HA = 10;
/** semaine du recrutement annuel des semis (printemps) */
const RECRUITMENT_WEEK = 14;
/** semaine de la chute des feuilles (automne) */
const LITTERFALL_WEEK = 44;
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

export interface TickResult {
  state: GameState;
  fluxes: TickFluxes;
  /** arbres morts pendant ce tick, avec ce qui les a tués (pour le journal) */
  morts: { especeId: string; cause: string; heightM: number }[];
  /** incendie de la semaine, s'il y en a eu un */
  incendie?: { cellulesBrulees: number; arbresTues: number; rejets: number; carboneTHa: number };
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
  const leavesOn = weather.tMean > LEAVES_ON_TMEAN_C;
  const groundLight = computeGroundLight(trees, dims.widthM, dims.heightM, leavesOn);
  const light = computeLight(trees, leavesOn);

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
  const ruSurfacePourHumus = (humusG: number): number => {
    if (!horizonSurface || humusInitialG <= 0) return ruSurface;
    const rapport = Math.min(3, Math.max(0.2, humusG / humusInitialG));
    return ruHorizonMm({ ...horizonSurface, moPct: horizonSurface.moPct * rapport });
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
  let nappeSum = 0;
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
  const nappeCm = profondeurNappeCm(station.eau, altitudes, dims, station.profil);
  const descente = ordreDeDescente(altitudes);
  const aval = voisineAval(altitudes, dims);
  const partRuisselante = fractionRuissellement(station.relief.pentePct);
  // Ce qui arrive de l'amont : la pluie tombée sur le bassin versant qui verse
  // sur nous, ramenée à la surface de la parcelle.
  const surfaceHaParcelle = nCells / 10_000;
  const apportAmontMm =
    surfaceHaParcelle > 0
      ? (weather.rainMm * RUISSELLEMENT_AMONT * station.relief.bassinAmontHa) / surfaceHaParcelle
      : 0;
  const debordementParCellule = new Array<number>(nCells).fill(0);
  let ruissellementEntrantMm = 0;
  let ruissellementSortantMm = 0;

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
    if (surface) surface.ruMm = ruSurfacePourHumus(humusCG[i] ?? humusInitialG);
    // Ce qui ruisselle ne rentre pas : on le retire de la pluie qui s'infiltre,
    // et il rejoindra l'aval (relief.ts). La couverture du sol et la litière
    // freinent — c'est là que « couvrir le sol » paie en eau.
    const couvertureSol = Math.min(
      1,
      (herbeCouverture[i] ?? 0) + Math.min(0.6, (litterCG[i] ?? 0) / MULCH_FULL_CG),
    );
    const saturationSurface = ruSurface > 0 ? (waterMm[i * nH] ?? 0) / ruSurface : 0;
    const ruissele =
      (weather.rainMm + apportAmontMm) *
      coefficientRuissellement(station.relief.pentePct, couvertureSol, saturationSurface);
    const bilan = profilHydro(
      {
        horizons: horizonsCellule,
        eauMm: eauCellule,
        excesMm: excesCellule,
        rainMm: weather.rainMm + apportAmontMm - ruissele,
        evapDemandMm:
          etpMm *
          SOIL_EVAP_FRACTION *
          (CANOPY_EVAP_FLOOR + (1 - CANOPY_EVAP_FLOOR) * (groundLight[i] ?? 1)) *
          (1 - MULCH_MAX_EFFECT * Math.min(1, (litterCG[i] ?? 0) / MULCH_FULL_CG)),
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
    ruissellementEntrantMm += apportAmontMm;
    // Le débordement, c'est l'eau que la cellule n'a pas pu absorber. Sur du
    // plat elle stagne puis s'en va ; sur une pente, elle RUISSELLE — et c'est
    // elle qu'il faut router, pas l'eau gravitaire déjà infiltrée.
    debordementParCellule[i] = bilan.overflowMm + ruissele;
    evapSum += bilan.evapMm;
    nappeSum += bilan.nappeMm;
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
  for (const i of descente) {
    const disponible = debordementParCellule[i] ?? 0;
    if (disponible <= 0) continue;
    // Ce qui ne ruisselle pas stagne sur place et finit par s'en aller.
    const part = disponible * partRuisselante;
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
    const ruCible = ruSurfacePourHumus(humusCG[j] ?? humusInitialG);
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
    const season = seasonFactor(espece, weather.tMean);
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
  const { ressource, habitat } = carteBiotique(nextTrees, herbeCouverture, boisMortTHa, dims);

  // ── 5 bis. Phénologie fruitière (docs/regles.md §7.2) ─────────────────────
  // Degrés-jours base 5 °C depuis le 1er janvier ; floraison quand le cumul
  // franchit le seuil de l'espèce, gel tardif fatal aux fleurs ouvertes,
  // croissance du fruit au rythme de la loi du minimum, récolte à la semaine
  // de l'espèce — non récoltée, elle est perdue (§10).
  const ddPrev = week === 0 ? 0 : state.ddYearBase5;
  const ddYearBase5 = ddPrev + Math.max(0, weather.tMean - 5) * 7;
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

  if (week === LITTERFALL_WEEK) {
    nextTrees = nextTrees.map((tree) => {
      if (!tree.alive || tree.uptakeYearG <= 0) return tree;
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      return { ...tree, uptakeYearG: 0 };
    });
  }

  // Les morts de la semaine rendent leur azote de l'année, leur carbone part
  // au pool de bois mort, et ils quittent la carte.
  let deadWoodKgC = state.carbon.deadWoodKgC;
  const survivors: TreeState[] = [];
  const morts: { especeId: string; cause: string; heightM: number }[] = [];
  for (const tree of nextTrees) {
    if (tree.alive) {
      survivors.push(tree);
    } else if (
      tree.brulEeSemaine !== undefined &&
      state.week - tree.brulEeSemaine < CHABLIS_RECUPERABLE_SEMAINES
    ) {
      // Sur pied et encore commercialisable : on le garde en jeu.
      survivors.push(tree);
    } else {
      depositLitter(tree, LITTER_RETURN_FRACTION * tree.uptakeYearG);
      deadWoodKgC += treeTotalCarbonKg(getEspece(tree.especeId), tree.heightM);
      morts.push({
        especeId: tree.especeId,
        cause: tree.causeMort ?? "secheresse",
        heightM: tree.heightM,
      });
    }
  }
  nextTrees = survivors;

  // Le bois mort se décompose : une part s'humifie, le reste part en CO2.
  const meanClimate = climateSum / nCells;
  const deadDecayKgC = deadWoodKgC * ((DEADWOOD_DECAY_PER_YEAR / 52) * meanClimate);
  deadWoodKgC -= deadDecayKgC;
  const humifiedPerCellG = (deadDecayKgC * DEADWOOD_HUMIFICATION * 1000) / nCells;
  for (let i = 0; i < nCells; i++) humusCG[i] = (humusCG[i] ?? 0) + humifiedPerCellG;
  emittedG += deadDecayKgC * (1 - DEADWOOD_HUMIFICATION) * 1000;

  // ── 6 bis. Le feu (§7.4, ch5) ─────────────────────────────────────────────
  // Il ne part que si la saison, la sécheresse et le combustible s'alignent,
  // puis se propage là où il trouve à brûler — d'où l'intérêt des coupures.
  let rng = state.rng;
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
      incendie = {
        cellulesBrulees: brulees.size,
        arbresTues: tues,
        rejets,
        carboneTHa: carboneFeuKgC / 1000 / areaHa,
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
      leavesOn,
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
        mineralNG,
        litterNG,
        litterCG,
        humusCG,
        ph: state.soil.ph,
        cloture: state.soil.cloture,
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
      // Le vide laissé par la chasse se comble : les voisins arrivent.
      pressionGibier: state.pressionGibier + (1 - state.pressionGibier) * RETOUR_IMMIGRATION,
      carbon: {
        ...state.carbon,
        deadWoodKgC,
        nppCumKgC: state.carbon.nppCumKgC + nppKgC + leafNppKgC,
        importedPlantsCumKgC: state.carbon.importedPlantsCumKgC + importedPlantsKgC,
        emittedCumKgC: state.carbon.emittedCumKgC + emittedG / 1000 + carboneFeuKgC,
      },
      rng,
      nextTreeId,
    },
    morts,
    incendie,
    fluxes: {
      rainMm: weather.rainMm,
      etpMm,
      evapMm: evapSum / nCells,
      nappeMm: nappeSum / nCells,
      transpirationMm: transpirationSumL / nCells,
      drainageMm: drainageSum / nCells,
      overflowMm: overflowSum / nCells,
      waterloggingMean: waterloggingSum / nCells,
      ruissellementEntrantMm: ruissellementEntrantMm / nCells,
      ruissellementSortantMm: ruissellementSortantMm / nCells,
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
