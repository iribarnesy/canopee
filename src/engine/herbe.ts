/**
 * La strate herbacée, prise dans son **ensemble** (docs/regles.md §5, ch4-B, ch7
 * « zéro sol nu »).
 *
 * Ce fichier tient ce que la strate fait au reste du monde — sa soif, sa faim
 * d'azote, la mémoire hydrique qui l'empêche d'osciller. **Qui** la compose, et
 * selon quel calendrier, est dans `herbacees.ts` : l'atlas des espèces
 * herbacées et le partage du sol entre elles.
 *
 * Elle n'est pas modélisée en individus mais en **taux de couverture** par cellule.
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
 * **La strate fabrique de la matière, et c'est d'elle que vient sa faim d'azote**
 * (#247). Elle prélevait jusqu'ici un débit fixe par unité de couverture
 * (~30 kg N/ha/an *(à calibrer)*), multiplié par une « exigence » déclarée par
 * espèce — dix pour le blé. Rien ne reliait ce qu'elle prenait à ce qu'elle
 * produisait : le blé du moteur faisait 8,6 t/ha de grain avec 82 kg N, et
 * l'apport au-delà de 80 kg partait au lessivage. Deux lois générales, et aucun
 * nombre propre à une espèce, remplacent ce débit.
 *
 * **Rendement de conversion du rayonnement**, g de matière sèche aérienne par MJ
 * de rayonnement solaire intercepté : 1,4 pour les cultures en C3, constant hors
 * stress (Sinclair et Muchow 1999, *Adv. Agron.* 65 ; Gallagher et Biscoe 1978).
 * Les quatre herbacées du moteur sont en C3.
 */
export const RUE_HERBACEE_G_MJ = 1.4;

/**
 * **Courbe critique de dilution de l'azote**, en % de la matière sèche : la
 * teneur en azote juste suffisante pour la croissance maximale baisse à mesure
 * que la plante grossit, parce que la part des tissus de structure, pauvres en
 * azote, augmente. Greenwood et al. (1990, *Ann. Bot.* 66:425) la donnent
 * commune aux cultures en C3 : %Nc = 5,7 × W^−0,5, W en t/ha, pour W ≥ 1 t/ha ;
 * en dessous, la courbe est tenue à sa valeur de 1 t/ha. La courbe propre au
 * blé d'hiver (Justes et al. 1994 : 5,35 W^−0,442) en est proche, et c'est la
 * générale qui est retenue : le besoin d'un blé doit en sortir, pas y être écrit.
 *
 * C'est d'elle que tombe le besoin par quintal des agronomes (~3 kg N/q pour le
 * blé, Arvalis) : à 17 t/ha de biomasse et un indice de récolte de 0,5, la
 * courbe rend 2,8 kg N par quintal de grain.
 */
export function azoteCritiquePct(matiereSecheGM2: number): number {
  return 5.7 * Math.max(1, matiereSecheGM2 / 100) ** -0.5;
}

/** L'azote critique d'une biomasse, g/m². */
export function azoteCritiqueG(matiereSecheGM2: number): number {
  return (matiereSecheGM2 * azoteCritiquePct(matiereSecheGM2)) / 100;
}

/**
 * Durée de vie des tissus d'une herbacée pérenne, degrés-jours base 4 °C :
 * 400 à 520 dans une prairie tempérée, en commun pour les espèces codominantes
 * (Lemaire et Agnusdei 2000 : trois feuilles vivantes par talle au plus). Le
 * milieu de la fourchette. C'est ce qui empêche une prairie d'empiler vingt
 * tonnes sur pied : passé cet âge, une feuille meurt et tombe en litière.
 */
export const DUREE_VIE_TISSUS_DJ = 460;
/** Base des degrés-jours de la durée de vie des tissus, °C. */
export const T_BASE_TISSUS_C = 4;

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
 * Le lissage joue dans les **deux** sens, et c'est ce qui casse le cycle. Un tapis
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
