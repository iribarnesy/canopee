/**
 * LOT L0 — prototype jetable : le banc de mesure.
 *
 * Il répond à trois questions, et une seule fois pour de bon :
 *
 *  1. **Pixi ou Canvas 2D ?** (D1, Q1) — mesuré sur le PIRE CAS RÉEL, pas sur
 *     une scène inventée : une friche en succession à l'an 50, sortie du
 *     moteur, soit 5 017 arbres dont 1 059 chandelles sur un hectare, plus
 *     10 000 tuiles de sol.
 *  2. **Le squelette généré tient-il la promesse de D4 ?** — trois essences
 *     dessinées par branchement, et le temps de cuisson d'une silhouette.
 *  3. **Quel style ?** (Q6) — trois variantes de traitement, pour trancher sur
 *     des captures et non sur des adjectifs.
 *
 * Le prototype est jetable : il vivra le temps du lot. Ce qui reste, c'est
 * `src/render/projection.ts` et la décision écrite.
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
  return out;
}

export interface Mesure {
  nom: string;
  images: number;
  medianeMs: number;
  p95Ms: number;
  pireMs: number;
  arbresDessines: number;
}

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
): Promise<{
  mesure: Mesure;
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

  const arbres = preparerArbres(scene, cam, atlas, 1, 0);
  const temps: number[] = [];
  for (let i = 0; i < images; i++) {
    const t0 = performance.now();
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
    temps.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return {
    mesure: stats("Canvas 2D", temps, arbres.length),
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
): Promise<{
  mesure: Mesure;
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
  const arbres = preparerArbres(scene, cam, atlas, 1, 0);
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
  for (let i = 0; i < images; i++) {
    const t0 = performance.now();
    app.renderer.render(app.stage);
    temps.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  const canvas = app.canvas as HTMLCanvasElement;
  return {
    mesure: stats("PixiJS v8 (WebGL)", temps, arbres.length),
    atlasMs: Math.round(atlas.msTotal * 100) / 100,
    atlasCuissons: atlas.cuissons,
    terrainMs: Math.round(terrainMs * 100) / 100,
    canvas,
  };
}

export type { ArbreScene, Scene };
