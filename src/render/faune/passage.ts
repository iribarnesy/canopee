/**
 * **Les oiseaux de passage** : ceux qui fréquentent la parcelle sans y nicher
 * (docs/interface-visuelle.md §5.10, lot L9 ; #129, #296).
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * `Snapshot.oiseauxDePassage`, guilde par guilde, pour la dernière semaine
 * simulée (`oiseaux.ts`) :
 *
 * - **combien** : `oiseaux`, un entier. Une entrée à zéro ne pose rien — « les
 *   grives sont dans la région et votre parcelle n'a rien pour elles » ;
 * - **attirés par quoi** : `ressource`, les baies ou le fourré ;
 * - **sur quels arbres** : `arbres`, les ids de ceux qui portent la lisière de la
 *   ressource, les plus fournis d'abord. L'oiseau se pose là, et nulle part
 *   ailleurs.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * - **Les figures** : le moteur a des guildes, pas des espèces. Chacune prend
 *   l'oiseau qui la représente le mieux dans le texte du moteur — la grive pour
 *   les hivernants frugivores, le merle et le rouge-gorge pour les passereaux de
 *   haie, la fauvette pour les migrateurs.
 * - **Le manège** : un oiseau reste un moment sur un arbre nommé, puis vole au
 *   suivant de la liste. Les frugivores vont **en bande**, sur les premiers
 *   arbres de la liste ; les passereaux de haie restent **bas**, dans le fourré.
 * - **Le plafond** : une bande de cent grives se montre à quarante — au-delà,
 *   on ne compte plus, on voit une bande.
 *
 * Module **pur**.
 */

import { hacher } from "../hachage";
import type { Dessin, Perchoir, PoseDHabitant } from "./residents";

/** Ce que le rendu lit d'une guilde (`FrequentationDeGuilde`). */
export interface PassageDUneGuilde {
  guildeId: string;
  ressource: "baies" | "fourre" | string;
  oiseaux: number;
  arbres: readonly number[];
}

/** La figure et la taille de chaque guilde ; une guilde sans fiche ne se pose pas. */
export const FICHES_DE_PASSAGE: Readonly<
  Record<string, { dessins: readonly Dessin[]; tailleM: number; enBande: boolean }>
> = {
  hivernants_frugivores: { dessins: ["grive"], tailleM: 0.25, enBande: true },
  passereaux_de_haie: { dessins: ["merle", "rougegorge"], tailleM: 0.2, enBande: false },
  migrateurs_de_passage: { dessins: ["fauvette"], tailleM: 0.14, enBande: false },
};

/** Au plus autant d'oiseaux d'une guilde à l'écran. */
export const OISEAUX_MAX_PAR_GUILDE = 40;
/** Une bande se partage les premiers arbres de la liste, pas tous. */
export const ARBRES_D_UNE_BANDE = 3;
/** Temps passé sur un arbre, ms, avant de voler au suivant (étalé de 1 à 2 fois). */
export const SEJOUR_MS = 7000;
/** Durée d'un vol d'un arbre à l'autre, ms. */
export const VOL_MS = 1100;

/**
 * Où un oiseau se pose sur un arbre : au bord du houppier, à la hauteur de sa
 * ressource. Les baies sont dans la couronne ; le fourré, c'est le bas.
 */
function perchoirSur(
  arbre: Perchoir,
  ressource: string,
  h: (n: number) => number,
): { x: number; y: number; hauteurM: number } {
  const angle = h(0) * Math.PI * 2;
  const rayon = Math.max(0.3, arbre.houppierRatio * arbre.heightM) * (0.7 + 0.25 * h(1));
  const bas = Math.max(0.2, arbre.baseHouppierM);
  const hauteurM =
    ressource === "fourre"
      ? Math.min(arbre.heightM, 0.3 + 1.2 * h(2))
      : bas + (arbre.heightM - bas) * (0.35 + 0.4 * h(2));
  return {
    x: arbre.x + Math.cos(angle) * rayon,
    y: arbre.y + Math.sin(angle) * rayon,
    hauteurM,
  };
}

/**
 * Les oiseaux de passage à cet instant.
 *
 * `graine` change avec la semaine (la semaine de l'instantané) : la bande de
 * cette semaine n'est pas celle de la suivante, et le même instant rend les
 * mêmes oiseaux.
 */
export function posesDesOiseauxDePassage(
  guildes: readonly PassageDUneGuilde[] | undefined,
  arbres: ReadonlyMap<number, Perchoir>,
  graine: number,
  maintenantMs: number,
): PoseDHabitant[] {
  if (!guildes) return [];
  const poses: PoseDHabitant[] = [];
  guildes.forEach((g, gi) => {
    const fiche = FICHES_DE_PASSAGE[g.guildeId];
    if (!fiche || g.oiseaux <= 0) return;
    const nommes = g.arbres.map((id) => arbres.get(id)).filter((a): a is Perchoir => !!a);
    if (nommes.length === 0) return;
    const lieux = fiche.enBande ? nommes.slice(0, ARBRES_D_UNE_BANDE) : nommes;
    const n = Math.min(OISEAUX_MAX_PAR_GUILDE, g.oiseaux);
    for (let k = 0; k < n; k++) {
      const h = (m: number) => hacher(graine + gi * 7919, k * 16 + m, 0xa55a);
      const dessin = fiche.dessins[Math.floor(h(0) * fiche.dessins.length)] ?? fiche.dessins[0];
      if (!dessin) continue;
      const sejour = SEJOUR_MS * (1 + h(1));
      const cycle = sejour + VOL_MS;
      const t = maintenantMs + h(2) * cycle;
      const etape = Math.floor(t / cycle);
      const dans = t - etape * cycle;
      const depart = Math.floor(h(3) * lieux.length);
      const ici = lieux[(depart + etape) % lieux.length];
      const suivant = lieux[(depart + etape + 1) % lieux.length];
      if (!ici || !suivant) continue;
      const hEtape = (e: number) => (m: number) => hacher(graine + k, e * 31 + m, 0xa55b + gi);
      const a = perchoirSur(ici, g.ressource, hEtape(etape));
      const cle = `passage:${g.guildeId}:${k}`;
      if (dans < sejour) {
        // Posé. Les frugivores piquent les baies, les autres guettent.
        const picore = g.ressource === "baies" && Math.floor(dans / 900 + h(4) * 3) % 3 === 0;
        poses.push({
          cle,
          dessin,
          tailleM: fiche.tailleM,
          x: a.x,
          y: a.y,
          hauteurM: a.hauteurM,
          geste: picore ? "fouille" : "perche",
          capX: h(5) < 0.5 ? 1 : -1,
          capY: 0,
          battement: 0,
          opacite: 1,
          surArbre: ici.id,
        });
        continue;
      }
      // En vol vers l'arbre suivant, sur un arc.
      const b = perchoirSur(suivant, g.ressource, hEtape(etape + 1));
      const u = (dans - sejour) / VOL_MS;
      const arc = Math.sin(u * Math.PI) * 1.5;
      poses.push({
        cle,
        dessin,
        tailleM: fiche.tailleM,
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        hauteurM: a.hauteurM + (b.hauteurM - a.hauteurM) * u + arc,
        geste: "vol",
        capX: b.x - a.x,
        capY: b.y - a.y,
        battement: Math.floor(maintenantMs / 90) % 2 === 0 ? 0 : 1,
        opacite: 1,
      });
    }
  });
  return poses;
}
