/**
 * L'aperçu : une page qui compose la scène complète — décor, sol, ombres —
 * pour qu'on puisse la REGARDER.
 *
 * Ce n'est pas le jeu, et ce n'est plus le banc de mesure du lot L0, qui est
 * supprimé depuis que D1 est tranchée. C'est la **boucle de revue du rendu** :
 * l'endroit où l'assemblage des couches est écrit une seule fois, et l'endroit
 * d'où sortent les captures qu'on soumet pour dire si c'est beau ou non.
 *
 * Versionné exprès. Une première version vivait dans un dossier temporaire et a
 * disparu avec lui, ce qui a coûté une reconstruction complète.
 *
 * Les scènes qu'il charge viennent de `scripts/apercu-scene.ts` et vivent dans
 * `apercu/scenes/`, qui n'est pas versionné — un mégaoctet par instantané.
 */

import { getEspece } from "../engine/especes";
import type { ContextePhenologique } from "../engine/phenologie";
import { partFoliaireOmbrageanteDans, senescenceDans } from "../engine/phenologie";
import { tournerVue, type Vue, vueInitiale, zoomMax } from "../render/camera";
import {
  type ArbreAPoser,
  AtlasArbres,
  ancrageDePose,
  fourreEnArbre,
  posesDesArbres,
  separerLeFourre,
  tailleDePose,
} from "../render/couches/arbres";
import { BRUME, type DecorBordures } from "../render/couches/decor";
import {
  cuireTachesOmbre,
  MODE_ACCUMULATION,
  MODE_COMPOSITION,
  MODE_LIMITE,
  ombresAPoser,
} from "../render/couches/ombres";
import { Decor, type DonneesSol, Terrain } from "../render/couches/terrain";
import { versCss } from "../render/palette";

const fabriquer = (largeur: number, hauteur: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(largeur));
  c.height = Math.max(1, Math.ceil(hauteur));
  return c;
};

interface ArbreScene {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  chandelle: boolean;
  hauteurElagueeM?: number;
  teteTrogneM?: number;
  /** `baseHouppierM` du protocole : la base du houppier, m */
  baseHouppierM?: number;
  /** `floraison` du protocole : part de la couronne en fleur ∈ [0,1] */
  floraison?: number;
  vigueur?: number;
  /** `fruitProgress` du protocole : avancement du fruit de l'année ∈ [0,1] */
  fruitProgress?: number;
  /** `fruitsKg` du protocole : les fruits mûrs qui attendent la récolte */
  fruitsKg?: number;
}

interface Scene {
  coteM: number;
  week: number;
  trees: ArbreScene[];
  sol: {
    ruMm: number;
    enEau?: boolean[];
    debordementMm?: number[];
    altitudesM: number[];
    waterMm: number[];
    herbeCouverture: number[];
    herbeBiomasse: number[];
    litiereCG: number[];
    lumiere?: number[];
    bordures?: DecorBordures;
    pheno?: ContextePhenologique;
  };
}

function donneesDe(scene: Scene): DonneesSol {
  const n = scene.coteM * scene.coteM;
  const humidite = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    humidite[i] = Math.min(1, Math.max(0, (scene.sol.waterMm[i] ?? 0) / scene.sol.ruMm));
  }
  return {
    coteM: scene.coteM,
    altitudesM: scene.sol.altitudesM,
    humidite,
    herbe: Float32Array.from(scene.sol.herbeCouverture),
    herbeBiomasse: Float32Array.from(scene.sol.herbeBiomasse),
    litiereCG: Float32Array.from(scene.sol.litiereCG),
    ...(scene.sol.lumiere ? { lumiere: Float32Array.from(scene.sol.lumiere) } : {}),
    ...(scene.sol.enEau ? { enEau: scene.sol.enEau } : {}),
    ...(scene.sol.debordementMm
      ? { debordementMm: Float32Array.from(scene.sol.debordementMm) }
      : {}),
  };
}

/**
 * Part du feuillage qui fait de l'ombre, et avancement de la sénescence.
 *
 * **Lus dans le contexte phénologique du moteur, pas approchés ici.** La page
 * calculait d'abord « un caduc est nu de la semaine 45 à la 14 », ce qui est
 * grossièrement vrai et précisément faux : le calendrier dépend de l'espèce,
 * des degrés-jours de l'année et des semaines de froid. Deux calendriers,
 * celui du moteur et celui de l'écran, dériveraient — et c'est exactement ce
 * que le §2.1 interdit : « une seule loi, deux appelants, aucune dérive
 * possible ».
 */
function feuillageDe(
  especeId: string,
  pheno: ContextePhenologique | undefined,
): { part: number; senescence: number } {
  const espece = getEspece(especeId);
  if (!espece || !pheno) return { part: 1, senescence: 0 };
  return {
    part: partFoliaireOmbrageanteDans(espece, pheno),
    senescence: senescenceDans(espece, pheno),
  };
}

/**
 * Le ciel, qui vaut exactement la brume du décor.
 *
 * J'avais essayé un dégradé, pour donner un horizon. Il fabrique surtout une
 * COUTURE : la ceinture de décor s'éteint vers la brume, or la brume ne
 * coïncide avec le ciel qu'à une seule hauteur d'écran, et partout ailleurs le
 * bord de la ceinture redevient un trait net. Un ciel d'une seule couleur, la
 * même que celle vers laquelle le décor s'éteint, fait disparaître ce bord où
 * qu'il tombe. L'horizon vient alors de la forme de la ceinture, ce qui suffit.
 */
function peindreLeCiel(ctx: CanvasRenderingContext2D, largeur: number, hauteur: number): void {
  ctx.fillStyle = versCss(BRUME);
  ctx.fillRect(0, 0, largeur, hauteur);
}

/**
 * Compose une image complète et la rend.
 *
 * **L'ordre est la seule chose qui compte ici, et il porte deux corrections.**
 * Le décor va sur le MÊME calque que le sol, pas derrière : c'est ce qui fait
 * que l'ombre d'un arbre de bordure tombe sur le décor au lieu de disparaître.
 * Et le masque d'ombre est découpé à la silhouette de ce calque AVANT d'être
 * multiplié — sinon il déborde sur le ciel, ce qui faisait flotter la parcelle.
 */
interface Options {
  /** poser les ombres (défaut : oui) */
  ombres?: boolean;
  /** dessiner le hors-parcelle (défaut : oui) */
  decor?: boolean;
  /** NE PAS borner les ombres au sol — pour montrer le défaut qu'on a corrigé */
  ombresDebordantes?: boolean;
  /** poser les arbres (défaut : oui) */
  arbres?: boolean;
  /** planche : dessiner les sujets NUS, pour juger la ramure d'hiver */
  nu?: boolean;
  /** planche : avancement de la sénescence ∈ [0,1] */
  senescence?: number;
  /** planche : facteur d'échelle, pour zoomer sur un sujet */
  echelle?: number;
  /**
   * Planche : avancement du fruit ∈ [0,1] et kilos mûrs, tels que le moteur les
   * donnerait. Ce sont les DEUX grandeurs du protocole, pas un réglage : la
   * planche les impose pour qu'on puisse juger les deux états côte à côte, ce
   * qu'aucune semaine réelle ne permet — un pommier et un arbousier ne mûrissent
   * pas le même mois.
   */
  fruitProgress?: number;
  fruitsKg?: number;
  /**
   * Planche : la base du houppier, en PART de la hauteur de l'arbre.
   *
   * Comme le fruit, c'est une grandeur du moteur que la planche IMPOSE pour
   * pouvoir comparer — un sujet isolé et un sujet de futaie n'existent pas au
   * même endroit de la même parcelle, donc aucune scène réelle ne les met côte
   * à côte. Elle est en part et non en mètres parce que la planche compare des
   * espèces de hauteurs maximales différentes.
   *
   * Absente = 0,25, c'est-à-dire un arbre ayant subi un peu de compétition. Ce
   * n'est pas une valeur par défaut du moteur, c'est le cadrage de la planche,
   * et c'est pour ça qu'elle est déclarée ici et pas ailleurs.
   */
  baseHouppier?: number;
}

function composer(scene: Scene, vue: Vue, options: Options = {}): HTMLCanvasElement {
  const { ombres = true, decor = true, ombresDebordantes = false, arbres = true } = options;
  const donnees = donneesDe(scene);
  const semaine = scene.week % 52;
  const bordures = scene.sol.bordures;

  const sortie = fabriquer(vue.largeurPx, vue.hauteurPx);
  const ctx = sortie.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");
  peindreLeCiel(ctx, vue.largeurPx, vue.hauteurPx);

  // ── Le calque du sol : TRANSPARENT hors terrain, décor compris ─────────
  const calque = fabriquer(vue.largeurPx, vue.hauteurPx);
  const cq = calque.getContext("2d");
  if (!cq) throw new Error("contexte 2d indisponible");

  if (bordures && decor) {
    const lieu = new Decor(fabriquer, scene.coteM, bordures, scene.sol.altitudesM);
    lieu.rafraichir(vue);
    lieu.cuire(vue, 10000);
    for (const m of lieu.aPoser(vue)) {
      cq.drawImage(m.image, m.decalage.dx, m.decalage.dy);
    }
  }

  // La silhouette de la PARCELLE SEULE, décor exclu : c'est elle qui borne
  // l'ombre. Le décor est là pour se taire, et une tache sombre posée dessus
  // attire l'œil là où il n'y a rien à voir.
  const silhouette = fabriquer(vue.largeurPx, vue.hauteurPx);
  const sq = silhouette.getContext("2d");
  if (!sq) throw new Error("contexte 2d indisponible");

  const terrain = new Terrain(fabriquer, scene.coteM);
  terrain.rafraichir(donnees, semaine, vue);
  terrain.cuire(donnees, semaine, vue, 10000);
  for (const m of terrain.aPoser(vue)) {
    if (!m.image || !m.decalage) continue;
    cq.drawImage(m.image, m.decalage.dx, m.decalage.dy);
    sq.drawImage(m.image, m.decalage.dx, m.decalage.dy);
  }

  // ── Les ombres ─────────────────────────────────────────────────────────
  if (ombres) {
    const taches = cuireTachesOmbre(fabriquer);
    const masque = fabriquer(vue.largeurPx, vue.hauteurPx);
    const mq = masque.getContext("2d");
    if (!mq) throw new Error("contexte 2d indisponible");
    mq.fillStyle = "rgb(255 255 255)";
    mq.fillRect(0, 0, vue.largeurPx, vue.hauteurPx);
    mq.globalCompositeOperation = MODE_ACCUMULATION;
    const arbres = scene.trees
      .filter((t) => !t.chandelle && t.heightM > 0)
      .map((t) => ({
        x: t.x,
        y: t.y,
        z:
          scene.sol.altitudesM[
            Math.min(scene.coteM - 1, Math.floor(t.y)) * scene.coteM +
              Math.min(scene.coteM - 1, Math.floor(t.x))
          ] ?? 0,
        heightM: t.heightM,
        houppierRatio: getEspece(t.especeId)?.lumiere.houppierRatio ?? 0.4,
        partOmbrageante: feuillageDe(t.especeId, scene.sol.pheno).part,
      }));
    for (const o of ombresAPoser(arbres, vue)) {
      const tache = taches[o.densite];
      if (!tache) continue;
      mq.drawImage(tache, o.sx - o.largeurPx / 2, o.sy - o.hauteurPx / 2, o.largeurPx, o.hauteurPx);
    }
    if (ombresDebordantes) {
      // Le défaut d'avant, reproduit exprès : le masque est multiplié sur TOUTE
      // l'image une fois le sol posé, ciel compris, et la frange grise déborde
      // du plateau. Le sol est donc collé d'abord, puis le masque par-dessus.
      ctx.drawImage(calque, 0, 0);
      ctx.globalCompositeOperation = MODE_COMPOSITION;
      ctx.drawImage(masque, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      return sortie;
    }
    // Découpe à la silhouette de la PARCELLE, puis multiplication : voir
    // `MODE_LIMITE`. Sur la silhouette et non sur `calque`, qui porte aussi le
    // décor — c'est ce qui laissait des taches d'ombre hors de la parcelle.
    mq.globalCompositeOperation = MODE_LIMITE;
    mq.drawImage(silhouette, 0, 0);
    cq.globalCompositeOperation = MODE_COMPOSITION;
    cq.drawImage(masque, 0, 0);
    cq.globalCompositeOperation = "source-over";
  }

  ctx.drawImage(calque, 0, 0);

  // ── Les arbres ─────────────────────────────────────────────────────────
  // **Posés APRÈS le calque du sol, et hors de lui.** Un arbre dépasse du
  // terrain — c'est même tout l'intérêt d'un arbre — donc le découper à la
  // silhouette du sol, comme on le fait des ombres, le décapiterait.
  //
  // Ils ne sont pas non plus entrelacés avec les morceaux de terrain : la
  // décision D3 l'exigera au lot suivant, quand une butte devra masquer le
  // pied des arbres derrière elle. Les deux listes sont déjà triées par la
  // même clé de profondeur, ce qui rendra la fusion mécanique — mais tant que
  // le sol est posé en un bloc, entrelacer ne changerait rien à l'image et
  // masquerait ce qui reste à faire.
  if (arbres) {
    const separe = separerLeFourre(
      scene.trees
        .filter((t) => t.heightM > 0)
        .map((t): ArbreAPoser => {
          const espece = getEspece(t.especeId);
          const f = feuillageDe(t.especeId, scene.sol.pheno);
          return {
            id: t.id,
            especeId: t.especeId,
            x: t.x,
            y: t.y,
            z:
              scene.sol.altitudesM[
                Math.min(scene.coteM - 1, Math.floor(t.y)) * scene.coteM +
                  Math.min(scene.coteM - 1, Math.floor(t.x))
              ] ?? 0,
            heightM: t.heightM,
            houppierRatio: espece?.lumiere.houppierRatio ?? 0.4,
            // Repli à zéro : un arbre dont la scène ne dit pas la base de
            // houppier est branchu jusqu'au sol, ce qui est vrai de tout arbre
            // qui vient de naître — et ce qui ne fabrique aucune longueur de
            // fût, contrairement à la formule qu'on avait ici.
            baseHouppierM: t.baseHouppierM ?? 0,
            ...(t.teteTrogneM ? { teteTrogneM: t.teteTrogneM } : {}),
            ...(t.chandelle ? { chandelle: true } : {}),
            // Une chandelle n'a plus de feuilles : c'est un tronc mort debout.
            partFoliaire: t.chandelle ? 0 : f.part,
            senescence: f.senescence,
            vigueur: t.vigueur ?? 1,
            // Tels quels, sans repli inventé : absent veut dire « la scène ne
            // transporte pas la grandeur », donc pas de fruit — pas « zéro
            // fruit sur un arbre qui en porte ».
            ...(t.fruitProgress ? { fruitProgress: t.fruitProgress } : {}),
            ...(t.fruitsKg ? { fruitsKg: t.fruitsKg } : {}),
          };
        }),
    );
    const poses = posesDesArbres(
      [...separe.arbres, ...separe.fourre.map(fourreEnArbre)],
      (especeId) => getEspece(especeId)?.hauteurMaxM ?? 20,
      vue,
    );
    const atlas = new AtlasArbres(fabriquer);
    atlas.rafraichir(poses);
    // Budget SANS LIMITE : une capture n'a pas de deuxième image, donc rien ne
    // doit rester en attente. Dans le jeu, c'est le budget par image qui
    // s'applique — et il se compte en PIXELS, pas en vignettes : passer 10 000
    // ici ne cuisait plus qu'une seule vignette, et la parcelle sortait vide.
    atlas.cuire(Number.POSITIVE_INFINITY);
    for (const pose of poses) {
      const vignette = atlas.vignette(pose.classe);
      if (!vignette) continue;
      // La vignette est cuite à une RÉSOLUTION (puissance de deux, pour que le
      // cache serve) et posée à sa TAILLE écran. Confondre les deux donnait des
      // arbres trois fois trop grands.
      const taille = tailleDePose(pose.arbre.heightM, vignette, vue);
      const ancre = ancrageDePose(vignette, taille);
      ctx.drawImage(
        vignette.image,
        pose.sx - ancre.dx,
        pose.sy - ancre.dy,
        taille.largeur,
        taille.hauteur,
      );
    }
  }

  return sortie;
}

/**
 * La planche d'essences : un sujet par espèce, à taille comparable, sur un fond
 * neutre.
 *
 * **C'est l'épreuve de la décision D4**, et elle ne se passe pas dans la
 * parcelle : au milieu de cinq mille tiges, on ne juge pas une silhouette. Le
 * critère est écrit noir sur blanc dans le §5.4 — « une essence n'est finie que
 * si quelqu'un d'autre la reconnaît sans étiquette » — et il demande de voir les
 * arbres côte à côte, à la même hauteur, sans rien autour.
 */
function planche(
  especes: readonly string[],
  hauteurM: number,
  largeurPx: number,
  hauteurPx: number,
  options: Options = {},
): HTMLCanvasElement {
  const sortie = fabriquer(largeurPx, hauteurPx);
  const ctx = sortie.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");
  peindreLeCiel(ctx, largeurPx, hauteurPx);

  // **Une GRILLE, et pas une rangée.** Un arbre de seize mètres au houppier
  // large est aussi large que haut : sept côte à côte demandent une image sept
  // fois plus large que haute, où l'on ne voit plus rien. En deux rangs, chaque
  // sujet a une case à peu près carrée — la proportion d'un arbre.
  const colonnes = Math.ceil(Math.sqrt(especes.length * 1.6));
  const lignes = Math.ceil(especes.length / colonnes);
  const largeurCase = largeurPx / colonnes;
  const hauteurCase = hauteurPx / lignes;
  const zoom = (hauteurCase - 46) / (hauteurM * 8);
  const vue: Vue = {
    cam: { coteM: 100, zoom, orientation: 0 },
    centre: { x: 50, y: 50 },
    largeurPx,
    hauteurPx,
  };
  const atlas = new AtlasArbres(fabriquer);
  especes.forEach((especeId, i) => {
    const colonne = i % colonnes;
    const ligne = Math.floor(i / colonnes);
    const sol = (ligne + 1) * hauteurCase - 24;
    const centre = (colonne + 0.5) * largeurCase;
    ctx.fillStyle = "rgb(96 100 74)";
    ctx.fillRect(colonne * largeurCase, sol, largeurCase, 24);
    const espece = getEspece(especeId);
    const arbre: ArbreAPoser = {
      id: 7 + i * 13,
      especeId,
      x: 50,
      y: 50,
      z: 0,
      heightM: Math.min(hauteurM, espece?.hauteurMaxM ?? hauteurM),
      houppierRatio: espece?.lumiere.houppierRatio ?? 0.35,
      baseHouppierM: (options.baseHouppier ?? 0.25) * hauteurM,
      partFoliaire: options.nu ? 0 : 1,
      senescence: options.senescence ?? 0,
      vigueur: 1,
      ...(options.fruitProgress ? { fruitProgress: options.fruitProgress } : {}),
      ...(options.fruitsKg ? { fruitsKg: options.fruitsKg } : {}),
    };
    const poses = posesDesArbres([arbre], () => espece?.hauteurMaxM ?? 20, vue);
    atlas.rafraichir(poses);
    atlas.cuire(Number.POSITIVE_INFINITY);
    const pose = poses[0];
    if (!pose) return;
    const v = atlas.vignette(pose.classe);
    if (!v) return;
    const taille = tailleDePose(arbre.heightM, v, vue);
    const ancre = ancrageDePose(v, taille);
    ctx.drawImage(v.image, centre - ancre.dx, sol - ancre.dy, taille.largeur, taille.hauteur);
    ctx.fillStyle = "rgb(212 210 198)";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(especeId.replace("_", " "), centre, sol + 17);
  });
  return sortie;
}

function vignette(titre: string, image: HTMLCanvasElement): void {
  const fig = document.createElement("figure");
  fig.className = "vignette";
  fig.appendChild(image);
  const cap = document.createElement("figcaption");
  cap.textContent = titre;
  fig.appendChild(cap);
  document.getElementById("captures")?.appendChild(fig);
}

async function charger(nom: string): Promise<Scene> {
  const reponse = await fetch(`/apercu/scenes/${nom}.json`);
  if (!reponse.ok) throw new Error(`scène introuvable : ${nom}`);
  return (await reponse.json()) as Scene;
}

/** Une vue centrée sur un point, à un zoom donné en multiples du zoom mini. */
function cadrer(
  scene: Scene,
  largeur: number,
  hauteur: number,
  facteur: number,
  centre?: { x: number; y: number },
  orientation = 0,
): Vue {
  const altitudeMax = scene.sol.altitudesM.reduce((m, z) => Math.max(m, z), 0);
  let vue = vueInitiale(scene.coteM, largeur, hauteur, altitudeMax);
  for (let i = 0; i < orientation; i++) vue = tournerVue(vue, 1);
  if (facteur !== 1) {
    const borne = Math.min(facteur * vue.cam.zoom, zoomMax(largeur));
    vue = {
      ...vue,
      cam: { ...vue.cam, zoom: borne },
      ...(centre ? { centre } : {}),
    };
  } else if (centre) {
    vue = { ...vue, centre };
  }
  return vue;
}

/**
 * La planche à soumettre : une vignette par question posée.
 *
 * Chaque entrée nomme la scène, le cadrage et ce qu'elle est censée montrer.
 * L'ordre est celui de la présentation, pas celui de la cuisson.
 */
interface Planche {
  /** `especes` = planche d'essences plutôt qu'une scène */
  especes?: readonly string[];
  hauteurM?: number;
  scene: string;
  titre: string;
  facteur?: number;
  centre?: { x: number; y: number };
  orientation?: number;
  options?: Options;
}

/**
 * Les arbres de futaie et les fruitiers, dans l'ordre des familles de port.
 *
 * Douze sujets à seize mètres : c'est la hauteur à laquelle ces essences-là se
 * comparent. Les arbustes de haie ont leur propre planche, plus bas — les
 * mettre ici les réduirait à des points, puisque `heightM` est plafonné par la
 * hauteur maximale de l'espèce et qu'une aubépine n'en fait que huit.
 */
const FUTAIE = [
  "fagus_sylvatica",
  "quercus_pubescens",
  "castanea_sativa",
  "fraxinus_excelsior",
  "carpinus_betulus",
  "betula_pendula",
  "alnus_glutinosa",
  "salix_alba",
  "pinus_sylvestris",
  "quercus_suber",
  "malus_domestica",
  "prunus_armeniaca",
];

/**
 * Les arbustes de haie et de lisière, à six mètres.
 *
 * **C'est la planche la plus exigeante des deux**, et c'est pour ça qu'elle
 * existe séparément : douze arbres de futaie se distinguent déjà par leur
 * taille et leur port, alors que neuf arbustes de haie ont tous à peu près la
 * même stature et le même vert. S'ils se confondent, c'est le dessin de la
 * feuille qui n'a pas fait son travail — pas la silhouette, qui ne peut pas le
 * faire ici.
 */
const HAIE = [
  "corylus_avellana",
  "prunus_spinosa",
  "crataegus_monogyna",
  "sambucus_nigra",
  "cornus_mas",
  "euonymus_europaeus",
  "ligustrum_vulgare",
  "ilex_aquifolium",
  "arbutus_unedo",
];

/**
 * Les espèces dont le MOTEUR suit la fructification, dans l'ordre des tailles
 * de fruit.
 *
 * Dix, et la liste n'est pas un choix de dessin : c'est exactement l'ensemble
 * des espèces qui ont un bloc `fruits` dans `especes.ts`. L'aubépine, le houx
 * et le fusain en portent de bien visibles et n'y sont pas — le moteur ne suit
 * pas leur fructification, donc le rendu n'en dessine pas.
 */
const FRUITIERS = [
  "malus_domestica",
  "castanea_sativa",
  "prunus_armeniaca",
  "arbutus_unedo",
  "corylus_avellana",
  "cornus_mas",
  "prunus_spinosa",
  "ligustrum_vulgare",
  "sambucus_nigra",
  "rubus_fruticosus",
];

const PLANCHE: Planche[] = [
  { scene: "", especes: FUTAIE, hauteurM: 16, titre: "futaie et vergers · été" },
  {
    scene: "",
    especes: FUTAIE,
    hauteurM: 16,
    titre: "futaie et vergers · nus (la ramure d'hiver)",
    options: { nu: true },
  },
  {
    scene: "",
    especes: FUTAIE,
    hauteurM: 16,
    titre: "futaie et vergers · sénescence",
    options: { senescence: 1 },
  },
  {
    scene: "",
    especes: FRUITIERS,
    hauteurM: 7,
    titre: "les fruits · MÛRS (`fruitsKg > 0` : il y a quelque chose à récolter)",
    options: { fruitProgress: 1, fruitsKg: 12 },
  },
  {
    scene: "",
    especes: FRUITIERS,
    hauteurM: 7,
    titre: "les fruits · en croissance (`fruitProgress` à mi-course, verts)",
    options: { fruitProgress: 0.5 },
  },
  {
    scene: "",
    especes: ["fagus_sylvatica", "quercus_pubescens", "castanea_sativa", "pinus_sylvestris"],
    hauteurM: 18,
    titre: "le même arbre EN PRÉ (branchu jusqu'au sol) — baseHouppier 0",
    options: { baseHouppier: 0 },
  },
  {
    scene: "",
    especes: ["fagus_sylvatica", "quercus_pubescens", "castanea_sativa", "pinus_sylvestris"],
    hauteurM: 18,
    titre: "le même arbre EN FUTAIE (fût nu sur les deux tiers) — baseHouppier 0,65",
    options: { baseHouppier: 0.65 },
  },
  { scene: "", especes: HAIE, hauteurM: 6, titre: "la haie · été" },
  {
    scene: "",
    especes: HAIE,
    hauteurM: 6,
    titre: "la haie · nue (et ce qui reste : houx, arbousier, troène)",
    options: { nu: true },
  },
  {
    scene: "",
    especes: HAIE,
    hauteurM: 6,
    titre: "la haie · sénescence (le fusain doit sauter aux yeux)",
    options: { senescence: 1 },
  },
  {
    scene: "",
    especes: ["fagus_sylvatica", "betula_pendula", "pinus_sylvestris"],
    hauteurM: 16,
    titre: "trois sujets de près",
    options: { echelle: 1 },
  },
  // Le banc de la PELOUSE : le critère est celui du retour — « avec une densité
  // de 100 % on devrait voir une pelouse quand on zoome ». Trois scènes
  // synthétiques, couverture forcée à 1, sans arbres pour les deux premières :
  // on juge le tapis, pas ce qui pousse dessus.
  //
  // **La seconde moitié du critère — « là où elle sèche, une pelouse sèche » —
  // n'est PAS montrée ici, et c'est volontaire.** La grandeur qui le dirait
  // (`humiditeVecue`, l'humidité de surface lissée de `herbe.ts`) n'est pas
  // dans l'instantané, et le rendu n'a pas à la fabriquer. Ce banc montre donc
  // ce que le moteur donne : le FOIN sur pied, commandé par la biomasse. Un
  // banc qui afficherait une pelouse grillée par un seuil inventé ferait
  // croire le sujet réglé.
  {
    scene: "pelouse-s28",
    titre: "pelouse · couverture 100 % · ×8",
    facteur: 8,
    centre: { x: 50, y: 50 },
  },
  {
    scene: "pelouse-s28",
    titre: "pelouse · couverture 100 % · ×24",
    facteur: 24,
    centre: { x: 50, y: 50 },
  },
  {
    scene: "pelouse-seche-s28",
    titre: "pelouse · couverture 100 %, FOIN sur pied · ×24",
    facteur: 24,
    centre: { x: 50, y: 50 },
  },
  {
    scene: "pelouse-arbres-s28",
    titre: "pelouse + arbres · l'ombre portée doit tomber DESSUS · ×8",
    facteur: 8,
    centre: { x: 50, y: 50 },
  },
  { scene: "friche-s28", titre: "friche · parcelle entière · juillet" },
  { scene: "friche-s28", titre: "friche · sans les arbres", options: { arbres: false } },
  { scene: "friche-s28", titre: "friche · zoom ×6", facteur: 6, centre: { x: 50, y: 50 } },
  { scene: "friche-s28", titre: "friche · zoom ×16", facteur: 16, centre: { x: 50, y: 50 } },
  { scene: "friche-s28", titre: "friche · zoom ×30", facteur: 30, centre: { x: 50, y: 50 } },
  { scene: "friche-s4", titre: "saison · janvier" },
  { scene: "friche-s17", titre: "saison · avril" },
  { scene: "friche-s28", titre: "saison · juillet" },
  // Semaine 36 : la semaine de récolte du sureau et du noisetier (`recolteWeek`
  // dans `especes.ts`). C'est la seule façon de voir le fruit sur le chemin
  // RÉEL — sur la friche, 143 sureaux portent des kilos mûrs cette semaine-là,
  // et le troène en est à mi-croissance.
  { scene: "friche-s36", titre: "saison · septembre · la récolte du sureau" },
  {
    scene: "friche-s36",
    titre: "septembre · zoom ×10 : les corymbes du sureau",
    facteur: 10,
    centre: { x: 50, y: 50 },
  },
  { scene: "friche-s42", titre: "saison · octobre" },
  { scene: "mare-s28", titre: "mare · parcelle entière" },
  { scene: "mare-s28", titre: "mare · zoom ×8", facteur: 8, centre: { x: 60, y: 40 } },
  { scene: "versant-s28", titre: "versant 12 % · parcelle entière" },
  { scene: "versant-s28", titre: "versant 12 % · zoom ×6", facteur: 6, centre: { x: 50, y: 50 } },
  { scene: "friche-s28", titre: "rotation · nord", orientation: 0 },
  { scene: "friche-s28", titre: "rotation · est", orientation: 1 },
  { scene: "friche-s28", titre: "rotation · sud", orientation: 2 },
  { scene: "friche-s28", titre: "rotation · ouest", orientation: 3 },
];

async function main(): Promise<void> {
  const etat = document.getElementById("etat");
  const L = 900;
  const H = 620;
  const demandees = new URLSearchParams(location.search).get("scenes");
  const filtre = demandees ? new Set(demandees.split(",")) : undefined;
  const cache = new Map<string, Scene>();
  for (const entree of PLANCHE) {
    if (entree.especes) {
      // Les planches d'essences ne sont pas des scènes : le filtre `?scenes=`
      // les laisse passer quand il nomme « planches », et les saute sinon.
      if (filtre && !filtre.has("planches")) continue;
      if (etat) etat.textContent = `cuisson · ${entree.titre}…`;
      vignette(
        entree.titre,
        planche(entree.especes, entree.hauteurM ?? 16, 1100, 760, entree.options ?? {}),
      );
      await new Promise((r) => setTimeout(r, 0));
      continue;
    }
    if (filtre && !filtre.has(entree.scene)) continue;
    if (etat) etat.textContent = `cuisson · ${entree.titre}…`;
    let scene = cache.get(entree.scene);
    if (!scene) {
      scene = await charger(entree.scene);
      cache.set(entree.scene, scene);
    }
    const vue = cadrer(scene, L, H, entree.facteur ?? 1, entree.centre, entree.orientation ?? 0);
    vignette(entree.titre, composer(scene, vue, entree.options ?? {}));
    await new Promise((r) => setTimeout(r, 0));
  }
  if (etat) etat.textContent = "";
  document.title = "L1 aperçu prêt";
}

void main().catch((e) => {
  const etat = document.getElementById("etat");
  if (etat) etat.textContent = `erreur : ${(e as Error).message}`;
  console.error(e);
});
