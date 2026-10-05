/**
 * **La neige** : les flocons de la semaine et le manteau au sol (#130, #303).
 *
 * Module **pur**, comme `pluie.ts` : il ne dessine rien, il dit où tombent les
 * flocons et de combien le sol est blanc.
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **ce qui tombe** : `Snapshot.neigeMm`, la part de `weather.rainMm` qui
 *   tombe solide la semaine montrée, par la loi même du moteur
 *   (`neigeDeLaSemaine`). La pluie liquide est le reste : la même eau ne tombe
 *   pas deux fois.
 * - **ce qui reste au sol** : `Snapshot.manteauNeigeMm`, le manteau sur lequel
 *   la semaine s'ouvre, en millimètres d'équivalent en eau. Il s'accumule et
 *   fond dans le moteur ; le rendu le lit d'un instantané à l'autre, et la fonte
 *   se voit d'elle-même.
 *
 * ── **ce qui n'y est pas, et pourquoi** ─────────────────────────────────────
 *
 * **Les couronnes chargées.** Le manteau est **un** nombre pour la parcelle : le
 * moteur ne sait pas ce que les houppiers interceptent ni ce que leur ombre
 * retarde. Poser de la neige sur les branches serait décider côté rendu où elle
 * tient. Le sol blanchit partout pareil, sous le couvert comme au découvert,
 * parce que c'est ce que le moteur dit.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * Les courbes (à quelle neige les flocons sont serrés, à quel manteau le sol est
 * tout blanc) et le dessin des flocons. Comme la pluie, **les flocons tombent
 * toute l'ellipse** : le moteur donne un cumul de semaine.
 */

import type { Vue } from "../camera";
import { hacher } from "../hachage";

const borne = (v: number) => Math.min(1, Math.max(0, v));

/** Neige de la semaine en deçà de laquelle rien ne tombe à l'écran, mm d'eau. */
export const NEIGE_MUETTE_MM = 0.5;
/** Neige de la semaine qui fait une franche chute, mm d'eau : une quinzaine de centimètres. */
export const NEIGE_PLEINE_MM = 15;
/**
 * Manteau auquel le sol est tout blanc, mm d'équivalent en eau. Dix
 * millimètres d'eau font une dizaine de centimètres de neige fraîche : de quoi
 * couvrir l'herbe. En deçà, la neige est mince et le sol perce.
 */
export const MANTEAU_PLEIN_MM = 10;

/** La force de la chute à l'écran ∈ [0,1]. */
export function intensiteDeLaNeige(neigeMm: number): number {
  if (!(neigeMm > NEIGE_MUETTE_MM)) return 0;
  return borne(neigeMm / NEIGE_PLEINE_MM) ** 0.6;
}

/**
 * De combien le sol est blanc ∈ [0,1].
 *
 * Il monte vite : deux millimètres d'eau, deux centimètres de neige, blanchissent
 * déjà franchement une prairie.
 */
export function blancheurDuSol(manteauMm: number): number {
  if (!(manteauMm > 0)) return 0;
  return borne(manteauMm / MANTEAU_PLEIN_MM) ** 0.5;
}

/** Un flocon à l'écran. */
export interface Flocon {
  sx: number;
  sy: number;
  /** rayon, px */
  rayonPx: number;
  opacite: number;
}

/** Flocons à l'écran pour cent mille pixels, sous une franche chute. */
export const FLOCONS_PAR_1E5_PX = 60;
/** Au plus autant de flocons, quelle que soit la taille de la fenêtre. */
export const FLOCONS_MAX = 600;
/** Temps de traversée de l'écran par un flocon, ms : la neige tombe lentement. */
export const TRAVERSEE_DU_FLOCON_MS = 5200;
/** Amplitude du balancement d'un flocon, px. */
export const BALANCEMENT_PX = 14;

/**
 * Les flocons à cet instant, en pixels d'écran.
 *
 * Comme les gouttes : chacun a sa colonne et sa phase, tirées de son rang, et
 * boucle. Ils tombent lentement, se balancent, et le vent les emporte du même
 * côté que la pluie — un flocon est plus léger qu'une goutte, il dérive plus.
 */
export function floconsDeLaNeige(
  neigeMm: number,
  /** l'inclinaison du rideau de pluie sous ce vent (`inclinaisonDuRideau`) */
  inclinaisonRad: number,
  vue: Vue,
  maintenantMs: number,
): Flocon[] {
  const force = intensiteDeLaNeige(neigeMm);
  if (force <= 0) return [];
  const { largeurPx: l, hauteurPx: h } = vue;
  const n = Math.min(FLOCONS_MAX, Math.round(force * FLOCONS_PAR_1E5_PX * ((l * h) / 1e5)));
  // Plus léger qu'une goutte : la même inclinaison emporte un flocon plus loin.
  const derive = Math.tan(inclinaisonRad) * 1.6;
  const marge = Math.abs(derive) * h + BALANCEMENT_PX;
  const flocons: Flocon[] = [];
  for (let i = 0; i < n; i++) {
    const colonne = hacher(i, 0, 0x5e00);
    const phase = hacher(i, 1, 0x5e01);
    const vitesse = 0.7 + 0.6 * hacher(i, 2, 0x5e02);
    const u = (maintenantMs / (TRAVERSEE_DU_FLOCON_MS / vitesse) + phase) % 1;
    const sy = -10 + u * (h + 20);
    const x0 = colonne * (l + 2 * marge) - marge;
    const balance =
      BALANCEMENT_PX *
      Math.sin((maintenantMs / 900) * (0.6 + 0.8 * hacher(i, 3, 0x5e03)) + phase * 6.283);
    flocons.push({
      sx: x0 + derive * sy + balance,
      sy,
      rayonPx: 1 + 1.6 * hacher(i, 4, 0x5e04),
      opacite: 0.55 + 0.4 * hacher(i, 5, 0x5e05),
    });
  }
  return flocons;
}

/** Le blanc d'un sol enneigé : un peu bleu, comme la neige à l'ombre d'un ciel d'hiver. */
export const BLANC_DE_NEIGE = { r: 236, g: 242, b: 250 } as const;
/**
 * Part de blanc au plus. Pas 1 : sous un manteau plein, le relief se lit encore
 * par ses ombres et ses tons, et un aplat blanc l'effacerait.
 */
export const BLANC_DE_NEIGE_MAX = 0.82;

/**
 * De combien la neige éclaircit l'**ombre** des arbres, en part du blanc du sol. Une
 * ombre sur la neige reste une ombre, mais la neige l'éclaire par en dessous.
 */
export const OMBRE_SUR_NEIGE = 0.85;
