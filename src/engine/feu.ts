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
const SECHERESSE_CRITIQUE = 0.12;
/** Température maximale à partir de laquelle la chaleur commence à compter, °C. */
const CHALEUR_SEUIL_C = 24;
/** Probabilité hebdomadaire de départ de feu quand tout est réuni *(à calibrer)*. */
const PROBA_DEPART_MAX = 0.015;
/** Combustible minimal pour qu'un feu prenne, en indice de charge. */
const CHARGE_MINIMALE = 0.2;
/** Charge au-delà de laquelle le feu passe à coup sûr (lande, résineux). */
const CHARGE_PROPAGATION_CERTAINE = 0.8;
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
          // Un résineux ajoute énormément sous lui (aiguilles, résine) ;
          // un feuillu frais, presque rien.
          parCellule[i] = (parCellule[i] ?? 0) + 0.9 * espece.feu.inflammabilite;
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
 * Indice de risque d'incendie ∈ [0,1], calculé UNIQUEMENT à partir des
 * conditions du moment : sécheresse du sol de surface, chaleur, combustible
 * disponible et vent qui attise. Aucune station n'est déclarée « à feu » ou
 * « sans feu » — c'est le climat qui décide. Un limon du Nord n'atteint
 * pratiquement jamais ces conditions aujourd'hui, mais les atteindra si les
 * étés se réchauffent et s'assèchent : le risque remonte vers le nord tout
 * seul, comme dans la réalité (ch8).
 */
export function indiceRisqueFeu(
  secheresseSurface: number,
  tMaxC: number,
  chargeMoyenne: number,
  ventExposition: number,
): number {
  if (secheresseSurface > SECHERESSE_CRITIQUE || chargeMoyenne < CHARGE_MINIMALE) return 0;
  const fSecheresse = Math.min(1, (SECHERESSE_CRITIQUE - secheresseSurface) / SECHERESSE_CRITIQUE);
  const fChaleur = Math.min(1, Math.max(0, (tMaxC - CHALEUR_SEUIL_C) / 10));
  const fCombustible = Math.min(1, chargeMoyenne);
  const fVent = 0.5 + 0.5 * ventExposition;
  return fSecheresse * fChaleur * fCombustible * fVent;
}

/**
 * Un feu part-il cette semaine ? Le tirage est seedé : la même partie brûle
 * aux mêmes dates.
 */
export function departDeFeu(
  rng: RngState,
  semaineAnnee: number,
  secheresseSurface: number,
  tMaxC: number,
  charge: ChargeCombustible,
  ventExposition: number,
  coteM: number,
): DepartFeu {
  if (semaineAnnee < SAISON_FEU[0] || semaineAnnee > SAISON_FEU[1]) return { rng };
  const risque = indiceRisqueFeu(secheresseSurface, tMaxC, charge.moyenne, ventExposition);
  if (risque <= 0) return { rng };
  const tirage = rngFloat(rng);
  if (tirage.value > PROBA_DEPART_MAX * risque) return { rng: tirage.state };
  const position = rngFloat(tirage.state);
  return {
    rng: position.state,
    origine: Math.floor(position.value * coteM * coteM),
  };
}

/**
 * Chance qu'une cellule s'enflamme quand le feu arrive à sa porte : elle suit
 * ce qu'elle a à offrir au feu. Une lande d'ajoncs ou une pinède s'embrasent à
 * coup sûr ; un sous-bois de feuillus frais et peu chargé éteint souvent le
 * front. C'est ce qui donne leur valeur aux coupures et au choix des essences
 * (ch5 « concevoir contre le FEU »).
 */
export function probabilitePropagation(chargeLocale: number): number {
  if (chargeLocale < CHARGE_MINIMALE) return 0;
  return Math.min(
    1,
    (chargeLocale - CHARGE_MINIMALE) / (CHARGE_PROPAGATION_CERTAINE - CHARGE_MINIMALE),
  );
}

/**
 * Propage le feu de proche en proche depuis l'origine. Chaque cellule prend
 * feu selon sa combustibilité : le front s'essouffle dans ce qui brûle mal et
 * fonce dans ce qui brûle bien. Tirages seedés (rejoués à l'identique).
 */
export function propager(
  origine: number,
  charge: ChargeCombustible,
  coteM: number,
  rng: RngState,
): { brulees: Set<number>; rng: RngState } {
  const brulees = new Set<number>();
  const vues = new Set<number>();
  let etat = rng;
  const file = [origine];
  while (file.length > 0) {
    const cellule = file.pop();
    if (cellule === undefined || vues.has(cellule)) continue;
    vues.add(cellule);
    const proba = probabilitePropagation(charge.parCellule[cellule] ?? 0);
    if (proba <= 0) continue;
    if (proba < 1) {
      const tirage = rngFloat(etat);
      etat = tirage.state;
      if (tirage.value > proba) continue; // le front s'éteint ici
    }
    brulees.add(cellule);
    const x = cellule % coteM;
    const y = Math.floor(cellule / coteM);
    if (x > 0) file.push(cellule - 1);
    if (x < coteM - 1) file.push(cellule + 1);
    if (y > 0) file.push(cellule - coteM);
    if (y < coteM - 1) file.push(cellule + coteM);
  }
  return { brulees, rng: etat };
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
