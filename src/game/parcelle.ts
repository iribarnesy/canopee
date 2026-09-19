/**
 * L'adaptateur instantané → scène : ce qui traduit ce que le moteur RAPPORTE
 * en ce que la couche visuelle POSE.
 *
 * **Il existait déjà, mais dans le harnais d'aperçu.** `src/apercu/jeu.tsx`
 * portait la traduction complète — les grilles du sol, les vingt-cinq champs
 * d'un arbre, le repli de chaque grandeur optionnelle — et le jeu, lui, n'avait
 * rien : il dessinait encore son propre canvas oblique. Brancher la couche
 * visuelle dans le jeu, c'était donc soit récrire cette traduction une deuxième
 * fois, soit la sortir de là. Ce fichier est la deuxième branche.
 *
 * **Rien ici ne calcule une règle.** Chaque champ est un champ du protocole,
 * renommé au plus vers le nom que le rendu lui donne, et les deux seules
 * opérations arithmétiques sont un rapport (`waterMm / ruMm`, le remplissage de
 * la réserve utile, que le rendu attend en fraction) et une soustraction de
 * semaines. Tout le reste voyage. C'est la règle de `docs/agents/jeu.md` :
 * quand une grandeur manque, elle se demande au moteur, elle ne se reconstitue
 * pas.
 *
 * **Les types d'entrée sont STRUCTURELS et non les types du protocole**, et
 * c'est délibéré. Deux appelants existent : le jeu, qui tient un `Snapshot`
 * vivant sorti du worker, et le banc d'aperçu, qui relit une scène cuite en
 * JSON — tableaux ordinaires là où le protocole a des tableaux typés, champs
 * rangés autrement. Exiger le `Snapshot` obligerait le banc à en fabriquer un,
 * c'est-à-dire à mentir sur ce qu'il a ; n'exiger que les champs lus laisse les
 * deux passer ce qu'ils ont vraiment.
 */

import { getEspece } from "../engine/especes";
import type { Bordures } from "../engine/paysage";
import { getPaysage } from "../engine/paysage";
import {
  type ContextePhenologique,
  partFoliaireOmbrageanteDans,
  senescenceDans,
} from "../engine/phenologie";
import type { ArbreAPoser } from "../render/couches/arbres";
import type { CoteDecor, DecorBordures } from "../render/couches/decor";
import type { DonneesSol } from "../render/couches/terrain";

/**
 * Ce qu'il faut d'un instantané pour poser le SOL.
 *
 * `ArrayLike<number>` plutôt que `Float32Array` : le jeu a des tableaux typés,
 * le banc a ce que `JSON.parse` rend, et les deux se lisent pareil.
 */
export interface SolSource {
  coteM: number;
  /** réserve utile, mm — le dénominateur du remplissage */
  ruMm: number;
  /** `StationInfo.altitudesM` */
  altitudesM: readonly number[];
  /** `Snapshot.soilWater` */
  waterMm: ArrayLike<number>;
  /** `Snapshot.soilHerbe` */
  herbe: ArrayLike<number>;
  /** `Snapshot.soilHerbeBiomasse` */
  herbeBiomasse: ArrayLike<number>;
  /** `Snapshot.soilLitiereCG` */
  litiereCG: ArrayLike<number>;
  /** `Snapshot.soilLumiere` */
  lumiere?: ArrayLike<number>;
  /** `Snapshot.soilHerbeHumidite` */
  herbeHumidite?: ArrayLike<number>;
  /** `Snapshot.soilHerbeEmprises` : une grille par espèce, 0-255 */
  herbeEmprises?: readonly Uint8Array[];
  /** `Snapshot.herbesIds` : les espèces, dans l'ordre des grilles */
  herbesIds?: readonly string[];
  /** `StationInfo.enEau` */
  enEau?: readonly boolean[];
  /** `Snapshot.soilDebordementMm` */
  debordementMm?: ArrayLike<number>;
  /** `Snapshot.soilBoisAuSol` */
  boisAuSol?: ArrayLike<number>;
  /** `Snapshot.soilBoisEnTravers` */
  boisEnTravers?: ArrayLike<number>;
  /** `StationInfo.bassinAmontHa` : la surface amont, pour la crête du décor */
  bassinAmontHa?: number;
}

/**
 * Les grilles du sol, dans la forme que le terrain attend.
 *
 * La seule règle appliquée est le remplissage de la réserve utile : le moteur
 * compte des millimètres d'eau, le rendu veut une fraction ∈ [0,1], et le
 * rapport des deux est la définition même du remplissage — pas un modèle.
 */
export function donneesSolDe(src: SolSource): DonneesSol {
  const n = src.coteM * src.coteM;
  const humidite = new Float32Array(n);
  // Un `ruMm` nul viderait la carte par une division par zéro ; une station
  // sans réserve utile n'existe pas, mais une scène tronquée, si.
  const ru = Math.max(1e-6, src.ruMm);
  for (let i = 0; i < n; i++) {
    humidite[i] = Math.min(1, Math.max(0, (src.waterMm[i] ?? 0) / ru));
  }
  return {
    coteM: src.coteM,
    altitudesM: src.altitudesM,
    ...(src.bassinAmontHa === undefined ? {} : { bassinAmontHa: src.bassinAmontHa }),
    humidite,
    herbe: Float32Array.from(src.herbe),
    herbeBiomasse: Float32Array.from(src.herbeBiomasse),
    litiereCG: Float32Array.from(src.litiereCG),
    ...(src.lumiere ? { lumiere: Float32Array.from(src.lumiere) } : {}),
    ...(src.herbeHumidite ? { herbeHumidite: Float32Array.from(src.herbeHumidite) } : {}),
    // Gardées par RÉFÉRENCE, contrairement aux autres grilles : ce sont les
    // tableaux de l'instantané, que le worker refabrique à chaque semaine et ne
    // touche plus une fois postés. Les recopier coûterait une copie par semaine
    // pour rien — et le rendu ramène l'emprise en [0,1] au moment de colorer,
    // sans jamais écrire dedans.
    ...(src.herbeEmprises && src.herbesIds
      ? { herbeEmprises: src.herbeEmprises, herbesIds: src.herbesIds }
      : {}),
    ...(src.enEau ? { enEau: src.enEau } : {}),
    ...(src.debordementMm ? { debordementMm: Float32Array.from(src.debordementMm) } : {}),
    ...(src.boisAuSol ? { boisAuSol: Float32Array.from(src.boisAuSol) } : {}),
    ...(src.boisEnTravers ? { boisEnTravers: Float32Array.from(src.boisEnTravers) } : {}),
  };
}

/**
 * Un arbre tel que l'instantané le décrit — le sous-ensemble de `SnapshotTree`
 * que le dessin lit, et rien de plus.
 */
export interface ArbreSource {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  chandelle: boolean;
  baseHouppierM?: number;
  teteTrogneM?: number;
  floraison?: number;
  fruitProgress?: number;
  fruitsKg?: number;
  vigueur?: number;
  dommageHydraulique?: number;
  /** présent = le feu l'a tué */
  brulEeSemaine?: number;
  protege?: boolean;
  recepages?: number;
  frotteSemaine?: number;
  brouteSemaine?: number;
  derniereLeveeSemaine?: number;
  diametreTeteCm?: number;
  caviteTeteL?: number;
}

/** Ce que la parcelle sait, et que l'arbre seul ne dit pas. */
export interface ContexteDePose {
  coteM: number;
  /** `Snapshot.week` — l'origine des durées (écorce levée) */
  week: number;
  /** `StationInfo.altitudesM` : c'est elle qui donne le `z` de chaque arbre */
  altitudesM: readonly number[];
  /**
   * `Snapshot.pheno` : le calendrier foliaire de la semaine.
   *
   * Absent, tout arbre porte son feuillage plein et aucune sénescence — le
   * repli honnête de « on ne sait pas quelle saison il est », et non une
   * saison choisie au hasard.
   */
  pheno?: ContextePhenologique;
  /**
   * Les arbres que l'incendie est en train de torcher, s'il y en a.
   *
   * **Un arbre que l'ellipse va torcher part VIVANT**, et c'est la seule façon
   * d'avoir quoi que ce soit à animer : l'instantané le décrit APRÈS
   * l'incendie — tronc charbonné, sans feuilles — et une mise en scène qui
   * partirait de là interpolerait du néant vers le néant. Ce qu'on remet n'est
   * pas inventé : c'est ce que la phénologie du moteur dit de cette espèce à
   * cette semaine. Le canal `mourant` le rend ensuite à l'état que l'instantané
   * décrit, image par image.
   */
  seTorche?: (id: number) => boolean;
}

/** Altitude du sol sous un point de la parcelle, m. */
function altitudeSous(ctx: ContexteDePose, x: number, y: number): number {
  const ix = Math.min(ctx.coteM - 1, Math.max(0, Math.floor(x)));
  const iy = Math.min(ctx.coteM - 1, Math.max(0, Math.floor(y)));
  return ctx.altitudesM[iy * ctx.coteM + ix] ?? 0;
}

/**
 * Les arbres de l'instantané, dans la forme que la couche des arbres attend.
 *
 * Les arbres de hauteur nulle sont écartés : le moteur en porte pendant la
 * semaine de leur plantation, et une vignette de zéro mètre n'a pas de classe.
 */
export function arbresAPoser(arbres: readonly ArbreSource[], ctx: ContexteDePose): ArbreAPoser[] {
  const poses: ArbreAPoser[] = [];
  for (const t of arbres) {
    if (t.heightM <= 0) continue;
    const espece = getEspece(t.especeId);
    const torche = ctx.seTorche?.(t.id) ?? false;
    const part = espece && ctx.pheno ? partFoliaireOmbrageanteDans(espece, ctx.pheno) : 1;
    poses.push({
      id: t.id,
      especeId: t.especeId,
      x: t.x,
      y: t.y,
      z: altitudeSous(ctx, t.x, t.y),
      heightM: t.heightM,
      houppierRatio: espece?.lumiere.houppierRatio ?? 0.4,
      baseHouppierM: t.baseHouppierM ?? 0,
      ...(t.teteTrogneM ? { teteTrogneM: t.teteTrogneM } : {}),
      ...(t.chandelle && !torche ? { chandelle: true } : {}),
      ...(t.brulEeSemaine === undefined || torche ? {} : { brulee: true }),
      ...(t.protege ? { protege: true } : {}),
      ...(t.recepages ? { recepages: t.recepages } : {}),
      ...(t.frotteSemaine === undefined ? {} : { frotte: true }),
      ...(t.brouteSemaine === undefined ? {} : { broute: true }),
      ...(t.diametreTeteCm ? { diametreTeteCm: t.diametreTeteCm } : {}),
      ...(t.caviteTeteL ? { caviteTeteL: t.caviteTeteL } : {}),
      // Fleurs et fruits, que le banc de la vue laissait tomber en route : les
      // champs étaient déclarés dans sa scène et n'arrivaient nulle part, si
      // bien qu'un verger en fleur se dessinait comme un taillis. Les planches
      // d'espèces, elles, les posaient — d'où un défaut qu'aucune capture
      // n'avait montré.
      ...(t.floraison ? { floraison: t.floraison } : {}),
      ...(t.fruitProgress ? { fruitProgress: t.fruitProgress } : {}),
      ...(t.fruitsKg ? { fruitsKg: t.fruitsKg } : {}),
      // Une DURÉE, pas une présence : le moteur donne la semaine du dernier
      // démasclage, donc on peut dire où en est l'écorce et pas seulement
      // qu'elle a été levée.
      ...(t.derniereLeveeSemaine === undefined
        ? {}
        : { semainesDepuisLevee: Math.max(0, ctx.week - t.derniereLeveeSemaine) }),
      partFoliaire: t.chandelle && !torche ? 0 : part,
      senescence: espece && ctx.pheno ? senescenceDans(espece, ctx.pheno) : 0,
      vigueur: torche ? 1 : (t.vigueur ?? 1),
      ...(t.dommageHydraulique ? { dommageHydraulique: t.dommageHydraulique } : {}),
    });
  }
  return poses;
}

/**
 * Les quatre bordures, réduites à ce dont le décor a besoin.
 *
 * Trois parts et les ESSENCES, par côté. Le rendu n'a que faire du gibier ou
 * des dépôts d'azote — mais les semenciers, si : ce sont eux qui disent de quoi
 * est fait le bois d'à côté, et sans eux un massif de pins de lande se dessine
 * comme une hêtraie. Le poids est le `semisParAn` du paysage, tel quel : c'est
 * le seul classement d'abondance que le moteur donne.
 */
export function decorDesBordures(bordures: Bordures): DecorBordures {
  const cote = (nom: keyof Bordures): CoteDecor => {
    const p = getPaysage(bordures[nom]);
    return {
      boise: p.partBoisee,
      cultive: p.partCultivee,
      urbain: p.partUrbaine,
      especes: p.semenciers.map((s) => ({ especeId: s.especeId, poids: s.semisParAn })),
    };
  };
  return { nord: cote("nord"), est: cote("est"), sud: cote("sud"), ouest: cote("ouest") };
}
