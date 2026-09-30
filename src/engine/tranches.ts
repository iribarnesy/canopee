/**
 * Le nitrate a une **profondeur** (#247) : il descend en front, pas en bloc.
 *
 * Jusqu'ici l'azote minéral tenait en deux compartiments — la surface (l'horizon
 * 0) et le sous-sol (tout le reste) — et chacun était une seule cellule de
 * mélange : tout son nitrate instantanément réparti dans toute son eau. Opposé à
 * l'abaque COMIFER/LIXIM (part d'un nitrate perdue sous 90 cm pour 100 mm de lame
 * drainante, selon l'horizon où il se trouve au départ), le moteur rendait :
 *
 *     départ        0-30    30-60   60-90
 *     abaque         4,2     23,7    82,2  %
 *     moteur        29,9     51,7    56,1
 *
 * Le nitrate de surface sortait sept fois trop, celui du fond une fois et demie
 * trop peu : un pool sans mémoire ne sait pas **où** est son nitrate, donc il
 * rend la même fraction à celui qui vient d'arriver et à celui qui touche la
 * sortie. Et le fond gardait ce qu'un vrai profil laisse partir — c'est ce que
 * le lot B de #247 a fait voir, en laissant les cultures y puiser.
 *
 * **Deux corrections, et aucune ne fait rien seule** (instruit dans #247) :
 *
 *  - **l'eau qui dilue le nitrate est l'eau totale** du sol, pas la réserve
 *    utile. Burns (1975) écrit la part lessivée sous la profondeur h comme
 *    (P / (P + θ))^h avec θ la teneur volumique **à la capacité au champ**, et
 *    l'a validée contre les déplacements moyens mesurés au champ. CERES dilue de
 *    même dans l'eau totale de la couche. Dans une cascade de cellules, le centre
 *    de masse descend de P/θ quelle que soit l'épaisseur des cellules : ce choix
 *    fixe la vitesse du front, et c'est lui qui est ancré ;
 *  - **le nitrate est tenu sur des tranches plus fines que les horizons**. Deux
 *    compartiments de 35 et 65 cm ne portent pas de front ; des tranches de
 *    10 cm, si. Émulé, les deux ensemble : 3,7 / 29,8 / 83,6.
 *
 * Ce module garde les consommateurs intacts : `mineralNG` et `mineralNProfondG`
 * restent les totaux que prélèvement, immobilisation, érosion ou labour lisent
 * et écrivent. Les tranches ne portent que la **répartition verticale** du
 * nitrate, et elles se réconcilient avec ces totaux avant chaque lessivage.
 */

import type { Horizon, SoilProfile } from "./soil";

/**
 * Épaisseur visée d'une tranche, cm *(à calibrer)*.
 *
 * **Calée, pas ancrée, et il faut le dire.** C'est la meilleure de quatre
 * épaisseurs essayées (5, 10, 15, 30 cm) contre l'abaque COMIFER/LIXIM, qui est
 * lui-même une sortie de modèle calé au champ et non une mesure. Une cascade de
 * cellules d'épaisseur Δz équivaut à une dispersivité d'environ Δz/2, soit ~5 cm
 * *(à confirmer contre Vanderborght et Vereecken 2007)*. Ce qui est ancré est
 * l'eau totale ; l'épaisseur ne règle que l'étalement du front autour de lui.
 */
export const EPAISSEUR_TRANCHE_CM = 10;

/**
 * Une impulsion de drainage ne dépasse pas cette part de l'eau de la tranche la
 * plus pauvre : au-delà, la semaine est découpée en sous-pas. Sans découpe, une
 * lame hebdomadaire grande devant l'eau d'une tranche étale le front d'un
 * artefact numérique (émulé : écart à l'abaque 4,7 pour des impulsions de
 * 7,7 mm sur 28 mm d'eau, 11,9 pour 33 mm). C'est un choix de résolution, pas un
 * paramètre du sol.
 */
export const IMPULSION_MAX_PART_EAU = 0.25;
/** Borne du nombre de sous-pas, contre une semaine de crue sur un sable. */
export const SOUS_PAS_MAX = 32;

/**
 * Eau retenue au **point de flétrissement**, mm par cm de sol.
 *
 * Saxton et Rawls (2006), équation 1, reproduite dans le tableau 1 de
 * Geosci. Model Dev. Discuss. (gmd-2016-165) :
 *
 *     θ1500t = −0,024 S + 0,487 C + 0,006 MO + 0,005 S·MO − 0,013 C·MO
 *              + 0,068 S·C + 0,031
 *     θ1500  = θ1500t + (0,14 θ1500t − 0,02)
 *
 * S et C en **fraction**, MO en %. Le tableau des symboles du relais écrit « %w »
 * pour S et C, mais les coefficients l'interdisent : à S = 15 (pour cent), le
 * premier terme vaudrait à lui seul −0,36 m³/m³. Un limon à 15 % de sable, 15 %
 * d'argile et 2,2 % de matière organique rend 0,108, dans l'ordre de ce que
 * Rawls et al. (1983) donnent pour un limon (0,135).
 *
 * C'est l'eau que la réserve utile du moteur ne compte pas (`ruHorizonMm` s'arrête
 * au flétrissement), et que le nitrate voit quand même : il se dissout dans
 * toute l'eau du sol, pas seulement dans celle qu'une racine peut prendre.
 */
export function eauFletrissementMmParCm(h: Horizon): number {
  const s = h.sable;
  const c = h.argile;
  const mo = h.moPct;
  const t =
    -0.024 * s + 0.487 * c + 0.006 * mo + 0.005 * s * mo - 0.013 * c * mo + 0.068 * s * c + 0.031;
  const theta = Math.max(0, t + (0.14 * t - 0.02));
  return theta * 10 * (1 - h.pierrosite);
}

/** La géométrie des tranches d'un profil : elles suivent les horizons. */
export interface GeometrieTranches {
  /** horizon auquel appartient chaque tranche */
  horizon: number[];
  /** épaisseur de chaque tranche, cm */
  epaisseurCm: number[];
  /** nombre de tranches de l'horizon de surface (les premières) */
  nSurface: number;
  /** nombre total de tranches */
  n: number;
}

/**
 * Chaque horizon est découpé en tranches **égales** d'environ
 * `EPAISSEUR_TRANCHE_CM` : 35 cm font quatre tranches de 8,75, 65 cm en font six
 * de 10,8. Aligner les tranches sur les horizons garde la frontière
 * surface / sous-sol exactement là où les deux totaux la placent, et donne à
 * chaque tranche l'eau d'un seul horizon.
 */
export function geometrieTranches(profil: SoilProfile): GeometrieTranches {
  const horizon: number[] = [];
  const epaisseurCm: number[] = [];
  let nSurface = 0;
  profil.forEach((h, k) => {
    const n = Math.max(1, Math.round(h.epaisseurCm / EPAISSEUR_TRANCHE_CM));
    for (let j = 0; j < n; j++) {
      horizon.push(k);
      epaisseurCm.push(h.epaisseurCm / n);
    }
    if (k === 0) nSurface = n;
  });
  return { horizon, epaisseurCm, nSurface, n: horizon.length };
}

/**
 * Ramène les tranches `[debut, debut + n)` à un total voulu.
 *
 * **Une baisse se retire en proportion**, ce que font tous les sites de débit du
 * moteur (prélèvement, érosion, immobilisation) : elle garde la forme du profil.
 * **Une hausse s'ajoute au prorata de l'épaisseur** : ce qui entre à la surface
 * — minéralisation, nitrification, engrais — y entre partout, l'humus du moteur
 * étant réparti dans tout l'horizon 0. C'est le seul endroit où la réconciliation
 * décide quelque chose, et elle ne voit que le **net** de la semaine : un site qui
 * ajoute et un autre qui retire se compensent avant d'arriver ici.
 */
export function reconcilierTranches(
  tranches: Float64Array,
  debut: number,
  n: number,
  epaisseurCm: readonly number[],
  offsetGeometrie: number,
  voulu: number,
): void {
  let somme = 0;
  for (let k = 0; k < n; k++) somme += tranches[debut + k] ?? 0;
  const cible = Math.max(0, voulu);
  if (somme > 0 && cible <= somme) {
    const f = cible / somme;
    for (let k = 0; k < n; k++) tranches[debut + k] = (tranches[debut + k] ?? 0) * f;
    return;
  }
  let epaisseur = 0;
  for (let k = 0; k < n; k++) epaisseur += epaisseurCm[offsetGeometrie + k] ?? 0;
  if (epaisseur <= 0) return;
  const ajout = cible - somme;
  for (let k = 0; k < n; k++) {
    tranches[debut + k] =
      (tranches[debut + k] ?? 0) + (ajout * (epaisseurCm[offsetGeometrie + k] ?? 0)) / epaisseur;
  }
}

/**
 * Une semaine de descente du nitrate à travers les tranches `[debut, debut + n)`.
 *
 * Cascade de cellules de mélange (Burns 1974) : chaque tranche reçoit ce que la
 * précédente laisse passer, le mélange à son eau, et en cède au-dessous la part
 * `q / (q + eau)`. `fluxMm[k]` est l'eau qui traverse la **base** de la tranche k
 * dans la semaine, `eauMm[k]` l'eau totale qu'elle contient. La lame est
 * découpée en sous-pas dès qu'elle dépasse `IMPULSION_MAX_PART_EAU` de la tranche
 * la plus pauvre.
 *
 * Rend deux quantités : ce qui a quitté les `nHaut` premières tranches (la
 * surface → le sous-sol), et ce qui sort par la base de la dernière (hors du
 * profil). Conservatif par construction : ce qui sort d'une tranche entre dans
 * la suivante, et la dernière rend le reste.
 */
export function cascadeNitrate(
  tranches: Float64Array,
  debut: number,
  n: number,
  nHaut: number,
  eauMm: readonly number[],
  fluxMm: readonly number[],
): { descenduG: number; sortiG: number } {
  let qMax = 0;
  let eauMin = Number.POSITIVE_INFINITY;
  for (let k = 0; k < n; k++) {
    qMax = Math.max(qMax, fluxMm[k] ?? 0);
    eauMin = Math.min(eauMin, eauMm[k] ?? 0);
  }
  if (qMax <= 0) return { descenduG: 0, sortiG: 0 };
  const sousPas = Math.min(
    SOUS_PAS_MAX,
    Math.max(1, Math.ceil(qMax / Math.max(1e-9, IMPULSION_MAX_PART_EAU * eauMin))),
  );
  let descenduG = 0;
  let sortiG = 0;
  for (let p = 0; p < sousPas; p++) {
    let porte = 0;
    for (let k = 0; k < n; k++) {
      const i = debut + k;
      const stock = (tranches[i] ?? 0) + porte;
      const q = (fluxMm[k] ?? 0) / sousPas;
      const part = q > 0 ? q / (q + Math.max(1e-9, eauMm[k] ?? 0)) : 0;
      porte = stock * part;
      tranches[i] = stock - porte;
      if (k === nHaut - 1) descenduG += porte;
    }
    sortiG += porte;
  }
  return { descenduG, sortiG };
}
