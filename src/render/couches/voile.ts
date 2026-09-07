/**
 * Le losange d'un voile de geste, cuit une fois pour la partie.
 *
 * Une seule fonction, et elle est ici plutôt que dans `pixi/scene.ts` pour la
 * raison habituelle : le Canvas 2D CUIT, Pixi POSE, et ce dépôt garde les deux
 * dans des fichiers séparés pour que le premier se teste sans navigateur.
 *
 * **Blanc, et c'est ce qui permet de n'en cuire qu'un.** La teinte du geste
 * arrive à la pose par le `tint` de Pixi, qui multiplie ; un losange blanc
 * multiplié par la couleur d'un chaulage donne un chaulage. Six gestes de zone
 * partagent donc une texture — et si un septième arrive, il n'en faudra pas
 * une de plus.
 */

import { TUILE_HAUTEUR_PX, TUILE_LARGEUR_PX } from "../projection";

/**
 * Résolution du losange, en multiples d'une tuile.
 *
 * Quatre, et c'est un compromis entre les deux zooms. Une cellule fait neuf
 * pixels de large quand la parcelle entière tient dans le cadre et une
 * centaine au plus près : cuire à la taille d'une tuile donnerait un losange
 * agrandi six fois là où le joueur regarde son geste, et cuire beaucoup plus
 * finement ne servirait qu'à alourdir la réduction. Le reste du chemin est
 * fait par les mipmaps, montés à la pose.
 */
export const FINESSE_DU_VOILE = 4;

/**
 * Un losange plein, aux arêtes FRANCHES.
 *
 * Franches parce qu'une cellule EST un losange net — le terrain dessine les
 * siennes exactement ainsi, avec le même demi-débord d'un demi-pixel pour
 * qu'elles se touchent. Un voile aux bords fondus se lirait comme une tache et
 * non comme un carreau travaillé, et deux cellules voisines fondues
 * s'additionneraient en un liseré plus sombre à leur jointure.
 *
 * Ce qui reste du crénelage est traité à la POSE et non ici : la texture est
 * réduite par mipmap, ce qui est le seul remède au damier qu'une réduction
 * brutale produisait.
 */
export function cuireLosangeVoile(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const l = TUILE_LARGEUR_PX * FINESSE_DU_VOILE;
  const h = TUILE_HAUTEUR_PX * FINESSE_DU_VOILE;
  const canvas = fabriquer(l, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(l / 2, 0);
  ctx.lineTo(l, h / 2);
  ctx.lineTo(l / 2, h);
  ctx.lineTo(0, h / 2);
  ctx.closePath();
  ctx.fill();
  return canvas;
}
