/**
 * Les trois formes du calque des changements, cuites une fois pour la partie
 * (docs/interface-visuelle.md §6.8 №1).
 *
 * **En blanc, comme le losange du voile, et pour la même raison** : la teinte
 * arrive à la pose par le `tint` de Pixi, donc douze causes de mort et deux
 * sortes de gestes partagent trois textures.
 *
 * **La forme dit la NATURE du changement**, la teinte en dit la cause. Un halo
 * pour un arbre mort — un anneau ouvert, qui entoure sans masquer ; un liseré
 * pour un arbre travaillé — un arc, qui souligne sans entourer ; un repère
 * pour une zone — une croix fine, qui désigne un point du sol.
 *
 * Ces trois formes sont cuites à une taille FIXE en pixels et posées telles
 * quelles : un marqueur ne grandit pas quand on zoome, parce qu'il n'est pas
 * dans le monde. C'est ce qui l'empêche d'être pris pour un objet.
 */

/** Côté de la texture d'un marqueur, en pixels. */
export const COTE_MARQUEUR_PX = 32;

/**
 * Épaisseur du trait, en pixels de texture.
 *
 * Deux et demi : à un pixel le marqueur disparaît sur un houppier chargé, à
 * quatre il devient une tache et cesse de laisser voir ce qu'il entoure.
 */
export const TRAIT_MARQUEUR_PX = 2.5;

/**
 * Chaque forme est tracée DEUX FOIS : un liseré sombre plus large, puis le
 * trait clair par-dessus.
 *
 * **Sans ça, un marqueur pâle sur un houppier clair ne se voit pas**, et la
 * capture l'a montré : les halos beiges de l'écrasement et de l'ombre se
 * fondaient dans le feuillage. Le `tint` de Pixi multiplie, donc le liseré
 * sombre devient une version foncée de la teinte et le trait clair devient la
 * teinte elle-même : le marqueur porte son propre contraste, quelle que soit
 * la couleur qu'on lui donne et quel que soit le fond.
 */
const OMBRE_DU_TRAIT = "#3a3a38";
const CLARTE_DU_TRAIT = "#fff";
const DEBORD_DU_LISERE_PX = 1.6;

/** Trace une forme avec son liseré sombre puis son trait clair. */
function doubleTrait(ctx: CanvasRenderingContext2D, tracer: () => void): void {
  ctx.lineCap = "round";
  for (const [couleur, epaisseur] of [
    [OMBRE_DU_TRAIT, TRAIT_MARQUEUR_PX + DEBORD_DU_LISERE_PX],
    [CLARTE_DU_TRAIT, TRAIT_MARQUEUR_PX],
  ] as const) {
    ctx.strokeStyle = couleur;
    ctx.lineWidth = epaisseur;
    ctx.beginPath();
    tracer();
    ctx.stroke();
  }
}

/**
 * Un HALO : un anneau ouvert en haut.
 *
 * Ouvert, et pas fermé : un cercle complet posé sur un houppier se lit comme
 * un fruit géant ou une bulle. Une ouverture suffit à dire « ceci est un
 * repère » — l'œil complète le cercle et ne le confond plus avec un objet.
 */
export function cuireHalo(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = fabriquer(COTE_MARQUEUR_PX, COTE_MARQUEUR_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = COTE_MARQUEUR_PX / 2;
  const r = c - TRAIT_MARQUEUR_PX - DEBORD_DU_LISERE_PX;
  doubleTrait(ctx, () => ctx.arc(c, c, r, -Math.PI * 0.35, Math.PI * 1.15));
  return canvas;
}

/**
 * Un LISERÉ : un arc bas, comme un souligné.
 *
 * Sous l'arbre et non autour : un geste s'applique à une tige qu'on garde, là
 * où une mort la retire. La différence doit se lire sans la couleur, parce
 * qu'un joueur sur deux ne distingue pas le roux du brun.
 */
export function cuireLisere(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = fabriquer(COTE_MARQUEUR_PX, COTE_MARQUEUR_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = COTE_MARQUEUR_PX / 2;
  const r = c - TRAIT_MARQUEUR_PX - DEBORD_DU_LISERE_PX;
  doubleTrait(ctx, () => ctx.arc(c, c, r, Math.PI * 0.15, Math.PI * 0.85));
  return canvas;
}

/**
 * Un REPÈRE de zone : une croix fine avec un vide au centre.
 *
 * Le vide au centre est ce qui en fait un repère et non une cible : on montre
 * un endroit du sol, on ne le recouvre pas.
 */
export function cuireRepere(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = fabriquer(COTE_MARQUEUR_PX, COTE_MARQUEUR_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = COTE_MARQUEUR_PX / 2;
  const vide = COTE_MARQUEUR_PX * 0.18;
  const bout = c - TRAIT_MARQUEUR_PX - DEBORD_DU_LISERE_PX;
  doubleTrait(ctx, () => {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(c + dx * vide, c + dy * vide);
      ctx.lineTo(c + dx * bout, c + dy * bout);
    }
  });
  return canvas;
}

/**
 * Taille d'un marqueur À L'ÉCRAN, en pixels, quel que soit le zoom.
 *
 * Dix-huit : de quoi entourer une tige de dix pixels sans l'effacer, et de
 * quoi rester visible sur un houppier de deux cents.
 */
export const TAILLE_MARQUEUR_PX = 18;

/**
 * De combien un marqueur se pose AU-DESSUS du pied de l'arbre, en pixels.
 *
 * Au pied, un marqueur passe sous le houppier de la tige de devant — la
 * profondeur du tri le met derrière tout ce qui est plus proche. Une dizaine de
 * pixels le sort de la mêlée sans le décoller de son sujet.
 */
export const HAUTEUR_DU_MARQUEUR_PX = 12;

/**
 * Opacité d'un marqueur.
 *
 * Pas tout à fait opaque : on doit voir CE QU'IL MONTRE à travers. Un repère
 * qui masque son sujet répond à la mauvaise question — le joueur ne cherche pas
 * le marqueur, il cherche l'arbre.
 */
export const OPACITE_DU_MARQUEUR = 0.88;
