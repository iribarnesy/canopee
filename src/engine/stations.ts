/**
 * Stations V0 de développement/test — caricatures contrastées pour éprouver
 * le moteur (sécheresse, engorgement, pauvreté en azote). Les 6 vraies
 * stations françaises documentées (docs/regles.md §2.2) arrivent en V1 avec
 * les données Météo-France/DRIAS.
 */

import type { SyntheticClimate } from "./meteo";
import type { Station } from "./state";

export interface StationClimat {
  station: Station;
  climat: SyntheticClimate;
}

/** Lande sableuse sèche et pauvre (esprit Sud-Gironde) : RU faible, drainage éclair. */
export const LANDE_SECHE: StationClimat = {
  station: {
    id: "lande-seche",
    nom: "Lande sableuse sèche",
    latitudeDeg: 44.5,
    ruMm: 60,
    excessCapacityMm: 40,
    drainagePerWeekMm: 80,
    mineralizationPotentialKgHaWeek: 0.6, // sol pauvre : ~20-25 kg N/ha/an effectifs
    initialMineralNKgHa: 15,
    coteM: 100,
    voisinage: [
      { especeId: "pinus_sylvestris", semisParAn: 4 },
      { especeId: "betula_pendula", semisParAn: 3 },
    ],
  },
  climat: {
    tMeanAnnual: 13.5,
    tSeasonalAmplitude: 7.5,
    tDiurnalRange: 11,
    rainAnnualMm: 800,
    rainWinterShare: 0.68,
  },
};

/** Fond de vallée engorgé : sol riche mais drainage très lent → anoxie hivernale. */
export const VALLEE_ENGORGEE: StationClimat = {
  station: {
    id: "vallee-engorgee",
    nom: "Fond de vallée engorgé",
    latitudeDeg: 47,
    ruMm: 140,
    excessCapacityMm: 60,
    drainagePerWeekMm: 4,
    mineralizationPotentialKgHaWeek: 2.5,
    initialMineralNKgHa: 40,
    coteM: 100,
    voisinage: [],
  },
  climat: {
    tMeanAnnual: 12,
    tSeasonalAmplitude: 7,
    tDiurnalRange: 9,
    rainAnnualMm: 1050,
    rainWinterShare: 0.62,
  },
};

/** Limon profond riche : la station confort, aucune contrainte forte. */
export const LIMON_RICHE: StationClimat = {
  station: {
    id: "limon-riche",
    nom: "Limon profond riche",
    latitudeDeg: 49.5,
    ruMm: 180,
    excessCapacityMm: 50,
    drainagePerWeekMm: 35,
    mineralizationPotentialKgHaWeek: 3, // ~110-130 kg N/ha/an effectifs
    initialMineralNKgHa: 60,
    coteM: 100,
    voisinage: [],
  },
  climat: {
    tMeanAnnual: 11.5,
    tSeasonalAmplitude: 7,
    tDiurnalRange: 8,
    rainAnnualMm: 750,
    rainWinterShare: 0.55,
  },
};

/** Même limon, mais appauvri en azote (MO effondrée) : isole le facteur N. */
export const LIMON_PAUVRE_N: StationClimat = {
  station: {
    ...LIMON_RICHE.station,
    id: "limon-pauvre-n",
    nom: "Limon profond pauvre en azote",
    mineralizationPotentialKgHaWeek: 0.25,
    initialMineralNKgHa: 5,
  },
  climat: LIMON_RICHE.climat,
};

/**
 * Friche sur limon moyen, 50 × 50 m : la station du test de succession
 * émergente — on ne plante rien, le paysage voisin colonise.
 */
export const FRICHE_LIMON: StationClimat = {
  station: {
    id: "friche-limon",
    nom: "Friche sur limon (succession)",
    latitudeDeg: 47.5,
    ruMm: 140,
    excessCapacityMm: 50,
    drainagePerWeekMm: 30,
    mineralizationPotentialKgHaWeek: 2.5,
    initialMineralNKgHa: 40,
    coteM: 50,
    voisinage: [
      { especeId: "betula_pendula", semisParAn: 6 },
      { especeId: "pinus_sylvestris", semisParAn: 3 },
      { especeId: "fagus_sylvatica", semisParAn: 2 },
    ],
  },
  climat: {
    tMeanAnnual: 11.5,
    tSeasonalAmplitude: 7,
    tDiurnalRange: 8,
    rainAnnualMm: 850,
    rainWinterShare: 0.55,
  },
};

export const STATIONS_V0: readonly StationClimat[] = [
  LANDE_SECHE,
  VALLEE_ENGORGEE,
  LIMON_RICHE,
  LIMON_PAUVRE_N,
  FRICHE_LIMON,
];
