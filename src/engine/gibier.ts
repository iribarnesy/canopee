/**
 * Le gibier (docs/regles.md §7.4, ch4-C ; critère G1).
 *
 * C'est la première cause d'échec des plantations, avant la sécheresse et
 * avant l'herbe : un chevreuil mange un rameau de l'année, et le plant qui
 * perd sa flèche chaque printemps n'échappe jamais à la hauteur de dent.
 *
 * Ce qui est modélisé, et comment :
 *  - les cervidés ne sont PAS une population de la parcelle. Leur domaine
 *    vital fait des dizaines d'hectares : le paysage alentour impose une
 *    densité (`station.gibierParHa`, une donnée de contexte au même titre que
 *    le voisinage semencier ou l'exposition au vent), et la parcelle en reçoit
 *    la part que son attrait justifie ;
 *  - le broutage est LOCAL et se compte en kilos de matière sèche, pas en
 *    pourcentages : chaque cellule offre un fourrage (herbe + rameaux tendres
 *    à hauteur de dent), le gibier s'y répartit au prorata de ce qu'elle offre
 *    et de l'abri qu'elle donne, et chaque arbre perd la longueur de pousse
 *    qu'on lui a mangée ;
 *  - la sélectivité fait le reste : à densité égale, un noisetier est vidé
 *    quand un pin est ignoré. C'est ainsi que le gibier réoriente la
 *    composition d'une régénération sans qu'on ait rien codé pour.
 *
 * Non modélisés en V1 : frottis des brocards sur les tiges, écorçage du cerf,
 * sanglier (retournement du sol et consommation des glands), chasse.
 */

import { getEspece } from "./especes";
import type { TreeState } from "./trees";

/**
 * Hauteur de dent, m : au-delà, la flèche est hors d'atteinte et le plant est
 * « sorti ». C'est tout l'enjeu d'une protection — tenir jusque-là.
 */
export const HAUTEUR_BROUTAGE_M = 1.5;

/**
 * Consommation d'un cervidé, kg de matière sèche par semaine.
 * Un chevreuil mange ~1,3 kg MS/jour *(à calibrer ; « équivalent chevreuil »
 * pour ne pas avoir à distinguer les espèces en V1)*.
 */
export const CONSO_KG_SEMAINE = 9;

/** Matière sèche d'un mètre de pousse tendre, kg *(à calibrer)*. */
export const KG_PAR_M_POUSSE = 0.05;

/** Matière sèche offerte par une cellule d'herbe entièrement couverte, kg/m²/semaine en pleine saison. */
export const HERBE_KG_M2_SEMAINE = 0.06;

/**
 * Part de la ration cherchée en rameaux ligneux. C'est LE point qui décide de
 * tout : un chevreuil est un « cueilleur sélectif », pas un brouteur d'herbe.
 * Il va chercher le ligneux et les plantes à feuilles larges ; l'herbe ne fait
 * qu'une petite part de son régime. Se répartir au prorata de la masse
 * disponible donnerait le résultat inverse — il y a cinquante fois plus
 * d'herbe que de rameaux sur une friche, et aucune plantation ne serait jamais
 * inquiétée, ce que le terrain dément *(régime : ~2/3 de ligneux et de
 * dicotylédones, à calibrer)*.
 */
export const PART_LIGNEUX_RATION = 0.65;

/**
 * Densité de rameaux, kg MS/ha, à laquelle le gibier prélève la moitié de sa
 * ration ligneuse sur place (demi-saturation d'une réponse fonctionnelle de
 * type II).
 *
 * C'est ce qui distingue « il y a du gibier » de « la plantation est rasée » :
 * chercher une ressource rare coûte du temps. Une régénération dense est un
 * garde-manger et se fait tondre ; quelques plants dispersés dans une friche
 * se font grignoter, mais le gros de la ration se prend ailleurs dans le
 * domaine vital — c'est pour ça qu'une plantation clairsemée n'est pas rasée
 * en une saison *(à calibrer)*.
 */
export const DEMI_SATURATION_KG_HA = 5;

/**
 * Fourrage d'une cellule à partir duquel le gibier commence à s'y attarder,
 * kg MS (demi-saturation d'une réponse fonctionnelle). En dessous, chercher
 * coûte plus que ça ne rapporte : c'est ce qui empêche un troupeau de raser
 * en une semaine tout ce qui reste et laisse toujours des rescapés.
 */
export const DEMI_SATURATION_KG = 0.004;

/** Part de la pousse tendre qui lignifie chaque semaine (elle cesse d'être appétente). */
export const LIGNIFICATION_PAR_SEMAINE = 0.05;

/** Le gibier fréquente d'autant plus une cellule qu'elle offre du couvert. */
const ABRI_NU = 0.45;

/**
 * Part de ce que le gibier avale qui repart en respiration (CO₂). Le reste
 * revient au sol en déjections — un herbivore ne fait pas disparaître le
 * carbone ni l'azote, il les déplace et les concentre. Digestibilité d'un
 * régime de rameaux : ~60 % *(à calibrer)*.
 */
export const DIGESTIBILITE = 0.6;

/**
 * Ce qu'une journée de chasse retire à la pression locale.
 *
 * Peu, et pas longtemps — c'est le point. Prélever sur un hectare ne change
 * rien à une population dont le domaine vital en fait cinquante : le vide
 * créé se remplit par les voisins en quelques mois. C'est le phénomène
 * d'**immigration compensatoire**, et c'est pour ça que la régulation du
 * gibier se décide à l'échelle d'un massif (le plan de chasse), pas d'une
 * parcelle *(à calibrer)*.
 */
export const EFFET_CHASSE = 0.25;

/** Part du vide qui se comble chaque semaine par immigration des voisins. */
export const RETOUR_IMMIGRATION = 0.03;

/** Un plant plusieurs fois rabattu et resté minuscule finit par mourir. */
export const HAUTEUR_LETALE_M = 0.12;

/**
 * Frottis et écorçage : les dégâts qui n'ont rien à voir avec la faim.
 *
 * Passer la hauteur de dent ne met pas un arbre hors d'atteinte, contrairement
 * à ce que le moteur supposait. Au printemps, les brocards **frottent** leurs
 * bois sur les jeunes tiges pour en retirer le velours et marquer leur
 * territoire : ils choisissent les sujets isolés, bien visibles, à écorce lisse
 * et souple, entre un et quatre mètres. En fin d'hiver, les cerfs **écorcent**
 * les perches pour manger le liber. Dans les deux cas, si la blessure fait le
 * tour, l'arbre est annelé et meurt.
 *
 * Deux conséquences de jeu : la protection individuelle sert bien plus
 * longtemps qu'on ne croyait, et planter dense dilue le risque — un arbre seul
 * au milieu d'un pré est une cible désignée.
 */

/** Hauteurs entre lesquelles une tige est à la bonne taille pour le frottis, m. */
export const FROTTIS_HAUTEUR_MIN_M = 1.2;
export const FROTTIS_HAUTEUR_MAX_M = 5;

/** Semaines de frottis : le printemps, quand les brocards refont leurs bois. */
export const FROTTIS_SEMAINES: readonly [number, number] = [12, 24];

/** Frottis par cervidé et par an *(à calibrer)*. */
export const FROTTIS_PAR_CERVIDE_AN = 12;

/** Points de stress d'un frottis sur une tige déjà solide. */
export const FROTTIS_DEGAT = 3.5;

/**
 * En dessous de cette hauteur, la tige est si fine que la blessure en fait le
 * tour : l'arbre est annelé et meurt. Au-dessus, il survit avec une plaie —
 * c'est le cas le plus fréquent, un frottis n'est pas une condamnation.
 */
export const FROTTIS_HAUTEUR_LETALE_M = 1.6;

export interface Frottis {
  treeId: number;
  /** l'arbre est-il annelé ? */
  mort: boolean;
}

/**
 * Attrait d'une tige pour un brocard : la bonne taille, une écorce lisse, et
 * surtout de l'ISOLEMENT — c'est un marquage de territoire, il vise ce qui se
 * voit. Une tige noyée dans un fourré n'intéresse personne.
 */
export function attraitFrottis(
  tree: TreeState,
  voisinsProches: number,
  resistanceEcorce: number,
): number {
  if (tree.protege || !tree.alive) return 0;
  if (tree.heightM < FROTTIS_HAUTEUR_MIN_M || tree.heightM > FROTTIS_HAUTEUR_MAX_M) return 0;
  // Écorce épaisse et crevassée (pin, chêne-liège) : sans intérêt.
  const ecorce = 1 - Math.min(1, resistanceEcorce);
  const isolement = 1 / (1 + voisinsProches);
  return ecorce * isolement;
}

export interface BroutageCellule {
  /** herbe consommée, en fraction de couverture */
  herbeConsommee: number;
}

export interface BroutageArbre {
  /** longueur de pousse mangée, m */
  pousseMangeeM: number;
  /** le plant est-il rabattu sous la hauteur de survie ? */
  mort: boolean;
}

export interface ResultatBroutage {
  parCellule: BroutageCellule[];
  parArbre: Map<number, BroutageArbre>;
  /** matière sèche réellement prélevée sur la parcelle, kg */
  preleveKg: number;
}

/** Rayon dans lequel un voisin « masque » une tige, m. */
export const FROTTIS_RAYON_VOISINAGE_M = 3;

/**
 * Désigne les tiges frottées de la semaine. Entièrement déterministe : les
 * brocards vont aux tiges les plus exposées, dans l'ordre.
 */
export function frottisDeLaSemaine(
  trees: readonly TreeState[],
  densiteParHa: number,
  surfaceHa: number,
  week: number,
  semaineAbsolue: number,
  resistanceEcorce: (especeId: string) => number,
  estEnclos?: (tree: TreeState) => boolean,
): Frottis[] {
  const [debut, fin] = FROTTIS_SEMAINES;
  if (week < debut || week > fin) return [];
  const semaines = fin - debut + 1;
  const budget = (densiteParHa * surfaceHa * FROTTIS_PAR_CERVIDE_AN) / semaines;
  if (budget <= 0) return [];

  const candidats: { tree: TreeState; attrait: number }[] = [];
  for (const tree of trees) {
    let voisins = 0;
    for (const autre of trees) {
      if (autre.id === tree.id || !autre.alive) continue;
      const dx = autre.x - tree.x;
      const dy = autre.y - tree.y;
      if (dx * dx + dy * dy <= FROTTIS_RAYON_VOISINAGE_M * FROTTIS_RAYON_VOISINAGE_M) voisins++;
    }
    // Une clôture arrête les bois autant que les dents.
    if (estEnclos?.(tree)) continue;
    // Une tige marquée dans l'année ne l'est pas deux fois : le brocard a fait
    // son territoire, il passe à la suivante.
    if (tree.frotteSemaine !== undefined && semaineAbsolue - tree.frotteSemaine < 52) continue;
    const attrait = attraitFrottis(tree, voisins, resistanceEcorce(tree.especeId));
    if (attrait > 0) candidats.push({ tree, attrait });
  }
  candidats.sort((a, b) => b.attrait - a.attrait || a.tree.id - b.tree.id);
  // Le budget est fractionnaire : la partie décimale décide s'il y a une tige
  // de plus cette semaine, sans tirage au sort (la semaine suffit à varier).
  const nombre =
    Math.floor(budget) + (week % Math.max(2, Math.round(1 / (budget % 1 || 1))) === 0 ? 1 : 0);
  return candidats.slice(0, Math.max(0, nombre)).map(({ tree }) => ({
    treeId: tree.id,
    mort: tree.heightM < FROTTIS_HAUTEUR_LETALE_M,
  }));
}

/** Un arbre est-il à portée de dent ? */
export function aPorteeDeDent(tree: TreeState): boolean {
  return tree.alive && tree.heightM <= HAUTEUR_BROUTAGE_M && !tree.protege;
}

/**
 * Répartit la pression de broutage de la semaine sur les cellules, puis sur
 * les individus qu'elles contiennent.
 *
 * @param densiteParHa densité du paysage, cervidés/ha (contexte de la station)
 * @param saison ∈ [0,1] : disponibilité de l'herbe (nulle en hiver, ce qui
 *        reporte toute la pression sur les rameaux — d'où les dégâts d'hiver)
 *
 * Entièrement déterministe : la sélectivité et la répartition suffisent à
 * produire de la variété, sans tirage au sort.
 */
export function brouter(
  trees: readonly TreeState[],
  herbeCouverture: readonly number[],
  couvertArbore: readonly number[],
  coteM: number,
  densiteParHa: number,
  saison: number,
  cloture?: readonly boolean[],
): ResultatBroutage {
  const nCells = coteM * coteM;
  const parCellule: BroutageCellule[] = new Array(nCells);
  for (let i = 0; i < nCells; i++) parCellule[i] = { herbeConsommee: 0 };
  const parArbre = new Map<number, BroutageArbre>();
  const surfaceHa = nCells / 10_000;
  const besoinKg = densiteParHa * surfaceHa * CONSO_KG_SEMAINE;
  if (besoinKg <= 0) return { parCellule, parArbre, preleveKg: 0 };

  // 1. Ce que chaque cellule offre, en kilos de matière sèche appétente —
  //    ligneux et herbe comptés séparément, parce qu'ils ne sont pas
  //    interchangeables dans le régime.
  const arbresParCellule = new Map<number, TreeState[]>();
  const fourrageArbres = new Float64Array(nCells);
  for (const tree of trees) {
    if (!aPorteeDeDent(tree)) continue;
    const cell = Math.floor(tree.y) * coteM + Math.floor(tree.x);
    if (cell < 0 || cell >= nCells) continue;
    // Derrière une clôture, il n'y a rien à brouter : les dents n'entrent pas.
    if (cloture?.[cell]) continue;
    const liste = arbresParCellule.get(cell);
    if (liste) liste.push(tree);
    else arbresParCellule.set(cell, [tree]);
    const espece = getEspece(tree.especeId);
    fourrageArbres[cell] =
      (fourrageArbres[cell] ?? 0) + tree.pousseTendreM * KG_PAR_M_POUSSE * espece.gibier.appetence;
  }

  const herbeKg = new Float64Array(nCells);
  const poidsLigneux = new Float64Array(nCells);
  const poidsHerbe = new Float64Array(nCells);
  let totalLigneux = 0;
  let totalHerbe = 0;
  for (let i = 0; i < nCells; i++) {
    herbeKg[i] = cloture?.[i] ? 0 : (herbeCouverture[i] ?? 0) * HERBE_KG_M2_SEMAINE * saison;
    // Le gibier fréquente d'autant plus une cellule qu'elle offre du couvert.
    const abri = ABRI_NU + (1 - ABRI_NU) * Math.min(1, couvertArbore[i] ?? 0);
    // Réponse fonctionnelle : une cellule presque vide ne vaut plus le
    // déplacement — c'est ce qui laisse toujours des rescapés.
    const ligneux = fourrageArbres[i] ?? 0;
    poidsLigneux[i] = ((ligneux * ligneux) / (ligneux + DEMI_SATURATION_KG)) * abri;
    poidsHerbe[i] = (herbeKg[i] ?? 0) * abri;
    totalLigneux += poidsLigneux[i] ?? 0;
    totalHerbe += poidsHerbe[i] ?? 0;
  }
  if (totalLigneux <= 0 && totalHerbe <= 0) return { parCellule, parArbre, preleveKg: 0 };

  // 2. La ration se cherche d'abord en ligneux ; ce que le gibier ne trouve
  //    pas en rameaux, il le complète à l'herbe (il ne jeûne pas pour autant).
  let preleveKg = 0;
  let disponibleLigneux = 0;
  for (let i = 0; i < nCells; i++) disponibleLigneux += fourrageArbres[i] ?? 0;
  const densiteLigneuxKgHa = disponibleLigneux / surfaceHa;
  const efficacite = densiteLigneuxKgHa / (densiteLigneuxKgHa + DEMI_SATURATION_KG_HA);
  const rationLigneux = Math.min(besoinKg * PART_LIGNEUX_RATION * efficacite, disponibleLigneux);
  const rationHerbe = besoinKg - rationLigneux;

  for (let i = 0; i < nCells; i++) {
    const dispoHerbe = herbeKg[i] ?? 0;
    if (totalHerbe > 0 && dispoHerbe > 0) {
      const pris = Math.min(rationHerbe * ((poidsHerbe[i] ?? 0) / totalHerbe), dispoHerbe);
      preleveKg += pris;
      const cellule = parCellule[i];
      if (cellule) cellule.herbeConsommee = (herbeCouverture[i] ?? 0) * (pris / dispoHerbe);
    }
    const dispoLigneux = fourrageArbres[i] ?? 0;
    if (totalLigneux <= 0 || dispoLigneux <= 0) continue;
    const pris = Math.min(rationLigneux * ((poidsLigneux[i] ?? 0) / totalLigneux), dispoLigneux);
    if (pris <= 0) continue;
    preleveKg += pris;
    const fraction = pris / dispoLigneux;
    for (const tree of arbresParCellule.get(i) ?? []) {
      const espece = getEspece(tree.especeId);
      const mangeeM = tree.pousseTendreM * espece.gibier.appetence * fraction;
      if (mangeeM <= 0) continue;
      // Le plant perd ce qu'on lui a mangé. Rabattu sous la hauteur de
      // survie, il n'a plus assez de feuilles pour refaire quoi que ce soit.
      parArbre.set(tree.id, {
        pousseMangeeM: mangeeM,
        mort: tree.heightM - mangeeM < HAUTEUR_LETALE_M,
      });
    }
  }
  return { parCellule, parArbre, preleveKg };
}
