/**
 * Lumière spatiale (docs/regles.md §5) : chaque arbre reçoit la lumière qui
 * traverse les couronnes des arbres PLUS HAUTS dont l'ombre couvre sa
 * position (Beer-Lambert par couronne traversée, k = 0,5). L'ombre d'une
 * couronne est décalée vers le NORD (+y) d'une fraction de la hauteur —
 * le soleil est au sud en France : planter en lignes est-ouest ou nord-sud
 * n'a pas le même effet. Les caducs n'ombragent pas hors saison de végétation,
 * sauf les marcescents, qui gardent leurs feuilles mortes jusqu'au printemps.
 * Un index spatial (paniers de 12 m) borne le coût quand la régénération
 * multiplie les tiges.
 */

import { getEspece } from "./especes";
import type { TreeState } from "./trees";

const BEER_LAMBERT_K = 0.5;
/** Décalage de l'ombre vers le nord, en fraction de la hauteur (moyenne annuelle, lat ~45°). */
const SHADOW_NORTH_OFFSET = 0.4;
const BUCKET_M = 12;
/**
 * Extinction maximale (saturation douce) : les couronnes superposées se
 * chevauchent et laissent des trouées de ciel, elles ne s'empilent pas en
 * couches parfaites. exp(−4,5) ≈ 1,1 % de lumière au sol — l'ordre de grandeur
 * mesuré sous les couverts les plus sombres *(à calibrer)*.
 */
const MAX_EXTINCTION = 4.5;

/** Rayon du houppier, m. */
export function crownRadiusM(heightM: number, houppierRatio: number): number {
  return houppierRatio * heightM;
}

interface Shadow {
  cx: number;
  cy: number;
  r2: number;
  heightM: number;
  extinction: number;
}

/** Ombres actives (arbres vivants, en feuilles), indexées par panier spatial. */
/**
 * Part du feuillage d'un arbre qui INTERCEPTE la lumière ∈ [0,1]. Un booléen ne
 * suffit pas : le bouleau est en feuilles quand le frêne est encore nu, et un
 * houppier à moitié sorti ne fait pas la même ombre qu'un houppier plein
 * (phenologie.ts). Ce qui ombre n'est pas ce qui assimile — les feuilles mortes
 * d'un marcescent comptent ici et nulle part ailleurs.
 */
export type PartOmbrageante = (tree: TreeState) => number;

function buildShadowIndex(
  trees: readonly TreeState[],
  part: PartOmbrageante,
): Map<number, Shadow[]> {
  const buckets = new Map<number, Shadow[]>();
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const feuillage = part(tree);
    if (feuillage <= 0) continue;
    const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio);
    if (r <= 0) continue;
    const shadow: Shadow = {
      cx: tree.x,
      cy: tree.y + SHADOW_NORTH_OFFSET * tree.heightM,
      r2: r * r,
      heightM: tree.heightM,
      // L'indice foliaire suit le déploiement : c'est là que la phénologie
      // entre dans la loi de Beer-Lambert.
      extinction: BEER_LAMBERT_K * espece.lumiere.lai * feuillage,
    };
    const bx0 = Math.floor((shadow.cx - r) / BUCKET_M);
    const bx1 = Math.floor((shadow.cx + r) / BUCKET_M);
    const by0 = Math.floor((shadow.cy - r) / BUCKET_M);
    const by1 = Math.floor((shadow.cy + r) / BUCKET_M);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = by * 100_000 + bx;
        const list = buckets.get(key);
        if (list) list.push(shadow);
        else buckets.set(key, [shadow]);
      }
    }
  }
  return buckets;
}

function extinctionAt(
  buckets: Map<number, Shadow[]>,
  x: number,
  y: number,
  heightM: number,
): number {
  const key = Math.floor(y / BUCKET_M) * 100_000 + Math.floor(x / BUCKET_M);
  const list = buckets.get(key);
  if (!list) return 0;
  let extinction = 0;
  for (const s of list) {
    // Plus haut = ombrage plein ; codominant (dans les 25 % sous la cible) =
    // ombrage latéral partiel. Sans lui, une cohorte dense de même hauteur ne
    // se gênerait jamais et l'auto-éclaircie n'émergerait pas.
    let weight: number;
    if (s.heightM > heightM) weight = 1;
    else if (s.heightM > 0.75 * heightM && s.heightM < heightM) weight = 0.4;
    else continue;
    const dx = x - s.cx;
    const dy = y - s.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= s.r2) {
      // Pénombre : l'ombre est pleine à l'aplomb du houppier et s'estompe vers
      // son bord (couronne moins épaisse, lumière latérale). C'est ce dégradé
      // qui crée les micro-situations d'abri — un sujet planté EN LISIÈRE d'une
      // nurse est protégé du vent et du rayonnement sans être étouffé (ch1-A).
      extinction += weight * s.extinction * (1 - d2 / s.r2);
    }
  }
  // Une ou deux couronnes s'additionnent pleinement ; les empilements profonds
  // saturent (chevauchements, trouées de ciel) vers MAX_EXTINCTION.
  if (extinction <= 2) return extinction;
  const span = MAX_EXTINCTION - 2;
  return 2 + span * (1 - Math.exp(-(extinction - 2) / span));
}

/**
 * Lumière relative ∈ [0,1] reçue par chaque arbre vivant (index aligné sur
 * `trees`, 1 pour les morts). `part` donne le feuillage ombrageant de chaque arbre.
 */
export function computeLight(trees: readonly TreeState[], part: PartOmbrageante): number[] {
  const buckets = buildShadowIndex(trees, part);
  return trees.map((tree) =>
    tree.alive ? Math.exp(-extinctionAt(buckets, tree.x, tree.y, tree.heightM)) : 1,
  );
}

/** Lumière relative au sol en un point (pour l'installation des semis). */
export function lightAtPoint(
  trees: readonly TreeState[],
  x: number,
  y: number,
  part: PartOmbrageante,
): number {
  const buckets = buildShadowIndex(trees, part);
  return Math.exp(-extinctionAt(buckets, x, y, 0));
}

/**
 * Abri au vent d'un point ∈ [0,1] (docs/regles.md §3, ch5 « haie brise-vent »).
 * Contrairement à l'ombre et aux racines, la protection au vent PORTE LOIN :
 * une haie abrite sur 10 à 20 fois sa hauteur. C'est ce découplage qui rend
 * l'agroforesterie payante en milieu venté — on protège sans concurrencer,
 * à condition d'espacer.
 */
export function windShelterAt(
  trees: readonly TreeState[],
  x: number,
  y: number,
  selfId?: number,
): number {
  let shelter = 0;
  for (const t of trees) {
    if (!t.alive || t.id === selfId || t.heightM < 0.5) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Au-delà de 12 hauteurs, l'effet est nul ; tout près, il plafonne.
    if (d > 12 * t.heightM) continue;
    shelter += (0.12 * t.heightM) / Math.max(1.5, d);
  }
  return Math.min(1, shelter);
}

/**
 * Lumière relative au sol de CHAQUE cellule (microclimat : l'évaporation est
 * réduite sous couvert, docs/regles.md §3).
 */
export function computeGroundLight(
  trees: readonly TreeState[],
  widthM: number,
  heightM: number,
  part: PartOmbrageante,
): number[] {
  const buckets = buildShadowIndex(trees, part);
  const out = new Array<number>(widthM * heightM);
  for (let y = 0; y < heightM; y++) {
    for (let x = 0; x < widthM; x++) {
      out[y * widthM + x] = Math.exp(-extinctionAt(buckets, x + 0.5, y + 0.5, 0));
    }
  }
  return out;
}
