/**
 * Le feu (docs/regles.md §7.4, ch5 « concevoir contre le FEU », ch8).
 *
 * Un incendie ne se déclenche pas au hasard : il faut du combustible sec et
 * continu. Il se propage de proche en proche, tue selon ce que chaque espèce
 * sait encaisser — l'écorce de liège traverse ce qui carbonise un pin — et
 * remet le compteur du carbone à zéro. Certaines espèces repartent de souche :
 * le feu ne les élimine pas, il les avantage.
 *
 * Tout l'aléa passe par le PRNG seedé : deux parties de même graine brûlent
 * aux mêmes semaines.
 */

import { getEspece } from "./especes";
import { crownRadiusM } from "./light";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import type { TreeState } from "./trees";

/** Semaines où un départ de feu est possible (fin de printemps → début d'automne). */
export const SAISON_FEU: readonly [number, number] = [18, 42];
/** Remplissage de l'horizon de surface sous lequel la végétation est sèche. */
const SECHERESSE_CRITIQUE = 0.25;
/** Probabilité hebdomadaire de départ de feu quand tout est réuni *(à calibrer)*. */
const PROBA_DEPART_MAX = 0.02;
/** Combustible minimal pour qu'un feu prenne, en indice de charge. */
const CHARGE_MINIMALE = 0.25;
/** Hauteur au-delà de laquelle un arbre est trop haut pour qu'un feu courant l'atteigne. */
const HAUTEUR_REFUGE_M = 12;

export interface ChargeCombustible {
  /** indice de combustible par cellule ∈ [0,~1,5] : herbe sèche + litière + ligneux */
  parCellule: number[];
  moyenne: number;
}

/**
 * Charge de combustible : ce qui peut brûler dans chaque cellule. L'herbe sèche
 * et la litière portent le feu au sol ; les espèces résineuses l'amplifient.
 */
export function chargeCombustible(
  trees: readonly TreeState[],
  herbeCouverture: readonly number[],
  litterCG: readonly number[],
  coteM: number,
): ChargeCombustible {
  const n = coteM * coteM;
  const parCellule = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    // Herbe (sèche en été) + litière accumulée.
    parCellule[i] = 0.6 * (herbeCouverture[i] ?? 0) + 0.4 * Math.min(1, (litterCG[i] ?? 0) / 300);
  }
  // Les couronnes ajoutent leur propre combustible sous elles.
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const r = Math.max(1, crownRadiusM(tree.heightM, espece.lumiere.houppierRatio));
    const x0 = Math.max(0, Math.floor(tree.x - r));
    const x1 = Math.min(coteM - 1, Math.floor(tree.x + r));
    const y0 = Math.max(0, Math.floor(tree.y - r));
    const y1 = Math.min(coteM - 1, Math.floor(tree.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - tree.x;
        const dy = y + 0.5 - tree.y;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * coteM + x;
          parCellule[i] = (parCellule[i] ?? 0) + 0.5 * espece.feu.inflammabilite;
        }
      }
    }
  }
  let somme = 0;
  for (let i = 0; i < n; i++) somme += parCellule[i] ?? 0;
  return { parCellule, moyenne: somme / n };
}

export interface DepartFeu {
  rng: RngState;
  /** cellule de départ, ou undefined si rien ne s'allume cette semaine */
  origine?: number;
}

/**
 * Un feu part-il cette semaine ? Il faut la saison, un sol sec et de quoi
 * brûler. Le tirage est seedé : la même partie brûle aux mêmes dates.
 */
export function departDeFeu(
  rng: RngState,
  semaineAnnee: number,
  secheresseSurface: number,
  charge: ChargeCombustible,
  coteM: number,
): DepartFeu {
  if (semaineAnnee < SAISON_FEU[0] || semaineAnnee > SAISON_FEU[1]) return { rng };
  if (secheresseSurface > SECHERESSE_CRITIQUE || charge.moyenne < CHARGE_MINIMALE) return { rng };
  const intensiteRisque =
    Math.min(1, (SECHERESSE_CRITIQUE - secheresseSurface) / SECHERESSE_CRITIQUE) *
    Math.min(1, charge.moyenne);
  const tirage = rngFloat(rng);
  if (tirage.value > PROBA_DEPART_MAX * intensiteRisque) return { rng: tirage.state };
  const position = rngFloat(tirage.state);
  return {
    rng: position.state,
    origine: Math.floor(position.value * coteM * coteM),
  };
}

/**
 * Propage le feu de proche en proche depuis l'origine : il ne passe que là où
 * il y a de quoi brûler, ce qui rend les coupures (zones fauchées, sol nu,
 * feuillus frais) réellement efficaces.
 * Rend l'ensemble des cellules brûlées.
 */
export function propager(origine: number, charge: ChargeCombustible, coteM: number): Set<number> {
  const brulees = new Set<number>();
  const file = [origine];
  while (file.length > 0) {
    const cellule = file.pop();
    if (cellule === undefined || brulees.has(cellule)) continue;
    if ((charge.parCellule[cellule] ?? 0) < CHARGE_MINIMALE) continue;
    brulees.add(cellule);
    const x = cellule % coteM;
    const y = Math.floor(cellule / coteM);
    if (x > 0) file.push(cellule - 1);
    if (x < coteM - 1) file.push(cellule + 1);
    if (y > 0) file.push(cellule - coteM);
    if (y < coteM - 1) file.push(cellule + coteM);
  }
  return brulees;
}

/**
 * Un arbre survit-il au passage du feu ? L'écorce protège, la taille aussi
 * (un feu courant n'atteint pas la cime d'un grand arbre), l'intensité locale
 * décide du reste.
 */
export function survitAuFeu(tree: TreeState, intensite: number): boolean {
  const espece = getEspece(tree.especeId);
  const protectionTaille = Math.min(0.5, tree.heightM / HAUTEUR_REFUGE_M / 2);
  const protection = Math.min(0.97, espece.feu.resistanceEcorce + protectionTaille);
  return protection > intensite;
}
