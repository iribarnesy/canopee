/**
 * La couche de sol : le terrain cuit en morceaux, éclairé par sa pente
 * (docs/interface-visuelle.md §3).
 *
 * **Rien n'est dessiné à la tuile par image.** Dix mille cellules par image
 * feraient dix mille primitives vectorielles, et c'est exactement la règle que
 * le lot L0 a produite en mesurant un facteur trente sur les ombres : *aucune
 * primitive vectorielle par image*. Le terrain est donc **cuit** une fois par
 * morceaux de 16 × 16 m, puis posé comme des images. Cuire, oui ; redessiner à
 * chaque image, non.
 *
 * **Trois mécanismes, et chacun répond à un problème mesuré :**
 *
 * 1. **La signature d'un morceau** ne retient que les PALIERS des grandeurs du
 *    sol (`palette.ts`). Un tick change l'humidité de tout le monde d'un
 *    centième ; sans quantification, chaque semaine invalide les dix mille
 *    tuiles et le cache ne sert à rien.
 * 2. **La cuisson est étalée sur plusieurs images**, avec un budget par image.
 *    C'est la leçon de l'atlas de L0, où trois secondes de gel arrivaient d'un
 *    coup au premier affichage. Un morceau garde son ancienne image tant que la
 *    nouvelle n'est pas prête : on préfère un sol d'une semaine de retard à une
 *    saccade.
 * 3. **On ne cuit que ce qui est visible** (`celluleVisibles`), parce que la
 *    mesure de L0 a montré que le point de rupture est le zoom rapproché, où le
 *    banc dessinait encore l'hectare entier.
 *
 * **Le liseré s'efface au loin, et ce n'est pas un détail.** Le lot L0
 * recommandait « aplats + liseré » sur des chiffres — le liseré ne coûte rien.
 * Mais en regardant la capture de la parcelle entière, le quadrillage fait lire
 * un champ labouré, pas un sous-bois. Il n'apparaît donc qu'à partir d'une
 * taille de tuile où il devient une information de relief et non une trame.
 */

import { celluleVisibles, type Emprise, type Vue, versEcranVue } from "../camera";
import { facteurPente } from "../lumiere";
import {
  type CelluleQuantifiee,
  couleurSol,
  eclairer,
  quantifier,
  signatureCellule,
  versCss,
} from "../palette";
import { profondeur, TUILE_HAUTEUR_PX, TUILE_LARGEUR_PX } from "../projection";

/** Côté d'un morceau de terrain, en mètres. */
export const COTE_MORCEAU_M = 16;

/**
 * Taille de tuile, en pixels de largeur, à partir de laquelle on trace le
 * liseré.
 *
 * **40 px, et le chiffre vient d'une erreur.** La capture de L0 qui faisait
 * « champ labouré » était au zoom d'ensemble, où une tuile fait 16 px : un
 * seuil à 14 px l'aurait laissée quadrillée. Il faut être franchement plus
 * haut — à 40 px, une tuile d'un mètre est une unité qu'on distingue, donc son
 * contour informe (une marche de relief, une limite de cellule labourée) au
 * lieu de faire une trame. C'est vers 24 m de large visible, soit un vrai
 * plan rapproché.
 */
export const LISERE_DES_PX = 40;

/** Morceaux cuits au maximum par image. Le reste attend la suivante. */
export const BUDGET_CUISSON_PAR_IMAGE = 4;

/**
 * Largeur écran visée d'un pavé de sol, en pixels.
 *
 * **Le niveau de détail du SOL, et il vient d'une capture.** Le premier jet
 * coloriait chaque mètre carré séparément : à huit pixels par mètre, les
 * grandeurs du moteur — litière sous chaque fourré, humidité cellule par
 * cellule — sortaient en motif de camouflage. C'est la même leçon que pour les
 * arbres : à l'échelle de la parcelle, l'œil veut des MASSES, pas la valeur de
 * chaque cellule.
 *
 * On agrège donc les cellules en pavés jusqu'à ce qu'un pavé fasse à peu près
 * cette largeur. Rien n'est inventé : la couleur d'un pavé est celle de la
 * MOYENNE de ses cellules, qui est une valeur que le moteur produit. Et en
 * zoomant, les pavés redeviennent des cellules — le détail est là quand on
 * s'approche, et c'est bien ce qu'on veut.
 */
export const PAVE_VISE_PX = 26;

/**
 * Côté d'un pavé de sol, en cellules, pour un zoom donné.
 *
 * Puissances de deux uniquement : un pavé qui change de taille en glissant
 * ferait scintiller le sol au zoom, alors qu'un doublement franc se lit comme
 * un changement d'échelle.
 */
export function cotePavage(zoom: number): number {
  const largeurTuile = TUILE_LARGEUR_PX * zoom;
  const brut = PAVE_VISE_PX / Math.max(1e-6, largeurTuile);
  if (brut <= 1) return 1;
  return Math.min(8, 2 ** Math.round(Math.log2(brut)));
}

/**
 * Ce que le rendu lit du sol. Tout vient de l'instantané ou de la station : ce
 * module n'invente rien et ne garde aucune grandeur du moteur.
 */
export interface DonneesSol {
  coteM: number;
  /** `StationInfo.altitudesM` — fixe pour la partie */
  altitudesM: readonly number[];
  /** remplissage de la réserve utile ∈ [0,1], par cellule */
  humidite: Float32Array;
  /** `Snapshot.soilHerbe` */
  herbe: Float32Array;
  /** `Snapshot.soilHerbeBiomasse` */
  herbeBiomasse: Float32Array;
  /** `Snapshot.soilLitiereCG` */
  litiereCG: Float32Array;
}

/** Une image de terrain cuite, et où la poser. */
export interface Morceau {
  /** indices du morceau dans la grille de morceaux */
  ix: number;
  iy: number;
  /** coin de la parcelle couvert, en mètres (nord vrai) */
  x0: number;
  y0: number;
  coteM: number;
  /** signature des cellules cuites : si elle change, l'image est périmée */
  signature: number;
  /** image cuite, prête à être posée */
  image?: HTMLCanvasElement;
  /** décalage de l'image par rapport à l'ancre, en pixels */
  decalage?: { dx: number; dy: number };
  /** zoom et orientation auxquels l'image a été cuite */
  zoomCuit?: number;
  orientationCuite?: number;
}

/** Cellule d'une grille de sol, lue à l'indice `i`. */
function celluleA(donnees: DonneesSol, i: number): CelluleQuantifiee {
  return quantifier({
    humidite: donnees.humidite[i] ?? 0,
    herbe: donnees.herbe[i] ?? 0,
    herbeBiomasse: donnees.herbeBiomasse[i] ?? 0,
    litiereCG: donnees.litiereCG[i] ?? 0,
  });
}

/** Nombre de morceaux sur un côté, pour une parcelle donnée. */
export function morceauxParCote(coteM: number): number {
  return Math.ceil(coteM / COTE_MORCEAU_M);
}

/**
 * Signature d'un morceau : un entier qui ne change que si l'image doit changer.
 *
 * Y entrent les paliers de chaque cellule ET la semaine de l'année, parce que
 * la saison décale la palette. Le mélange est un FNV-1a tronqué à 31 bits —
 * n'importe quel hachage ferait l'affaire, ce qui compte est qu'il soit stable
 * et sans allocation.
 */
export function signatureMorceau(
  donnees: DonneesSol,
  ix: number,
  iy: number,
  semaineAnnee: number,
): number {
  let h = 0x811c9dc5 ^ (semaineAnnee & 0x3f);
  const xFin = Math.min(donnees.coteM, (ix + 1) * COTE_MORCEAU_M);
  const yFin = Math.min(donnees.coteM, (iy + 1) * COTE_MORCEAU_M);
  for (let y = iy * COTE_MORCEAU_M; y < yFin; y++) {
    for (let x = ix * COTE_MORCEAU_M; x < xFin; x++) {
      h = (h ^ signatureCellule(celluleA(donnees, y * donnees.coteM + x))) >>> 0;
      h = (h * 0x01000193) >>> 0;
    }
  }
  return h & 0x7fffffff;
}

/**
 * Les morceaux qui touchent une emprise de cellules, dans l'**ordre du
 * peintre** : du plus lointain au plus proche.
 *
 * L'ordre est celui de `profondeur()`, donc `x + y` dans le repère de la
 * caméra. C'est la même clé que pour les arbres, et c'est délibéré : le relief
 * à l'échelle vraie (D3) impose d'ENTRELACER sol et arbres dans un seul ordre,
 * sinon une butte au premier plan ne masque pas le pied des arbres derrière
 * elle. Rendre les morceaux déjà triés est ce qui rendra cet entrelacement
 * possible au lot L2 sans rien réécrire ici.
 */
export function morceauxDeLEmprise(
  emprise: Emprise,
  vue: Vue,
): { ix: number; iy: number; profondeur: number }[] {
  const liste: { ix: number; iy: number; profondeur: number }[] = [];
  const ix0 = Math.floor(emprise.x0 / COTE_MORCEAU_M);
  const ix1 = Math.floor(emprise.x1 / COTE_MORCEAU_M);
  const iy0 = Math.floor(emprise.y0 / COTE_MORCEAU_M);
  const iy1 = Math.floor(emprise.y1 / COTE_MORCEAU_M);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      // Le centre du morceau suffit à l'ordonner : deux morceaux ne se
      // chevauchent pas, et la profondeur croît avec `x + y`.
      const cx = ix * COTE_MORCEAU_M + COTE_MORCEAU_M / 2;
      const cy = iy * COTE_MORCEAU_M + COTE_MORCEAU_M / 2;
      liste.push({ ix, iy, profondeur: profondeur(cx, cy, vue.cam) });
    }
  }
  liste.sort((a, b) => a.profondeur - b.profondeur);
  return liste;
}

/** Le liseré se trace-t-il à ce zoom ? Voir `LISERE_DES_PX`. */
export function liserePourZoom(zoom: number): boolean {
  return TUILE_LARGEUR_PX * zoom >= LISERE_DES_PX;
}

/** Altitude moyenne d'un pavé de `largeur × hauteur` cellules. */
function altitudeMoyenne(
  donnees: DonneesSol,
  x0: number,
  y0: number,
  largeur: number,
  hauteur: number,
): number {
  let somme = 0;
  let n = 0;
  for (let y = y0; y < Math.min(donnees.coteM, y0 + hauteur); y++) {
    for (let x = x0; x < Math.min(donnees.coteM, x0 + largeur); x++) {
      somme += donnees.altitudesM[y * donnees.coteM + x] ?? 0;
      n++;
    }
  }
  return n === 0 ? 0 : somme / n;
}

/**
 * Couleur et altitude d'un pavé : la MOYENNE de ses cellules, quantifiée
 * ensuite.
 *
 * L'ordre compte. Moyenner puis quantifier donne la couleur du pavé moyen ;
 * quantifier puis moyenner donnerait la moyenne de huit paliers, qui n'est pas
 * la même chose et qui perd de la nuance pour rien. On garde donc les valeurs
 * continues jusqu'au dernier moment — et le cache, lui, continue de hacher les
 * paliers CELLULE PAR CELLULE, ce qui est plus fin que nécessaire mais jamais
 * faux.
 */
function teintePave(
  donnees: DonneesSol,
  x0: number,
  y0: number,
  largeur: number,
  hauteur: number,
  semaineAnnee: number,
) {
  let humidite = 0;
  let herbe = 0;
  let biomasse = 0;
  let litiere = 0;
  let z = 0;
  let pente = 0;
  let n = 0;
  for (let y = y0; y < Math.min(donnees.coteM, y0 + hauteur); y++) {
    for (let x = x0; x < Math.min(donnees.coteM, x0 + largeur); x++) {
      const i = y * donnees.coteM + x;
      humidite += donnees.humidite[i] ?? 0;
      herbe += donnees.herbe[i] ?? 0;
      biomasse += donnees.herbeBiomasse[i] ?? 0;
      litiere += donnees.litiereCG[i] ?? 0;
      z += donnees.altitudesM[i] ?? 0;
      pente += facteurPente(donnees.altitudesM, donnees.coteM, x, y);
      n++;
    }
  }
  if (n === 0) return { teinte: { r: 0, g: 0, b: 0 }, z: 0 };
  const q = quantifier({
    humidite: humidite / n,
    herbe: herbe / n,
    herbeBiomasse: biomasse / n,
    litiereCG: litiere / n,
  });
  return { teinte: eclairer(couleurSol(q, semaineAnnee), pente / n), z: z / n };
}

/**
 * Cuit un morceau dans une image, et rend l'image avec son décalage.
 *
 * Le décalage existe parce qu'un morceau ne se projette pas en rectangle : le
 * losange d'un carré de 16 m dépasse à gauche et à droite de son coin, et les
 * flancs verticaux dépassent par le bas. On mesure donc l'emprise réelle avant
 * de dimensionner l'image — c'est exactement le bug qui coupait les arbres en
 * haut dans le prototype de L0, et il n'y a pas de raison de le refaire ici.
 *
 * `fabriquer` est injecté pour que ce module ne dépende pas du DOM : en test on
 * passe une fabrique factice, en jeu `document.createElement`.
 */
export function cuireMorceau(
  donnees: DonneesSol,
  ix: number,
  iy: number,
  semaineAnnee: number,
  vue: Vue,
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): { image: HTMLCanvasElement; decalage: { dx: number; dy: number } } {
  const xFin = Math.min(donnees.coteM, (ix + 1) * COTE_MORCEAU_M);
  const yFin = Math.min(donnees.coteM, (iy + 1) * COTE_MORCEAU_M);
  const x0 = ix * COTE_MORCEAU_M;
  const y0 = iy * COTE_MORCEAU_M;

  // Emprise écran réelle du morceau, flancs compris. On projette les coins des
  // tuiles, pas les coins du morceau : avec le relief, le point le plus haut
  // n'est pas forcément sur le bord.
  let minSx = Number.POSITIVE_INFINITY;
  let maxSx = Number.NEGATIVE_INFINITY;
  let minSy = Number.POSITIVE_INFINITY;
  let maxSy = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  for (let y = y0; y <= yFin; y++) {
    for (let x = x0; x <= xFin; x++) {
      const z = donnees.altitudesM[Math.min(yFin - 1, y) * donnees.coteM + Math.min(xFin - 1, x)];
      const e = versEcranVue({ x, y, z: z ?? 0 }, vue);
      minSx = Math.min(minSx, e.sx);
      maxSx = Math.max(maxSx, e.sx);
      minSy = Math.min(minSy, e.sy);
      maxSy = Math.max(maxSy, e.sy);
      zMin = Math.min(zMin, z ?? 0);
    }
  }
  // Les flancs descendent jusqu'à l'altitude la plus basse du morceau, et un
  // peu plus bas pour que l'ourlet ne se termine pas net.
  const flancPx = (Math.max(0, maxSy - minSy) || 0) + TUILE_HAUTEUR_PX * vue.cam.zoom * 2;
  const largeur = Math.max(1, Math.ceil(maxSx - minSx) + 2);
  const hauteur = Math.max(1, Math.ceil(maxSy - minSy + flancPx) + 2);
  const image = fabriquer(largeur, hauteur);
  const ctx = image.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");
  const decalage = { dx: minSx - 1, dy: minSy - 1 };

  const liseré = liserePourZoom(vue.cam.zoom);
  const demiLargeur = (TUILE_LARGEUR_PX * vue.cam.zoom) / 2;
  const demiHauteur = (TUILE_HAUTEUR_PX * vue.cam.zoom) / 2;

  // Du plus lointain au plus proche : un pavé en avant recouvre le flanc de
  // celui qui est derrière, ce qui donne l'ourlet sans le calculer.
  const pas = cotePavage(vue.cam.zoom);
  const paves: { x: number; y: number; p: number }[] = [];
  for (let y = y0; y < yFin; y += pas) {
    for (let x = x0; x < xFin; x += pas) {
      paves.push({ x, y, p: profondeur(x, y, vue.cam) });
    }
  }
  paves.sort((a, b) => a.p - b.p);

  for (const { x, y } of paves) {
    const largeurPave = Math.min(pas, xFin - x);
    const hauteurPave = Math.min(pas, yFin - y);
    const { teinte, z } = teintePave(donnees, x, y, largeurPave, hauteurPave, semaineAnnee);

    // Le centre du pavé, à l'écran. Un pavé de `n` cellules se projette comme
    // un losange `n` fois plus grand : c'est la même forme, à l'échelle.
    const c = versEcranVue({ x: x + largeurPave / 2, y: y + hauteurPave / 2, z }, vue);
    const cx = c.sx - decalage.dx;
    const cy = c.sy - decalage.dy;
    const dl = demiLargeur * largeurPave;
    const dh = demiHauteur * hauteurPave;

    // Le flanc : ce qui se voit sous le pavé parce que l'aval est plus bas.
    // Dessiné avant la surface, et plus sombre — c'est de la terre à nu vue de
    // côté, jamais éclairée par un soleil haut.
    const zAval = Math.min(
      altitudeMoyenne(donnees, x, Math.min(donnees.coteM - 1, y + hauteurPave), largeurPave, 1),
      altitudeMoyenne(donnees, Math.min(donnees.coteM - 1, x + largeurPave), y, 1, hauteurPave),
    );
    const chute = Math.max(0, z - zAval);
    if (chute > 0.01) {
      const bas = versEcranVue(
        { x: x + largeurPave / 2, y: y + hauteurPave / 2, z: z - chute },
        vue,
      );
      const basY = bas.sy - decalage.dy;
      ctx.fillStyle = versCss(eclairer(teinte, 0.62));
      ctx.beginPath();
      ctx.moveTo(cx - dl, cy);
      ctx.lineTo(cx, cy + dh);
      ctx.lineTo(cx + dl, cy);
      ctx.lineTo(cx + dl, basY);
      ctx.lineTo(cx, basY + dh);
      ctx.lineTo(cx - dl, basY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = versCss(teinte);
    ctx.beginPath();
    ctx.moveTo(cx, cy - dh);
    ctx.lineTo(cx + dl, cy);
    ctx.lineTo(cx, cy + dh);
    ctx.lineTo(cx - dl, cy);
    ctx.closePath();
    ctx.fill();
    if (liseré) {
      ctx.strokeStyle = versCss(eclairer(teinte, 0.88));
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  return { image, decalage };
}

/**
 * Le cache de terrain : il tient les morceaux cuits, repère ceux qui sont
 * périmés, et en recuit un nombre borné par image.
 *
 * L'état vit ici et non dans le moteur — c'est la décision D6 : le moteur
 * n'apprend jamais le mot « image ».
 */
export class Terrain {
  private readonly morceaux = new Map<number, Morceau>();
  private readonly parCote: number;
  /** morceaux à recuire, du plus proche de la caméra au plus lointain */
  private aCuire: { ix: number; iy: number }[] = [];

  constructor(
    private readonly fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
    coteM: number,
  ) {
    this.parCote = morceauxParCote(coteM);
  }

  private cle(ix: number, iy: number): number {
    return iy * this.parCote + ix;
  }

  /**
   * Confronte le cache à l'instantané courant et dresse la liste de ce qu'il
   * faut recuire. **Ne cuit rien** : c'est `cuire()` qui dépense le budget.
   *
   * Rend le nombre de morceaux périmés, ce qui est la grandeur à surveiller —
   * si elle vaut le nombre total à chaque semaine, la quantification ne sert à
   * rien et il faut le savoir.
   */
  public rafraichir(donnees: DonneesSol, semaineAnnee: number, vue: Vue): number {
    const emprise = celluleVisibles(vue);
    if (!emprise) {
      this.aCuire = [];
      return 0;
    }
    const attendus = morceauxDeLEmprise(emprise, vue);
    const aCuire: { ix: number; iy: number }[] = [];
    for (const { ix, iy } of attendus) {
      const signature = signatureMorceau(donnees, ix, iy, semaineAnnee);
      const existant = this.morceaux.get(this.cle(ix, iy));
      const bonZoom =
        existant?.zoomCuit === vue.cam.zoom && existant?.orientationCuite === vue.cam.orientation;
      if (!existant || existant.signature !== signature || !bonZoom || !existant.image) {
        aCuire.push({ ix, iy });
      }
    }
    // Le plus proche de la caméra d'abord : c'est ce que l'œil regarde, et si
    // le budget ne suffit pas, mieux vaut que le retard soit au fond.
    aCuire.reverse();
    this.aCuire = aCuire;
    return aCuire.length;
  }

  /** Cuit au plus `budget` morceaux périmés. Rend le nombre réellement cuit. */
  public cuire(
    donnees: DonneesSol,
    semaineAnnee: number,
    vue: Vue,
    budget = BUDGET_CUISSON_PAR_IMAGE,
  ): number {
    let faits = 0;
    while (faits < budget) {
      const suivant = this.aCuire.shift();
      if (!suivant) break;
      const { ix, iy } = suivant;
      const { image, decalage } = cuireMorceau(donnees, ix, iy, semaineAnnee, vue, this.fabriquer);
      this.morceaux.set(this.cle(ix, iy), {
        ix,
        iy,
        x0: ix * COTE_MORCEAU_M,
        y0: iy * COTE_MORCEAU_M,
        coteM: COTE_MORCEAU_M,
        signature: signatureMorceau(donnees, ix, iy, semaineAnnee),
        image,
        decalage,
        zoomCuit: vue.cam.zoom,
        orientationCuite: vue.cam.orientation,
      });
      faits++;
    }
    return faits;
  }

  /** Les morceaux à poser, déjà dans l'ordre du peintre. */
  public aPoser(vue: Vue): Morceau[] {
    const emprise = celluleVisibles(vue);
    if (!emprise) return [];
    const sortie: Morceau[] = [];
    for (const { ix, iy } of morceauxDeLEmprise(emprise, vue)) {
      const m = this.morceaux.get(this.cle(ix, iy));
      if (m?.image) sortie.push(m);
    }
    return sortie;
  }

  /** Combien de morceaux attendent d'être cuits. */
  public get enRetard(): number {
    return this.aCuire.length;
  }

  /** Tout jeter : changement de station, ou d'échelle de zoom. */
  public vider(): void {
    this.morceaux.clear();
    this.aCuire = [];
  }
}
