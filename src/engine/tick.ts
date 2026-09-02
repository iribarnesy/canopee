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
  DEADWOOD_DECAY_PER_YEAR,
  DEADWOOD_HUMIFICATION,
  HUMUS_DECAY_PER_YEAR,
  LITTER_HUMIFICATION,
  treeAboveCarbonKg,
  treeTotalCarbonKg,
} from "./carbon";
import { getEspece } from "./especes";
import { chargeCombustible, departDeFeu, propager, survitAuFeu } from "./feu";
import { cellCount, forEachDiscCell } from "./grid";
import {
  couvertureMax,
  herbeDemandeAzoteG,
  herbeDemandeEauL,
  humiditeVecue,
  prochaineCouverture,
} from "./herbe";
import { computeGroundLight, computeLight, crownRadiusM, windShelterAt } from "./light";
import type { WeekWeather } from "./meteo";
import { weeklyEtpHargreaves } from "./meteo";
import {
  cellLeachedG,
  decompositionClimateFactor,
  litterDecayRate,
  nitrogenAvailabilityFactor,
} from "./nitrogen";
import { yearlyRecruitment } from "./regeneration";
import {
  conductiviteHorizonMmSemaine,
  porositeDrainageMm,
  profondeurPenetrableCm,
  ruHorizonMm,
} from "./soil";
import type { GameState, TickFluxes } from "./state";
import { gridDims, weekOfYear } from "./state";
import type { TreeState } from "./trees";
import {
  fractionsRacinairesParHorizon,
  rootRadiusM,
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
  const etpMm = weeklyEtpHargreaves(station.latitudeDeg, week, weather);
  const potentialG = station.mineralizationPotentialKgHaWeek / G_PER_M2_TO_KG_PER_HA;
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
  }));
  const epaisseurs = profil.map((h) => h.epaisseurCm);
  const solPenetrableCm = profondeurPenetrableCm(profil);
  const ruSurface = horizonsHydro[0]?.ruMm ?? 1;

  const waterMm = state.soil.waterMm.slice();
  const excessMm = state.soil.excessMm.slice();
  const mineralNG = state.soil.mineralNG.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const humusCG = state.soil.humusCG.slice();
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
    const bilan = profilHydro(
      {
        horizons: horizonsHydro,
        eauMm: eauCellule,
        excesMm: excesCellule,
        rainMm: weather.rainMm,
        evapDemandMm:
          etpMm *
          SOIL_EVAP_FRACTION *
          (CANOPY_EVAP_FLOOR + (1 - CANOPY_EVAP_FLOOR) * (groundLight[i] ?? 1)) *
          (1 - MULCH_MAX_EFFECT * Math.min(1, (litterCG[i] ?? 0) / MULCH_FULL_CG)),
        nappeMm: station.remonteeNappeMmSemaine,
        drainageExterneMm: station.drainageExterneMmSemaine,
      },
      bilanOut,
    );
    for (let h = 0; h < nH; h++) {
      waterMm[base + h] = bilan.eauMm[h] ?? 0;
      excessMm[base + h] = bilan.excesMm[h] ?? 0;
      waterlogging[base + h] = bilan.engorgementParHorizon[h] ?? 0;
    }
    drainageMmArr[i] = bilan.drainageMm;
    evapSum += bilan.evapMm;
    nappeSum += bilan.nappeMm;
    drainageSum += bilan.drainageMm;
    overflowSum += bilan.overflowMm;
    waterloggingSum += bilan.engorgementParHorizon[0] ?? 0;

    // La vie du sol se joue en surface : c'est l'horizon 0 qui pilote.
    const moistureRatio = ruSurface > 0 ? (waterMm[base] ?? 0) / ruSurface : 0;
    const climate = decompositionClimateFactor(
      weather.tMean,
      moistureRatio,
      waterlogging[base] ?? 0,
    );
    climateSum += climate;
    const mineralized = potentialG * climate;
    // La litière se décompose selon son C/N (aulne vite, pin lentement, ch2-B) ;
    // son carbone part pour partie en humus (humification), le reste en CO2.
    const decayFraction = Math.min(1, (litterK[i] ?? 0) * climate);
    const decayedN = (litterNG[i] ?? 0) * decayFraction;
    const decayedC = (litterCG[i] ?? 0) * decayFraction;
    litterNG[i] = (litterNG[i] ?? 0) - decayedN;
    litterCG[i] = (litterCG[i] ?? 0) - decayedC;
    humusCG[i] = (humusCG[i] ?? 0) + LITTER_HUMIFICATION * decayedC;
    emittedG += (1 - LITTER_HUMIFICATION) * decayedC;
    const humusLoss = (humusCG[i] ?? 0) * ((HUMUS_DECAY_PER_YEAR / 52) * climate);
    humusCG[i] = (humusCG[i] ?? 0) - humusLoss;
    emittedG += humusLoss;
    mineralNG[i] = (mineralNG[i] ?? 0) + mineralized + decayedN;
    mineralizationSumG += mineralized;
    litterDecaySumG += decayedN;
    availFactor[i] = nitrogenAvailabilityFactor(mineralNG[i] ?? 0);
  }

  // ── 3. Prélèvements eau + azote, en deux passes (ordre-indépendant) ───────
  // L'eau est demandée par (cellule, horizon) selon la distribution verticale
  // des racines de chaque arbre : un semis ne puise qu'en surface, un pivot
  // adulte va chercher l'eau profonde. C'est la complémentarité verticale.
  const nTrees = trees.length;
  const waterDemandL = new Array<number>(nTrees).fill(0);
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
    const rootR = rootRadiusM(espece, tree.heightM);
    const fractions = fractionsRacinairesParHorizon(epaisseurs, tree.rootDepthCm);
    rootFractions[t] = fractions;
    let n = 0;
    let wlSum = 0;
    let phSum = 0;
    forEachDiscCell(dims, tree.x, tree.y, rootR, (i) => {
      n++;
      // L'anoxie ressentie dépend de là où sont les racines : une nappe
      // perchée en profondeur n'asphyxie pas un système superficiel.
      for (let h = 0; h < nH; h++) {
        wlSum += (waterlogging[i * nH + h] ?? 0) * (fractions[h] ?? 0);
      }
      phSum += state.soil.ph[i] ?? 7;
    });
    rootCells[t] = n;
    wlMean[t] = wlSum / n;
    phMean[t] = phSum / n;
    waterDemandL[t] = treeWaterDemandL(
      espece,
      tree.heightM,
      etpMm,
      season,
      light[t] ?? 1,
      station.ventExposition,
      station.ventExposition > 0 ? windShelterAt(trees, tree.x, tree.y, tree.id) : 0,
    );
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
      cellNWanted[i] =
        (cellNWanted[i] ?? 0) + Math.min(needPerCell, capPerCell * (availFactor[i] ?? 0));
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
    const nWanted = cellNWanted[i] ?? 0;
    if (nWanted > 0) {
      const stock = mineralNG[i] ?? 0;
      const taken = Math.min(stock, nWanted);
      nServedRatio[i] = taken / nWanted;
      mineralNG[i] = stock - taken;
      uptakeSumG += taken;
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
      gotN += Math.min(needPerCell, capPerCell * (availFactor[i] ?? 0)) * (nServedRatio[i] ?? 0);
    });
    const wd = waterDemandL[t] ?? 0;
    const nd = nNeedG[t] ?? 0;
    waterSatisfaction[t] = wd > 0 ? Math.min(1, gotW / wd) : 1;
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
  }

  // ── 5. Croissance de chaque arbre — loi du minimum, facteurs locaux ───────
  let nppKgC = 0; // production primaire nette de la semaine (bois + racines)
  const limitingFactors = new Array<number>(nTrees).fill(0);
  let nextTrees: TreeState[] = trees.map((tree, t) => {
    const result = tickTree(tree, {
      waterSatisfaction: waterSatisfaction[t] ?? 1,
      waterloggingRatio: wlMean[t] ?? 0,
      light: light[t] ?? 1,
      nitrogenSatisfaction: nSatisfaction[t] ?? 1,
      phMean: phMean[t] ?? 7,
      solPenetrableCm,
      tMean: weather.tMean,
    });
    const next = result.tree;
    limitingFactors[t] = result.limitingFactor;
    if (tree.alive && next.heightM > tree.heightM) {
      const espece = getEspece(tree.especeId);
      nppKgC += treeTotalCarbonKg(espece, next.heightM) - treeTotalCarbonKg(espece, tree.heightM);
    }
    const acquired = acquiredNG[t] ?? 0;
    return acquired > 0 ? { ...next, uptakeYearG: next.uptakeYearG + acquired } : next;
  });

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
        fruitsKg =
          fruits.rendementMaxKg *
          sizeFactor *
          fruitProgress *
          (bloomFrosted ? 0 : 1) *
          (pollinated ? 1 : 0.2);
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

  // ── 6. Retours de litière : chute des feuilles + arbres morts ─────────────
  let litterfallSumG = 0;
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
    const charge = chargeCombustible(nextTrees, herbeBiomasse, litterCG, station.coteM);
    const depart = departDeFeu(
      rng,
      week,
      secheresseSum / nCells,
      weather.tMax,
      charge,
      station.ventExposition,
      station.coteM,
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
      nextTreeId,
    });
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
        litterK,
        herbeCouverture,
        herbeBiomasse,
        herbeHumidite,
      },
      trees: nextTrees,
      ddYearBase5,
      carbon: {
        ...state.carbon,
        deadWoodKgC,
        nppCumKgC: state.carbon.nppCumKgC + nppKgC + leafNppKgC,
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
      herbeCouvertureMean: herbeSum / nCells,
      mineralizationKgHa: (mineralizationSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      uptakeKgHa: (uptakeSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
      leachedKgHa: (leachedSumG / nCells) * G_PER_M2_TO_KG_PER_HA,
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
