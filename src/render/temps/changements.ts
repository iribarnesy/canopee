/**
 * Le CALQUE DES CHANGEMENTS : un doigt qui montre où la parcelle a changé
 * (docs/interface-visuelle.md §6.8 №1).
 *
 * **Ce module existe parce qu'une mesure l'a rendu nécessaire, pas parce que le
 * cahier le prévoyait.** Le §6.8 le rangeait au repli de l'animation, pour
 * quand celle-ci déborde : mille morts ne tiennent pas dans deux secondes. Or
 * en jouant enfin le VRAI journal du moteur, une ellipse entière de la friche
 * de référence ne change que 196 pixels sur 880 000 — 0,02 % de l'image.
 * Quarante-cinq morts et cinquante-quatre chutes sont bien jouées, et
 * invisibles : deux mille huit cents tiges de dix pixels, ça ne se compare pas.
 *
 * Le problème est donc SYMÉTRIQUE de celui que le §6.8 anticipait. À grande
 * vitesse il y a trop à montrer ; à vitesse normale il y en a trop peu pour
 * qu'on le TROUVE. Dans les deux cas, il faut quelque chose qui pointe.
 *
 * **Ce qui distingue un marqueur d'un objet du monde, et c'est tout ce qui
 * compte ici** : un marqueur a une taille en PIXELS, pas en mètres. Il ne
 * grandit pas quand on zoome, il ne se cache pas derrière un houppier, il ne
 * se confond avec rien de ce que la simulation contient. C'est de l'interface
 * posée sur la carte, et ça doit se voir comme tel — sans quoi on aurait
 * ajouté un objet de plus à une scène qui en a déjà trois mille.
 *
 * **Les positions viennent du journal et de nulle part ailleurs.** Une mort
 * porte ses coordonnées ; un geste sur arbres porte des identifiants, dont
 * l'appelant connaît les positions ; un geste de zone porte ses cellules. Le
 * rendu ne cherche donc rien : il place ce que le moteur nomme.
 *
 * Module **pur** : des positions et des teintes, aucun sprite.
 */

import { estGesteSurZone, type GesteVisible } from "../../engine/actions";
import type { CauseMort } from "../../engine/trees";
import type { Teinte } from "../palette";
import type { JournalDeSemaine } from "./ellipse";

/**
 * Ce qu'un marqueur montre. La forme dit la NATURE du changement, la teinte
 * en dit la cause — deux canaux, parce qu'un halo roux et un liseré roux ne
 * racontent pas la même chose.
 */
export type SorteDeMarqueur =
  /** un arbre est mort : un halo, teinté par la cause */
  | "halo"
  /** un arbre a été touché par un geste : un liseré */
  | "liseré"
  /** une zone a été travaillée : un repère à son centre */
  | "zone";

export interface Marqueur {
  /** position en mètres de parcelle */
  x: number;
  y: number;
  sorte: SorteDeMarqueur;
  teinte: Teinte;
}

/**
 * La teinte de chaque cause de mort.
 *
 * **Cinq viennent du §6.8 mot pour mot** — « roux = sécheresse, bleu-violet =
 * engorgement, gris = ombre, noir = feu, brun = vieillesse » — et les sept
 * autres sont choisies dans le même esprit : la teinte nomme la matière ou
 * l'agent, jamais une gravité. Un marqueur ne classe pas les morts en bonnes
 * et mauvaises, il dit de quoi il s'agit.
 *
 * Les trois morts d'origine ANIMALE partagent une famille de fauve — le gibier
 * est un seul agent, qu'il broute, frotte ou écrase par une chute —, et les
 * deux morts d'origine HUMAINE (le labour) reprennent la teinte du geste
 * correspondant, pour qu'un labour et sa mort se lisent comme un seul
 * événement.
 */
export const TEINTE_DE_LA_CAUSE: Record<CauseMort, Teinte> = {
  secheresse: { r: 198, g: 104, b: 48 },
  engorgement: { r: 96, g: 92, b: 176 },
  ombre: { r: 148, g: 150, b: 148 },
  vieillesse: { r: 124, g: 92, b: 62 },
  feu: { r: 28, g: 24, b: 22 },
  // La chlorose : le jaune qu'elle met dans les feuilles.
  solHorsGamme: { r: 214, g: 196, b: 72 },
  // Les insectes : le vert malade d'une couronne mangée.
  ravageurs: { r: 124, g: 156, b: 74 },
  // Le chancre : le mauve brun d'un bois qui se dessèche sur pied.
  maladie: { r: 150, g: 104, b: 126 },
  // Les trois du gibier, une seule famille de fauve.
  abroutissement: { r: 206, g: 158, b: 92 },
  frottis: { r: 184, g: 132, b: 68 },
  ecrasement: { r: 158, g: 140, b: 108 },
  // Le labour : la terre retournée, la même que son voile.
  labour: { r: 74, g: 57, b: 44 },
};

/** La teinte d'un geste — celle du travail, pas celle d'une cause. */
export const TEINTE_DU_MARQUEUR_DE_GESTE: Teinte = { r: 236, g: 232, b: 210 };

/** Ce que le calque montre, et ce qu'il a renoncé à montrer. */
export interface Calque {
  marqueurs: Marqueur[];
  /**
   * Combien de changements le calque a renoncé à pointer.
   *
   * **Le même aveu que `PlanDEllipse.deborde`, et pour la même raison** : un
   * calque qui rendrait huit mille repères ne dirait pas « voilà où », il
   * remplacerait la parcelle par un tapis. Quand ce nombre n'est pas nul, c'est
   * le bilan de période (§6.8 №2) qui est le bon outil — « 2 004 tiges
   * broutées » en trois mots plutôt qu'en deux mille repères.
   */
  omis: number;
}

/**
 * Les marqueurs d'un journal.
 *
 * `positionDe` rend la position d'un arbre par identifiant : les gestes sur
 * arbres n'en portent pas, et c'est l'appelant qui tient la liste des tiges.
 * Un identifiant inconnu est SAUTÉ et non placé à l'origine — un marqueur au
 * coin de la parcelle montrerait un endroit où rien ne s'est passé.
 *
 * Un geste de ZONE ne rend qu'UN marqueur, à son centre de gravité : c'est un
 * événement, pas mille. Un chaulage de deux cents cellules avec deux cents
 * repères ne montrerait plus rien.
 *
 * **Un geste qui touche presque tout n'est pas un changement à pointer**, et
 * c'est la mesure qui l'a appris : sur la friche de référence, une semaine
 * porte quatre gestes de `brouter` de deux mille tiges chacun. Le premier jet
 * en faisait huit mille liserés — le calque couvrait la parcelle entière et ne
 * montrait donc rien. Ce n'est pas huit mille événements, c'est « le gibier a
 * brouté partout, encore », et ça se dit en trois mots. Au-delà de
 * `TIGES_PAR_GESTE_MAX`, le geste n'est donc pas pointé du tout et compte dans
 * `omis`.
 */
export function marqueursDuJournal(
  journal: JournalDeSemaine,
  positionDe: (idArbre: number) => { x: number; y: number } | undefined,
  coteM: number,
  plafond = PLAFOND_DE_MARQUEURS,
): Calque {
  const marqueurs: Marqueur[] = [];
  let omis = 0;
  for (const m of journal.morts ?? []) {
    marqueurs.push({ x: m.x, y: m.y, sorte: "halo", teinte: TEINTE_DE_LA_CAUSE[m.cause] });
  }
  for (const geste of journal.gestes ?? []) {
    if (estGesteSurZone(geste)) {
      const centre = centreDesCellules(geste.cellules, coteM);
      if (centre) {
        marqueurs.push({ ...centre, sorte: "zone", teinte: TEINTE_DU_MARQUEUR_DE_GESTE });
      }
      continue;
    }
    if (geste.ids.length > TIGES_PAR_GESTE_MAX) {
      omis += geste.ids.length;
      continue;
    }
    for (const id of geste.ids) {
      const p = positionDe(id);
      if (p) {
        marqueurs.push({ x: p.x, y: p.y, sorte: "liseré", teinte: TEINTE_DU_MARQUEUR_DE_GESTE });
      }
    }
  }
  // Les chandelles qui tombent ne sont PAS marquées, et c'est un choix : une
  // chute est le seul changement de la liste qu'on VOIT — c'est un mouvement de
  // vingt mètres. La marquer ajouterait un repère là où l'œil va déjà.
  if (marqueurs.length <= plafond) return { marqueurs, omis };
  // Le plafond s'applique ICI et pas seulement à l'accumulation : un seul
  // journal suffit à couvrir la carte, et le premier jet ne bornait que
  // l'empilement de plusieurs.
  return {
    marqueurs: marqueurs.slice(marqueurs.length - plafond),
    omis: omis + marqueurs.length - plafond,
  };
}

/**
 * Au-delà de combien de tiges un geste n'est plus pointé tige par tige.
 *
 * Vingt-quatre : l'ordre de grandeur d'un chantier du JOUEUR — une éclaircie,
 * un élagage d'une rangée, une récolte. Au-delà, c'est un phénomène et non un
 * chantier : le gibier qui broute un hectare, un feu qui traverse. Le §6.8 ne
 * liste d'ailleurs que des gestes de joueur pour le liseré — « récoltés,
 * coupés, élagués, trognés » — et le broutage n'y est pas.
 */
export const TIGES_PAR_GESTE_MAX = 24;

/** Le centre de gravité d'un ensemble de cellules, en mètres. */
export function centreDesCellules(
  cellules: readonly number[],
  coteM: number,
): { x: number; y: number } | undefined {
  if (cellules.length === 0) return undefined;
  let sx = 0;
  let sy = 0;
  for (const c of cellules) {
    sx += (c % coteM) + 0.5;
    sy += Math.floor(c / coteM) + 0.5;
  }
  return { x: sx / cellules.length, y: sy / cellules.length };
}

/**
 * Fusionne les marqueurs de plusieurs journaux, en gardant l'ORDRE d'arrivée.
 *
 * **Ils s'accumulent, et c'est la demande littérale du §6.8** : « les marqueurs
 * s'accumulent tant qu'on avance vite, et ne s'effacent qu'à la pause ».
 * Franchir dix ans à grande vitesse, c'est empiler dix ans de repères — ce qui
 * est exactement ce qu'on veut lire d'un coup d'œil en s'arrêtant.
 */
export function accumuler(
  deja: readonly Marqueur[],
  nouveaux: readonly Marqueur[],
  plafond = PLAFOND_DE_MARQUEURS,
): Marqueur[] {
  const tout = [...deja, ...nouveaux];
  // Les plus RÉCENTS sont gardés : au-delà du plafond, ce qui compte est ce qui
  // vient de se passer. Tronquer par le début garderait dix ans de vieux
  // repères et cacherait la semaine en cours.
  return tout.length <= plafond ? tout : tout.slice(tout.length - plafond);
}

/**
 * Combien de marqueurs au plus.
 *
 * **Un plafond de LISIBILITÉ avant d'être un plafond de coût.** Deux mille
 * repères sur un hectare, c'est un tapis : le calque ne montre plus rien, il
 * remplace la parcelle. Quand il est atteint, c'est que le bilan de période
 * (§6.8 №2) est le bon outil et pas celui-ci — et l'appelant peut le savoir en
 * comparant ce qu'il a envoyé à ce qu'il récupère.
 */
export const PLAFOND_DE_MARQUEURS = 400;
