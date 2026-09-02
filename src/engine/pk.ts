/**
 * Phosphore et potassium (docs/regles.md §4 ; critère C11).
 *
 * Le moteur ne connaissait qu'un nutriment, l'azote. C'est le plus souvent le
 * bon candidat en forêt tempérée — mais pas toujours, et les deux autres ne se
 * comportent pas du tout comme lui. Les copier-coller aurait été la mauvaise
 * réponse ; ce qui suit modélise ce qui les distingue.
 *
 * **Le phosphore ne circule pas.** Il diffuse de l'ordre du millimètre dans le
 * sol : une racine épuise son voisinage immédiat et n'atteint jamais le reste.
 * Il ne se lessive pratiquement pas — mais il se **rétrograde** : en sol acide
 * il précipite avec le fer et l'aluminium, en sol calcaire avec le calcium.
 * D'où une disponibilité en cloche autour de pH 6,5, et un immense stock
 * inutilisable dans les sols des deux extrêmes. C'est LE nutriment pour lequel
 * les mycorhizes valent leur prix : le mycélium va chercher là où la racine ne
 * peut pas.
 *
 * **Le potassium circule trop.** C'est un ion libre, retenu seulement par le
 * complexe d'échange (argiles et humus). Sur un sable pauvre en argile, il part
 * avec l'eau de drainage ; sur une argile, il est tenu. Il n'entre pas dans les
 * molécules du vivant — il n'est donc quasiment pas immobilisé dans la matière
 * organique, et la pluie le lessive des feuilles avant même qu'elles tombent.
 *
 * Non modélisé : le calcium et le magnésium, la fertilisation minérale, les
 * différences d'exigence entre espèces (les besoins en P et K sont pris
 * proportionnels au besoin en azote, faute de données fiables par essence).
 *
 * Les deux cycles sont complets, conservatifs et **branchés sur la loi du
 * minimum** : altération de la roche sur tout le profil, dépôts
 * atmosphériques, prélèvement stœchiométrique de l'azote réellement absorbé,
 * retour à la chute des feuilles, rétrogradation du phosphore vers les formes
 * fixées, tampon du potassium par la réserve non échangeable, lessivage freiné
 * par le complexe d'échange.
 *
 * Trois erreurs ont dû être corrigées avant que ça tienne, et elles valent
 * d'être notées :
 *  1. le prélèvement suivait la DEMANDE et non l'azote réellement absorbé —
 *     un arbre bridé par l'azote se gavait de potassium ;
 *  2. l'altération ne comptait que l'horizon de surface, alors que les racines
 *     vont la chercher dans tout le profil ;
 *  3. il manquait l'**altération biologique** : sans elle, les stocks se
 *     vidaient en soixante ans et brancher ces facteurs mettait le feu à une
 *     friche limoneuse. C'est le mécanisme qui a tout débloqué — et, au
 *     passage, celui qui donne enfin une fonction aux mycorhizes.
 */

import type { Horizon } from "./soil";

/**
 * Besoin en phosphore rapporté au besoin en azote. La biomasse ligneuse tourne
 * autour de N:P ≈ 11:1 *(à calibrer)*.
 */
export const RATIO_P_SUR_N = 0.09;

/** Besoin en potassium rapporté au besoin en azote (N:K ≈ 1,8:1). */
export const RATIO_K_SUR_N = 0.55;

/**
 * Disponibilité du phosphore selon le pH : une cloche centrée sur 6,5.
 * En dessous de 5,5 le fer et l'aluminium le piègent ; au-dessus de 7,5 c'est
 * le calcium. Aux deux extrêmes, un sol peut être riche en phosphore TOTAL et
 * affamer les plantes — c'est le paradoxe classique des sols acides tropicaux
 * comme des rendzines calcaires.
 */
export function disponibilitePhosphore(ph: number): number {
  const ecart = (ph - 6.5) / 1.6;
  return Math.max(0.12, Math.exp(-ecart * ecart));
}

/**
 * Part du phosphore disponible qui repasse chaque semaine en formes fixées.
 * D'autant plus forte que le pH s'éloigne de l'optimum *(à calibrer)*.
 */
export function retrogradationHebdo(ph: number): number {
  // Même au pH optimal, une part du phosphore libéré est aussitôt reprise par
  // les oxydes et les micro-organismes : la fixation ne s'arrête jamais, elle
  // s'aggrave seulement aux extrêmes. Sans ce plancher, le phosphore
  // assimilable s'accumulait jusqu'à des niveaux de sol fertilisé.
  return 0.004 + 0.05 * (1 - disponibilitePhosphore(ph));
}

/** Part du phosphore fixé qui redevient disponible chaque semaine (lente). */
export const RELARGAGE_HEBDO = 0.0004;

/**
 * Capacité d'échange cationique, en cmol+/kg : ce que le sol peut retenir de
 * potassium. Elle vient des argiles (~50 cmol+/kg pour l'argile pure) et de
 * l'humus (~200), et c'est elle qui décide si le potassium reste ou s'en va.
 */
export function capaciteEchange(h: Horizon): number {
  return 50 * h.argile + 2 * h.moPct;
}

/**
 * Libération hebdomadaire par altération de la roche, g/m².
 *
 * Le phosphore vient des apatites, le potassium des micas et des feldspaths :
 * dans les deux cas, des minéraux que les argiles accompagnent. Un sable pur
 * n'a presque rien à libérer, une argile beaucoup — c'est pourquoi les sols
 * sableux sont pauvres en potassium *(ordres de grandeur : 1 kg P/ha/an et
 * 15 kg K/ha/an sur un sol argileux, à calibrer)*.
 */
/**
 * Accélération de l'altération par la rhizosphère.
 *
 * C'est le mécanisme qui manquait, et ce n'est pas un détail de calibration :
 * les racines et surtout les champignons ectomycorhiziens **dissolvent la
 * roche**. Ils exsudent des acides organiques et des sidérophores qui attaquent
 * les apatites et les micas, et vont chercher le phosphore et le potassium là
 * où l'eau seule ne les libérerait qu'en millénaires. Les mesures donnent des
 * facteurs de deux à dix par rapport à l'altération purement chimique.
 *
 * Deux conséquences qui changent le jeu : une forêt **fabrique en partie sa
 * propre fertilité minérale** au lieu de seulement puiser dans un stock, et le
 * réseau mycorhizien cesse d'être un état décoratif — c'est ici qu'il gagne sa
 * vie *(à calibrer)*.
 */
export const FACTEUR_RHIZOSPHERE = 4;

export function facteurAlterationBiologique(reseauMycorhizien: number): number {
  return 1 + FACTEUR_RHIZOSPHERE * Math.min(1, Math.max(0, reseauMycorhizien));
}

function alterationG(profil: readonly Horizon[], parAnPour30cm: number, partSable: number): number {
  let total = 0;
  for (const h of profil) {
    // L'altération se produit dans TOUT le profil, et les racines vont la
    // chercher en profondeur — ne compter que l'horizon de surface vidait le
    // potassium sous les arbres sans que rien ne le remplace.
    total +=
      parAnPour30cm *
      (partSable + (1 - partSable) * h.argile) *
      (1 - h.pierrosite) *
      (h.epaisseurCm / 30);
  }
  return total / 52;
}

export function alterationPhosphoreG(profil: readonly Horizon[]): number {
  return alterationG(profil, 0.1, 0.2);
}

export function alterationPotassiumG(profil: readonly Horizon[]): number {
  return alterationG(profil, 1.5, 0.15);
}

/**
 * Lessivage du potassium : comme l'azote, il part avec l'eau qui draine — mais
 * le complexe d'échange le retient d'autant mieux qu'il est fourni.
 */
export function lessivagePotassiumG(
  stockG: number,
  drainageMm: number,
  eauSolMm: number,
  cec: number,
): number {
  const fractionEau = drainageMm / Math.max(1e-9, drainageMm + eauSolMm);
  // Le complexe retient très efficacement : sous forêt, les pertes réelles se
  // comptent en quelques kilos par hectare et par an, pas en dizaines. Seuls
  // les sables, presque sans argile ni humus, laissent filer *(à calibrer)*.
  const retention = Math.min(0.995, cec / (cec + 0.2));
  return stockG * fractionEau * (1 - retention);
}

/**
 * Facteur de croissance d'un nutriment : plafonne à 1 dès que le stock couvre
 * confortablement le besoin, s'effondre quand il manque. Même forme que pour
 * l'azote — c'est la loi du minimum qui fait le reste.
 */
export function facteurNutriment(stockG: number, saturationG: number): number {
  return Math.min(1, stockG / Math.max(1e-9, saturationG));
}

/**
 * Vitesse d'échange entre le potassium ÉCHANGEABLE (celui que les racines
 * prennent) et la RÉSERVE non échangeable, coincée entre les feuillets des
 * argiles.
 *
 * Cette réserve est le tampon du sol : elle relargue quand la solution
 * s'appauvrit et réabsorbe quand elle s'enrichit. Sans elle, chaque cellule se
 * vidait sous les racines en une saison et le potassium devenait limitant
 * partout — ce qu'aucune forêt sur limon ne connaît *(à calibrer)*.
 */
export const ECHANGE_RESERVE_K = 0.02;

/**
 * Échange hebdomadaire réserve ↔ échangeable, g/m² (positif = la réserve
 * relargue). Il ramène l'échangeable vers son niveau d'équilibre.
 */
export function echangeReserveK(
  echangeableG: number,
  reserveG: number,
  equilibreG: number,
): number {
  const ecart = equilibreG - echangeableG;
  if (ecart > 0) return Math.min(reserveG, ecart * ECHANGE_RESERVE_K);
  return ecart * ECHANGE_RESERVE_K;
}

/**
 * Seuils de carence : au-dessus, le nutriment ne freine plus.
 *
 * Ce sont des seuils d'ANALYSE DE SOL, pas des besoins annuels, et des seuils
 * FORESTIERS — bien plus bas que les seuils agronomiques. Un arbre mycorhizé
 * qui recycle son phosphore et le retransloque avant la chute des feuilles vit
 * sur des teneurs qui condamneraient une culture : moins d'un kilo à l'hectare
 * de phosphore assimilable, une quinzaine de potassium échangeable. C'est
 * précisément ce qui permet à la pinède landaise d'exister sur un podzol que
 * l'agronomie qualifierait de stérile *(à calibrer)*.
 */
export const SATURATION_P_G_M2 = 0.08;
export const SATURATION_K_G_M2 = 1.5;

/**
 * Part du phosphore et du potassium prélevés dans l'année qui revient au sol,
 * contre 50 % pour l'azote.
 *
 * Le bois est pauvre en ces deux éléments : ils se concentrent dans les
 * feuilles, l'écorce et les racines fines, c'est-à-dire dans ce qui retombe
 * chaque année. En leur appliquant le taux de retour de l'azote, un peuplement
 * mûr enterrait la moitié de son potassium dans son bois année après année —
 * et finissait par s'étrangler, ce qu'aucune forêt ne fait *(à calibrer)*.
 */
export const RETOUR_LITIERE_P = 0.7;
export const RETOUR_LITIERE_K = 0.85;

/** Dépôts atmosphériques, kg/ha/an *(ordres de grandeur français)*. */
export const DEPOSITION_P_KG_HA_AN = 0.5;
export const DEPOSITION_K_KG_HA_AN = 3;

/**
 * Stock de phosphore assimilable d'un profil, g/m² : il vient de la matière
 * organique de surface et du fond minéral, et le pH décide de la part qui est
 * réellement disponible.
 */
export function phosphoreAssimilableGM2(profil: readonly Horizon[]): number {
  const surface = profil[0];
  if (!surface) return 0;
  // Le stock de formes labiles, SANS le filtre du pH : celui-ci s'applique au
  // moment où une racine vient chercher, pas au stock lui-même. L'appliquer
  // aux deux endroits pénalisait deux fois les sols acides, au point de rendre
  // une pinède landaise impossible — alors qu'elle existe.
  return (0.25 + 0.35 * surface.moPct) * (1 - surface.pierrosite);
}

/**
 * Stock de potassium échangeable d'un profil, g/m² : proportionnel à ce que le
 * complexe d'échange peut retenir.
 */
export function potassiumEchangeableGM2(profil: readonly Horizon[]): number {
  const surface = profil[0];
  if (!surface) return 0;
  return 0.9 * capaciteEchange(surface) * (1 - surface.pierrosite);
}
