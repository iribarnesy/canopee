/**
 * **Les habitants dessinés** : mésanges, pic, chevêche, buse, écureuil, geai, et
 * les oiseaux de passage — grive, merle, rouge-gorge, fauvette (#129).
 *
 * La règle des arbres et du chevreuil (§5.11) : rien ne se dessine à la pose.
 * Chaque silhouette est cuite une fois par figure — perché, deux images de
 * vol, grimpant, planant, deux foulées de course — et par palier de taille ;
 * un battement d'ailes est l'alternance de deux vignettes, un demi-tour un
 * sprite retourné.
 *
 * ── **ce que la silhouette doit dire** ──────────────────────────────────────
 *
 * À six pixels, une mésange n'a pas de plumes : elle a une **couleur**. Le bleu
 * et le jaune de la bleue, la tête noire de la charbonnière, le noir et blanc
 * du pic avec sa tache rouge, le brun rond de la chevêche, les grandes ailes de
 * la buse, le roux et le panache de l'écureuil. Ce sont les traits qu'un
 * promeneur reconnaît d'un coup d'œil, et c'est tout ce qu'on dessine.
 *
 * Les dimensions sont celles des bêtes (`FICHES_DE_RENDU`), posées à la même
 * échelle que les arbres : une mésange est minuscule à côté d'un chêne, et elle
 * doit l'être.
 */

import type { Dessin } from "../faune/residents";
import { poserLeLisere } from "./faune";

/** La figure cuite. */
export type FigureDHabitant =
  | "perche"
  | "vol0"
  | "vol1"
  | "grimpe"
  | "plane"
  | "course0"
  | "course1"
  | "picore";

/** Longueur du corps à la cuisson, pixels, par palier. */
export const PALIERS_CORPS_PX = [4, 8, 16, 32, 64] as const;

/** En deçà, pas de liseré : il mangerait la bête entière. */
const CORPS_MIN_LISERE_PX = 12;

/** L'emprise de la vignette, en longueurs de corps. */
const LARGEUR_U = 2.6;
const HAUTEUR_U = 1.5;
/** Le point posé (les pattes, ou le centre du corps en vol), dans la vignette. */
const PIED_X_U = LARGEUR_U / 2;
const PIED_Y_U = 0.25;

export interface ClasseDHabitant {
  dessin: Dessin;
  figure: FigureDHabitant;
  palier: number;
}

export interface VignetteDHabitant {
  image: HTMLCanvasElement;
  piedX: number;
  piedY: number;
  /** pixels par longueur de corps */
  pxParCorps: number;
}

export function cleDHabitant(c: ClasseDHabitant): string {
  return `${c.dessin}:${c.figure}:${c.palier}`;
}

/** Le palier qui couvre une longueur de corps à l'écran, sans l'agrandir. */
export function palierDuCorps(corpsPx: number): number {
  for (let i = 0; i < PALIERS_CORPS_PX.length; i++) {
    if ((PALIERS_CORPS_PX[i] ?? 0) >= corpsPx) return i;
  }
  return PALIERS_CORPS_PX.length - 1;
}

/** Les couleurs de chaque bête — celles du guide de terrain. */
interface Robe {
  dos: string;
  ventre: string;
  aile: string;
  tete: string;
  joue?: string;
  accent?: string;
  /** la queue, quand elle n'est pas de la couleur de l'aile */
  queue?: string;
  /** le miroir de l'aile : le bleu du geai */
  miroir?: string;
  /** le bec, quand il se voit : l'orange du merle */
  bec?: string;
}

const ROBES: Record<Dessin, Robe> = {
  mesange_bleue: {
    dos: "#8aa36a",
    ventre: "#e9d44c",
    aile: "#4c78c4",
    tete: "#3d6fcc",
    joue: "#f6f5ef",
    accent: "#1c2636",
  },
  mesange_charbonniere: {
    dos: "#76914c",
    ventre: "#e2cd38",
    aile: "#5a6878",
    tete: "#161616",
    joue: "#f6f5ef",
  },
  pic: {
    dos: "#1b1b1b",
    ventre: "#ebe5da",
    aile: "#1b1b1b",
    tete: "#1b1b1b",
    joue: "#f2f2ee",
    accent: "#cc2a2c",
  },
  cheveche: {
    dos: "#8a7157",
    ventre: "#d9ccb4",
    aile: "#7a634b",
    tete: "#8a7157",
    accent: "#f0c93a",
  },
  buse: { dos: "#6d4c33", ventre: "#dcc9aa", aile: "#5d3f2a", tete: "#6d4c33", accent: "#2b1e15" },
  ecureuil: { dos: "#b4542a", ventre: "#f0e6d4", aile: "#a14a24", tete: "#b4542a" },
  // Le geai : brun rosé, queue noire, et le miroir bleu barré de noir sur
  // l'aile — la plume qu'on ramasse en forêt.
  geai: {
    dos: "#c4a08a",
    ventre: "#d9bfae",
    aile: "#b89480",
    tete: "#cbb09e",
    accent: "#1c1c1c",
    queue: "#1c1c1c",
    miroir: "#3a6fcf",
  },
  // **Les oiseaux de passage** (#296). La grive litorne : tête et croupion gris,
  // dos châtain, poitrine crème tachetée — de loin, un oiseau bicolore.
  grive: {
    dos: "#8a5a3a",
    ventre: "#e3cfa2",
    aile: "#7a5034",
    tete: "#8d939a",
    queue: "#3a3430",
    accent: "#5a4636",
  },
  // Le merle : tout noir, et le bec orange qu'on voit d'abord.
  merle: { dos: "#1e1c1a", ventre: "#26231f", aile: "#1a1816", tete: "#1e1c1a", bec: "#e8a020" },
  // Le rouge-gorge : la face et la poitrine orangées sur un dos brun.
  rougegorge: {
    dos: "#7a6a4e",
    ventre: "#d8cdb6",
    aile: "#6e5f45",
    tete: "#7a6a4e",
    joue: "#e0743a",
  },
  // La fauvette à tête noire : gris-olive, la calotte noire du mâle.
  fauvette: { dos: "#8a8a74", ventre: "#c9c8bb", aile: "#7c7c68", tete: "#1e1e1e" },
};

type Ctx = CanvasRenderingContext2D;

function ovale(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** Un passereau, un pic ou une chevêche, perché : de profil, tourné à droite. */
function perche(ctx: Ctx, d: Dessin, r: Robe, picore = false): void {
  const rond = d === "cheveche";
  if (picore) {
    // Tête basse, bec au sol : on bascule tout l'oiseau vers l'avant autour
    // de ses pattes.
    ctx.save();
    ctx.rotate(-0.55);
  }
  // La queue d'abord, derrière le corps.
  if (!rond) {
    ctx.strokeStyle = r.queue ?? r.aile;
    ctx.lineWidth = 0.12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-0.22, 0.32);
    ctx.lineTo(-0.52, 0.12);
    ctx.stroke();
  }
  ctx.fillStyle = r.ventre;
  ovale(ctx, 0, 0.36, rond ? 0.3 : 0.28, rond ? 0.3 : 0.2, rond ? 0 : -0.35);
  ctx.fillStyle = r.aile;
  ovale(ctx, -0.05, 0.42, rond ? 0.24 : 0.22, rond ? 0.2 : 0.11, rond ? 0 : -0.35);
  if (r.miroir) {
    ctx.fillStyle = r.miroir;
    ovale(ctx, 0.04, 0.44, 0.07, 0.035, -0.35);
  }
  ctx.fillStyle = r.tete;
  ovale(ctx, rond ? 0.08 : 0.24, rond ? 0.72 : 0.58, rond ? 0.21 : 0.14, rond ? 0.17 : 0.13);
  if (r.joue) {
    ctx.fillStyle = r.joue;
    ovale(ctx, 0.27, 0.54, 0.07, 0.05);
  }
  if (d === "mesange_bleue" && r.accent) {
    // Le trait sombre de l'œil, qui fait le masque de la bleue.
    ctx.fillStyle = r.accent;
    ovale(ctx, 0.3, 0.6, 0.06, 0.018);
  }
  if (d === "pic" && r.accent) {
    ctx.fillStyle = r.accent;
    ovale(ctx, -0.14, 0.2, 0.07, 0.05);
  }
  if (rond && r.accent) {
    // Les yeux jaunes de la chevêche : de près, c'est tout ce qu'on voit.
    ctx.fillStyle = r.accent;
    ovale(ctx, 0.16, 0.74, 0.045, 0.045);
    ovale(ctx, 0.02, 0.74, 0.045, 0.045);
    ctx.fillStyle = "#f2ead8";
    for (const [x, y] of [
      [-0.1, 0.46],
      [0.02, 0.36],
      [-0.16, 0.3],
      [0.06, 0.5],
    ] as const) {
      ovale(ctx, x, y, 0.03, 0.025);
    }
  }
  if (d === "grive" && r.accent) {
    // Les taches de la poitrine : trois points sombres suffisent à la dire.
    ctx.fillStyle = r.accent;
    for (const [x, y] of [
      [0.12, 0.4],
      [0.2, 0.34],
      [0.06, 0.3],
    ] as const) {
      ovale(ctx, x, y, 0.03, 0.025);
    }
  }
  if (d === "rougegorge" && r.joue) {
    // La gorge orange descend sur la poitrine : c'est tout l'oiseau.
    ctx.fillStyle = r.joue;
    ovale(ctx, 0.2, 0.44, 0.13, 0.13);
  }
  // Le bec.
  ctx.fillStyle = r.bec ?? (d === "pic" ? "#2a2a2a" : "#3a3228");
  ctx.beginPath();
  if (rond) {
    ctx.moveTo(0.24, 0.66);
    ctx.lineTo(0.3, 0.62);
    ctx.lineTo(0.24, 0.6);
  } else {
    ctx.moveTo(0.36, 0.6);
    ctx.lineTo(d === "pic" ? 0.56 : 0.46, 0.57);
    ctx.lineTo(0.36, 0.54);
  }
  ctx.fill();
  // Les pattes.
  ctx.strokeStyle = "#4a3e32";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(0.02, 0.18);
  ctx.lineTo(0.04, 0);
  ctx.moveTo(-0.06, 0.18);
  ctx.lineTo(-0.04, 0);
  ctx.stroke();
  if (picore) ctx.restore();
}

/** En vol, ailes hautes ou ailes basses. */
function vol(ctx: Ctx, d: Dessin, r: Robe, haut: boolean): void {
  const envergure = d === "buse" ? 1.15 : 0.7;
  ctx.fillStyle = r.aile;
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.3);
  ctx.lineTo(-0.2 + (haut ? 0.05 : 0), 0.3 + (haut ? envergure * 0.8 : -envergure * 0.55));
  ctx.lineTo(0.14, 0.3);
  ctx.fill();
  ctx.fillStyle = r.ventre;
  ovale(ctx, 0, 0.26, 0.32, 0.12);
  ctx.fillStyle = r.dos;
  ovale(ctx, -0.02, 0.3, 0.26, 0.07);
  ctx.fillStyle = r.tete;
  ovale(ctx, 0.32, 0.3, 0.12, 0.1);
  ctx.fillStyle = r.queue ?? r.aile;
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.28);
  ctx.lineTo(-0.56, 0.36);
  ctx.lineTo(-0.56, 0.2);
  ctx.fill();
  if (r.miroir) {
    ctx.fillStyle = r.miroir;
    ovale(ctx, 0, 0.32, 0.06, 0.03);
  }
  if (d === "pic" && r.accent) {
    ctx.fillStyle = r.accent;
    ovale(ctx, -0.22, 0.2, 0.06, 0.04);
  }
}

/** La buse qui plane : les ailes grandes ouvertes, doigts écartés, queue en éventail. */
function plane(ctx: Ctx, r: Robe): void {
  ctx.fillStyle = r.aile;
  ctx.beginPath();
  ctx.moveTo(-0.05, 0.36);
  ctx.quadraticCurveTo(-0.6, 0.6, -1.2, 0.5);
  ctx.lineTo(-1.1, 0.36);
  ctx.quadraticCurveTo(-0.5, 0.26, -0.05, 0.24);
  ctx.moveTo(0.05, 0.36);
  ctx.quadraticCurveTo(0.6, 0.6, 1.2, 0.5);
  ctx.lineTo(1.1, 0.36);
  ctx.quadraticCurveTo(0.5, 0.26, 0.05, 0.24);
  ctx.fill();
  // La bande claire sous l'aile : ce qui fait lire une buse d'en bas.
  ctx.fillStyle = r.ventre;
  ovale(ctx, -0.55, 0.38, 0.3, 0.035, -0.1);
  ovale(ctx, 0.55, 0.38, 0.3, 0.035, 0.1);
  if (r.accent) {
    ctx.fillStyle = r.accent;
    ovale(ctx, -1.12, 0.44, 0.08, 0.05);
    ovale(ctx, 1.12, 0.44, 0.08, 0.05);
  }
  ctx.fillStyle = r.ventre;
  ovale(ctx, 0, 0.3, 0.13, 0.28, Math.PI / 2);
  ctx.fillStyle = r.dos;
  ovale(ctx, 0.3, 0.32, 0.1, 0.08);
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.3);
  ctx.lineTo(-0.5, 0.42);
  ctx.lineTo(-0.5, 0.18);
  ctx.fill();
}

/** Le pic sur son tronc : vertical, appuyé sur la queue, tête en haut. */
function grimpePic(ctx: Ctx, r: Robe): void {
  ctx.strokeStyle = r.aile;
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(-0.04, 0.2);
  ctx.lineTo(-0.1, -0.1);
  ctx.stroke();
  ctx.fillStyle = r.ventre;
  ovale(ctx, 0.02, 0.45, 0.13, 0.3);
  ctx.fillStyle = r.dos;
  ovale(ctx, -0.04, 0.46, 0.1, 0.28);
  ctx.fillStyle = r.joue ?? "#fff";
  ovale(ctx, -0.04, 0.55, 0.05, 0.1);
  ctx.fillStyle = r.tete;
  ovale(ctx, 0.05, 0.82, 0.11, 0.1);
  ctx.fillStyle = r.accent ?? "#c00";
  ovale(ctx, 0.04, 0.2, 0.06, 0.06);
  ovale(ctx, -0.02, 0.88, 0.04, 0.03);
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.moveTo(0.14, 0.84);
  ctx.lineTo(0.32, 0.86);
  ctx.lineTo(0.14, 0.78);
  ctx.fill();
}

/** L'écureuil : assis panache levé, en course, ou grimpant à un fût. */
function ecureuil(ctx: Ctx, r: Robe, figure: FigureDHabitant): void {
  if (figure === "grimpe") {
    ctx.save();
    ctx.translate(0, 0.45);
    ctx.rotate(Math.PI / 2);
    ctx.translate(0, -0.3);
  }
  const allonge = figure === "course0" ? 1.15 : figure === "course1" ? 0.9 : 1;
  // Le panache, grand et relevé : c'est lui qu'on voit.
  ctx.strokeStyle = r.aile;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(-0.18 * allonge, 0.28);
  if (figure === "perche") ctx.quadraticCurveTo(-0.45, 0.4, -0.3, 0.8);
  else ctx.quadraticCurveTo(-0.45, 0.5, -0.6, 0.45);
  ctx.stroke();
  ctx.fillStyle = r.dos;
  if (figure === "perche") ovale(ctx, 0, 0.3, 0.14, 0.2, -0.3);
  else ovale(ctx, 0, 0.22, 0.24 * allonge, 0.1);
  ctx.fillStyle = r.ventre;
  if (figure === "perche") ovale(ctx, 0.07, 0.28, 0.06, 0.14, -0.3);
  ctx.fillStyle = r.tete;
  const tx = figure === "perche" ? 0.12 : 0.26 * allonge;
  const ty = figure === "perche" ? 0.54 : 0.28;
  ovale(ctx, tx, ty, 0.09, 0.075);
  ovale(ctx, tx - 0.03, ty + 0.09, 0.025, 0.05);
  ctx.strokeStyle = r.dos;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  if (figure === "perche") {
    ctx.moveTo(0.04, 0.12);
    ctx.lineTo(0.06, 0);
  } else {
    const ecart = figure === "course0" ? 0.12 : 0.04;
    ctx.moveTo(0.14, 0.16);
    ctx.lineTo(0.14 + ecart, 0);
    ctx.moveTo(-0.12, 0.16);
    ctx.lineTo(-0.12 - ecart, 0);
  }
  ctx.stroke();
  if (figure === "grimpe") ctx.restore();
}

function dessiner(ctx: Ctx, c: ClasseDHabitant): void {
  const r = ROBES[c.dessin];
  if (c.dessin === "ecureuil") {
    ecureuil(ctx, r, c.figure);
    return;
  }
  switch (c.figure) {
    case "vol0":
    case "vol1":
      vol(ctx, c.dessin, r, c.figure === "vol0");
      return;
    case "plane":
      if (c.dessin === "buse") plane(ctx, r);
      else vol(ctx, c.dessin, r, true);
      return;
    case "grimpe":
      if (c.dessin === "pic") grimpePic(ctx, r);
      else perche(ctx, c.dessin, r);
      return;
    case "picore":
      perche(ctx, c.dessin, r, true);
      return;
    default:
      perche(ctx, c.dessin, r);
  }
}

/** Cuit une vignette. Le liseré ne vient qu'aux tailles où il se lit. */
export function cuireHabitant(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  c: ClasseDHabitant,
): VignetteDHabitant {
  const px = PALIERS_CORPS_PX[c.palier] ?? PALIERS_CORPS_PX[0];
  const largeur = Math.ceil(LARGEUR_U * px) + 2;
  const hauteur = Math.ceil(HAUTEUR_U * px) + 2;
  const piedX = PIED_X_U * px + 1;
  const piedY = hauteur - PIED_Y_U * px - 1;
  const bete = fabriquer(largeur, hauteur);
  const b = bete.getContext("2d");
  const image = fabriquer(largeur, hauteur);
  const ctx = image.getContext("2d");
  if (!b || !ctx) return { image, piedX, piedY, pxParCorps: px };
  b.save();
  b.translate(piedX, piedY);
  b.scale(px, -px);
  dessiner(b, c);
  b.restore();
  if (px >= CORPS_MIN_LISERE_PX) poserLeLisere(fabriquer, ctx, bete, "rgba(24, 20, 14, 0.5)");
  ctx.drawImage(bete, 0, 0);
  return { image, piedX, piedY, pxParCorps: px };
}

/** L'atlas des habitants : chaque vignette cuite une fois, à la demande. */
export class AtlasHabitants {
  private readonly vignettes = new Map<string, VignetteDHabitant>();

  constructor(private readonly fabriquer: (l: number, h: number) => HTMLCanvasElement) {}

  vignette(c: ClasseDHabitant): VignetteDHabitant {
    const cle = cleDHabitant(c);
    let v = this.vignettes.get(cle);
    if (!v) {
      v = cuireHabitant(this.fabriquer, c);
      this.vignettes.set(cle, v);
    }
    return v;
  }
}
