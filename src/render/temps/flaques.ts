/**
 * **Les flaques** : l'eau qui reste dans les creux après la pluie, quand ce
 * n'est pas une crue (§5.7 ; retour de jeu du 2026-10-05).
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * Une flaque, c'est de l'eau qui ne s'infiltre plus. Le moteur le dit cellule par
 * cellule : la **nappe** est au ras du sol (`soilNappeCm` sous
 * `NAPPE_AFFLEURANTE_CM`, le seuil même que la crue emploie), donc la pluie de
 * la semaine y reste. Deux conditions, toutes deux du moteur :
 *
 * - la nappe affleure sur la cellule ;
 * - il a **plu** cette semaine — de la pluie liquide, pas de la neige.
 *
 * Quand ces cellules couvrent assez de parcelle, le moteur en fait une **crue**
 * (`Snapshot.crues`), et c'est la lame de la crue qui les dessine. Les flaques
 * sont donc le cas d'en dessous : quelques creux mouillés, pas d'événement.
 *
 * **Le débit `soilDebordementMm` n'y est pas**, et c'est voulu : c'est l'eau qui
 * passe, pas celle qui reste — la lire comme une flaque, c'était l'erreur que
 * #127 a corrigée.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * La forme : une tache d'eau au contour irrégulier, et non un carreau — une
 * flaque n'a pas les bords d'une cellule.
 *
 * Module **pur**.
 */

import { NAPPE_AFFLEURANTE_CM } from "../../engine/crue";
import { hacher } from "../hachage";
import { couleurEau } from "../palette";
import { PLUIE_MUETTE_MM } from "./pluie";
import type { CelluleVoilee } from "./voile";

/** Opacité d'une flaque : on voit le fond, c'est de l'eau peu profonde. */
export const OPACITE_DES_FLAQUES = 0.6;

/**
 * Les flaques de la semaine, pour la couche des voiles — ou rien.
 *
 * `pluieLiquideMm` est la pluie de la semaine moins sa part de neige ;
 * `enCrue` dit qu'une crue tient déjà ces cellules sous sa lame.
 */
export function flaquesDeLaSemaine(
  nappeCm: ArrayLike<number>,
  pluieLiquideMm: number,
  enCrue: boolean,
  semaineAnnee: number,
  enEau?: readonly boolean[],
): CelluleVoilee[] {
  if (enCrue || !(pluieLiquideMm > PLUIE_MUETTE_MM)) return [];
  const teinte = couleurEau(semaineAnnee);
  const sorties: CelluleVoilee[] = [];
  for (let i = 0; i < nappeCm.length; i++) {
    if (enEau?.[i]) continue;
    if ((nappeCm[i] ?? Number.POSITIVE_INFINITY) > NAPPE_AFFLEURANTE_CM) continue;
    sorties.push({
      cellule: i,
      teinte,
      opacite: OPACITE_DES_FLAQUES * (0.7 + 0.3 * hacher(i, 0, 0xf1a0)),
      // Une tache et non un carreau : une flaque n'a pas les bords d'une cellule.
      brulure: Math.floor(hacher(i, 1, 0xf1a1) * 4),
    });
  }
  return sorties;
}
