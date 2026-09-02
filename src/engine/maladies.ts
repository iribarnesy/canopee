/**
 * Maladies (docs/regles.md §7.4 ; critère G6).
 *
 * Les règles prévoyaient des maladies « à date scriptée » : la chalarose
 * frapperait l'année A+12 quoi qu'il arrive. C'est jouable, mais c'est une
 * date, pas un mécanisme — et ça n'apprend rien d'autre qu'à subir.
 *
 * Ce qui est modélisé ici est ce qui se passe réellement : une épidémie a une
 * **année d'arrivée** dans le pays (donnée historique : la chalarose du frêne
 * est en France depuis 2008), puis sa pression dépend de deux choses que le
 * joueur contrôle :
 *  - la **densité locale d'hôtes** — l'inoculum vient des feuilles infectées
 *    tombées à proximité, si bien qu'un frêne isolé dans un mélange s'en tire
 *    infiniment mieux qu'un frêne au milieu d'une frênaie ;
 *  - l'**humidité** — le champignon a besoin d'un été humide pour produire ses
 *    fructifications, et les frênes des situations sèches et aérées résistent
 *    mieux, ce qu'on observe partout en France.
 *
 * La diversification cesse ainsi d'être une bonne intention pour devenir une
 * assurance chiffrable. Et il n'y a rien de spécifique au frêne dans le
 * moteur : une autre maladie s'ajoute en une ligne de données.
 *
 * Non modélisé : la résistance génétique de quelques individus (elle attend la
 * variabilité individuelle, prévue en v2), les vecteurs insectes, les
 * traitements.
 */

export interface Maladie {
  id: string;
  nom: string;
  /** l'essence attaquée */
  especeId: string;
  /** année civile d'arrivée dans le pays (donnée historique) */
  anneeArrivee: number;
  /**
   * Densité d'hôtes voisins (tiges dans un rayon de 20 m) à laquelle la
   * pression atteint la moitié de son maximum.
   */
  demiSaturationHotes: number;
  /** points de stress par semaine à pleine pression *(à calibrer)* */
  virulence: number;
  /** ce que le joueur doit comprendre, affiché au journal */
  description: string;
}

export const MALADIES: readonly Maladie[] = [
  {
    id: "chalarose",
    nom: "Chalarose du frêne",
    especeId: "fraxinus_excelsior",
    anneeArrivee: 2008,
    demiSaturationHotes: 12,
    virulence: 0.22,
    description:
      "Le champignon vit sur les feuilles tombées : plus il y a de frênes serrés, plus l'inoculum est fort. Un frêne isolé dans un mélange, en situation sèche et aérée, s'en tire bien mieux.",
  },
];

/** Rayon dans lequel l'inoculum d'un voisin compte, m. */
export const RAYON_INOCULUM_M = 20;

/**
 * Pression d'une maladie sur un hôte, ∈ [0,1].
 *
 * @param voisinsHotes nombre de congénères dans le rayon d'inoculum
 * @param humiditeEte remplissage moyen de l'horizon de surface en été ∈ [0,1]
 */
export function pressionMaladie(
  maladie: Maladie,
  voisinsHotes: number,
  humiditeEte: number,
): number {
  const densite = voisinsHotes / (voisinsHotes + maladie.demiSaturationHotes);
  // Le champignon a besoin d'humidité pour fructifier : en dessous d'un tiers
  // de la réserve, la contamination s'effondre.
  const humidite = Math.min(1, Math.max(0, (humiditeEte - 0.2) / 0.4));
  return densite * humidite;
}

/** Les maladies actives à une année donnée. */
export function maladiesActives(annee: number): readonly Maladie[] {
  return MALADIES.filter((m) => annee >= m.anneeArrivee);
}
