/**
 * Le sanglier (issue #73, critère G10) — et pourquoi il n'est PAS dans
 * `gibier.ts`.
 *
 * Le chevreuil est complet depuis longtemps : hauteur de dent, fourrage par
 * cellule, appétence, frottis, écorçage, clôture, chasse. L'issue suggérait de
 * généraliser cette architecture pour y loger le sanglier. **Après lecture,
 * non** : `gibier.ts` est bâti de bout en bout sur le BROUTAGE, et un sanglier
 * ne broute pas. Généraliser aurait produit une abstraction qui ne décrit ni
 * l'un ni l'autre.
 *
 * Ce qui se partage n'est pas le code, c'est le PATRON, et il est respecté ici :
 * une densité de CONTEXTE imposée par le paysage (un sanglier a un domaine
 * vital de 500 à 2000 hectares selon l'OFB — la parcelle n'a pas de population,
 * elle en reçoit une part), une répartition locale au prorata de ce que chaque
 * cellule OFFRE, et une comptabilité qui tient.
 *
 * ## Deux effets de signe OPPOSÉ, et aucun n'est écrit par espèce
 *
 * C'est ce qui rend cet animal intéressant plutôt que décoratif :
 *
 *  - **il détruit la fructification tombée.** Un sanglier mange les glands et
 *    les châtaignes au sol, et il en mange beaucoup. Le moteur sait déjà qui
 *    produit ce genre de graine sans qu'on nomme personne : `dissemination`
 *    vaut `geai` ou `gravite` pour les grosses graines lourdes qui tombent et
 *    restent, `vent` ou `oiseaux` pour celles qui s'en vont ;
 *  - **il ouvre des sites de germination.** En retournant le sol il enfouit la
 *    litière, casse la structure et met la terre à nu — ce qui profite
 *    précisément aux petites graines, celles que le vent amène et qui ne lèvent
 *    pas sous un matelas de feuilles.
 *
 * D'où la tension que l'issue espérait, sans qu'on ait eu à l'écrire : **le
 * geai plante les chênes, le sanglier les mange**, et pendant ce temps il
 * prépare le lit du bouleau.
 *
 * ## Aucun tirage dans le flux principal
 *
 * L'issue prévient, et le précédent des tempêtes s'applique : le choix des
 * cellules retournées dérive d'une graine locale (cellule + semaine), jamais du
 * flux séquentiel. Une partie sans sanglier ne bouge pas d'un cheveu.
 */

import { rngFloat, rngStateFromSeed } from "./rng";

/**
 * Part de la surface retournée en un an, à la densité de référence.
 *
 * C'est LE chiffre du lot, et il est mesuré — largement, parce que les études
 * ne s'accordent qu'à l'ordre de grandeur près et qu'elles ne parlent pas du
 * même milieu :
 *
 *  - en prairie semi-sèche, 0,2 à 0,7 % de la surface par an sur un suivi de
 *    cinq ans ;
 *  - **en forêt, c'est dix fois plus** : 7,4 %/an pour les porcs féraux de
 *    Californie, 10,9 % puis 8,0 % sur deux années dans le Monte argentin.
 *
 * **Et les deux chiffres forestiers sont des populations INVASIVES** : les porcs
 * féraux de Californie et du Monte argentin n'ont pas de prédateurs, pas de
 * chasse réglée, et des densités sans rapport avec un massif français. Les
 * prendre pour référence était une erreur d'échantillon, de la même famille que
 * celle du lot des tempêtes (un seuil calé sur des arbres d'une seule station).
 * Deux pour cent situe une parcelle boisée française entre la prairie
 * européenne et la forêt envahie, ce qui est sa place *(à calibrer)*.
 *
 * Le premier jet retenait 5 %, et six conclusions écologiques sont tombées avec
 * — dont la callune de la lande, qui disparaissait entièrement.
 */
export const PART_RETOURNEE_PAR_AN = 0.02;

/**
 * Densité de sangliers à laquelle correspond la part ci-dessus, individus/ha.
 *
 * Les densités françaises se comptent en unités par cent hectares, pas par
 * hectare : deux à dix bêtes aux cent hectares en boisement ordinaire. La
 * référence est prise au milieu *(à confirmer sur les tableaux de chasse
 * départementaux)*.
 */
export const DENSITE_REFERENCE_PAR_HA = 0.05;

/**
 * Profondeur d'un boutis, cm. Les relevés donnent 5 à 15 cm — c'est-à-dire
 * l'horizon de surface, celui qui porte la litière, l'humus et les semis, et
 * pas davantage. Le sanglier ne laboure pas, il écroûte.
 */
export const PROFONDEUR_BOUTIS_CM = 10;

/**
 * Poids saisonnier du retournement, par semaine de l'année.
 *
 * Les suivis s'accordent : l'activité est marquée de la mi-automne au
 * printemps. Deux raisons qui se cumulent et que le moteur porte déjà — la
 * glandée tombe en automne, et le sol gelé ou desséché de plein été ne se
 * retourne pas. On garde une activité de fond l'été plutôt que zéro : un
 * sanglier fouille toute l'année, moins fort.
 */
export function poidsSaisonnier(semaine: number): number {
  const s = ((semaine % 52) + 52) % 52;
  // Maximum autour de la semaine 45 (début novembre), minimum vers la 25.
  const phase = Math.cos((2 * Math.PI * (s - 45)) / 52);
  return 0.35 + 0.65 * ((phase + 1) / 2);
}

/** Ce qu'une cellule offre au sanglier, et pourquoi il y va. */
export interface AttraitCellule {
  /** fructification lourde tombée dessous ∈ [0,1] — glands, châtaignes */
  mast: number;
  /** couvert au-dessus ∈ [0,1] : le sanglier fouille à l'abri */
  couvert: number;
  /** humidité du sol de surface ∈ [0,1] : un sol sec ne se retourne pas */
  humidite: number;
}

/**
 * Attrait d'une cellule ∈ [0,1].
 *
 * Le produit plutôt que la somme pour l'humidité : un sol dur n'est pas
 * retourné, quelle que soit la glandée dessus. La glandée et le couvert, eux,
 * s'ajoutent — un sanglier fouille aussi là où il n'y a rien à ramasser.
 */
export function attraitCellule(a: AttraitCellule): number {
  const envie = 0.3 + 0.5 * Math.min(1, a.mast) + 0.2 * Math.min(1, a.couvert);
  return Math.min(1, envie) * Math.min(1, Math.max(0, a.humidite));
}

/**
 * Graine propre à un boutis : la cellule et la semaine.
 * Même précaution et même forme que `graineDeChute` (`boisMort.ts`) et
 * `graineDeChablis` (`tempete.ts`) — le flux principal ne bouge pas.
 */
export function graineDeBoutis(cellule: number, semaine: number): number {
  return (cellule * 2246822519 + semaine * 3266489917 + 0x85ebca6b) >>> 0;
}

/**
 * Cette cellule-là est-elle retournée cette semaine-là ?
 *
 * `effortSemaine` est la part de la parcelle que le sanglier retourne cette
 * semaine ; l'attrait la redistribue. Une cellule sans attrait n'est jamais
 * touchée, une cellule très attirante l'est souvent.
 */
export function retournee(
  cellule: number,
  semaine: number,
  effortSemaine: number,
  attrait: number,
  attraitMoyen: number,
): boolean {
  if (attrait <= 0 || effortSemaine <= 0 || attraitMoyen <= 0) return false;
  const p = Math.min(PLAFOND_PAR_SEMAINE, (effortSemaine * attrait) / attraitMoyen);
  return rngFloat(rngStateFromSeed(graineDeBoutis(cellule, semaine))).value < p;
}

/**
 * Part de la parcelle retournée cette semaine, avant répartition.
 *
 * Proportionnelle à la densité du paysage et au poids de la saison.
 */
export function effortSemaine(sanglierParHa: number, semaine: number): number {
  const parAn = PART_RETOURNEE_PAR_AN * (sanglierParHa / DENSITE_REFERENCE_PAR_HA);
  // Le poids saisonnier est normalisé en moyenne à 1 sur l'année : sa moyenne
  // vaut 0,35 + 0,65/2 = 0,675, donc on divise par là pour que le total annuel
  // reste celui qu'on a annoncé.
  return ((parAn / 52) * poidsSaisonnier(semaine)) / 0.675;
}

/**
 * Part de la fructification lourde tombée qu'un sanglier consomme, à la densité
 * de référence.
 *
 * Il ne reste pas grand-chose d'une glandée là où les sangliers sont nombreux,
 * et c'est le contrepoids du geai : l'un cache les glands en les dispersant,
 * l'autre les mange sur place. La valeur est choisie pour que la régénération
 * du chêne reste POSSIBLE sous densité ordinaire et devienne difficile sous
 * forte densité — c'est la tension qu'on cherche, pas une extinction
 * *(à calibrer : la part réellement consommée d'une glandée varie de tout au
 * rien selon l'année semencière)*.
 */
export const PART_GLANDEE_CONSOMMEE = 0.55;

/**
 * Ce qui reste d'une fructification lourde après le passage des sangliers ∈ [0,1].
 *
 * Ne lit aucun nom d'espèce : l'appelant décide quelles graines sont « lourdes »
 * sur la foi du trait `dissemination` (`geai` et `gravite` tombent et restent,
 * `vent` et `oiseaux` s'en vont).
 */
export function partGlandeeRestante(sanglierParHa: number): number {
  // Forme exponentielle, et PAS une droite tronquée à zéro. Le premier jet
  // soustrayait linéairement : à 1,8 fois la densité de référence il ne restait
  // exactement RIEN, et la régénération du chêne s'éteignait d'un coup. Mesuré
  // à 0,15 sanglier/ha : zéro recrue en quarante ans, contre 97 sans sanglier.
  //
  // Un seuil dur comme celui-là est le défaut que ce dépôt a déjà payé deux
  // fois (l'anémone à pH 4,0, le chêne-liège à pH 4,50 — voir docs/realisme.md) :
  // une espèce posée sur une borne bascule d'un extrême à l'autre pour un
  // centième de rien. Ici la forme exponentielle garde la bonne écologie — sous
  // forte densité la glandée ne passe presque plus — sans jamais promettre
  // l'extinction.
  const pression =
    -Math.log(1 - PART_GLANDEE_CONSOMMEE) * (sanglierParHa / DENSITE_REFERENCE_PAR_HA);
  return Math.exp(-pression);
}

/**
 * Ce qu'une même cellule peut être retournée, au plus, en une semaine.
 *
 * **Sans ce plafond, la répartition au prorata de l'attrait concentrait sans
 * limite.** La part de parcelle retournée par an restait juste — c'est une
 * somme —, mais sur une lande sèche où deux cellules sur cent retiennent
 * l'humidité, ces deux-là étaient retournées 2,6 fois par an, indéfiniment. La
 * strate herbacée n'y repoussait jamais et la callune disparaissait : mesuré,
 * et c'est ce qui a fait tomber six conclusions écologiques d'un coup.
 *
 * Une fois l'an au plus, donc, et c'est physique : un boutis épuise son site.
 * Le sanglier revient l'année suivante, pas le mois suivant. Sur un sol partout
 * attirant le plafond ne mord pas — il ne fait que refuser la concentration
 * absurde.
 */
export const PLAFOND_PAR_SEMAINE = 1 / 52;

/** Part de la litière d'une cellule que le boutis enfouit. */
export const LITIERE_ENFOUIE = 0.6;

/**
 * Part du feuillage herbacé qu'un boutis emporte.
 *
 * Distincte de l'enfouissement de litière, dont elle partageait la constante au
 * premier jet — deux grandeurs sans rapport qui se trouvaient valoir pareil, ce
 * qui est le meilleur moyen de les faire diverger un jour sans s'en rendre
 * compte. Un boutis d'un mètre carré n'emporte pas tout le tapis : il en laisse
 * les bords *(à calibrer)*.
 */
export const HERBE_ARRACHEE = 0.5;

/**
 * Ce qu'un boutis retire au tassement : le sanglier AMEUBLIT.
 *
 * C'est la face qu'on n'attend pas — on pense dégât, et la structure y gagne.
 * Un boutis casse la croûte et remet de la porosité dans les dix premiers
 * centimètres ; c'est d'ailleurs pour ça qu'il ouvre des sites de germination.
 * Ce qu'il coûte est ailleurs : la terre est à nu, donc elle part
 * *(à calibrer)*.
 */
export const TASSEMENT_CASSE = 0.5;
