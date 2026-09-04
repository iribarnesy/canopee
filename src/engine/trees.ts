/**
 * Croissance des ligneux — loi du minimum (docs/regles.md §7) :
 * pousse = potentiel(espèce, saison, taille)
 *        × min(f_sécheresse, f_engorgement, f_lumière, f_azote).
 * Tous les facteurs sont désormais LOCAUX : eau et azote prélevés dans les
 * cellules de la zone racinaire (tick.ts), lumière reçue à la position de
 * l'arbre (light.ts). Mortalité déterministe par accumulation de stress quand
 * l'eau, l'anoxie ou la lumière s'effondrent (la faim d'azote rabougrit mais
 * ne tue pas en V0 ; le stress létal par carence viendra avec le budget
 * carbone, §7.3). Pas encore de profondeur racinaire par âge (horizons V1).
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { crownRadiusM } from "./light";
import { type RngState, rngFloat } from "./rng";

/** Ce qui tue un arbre — pour le raconter au joueur. */
export type CauseMort =
  | "secheresse"
  | "engorgement"
  | "ombre"
  | "vieillesse"
  | "solHorsGamme"
  | "feu"
  | "abroutissement"
  | "ravageurs"
  | "labour"
  | "maladie"
  | "frottis"
  | "ecrasement";

export const LIBELLE_CAUSE: Record<CauseMort, string> = {
  ecrasement: "écrasé par la chute d'un arbre mort",
  secheresse: "de sécheresse",
  engorgement: "asphyxiés par l'eau",
  ombre: "étouffés par l'ombre",
  vieillesse: "de vieillesse",
  solHorsGamme: "sur un sol hors de leur gamme de pH",
  feu: "dans l'incendie",
  abroutissement: "broutés par le gibier",
  ravageurs: "achevés par les ravageurs",
  labour: "retournés par le labour",
  maladie: "emportés par la maladie",
  frottis: "annelés par les frottis de cervidés",
};

export interface TreeState {
  id: number;
  especeId: string;
  /** position du tronc sur la parcelle, m (continu) */
  x: number;
  y: number;
  ageWeeks: number;
  heightM: number;
  /** points de stress cumulés ; l'arbre meurt à STRESS_LETHAL */
  stress: number;
  alive: boolean;
  /** azote acquis depuis la dernière chute des feuilles, g (recyclé en litière) */
  uptakeYearG: number;
  /** fruits mûrs en attente de récolte, kg (perdus après la fenêtre, §10) */
  fruitsKg: number;
  /** avancement de la croissance des fruits de l'année ∈ [0,1] */
  fruitProgress: number;
  /** fleurs détruites par un gel tardif cette année (§7.2) */
  bloomFrosted: boolean;
  /** ce qui a eu raison de l'arbre (renseigné à sa mort) */
  causeMort?: CauseMort;
  /**
   * Hauteur de tronc élaguée, m : la bille sans nœuds qui fera du bois
   * d'œuvre. Un arbre jamais élagué et poussé au large reste branchu — bon
   * pour le chauffage, pas pour la scierie.
   */
  hauteurElagueeM: number;
  /** nombre de recépages subis (taillis, trogne) */
  recepages: number;
  /**
   * Hauteur de la tête de trogne, m — absent si l'arbre n'a jamais été
   * étêté. Une trogne se recoupe toujours au même endroit ; la tête grossit,
   * se creuse, et c'est ce creux qui fait sa valeur pour la faune.
   */
  teteTrogneM?: number;
  /**
   * Semaine du dernier frottis subi. Une tige déjà marquée n'intéresse plus :
   * le brocard a fait son territoire, il passe à la suivante.
   */
  frotteSemaine?: number;
  /** semaine de la dernière levée d'écorce (liège) ; absent = jamais démasclé */
  derniereLeveeSemaine?: number;
  /**
   * Semaine où le feu l'a tué. L'arbre reste debout : on peut encore le
   * récolter en coupe sanitaire, à prix déprécié, avant que le bois ne
   * bleuisse et que les insectes ne s'y mettent.
   */
  brulEeSemaine?: number;
  /**
   * Semaine où la mort a été enregistrée. Tant qu'elle est absente, l'arbre
   * vient de mourir et son bois n'a pas encore rejoint le sol ; une fois
   * posée, c'est une CHANDELLE — un tronc mort resté debout
   * (`dureeChandelleSemaines`).
   */
  mortSemaine?: number;
  /**
   * Vigueur individuelle, autour de 1 : la part d'un arbre qui ne vient ni de
   * son espèce ni de sa station, mais de lui. Deux semis de même essence
   * plantés côte à côte le même jour ne font pas le même arbre — génétique,
   * qualité du plant, hasard des premières racines. C'est cette dispersion qui
   * crée les dominants et les dominés, donc l'auto-éclaircie et l'éclaircie
   * par le haut (`tirerVigueurIndividuelle`).
   */
  vigueurIndividuelle: number;
  /**
   * Profondeur réellement explorée par les racines, cm. Ce n'est pas une
   * propriété figée : l'arbre INVESTIT vers le bas quand la surface ne suffit
   * plus (plasticité racinaire). Un sujet qui n'a jamais eu soif garde un
   * système superficiel — et se retrouve vulnérable le jour où la sécheresse
   * arrive.
   */
  rootDepthCm: number;
  /**
   * Longueur de pousse encore TENDRE, m : ce que l'arbre a allongé récemment
   * et qui n'a pas fini de lignifier. C'est exactement ce que le chevreuil
   * mange — un rameau de l'année, pas du bois. Ce stock se remplit à la
   * croissance, se vide au broutage et se lignifie avec le temps.
   */
  pousseTendreM: number;
  /**
   * Dommage hydraulique ∈ [0,1] : la part du système conducteur mise hors
   * service par l'embolie.
   *
   * Quand la sécheresse devient sévère, l'eau qui monte dans les vaisseaux
   * casse en colonnes et laisse des bulles : la cavitation. Ces vaisseaux-là
   * ne se réparent pas — l'arbre ne récupère qu'en fabriquant du bois neuf, ce
   * qui prend des années. C'est LA mémoire d'une sécheresse, et elle est dans
   * l'arbre, pas dans le sol : la réserve du sol, elle, se recharge chaque
   * hiver.
   *
   * C'est ce qui explique les mortalités DIFFÉRÉES qu'on observe après 1976,
   * 2003 ou 2018 — les arbres ne meurent pas l'année de la sécheresse, mais
   * deux ou trois ans après, à la suivante.
   */
  dommageHydraulique: number;
  /**
   * Vigueur ∈ [0,1] : moyenne lissée du facteur limitant sur les derniers
   * mois. Ce n'est pas la même chose que le stress. Le stress ne monte que
   * lorsque l'arbre est en danger de mort ; la vigueur, elle, dit s'il pousse
   * à son potentiel ou s'il végète. Un sujet dominé ou chroniquement assoiffé
   * a une vigueur basse bien avant d'accumuler du stress — et c'est CELUI-LÀ
   * que les ravageurs trouvent (moins de résine, moins de tanins).
   */
  vigueur: number;
  /**
   * Plant protégé (manchon, gaine) : hors d'atteinte des dents tant qu'il n'a
   * pas dépassé la hauteur de broutage.
   */
  protege: boolean;
}

/** Conditions de la semaine vues par UN arbre (sol local, canopée, météo). */
export interface TreeEnvironment {
  /** transpiration obtenue / demandée ∈ [0,1] (zone racinaire de CET arbre) */
  waterSatisfaction: number;
  /** engorgement moyen de la zone racinaire ∈ [0,1] */
  waterloggingRatio: number;
  /** lumière relative reçue à la position de CET arbre ∈ [0,1] (light.ts) */
  light: number;
  /** satisfaction du besoin d'azote de CET arbre ∈ [0,1] */
  nitrogenSatisfaction: number;
  /** satisfaction des besoins en phosphore et en potassium ∈ [0,1] (pk.ts) */
  phosphoreSatisfaction?: number;
  potassiumSatisfaction?: number;
  /** pH moyen de la zone racinaire */
  phMean: number;
  /** profondeur de sol pénétrable de la station, cm */
  solPenetrableCm: number;
  /** °C moyenne de la semaine */
  tMean: number;
  /**
   * Part du feuillage ACTIF de cet arbre ∈ [0,1] (phenologie.ts) : celui qui
   * travaille, pas celui qui ombre. Un caduc sans feuilles ne pousse pas et ne
   * transpire pas, quelle que soit la douceur du temps — c'était le trou que
   * laissait un facteur saison purement thermique. Absente, on suppose le
   * feuillage complet, ce qui préserve le comportement des essais qui
   * n'étudient pas la phénologie.
   */
  partFoliaire?: number;
  /**
   * Effet fertilisant du CO₂ sur le potentiel de croissance (climat.ts).
   * 1 = concentration d'aujourd'hui. Il agit sur le POTENTIEL, donc la loi du
   * minimum le borne : un arbre qui a soif n'en profite pas.
   */
  facteurCo2?: number;
}

export const STRESS_LETHAL = 10;

/**
 * Vitesse à laquelle la cavitation s'installe quand la satisfaction en eau
 * tombe sous le seuil de survie de l'espèce *(à calibrer)*.
 */
export const CAVITATION_PAR_SEMAINE = 0.03;

/**
 * Part du seuil de survie en dessous de laquelle la cavitation s'installe
 * vraiment. Ce n'est pas le simple manque d'eau qui casse les colonnes : il
 * faut une tension extrême, bien au-delà de l'inconfort. Un arbre passe des
 * étés à souffrir sans s'emboliser.
 */
export const SEUIL_CAVITATION = 0.5;

/**
 * Vitesse de « réparation » : l'arbre ne répare rien, il dilue le dommage en
 * fabriquant du bois neuf. Compter des années, pas des semaines — environ 6 %
 * par an, soit trois à quatre ans pour effacer un épisode sévère. C'est
 * l'ordre de grandeur du décalage observé entre une grande sécheresse et le
 * pic de mortalité qui la suit *(à calibrer)*.
 */
export const RECUPERATION_PAR_SEMAINE = 0.0012;

/**
 * Fait évoluer le dommage hydraulique d'un arbre : il s'aggrave sous stress
 * sévère, se dilue lentement le reste du temps.
 */
export function prochainDommageHydraulique(
  dommage: number,
  satisfactionEau: number,
  seuilSurvie: number,
): number {
  const seuil = seuilSurvie * SEUIL_CAVITATION;
  if (satisfactionEau < seuil) {
    const severite = (seuil - satisfactionEau) / Math.max(0.05, seuil);
    return Math.min(0.85, dommage + CAVITATION_PAR_SEMAINE * severite);
  }
  return Math.max(0, dommage - RECUPERATION_PAR_SEMAINE);
}
/**
 * Facteur de survie sous ce seuil → l'arbre puise dans ses réserves. Les
 * facteurs sont déjà normalisés par les tolérances de l'espèce, donc ce seuil
 * unique produit des mortalités différenciées par espèce.
 */
const STRESS_ONSET = 0.45;
const STRESS_RECOVERY = 0.5; // facteur de survie au-dessus → récupération lente
/**
 * Semaines de végétation effectives par an, pour convertir la pousse annuelle
 * en pousse hebdomadaire.
 *
 * La valeur a baissé de trente à vingt-six le jour où la croissance a cessé
 * d'être commandée par la seule température. Ce n'est pas un rattrapage : la
 * constante veut dire « le nombre de semaines sur lesquelles la pousse
 * annuelle se répartit », et la phénologie en donne désormais le vrai compte —
 * un caduc n'a de feuilles qu'une petite moitié de l'année, pas dès qu'il fait
 * doux. Sans cet ajustement, la même pousse annuelle se serait retrouvée
 * étalée sur une saison plus courte, donc amputée d'un dixième *(à calibrer)*.
 */
const GROWING_WEEKS = 26;

/**
 * Exposant de forme de la courbe de hauteur (Chapman-Richards).
 *
 * Toutes les tables de production s'ajustent sur la même famille de courbes :
 * `H = A·(1 − e^(−k·t))^c`. Le moteur en écrivait la forme différentielle avec
 * `c = 1` — c'est exactement ce que dit `pousse × (1 − h/hmax)` — et cette
 * valeur-là est la SEULE de la famille qui ne soit pas sigmoïde : la pousse
 * annuelle y est maximale à la germination et ne fait que décroître ensuite.
 * Aucune essence ne pousse comme ça. Un hêtre fait quinze centimètres par an
 * sous son couvert d'origine, accélère vers vingt ans et ne culmine qu'entre
 * dix et vingt mètres.
 *
 * Avec `c > 1`, la pousse maximale se déplace à `((c−1)/c)^c` de la hauteur
 * adulte — 19 % pour `c = 1,5`, ce qui place le maximum du hêtre vers sept
 * mètres, du bon ordre. Bouchon & Trencia (1990, Rev. For. Fr. XLII-2)
 * publient pour le chêne sessile des `c` de 1,14 à 2,07 selon la classe de
 * fertilité ; Patrício et al. (iForest, châtaignier) un exposant de 1,62.
 * Un et demi est au milieu de cette fourchette.
 *
 * On a essayé 2, qui colle encore mieux à la table du hêtre. Il fallait le
 * payer : un semis passe alors trois fois plus de temps sous la dent et sous
 * l'ombre, et sept essais d'écologie basculaient — l'installation sur la
 * lande, l'effet nurse, l'atténuation du feu par les feuillus. La fidélité de
 * la courbe ne vaut pas qu'on rende des plants incapables de sortir de terre
 * sur une station difficile *(à calibrer)*.
 *
 * *(Limite assumée : `c` est global. Les tables distinguent trois profils —
 * démarrage rapide et plateau précoce (aulne, bouleau, merisier), démarrage
 * lent et croissance longue (hêtre, chênes, sapin), intermédiaire (frêne, pin,
 * douglas) — que ce paramètre unique ne sait pas rendre.)*
 */
export const FORME_CROISSANCE = 1.5;

/**
 * Normalisation : sans elle, `pousseMaxMAn` cesserait de vouloir dire « la
 * pousse annuelle maximale ». On divise par le sommet de la courbe de forme,
 * pour que ce sommet vaille exactement 1 quel que soit l'exposant.
 */
const FORME_SOMMET =
  ((FORME_CROISSANCE - 1) / FORME_CROISSANCE) ** (FORME_CROISSANCE - 1) / FORME_CROISSANCE;

/**
 * Part du potentiel de pousse qu'un arbre de cette taille peut encore
 * exprimer ∈ [0,1] : lente à la levée, maximale vers le cinquième de la
 * hauteur adulte, nulle à l'arrivée. C'est la forme différentielle de
 * Chapman-Richards (`FORME_CROISSANCE`), ramenée à un sommet de 1.
 *
 * La forme dépend de la TAILLE, pas de l'âge : un rejet de trogne repart donc
 * au régime de sa hauteur, pas de celui de sa souche, et un dominé qui reste
 * petit reste lent. C'est la limite classique des modèles de trouée, assumée
 * ici parce que c'est elle qui rend la plasticité du moteur possible.
 */
export function formeCroissance(heightM: number, hauteurMaxM: number): number {
  const u = Math.min(1, Math.max(0, heightM / hauteurMaxM));
  const v = u ** (1 / FORME_CROISSANCE);
  return (v ** (FORME_CROISSANCE - 1) * (1 - v)) / FORME_SOMMET;
}
/** rayon de la zone racinaire / rayon du houppier *(à confirmer)* */
const ROOT_CROWN_RATIO = 1.2;
/** part de l'ETP transpirée par une couronne en pleine feuille *(à calibrer)* */
const TRANSPIRATION_COEFF = 0.9;

/**
 * Profondeur que l'arbre POURRAIT atteindre : ce que son espèce et sa taille
 * permettent, borné par ce que le sol laisse pénétrer (roche, alios).
 * C'est un plafond, pas la profondeur réelle — voir `nouvelleProfondeurRacines`.
 */
export function profondeurRacinesCm(
  espece: EspeceV0,
  heightM: number,
  solPenetrableCm: number,
): number {
  // Un jeune plant explore déjà 20-30 cm ; l'approfondissement suit la
  // croissance et sature quand l'arbre atteint sa taille adulte.
  const maturite = Math.min(1, (heightM / (0.6 * espece.hauteurMaxM)) ** 0.7);
  const potentiel = 25 + (espece.racines.profondeurMaxCm - 25) * maturite;
  return Math.max(15, Math.min(potentiel, solPenetrableCm));
}

/**
 * Part du potentiel qu'un arbre développe même sans jamais manquer d'eau :
 * un système de base, proportionné à sa taille, qui l'ancre et le nourrit.
 */
const RACINES_PLANCHER = 0.35;
/** Vitesse maximale d'approfondissement d'un arbre assoiffé, cm/an *(à calibrer)*. */
const APPROFONDISSEMENT_CM_AN = 25;

/**
 * Plasticité racinaire : l'arbre n'investit vers le bas que si la surface ne
 * lui suffit pas. Comblé en eau, il garde un chevelu superficiel (économe) ;
 * assoiffé, il descend chercher la réserve profonde. Les racines déjà faites
 * ne disparaissent pas — la profondeur ne régresse jamais.
 */
export function nouvelleProfondeurRacines(
  espece: EspeceV0,
  tree: TreeState,
  solPenetrableCm: number,
  waterSatisfaction: number,
  season: number,
): number {
  const potentiel = profondeurRacinesCm(espece, tree.heightM, solPenetrableCm);
  const plancher = Math.min(potentiel, Math.max(15, RACINES_PLANCHER * potentiel));
  // La soif (et elle seule) déclenche l'investissement vers le bas.
  const soif = Math.max(0, 1 - waterSatisfaction);
  const gain = (APPROFONDISSEMENT_CM_AN / 52) * season * soif;
  return Math.min(potentiel, Math.max(plancher, tree.rootDepthCm + gain));
}

/**
 * Répartition verticale des racines : densité décroissante avec la profondeur
 * (modèle exponentiel classique). Rend la fraction de racines présente dans
 * chaque horizon, dans l'ordre du profil, en tenant compte de la profondeur
 * réellement explorée.
 */
export function fractionsRacinairesParHorizon(
  epaisseursCm: readonly number[],
  profondeurExploreeCm: number,
): number[] {
  const fractions: number[] = [];
  let sommet = 0;
  let total = 0;
  for (const epaisseur of epaisseursCm) {
    const bas = Math.min(sommet + epaisseur, profondeurExploreeCm);
    if (bas <= sommet) {
      fractions.push(0);
    } else {
      // Densité ∝ exp(-z / L) : la moitié des racines dans le premier tiers.
      const L = Math.max(15, profondeurExploreeCm / 2.2);
      const part = Math.exp(-sommet / L) - Math.exp(-bas / L);
      fractions.push(part);
      total += part;
    }
    sommet += epaisseur;
  }
  if (total <= 0) {
    // Sol si mince que tout tient dans le premier horizon.
    return epaisseursCm.map((_, i) => (i === 0 ? 1 : 0));
  }
  return fractions.map((f) => f / total);
}

/** Rayon de prospection racinaire, m (au moins 1 m — le semis a sa cellule). */
export function rootRadiusM(espece: EspeceV0, heightM: number): number {
  return Math.max(1, ROOT_CROWN_RATIO * crownRadiusM(heightM, espece.lumiere.houppierRatio));
}

/**
 * Part de la demande évaporatoire qui subsiste à l'ombre totale (advection,
 * déficit de saturation de l'air) : sous couvert, l'essentiel du rayonnement
 * net disparaît et la transpiration s'effondre *(à calibrer)*.
 */
const SHADE_TRANSPIRATION_FLOOR = 0.25;
/**
 * Surcroît de demande en plein vent sur une station très exposée *(à calibrer)*.
 * Un sujet abrité (par une nurse, une haie, la canopée) y échappe : c'est
 * l'effet brise-vent, le gain agroforestier le mieux documenté (ch5).
 */
const WIND_MAX_EXTRA = 0.6;

/**
 * Demande de transpiration de l'arbre, L/semaine : demande évaporatoire ×
 * surface de couronne × saison × **rayonnement reçu** (un caduc sans feuilles
 * ne transpire pas).
 * Le facteur rayonnement est le moteur de l'effet nurse (ch1-A) : un sujet
 * abrité transpire bien moins qu'en plein soleil, donc survit là où l'eau
 * manque — au prix d'une croissance bridée par f_lumière. En milieu frais le
 * marché s'inverse : l'ombre ne protège de rien et coûte de la croissance.
 */
export function treeWaterDemandL(
  espece: EspeceV0,
  heightM: number,
  etpMm: number,
  season: number,
  light = 1,
  ventExposition = 0,
  abriVent = 0,
): number {
  const r = crownRadiusM(heightM, espece.lumiere.houppierRatio);
  const crownAreaM2 = Math.max(0.05, Math.PI * r * r);
  const rayonnement = SHADE_TRANSPIRATION_FLOOR + (1 - SHADE_TRANSPIRATION_FLOOR) * light;
  const vent = 1 + WIND_MAX_EXTRA * ventExposition * (1 - abriVent);
  // Efficience d'usage de l'eau : les xérophiles (cuticule épaisse, stomates
  // régulés) transpirent moins par unité de couronne que les hygrophiles.
  const wue = 0.35 + 0.65 * espece.eau.seuilConfortSecheresse;
  return etpMm * crownAreaM2 * TRANSPIRATION_COEFF * wue * season * rayonnement * vent;
}

/**
 * Azote qu'un houppier réclame par m² de projection au sol et par an, g, pour
 * une essence d'exigence maximale (`demandeRelative` = 1).
 *
 * C'est le seul point d'entrée où le besoin d'azote se raccroche à une
 * grandeur mesurable : un couvert feuillu ferme porte 5 à 6 m² de feuilles par
 * m² de sol, une feuille titre 2 à 2,5 % d'azote, et l'arbre en retransloque
 * environ la moitié avant la chute. Le compte tombe sur 5 à 10 g d'azote par
 * m² de couvert et par an, ce qui est exactement la fourchette des bilans de
 * peuplements tempérés — 50 à 100 kg N/ha/an au houppier fermé.
 *
 * La version précédente écrivait ce besoin comme `60 × h^1,5` g/an. Un hêtre
 * de quinze mètres y réclamait 3,5 kg d'azote à lui seul, soit près de dix
 * fois la part qui lui revient dans un peuplement — et la loi du minimum
 * rabotait alors la croissance de tout le monde, partout, sur un besoin
 * imaginaire. C'est ce qui plafonnait les hauteurs *(à calibrer)*.
 */
export const AZOTE_HOUPPIER_G_M2_AN = 8;

/**
 * Rayon de houppier / hauteur de référence. L'appareil racinaire est
 * dimensionné sans la fiche d'espèce (le tick n'a que la hauteur sous la
 * main) : on prend donc un houppier moyen de l'atlas plutôt que celui de
 * l'espèce, et c'est `demandeRelative` — et elle seule — qui différencie les
 * essences, comme avant.
 */
const HOUPPIER_REFERENCE = 0.4;

/** Taille « métabolique » d'un arbre (proxy feuillage + bois neuf), g N/semaine max. */
function metabolicSizeGWeek(heightM: number): number {
  const r = HOUPPIER_REFERENCE * heightM;
  return (AZOTE_HOUPPIER_G_M2_AN * Math.PI * r * r) / 52;
}

/** Besoin d'azote de l'arbre, g/semaine : exigence de l'espèce × taille. */
export function treeNitrogenNeedGWeek(espece: EspeceV0, heightM: number): number {
  return espece.azote.demandeRelative * metabolicSizeGWeek(heightM);
}

/**
 * Capacité d'extraction racinaire, g/semaine : dépend de la taille seulement —
 * c'est le besoin qui varie selon l'espèce, pas l'appareil racinaire.
 */
export function treeExtractionCapacityGWeek(heightM: number): number {
  return metabolicSizeGWeek(heightM);
}

/** Facteur saison : 0 sous la température de base, 1 à base+8 °C. */
export function seasonFactor(espece: EspeceV0, tMean: number): number {
  return Math.min(1, Math.max(0, (tMean - espece.tBaseCroissanceC) / 8));
}

/** f_sécheresse : la tolérance de l'espèce décale le seuil où l'eau devient limitante. */
function droughtFactor(espece: EspeceV0, satisfaction: number): number {
  return Math.min(1, satisfaction / espece.eau.seuilConfortSecheresse);
}

/** f_engorgement : 1 tant que l'anoxie reste sous la tolérance, 0 à saturation totale. */
function waterloggingFactor(espece: EspeceV0, waterlogging: number): number {
  const tol = espece.eau.toleranceEngorgement;
  if (waterlogging <= tol) return 1;
  return Math.max(0, 1 - (waterlogging - tol) / Math.max(1e-9, 1 - tol));
}

/**
 * f_pH : 1 dans la gamme de l'espèce, bordure douce de ±0,7 pH, 0 au-delà
 * (chlorose puis mort — la bio-indication de l'atlas : calcicoles vs acidiphiles).
 */
export function phFactor(espece: EspeceV0, ph: number): number {
  const [min, max] = espece.ph;
  return Math.min(1, Math.max(0, Math.min((ph - min) / 0.7, (max - ph) / 0.7)));
}

/**
 * f_lumière : 0 au point de compensation (l'arbre vit sur ses réserves),
 * 1 à saturation — les sciaphiles saturent bas, les héliophiles exigent le plein soleil (ch3-B).
 */
function lightFactor(espece: EspeceV0, light: number): number {
  const { compensation, saturation } = espece.lumiere;
  return Math.min(1, Math.max(0, (light - compensation) / (saturation - compensation)));
}

export interface TreeTickResult {
  tree: TreeState;
  /** facteur limitant de la semaine (débogage/UI) */
  limitingFactor: number;
}

export function tickTree(tree: TreeState, env: TreeEnvironment): TreeTickResult {
  if (!tree.alive) return { tree, limitingFactor: 0 };

  const espece = getEspece(tree.especeId);
  // La saison a deux commandes, et il faut les deux : la CHALEUR, qui décide
  // si l'activité est possible, et le FEUILLAGE, qui décide s'il y a de quoi
  // travailler. Un hiver doux ne fait pas pousser un arbre nu.
  const feuillageActif = env.partFoliaire ?? 1;
  const season = seasonFactor(espece, env.tMean) * feuillageActif;
  // Plasticité racinaire : l'arbre approfondit s'il a manqué d'eau cette semaine.
  const rootDepthCm = nouvelleProfondeurRacines(
    espece,
    tree,
    env.solPenetrableCm,
    env.waterSatisfaction,
    season,
  );
  const fSec = droughtFactor(espece, env.waterSatisfaction);
  // Survie hydrique : seuil découplé du confort (le hêtre pousse mal en sec
  // mais son semis survit ; l'aulne, lui, meurt vite hors sol frais).
  const fSecSurvie = Math.min(1, env.waterSatisfaction / espece.eau.seuilStressSecheresse);
  const fEng = waterloggingFactor(espece, env.waterloggingRatio);
  const fLum = lightFactor(espece, env.light);
  const fPH = phFactor(espece, env.phMean);
  const fN = espece.azote.fixateur ? 0.95 : env.nitrogenSatisfaction;
  // Loi du minimum : le phosphore et le potassium entrent au même titre que
  // les autres. Ils ne freinent presque jamais sur un bon sol — c'est sur les
  // sols acides ou sableux qu'ils prennent la main (pk.ts).
  const fP = env.phosphoreSatisfaction ?? 1;
  const fK = env.potassiumSatisfaction ?? 1;
  const limitingFactor = Math.min(fSec, fEng, fLum, fPH, fN, fP, fK);
  // Seuls l'eau, l'anoxie et l'ombre SOUS le point de compensation épuisent
  // les réserves : au-dessus, l'arbre « survit » même s'il ne pousse plus
  // (méthode pousse / s'épanouit / survit, ch3-C). L'ombre ne compte qu'en
  // saison de végétation : un arbre dormant ne consomme presque rien.
  const fLumSurvival =
    season > 0 ? Math.min(1, (0.5 * env.light) / espece.lumiere.compensation) : 1;
  // Sénescence : passé ~85 % de la longévité, la vigueur décline puis l'arbre
  // meurt (déterministe) — le moteur du cycle sylvigénétique (ch4-A).
  const ageYears = tree.ageWeeks / 52;
  // Une trogne vit des siècles là où l'arbre de plein vent vieillit : chaque
  // étêtage rajeunit la charpente, et l'arbre ne porte jamais le poids d'un
  // houppier de futaie. C'est pour ça que les plus vieux arbres de nos
  // campagnes sont presque tous des trognes (ch5-A).
  const longevite = espece.regeneration.longeviteAns * (1 + 0.5 * Math.min(4, tree.recepages));
  const fAge =
    ageYears < 0.85 * longevite
      ? 1
      : Math.max(0, 1 - (ageYears - 0.85 * longevite) / (0.3 * longevite));
  const survivalFactor = Math.min(fSecSurvie, fEng, fLumSurvival, fPH, fAge);

  // Croissance : potentiel × loi du minimum, asymptote vers la hauteur max.
  // Un arbre stressé pousse moins (il puise dans ses réserves, docs/regles.md §7.1).
  const stressPenalty = 1 - tree.stress / STRESS_LETHAL;
  const potentialM =
    (espece.pousseMaxMAn / GROWING_WEEKS) *
    season *
    fAge *
    (env.facteurCo2 ?? 1) *
    formeCroissance(tree.heightM, espece.hauteurMaxM);
  // La vigueur individuelle entre ici, et seulement ici : elle module ce que
  // l'arbre TIRE de conditions données, pas les conditions elles-mêmes. Deux
  // voisins ont la même eau et la même lumière ; l'un en fait plus que l'autre,
  // et c'est ce qui crée les dominants et les dominés.
  const heightM =
    tree.heightM +
    Math.max(0, potentialM) * limitingFactor * stressPenalty * tree.vigueurIndividuelle;

  // Stress : il s'accumule quand le facteur de survie s'effondre, se résorbe sinon.
  let stress = tree.stress;
  if (survivalFactor < STRESS_ONSET) {
    stress += (STRESS_ONSET - survivalFactor) * 5;
  } else if (survivalFactor > STRESS_RECOVERY) {
    stress = Math.max(0, stress - 0.25);
  }
  const alive = stress < STRESS_LETHAL;
  // À la mort, on retient QUEL facteur a eu le dernier mot : c'est ce que le
  // joueur a besoin de savoir pour corriger le tir.
  let causeMort: CauseMort | undefined;
  if (!alive) {
    // Le pH manquait à cette liste alors qu'il compte dans la survie : un
    // arbre tué par un sol trop acide se voyait attribuer la « vieillesse »,
    // parce que tous les facteurs listés valaient 1 et que l'âge était le
    // premier testé. Un pommier de trois ans mort « de vieillesse » sur une
    // lande à pH 4,5, c'était ça.
    const pire = Math.min(fSecSurvie, fEng, fLumSurvival, fPH, fAge);
    causeMort =
      pire === fPH
        ? "solHorsGamme"
        : pire === fAge
          ? "vieillesse"
          : pire === fEng
            ? "engorgement"
            : pire === fLumSurvival
              ? "ombre"
              : "secheresse";
  }

  return {
    tree: { ...tree, ageWeeks: tree.ageWeeks + 1, heightM, stress, alive, rootDepthCm, causeMort },
    limitingFactor,
  };
}

/**
 * Combien de temps un arbre mort reste DEBOUT, en semaines.
 *
 * Un arbre tué par la sécheresse ou le feu ne s'effondre pas le jour même : il
 * sèche sur pied et tient des années. Cette chandelle est un habitat à part
 * entière — c'est là que les pics creusent, et le trou qu'ils abandonnent
 * sert ensuite à des dizaines d'espèces — et elle ne fait pas d'ombre,
 * puisqu'elle n'a plus de feuilles. Le bois dense tient plus longtemps : un
 * chêne mort reste debout une décennie là où un saule s'écroule en trois ans.
 *
 * *(à calibrer : les durées de terrain vont de 2 à 20 ans selon l'essence, le
 * diamètre et l'exposition au vent, que le moteur ne connaît pas encore)*
 */
export const CHANDELLE_ANS_PAR_DENSITE = 15;

export function dureeChandelleSemaines(espece: EspeceV0): number {
  return Math.round(espece.bois.densite * CHANDELLE_ANS_PAR_DENSITE * 52);
}

/**
 * Dispersion de la vigueur individuelle : écart-type relatif. Vingt pour cent
 * — un arbre sur vingt pousse un tiers plus vite que la moyenne, un autre un
 * tiers moins — c'est l'ordre de grandeur observé dans une plantation
 * monoclonale, avant même que la concurrence ne s'en mêle *(à calibrer)*.
 */
export const DISPERSION_VIGUEUR = 0.2;
/** Bornes : ni un arbre deux fois trop vigoureux, ni un plant mort-né. */
export const VIGUEUR_MIN = 0.55;
export const VIGUEUR_MAX = 1.45;

/**
 * Tire la vigueur d'un individu. Deux tirages uniformes moyennés : cela suffit
 * à faire une cloche, et cela reste déterministe pour une graine donnée.
 */
export function tirerVigueurIndividuelle(rng: RngState): { rng: RngState; vigueur: number } {
  const a = rngFloat(rng);
  const b = rngFloat(a.state);
  const centre = (a.value + b.value) / 2;
  const vigueur = 1 + DISPERSION_VIGUEUR * 2 * (centre - 0.5) * 2;
  return {
    rng: b.state,
    vigueur: Math.min(VIGUEUR_MAX, Math.max(VIGUEUR_MIN, vigueur)),
  };
}
