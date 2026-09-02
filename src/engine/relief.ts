/**
 * Relief : altitude, pente, exposition et forme du terrain (docs/regles.md §2).
 *
 * Le moteur raisonnait sur une parcelle plate et hydrologiquement isolée :
 * chaque mètre carré recevait sa pluie, la faisait descendre dans ses horizons
 * et ne parlait jamais à ses voisins. C'est une simplification qui interdit
 * tout un pan du réel — le bas de pente humide et la crête sèche sur la même
 * parcelle, la mare, le ruisseau, le ruissellement, l'inondation, et la
 * différence entre un versant sud et un versant nord.
 *
 * Quatre choses décrivent un terrain, et chacune change quelque chose :
 *  - l'**altitude** refroidit (0,6 °C par 100 m) et raccourcit la saison ;
 *  - la **pente** fait circuler l'eau au lieu de la laisser s'infiltrer ;
 *  - l'**exposition** décide du rayonnement reçu : en France, un versant sud
 *    et un versant nord de même altitude portent deux végétations différentes,
 *    c'est l'adret et l'ubac ;
 *  - la **forme** concentre ou disperse : un vallon en entonnoir rassemble
 *    l'eau de ses deux versants, une croupe la répartit et sèche.
 */

import type { GridDims } from "./grid";

export interface Relief {
  /** altitude moyenne de la parcelle, m */
  altitudeM: number;
  /** pente moyenne, en % (0 = plat, 30 = raide) */
  pentePct: number;
  /**
   * Azimut de la ligne de plus grande pente, en degrés : la direction vers
   * laquelle l'eau descend. 0 = vers le nord, 90 = vers l'est, 180 = vers le
   * sud. Un terrain qui descend vers le sud est donc exposé au sud.
   */
  expositionDeg: number;
  /**
   * Forme en travers de la pente :
   *  - `plan` : un versant régulier ;
   *  - `vallon` : concave, les deux côtés versent au milieu — c'est l'effet
   *    entonnoir, un fond frais et un risque d'engorgement ;
   *  - `croupe` : convexe, l'eau s'écarte des deux côtés et le sommet sèche.
   */
  forme: "plan" | "vallon" | "croupe";
  /**
   * Surface qui verse SUR la parcelle depuis l'amont, en hectares. Zéro pour
   * une parcelle de sommet ; plusieurs hectares en fond de vallon, ce qui
   * amène de l'eau qu'on n'a pas reçue en pluie — et parfois trop.
   */
  bassinAmontHa: number;
}

export const RELIEF_PLAT: Relief = {
  altitudeM: 120,
  pentePct: 0,
  expositionDeg: 180,
  forme: "plan",
  bassinAmontHa: 0,
};

/** Refroidissement avec l'altitude : le gradient adiabatique moyen, 0,6 °C/100 m. */
export const GRADIENT_THERMIQUE_C_PAR_100M = 0.6;

/**
 * Écart de température dû à l'altitude, par rapport à l'altitude de référence
 * de la série météo. C'est ce qui fait qu'à mille mètres, la saison de
 * végétation dure deux mois de moins qu'en plaine.
 */
export function anomalieAltitudeC(relief: Relief, altitudeReferenceM: number): number {
  return (-GRADIENT_THERMIQUE_C_PAR_100M * (relief.altitudeM - altitudeReferenceM)) / 100;
}

/**
 * Facteur de rayonnement d'un versant : combien il reçoit par rapport au plat.
 *
 * En France, un versant sud à 30 % de pente reçoit de l'ordre de 20 % de
 * rayonnement de plus qu'un terrain plat, et un versant nord d'autant moins.
 * C'est l'écart adret/ubac, et il suffit à porter deux végétations différentes
 * de part et d'autre d'une même crête *(approximation : on ne calcule pas la
 * géométrie solaire complète, on module l'ETP)*.
 */
export function facteurExpositionRayonnement(relief: Relief): number {
  if (relief.pentePct <= 0) return 1;
  // Composante sud de la direction de descente : +1 plein sud, −1 plein nord.
  const versSud = -Math.cos((relief.expositionDeg * Math.PI) / 180);
  const intensite = Math.min(1, relief.pentePct / 50);
  return 1 + 0.25 * versSud * intensite;
}

/**
 * Altitude de chaque cellule, en mètres relatifs au centre de la parcelle.
 *
 * On combine la pente générale et la forme en travers. C'est ce champ qui fait
 * ensuite circuler l'eau : elle descend, tout simplement.
 */
export function altitudeParCellule(relief: Relief, dims: GridDims): number[] {
  const { widthM: w, heightM: h } = dims;
  const altitudes = new Array<number>(w * h).fill(0);
  const rad = (relief.expositionDeg * Math.PI) / 180;
  // Vecteur de descente : x vers l'est, y vers le nord.
  const dx = Math.sin(rad);
  const dy = Math.cos(rad);
  const pente = relief.pentePct / 100;
  // Axe transversal, celui sur lequel joue la forme.
  const tx = -dy;
  const ty = dx;
  const demiCote = Math.max(w, h) / 2;
  const courbure = relief.forme === "plan" ? 0 : relief.forme === "vallon" ? 1 : -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5 - w / 2;
      const cy = y + 0.5 - h / 2;
      // Le long de la pente : on descend dans la direction (dx, dy).
      const leLongDeLaPente = -(cx * dx + cy * dy) * pente;
      // En travers : un vallon creuse au milieu, une croupe le bombe.
      const enTravers = cx * tx + cy * ty;
      const relatif = enTravers / Math.max(1, demiCote);
      const creux = courbure * pente * demiCote * 0.5 * relatif * relatif;
      altitudes[y * w + x] = leLongDeLaPente + creux;
    }
  }
  return altitudes;
}

/**
 * Ordre de traitement des cellules, du plus haut au plus bas. En parcourant
 * dans cet ordre, l'eau cascade d'un bout à l'autre du versant en une seule
 * passe : ce qui descend d'en haut a déjà été calculé quand on arrive en bas.
 */
export function ordreDeDescente(altitudes: readonly number[]): number[] {
  return altitudes.map((_, i) => i).sort((a, b) => (altitudes[b] ?? 0) - (altitudes[a] ?? 0));
}

/**
 * Pour chaque cellule, sa voisine la plus basse (parmi les huit) — ou `-1` si
 * elle est déjà au point bas de la parcelle, auquel cas l'eau sort.
 */
export function voisineAval(altitudes: readonly number[], dims: GridDims): Int32Array {
  const { widthM: w, heightM: h } = dims;
  const aval = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let meilleur = -1;
      let plusBas = altitudes[i] ?? 0;
      for (let ddy = -1; ddy <= 1; ddy++) {
        for (let ddx = -1; ddx <= 1; ddx++) {
          if (ddx === 0 && ddy === 0) continue;
          const nx = x + ddx;
          const ny = y + ddy;
          // Hors parcelle : l'eau s'en va, c'est l'exutoire.
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          const a = altitudes[j] ?? 0;
          if (a < plusBas) {
            plusBas = a;
            meilleur = j;
          }
        }
      }
      // Si aucune voisine n'est plus basse mais que la cellule touche le bord
      // et que le terrain penche, l'eau sort de la parcelle.
      aval[i] = meilleur;
    }
  }
  return aval;
}

/**
 * Part de l'eau gravitaire d'une cellule qui part vers l'aval en une semaine.
 * Sur du plat, rien ne bouge ; sur une pente franche, presque tout part.
 */
export function fractionRuissellement(pentePct: number): number {
  return Math.min(0.9, pentePct / 40);
}

/**
 * Part de la pluie tombée sur le bassin amont qui arrive effectivement chez
 * nous. Le reste s'infiltre en chemin ou part ailleurs *(à calibrer)*.
 */
export const RUISSELLEMENT_AMONT = 0.12;

/**
 * Altitude de référence des séries météo : celles-ci sont mesurées dans des
 * stations de plaine (Mont-de-Marsan 59 m, Tours 108 m, Abbeville 69 m). C'est
 * de cette altitude que part le refroidissement *(approximation : on prend une
 * valeur commune)*.
 */
export const ALTITUDE_SERIE_M = 80;

/**
 * Coefficient de ruissellement : la part de la pluie qui part en surface au
 * lieu de s'infiltrer.
 *
 * C'est le point délicat d'un moteur au pas hebdomadaire. Trente millimètres
 * étalés sur une semaine s'infiltrent toujours ; les mêmes trente millimètres
 * en une heure d'orage ruissellent en grande partie. L'intensité, qui décide de
 * tout, n'est pas représentable à cette échelle de temps — on passe donc par un
 * coefficient, comme le font les modèles mensuels.
 *
 * Trois choses le commandent, et ce sont celles qu'on observe :
 *  - la **pente**, évidemment ;
 *  - la **couverture du sol** : un sol couvert d'herbe et de litière casse
 *    l'énergie des gouttes et laisse l'eau entrer. C'est pour cela qu'un sol nu
 *    ruisselle et qu'un labour érode ;
 *  - la **saturation** : un sol déjà plein ne peut plus rien prendre, et c'est
 *    ce qui fait les crues de fin d'hiver.
 */
export function coefficientRuissellement(
  pentePct: number,
  couvertureSol: number,
  saturationSurface: number,
): number {
  const parLaPente = pentePct / (pentePct + 15);
  const freineParLeCouvert = 1 - 0.7 * Math.min(1, Math.max(0, couvertureSol));
  const solPlein = 0.35 + 0.65 * Math.min(1, Math.max(0, saturationSurface));
  return Math.min(0.85, parLaPente * freineParLeCouvert * solPlein);
}
