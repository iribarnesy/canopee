/**
 * **Les brins givrés**, dessinés (#130 ; retour de jeu du 2026-10-05).
 *
 * Un voile blanc uniforme ne se lisait pas comme du givre : « on comprend pas
 * que c'est du givre… on devrait voir des sortes de brins d'herbe givrés ». Une
 * gelée blanche se reconnaît à ça — chaque brin d'herbe ourlé de blanc, des
 * cristaux qui accrochent la lumière. Cette touffe est cuite une fois, en trois
 * variantes, et posée sur chaque cellule gelée où l'herbe pousse.
 *
 * Module sans Pixi : il dessine sur un canvas qu'on lui donne.
 */

import { hacher } from "../hachage";

/** Largeur et hauteur d'une touffe cuite, pixels : une cellule à quatre fois sa taille. */
export const LARGEUR_TOUFFE_PX = 64;
export const HAUTEUR_TOUFFE_PX = 40;
/** Au plus autant de touffes posées : au-delà, on éclaircit (sans agrandir, #357). */
export const TOUFFES_MAX = 2500;
/** De près, jusqu'à tant de touffes par cellule : un tapis de brins, pas une touffe isolée. */
export const TOUFFES_PAR_CELLULE_MAX = 4;
/** La hauteur du plus haut brin dans la vignette, pixels : c'est elle qu'on met à l'échelle. */
export const HAUT_MAX_DU_BRIN_PX = 21;
/**
 * Sous cette taille à l'écran, un brin n'est plus un brin mais du
 * fourmillement : on ne pose pas de touffes, et le voile porte seul le blanc.
 */
export const BRIN_LISIBLE_PX = 4;
/** À partir de cette taille, les brins portent seuls le givre, sur un voile léger. */
export const BRIN_PLEIN_PX = 12;
/** Le pied de la touffe dans la vignette : au milieu, en bas du losange. */
export const PIED_TOUFFE_Y_PX = 30;

type Fabrique = (largeur: number, hauteur: number) => HTMLCanvasElement;

/**
 * Une touffe de brins givrés : une douzaine de traits courbes qui montent du
 * sol, blanc bleuté, et des points de rime plus vifs sur les pointes.
 */
export function cuireTouffeGivree(fabriquer: Fabrique, variante: number): HTMLCanvasElement {
  const c = fabriquer(LARGEUR_TOUFFE_PX, HAUTEUR_TOUFFE_PX);
  const g = c.getContext("2d");
  if (!g) return c;
  const h = (k: number) => hacher(variante, k, 0x61f0);
  g.lineCap = "round";
  const brins = 11;
  for (let k = 0; k < brins; k++) {
    // Les pieds se répartissent dans le losange de la cellule.
    const u = h(k * 5) - 0.5;
    const v = h(k * 5 + 1) - 0.5;
    const x = LARGEUR_TOUFFE_PX / 2 + (u + v) * LARGEUR_TOUFFE_PX * 0.42;
    const y = PIED_TOUFFE_Y_PX + (v - u) * 10;
    const haut = HAUT_MAX_DU_BRIN_PX - 12 * h(k * 5 + 2);
    const penche = (h(k * 5 + 3) - 0.5) * 9;
    g.strokeStyle = "rgba(226, 236, 246, 0.95)";
    // Épais dans la vignette, parce qu'elle est posée **réduite** : un brin de
    // vingt-cinq centimètres fait quelques pixels, et un trait fin sous-pixel
    // s'efface au mipmap en gris au lieu de rester blanc.
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + penche * 0.3, y - haut * 0.6, x + penche, y - haut);
    g.stroke();
    // La rime : un point vif à la pointe, et parfois un second à mi-hauteur.
    g.fillStyle = "rgba(250, 253, 255, 1)";
    g.beginPath();
    g.arc(x + penche, y - haut, 2.4, 0, Math.PI * 2);
    g.fill();
    if (h(k * 5 + 4) < 0.5) {
      g.beginPath();
      g.arc(x + penche * 0.45, y - haut * 0.55, 1.7, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Côté de la vignette du grain de givre, pixels — répétée sur tout le calque, à l'échelle 1. */
export const COTE_GRAIN_PX = 128;
/** Opacité du grain quand les brins sont posés : ils portent alors le givre. */
export const GRAIN_SOUS_LES_BRINS = 0.5;

/**
 * **Le grain de la rime** : des cristaux semés, quelques-uns vifs, la plupart
 * à peine marqués.
 *
 * De loin, un voile uni posé sur une terre brune donnait un gris de béton, et
 * on revenait à la parcelle « bizarre » du premier test. Une gelée blanche n'est
 * pas une teinte, c'est une poussière de cristaux qui accroche la lumière : ce
 * grain, répété et découpé à la forme des cellules gelées, la rend.
 */
export function cuireGrainDeGivre(fabriquer: Fabrique): HTMLCanvasElement {
  const c = fabriquer(COTE_GRAIN_PX, COTE_GRAIN_PX);
  const g = c.getContext("2d");
  if (!g) return c;
  for (let k = 0; k < 900; k++) {
    const x = hacher(k, 1, 0x61a0) * COTE_GRAIN_PX;
    const y = hacher(k, 2, 0x61a0) * COTE_GRAIN_PX;
    const vif = hacher(k, 3, 0x61a0);
    const r = vif > 0.93 ? 1.6 : 0.6 + 0.6 * hacher(k, 4, 0x61a0);
    g.fillStyle = `rgba(250, 253, 255, ${vif > 0.93 ? 1 : 0.35 + 0.45 * vif})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
