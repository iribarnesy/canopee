/**
 * **Le geai qui revient à sa cachette** (docs/interface-visuelle.md §5.10, lot
 * L9 ; #129).
 *
 * ── **ce que le moteur dit** ────────────────────────────────────────────────
 *
 * Cinq espèces ont une dissémination `geai` (`especes.ts`) : les deux chênes,
 * le noyer, le noisetier, le châtaignier. Leurs semis ne tombent pas au pied du
 * parent : le moteur les place là où un geai les aurait cachés, loin et **au
 * découvert** (`regeneration.ts`, `drawPosition`). Chaque semis levé d'une de
 * ces espèces est donc, dans le modèle, un gland qu'un geai a enterré.
 *
 * ── **ce qu'on montre, et pourquoi pas l'enfouissement** ─────────────────────
 *
 * Le moteur fait lever tous les semis de l'année la même semaine, au
 * printemps (`RECRUITMENT_WEEK`), et un geai cache ses glands en **automne**.
 * Le montrer en train d'enterrer en avril serait un anachronisme, et montrer
 * l'enfouissement en octobre demanderait de connaître des semis qui n'existent
 * pas encore.
 *
 * On montre donc ce que fait le geai au printemps, qui est aussi documenté :
 * il **revient** à ses cachettes, qu'il retrouve par la plantule. Il se pose,
 * fouille un instant, et repart. Il ne mange pas le semis — le moteur l'a
 * gardé, et le rendu ne l'enlève pas.
 *
 * Le moteur ne tient pas de geai comme individu (`state.faune` ne le compte
 * pas). Celui-ci est l'agent que la règle de dissémination suppose, rendu
 * visible le jour où son travail l'est : c'est une mise en scène, bornée à
 * `MAX_GEAIS` visites par instantané, et dite ici.
 *
 * Module **pur**.
 */

import type { NaissanceDeLaSemaine } from "../../engine/tick";
import { hacher } from "../hachage";
import type { PoseDHabitant } from "./residents";

/** Au plus autant de geais par instantané : c'est un signe, pas un recensement. */
export const MAX_GEAIS = 3;
/** Deux visites plus proches que ça n'en font qu'une, m. */
const ECART_DES_VISITES_M = 10;
/** Longueur d'un geai, m. */
export const TAILLE_DU_GEAI_M = 0.34;
/** Écart entre deux arrivées, ms : ils ne tombent pas du ciel ensemble. */
const ECHELON_MS = 2500;
const VOL_MS = 7;
/** Hauteur d'arrivée et de départ, m : il vient d'au-dessus des haies. */
const HAUTEUR_DE_VOL_M = 8;
const POSE_MS = 900;
const FOUILLE_MS = 3200;

/** Une visite : d'où il vient, le semis, où il repart. */
export interface VisiteDuGeai {
  cle: string;
  semis: { x: number; y: number };
  entree: { x: number; y: number };
  sortie: { x: number; y: number };
  arriveeMs: number;
  /** fin du vol d'arrivée, début de la fouille, fin de la fouille, fin du départ */
  poseMs: number;
  repartMs: number;
  finMs: number;
}

function bordLePlusProche(coteM: number, p: { x: number; y: number }, sel: number) {
  const bords = [
    { d: p.x, q: { x: -2, y: p.y } },
    { d: coteM - p.x, q: { x: coteM + 2, y: p.y } },
    { d: p.y, q: { x: p.x, y: -2 } },
    { d: coteM - p.y, q: { x: p.x, y: coteM + 2 } },
  ].sort((a, b) => a.d - b.d);
  // Le plus proche la plupart du temps, le deuxième parfois : pas toujours le
  // même couloir.
  return (bords[sel < 0.7 ? 0 : 1] ?? bords[0])?.q ?? { x: -2, y: p.y };
}

/**
 * Les visites de geai qu'appellent les semis d'un instantané.
 *
 * `disperseParLeGeai` est la lecture de la fiche du moteur
 * (`regeneration.dissemination === "geai"`) : on ne nomme ici aucune espèce.
 */
export function visitesDuGeai(
  naissances: readonly NaissanceDeLaSemaine[],
  disperseParLeGeai: (especeId: string) => boolean,
  coteM: number,
  depuisMs: number,
): VisiteDuGeai[] {
  // Rangées par un hachage de leur identifiant : le choix ne dépend pas de
  // l'ordre du journal, et deux lectures du même instantané donnent les mêmes.
  const semis = naissances
    .filter((n) => disperseParLeGeai(n.especeId))
    .sort((a, b) => hacher(a.id, 0, 0x6ea1) - hacher(b.id, 0, 0x6ea1));
  const visites: VisiteDuGeai[] = [];
  for (const s of semis) {
    if (visites.length >= MAX_GEAIS) break;
    if (visites.some((v) => Math.hypot(v.semis.x - s.x, v.semis.y - s.y) < ECART_DES_VISITES_M)) {
      continue;
    }
    const k = visites.length;
    const entree = bordLePlusProche(coteM, s, hacher(s.id, 1, 0x6ea2));
    const angle = hacher(s.id, 2, 0x6ea3) * Math.PI * 2;
    const sortie = { x: s.x + Math.cos(angle) * coteM, y: s.y + Math.sin(angle) * coteM };
    const arriveeMs = depuisMs + k * ECHELON_MS;
    const aller = (Math.hypot(s.x - entree.x, s.y - entree.y) / VOL_MS) * 1000;
    const poseMs = arriveeMs + aller;
    const repartMs = poseMs + POSE_MS + FOUILLE_MS;
    const retour = (Math.hypot(sortie.x - s.x, sortie.y - s.y) / VOL_MS) * 1000;
    visites.push({
      cle: `geai:${s.id}`,
      semis: { x: s.x, y: s.y },
      entree,
      sortie,
      arriveeMs,
      poseMs,
      repartMs,
      finMs: repartMs + retour,
    });
  }
  return visites;
}

/** Les geais à l'instant `tMs`. */
export function posesDesGeais(visites: readonly VisiteDuGeai[], tMs: number): PoseDHabitant[] {
  const poses: PoseDHabitant[] = [];
  for (const v of visites) {
    if (tMs < v.arriveeMs || tMs >= v.finMs) continue;
    const base = { cle: v.cle, dessin: "geai" as const, tailleM: TAILLE_DU_GEAI_M };
    const battement = (Math.floor(tMs / 110) % 2) as 0 | 1;
    if (tMs < v.poseMs) {
      // L'arrivée : il descend des haies vers le semis.
      const k = (tMs - v.arriveeMs) / Math.max(1, v.poseMs - v.arriveeMs);
      const dx = v.semis.x - v.entree.x;
      const dy = v.semis.y - v.entree.y;
      const d = Math.hypot(dx, dy) || 1;
      poses.push({
        ...base,
        x: v.entree.x + dx * k,
        y: v.entree.y + dy * k,
        hauteurM: HAUTEUR_DE_VOL_M * (1 - k) * (1 - k),
        geste: "vol",
        capX: dx / d,
        capY: dy / d,
        battement,
        opacite: Math.min(1, (tMs - v.arriveeMs) / 600),
      });
    } else if (tMs < v.repartMs) {
      // Posé : il sautille une fois, puis fouille la terre au pied de la plantule.
      const depuis = tMs - v.poseMs;
      const cote = Math.floor(depuis / 800) % 2 === 0 ? 1 : -1;
      poses.push({
        ...base,
        x: v.semis.x - 0.25 * cote,
        y: v.semis.y,
        hauteurM: 0,
        geste: depuis < POSE_MS ? "perche" : "fouille",
        capX: cote,
        capY: 0,
        battement: (Math.floor(depuis / 260) % 2) as 0 | 1,
        opacite: 1,
      });
    } else {
      const k = (tMs - v.repartMs) / Math.max(1, v.finMs - v.repartMs);
      const dx = v.sortie.x - v.semis.x;
      const dy = v.sortie.y - v.semis.y;
      const d = Math.hypot(dx, dy) || 1;
      poses.push({
        ...base,
        x: v.semis.x + dx * k,
        y: v.semis.y + dy * k,
        hauteurM: HAUTEUR_DE_VOL_M * Math.sqrt(k),
        geste: "vol",
        capX: dx / d,
        capY: dy / d,
        battement,
        opacite: Math.min(1, (v.finMs - tMs) / 800),
      });
    }
  }
  return poses;
}
