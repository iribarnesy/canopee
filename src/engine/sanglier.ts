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
 * Hauteur en dessous de laquelle un plant ne survit pas à un boutis, m.
 *
 * **C'EST LE SECOND EFFET DU SANGLIER SUR LA RÉGÉNÉRATION, ET LE SEUL QUI LA
 * SUPPRIME VRAIMENT** (issue #199). Le premier — manger la glandée — est
 * maintenant ancré sur une ration réelle, et il est PETIT : à 0,15 bête à
 * l'hectare, une ration de 400 kg/an fait soixante kilos de glands contre une
 * glandée qui se compte en centaines. Un sanglier ne peut pas manger une
 * glandée, c'est toute l'idée de la glandée. Ce qu'il peut faire, c'est
 * labourer ce qui a levé.
 *
 * Le boutis descend à dix centimètres (ci-dessus) : il soulève l'horizon de
 * surface, celui qui porte la litière, l'humus et le chevelu des plantules.
 * **Ce qui part avec la motte est le plant dont le système racinaire n'a pas
 * encore quitté cet horizon.** Au-dessus, la tige tient par des racines que le
 * groin ne remonte pas, et le boutis ne fait plus que la blesser.
 *
 * Cinquante centimètres : c'est la coupure que les protocoles d'inventaire
 * mettent au bas de la régénération — en dessous on compte des semis, au-dessus
 * des recrûs installés. Le semis de ce moteur naît à trente centimètres
 * (`hauteurDuSemisM`), donc la fenêtre de vulnérabilité dure ce que met le plant
 * à gagner vingt centimètres : une saison en pleine lumière, plusieurs années
 * sous couvert — exactement là où le sanglier va *(à calibrer)*.
 *
 * Comparer avec le LABOUR, qui détruit jusqu'à 1,2 m (`actions.ts`) : l'outil
 * retourne deux à trois fois plus profond, sur toute la zone d'un coup, et le
 * moteur dit maintenant les deux choses séparément. Le sanglier n'est pas un
 * petit tracteur : il est plus superficiel, et il ne touche que deux pour cent
 * de la parcelle par an.
 */
export const HAUTEUR_ARRACHEE_PAR_BOUTIS_M = 0.5;

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
 * ─── CE QUI A QUITTÉ CE FICHIER, ET POURQUOI (issue #197) ────────────────────
 *
 * Il y avait ici `PART_GLANDEE_CONSOMMEE = 0,55` et `partGlandeeRestante`, une
 * part de la glandée mangée en fonction de la seule densité de sangliers. La
 * fonction était honnête sur ce qu'elle ne savait pas — *« à calibrer : la part
 * réellement consommée d'une glandée varie de tout au rien selon l'année
 * semencière »* — mais elle ne pouvait pas le savoir : **le moteur ne produisait
 * aucune glandée**, alors elle en supposait une.
 *
 * Ce qu'elle supposait, en clair : pour que 0,05 sanglier/ha en mangent 55 %, il
 * fallait qu'un hectare ne porte que SEIZE KILOS de glands, et qu'une bête en
 * avale deux tonnes et demie par an. Le chiffre ne valait rien comme ration ; il
 * valait comme réglage, et c'est exactement ce que la règle du dépôt interdit —
 * un chiffre calé sur le moteur lui-même n'est pas une ancre.
 *
 * `glandee.ts` produit maintenant la glandée, et le sanglier y prélève une
 * RATION en kilos, ancrée sur ce qu'un animal peut avaler. La loi n'a pas
 * changé de forme : celle d'ici valait exp(−k × densité), celle de là vaut
 * exp(−ration/production) — la même, avec la production réelle à la place de la
 * production supposée.
 *
 * **Ce que la mesure a dit**, et ce n'est pas un détail : à ration réelle, le
 * sanglier ne contrôle plus la régénération du chêne (voir `docs/realisme.md`,
 * G10). Il n'en avait jamais eu les moyens physiques.
 */

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
