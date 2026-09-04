/**
 * Météo hebdomadaire et évapotranspiration potentielle (ETP).
 * ETP par Hargreaves-Samani (1985), rayonnement extraterrestre par FAO-56.
 * Décision actée : Hargreaves (docs/regles.md §3).
 */

/** Météo d'une semaine de simulation. */
export interface WeekWeather {
  /** °C (moyennes de la semaine) */
  tMean: number;
  tMin: number;
  tMax: number;
  /** mm sur la semaine */
  rainMm: number;
  /**
   * LA nuit la plus froide de la semaine, °C — les gels tardifs sont des
   * événements ponctuels, invisibles dans une moyenne (§7.2).
   */
  tMinAbsC: number;
  /**
   * Concentration de CO₂ de l'année, ppm (climat.ts). Optionnelle : sans
   * trajectoire climatique, on prend la valeur d'aujourd'hui.
   */
  co2Ppm?: number;
  /** année civile de la semaine (climat.ts) — sert aux maladies datées */
  annee?: number;
}

const GSC = 0.082; // constante solaire, MJ·m⁻²·min⁻¹ (FAO-56)

/** Jour de l'année (1–365) au milieu d'une semaine de simulation (0–51). */
export function midWeekDayOfYear(week: number): number {
  return Math.min(365, Math.round(week * 7 + 3.5) + 1);
}

/**
 * Rayonnement extraterrestre Ra en MJ·m⁻²·jour⁻¹ (FAO-56, éq. 21).
 * Latitude en degrés (positif = nord), dayOfYear 1–365.
 */
export function extraterrestrialRadiation(latitudeDeg: number, dayOfYear: number): number {
  const phi = (latitudeDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  // Angle horaire au coucher ; clamp pour les latitudes/saisons extrêmes.
  const x = Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta)));
  const omegaS = Math.acos(x);
  return (
    ((24 * 60) / Math.PI) *
    GSC *
    dr *
    (omegaS * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(omegaS))
  );
}

/**
 * Durée du jour, en heures (FAO-56, éq. 34). C'est le même angle horaire de
 * coucher que le rayonnement extraterrestre : une seule géométrie, deux usages.
 * La photopériode commande la phénologie autant que la température — et elle,
 * elle ne se réchauffe pas.
 */
export function dureeDuJourH(latitudeDeg: number, dayOfYear: number): number {
  const phi = (latitudeDeg * Math.PI) / 180;
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const x = Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta)));
  return (24 / Math.PI) * Math.acos(x);
}

/**
 * ETP hebdomadaire (mm) par Hargreaves-Samani :
 * ET0_jour = 0,0023 × Ra(mm) × (Tmoy + 17,8) × √(Tmax − Tmin)
 * Ra converti de MJ·m⁻²·j⁻¹ en mm·j⁻¹ par ×0,408 (FAO-56).
 */
export function weeklyEtpHargreaves(latitudeDeg: number, week: number, w: WeekWeather): number {
  const ra = extraterrestrialRadiation(latitudeDeg, midWeekDayOfYear(week));
  const raMm = 0.408 * ra;
  const amplitude = Math.max(0, w.tMax - w.tMin);
  const daily = 0.0023 * raMm * (w.tMean + 17.8) * Math.sqrt(amplitude);
  return Math.max(0, daily) * 7;
}

/**
 * Série météo hebdomadaire réelle (format de data/meteo/*.json, construit par
 * scripts/build_meteo.py depuis l'open data Météo-France). Déterministe et
 * rejouable : c'est la « série scriptée » de docs/regles.md §3.
 */
export interface SerieMeteoHebdo {
  id: string;
  stationMeteo: string;
  poste: string;
  lat: number;
  alti: number;
  periode: [number, number];
  source: string;
  colonnes: string[];
  /** [tMoy °C, tMin °C, tMax °C, pluie mm] × 52 semaines × n années */
  semaines: number[][];
}

/** Convertit une série réelle en semaines de simulation. */
export function serieToWeeks(serie: SerieMeteoHebdo): WeekWeather[] {
  return serie.semaines.map((s) => ({
    tMean: s[0] ?? 0,
    tMin: s[1] ?? 0,
    tMax: s[2] ?? 0,
    rainMm: s[3] ?? 0,
    tMinAbsC: s[4] ?? (s[1] ?? 0) - 3,
  }));
}

/** Paramètres d'un générateur d'année météo synthétique (placeholder avant DRIAS). */
export interface SyntheticClimate {
  /** °C, moyenne annuelle */
  tMeanAnnual: number;
  /** °C, demi-amplitude saisonnière (Tjuillet − Tannuelle) */
  tSeasonalAmplitude: number;
  /** °C, écart quotidien min/max autour de la moyenne */
  tDiurnalRange: number;
  /** mm/an */
  rainAnnualMm: number;
  /** part de la pluie tombant sur le semestre d'hiver, 0.5 = uniforme */
  rainWinterShare: number;
}

/**
 * Année météo synthétique, purement déterministe (sinusoïdes, aucun aléa).
 * Sert aux tests et au développement tant que les séries DRIAS ne sont pas intégrées.
 */
export function syntheticYear(c: SyntheticClimate): WeekWeather[] {
  const weeks: WeekWeather[] = [];
  for (let week = 0; week < 52; week++) {
    // Pic de chaleur fin juillet (semaine ~29), creux fin janvier.
    const phase = (2 * Math.PI * (week - 29)) / 52;
    const tMean = c.tMeanAnnual + c.tSeasonalAmplitude * Math.cos(phase);
    // Pluie : plus abondante en hiver selon rainWinterShare.
    const winterWeight = 1 + (2 * c.rainWinterShare - 1) * -Math.cos(phase);
    const rainMm = (c.rainAnnualMm / 52) * winterWeight;
    weeks.push({
      tMean,
      tMin: tMean - c.tDiurnalRange / 2,
      tMax: tMean + c.tDiurnalRange / 2,
      rainMm,
      // nuit la plus froide de la semaine : ~3 °C sous la moyenne des minimales
      tMinAbsC: tMean - c.tDiurnalRange / 2 - 3,
    });
  }
  return weeks;
}
