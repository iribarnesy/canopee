/**
 * Régénération naturelle (docs/regles.md §8, ch4-B) : une fois par an, les
 * adultes en âge de grainer et le paysage voisin (`station.voisinage`)
 * produisent des semis. Tous les tirages passent par le PRNG seedé.
 * `semisParAn` représente les établissements POTENTIELS (après l'entonnoir de
 * mortalité graine→semis, ch4-B) ; le filtre restant est écologique :
 * - lumière au sol ≥ 2 × le point de compensation de l'espèce (un héliophile
 *   ne s'installe pas sous couvert, un sciaphile si) ;
 * - pas d'arbre vivant à moins de 1,2 m (concurrence immédiate) ;
 * - plafond de densité (auto-éclaircie des fourrés, en attendant la V1).
 * La suite (sécheresse, ombre croissante) relève de la mortalité normale.
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { crownRadiusM, lightAtPoint } from "./light";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import { phFactor, type TreeState } from "./trees";

/** distance moyenne de dispersion par le vent, m (exponentielle) */
const WIND_MEAN_DISTANCE_M = 25;
/** densité max de tiges vivantes, /m² (plafond d'auto-éclaircie *(à calibrer)*) */
const MAX_TREE_DENSITY = 0.15;
const MIN_SPACING_M = 1.2;
const SEEDLING_HEIGHT_M = 0.3;

export interface RecruitmentInput {
  trees: readonly TreeState[];
  rng: RngState;
  coteM: number;
  /** semis annuels arrivant du paysage hors-parcelle */
  voisinage: readonly { especeId: string; semisParAn: number }[];
  /** true si les caducs sont en feuilles (filtre lumière des semis) */
  leavesOn: boolean;
  /** pH par cellule (un semis ne s'installe pas hors de sa gamme) */
  ph: readonly number[];
  nextTreeId: number;
}

export interface RecruitmentResult {
  newTrees: TreeState[];
  rng: RngState;
  nextTreeId: number;
}

function draw(rng: RngState): { rng: RngState; value: number } {
  const r = rngFloat(rng);
  return { rng: r.state, value: r.value };
}

/** Position d'un semis selon le mode de dissémination de l'espèce (ch4-C). */
function drawPosition(
  rng: RngState,
  espece: EspeceV0,
  parent: TreeState | null,
  coteM: number,
): { rng: RngState; x: number; y: number } {
  let r = draw(rng);
  const u1 = r.value;
  r = draw(r.rng);
  const u2 = r.value;
  // Semis venu du hors-parcelle : position uniforme (vent/oiseaux depuis la lisière).
  if (!parent) return { rng: r.rng, x: u1 * coteM, y: u2 * coteM };

  switch (espece.regeneration.dissemination) {
    case "oiseaux":
      // Le geai plante loin, n'importe où sur la parcelle (ch4-C).
      return { rng: r.rng, x: u1 * coteM, y: u2 * coteM };
    case "vent": {
      const distance = -WIND_MEAN_DISTANCE_M * Math.log(1 - Math.min(u1, 0.999));
      const angle = 2 * Math.PI * u2;
      return {
        rng: r.rng,
        x: parent.x + distance * Math.cos(angle),
        y: parent.y + distance * Math.sin(angle),
      };
    }
    case "gravite": {
      // Sous la couronne et à peine au-delà (faînes, glands roulés).
      const reach = crownRadiusM(parent.heightM, espece.lumiere.houppierRatio) * 1.5 + 2;
      const distance = reach * Math.sqrt(u1);
      const angle = 2 * Math.PI * u2;
      return {
        rng: r.rng,
        x: parent.x + distance * Math.cos(angle),
        y: parent.y + distance * Math.sin(angle),
      };
    }
  }
}

export function yearlyRecruitment(input: RecruitmentInput): RecruitmentResult {
  const { trees, coteM, voisinage, leavesOn } = input;
  let rng = input.rng;
  let nextTreeId = input.nextTreeId;
  const maxTrees = Math.floor(MAX_TREE_DENSITY * coteM * coteM);
  const newTrees: TreeState[] = [];
  let aliveCount = 0;
  for (const t of trees) if (t.alive) aliveCount++;

  const tryEstablish = (especeId: string, parent: TreeState | null) => {
    const espece = getEspece(especeId);
    const pos = drawPosition(rng, espece, parent, coteM);
    rng = pos.rng;
    if (aliveCount + newTrees.length >= maxTrees) return;
    if (pos.x < 0 || pos.x >= coteM || pos.y < 0 || pos.y >= coteM) return; // perdu hors parcelle
    // Filtres écologiques : lumière ≥ 2 × compensation, pH dans la gamme.
    if (lightAtPoint(trees, pos.x, pos.y, leavesOn) < 2 * espece.lumiere.compensation) return;
    const cellPh = input.ph[Math.floor(pos.y) * coteM + Math.floor(pos.x)] ?? 7;
    if (phFactor(espece, cellPh) < 0.2) return;
    // Concurrence immédiate : pas d'installation collée à un vivant.
    for (const t of trees) {
      if (!t.alive) continue;
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      if (dx * dx + dy * dy < MIN_SPACING_M * MIN_SPACING_M) return;
    }
    for (const t of newTrees) {
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      if (dx * dx + dy * dy < MIN_SPACING_M * MIN_SPACING_M) return;
    }
    newTrees.push({
      id: nextTreeId++,
      especeId,
      x: pos.x,
      y: pos.y,
      ageWeeks: 0,
      heightM: SEEDLING_HEIGHT_M,
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
    });
  };

  // 1. Pluie de semis du paysage voisin (non contrôlable, docs/regles.md §8).
  for (const v of voisinage) {
    for (let k = 0; k < v.semisParAn; k++) tryEstablish(v.especeId, null);
  }

  // 2. Semis des adultes de la parcelle en âge de grainer.
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    if (tree.ageWeeks < espece.regeneration.maturiteAns * 52) continue;
    for (let k = 0; k < espece.regeneration.semisParAn; k++) tryEstablish(tree.especeId, tree);
  }

  return { newTrees, rng, nextTreeId };
}
