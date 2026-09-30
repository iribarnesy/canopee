/**
 * **Ce que la parcelle fait entendre**, et à quel niveau (#129, lot L9).
 *
 * Module **pur** : il ne joue rien. Il dit, pour chaque couche sonore, un
 * niveau ∈ [0,1], et pour chaque espèce qui chante, combien de cris par
 * minute. Le mixeur (`mixeur.ts`) ne fait que suivre ces nombres.
 *
 * ── **ce qui vient du moteur** ──────────────────────────────────────────────
 *
 * - **le vent** : `ventRecuParLeSite`, ce que la parcelle reçoit vraiment du
 *   vent de la semaine — le moteur l'emploie pour le feu et la chute des
 *   arbres ; et le **couvert**, la part de lumière que les houppiers
 *   interceptent (`soilLumiere`). Un vent dans une futaie en feuilles
 *   bruisse ; le même vent sur une friche nue en hiver siffle à peine.
 * - **la pluie** : `weather.rainMm`, la pluie de la semaine.
 * - **l'eau** : l'eau libre de la station (`eau`). Un ruisseau coule ; une
 *   mare ne fait pas de bruit, sauf quand la crue la déborde (`estInondee`).
 * - **le feu** : les particules que l'ellipse fait voler — un grand front
 *   gronde plus qu'une lisière qui fume.
 * - **les chantiers** : les gestes du joueur qui démontent une tige, dans
 *   l'instantané. C'est la tronçonneuse, le temps d'un chantier.
 * - **les oiseaux** : **ceux qui nichent** (`Snapshot.faune`), espèce par
 *   espèce, et le geai quand il visite un semis. Une parcelle sans nicheur
 *   ne chante pas, et c'est ce qu'elle doit faire entendre.
 *
 * ── **ce qui est de la mise en scène** ──────────────────────────────────────
 *
 * Les courbes (à quel vent le bruissement est plein, à quelle pluie l'averse)
 * et les cadences de chant par saison. Ce sont des choix d'oreille, nommés ici,
 * et aucun ne change ce que la parcelle contient.
 */

import type { GesteVisible } from "../../engine/actions";
import { ventRecuParLeSite } from "../../engine/feu";

/** Les couches qui bouclent. */
export type Ambiance = "vent" | "pluie" | "ruisseau" | "feu" | "tronconneuse";
export const AMBIANCES: readonly Ambiance[] = ["vent", "pluie", "ruisseau", "feu", "tronconneuse"];

/** Les espèces qui ont une voix dans `data/sons/`. */
export type Voix =
  | "mesange_bleue"
  | "mesange_charbonniere"
  | "pic_epeiche"
  | "buse_variable"
  | "geai";
export const VOIX: readonly Voix[] = [
  "mesange_bleue",
  "mesange_charbonniere",
  "pic_epeiche",
  "buse_variable",
  "geai",
];

export interface EntreeDuSon {
  /** vent moyen de la semaine, m/s (`weather.ventMoyMs`) */
  ventMoyMs: number;
  /** exposition au vent de la station ∈ [0,1] */
  ventExposition: number;
  /** lumière au sol par cellule ∈ [0,1] (`soilLumiere`) */
  lumiereAuSol: ArrayLike<number>;
  /** pluie de la semaine, mm */
  pluieMm: number;
  /** l'eau libre de la station */
  eau: "ruisseau" | "mare" | "aucune";
  /** part des cellules que la crue noie cette semaine ∈ [0,1] */
  partNoyee: number;
  /** particules de feu en vol à cet instant */
  particulesDeFeu: number;
  /** un chantier de coupe est-il en cours ? ∈ [0,1] */
  chantier: number;
  /** semaine dans l'année, 0–51 */
  semaineAnnee: number;
  /** les nicheurs du moteur, par espèce */
  nicheurs: Readonly<Partial<Record<string, number>>>;
  /** geais en visite à cet instant */
  geais: number;
}

export interface Niveaux {
  ambiances: Record<Ambiance, number>;
  /** cris par minute, par voix */
  cadences: Record<Voix, number>;
}

const borne = (v: number) => Math.min(1, Math.max(0, v));

/** Vent reçu en deçà duquel les feuilles ne bruissent pas, et au-delà duquel c'est plein, m/s. */
export const VENT_MUET_MS = 1;
export const VENT_PLEIN_MS = 10;
/** Pluie de la semaine qui fait une averse franche, mm. */
export const PLUIE_PLEINE_MM = 35;
/** Particules de feu pour un grondement plein : un front large. */
export const FEU_PLEIN = 120;

/** Le couvert : la part de lumière que les houppiers interceptent, en moyenne. */
export function couvert(lumiereAuSol: ArrayLike<number>): number {
  if (lumiereAuSol.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < lumiereAuSol.length; i++) s += lumiereAuSol[i] ?? 1;
  return borne(1 - s / lumiereAuSol.length);
}

/**
 * Cris par minute d'un couple, selon la saison. Le printemps chante — c'est
 * le cantonnement —, l'été se tait, l'hiver garde les cris de contact des
 * mésanges. Une buse miaule toute l'année ; le pic tambourine au printemps.
 */
function cadenceDeSaison(voix: Voix, semaine: number): number {
  const printemps = semaine >= 8 && semaine < 25;
  const ete = semaine >= 25 && semaine < 36;
  switch (voix) {
    case "mesange_bleue":
    case "mesange_charbonniere":
      return printemps ? 4 : ete ? 0.8 : 1.5;
    case "pic_epeiche":
      return printemps ? 3 : 0.4;
    case "buse_variable":
      return printemps ? 0.8 : 0.4;
    case "geai":
      return 0;
  }
}

/** Au plus autant de cris par minute pour une voix : au-delà, c'est une volière. */
export const CADENCE_MAX = 10;

export function niveauxDuSon(e: EntreeDuSon): Niveaux {
  const recu = ventRecuParLeSite(e.ventMoyMs, e.ventExposition);
  const vent = borne((recu - VENT_MUET_MS) / (VENT_PLEIN_MS - VENT_MUET_MS)) ** 0.8;
  // Le vent seul siffle un peu ; c'est le feuillage qui fait le bruissement.
  const bruissement = vent * (0.35 + 0.65 * couvert(e.lumiereAuSol));
  const pluie = borne(e.pluieMm / PLUIE_PLEINE_MM) ** 0.7;
  const crue = borne(e.partNoyee * 4);
  const ruisseau = e.eau === "ruisseau" ? borne(0.45 + 0.55 * crue) : crue;
  const feu = borne(e.particulesDeFeu / FEU_PLEIN) ** 0.6;
  const cadences = {} as Record<Voix, number>;
  for (const v of VOIX) {
    const couples = v === "geai" ? 0 : (e.nicheurs[v] ?? 0);
    const base = cadenceDeSaison(v, e.semaineAnnee) * couples;
    // Le geai ne niche pas dans le moteur : il crie quand il vient à un semis.
    cadences[v] = Math.min(CADENCE_MAX, v === "geai" ? e.geais * 6 : base);
  }
  return {
    ambiances: {
      vent: bruissement,
      pluie,
      ruisseau,
      feu,
      tronconneuse: borne(e.chantier),
    },
    cadences,
  };
}

/** Les gestes qui démontent une tige : ceux qu'on entend à la tronçonneuse. */
const A_LA_TRONCONNEUSE = new Set(["couper", "eclaircir", "elaguer", "trogner", "receper"]);

/** Temps d'un chantier à l'oreille, par tige, ms, et son plafond. */
export const MS_PAR_TIGE = 900;
export const CHANTIER_MAX_MS = 9000;

/**
 * Combien de temps la tronçonneuse tourne pour les gestes d'un instantané :
 * une seconde par tige, à peu près, et pas plus de neuf. Un éclaircissage de
 * mille tiges ne fait pas un quart d'heure de moteur.
 */
export function dureeDuChantier(gestes: readonly GesteVisible[]): number {
  let tiges = 0;
  for (const g of gestes) {
    if (!A_LA_TRONCONNEUSE.has(g.type) || !("ids" in g)) continue;
    tiges += g.ids.length;
  }
  return Math.min(CHANTIER_MAX_MS, tiges * MS_PAR_TIGE);
}
