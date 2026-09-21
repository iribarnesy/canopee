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

import { facteurAllelopathie, SENSIBILITE_MEDIANE } from "./allelopathie";
import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { crownRadiusM } from "./light";
import { partPuiseeSurLesReserves, usureParSemaine } from "./reserves";
import { type RngState, rngFloat } from "./rng";
import { facteurGammePh, facteurSurviePh, VIGUEUR_A_LA_BORNE } from "./soil";
import { facteurCroissanceTassement } from "./tassement";

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
  | "chablis"
  | "volis"
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
  chablis: "couchés par la tempête",
  volis: "cassés net par la tempête",
};

export interface TreeState {
  id: number;
  especeId: string;
  /** position du tronc sur la parcelle, m (continu) */
  x: number;
  y: number;
  ageWeeks: number;
  heightM: number;
  /**
   * Diamètre à 1,30 m, cm — une grandeur PORTÉE par l'arbre, pas déduite de sa
   * hauteur.
   *
   * C'est la différence qui rend le reste possible : deux arbres de même
   * hauteur n'ont pas le même diamètre si l'un a poussé à l'ombre et l'autre au
   * large, et c'est cet écart qui décide lequel casse au vent (`elancement`).
   * Le volume, donc le carbone et le prix, en découlent (`volumeTigeM3`).
   */
  diametreCm: number;
  /** points de stress cumulés ; l'arbre meurt à STRESS_LETHAL */
  stress: number;
  /**
   * La part de `stress` venue des causes LENTES — la famine de réserves et les
   * facteurs de station (ombre, soif, engorgement, pH, âge). Le reste, par
   * différence, est ce que les coups BRUSQUES ont ajouté : ravageurs, maladie,
   * frottis.
   *
   * ELLE EXISTE PARCE QUE `causeMort` RETENAIT LE DERNIER COUP ET NON LA CAUSE
   * (#103). Un dominé remplit son compteur pendant des décennies, puis un
   * dégât de ravageur le pousse au-delà du seuil — et le moteur écrivait
   * « ravageurs ». C'est juste comme description du coup de grâce : un arbre
   * affamé ne refait plus ses tanins ni sa résine, les ravageurs le trouvent,
   * et la littérature décrit ce syndrome. Mais comme RAPPORT au joueur, c'est
   * le contraire du geste à apprendre — il ira traiter là où il fallait
   * éclaircir. Mesuré sur une hêtraie serrée de cent vingt ans : 327 morts
   * « ravageurs » dont 197 disparaissent quand on neutralise la famine.
   *
   * Elle s'amortit AU PRORATA quand l'arbre cicatrise : une cicatrisation
   * efface du stress sans savoir d'où il venait, donc elle en efface la même
   * proportion de chaque origine.
   *
   * Optionnelle, et volontairement : c'est un compteur DÉRIVÉ, pas un état
   * fondamental. Un arbre qu'on instancie sans elle n'a pas de provenance
   * enregistrée, ce qui se lit « zéro » — la même convention que
   * `brulEeSemaine` ou `causeLente`, et ça évite d'imposer un champ de
   * comptabilité à tous les bancs d'essai.
   */
  stressLent?: number;
  /**
   * Laquelle des causes lentes pèse le plus, relevée chaque semaine par
   * `tickTree` — pas seulement à la mort. C'est ce qui permet à un coup brusque
   * de céder la place : il sait que l'arbre était condamné, il ne saurait pas
   * dire à quoi.
   */
  causeLente?: CauseMort;
  /**
   * Stress accumulé par les RAVAGEURS, et son jumeau `stressMaladie` pour les
   * maladies (#153). Deux sources rapides qui, avant ce champ, s'ajoutaient à
   * `stress` sans laisser de nom : l'arbre ne pouvait dire de quoi il souffrait
   * qu'en en MOURANT, par `causeMort`. Mesuré sur soixante abricotiers pendant
   * vingt-cinq ans : 592 unités de dégâts infligées, aucune nommée, parce
   * qu'aucun arbre n'en était mort.
   *
   * Ils s'amortissent AU PRORATA comme `stressLent`, et par le même calcul :
   * une cicatrisation efface du stress sans savoir d'où il venait, donc elle en
   * efface la même proportion de chaque origine.
   *
   * DEUX CHAMPS PLUTÔT QU'UN REGISTRE `Partial<Record<CauseMort, number>>`, qui
   * serait extensible et se lirait mieux : il coûterait un objet de plus par
   * arbre et par semaine, dans la boucle la plus chaude du moteur, pour nommer
   * deux causes. Les deux seules sources de stress anonymes sont ici — le
   * frottis pose déjà `frotteSemaine` et émet son geste, la famine et les
   * facteurs de station passent par `stressLent`. Le jour où une troisième
   * apparaît, ce sera le moment de repeser ce choix, pas avant.
   *
   * Optionnels pour la même raison que `stressLent` : compteurs dérivés, pas
   * états fondamentaux ; absent se lit « zéro ».
   */
  stressRavageurs?: number;
  /** Stress accumulé par les MALADIES — voir `stressRavageurs`. */
  stressMaladie?: number;
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
  /**
   * Base du houppier, m : la hauteur en dessous de laquelle il n'y a plus de
   * branches vivantes (docs/realisme.md B10). Absente = branchu jusqu'en bas,
   * ce qu'est tout arbre qui vient de naître.
   *
   * Elle ne DESCEND jamais — une branche morte ne repousse pas. Elle monte de
   * deux façons, et l'arbre ne les distingue pas : l'ombre tue les branches
   * basses (élagage naturel, `light.ts:baseHouppierCible`), ou le joueur les
   * coupe (`hauteurElagueeM`). Un arbre rabattu la ramène à sa nouvelle
   * hauteur — un recépage repart branchu.
   *
   * C'est elle, et non un ratio fixe par espèce, qui fait qu'un chêne de pré
   * est branchu jusqu'en bas et qu'un chêne de futaie a quinze mètres de fût
   * nu : la profondeur de couronne est un résultat de compétition.
   */
  baseHouppierM?: number;
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
  /**
   * Semaine du dernier abroutissement subi ; absente = jamais brouté.
   *
   * `pousseTendreM` ne peut pas la remplacer, et c'est tout l'objet de ce
   * champ : c'est un STOCK, qui monte avec la pousse, descend de la
   * lignification et descend encore de ce que le chevreuil emporte. Une valeur
   * basse a donc au moins trois causes indiscernables — l'arbre vient d'être
   * brouté, l'arbre ne pousse pas en ce moment, ou tout a lignifié depuis
   * longtemps. Seule une DATE distingue l'événement de l'état.
   *
   * Même rôle que `frotteSemaine` pour le frottis, et pour la même raison :
   * l'abroutissement est une boucle de décision (voir un plant rabattu,
   * protéger, clôturer, réguler), et sans trace elle est aveugle.
   */
  brouteSemaine?: number;
  /** semaine de la dernière levée d'écorce (liège) ; absent = jamais démasclé */
  derniereLeveeSemaine?: number;
  /**
   * Semaine où le feu l'a tué. L'arbre reste debout : on peut encore le
   * récolter en coupe sanitaire, à prix déprécié, avant que le bois ne
   * bleuisse et que les insectes ne s'y mettent.
   */
  brulEeSemaine?: number;
  /**
   * Semaine où une tempête l'a couché (tempete.ts). Même statut qu'un arbre
   * brûlé : il reste récupérable un an en coupe sanitaire, à prix déprécié,
   * avant que le bois ne bleuisse — c'est le VRAI chablis, celui dont
   * `DECOTE_CHABLIS` porte le nom depuis toujours sans le désigner.
   */
  /**
   * ABRI AUQUEL CET ARBRE-LÀ EST HABITUÉ ∈ [0,1] : moyenne lissée de l'abri
   * qu'il a connu, remise à jour une fois l'an (`tempete.ts`, critère F18).
   *
   * Ce n'est pas son abri actuel — c'est la mémoire de celui sous lequel il a
   * fabriqué son fût et ses racines. Ce qui fragilise un arbre qu'on vient de
   * découvrir n'est pas d'être exposé, c'est de l'être SANS Y ÊTRE PRÉPARÉ :
   * l'épaississement du tronc sous la contrainte mécanique se compte en
   * années. La chute entre cette mémoire et l'abri du jour mesure cette
   * naïveté, et elle s'estompe toute seule à mesure que la mémoire rattrape.
   *
   * Absent sur un arbre qui n'a pas encore vu passer un 1ᵉʳ janvier : il est
   * alors réputé habitué à ce qu'il a, donc pas naïf. Un semis ne naît pas
   * fragile.
   */
  abriHabituel?: number;
  renverseSemaine?: number;
  /**
   * Direction dans laquelle le tronc est parti, radians — posée au moment du
   * coup de vent, relue quand le bois se couche au sol (`boisMort.ts`). Sans
   * elle, un chablis retomberait dans le sens de la PENTE un an plus tard,
   * comme une chandelle, et la trace du vent serait perdue.
   */
  chuteRad?: number;
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
   * Part du houppier ARRACHÉE par un coup de vent et pas encore reconstituée
   * ∈ [0 ; 0,4] (`tempete.ts`, critère F17).
   *
   * Le troisième dégât d'une tempête, celui qui laisse l'arbre debout : ni
   * motte arrachée, ni fût cassé, des branches en moins. C'est le plus FRÉQUENT
   * — on le voit après chaque coup de vent sans que rien ne soit par terre — et
   * il coûte de deux façons : l'arbre intercepte moins de lumière tant qu'il
   * n'a pas repoussé, et ses plaies sont une porte d'entrée pour les maladies.
   *
   * Même famille que `dommageHydraulique` : une mémoire d'événement, portée par
   * l'arbre et non par son milieu, qui s'efface lentement.
   */
  houppierPerdu?: number;
  /**
   * CARIE DU TRONC ∈ [0,1] : la part du RAYON mangée par les champignons de
   * carie (`tempete.ts`, #182).
   *
   * Elle s'installe par une PLAIE — branche arrachée, frottis, brûlure,
   * recépage, élagage — et **elle ne guérit jamais**. C'est ce qui la distingue
   * de `houppierPerdu`, qui repousse : une colonne de carie ne fait que monter,
   * et c'est ce qui rend un vieil arbre plusieurs fois blessé cumulativement
   * fragile.
   *
   * Ce n'est PAS la vieillesse : `tickTree` fait déjà décliner la vigueur passé
   * 85 % de la longévité. La carie est attachée aux blessures, et un arbre
   * jamais blessé reste sain quel que soit son âge.
   */
  pourriture?: number;
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
  /**
   * Intensité de l'inhibition allélopathique subie à cet endroit ∈ [0,1] : la
   * somme de ce que les émetteurs voisins déversent ici (allelopathie.ts).
   */
  intensiteAllelopathique?: number;
  potassiumSatisfaction?: number;
  /** pH moyen de la zone racinaire */
  phMean: number;
  /** profondeur de sol pénétrable de la station, cm */
  solPenetrableCm: number;
  /**
   * Tassement de la cellule ∈ [0,1] (tassement.ts). Il n'entre PAS dans la loi
   * du minimum : ce n'est pas une ressource qui manque, c'est une contrainte
   * physique sur l'exploration racinaire, qui s'applique par-dessus tout le
   * reste — un sol tassé rend moins accessible l'eau ET les éléments qu'il
   * contient pourtant.
   */
  tassement?: number;
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
 *
 * EXPORTÉE parce qu'elle décale un seuil qu'on lit de travers. Pour l'ombre,
 * `fLumSurvival = min(1, 0,5 × lumière / compensation)` : le stress ne monte
 * donc PAS au point de compensation, mais à `2 × STRESS_ONSET × compensation`,
 * soit 0,9 fois celui-ci. La compensation, elle, ne gouverne que l'arrêt de la
 * croissance. `lumiere.test.ts` compare ce seuil-là au plancher de lumière.
 */
export const STRESS_ONSET = 0.45;
const STRESS_RECOVERY = 0.5; // facteur de survie au-dessus → récupération lente
/**
 * Points de stress réparés par SEMAINE DE VÉGÉTATION quand l'arbre va bien.
 *
 * La réparation est financée par le carbone : refaire de la résine et des
 * tanins se paie, et un arbre qui n'assimile pas ne paie rien. Elle est donc
 * doublement conditionnée — au surplus (elle se referme à mesure que l'arbre
 * puise dans ses réserves, `reserves.ts`) et à la SAISON.
 *
 * La valeur a doublé en passant de « par semaine » à « par semaine de
 * végétation » : sur 26 semaines utiles au lieu de 52, le budget annuel de
 * réparation est le même qu'avant, il est seulement déplacé au moment où
 * l'arbre peut le financer. Sans cette condition, un semis de pin sous futaie
 * de HÊTRES survivait indéfiniment — le couvert caduc lui rendait la lumière
 * en hiver, le moteur y lisait un surplus, et la cicatrisation effaçait chaque
 * hiver la famine de l'été. La lumière d'un arbre dormant ne nourrit personne.
 *
 * *(à calibrer : cette valeur est antérieure au budget carbone et n'a jamais
 * porté de source)*
 */
const RECUPERATION_STRESS = 0.5;
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
 * Points de stress par semaine de végétation pour un puisement complet des
 * réserves — dérivé de `RESERVES_ANS` et de `STRESS_LETHAL`, donc pas une
 * constante de plus : les réserves SONT ce compteur vu par l'autre bout.
 */
const USURE_PAR_SEMAINE = usureParSemaine(STRESS_LETHAL, GROWING_WEEKS);

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
 * Bornes de l'exposant de forme, et l'échelle qui le relie à la LONGÉVITÉ.
 *
 * Les tables de production distinguent trois profils de croissance en hauteur,
 * et un exposant unique ne savait rendre aucun des deux extrêmes : démarrage
 * rapide et plateau précoce (aulne, bouleau, merisier), démarrage lent et
 * croissance longue (hêtre, chênes, sapin), intermédiaire (frêne, pin,
 * douglas). Le symptôme se lisait dans `hauteurs.test.ts` : l'aulne tombait à
 * 11,0 m à vingt ans pour 12,6 dans la table alors que sa hauteur à quarante
 * ans était juste — la signature d'une courbe de la bonne AMPLITUDE et de la
 * mauvaise FORME.
 *
 * Plutôt qu'un exposant par fiche — qui serait un réglage libre de plus —, on
 * le DÉDUIT de la longévité, déjà présente dans l'atlas. Et la correspondance
 * n'est pas une commodité : les trois profils des tables sont exactement les
 * trois classes de longévité. Un arbre qui vit un siècle ne peut pas se
 * permettre d'attendre pour occuper l'espace ; un chêne de quatre siècles le
 * peut, et c'est cette même stratégie qui fait son bois dense et son ombre
 * profonde. La courbe de croissance et la durée de vie sont deux faces du même
 * arbitrage.
 *
 * L'échelle est logarithmique parce que les longévités le sont : de 15 ans
 * (ronce) à 400 (chêne pubescent), c'est un facteur vingt-cinq. Calée sur deux
 * points — un siècle de vie donne 1,25, trois siècles donnent 1,70 — puis
 * bornée : sous 1, la courbe cesse d'être sigmoïde *(à calibrer : les deux
 * points d'ancrage sont ajustés sur les tables, pas mesurés indépendamment)*.
 *
 * **Ce que ça corrige, et ce que ça ne corrige pas.** Le hêtre y gagne beaucoup
 * — sa hauteur à vingt ans, qui est tenue à l'écart du calage, passe de +6 % à
 * +1 % de la table. L'AULNE, lui, ne bouge pas : il reste 13 % sous la table à
 * vingt ans alors qu'il y est à quarante. J'ai vérifié que ce n'était pas la
 * forme en le forçant au profil le plus front-chargé possible (exposant 1,05) :
 * il descend à 10,2 m au lieu de 10,9. Son retard de jeunesse vient donc de
 * son PLAFOND de pousse, pas de sa courbe — et son plafond n'est calé sur
 * aucune table, comme vingt autres de l'atlas.
 */
export const FORME_MIN = 1.05;
export const FORME_MAX = 2;

/** Exposant de forme d'une espèce, déduit de sa longévité. */
export function exposantDeForme(longeviteAns: number): number {
  const pente = 0.45 / Math.log(3);
  const brut = 1.25 + pente * Math.log(Math.max(1, longeviteAns) / 100);
  return Math.min(FORME_MAX, Math.max(FORME_MIN, brut));
}

/**
 * Normalisation : sans elle, `pousseMaxMAn` cesserait de vouloir dire « la
 * pousse annuelle maximale ». On divise par le sommet de la courbe de forme,
 * pour que ce sommet vaille exactement 1 quel que soit l'exposant.
 */
function sommetDeForme(exposant: number): number {
  return ((exposant - 1) / exposant) ** (exposant - 1) / exposant;
}

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
export function formeCroissance(
  heightM: number,
  hauteurMaxM: number,
  exposant = FORME_CROISSANCE,
): number {
  const u = Math.min(1, Math.max(0, heightM / hauteurMaxM));
  const v = u ** (1 / exposant);
  return (v ** (exposant - 1) * (1 - v)) / sommetDeForme(exposant);
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
 * Part du potentiel qu'un arbre développe même sans jamais manquer d'eau : un
 * système de base qui l'ANCRE et le NOURRIT, indépendamment de ce qu'il cherche
 * à boire.
 *
 * ELLE CROÎT AVEC LA MATURITÉ, et une fraction constante ne pouvait pas marcher
 * (#84). Aux deux bouts, les contraintes sont contradictoires :
 *
 * - un SEMIS démarre en surface quelles que soient les capacités de son espèce,
 *   et `racines.test.ts` l'exige — un chêne d'un an reste sous 60 cm alors que
 *   son espèce peut descendre à 250 ;
 * - un ARBRE MÛR doit tenir debout. À 35 % du potentiel, un hêtre de vingt
 *   mètres jamais assoiffé portait 36 à 44 cm de racines selon le banc, soit un
 *   rapport racines/hauteur de 0,018 à 0,022, quand les relevés d'arrachage
 *   donnent 0,04 à 0,06.
 *
 * Ce n'est pas la plasticité qui était en cause — elle est juste, et c'est le
 * mécanisme qui la porte (`nouvelleProfondeurRacines` ne fait descendre les
 * racines que sous l'effet de la SOIF). C'est que le plancher ne représente pas
 * la recherche d'eau : il représente le squelette structurel, et un squelette ne
 * se dimensionne pas en part du potentiel de l'espèce mais en part de ce que
 * l'arbre a déjà construit. Un semis n'a rien à ancrer ; un arbre de
 * vingt-cinq mètres si.
 *
 * Mesuré sur le code livré, hêtre isolé, graine 7, limon riche :
 *
 * | | 30 ans | 60 ans | 90 ans |
 * |---|---|---|---|
 * | série (été sec) | 5,9 m / 60 cm | 13,3 m / 87 cm | 16,4 m / 96 cm |
 * | site jamais sec | 9,0 m / 43 cm | 16,9 m / 72 cm | 20,5 m / 79 cm |
 *
 * En régime sec, la soif atteint le potentiel de toute façon : ce lot ne
 * déplace RIEN sur les stations sèches. C'est le régime frais qu'il corrige.
 * Le rapport racines/hauteur y passe de 0,022 — c'est le chiffre que `tempete.ts`
 * avait relevé et documenté, 44 cm pour un hêtre de vingt mètres — à 0,039,
 * quand le régime sec tient 0,059. L'écart entre les deux régimes tombe donc de
 * 2,7 × à 1,5 ×, l'ordre que donnent les comparaisons de terrain, et le barème
 * d'ancrage de `tempete.ts` en dépendait directement.
 */
const RACINES_PLANCHER_JEUNE = 0.35;
/** Part du potentiel qu'un arbre ADULTE tient pour son seul ancrage. */
const RACINES_PLANCHER_MUR = 0.8;

/**
 * Part du potentiel garantie à cette taille — l'interpolation entre les deux
 * précédentes, sur la même mesure de maturité que `profondeurRacinesCm`.
 */
export function partPlancherRacines(espece: EspeceV0, heightM: number): number {
  const maturite = Math.min(1, Math.max(0, heightM / (0.6 * espece.hauteurMaxM)) ** 0.7);
  return RACINES_PLANCHER_JEUNE + (RACINES_PLANCHER_MUR - RACINES_PLANCHER_JEUNE) * maturite;
}
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
  const plancher = Math.min(
    potentiel,
    Math.max(15, partPlancherRacines(espece, tree.heightM) * potentiel),
  );
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
  // FORME DE RÉFÉRENCE, délibérément (#105). Le houppier suit désormais le
  // diamètre, mais le système RACINAIRE reste sur l'ancienne loi : qu'une tige
  // dominée prospecte un disque plus petit est une affirmation distincte, qui
  // demande sa propre mesure. L'empiler ici rendrait le lot du houppier
  // immesurable — le disque racinaire commande l'eau et tous les nutriments.
  return Math.max(
    1,
    ROOT_CROWN_RATIO *
      crownRadiusM(heightM, espece.lumiere.houppierRatio, diametreInitialCm(heightM)),
  );
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
  // Forme de référence, pour la même raison que `rootRadiusM` : la
  // transpiration d'une perche est une affirmation distincte de la largeur de
  // son houppier, et elle se mesure à part (#105).
  const r = crownRadiusM(heightM, espece.lumiere.houppierRatio, diametreInitialCm(heightM));
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

/**
 * ─── L'ALLOMÉTRIE DU TRONC ───────────────────────────────────────────────────
 *
 * Le moteur portait deux règles allométriques écrites séparément et jamais
 * confrontées : un volume en `0,015 h²` et un diamètre en `2 h`. Mises face à
 * face, elles impliquaient un facteur de forme — la part du cylindre
 * circonscrit que le tronc occupe — allant de 1,6 à 9,6 selon la taille.
 *
 * **Un facteur de forme supérieur à 1 est impossible par construction** : un
 * tronc ne peut pas contenir plus de bois que le cylindre qui l'enveloppe. Les
 * deux fonctions décrivaient donc des arbres différents, l'une montant en `h²`
 * quand l'autre impliquait `h³`. Le volume, et avec lui tout le carbone et
 * toute l'économie, étaient faux d'un facteur ~6 (#62).
 *
 * Le remède n'est pas de recaler un coefficient, c'est de renverser la
 * dépendance : **le diamètre devient une grandeur portée par l'arbre**, et le
 * volume en découle par la formule des forestiers, `V = f × g × h`. Une seule
 * règle, un seul endroit, plus de copie qui dérive.
 */

/**
 * Facteur de forme : la part du cylindre circonscrit qu'un tronc occupe
 * réellement. Toujours < 1, autour de 0,5 pour une tige forestière — un tronc
 * s'effile, il n'est pas un cylindre.
 *
 * Vérification : un hêtre de 25 m et 50 cm de diamètre donne ici 2,45 m³ de
 * tige, ce qui est l'ordre de grandeur attendu pour une telle tige.
 */
export const FACTEUR_DE_FORME = 0.5;

/**
 * Ce que le houppier ajoute à la tige pour faire le volume aérien total.
 * Le carbone compte les branches ; la scierie non.
 */
export const EXPANSION_BRANCHES = 1.3;

/** Section à 1,30 m, m² — la « surface terrière » d'une tige. */
export function sectionM2(diametreCm: number): number {
  const d = Math.max(0, diametreCm) / 100;
  return (Math.PI / 4) * d * d;
}

/** Volume de la TIGE, m³ : ce qui part en scierie. `V = f × g × h`. */
export function volumeTigeM3(diametreCm: number, heightM: number): number {
  return FACTEUR_DE_FORME * sectionM2(diametreCm) * Math.max(0, heightM);
}

/** Volume AÉRIEN, m³ : la tige et ses branches. C'est lui que le carbone compte. */
export function volumeAerienM3(diametreCm: number, heightM: number): number {
  return volumeTigeM3(diametreCm, heightM) * EXPANSION_BRANCHES;
}

/**
 * ─── L'ÉLANCEMENT, ET POURQUOI IL DOIT VARIER ────────────────────────────────
 *
 * Le coefficient d'élancement H/D décide de qui casse au vent : c'est la
 * grandeur sur laquelle les modèles de chablis (GALES, HWIND) appuient leur
 * vitesse critique, et la sylviculture européenne retient **H/D > 80** comme
 * seuil de risque.
 *
 * Avec l'ancien proxy `D = 2 h`, H/D valait 50 pour tout arbre, toute espèce,
 * toute densité, à jamais : le moteur ne pouvait pas distinguer une tige
 * élancée d'un arbre trapu, donc pas exprimer la leçon qui compte — *un
 * peuplement trop dense, éclairci trop tard, tombe à la première tempête.*
 *
 * Ce qui fait varier H/D est l'ALLOCATION : un arbre serré court après la
 * lumière et met ce qu'il gagne dans la hauteur ; un arbre de plein vent
 * épaissit.
 *
 * **Le pilote est la lumière reçue, et ce choix est mesuré, pas supposé.**
 * Le rapport de houppier est le prédicteur classique des forestiers, et le
 * moteur le calcule déjà (`light.ts:baseHouppierCible`) : il a donc été essayé
 * en premier. Il a été ÉCARTÉ par la mesure — piloté par lui, l'élancement se
 * resserrait sur 36–39 au lieu de s'étaler, parce que dans ce moteur la base
 * du houppier ne remonte pas assez pour discriminer. La lumière, elle, produit
 * un gradient MONOTONE avec la densité (`elancement.test.ts`) : à 2 / 4 / 6 /
 * 10 m d'écartement, les dominants sortent à H/D 42,1 / 38,8 / 38,0 / 37,4.
 *
 * **Les deux constantes font DEUX choses à la fois, et c'est ce qui les cale :**
 * leur moyenne fixe le niveau de volume du peuplement, leur écart fixe
 * l'amplitude de H/D. La médiane vaut 2, la valeur qui reproduit les 2,45 m³ de
 * tige d'un hêtre de 25 m et 50 cm — vérifiés contre le réel, et c'est l'ancre.
 * Une hêtraie de 80 ans à 400 tiges/ha donne alors 507 m³/ha, contre 2 388 pour
 * l'ancien moteur. Les 350 à 450 m³/ha des tables valent pour une futaie
 * GÉRÉE ; ce banc-là n'est jamais éclairci, et accumule donc davantage.
 *
 * **Réserve honnête. J'ai d'abord accusé le mauvais coupable, et la campagne
 * de #65 l'a mesuré.** Le moteur couvre H/D de 35 à 49 quand la sylviculture
 * mesure 25–40 au large et 90–100 en perche : le bon ordre, un cinquième de
 * l'étendue. Ce commentaire a longtemps désigné le poids d'ombrage des
 * codominants (0,4 dans `light.ts:extinctionAt`) comme la cause, et
 * `elancement.test.ts` le répétait. **C'est faux, et le balayage le montre** :
 * porter ce poids à 1 — c'est-à-dire supprimer toute l'atténuation — fait
 * passer les dominants d'une hêtraie plantée à 2 m de H/D 42,1 à 41,7. Poids 1,
 * seuil 0 (tout voisin plus court ombrage à plein) ET plafond d'extinction
 * doublé : 45,0. Rien dans `light.ts` n'ouvre cette amplitude.
 *
 * **Ces deux constantes bornent une FENÊTRE, et c'est de l'arithmétique.** Un
 * arbre qui pousse de bout en bout à une allocation `a` porte H/D = 100/a. La
 * fenêtre atteignable est [40 ; 80]. Elle est trop étroite d'un bout — elle
 * rend `ELANCEMENT_CRITIQUE` (tempete.ts) inatteignable — et #79 a essayé de
 * l'ouvrir en descendant l'allocation d'ombre à 1,0 ; la mesure a dit non, et le
 * compte rendu est sur la constante elle-même. (En dessous de 40, on trouve
 * quand même des tiges : c'est l'abroutissement, qui retire de la hauteur sans
 * toucher au diamètre.)
 *
 * **Et élargir la fenêtre n'élargirait presque pas l'AMPLITUDE, ce qui est le
 * résultat de #79.** Une hêtraie plantée à 2 m, trente ans, va de H/D 37–49 à 37–53 ;
 * poussée à l'absurde — allocation d'ombre à 0,5, fenêtre [40 ; 200] — elle
 * n'atteint que 38–62. Le peuplement de quatre-vingts ans plafonne à 58, et le
 * PIN, pourtant héliophile et là où la sylviculture mesure ses perches, reste
 * plus plat encore : 41,0 à 2 m contre 38,9 à 10 m.
 *
 * **Parce que H/D est une INTÉGRALE, pas un état, et c'est ÇA le verrou.** À 2 m
 * et trente ans, les dominants reçoivent 0,40 de lumière, ce qui vaut une
 * allocation instantanée de 1,75 cm/m, donc H/D 57 pour un arbre qui aurait vécu
 * là depuis toujours. Ils en portent 42. Deux causes se cumulent : toute
 * plantation est OUVERTE ses premières années, et le diamètre posé alors à
 * 2,5 cm/m est acquis pour toujours puisqu'un diamètre ne rétrécit jamais ; puis
 * un semis naît à H/D 50 (`diametreInitialCm`), si bien qu'une tige qui pousse
 * peu reste près de 50 quoi qu'il arrive. L'ombre n'agit donc que sur la fin de
 * la vie de l'arbre, et seulement sur ce qu'il lui reste à pousser.
 *
 * Atteindre les 90–100 de la perche demanderait un arbre qui monte VITE en
 * restant à l'ombre. Ce moteur ne sait pas le faire : l'ombre entre dans la loi
 * du minimum, donc elle rabote la pousse totale au lieu de la rediriger vers la
 * hauteur. Il manque l'étiolement, et c'est une évolution, pas un réglage.
 *
 * **La hauteur, elle, n'est pas touchée.** Elle est calée sur des tables de
 * production (Jansen 1996, `hauteurs.test.ts`) : c'est une vraie ancre, et on
 * ne redistribue pas une croissance validée pour en tirer une autre grandeur.
 * Le diamètre s'ajoute à côté.
 */

/**
 * Diamètre gagné par mètre de hauteur, à l'ombre : la tige file. cm/m.
 *
 * ELLE A ÉTÉ PORTÉE À 1,0 PENDANT #79, PUIS RENDUE À 1,25, et il faut dire
 * pourquoi — sans quoi quelqu'un refera le chemin.
 *
 * L'argument POUR était bon et il tient toujours : à 1,25, H/D plafonne à 80,
 * alors que `tempete.ts` porte `ELANCEMENT_CRITIQUE = 100`, le seuil sylvicole
 * d'instabilité. La moitié haute de la rampe de `facteurElancement` est donc
 * inatteignable par construction. À 1,0, la fenêtre devient [40 ; 100] et les
 * deux modules s'accordent ; le volume d'une hêtraie de 80 ans passe même de
 * 490 à 456 m³/ha, soit dans la fourchette des tables.
 *
 * Ce que ça COÛTE, mesuré : une tige plus fine résiste moins au feu. Sur la
 * graine 23 du banc climatique, l'incendie de la partie réchauffée emporte 126
 * arbres au lieu de 49 — et il les VOLE aux deux causes que `climat.test.ts`
 * compte pour montrer que le réchauffement tue : la sécheresse tombe de 61 à 18,
 * les ravageurs de 31 à 6, et le rapport figé→chauffé s'effondre de 4,00 à 1,09.
 * La pullulation suit, faute d'hôtes survivants.
 *
 * Ce que ça RAPPORTE, mesuré aussi : l'amplitude réelle de H/D passe de 37–49 à
 * 37–53 à trente ans. Quatre points. E10 reste 🟡 dans les deux cas.
 *
 * Quatre points d'amplitude contre une conclusion climatique renversée, il n'y a
 * pas à hésiter. Et surtout, le verrou n'est pas là : c'est #97 (l'étiolement)
 * qui rendra `ELANCEMENT_CRITIQUE` atteignable pour de bon, en faisant filer les
 * dominés au lieu de les faire stagner. Bouger cette constante-ci n'était qu'une
 * façon d'ouvrir la fenêtre sans que rien n'aille l'occuper.
 */
export const ALLOCATION_DIAMETRE_OMBRE = 1.25;
/** Diamètre gagné par mètre de hauteur, en pleine lumière : l'arbre épaissit. cm/m. */
export const ALLOCATION_DIAMETRE_LUMIERE = 2.5;
/**
 * Le milieu de la gamme, et le diamètre qu'on prête à une tige sans histoire.
 * L'ancien proxy posait `D = 2 h` pour tout le monde ; cette valeur-ci est plus
 * basse parce qu'elle a été calée sur le VOLUME du peuplement, que le proxy
 * surestimait d'un facteur six.
 */
export const ALLOCATION_DIAMETRE_MEDIANE = 2;

/** Diamètre gagné par mètre de hauteur pour ce rapport de houppier, cm/m. */
export function allocationDiametreCmParM(lumiere: number): number {
  const l = Math.min(1, Math.max(0, lumiere));
  return ALLOCATION_DIAMETRE_OMBRE + (ALLOCATION_DIAMETRE_LUMIERE - ALLOCATION_DIAMETRE_OMBRE) * l;
}

/**
 * Diamètre d'une tige qui vient d'apparaître, cm. On la pose sur l'allocation
 * médiane : un semis n'a pas encore d'histoire lumineuse à raconter.
 */
export function diametreInitialCm(heightM: number): number {
  return ALLOCATION_DIAMETRE_MEDIANE * Math.max(0, heightM);
}

/** Coefficient d'élancement H/D, sans dimension. `> 80` = tige en danger au vent. */
export function elancement(diametreCm: number, heightM: number): number {
  return diametreCm > 0 ? (100 * heightM) / diametreCm : Number.POSITIVE_INFINITY;
}

/**
 * ─── L'ÉTIOLEMENT : L'OMBRE DÉPLACE L'ARBITRAGE AVANT DE RABOTER LA POUSSE ───
 *
 * Ce que le moteur faisait, et pourquoi ça ne pouvait pas marcher. La lumière
 * entrait dans la LOI DU MINIMUM, donc elle rabotait la pousse TOTALE ; le
 * partage hauteur/diamètre ne portait ensuite que sur ce qui restait. Un arbre
 * à l'ombre poussait donc moins des deux côtés à la fois, et son élancement ne
 * bougeait quasiment pas — la tige stagnait au lieu de filer. Mesuré : une
 * hêtraie plantée à 2 m tenait H/D 39–56 à quatre-vingts ans, et les tiges les
 * MOINS élancées y étaient les plus dominées (3,7 m de haut, H/D 39). La
 * sylviculture mesure l'inverse : 25–40 au large, 90–100 en perche.
 *
 * **Deux faits de terrain gouvernent ce qui suit, et aucun n'est un réglage.**
 *
 * 1. *La hauteur ne dépend presque pas de la densité.* C'est le fondement même
 *    de la dendrométrie : l'indice de fertilité d'une station se lit sur la
 *    HAUTEUR DOMINANTE précisément parce qu'elle est insensible à la densité du
 *    peuplement dans de larges limites, là où la surface terrière, elle, en
 *    dépend entièrement (Assmann 1970, *The Principles of Forest Yield Study*).
 *    Si le moteur rabotait la hauteur avec la lumière, aucune table de
 *    production ne serait lisible.
 * 2. *Le diamètre est le dernier servi.* La hiérarchie des puits de carbone
 *    place l'entretien, le feuillage, les racines fines et l'allongement du
 *    plus haut rameau AVANT l'épaississement du tronc, qui encaisse le
 *    résidu. C'est ce qui produit les cernes manquants des tiges dominées, un
 *    fait de dendrochronologie ordinaire : l'arbre monte encore quand son
 *    cambium a déjà cessé de travailler sur une partie de sa circonférence.
 *
 * **Le mécanisme tient donc en une phrase** : la lumière décide COMBIEN DE BOIS
 * l'arbre fait ; l'allongement se sert d'abord, dans la limite de ce que les
 * autres facteurs permettent ; le diamètre prend ce qui reste.
 *
 * **Et le bois se compte exactement**, parce que le moteur a déjà sa fonction de
 * volume — `V = f × (π/4) × D² × H`. En dérivant :
 *
 * ```
 * dV = f (π/4) (D² dH + 2 D H dD)
 * ```
 *
 * soit, divisé par `f (π/4) D²` — on compte donc le bois en « mètres
 * d'allongement pur », l'unité naturelle de cette tige-là :
 *
 * ```
 * bois = dH + 2 × (H/D) × dD     (dD en mètres, H/D sans dimension)
 * ```
 *
 * Un mètre de hauteur coûte peu à une tige fine ; un centimètre de diamètre
 * coûte cher à une tige haute, parce qu'il faut l'ajouter sur toute la
 * longueur. Ce n'est pas une hypothèse : c'est la dérivée de la fonction de
 * volume que le moteur utilise pour vendre le bois.
 *
 * **Ce lot n'ajoute pas un gramme de bois**, et c'est sa garantie : le budget
 * `boisM` vaut EXACTEMENT ce que l'ancienne formule produisait déjà (`pousse ×
 * coût du mètre`). Seule sa répartition change. En particulier, dès que la
 * lumière n'est PAS le facteur limitant — tout arbre dominant, et tous les
 * sujets au large sur lesquels les hauteurs sont calées (Jansen 1996) — le
 * calcul redonne l'identité, hauteur et diamètre au dernier chiffre près. Le
 * mécanisme ne touche QUE les tiges que l'ombre limite, ce qui est exactement
 * la population visée.
 *
 * **Ce qui en tombe sans être écrit** : l'élancement d'équilibre. Une tige
 * cesse de filer quand son bois suffit à payer l'allongement plein, c'est-à-dire
 * à `H/D = (1/f_lum − 1) × 50 / allocation`. Personne ne l'a choisi ; il sort du
 * facteur lumière de l'individu et de sa forme du moment, et il monte donc
 * quand l'ombre s'épaissit — ce qui est le bon sens de la perche.
 */

/**
 * **Et il fallait l'autre moitié : une tige ne file pas indéfiniment.**
 *
 * Écrit seul, le partage ci-dessus s'emballe, et la mesure l'a montré avant
 * qu'on le croie sur parole : sous une ombre constante, une perche passait H/D
 * 166 en quarante ans et se dirigeait vers 295. L'équilibre existe pourtant —
 * le bois finit par dépasser ce que l'allongement peut absorber, et le reste
 * repart au diamètre — mais il se pose à `H/D = (3/f_lum − 1) × 50 /
 * allocation`, ce qui pour une ombre ordinaire vaut trois cents. Une tige
 * pareille n'existe pas : elle FLAMBE.
 *
 * C'est donc la mécanique qui ferme le mécanisme, et elle a sa loi. Une colonne
 * qui porte son propre poids flambe au-delà d'une hauteur critique
 * `H ∝ D^(2/3)` (Greenhill 1881) — exposant vérifié sur les arbres records de
 * nombreuses essences par McMahon & Kronauer (1976), qui en ont fait le
 * classique de l'allométrie des arbres. L'élancement maximal décroît donc comme
 * `D^(−1/3)` : une perche fine peut être très élancée, un gros arbre non.
 *
 * **Le niveau, lui, est calé sur la sylviculture** : la perche de plantation
 * serrée monte à H/D 90–100 (le seuil de risque européen est à 80, cf.
 * `elancement`), et elle n'y reste pas — elle casse ou ploie sous la neige. On
 * retient donc 100 pour une tige de douze centimètres, soit douze mètres de
 * haut *(à calibrer : la littérature donne une gamme, pas un point)*.
 *
 * *Recoupement par le flambage élastique* : pour du bois vert (E ≈ 9 GPa,
 * ρ ≈ 900 kg/m³), `H_crit = 0,792 (E/ρg)^(1/3) D^(2/3)` donne 19,4 m pour
 * douze centimètres, soit H/D 162. La limite retenue est à 62 % de là, une
 * marge de sécurité de 1,6 — l'ordre de grandeur rapporté pour les tiges
 * forestières les plus élancées, et bien en dessous du 4 des sujets de plein
 * vent, qui est le bon sens : c'est l'arbre dominé qui vit près de sa limite.
 *
 * Ce plafond n'est PAS un couperet : la marge `H_stable − H` se referme
 * progressivement, l'allongement s'étrangle tout seul, et tout le bois part
 * alors au diamètre. La tige ne s'arrête pas de grandir — elle grimpe le long
 * de l'enveloppe en s'épaississant, ce que fait une perche réelle.
 */

/** Élancement maximal retenu pour une tige de `DIAMETRE_REFERENCE_CM`. */
export const ELANCEMENT_LIMITE_REFERENCE = 100;
/** Le diamètre de perche sur lequel ce niveau est calé, cm. */
export const DIAMETRE_REFERENCE_CM = 12;

/** Élancement au-delà duquel la tige flambe, pour ce diamètre. */
export function elancementLimite(diametreCm: number): number {
  if (!(diametreCm > 0)) return Number.POSITIVE_INFINITY;
  return ELANCEMENT_LIMITE_REFERENCE * Math.cbrt(DIAMETRE_REFERENCE_CM / diametreCm);
}

/** Hauteur au-delà de laquelle une tige de ce diamètre flambe, m. */
export function hauteurStableM(diametreCm: number): number {
  const d = Math.max(0, diametreCm);
  return (ELANCEMENT_LIMITE_REFERENCE * Math.cbrt(DIAMETRE_REFERENCE_CM) * Math.cbrt(d * d)) / 100;
}

/**
 * Ce qu'un mètre de hauteur coûte à cette tige-là, en bois, quand le diamètre
 * suit l'allocation donnée. Sans dimension (le bois est compté en mètres
 * d'allongement pur). Vaut 1 pour une tige qui n'épaissirait pas du tout.
 */
export function coutDuMetreEnBois(elancementCourant: number, allocationCmParM: number): number {
  return 1 + (2 * elancementCourant * allocationCmParM) / 100;
}

/**
 * Diamètre que le bois restant achète, cm. L'inverse de la relation ci-dessus :
 * `bois = 2 × (H/D) × dD`, avec `dD` ramené des mètres aux centimètres.
 */
export function diametreAchetableCm(boisRestantM: number, elancementCourant: number): number {
  if (!(elancementCourant > 0) || !Number.isFinite(elancementCourant)) return 0;
  return (Math.max(0, boisRestantM) * 50) / elancementCourant;
}

/**
 * L'élancement sur lequel raisonner cette semaine. Une tige sans diamètre
 * enregistré — un semis posé à hauteur nulle — est traitée comme une tige
 * d'allocation médiane, la même convention que `diametreInitialCm`, plutôt que
 * comme une tige infiniment élancée qui ne pourrait plus jamais épaissir.
 */
export function elancementDeTravail(diametreCm: number, heightM: number): number {
  const e = elancement(diametreCm, heightM);
  return Number.isFinite(e) && e > 0 ? e : 100 / ALLOCATION_DIAMETRE_MEDIANE;
}

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

/**
 * Facteur saison : 0 sous la température de base, 1 à base+8 °C.
 *
 * Il ne porte plus que la VITESSE du métabolisme, pas la longueur de la saison :
 * celle-là vient de `partFoliaireActive`, avec qui il se multiplie dans le tick.
 * C'est ce qui a permis de recalibrer `GROWING_WEEKS` (trente semaines à
 * vingt-six) sans rien raboter — substituer la phénologie sans ce recalibrage
 * aurait baissé la croissance sans la rendre plus juste.
 *
 * Ce qui n'est PAS encore dans la boucle, un cran plus fin : la sénescence. Une
 * feuille jaunie est encore accrochée et vivante, donc encore comptée ici, et
 * `partFoliaireAssimilante` mesure exactement cet écart — deux semaines par an.
 * Voir docs/realisme.md, « le houppier doré produit encore ».
 */
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
  const dansLaGamme = facteurGammePh(espece.ph, ph);
  // UNE QUEUE DANS LA MARGE DE SURVIE, sans quoi le lot trahirait son propre
  // énoncé (#161) : « un arbre entre les deux pousse mal ET tient ». Avec la
  // seule rampe de l'atlas, la croissance tombe à zéro dès sous la borne, si
  // bien qu'un hêtre à pH 4,2 ne poussait plus du tout mais ne mourait pas non
  // plus — mesuré, 19 sur 20 encore vivants à CINQUANTE ans, toujours à leurs
  // 0,30 m de plantation. Des nains immortels, ce que rien n'observe.
  //
  // Les deux termes se rejoignent EXACTEMENT à la borne, où la rampe vaut
  // `VIGUEUR_A_LA_BORNE` et la survie vaut 1 : la courbe reste continue, et
  // au-dessus c'est la rampe qui commande, inchangée.
  //
  // AUCUNE TABLE DE PRODUCTION NE PEUT BOUGER, et c'est démontrable plutôt que
  // mesuré : la queue ne vit que HORS de l'amplitude déclarée, et aucune espèce
  // n'est calée hors de la sienne — le pin sylvestre est à pH 7 dans sa gamme
  // 4–7,5, le châtaignier sur le limon acide où il vaut 1. Les seuils
  // d'installation (`paysage.ts`, `regeneration.ts`) ne bougent pas non plus :
  // ils excluent sous 0,20 et 0,25, quand la queue plafonne à 0,05.
  return Math.max(dansLaGamme, VIGUEUR_A_LA_BORNE * facteurSurviePh(espece.ph, ph));
}

/**
 * f_pH de SURVIE : l'amplitude de l'atlas élargie de sa marge (#161).
 *
 * Distinct de `phFactor`, comme `seuilStressSecheresse` est distinct de
 * `seuilConfortSecheresse` : au bord de son amplitude une espèce pousse mal —
 * c'est `phFactor` qui le dit — mais elle ne meurt pas, et c'est celui-ci qui
 * le dit. Seul ce second facteur entre dans `survivalFactor`.
 */
export function phFactorSurvie(espece: EspeceV0, ph: number): number {
  return facteurSurviePh(espece.ph, ph);
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

/**
 * Laquelle des causes LENTES pèse le plus, à cet instant.
 *
 * La famine entre dans ce classement par ce qu'elle COÛTE, et non par un
 * facteur : c'est la seule façon de comparer un stock qui se vide à des
 * facteurs instantanés. Un arbre qui puise plus qu'il ne souffre par ailleurs
 * se meurt de l'ombre.
 *
 * Le pH a manqué à cette liste alors qu'il compte dans la survie : un arbre tué
 * par un sol trop acide se voyait attribuer la « vieillesse », parce que tous
 * les facteurs listés valaient 1 et que l'âge était le premier testé. Un
 * pommier de trois ans mort « de vieillesse » sur une lande à pH 4,5, c'était
 * ça.
 *
 * À ÉGALITÉ LE pH GAGNE, puisqu'il est testé le premier, et l'égalité la plus
 * inquiétante est celle À 1 : quatre facteurs parfaits, donc `pire === fPH`,
 * donc « sur un sol hors de sa gamme de pH » pour un arbre dont le sol lui
 * convient. #160 laissait la question ouverte en marge. MESURÉ, ET ELLE NE SE
 * PRODUIT PAS : trois graines, quarante ans, pommiers, abricotiers et hêtres
 * sur le limon riche à pH 7 où leur facteur de survie au pH vaut exactement 1
 * — 15 morts, 8 « ravageurs », 7 « ombre », AUCUNE « solHorsGamme ».
 *
 * Et ce n'est pas une chance : la branche est hors d'atteinte par
 * construction. Une mort déclenchée par un coup brusque passe par `imputer`
 * (tick.ts), qui ne consulte les causes lentes que si elles font la majorité
 * du compteur, et lit alors `causeLente` — relevée sous la garde « seulement
 * les semaines où quelque chose de lent a vraiment pesé », donc jamais dans
 * une semaine où tout vaut 1. Il n'y a pas de chemin qui mène ici avec quatre
 * facteurs parfaits. Départager l'égalité serait donc ajouter un terme pour
 * un cas que rien n'atteint ; on l'écrit plutôt ici pour ne pas le reprendre
 * une troisième fois.
 */
function causeLenteDominante(
  usure: number,
  parLeManque: number,
  fSecSurvie: number,
  fEng: number,
  fPH: number,
  fAge: number,
): CauseMort {
  if (usure > parLeManque) return "ombre";
  const pire = Math.min(fSecSurvie, fEng, fPH, fAge);
  if (pire === fPH) return "solHorsGamme";
  if (pire === fAge) return "vieillesse";
  if (pire === fEng) return "engorgement";
  return "secheresse";
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
  // La SURVIE lit l'amplitude élargie : pousser mal n'est pas mourir (#161).
  const fPHSurvie = phFactorSurvie(espece, env.phMean);
  const fN = espece.azote.fixateur ? 0.95 : env.nitrogenSatisfaction;
  // Loi du minimum : le phosphore et le potassium entrent au même titre que
  // les autres. Ils ne freinent presque jamais sur un bon sol — c'est sur les
  // sols acides ou sableux qu'ils prennent la main (pk.ts).
  const fP = env.phosphoreSatisfaction ?? 1;
  // L'allélopathie entre au même titre que les autres : un arbre inhibé par la
  // juglone de son voisin ne pousse pas, quoi qu'il ait par ailleurs
  // (allelopathie.ts). C'est le seul facteur qui vienne d'une AUTRE plante et
  // non du milieu.
  const fAllelo = facteurAllelopathie(
    env.intensiteAllelopathique ?? 0,
    espece.sensibiliteAllelopathie ?? SENSIBILITE_MEDIANE,
  );
  const fK = env.potassiumSatisfaction ?? 1;
  // La lumière est mise à part du minimum, et c'est tout l'objet de
  // l'étiolement : elle borne le BOIS que l'arbre fait, pas l'allongement qu'il
  // peut payer avec. Le reste des facteurs, lui, borne les deux.
  const limitantHorsLumiere = Math.min(fSec, fEng, fPH, fN, fP, fK, fAllelo);
  const limitingFactor = Math.min(limitantHorsLumiere, fLum);
  // L'eau et l'anoxie épuisent les réserves dès qu'elles s'effondrent : au
  // -dessus, l'arbre « survit » même s'il ne pousse plus (méthode pousse /
  // s'épanouit / survit, ch3-C).
  //
  // L'OMBRE, elle, n'est plus un facteur de survie instantané. Elle l'a été —
  // `fLumSurvival` valait `0,5 × lumière / compensation` — et ce seuil ne
  // pouvait pas représenter un épuisement : il ne se déclenchait qu'en dessous
  // de 0,0090 pour le hêtre, quand le moteur ne sait pas descendre sous
  // 0,0111. Le hêtre dominé était littéralement hors d'atteinte. La mort par
  // l'ombre passe désormais par le BUDGET CARBONE, qui est un stock
  // (`reserves.ts`) — et elle le remplace, elle ne s'y ajoute pas.
  //
  // La saison ne commande que le DÉBIT, pas la position du budget : un arbre
  // dormant dépense peu, mais il ne gagne rien non plus, et surtout il ne
  // refait pas ses réserves. Avoir mis l'hiver à puisement nul revenait à lui
  // rendre la cicatrisation à plein régime six mois par an — assez pour
  // effacer chaque hiver la famine de l'été, et un semis de pin sous futaie
  // fermée survivait indéfiniment. Mesuré : il doit mourir en cinq ans.
  const puisementDesReserves = partPuiseeSurLesReserves(espece, tree.heightM, env.light);
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
  const survivalFactor = Math.min(fSecSurvie, fEng, fPHSurvie, fAge);

  // Croissance : potentiel × loi du minimum, asymptote vers la hauteur max.
  // Un arbre stressé pousse moins (il puise dans ses réserves, docs/regles.md §7.1).
  const stressPenalty = 1 - tree.stress / STRESS_LETHAL;
  const potentialM =
    (espece.pousseMaxMAn / GROWING_WEEKS) *
    season *
    fAge *
    (env.facteurCo2 ?? 1) *
    formeCroissance(
      tree.heightM,
      espece.hauteurMaxM,
      exposantDeForme(espece.regeneration.longeviteAns),
    );
  // La vigueur individuelle entre ici, et seulement ici : elle module ce que
  // l'arbre TIRE de conditions données, pas les conditions elles-mêmes. Deux
  // voisins ont la même eau et la même lumière ; l'un en fait plus que l'autre,
  // et c'est ce qui crée les dominants et les dominés.
  //
  // LE HOUPPIER ARRACHÉ ENTRE AU MÊME ENDROIT, ET C'EST UNE CORRECTION.
  // Première version : il multipliait `env.light`, ce qui paraissait naturel —
  // moins de feuilles, moins de lumière captée. C'était faux, et le banc des
  // tables de production l'a dit tout de suite : le pin ressortait à 18,7 m à
  // quarante ans pour 15,5 m tabulés, soit TROP GRAND. La raison est que
  // `env.light` nourrit aussi l'allocation (`allocationDiametreCmParM`), donc
  // le signal d'ÉTIOLEMENT : baisser la lumière disait à l'arbre qu'il était à
  // l'ombre, et un arbre à l'ombre file en hauteur. Or un arbre ébranché n'est
  // pas ombragé — il a la même lumière et moins de feuilles pour la prendre.
  // C'est donc bien ce qu'il en TIRE qu'il faut réduire.
  // Le tassement se multiplie au lieu d'entrer dans le minimum, pour la raison
  // dite au champ `tassement` : il ne remplace aucun facteur limitant, il les
  // aggrave tous. Essais Arvalis : jusqu'à 30 % de perte sur sol tassé.
  const fTassement = facteurCroissanceTassement(env.tassement ?? 0);
  const commun =
    Math.max(0, potentialM) *
    stressPenalty *
    fTassement *
    tree.vigueurIndividuelle *
    (1 - Math.min(1, Math.max(0, tree.houppierPerdu ?? 0)));
  // Ce que la tige pourrait allonger si le carbone suivait : tous les facteurs
  // SAUF la lumière. C'est la hauteur insensible à la densité d'Assmann.
  const allongementPossibleM = commun * limitantHorsLumiere;
  // Le bois de la semaine, lumière comprise. Il vaut exactement ce que
  // l'ancienne formule produisait — `pousse × coût du mètre` —, ce qui est la
  // garantie que ce partage ne crée pas de matière.
  const allocationCmParM = allocationDiametreCmParM(env.light);
  const elancementCourant = elancementDeTravail(tree.diametreCm, tree.heightM);
  const boisM = commun * limitingFactor * coutDuMetreEnBois(elancementCourant, allocationCmParM);
  // Ce que la mécanique laisse encore monter avant le flambage. Tant que la
  // tige n'a pas de diamètre enregistré, la mécanique n'a rien à dire : c'est
  // un semis, pas une perche.
  const margeAuFlambageM =
    tree.diametreCm > 0
      ? Math.max(0, hauteurStableM(tree.diametreCm) - tree.heightM)
      : Number.POSITIVE_INFINITY;
  // L'allongement se sert d'abord, le diamètre encaisse le résidu : c'est la
  // hiérarchie des puits, et c'est elle qui fait filer la perche. Le résidu est
  // souvent NUL — c'est le cerne manquant d'une tige dominée, un fait de
  // dendrochronologie ordinaire — et ce zéro est borné par le flambage : la
  // tige finit par se heurter à son enveloppe, et tout son bois repart alors au
  // diamètre.
  const pousseM = Math.min(allongementPossibleM, boisM, margeAuFlambageM);
  const heightM = tree.heightM + pousseM;
  // Le diamètre se gagne sur le bois RESTANT — tassement compris, car un arbre
  // gêné par un sol tassé ne grossit pas davantage qu'il ne monte. En pleine
  // lumière le reste vaut `pousse × allocation` au dernier chiffre près, donc
  // rien ne change pour un dominant ; à l'ombre il fond, et c'est de là que
  // vient l'élancement individuel, donc la vulnérabilité au vent.
  const diametreCm = tree.diametreCm + diametreAchetableCm(boisM - pousseM, elancementCourant);

  // Stress : il s'accumule quand le facteur de survie s'effondre OU quand
  // l'arbre vit sur ses réserves, et il se résorbe quand ni l'un ni l'autre
  // n'est vrai — un arbre qui gagne sa vie refait ses réserves.
  //
  // Les deux s'AJOUTENT ici, et c'est voulu : un dominé assoiffé meurt plus
  // vite qu'un dominé à l'aise. Ce qui ne s'additionne pas, c'est la mort —
  // les ravageurs prennent les mêmes arbres, par la `vigueur`, et un arbre
  // mort ne meurt pas deux fois (reserves.ts).
  //
  // La cicatrisation, elle, est FINANCÉE PAR LE SURPLUS : refaire de la résine
  // et des tanins coûte du carbone, et un arbre qui puise déjà dans ses
  // réserves n'en a pas à dépenser. Elle se ferme donc progressivement à
  // mesure que le puisement monte, au lieu de s'éteindre d'un coup — un
  // « si le puisement est nul » aurait fait basculer la réparation de 0,25 à
  // rien pour un centième de lumière, et c'est le zéro dur que ce dépôt
  // traque depuis quatre lots.
  let stress = tree.stress;
  // Tout ce que cette fonction ajoute est LENT — la famine et les facteurs de
  // station — donc tout ce qu'elle ajoute alimente aussi `stressLent` (#103).
  let stressLent = tree.stressLent ?? 0;
  // Les deux origines RAPIDES, remplies ailleurs (tick.ts §5 quater et
  // quinquies) : elles ne gagnent rien ici, mais elles doivent s'amortir avec
  // les autres (#153).
  let stressRavageurs = tree.stressRavageurs ?? 0;
  let stressMaladie = tree.stressMaladie ?? 0;
  const usure = puisementDesReserves * season * USURE_PAR_SEMAINE;
  const parLeManqueSemaine =
    survivalFactor < STRESS_ONSET ? (STRESS_ONSET - survivalFactor) * 5 : 0;
  stress += parLeManqueSemaine + usure;
  stressLent += parLeManqueSemaine + usure;
  if (survivalFactor > STRESS_RECOVERY) {
    const apres = Math.max(0, stress - RECUPERATION_STRESS * season * (1 - puisementDesReserves));
    // AU PRORATA : la cicatrisation efface du stress sans savoir d'où il
    // venait, donc elle en efface la même proportion de chaque origine. Sans
    // ce partage, un arbre qui cicatrise verrait une origine fondre plus vite
    // que l'autre, et l'attribution dériverait toute seule.
    //
    // Le rapport se calcule UNE FOIS et s'applique à toutes les origines : la
    // règle est « le stress a reculé d'autant, donc chaque provenance recule
    // d'autant », et la recopier par origine serait l'occasion d'en oublier une
    // le jour où il y en aura une de plus.
    const rapport = stress > 0 ? apres / stress : 0;
    stressLent *= rapport;
    stressRavageurs *= rapport;
    stressMaladie *= rapport;
    stress = apres;
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
    //
    // La famine entre dans ce classement par ce qu'elle COÛTE cette semaine,
    // et non par un facteur : c'est la seule façon de comparer un stock qui se
    // vide à des facteurs instantanés. Un arbre qui puisait plus qu'il ne
    // souffrait par ailleurs est mort de l'ombre.
    // C'est le facteur de SURVIE du pH qui entre ici, le même que dans
    // `survivalFactor` : imputer la mort sur le facteur de CROISSANCE
    // désignerait le pH presque à chaque fois, puisqu'il lui est toujours
    // inférieur ou égal (#161).
    const pire = Math.min(fSecSurvie, fEng, fPHSurvie, fAge);
    const parLeManque = pire < STRESS_ONSET ? (STRESS_ONSET - pire) * 5 : 0;
    causeMort = causeLenteDominante(usure, parLeManque, fSecSurvie, fEng, fPHSurvie, fAge);
  }
  // La même lecture, mais tenue CHAQUE SEMAINE et pas seulement à la mort :
  // c'est elle qu'un coup brusque relira pour savoir de quoi l'arbre se
  // mourait déjà (#103). Elle ne se fige que quand il y a quelque chose à
  // dire — sans stress lent, il n'y a pas de cause lente.
  // Seulement les semaines où quelque chose de LENT a vraiment pesé. Le relever
  // à chaque tick, y compris quand tous les facteurs valent 1, revenait à
  // départager des égalités : `Math.min` rendait alors le pH, premier testé, et
  // une hêtraie de limon riche accumulait 189 morts « solHorsGamme ». Mesuré.
  const causeLente =
    usure > 0 || parLeManqueSemaine > 0
      ? causeLenteDominante(usure, parLeManqueSemaine, fSecSurvie, fEng, fPHSurvie, fAge)
      : tree.causeLente;

  return {
    tree: {
      ...tree,
      ageWeeks: tree.ageWeeks + 1,
      heightM,
      diametreCm,
      stress,
      stressLent,
      stressRavageurs,
      stressMaladie,
      causeLente,
      alive,
      rootDepthCm,
      causeMort,
    },
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
 * chêne mort reste debout une décennie là où un saule s'écroule en quatre ans.
 *
 * *(à calibrer : les durées de terrain vont de 2 à 20 ans selon l'essence, le
 * diamètre et l'exposition au vent, que le moteur ne connaît pas encore)*
 *
 * Le passage de `bois.densite` à l'infradensité (#68) a raccourci toutes les
 * chandelles d'environ un cinquième. L'éventail reste dans la fourchette de
 * terrain ci-dessus : du saule blanc à 4,2 ans au cornouiller mâle à 13,5 ans,
 * le chêne pubescent à 9,8 et le hêtre à 8,3.
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
