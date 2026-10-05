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
/** Au plus autant de touffes posées : au-delà, on éclaircit et on agrandit. */
export const TOUFFES_MAX = 2500;
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
    const haut = 9 + 12 * h(k * 5 + 2);
    const penche = (h(k * 5 + 3) - 0.5) * 9;
    g.strokeStyle = "rgba(226, 236, 246, 0.95)";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + penche * 0.3, y - haut * 0.6, x + penche, y - haut);
    g.stroke();
    // La rime : un point vif à la pointe, et parfois un second à mi-hauteur.
    g.fillStyle = "rgba(250, 253, 255, 1)";
    g.beginPath();
    g.arc(x + penche, y - haut, 1.3, 0, Math.PI * 2);
    g.fill();
    if (h(k * 5 + 4) < 0.5) {
      g.beginPath();
      g.arc(x + penche * 0.45, y - haut * 0.55, 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}
