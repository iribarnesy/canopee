/**
 * Les quatre formes du feu, cuites une fois pour la partie
 * (docs/interface-visuelle.md §6.4).
 *
 * **En blanc, comme le losange du voile et les marqueurs du calque, et pour la
 * même raison** : la teinte arrive à la pose par le `tint` de Pixi. Une langue
 * de flamme blanche multipliée par de l'orange donne une flamme, multipliée par
 * du presque-blanc donne un cœur, et le dégradé de température d'un feu ne coûte
 * donc pas une texture de plus.
 *
 * **Tout est fait de TACHES et non de contours, et c'est la décision qui
 * compte.** Une flamme tracée au bézier a un bord net, et un bord net se lit
 * comme du carton découpé quel que soit le mouvement qu'on lui donne. Une
 * flamme est un dégradé : on l'obtient en empilant des dégradés radiaux le long
 * d'un axe qui s'affine, en mode `lighter` pour que les recouvrements
 * s'additionnent — ce qui fabrique tout seul un cœur chaud au pied de la langue
 * et une pointe qui se dissout. Le même procédé donne une bouffée de fumée, à
 * ceci près que ses taches sont dispersées au lieu d'être alignées.
 *
 * Aucun `ctx.filter` : le flou de Canvas n'est pas rendu de la même façon d'un
 * navigateur à l'autre, et il coûte cher. Un empilement de dégradés le remplace
 * exactement, et il se cuit une fois.
 */

/** Encombrement d'une langue de flamme, en pixels de texture. */
export const LARGEUR_FLAMME_PX = 48;
export const HAUTEUR_FLAMME_PX = 72;

/** Côté des textures carrées : la lueur, la bouffée, la braise. */
export const COTE_LUEUR_PX = 96;
export const COTE_BOUFFEE_PX = 96;
export const COTE_BRAISE_PX = 24;

/** Combien de taches composent une langue de flamme. */
const NOEUDS_DE_LA_LANGUE = 12;

/** Pose une tache ronde et fondue de blanc, d'opacité `a` au centre. */
function tache(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: number): void {
  if (r <= 0 || a <= 0) return;
  const d = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  // Quatre arrêts et non deux : une descente linéaire d'opacité laisse un
  // cerne visible au bord de la tache, parce que l'œil dérive deux fois une
  // rampe droite. Ces arrêts-là donnent une décroissance qui s'aplatit.
  d.addColorStop(0, `rgba(255,255,255,${a})`);
  d.addColorStop(0.42, `rgba(255,255,255,${a * 0.62})`);
  d.addColorStop(0.72, `rgba(255,255,255,${a * 0.22})`);
  d.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = d;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Une LANGUE de flamme : des taches empilées le long d'un axe qui s'affine.
 *
 * Trois variantes, parce qu'une ligne de flammes faite d'une seule image se lit
 * comme un tampon répété — et à cent soixante langues par image, un tampon se
 * remarque. Les variantes ne diffèrent que par la courbure de l'axe : c'est
 * assez pour casser la répétition, et ça garde une silhouette de famille.
 *
 * La langue est cuite le PIED EN BAS de la texture : c'est là qu'elle est
 * ancrée à la pose, sur le point de sol de sa cellule.
 */
export function cuireFlamme(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  variante: number,
): HTMLCanvasElement {
  const canvas = fabriquer(LARGEUR_FLAMME_PX, HAUTEUR_FLAMME_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  // `lighter` : deux taches qui se recouvrent s'additionnent. C'est ce qui
  // fabrique le cœur brûlant au pied de la langue sans qu'on ait à le dessiner.
  ctx.globalCompositeOperation = "lighter";
  const courbure = 0.16 + 0.12 * (variante % 3);
  const sens = variante % 2 === 0 ? 1 : -1;
  for (let i = 0; i < NOEUDS_DE_LA_LANGUE; i++) {
    // 0 au pied, 1 à la pointe.
    const t = i / (NOEUDS_DE_LA_LANGUE - 1);
    // L'axe part droit et se couche vers la pointe : une flamme qui monte est
    // tordue par son propre tirage, et une langue parfaitement verticale a
    // l'air d'une bougie.
    const cx = LARGEUR_FLAMME_PX / 2 + sens * courbure * LARGEUR_FLAMME_PX * t ** 1.8;
    const cy = HAUTEUR_FLAMME_PX * (1 - 0.94 * t) - 2;
    // Le rayon s'affine vite : c'est ce qui donne la pointe.
    const r = (LARGEUR_FLAMME_PX / 2) * (1 - 0.86 * t ** 1.15);
    // Et l'opacité tombe, sinon la pointe reste aussi dense que le pied et la
    // langue se lit comme un doigt.
    tache(ctx, cx, cy, r, 0.34 * (1 - 0.72 * t ** 1.4));
  }
  return canvas;
}

/**
 * La LUEUR posée au sol autour de ce qui brûle : un seul dégradé, très étalé.
 *
 * **C'est la particule la plus utile du lot, et la moins spectaculaire.** Sans
 * elle, les flammes flottent sur un sol qu'elles n'éclairent pas, et un feu qui
 * n'éclaire rien ne ressemble à rien. Elle est posée en `add` : de la lumière
 * s'ajoute, elle ne recouvre pas.
 */
export function cuireLueur(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = fabriquer(COTE_LUEUR_PX, COTE_LUEUR_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = COTE_LUEUR_PX / 2;
  tache(ctx, c, c, c, 0.9);
  return canvas;
}

/**
 * Une BOUFFÉE de fumée : cinq taches dispersées, en opacité normale.
 *
 * **Pas un dégradé radial unique**, et le premier jet l'a essayé : un rond
 * fondu se lit comme une bulle, et neuf bulles par colonne comme un chapelet de
 * ballons. Ce qui fait la fumée, c'est le grumeau — un nuage a des bosses, et
 * ce sont ses bosses qui disent qu'il roule. Cinq taches décalées suffisent, à
 * condition qu'elles ne soient pas concentriques.
 *
 * En opacité NORMALE et non `lighter`, à la différence des trois autres : la
 * fumée est la seule chose de ce lot qui masque ce qu'elle survole.
 */
export function cuireBouffee(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  variante: number,
): HTMLCanvasElement {
  const canvas = fabriquer(COTE_BOUFFEE_PX, COTE_BOUFFEE_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = COTE_BOUFFEE_PX / 2;
  // Cinq bosses réparties sur un cercle, plus une au centre. Le décalage
  // angulaire par variante suffit à donner trois nuages différents.
  const bosses = 5;
  const depart = (variante % 3) * ((Math.PI * 2) / (bosses * 3));
  tache(ctx, c, c, c * 0.56, 0.5);
  for (let i = 0; i < bosses; i++) {
    const angle = depart + (i / bosses) * Math.PI * 2;
    // Le rayon des bosses alterne : des bosses égales redonnent une fleur
    // régulière, ce qui est un motif et non un nuage.
    const rayon = c * (i % 2 === 0 ? 0.36 : 0.28);
    tache(ctx, c + Math.cos(angle) * c * 0.34, c + Math.sin(angle) * c * 0.3, rayon, 0.42);
  }
  return canvas;
}

/**
 * Une BRAISE : une tache serrée avec un halo.
 *
 * Deux taches, l'une dans l'autre : sans le halo, une braise réduite à cinq
 * pixels à l'écran devient un point dur, et cent points durs se lisent comme
 * de la poussière sur l'écran plutôt que comme des étincelles.
 */
export function cuireBraise(
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = fabriquer(COTE_BRAISE_PX, COTE_BRAISE_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.globalCompositeOperation = "lighter";
  const c = COTE_BRAISE_PX / 2;
  tache(ctx, c, c, c, 0.35);
  tache(ctx, c, c, c * 0.34, 0.95);
  return canvas;
}
