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
import type { GridDims, GrilleLue } from "./grid";
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
 * Ce que le réseau **n'apporte pas**, et pourquoi.
 *
 * J'avais d'abord modélisé le gain comme une extension du rayon prospecté
 * (+15 %). C'était doublement faux. Faux physiquement : les hyphes explorent
 * les **pores** que les racines ne peuvent pas atteindre, pas un disque plus
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
  reseau: GrilleLue,
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

// ── Le minage de l'azote organique (#289) ───────────────────────────────────
//
// **Ce que le réseau n'apportait pas, et qui manquait au pin.** Jusqu'ici une
// mycorhize ne faisait que rendre le prélèvement **minéral** plus efficace.
// Or les plantes d'un mor prennent l'azote **organique** directement :
// Näsholm et al. 1998 (Nature) injectent de la glycine marquée dans la couche
// de mor d'une forêt boréale, et le pin sylvestre en prélève l'azote sous
// forme de glycine intacte — les plantes du mor « bypass nitrogen
// mineralization ». Le champignon décompose l'humus pour en tirer l'azote et
// le livre à son hôte avant que les microbes ne le minéralisent.
//
// **Pourquoi ça manquait sans que rien ne le montre** : un humus compté comme
// un mull (C/N 11) fabriquait assez d'azote minéral pour nourrir le pin, et un
// lessivage qui emportait l'ammonium jetait l'excès. Les deux erreurs se
// compensaient ; #280 a retiré la seconde, et déclarer le vrai mor a retiré la
// première en laissant le pin sans le mécanisme qu'elle remplaçait.

/**
 * **Ce que le minage intercepte**, en part de la minéralisation nette.
 *
 * **Un plancher, pas un plafond** — et la première version de ce commentaire
 * disait l'inverse. L'écart entre minéralisation brute et nette ne mesure que
 * ce que les microbes réimmobilisent : par dilution isotopique en couche
 * organique forestière, brut 10,9 à 11,1 mg N/kg/j contre net 6,1 à 6,8, soit
 * un rapport de 1,6 à 1,8, d'où un **minimum de 0,7**. Or le champignon prend
 * des acides aminés **avant** qu'ils soient même comptés dans la minéralisation
 * brute : Schimel et Bennett 2004 (Ecology) établissent que c'est la
 * **dépolymérisation**, non la minéralisation, qui limite le cycle de l'azote,
 * et que les plantes entrent en concurrence pour les acides aminés. Ce qu'une
 * ectomycorhize peut prendre excède donc l'écart brut/net, d'une quantité
 * qu'aucune source trouvée ne borne.
 *
 * **D'où un calage, et il est déclaré** : faute de plafond, la valeur est calée
 * sur la table de Jansen à **quarante ans** pour le pin, avec le plancher de 0,7
 * comme contrainte, et la hauteur à **vingt ans** tenue à l'écart comme
 * validation — la règle du dépôt, celle-là même qui régit `pousseMaxMAn`. Si le
 * pin sortait de sa tolérance à vingt ans, c'est le mécanisme qui tomberait.
 */
export const EXCES_BRUT_SUR_NET = 1.5;

/**
 * C/N à partir duquel l'humus est un mor, et le minage pleinement actif.
 *
 * La typologie des humus : mull voisin de 10, moder 15 à 25, mor « toujours
 * plus de 20, ou même 30 à 40 ». Le bas du mor est donc 25.
 */
export const CN_MOR = 25;

/**
 * **La porte du minage** ∈ [0,1], lue sur le C/N déclaré du sol.
 *
 * Sur un **mull**, l'azote se minéralise librement et les arbres le prennent
 * sous forme minérale : le champignon n'a rien à miner. Sur un **mor**, il
 * reste bloqué dans la matière organique, et c'est là que le minage devient la
 * voie principale — c'est le contraste mull/mor de la typologie, et la raison
 * pour laquelle les mycorhizes ecto et éricoïdes dominent les mors.
 *
 * **Conséquence voulue** : sur toutes les stations limoneuses du dépôt, dont
 * l'humus est un mull à C/N 11, la porte vaut zéro et **rien ne bouge**. Le
 * hêtre, le chêne, le charme et le bouleau, calés sur le limon riche, sont
 * intacts par construction.
 */
export function porteMinage(cnHumus: number, cnMull: number): number {
  return Math.min(1, Math.max(0, (cnHumus - cnMull) / (CN_MOR - cnMull)));
}

/**
 * L'azote organique qu'une cellule offre aux arbres ectomycorhiziens cette
 * semaine, en grammes.
 *
 * Il se lit sur ce que l'humus y minéralise déjà (`humusPerteCG`, le carbone
 * décomposé cette semaine), au C/N du sol, étendu de l'écart brut/net, et
 * pondéré par le réseau présent dans la cellule. Un semis dont le réseau n'est
 * pas tissé n'y a pas accès ; un adulte, si. C'est cette dépendance à la
 * taille qui doit corriger à la fois le pin trop rapide en jeunesse et trop
 * lent à l'âge adulte — la prédiction qui rend le mécanisme réfutable.
 */
export function offreMinageG(
  humusPerteCG: number,
  cnHumus: number,
  cnMull: number,
  reseauEcto: number,
): number {
  const porte = porteMinage(cnHumus, cnMull);
  if (porte <= 0 || humusPerteCG <= 0) return 0;
  const reseau = Math.min(1, Math.max(0, reseauEcto));
  return (humusPerteCG / cnHumus) * EXCES_BRUT_SUR_NET * porte * reseau;
}
