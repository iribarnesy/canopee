/**
 * **Le temps qu'il fait : le ciel couvert et la pluie** (#130, lot L10).
 *
 * Module **pur** : il ne dessine rien. Il dit de combien le ciel est chargé,
 * de combien le sol est mouillé, et où tombent les gouttes à un instant donné,
 * en pixels d'écran. La scène ne fait que les poser.
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **la pluie** : `weather.rainMm`, la pluie de la semaine. C'est elle qui
 *   charge le ciel, qui fait tomber les gouttes et qui fonce le sol. Une
 *   semaine sèche a un ciel dégagé ; il n'y a pas de nuage sans pluie, parce
 *   que le moteur ne connaît pas la nébulosité et qu'on ne l'invente pas.
 * - **le vent** : `ventVersRad`, le cap **vers** lequel il souffle, et ce que
 *   le site en reçoit (`ventRecuParLeSite`). Il incline le rideau du même côté
 *   que le panache d'un incendie, et pour la même raison : c'est le même vent.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * Les courbes (à quelle pluie le ciel est plein, l'averse franche) et le
 * dessin des gouttes : leur nombre à l'écran, leur longueur, leur vitesse.
 * **La pluie tombe toute l'ellipse** : le moteur donne un cumul de semaine, pas
 * les jours où il a plu, donc le rendu ne sait pas quand l'averse a eu lieu.
 * Il dit combien, et seulement combien.
 *
 * **La neige n'est pas ici**, et ce n'est pas un oubli : le moteur ne dit pas
 * quelle part de `rainMm` tombe en neige, et ne tient pas de manteau. Le rendu
 * ne la dessinera pas tant qu'il ne le dira pas (#303).
 */

import type { Vue } from "../camera";
import { hacher } from "../hachage";
import { melange, phaseAnnuelle, type Teinte } from "../palette";
import { versEcran } from "../projection";
import type { VentAPencher } from "./feu";

const borne = (v: number) => Math.min(1, Math.max(0, v));

/** Pluie de la semaine qui fait une averse franche, mm. Le son suit la même. */
export const PLUIE_PLEINE_MM = 35;
/** Pluie de la semaine en deçà de laquelle rien ne tombe à l'écran, mm : une bruine de rosée. */
export const PLUIE_MUETTE_MM = 1;
/** Pluie de la semaine à laquelle le ciel est tout à fait couvert, mm. */
export const PLUIE_QUI_COUVRE_MM = 20;

/**
 * La force de la pluie à l'écran et à l'oreille ∈ [0,1].
 *
 * **Une seule courbe pour les deux**, et c'est pour ça qu'elle est ici : une
 * averse qu'on entend mais qu'on ne voit pas, ou l'inverse, se remarque tout
 * de suite. `son/niveaux.ts` la lit.
 */
export function intensiteDeLaPluie(pluieMm: number): number {
  if (!(pluieMm > PLUIE_MUETTE_MM)) return 0;
  return borne(pluieMm / PLUIE_PLEINE_MM) ** 0.7;
}

/**
 * De combien le ciel est chargé ∈ [0,1].
 *
 * Il monte plus vite que la pluie : dix millimètres dans la semaine, c'est
 * déjà un temps gris, même si l'averse n'est pas franche.
 */
export function couvertDuCiel(pluieMm: number): number {
  if (!(pluieMm > PLUIE_MUETTE_MM)) return 0;
  return borne((pluieMm - PLUIE_MUETTE_MM) / (PLUIE_QUI_COUVRE_MM - PLUIE_MUETTE_MM)) ** 0.6;
}

/** Ce que le rendu lit de la semaine pour le temps qu'il fait. */
export interface TempsQuIlFait {
  /** `weather.rainMm` */
  pluieMm: number;
  vent: VentAPencher;
}

/** Le ciel et le sol de la semaine, ce que la scène teinte. */
export interface CielDeLaSemaine {
  /** de combien le ciel est chargé ∈ [0,1] */
  couvert: number;
  /** de combien le sol fonce ∈ [0,1] : il est mouillé autant qu'il pleut */
  mouille: number;
}

export function cielDeLaSemaine(t: TempsQuIlFait): CielDeLaSemaine {
  return { couvert: couvertDuCiel(t.pluieMm), mouille: intensiteDeLaPluie(t.pluieMm) };
}

/** Une goutte à l'écran : un trait, du haut vers le bas. */
export interface Goutte {
  sx: number;
  sy: number;
  /** longueur du trait, px */
  longueurPx: number;
  /** angle du trait sur la verticale, radians (> 0 = penche vers la droite en bas) */
  inclinaisonRad: number;
  opacite: number;
}

/** Gouttes à l'écran pour cent mille pixels, sous une averse franche. */
export const GOUTTES_PAR_1E5_PX = 90;
/** Au plus autant de gouttes, quelle que soit la taille de la fenêtre. */
export const GOUTTES_MAX = 900;
/** Temps de traversée de l'écran par une goutte, ms — un rideau, pas une chute réelle. */
export const TRAVERSEE_MS = 650;
/** Inclinaison la plus forte, sous le vent qui couche le panache : 35°. */
export const INCLINAISON_MAX_RAD = (35 * Math.PI) / 180;
/** Vent reçu qui incline le rideau au plus, m/s — celui qui couche aussi le panache. */
export const VENT_QUI_INCLINE_MS = 8;

/**
 * Vers où le rideau penche à l'écran, radians sur la verticale.
 *
 * Le vent est un cap **de carte** ; ce qu'on voit est sa composante
 * **horizontale à l'écran**, qui dépend de l'orientation de la vue. Un vent qui
 * souffle droit vers la caméra ne penche pas le rideau — il le rapproche, ce
 * qu'un trait ne sait pas dire.
 */
export function inclinaisonDuRideau(vent: VentAPencher, vue: Vue): number {
  const o = versEcran({ x: 0, y: 0, z: 0 }, vue.cam);
  const p = versEcran({ x: Math.cos(vent.versRad), y: Math.sin(vent.versRad), z: 0 }, vue.cam);
  const dx = p.sx - o.sx;
  const dy = p.sy - o.sy;
  const n = Math.hypot(dx, dy);
  if (n === 0) return 0;
  const force = borne(Math.max(0, vent.recuMs) / VENT_QUI_INCLINE_MS);
  return INCLINAISON_MAX_RAD * force * (dx / n);
}

/**
 * Les gouttes à cet instant, en pixels d'écran.
 *
 * Chaque goutte a sa colonne et sa phase, tirées d'un hachage de son rang :
 * elles ne naissent ni ne meurent, elles bouclent. Le nombre suit la force de
 * la pluie et la surface de la fenêtre, pas le zoom — c'est un rideau posé
 * devant la parcelle, pas des objets du monde.
 */
export function gouttesDeLaPluie(t: TempsQuIlFait, vue: Vue, maintenantMs: number): Goutte[] {
  const force = intensiteDeLaPluie(t.pluieMm);
  if (force <= 0) return [];
  const { largeurPx: l, hauteurPx: h } = vue;
  const n = Math.min(GOUTTES_MAX, Math.round(force * GOUTTES_PAR_1E5_PX * ((l * h) / 1e5)));
  const incline = inclinaisonDuRideau(t.vent, vue);
  const derive = Math.tan(incline);
  // Le rideau déborde du côté d'où vient le vent : sans cette marge, le coin
  // au vent resterait sec.
  const marge = Math.abs(derive) * h;
  const gouttes: Goutte[] = [];
  for (let i = 0; i < n; i++) {
    const colonne = hacher(i, 0, 0x9100);
    const phase = hacher(i, 1, 0x9101);
    // Toutes ne tombent pas à la même vitesse : une averse n'est pas un métronome.
    const vitesse = 0.8 + 0.4 * hacher(i, 2, 0x9102);
    const u = (maintenantMs / (TRAVERSEE_MS / vitesse) + phase) % 1;
    const sy = -20 + u * (h + 40);
    const x0 = colonne * (l + marge) - (derive > 0 ? marge : 0);
    gouttes.push({
      sx: x0 + derive * sy,
      sy,
      longueurPx: 9 + 9 * force * hacher(i, 3, 0x9103),
      inclinaisonRad: incline,
      opacite: 0.25 + 0.35 * force * hacher(i, 4, 0x9104),
    });
  }
  return gouttes;
}

/**
 * Le gris d'un ciel de pluie, posé sur toute l'image. Froid et un peu bleu :
 * c'est ce qu'un temps couvert retire, la lumière chaude du soleil.
 */
export const GRIS_DE_PLUIE = { r: 96, g: 106, b: 118 } as const;
/** Opacité du voile gris sous un ciel tout à fait couvert. */
export const VOILE_DE_PLUIE_MAX = 0.22;
/** De combien le sol fonce, au plus, sous une averse franche : un sol mouillé est plus sombre. */
export const SOL_MOUILLE_MAX = 0.2;

/** Le ciel d'une semaine sans pluie, ou d'une scène qui n'en dit rien. */
export const CIEL_DEGAGE: CielDeLaSemaine = { couvert: 0, mouille: 0 };

/**
 * Le ciel de chaque saison, par beau temps : un hiver froid et pâle, un été
 * chaud et clair, un automne doré. C'est le fond derrière le décor
 * transparent, et il porte la saison autant que le feuillage (§5.7).
 *
 * **Une convention de rendu**, rangée sur le calendrier : le moteur n'a pas de
 * couleur de ciel. La semaine, elle, est celle de l'instantané.
 */
export const CIEL_D_HIVER = { r: 166, g: 176, b: 186 } as const;
export const CIEL_D_ETE = { r: 176, g: 184, b: 170 } as const;
export const CIEL_D_AUTOMNE = { r: 180, g: 176, b: 158 } as const;

/**
 * Le fond du ciel cette semaine : la saison, puis la pluie qui le grise.
 *
 * L'hiver et l'été se répondent sur l'année (janvier, juillet) ; l'automne
 * vient en bosse autour d'octobre, là où le feuillage tourne.
 */
export function fondDuCiel(semaineAnnee: number, couvert: number): Teinte {
  const phase = phaseAnnuelle(semaineAnnee);
  const ete = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const base = melange(CIEL_D_HIVER, CIEL_D_ETE, ete);
  // Une bosse centrée sur la semaine 42, large d'un mois et demi de chaque côté.
  const ecart = Math.abs((((semaineAnnee % 52) + 52) % 52) - 42);
  const automne = Math.max(0, 1 - ecart / 7);
  const saison = melange(base, CIEL_D_AUTOMNE, automne * 0.8);
  return melange(saison, GRIS_DE_PLUIE, 0.55 * borne(couvert));
}
