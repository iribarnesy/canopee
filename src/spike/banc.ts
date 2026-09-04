/**
 * LOT L0 — prototype jetable : le banc de mesure.
 *
 * Il répond à trois questions, et une seule fois pour de bon :
 *
 *  1. **Pixi ou Canvas 2D ?** (D1, Q1) — mesuré sur le PIRE CAS RÉEL, pas sur
 *     une scène inventée : une friche en succession à son pic de charge
 *     (l'an 30), sortie du moteur, soit 5 436 arbres dont 2 004 chandelles sur
 *     un hectare, plus 10 000 tuiles de sol. Le pic est à l'an 30 et non à
 *     l'an 50 : la friche s'auto-éclaircit de moitié ensuite.
 *  2. **Le squelette généré tient-il la promesse de D4 ?** — trois essences
 *     dessinées par branchement, et le temps de cuisson d'une silhouette.
 *  3. **Quel style ?** (Q6) — trois variantes de traitement, pour trancher sur
 *     des captures et non sur des adjectifs.
 *
 * Le prototype est jetable : il vivra le temps du lot. Ce qui reste, c'est
 * `src/render/projection.ts`, `scripts/l0-scene.ts` et la décision écrite.
 *
 * **Ce que le rejeu sur GPU a appris sur la mesure elle-même**, et qui vaut
 * pour tout banc de rendu : chronométrer l'appel de dessin ne mesure rien.
 * `render()` et `drawImage()` empilent des commandes et rendent la main. Il
 * faut une barrière, et se méfier de celles qui ne barrent pas — `gl.finish()`
 * n'est pas fiable selon le pilote. Le juge de paix est la CADENCE réelle
 * entre deux rAF, et, quand elle plafonne au vsync, la CAPACITÉ.
 */

import { Application, Container, Sprite, Texture } from "pixi.js";
import {
  type Camera,
  empriseEcran,
  profondeur,
  TUILE_HAUTEUR_PX,
  TUILE_LARGEUR_PX,
  versEcran,
} from "../render/projection";
import { cuireSilhouette, FICHES } from "./silhouettes";

interface ArbreScene {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  chandelle: boolean;
  hauteurElagueeM: number;
}
interface Scene {
  coteM: number;
  week: number;
  trees: ArbreScene[];
}

/** Style à l'essai (Q6). */
export type Style = "aplat" | "liseré" | "ombre-longue";

const CHUNK_M = 16;

/** Un versant doux et une butte : de quoi éprouver le relief à l'échelle vraie. */
function altitudeDe(coteM: number) {
  return (x: number, y: number) => {
    const versant = (y / coteM) * 4;
    const d = Math.hypot(x - coteM * 0.35, y - coteM * 0.6);
    return versant + Math.max(0, 6 - d * 0.35);
  };
}

/** Teinte du sol : humidité quantifiée sur 8 niveaux (§3, cache des morceaux). */
function tonSol(niveau: number): string {
  const l = 74 - niveau * 4;
  return `hsl(38 22% ${l}%)`;
}

/**
 * Cuit le terrain en morceaux de 16 × 16 m. Un morceau n'est reconstruit que
 * si une de ses cellules change de TRANCHE de valeur — sinon chaque semaine
 * invaliderait les 49 morceaux et le cache ne servirait à rien (§10, risque 3).
 */
function cuireTerrain(
  scene: Scene,
  cam: Camera,
  style: Style,
): {
  morceaux: { bitmap: HTMLCanvasElement; sx: number; sy: number; profondeur: number }[];
  ms: number;
} {
  const t0 = performance.now();
  const alt = altitudeDe(scene.coteM);
  const morceaux: { bitmap: HTMLCanvasElement; sx: number; sy: number; profondeur: number }[] = [];
  const n = Math.ceil(scene.coteM / CHUNK_M);
  for (let cj = 0; cj < n; cj++) {
    for (let ci = 0; ci < n; ci++) {
      const cellules: { x: number; y: number }[] = [];
      for (let y = cj * CHUNK_M; y < Math.min(scene.coteM, (cj + 1) * CHUNK_M); y++) {
        for (let x = ci * CHUNK_M; x < Math.min(scene.coteM, (ci + 1) * CHUNK_M); x++) {
          cellules.push({ x, y });
        }
      }
      if (cellules.length === 0) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of cellules) {
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const e = versEcran({ x: c.x + dx, y: c.y + dy, z: alt(c.x, c.y) }, cam);
          minX = Math.min(minX, e.sx);
          maxX = Math.max(maxX, e.sx);
          minY = Math.min(minY, e.sy);
          maxY = Math.max(maxY, e.sy);
        }
      }
      // Marge pour les flancs verticaux (le relief à l'échelle vraie).
      maxY += 8 * TUILE_HAUTEUR_PX;
      const bitmap = document.createElement("canvas");
      bitmap.width = Math.ceil(maxX - minX) + 2;
      bitmap.height = Math.ceil(maxY - minY) + 2;
      const ctx = bitmap.getContext("2d");
      if (!ctx) throw new Error("2d");
      ctx.translate(-minX + 1, -minY + 1);
      // Du fond vers l'avant DANS le morceau : les flancs se recouvrent.
      cellules.sort((a, b) => profondeur(a.x, a.y, cam) - profondeur(b.x, b.y, cam));
      for (const c of cellules) {
        const z = alt(c.x, c.y);
        const p = [
          versEcran({ x: c.x, y: c.y, z }, cam),
          versEcran({ x: c.x + 1, y: c.y, z }, cam),
          versEcran({ x: c.x + 1, y: c.y + 1, z }, cam),
          versEcran({ x: c.x, y: c.y + 1, z }, cam),
        ];
        // Le FLANC : ce qui fait exister le relief. Hauteur = écart d'altitude
        // avec la voisine d'aval.
        const zAval = alt(Math.min(scene.coteM - 1, c.x + 1), Math.min(scene.coteM - 1, c.y + 1));
        const chute = Math.max(0, z - zAval);
        if (chute > 0.02) {
          const bas = versEcran({ x: c.x + 1, y: c.y + 1, z: zAval }, cam);
          ctx.fillStyle = "hsl(34 20% 42%)";
          ctx.beginPath();
          ctx.moveTo(p[1]?.sx ?? 0, p[1]?.sy ?? 0);
          ctx.lineTo(p[2]?.sx ?? 0, p[2]?.sy ?? 0);
          ctx.lineTo(p[3]?.sx ?? 0, p[3]?.sy ?? 0);
          ctx.lineTo(p[3]?.sx ?? 0, (p[3]?.sy ?? 0) + (bas.sy - (p[2]?.sy ?? 0)));
          ctx.lineTo(p[1]?.sx ?? 0, (p[1]?.sy ?? 0) + (bas.sy - (p[2]?.sy ?? 0)));
          ctx.closePath();
          ctx.fill();
        }
        // Ombrage de pente : l'adret et l'ubac, visibles pour trois lignes.
        const pente = z - alt(Math.min(scene.coteM - 1, c.x + 1), c.y);
        const niveau = Math.max(0, Math.min(7, Math.round(3.5 - pente * 2)));
        ctx.fillStyle = tonSol(niveau);
        ctx.beginPath();
        ctx.moveTo(p[0]?.sx ?? 0, p[0]?.sy ?? 0);
        ctx.lineTo(p[1]?.sx ?? 0, p[1]?.sy ?? 0);
        ctx.lineTo(p[2]?.sx ?? 0, p[2]?.sy ?? 0);
        ctx.lineTo(p[3]?.sx ?? 0, p[3]?.sy ?? 0);
        ctx.closePath();
        ctx.fill();
        if (style === "liseré") {
          ctx.strokeStyle = "hsl(38 22% 46%)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      morceaux.push({
        bitmap,
        sx: minX - 1,
        sy: minY - 1,
        profondeur: ci + cj,
      });
    }
  }
  return { morceaux, ms: performance.now() - t0 };
}

/**
 * L'atlas à la demande : une texture par (essence, tranche de hauteur, état
 * foliaire). On ne cuit que ce que la parcelle porte réellement — c'est le
 * point que le lot doit valider, parce qu'un atlas cuit d'avance pour 25
 * essences × 5 stades × 4 saisons serait démesuré.
 */
class Atlas {
  private cache = new Map<string, HTMLCanvasElement>();
  msTotal = 0;
  cuissons = 0;

  /** Tranches de hauteur : 12 paliers suffisent, l'échelle absorbe le reste. */
  private static palier(hPx: number): number {
    return Math.max(1, Math.round(Math.log2(Math.max(2, hPx)) * 2));
  }

  obtenir(
    especeId: string,
    hauteurPx: number,
    feuillaison: number,
    senescence: number,
    chandelle: boolean,
    graine: number,
  ): HTMLCanvasElement {
    const fiche = FICHES[especeId] ?? FICHES.betula_pendula;
    if (!fiche) throw new Error("fiche manquante");
    const palier = Atlas.palier(hauteurPx);
    // La variation individuelle est repliée sur 4 formes : au-delà, l'atlas
    // explose sans qu'on voie la différence à cette échelle.
    const forme = graine % 4;
    const cle = `${especeId}|${palier}|${Math.round(feuillaison * 3)}|${Math.round(senescence * 2)}|${chandelle}|${forme}`;
    const dejaLa = this.cache.get(cle);
    if (dejaLa) return dejaLa;
    const hPx = 2 ** (palier / 2);
    const { bitmap, msCuisson } = cuireSilhouette(fiche, {
      hauteurPx: hPx,
      graine: forme + 1,
      feuillaison: chandelle ? 0 : feuillaison,
      senescence: chandelle ? 0 : senescence,
    });
    this.msTotal += msCuisson;
    this.cuissons++;
    this.cache.set(cle, bitmap);
    return bitmap;
  }
}

interface ArbreEcran {
  bitmap: HTMLCanvasElement;
  sx: number;
  sy: number;
  largeur: number;
  hauteur: number;
  profondeur: number;
}

function preparerArbres(
  scene: Scene,
  cam: Camera,
  atlas: Atlas,
  feuillaison: number,
  senescence: number,
  /**
   * Multiplicateur de charge : combien de fois la parcelle est redessinée
   * par-dessus elle-même. C'est ainsi qu'on cherche le point de rupture de
   * chaque bras — la seule façon de CHIFFRER l'écart entre Pixi et Canvas 2D
   * quand les deux restent collés au plafond du vsync (`capacite`).
   */
  charge = 1,
): ArbreEcran[] {
  const alt = altitudeDe(scene.coteM);
  const out: ArbreEcran[] = [];
  for (const t of scene.trees) {
    const hPx = t.heightM * TUILE_LARGEUR_PX * 0.5 * cam.zoom;
    if (hPx < 1.5) continue; // sous le pixel : le LOD le remplace par un point
    const bitmap = atlas.obtenir(t.especeId, hPx, feuillaison, senescence, t.chandelle, t.id);
    const e = versEcran({ x: t.x, y: t.y, z: alt(Math.floor(t.x), Math.floor(t.y)) }, cam);
    const echelle = hPx / bitmap.height;
    out.push({
      bitmap,
      sx: e.sx - (bitmap.width * echelle) / 2,
      sy: e.sy - bitmap.height * echelle,
      largeur: bitmap.width * echelle,
      hauteur: bitmap.height * echelle,
      profondeur: profondeur(t.x, t.y, cam),
    });
  }
  out.sort((a, b) => a.profondeur - b.profondeur);
  if (charge <= 1) return out;
  const empile: ArbreEcran[] = [];
  for (let i = 0; i < charge; i++) empile.push(...out);
  return empile;
}

export interface Mesure {
  nom: string;
  images: number;
  medianeMs: number;
  p95Ms: number;
  pireMs: number;
  arbresDessines: number;
}

/**
 * La CADENCE réellement obtenue : l'écart entre deux `requestAnimationFrame`
 * consécutifs. C'est la seule mesure qui répond littéralement à la question de
 * D1 — « tient-on 60 images par seconde ? » — parce qu'elle inclut tout ce que
 * le navigateur fait en plus du dessin, et qu'elle plafonne à 16,7 ms quand le
 * rendu suit. Un chiffre au-dessus, c'est un budget dépassé.
 */
export interface Cadence {
  medianeMs: number;
  p95Ms: number;
  imagesParSeconde: number;
}

/**
 * **Ce qu'on a essayé et jeté, pour que personne ne le refasse.** Enchaîner K
 * images sans rendre la main, puis attendre une fois, devait donner le coût
 * d'une image hors vsync. Ça mesure faux : chaque image commence par un
 * `fillRect` qui couvre tout le canvas, donc le navigateur a le droit de
 * jeter les images intermédiaires — et il le fait. Le « débit » ainsi obtenu
 * tombait à 8 ms/image au zoom 4 là où l'image terminée en coûte 31,6. La
 * capacité (ci-dessous) répond à la même question sans ce piège.
 */

function cadenceDe(instants: number[]): Cadence {
  const ecarts: number[] = [];
  for (let i = 1; i < instants.length; i++) {
    ecarts.push((instants[i] ?? 0) - (instants[i - 1] ?? 0));
  }
  const t = ecarts.sort((a, b) => a - b);
  const q = (p: number) => t[Math.min(t.length - 1, Math.floor(t.length * p))] ?? 0;
  const med = q(0.5);
  return {
    medianeMs: Math.round(med * 100) / 100,
    p95Ms: Math.round(q(0.95) * 100) / 100,
    imagesParSeconde: med > 0 ? Math.round(1000 / med) : 0,
  };
}

/**
 * **Le piège de la mesure, et il fausserait D1 à lui seul.** `render()` et
 * `drawImage()` ne dessinent pas : ils EMPILENT des commandes. Chronométrer
 * l'appel seul mesure le temps de soumission côté processeur, pas l'image —
 * sur GPU, Pixi rend ainsi 5 000 sprites en « 0,2 ms », ce qui ne veut rien
 * dire. Il faut attendre que l'image soit vraiment finie : `gl.finish()` pour
 * WebGL, une relecture d'un pixel pour Canvas 2D. Le banc relève donc DEUX
 * temps par image, la soumission et l'image finie, et c'est la seconde qui
 * répond à la question des 16,7 ms.
 */
function stats(nom: string, temps: number[], arbres: number): Mesure {
  const t = [...temps].sort((a, b) => a - b);
  const q = (p: number) => t[Math.min(t.length - 1, Math.floor(t.length * p))] ?? 0;
  return {
    nom,
    images: t.length,
    medianeMs: Math.round(q(0.5) * 100) / 100,
    p95Ms: Math.round(q(0.95) * 100) / 100,
    pireMs: Math.round((t[t.length - 1] ?? 0) * 100) / 100,
    arbresDessines: arbres,
  };
}

/** Le bras Canvas 2D : terrain cuit + blit des silhouettes. */
export async function mesurerCanvas2D(
  scene: Scene,
  cam: Camera,
  style: Style,
  images: number,
  charge = 1,
): Promise<{
  mesure: Mesure;
  mesureSoumission: Mesure;
  cadence: Cadence;
  barriereMs: number;
  atlasMs: number;
  atlasCuissons: number;
  terrainMs: number;
  canvas: HTMLCanvasElement;
}> {
  const atlas = new Atlas();
  const { morceaux, ms: terrainMs } = cuireTerrain(scene, cam, style);
  const emprise = empriseEcran(cam, 12);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(emprise.largeur);
  canvas.height = Math.ceil(emprise.hauteur);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d");
  const decalage = { x: emprise.largeur / 2, y: 8 * TUILE_HAUTEUR_PX };

  const arbres = preparerArbres(scene, cam, atlas, 1, 0, charge);
  const dessinerUneImage = () => {
    ctx.fillStyle = "hsl(200 30% 88%)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(decalage.x, decalage.y);
    for (const m of morceaux) ctx.drawImage(m.bitmap, m.sx, m.sy);
    for (const a of arbres) {
      if (style === "ombre-longue") {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#2a2f22";
        ctx.beginPath();
        ctx.ellipse(
          a.sx + a.largeur / 2,
          a.sy + a.hauteur,
          a.largeur * 0.45,
          a.largeur * 0.16,
          0,
          0,
          6.284,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(a.bitmap, a.sx, a.sy, a.largeur, a.hauteur);
    }
    ctx.restore();
  };
  const temps: number[] = [];
  const tempsSoumission: number[] = [];
  const instants: number[] = [];
  // Ce que coûte la BARRIÈRE seule, sur un canvas qu'on ne touche pas : sans
  // ce témoin, on ne sait pas si les millisecondes mesurées sont du dessin ou
  // de la relecture.
  const t0Barriere = performance.now();
  for (let i = 0; i < 20; i++) ctx.getImageData(0, 0, 1, 1);
  const barriereMs = (performance.now() - t0Barriere) / 20;
  for (let i = 0; i < images; i++) {
    const t0 = performance.now();
    dessinerUneImage();
    tempsSoumission.push(performance.now() - t0);
    // La barrière : relire un pixel force le rendu à être terminé.
    ctx.getImageData(0, 0, 1, 1);
    temps.push(performance.now() - t0);
    await new Promise((r) =>
      requestAnimationFrame((ts) => {
        instants.push(ts);
        r(null);
      }),
    );
  }
  return {
    mesure: stats("Canvas 2D", temps, arbres.length),
    mesureSoumission: stats("Canvas 2D (soumission)", tempsSoumission, arbres.length),
    cadence: cadenceDe(instants),
    barriereMs: Math.round(barriereMs * 100) / 100,
    atlasMs: Math.round(atlas.msTotal * 100) / 100,
    atlasCuissons: atlas.cuissons,
    terrainMs: Math.round(terrainMs * 100) / 100,
    canvas,
  };
}

/** Le bras Pixi v8 : mêmes bitmaps, en sprites batchés. */
export async function mesurerPixi(
  scene: Scene,
  cam: Camera,
  style: Style,
  images: number,
  charge = 1,
  /**
   * Recopier le tampon de rendu dans un canvas 2D exportable. **Pourquoi ce
   * détour** : `toDataURL()` sur un canvas WebGL rend une image NOIRE, parce
   * que le pilote a le droit de jeter le tampon après composition
   * (`preserveDrawingBuffer` est faux, et le mettre à vrai coûterait une copie
   * par image, donc faussserait la mesure). On relit donc les pixels une fois,
   * après le chronomètre. Sans ça la vignette Pixi est noire et on croit à
   * tort que le bras ne dessine rien.
   */
  capturer = false,
): Promise<{
  mesure: Mesure;
  mesureSoumission: Mesure;
  cadence: Cadence;
  barriereMs: number;
  pixelsPeints: number;
  largeurLue: number;
  atlasMs: number;
  atlasCuissons: number;
  terrainMs: number;
  canvas: HTMLCanvasElement;
}> {
  const atlas = new Atlas();
  const { morceaux, ms: terrainMs } = cuireTerrain(scene, cam, style);
  const emprise = empriseEcran(cam, 12);
  const app = new Application();
  await app.init({
    width: Math.ceil(emprise.largeur),
    height: Math.ceil(emprise.hauteur),
    background: "#d5e6ef",
    antialias: false,
    preference: "webgl",
  });
  const monde = new Container();
  monde.x = emprise.largeur / 2;
  monde.y = 8 * TUILE_HAUTEUR_PX;
  app.stage.addChild(monde);

  for (const m of morceaux) {
    const s = new Sprite(Texture.from(m.bitmap));
    s.x = m.sx;
    s.y = m.sy;
    monde.addChild(s);
  }
  const arbres = preparerArbres(scene, cam, atlas, 1, 0, charge);
  for (const a of arbres) {
    if (style === "ombre-longue") {
      // L'ombre en sprite : Pixi n'a pas de primitive d'ellipse batchée, on la
      // paierait en Graphics — on la remplace par le même bitmap aplati.
      const o = new Sprite(Texture.from(a.bitmap));
      o.x = a.sx;
      o.y = a.sy + a.hauteur * 0.94;
      o.width = a.largeur;
      o.height = a.hauteur * 0.12;
      o.alpha = 0.16;
      o.tint = 0x2a2f22;
      monde.addChild(o);
    }
    const s = new Sprite(Texture.from(a.bitmap));
    s.x = a.sx;
    s.y = a.sy;
    s.width = a.largeur;
    s.height = a.hauteur;
    monde.addChild(s);
  }

  const temps: number[] = [];
  const tempsSoumission: number[] = [];
  const instants: number[] = [];
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  if (!gl) throw new Error("pas de contexte WebGL : la mesure Pixi serait creuse");
  // Le témoin de la barrière, comme pour Canvas 2D : un `finish()` sur un GPU
  // déjà au repos.
  const t0Barriere = performance.now();
  for (let i = 0; i < 20; i++) gl.finish();
  const barriereMs = (performance.now() - t0Barriere) / 20;
  for (let i = 0; i < images; i++) {
    const t0 = performance.now();
    app.renderer.render(app.stage);
    tempsSoumission.push(performance.now() - t0);
    // La barrière : `finish()` ne rend la main qu'une fois le GPU au repos.
    gl.finish();
    temps.push(performance.now() - t0);
    await new Promise((r) =>
      requestAnimationFrame((ts) => {
        instants.push(ts);
        r(null);
      }),
    );
  }
  const brut = app.canvas as HTMLCanvasElement;
  // **Preuve que le bras Pixi dessine vraiment.** Un contexte qui échoue à
  // téléverser ses textures rend une image vide, donc très vite : sans ce
  // contrôle, « Pixi gagne » et « Pixi ne fait rien » se ressemblent. On
  // compte les pixels non-fond d'une bande au milieu de l'image.
  let pixelsPeints = 0;
  const lu = new Uint8Array(brut.width * 4);
  gl.readPixels(0, Math.floor(brut.height / 2), brut.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, lu);
  for (let i = 0; i < brut.width; i++) {
    const r = lu[i * 4] ?? 0;
    const v = lu[i * 4 + 1] ?? 0;
    const b = lu[i * 4 + 2] ?? 0;
    // Le fond est le bleu clair #d5e6ef : tout ce qui s'en écarte est dessiné.
    if (Math.abs(r - 0xd5) + Math.abs(v - 0xe6) + Math.abs(b - 0xef) > 24) pixelsPeints++;
  }
  // La recopie exportable, hors chronomètre. WebGL a son origine en bas à
  // gauche : il faut retourner l'image ligne par ligne.
  let canvas = brut;
  if (capturer) {
    const tout = new Uint8Array(brut.width * brut.height * 4);
    gl.readPixels(0, 0, brut.width, brut.height, gl.RGBA, gl.UNSIGNED_BYTE, tout);
    const plat = document.createElement("canvas");
    plat.width = brut.width;
    plat.height = brut.height;
    const pctx = plat.getContext("2d");
    if (pctx) {
      const img = pctx.createImageData(brut.width, brut.height);
      const octetsParLigne = brut.width * 4;
      for (let y = 0; y < brut.height; y++) {
        const source = (brut.height - 1 - y) * octetsParLigne;
        img.data.set(tout.subarray(source, source + octetsParLigne), y * octetsParLigne);
      }
      pctx.putImageData(img, 0, 0);
      canvas = plat;
    }
  }
  return {
    mesure: stats("PixiJS v8 (WebGL)", temps, arbres.length),
    mesureSoumission: stats("PixiJS v8 (soumission)", tempsSoumission, arbres.length),
    cadence: cadenceDe(instants),
    barriereMs: Math.round(barriereMs * 100) / 100,
    pixelsPeints,
    largeurLue: brut.width,
    atlasMs: Math.round(atlas.msTotal * 100) / 100,
    atlasCuissons: atlas.cuissons,
    terrainMs: Math.round(terrainMs * 100) / 100,
    canvas,
  };
}

export type { ArbreScene, Scene };
