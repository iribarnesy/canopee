/**
 * La mise en scène des cinq gestes qui touchent des ARBRES (§6.2) : couper,
 * éclaircir, élaguer, étêter, recéper.
 *
 * **Le §5.11 les marquait ❌ « il faudrait savoir ce qui TOMBE ».** Le moteur
 * le dit maintenant : `GesteSurArbres.retire` porte, par arbre, les deux
 * hauteurs, les deux bases de houppier, le diamètre et la direction de chute
 * quand une tige entière est tombée. Il n'y a plus rien à deviner, et ce module
 * ne devine rien — il ne fait qu'INTERPOLER entre deux états que le moteur
 * donne tous les deux.
 *
 * **Deux mises en scène, et c'est le moteur qui les sépare.** Un geste qui
 * couche une tige entière porte une `directionRad` ; un geste qui démonte une
 * charpente sur place n'en porte pas, « parce que le moteur n'y voit pas une
 * direction unique et n'en invente pas » (actions.ts). Le rendu suit ce
 * partage-là plutôt que le type du geste, exactement comme le §5.11 l'a fait
 * pour les gestes de zone :
 *
 * | ce que `retire` en dit | ce qu'on dessine |
 * |---|---|
 * | `directionRad` présent (`couper`, `eclaircir`, `receper`) | une TIGE ABATTUE pivote autour de sa coupe et se couche |
 * | pas de direction (`elaguer`, `trogner`) | l'arbre RESTE, et sa forme passe d'avant à après |
 *
 * **Ce qui tombe demande un arbre que l'instantané n'a plus.** Une tige abattue
 * quitte `state.trees` dans le même tick : le rendu reçoit son identifiant et ne
 * la trouve plus. D'où la tige abattue ci-dessous, reposée le temps de l'acte à
 * partir du seul `ArbreRetire` — c'est précisément pour ça que le moteur en
 * donne un enregistrement COMPLET plutôt qu'un delta.
 *
 * Module **pur** : pas de canvas, pas de DOM, pas d'horloge.
 */

import type { ArbreRetire } from "../../engine/actions";
import { getEspece } from "../../engine/especes";
import { DEBOUT, type Deformation } from "./chute";

/**
 * L'identifiant sous lequel une tige abattue se dessine.
 *
 * **Distinct de celui de l'arbre, et il le faut.** Un recépage laisse la souche
 * en jeu avec son identifiant : si la tige abattue portait le même, la scène
 * poserait deux sprites qu'elle ne saurait pas distinguer et la souche
 * tomberait avec la cépée. Négatif parce que les identifiants du moteur sont
 * des entiers positifs, donc la collision est impossible plutôt
 * qu'improbable ; et réversible, ce qui rend l'index lisible au débogage.
 */
export function idDeLaTige(idArbre: number): number {
  return -1 - idArbre;
}

/** L'identifiant d'arbre derrière celui d'une tige abattue. */
export function idDeLArbre(idTige: number): number {
  return -1 - idTige;
}

/** Vrai si cet identifiant est celui d'une tige abattue et non d'un arbre. */
export function estUneTige(id: number): boolean {
  return id < 0;
}

/**
 * Une tige abattue, telle qu'on la repose le temps de sa chute.
 *
 * Les noms de champs sont ceux qu'un arbre à poser attend (`heightM`,
 * `chandelle`) : la tige traverse le même adaptateur que les arbres de
 * l'instantané, et hérite donc de la même silhouette, de la même saison et de
 * la même palette. Un fût abattu qui ne ressemblerait pas à l'arbre qu'il était
 * une image plus tôt ferait un raccord visible.
 */
export interface TigeAbattue {
  id: number;
  especeId: string;
  x: number;
  y: number;
  /** ce qui est PARTI : la hauteur d'avant moins ce qui reste debout */
  heightM: number;
  /** base du houppier, comptée depuis la coupe */
  baseHouppierM: number;
  /** une tige fraîchement abattue porte encore son feuillage */
  chandelle: false;
  /** direction dans laquelle elle se couche, radians (0 = +x, sens trigo) */
  directionRad: number;
  /**
   * Hauteur de la coupe au-dessus du sol, m — le PIED de la tige.
   *
   * Zéro pour une coupe rase, la souche pour un recépage. C'est autour de ce
   * point que la tige pivote, et c'est là qu'il faut la poser : à fort zoom,
   * une souche de trente centimètres fait une vingtaine de pixels, et une tige
   * qui pivoterait au ras du sol traverserait sa propre souche.
   */
  hauteurDeCoupeM: number;
}

/**
 * La tige qu'un geste a couchée, s'il en a couché une.
 *
 * Rend `undefined` quand le moteur ne donne pas de direction — un élagage, un
 * étêtage — parce qu'alors rien ne tombe d'un seul tenant : la charpente est
 * démontée sur place, et l'inventer se verrait.
 */
export function tigeAbattueDe(retire: ArbreRetire): TigeAbattue | undefined {
  if (retire.directionRad === undefined) return undefined;
  const partie = retire.hauteurAvantM - retire.hauteurApresM;
  // Une tige de hauteur nulle ou négative n'a rien à montrer. Le moteur ne
  // devrait pas en produire ; une scène tronquée, si.
  if (partie <= 0) return undefined;
  return {
    id: idDeLaTige(retire.id),
    especeId: retire.especeId,
    x: retire.x,
    y: retire.y,
    heightM: partie,
    // La base du houppier est comptée depuis le pied de la TIGE, donc depuis
    // la coupe : une cépée recépée à trente centimètres emporte son houppier
    // trente centimètres plus bas qu'il n'était sur l'arbre.
    baseHouppierM: Math.max(0, retire.baseHouppierAvantM - retire.hauteurApresM),
    chandelle: false,
    directionRad: retire.directionRad,
    hauteurDeCoupeM: Math.max(0, retire.hauteurApresM),
  };
}

/**
 * La forme d'un arbre qui RESTE debout, à un instant de son acte.
 *
 * Les deux champs remplacent ceux de l'arbre avant qu'on en calcule la classe
 * de vignette : ils vont donc à la CUISSON, comme l'état d'un mourant. Le coût
 * reste borné par la quantification de la classe — un élagage ne traverse que
 * les quelques paliers de base de houppier qui existent déjà.
 */
export interface ArbreRemodele {
  heightM?: number;
  baseHouppierM?: number;
  /**
   * Fruits encore sur l'arbre et pas encore partis, kg — À AJOUTER à ce que
   * l'instantané porte.
   *
   * Ajouté et non posé, parce que le lecteur ne connaît pas l'instantané : il
   * sait ce que le geste a enlevé (`masseKg`), pas ce qui restait. À
   * l'avancement 0 la charge d'avant la récolte est donc reconstituée, et à 1
   * l'apport tombe à zéro — l'arbre reprend exactement la valeur du moteur,
   * sans copie.
   */
  fruitsKgEnPlus?: number;
  /**
   * Âge de l'écorce, semaines — POSÉ, lui, parce que c'est une grandeur
   * absolue dont le geste connaît les deux bouts : l'écorce était refaite
   * avant (le moteur refuse la levée autrement), elle est à vif après.
   */
  semainesDepuisLevee?: number;
}

/**
 * Où en est la forme d'un arbre entre AVANT et APRÈS le geste.
 *
 * `avancement` va de 0 (l'arbre tel qu'il était) à 1 (tel que l'instantané le
 * décrit). C'est l'inverse d'une animation ordinaire, et c'est voulu : le jeu
 * ne reçoit que l'état d'ARRIVÉE, donc la mise en scène consiste à remonter le
 * temps au début de l'acte et à redescendre. La même inversion que le §6.3
 * applique aux morts.
 *
 * Rend `undefined` pour un geste qui a couché la tige entière : il n'y a plus
 * d'arbre à remodeler, c'est la tige abattue qui raconte.
 */
export function remodelageEnCours(
  retire: ArbreRetire,
  avancement: number,
): ArbreRemodele | undefined {
  if (retire.directionRad !== undefined && retire.hauteurApresM <= 0) return undefined;
  const a = Math.min(1, Math.max(0, avancement));
  return {
    heightM: entre(retire.hauteurAvantM, retire.hauteurApresM, a),
    baseHouppierM: entre(retire.baseHouppierAvantM, retire.baseHouppierApresM, a),
  };
}

/**
 * Interpolation d'une grandeur, du début à la fin de l'acte.
 *
 * Linéaire, et ça suffit : une tronçonneuse ne fait pas de courbe d'inertie.
 * Ce qui accélère, c'est ce qui TOMBE (`chute.ts`), et c'est la gravité qui le
 * justifie — une bille sciée descend, un houppier démonté ne descend pas.
 */
function entre(avant: number, apres: number, avancement: number): number {
  // Les deux bouts sont rendus TELS QUELS, et ce n'est pas de la coquetterie :
  // `9 + (0.3 - 9) * 1` vaut 0,300 000 000 000 000 7, et la classe de vignette
  // est quantifiée. Un dernier pas qui rate l'état d'arrivée d'un
  // quadrillionième peut basculer un palier, et l'arbre changerait de dessin en
  // rendant la main à l'instantané.
  if (avancement <= 0) return avant;
  if (avancement >= 1) return apres;
  return avant + (apres - avant) * avancement;
}

/**
 * Les trois gestes qui ne démontent rien : plantation, récolte, démasclage.
 *
 * **Ils n'ont pas d'`ArbreRetire`, et c'est le moteur qui le dit** : « un arbre
 * planté, récolté ou démasclé garde sa géométrie — planter l'AJOUTE, récolter
 * vide `fruitsKg`, démascler n'enlève que l'écorce » (actions.ts). Il n'y a
 * donc pas de tige à coucher ni de charpente à remonter : ce qui bouge est un
 * STOCK, et le geste porte sa masse (`masseKg`).
 *
 * Les deux canaux se répartissent selon ce que la classe de vignette contient
 * déjà : `fruit` et `liege` en font partie (`couches/arbres.ts`), donc récolte
 * et démasclage sont des CUISSONS — comme l'élagage, et pour la même raison.
 * La plantation, elle, ne change aucune clé : un plant est un arbre de plus,
 * qu'on fait simplement grandir à l'écran. C'est une POSE.
 */

/**
 * Ce qu'il reste de fruits sur l'arbre pendant que la récolte se fait.
 *
 * Décroît de la masse récoltée vers zéro : au début la couronne porte encore
 * tout, à la fin l'instantané reprend la main. Le §6.2 demande « les fruits
 * quittent la couronne » — ils la quittent donc progressivement, et non d'un
 * seul tick.
 */
export function recolteEnCours(masseKg: number, avancement: number): ArbreRemodele {
  const a = Math.min(1, Math.max(0, avancement));
  // Le zéro est rendu TEL QUEL, comme les bouts d'`entre` : un reliquat d'un
  // milliardième de kilo garderait la classe `FRUIT_MUR` et l'arbre resterait
  // chargé alors que la récolte est finie.
  return { fruitsKgEnPlus: a >= 1 ? 0 : masseKg * (1 - a) };
}

/**
 * Où en est l'écorce pendant un démasclage.
 *
 * **Les deux bouts viennent du moteur, aucun n'est inventé.** L'arrivée est
 * zéro : l'instantané d'après porte une écorce à vif. Le départ est la rotation
 * de l'espèce, parce que `ecorceRecoltable` n'autorise la levée que lorsque
 * l'écorce est refaite — c'est donc l'état où l'arbre se trouvait forcément
 * juste avant, et non une valeur choisie pour faire joli.
 *
 * Rend `undefined` pour une espèce sans écorce à lever : le moteur ne devrait
 * pas produire le geste, et une teinte de liège sur un hêtre se verrait.
 */
export function demasclageEnCours(especeId: string, avancement: number): ArbreRemodele | undefined {
  const rotationAns = getEspece(especeId)?.ecorce?.rotationAns;
  if (!rotationAns) return undefined;
  const a = Math.min(1, Math.max(0, avancement));
  return { semainesDepuisLevee: a >= 1 ? 0 : rotationAns * 52 * (1 - a) };
}

/**
 * La pose d'un plant qui vient d'être mis en terre.
 *
 * Il sort de terre plutôt qu'il n'apparaît : `hauteur` monte de zéro à un, et
 * l'opacité suit pour que le premier pixel ne soit pas un trait noir. C'est
 * l'exact inverse de l'effacement d'un mort (§6.3), et ça se compose avec lui
 * par `combiner` — un plant plantéepuis broyé la même semaine montrerait les
 * deux.
 *
 * Le §6.2 demande aussi « la terre est retournée autour ». Elle ne l'est pas :
 * `planter` ne rapporte que des identifiants, pas la maille de sol travaillée,
 * et poser un disque au jugé serait inventer un rayon que le moteur n'a pas
 * donné. Dit dans #114 plutôt que comblé.
 */
export function poseDeLaPlantation(avancement: number): Deformation {
  const a = Math.min(1, Math.max(0, avancement));
  if (a >= 1) return DEBOUT;
  // Un plant de hauteur nulle ne se dessine pas du tout ; on part d'un dixième
  // pour qu'il y ait quelque chose à voir dès la première image.
  return { rotationRad: 0, hauteur: 0.1 + 0.9 * a, opacite: a };
}
