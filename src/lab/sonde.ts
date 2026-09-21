/**
 * LA SONDE D'UNE STATION : vingt ans de moteur sur une parcelle, semaine par
 * semaine — le calcul, séparé de son affichage (#123).
 *
 * Il vivait dans `src/ui/App.tsx`, au milieu des graphiques, et tournait dans
 * le fil d'interface : la page gelait plusieurs minutes dès qu'on ouvrait le
 * panneau. #98 avait déjà supprimé le gel AUTOMATIQUE — la sonde ne partait
 * plus à chaque affichage de l'onglet — mais le calcul restait bloquant, et le
 * panneau se contentait de l'annoncer honnêtement.
 *
 * Ce module ne fait qu'une chose : il SIMULE, sans React, sans DOM et sans
 * horloge. C'est ce qui permet au worker du labo de l'exécuter (`worker.ts`),
 * exactement comme il exécute les expériences, et à la page de rester vivante
 * — avec une barre d'avancement, là où elle n'avait qu'un écran figé.
 */

import { serieMeteoPour } from "../data/meteo";
import {
  createGameState,
  ESPECES_V0,
  type GameState,
  plantScattered,
  rngStateFromSeed,
  STATIONS_V0,
  type StationClimat,
  serieToWeeks,
  syntheticYear,
  type TickFluxes,
  tick,
  type WeekWeather,
} from "../engine";
import { carbonInventory } from "../engine/carbon";

export const YEARS = 20;
export const TREES_PER_SPECIES = 30;
/**
 * ids ≤ ce seuil = cohorte plantée ; au-delà = recrues de la régénération.
 *
 * **Dérivé de la liste et non d'un chiffre écrit à la main.** Il valait
 * `30 × 5` depuis le temps où la V0 comptait cinq espèces ; elles sont
 * vingt-six, et la sonde en plante trente de CHACUNE. Six cent trente arbres
 * plantés étaient donc comptés comme des recrues, et la page annonçait une
 * régénération naturelle qui n'était qu'une plantation. Trouvé en écrivant le
 * premier essai de ce module — le calcul était jusque-là pris dans un
 * composant React, où rien ne pouvait l'éprouver (#123).
 */
export const PLANTED_MAX_ID = TREES_PER_SPECIES * ESPECES_V0.length;

export interface WeekPoint {
  week: number;
  meanWaterMm: number;
  waterlogging: number;
  fluxes: TickFluxes;
  heights: Record<string, number>;
  /** tous les individus vivants, recrues comprises */
  aliveCounts: Record<string, number>;
  /** ceux qui viennent de la cohorte plantée (0 en succession) */
  plantesVivants: Record<string, number>;
}

export interface SimResult {
  points: WeekPoint[];
  /** état en fin d'été de la dernière année : l'assèchement local est visible */
  finalState: GameState;
}

/** Sur la friche, on ne plante rien : on regarde la succession se dérouler. */
export function isSuccessionStation(sc: StationClimat): boolean {
  return sc.station.id === "friche-limon";
}

/** La station demandée, ou la première — la sonde ne connaît que des noms. */
export function stationDeLaSonde(stationId: string): StationClimat {
  const sc = STATIONS_V0.find((s) => s.station.id === stationId) ?? STATIONS_V0[0];
  if (!sc) throw new Error("aucune station");
  return sc;
}

/**
 * La météo que la sonde jouera : la vraie série de la station si elle existe
 * et qu'on la demande, sinon l'année type répétée.
 */
export function meteoDeLaSonde(sc: StationClimat, reelle: boolean): WeekWeather[] {
  const serie = reelle ? serieMeteoPour(sc.station.id) : undefined;
  return serie ? serieToWeeks(serie) : syntheticYear(sc.climat);
}

/**
 * Combien d'années la sonde simule sur cette station. La friche en demande
 * cent cinquante : une succession ne se lit pas sur vingt ans.
 */
export function anneesDeLaSonde(sc: StationClimat): number {
  return isSuccessionStation(sc) ? 150 : YEARS;
}

export function simulate(
  sc: StationClimat,
  weather: WeekWeather[],
  /**
   * Appelé à chaque fin d'année simulée, pour que l'appelant puisse dire où
   * l'on en est. Sans lui, la sonde reste un écran qui ne répond pas — ce que
   * #123 reproche autant que le gel lui-même.
   */
  surAnnee?: (annees: number, total: number) => void,
  /** années à simuler ; par défaut ce que la station demande */
  ans?: number,
): SimResult {
  const succession = isSuccessionStation(sc);
  const years = ans ?? anneesDeLaSonde(sc);
  let state = createGameState(sc.station, rngStateFromSeed(42));
  if (!succession) {
    for (const espece of ESPECES_V0) {
      state = plantScattered(state, espece.id, TREES_PER_SPECIES);
    }
  }
  const statMaxId = succession ? Infinity : PLANTED_MAX_ID;
  let lateSummerState = state;
  const points: WeekPoint[] = [];
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    const result = tick(state, w);
    state = result.state;
    const heights: Record<string, number> = {};
    const aliveCounts: Record<string, number> = {};
    const plantesVivants: Record<string, number> = {};
    for (const espece of ESPECES_V0) {
      // Hauteur DOMINANTE (max des vivants, recrues comprises) : la métrique
      // forestière standard, sans l'artefact des moyennes qui s'effondrent
      // quand un individu meurt. Les comptages distinguent la cohorte plantée.
      const alive = state.trees.filter((t) => t.especeId === espece.id && t.alive);
      // On compte TOUT ce qui est vivant — sans les recrues, une parcelle
      // couverte de semis paraissait vide, ce qui est le contraire de ce
      // qu'on veut lire sur une régénération naturelle.
      aliveCounts[espece.id] = alive.length;
      plantesVivants[espece.id] = alive.filter((t) => t.id <= statMaxId).length;
      heights[espece.id] = alive.reduce((max, t) => Math.max(max, t.heightM), 0);
    }
    const waterArr = state.soil.waterMm;
    const nHoriz = Math.max(1, state.station.profil.length);
    let surfaceSum = 0;
    for (let c = 0; c < waterArr.length; c += nHoriz) surfaceSum += waterArr[c] ?? 0;
    points.push({
      week: i,
      meanWaterMm: surfaceSum / (waterArr.length / nHoriz),
      waterlogging: result.fluxes.waterloggingMean,
      fluxes: result.fluxes,
      heights,
      aliveCounts,
      plantesVivants,
    });
    if (i % 52 === 35) lateSummerState = state;
    if (i % 52 === 51) surAnnee?.((i + 1) / 52, years);
  }
  return { points, finalState: lateSummerState };
}

/**
 * Le bilan carbone de l'état final, calculé DANS le worker.
 *
 * La page le calculait elle-même à partir de `finalState` ; c'est une lecture
 * de plus sur un état de cent mille cellules, et elle n'a pas besoin de
 * traverser le fil d'interface pour être faite.
 */
export type BilanCarbone = ReturnType<typeof carbonInventory>;

export function bilanDeLaSonde(sc: StationClimat, finalState: GameState): BilanCarbone {
  return carbonInventory(finalState, sc.station.initialSoilCTHa);
}
