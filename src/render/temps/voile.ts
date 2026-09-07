/**
 * Le VOILE d'un geste de zone : le travail qui passe sur le sol
 * (docs/interface-visuelle.md §5.11, §6.2).
 *
 * **Ce que le moteur donne, et c'est peu mais c'est exact.** Un `GesteSurZone`
 * porte un type et les cellules RÉELLEMENT touchées — « chauler, ces
 * 214 cellules ». Rien d'autre : ni ordre de passage, ni durée, ni engin. Le
 * rendu n'a donc pas à deviner un itinéraire de tracteur, et il ne le fera
 * pas ; il a à montrer que ces cellules-là viennent d'être travaillées.
 *
 * **Le voile ne laisse RIEN derrière lui, et c'est la règle qui tient tout le
 * module.** Ce qu'un chaulage change durablement — la teinte du sol, l'herbe
 * fauchée, la litière du broyat — est déjà dans les grilles de l'instantané,
 * donc dans la CUISSON du morceau de terrain. Si le voile persistait, la même
 * information serait dessinée deux fois par deux chemins différents, et le
 * §2.1 dit ce qui arrive alors : les deux copies divergent. Le voile est donc
 * un passage, et à la fin de l'acte son opacité est nulle PARTOUT. C'est une
 * propriété, pas une intention : elle se teste.
 *
 * **Pourquoi un front qui balaie et non un fondu d'ensemble.** Un fondu montre
 * qu'un état a changé ; un front montre qu'un TRAVAIL a eu lieu. Le second est
 * ce que le §6.2 demande (« un voile s'étale sur le disque traité ») et c'est
 * aussi le seul des deux qui distingue un geste du joueur d'un changement de
 * saison. Le front part du centre de gravité des cellules et s'éloigne : c'est
 * la lecture juste d'un épandage, acceptable pour une fauche, et pour une
 * clôture ça donne une ligne qui se pose depuis le milieu.
 *
 * Module **pur** : des nombres, aucun sprite, aucune couleur CSS.
 */

import type { GesteSurZone, GesteTypeZone } from "../../engine/actions";
import type { Teinte } from "../palette";

/**
 * Ce que chaque geste laisse voir au passage.
 *
 * **Une convention de rendu, et elle est à sa place ici.** Le moteur ne dit
 * pas de quelle couleur est un chaulage — il n'a pas de couleurs. Mais chaque
 * teinte ci-dessous nomme une matière que le geste met ou retire vraiment, et
 * c'est ce qui la rend justifiable : la poussière de chaux est blanche, le
 * broyat de feuillus est clair, une terre retournée est plus sombre que sa
 * surface, une herbe coupée est pâle. Deux gestes n'apportent rien — ramasser
 * du bois, poser une clôture — et prennent la teinte de ce qu'on y voit :
 * le sol remué par le passage, le bois des piquets.
 */
export const TEINTE_DU_GESTE: Record<GesteTypeZone, Teinte> = {
  chauler: { r: 236, g: 234, b: 226 },
  epandreBrf: { r: 152, g: 120, b: 80 },
  labourer: { r: 74, g: 57, b: 44 },
  faucher: { r: 202, g: 198, b: 152 },
  ramasserBoisMort: { r: 152, g: 146, b: 132 },
  cloturer: { r: 122, g: 110, b: 96 },
};

/**
 * Opacité du voile au passage du front.
 *
 * Assez pour qu'on voie le geste sur un sol déjà texturé, pas assez pour
 * effacer ce que le sol dit — le voile est un passage sur une information, pas
 * un remplacement de cette information.
 */
export const OPACITE_DU_VOILE = 0.62;

/**
 * Part de l'acte que le front met à couvrir la zone.
 *
 * Passé ce point, tout retombe ensemble. **Le premier jet faisait l'inverse —
 * une traîne courte derrière le front — et la capture a tranché** : ça donnait
 * un ANNEAU qui s'éloignait du centre, le centre étant redevenu nu derrière
 * lui. Ça se lit comme une onde de choc, pas comme un chaulage. Un geste de
 * zone n'est pas une onde qui traverse la parcelle : c'est un travail qui
 * COUVRE une surface, puis de la poussière qui retombe.
 */
export const PART_QUI_S_ETALE = 0.6;

/**
 * L'opacité d'une cellule de rang `rang` à l'avancement `avancement`.
 *
 * Deux temps : la cellule s'allume FRANCHEMENT quand le front l'atteint et
 * reste allumée — le travail est fait, on le voit — puis toute la zone retombe
 * ensemble sur la fin de l'acte. La levée est franche parce qu'un outil qui
 * passe est un événement ; la retombée est douce parce que la poussière qui
 * se dépose n'en est pas un.
 */
export function opaciteDuVoile(avancement: number, rang: number): number {
  if (avancement <= 0 || avancement >= 1) return 0;
  // L'instant où le front atteint ce rang. Le rang 1 — le bord de la zone —
  // est atteint à `PART_QUI_S_ETALE` exactement.
  if (avancement < rang * PART_QUI_S_ETALE) return 0;
  const retombee = avancement <= PART_QUI_S_ETALE ? 1 : (1 - avancement) / (1 - PART_QUI_S_ETALE);
  return OPACITE_DU_VOILE * retombee;
}

/** Une cellule à peindre, et avec quelle force. */
export interface CelluleVoilee {
  /** indice `y * coteM + x`, celui du moteur */
  cellule: number;
  teinte: Teinte;
  opacite: number;
}

/**
 * Le rang de chaque cellule dans le balayage, ∈ [0,1].
 *
 * **Calculé une fois par acte et non par image** : c'est un tri, et un tri par
 * image sur un hectare fauché coûterait plus cher que tout le reste de la
 * pose. La fonction rend un tableau parallèle à `geste.cellules`, dans le même
 * ordre, pour que le lecteur n'ait rien à réindexer.
 */
export function rangsDuBalayage(geste: GesteSurZone, coteM: number): Float32Array {
  const n = geste.cellules.length;
  const rangs = new Float32Array(n);
  if (n === 0) return rangs;
  let sx = 0;
  let sy = 0;
  for (const c of geste.cellules) {
    sx += c % coteM;
    sy += Math.floor(c / coteM);
  }
  const cx = sx / n;
  const cy = sy / n;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const c = geste.cellules[i] ?? 0;
    const d = Math.hypot((c % coteM) - cx, Math.floor(c / coteM) - cy);
    rangs[i] = d;
    if (d > max) max = d;
  }
  // Une cellule seule, ou un geste sur une cellule unique : tout est au centre
  // et le balayage n'a pas de sens. On les allume ensemble, ce qui est la
  // lecture juste — il n'y a rien à balayer.
  if (max <= 0) return rangs;
  for (let i = 0; i < n; i++) rangs[i] = (rangs[i] ?? 0) / max;
  return rangs;
}

/**
 * Les cellules à peindre pour un geste de zone, à cet avancement.
 *
 * Ne rend que les cellules VISIBLES, ce qui n'est pas la même chose que
 * « toutes » : avant le front elles ne sont pas encore allumées, et après
 * l'acte plus aucune ne l'est. En pleine couverture, en revanche, elles y sont
 * toutes — c'est le prix de la lecture juste, et il est mesuré (§5.11).
 */
export function cellulesVoilees(
  geste: GesteSurZone,
  rangs: Float32Array,
  avancement: number,
): CelluleVoilee[] {
  const teinte = TEINTE_DU_GESTE[geste.type];
  const sorties: CelluleVoilee[] = [];
  for (let i = 0; i < geste.cellules.length; i++) {
    const opacite = opaciteDuVoile(avancement, rangs[i] ?? 0);
    if (opacite <= 0) continue;
    sorties.push({ cellule: geste.cellules[i] ?? 0, teinte, opacite });
  }
  return sorties;
}
