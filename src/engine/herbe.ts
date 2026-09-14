/**
 * La strate herbacée, prise dans son ENSEMBLE (docs/regles.md §5, ch4-B, ch7
 * « zéro sol nu »).
 *
 * Ce fichier tient ce que la strate fait au reste du monde — sa soif, sa faim
 * d'azote, la mémoire hydrique qui l'empêche d'osciller. QUI la compose, et
 * selon quel calendrier, est dans `herbacees.ts` : l'atlas des espèces
 * herbacées et le partage du sol entre elles.
 *
 * Elle n'est pas modélisée en individus mais en TAUX DE COUVERTURE par cellule.
 * Elle change tout pour un jeune plant :
 *  - elle lui dispute l'eau et l'azote de l'horizon de surface — c'est la
 *    première cause d'échec des plantations (ch4-B) ;
 *  - mais elle couvre le sol, ce qui limite l'évaporation et l'érosion ;
 *  - elle disparaît sous un couvert fermé, ce qui libère les semis d'ombre.
 * Le joueur peut la faucher : c'est le geste d'entretien de base d'une
 * plantation.
 */

/**
 * Part de l'ETP qu'un couvert herbacé fermé transpire *(à calibrer)*. Elle
 * partage l'énergie avec le sol et les arbres : la somme des trois ne peut pas
 * dépasser l'ETP, d'où une valeur nettement sous 1.
 */
export const HERBE_TRANSPIRATION_COEFF = 0.3;
/**
 * Azote prélevé par un couvert fermé, g/m²/semaine en pleine saison :
 * ~0,06 g/m²/sem ≈ 30 kg N/ha/an, l'ordre de grandeur d'une végétation
 * herbacée spontanée *(à calibrer)*.
 */
export const HERBE_AZOTE_G_M2_SEMAINE = 0.06;

/**
 * Inertie du tapis face à l'humidité : part de l'écart rattrapée chaque semaine
 * par l'humidité « vécue » (constante de temps ≈ 6 semaines).
 *
 * C'est ce qui empêche le tapis d'osciller. Regarder l'humidité de la semaine
 * en cours suffit à créer un cycle : le tapis boit, la surface sèche, il
 * régresse, il boit moins, la surface se recharge, il repart — une boucle de
 * rétroaction retardée, qui se voyait à l'écran sous forme de cercles de
 * fauche clignotants. Un gazon ne se reconfigure pas en une semaine : ses
 * racines fines et ses talles intègrent les conditions sur plus d'un mois, et
 * c'est cette mémoire qui amortit la boucle.
 */
export const INERTIE_HUMIDITE_HERBE = 0.16;

/**
 * Mémoire hydrique du tapis : lissage exponentiel de l'humidité de surface.
 *
 * Le lissage joue dans les DEUX sens, et c'est ce qui casse le cycle. Un tapis
 * ne jaunit pas en une semaine sèche (il puise dans ses talles avant de
 * griller — compter trois à quatre semaines) et ne reverdit pas non plus sur
 * une averse (il faut refaire des feuilles). N'amortir que la reprise ne
 * suffit pas : la boucle se reboucle alors par le bas, et les cercles
 * clignotent toujours — vérifié en le mesurant.
 */
export function humiditeVecue(precedente: number, remplissageActuel: number): number {
  return precedente + (remplissageActuel - precedente) * INERTIE_HUMIDITE_HERBE;
}

/**
 * Ce que la cellule peut porter, et à quelle vitesse elle y va, ne se calcule
 * plus ici : chaque espèce a sa capacité et sa saison (`herbacees.ts`). La
 * couverture de la cellule est la somme de ce que les espèces couvrent, et le
 * seuil unique de lumière qui vivait ici — 0,12, le même pour tout le monde —
 * est devenu le point de compensation de chacune.
 */

/** Demande en eau d'une cellule d'herbe, L/semaine (1 m² : 1 mm = 1 L). */
export function herbeDemandeEauL(
  couverture: number,
  etpMm: number,
  lumiereAuSol: number,
  saison: number,
): number {
  return etpMm * couverture * lumiereAuSol * HERBE_TRANSPIRATION_COEFF * saison;
}

/** Demande en azote d'une cellule d'herbe, g/semaine. */
export function herbeDemandeAzoteG(couverture: number, saison: number): number {
  return HERBE_AZOTE_G_M2_SEMAINE * couverture * saison;
}
