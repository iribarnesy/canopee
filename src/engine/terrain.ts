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

import { type EauDeSurface, type SourcesEau, sourcesDeclarees } from "./eau_surface";
import type { GridDims } from "./grid";
import { pointDEntreeDAmont, voisineAval } from "./relief";
import { conductiviteHorizonMmSemaine, type SoilProfile } from "./soil";

/**
 * Surface drainée à partir de laquelle un talweg porte un cours d'eau
 * PERMANENT, m². Sous nos climats il faut plusieurs hectares — le chiffre
 * varie beaucoup avec la géologie, on prend cinq *(à calibrer)*.
 *
 * Conséquence voulue : aucune parcelle d'un hectare ne fabrique son ruisseau
 * toute seule. Un cours d'eau qui la traverse vient forcément de l'extérieur,
 * c'est-à-dire de son bassin d'amont. *(Un seuil bas — on avait commencé à
 * 1 500 m² — transformait la moindre rigole creusée en rivière.)*
 */
export const SEUIL_COURS_DEAU_M2 = 50_000;

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
  /** bassin versant de chaque cellule, m² — tout ce qui finit par lui parvenir */
  accumulationM2: Float32Array;
  /** surface drainée par un vrai talweg, m² : nulle sur les surfaces planes */
  accumulationTalwegM2: Float32Array;
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
  return floodPrioritaire(altitudes, dims).niveau;
}

/**
 * Le priority-flood, avec son ARBRE : en plus du niveau de remplissage, on
 * retient par quelle cellule chacune a été atteinte. Comme l'inondation part
 * des bords — les exutoires — et progresse vers l'intérieur, ce parent est la
 * cellule vers laquelle l'eau s'écoule. On obtient ainsi un réseau de drainage
 * valable PARTOUT, y compris sur les surfaces parfaitement planes où la
 * comparaison de voisines ne donne rien (aucune n'est plus basse), et à
 * l'intérieur des cuvettes pleines, où l'arbre conduit au déversoir.
 */
function floodPrioritaire(
  altitudes: readonly number[],
  dims: GridDims,
): { niveau: number[]; parent: Int32Array; ordre: number[] } {
  const { widthM: w, heightM: h } = dims;
  const n = w * h;
  const niveau = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(n).fill(-1);
  const ordre: number[] = [];
  const vu = new Array<boolean>(n).fill(false);
  const tas = new TasMin();
  const pousser = (i: number, cle: number, venantDe: number) => {
    if (vu[i]) return;
    vu[i] = true;
    niveau[i] = cle;
    parent[i] = venantDe;
    tas.pousser(cle, i);
  };
  for (let x = 0; x < w; x++) {
    pousser(x, altitudes[x] ?? 0, -1);
    pousser((h - 1) * w + x, altitudes[(h - 1) * w + x] ?? 0, -1);
  }
  for (let y = 0; y < h; y++) {
    pousser(y * w, altitudes[y * w] ?? 0, -1);
    pousser(y * w + w - 1, altitudes[y * w + w - 1] ?? 0, -1);
  }
  while (tas.taille > 0) {
    const i = tas.retirer();
    ordre.push(i);
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
        pousser(j, Math.max(altitudes[j] ?? 0, courant), i);
      }
    }
  }
  return { niveau, parent, ordre };
}

/**
 * Surface drainée par chaque cellule, m².
 *
 * On suit l'arbre du priority-flood plutôt que la voisine la plus basse : sur
 * une surface plane, aucune voisine n'est plus basse et la comparaison ne
 * donne rien — chaque cellule garderait son seul mètre carré, et aucune
 * cuvette n'aurait jamais de bassin versant. L'arbre, lui, conduit toujours
 * quelque part, parce qu'il a été construit depuis les exutoires.
 *
 * `apportAmontM2` est le bassin extérieur qui verse sur la parcelle : il entre
 * par la crête, comme l'eau du bilan hydrique (`entreesDAmont`).
 */
export function accumulationEcoulement(
  altitudes: readonly number[],
  dims: GridDims,
  apportAmontM2 = 0,
): Float32Array {
  return accumulationParArbre(altitudes, dims, apportAmontM2);
}

function accumulationParArbre(
  altitudes: readonly number[],
  dims: GridDims,
  apportAmontM2: number,
): Float32Array {
  const { parent, ordre } = floodPrioritaire(altitudes, dims);
  const n = dims.widthM * dims.heightM;
  const accumulation = new Float32Array(n).fill(1);
  if (apportAmontM2 > 0) {
    const hautes = Math.max(1, Math.round(n * 0.05));
    const parAltitude = altitudes
      .map((_, i) => i)
      .sort((a, b) => (altitudes[b] ?? 0) - (altitudes[a] ?? 0));
    for (let k = 0; k < hautes; k++) {
      const i = parAltitude[k];
      if (i !== undefined) accumulation[i] = (accumulation[i] ?? 0) + apportAmontM2 / hautes;
    }
  }
  // L'ordre du flood va des exutoires vers l'amont : on le remonte à l'envers
  // pour que chaque cellule ait reçu tout son amont avant de passer à l'aval.
  for (let k = ordre.length - 1; k >= 0; k--) {
    const i = ordre[k];
    if (i === undefined) continue;
    const j = parent[i] ?? -1;
    if (j >= 0) accumulation[j] = (accumulation[j] ?? 0) + (accumulation[i] ?? 0);
  }
  return accumulation;
}

/**
 * Surface drainée par un vrai TALWEG, m² : cette fois on suit la voisine la
 * plus pentue, et elle seule. Sur une surface plane il n'y en a pas, donc
 * l'accumulation y reste à un mètre carré — ce qui est le résultat voulu.
 *
 * Il faut bien les deux : l'arbre du flood conduit toujours quelque part, ce
 * qui donne un bassin versant partout, mais sur un plat il concentre l'eau
 * dans une branche arbitraire. S'en servir pour repérer les cours d'eau
 * inventerait des rivières au milieu d'une prairie parfaitement plane.
 */
function accumulationParPente(
  altitudesRemplies: readonly number[],
  dims: GridDims,
  apportAmontM2: number,
): Float32Array {
  const n = dims.widthM * dims.heightM;
  const accumulation = new Float32Array(n).fill(1);
  const ordre = altitudesRemplies
    .map((_, i) => i)
    .sort((a, b) => (altitudesRemplies[b] ?? 0) - (altitudesRemplies[a] ?? 0));
  if (apportAmontM2 > 0) {
    // Un vrai cours d'eau entre par un point — l'encoche de la bordure haute —
    // et non en nappe : c'est ce qui fait qu'il traverse la parcelle dans un
    // lit au lieu de l'inonder. En dessous, c'est du ruissellement diffus, et
    // il arrive par toute la crête.
    if (apportAmontM2 >= SEUIL_COURS_DEAU_M2) {
      const entree = pointDEntreeDAmont(altitudesRemplies, dims);
      if (entree >= 0) accumulation[entree] = (accumulation[entree] ?? 0) + apportAmontM2;
    } else {
      const hautes = Math.max(1, Math.round(n * 0.05));
      for (let k = 0; k < hautes; k++) {
        const i = ordre[k];
        if (i !== undefined) accumulation[i] = (accumulation[i] ?? 0) + apportAmontM2 / hautes;
      }
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
  const accumulation = accumulationParArbre(altitudes, dims, apportAmontM2);
  const talweg = accumulationParPente(remplies, dims, apportAmontM2);
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
    if ((talweg[i] ?? 0) >= seuilCoursDeauM2) {
      enEau[i] = true;
      niveauM[i] = sol;
    }
  }
  const eaux = { enEau, niveauM, accumulationM2: accumulation, accumulationTalwegM2: talweg };
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

/** Le bilan d'un plan d'eau : ce qu'il reçoit, ce qu'il perd, et sa survie. */
export interface BilanCuvette {
  /** cellules du plan d'eau, m² */
  surfaceM2: number;
  /** tout ce qui draine vers elle, m² */
  bassinM2: number;
  /** ce qu'elle reçoit, mm/an, ramenés à sa surface */
  apportMmAn: number;
  /** évaporation + fuite par le fond, mm/an */
  pertesMmAn: number;
  /** part des pertes due à l'infiltration (le reste est de l'évaporation) */
  fuiteMmAn: number;
  /** alimentée en permanence par un cours d'eau : le bilan ne s'applique pas */
  alimenteeParUnCoursDeau: boolean;
  tient: boolean;
}

/**
 * Une cuvette ne devient pas une mare parce qu'elle est creuse : il faut qu'il
 * y arrive plus d'eau qu'il n'en part. Ce qui arrive, c'est la pluie entière
 * tombée dessus — une surface libre ne transpire pas — plus la part efficace
 * de ce que ses terres lui envoient ; ce qui part, c'est l'évaporation et
 * l'infiltration par le fond, que le colmatage ralentit beaucoup.
 *
 * Deux conséquences que le joueur doit pouvoir lire : on ne creuse pas une
 * mare dans du sable, et une mare trop grande pour son bassin s'assèche —
 * l'évaporation croît avec la surface, l'apport non.
 */
export function bilanDesCuvettes(
  eaux: EauxDuTerrain,
  dims: GridDims,
  seuilCoursDeauM2: number,
  pluieAnnuelleMm: number,
  profil: SoilProfile,
): { composante: number[]; bilan: BilanCuvette }[] {
  const fond = profil[profil.length - 1];
  const fuiteMmAn = fond ? conductiviteHorizonMmSemaine(fond) * 52 * COLMATAGE_DU_FOND : 0;
  const pertesMmAn = fuiteMmAn + EVAPORATION_PLAN_DEAU_MM_AN;
  return plansDEauConnexes(eaux, dims).map((composante) => {
    const alimenteeParUnCoursDeau = composante.some(
      (i) => (eaux.accumulationTalwegM2[i] ?? 0) >= seuilCoursDeauM2,
    );
    const bassinM2 = composante.reduce((m, i) => Math.max(m, eaux.accumulationM2[i] ?? 0), 0);
    const terresM2 = Math.max(0, bassinM2 - composante.length);
    const apportMmAn =
      pluieAnnuelleMm + (terresM2 * pluieAnnuelleMm * PART_EFFICACE) / composante.length;
    return {
      composante,
      bilan: {
        surfaceM2: composante.length,
        bassinM2,
        apportMmAn,
        pertesMmAn,
        fuiteMmAn,
        alimenteeParUnCoursDeau,
        tient: alimenteeParUnCoursDeau || apportMmAn >= pertesMmAn,
      },
    };
  });
}

function assecherLesCuvettesQuiNeTiennentPas(
  eaux: EauxDuTerrain,
  dims: GridDims,
  seuilCoursDeauM2: number,
  pluieAnnuelleMm: number,
  profil: SoilProfile,
): void {
  for (const { composante, bilan } of bilanDesCuvettes(
    eaux,
    dims,
    seuilCoursDeauM2,
    pluieAnnuelleMm,
    profil,
  )) {
    if (bilan.tient) continue;
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
    const coursDeau = composante.some(
      (i) => (eaux.accumulationTalwegM2[i] ?? 0) >= seuilCoursDeauM2,
    );
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

/**
 * D'où vient l'eau libre d'une parcelle — déclarée ou déduite du modelé.
 *
 * Un seul endroit décide, et le moteur comme l'interface s'y adressent : sans
 * ça, la carte peut afficher une eau que la simulation ne connaît pas (ou
 * l'inverse), et le joueur ne voit pas le terrain qu'il a dessiné.
 */
export function sourcesDeLaParcelle(
  eau: EauDeSurface,
  altitudes: readonly number[],
  dims: GridDims,
  options: OptionsTerrain = {},
): SourcesEau | undefined {
  return eau.type === "terrain"
    ? sourcesDuTerrain(altitudes, dims, options)
    : sourcesDeclarees(eau, altitudes, dims);
}
