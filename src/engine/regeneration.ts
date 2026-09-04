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
import { crownRadiusM, lightAtPoint, type PartOmbrageante } from "./light";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import { phFactor, type TreeState, tirerVigueurIndividuelle } from "./trees";

/** distance moyenne de dispersion par le vent, m (exponentielle) */
const WIND_MEAN_DISTANCE_M = 25;
/**
 * Plafond d'auto-éclaircie, exprimé en RECOUVREMENT et non en nombre de tiges.
 *
 * Un plafond fixe — on avait 1 500 tiges/ha — est faux aux deux bouts : un
 * fourré de ronces et d'épineux en compte plusieurs milliers, une futaie
 * adulte quelques centaines. Ce qui sature un peuplement, ce n'est pas un
 * nombre, c'est la PLACE : la somme des couronnes rapportée à la surface du
 * sol. Un peuplement stratifié en superpose deux à trois épaisseurs — au-delà,
 * il ne reste plus assez de lumière pour qu'un semis de plus s'installe.
 *
 * C'est la loi d'auto-éclaircie, sous la forme la plus directe que permette un
 * moteur qui connaît les houppiers : elle donne des milliers de tiges quand
 * elles font trente centimètres, et quelques centaines quand elles font vingt
 * mètres, sans qu'on ait à choisir un chiffre pour chaque étape.
 */
const RECOUVREMENT_MAX = 2.5;
const MIN_SPACING_M = 1.2;
const SEEDLING_HEIGHT_M = 0.3;

export interface RecruitmentInput {
  trees: readonly TreeState[];
  rng: RngState;
  coteM: number;
  /** semis annuels arrivant du paysage hors-parcelle */
  voisinage: readonly { especeId: string; semisParAn: number }[];
  /** feuillage ombrageant de chaque arbre : le filtre lumière des semis en dépend */
  partOmbrageante: PartOmbrageante;
  /** pH par cellule (un semis ne s'installe pas hors de sa gamme) */
  ph: readonly number[];
  /**
   * Lumière au sol par cellule : elle sert au geai, qui cache ses glands en
   * terrain découvert pour les retrouver.
   */
  lumiereAuSol: readonly number[];
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
/**
 * Où atterrit un semis : le noyau de dispersion dépend entièrement du mode de
 * dissémination de l'espèce (exporté pour les tests écologiques).
 */
export function drawPosition(
  rng: RngState,
  espece: EspeceV0,
  parent: TreeState | null,
  coteM: number,
  lumiereAuSol: readonly number[],
): { rng: RngState; x: number; y: number } {
  let r = draw(rng);
  const u1 = r.value;
  r = draw(r.rng);
  const u2 = r.value;
  // Semis venu du hors-parcelle : position uniforme (vent/oiseaux depuis la lisière).
  if (!parent) return { rng: r.rng, x: u1 * coteM, y: u2 * coteM };

  switch (espece.regeneration.dissemination) {
    case "oiseaux":
      // Avec les fientes : n'importe où sur la parcelle.
      return { rng: r.rng, x: u1 * coteM, y: u2 * coteM };
    case "geai": {
      // Le geai cache ses glands loin du parent, et surtout EN DÉCOUVERT :
      // il doit pouvoir les retrouver. On tire quelques emplacements et on
      // garde le plus ouvert — c'est ce biais, et non une règle sur les
      // chênes, qui les fait coloniser les friches et se régénérer mal sous
      // leur propre couvert.
      let meilleur = { x: u1 * coteM, y: u2 * coteM, lumiere: -1 };
      let etat = r.rng;
      for (let essai = 0; essai < 4; essai++) {
        const a = draw(etat);
        const b = draw(a.rng);
        etat = b.rng;
        const x = a.value * coteM;
        const y = b.value * coteM;
        const cellule = Math.floor(y) * coteM + Math.floor(x);
        const lumiere = lumiereAuSol[cellule] ?? 1;
        if (lumiere > meilleur.lumiere) meilleur = { x, y, lumiere };
      }
      return { rng: etat, x: meilleur.x, y: meilleur.y };
    }
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
  const { trees, coteM, voisinage, partOmbrageante } = input;
  let rng = input.rng;
  let nextTreeId = input.nextTreeId;
  const newTrees: TreeState[] = [];
  // Place déjà prise par les couronnes, m². Les semis qu'on ajoute comptent
  // aussi : c'est ce qui empêche une année exceptionnelle d'en installer mille.
  let couronnesM2 = 0;
  const surfaceM2 = coteM * coteM;
  const placeMaxM2 = RECOUVREMENT_MAX * surfaceM2;
  for (const t of trees) {
    if (!t.alive) continue;
    const r = crownRadiusM(t.heightM, getEspece(t.especeId).lumiere.houppierRatio);
    couronnesM2 += Math.PI * r * r;
  }

  const tryEstablish = (especeId: string, parent: TreeState | null) => {
    const espece = getEspece(especeId);
    const pos = drawPosition(rng, espece, parent, coteM, input.lumiereAuSol);
    rng = pos.rng;
    if (couronnesM2 >= placeMaxM2) return;
    if (pos.x < 0 || pos.x >= coteM || pos.y < 0 || pos.y >= coteM) return; // perdu hors parcelle
    // Filtres écologiques : lumière ≥ 2 × compensation, pH dans la gamme.
    if (lightAtPoint(trees, pos.x, pos.y, partOmbrageante) < 2 * espece.lumiere.compensation)
      return;
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
    couronnesM2 += Math.PI * crownRadiusM(SEEDLING_HEIGHT_M, espece.lumiere.houppierRatio) ** 2;
    // Un semis naturel a sa vigueur propre, comme un plant de pépinière.
    const tirageVigueur = tirerVigueurIndividuelle(rng);
    rng = tirageVigueur.rng;
    newTrees.push({
      vigueurIndividuelle: tirageVigueur.vigueur,
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
      rootDepthCm: 20,
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
      recepages: 0,
    });
  };

  /**
   * Combien de tentatives cette année : la partie entière, plus une de plus
   * avec la probabilité de la décimale. Sans ça, un taux inférieur à 1 ne
   * produirait jamais rien — or c'est le régime normal des espèces dont les
   * graines sont lourdes et convoitées, qui ne placent pas un semis par pied
   * et par an.
   */
  const tentatives = (taux: number): number => {
    const entier = Math.floor(taux);
    const reste = taux - entier;
    if (reste <= 0) return entier;
    const r = rngFloat(rng);
    rng = r.state;
    return entier + (r.value < reste ? 1 : 0);
  };

  // 1. Pluie de semis du paysage voisin (non contrôlable, docs/regles.md §8).
  for (const v of voisinage) {
    const n = tentatives(v.semisParAn);
    for (let k = 0; k < n; k++) tryEstablish(v.especeId, null);
  }

  // 2. Semis des adultes de la parcelle en âge de grainer.
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    if (tree.ageWeeks < espece.regeneration.maturiteAns * 52) continue;
    const n = tentatives(espece.regeneration.semisParAn);
    for (let k = 0; k < n; k++) tryEstablish(tree.especeId, tree);
  }

  return { newTrees, rng, nextTreeId };
}
