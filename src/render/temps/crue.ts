/**
 * **La crue** : l'eau qui monte, qui reste, qui court et qui se retire
 * (docs/interface-visuelle.md §6.5, lot L7 ; #127, #288).
 *
 * ── **trois choses, trois sources du moteur** ────────────────────────────────
 *
 * - **La lame**, l'eau qui **reste** sur une cellule : l'emprise de la crue de
 *   la semaine et la hauteur posée sur chaque cellule (`CrueResult.cellules`,
 *   `lamesMm`). C'est un **état** : le terrain la cuit (`lameDeLaCrue`).
 * - **La montée et le retrait** : les cellules que l'eau a gagnées cette
 *   semaine, dans l'ordre où le moteur dit qu'elle les a atteintes
 *   (`CrueResult.rangs`), et celles qu'elle a quittées. Ce sont des
 *   **passages** de l'ellipse, qui ne laissent rien derrière eux.
 * - **Le courant**, l'eau qui ne fait que **passer** : `soilDebordementMm`,
 *   que le moteur dit être un **débit** — le long d'un talweg il cumule tout
 *   l'amont, jusqu'à des centaines de milliers de millimètres. Ce n'est pas une
 *   hauteur, et il ne pose donc aucune lame : il fait courir des reflets dans
 *   le sens de la pente.
 *
 * Le premier jet de ce module lisait le débit comme une lame, faute
 * d'événement : un talweg d'orage se noyait à l'écran sans qu'aucune eau y
 * reste. Le moteur a donné l'événement en #288 ; la lame vient de lui.
 *
 * ── **le sens de l'eau vient du moteur** ────────────────────────────────────
 *
 * La montée suit l'ordre de l'événement. Le courant suit `ordreDeDescente`, la
 * fonction avec laquelle le moteur fait cascader son ruissellement : on
 * l'appelle, on ne la recopie pas. Le retrait, lui, va du plus haut au plus
 * bas — l'eau quitte d'abord ce qu'elle a gagné en dernier — et c'est de la
 * mise en scène : le moteur dit quelles cellules se sont asséchées dans la
 * semaine, pas dans quel ordre.
 *
 * Module **pur** : des nombres et des teintes, aucun sprite, aucun canvas.
 */

import type { CrueResult } from "../../engine/crue";
import { ordreDeDescente } from "../../engine/relief";
import type { Teinte } from "../palette";
import { couleurEau, DEBORDEMENT_PLEIN_MM, estInondee, melange } from "../palette";
import type { CelluleVoilee } from "./voile";

/**
 * Ce que fait l'eau dans un acte : elle **court** (le débit de la semaine),
 * elle **monte** (les cellules que la crue gagne) ou elle **se retire** (celles
 * qu'elle quitte).
 */
export type SensDeLEau = "court" | "monte" | "retire";

/**
 * Un passage d'eau dans l'ellipse : des cellules, dans l'ordre où l'onde les
 * touche.
 *
 * `rangs` est **normalisé** entre 0 et 1, pour que l'onde se joue de la même
 * façon sur une parcelle d'un hectare et sur un mouchoir de poche : c'est un
 * avancement, pas une distance.
 */
export interface CrueDeLaSemaine {
  sens: SensDeLEau;
  /** indices de cellule `y * coteM + x`, dans l'ordre de passage */
  cellules: readonly number[];
  /** l'eau de chacune, mm — même ordre : le débit pour le courant, la lame sinon */
  lamesMm: readonly number[];
  /** quand l'onde atteint chacune ∈ [0,1] — même ordre */
  rangs: readonly number[];
}

/**
 * Dénivelé en deçà duquel on considère qu'il n'y a **pas** de sens de
 * l'écoulement, m.
 *
 * Cinq centimètres sur toutes les cellules noyées : en dessous, la parcelle est
 * plate là où l'eau est, et faire courir une onde d'un bord à l'autre
 * inventerait une direction que le terrain ne donne pas. L'eau monte alors
 * partout à la fois, ce qui est exactement ce qu'on voit d'une flaque de plat.
 */
export const DENIVELE_SANS_SENS_M = 0.05;

/**
 * Largeur du front de l'onde, en part de l'acte.
 *
 * Un tiers : assez large pour qu'on voie une vague et non une ligne, assez
 * étroit pour qu'on lise un sens. C'est aussi ce qui garantit que l'onde a fini
 * de passer **partout** à la fin de l'acte — le front va jusqu'à `1 + largeur`,
 * donc la dernière cellule est retombée à zéro quand l'acte se termine.
 */
export const LARGEUR_DU_FRONT = 0.34;

/** Opacité au passage de l'onde, sur une cellule au débordement plein. */
export const OPACITE_DE_LONDE = 0.62;

/**
 * Opacité de l'eau qui se retire, avant que le front ne la quitte : celle de la
 * lame la plus franche que le terrain dessine (`couleurInondee` mêle au plus
 * trois quarts d'eau au sol).
 */
export const OPACITE_DU_RETRAIT = 0.75;

/**
 * De combien l'onde **éclaircit** l'eau de la saison.
 *
 * **Mesuré, et c'est ce qui a décidé de la valeur.** Une onde de la couleur de
 * l'eau, posée sur une lame déjà cuite de cette même couleur, ne se voit pas :
 * sur le banc, à parcelle entièrement noyée, elle ne touchait que 900 pixels sur
 * 880 000. Ce qu'on montre n'est pas de l'eau de plus — elle est déjà là — c'est
 * un **mouvement**, et un mouvement d'eau se voit à ses reflets : la lumière qui
 * court sur une lame en écoulement. D'où un clair, et non un bleu de plus.
 */
export const ECLAT_DE_LONDE = 0.5;

/** Le clair que l'onde emprunte à la lumière du jour. */
const REFLET: Teinte = { r: 236, g: 244, b: 248 };

/**
 * Le **courant** de la semaine : les cellules où l'eau a passé, dans l'ordre
 * de la descente — ou rien.
 *
 * `undefined` quand aucune n'a vu passer d'eau visible, et c'est le cas
 * ordinaire : pas d'acte, pas de créneau pris dans l'ellipse. Le seuil est
 * `estInondee`, celui de toute l'eau de surface du rendu (§2.1).
 */
export function courantDeLaSemaine(
  debordementMm: ArrayLike<number> | undefined,
  altitudesM: readonly number[],
): CrueDeLaSemaine | undefined {
  if (!debordementMm || debordementMm.length === 0) return undefined;
  const noyees: number[] = [];
  for (let i = 0; i < debordementMm.length; i++) {
    if (estInondee(debordementMm[i] ?? 0)) noyees.push(i);
  }
  if (noyees.length === 0) return undefined;

  // L'ordre du **moteur** : celui dans lequel il fait cascader son
  // ruissellement. On le restreint aux cellules noyées, en gardant leur rang
  // relatif — l'eau arrive là où elle passe, pas là où elle pourrait passer.
  const noyee = new Set(noyees);
  const descente = ordreDeDescente(altitudesM).filter((i) => noyee.has(i));
  const cellules = descente.length === noyees.length ? descente : noyees;

  let haut = Number.NEGATIVE_INFINITY;
  let bas = Number.POSITIVE_INFINITY;
  for (const i of cellules) {
    const z = altitudesM[i] ?? 0;
    haut = Math.max(haut, z);
    bas = Math.min(bas, z);
  }
  const plat = !(haut - bas > DENIVELE_SANS_SENS_M);
  const dernier = Math.max(1, cellules.length - 1);
  const lamesMm = cellules.map((i) => debordementMm[i] ?? 0);
  // Plate, la parcelle n'a pas de sens : tout monte ensemble. En pente, le rang
  // suit la descente, et c'est lui qui fait courir l'onde.
  const rangs = cellules.map((_, k) => (plat ? 0 : k / dernier));
  return { sens: "court", cellules, lamesMm, rangs };
}

/**
 * L'eau posée au plus bas sur une cellule de l'emprise, mm : un sol détrempé
 * jusqu'en surface **brille**, même quand aucune pluie n'y est restée. Le moteur
 * met dans l'emprise les cellules où la nappe affleure ; une lame nulle y veut
 * dire « pas d'eau en plus », pas « sec ». Vingt millimètres donnent le plus
 * discret des reflets du terrain (`couleurInondee` : un dixième d'eau mêlé au
 * sol) — au seuil de visibilité même, le mélange est encore nul.
 */
export const LAME_DETREMPEE_MM = 20;

/**
 * La **lame** d'une semaine de crue, cellule par cellule, mm : l'état que le
 * terrain cuit. Zéro hors de l'emprise. `undefined` sans crue.
 */
export function lameDeLaCrue(
  crue: CrueResult | undefined,
  nCells: number,
): Float32Array | undefined {
  if (!crue || crue.cellules.length === 0) return undefined;
  const lame = new Float32Array(nCells);
  for (let k = 0; k < crue.cellules.length; k++) {
    const i = crue.cellules[k];
    if (i === undefined || i < 0 || i >= nCells) continue;
    lame[i] = Math.max(LAME_DETREMPEE_MM, crue.lamesMm[k] ?? 0);
  }
  return lame;
}

/**
 * La **montée** d'une semaine : les cellules que l'eau a gagnées **cette**
 * semaine, dans l'ordre du moteur — ou rien. Celles qu'elle tenait déjà ne
 * rejouent pas leur arrivée : la crue s'étend, elle ne recommence pas.
 */
export function monteeDeLaCrue(crue: CrueResult): CrueDeLaSemaine | undefined {
  const cellules: number[] = [];
  const lamesMm: number[] = [];
  for (let k = 0; k < crue.cellules.length; k++) {
    if (crue.rangs[k] !== crue.semaine) continue;
    cellules.push(crue.cellules[k] ?? 0);
    lamesMm.push(Math.max(LAME_DETREMPEE_MM, crue.lamesMm[k] ?? 0));
  }
  if (cellules.length === 0) return undefined;
  const dernier = Math.max(1, cellules.length - 1);
  // Déjà rangées par le moteur, du plus bas au plus haut : le rang suit.
  return { sens: "monte", cellules, lamesMm, rangs: cellules.map((_, k) => k / dernier) };
}

/**
 * Le **retrait** : les cellules que l'eau a quittées, du plus haut au plus bas
 * — ou rien. L'ordre est de la mise en scène (le moteur dit lesquelles, pas
 * dans quel ordre) ; il est celui que suit une eau qui baisse.
 */
export function retraitDeLaCrue(
  quittees: readonly number[],
  altitudesM: readonly number[],
): CrueDeLaSemaine | undefined {
  if (quittees.length === 0) return undefined;
  const cellules = [...quittees].sort(
    (a, b) => (altitudesM[b] ?? 0) - (altitudesM[a] ?? 0) || a - b,
  );
  const dernier = Math.max(1, cellules.length - 1);
  return {
    sens: "retire",
    cellules,
    lamesMm: cellules.map(() => DEBORDEMENT_PLEIN_MM),
    rangs: cellules.map((_, k) => k / dernier),
  };
}

/**
 * L'onde à un avancement donné de l'acte, sous la forme que la scène voile.
 *
 * **Vide à la fin, et c'est une propriété, pas une intention** : le front va
 * jusqu'à `1 + LARGEUR_DU_FRONT`, donc la dernière cellule est retombée à zéro
 * quand l'acte se termine. Ce qui reste à l'écran est la lame que le terrain a
 * cuite — l'état —, et rien de ce module.
 */
export function ondeDeLaCrue(
  crue: CrueDeLaSemaine | undefined,
  avancement: number,
  semaineAnnee: number,
): CelluleVoilee[] {
  if (!crue) return [];
  const t = Math.min(1, Math.max(0, avancement));
  const front = t * (1 + LARGEUR_DU_FRONT);
  const retrait = crue.sens === "retire";
  // Le retrait montre l'**eau** qui s'en va, pas un reflet : la cellule garde
  // la couleur de la lame jusqu'au passage du front, puis la perd.
  const teinte = retrait
    ? couleurEau(semaineAnnee)
    : melange(couleurEau(semaineAnnee), REFLET, ECLAT_DE_LONDE);
  const sorties: CelluleVoilee[] = [];
  for (let k = 0; k < crue.cellules.length; k++) {
    const rang = crue.rangs[k] ?? 0;
    let part: number;
    if (retrait) {
      // Pleine avant le front, nulle une largeur après : à la fin de l'acte,
      // le front a dépassé la dernière cellule d'une largeur, tout est sec.
      part = front <= rang ? 1 : 1 - (front - rang) / LARGEUR_DU_FRONT;
    } else {
      part = 1 - Math.abs(front - rang) / LARGEUR_DU_FRONT;
    }
    if (part <= 0) continue;
    // Une cellule qui reçoit un torrent brille plus qu'une flaque : la force de
    // l'onde suit l'eau, sur l'échelle que le terrain emploie déjà.
    const force = Math.min(1, (crue.lamesMm[k] ?? 0) / DEBORDEMENT_PLEIN_MM);
    const opacite = (retrait ? OPACITE_DU_RETRAIT : OPACITE_DE_LONDE) * part * (0.4 + 0.6 * force);
    if (opacite <= 0) continue;
    const cellule = crue.cellules[k];
    if (cellule === undefined) continue;
    sorties.push({ cellule, teinte, opacite });
  }
  return sorties;
}
