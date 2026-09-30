/**
 * **Le chevreuil dessiné** : une silhouette de profil, cuite une fois par
 * attitude, par pelage et par taille (#129).
 *
 * La même règle que les arbres (§5.11) : **rien ne se dessine à la pose**. Une
 * bête qui marche alterne deux images déjà cuites, une bête qui se tourne est
 * un sprite retourné. Il n'y a que cinq attitudes, deux pelages, avec ou sans
 * bois, et quelques paliers de taille : l'atlas entier tient en une centaine de
 * petites vignettes, et on n'en cuit que celles qu'on regarde.
 *
 * ── **ce que la silhouette doit dire** ──────────────────────────────────────
 *
 * Qu'on reconnaisse un chevreuil à six pixels de haut, et pas un chien ni un
 * mouton. Trois traits y suffisent, et ce sont ceux des guides de terrain : le
 * **miroir** blanc de la croupe, le cou long et la tête haute quand il guette,
 * les pattes fines. Le reste est de la finition pour le zoom rapproché.
 *
 * Les dimensions sont celles de l'animal : 0,75 m au garrot, 1,1 m de long.
 * Posé à la même échelle que les arbres, il se lit à côté d'eux comme il se lit
 * au bord d'un bois.
 *
 * Module sans Pixi : il dessine sur un canvas qu'on lui donne.
 */

import type { Attitude } from "../faune/chevreuils";

/** Pixels par mètre des paliers de cuisson. */
export const PALIERS_PX_PAR_M = [6, 12, 24, 48, 96] as const;

/** L'emprise de la vignette, en mètres : de la queue au museau, du sol aux bois. */
const LARGEUR_M = 1.7;
const HAUTEUR_M = 1.45;
/** Le pied, dans la vignette : au milieu, au sol. */
const PIED_X_M = LARGEUR_M / 2;
const MARGE_BAS_M = 0.12;

/** L'image de la marche, ou l'attitude à l'arrêt. */
export type Figure = "marche0" | "marche1" | Exclude<Attitude, "marche">;

export interface ClasseChevreuil {
  figure: Figure;
  ete: boolean;
  bois: boolean;
  /** rang dans `PALIERS_PX_PAR_M` */
  palier: number;
}

export interface VignetteChevreuil {
  image: HTMLCanvasElement;
  /** le pied dans la vignette, pixels */
  piedX: number;
  piedY: number;
  /** échelle de cuisson, pixels par mètre */
  pxParM: number;
}

export function cleChevreuil(c: ClasseChevreuil): string {
  return `${c.figure}:${c.ete ? "e" : "h"}:${c.bois ? "b" : "-"}:${c.palier}`;
}

/** Le palier qui couvre `pxParM` sans l'agrandir : on réduit, on n'étire pas. */
export function palierDe(pxParM: number): number {
  for (let i = 0; i < PALIERS_PX_PAR_M.length; i++) {
    if ((PALIERS_PX_PAR_M[i] ?? 0) >= pxParM) return i;
  }
  return PALIERS_PX_PAR_M.length - 1;
}

/**
 * Les pelages.
 *
 * L'été, un roux vif — c'est la couleur qu'on voit de loin dans un pré. L'hiver,
 * un gris-brun terne où le miroir blanc devient la seule chose qui se voit :
 * c'est exactement ainsi qu'on repère un chevreuil en décembre.
 */
const PELAGE = {
  ete: { dos: "#9c4a22", ventre: "#c98a52", patte: "#6e3a1e", miroir: "#e8d6b0" },
  hiver: { dos: "#6a5a4b", ventre: "#8c7c6a", patte: "#4a3e33", miroir: "#f6f3ec" },
};
const MUFLE = "#1c1612";
const BOIS = "#d9c7a0";
const LISERE = "rgba(28, 22, 16, 0.55)";

/** Ce que la tête fait dans chaque figure : où est-elle, en mètres. */
function teteDe(figure: Figure): { x: number; y: number; incline: number } {
  switch (figure) {
    case "guette":
      return { x: 0.5, y: 1.0, incline: -0.25 };
    case "broute":
      return { x: 0.62, y: 0.14, incline: 1.25 };
    case "frotte":
      return { x: 0.62, y: 0.5, incline: 0.7 };
    default:
      return { x: 0.58, y: 0.86, incline: 0.1 };
  }
}

/**
 * Les quatre pattes : (hanche x, pied x) en mètres, pour les antérieures puis
 * les postérieures. La marche écarte une paire et croise l'autre, et les deux
 * images alternent.
 */
function pattesDe(figure: Figure): [number, number][] {
  if (figure === "marche0") {
    return [
      [0.27, 0.42],
      [0.27, 0.16],
      [-0.28, -0.14],
      [-0.28, -0.42],
    ];
  }
  if (figure === "marche1") {
    return [
      [0.27, 0.3],
      [0.27, 0.26],
      [-0.28, -0.3],
      [-0.28, -0.24],
    ];
  }
  return [
    [0.27, 0.31],
    [0.27, 0.24],
    [-0.28, -0.25],
    [-0.28, -0.32],
  ];
}

/**
 * Dessine la bête tournée vers la droite, en mètres, le pied à l'origine et
 * l'axe vertical vers le **haut** — le contexte est retourné par l'appelant.
 */
function dessinerLaBete(ctx: CanvasRenderingContext2D, c: ClasseChevreuil): void {
  const p = c.ete ? PELAGE.ete : PELAGE.hiver;
  const tete = teteDe(c.figure);

  // Les pattes, fines : un chevreuil se tient sur des allumettes.
  ctx.strokeStyle = p.patte;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.065;
  for (const [hanche, pied] of pattesDe(c.figure)) {
    ctx.beginPath();
    ctx.moveTo(hanche, 0.52);
    ctx.lineTo((hanche + pied) / 2 + 0.02, 0.26);
    ctx.lineTo(pied, 0.02);
    ctx.stroke();
  }

  // Le corps : un ovale plus haut à l'arrière, le chevreuil a la croupe haute.
  ctx.fillStyle = p.dos;
  ctx.beginPath();
  ctx.ellipse(-0.02, 0.63, 0.43, 0.16, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ventre;
  ctx.beginPath();
  ctx.ellipse(0.02, 0.54, 0.3, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // Le miroir : la tache claire de la croupe, le signe qui ne trompe pas.
  ctx.fillStyle = p.miroir;
  ctx.beginPath();
  ctx.ellipse(-0.42, 0.64, 0.075, 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Le cou, de l'épaule à la tête.
  ctx.strokeStyle = p.dos;
  ctx.lineWidth = 0.15;
  ctx.beginPath();
  ctx.moveTo(0.3, 0.68);
  ctx.quadraticCurveTo(0.4 + (tete.x - 0.5) * 0.3, (0.68 + tete.y) / 2 + 0.06, tete.x, tete.y);
  ctx.stroke();

  // La tête, le museau, les oreilles.
  ctx.save();
  ctx.translate(tete.x, tete.y);
  ctx.rotate(-tete.incline);
  ctx.fillStyle = p.dos;
  ctx.beginPath();
  ctx.ellipse(0.06, 0, 0.12, 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MUFLE;
  ctx.beginPath();
  ctx.arc(0.17, -0.005, 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.dos;
  for (const dx of [-0.04, 0.0]) {
    ctx.beginPath();
    ctx.ellipse(dx, 0.1, 0.03, 0.075, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (c.bois) {
    // Les bois : deux merrains courts à trois andouillers, la ramure du brocard.
    ctx.strokeStyle = BOIS;
    ctx.lineWidth = 0.028;
    for (const dx of [0.0, 0.04]) {
      ctx.beginPath();
      ctx.moveTo(dx, 0.05);
      ctx.lineTo(dx - 0.02, 0.27);
      ctx.moveTo(dx - 0.01, 0.15);
      ctx.lineTo(dx + 0.05, 0.19);
      ctx.moveTo(dx - 0.017, 0.22);
      ctx.lineTo(dx - 0.07, 0.25);
      ctx.stroke();
    }
  }
  ctx.restore();

  // La queue n'existe presque pas chez le chevreuil : on n'en dessine pas.
}

/**
 * Cuit une vignette.
 *
 * La bête est dessinée deux fois : un liseré sombre d'un pixel d'abord, décalé
 * dans les huit directions, puis la bête. Sans lui, un chevreuil roux sur une
 * friche rousse disparaît — la même raison que le liseré des marqueurs.
 */
export function cuireChevreuil(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  c: ClasseChevreuil,
): VignetteChevreuil {
  const pxParM = PALIERS_PX_PAR_M[c.palier] ?? PALIERS_PX_PAR_M[0];
  const largeur = Math.ceil(LARGEUR_M * pxParM) + 2;
  const hauteur = Math.ceil((HAUTEUR_M + MARGE_BAS_M) * pxParM) + 2;
  const piedX = PIED_X_M * pxParM + 1;
  const piedY = hauteur - MARGE_BAS_M * pxParM - 1;

  const bete = fabriquer(largeur, hauteur);
  const b = bete.getContext("2d");
  const image = fabriquer(largeur, hauteur);
  const ctx = image.getContext("2d");
  if (!b || !ctx) return { image, piedX, piedY, pxParM };

  b.save();
  b.translate(piedX, piedY);
  b.scale(pxParM, -pxParM);
  dessinerLaBete(b, c);
  b.restore();

  // L'ombre portée au pied : ce qui pose la bête sur le sol au lieu de la faire
  // flotter devant.
  ctx.fillStyle = "rgba(20, 24, 16, 0.28)";
  ctx.beginPath();
  ctx.ellipse(piedX, piedY, 0.55 * pxParM, 0.12 * pxParM, 0, 0, Math.PI * 2);
  ctx.fill();

  poserLeLisere(fabriquer, ctx, bete, LISERE);
  ctx.drawImage(bete, 0, 0);
  return { image, piedX, piedY, pxParM };
}

/**
 * Le liseré : la silhouette de `bete` teinte en `couleur`, posée huit fois
 * autour d'elle sur `ctx`, à un pixel. La bête elle-même se pose ensuite
 * par-dessus. Partagé par tout ce qui vit sur la parcelle (#129).
 */
export function poserLeLisere(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  bete: HTMLCanvasElement,
  couleur: string,
): void {
  const lisere = fabriquer(bete.width, bete.height);
  const l = lisere.getContext("2d");
  if (!l) return;
  l.drawImage(bete, 0, 0);
  l.globalCompositeOperation = "source-in";
  l.fillStyle = couleur;
  l.fillRect(0, 0, bete.width, bete.height);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.drawImage(lisere, dx, dy);
  }
}

/** L'atlas de la faune : chaque vignette cuite une fois, à la demande. */
export class AtlasFaune {
  private readonly vignettes = new Map<string, VignetteChevreuil>();

  constructor(private readonly fabriquer: (l: number, h: number) => HTMLCanvasElement) {}

  vignette(c: ClasseChevreuil): VignetteChevreuil {
    const cle = cleChevreuil(c);
    let v = this.vignettes.get(cle);
    if (!v) {
      v = cuireChevreuil(this.fabriquer, c);
      this.vignettes.set(cle, v);
    }
    return v;
  }

  get taille(): number {
    return this.vignettes.size;
  }
}
