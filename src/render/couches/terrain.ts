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
 * **Le sol n'a PAS de liseré, contrairement à ce que le lot L0 recommandait.**
 * Q6 concluait « aplats + liseré » sur des chiffres — le contour ne coûte rien.
 * Deux captures ont défait cette conclusion, pour le sol seulement. La première,
 * au zoom d'ensemble : le quadrillage fait lire un champ labouré. La seconde,
 * après le passage aux quads interpolés : le liseré devenait le seul bord franc
 * de l'image et le sol lisait comme un fil de fer posé sur du brouillard.
 *
 * La conclusion de Q6 vaut donc pour les FORMES — un arbre, une souche, un
 * tronc couché gagnent à être détourés — et pas pour le sol, qui n'est pas une
 * forme mais un fond. Pour aider à placer un arbre, la bonne réponse est
 * d'éclairer la cellule sous le curseur, pas de quadriller l'hectare.
 */

import {
  couvertureDuBoisAuSol,
  EMPRISE_PAR_METRE_DE_TRONC,
  longueurDeTroncM,
  SINUS_BARRANT_MINIMAL,
} from "../../engine/boisMort";
import { celluleVisibles, type Emprise, type Vue, versEcranVue } from "../camera";
import { facteurGrain } from "../grain";
import { expositionMoyenne, facteurRelief } from "../lumiere";
import {
  type CelluleQuantifiee,
  couleurEau,
  couleurInondee,
  couleurSol,
  DEBORDEMENT_PLEIN_MM,
  eclairer,
  estInondee,
  melange,
  palier,
  quantifier,
  signatureCellule,
  type Teinte,
  versCss,
} from "../palette";
import { METRE_VERTICAL_PX, profondeur, TUILE_HAUTEUR_PX, TUILE_LARGEUR_PX } from "../projection";
import {
  altitudeDecor,
  altitudeMoyenneParcelle,
  couleurDecor,
  couleurMasse,
  type DecorBordures,
  distanceAuBord,
  MASSE_LA_PLUS_HAUTE_M,
  massesDuDecor,
  penteMoyenne,
} from "./decor";
import { polygonesEau } from "./eau";
import { type Brin, brinsDeLaCellule, clarteDuMotif, densiteTapis } from "./tapis";

/** Côté d'un morceau de terrain, en mètres. */
export const COTE_MORCEAU_M = 16;

/**
 * Le zoom auquel on CUIT, qui n'est pas celui auquel on POSE.
 *
 * **Sans cette distinction, zoomer jette tout le cache.** Un morceau cuit à un
 * zoom donné ne peut être posé qu'à ce zoom-là : au moindre cran de molette, la
 * signature ne correspond plus et les dix mille cellules sont à recuire.
 * Mesuré sur la vue PixiJS, neuf crans en huit dixièmes de seconde laissaient
 * cinq cents morceaux en attente et l'écran se vidait de son sol — le joueur
 * voyait sa parcelle disparaître pendant qu'il zoomait dessus.
 *
 * On cuit donc sur une ÉCHELLE de zooms, par pas de √2, et le GPU met à
 * l'échelle la texture entre deux barreaux. Un facteur au plus 1,41 sur une
 * image déjà anticrénelée ne se voit pas ; recuire à chaque cran, si.
 *
 * C'est aussi ce que le montage Pixi rend gratuit : redimensionner un sprite ne
 * coûte rien au GPU, là où en Canvas 2D il faudrait rééchantillonner à la main.
 */
export function zoomDeCuisson(zoom: number): number {
  if (!(zoom > 0)) return 1;
  return 2 ** (Math.round(Math.log2(zoom) * 2) / 2);
}

/** Les quatre coins d'un morceau, en parts de son côté. */
const COINS_MORCEAU: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

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
 * Largeur écran visée d'un QUAD dessiné, en pixels.
 *
 * **À ne pas confondre avec le pavage, et c'est toute l'idée de ce module.** Le
 * pavage dit à quelle finesse on ÉCHANTILLONNE le sol — il combat le bruit. La
 * subdivision dit à quelle finesse on le DESSINE — elle combat les bords francs.
 * Les deux étaient confondus au premier jet : chaque cellule était un aplat
 * bordé net, et le sol lisait comme une mosaïque de carrelage, surtout au zoom
 * où une cellule fait cinquante pixels.
 *
 * On échantillonne donc grossièrement et on dessine finement, en interpolant
 * entre les échantillons. Rien de nouveau n'est inventé : entre deux valeurs
 * que le moteur donne, l'interpolation est la seule chose honnête à afficher —
 * le sol ne change pas de nature au milieu d'un mètre carré.
 */
export const QUAD_VISE_PX = 12;

/**
 * Combien de fois subdiviser un pavé pour le dessiner. Borné à 4 : au-delà, le
 * coût de cuisson monte en carré pour un gain que l'œil ne voit plus.
 */
export function sousDivisions(paveePx: number): number {
  return Math.min(4, Math.max(1, Math.round(paveePx / QUAD_VISE_PX)));
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
  /**
   * `Snapshot.soilLumiere` : la lumière arrivant au sol ∈ [0,1], par cellule.
   *
   * Absente = pas de couvert connu, le sol est en pleine lumière. Le repli est
   * volontairement le cas CLAIR : une scène qui ne transporte pas la grandeur
   * doit rendre ce qu'elle rendait avant, pas une parcelle noire.
   */
  lumiere?: Float32Array;
  /**
   * `Snapshot.soilHerbeHumidite` : l'humidité VÉCUE par le tapis herbacé ∈ [0,1].
   *
   * Absente = pas de tapis connu ; on n'affirme alors aucune soif, ce qui rend
   * la scène telle qu'elle était avant que la grandeur n'existe.
   */
  herbeHumidite?: Float32Array;
  /**
   * `StationInfo.enEau` : les cellules d'eau libre, fixées avec la station.
   * Absent = parcelle sans ruisseau ni mare.
   */
  enEau?: readonly boolean[];
  /**
   * `Snapshot.soilDebordementMm` : ce qui n'a pas pu rentrer dans le sol cette
   * semaine. La flaque de novembre, la lame d'une crue.
   */
  debordementMm?: Float32Array;
  /**
   * `Snapshot.soilBoisAuSol` : le bois mort COUCHÉ, g C par m².
   *
   * **Le protocole demandait ce dessin en toutes lettres** — « le rendu peut y
   * poser des troncs » — et personne ne lisait le champ. C'est un chablis, ou
   * une chandelle abattue, resté là où il est tombé : ça fait de l'humus, ça
   * retient la terre, ça abrite, et le joueur peut le ramasser
   * (`ramasserBoisMort`). Quatre raisons de le voir.
   */
  boisAuSol?: Float32Array;
  /**
   * `Snapshot.soilBoisEnTravers` : la TRANSVERSALITÉ du bois couché ∈ [0,1].
   *
   * **La grandeur qui explique une chose que le joueur voyait sans la
   * comprendre.** Le moteur modélise qu'un tronc en travers de la pente barre
   * l'eau et qu'un tronc dans le sens de la pente fait gouttière — c'est le
   * sinus de l'angle entre son axe et la ligne de plus grande pente, avec un
   * seuil mesuré à 30° (`boisMort.ts`, d'après Adams et al. 2023). Une cellule
   * pouvait donc être plus humide que sa voisine à charge de bois égale, sans
   * que rien à l'écran ne dise pourquoi.
   *
   * Elle donne directement l'ANGLE du tronc à dessiner : `asin(part)` depuis
   * la direction de l'aval. Ce n'est pas une interprétation, c'est l'inverse
   * exact de la fonction du moteur.
   */
  boisEnTravers?: Float32Array;
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
  /** décalage de l'image, en pixels DU ZOOM DE CUISSON */
  decalage?: { dx: number; dy: number };
  /**
   * Le point de parcelle qui sert de référence pour reposer l'image à un autre
   * zoom, et le décalage de l'image par rapport à lui.
   *
   * On ne peut pas se contenter du décalage écran : il vaut pour le zoom de
   * cuisson et pour lui seul. En gardant un point de PARCELLE, on le reprojette
   * au zoom courant et on remet l'image dessus, mise à l'échelle du rapport des
   * deux zooms — ce qui est exact, la projection étant linéaire en zoom.
   */
  ancre?: { x: number; y: number; z: number };
  decalageRelatif?: { dx: number; dy: number };
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
      const i = y * donnees.coteM + x;
      h = (h ^ signatureCellule(celluleA(donnees, i))) >>> 0;
      h = (h * 0x01000193) >>> 0;
      // L'eau entre dans la signature : sans ça, une crue monterait sans que
      // le sol soit redessiné. Le débordement est quantifié comme le reste,
      // sinon chaque millimètre invaliderait le morceau.
      const eau =
        (donnees.enEau?.[i] ? 1 : 0) |
        (palier((donnees.debordementMm?.[i] ?? 0) / DEBORDEMENT_PLEIN_MM) << 1);
      // Note : le palier suffit à la signature. Le seuil de visibilité, lui,
      // est dans `estInondee` — deux cellules sous le seuil tombent de toute
      // façon dans le même palier, donc rien ne se recuit pour rien.
      h = (h ^ eau) >>> 0;
      h = (h * 0x01000193) >>> 0;
      // Le bois couché entre dans la signature, masse ET orientation : un
      // chablis qui tombe doit redessiner son morceau, et un tronc qui pourrit
      // jusqu'à disparaître aussi.
      const bois =
        palier(longueurDeTroncM(donnees.boisAuSol?.[i] ?? 0) / TRONC_POUR_UNE_PLEINE_EMPRISE_M) |
        (palier(donnees.boisEnTravers?.[i] ?? 0) << 3);
      h = (h ^ bois) >>> 0;
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

/**
 * Trace un brin du tapis. Trois formes, aussi simples que possible : ce qui les
 * distingue à l'œil est leur SILHOUETTE et leur clarté, pas leur détail — à
 * cette taille, un brin fait dix pixels de haut.
 */
function dessinerBrin(
  ctx: CanvasRenderingContext2D,
  brin: Brin,
  sx: number,
  sy: number,
  demiLargeurTuile: number,
  couleur: string,
): void {
  // Un brin est dimensionné en fraction de tuile : il grandit avec le zoom
  // comme tout le reste, sans qu'on ait à connaître le zoom ici.
  // 0,13 et non 0,22 : la marque est deux fois plus petite depuis qu'il y en a
  // deux fois plus. C'est le même volume d'encre, réparti plus finement — un
  // gazon a du GRAIN, pas des objets.
  const u = demiLargeurTuile * 0.13 * brin.taille;
  ctx.fillStyle = couleur;
  if (brin.motif === "touffe") {
    // Des lames qui s'écartent depuis un même pied : la silhouette d'une touffe
    // se lit à ça et à rien d'autre.
    //
    // **Mais pas toujours les mêmes**, et c'était le défaut : trois lames aux
    // écarts fixes `[-0,55 ; 0 ; 0,55]` donnaient un glyphe unique tamponné sur
    // toute la parcelle. Deux à quatre lames, ouvertes à un angle qui dépend de
    // leur nombre, et chacune de sa longueur : le motif cesse de se répéter
    // sans coûter un trait de plus.
    ctx.beginPath();
    for (let k = 0; k < brin.lames; k++) {
      const part = brin.lames === 1 ? 0 : k / (brin.lames - 1) - 0.5;
      const penche = brin.angle * 0.25 + part * 1.15;
      // Les lames d'une même touffe n'ont pas la même longueur : c'est le peu
      // qui sépare une touffe d'herbe d'une fourche.
      const longue = 1.55 + ((k * 37 + brin.lames) % 5) * 0.22;
      ctx.moveTo(sx - u * 0.18, sy);
      ctx.lineTo(sx + Math.sin(penche) * u * 1.5, sy - Math.cos(penche) * u * longue * 1.35);
      ctx.lineTo(sx + u * 0.18, sy);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (brin.motif === "feuille") {
    // Une ellipse couchée, orientée n'importe comment : une feuille tombée.
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(brin.angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, u * 1.25, u * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Terre à nu : une tache basse et large, écrasée comme la tuile qui la porte,
  // et plus petite que les deux autres. À 1,05 de large elle sortait en gravier
  // sur la capture — la terre entre les herbes est une nuance du sol, pas une
  // marque posée dessus.
  ctx.beginPath();
  ctx.ellipse(sx, sy, u * 0.8, u * 0.36, brin.angle * 0.3, 0, Math.PI * 2);
  ctx.fill();
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
  for (let y = Math.max(0, y0); y < Math.min(donnees.coteM, y0 + hauteur); y++) {
    for (let x = Math.max(0, x0); x < Math.min(donnees.coteM, x0 + largeur); x++) {
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
  penteReference: number,
) {
  let humidite = 0;
  let herbe = 0;
  let biomasse = 0;
  let litiere = 0;
  let lumiere = 0;
  let herbeHumidite = 0;
  let z = 0;
  let relief = 0;
  let n = 0;
  // Les bornes sont rabattues dans la parcelle : un échantillon de l'anneau de
  // débordement tombe DEHORS, et y lire des zéros donnerait une terre sèche
  // fictive vers laquelle le bord interpolerait. C'est exactement la frange
  // pâle qu'une capture a montrée le long des lisières.
  for (let y = Math.max(0, y0); y < Math.min(donnees.coteM, y0 + hauteur); y++) {
    for (let x = Math.max(0, x0); x < Math.min(donnees.coteM, x0 + largeur); x++) {
      const i = y * donnees.coteM + x;
      humidite += donnees.humidite[i] ?? 0;
      herbe += donnees.herbe[i] ?? 0;
      biomasse += donnees.herbeBiomasse[i] ?? 0;
      litiere += donnees.litiereCG[i] ?? 0;
      lumiere += donnees.lumiere?.[i] ?? 1;
      herbeHumidite += donnees.herbeHumidite?.[i] ?? 1;
      z += donnees.altitudesM[i] ?? 0;
      relief += facteurRelief(donnees.altitudesM, donnees.coteM, x, y, penteReference);
      n++;
    }
  }
  if (n === 0) return { teinte: { r: 0, g: 0, b: 0 }, z: 0 };
  const q = quantifier({
    humidite: humidite / n,
    herbe: herbe / n,
    herbeBiomasse: biomasse / n,
    litiereCG: litiere / n,
    lumiere: lumiere / n,
    herbeHumidite: herbeHumidite / n,
  });
  return { teinte: eclairer(couleurSol(q, semaineAnnee), relief / n), z: z / n };
}

/**
 * Le champ de sol échantillonné aux centres de pavés, avec **un anneau de
 * débordement d'un pavé tout autour**.
 *
 * L'anneau n'est pas un détail : sans lui, les quads du bord d'un morceau
 * n'auraient personne avec qui interpoler et se rabattraient sur leur propre
 * valeur. Deux morceaux voisins montreraient alors une couture nette à leur
 * frontière — un défaut d'autant plus visible qu'il suit une grille régulière.
 * Avec l'anneau, chaque morceau interpole vers les valeurs de son voisin, et la
 * frontière disparaît sans que les morceaux aient à se connaître.
 */
interface ChampSol {
  /** origine du champ en coordonnées de parcelle (coin du nœud d'indice 0) */
  ox: number;
  oy: number;
  /** pas d'échantillonnage, en cellules */
  pas: number;
  /** nombre de nœuds par côté */
  n: number;
  teintes: Teinte[];
  z: Float64Array;
}

function echantillonner(
  donnees: DonneesSol,
  x0: number,
  y0: number,
  cote: number,
  pas: number,
  semaineAnnee: number,
  penteReference: number,
): ChampSol {
  const n = Math.ceil(cote / pas) + 3; // +1 de chaque côté pour l'anneau, +1 de garde
  const ox = x0 - pas;
  const oy = y0 - pas;
  const teintes: Teinte[] = new Array(n * n);
  const z = new Float64Array(n * n);
  const dernier = donnees.coteM - pas;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Rabattement sur le bord : hors parcelle, on réplique la valeur de la
      // lisière plutôt que d'inventer un dehors. Les deux morceaux qui se
      // touchent au bord rabattent pareil, donc la continuité tient.
      const px = Math.min(dernier, Math.max(0, ox + i * pas));
      const py = Math.min(dernier, Math.max(0, oy + j * pas));
      const echantillon = teintePave(donnees, px, py, pas, pas, semaineAnnee, penteReference);
      teintes[j * n + i] = echantillon.teinte;
      z[j * n + i] = echantillon.z;
    }
  }
  return { ox, oy, pas, n, teintes, z };
}

/** Interpolation bilinéaire du champ, en un point de parcelle quelconque. */
function lireChamp(champ: ChampSol, px: number, py: number): { teinte: Teinte; z: number } {
  // Les nœuds sont au CENTRE de leur pavé : d'où le demi-pas.
  const u = (px - (champ.ox + champ.pas / 2)) / champ.pas;
  const v = (py - (champ.oy + champ.pas / 2)) / champ.pas;
  const i = Math.min(champ.n - 2, Math.max(0, Math.floor(u)));
  const j = Math.min(champ.n - 2, Math.max(0, Math.floor(v)));
  const fu = Math.min(1, Math.max(0, u - i));
  const fv = Math.min(1, Math.max(0, v - j));
  const a = j * champ.n + i;
  const t00 = champ.teintes[a] ?? { r: 0, g: 0, b: 0 };
  const t10 = champ.teintes[a + 1] ?? t00;
  const t01 = champ.teintes[a + champ.n] ?? t00;
  const t11 = champ.teintes[a + champ.n + 1] ?? t10;
  const haut = melange(t00, t10, fu);
  const bas = melange(t01, t11, fu);
  const zHaut = (champ.z[a] ?? 0) * (1 - fu) + (champ.z[a + 1] ?? 0) * fu;
  const zBas = (champ.z[a + champ.n] ?? 0) * (1 - fu) + (champ.z[a + champ.n + 1] ?? 0) * fu;
  return { teinte: melange(haut, bas, fv), z: zHaut * (1 - fv) + zBas * fv };
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
): {
  image: HTMLCanvasElement;
  decalage: { dx: number; dy: number };
  ancre: { x: number; y: number; z: number };
  decalageRelatif: { dx: number; dy: number };
} {
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

  const largeurTuilePx = TUILE_LARGEUR_PX * vue.cam.zoom;
  const densite = densiteTapis(largeurTuilePx);
  // La pente de référence est celle de la PARCELLE, pas du morceau : une
  // référence par morceau ferait des marches d'éclairement à chaque frontière.
  const penteReference = expositionMoyenne(donnees.altitudesM, donnees.coteM);
  const champ = echantillonner(donnees, x0, y0, COTE_MORCEAU_M, pas, semaineAnnee, penteReference);
  const sous = sousDivisions(demiLargeur * 2 * pas);
  const finesse = pas / sous;

  for (const { x, y } of paves) {
    const largeurPave = Math.min(pas, xFin - x);
    const hauteurPave = Math.min(pas, yFin - y);
    const centre = lireChamp(champ, x + largeurPave / 2, y + hauteurPave / 2);

    // ── Le flanc, sur la grille GROSSIÈRE ────────────────────────────────
    // Ce qui se voit sous le pavé parce que l'aval est plus bas. Dessiné avant
    // la surface, et plus sombre — c'est de la terre à nu vue de côté, jamais
    // éclairée par un soleil haut. Il reste grossier volontairement : un flanc
    // est une falaise, pas un dégradé, et le subdiviser ne changerait rien.
    const zAval = Math.min(
      altitudeMoyenne(donnees, x, Math.min(donnees.coteM - 1, y + hauteurPave), largeurPave, 1),
      altitudeMoyenne(donnees, Math.min(donnees.coteM - 1, x + largeurPave), y, 1, hauteurPave),
    );
    const chute = Math.max(0, centre.z - zAval);
    // **Seuil relevé de un centimètre à un demi-mètre**, et ce n'est pas un
    // réglage : c'est la conséquence des quads par coins. Tant que la surface
    // était faite de losanges plats, l'ourlet bouchait le décrochement de
    // chaque pavé, donc il fallait le dessiner dès le premier centimètre — et
    // c'est ce qui hachurait les versants. Une surface continue n'a plus rien à
    // boucher : l'ourlet ne sert plus qu'aux VRAIES ruptures, une berge, un
    // talus, un front de taille, où il y a bel et bien une paroi à montrer.
    if (chute > 0.5) {
      const c = versEcranVue({ x: x + largeurPave / 2, y: y + hauteurPave / 2, z: centre.z }, vue);
      const cx = c.sx - decalage.dx;
      const cy = c.sy - decalage.dy;
      const dl = demiLargeur * largeurPave;
      const dh = demiHauteur * hauteurPave;
      const bas = versEcranVue(
        { x: x + largeurPave / 2, y: y + hauteurPave / 2, z: centre.z - chute },
        vue,
      );
      const basY = bas.sy - decalage.dy;
      ctx.fillStyle = versCss(eclairer(centre.teinte, 0.62));
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

    // ── La surface, en quads FINS et interpolés ──────────────────────────
    // Chaque quad reçoit sa couleur du champ lu à son centre, et ses quatre
    // altitudes du champ lu à ses coins.
    for (let sy = 0; sy < sous; sy++) {
      for (let sx = 0; sx < sous; sx++) {
        const qx = x + sx * finesse;
        const qy = y + sy * finesse;
        const ql = Math.min(finesse, xFin - qx);
        const qh = Math.min(finesse, yFin - qy);
        if (ql <= 0 || qh <= 0) continue;
        const echantillon = lireChamp(champ, qx + ql / 2, qy + qh / 2);
        // Le grain se multiplie à l'ombrage de pente : deux facteurs de clarté,
        // l'un qui vient du relief, l'autre de la matière. Il est attaché aux
        // coordonnées de PARCELLE, donc il ne glisse pas quand la caméra tourne.
        const matiere = facteurGrain(qx + ql / 2, qy + qh / 2, largeurTuilePx);
        const teinteQuad =
          matiere === 1 ? echantillon.teinte : eclairer(echantillon.teinte, matiere);
        // Le quad est tracé par ses QUATRE COINS, chacun à l'altitude que le
        // champ lui donne — et non comme un losange plat posé à l'altitude du
        // centre.
        //
        // **C'est ce qui rendait le relief illisible, et une capture l'a
        // montré.** Des losanges plats sur un versant régulier forment des
        // terrasses : chaque pavé décroche d'un pixel ou deux sur son voisin
        // d'aval, l'ourlet vient boucher le trou, et la pente entière sort en
        // hachures fines. Autrement dit, un relief parfaitement lisse était
        // dessiné comme un escalier — le même défaut que la mare, à une autre
        // échelle. Par les coins, deux quads voisins partagent leurs sommets :
        // la surface est continue par construction, une pente est une pente, et
        // seuls les vrais accidents font des arêtes.
        const css = versCss(teinteQuad);
        ctx.fillStyle = css;
        ctx.strokeStyle = css;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [k, [px, py]] of (
          [
            [qx, qy],
            [qx + ql, qy],
            [qx + ql, qy + qh],
            [qx, qy + qh],
          ] as const
        ).entries()) {
          const e = versEcranVue({ x: px, y: py, z: lireChamp(champ, px, py).z }, vue);
          const ex = e.sx - decalage.dx;
          const ey = e.sy - decalage.dy;
          if (k === 0) ctx.moveTo(ex, ey);
          else ctx.lineTo(ex, ey);
        }
        ctx.closePath();
        ctx.fill();
        // Le trait de même couleur ferme le demi-pixel d'antialiasing entre
        // deux quads, ce que le débordement d'un losange faisait avant lui.
        ctx.stroke();
      }
    }
    // ── Le tapis : les marques qui font la matière ───────────────────────
    // Tracé au moment de la CUISSON, donc jamais par image — la règle « aucune
    // primitive vectorielle par image » porte sur le dessin de la scène, pas
    // sur la fabrication d'une texture qui sera ensuite posée en une image.
    if (densite > 0) {
      for (let cy2 = y; cy2 < Math.min(yFin, y + hauteurPave); cy2++) {
        for (let cx2 = x; cx2 < Math.min(xFin, x + largeurPave); cx2++) {
          const i = cy2 * donnees.coteM + cx2;
          if (donnees.enEau?.[i]) continue; // rien ne pousse dans l'eau libre
          const q = celluleA(donnees, i);
          const zc = donnees.altitudesM[i] ?? centre.z;
          for (const brin of brinsDeLaCellule(cx2, cy2, q, densite)) {
            const fond = lireChamp(champ, brin.x, brin.y).teinte;
            const b = versEcranVue({ x: brin.x, y: brin.y, z: zc }, vue);
            dessinerBrin(
              ctx,
              brin,
              b.sx - decalage.dx,
              b.sy - decalage.dy,
              demiLargeur,
              versCss(eclairer(fond, clarteDuMotif(brin.motif) * brin.nuance)),
            );
          }
        }
      }
    }

    // ── La LAME d'eau : un débordement, qui n'a pas de rive ──────────────
    // Une flaque n'a pas de bord franc, elle s'étale : elle se dessine donc à
    // la cellule et se mélange au sol au lieu de le couvrir. C'est ce qui la
    // distingue d'un plan d'eau, et c'est vrai — on voit la litière sous deux
    // centimètres d'eau.
    if (donnees.debordementMm) {
      for (let cy2 = y; cy2 < Math.min(yFin, y + hauteurPave); cy2++) {
        for (let cx2 = x; cx2 < Math.min(xFin, x + largeurPave); cx2++) {
          const i = cy2 * donnees.coteM + cx2;
          if (donnees.enEau?.[i]) continue;
          const deborde = donnees.debordementMm[i] ?? 0;
          if (!estInondee(deborde)) continue;
          const zc = donnees.altitudesM[i] ?? centre.z;
          const teinteEau = couleurInondee(
            lireChamp(champ, cx2 + 0.5, cy2 + 0.5).teinte,
            deborde,
            semaineAnnee,
          );
          const c = versEcranVue({ x: cx2 + 0.5, y: cy2 + 0.5, z: zc }, vue);
          const ex = c.sx - decalage.dx;
          const ey = c.sy - decalage.dy;
          const el = demiLargeur + 0.5;
          const eh = demiHauteur + 0.25;
          ctx.fillStyle = versCss(teinteEau);
          ctx.beginPath();
          ctx.moveTo(ex, ey - eh);
          ctx.lineTo(ex + el, ey);
          ctx.lineTo(ex, ey + eh);
          ctx.lineTo(ex - el, ey);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // ── L'EAU LIBRE, tracée par son contour ────────────────────────────────
  // En dehors de la boucle des pavés, et pour une raison : le contour d'une
  // mare traverse les cellules en diagonale, il ne se découpe pas par pavé.
  // Une seule passe sur le morceau, après le sol, avant rien d'autre.
  if (donnees.enEau) {
    const largeurM = xFin - x0;
    const hauteurM = yFin - y0;
    const teinteEau = versCss(couleurEau(semaineAnnee));
    ctx.fillStyle = teinteEau;
    ctx.strokeStyle = teinteEau;
    ctx.lineWidth = 1;
    // **Un SEUL chemin pour tous les morceaux d'eau du chunk, et une seule
    // peinture.** Remplir polygone par polygone laissait, à chaque sommet
    // partagé, un point d'antialiasing plus sombre : la mare sortait mouchetée
    // de gris, comme grêlée. En accumulant tout dans un chemin unique, la règle
    // de remplissage non nulle fond les cellules voisines en une seule surface
    // et les arêtes intérieures disparaissent — il ne reste que la rive.
    ctx.beginPath();
    for (const polygone of polygonesEau(donnees.enEau, donnees.coteM, x0, y0, largeurM, hauteurM)) {
      polygone.forEach((p, k) => {
        const zc =
          donnees.altitudesM[
            Math.min(donnees.coteM - 1, Math.floor(p.y)) * donnees.coteM +
              Math.min(donnees.coteM - 1, Math.floor(p.x))
          ] ?? 0;
        const e = versEcranVue({ x: p.x, y: p.y, z: zc }, vue);
        const ex = e.sx - decalage.dx;
        const ey = e.sy - decalage.dy;
        if (k === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      });
      ctx.closePath();
    }
    ctx.fill();
    // Le trait ferme le demi-pixel que l'antialiasing laisse à la frontière
    // entre deux morceaux de terrain voisins, que le chemin unique ne couvre
    // pas puisqu'il s'arrête au bord du morceau.
    ctx.stroke();
  }

  // ── Le bois mort couché ───────────────────────────────────────────────
  // **Après l'eau, donc devant elle** : un tronc en travers d'une flaque se
  // voit, et c'est exactement l'endroit où il faut le voir — c'est lui qui
  // retient l'eau derrière.
  if (donnees.boisAuSol) {
    dessinerBoisAuSol(ctx, donnees, x0, y0, xFin, yFin, vue, decalage);
  }

  // L'ancre : le coin du morceau, à l'altitude de sa cellule. N'importe quel
  // point de parcelle ferait l'affaire — ce qui compte est qu'il soit FIXE et
  // reprojetable ; le coin est celui dont on se souvient le plus facilement.
  const ancre = { x: x0, y: y0, z: donnees.altitudesM[y0 * donnees.coteM + x0] ?? 0 };
  const ancreEcran = versEcranVue(ancre, vue);
  return {
    image,
    decalage,
    ancre,
    decalageRelatif: { dx: decalage.dx - ancreEcran.sx, dy: decalage.dy - ancreEcran.sy },
  };
}

/**
 * Le bois mort couché d'un morceau de terrain.
 *
 * **Le protocole demandait ce dessin en toutes lettres, et personne ne le
 * lisait.** `soilBoisAuSol` : « le rendu peut y poser des troncs » ;
 * `soilBoisEnTravers` : « c'est elle, et pas la masse, qui dit si le tronc
 * barre l'eau ou s'il fait gouttière, et le rendu doit pouvoir le montrer ».
 * Deux `Float32Array` qui traversaient le worker pour rien.
 *
 * **Trois jets pour trouver d'où vient la direction du tronc**, et les deux
 * premiers ont été réfutés par une capture :
 *
 * 1. `asin(transversalité)`. Ça paraissait exact — la transversalité EST le
 *    sinus de l'angle entre le tronc et l'aval. C'est faux : la fonction du
 *    moteur rend une valeur ABSOLUE, délibérément (« un tronc n'a pas de
 *    sens : couché vers l'est ou vers l'ouest, il barre pareil »), donc un arc
 *    sinus laisse quatre directions candidates et le rendu en choisissait une
 *    au hasard. Résultat : des échelles de tirets en travers du vrai tronc.
 * 2. Pas de direction du tout, juste la part du mètre carré que le bois
 *    occupe, cellule par cellule. Honnête, mais la couverture réelle d'un
 *    tronc de trente centimètres dans une cellule d'un mètre est de 30 % :
 *    les taches ne se soudent pas, et on obtenait une chaîne de losanges.
 * 3. Le VOISINAGE, en axe quantifié : la paire de voisins opposés la plus
 *    chargée. Bonne idée, mauvaise résolution — à quarante-cinq degrés près,
 *    l'empreinte d'un tronc oblique est un escalier, et chaque décrochement
 *    laissait un trou.
 * 4. Le graphe de l'empreinte, cellule à cellule. Continu, cette fois, mais
 *    fidèle à l'escalier : un tuyau en marches, avec un trou triangulaire à
 *    chaque décrochement. L'empreinte est la RASTÉRISATION d'un tronc droit,
 *    et la dessiner fidèlement reproduit la rastérisation.
 * 5. La direction ajustée sur le voisinage, par le moment d'ordre deux du
 *    nuage des cellules chargées. Direction juste et continue — mais chaque
 *    segment restait centré sur SA cellule, donc des traits parallèles
 *    décalés latéralement. Une direction ne suffit pas à dessiner une droite.
 * 6. **La droite entière, direction ET position.** Le centroïde local donne
 *    par où elle passe, le moment d'ordre deux autour de lui donne son
 *    inclinaison : c'est la droite des moindres carrés du nuage. Toutes les
 *    cellules d'un même tronc tracent alors sur la même droite et leurs
 *    segments se recouvrent en une seule ligne. De la lecture de donnée, du
 *    début à la fin.
 *
 * **Ce que le dessin pose** : la couleur d'un tronc pourrissant, et le fait
 * qu'un tronc qui barre soit plus sombre — il est mouillé de son côté amont.
 * Le SEUIL qui décide, lui, vient du moteur : `SINUS_BARRANT_MINIMAL`, le
 * sinus de trente degrés, mesuré sur table basculante avec sa source. Et
 * l'ÉPAISSEUR vient de `couvertureDuBoisAuSol` : le segment traverse un
 * mètre, donc la part couverte est sa largeur en mètres.
 *
 * **Ce qui explique enfin quelque chose au joueur** : une cellule plus humide
 * que sa voisine à charge de bois égale. La cause était modélisée et
 * invisible.
 */
function dessinerBoisAuSol(
  ctx: CanvasRenderingContext2D,
  donnees: DonneesSol,
  x0: number,
  y0: number,
  xFin: number,
  yFin: number,
  vue: Vue,
  decalage: { dx: number; dy: number },
): void {
  const bois = donnees.boisAuSol;
  if (!bois) return;
  const charge = (x: number, y: number) =>
    x < 0 || y < 0 || x >= donnees.coteM || y >= donnees.coteM
      ? 0
      : (bois[y * donnees.coteM + x] ?? 0);
  ctx.lineCap = "round";
  for (let y = y0; y < yFin; y++) {
    for (let x = x0; x < xFin; x++) {
      const i = y * donnees.coteM + x;
      const longueurM = longueurDeTroncM(bois[i] ?? 0);
      // Sous un dixième de mètre de tronc par mètre carré, il n'y a pas de
      // tronc : il y a des brindilles, et la litière s'en charge déjà.
      if (longueurM < TRONC_LE_PLUS_COURT_M) continue;
      const part = Math.min(1, Math.max(0, donnees.boisEnTravers?.[i] ?? 0));
      const z = donnees.altitudesM[i] ?? 0;
      const largeurM = Math.min(1, couvertureDuBoisAuSol(longueurM));
      ctx.strokeStyle = versCss(part >= SINUS_BARRANT_MINIMAL ? TRONC_BARRANT : TRONC_AU_SOL);
      ctx.lineWidth = Math.max(1, largeurM * METRE_VERTICAL_PX * vue.cam.zoom);
      // **La direction, ajustée sur un VOISINAGE et non sur les huit voisins
      // immédiats.** L'empreinte que le moteur écrit est la rastérisation d'un
      // tronc droit : à un mètre de résolution, un tronc oblique devient un
      // escalier. Relier fidèlement les cellules voisines reproduisait donc
      // l'escalier — un tuyau en marches, avec un trou triangulaire à chaque
      // décrochement. Ce qu'on veut est la droite QUE l'escalier approxime.
      //
      // Elle se lit dans le moment d'ordre deux de l'empreinte locale, ce qui
      // est la façon standard de retrouver une droite dans un nuage : l'axe
      // principal du nuage des cellules chargées autour de celle-ci.
      const dir = axeDeLEmpreinte(charge, x, y);
      // Le segment passe par le centroïde local, pas par le centre de la
      // cellule : toutes les cellules d'un même tronc tracent alors sur la
      // MÊME droite, et leurs segments se recouvrent en une seule ligne.
      const mx = x + 0.5 + dir.cx;
      const my = y + 0.5 + dir.cy;
      const a = versEcranVue(
        { x: mx + dir.x * DEMI_TRAVERSEE_M, y: my + dir.y * DEMI_TRAVERSEE_M, z },
        vue,
      );
      const b = versEcranVue(
        { x: mx - dir.x * DEMI_TRAVERSEE_M, y: my - dir.y * DEMI_TRAVERSEE_M, z },
        vue,
      );
      ctx.beginPath();
      ctx.moveTo(a.sx - decalage.dx, a.sy - decalage.dy);
      ctx.lineTo(b.sx - decalage.dx, b.sy - decalage.dy);
      ctx.stroke();
    }
  }
}

/**
 * L'axe principal de l'empreinte de bois autour d'une cellule, normé.
 *
 * Le moment d'ordre deux du nuage des cellules chargées, pondéré par leur
 * charge : c'est la droite des moindres carrés du nuage, donc le tronc que
 * l'escalier de la rastérisation approxime. Sur un nuage sans direction — une
 * cellule isolée — les deux moments sont égaux et l'axe sort horizontal, ce
 * qui est aussi bon qu'autre chose pour un bout de bois d'un mètre.
 */
function axeDeLEmpreinte(
  charge: (x: number, y: number) => number,
  x: number,
  y: number,
): { x: number; y: number; cx: number; cy: number } {
  // Le CENTROÏDE d'abord, et c'est lui qui manquait au jet précédent : une
  // direction juste ne suffit pas à dessiner une droite, il faut aussi savoir
  // par où elle passe. Des segments bien orientés mais centrés chacun sur sa
  // cellule donnaient des traits parallèles décalés latéralement — l'escalier
  // de la rastérisation, cette fois en biais.
  let poids = 0;
  let mx = 0;
  let my = 0;
  for (let dy = -RAYON_AJUSTEMENT; dy <= RAYON_AJUSTEMENT; dy++) {
    for (let dx = -RAYON_AJUSTEMENT; dx <= RAYON_AJUSTEMENT; dx++) {
      const w = charge(x + dx, y + dy);
      if (w <= 0) continue;
      poids += w;
      mx += w * dx;
      my += w * dy;
    }
  }
  const cx = poids > 0 ? mx / poids : 0;
  const cy = poids > 0 ? my / poids : 0;
  // Puis le moment d'ordre deux AUTOUR du centroïde : c'est la droite des
  // moindres carrés du nuage, donc le tronc que l'escalier approxime.
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let dy = -RAYON_AJUSTEMENT; dy <= RAYON_AJUSTEMENT; dy++) {
    for (let dx = -RAYON_AJUSTEMENT; dx <= RAYON_AJUSTEMENT; dx++) {
      const w = charge(x + dx, y + dy);
      if (w <= 0) continue;
      const ex = dx - cx;
      const ey = dy - cy;
      sxx += w * ex * ex;
      sxy += w * ex * ey;
      syy += w * ey * ey;
    }
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: Math.cos(angle), y: Math.sin(angle), cx, cy };
}

/**
 * Rayon du voisinage sur lequel on ajuste la direction du tronc, en cellules.
 *
 * Deux : assez pour lisser l'escalier d'une rastérisation à un mètre — cinq
 * cellules de portée suffisent à distinguer une pente de 1/1 d'une pente de
 * 1/2 — assez peu pour qu'un tronc en croise un autre sans que les deux
 * directions se mélangent.
 */
const RAYON_AJUSTEMENT = 2;

/**
 * La demi-longueur du segment tracé dans une cellule, m.
 *
 * Un peu plus d'un demi-mètre : le segment traverse la cellule de bord à bord
 * quel que soit son angle, si bien qu'il se raccorde à celui de la cellule
 * voisine. C'est ce raccordement, et non la couverture au sol, qui fait qu'on
 * voit un tronc et non une chaîne de taches.
 */
const DEMI_TRAVERSEE_M = 0.72;

/** Longueur de tronc par m² en dessous de laquelle il n'y a pas de tronc, m. */
const TRONC_LE_PLUS_COURT_M = 0.1;
/**
 * Longueur de tronc au mètre carré qui couvre la cellule entière, m.
 *
 * L'inverse de `EMPRISE_PAR_METRE_DE_TRONC` du moteur : c'est l'échelle sur
 * laquelle la signature quantifie, pour qu'elle soit celle du modèle et non
 * un plafond choisi ici.
 */
const TRONC_POUR_UNE_PLEINE_EMPRISE_M = 1 / EMPRISE_PAR_METRE_DE_TRONC;
/** Un tronc couché qui pourrit : gris-brun, plus sombre que la litière. */
const TRONC_AU_SOL: Teinte = { r: 96, g: 84, b: 68 };
/** Le même, en travers de la pente : mouillé en amont, donc plus sombre. */
const TRONC_BARRANT: Teinte = { r: 72, g: 62, b: 50 };

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
      // Le zoom COMPARÉ est celui de cuisson : deux zooms voisins tombent sur
      // le même barreau de l'échelle et partagent donc leur image.
      const bonZoom =
        existant?.zoomCuit === zoomDeCuisson(vue.cam.zoom) &&
        existant?.orientationCuite === vue.cam.orientation;
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
      const vueDeCuisson: Vue = {
        ...vue,
        cam: { ...vue.cam, zoom: zoomDeCuisson(vue.cam.zoom) },
      };
      const cuit = cuireMorceau(donnees, ix, iy, semaineAnnee, vueDeCuisson, this.fabriquer);
      this.morceaux.set(this.cle(ix, iy), {
        ix,
        iy,
        x0: ix * COTE_MORCEAU_M,
        y0: iy * COTE_MORCEAU_M,
        coteM: COTE_MORCEAU_M,
        signature: signatureMorceau(donnees, ix, iy, semaineAnnee),
        image: cuit.image,
        decalage: cuit.decalage,
        ancre: cuit.ancre,
        decalageRelatif: cuit.decalageRelatif,
        zoomCuit: zoomDeCuisson(vue.cam.zoom),
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
      // **Une image d'une AUTRE orientation ne se repose pas.** Le zoom, si :
      // l'ancre se reprojette et l'image s'étire. La rotation, non — l'image
      // montre la parcelle vue d'un autre côté, et la reprojeter la poserait au
      // bon endroit avec le mauvais contenu. Une capture l'a montré : après un
      // quart de tour, le sol se couvrait de rectangles décalés en diagonale.
      // Mieux vaut un trou d'une image ou deux, le temps que la cuisson
      // rattrape, qu'un sol faux.
      if (m?.image && m.orientationCuite === vue.cam.orientation) sortie.push(m);
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

/**
 * Le décor : les morceaux du HORS-parcelle, cuits comme le terrain.
 *
 * Séparé de `Terrain` et non fondu dedans, pour trois raisons qui tiennent
 * toutes à la nature du décor :
 *  - il ne dépend d'AUCUNE grandeur qui change dans le temps — ni saison, ni
 *    humidité, ni litière — donc il n'a pas de signature à comparer : une fois
 *    cuit pour un zoom et une orientation, il est bon pour la partie entière ;
 *  - ses indices de morceau sont NÉGATIFS, ce que la clé entière de `Terrain`
 *    ne sait pas encoder ;
 *  - il se dessine AVANT la parcelle et n'entre pas dans l'ordre du peintre des
 *    arbres : rien de ce qu'il contient n'est un objet de la simulation.
 */

/** Un morceau de décor cuit. */
export interface MorceauDecor {
  ix: number;
  iy: number;
  image: HTMLCanvasElement;
  decalage: { dx: number; dy: number };
  /** point de parcelle de référence, pour reposer l'image à un autre zoom */
  ancre: { x: number; y: number; z: number };
  decalageRelatif: { dx: number; dy: number };
  /** zoom auquel l'image a été cuite */
  zoomCuit: number;
  profondeur: number;
}

/**
 * Cuit un morceau de décor. Rend `undefined` si le morceau est entièrement
 * dans la parcelle — il n'y a alors rien à dessiner, c'est du terrain.
 */
export function cuireMorceauDecor(
  bordures: DecorBordures,
  altitudesM: readonly number[],
  coteM: number,
  ix: number,
  iy: number,
  vue: Vue,
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
):
  | {
      image: HTMLCanvasElement;
      decalage: { dx: number; dy: number };
      ancre: { x: number; y: number; z: number };
      decalageRelatif: { dx: number; dy: number };
    }
  | undefined {
  const x0 = ix * COTE_MORCEAU_M;
  const y0 = iy * COTE_MORCEAU_M;
  const x1 = x0 + COTE_MORCEAU_M;
  const y1 = y0 + COTE_MORCEAU_M;
  // Entièrement dedans : rien à faire, c'est du terrain. Partout ailleurs on
  // cuit, **sans limite d'étendue** : la nappe doit couvrir tout le cadre, sans
  // quoi il reste du ciel autour de la parcelle et elle flotte de nouveau. Ce
  // qui borne le travail, c'est le champ de vision (`Decor.morceauxVisibles`),
  // pas une distance arbitraire. Un morceau à cheval sur la limite est cuit, et
  // ses quads intérieurs sont sautés un par un.
  if (x0 >= 0 && y0 >= 0 && x1 <= coteM && y1 <= coteM) return undefined;

  const moyenne = altitudeMoyenneParcelle(altitudesM, coteM);
  const pente = penteMoyenne(altitudesM, coteM);
  const z = (x: number, y: number): number =>
    altitudeDecor(altitudesM, coteM, moyenne, x, y, pente);

  // Emprise écran, comme pour le terrain, mais sur les seuls coins : le décor
  // n'a pas de relief accidenté, son altitude est monotone entre deux coins.
  let minSx = Number.POSITIVE_INFINITY;
  let maxSx = Number.NEGATIVE_INFINITY;
  let minSy = Number.POSITIVE_INFINITY;
  let maxSy = Number.NEGATIVE_INFINITY;
  const hautMax = 22; // la plus haute masse possible, cf. `masseDeLaCase`
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const) {
    for (const h of [0, hautMax]) {
      const e = versEcranVue({ x, y, z: z(x, y) + h }, vue);
      minSx = Math.min(minSx, e.sx);
      maxSx = Math.max(maxSx, e.sx);
      minSy = Math.min(minSy, e.sy);
      maxSy = Math.max(maxSy, e.sy);
    }
  }
  // Les masses débordent latéralement du morceau, et le flanc descend.
  const margePx = TUILE_LARGEUR_PX * vue.cam.zoom * 6;
  minSx -= margePx;
  maxSx += margePx;
  maxSy += margePx;
  const largeur = Math.max(1, Math.ceil(maxSx - minSx) + 2);
  const hauteur = Math.max(1, Math.ceil(maxSy - minSy) + 2);
  const image = fabriquer(largeur, hauteur);
  const ctx = image.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");
  const decalage = { dx: minSx - 1, dy: minSy - 1 };

  const demiLargeur = (TUILE_LARGEUR_PX * vue.cam.zoom) / 2;

  // ── La nappe ──────────────────────────────────────────────────────────
  // Grossière : quatre mètres par quad. Le décor n'a pas de détail à montrer,
  // et la brume en mangerait la moitié de toute façon.
  const pas = 4;
  const quads: { x: number; y: number }[] = [];
  for (let y = y0; y < y1; y += pas) {
    for (let x = x0; x < x1; x += pas) {
      quads.push({ x, y });
    }
  }
  quads.sort((a, b) => profondeur(a.x, a.y, vue.cam) - profondeur(b.x, b.y, vue.cam));
  // Chaque quad est tracé par ses QUATRE COINS, chacun à sa propre altitude,
  // et non comme un losange plat posé à l'altitude du centre.
  //
  // **C'est la correction d'un défaut qu'une capture a montré tout de suite.**
  // Des losanges plats sur une pente forment des terrasses : entre deux rangs,
  // il reste soit un décrochement sombre, soit un liseré de ciel, et le décor
  // se lisait en longues stries horizontales régulières — exactement le genre
  // de motif que l'œil attrape en premier, donc exactement ce que le décor ne
  // doit pas faire. Deux quads voisins partagent leurs coins : la nappe est
  // continue par construction, sans terrasse et sans joint à boucher.
  for (const { x, y } of quads) {
    const cxM = x + pas / 2;
    const cyM = y + pas / 2;
    // Le quad qui recouvre la parcelle est sauté : c'est du terrain, et le
    // terrain se dessine par-dessus de toute façon. Le sauter évite qu'un
    // liseré de décor déborde à l'intérieur de la limite.
    if (distanceAuBord(cxM, cyM, coteM) <= 0) continue;
    // Le même grain que le sol de la parcelle : sans lui, au zoom rapproché le
    // décor est un aplat parfaitement lisse contre un sol texturé, et la limite
    // de parcelle se lit comme une découpe de papier. Le grain est atténué —
    // le hors-parcelle n'a pas à montrer de matière, juste à ne pas être plat.
    const matiereDecor = 1 + (facteurGrain(cxM, cyM, TUILE_LARGEUR_PX * vue.cam.zoom) - 1) * 0.6;
    const teinte = versCss(eclairer(couleurDecor(bordures, cxM, cyM, coteM), matiereDecor));
    ctx.fillStyle = teinte;
    ctx.strokeStyle = teinte;
    ctx.lineWidth = 1;
    ctx.beginPath();
    [
      [x, y],
      [x + pas, y],
      [x + pas, y + pas],
      [x, y + pas],
    ].forEach(([px, py], k) => {
      const e = versEcranVue(
        { x: px as number, y: py as number, z: z(px as number, py as number) },
        vue,
      );
      const ex = e.sx - decalage.dx;
      const ey = e.sy - decalage.dy;
      if (k === 0) ctx.moveTo(ex, ey);
      else ctx.lineTo(ex, ey);
    });
    ctx.closePath();
    ctx.fill();
    // Un trait de la même couleur ferme le demi-pixel que l'antialiasing
    // laisse entre deux quads voisins — le même remède que pour l'eau libre.
    ctx.stroke();
  }

  // ── Les masses ────────────────────────────────────────────────────────
  for (const m of massesDuDecor(bordures, coteM, x0 - 8, y0 - 8, x1 + 8, y1 + 8)) {
    // Une masse n'appartient au morceau que si son PIED y est : sinon deux
    // morceaux voisins la dessineraient tous les deux, et le recouvrement se
    // verrait sur les bords doux.
    if (m.x < x0 || m.x >= x1 || m.y < y0 || m.y >= y1) continue;
    const distance = distanceAuBord(m.x, m.y, coteM);
    const fond = couleurDecor(bordures, m.x, m.y, coteM);
    const pied = versEcranVue({ x: m.x, y: m.y, z: z(m.x, m.y) }, vue);
    const px = pied.sx - decalage.dx;
    const py = pied.sy - decalage.dy;
    const rx = demiLargeur * 2 * m.rayonM * 0.5;
    const hy = (m.hauteurM * TUILE_HAUTEUR_PX * vue.cam.zoom) / 2;
    ctx.fillStyle = versCss(couleurMasse(m.masse, fond, distance));
    if (m.masse === "bois") {
      // Une masse boisée, c'est un dôme : à cette distance, aucun houppier
      // individuel ne se lit, seule la silhouette du bosquet compte.
      // Le dôme POSE sur le sol : centré à mi-hauteur, de demi-hauteur égale,
      // il touche le pied au lieu de flotter au-dessus.
      ctx.beginPath();
      ctx.ellipse(px, py - hy * 0.5, rx, hy * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.masse === "bati") {
      // Un volume isométrique : le losange du toit, et les deux faces qui
      // descendent au sol. La demi-hauteur du losange se déduit de sa
      // demi-largeur par l'écrasement de la projection — la calculer autrement
      // donnait un toit qui passait SOUS sa propre base, et le bâtiment
      // sortait en chevron.
      const rh = (rx * TUILE_HAUTEUR_PX) / TUILE_LARGEUR_PX;
      const toit = py - hy;
      ctx.beginPath();
      ctx.moveTo(px - rx, toit);
      ctx.lineTo(px, toit + rh);
      ctx.lineTo(px + rx, toit);
      ctx.lineTo(px + rx, py);
      ctx.lineTo(px, py + rh);
      ctx.lineTo(px - rx, py);
      ctx.closePath();
      ctx.fill();
      // Le toit, à peine détaché : sans lui le volume est une silhouette plate,
      // mais un toit franchement plus clair faisait sortir les bâtiments en
      // hexagones pâles sur la capture — l'inverse de ce que le décor doit
      // faire.
      ctx.fillStyle = versCss(eclairer(couleurMasse(m.masse, fond, distance), 1.04));
      ctx.beginPath();
      ctx.moveTo(px - rx, toit);
      ctx.lineTo(px, toit - rh);
      ctx.lineTo(px + rx, toit);
      ctx.lineTo(px, toit + rh);
      ctx.closePath();
      ctx.fill();
    } else {
      // Une culture : une bande basse, orientée comme les sillons le seraient.
      ctx.beginPath();
      ctx.ellipse(px, py, rx * 1.6, Math.max(1, hy * 1.2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const ancre = { x: x0, y: y0, z: z(x0, y0) };
  const ancreEcran = versEcranVue(ancre, vue);
  return {
    image,
    decalage,
    ancre,
    decalageRelatif: { dx: decalage.dx - ancreEcran.sx, dy: decalage.dy - ancreEcran.sy },
  };
}

/**
 * Le cache du décor. Une seule cuisson par morceau et par (zoom, orientation) :
 * rien de ce qu'il contient ne change avec le temps.
 */
export class Decor {
  private readonly morceaux = new Map<string, MorceauDecor>();
  /**
   * Les morceaux qui n'ont RIEN à dessiner — ceux qui tombent entièrement dans
   * la parcelle.
   *
   * **Sans cette mémoire, ils se recuisent à chaque image**, et pour toujours :
   * `cuireMorceauDecor` rend `undefined`, rien n'entre dans le cache, donc
   * `rafraichir` les redemande à l'image suivante. Mesuré sur la vue Pixi :
   * trois cents morceaux restaient éternellement « en attente », le budget
   * était dépensé chaque image à recalculer qu'il n'y avait rien à faire, et la
   * ceinture de décor n'apparaissait jamais. Un cache qui ne mémorise pas les
   * réponses vides n'est pas un cache.
   */
  private readonly vides = new Set<string>();
  private zoomCuit = Number.NaN;
  private orientationCuite = Number.NaN;
  private aCuire: { ix: number; iy: number }[] = [];

  constructor(
    private readonly fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
    private readonly coteM: number,
    private readonly bordures: DecorBordures,
    private readonly altitudesM: readonly number[],
  ) {}

  /** Dresse la liste des morceaux de décor à cuire pour la vue courante. */
  public rafraichir(vue: Vue): number {
    // Le décor suit la même échelle de cuisson que le terrain : sans elle, un
    // cran de molette le jetait entier, et le hors-parcelle disparaissait
    // pendant qu'on zoomait — exactement ce qu'il est censé empêcher.
    if (
      zoomDeCuisson(vue.cam.zoom) !== this.zoomCuit ||
      vue.cam.orientation !== this.orientationCuite
    ) {
      this.morceaux.clear();
      this.vides.clear();
      this.zoomCuit = zoomDeCuisson(vue.cam.zoom);
      this.orientationCuite = vue.cam.orientation;
    }
    const emprise = celluleVisibles(vue);
    if (!emprise) {
      this.aCuire = [];
      return 0;
    }
    const aCuire: { ix: number; iy: number }[] = [];
    for (const { ix, iy } of this.morceauxVisibles(emprise, vue)) {
      const cle = `${ix},${iy}`;
      if (!this.morceaux.has(cle) && !this.vides.has(cle)) aCuire.push({ ix, iy });
    }
    this.aCuire = aCuire.reverse();
    return aCuire.length;
  }

  private morceauxVisibles(emprise: Emprise, vue: Vue): { ix: number; iy: number }[] {
    // L'emprise des CELLULES s'arrête à la parcelle ; le décor, lui, occupe
    // tout l'écran. On élargit donc jusqu'à couvrir la diagonale du cadre — ce
    // qui, dans cette projection, est le plus grand débordement possible.
    const portee = Math.ceil(
      Math.max(
        vue.largeurPx / (TUILE_LARGEUR_PX * vue.cam.zoom),
        vue.hauteurPx / (TUILE_HAUTEUR_PX * vue.cam.zoom),
      ) + COTE_MORCEAU_M,
    );
    const elargie: Emprise = {
      x0: emprise.x0 - portee,
      y0: emprise.y0 - portee,
      x1: emprise.x1 + portee,
      y1: emprise.y1 + portee,
    };
    // **Et l'élargissement seul ne suffit pas : il faut ensuite ÉCARTER ce qui
    // ne touche pas le cadre.** La portée est un rayon, appliqué dans les deux
    // axes : elle décrit un CARRÉ de parcelle là où la région visible, dans une
    // projection dimétrique, est un LOSANGE. Les quatre coins du carré sont
    // donc entièrement hors écran, et ils font la majorité de sa surface.
    //
    // Mesuré à la vue par défaut d'une parcelle d'un hectare (900 × 640, zoom
    // minimal) : **729 morceaux demandés, 150 utiles.** Quatre morceaux sur
    // cinq étaient cuits, gardés en mémoire, transformés en texture GPU et
    // posés à chaque image pour rien — et c'est la vue que le joueur voit en
    // premier, celle dont la ceinture de décor apparaissait par plaques
    // pendant trois secondes.
    //
    // Le test est celui que `posesDesArbres` fait déjà pour les arbres : on
    // projette l'emprise du morceau et on la compare au cadre. Quatre
    // projections par candidat, de l'arithmétique pure, contre quatre cinquièmes
    // d'une couche entière.
    return morceauxDeLEmprise(elargie, vue).filter((m) => this.toucheLeCadre(m.ix, m.iy, vue));
  }

  /**
   * L'emprise écran d'un morceau croise-t-elle le cadre ?
   *
   * **Les quatre coins au sol ne suffisent pas, et une bande de ciel l'a
   * montré.** Le premier jet ne testait que le quadrilatère du sol ; la
   * comparaison pixel à pixel avec la même image sans découpe a laissé mille
   * pixels d'écart, groupés en haut du cadre — des entailles pâles où le ciel
   * traversait, à l'endroit exact des morceaux rejetés.
   *
   * **Et la deuxième explication était fausse aussi.** J'ai d'abord cru aux
   * MASSES : un bois monte à seize mètres, donc un morceau dont le sol passe
   * au-dessus du bord garderait ses masses dans le cadre. Remonter le bord
   * supérieur n'a rien changé — au pixel près le même millier d'écarts — parce
   * qu'une masse se dessine vers le haut, ce qui l'éloigne du cadre au lieu de
   * l'y ramener.
   *
   * Ce qui débordait était l'IMAGE du morceau elle-même : elle est cuite avec
   * sa propre marge (brume, dégradés, masses qui dépassent du carreau) et ne se
   * réduit pas à l'emprise au sol. Plutôt que de chercher de quel côté et de
   * combien — on l'a vu, une explication plausible ne suffit pas — on gonfle
   * l'emprise écran d'un côté de morceau plus la plus haute masse, dans les
   * quatre directions. C'est large, et c'est fait pour : la découpe reste très
   * gagnante (mesurée à 729 morceaux demandés contre 336, et 693 posés contre 300) et l'image est
   * vérifiée identique au pixel près.
   */
  private toucheLeCadre(ix: number, iy: number, vue: Vue): boolean {
    let sxMin = Number.POSITIVE_INFINITY;
    let sxMax = Number.NEGATIVE_INFINITY;
    let syMin = Number.POSITIVE_INFINITY;
    let syMax = Number.NEGATIVE_INFINITY;
    for (const [dx, dy] of COINS_MORCEAU) {
      const e = versEcranVue(
        { x: (ix + dx) * COTE_MORCEAU_M, y: (iy + dy) * COTE_MORCEAU_M, z: 0 },
        vue,
      );
      sxMin = Math.min(sxMin, e.sx);
      sxMax = Math.max(sxMax, e.sx);
      syMin = Math.min(syMin, e.sy);
      syMax = Math.max(syMax, e.sy);
    }
    const marge =
      (COTE_MORCEAU_M * TUILE_LARGEUR_PX + MASSE_LA_PLUS_HAUTE_M * METRE_VERTICAL_PX) *
      vue.cam.zoom;
    return (
      sxMax + marge >= 0 &&
      sxMin - marge <= vue.largeurPx &&
      syMax + marge >= 0 &&
      syMin - marge <= vue.hauteurPx
    );
  }

  /** Cuit au plus `budget` morceaux de décor. Rend le nombre réellement cuit. */
  public cuire(vue: Vue, budget = BUDGET_CUISSON_PAR_IMAGE): number {
    let faits = 0;
    while (faits < budget) {
      const suivant = this.aCuire.shift();
      if (!suivant) break;
      const { ix, iy } = suivant;
      const vueDeCuisson: Vue = {
        ...vue,
        cam: { ...vue.cam, zoom: zoomDeCuisson(vue.cam.zoom) },
      };
      const cuit = cuireMorceauDecor(
        this.bordures,
        this.altitudesM,
        this.coteM,
        ix,
        iy,
        vueDeCuisson,
        this.fabriquer,
      );
      faits++;
      if (!cuit) {
        this.vides.add(`${ix},${iy}`);
        continue;
      }
      this.morceaux.set(`${ix},${iy}`, {
        ix,
        iy,
        image: cuit.image,
        decalage: cuit.decalage,
        ancre: cuit.ancre,
        decalageRelatif: cuit.decalageRelatif,
        zoomCuit: zoomDeCuisson(vue.cam.zoom),
        profondeur: profondeur(
          ix * COTE_MORCEAU_M + COTE_MORCEAU_M / 2,
          iy * COTE_MORCEAU_M + COTE_MORCEAU_M / 2,
          vue.cam,
        ),
      });
    }
    return faits;
  }

  /** Les morceaux de décor à poser, dans l'ordre du peintre. */
  public aPoser(vue: Vue): MorceauDecor[] {
    const emprise = celluleVisibles(vue);
    if (!emprise) return [];
    const sortie: MorceauDecor[] = [];
    for (const { ix, iy } of this.morceauxVisibles(emprise, vue)) {
      const m = this.morceaux.get(`${ix},${iy}`);
      if (m) sortie.push(m);
    }
    return sortie;
  }

  public get enRetard(): number {
    return this.aCuire.length;
  }
}
