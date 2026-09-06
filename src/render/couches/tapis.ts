/**
 * Le tapis : les brins d'herbe, les feuilles et la terre à nu qui font qu'un
 * sol a une matière (docs/interface-visuelle.md §5.1).
 *
 * **Le grain ne suffisait pas, et le retour était sans appel** : « il n'y a pas
 * de texture d'herbe, il n'y a d'ailleurs pas de texture tout court ». C'est
 * juste. Le grain module la clarté de quelques pour cent — il enlève l'aspect
 * plastique, il ne fabrique pas de matière. Une matière, ce sont des MARQUES :
 * des touffes qui se détachent, des feuilles posées, des plaques de terre nue
 * entre les herbes. Sans marques, un sol reste une nappe de couleur.
 *
 * **Trois motifs, et chacun est commandé par une grandeur du moteur** — c'est ce
 * qui empêche le tapis d'être de la décoration :
 *
 * - la **touffe** suit `soilHerbe`. Là où la couverture est haute, les touffes
 *   sont serrées ; là où elle a chuté, le sol se dénude et on le voit ;
 * - la **feuille** suit `soilLitiereCG`. Sous un fourré, où la litière monte à
 *   trois mille grammes de carbone au mètre carré, le tapis est continu ;
 * - la **terre à nu** apparaît là où NI l'une NI l'autre ne couvre — c'est un
 *   complément, pas une quatrième donnée. Une cellule sèche et rase montre son
 *   sol, et c'est exactement ce que le moteur dit d'elle.
 *
 * **Rien n'est semé au hasard.** La position de chaque brin sort d'un hachage
 * de ses coordonnées : `Math.random` est interdit dans `src/render` (§8), et
 * surtout un tapis qui bougerait d'une image à l'autre grouillerait. Il est
 * attaché au terrain, donc il ne glisse pas quand la caméra tourne.
 *
 * **Le tapis ne se dessine que de près.** À la parcelle entière, un brin fait
 * moins d'un pixel : le semer là ne donnerait pas de la matière mais du
 * fourmillement — le camouflage dont on vient de sortir. Il apparaît avec le
 * zoom, en même temps que le grain, et pour la même raison.
 *
 * Module **pur** : il dit QUOI dessiner et OÙ. Le tracé est dans `terrain.ts`,
 * au moment de la cuisson — donc jamais par image.
 */

import type { CelluleQuantifiee } from "../palette";
import { partDuPalier } from "../palette";

/** Ce qu'un brin représente. */
export type Motif = "touffe" | "feuille" | "terre";

export interface Brin {
  /** position dans la parcelle, en mètres (nord vrai) */
  x: number;
  y: number;
  motif: Motif;
  /** taille relative ∈ [0,6 ; 1,4] : deux touffes voisines ne font pas la même */
  taille: number;
  /**
   * Nombre de lames d'une touffe, 2 à 4.
   *
   * **Toutes les touffes avaient exactement trois lames, écartées des mêmes
   * angles** : le motif se répétait à l'identique sur toute la parcelle et le
   * sol se lisait comme un papier peint — un même glyphe tamponné en grille.
   * C'est le défaut que le retour appelait « on dirait un ordinateur qui simule
   * une forêt », et il tient à la RÉPÉTITION plus qu'au dessin.
   */
  lames: number;
  /** orientation, radians — une touffe penche, une feuille est posée de travers */
  angle: number;
  /**
   * Écart de clarté propre au brin, autour de 1.
   *
   * Deux feuilles voisines ne sont jamais du même brun : l'une vient de tomber,
   * l'autre a passé l'hiver. Sans cet écart, le tapis sort au pochoir — toutes
   * les marques d'un même motif exactement de la même couleur, ce qui se voit
   * tout de suite et fait synthétique.
   */
  nuance: number;
}

/**
 * Largeur de tuile, en pixels, à partir de laquelle on sème le tapis.
 *
 * Le même seuil que le grain : en dessous, un brin est sous le pixel.
 */
export const TAPIS_DES_PX = 26;
/** Largeur de tuile à partir de laquelle le tapis est à densité pleine. */
export const TAPIS_PLEIN_PX = 90;

/**
 * Nombre de brins par mètre carré à densité pleine.
 *
 * **Sept était le compte d'une FRICHE, pas d'une pelouse**, et c'est ce qui
 * ratait le critère « à couverture 100 % on doit voir une pelouse ». Le
 * raisonnement d'origine — « assez peu pour qu'on distingue encore les marques
 * les unes des autres » — décrit une lande où des touffes se détachent sur du
 * sol nu. Un gazon est le contraire : c'est un COUVERT, et ce qu'on y distingue
 * n'est pas la touffe individuelle mais un grain serré et continu.
 *
 * Quinze, avec des marques deux fois plus petites (`dessinerBrin`) : la
 * surface d'encre change à peine — donc le coût de cuisson non plus — mais le
 * sol cesse de se lire comme des objets posés dessus.
 */
export const BRINS_PAR_M2 = 15;

/** Hachage entier → [0,1[, stable et sans allocation. Le même que le grain. */
function hacher(a: number, b: number, sel: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Densité du tapis pour une taille de tuile écran : nulle de loin, pleine de près. */
export function densiteTapis(largeurTuilePx: number): number {
  if (largeurTuilePx <= TAPIS_DES_PX) return 0;
  if (largeurTuilePx >= TAPIS_PLEIN_PX) return 1;
  const t = (largeurTuilePx - TAPIS_DES_PX) / (TAPIS_PLEIN_PX - TAPIS_DES_PX);
  return t * t * (3 - 2 * t);
}

/**
 * Quel motif tirer, pour une cellule donnée et un tirage ∈ [0,1[.
 *
 * Les trois parts se partagent l'intervalle : l'herbe d'abord, la litière
 * ensuite, la terre à nu pour le reste. Une cellule couverte d'herbe et de
 * litière ne montre donc jamais de terre, et c'est ce qu'on veut — la terre nue
 * n'est pas un troisième matériau qu'on ajoute, c'est ce qui reste quand les
 * deux autres ne couvrent pas.
 */
export function motifDuTirage(cellule: CelluleQuantifiee, tirage: number): Motif {
  // **`partDuPalier` et non `valeurDuPalier`**, et c'est toute la correction.
  // Celle-là rend le milieu d'une bande, ce qui convient pour interpoler une
  // couleur mais jamais pour décider si l'on sème une marque : elle ne rend ni
  // 0 ni 1. Une pelouse annoncée à 100 % de couverture gardait donc des plaques
  // de terre nue, et une cellule sans la moindre litière était semée de
  // feuilles mortes — les deux visibles sur le banc de pelouse, et aucune des
  // deux n'était dans la donnée. Une feuille est là ou n'est pas là.
  const herbe = partDuPalier(cellule.herbe);
  const litiere = partDuPalier(cellule.litiere);
  // La litière recouvre l'herbe (elle lui tombe dessus, cf. `couleurSol`), donc
  // elle prend sa part d'abord sur ce qui reste après elle.
  const partFeuille = litiere;
  const partTouffe = herbe * (1 - litiere);
  if (tirage < partFeuille) return "feuille";
  if (tirage < partFeuille + partTouffe) return "touffe";
  return "terre";
}

/**
 * Les brins d'une cellule. Pure et déterministe : la même cellule rend
 * toujours les mêmes brins, aux mêmes places.
 *
 * `densite` ∈ [0,1] vient du zoom (`densiteTapis`). Le nombre de brins est
 * arrondi de façon DÉTERMINISTE et non stochastique — un arrondi au hasard
 * ferait apparaître et disparaître des brins pendant un zoom continu.
 */
export function brinsDeLaCellule(
  x: number,
  y: number,
  cellule: CelluleQuantifiee,
  densite: number,
): Brin[] {
  if (densite <= 0) return [];
  const combien = Math.round(BRINS_PAR_M2 * densite);
  const brins: Brin[] = [];
  for (let i = 0; i < combien; i++) {
    const a = hacher(x * 131 + i, y, 0x5bd1);
    const b = hacher(x, y * 131 + i, 0x9e37);
    const c = hacher(x + i, y + i, 0x1b7f);
    const d = hacher(x * 7 + i, y * 13, 0x33c1);
    brins.push({
      x: x + a,
      y: y + b,
      motif: motifDuTirage(cellule, c),
      taille: 0.6 + d * 0.8,
      lames: 2 + Math.floor(hacher(x * 41 + i, y * 7, 0x6c19) * 3),
      nuance: 1 + (hacher(x * 17 + i, y * 29, 0x2b45) - 0.5) * 0.18,
      // Les touffes penchent peu, les feuilles se posent n'importe comment.
      angle: (hacher(x + 3 * i, y + 5 * i, 0x77e1) - 0.5) * Math.PI,
    });
  }
  // Du plus lointain au plus proche dans la cellule : un brin devant recouvre
  // celui de derrière, comme partout ailleurs dans cette vue.
  brins.sort((p, q) => p.x + p.y - (q.x + q.y));
  return brins;
}

/**
 * Écart de clarté d'un brin par rapport au sol qui le porte.
 *
 * Une touffe est plus claire que la terre entre les herbes — c'est la lumière
 * qui accroche le haut du brin —, une feuille à peine plus sombre, une plaque
 * de terre un peu moins. Ces trois écarts sont ce qui fait qu'on lit trois
 * matières et non trois taches de la même couleur.
 *
 * **La plaque de terre était trop marquée, et la capture l'a montré crûment :**
 * à 0,82, les marques de terre sortaient en ellipses franchement sombres, toutes
 * de la même taille, et le sol se lisait comme un gravier. C'est le contresens
 * exact du module — la terre à nu n'est pas un objet POSÉ sur le sol, c'est le
 * sol lui-même là où rien ne le couvre. Elle doit à peine se distinguer : ce
 * qu'on veut voir, c'est qu'il n'y a rien dessus.
 */
export function clarteDuMotif(motif: Motif): number {
  // 1,07 et non 1,12 : quinze marques par mètre carré au lieu de sept, il faut
  // que chacune pèse moins, sinon le gazon scintille au lieu de faire nappe.
  if (motif === "touffe") return 1.07;
  if (motif === "feuille") return 0.94;
  return 0.9;
}
