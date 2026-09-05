/**
 * Les ombres portées au sol (docs/interface-visuelle.md §3 et §4).
 *
 * **C'est la couche qui fait qu'un arbre touche le sol.** Sur la capture du lot
 * L0, cinq mille tiges flottaient : sans ombre, un panneau posé sur un losange
 * n'a ni assise ni profondeur, et l'œil ne sait pas si l'arbre est devant ou
 * derrière la butte. Ajouter l'ombre coûte une couche et change tout ; c'est
 * probablement le meilleur rapport entre le travail et l'effet de tout le
 * chantier.
 *
 * **Une seule tache, cuite une fois, posée des milliers de fois.** C'est
 * littéralement la règle que le lot L0 a produite en la mesurant : dessiner
 * 5 017 ellipses par image coûte 73,9 ms à Canvas 2D contre 2,2 ms en sprites,
 * un facteur trente qui ne doit rien au GPU. On cuit donc UNE tache douce, et
 * chaque arbre n'est plus qu'un blit mis à l'échelle. Le corollaire : la tache
 * est ronde à la cuisson, et c'est la mise à l'échelle qui l'aplatit selon
 * l'isométrie — sinon il faudrait une tache par forme d'arbre.
 *
 * **Le soleil est celui du moteur** : plein sud, décalage vers le nord de
 * `SHADOW_NORTH_OFFSET` fois la hauteur (`lumiere.ts`). Une ombre dessinée
 * ailleurs mentirait sur qui ombrage qui.
 */

import { crownRadiusM } from "../../engine/light";
import { type Vue, versEcranVue } from "../camera";
import { directionOmbreEcran, longueurOmbreEcran } from "../lumiere";
import { profondeur, TUILE_HAUTEUR_PX, TUILE_LARGEUR_PX } from "../projection";

/** Côté de la tache cuite, en pixels. Assez pour ne pas pixeliser au zoom. */
export const TAILLE_TACHE_PX = 128;

/**
 * Opacité de l'ombre d'un houppier plein, au plus.
 *
 * Une ombre de feuillage n'est pas noire : sous un couvert dense il reste ~1 %
 * de lumière (`MAX_EXTINCTION` dans `light.ts`), mais l'ombre PORTÉE au sol
 * qu'on dessine est celle d'un seul arbre, et le sol y reste très lisible.
 * 0,32 est un choix de dessin, assumé comme tel.
 */
export const OPACITE_OMBRE = 0.32;

/**
 * Aplatissement de l'ombre : le rapport hauteur/largeur d'un disque posé au
 * sol, vu en dimétrique 2:1. C'est exactement le rapport des tuiles — un
 * disque au sol se projette comme la tuile qui le porte.
 */
export const APLATISSEMENT = TUILE_HAUTEUR_PX / TUILE_LARGEUR_PX;

/** Ce qu'il faut savoir d'un arbre pour poser son ombre. */
export interface ArbreOmbre {
  x: number;
  y: number;
  /** altitude du sol sous l'arbre, m */
  z: number;
  heightM: number;
  /** rapport houppier/hauteur de l'espèce (fiche écologique) */
  houppierRatio: number;
  /**
   * part du feuillage qui intercepte la lumière ∈ [0,1] — `partFoliaireOmbrageante`.
   * Un caduc nu de janvier ne porte pas d'ombre de houppier, et c'est visible.
   */
  partOmbrageante: number;
}

/** Une ombre prête à poser : un blit, rien de plus. */
export interface OmbreAPoser {
  /** centre de la tache, en pixels écran */
  sx: number;
  sy: number;
  largeurPx: number;
  hauteurPx: number;
  /** index de la tache cuite à poser, ∈ [0, DENSITES[ */
  densite: number;
  /** clé de tri, la même que pour le sol et les arbres */
  profondeur: number;
}

/**
 * Nombre de densités d'ombre cuites.
 *
 * Un houppier à moitié sorti porte une ombre à moitié dense, et
 * `partFoliaireOmbrageante` le dit en continu. Mais le mécanisme de saturation
 * ci-dessous interdit de jouer sur l'opacité au moment de poser : on cuit donc
 * quelques taches de densités différentes et on prend la plus proche. Quatre
 * suffisent — l'œil ne distingue pas mieux une ombre de printemps.
 */
export const DENSITES = 4;

/**
 * **Comment cette couche se compose, et pourquoi ce n'est pas évident.**
 *
 * Poser mille ombres translucides les unes sur les autres fait une bouillie
 * noire : chaque couche multiplie la précédente, et un fourré de ronces éteint
 * la parcelle. C'est ce que la première capture de ce lot montrait.
 *
 * Le moteur, lui, sature déjà : `MAX_EXTINCTION` dans `light.ts` dit que les
 * couronnes se chevauchent et laissent des trouées, elles ne s'empilent pas en
 * couches parfaites. Le rendu doit faire pareil, sinon il affiche une
 * obscurité que le modèle ne calcule pas.
 *
 * D'où la marche à suivre, en trois temps :
 *
 * 1. un **masque** de la taille de l'écran, rempli de BLANC ;
 * 2. chaque tache y est posée en `darken` — l'opération garde le minimum, donc
 *    deux ombres superposées ne sont pas plus sombres qu'une seule. C'est la
 *    saturation, obtenue sans compter les recouvrements ;
 * 3. le masque est composé sur la scène en `multiply`, **une fois**.
 *
 * Une seule passe de composition pour toute la couche : c'est aussi la règle
 * « aucune primitive vectorielle par image » respectée jusqu'au bout.
 */
export const MODE_ACCUMULATION = "darken" as const;
export const MODE_COMPOSITION = "multiply" as const;

/**
 * **Et une quatrième étape, qui manquait : borner les ombres au terrain.**
 *
 * Un arbre planté au bord de la parcelle projette son ombre au-delà de la
 * limite. Composée sur toute la surface de l'écran, cette ombre se posait sur
 * le CIEL — d'où une frange grise qui débordait du plateau et le faisait
 * flotter. Le défaut se voyait tout de suite et je ne l'avais pas vu ; il a
 * fallu qu'on me le dise.
 *
 * La correction ne demande pas de découper les ombres une par une, et elle ne
 * demande pas non plus de calque supplémentaire. **C'est le MASQUE qu'on
 * découpe**, une fois qu'il est accumulé :
 *
 * 4. le masque reçoit la silhouette du sol en `destination-in` — il ne reste
 *    du masque que ce qui recouvre quelque chose de solide, le reste devient
 *    transparent.
 *
 * Le `multiply` de l'étape 3 vient alors APRÈS, et hors du sol il ne fait plus
 * rien : une source transparente laisse la destination intacte. C'est ce détail
 * qui interdisait la solution évidente — composer le masque en `source-atop`
 * sur un calque de terrain — car `source-atop` impose le mélange normal et
 * perdrait le `multiply`. Un mode de fusion et un mode de découpe ne peuvent
 * pas tenir dans la même passe ; on les met donc dans deux passes, et la
 * découpe est celle qui coûte le moins.
 *
 * La silhouette n'est pas un objet de plus à fabriquer : le terrain est déjà
 * dessiné sur un calque transparent — c'est ce calque qu'on passe en
 * `destination-in`. Et le jour où le décor du §5.8 est dessiné sur ce même
 * calque, l'ombre d'un arbre de bordure tombe dessus au lieu de disparaître,
 * sans une ligne de plus.
 */
export const MODE_LIMITE = "destination-in" as const;

/**
 * Cuit les taches d'ombre : des disques gris à bord doux, sur fond BLANC.
 *
 * Le gris et non l'alpha, parce que la composition passe par `darken` puis
 * `multiply` (voir `MODE_ACCUMULATION`) : dans ce schéma, blanc veut dire « pas
 * d'ombre » et le niveau de gris porte la densité. Un dégradé d'alpha ne
 * saturerait pas.
 *
 * Rend `DENSITES` taches, de la plus légère à la plus dense.
 */
export function cuireTachesOmbre(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  taillePx = TAILLE_TACHE_PX,
): HTMLCanvasElement[] {
  const taches: HTMLCanvasElement[] = [];
  for (let d = 1; d <= DENSITES; d++) {
    const image = fabriquer(taillePx, taillePx);
    const ctx = image.getContext("2d");
    if (!ctx) throw new Error("contexte 2d indisponible");
    ctx.fillStyle = "rgb(255 255 255)";
    ctx.fillRect(0, 0, taillePx, taillePx);
    const densite = (OPACITE_OMBRE * d) / DENSITES;
    const coeur = Math.round(255 * (1 - densite));
    const r = taillePx / 2;
    const degrade = ctx.createRadialGradient(r, r, 0, r, r, r);
    // Un cœur franc et un bord qui s'éteint vite : une ombre de houppier a une
    // pénombre, mais pas la moitié de son rayon.
    degrade.addColorStop(0, `rgb(${coeur} ${coeur} ${coeur})`);
    degrade.addColorStop(
      0.55,
      `rgb(${coeur + (255 - coeur) * 0.12} ${coeur + (255 - coeur) * 0.12} ${coeur + (255 - coeur) * 0.12})`,
    );
    degrade.addColorStop(
      0.85,
      `rgb(${coeur + (255 - coeur) * 0.68} ${coeur + (255 - coeur) * 0.68} ${coeur + (255 - coeur) * 0.68})`,
    );
    degrade.addColorStop(1, "rgb(255 255 255)");
    ctx.fillStyle = degrade;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    taches.push(image);
  }
  return taches;
}

/** L'index de la tache à utiliser pour une part ombrageante donnée. */
export function indexDensite(partOmbrageante: number): number {
  const borne = Math.min(1, Math.max(0, partOmbrageante));
  return Math.min(DENSITES - 1, Math.max(0, Math.ceil(borne * DENSITES) - 1));
}

/**
 * Où poser l'ombre d'un arbre, et de quelle taille.
 *
 * Le centre de l'ombre part du PIED de l'arbre — pas de son centre de houppier
 * — et se décale de la longueur que `lumiere.ts` tire du décalage du moteur.
 * Sa largeur est le diamètre du houppier, projeté, et sa hauteur en découle par
 * l'aplatissement isométrique.
 */
export function ombreDeLArbre(arbre: ArbreOmbre, vue: Vue): OmbreAPoser | undefined {
  if (arbre.partOmbrageante <= 0 || arbre.heightM <= 0) return undefined;
  const rayonM = crownRadiusM(arbre.heightM, arbre.houppierRatio);
  if (rayonM <= 0) return undefined;

  const pied = versEcranVue({ x: arbre.x, y: arbre.y, z: arbre.z }, vue);
  const direction = directionOmbreEcran(vue.cam);
  const longueur = longueurOmbreEcran(arbre.heightM, vue.cam);
  const largeurPx = 2 * rayonM * TUILE_LARGEUR_PX * vue.cam.zoom;

  return {
    sx: pied.sx + direction.sx * longueur,
    sy: pied.sy + direction.sy * longueur,
    largeurPx,
    hauteurPx: largeurPx * APLATISSEMENT,
    // Un houppier à moitié sorti porte une ombre à moitié dense : c'est ce que
    // `partFoliaireOmbrageante` dit, et c'est ce qui rend le printemps visible
    // au sol avant qu'il ne le soit dans les houppiers. La densité choisit la
    // tache cuite ; elle ne devient pas une opacité, voir `MODE_ACCUMULATION`.
    densite: indexDensite(arbre.partOmbrageante),
    profondeur: profondeur(arbre.x, arbre.y, vue.cam),
  };
}

/**
 * Les ombres à poser pour une liste d'arbres, triées comme le reste.
 *
 * Le tri par profondeur n'est pas là pour l'ombre elle-même — deux ombres qui
 * se chevauchent donnent le même résultat dans les deux ordres — mais pour que
 * cette couche puisse être ENTRELACÉE avec le sol et les arbres (§3). Trier ici
 * évite de le refaire au lot L2.
 */
export function ombresAPoser(arbres: readonly ArbreOmbre[], vue: Vue): OmbreAPoser[] {
  const sortie: OmbreAPoser[] = [];
  for (const arbre of arbres) {
    const ombre = ombreDeLArbre(arbre, vue);
    if (ombre) sortie.push(ombre);
  }
  sortie.sort((a, b) => a.profondeur - b.profondeur);
  return sortie;
}
