/**
 * L'eau de surface permanente : un ruisseau qui longe la parcelle, une mare
 * creusée dedans (docs/regles.md §2 bis).
 *
 * Ce n'est pas un décor. Ce qui fait une ripisylve, ce n'est pas le ruisseau
 * qu'on voit, c'est la NAPPE qu'il tient sous les pieds des arbres : au bord
 * de l'eau elle affleure, et elle s'enfonce à mesure qu'on s'éloigne. Un aulne
 * et un saule y trouvent l'eau qu'ils réclament toute l'année ; un chêne
 * pubescent s'y asphyxie. Aucune espèce n'est traitée à part — c'est la même
 * tolérance à l'engorgement et la même soif qu'ailleurs, appliquées à un sol
 * dont la nappe n'est plus à la même profondeur d'un mètre carré à l'autre.
 *
 * Le profil de nappe suit l'approximation de Dupuit : entre le cours d'eau qui
 * la draine et l'amont qui la recharge, la surface libre monte à peu près
 * comme la racine de la distance, sans jamais dépasser le sol. Sa pente
 * dépend du sol : à recharge égale, un sable très conducteur porte une nappe
 * presque plate (l'eau file vers le ruisseau), une argile la porte raide.
 *
 * Deux conséquences, toutes deux déjà connues du bilan hydrique :
 *  - une REMONTÉE CAPILLAIRE d'autant plus forte que la nappe est proche, et
 *    d'autant plus haute que le sol est fin (30 cm dans un sable, 2 m dans un
 *    limon) — c'est elle qui fait tenir la ripisylve en août ;
 *  - un EXUTOIRE BOUCHÉ : un sol dont la nappe est dans le profil ne peut plus
 *    évacuer vers le bas, donc il s'engorge l'hiver.
 */

import type { GridDims } from "./grid";
import {
  conductiviteHorizonMmSemaine,
  drainageProfilMmSemaine,
  profondeurTotaleCm,
  type SoilProfile,
} from "./soil";

export type CoteParcelle = "nord" | "est" | "sud" | "ouest";

export interface EauDeSurface {
  /**
   * `terrain` : on ne déclare rien, c'est la topographie qui décide — les
   * cuvettes se remplissent, les talwegs assez drainés deviennent des cours
   * d'eau (terrain.ts). Les deux autres valeurs sont des raccourcis pour
   * poser une eau sans dessiner le terrain.
   */
  type: "aucune" | "ruisseau" | "mare" | "terrain";
  /** ruisseau : le côté de la parcelle qu'il longe */
  cote?: CoteParcelle;
  /** mare : centre en fraction du côté ∈ [0,1] */
  xRel?: number;
  yRel?: number;
  /** mare : rayon, m */
  rayonM?: number;
  /**
   * Encaissement : de combien le plan d'eau est en contrebas du terrain qui
   * le borde, m. Un ruisseau à fleur de prairie (0,2 m) noie ses berges ;
   * le même ruisseau deux mètres plus bas ne fait plus de ripisylve.
   */
  bergeM: number;
}

export const SANS_EAU: EauDeSurface = { type: "aucune", bergeM: 0 };

/** Flux capillaire maximal quand la nappe affleure la base du profil, mm/semaine. */
export const REMONTEE_MAX_MM = 14;
/** Au-delà, la nappe est trop loin pour que la cellule la sente encore. */
export const PROFONDEUR_SANS_EFFET_CM = 400;

/** Les cellules occupées par l'eau libre : on n'y plante pas, elles noient. */
export function cellulesEnEau(eau: EauDeSurface, dims: GridDims): boolean[] {
  const { widthM: w, heightM: h } = dims;
  const dedans = new Array<boolean>(w * h).fill(false);
  // « terrain » n'est pas une forme déclarée : c'est le modelé qui décide, et
  // seul terrain.ts sait le lire. Sans ce garde-fou, on tombait dans la
  // branche « mare » et on inventait un disque de 3 m au milieu de la
  // parcelle — ce que le joueur voyait à la place de ce qu'il avait dessiné.
  if (eau.type === "aucune" || eau.type === "terrain") return dedans;
  if (eau.type === "ruisseau") {
    // Le lit occupe la première rangée du côté longé : le cours d'eau est
    // hors parcelle, sa berge est dedans.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const surLeBord =
          (eau.cote === "sud" && y === 0) ||
          (eau.cote === "nord" && y === h - 1) ||
          (eau.cote === "ouest" && x === 0) ||
          (eau.cote === "est" && x === w - 1);
        if (surLeBord) dedans[y * w + x] = true;
      }
    }
    return dedans;
  }
  const cx = (eau.xRel ?? 0.5) * w;
  const cy = (eau.yRel ?? 0.5) * h;
  const r = eau.rayonM ?? 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) dedans[y * w + x] = true;
    }
  }
  return dedans;
}

/**
 * Ce que la nappe voit d'un plan d'eau, quelle que soit son origine : des
 * cellules en eau, la cote de leur surface libre, et la portée d'influence de
 * chacune. Une mare déclarée et une mare creusée à la main produisent le même
 * objet — c'est pour ça que la suite n'a pas besoin de savoir laquelle.
 */
export interface SourcesEau {
  enEau: readonly boolean[];
  /** cote de la surface libre au-dessus de chaque cellule en eau, m */
  niveauM: readonly number[];
  /** portée d'influence de chaque source, m */
  porteeM: readonly number[];
}

interface ChampProche {
  distance: Float32Array;
  niveau: Float32Array;
  portee: Float32Array;
}

/**
 * Pour chaque cellule, la source d'eau la plus proche : sa distance, la cote
 * de sa surface libre et sa portée. Transformée de distance de Chamfer en
 * deux passes (aller-retour), qui transporte les attributs de la source avec
 * la distance — sans quoi deux mares de cotes différentes se mélangeraient.
 */
export function champProche(sources: SourcesEau, dims: GridDims): ChampProche {
  const { widthM: w, heightM: h } = dims;
  const n = w * h;
  const distance = new Float32Array(n).fill(Number.POSITIVE_INFINITY);
  const niveau = new Float32Array(n);
  const portee = new Float32Array(n);
  let uneSource = false;
  for (let i = 0; i < n; i++) {
    if (sources.enEau[i]) {
      distance[i] = 0;
      niveau[i] = sources.niveauM[i] ?? 0;
      portee[i] = sources.porteeM[i] ?? 30;
      uneSource = true;
    }
  }
  if (!uneSource) return { distance, niveau, portee };
  const DIAG = Math.SQRT2;
  const relax = (i: number, j: number, cout: number) => {
    const v = (distance[j] ?? Number.POSITIVE_INFINITY) + cout;
    if (v < (distance[i] ?? Number.POSITIVE_INFINITY)) {
      distance[i] = v;
      niveau[i] = niveau[j] ?? 0;
      portee[i] = portee[j] ?? 30;
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - w, 1);
      if (x > 0 && y > 0) relax(i, i - w - 1, DIAG);
      if (x < w - 1 && y > 0) relax(i, i - w + 1, DIAG);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) relax(i, i + 1, 1);
      if (y < h - 1) relax(i, i + w, 1);
      if (x < w - 1 && y < h - 1) relax(i, i + w + 1, DIAG);
      if (x > 0 && y < h - 1) relax(i, i + w - 1, DIAG);
    }
  }
  return { distance, niveau, portee };
}

/** Distance à l'eau libre la plus proche, m (`Infinity` s'il n'y a pas d'eau). */
export function distanceALEau(enEau: readonly boolean[], dims: GridDims): Float32Array {
  const n = dims.widthM * dims.heightM;
  return champProche(
    { enEau, niveauM: new Array<number>(n).fill(0), porteeM: new Array<number>(n).fill(30) },
    dims,
  ).distance;
}

/**
 * De combien la nappe suit le relief, ∈ [0,1]. Une nappe n'est pas un plan
 * d'eau : c'est une réplique adoucie de la topographie. Dans un sol très
 * conducteur, l'eau file vers l'exutoire et la nappe s'enfonce presque autant
 * que le terrain monte (facteur proche de 1) ; dans une argile elle reste
 * perchée près de la surface et suit peu (facteur bas) — c'est pourquoi un
 * plateau argileux s'engorge alors qu'un plateau sableux est sec.
 */
export function subordinationAuRelief(profil: SoilProfile): number {
  const fond = profil[profil.length - 1];
  if (!fond) return 0.7;
  const k = Math.log10(Math.max(1, conductiviteHorizonMmSemaine(fond)));
  return Math.min(1, Math.max(0.3, 0.3 + 0.2 * k));
}

/**
 * Portée de l'influence, m : au-delà, la cellule ne sent plus l'eau libre.
 * Un cours d'eau draine tout un versant ; une mare ne mouille que ses abords,
 * d'autant plus loin qu'elle est large.
 */
export function porteeDInfluenceM(eau: EauDeSurface): number {
  if (eau.type === "ruisseau") return 60;
  return Math.max(10, 6 * (eau.rayonM ?? 3));
}

/**
 * Hauteur de remontée capillaire du sol, cm : jusqu'où l'eau d'une nappe
 * remonte contre la gravité. Quelques décimètres dans un sable, un à deux
 * mètres dans un limon, davantage dans une argile (mais lentement).
 */
export function hauteurCapillaireCm(profil: SoilProfile): number {
  const fond = profil[profil.length - 1];
  if (!fond) return 100;
  return 30 * fond.sable + 180 * fond.limon + 250 * fond.argile;
}

/**
 * Profondeur de la nappe sous chaque cellule, cm (0 = elle affleure).
 * `Infinity` s'il n'y a pas d'eau de surface : la cellule retombe alors sur la
 * nappe uniforme de la station.
 */
export function champDeNappeCm(
  sources: SourcesEau | undefined,
  altitudesM: readonly number[],
  dims: GridDims,
  profil: SoilProfile,
): Float32Array {
  const n = dims.widthM * dims.heightM;
  const out = new Float32Array(n).fill(Number.POSITIVE_INFINITY);
  if (!sources) return out;
  const proche = champProche(sources, dims);
  const suit = subordinationAuRelief(profil);
  for (let i = 0; i < n; i++) {
    const sol = altitudesM[i] ?? 0;
    const d = proche.distance[i] ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(d)) continue;
    // Deux termes, et ils disent deux choses différentes :
    //  - le terrain : plus une cellule domine le plan d'eau, plus la nappe
    //    est loin sous ses pieds (c'est le terme qui fait le bas-fond humide
    //    et la butte sèche) ;
    //  - la distance : passé la portée du cours d'eau ou de la mare, la
    //    cellule ne sent plus rien et retrouve le régime de la station.
    const parLeRelief = 100 * suit * Math.max(0, sol - (proche.niveau[i] ?? 0));
    const parLEloignement =
      PROFONDEUR_SANS_EFFET_CM * (1 - Math.exp(-d / Math.max(1, proche.portee[i] ?? 30)));
    out[i] = parLeRelief + parLEloignement;
  }
  return out;
}

/**
 * Les sources d'eau DÉCLARÉES : « un ruisseau au sud », « une mare de 4 m ».
 * Le plan d'eau est horizontal, sa cote est le point le plus bas qu'il touche
 * moins l'encaissement de la berge.
 */
export function sourcesDeclarees(
  eau: EauDeSurface,
  altitudesM: readonly number[],
  dims: GridDims,
): SourcesEau | undefined {
  if (eau.type === "aucune" || eau.type === "terrain") return undefined;
  const n = dims.widthM * dims.heightM;
  const enEau = cellulesEnEau(eau, dims);
  let zEau = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    if (enEau[i]) zEau = Math.min(zEau, altitudesM[i] ?? 0);
  }
  if (!Number.isFinite(zEau)) return undefined;
  zEau -= eau.bergeM;
  const portee = porteeDInfluenceM(eau);
  return {
    enEau,
    niveauM: new Array<number>(n).fill(zEau),
    porteeM: new Array<number>(n).fill(portee),
  };
}

/** Profondeur de la nappe pour une eau déclarée (raccourci historique). */
export function profondeurNappeCm(
  eau: EauDeSurface,
  altitudesM: readonly number[],
  dims: GridDims,
  profil: SoilProfile,
): Float32Array {
  return champDeNappeCm(sourcesDeclarees(eau, altitudesM, dims), altitudesM, dims, profil);
}

/**
 * Ce que la nappe rend à la cellule par capillarité, mm/semaine. Décroît
 * exponentiellement avec la distance verticale : au contact c'est un apport
 * majeur, à trois mètres il n'en reste rien.
 */
export function remonteeCapillaireMm(profondeurCm: number, profil: SoilProfile): number {
  if (!Number.isFinite(profondeurCm) || profondeurCm >= PROFONDEUR_SANS_EFFET_CM) return 0;
  // On compte la distance depuis la BASE du profil : ce qui compte, c'est
  // l'écart entre la nappe et les racines les plus profondes.
  const sousLeProfil = Math.max(0, profondeurCm - profondeurTotaleCm(profil));
  return REMONTEE_MAX_MM * Math.exp(-sousLeProfil / hauteurCapillaireCm(profil));
}

/**
 * Ce que l'exutoire peut encore évacuer, en fraction : un sol dont la nappe
 * est dans le profil n'a nulle part où envoyer son eau. À nappe affleurante,
 * plus rien ne part — c'est le marais.
 */
export function facteurExutoire(profondeurCm: number, profil: SoilProfile): number {
  if (!Number.isFinite(profondeurCm)) return 1;
  const profondeurProfil = profondeurTotaleCm(profil);
  if (profondeurProfil <= 0) return 1;
  return Math.min(1, Math.max(0, profondeurCm / profondeurProfil));
}

/**
 * De combien le plan d'eau monte quand son bassin lui envoie de l'eau, m.
 *
 * Une crue n'a pas de cause à part : c'est la même eau qui, ailleurs sur la
 * parcelle, arrive par ruissellement depuis l'amont (relief.ts). On la relit
 * simplement du point de vue du cours d'eau — plus son bassin lui verse
 * d'eau dans la semaine, plus il déborde, et la nappe monte d'autant sous
 * toute la zone qu'il influence. Sans bassin d'amont, pas de crue.
 */
export const MONTEE_DE_CRUE_M_PAR_MM = 0.02;

export function hauteurDeCrueM(eau: EauDeSurface, apportAmontMm: number): number {
  if (eau.type === "aucune") return 0;
  return Math.max(0, MONTEE_DE_CRUE_M_PAR_MM * apportAmontMm);
}

/**
 * Ce que l'exutoire évacue réellement sous une cellule, mm/semaine. Une
 * station peut déclarer un exutoire illimité (plateau bien drainé) ; dès que
 * la nappe entre dans le profil, c'est la conductivité du sol qui redevient
 * la limite — un « drainage infini » ne vide pas un sol dont la nappe est à
 * dix centimètres.
 */
export function drainageAvecNappe(
  drainageExterneMm: number,
  profondeurCm: number,
  profil: SoilProfile,
): number {
  const facteur = facteurExutoire(profondeurCm, profil);
  if (facteur >= 1) return drainageExterneMm;
  return Math.min(drainageExterneMm, drainageProfilMmSemaine(profil)) * facteur;
}

/** Résumé lisible pour l'interface. */
export function resumeEau(eau: EauDeSurface): string {
  if (eau.type === "aucune") return "pas d'eau de surface";
  const encaissement = `berge ${eau.bergeM.toFixed(1)} m`;
  if (eau.type === "ruisseau") return `ruisseau au ${eau.cote ?? "sud"} · ${encaissement}`;
  return `mare de ${(eau.rayonM ?? 3).toFixed(0)} m de rayon · ${encaissement}`;
}
