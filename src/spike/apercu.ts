/**
 * L'aperçu du lot L1 : une page qui compose la scène complète — décor, sol,
 * ombres — pour qu'on puisse la REGARDER.
 *
 * Ce n'est pas un banc de mesure (c'est `main.ts`), et ce n'est pas le jeu :
 * c'est l'endroit où l'assemblage des couches est écrit une seule fois, et
 * l'endroit d'où sortent les captures qu'on soumet. Il est versionné exprès —
 * la version précédente vivait dans un dossier temporaire et a disparu avec
 * lui, ce qui a coûté une reconstruction complète.
 */

import { getEspece } from "../engine/especes";
import { tournerVue, type Vue, vueInitiale, zoomMax } from "../render/camera";
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
    bordures?: DecorBordures;
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
    ...(scene.sol.enEau ? { enEau: scene.sol.enEau } : {}),
    ...(scene.sol.debordementMm
      ? { debordementMm: Float32Array.from(scene.sol.debordementMm) }
      : {}),
  };
}

/** Part du feuillage qui fait de l'ombre, à la semaine donnée. Approximation
 * de saison : un caduc est nu de la semaine 45 à la 14. */
function partOmbrageante(especeId: string, semaine: number): number {
  const espece = getEspece(especeId);
  if (!espece) return 1;
  if (!espece.lumiere.caduc) return 1;
  if (semaine >= 18 && semaine <= 40) return 1;
  if (semaine < 12 || semaine > 46) return 0.05;
  return 0.5;
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
}

function composer(scene: Scene, vue: Vue, options: Options = {}): HTMLCanvasElement {
  const { ombres = true, decor = true, ombresDebordantes = false } = options;
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

  const terrain = new Terrain(fabriquer, scene.coteM);
  terrain.rafraichir(donnees, semaine, vue);
  terrain.cuire(donnees, semaine, vue, 10000);
  for (const m of terrain.aPoser(vue)) {
    if (!m.image || !m.decalage) continue;
    cq.drawImage(m.image, m.decalage.dx, m.decalage.dy);
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
        partOmbrageante: partOmbrageante(t.especeId, semaine),
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
    // Découpe à la silhouette du sol, PUIS multiplication : voir `MODE_LIMITE`.
    mq.globalCompositeOperation = MODE_LIMITE;
    mq.drawImage(calque, 0, 0);
    cq.globalCompositeOperation = MODE_COMPOSITION;
    cq.drawImage(masque, 0, 0);
    cq.globalCompositeOperation = "source-over";
  }

  ctx.drawImage(calque, 0, 0);
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
  const reponse = await fetch(`/spike/apercu/${nom}.json`);
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
  scene: string;
  titre: string;
  facteur?: number;
  centre?: { x: number; y: number };
  orientation?: number;
  options?: Options;
}

const PLANCHE: Planche[] = [
  { scene: "friche-s28", titre: "friche · parcelle entière · juillet" },
  {
    scene: "friche-s28",
    titre: "sans hors-parcelle · ombres bornées au sol",
    options: { decor: false },
  },
  {
    scene: "friche-s28",
    titre: "sans hors-parcelle · ombres NON bornées (le défaut signalé)",
    options: { decor: false, ombresDebordantes: true },
  },
  { scene: "friche-s28", titre: "friche · zoom ×6", facteur: 6, centre: { x: 50, y: 50 } },
  { scene: "friche-s28", titre: "friche · zoom ×16", facteur: 16, centre: { x: 50, y: 50 } },
  { scene: "friche-s4", titre: "saison · janvier" },
  { scene: "friche-s17", titre: "saison · avril" },
  { scene: "friche-s28", titre: "saison · juillet" },
  { scene: "friche-s42", titre: "saison · octobre" },
  { scene: "mare-s28", titre: "mare · parcelle entière" },
  { scene: "mare-s28", titre: "mare · zoom ×8", facteur: 8, centre: { x: 60, y: 40 } },
  { scene: "ruisseau-s28", titre: "ruisseau · zoom ×6", facteur: 6, centre: { x: 50, y: 12 } },
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
