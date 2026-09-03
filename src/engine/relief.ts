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
  /**
   * Terrain dessiné : altitude de CHAQUE cellule, en m relatifs (mêmes
   * dimensions que la grille). Quand il est là, il remplace la forme
   * paramétrique — pente, exposition et forme ne servent plus qu'à décrire le
   * terrain pour le joueur. C'est ce qui permet de modeler un terrain à la
   * main (une pente d'un côté, un trou creusé) au lieu de choisir parmi trois
   * silhouettes (terrain.ts).
   */
  altitudesM?: readonly number[];
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
  // Terrain dessiné : on le prend tel quel. Il n'y a rien à générer.
  if (relief.altitudesM && relief.altitudesM.length === w * h) return [...relief.altitudesM];
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
      const ici = altitudes[i] ?? 0;
      let meilleur = -1;
      // On compare des PENTES, pas des dénivelés : à dénivelé égal, la voisine
      // en diagonale est 1,41 fois plus loin, donc moins pentue. Comparer les
      // dénivelés bruts faisait gagner la diagonale à égalité — et sur un plan
      // incliné, où les trois voisines d'aval sont à égalité parfaite, toute
      // l'eau de la parcelle dérivait vers un coin en creusant un faux talweg.
      let meilleurePente = 0;
      for (let ddy = -1; ddy <= 1; ddy++) {
        for (let ddx = -1; ddx <= 1; ddx++) {
          if (ddx === 0 && ddy === 0) continue;
          const nx = x + ddx;
          const ny = y + ddy;
          // Hors parcelle : l'eau s'en va, c'est l'exutoire.
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          const denivele = ici - (altitudes[j] ?? 0);
          if (denivele <= 0) continue;
          const distance = ddx !== 0 && ddy !== 0 ? Math.SQRT2 : 1;
          const pente = denivele / distance;
          if (pente > meilleurePente) {
            meilleurePente = pente;
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
 * Part de l'eau de surface d'une cellule qui rejoint l'aval en une semaine.
 *
 * Une semaine, c'est très long pour de l'eau qui court sur le sol : dès qu'il
 * y a une vraie pente, tout est parti. Ce qui reste sur place, ce n'est pas de
 * l'eau qui « ruisselle lentement », c'est de l'eau qui n'a nulle part où
 * aller — une flaque sur du plat. D'où un passage franc : rien à pente nulle,
 * tout au-delà de 2 %.
 *
 * *(La version précédente n'en faisait partir que `pente/40` — 5 % sur un
 * terrain à 2 % — ce qui revenait à faire disparaître l'eau reçue de l'amont
 * avant qu'elle n'ait traversé la parcelle.)*
 */
export function fractionRuissellement(pentePct: number): number {
  return Math.min(1, pentePct / 2);
}

/**
 * Sensibilité de la température au rayonnement reçu, °C par unité d'écart
 * relatif. Un versant qui reçoit 25 % d'énergie en plus est plus chaud d'à peu
 * près un degré en moyenne annuelle *(à calibrer)*.
 *
 * L'ordre de grandeur : sous nos latitudes, l'écart de température de l'air
 * entre un adret et un ubac de même altitude se compte en dixièmes de degré à
 * un degré et demi selon la raideur — bien moins que l'écart des températures
 * de SOL, qui atteint plusieurs degrés et qu'on ne modélise pas. Ce qu'on
 * vise ici est le premier, celui que voit la phénologie.
 *
 * *Ce qui réfuterait ce chiffre* : des relevés d'air à 2 m sur deux versants
 * appariés. S'ils montrent moins de 0,3 °C ou plus de 2 °C d'écart pour une
 * pente de 50 %, la constante est à revoir.
 */
export const SENSIBILITE_THERMIQUE_RAYONNEMENT_C = 4;

/**
 * Écart de température dû à l'EXPOSITION, °C.
 *
 * Il se déduit du rayonnement, et c'est le point : un versant sud reçoit plus
 * d'énergie, et cette même énergie fait DEUX choses — elle évapore plus et
 * elle chauffe plus. Les deux effets partagent donc une seule cause et une
 * seule formule ; ils s'annulent ensemble sur un terrain plat, et croissent
 * ensemble avec la pente.
 *
 * *(Jusqu'ici la pente n'agissait que sur l'évapotranspiration. Un versant sud
 * était plus SEC mais pas plus CHAUD, ce qui n'a pas de sens physique.)*
 */
export function anomalieExpositionC(relief: Relief): number {
  return SENSIBILITE_THERMIQUE_RAYONNEMENT_C * (facteurExpositionRayonnement(relief) - 1);
}

/**
 * Pente locale de chaque cellule, en % : la plus forte descente vers une
 * voisine, rapportée à la distance. Sur un versant régulier elle vaut la pente
 * de la parcelle ; sur un terrain dessiné elle varie, et c'est ce qu'il faut —
 * un plateau creusé d'une mare a des berges raides et un fond plat, et l'eau
 * ne s'y comporte pas de la même façon d'un mètre carré à l'autre.
 */
export function penteParCellule(altitudes: readonly number[], dims: GridDims): Float32Array {
  const { widthM: w, heightM: h } = dims;
  const pentes = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ici = altitudes[i] ?? 0;
      let max = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const denivele = ici - (altitudes[ny * w + nx] ?? 0);
          if (denivele <= 0) continue;
          const distance = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
          max = Math.max(max, (denivele / distance) * 100);
        }
      }
      pentes[i] = max;
    }
  }
  return pentes;
}

/**
 * L'encoche de la bordure haute : la cellule la plus basse du pourtour amont.
 * C'est par là qu'un cours d'eau venu de l'extérieur entre dans la parcelle —
 * un ruisseau ne franchit pas une limite n'importe où, il passe au point bas.
 * `-1` si la parcelle est plate (il n'y a pas de bordure haute).
 */
export function pointDEntreeDAmont(altitudes: readonly number[], dims: GridDims): number {
  const { widthM: w, heightM: h } = dims;
  const poids = entreesDAmont(altitudes, dims);
  // On repère d'abord LE CÔTÉ par lequel l'amont arrive — celui qui reçoit le
  // plus de poids — puis, sur ce côté seulement, le point bas. Chercher le
  // point bas parmi toutes les cellules de forte altitude donnerait un coin,
  // et le ruisseau entrerait de travers.
  const cotes = [
    { cellules: Array.from({ length: w }, (_, x) => (h - 1) * w + x) },
    { cellules: Array.from({ length: w }, (_, x) => x) },
    { cellules: Array.from({ length: h }, (_, y) => y * w) },
    { cellules: Array.from({ length: h }, (_, y) => y * w + w - 1) },
  ];
  let meilleurCote: number[] | undefined;
  let meilleurPoids = 0;
  for (const { cellules } of cotes) {
    const total = cellules.reduce((s, i) => s + (poids[i] ?? 0), 0);
    if (total > meilleurPoids) {
      meilleurPoids = total;
      meilleurCote = cellules;
    }
  }
  if (!meilleurCote) return -1;
  let meilleur = -1;
  let plusBas = Number.POSITIVE_INFINITY;
  for (const i of meilleurCote) {
    const a = altitudes[i] ?? 0;
    if (a < plusBas) {
      plusBas = a;
      meilleur = i;
    }
  }
  return meilleur;
}

/**
 * Par où l'eau d'amont entre dans la parcelle : poids par cellule, de somme 1.
 *
 * Elle n'arrive pas en pluie uniforme — ce serait de la pluie, pas du
 * ruissellement. Elle franchit la BORDURE HAUTE et traverse ensuite le terrain
 * en s'infiltrant au passage. Sur un terrain sans relief marqué, faute de
 * bordure haute identifiable, elle se répartit sur tout le pourtour.
 */
export function entreesDAmont(
  altitudes: readonly number[],
  dims: GridDims,
  concentree = false,
): number[] {
  if (concentree) {
    // Un cours d'eau franchit la limite en un point, pas en nappe : toute
    // l'eau entre par l'encoche, puis suit le terrain (terrain.ts).
    const poids = new Array<number>(dims.widthM * dims.heightM).fill(0);
    const entree = pointDEntreeDAmont(altitudes, dims);
    if (entree >= 0) {
      poids[entree] = 1;
      return poids;
    }
  }
  return entreesDiffuses(altitudes, dims);
}

function entreesDiffuses(altitudes: readonly number[], dims: GridDims): number[] {
  const { widthM: w, heightM: h } = dims;
  const n = w * h;
  const bordures: number[] = [];
  for (let x = 0; x < w; x++) {
    bordures.push(x);
    if (h > 1) bordures.push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    bordures.push(y * w);
    if (w > 1) bordures.push(y * w + w - 1);
  }
  const poids = new Array<number>(n).fill(0);
  if (bordures.length === 0) return poids;
  let basse = Number.POSITIVE_INFINITY;
  let haute = Number.NEGATIVE_INFINITY;
  for (const i of bordures) {
    const a = altitudes[i] ?? 0;
    basse = Math.min(basse, a);
    haute = Math.max(haute, a);
  }
  // Terrain plat : pas de bordure haute, l'eau entre de partout.
  if (haute - basse < 1e-9) {
    for (const i of bordures) poids[i] = 1 / bordures.length;
    return poids;
  }
  // Sinon, chaque cellule de bordure reçoit à proportion de sa hauteur
  // au-dessus du point bas du pourtour : la crête prend tout, le bas rien.
  let total = 0;
  for (const i of bordures) {
    const part = ((altitudes[i] ?? 0) - basse) / (haute - basse);
    poids[i] = part * part;
    total += poids[i];
  }
  if (total <= 0) return poids;
  for (const i of bordures) poids[i] = (poids[i] ?? 0) / total;
  return poids;
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
