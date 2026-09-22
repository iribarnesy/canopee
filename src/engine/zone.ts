/**
 * LA ZONE D'UN CHANTIER (issue #186).
 *
 * Toutes les actions qui agissent sur une surface prenaient un DISQUE — un
 * centre et un rayon. C'est commode pour un potet, une éclaircie, un épandage ;
 * c'est faux pour tout ce qui, dans une parcelle réelle, est long et étroit :
 * une allée cultivée, une haie, une bande enherbée, une tournière, une lisière
 * entretenue.
 *
 * **Et ça s'est payé.** Le dispositif du LER (#136) a dû paver ses allées de
 * disques qui se chevauchent pour épargner le pied des rangs, parce qu'un
 * disque ne pave pas une bande. Ça marche, c'est mesuré, et c'est un
 * contournement : la règle d'installation d'un alignement est « des bandes
 * larges de plus d'un mètre » le long du rang (CNPF), et le moteur ne savait
 * pas l'exprimer.
 *
 * ── CE QUE CE MODULE GARANTIT ────────────────────────────────────────────────
 *
 * **Le disque reste le comportement par défaut, au bit près.** `forme` est
 * FACULTATIF sur la variante disque : une action écrite `{ x, y, rayonM }` —
 * c'est-à-dire toutes celles qui existent, dans le moteur comme dans les essais
 * — reste valide sans être touchée, et rend exactement les mêmes cellules
 * qu'avant. Ce n'est pas une politesse envers l'existant : c'est le seul
 * contrôle qui vaille sur un refactor qui traverse dix actions. Une partie
 * rejouée doit donner le même `stateHash`, et un essai l'exige.
 *
 * Les six opérations que la forme doit savoir rendre sont celles que le moteur
 * lui demandait déjà, une par usage relevé dans `actions.ts` : la liste des
 * cellules, leur parcours, l'aire (pour les heures et les coûts), le périmètre
 * (pour une clôture), et le test d'appartenance d'un point (pour les arbres).
 */

import { cellIndexAt, type GridDims } from "./grid";

/**
 * Un disque : un centre et un rayon. `forme` est facultatif — c'est ce qui rend
 * la migration invisible pour tout ce qui était déjà écrit.
 */
export interface ZoneDisque {
  forme?: "disque";
  x: number;
  y: number;
  rayonM: number;
}

/**
 * Une bande : un centre, une orientation, une longueur et une largeur.
 *
 * Mesurée depuis son CENTRE et non depuis un coin, pour la même raison que le
 * disque : une action se désigne par le point qu'on vise. L'orientation est
 * celle du grand axe, en radians, zéro vers l'est comme partout ailleurs dans
 * le moteur (`versLAval`, `ventVersRad`).
 */
export interface ZoneBande {
  forme: "bande";
  x: number;
  y: number;
  /** longueur du grand axe, m */
  longueurM: number;
  /** largeur en travers, m */
  largeurM: number;
  /** orientation du grand axe, radians */
  orientationRad: number;
}

export type Zone = ZoneDisque | ZoneBande;

/** Le point (px, py) est-il dans la zone ? */
export function zoneContient(zone: Zone, px: number, py: number): boolean {
  const dx = px - zone.x;
  const dy = py - zone.y;
  if (zone.forme === "bande") {
    // On se place dans le repère de la bande : le long de son axe, et en
    // travers. Deux comparaisons, et aucune trigonométrie par cellule — le
    // cosinus et le sinus sont calculés une fois ici.
    const c = Math.cos(zone.orientationRad);
    const s = Math.sin(zone.orientationRad);
    const long = dx * c + dy * s;
    const travers = -dx * s + dy * c;
    return Math.abs(long) <= zone.longueurM / 2 && Math.abs(travers) <= zone.largeurM / 2;
  }
  return dx * dx + dy * dy <= zone.rayonM * zone.rayonM;
}

/** Le rayon de la boîte englobante, m — pour borner le parcours de la grille. */
function porteeM(zone: Zone): number {
  return zone.forme === "bande" ? Math.hypot(zone.longueurM, zone.largeurM) / 2 : zone.rayonM;
}

/**
 * Appelle `fn(index)` pour chaque cellule dont le centre est dans la zone.
 *
 * Garantit au moins une cellule — celle du centre —, exactement comme
 * `forEachDiscCell` dont ceci est la généralisation : « un semis a toujours un
 * sol sous les pieds », et une bande d'un mètre de large sur une grille au
 * mètre pourrait autrement ne toucher personne.
 */
export function pourChaqueCelluleDeLaZone(
  dims: GridDims,
  zone: Zone,
  fn: (index: number) => void,
): void {
  const r = porteeM(zone);
  const x0 = Math.max(0, Math.floor(zone.x - r));
  const x1 = Math.min(dims.widthM - 1, Math.floor(zone.x + r));
  const y0 = Math.max(0, Math.floor(zone.y - r));
  const y1 = Math.min(dims.heightM - 1, Math.floor(zone.y + r));
  let trouve = false;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (zoneContient(zone, x + 0.5, y + 0.5)) {
        fn(y * dims.widthM + x);
        trouve = true;
      }
    }
  }
  if (!trouve) fn(cellIndexAt(dims, zone.x, zone.y));
}

/**
 * Les cellules de la zone sur une parcelle carrée de côté `coteM`.
 *
 * Même règle que ci-dessus, et c'est le remplaçant direct de `cellulesDuDisque`
 * dans `actions.ts`.
 */
export function cellulesDeLaZone(coteM: number, zone: Zone): number[] {
  const out: number[] = [];
  pourChaqueCelluleDeLaZone({ widthM: coteM, heightM: coteM }, zone, (i) => out.push(i));
  return out;
}

/** L'aire de la zone, m² — celle qui facture les heures de chantier. */
export function aireM2DeLaZone(zone: Zone): number {
  return zone.forme === "bande"
    ? zone.longueurM * zone.largeurM
    : Math.PI * zone.rayonM * zone.rayonM;
}

/** Le périmètre de la zone, m — celui qu'on clôture. */
export function perimetreMDeLaZone(zone: Zone): number {
  return zone.forme === "bande" ? 2 * (zone.longueurM + zone.largeurM) : 2 * Math.PI * zone.rayonM;
}
