/**
 * **Le voile de chaleur** : l'air qui tremble au-dessus du sol nu par forte
 * chaleur (§5.7 ; retour de jeu du 2026-10-05).
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **la chaleur de la semaine**, `weather.tMax` ;
 * - **ce que le couvert en retient** : le moteur tamponne ce maximum sous les
 *   houppiers (`tMaximumSousCouvert`, `microclimat.ts`) — la forêt protège de la
 *   canicule. Le rendu appelle la fonction, il ne la refait pas ;
 * - **le sol nu** : la couverture herbacée par cellule (`soilHerbe`). Une prairie
 *   haute ne miroite pas ; une terre nue chauffée, si.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * La **rampe** : en dessous de 27 °C au sol rien ne tremble, à 34 °C l'air
 * miroite franchement. Ce n'est pas un seuil du moteur — il n'en a pas pour la
 * canicule —, c'est une convention d'image, choisie autour des seuils de
 * vigilance canicule de Météo-France (31 à 35 °C le jour selon les départements)
 * pour qu'une journée chaude ordinaire ne miroite presque pas. Elle ne change
 * rien à ce que la parcelle contient.
 *
 * Module **pur**.
 */

import { fermetureDuCouvert, tMaximumSousCouvert } from "../../engine/microclimat";
import { hacher } from "../hachage";

/** Chaleur au sol en deçà de laquelle rien ne tremble, °C. */
export const CHALEUR_MUETTE_C = 27;
/** Chaleur au sol à laquelle l'air miroite franchement, °C. */
export const CHALEUR_PLEINE_C = 34;
/** Couverture herbacée au-delà de laquelle le sol n'est plus nu. */
export const SOL_COUVERT = 0.6;
/** Côté d'un bloc, m : une onde par bloc au plus. */
export const BLOC_DE_CHALEUR_M = 3;
/** Au plus autant d'ondes à la fois, les plus chaudes d'abord. */
export const MAX_ONDES = 160;

/** Un endroit où l'air tremble. */
export interface FoyerDeChaleur {
  x: number;
  y: number;
  /** ∈ ]0,1] */
  force: number;
  graine: number;
}

/** Une onde à poser, à cet instant. */
export interface OndeDeChaleur {
  x: number;
  y: number;
  /** hauteur au-dessus du sol, m */
  hauteurM: number;
  /** largeur, m */
  largeurM: number;
  opacite: number;
}

const borne = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Où l'air tremble cette semaine : par blocs, la chaleur au sol du bloc
 * (maximum tamponné par le couvert) fois sa nudité. Une fois par instantané.
 */
export function foyersDeChaleur(
  tMaxC: number,
  lumiereAuSol: ArrayLike<number>,
  herbe: ArrayLike<number>,
  coteM: number,
): FoyerDeChaleur[] {
  if (!(tMaxC > CHALEUR_MUETTE_C)) return [];
  const nb = Math.max(1, Math.ceil(coteM / BLOC_DE_CHALEUR_M));
  const somme = new Float64Array(nb * nb);
  const n = new Float64Array(nb * nb);
  for (let i = 0; i < lumiereAuSol.length; i++) {
    const t = tMaximumSousCouvert(tMaxC, fermetureDuCouvert(lumiereAuSol[i] ?? 1));
    const chaleur = borne((t - CHALEUR_MUETTE_C) / (CHALEUR_PLEINE_C - CHALEUR_MUETTE_C));
    const nu = borne(1 - (herbe[i] ?? 0) / SOL_COUVERT);
    const bx = Math.floor((i % coteM) / BLOC_DE_CHALEUR_M);
    const by = Math.floor(Math.floor(i / coteM) / BLOC_DE_CHALEUR_M);
    const b = by * nb + bx;
    somme[b] = (somme[b] ?? 0) + chaleur * nu;
    n[b] = (n[b] ?? 0) + 1;
  }
  const foyers: FoyerDeChaleur[] = [];
  for (let b = 0; b < nb * nb; b++) {
    const force = (somme[b] ?? 0) / Math.max(1, n[b] ?? 0);
    if (force < 0.15) continue;
    foyers.push({
      x: Math.min(coteM, (b % nb) * BLOC_DE_CHALEUR_M + BLOC_DE_CHALEUR_M / 2),
      y: Math.min(coteM, Math.floor(b / nb) * BLOC_DE_CHALEUR_M + BLOC_DE_CHALEUR_M / 2),
      force,
      graine: b,
    });
  }
  foyers.sort((a, b) => b.force - a.force || a.graine - b.graine);
  return foyers.slice(0, MAX_ONDES);
}

/** Opacité d'une onde à pleine chaleur : un tremblement, pas une fumée. */
export const OPACITE_DE_L_ONDE = 0.22;

/**
 * Les ondes à cet instant : de minces bandes claires qui montent du sol, se
 * déforment et s'effacent, puis recommencent — l'air chaud qui monte.
 */
export function ondesDeChaleur(
  foyers: readonly FoyerDeChaleur[],
  maintenantMs: number,
): OndeDeChaleur[] {
  const ondes: OndeDeChaleur[] = [];
  for (const f of foyers) {
    const h = (k: number) => hacher(f.graine, k, 0xc4a1);
    const periode = 1800 + 1400 * h(0);
    const u = (maintenantMs / periode + h(1)) % 1;
    ondes.push({
      x:
        f.x +
        (h(2) - 0.5) * BLOC_DE_CHALEUR_M * 0.8 +
        0.15 * Math.sin(maintenantMs / 260 + h(3) * 6),
      y: f.y + (h(4) - 0.5) * BLOC_DE_CHALEUR_M * 0.8,
      hauteurM: 0.1 + 0.9 * u,
      largeurM: 1.4 + 1.2 * h(5),
      // Elle naît, monte et s'efface : le sinus fait le tout, sans à-coup.
      opacite: OPACITE_DE_L_ONDE * f.force * Math.sin(Math.PI * u),
    });
  }
  return ondes;
}
