/**
 * Dérive climatique (docs/regles.md §3 et §15 ; critères D8, D9).
 *
 * Jusqu'ici le moteur réagissait finement au climat… mais le climat ne bougeait
 * pas : on rejouait en boucle soixante ans d'observations. Une partie de
 * cinquante ans se déroulait donc dans le climat du XXᵉ siècle, ce qui est le
 * plus gros contresens qu'un jeu sur les arbres puisse commettre — on plante
 * pour un climat qu'on ne verra pas.
 *
 * Ce module superpose aux observations réelles une **trajectoire GIEC** :
 *  - le réchauffement global suit le scénario choisi (SSP1-2.6, SSP2-4.5,
 *    SSP5-8.5), interpolé entre les points d'ancrage d'AR6 ;
 *  - la France se réchauffe **plus vite que le globe**, et davantage en été
 *    qu'en hiver — c'est ce qui déplace les aires de répartition ;
 *  - les pluies d'été reculent quand les hivers s'arrosent un peu plus ;
 *  - le CO₂ monte, ce qui **stimule la croissance et ferme les stomates**.
 *
 * Ce qui n'est PAS modélisé : l'aggravation propre des extrêmes (vagues de
 * chaleur plus longues que ne le dit la moyenne), les sécheresses de sol
 * pluriannuelles, la variabilité des trajectoires (on prend la médiane).
 * La variabilité vient donc entièrement des observations réelles, décalées.
 */

import type { WeekWeather } from "./meteo";

export type ScenarioId = "ssp126" | "ssp245" | "ssp585" | "stable";

export interface Scenario {
  id: ScenarioId;
  nom: string;
  description: string;
  /** réchauffement global médian vs 1850-1900, °C, par année d'ancrage (AR6 WG1) */
  rechauffement: readonly (readonly [number, number])[];
  /** concentration de CO₂, ppm, par année d'ancrage (trajectoires SSP) */
  co2: readonly (readonly [number, number])[];
}

/**
 * Réchauffement global déjà contenu dans la série d'observations, °C vs
 * 1850-1900. Nos séries couvrent 1964-2023, dont le milieu (~1994) valait
 * environ +0,5 °C. C'est de CE niveau que part la dérive, sans quoi on
 * compterait deux fois le réchauffement déjà observé *(approximation assumée :
 * la série contient sa propre tendance, on l'assimile à sa moyenne)*.
 */
export const RECHAUFFEMENT_SERIE_C = 0.5;

/** CO₂ de référence, ppm : la moyenne de la période observée. */
export const CO2_SERIE_PPM = 360;

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "stable",
    nom: "Climat figé",
    description:
      "Le climat de la série d'observations, rejoué tel quel. Irréaliste, mais utile pour isoler un mécanisme.",
    rechauffement: [
      [1990, RECHAUFFEMENT_SERIE_C],
      [2100, RECHAUFFEMENT_SERIE_C],
    ],
    co2: [
      [1990, CO2_SERIE_PPM],
      [2100, CO2_SERIE_PPM],
    ],
  },
  {
    id: "ssp126",
    nom: "SSP1-2.6",
    description:
      "Neutralité carbone atteinte vers 2050 : le réchauffement se stabilise autour de +1,8 °C.",
    rechauffement: [
      [2020, 1.1],
      [2030, 1.5],
      [2050, 1.7],
      [2090, 1.8],
      [2100, 1.8],
    ],
    co2: [
      [2020, 412],
      [2050, 445],
      [2100, 446],
    ],
  },
  {
    id: "ssp245",
    nom: "SSP2-4.5",
    description:
      "La trajectoire « au fil de l'eau », celle vers laquelle pointent les politiques actuelles : +2,7 °C en 2100.",
    rechauffement: [
      [2020, 1.1],
      [2030, 1.5],
      [2050, 2.0],
      [2090, 2.7],
      [2100, 2.7],
    ],
    co2: [
      [2020, 412],
      [2050, 480],
      [2100, 603],
    ],
  },
  {
    id: "ssp585",
    nom: "SSP5-8.5",
    description:
      "Émissions non contenues : +4,4 °C en 2100, soit près de +8 °C sur les étés français.",
    rechauffement: [
      [2020, 1.1],
      [2030, 1.6],
      [2050, 2.4],
      [2090, 4.4],
      [2100, 4.4],
    ],
    co2: [
      [2020, 412],
      [2050, 540],
      [2100, 1135],
    ],
  },
];

export function getScenario(id: ScenarioId): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`scénario inconnu : ${id}`);
  return s;
}

/** Interpolation linéaire entre points d'ancrage, extrapolation plate aux bords. */
function interpoler(points: readonly (readonly [number, number])[], x: number): number {
  const premier = points[0];
  const dernier = points[points.length - 1];
  if (!premier || !dernier) return 0;
  if (x <= premier[0]) return premier[1];
  if (x >= dernier[0]) return dernier[1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return dernier[1];
}

export function rechauffementGlobalC(scenario: Scenario, annee: number): number {
  return interpoler(scenario.rechauffement, annee);
}

export function co2Ppm(scenario: Scenario, annee: number): number {
  return interpoler(scenario.co2, annee);
}

/** Poids d'été ∈ [0,1] : 1 à la mi-juillet, 0 à la mi-janvier. */
export function poidsEte(week: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * (week - 28)) / 52 + Math.PI);
}

/**
 * Facteur d'amplification français. La France se réchauffe environ une fois et
 * demie plus vite que la moyenne du globe (les continents plus que les océans),
 * et ses étés bien davantage — jusqu'au double.
 */
export function amplificationFrance(week: number): number {
  return 1.4 + 0.5 * poidsEte(week);
}

/** Anomalie de température à ajouter à la semaine observée, °C. */
export function anomalieC(scenario: Scenario, annee: number, week: number): number {
  const global = rechauffementGlobalC(scenario, annee) - RECHAUFFEMENT_SERIE_C;
  return global * amplificationFrance(week);
}

/**
 * Facteur multiplicatif sur les pluies. Le total annuel bouge peu en France ;
 * ce qui change, c'est la répartition — des étés nettement plus secs et des
 * hivers un peu plus arrosés. Environ −6 %/°C en été, +3 %/°C en hiver, borné
 * pour ne jamais donner de pluie négative *(à calibrer)*.
 */
export function facteurPluie(scenario: Scenario, annee: number, week: number): number {
  const dT = rechauffementGlobalC(scenario, annee) - RECHAUFFEMENT_SERIE_C;
  const ete = poidsEte(week);
  return Math.max(0.2, 1 + dT * (0.03 - 0.09 * ete));
}

/**
 * Amplification des écarts chauds, par degré de réchauffement global.
 *
 * Les extrêmes ne suivent pas la moyenne : en Europe, les canicules se
 * réchauffent nettement plus vite que l'été moyen — la distribution ne se
 * décale pas, elle s'étire par le haut. Ne décaler que la moyenne, comme on le
 * faisait, sous-estime donc précisément ce qui tue les arbres. On amplifie
 * l'écart POSITIF d'une semaine à sa normale saisonnière ; les semaines
 * fraîches, elles, ne sont pas refroidies *(ordre de grandeur : +8 % d'écart
 * par degré, à calibrer)*.
 */
export const AMPLIFICATION_EXTREMES = 0.08;

/**
 * Amplification des déficits de pluie : les épisodes secs s'allongent et se
 * creusent plus vite que la moyenne saisonnière ne baisse.
 */
export const AMPLIFICATION_SECHERESSE = 0.05;

/** Normales saisonnières d'une série : 52 valeurs, la moyenne de chaque semaine. */
export interface Normales {
  tMean: readonly number[];
  rainMm: readonly number[];
}

export function normalesHebdo(serie: readonly WeekWeather[]): Normales {
  const tMean = new Array<number>(52).fill(0);
  const rainMm = new Array<number>(52).fill(0);
  const n = new Array<number>(52).fill(0);
  serie.forEach((w, i) => {
    const s = i % 52;
    tMean[s] = (tMean[s] ?? 0) + w.tMean;
    rainMm[s] = (rainMm[s] ?? 0) + w.rainMm;
    n[s] = (n[s] ?? 0) + 1;
  });
  for (let s = 0; s < 52; s++) {
    const k = Math.max(1, n[s] ?? 1);
    tMean[s] = (tMean[s] ?? 0) / k;
    rainMm[s] = (rainMm[s] ?? 0) / k;
  }
  return { tMean, rainMm };
}

/**
 * Météo d'une semaine, décalée par la trajectoire climatique. On décale les
 * températures (donc l'ETP, recalculée par Hargreaves en aval) et on module la
 * pluie ; la variabilité vient des observations, mais ses extrêmes chauds et
 * secs s'accentuent — c'est l'objet de `normales`, qui dit à quoi comparer.
 * Sans `normales`, on se contente du décalage de moyenne.
 */
export function meteoDerivee(
  base: WeekWeather,
  week: number,
  scenario: Scenario,
  annee: number,
  normales?: Normales,
): WeekWeather {
  const dT = anomalieC(scenario, annee, week);
  const dGlobal = Math.max(0, rechauffementGlobalC(scenario, annee) - RECHAUFFEMENT_SERIE_C);
  const s = week % 52;
  // Écart chaud de la semaine par rapport à sa normale : c'est LUI qu'on étire.
  const ecartChaud = normales ? Math.max(0, base.tMean - (normales.tMean[s] ?? base.tMean)) : 0;
  const supplement = ecartChaud * AMPLIFICATION_EXTREMES * dGlobal;
  const pluieNormale = normales?.rainMm[s];
  const deficit = pluieNormale !== undefined ? Math.max(0, pluieNormale - base.rainMm) : 0;
  const pluie =
    base.rainMm * facteurPluie(scenario, annee, week) -
    deficit * AMPLIFICATION_SECHERESSE * dGlobal;
  return {
    tMean: base.tMean + dT + supplement,
    tMin: base.tMin + dT,
    tMax: base.tMax + dT + supplement,
    tMinAbsC: base.tMinAbsC + dT,
    rainMm: Math.max(0, pluie),
    co2Ppm: co2Ppm(scenario, annee),
    annee,
  };
}

/**
 * Effet fertilisant du CO₂ sur le potentiel de croissance.
 *
 * Réponse logarithmique : doubler le CO₂ ne double rien, ça ajoute de l'ordre
 * de 20 % de production ligneuse dans les expériences en air libre (FACE) —
 * et encore, seulement là où l'eau et l'azote suivent. C'est bien un facteur
 * sur le POTENTIEL : la loi du minimum s'applique ensuite, donc un arbre qui a
 * soif ne profite de rien.
 */
export const BETA_CO2 = 0.28;
export function facteurCo2Croissance(ppm: number): number {
  return 1 + BETA_CO2 * Math.log(Math.max(1, ppm) / CO2_ACTUEL_PPM);
}

/**
 * Effet du CO₂ sur la transpiration. À forte concentration, les stomates
 * s'ouvrent moins pour capter le même carbone : l'arbre perd moins d'eau par
 * unité de croissance. C'est le seul aspect du réchauffement qui joue POUR
 * l'arbre, et il ne compense jamais entièrement la hausse de l'ETP.
 */
export const GAMMA_CO2 = 0.2;
export function facteurCo2Transpiration(ppm: number): number {
  return (CO2_ACTUEL_PPM / Math.max(1, ppm)) ** GAMMA_CO2;
}

/** CO₂ d'aujourd'hui, ppm — la référence des deux facteurs ci-dessus. */
export const CO2_ACTUEL_PPM = 420;
