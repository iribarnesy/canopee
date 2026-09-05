/**
 * Cycle de l'azote d'UNE cellule de 1 m², en grammes (1 kg/ha = 0,1 g/m²) :
 *   1. minéralisation (f(T°, humidité, anoxie)) ;
 *   2. prélèvement par les arbres dont les racines occupent la cellule —
 *      alloué spatialement par tick.ts : chaque arbre a un besoin en grammes
 *      (exigence de l'espèce × taille) et une capacité d'extraction (∝ taille
 *      × disponibilité locale). Un frugal est comblé là où un exigeant a faim ;
 *   3. lessivage proportionnel au drainage de la cellule.
 * Invariant testé : minéralisation = prélèvements + lessivage + Δstock.
 * V1 : litières avec C/N, immobilisation (faim d'azote), restitutions.
 */

export const KG_PER_HA_TO_G_PER_M2 = 0.1;

/** Facteur température de la minéralisation (Q10 ≈ 2, référence 12 °C). */
function temperatureFactor(tMean: number): number {
  if (tMean <= 0) return 0;
  return Math.min(3, 2 ** ((tMean - 12) / 10));
}

/** Facteur humidité : optimal sol frais, ralenti sol sec, ralenti par l'anoxie. */
function moistureFactor(moistureRatio: number, waterloggingRatio: number): number {
  const dryness = Math.min(1, moistureRatio / 0.5);
  const anoxia = 1 - 0.7 * waterloggingRatio;
  return dryness * anoxia;
}

/**
 * Facteur climatique commun de l'activité des décomposeurs (humus ET litière) :
 * T°, humidité, anoxie — la boucle microbienne du ch2-B.
 */
export function decompositionClimateFactor(
  tMean: number,
  moistureRatio: number,
  waterloggingRatio: number,
): number {
  return temperatureFactor(tMean) * moistureFactor(moistureRatio, waterloggingRatio);
}

/**
 * Vitesse de décomposition de base d'une litière, /semaine à conditions
 * optimales, dérivée de son C/N : aulne (C/N 15) ≈ 0,04, aiguilles de pin
 * (C/N 60) ≈ 0,01 *(à calibrer)*.
 */
export function litterDecayRate(cnRatio: number): number {
  return 0.6 / Math.max(1, cnRatio);
}

export interface CellMineralizationInput {
  /** minéralisation potentielle de la cellule, g/m²/semaine en conditions optimales */
  potentialGWeek: number;
  tMean: number;
  /** remplissage de la réserve utile de la cellule ∈ [0,1] */
  moistureRatio: number;
  waterloggingRatio: number;
}

/** Azote libéré par l'humus de la cellule cette semaine, g. */
export function cellMineralization(input: CellMineralizationInput): number {
  return (
    input.potentialGWeek *
    decompositionClimateFactor(input.tMean, input.moistureRatio, input.waterloggingRatio)
  );
}

/**
 * Rendement de croissance microbienne : part du carbone d'un substrat que les
 * décomposeurs assimilent (le reste part en CO₂). C'est la même valeur que
 * l'humification de la litière — ce sont deux façons de dire la même chose.
 */
export const RENDEMENT_MICROBIEN = 0.3;

/** Rapport C/N de la biomasse microbienne : ~8, très azotée. */
export const CN_MICROBES = 8;

/**
 * Azote NET libéré par la décomposition d'un substrat, g.
 *
 * Les décomposeurs ont besoin d'azote pour construire leur propre biomasse.
 * Si le substrat n'en contient pas assez — au-delà d'un C/N d'environ 27 —
 * ils vont le chercher dans le sol : c'est la **faim d'azote**, bien connue de
 * quiconque a enfoui du BRF ou de la paille. L'azote n'est pas perdu, il est
 * IMMOBILISÉ ; il reviendra quand ces micro-organismes mourront à leur tour.
 *
 * Valeur négative = immobilisation (le sol se fait ponctionner).
 */
export function azoteNetDecomposition(carboneDecomposeG: number, azoteDecomposeG: number): number {
  const besoin = (carboneDecomposeG * RENDEMENT_MICROBIEN) / CN_MICROBES;
  return azoteDecomposeG - besoin;
}

/**
 * Stock d'azote minéral pour lequel une racine prélève à la MOITIÉ de sa
 * capacité : 0,5 g/m², soit 5 kg N/ha.
 *
 * La version précédente écrivait ce frein comme une rampe linéaire saturant à
 * 3 g/m² — 30 kg N/ha — et cela ne tenait pas debout de deux façons.
 *
 * D'ABORD L'ÉCHELLE. Un sol forestier ne porte jamais 30 kg N/ha de minéral en
 * même temps : le nôtre plafonne à 1,9 g/m² sur le limon riche et 0,5 sur la
 * lande. Le frein était donc actif EN PERMANENCE, partout, sur toutes les
 * stations — jamais une racine ne prélevait librement.
 *
 * ENSUITE LA FORME. Un prélèvement racinaire sature (cinétique de
 * Michaelis-Menten sur la concentration en solution), il ne croît pas
 * linéairement jusqu'à un couperet. Et la mesure de terrain va plus loin :
 * dans neuf forêts tempérées suivies sur une saison (Nadelhoffer et al., *Plant
 * and Soil*), le nitrate est prélevé à un rythme RÉGULIER alors même que les
 * stocks d'ammonium et la minéralisation nette fluctuent fortement d'un mois à
 * l'autre. Autrement dit : l'arbre vit du FLUX de minéralisation qu'il
 * intercepte, et le stock debout est petit précisément parce que le
 * prélèvement est rapide. Un modèle qui bride le prélèvement à proportion du
 * stock inverse la causalité.
 *
 * La demi-saturation est donc placée BAS, dans le bas de la gamme des stocks
 * minéraux observés en forêt tempérée *(à calibrer : aucune source ne publie
 * cette constante sous cette forme — c'est une inférence de la gamme des
 * stocks et de la régularité du prélèvement)*.
 *
 * Ce changement a été soumis à une réfutation avant d'être retenu : les trois
 * essences dont la vitesse de croissance n'est PAS calée sur les tables de
 * production (pin, aulne, frêne) auraient dû se mettre à les dépasser si le
 * frein compensait autre chose. Elles restent à +6 %, +1 % et +2 % à quarante
 * ans (`hauteurs.test.ts`).
 */
export const DEMI_SATURATION_G_M2 = 0.5;

/**
 * Frein de dilution ∈ [0,1] : un sol pauvre se prélève lentement, mais un sol
 * ordinaire n'est pas bridé pour autant.
 */
export function nitrogenAvailabilityFactor(stockG: number): number {
  return stockG / (DEMI_SATURATION_G_M2 + stockG);
}

/**
 * Lessivage d'une cellule : l'azote en solution part avec l'eau qui draine
 * (modèle de mélange : fraction = eau partie / eau totale).
 */
export function cellLeachedG(stockG: number, drainageMm: number, soilWaterMm: number): number {
  const leachFraction = drainageMm / Math.max(1e-9, drainageMm + soilWaterMm);
  return stockG * leachFraction;
}
