/**
 * ─── **la plasticité latérale des couronnes** (#474, #484) ───────────────────────
 *
 * Une couronne de peuplement s'étend vers la place que ses voisins lui laissent.
 * Sans cela, le moteur gardait des trous que rien ne refermait : sous la hêtraie
 * de quarante ans plantée à 2 m de l'essai d'acceptation de #484, les tiges
 * mortes de l'auto-éclaircie laissaient des trouées à 7 à 9 % de lumière d'été,
 * là où le terrain mesure 1 à 3 % sous le hêtre (Hagemeier et Leuschner 2019,
 * *Forests* 10 : 925), parce que les couronnes voisines restaient centrées sur
 * leur tronc, au rayon de leur seul diamètre.
 *
 * La règle est celle de HETEROFOR (Jonard et al. 2020, *Geosci. Model Dev.*
 * 13 : 905, §2.2.5, éq. 44-47), décidée par le propriétaire le 13 novembre
 * (#474) :
 *
 * - **la couronne a quatre quarts**, vers l'est, le nord, l'ouest et le sud ; le
 *   secteur d'un quart couvre 90°, de part et d'autre de sa direction ;
 * - **le concurrent d'un quart** est le plus proche voisin de son secteur plus
 *   haut que la base du houppier de l'arbre ;
 * - **le rayon d'équilibre** du quart vaut
 *
 *       r_eq = r_pot / (r_pot + r_pot,conc) × d × r_overlap
 *
 *   où `d` est la distance des deux troncs, `r_pot` le rayon potentiel de chaque
 *   arbre (`EXTENSION_HOUPPIER_MAX` fois le rayon de la loi, éq. 45) et
 *   `r_overlap` le recouvrement des couronnes (`RECOUVREMENT_COURONNES`). Deux
 *   égaux se partagent l'espace à parts égales, et se recouvrent d'un cinquième ;
 * - **le rayon est borné** entre le rayon de la loi et une fois et demie celui-ci ;
 * - **un quart sans concurrent à portée** (`PORTEE_CONCURRENT_M`) **garde le
 *   rayon de la loi** et ne s'étend pas. HETEROFOR lui donne son rayon potentiel ;
 *   le propriétaire a décidé l'inverse, pour que l'arbre de plein champ et les
 *   calibrages de l'agroforesterie ne bougent pas. Seuls les quarts tournés vers
 *   une trouée bordée de voisins s'étendent ;
 * - **un quart s'étend d'au plus `EXTENSION_QUART_M_AN` par an**, et se retire au
 *   même pas, comme le Δcr borné de HETEROFOR (éq. 46-47). Le pas part du rayon
 *   lu, borné par la loi du jour : un arbre rabattu (recépage, trogne, cassure)
 *   ne garde au plus qu'une fois et demie sa nouvelle loi, et la perd au même pas.
 *
 * **La règle a un saut**, et il est assumé (#474) : un concurrent à 11,9 m donne
 * un quart qui s'étend jusqu'à son plafond, un concurrent à 12,1 m un quart à la
 * loi. Aucune source ne donne de raccord progressif, et le moteur n'en invente
 * pas.
 *
 * **Le feuillage est gardé** (light.ts) : la couronne étendue porte la surface
 * foliaire de son disque de loi. Seule l'ombre lit la forme ; la glandée, la
 * litière, les ravageurs, les racines et les oiseaux lisent le disque de la loi.
 *
 * **Les concurrents se cherchent une fois par an**, à la semaine du recrutement
 * (tick.ts), pas à chaque lecture de la lumière : une recherche à chaque semaine
 * faisait passer l'étape de la lumière de 40-46 à 94-126 ms sur une parcelle de
 * 2 241 tiges (lot d'instruction, #474, 12 novembre).
 */

import { getEspece } from "./especes";
import {
  crownRadiusM,
  EXTENSION_HOUPPIER_MAX,
  type QuartsHouppier,
  quartsDuHouppier,
} from "./light";
import type { TreeState } from "./trees";

/**
 * Le recouvrement des couronnes voisines, `r_overlap` de HETEROFOR : la somme des
 * rayons de deux voisins rapportée à la distance de leurs troncs, 1,2 pour le
 * hêtre à Baileux (Jonard et al. 2020, éq. 44 et tableau 2 ; 1 pour le chêne
 * sessile). Appliqué à toutes les essences, sur décision du propriétaire (#474)
 * *(à confirmer hors du hêtre)*.
 */
export const RECOUVREMENT_COURONNES = 1.2;

/**
 * La portée de la recherche d'un concurrent, m : au-delà, un quart n'a pas de
 * voisin, et garde le rayon de la loi. C'est le rayon où la position des voisins
 * explique le mieux le déplacement des couronnes dans la vieille hêtraie de
 * Serrahn (Schröter, Härdtle et von Oheimb 2012, *Eur. J. For. Res.* 131 : 787,
 * lu par le résumé). HETEROFOR cherche jusqu'à 20 m.
 */
export const PORTEE_CONCURRENT_M = 12;

/**
 * Ce qu'un quart gagne au plus en un an, m : le rayon équivalent de la surface
 * projetée des hêtres d'une trouée ouverte en 2006 passe de 2,49 à 2,89 m en deux
 * ans (19,4 puis 26,3 m², Bayer et Pretzsch 2017, *Silva Fennica* 51(5) 7748,
 * tableau 1), soit 0,2 m par an. Le même pas borne le retrait (HETEROFOR, éq. 47).
 */
export const EXTENSION_QUART_M_AN = 0.2;

/** Le côté des paniers de la recherche : la portée, pour ne lire que les neuf paniers voisins. */
const PANIER_M = PORTEE_CONCURRENT_M;

/**
 * Le quart où tombe un voisin vu du tronc : 0 à l'est, 1 au nord, 2 à l'ouest,
 * 3 au sud. Un voisin exactement sur une diagonale va au nord ou au sud.
 */
function secteur(dx: number, dy: number): 0 | 1 | 2 | 3 {
  if (dx > Math.abs(dy)) return 0;
  if (dy >= Math.abs(dx)) return 1;
  if (-dx > Math.abs(dy)) return 2;
  return 3;
}

function rayonDeLoi(tree: TreeState): number {
  return crownRadiusM(
    tree.heightM,
    getEspece(tree.especeId).lumiere.houppierRatio,
    tree.diametreCm,
  );
}

/**
 * Les rayons d'équilibre des quatre quarts de chaque arbre vivant, m (index
 * alignés sur `trees`, `null` pour un mort ou une tige sans houppier), bornés
 * entre la loi et `EXTENSION_HOUPPIER_MAX` fois la loi.
 */
export function rayonsDEquilibre(trees: readonly TreeState[]): (QuartsHouppier | null)[] {
  const n = trees.length;
  const rLoi = new Array<number>(n).fill(0);
  const paniers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const t = trees[i];
    if (!t?.alive || !(t.heightM > 0)) continue;
    rLoi[i] = rayonDeLoi(t);
    const key = Math.floor(t.y / PANIER_M) * 100_000 + Math.floor(t.x / PANIER_M);
    const list = paniers.get(key);
    if (list) list.push(i);
    else paniers.set(key, [i]);
  }
  const out = new Array<QuartsHouppier | null>(n).fill(null);
  const dMin = [0, 0, 0, 0];
  const jMin = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = trees[i];
    const ri = rLoi[i] ?? 0;
    if (!t || !(ri > 0)) continue;
    const base = Math.max(0, Math.min(t.heightM, t.baseHouppierM ?? 0));
    dMin.fill(Number.POSITIVE_INFINITY);
    jMin.fill(-1);
    const bx = Math.floor(t.x / PANIER_M);
    const by = Math.floor(t.y / PANIER_M);
    for (let py = by - 1; py <= by + 1; py++) {
      for (let px = bx - 1; px <= bx + 1; px++) {
        const list = paniers.get(py * 100_000 + px);
        if (!list) continue;
        for (const j of list) {
          if (j === i) continue;
          const v = trees[j] as TreeState;
          // Le concurrent dépasse la base du houppier : c'est là qu'il prend de la place.
          if (!(v.heightM > base)) continue;
          const dx = v.x - t.x;
          const dy = v.y - t.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          // Deux tiges au même pied n'ont pas de direction : aucune ne repousse l'autre.
          if (!(d > 0) || d > PORTEE_CONCURRENT_M) continue;
          const s = secteur(dx, dy);
          const best = dMin[s] as number;
          if (d < best || (d === best && j < (jMin[s] as number))) {
            dMin[s] = d;
            jMin[s] = j;
          }
        }
      }
    }
    const rPot = EXTENSION_HOUPPIER_MAX * ri;
    const quart = (s: number): number => {
      const j = jMin[s] as number;
      if (j < 0) return ri;
      const rPotConcurrent = EXTENSION_HOUPPIER_MAX * (rLoi[j] ?? 0);
      const rEq = (rPot / (rPot + rPotConcurrent)) * (dMin[s] as number) * RECOUVREMENT_COURONNES;
      return Math.max(ri, Math.min(rPot, rEq));
    };
    out[i] = [quart(0), quart(1), quart(2), quart(3)];
  }
  return out;
}

/** Pose une mémoire de quarts sur un arbre, ou la retire si les quatre sont à la loi. */
function avecQuarts(tree: TreeState, quarts: QuartsHouppier, rayonLoiM: number): TreeState {
  const etendue = quarts.some((r) => r > rayonLoiM);
  if (!etendue) {
    if (tree.rayonsHouppierM === undefined) return tree;
    const { rayonsHouppierM: _retiree, ...reste } = tree;
    return reste;
  }
  const avant = tree.rayonsHouppierM;
  if (
    avant &&
    avant[0] === quarts[0] &&
    avant[1] === quarts[1] &&
    avant[2] === quarts[2] &&
    avant[3] === quarts[3]
  ) {
    return tree;
  }
  return { ...tree, rayonsHouppierM: quarts };
}

/** Un pas vers la cible, d'au plus `pas` ; la cible elle-même quand elle est à portée. */
function versLaCible(avant: number, cible: number, pas: number): number {
  if (Math.abs(cible - avant) <= pas) return cible;
  return cible > avant ? avant + pas : avant - pas;
}

/**
 * Une année de plasticité : chaque quart de chaque arbre vivant fait un pas d'au
 * plus `EXTENSION_QUART_M_AN` vers son rayon d'équilibre. Rend un nouveau
 * tableau ; un arbre dont la mémoire ne change pas reste le même objet.
 */
export function couronnesDeLAnnee(trees: readonly TreeState[]): TreeState[] {
  const equilibres = rayonsDEquilibre(trees);
  return trees.map((tree, i) => {
    const cible = equilibres[i];
    if (!cible) return tree;
    const r = rayonDeLoi(tree);
    const avant = quartsDuHouppier(tree);
    const pas = EXTENSION_QUART_M_AN;
    return avecQuarts(
      tree,
      [
        versLaCible(avant[0], cible[0], pas),
        versLaCible(avant[1], cible[1], pas),
        versLaCible(avant[2], cible[2], pas),
        versLaCible(avant[3], cible[3], pas),
      ],
      r,
    );
  });
}

/**
 * Les couronnes posées d'un coup à leur équilibre, sans le pas annuel : ce que
 * relit une sauvegarde d'avant la plasticité (serialisation.ts, version 16).
 */
export function couronnesALEquilibre(trees: readonly TreeState[]): TreeState[] {
  const equilibres = rayonsDEquilibre(trees);
  return trees.map((tree, i) => {
    const cible = equilibres[i];
    if (!cible) return tree;
    return avecQuarts(tree, cible, rayonDeLoi(tree));
  });
}
