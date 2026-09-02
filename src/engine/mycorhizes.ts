/**
 * Réseaux mycorhiziens (docs/regles.md §7.5, ch2-B ; critère C12).
 *
 * Un arbre ne prospecte pas le sol tout seul : ses radicelles sont colonisées
 * par des champignons dont le mycélium explore un volume de terre sans commune
 * mesure avec celui des racines, et lui livre eau et nutriments en échange de
 * sucres. Ce réseau ne s'installe pas en un jour — il se construit sur des
 * années, à partir des hôtes présents — et il ne survit pas au labour.
 *
 * Deux choses en découlent, qui manquaient au jeu :
 *  - **planter dans un sol forestier ancien n'a rien à voir avec planter dans
 *    un labour** : le premier offre un réseau déjà tissé, le second oblige le
 *    plant à attendre que le sien se fasse ;
 *  - **le labour coûte pendant des années**, pas seulement l'année où on le
 *    passe. C'est le vrai prix qu'on ne voit pas sur la facture.
 *
 * La compatibilité compte : trois grands types qui ne se remplacent pas. Un
 * chêne ne profite pas du réseau d'une lande à bruyères, et réciproquement.
 *
 * Non modélisé : le transfert de carbone entre arbres par le réseau (le
 * « wood wide web », dont l'ampleur reste discutée), les espèces de
 * champignons, la truffe.
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import type { GridDims } from "./grid";
import { forEachDiscCell } from "./grid";
import { rootRadiusM, type TreeState } from "./trees";

/**
 * Les trois grands types, incompatibles entre eux.
 *  - `ecto` : la plupart des arbres forestiers tempérés (chênes, hêtre, pins,
 *    bouleau, noisetier — l'hôte de la truffe) ;
 *  - `arbusculaire` : le type le plus répandu au monde, celui des fruitiers,
 *    des légumineuses et de la plupart des herbacées ;
 *  - `ericoide` : celui des landes, propre aux éricacées, adapté aux sols
 *    acides et pauvres où il va chercher l'azote organique.
 */
export type TypeMycorhize = "ecto" | "arbusculaire" | "ericoide";

export const TYPES_MYCORHIZE: readonly TypeMycorhize[] = ["ecto", "arbusculaire", "ericoide"];

/**
 * Vitesse d'installation, par semaine : il faut de l'ordre de cinq ans pour
 * qu'un réseau soit pleinement fonctionnel sous un jeune peuplement
 * *(à calibrer)*.
 */
export const VITESSE_INSTALLATION = 0.004;

/** Ce qui subsiste d'un réseau après un labour : les hyphes sont tranchées. */
export const SURVIE_APRES_LABOUR = 0.05;

/**
 * Ce que le réseau N'APPORTE PAS, et pourquoi.
 *
 * J'avais d'abord modélisé le gain comme une extension du rayon prospecté
 * (+15 %). C'était doublement faux. Faux physiquement : les hyphes explorent
 * les PORES que les racines ne peuvent pas atteindre, pas un disque plus
 * grand — leur bénéfice est une efficacité d'absorption, surtout pour les
 * éléments peu mobiles. Et faux dans ses effets : élargir uniformément les
 * disques racinaires dilue l'asymétrie de compétition entre dominants et
 * dominés, au point que le hêtre n'atteignait plus la canopée à deux cents
 * ans — un comportement que le moteur produisait pourtant depuis longtemps.
 *
 * Le gain sur l'eau et le phosphore attend donc le cycle du phosphore ; ici,
 * le réseau agit sur l'azote, où l'effet est direct et mesurable.
 */

/** Gain maximal sur la capacité de prélèvement d'azote *(à calibrer)*. */
export const GAIN_ABSORPTION = 0.3;

/**
 * État visé par le réseau d'un type donné dans chaque cellule : il se construit
 * là où des hôtes compatibles sont installés, et reflue là où ils manquent.
 */
export function cibleReseau(
  trees: readonly TreeState[],
  type: TypeMycorhize,
  dims: GridDims,
  out?: Float64Array,
): Float64Array {
  const n = dims.widthM * dims.heightM;
  const cible = out ?? new Float64Array(n);
  cible.fill(0);
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    if (espece.mycorhize !== type) continue;
    // Un gros arbre entretient un réseau plus dense qu'un semis.
    const apport = Math.min(1, tree.heightM / 8);
    // Le mycélium suit les racines et les déborde — pas la couronne : c'est
    // sous terre que ça se passe.
    const r = rootRadiusM(espece, tree.heightM);
    forEachDiscCell(dims, tree.x, tree.y, r, (i) => {
      cible[i] = Math.min(1, (cible[i] ?? 0) + apport);
    });
  }
  return cible;
}

/** Le réseau rejoint sa cible lentement, dans les deux sens. */
export function prochainReseau(actuel: number, cible: number): number {
  return actuel + (cible - actuel) * VITESSE_INSTALLATION;
}

/**
 * Développement moyen du réseau sous la couronne d'un arbre : ce à quoi il est
 * réellement connecté.
 */
export function reseauSousArbre(
  reseau: readonly number[],
  tree: TreeState,
  espece: EspeceV0,
  dims: GridDims,
): number {
  let somme = 0;
  let n = 0;
  forEachDiscCell(dims, tree.x, tree.y, rootRadiusM(espece, tree.heightM), (i) => {
    somme += reseau[i] ?? 0;
    n++;
  });
  return n > 0 ? somme / n : 0;
}

/** Gain d'absorption d'azote d'un arbre connecté. */
export function facteurAbsorption(reseau: number): number {
  return 1 + GAIN_ABSORPTION * Math.min(1, Math.max(0, reseau));
}
