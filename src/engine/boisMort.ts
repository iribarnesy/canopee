/**
 * La chute des chandelles, et ce qu'un tronc fait par terre.
 *
 * Un arbre mort tenait debout des années puis quittait la parcelle sans rien
 * laisser : son carbone passait dans un pool global, indifférent à l'endroit
 * où l'arbre avait vécu. C'est deux fois faux. Un tronc qui s'abat tombe
 * QUELQUE PART, dans une direction, et ce qu'il devient — humus, abri,
 * obstacle à l'eau, écrasement de ce qui poussait dessous — se joue sur les
 * quelques mètres carrés qu'il recouvre, pas sur la parcelle entière.
 *
 * Le bois mort AU SOL n'est pas non plus le même objet que le bois mort
 * DEBOUT. Il se décompose plus vite, parce qu'il touche la terre et reste
 * humide, là où une chandelle sèche au vent ; et il n'abrite pas les mêmes
 * espèces (les pics veulent du debout, les carabes et les salamandres du
 * couché). D'où deux stocks distincts plutôt qu'un seul.
 */

import type { GridDims } from "./grid";
import { type RngState, rngFloat } from "./rng";

/**
 * Décomposition du bois mort AU SOL, par an. Plus rapide que les 5 % du bois
 * debout (`DEADWOOD_DECAY_PER_YEAR`, carbon.ts) : le contact avec le sol
 * apporte l'humidité et les décomposeurs, et c'est cette humidité qui limite
 * la décomposition d'une chandelle. Les chroniques de bois mort en forêt
 * tempérée donnent des temps de résidence de l'ordre de la décennie pour du
 * gros bois couché contre plusieurs décennies pour du bois sec sur pied ;
 * l'ordre de grandeur du rapport est solide, la valeur exacte l'est moins.
 */
export const DECOMPOSITION_AU_SOL_PAR_AN = 0.09;

/**
 * Pente à partir de laquelle la chute suit franchement l'aval, en %. En deçà,
 * le hasard garde sa part : un arbre de plaine tombe où son défaut le porte.
 * Au-delà, la gravité tranche.
 */
export const PENTE_ORIENTANT_LA_CHUTE_PCT = 30;

/**
 * Part de la cellule qu'un mètre de tronc couche recouvre. Un tronc adulte
 * fait quelques dizaines de centimètres de diamètre : il masque une fraction
 * du mètre carré qu'il traverse, pas sa totalité.
 */
export const EMPRISE_PAR_METRE_DE_TRONC = 0.3;

/**
 * Carbone d'un mètre de tronc couché, kg C/m. Un tronc de trente centimètres
 * de diamètre fait environ 0,07 m³ par mètre ; à 500 kg/m³ de bois sec dont la
 * moitié est du carbone, cela donne une quinzaine de kilos de carbone par
 * mètre. Cette densité linéique sert à relire une masse déposée comme une
 * LONGUEUR de tronc : un gros arbre couvre du terrain, une branchette non.
 */
export const MASSE_LINEIQUE_TRONC_KGC_PAR_M = 15;

/**
 * Direction dans laquelle une chandelle s'abat, en radians (0 = +x, sens
 * trigonométrique). Sur une pente marquée, l'arbre tombe vers l'aval ; à plat,
 * il tombe n'importe où. Entre les deux, le hasard est resserré autour de
 * l'aval à mesure que la pente se redresse — une seule formule, pas deux cas.
 */
export function directionDeChute(
  altitudes: readonly number[],
  dims: GridDims,
  x: number,
  y: number,
  rng: RngState,
): { rng: RngState; radians: number } {
  const { radians: aval, pentePct } = versLAval(altitudes, dims, x, y);
  const contrainte = Math.min(1, pentePct / PENTE_ORIENTANT_LA_CHUTE_PCT);
  const tirage = rngFloat(rng);
  const ecart = (tirage.value * 2 - 1) * Math.PI;
  return { rng: tirage.state, radians: aval + ecart * (1 - contrainte) };
}

/**
 * Azimut de la plus grande pente descendante et son intensité. Le gradient est
 * pris sur les voisines opposées (différences centrées) : c'est la pente du
 * terrain sous l'arbre, pas celle d'une seule voisine.
 */
export function versLAval(
  altitudes: readonly number[],
  dims: GridDims,
  x: number,
  y: number,
): { radians: number; pentePct: number } {
  const { widthM: w, heightM: h } = dims;
  const a = (cx: number, cy: number) =>
    altitudes[Math.min(h - 1, Math.max(0, cy)) * w + Math.min(w - 1, Math.max(0, cx))] ?? 0;
  const dzdx = (a(x + 1, y) - a(x - 1, y)) / 2;
  const dzdy = (a(x, y + 1) - a(x, y - 1)) / 2;
  const norme = Math.hypot(dzdx, dzdy);
  // Le gradient monte ; la chute descend : d'où le signe.
  return { radians: Math.atan2(-dzdy, -dzdx), pentePct: norme * 100 };
}

/** Une cellule recouverte par un tronc couché, et sur quelle longueur. */
export interface CelluleSousLeTronc {
  cellule: number;
  /** longueur de tronc reposant sur cette cellule, m */
  longueurM: number;
}

/**
 * Les cellules que le tronc recouvre en tombant : une ligne partant du pied,
 * longue de la hauteur de l'arbre. Ce qui sort de la parcelle est perdu pour
 * elle — un arbre de bordure couche la moitié de son tronc chez le voisin.
 */
export function empreinteDeChute(
  x: number,
  y: number,
  hauteurM: number,
  radians: number,
  dims: GridDims,
): CelluleSousLeTronc[] {
  const { widthM: w, heightM: h } = dims;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  // Un pas d'un demi-mètre : assez fin pour ne pas sauter une cellule en
  // diagonale, assez grossier pour ne pas coûter cher sur un tronc de 30 m.
  const PAS_M = 0.5;
  const parCellule = new Map<number, number>();
  for (let d = 0; d < hauteurM; d += PAS_M) {
    const cx = Math.floor(x + dx * d);
    const cy = Math.floor(y + dy * d);
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const i = cy * w + cx;
    parCellule.set(i, (parCellule.get(i) ?? 0) + Math.min(PAS_M, hauteurM - d));
  }
  return [...parCellule].map(([cellule, longueurM]) => ({ cellule, longueurM }));
}

/**
 * Un tronc qui tombe casse-t-il ce qui pousse dessous ? La règle est celle de
 * la masse : ce qui reçoit plus lourd que soi casse. Un semis disparaît sous
 * n'importe quel tronc, un baliveau plie sous une branche et casse sous un
 * chêne, un arbre adulte encaisse. Aucun seuil par espèce : c'est la masse des
 * deux protagonistes qui décide, et elle se lit déjà dans le carbone.
 */
export function ecrasePar(masseQuiTombeKgC: number, masseDeboutKgC: number): boolean {
  return masseQuiTombeKgC > masseDeboutKgC;
}

/**
 * Ce qu'un tronc couché ajoute à la couverture du sol de sa cellule, ∈ [0,1].
 * Il protège la terre de la pluie comme le ferait un paillage, et c'est un
 * effet reconnu du bois mort en travers de la pente : ce qui est dessous ne
 * part pas.
 */
export function couvertureDuBoisAuSol(longueurM: number): number {
  return Math.min(1, longueurM * EMPRISE_PAR_METRE_DE_TRONC);
}
