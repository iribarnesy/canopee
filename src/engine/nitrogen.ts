/**
 * Cycle de l'azote d'**une** cellule de 1 m², en grammes (1 kg/ha = 0,1 g/m²) :
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
 * Facteur climatique commun de l'activité des décomposeurs (humus **et** litière) :
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
 * Azote **net** libéré par la décomposition d'un substrat, g.
 *
 * Les décomposeurs ont besoin d'azote pour construire leur propre biomasse.
 * Si le substrat n'en contient pas assez — au-delà d'un C/N d'environ 27 —
 * ils vont le chercher dans le sol : c'est la **faim d'azote**, bien connue de
 * quiconque a enfoui du BRF ou de la paille. L'azote n'est pas perdu, il est
 * **immobilisé** ; il reviendra quand ces micro-organismes mourront à leur tour.
 *
 * Valeur négative = immobilisation (le sol se fait ponctionner).
 */
export function azoteNetDecomposition(carboneDecomposeG: number, azoteDecomposeG: number): number {
  const besoin = (carboneDecomposeG * RENDEMENT_MICROBIEN) / CN_MICROBES;
  return azoteDecomposeG - besoin;
}

/**
 * Stock d'azote minéral pour lequel une racine prélève à la **moitié** de sa
 * capacité : 0,5 g/m², soit 5 kg N/ha.
 *
 * La version précédente écrivait ce frein comme une rampe linéaire saturant à
 * 3 g/m² — 30 kg N/ha — et cela ne tenait pas debout de deux façons.
 *
 * **D'abord l'échelle**. Un sol forestier ne porte jamais 30 kg N/ha de minéral en
 * même temps : le nôtre plafonne à 1,9 g/m² sur le limon riche et 0,5 sur la
 * lande. Le frein était donc actif **en permanence**, partout, sur toutes les
 * stations — jamais une racine ne prélevait librement.
 *
 * **Ensuite la forme**. Un prélèvement racinaire sature (cinétique de
 * Michaelis-Menten sur la concentration en solution), il ne croît pas
 * linéairement jusqu'à un couperet. Et la mesure de terrain va plus loin :
 * dans neuf forêts tempérées suivies sur une saison (Nadelhoffer et al., *Plant
 * and Soil*), le nitrate est prélevé à un rythme **régulier** alors même que les
 * stocks d'ammonium et la minéralisation nette fluctuent fortement d'un mois à
 * l'autre. Autrement dit : l'arbre vit du **flux** de minéralisation qu'il
 * intercepte, et le stock debout est petit précisément parce que le
 * prélèvement est rapide. Un modèle qui bride le prélèvement à proportion du
 * stock inverse la causalité.
 *
 * La demi-saturation est donc placée **bas**, dans le bas de la gamme des stocks
 * minéraux observés en forêt tempérée *(à calibrer : aucune source ne publie
 * cette constante sous cette forme — c'est une inférence de la gamme des
 * stocks et de la régularité du prélèvement)*.
 *
 * Ce changement a été soumis à une réfutation avant d'être retenu : les trois
 * essences dont la vitesse de croissance n'est **pas** calée sur les tables de
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
 *
 * **Ne lui donner que la part nitrique** (#280). L'ammonium est un cation, il
 * tient sur le complexe d'échange et ne suit pas l'eau ; le nitrate est un
 * anion et la suit entièrement. Passer le stock minéral entier à cette
 * fonction, ce que le moteur faisait, revenait à lessiver un cinquième
 * d'azote qui ne bouge pas.
 */
export function cellLeachedG(stockG: number, drainageMm: number, soilWaterMm: number): number {
  const leachFraction = drainageMm / Math.max(1e-9, drainageMm + soilWaterMm);
  return stockG * leachFraction;
}

/**
 * Part de l'ammonium nitrifiée en une semaine **au régime optimal** (#280).
 *
 * Ce que la littérature agronomique donne n'est pas un taux hebdomadaire mais
 * une durée : l'ammonium apporté à un sol chaud est **essentiellement nitrifié
 * en deux à quatre semaines**, ce qui est la raison d'être de la règle des
 * apports d'automne (« remember 50 degrees » : au-dessus de 10 °C, l'azote
 * ammoniacal qu'on apporte ne reste pas ammoniacal). Une fraction de 0,6 par
 * semaine vide 97 % du pool en quatre semaines et 84 % en deux : c'est le
 * milieu de cette fourchette *(à calibrer)*.
 *
 * **Ce n'est pas ce chiffre qui porte le lot**, et c'est ce qui permet de
 * l'admettre imprécis. La part d'ammonium en sortie d'hiver — la grandeur
 * qu'on confronte au relevé — ne dépend presque pas de lui : elle dépend du
 * temps passé sous 5 °C, où le facteur de température l'annule de toute façon.
 */
export const NITRIFICATION_MAX_SEMAINE = 0.6;

/**
 * Frein de la température sur la nitrification ∈ [0,1] (#280).
 *
 * **Deux points tenus, et ils viennent du dehors** : une paramétrisation
 * publiée donne « 50 % reduction at 12 °C and 100 % at 5 °C », avec un régime
 * plein entre 15 et 35 °C. La rampe passe donc exactement par (5 ; 0),
 * (12 ; 0,5) et (15 ; 1), en deux segments — ce n'est pas une courbe lissée
 * faute de mieux, c'est la droite qui relie les points mesurés.
 *
 * La règle agronomique nord-américaine dit la même chose plus grossièrement
 * (« remember 50 degrees », soit 10 °C) en précisant que la nitrification
 * **ne s'arrête pas tout à fait** avant 0 °C. Le zéro à 5 °C est donc un peu
 * dur, et c'est assumé : l'écart porte sur des semaines où le stock ne bouge
 * de toute façon presque pas.
 *
 * **Hors domaine, et dit** : au-delà de 35 °C la nitrification décline, ce que
 * cette fonction ignore. Aucune moyenne hebdomadaire du moteur n'y monte.
 */
export function facteurTemperatureNitrification(tMean: number): number {
  if (tMean <= 5) return 0;
  if (tMean >= 15) return 1;
  // (5 ; 0) → (12 ; 0,5) puis (12 ; 0,5) → (15 ; 1)
  if (tMean <= 12) return (0.5 * (tMean - 5)) / 7;
  return 0.5 + (0.5 * (tMean - 12)) / 3;
}

/**
 * Frein de l'acidité sur la nitrification ∈ [0,1] (#280).
 *
 * **Plus raide que le frein de la vie du sol en général** (`facteurPhBiologie`,
 * soil.ts), et c'est le fait : les nitrifiants autotrophes classiques ne
 * croissent pas sous pH 5,5, quand la minéralisation, elle, continue. Relever
 * le pH stimule la nitrification sur toute la gamme 4,8-8,5.
 *
 * Elle ne tombe pas à zéro pour autant — « nitrification continued at much
 * lower rates at pH values of 3 to 4.8 », le travail des archées —, d'où le
 * plancher à 0,1. C'est **la raison pour laquelle un sol forestier acide
 * accumule son azote sous forme ammoniacale**, fait documenté de longue date,
 * et le moteur le rendra sans qu'on l'ait écrit.
 *
 * Le plancher et le plein régime sont deux lectures de sources qualitatives
 * *(à calibrer)* ; ce qui est solide est la **forme** — bas et plat en acide,
 * plein vers la neutralité.
 */
export function facteurPhNitrification(ph: number): number {
  if (ph <= 5) return 0.1;
  if (ph >= 7) return 1;
  return 0.1 + (0.9 * (ph - 5)) / 2;
}

/**
 * Ce qu'une cellule nitrifie en une semaine, en grammes (#280).
 *
 * L'ammonium qui reste ne « résiste » pas : il attend simplement qu'il fasse
 * assez chaud, ou que le sol soit assez peu acide, pour que les nitrifiants
 * travaillent. C'est pour ça que le partage entre les deux formes ne se
 * déclare nulle part — il **tombe** du climat et du pH de la cellule.
 */
export function nitrifieG(ammoniacalG: number, tMean: number, ph: number): number {
  const part =
    NITRIFICATION_MAX_SEMAINE * facteurTemperatureNitrification(tMean) * facteurPhNitrification(ph);
  return Math.max(0, Math.min(ammoniacalG, ammoniacalG * part));
}
