/**
 * **La nuée de ravageurs** (docs/interface-visuelle.md §5.10, lot L9 ; #129).
 *
 * Le calque du sol montre déjà la pression de ravageurs cellule par cellule
 * (#109), quand on l'ouvre. La nuée la montre **sans** l'ouvrir : là où une
 * pullulation est en cours, un nuage de points sombres danse autour des
 * houppiers. C'est le signe qu'un promeneur verrait — les insectes, pas une
 * carte.
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **où, et combien** : `soilRavageurs`, la population par cellule ∈ [0,1]
 *   (`ravageurs.ts`). Le moteur n'a qu'un « ravageur générique » : la nuée
 *   n'a donc pas d'espèce, et elle ne prétend pas en avoir une.
 * - **quand** : `facteurChaleur`, la fonction même par laquelle le moteur fait
 *   croître la population avec la chaleur. En dessous de sa température de
 *   base, les insectes ne volent pas, et la nuée se pose.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * La **taille** des points. Un puceron fait deux millimètres : à l'échelle,
 * la nuée serait invisible à tous les zooms. Chaque point a donc une taille
 * fixe à l'écran, comme les marqueurs — c'est un signe, pas un insecte — et
 * leur **nombre** suit la pression. Le seuil en deçà duquel on ne montre
 * rien est choisi pour que seules les pullulations se voient : la médiane
 * d'une partie ordinaire est de l'ordre de 0,1, une tache qui défolie
 * dépasse 0,3 (mesuré pour le calque, #109).
 *
 * Module **pur**.
 */

import { facteurChaleur } from "../../engine/ravageurs";
import { hacher } from "../hachage";

/** Pression en deçà de laquelle on ne montre rien. */
export const SEUIL_DE_LA_NUEE = 0.2;
/** Côté d'un bloc de la nuée, m : un essaim par bloc au plus. */
export const BLOC_DE_LA_NUEE_M = 5;
/** Points d'un essaim à pleine pression et pleine chaleur. */
export const POINTS_PAR_ESSAIM = 14;
/** Au plus autant d'essaims à la fois, les plus denses d'abord. */
export const MAX_ESSAIMS = 80;
/** Taille d'un point à l'écran, pixels. */
export const TAILLE_DU_POINT_PX = 3;

/** Un essaim : un bloc où la pullulation est en cours. */
export interface Essaim {
  x: number;
  y: number;
  /** pression moyenne du bloc */
  pression: number;
  points: number;
  graine: number;
}

/** Un point de la nuée, à poser. */
export interface PointDeNuee {
  x: number;
  y: number;
  hauteurM: number;
  opacite: number;
}

/**
 * Les essaims d'un instantané.
 *
 * `tMeanC` est la température de la semaine (`WeekWeather.tMean`) : c'est elle
 * que le moteur passe à `facteurChaleur`.
 */
export function essaimsDeLaNuee(
  ravageurs: ArrayLike<number> | undefined,
  coteM: number,
  tMeanC: number,
): Essaim[] {
  if (!ravageurs || ravageurs.length === 0) return [];
  const activite = Math.min(1, facteurChaleur(tMeanC));
  if (activite <= 0) return [];
  const nb = Math.max(1, Math.ceil(coteM / BLOC_DE_LA_NUEE_M));
  const somme = new Float64Array(nb * nb);
  const cellules = new Float64Array(nb * nb);
  for (let i = 0; i < coteM * coteM; i++) {
    const bx = Math.min(nb - 1, Math.floor((i % coteM) / BLOC_DE_LA_NUEE_M));
    const by = Math.min(nb - 1, Math.floor(Math.floor(i / coteM) / BLOC_DE_LA_NUEE_M));
    somme[by * nb + bx] = (somme[by * nb + bx] ?? 0) + (ravageurs[i] ?? 0);
    cellules[by * nb + bx] = (cellules[by * nb + bx] ?? 0) + 1;
  }
  const essaims: Essaim[] = [];
  for (let b = 0; b < nb * nb; b++) {
    const pression = (somme[b] ?? 0) / Math.max(1, cellules[b] ?? 1);
    if (pression < SEUIL_DE_LA_NUEE) continue;
    const force = Math.min(1, (pression - SEUIL_DE_LA_NUEE) / (1 - SEUIL_DE_LA_NUEE));
    const points = Math.max(1, Math.round(POINTS_PAR_ESSAIM * (0.3 + 0.7 * force) * activite));
    const bx = b % nb;
    const by = Math.floor(b / nb);
    essaims.push({
      x: Math.min(coteM, (bx + 0.5) * BLOC_DE_LA_NUEE_M),
      y: Math.min(coteM, (by + 0.5) * BLOC_DE_LA_NUEE_M),
      pression,
      points,
      graine: b,
    });
  }
  return essaims.sort((a, b) => b.pression - a.pression).slice(0, MAX_ESSAIMS);
}

/**
 * Les points de la nuée à l'instant `tMs`.
 *
 * Chaque point décrit une courbe de Lissajous autour du centre de son essaim,
 * à sa fréquence et sa phase : un nuage qui danse sans se disperser, et qui ne
 * se répète pas à l'œil.
 */
export function pointsDeLaNuee(essaims: readonly Essaim[], tMs: number): PointDeNuee[] {
  const t = tMs / 1000;
  const points: PointDeNuee[] = [];
  for (const e of essaims) {
    for (let k = 0; k < e.points; k++) {
      const u = hacher(e.graine, k, 0x4e01);
      const v = hacher(e.graine, k, 0x4e02);
      const w = hacher(e.graine, k, 0x4e03);
      const fx = 0.35 + 0.5 * u;
      const fy = 0.3 + 0.55 * v;
      const rayon = 0.8 + 1.6 * w;
      points.push({
        x: e.x + Math.sin(t * fx * 2.1 + u * 20) * rayon,
        y: e.y + Math.cos(t * fy * 1.9 + v * 20) * rayon,
        // Autour des houppiers bas et des jeunes tiges, là où l'arbre stressé
        // se défend mal : entre un et quatre mètres.
        hauteurM: 1 + 3 * w + Math.sin(t * 1.3 + w * 13) * 0.4,
        opacite: 0.55 + 0.35 * Math.sin(t * 3 + u * 9) ** 2,
      });
    }
  }
  return points;
}
