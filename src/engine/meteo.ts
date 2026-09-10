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
  /**
   * Cap vers lequel le vent SOUFFLE, en radians dans le repère de la carte
   * (+x = est, +y = nord, comme l'ombre portée de `light.ts`). Même convention
   * « vers » que `directionRad` d'une tige tombée ou que `versLAval` : c'est la
   * direction du mouvement, pas sa provenance.
   *
   * C'est l'inverse de l'usage météorologique, qui nomme un vent par là d'où il
   * vient — « vent d'ouest » = qui vient de l'ouest, donc `ventVersRad = 0`
   * ici, puisqu'il pousse vers l'est. Le champ est nommé `Vers` pour que le
   * rendu ne puisse pas se tromper de signe en inclinant un panache.
   *
   * À ne pas confondre avec `Station.ventExposition`, qui n'est pas un vent
   * mais un ABRI : le vent régional est le même pour tout le voisinage, ce que
   * la station en reçoit dépend de ce qui l'entoure.
   */
  ventVersRad: number;
  /** Vitesse moyenne du vent sur la semaine, à 10 m, m/s. */
  ventMoyMs: number;
}

/**
 * Cap dominant du vent, en radians « vers », par défaut.
 *
 * Vent de secteur sud-ouest, donc soufflant VERS le nord-est : `+π/4` avec
 * +x = est et +y = nord. C'est le flux d'ouest à sud-ouest qui domine la
 * façade atlantique et le climat océanique tempéré français — le fait est
 * solide, y compris qu'il domine toute l'année.
 *
 * Ce qui n'est PAS ici : une rose des vents par station. Le coteau bourguignon
 * et le limon du Nord n'ont pas le régime de la lande girondine, et la même
 * valeur leur est appliquée faute de données. Une station qui saura mieux le
 * déclarera dans son `climat` *(à calibrer par station)*.
 */
export const VENT_DOMINANT_VERS_RAD = Math.PI / 4;
/** Vitesse moyenne annuelle du vent à 10 m, m/s, en plaine *(à calibrer)*. */
export const VENT_MOYEN_MS = 4;
/**
 * Demi-amplitude saisonnière de la vitesse du vent, m/s *(à calibrer)*.
 *
 * Le SENS est sourcé : sous régime océanique, la vitesse moyenne du vent passe
 * par un maximum en hiver (rail des dépressions atlantiques) et un minimum en
 * été. Conséquence à retenir, et voulue : la saison des feux tombe dans le bas
 * de la plage de vent. Les grands incendies français ne courent pas sur le vent
 * MOYEN de juillet, ils courent les jours où le vent revient — ce qu'un pas de
 * temps hebdomadaire ne sait pas voir. L'AMPLITUDE, elle, est une convention.
 */
export const VENT_AMPLITUDE_SAISONNIERE_MS = 1.2;

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
export function serieToWeeks(serie: SerieMeteoHebdo, climat?: SyntheticClimate): WeekWeather[] {
  return serie.semaines.map((s, week) => ({
    tMean: s[0] ?? 0,
    tMin: s[1] ?? 0,
    tMax: s[2] ?? 0,
    rainMm: s[3] ?? 0,
    tMinAbsC: s[4] ?? (s[1] ?? 0) - 3,
    // La série mesure la température et la pluie, jamais le vent : ses colonnes
    // n'en portent pas. Le vent vient donc de la même loi saisonnière que dans
    // une année synthétique, même quand le reste est mesuré — exactement le
    // statut de `co2Ppm`. Sans `climat`, le régime par défaut.
    ...ventDeLaSemaine(week, climat),
  }));
}

/**
 * Vent d'une semaine, purement déterministe — aucun aléa, donc aucun tirage
 * consommé et aucune empreinte déplacée par la seule présence du champ.
 *
 * Le CAP ne bouge pas d'une semaine à l'autre. Ce n'est pas un oubli : un
 * régime dominant se maintient toute l'année, et je ne sais pas sourcer de
 * virement saisonnier par station. Un virement inventé serait pire que pas de
 * virement — le rendu inclinerait ses panaches dans un sens faux au lieu de les
 * incliner tous du même côté, ce qui est justement ce que l'issue demande.
 *
 * La VITESSE, elle, suit la saison, sur la MÊME phase que la température et la
 * pluie (une seule saisonnalité, trois usages) mais en opposition : maximum en
 * hiver, minimum fin juillet.
 */
export function ventDeLaSemaine(
  week: number,
  climat?: SyntheticClimate,
): { ventVersRad: number; ventMoyMs: number } {
  const phase = (2 * Math.PI * (week - 29)) / 52;
  const moyen = climat?.ventMoyenMs ?? VENT_MOYEN_MS;
  const amplitude = climat?.ventAmplitudeSaisonniereMs ?? VENT_AMPLITUDE_SAISONNIERE_MS;
  return {
    ventVersRad: climat?.ventDominantVersRad ?? VENT_DOMINANT_VERS_RAD,
    ventMoyMs: Math.max(0, moyen - amplitude * Math.cos(phase)),
  };
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
  /**
   * Régime de vent de la station. Optionnels, et c'est délibéré : je n'ai
   * qu'UN régime sourcé (le flux d'ouest à sud-ouest océanique), pas une rose
   * des vents par station. Quatre valeurs inventées par station mentiraient
   * plus qu'une valeur par défaut déclarée une seule fois, ici.
   */
  /** cap vers lequel le vent dominant souffle, radians « vers » */
  ventDominantVersRad?: number;
  /** vitesse moyenne annuelle à 10 m, m/s */
  ventMoyenMs?: number;
  /** demi-amplitude saisonnière de la vitesse, m/s */
  ventAmplitudeSaisonniereMs?: number;
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
      ...ventDeLaSemaine(week, c),
    });
  }
  return weeks;
}
