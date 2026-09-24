/**
 * **La zone d'un chantier** (issue #186).
 *
 * Toutes les actions qui agissent sur une surface prenaient un **disque** — un
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
 * ── **ce que ce module garantit** ────────────────────────────────────────────────
 *
 * **Le disque reste le comportement par défaut, au bit près — à deux exceptions
 * près, qui sont écrites.** `zone` est **facultatif** sur la variante disque : une
 * action écrite `{ x, y, rayonM }` — c'est-à-dire toutes celles qui existent,
 * dans le moteur comme dans les essais — reste valide sans être touchée, et rend
 * exactement les mêmes cellules qu'avant. Ce n'est pas une politesse envers
 * l'existant : c'est le seul contrôle qui vaille sur un refactor qui traverse
 * dix actions, et `tests/unit/zone.test.ts` le tient sur cinq cents disques
 * tirés au hasard plutôt que sur des cas choisis.
 *
 * Les deux exceptions, trouvées par ce balayage et par lui seul :
 *
 *  1. **`actions.ts` avait deux routes qui ne faisaient pas la même chose.**
 *     `forEachDiscCell` garantissait au moins une cellule, `cellulesDuDisque`
 *     non — si bien qu'un `semer` de vingt centimètres ne semait rien, en
 *     silence et facturé, quand un `faucher` du même rayon fauchait une cellule.
 *     La zone unifie sur la garantie. Seul ce cas dégénéré change.
 *  2. **L'aire se calculait de deux façons à un ulp près.** Cinq appels
 *     écrivaient `Math.PI * r * r`, l'éclaircie écrivait `(Math.PI * r2)`. Il
 *     n'y a donc pas d'« avant » unique à préserver ; on prend la forme
 *     majoritaire, et l'essai borne ce que l'éclaircie y perd : rien, le
 *     `Math.round` du nombre de tiges à garder absorbant l'**ulp** sur tous les
 *     couples (rayon, densité) plausibles.
 *
 * Les six opérations que la forme doit savoir rendre sont celles que le moteur
 * lui demandait déjà, une par usage relevé dans `actions.ts` : la liste des
 * cellules, leur parcours, l'aire (pour les heures et les coûts), le périmètre
 * (pour une clôture), et le test d'appartenance d'un point (pour les arbres).
 */

import { cellIndexAt, type GridDims } from "./grid";

/**
 * Un disque : un centre et un rayon. Le discriminant est facultatif — c'est ce
 * qui rend la migration invisible pour tout ce qui était déjà écrit.
 *
 * Il s'appelle `zone` et non `forme` parce que `forme` était déjà pris : une
 * fertilisation a une forme, minérale ou fumier. L'intersection réduisait toute
 * l'action à `never`, et c'est le compilateur qui l'a dit — une collision de
 * noms qu'aucune relecture n'aurait attrapée.
 */
export interface ZoneDisque {
  zone?: "disque";
  x: number;
  y: number;
  rayonM: number;
}

/**
 * Une bande : un centre, une orientation, une longueur et une largeur.
 *
 * Mesurée depuis son **centre** et non depuis un coin, pour la même raison que le
 * disque : une action se désigne par le point qu'on vise. L'orientation est
 * celle du grand axe, en radians, zéro vers l'est comme partout ailleurs dans
 * le moteur (`versLAval`, `ventVersRad`).
 */
export interface ZoneBande {
  zone: "bande";
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
  if (zone.zone === "bande") {
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
  return zone.zone === "bande" ? Math.hypot(zone.longueurM, zone.largeurM) / 2 : zone.rayonM;
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
 * Même règle que ci-dessus, et c'est ce qui remplace `cellulesDuDisque` dans
 * `actions.ts` — à une différence près, voulue : l'ancienne fonction n'avait pas
 * la garantie « au moins une cellule », celle-ci l'a. Voir l'en-tête.
 */
export function cellulesDeLaZone(coteM: number, zone: Zone): number[] {
  const out: number[] = [];
  pourChaqueCelluleDeLaZone({ widthM: coteM, heightM: coteM }, zone, (i) => out.push(i));
  return out;
}

/** L'aire de la zone, m² — celle qui facture les heures de chantier. */
export function aireM2DeLaZone(zone: Zone): number {
  return zone.zone === "bande"
    ? zone.longueurM * zone.largeurM
    : Math.PI * zone.rayonM * zone.rayonM;
}

/** Le périmètre de la zone, m — celui qu'on clôture. */
export function perimetreMDeLaZone(zone: Zone): number {
  return zone.zone === "bande" ? 2 * (zone.longueurM + zone.largeurM) : 2 * Math.PI * zone.rayonM;
}
