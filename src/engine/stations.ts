/**
 * Stations V0 de développement/test — caricatures contrastées pour éprouver
 * le moteur (sécheresse, engorgement, pauvreté en azote). Les 6 vraies
 * stations françaises documentées (docs/regles.md §2.2) arrivent en V1 avec
 * les données Météo-France/DRIAS.
 */

import type { SyntheticClimate } from "./meteo";
import {
  carboneProfilTHa,
  drainageProfilMmSemaine,
  horizon,
  mineralisationPotentielleKgHaSemaine,
  phSurface,
  porositeProfilMm,
  ruProfilMm,
  type SoilProfile,
} from "./soil";
import type { Station } from "./state";

export interface StationClimat {
  station: Station;
  climat: SyntheticClimate;
}

/**
 * Construit une station à partir de son PROFIL DE SOL : réserve utile,
 * drainage, porosité, minéralisation, carbone et pH sont dérivés de la
 * physique du sol (soil.ts), jamais saisis. C'est ce qui permettra de générer
 * des stations quelconques — critère de réalisme A9.
 */
function stationDepuisProfil(
  base: Omit<
    Station,
    | "ruMm"
    | "excessCapacityMm"
    | "drainagePerWeekMm"
    | "mineralizationPotentialKgHaWeek"
    | "initialSoilCTHa"
    | "phInitial"
  > & { profil: SoilProfile; initialMineralNKgHa: number },
): Station {
  const { profil, ...reste } = base;
  return {
    ...reste,
    profil,
    ruMm: ruProfilMm(profil),
    excessCapacityMm: porositeProfilMm(profil),
    drainagePerWeekMm: Math.min(drainageProfilMmSemaine(profil), reste.drainageExterneMmSemaine),
    mineralizationPotentialKgHaWeek: mineralisationPotentielleKgHaSemaine(profil),
    initialSoilCTHa: carboneProfilTHa(profil),
    phInitial: phSurface(profil),
  };
}

/** Lande sableuse sèche et pauvre (esprit Sud-Gironde) : RU faible, drainage éclair. */
export const LANDE_SECHE: StationClimat = {
  station: stationDepuisProfil({
    id: "lande-seche",
    nom: "Lande sableuse sèche",
    latitudeDeg: 44.5,
    // Podzol landais : un horizon de surface acide, un sable lessivé épais où
    // les racines descendent, puis l'alios induré qui les arrête et fait
    // stagner l'eau l'hiver.
    profil: [
      horizon(20, { sable: 85, limon: 10, argile: 5 }, { moPct: 1.8, ph: 4.5 }),
      horizon(55, { sable: 92, limon: 6, argile: 2 }, { moPct: 0.4, ph: 4.8 }),
      horizon(40, { sable: 88, limon: 8, argile: 4 }, { moPct: 0.3, ph: 5, induration: 0.9 }),
    ],
    initialMineralNKgHa: 15,
    remonteeNappeMmSemaine: 0,
    // Nappe perchée hivernale sur l'alios : l'eau ne part pas vite.
    drainageExterneMmSemaine: 30,
    herbeInitiale: 0.5, // lande rase : callune et molinie couvrent déjà le sol
    ventExposition: 0.85, // lande atlantique rase : le vent balaie tout
    coteM: 100,
    voisinage: [
      { especeId: "pinus_sylvestris", semisParAn: 4 },
      { especeId: "betula_pendula", semisParAn: 3 },
    ],
  }),
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
  station: stationDepuisProfil({
    id: "vallee-engorgee",
    nom: "Fond de vallée engorgé",
    latitudeDeg: 47,
    // Alluvions limono-argileuses profondes : réserve énorme, mais l'argile
    // draine si lentement que l'hiver l'eau stagne.
    profil: [
      horizon(30, { sable: 25, limon: 50, argile: 25 }, { moPct: 3, ph: 6.5 }),
      horizon(55, { sable: 20, limon: 45, argile: 35 }, { moPct: 1.2, ph: 6.6 }),
    ],
    initialMineralNKgHa: 40,
    remonteeNappeMmSemaine: 12,
    // Nappe affleurante : l'exutoire est saturé, rien ne s'évacue.
    drainageExterneMmSemaine: 5,
    herbeInitiale: 0.8, // prairie humide dense
    ventExposition: 0.2, // fond de vallée abrité
    coteM: 100,
    voisinage: [],
  }),
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
  station: stationDepuisProfil({
    id: "limon-riche",
    nom: "Limon profond riche",
    latitudeDeg: 49.5,
    // Limon éolien profond, le sol de référence des plateaux du Nord.
    profil: [
      horizon(35, { sable: 15, limon: 70, argile: 15 }, { moPct: 2.2, ph: 7 }),
      horizon(65, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.8, ph: 7.2 }),
    ],
    initialMineralNKgHa: 60,
    remonteeNappeMmSemaine: 0,
    drainageExterneMmSemaine: Number.POSITIVE_INFINITY, // plateau bien drainé
    herbeInitiale: 0.2, // sortie de culture : le sol se réenherbe
    ventExposition: 0.6, // plateau limoneux ouvert (§2.2)
    coteM: 100,
    voisinage: [],
  }),
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
  station: stationDepuisProfil({
    ...LIMON_RICHE.station,
    id: "limon-pauvre-n",
    nom: "Limon profond pauvre en azote",
    // Même limon, mais matière organique effondrée par des décennies de
    // grande culture (§2.2) : il retient moins l'eau et minéralise peu.
    profil: [
      horizon(30, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.7, ph: 7 }),
      horizon(70, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.4, ph: 7.2 }),
    ],
    initialMineralNKgHa: 5,
  }),
  climat: LIMON_RICHE.climat,
};

/**
 * Friche sur limon moyen, 50 × 50 m : la station du test de succession
 * émergente — on ne plante rien, le paysage voisin colonise.
 */
export const FRICHE_LIMON: StationClimat = {
  station: stationDepuisProfil({
    id: "friche-limon",
    nom: "Friche sur limon (succession)",
    latitudeDeg: 47.5,
    profil: [
      horizon(30, { sable: 25, limon: 60, argile: 15 }, { moPct: 2.5, ph: 6.8 }),
      horizon(50, { sable: 25, limon: 60, argile: 15 }, { moPct: 0.9, ph: 6.9 }),
    ],
    initialMineralNKgHa: 40,
    remonteeNappeMmSemaine: 0,
    drainageExterneMmSemaine: Number.POSITIVE_INFINITY,
    herbeInitiale: 0.9, // friche : l'herbe tient déjà tout le terrain
    ventExposition: 0.4,
    coteM: 50,
    voisinage: [
      { especeId: "betula_pendula", semisParAn: 6 },
      { especeId: "pinus_sylvestris", semisParAn: 3 },
      { especeId: "fagus_sylvatica", semisParAn: 2 },
    ],
  }),
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
