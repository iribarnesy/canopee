/**
 * **Papillons et abeilles** (docs/interface-visuelle.md §5.10, lot L9 ; #129).
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * **Où ils sont, et combien** : `soilPollinisateurs`, par cellule ∈ [0,1]. C'est
 * `min(habitat, ressource florale)`, la grandeur même que lit le service de
 * pollinisation, sans son plancher (le vent, les abeilles domestiques). Elle est
 * haute là où une haie fleurie loge **et** nourrit, presque nulle dans un verger
 * nu même en pleine floraison, et nulle hors floraison : c'est le calendrier des
 * fleurs du moteur qui dit quand ils volent. Le rendu n'ajoute aucune règle.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * - **Le partage** entre papillons et abeilles. Le moteur a une guilde, pas des
 *   espèces : chaque insecte tire sa figure de son rang, à peu près moitié-moitié.
 * - **La taille** : fixe à l'écran, comme les points de la nuée. Un papillon de
 *   cinq centimètres ferait deux pixels au zoom de parcelle — un signe, pas un
 *   insecte à l'échelle.
 * - **Le vol** : le papillon louvoie lentement autour d'un point, l'abeille
 *   va et vient vite et bas, de fleur en fleur.
 *
 * Module **pur**.
 */

import { hacher } from "../hachage";

/** Présence en deçà de laquelle un bloc ne montre personne. */
export const SEUIL_DES_POLLINISATEURS = 0.15;
/** Côté d'un bloc, m : un petit groupe par bloc au plus. */
export const BLOC_DES_POLLINISATEURS_M = 4;
/** Insectes d'un bloc à présence pleine. */
export const INSECTES_PAR_BLOC = 4;
/** Au plus autant de blocs habités à la fois, les plus fréquentés d'abord. */
export const MAX_BLOCS = 60;
/** Taille d'un insecte à l'écran, pixels : le papillon ailes ouvertes. */
export const TAILLE_DU_PAPILLON_PX = 6;
export const TAILLE_DE_L_ABEILLE_PX = 3;

export type Pollinisateur = "papillon" | "abeille";

/** Un bloc où des pollinisateurs volent. */
export interface Butinage {
  x: number;
  y: number;
  presence: number;
  insectes: number;
  graine: number;
}

/** Un insecte, à poser. */
export interface PoseDInsecte {
  sorte: Pollinisateur;
  x: number;
  y: number;
  hauteurM: number;
  /** ailes ouvertes (vrai) ou fermées : l'alternance fait le battement */
  ouvert: boolean;
  /** il va vers la gauche de la carte (cap en x négatif) */
  versXNegatif: boolean;
}

/** Les blocs où l'on butine, une fois par instantané. */
export function butinages(
  pollinisateurs: ArrayLike<number> | undefined,
  coteM: number,
): Butinage[] {
  if (!pollinisateurs || pollinisateurs.length === 0) return [];
  const nb = Math.max(1, Math.ceil(coteM / BLOC_DES_POLLINISATEURS_M));
  const somme = new Float64Array(nb * nb);
  const cellules = new Float64Array(nb * nb);
  for (let i = 0; i < pollinisateurs.length; i++) {
    const bx = Math.floor((i % coteM) / BLOC_DES_POLLINISATEURS_M);
    const by = Math.floor(Math.floor(i / coteM) / BLOC_DES_POLLINISATEURS_M);
    const b = by * nb + bx;
    somme[b] = (somme[b] ?? 0) + (pollinisateurs[i] ?? 0);
    cellules[b] = (cellules[b] ?? 0) + 1;
  }
  const blocs: Butinage[] = [];
  for (let b = 0; b < nb * nb; b++) {
    const presence = (somme[b] ?? 0) / Math.max(1, cellules[b] ?? 0);
    if (presence < SEUIL_DES_POLLINISATEURS) continue;
    const bx = b % nb;
    const by = Math.floor(b / nb);
    const cote = BLOC_DES_POLLINISATEURS_M;
    blocs.push({
      x: Math.min(coteM, bx * cote + cote / 2),
      y: Math.min(coteM, by * cote + cote / 2),
      presence,
      insectes: Math.max(1, Math.round(presence * INSECTES_PAR_BLOC)),
      graine: b,
    });
  }
  blocs.sort((a, b) => b.presence - a.presence || a.graine - b.graine);
  return blocs.slice(0, MAX_BLOCS);
}

/** Les insectes à cet instant. */
export function insectesEnVol(blocs: readonly Butinage[], maintenantMs: number): PoseDInsecte[] {
  const poses: PoseDInsecte[] = [];
  const t = maintenantMs / 1000;
  for (const b of blocs) {
    for (let k = 0; k < b.insectes; k++) {
      const h = (n: number) => hacher(b.graine, k * 8 + n, 0x9011);
      const sorte: Pollinisateur = h(0) < 0.5 ? "papillon" : "abeille";
      const phase = h(1) * Math.PI * 2;
      const cx = b.x + (h(2) - 0.5) * BLOC_DES_POLLINISATEURS_M;
      const cy = b.y + (h(3) - 0.5) * BLOC_DES_POLLINISATEURS_M;
      let x: number;
      let y: number;
      let hauteurM: number;
      let vx: number;
      if (sorte === "papillon") {
        // Une courbe de Lissajous lente : il louvoie sans jamais repasser
        // tout à fait au même endroit.
        const w = 0.35 + 0.25 * h(4);
        x = cx + 1.4 * Math.sin(w * t + phase);
        y = cy + 1.0 * Math.sin(1.7 * w * t + phase * 1.3);
        hauteurM = 0.8 + 0.5 * Math.sin(0.9 * w * t + phase) + 0.4 * h(5);
        vx = Math.cos(w * t + phase);
      } else {
        // L'abeille saute de fleur en fleur : un va-et-vient vif et bas.
        const w = 1.6 + 1.2 * h(4);
        x = cx + 0.8 * Math.sin(w * t + phase) + 0.25 * Math.sin(5.3 * t + phase);
        y = cy + 0.6 * Math.cos(0.8 * w * t + phase);
        hauteurM = 0.35 + 0.25 * Math.abs(Math.sin(1.3 * w * t + phase));
        vx = Math.cos(w * t + phase);
      }
      // Le battement : lent pour le papillon, un frémissement pour l'abeille.
      const cadence = sorte === "papillon" ? 5 : 22;
      poses.push({
        sorte,
        x,
        y,
        hauteurM,
        ouvert: Math.floor(t * cadence + h(6) * 2) % 2 === 0,
        versXNegatif: vx < 0,
      });
    }
  }
  return poses;
}
