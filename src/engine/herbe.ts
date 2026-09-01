/**
 * La strate herbacée (docs/regles.md §5, ch4-B, ch7 « zéro sol nu »).
 *
 * Elle n'est pas modélisée en individus mais en TAUX DE COUVERTURE par cellule :
 * graminées, ronces, molinie… tout ce qui occupe le sol entre les arbres. Elle
 * change tout pour un jeune plant :
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
/** Vitesse de reconquête d'un sol nu, par semaine de pleine végétation. */
const REPRISE_PAR_SEMAINE = 0.12;
/** Vitesse de régression quand les conditions ne suivent plus. */
const REGRESSION_PAR_SEMAINE = 0.2;
/**
 * Lumière au sol en dessous de laquelle la strate ne se maintient plus :
 * sous un couvert fermé, le tapis herbacé disparaît (ch4-A).
 */
const LUMIERE_MINIMALE = 0.12;

/**
 * Couverture que la cellule peut porter, d'après la lumière qui atteint le sol
 * et l'ÉTAT hydrique de l'horizon de surface (son remplissage, pas la
 * satisfaction de l'herbe elle-même : sinon la couverture se nourrit de sa
 * propre consommation et le tapis se met à osciller).
 * Une lande rase ou un sous-bois sombre plafonnent bas ; une trouée fraîche se
 * referme vite. L'herbe grille la première en été : ses racines sont fines et
 * superficielles, elle recule avant que les arbres ne souffrent.
 */
export function couvertureMax(lumiereAuSol: number, remplissageEauSurface: number): number {
  if (lumiereAuSol <= LUMIERE_MINIMALE) return 0;
  const parLumiere = Math.min(1, (lumiereAuSol - LUMIERE_MINIMALE) / 0.35);
  const parEau = Math.min(1, remplissageEauSurface / 0.35);
  return Math.max(0, parLumiere * parEau);
}

/**
 * Fait évoluer la couverture d'une cellule vers sa capacité : reconquête
 * progressive d'un sol nu, régression sous l'ombre ou la sécheresse.
 */
export function prochaineCouverture(
  couverture: number,
  couvertureCible: number,
  saison: number,
): number {
  if (couvertureCible > couverture) {
    return Math.min(couvertureCible, couverture + REPRISE_PAR_SEMAINE * saison);
  }
  return Math.max(couvertureCible, couverture - REGRESSION_PAR_SEMAINE);
}

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
