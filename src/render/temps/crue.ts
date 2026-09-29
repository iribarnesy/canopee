/**
 * **La crue qui passe** : l'eau qui traverse la parcelle, et le sens dans
 * lequel elle va (docs/interface-visuelle.md §9, lot L7 ; #127).
 *
 * ── **ce que le moteur donne, et ce qu'il ne donne pas** ─────────────────────
 *
 * Il n'existe pas d'`IncendieResult` de la crue : pas d'événement daté, pas
 * d'emprise, pas de hauteur de montée, pas de victimes nommées. Ce qui existe
 * est une grandeur **de la semaine**, et le moteur dit lui-même ce qu'elle
 * vaut : `TickResult.debordementParCellule`, « ce qui n'a pas pu rentrer dans
 * le sol de chaque cellule cette semaine — **la seule base honnête pour une
 * crue, une lame d'eau ou une ravine** ».
 *
 * Ce module s'en tient là. Il ne déduit rien d'un écart entre deux
 * instantanés — ce serait la faute que l'issue nomme —, il montre l'eau **de
 * cette semaine-là**, et il laisse au moteur ce qui manque encore : la montée,
 * le retrait, et qui s'est noyé (issue ouverte).
 *
 * ── **pourquoi un passage et non une couche de plus** ────────────────────────
 *
 * La lame d'eau est **déjà dessinée** : le terrain la cuit dans ses morceaux
 * (`couleurInondee`), à sa profondeur, et c'est l'état. En redessiner une
 * seconde par-dessus mettrait la même information sur deux chemins, et le §2.1
 * dit ce qui leur arrive. Ce module ne dessine donc pas de l'eau : il dessine
 * son **mouvement**, une onde qui descend la parcelle et ne laisse rien
 * derrière elle — la même règle que le voile d'un geste, et elle se teste.
 *
 * ── **le sens de l'eau vient du moteur** ────────────────────────────────────
 *
 * `ordreDeDescente` est la fonction que le moteur emploie pour faire cascader
 * son ruissellement, du plus haut au plus bas. On l'appelle, on ne la recopie
 * pas : le jour où le routage changera, l'onde suivra.
 *
 * Module **pur** : des nombres et des teintes, aucun sprite, aucun canvas.
 */

import { ordreDeDescente } from "../../engine/relief";
import type { Teinte } from "../palette";
import { couleurEau, DEBORDEMENT_PLEIN_MM, estInondee, melange } from "../palette";
import type { CelluleVoilee } from "./voile";

/**
 * La crue d'une semaine : les cellules noyées, dans l'ordre où l'eau les
 * atteint.
 *
 * `rangs` est **normalisé** entre 0 et 1, pour que l'onde se joue de la même
 * façon sur une parcelle d'un hectare et sur un mouchoir de poche : c'est un
 * avancement, pas une distance.
 */
export interface CrueDeLaSemaine {
  /** indices de cellule `y * coteM + x`, rangés du haut vers le bas du versant */
  cellules: readonly number[];
  /** ce que chacune a refusé cette semaine, mm — même ordre */
  lamesMm: readonly number[];
  /** quand l'onde atteint chacune ∈ [0,1] — même ordre */
  rangs: readonly number[];
}

/**
 * Dénivelé en deçà duquel on considère qu'il n'y a **pas** de sens de
 * l'écoulement, m.
 *
 * Cinq centimètres sur toutes les cellules noyées : en dessous, la parcelle est
 * plate là où l'eau est, et faire courir une onde d'un bord à l'autre
 * inventerait une direction que le terrain ne donne pas. L'eau monte alors
 * partout à la fois, ce qui est exactement ce qu'on voit d'une flaque de plat.
 */
export const DENIVELE_SANS_SENS_M = 0.05;

/**
 * Largeur du front de l'onde, en part de l'acte.
 *
 * Un tiers : assez large pour qu'on voie une vague et non une ligne, assez
 * étroit pour qu'on lise un sens. C'est aussi ce qui garantit que l'onde a fini
 * de passer **partout** à la fin de l'acte — le front va jusqu'à `1 + largeur`,
 * donc la dernière cellule est retombée à zéro quand l'acte se termine.
 */
export const LARGEUR_DU_FRONT = 0.34;

/** Opacité au passage de l'onde, sur une cellule au débordement plein. */
export const OPACITE_DE_LONDE = 0.62;

/**
 * De combien l'onde **éclaircit** l'eau de la saison.
 *
 * **Mesuré, et c'est ce qui a décidé de la valeur.** Une onde de la couleur de
 * l'eau, posée sur une lame déjà cuite de cette même couleur, ne se voit pas :
 * sur le banc, à parcelle entièrement noyée, elle ne touchait que 900 pixels sur
 * 880 000. Ce qu'on montre n'est pas de l'eau de plus — elle est déjà là — c'est
 * un **mouvement**, et un mouvement d'eau se voit à ses reflets : la lumière qui
 * court sur une lame en écoulement. D'où un clair, et non un bleu de plus.
 */
export const ECLAT_DE_LONDE = 0.5;

/** Le clair que l'onde emprunte à la lumière du jour. */
const REFLET: Teinte = { r: 236, g: 244, b: 248 };

/**
 * La crue de la semaine, telle que l'instantané la donne — ou rien.
 *
 * `undefined` quand aucune cellule n'est noyée, et c'est le cas ordinaire :
 * pas d'acte, pas de créneau pris dans l'ellipse. Le seuil de « noyée » n'est
 * pas choisi ici — c'est `estInondee`, celui-là même qui décide que le terrain
 * dessine une lame. Deux seuils pour une même question dériveraient (§2.1).
 */
export function crueDeLaSemaine(
  debordementMm: ArrayLike<number> | undefined,
  altitudesM: readonly number[],
): CrueDeLaSemaine | undefined {
  if (!debordementMm || debordementMm.length === 0) return undefined;
  const noyees: number[] = [];
  for (let i = 0; i < debordementMm.length; i++) {
    if (estInondee(debordementMm[i] ?? 0)) noyees.push(i);
  }
  if (noyees.length === 0) return undefined;

  // L'ordre du **moteur** : celui dans lequel il fait cascader son
  // ruissellement. On le restreint aux cellules noyées, en gardant leur rang
  // relatif — l'eau arrive là où elle passe, pas là où elle pourrait passer.
  const noyee = new Set(noyees);
  const descente = ordreDeDescente(altitudesM).filter((i) => noyee.has(i));
  const cellules = descente.length === noyees.length ? descente : noyees;

  let haut = Number.NEGATIVE_INFINITY;
  let bas = Number.POSITIVE_INFINITY;
  for (const i of cellules) {
    const z = altitudesM[i] ?? 0;
    haut = Math.max(haut, z);
    bas = Math.min(bas, z);
  }
  const plat = !(haut - bas > DENIVELE_SANS_SENS_M);
  const dernier = Math.max(1, cellules.length - 1);
  const lamesMm = cellules.map((i) => debordementMm[i] ?? 0);
  // Plate, la parcelle n'a pas de sens : tout monte ensemble. En pente, le rang
  // suit la descente, et c'est lui qui fait courir l'onde.
  const rangs = cellules.map((_, k) => (plat ? 0 : k / dernier));
  return { cellules, lamesMm, rangs };
}

/**
 * L'onde à un avancement donné de l'acte, sous la forme que la scène voile.
 *
 * **Vide à la fin, et c'est une propriété, pas une intention** : le front va
 * jusqu'à `1 + LARGEUR_DU_FRONT`, donc la dernière cellule est retombée à zéro
 * quand l'acte se termine. Ce qui reste à l'écran est la lame que le terrain a
 * cuite — l'état —, et rien de ce module.
 */
export function ondeDeLaCrue(
  crue: CrueDeLaSemaine | undefined,
  avancement: number,
  semaineAnnee: number,
): CelluleVoilee[] {
  if (!crue) return [];
  const t = Math.min(1, Math.max(0, avancement));
  const front = t * (1 + LARGEUR_DU_FRONT);
  const teinte = melange(couleurEau(semaineAnnee), REFLET, ECLAT_DE_LONDE);
  const sorties: CelluleVoilee[] = [];
  for (let k = 0; k < crue.cellules.length; k++) {
    const rang = crue.rangs[k] ?? 0;
    const ecart = Math.abs(front - rang);
    if (ecart >= LARGEUR_DU_FRONT) continue;
    // Une cellule qui reçoit un torrent brille plus qu'une flaque : la force de
    // l'onde suit la lame, sur l'échelle que le terrain emploie déjà.
    const force = Math.min(1, (crue.lamesMm[k] ?? 0) / DEBORDEMENT_PLEIN_MM);
    const opacite = OPACITE_DE_LONDE * (1 - ecart / LARGEUR_DU_FRONT) * (0.4 + 0.6 * force);
    if (opacite <= 0) continue;
    const cellule = crue.cellules[k];
    if (cellule === undefined) continue;
    sorties.push({ cellule, teinte, opacite });
  }
  return sorties;
}
