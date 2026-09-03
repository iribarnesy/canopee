/**
 * Du TERRAIN à ce qui y pousse : ce module ne décrit rien, il déduit.
 *
 * Jusqu'ici le relief se choisissait parmi trois silhouettes (plan, vallon,
 * croupe) et l'eau libre se déclarait (« un ruisseau au sud », « une mare de
 * 4 m »). C'est commode mais ça met la charrue avant les bœufs : dans la
 * réalité, personne ne décide qu'il y a une mare. On creuse un trou, et le
 * trou se remplit — ou pas, selon ce qui coule dedans et ce qu'il y a dessous.
 *
 * Ici, on part d'un champ d'altitudes quelconque (dessiné, généré, importé) et
 * on en déduit deux choses, avec les algorithmes classiques de l'hydrologie
 * numérique :
 *
 *  - le REMPLISSAGE DES CUVETTES (Barnes et al., « priority-flood ») : chaque
 *    creux se remplit jusqu'au niveau de son déversoir. Ce qui se retrouve
 *    sous ce niveau est en eau. Un trou creusé devient une mare, un trou percé
 *    sur le côté ne devient rien ;
 *  - l'ACCUMULATION D'ÉCOULEMENT : chaque cellule reçoit l'eau de tout ce qui
 *    verse vers elle. Là où il en passe assez, il y a un cours d'eau — c'est
 *    la définition hydrologique d'un ruisseau, un seuil sur la surface drainée.
 *
 * Ensuite, `eau_surface.ts` fait le reste sans rien savoir de tout ça : il ne
 * voit que des cellules en eau et leur niveau. Une mare creusée à la main et
 * une mare déclarée produisent exactement la même nappe, donc la même
 * ripisylve.
 */

import type { SourcesEau } from "./eau_surface";
import type { GridDims } from "./grid";
import { voisineAval } from "./relief";
import { conductiviteHorizonMmSemaine, type SoilProfile } from "./soil";

/** Surface drainée à partir de laquelle un talweg devient un cours d'eau, m². */
export const SEUIL_COURS_DEAU_M2 = 1500;

/**
 * Part de la conductivité du sol qui subsiste sous un plan d'eau : le fond se
 * colmate de vase et de matière organique, et une mare finit par tenir sur un
 * sol qui, à nu, ne retiendrait rien *(à calibrer)*.
 */
export const COLMATAGE_DU_FOND = 0.02;
/** Pluie annuelle par défaut, mm, quand la station ne la précise pas. */
export const PLUIE_DEFAUT_MM_AN = 800;
/**
 * Part de la pluie qui ruisselle ou percole depuis les TERRES du bassin — le
 * reste repart par l'évapotranspiration de la végétation. Un plan d'eau, lui,
 * reçoit la pluie entière : il ne transpire pas *(ordre de grandeur)*.
 */
export const PART_EFFICACE = 0.35;
/** Évaporation annuelle d'une surface d'eau libre en France, mm *(ordre de grandeur)*. */
export const EVAPORATION_PLAN_DEAU_MM_AN = 700;

export interface EauxDuTerrain {
  /** cellules occupées par l'eau libre */
  enEau: boolean[];
  /** cote de la surface libre au-dessus de chaque cellule en eau, m */
  niveauM: number[];
  /** surface drainée par cellule, m² (utile pour comprendre le terrain) */
  accumulationM2: Float32Array;
}

/** File de priorité minimale sur (clé, valeur) — tas binaire. */
class TasMin {
  private cles: number[] = [];
  private valeurs: number[] = [];

  get taille(): number {
    return this.cles.length;
  }

  pousser(cle: number, valeur: number): void {
    this.cles.push(cle);
    this.valeurs.push(valeur);
    let i = this.cles.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.cles[parent] ?? 0) <= (this.cles[i] ?? 0)) break;
      this.echanger(i, parent);
      i = parent;
    }
  }

  retirer(): number {
    const valeur = this.valeurs[0] ?? -1;
    const dernierCle = this.cles.pop();
    const derniereValeur = this.valeurs.pop();
    if (this.cles.length > 0 && dernierCle !== undefined && derniereValeur !== undefined) {
      this.cles[0] = dernierCle;
      this.valeurs[0] = derniereValeur;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let petit = i;
        if (g < this.cles.length && (this.cles[g] ?? 0) < (this.cles[petit] ?? 0)) petit = g;
        if (d < this.cles.length && (this.cles[d] ?? 0) < (this.cles[petit] ?? 0)) petit = d;
        if (petit === i) break;
        this.echanger(i, petit);
        i = petit;
      }
    }
    return valeur;
  }

  private echanger(a: number, b: number): void {
    const ck = this.cles[a] ?? 0;
    const cv = this.valeurs[a] ?? 0;
    this.cles[a] = this.cles[b] ?? 0;
    this.valeurs[a] = this.valeurs[b] ?? 0;
    this.cles[b] = ck;
    this.valeurs[b] = cv;
  }
}

/**
 * Niveau auquel chaque cellule se remplirait avant de déborder (priority-
 * flood). On part des bords — par où l'eau sort — et on progresse toujours par
 * le point le plus bas encore atteignable : une cellule ne peut pas être plus
 * basse que le col qu'il a fallu franchir pour l'atteindre, et cet écart, c'est
 * exactement la hauteur d'eau.
 */
export function remplirDepressions(altitudes: readonly number[], dims: GridDims): number[] {
  const { widthM: w, heightM: h } = dims;
  const n = w * h;
  const niveau = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const vu = new Array<boolean>(n).fill(false);
  const tas = new TasMin();
  const pousser = (i: number, cle: number) => {
    if (vu[i]) return;
    vu[i] = true;
    niveau[i] = cle;
    tas.pousser(cle, i);
  };
  for (let x = 0; x < w; x++) {
    pousser(x, altitudes[x] ?? 0);
    pousser((h - 1) * w + x, altitudes[(h - 1) * w + x] ?? 0);
  }
  for (let y = 0; y < h; y++) {
    pousser(y * w, altitudes[y * w] ?? 0);
    pousser(y * w + w - 1, altitudes[y * w + w - 1] ?? 0);
  }
  while (tas.taille > 0) {
    const i = tas.retirer();
    const x = i % w;
    const y = (i - x) / w;
    const courant = niveau[i] ?? 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (vu[j]) continue;
        pousser(j, Math.max(altitudes[j] ?? 0, courant));
      }
    }
  }
  return niveau;
}

/**
 * Surface drainée par chaque cellule, m². On descend le terrain REMPLI (sinon
 * l'eau s'arrête dans le premier creux) et chaque cellule passe son eau à sa
 * voisine d'aval. `apportAmontM2` est le bassin extérieur qui verse sur la
 * parcelle : il entre par le haut, réparti sur la crête.
 */
export function accumulationEcoulement(
  altitudesRemplies: readonly number[],
  dims: GridDims,
  apportAmontM2 = 0,
): Float32Array {
  const n = dims.widthM * dims.heightM;
  const accumulation = new Float32Array(n).fill(1);
  const ordre = altitudesRemplies
    .map((_, i) => i)
    .sort((a, b) => (altitudesRemplies[b] ?? 0) - (altitudesRemplies[a] ?? 0));
  if (apportAmontM2 > 0) {
    // La crête reçoit ce qui vient de l'extérieur : les 5 % les plus hauts.
    const hautes = Math.max(1, Math.round(n * 0.05));
    for (let k = 0; k < hautes; k++) {
      const i = ordre[k];
      if (i !== undefined) accumulation[i] = (accumulation[i] ?? 0) + apportAmontM2 / hautes;
    }
  }
  const aval = voisineAval(altitudesRemplies, dims);
  for (const i of ordre) {
    const j = aval[i] ?? -1;
    if (j >= 0) accumulation[j] = (accumulation[j] ?? 0) + (accumulation[i] ?? 0);
  }
  return accumulation;
}

/**
 * Ce que le terrain fait de l'eau : les cuvettes pleines deviennent des plans
 * d'eau, les talwegs assez drainés deviennent des cours d'eau. Rien n'est
 * déclaré — on creuse, et la mare apparaît si le trou tient l'eau.
 */
export interface OptionsTerrain {
  /** surface du bassin extérieur qui verse sur la parcelle, m² */
  apportAmontM2?: number;
  /** surface drainée à partir de laquelle un talweg devient un cours d'eau, m² */
  seuilCoursDeauM2?: number;
  /**
   * Pluie annuelle, mm, et profil du sol. Quand les deux sont fournis, une
   * cuvette n'est retenue que si elle TIENT L'EAU : ce qu'elle reçoit doit
   * couvrir ce qui s'infiltre par le fond et ce qui s'évapore. Sans ça, tout
   * trou creusé deviendrait une mare, y compris dans du sable.
   */
  pluieAnnuelleMm?: number;
  profil?: SoilProfile;
}

export function eauxDuTerrain(
  altitudes: readonly number[],
  dims: GridDims,
  options: OptionsTerrain = {},
): EauxDuTerrain {
  const apportAmontM2 = options.apportAmontM2 ?? 0;
  const seuilCoursDeauM2 = options.seuilCoursDeauM2 ?? SEUIL_COURS_DEAU_M2;
  const n = dims.widthM * dims.heightM;
  const remplies = remplirDepressions(altitudes, dims);
  const accumulation = accumulationEcoulement(remplies, dims, apportAmontM2);
  const enEau = new Array<boolean>(n).fill(false);
  const niveauM = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const sol = altitudes[i] ?? 0;
    const plein = remplies[i] ?? sol;
    // Une cuvette pleine : la surface libre est au-dessus du sol.
    if (plein > sol + 1e-6) {
      enEau[i] = true;
      niveauM[i] = plein;
      continue;
    }
    // Un talweg assez drainé : le lit du cours d'eau est au niveau du sol.
    if ((accumulation[i] ?? 0) >= seuilCoursDeauM2) {
      enEau[i] = true;
      niveauM[i] = sol;
    }
  }
  const eaux = { enEau, niveauM, accumulationM2: accumulation };
  if (options.pluieAnnuelleMm !== undefined && options.profil) {
    assecherLesCuvettesQuiNeTiennentPas(
      eaux,
      dims,
      seuilCoursDeauM2,
      options.pluieAnnuelleMm,
      options.profil,
    );
  }
  return eaux;
}

/**
 * Une cuvette ne devient pas une mare parce qu'elle est creuse : il faut qu'il
 * y arrive plus d'eau qu'il n'en part. Ce qui arrive, c'est la pluie efficace
 * de son bassin versant ; ce qui part, c'est l'infiltration par le fond (que
 * le colmatage ralentit beaucoup) et l'évaporation de la surface libre. D'où
 * cette règle, qui vaut leçon d'agroforesterie : on ne creuse pas une mare
 * dans du sable.
 */
function assecherLesCuvettesQuiNeTiennentPas(
  eaux: EauxDuTerrain,
  dims: GridDims,
  seuilCoursDeauM2: number,
  pluieAnnuelleMm: number,
  profil: SoilProfile,
): void {
  const fond = profil[profil.length - 1];
  if (!fond) return;
  const fuiteMmAn = conductiviteHorizonMmSemaine(fond) * 52 * COLMATAGE_DU_FOND;
  const pertesMmAn = fuiteMmAn + EVAPORATION_PLAN_DEAU_MM_AN;
  for (const composante of plansDEauConnexes(eaux, dims)) {
    // Un cours d'eau est alimenté par l'amont : il n'a pas à se justifier.
    if (composante.some((i) => (eaux.accumulationM2[i] ?? 0) >= seuilCoursDeauM2)) continue;
    // Le bassin de la cuvette, c'est ce qui converge vers elle : la plus
    // grande accumulation qu'on y trouve. Ce qui tombe SUR le plan d'eau
    // compte pour la pluie entière — une surface libre ne transpire pas — ;
    // ce qui vient des terres alentour, seulement pour la part efficace.
    const bassinM2 = composante.reduce((m, i) => Math.max(m, eaux.accumulationM2[i] ?? 0), 0);
    const terresM2 = Math.max(0, bassinM2 - composante.length);
    const apportMmAn =
      pluieAnnuelleMm + (terresM2 * pluieAnnuelleMm * PART_EFFICACE) / composante.length;
    if (apportMmAn >= pertesMmAn) continue;
    for (const i of composante) {
      eaux.enEau[i] = false;
      eaux.niveauM[i] = 0;
    }
  }
}

/** Les plans d'eau connexes (8-connexité), chacun comme liste de cellules. */
function plansDEauConnexes(eaux: EauxDuTerrain, dims: GridDims): number[][] {
  const { widthM: w, heightM: h } = dims;
  const n = w * h;
  const vu = new Array<boolean>(n).fill(false);
  const composantes: number[][] = [];
  for (let depart = 0; depart < n; depart++) {
    if (!eaux.enEau[depart] || vu[depart]) continue;
    const composante: number[] = [];
    const pile = [depart];
    vu[depart] = true;
    while (pile.length > 0) {
      const i = pile.pop();
      if (i === undefined) continue;
      composante.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (vu[j] || !eaux.enEau[j]) continue;
          vu[j] = true;
          pile.push(j);
        }
      }
    }
    composantes.push(composante);
  }
  return composantes;
}

/**
 * Portée d'influence d'un plan d'eau selon sa taille : un cours d'eau draine
 * tout un versant, une flaque ne mouille que son bord. On mesure la taille en
 * étiquetant les plans d'eau connexes — deux mares distinctes n'ont ni la même
 * cote ni la même portée.
 */
function porteeDesPlansDEau(
  eaux: EauxDuTerrain,
  dims: GridDims,
  seuilCoursDeauM2: number,
): number[] {
  const portee = new Array<number>(dims.widthM * dims.heightM).fill(0);
  for (const composante of plansDEauConnexes(eaux, dims)) {
    // Un cours d'eau est alimenté en permanence : sa portée est celle d'un
    // drain de versant. Une mare ne vaut que par sa taille.
    const coursDeau = composante.some((i) => (eaux.accumulationM2[i] ?? 0) >= seuilCoursDeauM2);
    const rayonEquivalent = Math.sqrt(composante.length / Math.PI);
    const p = coursDeau ? 60 : Math.max(10, 6 * rayonEquivalent);
    for (const i of composante) portee[i] = p;
  }
  return portee;
}

/**
 * Les sources d'eau que le TERRAIN fabrique, prêtes pour le champ de nappe.
 * `undefined` si le terrain ne tient aucune eau — auquel cas la parcelle se
 * comporte comme avant, sans nappe locale.
 */
export function sourcesDuTerrain(
  altitudes: readonly number[],
  dims: GridDims,
  options: OptionsTerrain = {},
): SourcesEau | undefined {
  const eaux = eauxDuTerrain(altitudes, dims, options);
  if (!eaux.enEau.some(Boolean)) return undefined;
  return {
    enEau: eaux.enEau,
    niveauM: eaux.niveauM,
    porteeM: porteeDesPlansDEau(eaux, dims, options.seuilCoursDeauM2 ?? SEUIL_COURS_DEAU_M2),
  };
}
