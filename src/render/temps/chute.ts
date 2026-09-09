/**
 * La CHUTE d'une chandelle : une déformation à la pose, jamais une recuisson
 * (docs/interface-visuelle.md §5.11, §6.3).
 *
 * **C'est la première animation, et elle a été choisie pour ça.** Le §6.3
 * l'appelle « la demande explicite » et le §2.3 note que l'issue #4 a été
 * ouverte pour elle : « l'arbre qui TOMBE au lieu de s'escamoter ». Le
 * protocole porte tout ce qu'il faut depuis — `ChuteDeChandelle` donne la
 * position, la hauteur, la masse, l'empreinte au sol et surtout la
 * `directionRad` — et rien ne le lisait.
 *
 * **La contrainte que le §5.11 pose nommément**, et qui a décidé de la forme de
 * ce module : « une animation continue ne doit pas invalider un cache de
 * cuisson. Le vent sur les feuillages ne peut pas passer par une recuisson des
 * vignettes : ce sera une déformation à la POSE (un sprite qu'on incline), pas
 * un redessin. » Ce module ne rend donc que des nombres — un angle, une
 * échelle, une opacité — que le poseur applique au sprite déjà cuit. L'atlas
 * ne bouge pas d'un octet pendant qu'un arbre tombe.
 *
 * **La géométrie, et pourquoi elle n'est pas triviale.** Un arbre qui tombe
 * décrit un quart de cercle : sa cime part de la verticale et finit couchée le
 * long de la direction de chute. Or cette direction est un azimut de PARCELLE,
 * et la vignette est un panneau vu de face. Un arbre qui tombe vers la caméra
 * ne pivote donc presque pas à l'écran — il RACCOURCIT ; un arbre qui tombe de
 * profil pivote d'un quart de tour. Les deux sont le même mouvement, vu de deux
 * côtés, et c'est la projection qui fait la différence.
 *
 * On calcule donc où va la CIME, en pixels, et on en déduit l'inclinaison et la
 * longueur du panneau. Rien de plus : un panneau plat ne peut pas faire mieux,
 * et il n'a pas à faire mieux — à l'échelle où l'on joue, ce qu'on lit d'une
 * chute est qu'un arbre debout devient un tronc couché, dans la bonne
 * direction.
 *
 * Module **pur** : aucun canvas, aucun sprite, pas de Pixi.
 */

import type { Vue } from "../camera";
import { versEcranVue } from "../camera";
import { METRE_VERTICAL_PX } from "../projection";

/**
 * Ce qu'il faut appliquer à un sprite déjà cuit pour le voir tomber.
 *
 * Tout est relatif au PIED de l'arbre, qui ne bouge pas : c'est le point
 * d'ancrage de la pose, et c'est aussi le point autour duquel un arbre
 * pivote réellement quand il tombe — la souche reste.
 */
export interface Deformation {
  /** inclinaison du panneau, radians, autour du pied ; 0 = debout */
  rotationRad: number;
  /**
   * Facteur d'échelle sur la HAUTEUR du sprite.
   *
   * C'est lui qui porte le raccourci : un arbre qui tombe vers la caméra garde
   * son inclinaison à zéro et voit sa hauteur fondre. Sans ce facteur, un tel
   * arbre resterait debout jusqu'à disparaître d'un coup.
   */
  hauteur: number;
  /** opacité ∈ [0,1] : elle ne sert qu'au tout dernier instant */
  opacite: number;
}

/** Un arbre debout, avant que rien ne lui arrive. */
export const DEBOUT: Deformation = { rotationRad: 0, hauteur: 1, opacite: 1 };

/**
 * Compose deux déformations du même sprite.
 *
 * **Nécessaire dès qu'une ellipse porte plusieurs actes sur un même arbre** —
 * franchir dix ans, c'est voir un arbre mourir puis tomber. Les échelles se
 * multiplient et les angles s'ajoutent, ce qui est la seule composition qui
 * garde `DEBOUT` neutre : combiner quoi que ce soit avec « debout » ne change
 * rien, et c'est ce qui permet d'appeler cette fonction sans se demander si
 * l'un des deux actes a lieu.
 */
export function combiner(a: Deformation, b: Deformation): Deformation {
  return {
    rotationRad: a.rotationRad + b.rotationRad,
    hauteur: a.hauteur * b.hauteur,
    opacite: a.opacite * b.opacite,
  };
}

/**
 * Le plus court qu'un panneau se laisse écraser, en part de sa hauteur.
 *
 * **La limite d'un panneau vu de face, assumée et bornée.** Un arbre qui tombe
 * droit vers l'objectif pointe, à un instant de sa chute, exactement le long de
 * la ligne de visée : sa projection vaut alors zéro. C'est exact, et ça se voit
 * comme un arbre qui disparaît. On plafonne donc l'écrasement à un tiers : le
 * raccourci se lit encore, et rien ne s'évanouit.
 */
export const HAUTEUR_LA_PLUS_COURTE = 0.34;

/**
 * Part de la chute pendant laquelle l'arbre ACCÉLÈRE.
 *
 * Un arbre ne tombe pas à vitesse constante : il part lentement, la souche
 * cède, puis il s'abat. Le carré de l'avancement suffit à le dire — c'est la
 * chute libre, à un facteur près, et un quart de cercle parcouru linéairement
 * se lit comme une porte qui s'ouvre plutôt que comme un arbre qui tombe.
 */
function accelerer(avancement: number): number {
  const t = Math.min(1, Math.max(0, avancement));
  return t * t;
}

/**
 * La déformation d'une chandelle qui tombe, à un avancement donné.
 *
 * `avancement` va de 0 (debout) à 1 (couché). Au-delà, l'arbre est au sol et
 * n'est plus l'affaire de ce module : c'est `soilBoisAuSol` qui le porte, et le
 * terrain le dessine déjà.
 */
export function chuteEnCours(
  chute: { x: number; y: number; heightM: number; directionRad: number },
  avancement: number,
  vue: Vue,
): Deformation {
  const t = accelerer(avancement);
  // L'angle parcouru depuis la verticale : un quart de tour en tout.
  const theta = (t * Math.PI) / 2;

  // **La direction de chute, en PIXELS.** On projette deux points de parcelle
  // et on soustrait : c'est la seule façon juste sous une caméra qui tourne, et
  // le rendu tourne (quart de tour aux flèches). Une constante ne marcherait
  // que pour une orientation.
  const pied = versEcranVue({ x: chute.x, y: chute.y, z: 0 }, vue);
  const versLa = versEcranVue(
    {
      x: chute.x + Math.cos(chute.directionRad),
      y: chute.y + Math.sin(chute.directionRad),
      z: 0,
    },
    vue,
  );
  const solX = versLa.sx - pied.sx;
  const solY = versLa.sy - pied.sy;

  // **Deux composantes, et il faut les séparer.** Ce qui est DANS le plan de
  // l'écran fait pivoter le panneau ; ce qui va vers l'objectif le raccourcit.
  // Les confondre — en prenant l'angle de la cime projetée — est exact et
  // inutilisable : un arbre qui tombe droit vers l'objectif traverse la ligne
  // de visée, sa projection s'écrase à zéro puis repart vers le BAS, et le
  // panneau se retourne. C'est géométriquement juste et ça se voit comme un
  // défaut d'affichage. Un panneau vu de face ne peut pas montrer ça, et il
  // n'a pas à essayer.
  //
  // La part de profil se normalise sans constante : le décalage horizontal
  // d'un vecteur unité d'azimut `a` vaut `A·cos a + B·sin a`, dont le maximum
  // sur tous les azimuts est `hypot(A, B)` — on projette donc l'est et le nord
  // une fois, et on en tire la normalisation exacte pour cette caméra.
  const est = versEcranVue({ x: chute.x + 1, y: chute.y, z: 0 }, vue);
  const nord = versEcranVue({ x: chute.x, y: chute.y + 1, z: 0 }, vue);
  const profilMax = Math.hypot(est.sx - pied.sx, nord.sx - pied.sx);
  const partProfil = profilMax > 0 ? solX / profilMax : 0;

  // L'inclinaison : un quart de tour au plus, à proportion de ce que la chute
  // a de profil, et le sinus de l'angle parcouru pour l'étaler dans le temps.
  const rotationRad = (Math.PI / 2) * Math.sin(theta) * partProfil;

  // La hauteur : la longueur de la cime projetée, rapportée à ce qu'elle
  // valait debout — c'est elle qui porte le raccourci. Avec un plancher, pour
  // la même raison que ci-dessus : un arbre ne doit pas disparaître au milieu
  // de sa chute parce qu'il pointe vers l'objectif.
  const parMetre = METRE_VERTICAL_PX * vue.cam.zoom;
  const cimeX = chute.heightM * Math.sin(theta) * solX;
  const cimeY = chute.heightM * (Math.sin(theta) * solY - Math.cos(theta) * parMetre);
  const debout = chute.heightM * parMetre;
  const brute = debout > 0 ? Math.hypot(cimeX, cimeY) / debout : 1;
  const hauteur = Math.max(HAUTEUR_LA_PLUS_COURTE, brute);

  return { rotationRad, hauteur, opacite: 1 };
}
