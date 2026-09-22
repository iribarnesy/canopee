/**
 * LA FAUNE EN INDIVIDUS (issue #187) — **prototype de mesure.**
 *
 * Ce module n'est pas le lot : c'est ce qu'il faut de code RÉEL pour répondre à
 * une question qu'on ne peut pas estimer, seulement mesurer — *combien coûte un
 * tick si la faune est faite d'individus plutôt que d'une densité ?*
 *
 * Le choix d'architecture est pris : on veut des individus, pour que le joueur
 * s'attache et pour qu'« une mésange vient nicher chez toi » soit un événement.
 * Reste à savoir si ça se paie, et donc s'il faut un commutateur.
 *
 * DEUX IMPLÉMENTATIONS, ET ELLES NE SE RESSEMBLENT PAS :
 *
 *  - `"cellule"` — chaque individu parcourt les cellules de son territoire. Le
 *    plus expressif : on peut faire dépendre sa prédation de ce qu'il y a dans
 *    CHAQUE cellule, donc d'un gradient à l'intérieur du domaine vital.
 *  - `"bloc"` — chaque individu verse dans les blocs de 10 m que `ravageurs.ts`
 *    utilise déjà pour la richesse. Beaucoup moins de cellules touchées, et
 *    c'est le patron que le module voisin a déjà choisi, pour la raison qu'il
 *    écrit : « une mésange prospecte un hectare ».
 *
 * La grandeur produite est la même dans les deux cas — une carte de prédation
 * par cellule, qui s'ajoute à celle que l'habitat donne aujourd'hui — pour que
 * la comparaison porte sur le COÛT et non sur le résultat.
 */

import { forEachDiscCell, type GridDims } from "./grid";

/** Un individu : une identité, un gîte, un domaine vital. */
export interface IndividuFaune {
  id: number;
  especeId: string;
  /** centre du domaine vital, m */
  x: number;
  y: number;
  /** rayon du domaine vital, m — 56 m ≈ 1 ha, l'ordre d'un couple de mésange */
  territoireM: number;
  /** ce que l'individu prélève à pleine activité, par cellule et par semaine */
  predation: number;
}

export type ModeFaune = "densite" | "individus-bloc" | "individus-cellule";

/**
 * La prédation que les individus exercent, par cellule.
 *
 * Le tampon est fourni par l'appelant et remis à zéro ici : une allocation par
 * semaine coûterait plus que le mécanisme, et c'est la même précaution que
 * `demandes` dans `herbacees.ts`.
 */
export function predationDesIndividus(
  individus: readonly IndividuFaune[],
  dims: GridDims,
  mode: ModeFaune,
  sortie: Float64Array,
  blocM: number,
): void {
  sortie.fill(0);
  if (mode === "densite" || individus.length === 0) return;

  if (mode === "individus-cellule") {
    // Chaque individu visite les cellules de son territoire. Le coût suit la
    // surface totale des domaines vitaux, pas le nombre d'individus.
    for (const ind of individus) {
      forEachDiscCell(dims, ind.x, ind.y, ind.territoireM, (i) => {
        sortie[i] = Math.min(1, (sortie[i] ?? 0) + ind.predation);
      });
    }
    return;
  }

  // `individus-bloc` : on verse dans les blocs, puis on déplie. Le coût suit le
  // nombre d'individus plus le nombre de BLOCS, pas celui de cellules.
  const nbx = Math.max(1, Math.ceil(dims.widthM / blocM));
  const nby = Math.max(1, Math.ceil(dims.heightM / blocM));
  const parBloc = new Float64Array(nbx * nby);
  for (const ind of individus) {
    const rBloc = ind.territoireM / blocM;
    const bx = ind.x / blocM;
    const by = ind.y / blocM;
    const x0 = Math.max(0, Math.floor(bx - rBloc));
    const x1 = Math.min(nbx - 1, Math.floor(bx + rBloc));
    const y0 = Math.max(0, Math.floor(by - rBloc));
    const y1 = Math.min(nby - 1, Math.floor(by + rBloc));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - bx;
        const dy = y + 0.5 - by;
        if (dx * dx + dy * dy <= rBloc * rBloc) {
          const b = y * nbx + x;
          parBloc[b] = Math.min(1, (parBloc[b] ?? 0) + ind.predation);
        }
      }
    }
  }
  for (let i = 0; i < sortie.length; i++) {
    const bx = Math.min(nbx - 1, Math.floor((i % dims.widthM) / blocM));
    const by = Math.min(nby - 1, Math.floor(Math.floor(i / dims.widthM) / blocM));
    sortie[i] = parBloc[by * nbx + bx] ?? 0;
  }
}
