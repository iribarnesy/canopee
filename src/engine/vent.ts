/**
 * Le VENT de la semaine : d'où il souffle et avec quelle force.
 *
 * **Ce que le moteur savait du vent jusqu'ici, et ce qui manquait.** Il tenait
 * `Station.ventExposition` — un scalaire ∈ [0,1] qui dit combien la parcelle
 * est DÉCOUVERTE, dérivé des boisements voisins (`paysage.ts`). C'est un abri,
 * pas un vent : ni direction, ni variation d'une semaine à l'autre. Le
 * `docs/regles.md` §3 l'annonçait pourtant dans les variables hebdomadaires
 * (« vent (événements) »), et trois mécanismes en avaient besoin — le risque de
 * feu (`indiceRisqueFeu`), la mise en scène du panache d'un incendie (§6.4 de
 * l'interface : « panache incliné par le vent ») et, à terme, le balancement des
 * houppiers.
 *
 * **Le vent est DÉRIVÉ, pas saisi, et c'est ce qui rend le modèle honnête.** Les
 * séries météo réelles du dépôt ne portent que quatre colonnes (T moyenne, min,
 * max, pluie) : il n'y a pas de relevé de vent à lire. Plutôt que d'inventer une
 * colonne, ce module calcule le vent comme l'ETP est calculée — depuis ce que la
 * semaine dit déjà, plus une propriété déclarée de la station. C'est exactement
 * le partage que le reste du moteur applique : la latitude est un fait
 * géographique déclaré, l'ETP en est une conséquence calculée.
 *
 * **La climatologie sur laquelle il s'appuie**, et elle est robuste :
 *
 *  - sur la plus grande partie de la France, le secteur dominant est ouest à
 *    sud-ouest, lié au flux zonal atlantique et au défilé des dépressions. Les
 *    roses des vents de Météo-France le montrent de la façade atlantique au
 *    bassin parisien ;
 *  - **la pluie est le meilleur marqueur du régime** dont le moteur dispose
 *    déjà : en France, la pluie vient massivement des perturbations d'ouest.
 *    Une semaine arrosée est donc une semaine de flux perturbé — secteur
 *    dominant, vent soutenu. Une semaine sèche est une semaine
 *    anticyclonique — flux plus continental, vent généralement faible ;
 *  - **deux exceptions régionales inversent la seconde règle, et ce sont les
 *    vents de feu** : le mistral (vallée du Rhône, nord à nord-nord-ouest) et la
 *    tramontane (Languedoc, nord-ouest à ouest-nord-ouest) soufflent
 *    précisément par beau temps sec, et fort. D'où une rose à DEUX secteurs par
 *    station plutôt qu'un seul : celui du régime perturbé et celui du régime
 *    sec, avec la force relative du second.
 *
 * **Aucun tirage sur le flux principal.** La dispersion résiduelle est tirée sur
 * un flux PROPRE, comme la direction de chute d'une chandelle (`boisMort.ts`) et
 * pour la raison qu'y donne son commentaire : le flux principal est unique et
 * séquentiel, un mécanisme qui y ajoute un tirage décale tous les suivants et
 * rebat les cartes de tous les autres. Ajouter le vent ne doit pas changer
 * l'écologie d'une partie déjà calibrée.
 *
 * Module **pur** : des nombres, aucun état.
 */

import type { WeekWeather } from "./meteo";
import { rngFloat, rngStateFromSeed } from "./rng";

/**
 * La rose des vents d'une station : ce que les relevés en disent.
 *
 * Les degrés suivent la convention météo — le secteur D'OÙ vient le vent, 0 =
 * nord, 90 = est, sens horaire. C'est celle des roses publiées, et s'en écarter
 * ferait recopier des chiffres à l'envers.
 */
export interface RoseDesVents {
  /** secteur d'où vient le vent en régime PERTURBÉ (flux zonal), degrés */
  perturbeDeg: number;
  /** secteur d'où vient le vent en régime ANTICYCLONIQUE sec, degrés */
  secDeg: number;
  /**
   * Force du régime sec, en multiple de celle du régime perturbé.
   *
   * **Inférieure à un dans la France ordinaire** — le beau temps y est calme —
   * et SUPÉRIEURE là où le vent de beau temps est le vent fort : c'est toute la
   * différence entre une friche picarde et une garrigue sous tramontane, et
   * c'est celle qui décide si un été sec est dangereux ou seulement chaud.
   */
  forceDuSec: number;
}

/**
 * La rose par défaut : flux zonal atlantique.
 *
 * Ouest-sud-ouest en régime perturbé, est-nord-est et faible en régime
 * anticyclonique. C'est la rose de la plus grande partie du territoire, et la
 * seule qu'on puisse appliquer sans savoir OÙ est la station — le moteur ne
 * tient pas de longitude *(à préciser quand les six stations réelles arriveront
 * avec leurs relevés)*.
 */
export const ROSE_ATLANTIQUE: RoseDesVents = {
  perturbeDeg: 245,
  secDeg: 65,
  forceDuSec: 0.55,
};

/**
 * La rose de la vallée du Rhône : le MISTRAL.
 *
 * Nord à nord-nord-ouest, canalisé par la vallée, et il souffle par ciel clair :
 * sa force en régime sec dépasse celle du régime perturbé. Fournie ici pour que
 * la station rhodanienne des six stations réelles n'ait pas à réinventer sa rose
 * — et parce qu'une rose qui ne servirait qu'à la France ordinaire ne
 * démontrerait pas ce que le paramètre porte.
 */
export const ROSE_MISTRAL: RoseDesVents = {
  perturbeDeg: 200,
  secDeg: 350,
  forceDuSec: 1.8,
};

/** La rose du Languedoc : la TRAMONTANE, nord-ouest, même logique que le mistral. */
export const ROSE_TRAMONTANE: RoseDesVents = {
  perturbeDeg: 160,
  secDeg: 315,
  forceDuSec: 1.7,
};

/**
 * Pluie hebdomadaire au-delà de laquelle la semaine est franchement perturbée,
 * en mm.
 *
 * Quinze millimètres sur une semaine, c'est le passage d'au moins une
 * perturbation ; en dessous de deux, la semaine est sèche. Entre les deux, le
 * régime est mêlé et le vent l'est aussi *(à calibrer : le seuil dépend de la
 * région, une semaine à 10 mm est perturbée en Provence et ordinaire en
 * Bretagne)*.
 */
export const PLUIE_PERTURBEE_MM = 15;
export const PLUIE_SECHE_MM = 2;

/**
 * Dispersion résiduelle de la direction, en radians.
 *
 * **Le vent n'est jamais exactement dans son secteur dominant**, et une
 * direction rigoureusement constante toute l'année serait le défaut inverse de
 * celui qu'on corrige : un panache qui pencherait toujours pareil se lirait
 * comme un décor et non comme un temps. Un quart de tour d'étalement autour du
 * secteur laisse la dominante lisible tout en donnant des semaines à contre-pied
 * *(à calibrer : les roses publiées donnent la fréquence par secteur de 30°,
 * dont on pourrait tirer l'écart-type au lieu de le poser)*.
 */
export const DISPERSION_DU_SECTEUR = Math.PI / 4;

/**
 * Force du vent en régime perturbé, en fraction de l'exposition de la station.
 *
 * **Calibré pour que la MOYENNE ANNUELLE de la force retombe sur
 * `ventExposition`**, qui est la grandeur que le moteur utilisait jusqu'ici.
 * C'est la contrainte qui permet d'ajouter le vent sans déplacer la climatologie
 * du feu d'une station : ce qui change, c'est que le risque se concentre sur les
 * semaines où le vent souffle vraiment, au lieu d'être étalé sur toutes.
 *
 * **Et le nombre est MESURÉ, pas posé.** Il dépend de la zonalité moyenne des
 * séries météo réelles du dépôt, que j'avais estimée à 0,42 sans regarder : elle
 * vaut 0,51 à 0,58 selon la station (0,47 à 0,56 sur la saison du feu). Le
 * premier jet à 1,35 donnait donc une force moyenne 7 % au-dessus de
 * l'exposition, et 1,25 la ramène à 3 % près — mesuré sur les trois stations qui
 * portent une série : 0,573 contre 0,575 sur la friche, 0,772 contre 0,762 sur
 * la lande, 0,267 contre 0,275 sur la vallée abritée (`tests/unit/vent.test.ts`
 * garde la propriété, pas les décimales).
 */
export const FORCE_PERTURBEE = 1.25;

/** Le vent d'une semaine : d'où il vient, où il va, et combien il pousse. */
export interface VentDeLaSemaine {
  /** secteur d'où vient le vent, degrés (0 = nord, 90 = est, sens horaire) */
  deDeg: number;
  /**
   * Direction VERS laquelle il souffle, en radians dans le repère de la grille
   * (0 = +x = est, sens trigonométrique, donc +y = nord = π/2).
   *
   * C'est la convention du rendu et celle de `directionDeChute` : un angle qui
   * change de repère entre le moteur et le dessin est un angle qu'on finit par
   * appliquer à l'envers.
   */
  versRad: number;
  /**
   * Force du vent, sur l'échelle de `ventExposition` : 1 = aussi soutenu que
   * l'exposition de la station le laisse attendre.
   *
   * **Elle peut DÉPASSER un, et il a fallu un essai pour s'en rendre compte.**
   * Le premier jet la bornait à [0,1], ce qui paraissait cohérent avec
   * l'exposition — sauf qu'un mistral sur une vallée ouverte sature alors dans
   * les deux régimes, sec comme perturbé, et que la signature de la rose
   * (« ici le vent de beau temps est LE vent fort ») devenait invisible
   * précisément là où elle compte. Un vent exceptionnel est exceptionnel : le
   * modèle le dit, et c'est à chaque usage de borner s'il en a besoin —
   * `indiceRisqueFeu` le fait, le penchant du panache aussi.
   */
  force: number;
}

/**
 * Part de la semaine qui relève du régime PERTURBÉ, ∈ [0,1].
 *
 * Une interpolation entre les deux seuils de pluie, et non un basculement : une
 * semaine à 8 mm n'est ni l'une ni l'autre, et la trancher ferait sauter la
 * direction du vent d'un secteur à l'autre d'une semaine sur deux.
 */
export function zonalite(pluieMm: number): number {
  if (pluieMm >= PLUIE_PERTURBEE_MM) return 1;
  if (pluieMm <= PLUIE_SECHE_MM) return 0;
  return (pluieMm - PLUIE_SECHE_MM) / (PLUIE_PERTURBEE_MM - PLUIE_SECHE_MM);
}

/**
 * Interpolation entre deux azimuts, par le PLUS COURT chemin sur le cercle.
 *
 * Le détail compte : interpoler 350° et 20° par la moyenne arithmétique donne
 * 185°, soit le sud, alors que les deux secteurs sont au nord. Une rose de
 * mistral tombe exactement dans ce piège.
 */
export function entreAzimuts(aDeg: number, bDeg: number, part: number): number {
  const ecart = ((((bDeg - aDeg) % 360) + 540) % 360) - 180;
  return (((aDeg + ecart * part) % 360) + 360) % 360;
}

/**
 * Une graine propre au vent d'une semaine.
 *
 * **Elle ne dépend PAS de la graine de la partie, et c'est une décision et non
 * un oubli.** Le vent est de la MÉTÉO : dans ce moteur, la météo est une entrée
 * — une série réelle ou une année synthétique « purement déterministe, aucun
 * aléa » — et non un tirage de la partie. Deux parties qui traversent la même
 * semaine de la même série doivent donc voir passer la même dépression, et le
 * même vent. Ce qui reste propre à la partie, c'est ce que le joueur en fait.
 *
 * Même précaution que `graineDeChute` pour le reste : le vent ne PUISE PAS dans
 * le flux principal. Et la semaine ABSOLUE, non la semaine de l'année, sinon le
 * vent se répéterait à l'identique tous les ans.
 */
export function graineDuVent(semaine: number): number {
  return (semaine * 2246822519 + 3266489917) >>> 0;
}

/**
 * Le vent de la semaine.
 *
 * `exposition` est le `ventExposition` de la station : c'est lui qui décide de
 * l'échelle, parce qu'un vallon abrité ne voit pas passer la tempête qui couche
 * le plateau d'à côté. La rose décide du secteur, la pluie décide du régime, et
 * la graine ne sert qu'à la dispersion résiduelle.
 */
export function ventDeLaSemaine(
  rose: RoseDesVents,
  exposition: number,
  semaine: number,
  meteo: WeekWeather,
): VentDeLaSemaine {
  const zonal = zonalite(meteo.rainMm);
  // Le secteur glisse du régime sec vers le régime perturbé avec la pluie.
  const secteur = entreAzimuts(rose.secDeg, rose.perturbeDeg, zonal);
  const ecart =
    (rngFloat(rngStateFromSeed(graineDuVent(semaine))).value * 2 - 1) * DISPERSION_DU_SECTEUR;
  const deDeg = (((secteur + (ecart * 180) / Math.PI) % 360) + 360) % 360;
  // La force interpole entre les deux régimes de la rose, à l'échelle de
  // l'exposition de la station.
  const relative = FORCE_PERTURBEE * (rose.forceDuSec + (1 - rose.forceDuSec) * zonal);
  return {
    deDeg,
    // Un vent qui VIENT de `deDeg` souffle VERS `deDeg + 180`. Et l'azimut
    // météo tourne dans le sens horaire depuis le nord, quand l'angle de la
    // grille tourne dans le sens trigonométrique depuis l'est : d'où le
    // changement de repère, écrit une fois pour toutes ici.
    versRad: Math.PI / 2 - ((deDeg + 180) * Math.PI) / 180,
    force: Math.max(0, exposition * relative),
  };
}
