/**
 * Actions du joueur (docs/regles.md §9-10) et économie V0 : argent (€) et
 * temps de travail (heures, seuil hebdomadaire de facturation par UTH — voir
 * `depassementHoraire`). Les actions sont
 * DATÉES (semaine absolue) : le journal d'actions + la seed + la station
 * forment la sauvegarde rejouable (docs/stack.md).
 * Une action refusée l'est déterministiquement, avec sa raison ; une action
 * partiellement exécutée traite ses éléments dans l'ordre et s'arrête au
 * découvert. LES HEURES N'ARRÊTENT PLUS RIEN (#133) : dépasser le plafond
 * hebdomadaire ne se refuse pas, ça se facture — le moteur rapporte le
 * dépassement et son prix, l'arbitrage revient au joueur.
 */

import { CHAULAGE_EQ_M2, capaciteEchangeEqM2, phDepuisSaturation } from "./bases";
import { CONTACT_TRONC_EBRANCHE, empreinteDeChute, poserBoisAuSol, versLAval } from "./boisMort";
import {
  CARBON_FRACTION,
  CN_HUMUS,
  racinesPerduesEnRabattant,
  treeAboveCarbonKg,
  treeTotalCarbonKg,
} from "./carbon";
import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { EFFET_CHASSE, HAUTEUR_BROUTAGE_M } from "./gibier";
import {
  HERBACEES,
  INDEX_CULTURES,
  litiereRendue,
  N_HERBACEES,
  partDuRendement,
  rabattreParEspece,
} from "./herbacees";
import { crownRadiusM } from "./light";
import { decoteEngorgement, indiceDuMarche } from "./marche";
import { partMecanisable } from "./mecanisation";
import { SURVIE_APRES_LABOUR, TYPES_MYCORHIZE } from "./mycorhizes";
import { KG_PER_HA_TO_G_PER_M2, litterDecayRate } from "./nitrogen";
import { altitudeParCellule } from "./relief";
import type { GameState } from "./state";
import { tassementApresLabour } from "./tassement";
import {
  diametreInitialCm,
  tirerVigueurIndividuelle,
  treeNitrogenNeedGWeek,
  volumeTigeM3,
} from "./trees";
import {
  aireM2DeLaZone,
  cellulesDeLaZone,
  perimetreMDeLaZone,
  pourChaqueCelluleDeLaZone,
  type Zone,
  zoneContient,
} from "./zone";

/**
 * Heures de travail par UTH et par semaine (docs/regles.md §10).
 *
 * CE N'EST PLUS UN MUR, C'EST UN SEUIL DE FACTURATION (#133). Quinze actions
 * refusaient l'excédent : le joueur découvrait au clic qu'il ne pouvait pas,
 * sans savoir de combien il dépassait ni ce que ça coûterait de le faire quand
 * même. On le punissait d'avoir essayé.
 *
 * Les actions s'appliquent désormais, et les heures se comptent AU-DELÀ du
 * plafond. Ce que le moteur en dit s'arrête là : `depassementHoraire` et
 * `coutDuDepassement` donnent de quoi présenter la facture, et c'est à
 * l'interface de la présenter et d'obtenir la décision. La contrainte reste
 * entière, mais elle devient économique au lieu d'être un refus — ce qui est
 * la vraie contrainte de main-d'œuvre en agroforesterie.
 */
export const WEEK_HOURS_CAP = 60;
/** heures d'une UTH sur l'année (~1 800 h) */
export const UTH_HOURS_PER_YEAR = 1800;
/** découvert autorisé avant faillite, € (décision §15) */
export const OVERDRAFT_LIMIT_EUR = -20_000;
/** temps de plantation d'un arbre (trouaison, plant, protection), h *(à calibrer)* */
export const PLANT_HOURS = 1;
/** espacement minimal imposé à la plantation, m */
export const PLANT_MIN_SPACING_M = 1;
/**
 * Hauteur adulte à partir de laquelle une essence encombre PLEINEMENT un potet,
 * m. En dessous, l'exclusion se réduit dans la même proportion (#154).
 *
 * Le seuil du mètre ne dit pas « il y a un obstacle » — il dit « on ne met pas
 * deux futurs arbres l'un sur l'autre ». C'est donc le potentiel de l'essence
 * qui décide, pas la taille du jour : un semis de chêne de 30 cm doit bloquer,
 * parce qu'il deviendra un chêne ; une ronce de deux mètres ne doit rien
 * bloquer, parce qu'elle ne deviendra jamais un arbre et qu'on la débroussaille.
 *
 * Huit mètres est le haut de la strate arbustive dans l'atlas — pommier,
 * noisetier, aubépine, houx — et l'atlas est vide entre 8 et 20 m, si bien que
 * TOUT ce qui est un arbre garde exactement l'exclusion d'aujourd'hui. Le lot
 * ne déplace que la strate basse : ronce, ajonc, genêt à 2,5 m, callune à 0,6.
 */
export const HAUTEUR_ARBRE_M = 8;
/**
 * Diamètre au-dessus duquel une tige s'ABAT, et en dessous duquel elle se
 * DÉBROUSSAILLE, cm *(à calibrer)*. Entre les deux, le prix se mélange.
 *
 * `fellingHours` facture 0,3 h d'approche et de façonnage plus 0,15 h par mètre
 * de haut : c'est juste pour un fût qu'on approche, tronçonne, ébranche et
 * découpe, et absurde pour un brin de ronce qu'on couche d'un coup de
 * débroussailleuse. Mesuré avant ce lot : nettoyer 335 ronces revenait à
 * 822 h/ha, contre les 60 h/ha que `FAUCHE_HOURS_M2_MAIN` documente pour ce
 * geste exact — le moteur se contredisait d'un facteur quatorze.
 */
export const DIAMETRE_BROUSSE_CM = 5;
/** Diamètre au-dessus duquel la tige se facture entièrement comme un abattage, cm *(à calibrer)*. */
export const DIAMETRE_FUT_CM = 12;
/** prix de vente du bois de chauffage, €/m³ *(à calibrer)* */
export const WOOD_PRICE_EUR_M3 = 35;

/**
 * Masse volumique du bois mort ramassé, kg/m³. Une moyenne assumée : une fois
 * par terre, le bois n'a plus d'espèce — il a une masse et un état.
 */
export const DENSITE_BOIS_MORT_KG_M3 = 500;

/**
 * Décote du bois mort comme bois de chauffage. Un tronc qui a séché sur pied
 * puis passé des années par terre a perdu une part de son pouvoir calorifique
 * et s'est piqué : il chauffe, mais il ne vaut pas une bille fraîche.
 */
export const DECOTE_BOIS_MORT = 0.5;

/**
 * Heures pour ramasser un mètre cube de bois mort épars. Plus lent que de
 * débiter un arbre abattu au même endroit : il faut aller le chercher, il est
 * couché n'importe comment, et une part se casse à la manipulation.
 */
export const RAMASSAGE_HOURS_M3 = 2.5;

/**
 * Part du travail d'abattage que demande un fût qu'on laisse sur place. On
 * abat, on ébranche pour que le tronc porte au sol — sans ce contact il ne
 * barre rien — et on s'arrête là : ni débardage, ni chargement, ni transport.
 * Le geste est donc moins cher que la vente, et il ne rapporte rien.
 */
export const LAISSER_SUR_PLACE_FACTEUR = 0.75;
/** diamètre minimal pour qu'une bille intéresse une scierie, cm *(à calibrer)* */
export const DIAMETRE_OEUVRE_MIN_CM = 30;
/** hauteur de bille élaguée minimale pour vendre en bois d'œuvre, m */
export const BILLE_OEUVRE_MIN_M = 4;
/**
 * Temps d'élagage, h par mètre de tronc et par arbre : une vingtaine de
 * minutes, à la main, sécateur et scie d'élagage, en montant à l'échelle ou à
 * la perche. J'avais divisé ce chiffre par trois en le croyant surestimé ;
 * c'est le contraire qui est vrai — l'élagage de qualité est lent, et c'est
 * pour ça qu'on ne le fait que sur les tiges qu'on a choisies.
 */
export const ELAGAGE_HOURS_PAR_M = 0.35;
/** hauteur maximale atteignable à l'élagage (au-delà, il faut une nacelle) */
export const ELAGAGE_MAX_M = 8;
/**
 * Prix d'une protection individuelle, € : la gaine ou le grillage (2-3 €), le
 * tuteur de châtaignier qui tient debout dix ans (3-4 €) et les colliers. Ce
 * n'est pas un accessoire, c'est presque le prix du plant lui-même.
 */
export const PROTECTION_EUR = 8;
/**
 * Temps de pose, h. Enfoncer un piquet assez profond pour qu'un chevreuil qui
 * frotte ne le couche pas, monter la gaine, l'attacher : une demi-heure par
 * arbre, sur le terrain. C'est CE chiffre qui fait de la protection une
 * décision — protéger mille plants, c'est cinq cents heures.
 */
export const PROTECTION_HEURES = 0.5;
/** temps de recépage d'une cépée, h *(à calibrer)* */
export const RECEPAGE_HOURS = 0.8;
/** Hauteur à laquelle la souche repart après recépage, m. */
export const RECEPAGE_HAUTEUR_M = 0.5;
/**
 * Décote d'un bois ACCIDENTÉ récupéré en coupe sanitaire — brûlé sur pied ou
 * couché par la tempête : il vaut encore quelque chose (chauffage,
 * trituration), mais l'œuvre est perdue *(à calibrer)*.
 *
 * La constante s'appelait déjà « chablis » quand seul le feu savait la
 * déclencher ; depuis `tempete.ts`, elle couvre enfin ce que son nom dit.
 */
export const DECOTE_CHABLIS = 0.4;
/**
 * Décote d'une CHANDELLE sèche abattue pour le chauffage.
 *
 * Un fût mort sur pied est déjà ressuyé — c'est même le bois de chauffage le
 * plus commode, prêt à brûler sans deux ans de séchage. Mais il est fendillé,
 * l'aubier part en poussière et les insectes s'y sont mis : jamais d'œuvre, et
 * un volume utile moindre. Il vaut donc un peu moins que la même tige verte,
 * pas beaucoup moins *(à calibrer)*.
 *
 * Il reste évidemment le choix de NE PAS la couper : une chandelle est un
 * arbre-habitat (biodiversite.ts), et c'est le seul « produit » du jeu qui
 * rapporte davantage debout que par terre.
 */
export const DECOTE_CHANDELLE = 0.7;
/** salaire hebdomadaire chargé d'un ouvrier en CDI, € *(à calibrer)* */
export const SALARY_EUR_WEEK = 600;
/** salaire hebdomadaire d'un saisonnier (précarité incluse), payé d'avance, € */
export const SEASONAL_EUR_WEEK = 700;
/** indemnités + préavis à la rupture d'un CDI, € */
export const SEVERANCE_EUR = 1200;

/** Chaulage : 200 €/ha d'amendement (2 à 3 t à 40-80 €/t). */
export const LIME_EUR_M2 = 0.02;
/** Épandage à la brouette et à la pelle, entre des arbres serrés : 20 h/ha. */
export const LIME_HOURS_M2_MAIN = 0.002;
/** Épandage à l'épandeur, sur des passages dégagés : 4 h/ha. */
export const LIME_HOURS_M2_ENGIN = 0.0004;
/**
 * Fauche à la débroussailleuse, autour de chaque plant : 60 h/ha. C'est le
 * vrai prix d'un dégagement quand un engin ne peut pas entrer — et c'est le
 * cas dès que la plantation est dense ou irrégulière.
 */
export const FAUCHE_HOURS_M2_MAIN = 0.006;
/** Fauche au gyrobroyeur, sur des passages dégagés : ~3 h/ha. */
export const FAUCHE_HOURS_M2_ENGIN = 0.0003;
/**
 * Coût de l'engin par m² travaillé à la machine, € : carburant, usure et
 * amortissement, de l'ordre de 120 €/ha *(à calibrer)*. La machine achète du
 * temps, elle ne le donne pas.
 */
export const COUT_ENGIN_EUR_M2 = 0.012;
/** Labour : ~2 h/ha au tracteur, et il faut un engin — on ne laboure pas à la bêche un hectare. */
export const LABOUR_HOURS_M2 = 0.0002;
/** Coût du passage de labour, € par m² (carburant, usure : ~200 €/ha). */
export const LABOUR_EUR_M2 = 0.02;
/**
 * Part de l'humus minéralisée d'un coup par un labour.
 *
 * Retourner un sol casse les agrégats et expose à l'air une matière organique
 * jusque-là protégée : les micro-organismes la brûlent en quelques semaines.
 * C'est le fameux « coup de fouet » — une bouffée d'azote qui nourrit la
 * culture suivante, payée par du capital sol qui, lui, met des décennies à se
 * reconstituer. De l'ordre de 5 % du stock par labour *(à calibrer)*.
 */
export const LABOUR_PERTE_HUMUS = 0.05;
/** Hauteur en dessous de laquelle un plant ne survit pas au passage de l'outil, m. */
export const LABOUR_HAUTEUR_DETRUITE_M = 1.2;
/** Hauteur de tête de trogne par défaut : au-dessus de la dent du bétail. */
export const TROGNE_HAUTEUR_M = 2;
/** Temps d'un étêtage, h par arbre *(à calibrer)*. */
export const TROGNE_HEURES = 1.2;
/** Une journée de chasse : le temps d'un affût et d'une battue *(à calibrer)*. */
export const CHASSE_HEURES = 8;
/** Ce que rapporte la venaison d'une journée, € *(à calibrer)*. */
export const CHASSE_RECETTE_EUR = 120;
/** Grillage à gibier de 2 m posé, € par mètre de périmètre *(à calibrer)*. */
export const CLOTURE_EUR_M = 14;
/** Pose : creuser, tendre, ancrer — h par mètre de périmètre. */
export const CLOTURE_HEURES_M = 0.12;
/** couverture herbacée restant juste après un passage */
export const FAUCHE_COUVERTURE_RESIDUELLE = 0.1;
/**
 * Ce qu'un chaulage montait le pH, partout et quel que soit le sol.
 *
 * **Plus personne ne s'en sert** : depuis `bases.ts`, le chaulage apporte des
 * bases au complexe d'échange et le pH suit — beaucoup sur un sable, peu sur
 * une argile. La constante reste ici comme repère de calibration :
 * `CHAULAGE_EQ_M2` a été choisi pour reproduire cet ordre de grandeur sur un
 * sol moyen, et c'est la seule raison de ne pas l'effacer.
 */
export const LIME_PH_STEP = 0.5;
/**
 * C/N du bois raméal fragmenté épandu : du BOIS, pas des feuilles — libération
 * lente sur plusieurs années, c'est toute la valeur du BRF (ch2-B).
 */
export const BRF_CN_RATIO = 40;

/**
 * C/N d'un fumier de ferme bien décomposé (#140). Bien plus bas que celui du
 * BRF, qui est du bois : un fumier libère son azote sur deux à trois ans au
 * lieu d'en immobiliser d'abord *(à confirmer sur la composition publiée des
 * apports de Broadbalk, e-RA `01-BKFYM`)*.
 */
export const FUMIER_CN_RATIO = 15;
/**
 * Prix de l'azote minéral, €/kg N. L'ordre de grandeur des dernières campagnes,
 * ammonitrate rendu ferme *(à calibrer : le prix de l'azote suit celui du gaz
 * et a varié du simple au triple entre 2020 et 2023)*.
 */
export const AZOTE_MINERAL_EUR_KG = 1.5;
/**
 * Prix du fumier rendu et épandu, €/kg N apporté. Plus cher à l'unité d'azote
 * parce qu'on transporte surtout de l'eau et de la matière : c'est le vrai
 * arbitrage du geste, et il n'a de sens que rapporté à ce qu'il construit
 * *(à calibrer)*.
 */
export const FUMIER_EUR_KG_N = 2.5;
/** Épandage d'engrais minéral, h/ha : un passage d'épandeur centrifuge. */
export const FERTILISATION_HEURES_HA = 0.4;
/** Épandage de fumier, h/ha : on transporte des tonnes, pas des sacs. */
export const FUMIER_HEURES_HA = 2.5;
/**
 * Dose maximale d'un apport, kg N/ha. La directive nitrates plafonne l'azote
 * organique à 170 kg N/ha/an en zone vulnérable, et les paliers de Broadbalk
 * montent à 192 en minéral : au-delà de 250 en une fois, on ne fertilise plus,
 * on déverse *(à calibrer)*.
 */
export const DOSE_AZOTE_MAX_KG_HA = 250;
/**
 * Surcoût de temps pour charger le broyat au lieu de le laisser tomber sur
 * place : il faut remplir et déplacer la remorque *(à calibrer)*.
 */
export const BROYAGE_CHARGE_FACTEUR = 1.6;
/** Temps d'épandage du broyat, h par kg de matière sèche *(à calibrer)*. */
export const EPANDAGE_HEURES_PAR_KG = 0.004;

export interface EconomyState {
  treasuryEur: number;
  /** heures consommées cette semaine (remis à zéro chaque tick par le runner) */
  hoursUsedWeek: number;
  /** heures consommées depuis le début de l'année (affichage UTH) */
  hoursUsedYear: number;
  /** UTH disponibles = 1 (le joueur) + CDI + saisonniers actifs (recalculé chaque semaine) */
  uth: number;
  /** ouvriers permanents (salaire hebdo ; rupture = indemnités) */
  ouvriersCdi: number;
  /** contrats saisonniers en cours : semaine de fin (exclusive) de chacun */
  saisonniersFinSemaine: number[];
  bankrupt: boolean;
  /**
   * Volume de bois vendu depuis le début de l'année civile, m³. Remis à zéro
   * chaque 1er janvier. Il sert à l'engorgement du débouché local : au-delà
   * d'un certain volume, le prix baisse (marche.ts).
   */
  volumeVenduAnneeM3: number;
  /**
   * L'économie compte-t-elle dans cette partie ?
   *
   * Certaines questions ne sont pas économiques. « Quelle succession sur cette
   * lande en deux siècles », « le chêne-liège protège-t-il du feu », « où planter
   * pour retenir la terre » : aucune ne demande de savoir si le joueur peut
   * payer ses plants. Y répondre en devant d'abord tenir une trésorerie n'ajoute
   * pas de réalisme, ça ajoute une contrainte hors sujet.
   *
   * Économie désactivée : plus de découvert refusé, plus de faillite. Le compte
   * continue de tourner et reste AFFICHÉ — savoir ce qu'aurait coûté une
   * conduite est instructif même quand on ne la paie pas — mais il ne bloque
   * plus rien.
   *
   * Ce qui NE dépend pas de cette option : le plafond d'heures de travail. Une
   * journée fait le même nombre d'heures qu'on ait de l'argent ou non ; c'est
   * une contrainte physique, pas économique.
   */
  active: boolean;
}

export function createEconomy(treasuryEur: number, active = true): EconomyState {
  return {
    treasuryEur,
    active,
    hoursUsedWeek: 0,
    hoursUsedYear: 0,
    uth: 1,
    ouvriersCdi: 0,
    saisonniersFinSemaine: [],
    bankrupt: false,
    volumeVenduAnneeM3: 0,
  };
}

export type GameAction =
  | {
      type: "planter";
      week: number;
      /**
       * Poser le manchon dans la foulée. C'est le geste réel : on ne plante
       * pas d'abord pour revenir protéger la semaine suivante, on arrive avec
       * ses plants et ses protections. Coût et temps identiques à l'action
       * `proteger` séparée.
       */
      avecManchon?: boolean;
      especeId: string;
      positions: { x: number; y: number }[];
    }
  | {
      type: "couper";
      week: number;
      treeIds: number[];
      /**
       * Que fait-on du bois ?
       *  - `vendre` : il part en bois énergie (ou d'œuvre s'il en a la qualité) ;
       *  - `epandre` : broyé et laissé SUR PLACE, sous l'ancienne couronne ;
       *  - `broyer` : broyé et chargé, il rejoint le tas de BRF, à épandre où
       *    l'on veut. C'est plus long — il faut remplir la remorque — mais
       *    c'est ce qui permet de TRANSPORTER la fertilité.
       *  - `laisser` : le fût reste au sol, COUCHÉ EN TRAVERS DE LA PENTE. Ça
       *    ne rapporte rien et ça demande moins de travail que d'aller le
       *    chercher, mais c'est le seul geste qui arme un versant contre le
       *    ruissellement (boisMort.ts) — et c'est précisément celui de la
       *    restauration post-incendie.
       */
      devenir: "vendre" | "epandre" | "broyer" | "laisser";
    }
  | {
      type: "recolter";
      week: number;
      treeIds: number[];
    }
  | {
      /**
       * Embauche (§10). CDI : 600 €/sem (1re semaine payée à l'embauche),
       * rupture 1 200 €. Saisonnier : 700 €/sem payées d'avance pour
       * `semaines` semaines, le contrat expire tout seul — l'outil des
       * pointes de récolte. `contrat` absent = CDI (vieux journaux).
       */
      type: "embaucher";
      week: number;
      contrat?: "cdi" | "saisonnier";
      semaines?: number;
    }
  | {
      /** rupture d'un CDI : indemnités + préavis (1 200 €) */
      type: "licencier";
      week: number;
    }
  | ({
      /** chauler un disque : pH +0,5 (plafond 7,5) — pour les calcicoles (§9) */
      type: "chauler";
      week: number;
    } & Zone)
  | {
      /**
       * Lever l'écorce (démasclage du liège) : une récolte qui ne tue pas
       * l'arbre et qui revient tous les dix ans.
       */
      type: "leverEcorce";
      week: number;
      treeIds: number[];
    }
  | ({
      /**
       * Éclaircir une zone jusqu'à une densité cible, en désignant les tiges
       * par un CRITÈRE plutôt qu'une par une (ch5-A « les coupes »).
       *  - `parLeBas` : on retire les dominés — l'éclaircie classique, qui
       *    concentre la croissance sur les plus beaux sujets ;
       *  - `parLeHaut` : on prélève les gros — récolte du capital ;
       *  - `espece` : on retire une essence (dégager une nurse, diversifier
       *    une pinède pour couper la continuité du combustible).
       */
      type: "eclaircir";
      week: number;
      /** tiges/ha visées après passage */
      densiteCibleParHa: number;
      critere: "parLeBas" | "parLeHaut" | "espece";
      /** pour le critère « espece » */
      especeId?: string;
      devenir: "vendre" | "epandre" | "broyer" | "laisser";
    } & Zone)
  | {
      /**
       * Élaguer : monter une bille propre sur les arbres choisis. C'est ce
       * qui fera plus tard du bois d'œuvre au lieu du chauffage (ch5-A).
       */
      type: "elaguer";
      week: number;
      treeIds: number[];
      /** hauteur de tronc à dégager, m */
      hauteurM: number;
    }
  | ({
      /**
       * Épandre le tas de broyat sur une zone choisie. C'est LE geste de
       * transfert de fertilité : on coupe les fixateurs d'azote là où ils
       * poussent, et on porte leur azote au pied des arbres qu'on veut nourrir.
       */
      type: "epandreBrf";
      week: number;
      /** part du tas à épandre ∈ ]0,1] */
      part: number;
    } & Zone)
  | ({
      /**
       * FERTILISER une zone (#140). Deux formes qui ne font pas la même chose,
       * et c'est tout l'intérêt du geste :
       *
       *  - **minéral** : l'azote arrive dans le pool MINÉRAL, tout de suite
       *    disponible — et tout de suite LESSIVABLE. Un apport posé avant
       *    l'hiver part avec le drainage, et le moteur sait déjà le faire
       *    (`cellLeachedG`) ;
       *  - **fumier** : il arrive dans la LITIÈRE, avec son C/N. Il se
       *    minéralise sur des années, il ne lessive pas tant qu'il n'est pas
       *    minéralisé, et il construit de l'humus au passage.
       *
       * La dose est en kg N/ha dans les deux cas, pour qu'elles se comparent.
       */
      type: "fertiliser";
      week: number;
      forme: "mineral" | "fumier";
      /** dose d'azote apportée, kg N/ha */
      doseKgNHa: number;
    } & Zone)
  | {
      /**
       * Étêter (trogner) : couper la charpente à hauteur d'homme, au-dessus de
       * la dent du bétail, et laisser la tête repartir. On y revient tous les
       * dix ans. C'est le geste qui a fait les arbres les plus vieux de nos
       * campagnes.
       */
      type: "trogner";
      week: number;
      treeIds: number[];
      /** hauteur de la tête, m (on recoupe toujours au même endroit) */
      hauteurTeteM: number;
    }
  | {
      /**
       * Chasser : une journée de prélèvement sur la parcelle. Efficace sur le
       * moment, vain à terme — les voisins comblent le vide.
       */
      type: "chasser";
      week: number;
    }
  | ({
      /**
       * Clôturer une zone : cher au mètre de périmètre, mais total. À la
       * différence des manchons, le coût ne dépend pas du nombre de plants —
       * c'est ce qui le rend imbattable au-delà d'une certaine surface.
       */
      type: "cloturer";
      week: number;
    } & Zone)
  | ({
      /**
       * Labourer : retourner le sol d'une zone. Le geste fondateur de
       * l'agriculture, et celui qui coûte le plus cher au sol.
       */
      type: "labourer";
      week: number;
    } & Zone)
  | {
      /**
       * Protéger : poser un manchon ou une gaine sur des plants. C'est le
       * geste qui décide du sort d'une plantation là où il y a du gibier —
       * il faut tenir jusqu'à ce que la flèche passe la hauteur de dent.
       */
      type: "proteger";
      week: number;
      treeIds: number[];
    }
  | {
      /**
       * Recéper : couper au ras pour faire repartir la souche en cépée
       * (taillis, trogne). Seules les espèces qui rejettent le supportent.
       */
      type: "receper";
      week: number;
      treeIds: number[];
    }
  | ({
      /**
       * Faucher/dégager un disque : rabat la strate herbacée, qui repartira.
       * C'est l'entretien qui sauve une plantation de la concurrence (ch4-B) —
       * et l'herbe coupée reste au sol en litière.
       */
      type: "faucher";
      week: number;
    } & Zone)
  | ({
      /**
       * SEMER une culture sur une zone (#136). Ce que le semis pose, c'est la
       * PLACE LIBRE : un blé semé dans une friche n'occupe que ce que les
       * adventices lui laissent, et c'est ce qui fait de `labourer` et de
       * `faucher` des gestes préparatoires plutôt que des ornements. La règle
       * n'est écrite nulle part, elle tombe du partage de la place
       * (`herbacees.ts`).
       */
      type: "semer";
      week: number;
      cultureId: string;
    } & Zone)
  | ({
      /**
       * MOISSONNER : le grain accumulé depuis le semis part en vente, et la
       * culture libère la place. Hors de sa fenêtre de récolte, il n'y a rien
       * à prendre — un blé moissonné en mai n'a pas fini de remplir.
       */
      type: "moissonner";
      week: number;
    } & Zone)
  | ({
      /**
       * Ramasser le bois mort COUCHÉ d'une zone pour le chauffage. Le geste
       * n'est pas neutre : il enlève de l'humus en devenir, un abri et une
       * protection du sol, et il retire du gros combustible. C'est l'arbitrage
       * même du bois mort, et il n'a de bonne réponse qu'au cas par cas.
       */
      type: "ramasserBoisMort";
      week: number;
    } & Zone);

export interface ActionRefusal {
  week: number;
  action: GameAction["type"];
  reason: string;
}

export interface ApplyResult {
  state: GameState;
  refusals: ActionRefusal[];
  /**
   * Ce que l'action a fait subir à quels arbres. Sans ça, un arbre coupé
   * s'ESCAMOTE au lieu de tomber : le rendu voit un instantané avec un arbre
   * en moins et n'a aucun moyen de savoir lequel, ni pourquoi.
   */
  gestes?: GesteVisible[];
}

/**
 * Un geste de la semaine, et ce qu'il a touché.
 *
 * Deux mailles, parce qu'il y a deux sortes de gestes et qu'aucune des deux ne
 * s'exprime dans l'autre. Une coupe désigne des ARBRES : le rendu doit savoir
 * lesquels tombent, sinon ils s'escamotent. Un labour, un chaulage, un
 * ramassage de bois mort désignent des CELLULES : sans elles, le sol change de
 * teinte d'une image à l'autre et le geste n'a pas eu lieu à l'écran.
 *
 * Les indices de cellule sont les mêmes que ceux des grilles de l'instantané —
 * `y * coteM + x` — donc rien de nouveau à comprendre côté rendu.
 */
export type GesteVisible = GesteSurArbres | GesteSurZone;

export interface GesteSurArbres {
  type: GesteTypeArbre;
  /** les arbres réellement touchés, pas ceux qu'on avait demandés */
  ids: readonly number[];
  /**
   * Ce que le geste a RETIRÉ de chaque arbre nommé dans `ids`, même ordre.
   *
   * Sans ça, `ids` ne suffit pas à dessiner le geste : un arbre coupé quitte
   * `state.trees` dans le même tick, donc le rendu qui reçoit son identifiant
   * ne le trouve plus dans l'instantané et n'a plus ni sa position ni sa
   * taille pour l'animer. D'où un enregistrement COMPLET plutôt qu'un delta —
   * la même forme que `ChuteDeChandelle` et `MortDeLaSemaine` (tick.ts).
   *
   * Présent pour les cinq gestes qui DÉMONTENT une tige (`couper`,
   * `eclaircir`, `elaguer`, `trogner`, `receper`). Absent partout ailleurs, et
   * pour la même raison à chaque fois : l'arbre est toujours là après le geste,
   * donc le rendu le retrouve dans l'instantané. Le gibier ne retire aucun
   * volume géométrique — ce qu'il mange est un stock (`pousseTendreM`), et sa
   * date voyage déjà par `brouteSemaine`. Un arbre planté, récolté ou démasclé
   * garde sa géométrie : planter l'AJOUTE, récolter vide `fruitsKg`, démascler
   * n'enlève que l'écorce.
   */
  retire?: readonly ArbreRetire[];
  /**
   * Ce que le geste a enlevé de chaque arbre nommé dans `ids`, kg, même ordre.
   *
   * Renseignée pour les deux gestes qui prélèvent une MASSE sans toucher à la
   * forme de l'arbre : `recolter` (les fruits qui quittent la couronne) et
   * `leverEcorce` (les planches de liège empilées au pied). Le rendu en tire
   * combien en faire partir, là où les seuls `ids` ne diraient que « quelque
   * chose est parti » (#100).
   */
  masseKg?: readonly number[];
}

/**
 * Un arbre tel qu'il était juste AVANT le geste, et tel qu'il en ressort :
 * de quoi interpoler l'animation sans rien deviner.
 *
 * Les deux hauteurs se lisent ensemble. `hauteurApresM` à 0 veut dire que la
 * tige a quitté la carte (coupe, éclaircie) ; sinon c'est ce qui reste debout
 * — la tête d'une trogne, la souche d'un recépage, la tige intacte d'un
 * élagage. Le volume retiré est l'écart entre les deux, et pour l'élagage,
 * l'écart entre les deux bases de houppier.
 */
export interface ArbreRetire {
  id: number;
  x: number;
  y: number;
  especeId: string;
  /**
   * Diamètre à 1,30 m, cm — inchangé par le geste, et c'est tout l'intérêt de
   * le porter. Le stade de développement est une classe de DIAMÈTRE
   * (`stades.ts`) : sans ce champ, le rendu ne pourrait plus le calculer, car
   * les deux hauteurs ne suffisent plus à le déduire depuis #62.
   *
   * Il dit aussi quelque chose que les hauteurs taisent : étêter une trogne
   * n'amincit pas son tronc. Un fût de quarante centimètres rabattu à deux
   * mètres reste un gros bois, et ne redevient pas un gaulis.
   */
  diametreCm: number;
  /** hauteur avant le geste, m */
  hauteurAvantM: number;
  /** hauteur qui reste debout après, m ; 0 = la tige a quitté la carte */
  hauteurApresM: number;
  /** base du houppier avant le geste, m (0 = branchu jusqu'au sol) */
  baseHouppierAvantM: number;
  /** base du houppier après le geste, m */
  baseHouppierApresM: number;
  /**
   * Direction dans laquelle le fût a été couché, radians (0 = +x, sens
   * trigonométrique) — présent seulement quand une tige ENTIÈRE est tombée :
   * `couper`, `eclaircir`, `receper`. Absent pour `elaguer` et `trogner`, où
   * la charpente est démontée sur place : le moteur n'y voit pas une
   * direction unique et n'en invente pas.
   *
   * C'est la même orientation que celle du fût laissé au sol — EN TRAVERS de
   * la pente (boisMort.ts) — parce que c'est la seule que le moteur sache
   * justifier : il ne modélise ni cloisonnement ni sens de débardage. Sur un
   * terrain plat elle ne veut rien dire, et ne sert à rien non plus.
   */
  directionRad?: number;
}

export interface GesteSurZone {
  type: GesteTypeZone;
  /** cellules réellement touchées, indices `y * coteM + x` */
  cellules: readonly number[];
}

/**
 * Gestes qui désignent des arbres. Le gibier est l'auteur de `brouter` et
 * `frotter` ; tout le reste vient du joueur.
 *
 * LES TROIS DERNIERS ONT MANQUÉ LONGTEMPS (#100), et le rendu ne pouvait pas y
 * suppléer : les actions `planter`, `recolter` et `leverEcorce` s'appliquaient
 * sans rien rapporter, si bien que le journal de la semaine les taisait et
 * qu'aucune animation n'avait d'événement où s'accrocher. Un ÉTAT ne suffit
 * pas à les remplacer, et c'est la même faute qu'ailleurs : des `fruitsKg` qui
 * passent de présents à absents ne disent pas si on a récolté, si la chute a
 * eu lieu ou si la floraison a avorté ; `derniereLeveeSemaine` est une DURÉE,
 * donc un arbre démasclé il y a dix ans porte la même marque que celui qu'on
 * démascle à l'instant ; et un plant n'est pas une naissance — `naissances`
 * vient de la régénération, pas de l'action.
 */
export type GesteTypeArbre =
  | "couper"
  | "eclaircir"
  | "elaguer"
  | "trogner"
  | "receper"
  | "brouter"
  | "frotter"
  | "planter"
  | "recolter"
  | "leverEcorce";

/** Gestes qui désignent une zone de sol. */
/**
 * Gestes qui désignent une zone de sol.
 *
 * LES DEUX DERNIERS PORTENT LE MÊME NOM QUE DES GESTES SUR ARBRES, et ce n'est
 * pas une collision : c'est un seul geste qui touche les DEUX mailles (#124). Le
 * §6.2 le décrit ainsi — « le plant apparaît, la terre est retournée autour »,
 * « le tronc change de couleur, planches de liège empilées » — une moitié qui
 * désigne des arbres, une moitié qui désigne du sol. Les deux voyagent donc sous
 * le même nom, et `estGesteSurArbres` / `estGesteSurZone` les séparent par leur
 * FORME, pas par leur type.
 */
export type GesteTypeZone =
  | "chauler"
  | "faucher"
  | "epandreBrf"
  | "labourer"
  | "ramasserBoisMort"
  | "cloturer"
  | "planter"
  | "leverEcorce";

export type GesteType = GesteTypeArbre | GesteTypeZone;

/**
 * Discriminer les deux mailles. `Array.prototype.find` rend l'union entière,
 * que TypeScript ne sait pas rétrécir sur le seul `type` : ces deux gardes
 * évitent au rendu — et à nous — de le refaire à la main à chaque usage.
 */
export function estGesteSurArbres(geste: GesteVisible): geste is GesteSurArbres {
  return "ids" in geste;
}

export function estGesteSurZone(geste: GesteVisible): geste is GesteSurZone {
  return "cellules" in geste;
}

/**
 * Ce que vaut un arbre sur pied, € — et à quel titre. Une bille droite,
 * élaguée et de bon diamètre part en scierie à plusieurs centaines d'euros le
 * m³ ; le reste finit en bûches. C'est l'écart qui justifie l'élagage et la
 * patience (ch5-A).
 */
export function valeurSurPied(
  espece: EspeceV0,
  tree: { heightM: number; diametreCm: number; hauteurElagueeM: number },
): { eur: number; qualite: "oeuvre" | "chauffage"; partOeuvre: number } {
  const volume = volumeTigeM3(tree.diametreCm, tree.heightM);
  const assezGros = tree.diametreCm >= DIAMETRE_OEUVRE_MIN_CM;
  const assezElague = tree.hauteurElagueeM >= BILLE_OEUVRE_MIN_M;
  if (assezGros && assezElague) {
    // Seule la bille élaguée fait de l'œuvre ; le houppier reste du chauffage.
    const partOeuvre = Math.min(0.6, tree.hauteurElagueeM / tree.heightM);
    return {
      eur:
        volume * partOeuvre * espece.bois.prixOeuvreEurM3 +
        volume * (1 - partOeuvre) * WOOD_PRICE_EUR_M3,
      qualite: "oeuvre",
      // Cette part-là ne servait qu'au PRIX ; elle sort maintenant, parce que
      // le carbone doit suivre le même partage que la caisse (issue #72).
      partOeuvre,
    };
  }
  return { eur: volume * WOOD_PRICE_EUR_M3, qualite: "chauffage", partOeuvre: 0 };
}

/** Temps d'abattage + façonnage d'un arbre, h *(à calibrer)*. */
export function fellingHours(heightM: number): number {
  return 0.3 + 0.15 * heightM;
}

/**
 * Part de tige qui relève de l'ABATTAGE plutôt que du débroussaillage, ∈ [0,1].
 *
 * Une rampe sur le diamètre, parce qu'il n'y a pas de frontière nette entre un
 * brin qu'on couche à la débroussailleuse et une perche qu'on tronçonne. Le
 * zéro en dessous de `DIAMETRE_BROUSSE_CM` porte sur ce TERME, pas sur le prix :
 * une tige de brousse coûte son débroussaillage, jamais rien.
 */
export function partAbattage(diametreCm: number): number {
  const etendue = DIAMETRE_FUT_CM - DIAMETRE_BROUSSE_CM;
  return Math.min(1, Math.max(0, (diametreCm - DIAMETRE_BROUSSE_CM) / etendue));
}

/**
 * Temps pour faire tomber une tige, h — abattage, débroussaillage, ou entre les
 * deux selon son diamètre (#154).
 *
 * Le débroussaillage se facture à la SURFACE que la tige occupe au sol, au tarif
 * que le moteur emploie déjà pour un dégagement à la main
 * (`FAUCHE_HOURS_M2_MAIN`, 60 h/ha). Ce n'est pas un réglage : sur une friche de
 * dix ans, les houppiers de ronce couvrent 2 911 m² d'une parcelle de 2 500, ce
 * qui donne 17,5 h là où les 60 h/ha en donnent 15. Le modèle surfacique tombe
 * sur l'ancre tout seul, et il a la bonne limite aux deux bouts — un tapis
 * continu coûte le plein tarif, des brins épars coûtent à proportion.
 */
export function heuresPourAbattre(tree: {
  heightM: number;
  diametreCm: number;
  especeId: string;
}): number {
  const part = partAbattage(tree.diametreCm);
  if (part >= 1) return fellingHours(tree.heightM);
  const espece = getEspece(tree.especeId);
  const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm);
  const brousse = Math.PI * r * r * FAUCHE_HOURS_M2_MAIN;
  return part * fellingHours(tree.heightM) + (1 - part) * brousse;
}

/**
 * Heures de débroussaillage qu'un potet réclame avant qu'on puisse creuser, h
 * (#154).
 *
 * On ne dégage que le potet, pas la parcelle : la surface de brousse qui
 * recouvre le mètre carré visé, au tarif du dégagement à la main. Le chiffre est
 * petit — une minute environ dans un roncier fermé, contre l'heure que coûte la
 * plantation — et c'est le bon ordre de grandeur : 60 h/ha sur trois mètres
 * carrés font quelques dizaines de secondes.
 *
 * Ce qui punit vraiment une plantation dans un roncier n'est donc PAS ce
 * surcoût, c'est que le plant s'y fasse étouffer — et ça, le moteur le simule
 * déjà par la lumière. Facturer davantage ici reviendrait à compter deux fois,
 * et à écrire en dur une punition que la simulation produit toute seule.
 */
export function degagementDuPotet(
  trees: readonly {
    alive: boolean;
    x: number;
    y: number;
    heightM: number;
    diametreCm: number;
    especeId: string;
  }[],
  x: number,
  y: number,
): number {
  let recouvert = 0;
  for (const t of trees) {
    if (!t.alive) continue;
    const part = 1 - partAbattage(t.diametreCm);
    if (part <= 0) continue;
    const espece = getEspece(t.especeId);
    const r = crownRadiusM(t.heightM, espece.lumiere.houppierRatio, t.diametreCm);
    const d = Math.hypot(t.x - x, t.y - y);
    if (d >= r + PLANT_MIN_SPACING_M) continue;
    // Part du potet que ce houppier recouvre, approchée par le rapport des
    // rayons : suffisant pour un surcoût, et sans intersection de disques à
    // écrire pour trois décimales.
    const chevauchement = Math.min(1, (r + PLANT_MIN_SPACING_M - d) / (2 * PLANT_MIN_SPACING_M));
    recouvert += part * chevauchement;
  }
  const surface = Math.PI * PLANT_MIN_SPACING_M * PLANT_MIN_SPACING_M;
  return Math.min(1, recouvert) * surface * FAUCHE_HOURS_M2_MAIN;
}

/**
 * Rayon d'exclusion qu'une tige impose à un potet, m (#154).
 *
 * Proportionnel à ce que son essence peut DEVENIR, plafonné à l'espacement
 * d'aujourd'hui : tout ce qui est un arbre garde exactement l'ancienne règle,
 * seule la strate basse se relâche.
 */
export function rayonEncombrement(especeId: string): number {
  const h = getEspece(especeId).hauteurMaxM;
  return PLANT_MIN_SPACING_M * Math.min(1, h / HAUTEUR_ARBRE_M);
}

/**
 * Les heures faites AU-DELÀ de ce que l'effectif couvre, cette semaine.
 *
 * Zéro tant qu'on tient dans le plafond. Rien à retenir en plus : le compteur
 * `hoursUsedWeek` existait déjà et continue simplement de monter, ce qu'il
 * faisait de toute façon — c'est le refus qui l'arrêtait avant, pas lui.
 */
export function depassementHoraire(economy: { hoursUsedWeek: number; uth: number }): number {
  return Math.max(0, economy.hoursUsedWeek - WEEK_HOURS_CAP * economy.uth);
}

/**
 * Ce que coûteraient les heures supplémentaires, et combien de bras il faut.
 *
 * IL N'Y A PAS DE PLAFOND DUR À INVENTER, et c'est ce qui rend le mécanisme
 * honnête : embaucher n'est pas faire travailler quelqu'un plus longtemps,
 * c'est ajouter une personne. Le dépassement se convertit donc en EMBAUCHES —
 * une par tranche de plafond entamée — et le prix suit les constantes qui
 * existent déjà (`SEASONAL_EUR_WEEK`), sans nouveau nombre à calibrer. Le
 * saisonnier est l'instrument juste ici : on paie une semaine de bras pour une
 * semaine d'heures déjà faites.
 *
 * LE PALIER NE SE LISSE PAS, et c'est une décision actée (docs/regles.md
 * §15-12) : dépasser d'une heure coûte une semaine de saisonnier entière, parce
 * qu'on n'embauche personne pour une heure. Si une partie montre que
 * l'arbitrage en devient absurde, c'est la partie qui le dira — pas un banc, et
 * pas ce commentaire.
 */
export function coutDuDepassement(depassementHeures: number): {
  embauches: number;
  eur: number;
} {
  const embauches = Math.ceil(Math.max(0, depassementHeures) / WEEK_HOURS_CAP);
  return { embauches, eur: embauches * SEASONAL_EUR_WEEK };
}

function refuse(week: number, action: GameAction["type"], reason: string): ActionRefusal {
  return { week, action, reason };
}

function applyPlanter(
  state: GameState,
  action: Extract<GameAction, { type: "planter" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  const espece = getEspece(action.especeId);
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  let nextTreeId = state.nextTreeId;
  let planted = 0;
  let importedKgC = 0;
  /** Les plants RÉELLEMENT posés — pas ceux qu'on avait demandés (#100). */
  const poses: number[] = [];
  /** Et les cellules où la terre a été ouverte pour les mettre (#124), sans doublon. */
  const travaillees = new Set<number>();
  // La vigueur de chaque plant se tire dans le générateur de la partie : deux
  // parties de même graine plantent donc exactement les mêmes individus.
  let rng = state.rng;

  const heuresParPlant = PLANT_HOURS + (action.avecManchon ? PROTECTION_HEURES : 0);
  const euroParPlant = espece.economie.prixPlantEur + (action.avecManchon ? PROTECTION_EUR : 0);
  for (const pos of action.positions) {
    if (state.economy.active && treasuryEur - euroParPlant < OVERDRAFT_LIMIT_EUR) {
      refusals.push(refuse(action.week, "planter", `découvert plafonné (${planted} plantés)`));
      break;
    }
    if (pos.x < 0 || pos.x >= state.station.coteM || pos.y < 0 || pos.y >= state.station.coteM) {
      refusals.push(refuse(action.week, "planter", "position hors parcelle"));
      continue;
    }
    // L'exclusion appartient au VOISIN, pas au geste : une ronce n'empêche pas
    // un potet, un chêne oui, et entre les deux ça se dose (#154). Le message
    // nomme donc l'essence qui bloque — `prevoirAction` (#139) le porte jusque
    // sous le curseur, où « un arbre vivant » n'aidait personne.
    const gene = trees.find((t) => {
      if (!t.alive) return false;
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      const r = rayonEncombrement(t.especeId);
      return dx * dx + dy * dy < r * r;
    });
    if (gene) {
      refusals.push(
        refuse(
          action.week,
          "planter",
          `trop proche d'un ${getEspece(gene.especeId).nom.toLowerCase()} vivant (< ${rayonEncombrement(gene.especeId).toFixed(1)} m)`,
        ),
      );
      continue;
    }
    // Ce qu'il faut ouvrir avant de creuser : la brousse qui recouvre le potet
    // se débroussaille, et ça se paie en heures plutôt qu'en refus (#154, dans
    // l'esprit de #133 — le joueur arbitre, le moteur facture).
    const heuresDegagement = degagementDuPotet(trees, pos.x, pos.y);
    const tirage = tirerVigueurIndividuelle(rng);
    rng = tirage.rng;
    poses.push(nextTreeId);
    travaillees.add(Math.floor(pos.y) * state.station.coteM + Math.floor(pos.x));
    trees.push({
      vigueurIndividuelle: tirage.vigueur,
      id: nextTreeId++,
      especeId: action.especeId,
      x: pos.x,
      y: pos.y,
      ageWeeks: 0,
      heightM: 0.3,
      diametreCm: diametreInitialCm(0.3),
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 20,
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: action.avecManchon === true,
      recepages: 0,
    });
    planted++;
    treasuryEur -= euroParPlant;
    hoursUsedWeek += heuresParPlant + heuresDegagement;
    hoursUsedYear += heuresParPlant + heuresDegagement;
    importedKgC += treeTotalCarbonKg(espece, diametreInitialCm(0.3), 0.3); // le plant arrive avec sa biomasse
  }

  return {
    state: {
      ...state,
      trees,
      nextTreeId,
      rng,
      carbon: {
        ...state.carbon,
        importedPlantsCumKgC: state.carbon.importedPlantsCumKgC + importedKgC,
      },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
    // DEUX GESTES POUR UNE ACTION (#124) : les plants posés, et le sol travaillé
    // autour d'eux. #100 n'avait livré que le premier, en refusant d'inventer
    // une maille de terre retournée — et ce refus portait sur la bonne chose,
    // mais pas sur la bonne question. Le moteur ne retourne effectivement rien
    // en plantant : aucun état de sol ne bouge, ni `boutis`, ni `laboure`.
    //
    // Ce qu'il sait pourtant, et qui n'est pas une invention, c'est OÙ le geste
    // a eu lieu. Un geste de zone dit « ces cellules ont été touchées », pas
    // « leur sol a changé » — c'est ce que `ramasserBoisMort` dit déjà sans
    // rien changer au sol non plus. Le rendu peut donc dessiner sa terre remuée
    // sans que personne ait deviné de rayon : il n'y en a pas à deviner, la
    // cellule du plant EST l'emprise, et un mètre carré est l'ordre de grandeur
    // d'un potet.
    //
    // Ce qui reste hors de ce lot, et qui serait un mécanisme : que ce travail
    // du sol AIT DES SUITES — lit de germination, tassement, minéralisation.
    gestes:
      poses.length > 0
        ? [
            { type: "planter", ids: poses },
            { type: "planter", cellules: [...travaillees] },
          ]
        : [],
  };
}

function applyCouper(
  state: GameState,
  action: Extract<GameAction, { type: "couper" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const litterK = state.soil.litterK.slice();
  let { deadWoodKgC, exportedEnergyCumKgC, oeuvreCumKgC, oeuvreStockKgC } = state.carbon;
  let volumeVenduAnneeM3 = state.economy.volumeVenduAnneeM3;
  let stockBrf = state.stockBrf;
  const coupes: number[] = [];
  const retire: ArbreRetire[] = [];
  const dims = { widthM: state.station.coteM, heightM: state.station.coteM };
  const boisAuSolCG = state.soil.boisAuSolCG.slice();
  const boisEnTraversPart = state.soil.boisEnTraversPart.slice();
  const altitudes = altitudeParCellule(state.station.relief, dims);

  for (const id of action.treeIds) {
    // Tout ce qui est debout se coupe : la tige vive, le brûlé de l'année en
    // coupe sanitaire, et la CHANDELLE sèche en bois de chauffage. Il n'y a
    // rien d'autre dans `state.trees` — un arbre n'en sort que le jour où il
    // s'abat (tick.ts).
    const idx = trees.findIndex((t) => t.id === id);
    if (idx < 0) {
      refusals.push(refuse(action.week, "couper", `arbre ${id} introuvable`));
      continue;
    }
    const tree = trees[idx];
    if (!tree) continue;
    const espece = getEspece(tree.especeId);
    /**
     * Le bois de cet arbre est-il DÉJÀ dans le pool de bois mort ?
     *
     * `mortSemaine` est posée au tick qui suit la mort, en même temps que le
     * carbone aérien est versé au bois mort — une fois pour toutes. Passé ce
     * moment, emporter le fût n'ajoute rien au bilan : ça le DÉPLACE. Sans
     * cette distinction on fabriquerait du carbone en abattant un mort, ce
     * qu'un test de conservation refuse à juste titre.
     *
     * Le cas du brûlé de l'année est différent et reste inchangé : il n'a pas
     * encore de `mortSemaine`, son carbone est toujours « dans l'arbre ».
     */
    const dejaEnBoisMort = tree.mortSemaine !== undefined;
    if (dejaEnBoisMort && (action.devenir === "epandre" || action.devenir === "broyer")) {
      // Le BRF est du bois raméal FRAIS : c'est le cambium vivant et l'azote
      // du rameau de l'année qui font son intérêt agronomique. Broyer un fût
      // sec ne donne pas du BRF, ça donne de la sciure — beaucoup de carbone,
      // aucun azote, et une faim d'azote au sol pour des années.
      refusals.push(
        refuse(
          action.week,
          "couper",
          `arbre ${id} : une chandelle sèche ne fait pas de BRF (il faut du bois frais) — à vendre en chauffage, à coucher au sol, ou à laisser debout`,
        ),
      );
      continue;
    }
    // Broyer demande plus de travail que vendre bord de route ; charger le
    // broyat pour l'emporter, plus encore.
    const facteurTravail =
      action.devenir === "epandre"
        ? 1.3
        : action.devenir === "broyer"
          ? BROYAGE_CHARGE_FACTEUR
          : action.devenir === "laisser"
            ? LAISSER_SUR_PLACE_FACTEUR
            : 1;
    const hours = heuresPourAbattre(tree) * facteurTravail;
    hoursUsedWeek += hours;
    hoursUsedYear += hours;

    const aerienKgC = treeAboveCarbonKg(espece, tree.diametreCm, tree.heightM);
    /**
     * Carbone qui quitte réellement la parcelle avec le fût.
     *
     * Pour une tige vive, c'est tout son aérien. Pour une chandelle, c'est ce
     * qu'il en RESTE dans le pool de bois mort — lequel se décompose semaine
     * après semaine (tick.ts). Une chandelle de dix ans a déjà rendu au sol et
     * à l'atmosphère une bonne part d'elle-même ; en emporter davantage
     * viderait le pool sous zéro et fabriquerait du carbone.
     *
     * C'est l'approximation qu'impose un pool AGRÉGÉ : le moteur ne sait pas
     * quelle part du bois mort appartient à quelle chandelle. Un pool séparé
     * pour le bois mort DEBOUT serait plus juste — il se décompose plus
     * lentement, sec et hors sol — et c'est le jour où il existera qu'on
     * pourra dater ce que vaut une chandelle *(limite assumée)*.
     */
    const emporteKgC = dejaEnBoisMort ? Math.min(aerienKgC, Math.max(0, deadWoodKgC)) : aerienKgC;
    if (dejaEnBoisMort) {
      // On RETIRE du bois mort ce qu'on emporte : la souche et les racines,
      // elles, y étaient déjà et y restent.
      deadWoodKgC -= emporteKgC;
    } else {
      // Les souches et racines restent au sol dans les trois cas (bois mort).
      deadWoodKgC += treeTotalCarbonKg(espece, tree.diametreCm, tree.heightM) - aerienKgC;
    }
    /**
     * Le fût est couché EN TRAVERS de la pente. Pour le bois qu'on laisse sur
     * place c'est le geste de la restauration post-incendie, et le moteur
     * suppose que le bûcheron qui choisit de laisser le bois le pose
     * correctement — on ne simule pas la maladresse. Sur un terrain plat
     * l'orientation ne veut rien dire, et elle ne sert à rien non plus : sans
     * pente, pas d'eau qui court.
     *
     * On la calcule AVANT de savoir ce que devient le fût, parce que l'arbre
     * tombe dans tous les cas — même celui qu'on débarde a été mis au sol
     * avant d'être emporté, et le rendu doit pouvoir le montrer. Le moteur ne
     * modélise ni cloisonnement ni sens de débardage : il donne la seule
     * orientation qu'il sache justifier, la même dans les quatre devenirs.
     * `versLAval` ne lit que le relief et ne consomme pas d'aléa.
     */
    const { radians: aval } = versLAval(altitudes, dims, tree.x, tree.y);
    const directionRad = aval + Math.PI / 2;
    if (action.devenir === "laisser") {
      const empreinte = empreinteDeChute(tree.x, tree.y, tree.heightM, directionRad, dims);
      const longueur = empreinte.reduce((somme, c) => somme + c.longueurM, 0);
      if (longueur > 0) {
        for (const c of empreinte) {
          poserBoisAuSol(
            boisAuSolCG,
            boisEnTraversPart,
            altitudes,
            dims,
            c.cellule,
            emporteKgC * (c.longueurM / longueur) * 1000,
            directionRad,
            CONTACT_TRONC_EBRANCHE,
          );
        }
      } else {
        // Rien de la parcelle sous le tronc : son bois retourne au pool.
        deadWoodKgC += emporteKgC;
      }
    } else if (action.devenir === "vendre") {
      const vente = valeurSurPied(espece, tree);
      // Un bois accidenté, quelle que soit l'origine de l'accident : brûlé sur
      // pied, ou couché par la tempête (tempete.ts). Les deux se récupèrent en
      // coupe sanitaire, et les deux ont perdu leur bille — c'est exactement ce
      // que `DECOTE_CHABLIS` a toujours voulu dire, et que le moteur ne savait
      // appliquer qu'au feu faute de savoir produire un vrai chablis.
      const brule = tree.brulEeSemaine !== undefined || tree.renverseSemaine !== undefined;
      // Le marché n'est ni fixe ni infini (marche.ts). L'indice de l'année
      // porte le cycle des cours ; la décote d'engorgement punit celui qui met
      // tout son bois sur le marché la même année — c'est ce que la France a
      // vécu après Lothar et Klaus, des cours divisés par deux sous le poids
      // des chablis. Les deux ne jouent que si l'économie compte.
      const volumeVendu = volumeTigeM3(tree.diametreCm, tree.heightM);
      const marche = state.economy.active
        ? indiceDuMarche(state.graineMarche, Math.floor(state.week / 52)) *
          decoteEngorgement(volumeVenduAnneeM3)
        : 1;
      volumeVenduAnneeM3 += volumeVendu;
      if (dejaEnBoisMort) {
        // Une chandelle ne fait JAMAIS d'œuvre, même si elle a été élaguée de
        // son vivant : le bois est fendillé, l'aubier parti, les insectes
        // passés. Elle se vend au volume, au prix du chauffage, décotée — et
        // un fût noirci par le feu vaut encore moins qu'un fût gris.
        const decote = brule ? DECOTE_CHABLIS : DECOTE_CHANDELLE;
        treasuryEur += volumeVendu * WOOD_PRICE_EUR_M3 * decote * marche;
      } else {
        treasuryEur += vente.eur * (brule ? DECOTE_CHABLIS : 1) * marche;
      }
      if (vente.qualite === "oeuvre" && !brule && !dejaEnBoisMort) {
        // Le carbone se partage comme la CAISSE, et c'est nouveau : seule la
        // bille élaguée part en scierie et reste piégée dans le produit ; le
        // houppier part en bûches et brûle chez le client. Avant l'issue #72,
        // le prix comptait ce partage et le carbone non — un arbre classé
        // œuvre envoyait TOUT son carbone au stock de produits, houppier
        // compris, alors même que la vente le facturait en chauffage.
        const enScierie = emporteKgC * vente.partOeuvre;
        oeuvreCumKgC += enScierie;
        oeuvreStockKgC += enScierie;
        exportedEnergyCumKgC += emporteKgC - enScierie;
      } else {
        // Bois de chauffage : brûlé chez le client → émis immédiatement.
        exportedEnergyCumKgC += emporteKgC;
      }
    } else if (action.devenir === "broyer") {
      // Le broyat rejoint le tas : rien ne touche le sol pour l'instant.
      stockBrf = {
        carboneG:
          stockBrf.carboneG + treeAboveCarbonKg(espece, tree.diametreCm, tree.heightM) * 1000,
        azoteG:
          stockBrf.azoteG +
          0.5 * tree.uptakeYearG +
          treeNitrogenNeedGWeek(espece, tree.heightM) * 52,
      };
    } else {
      // Épandre : l'azote du feuillage de l'année + le houppier broyé (BRF)
      // retournent en litière sous l'ancienne couronne (docs/regles.md §4.2).
      // Pour un fixateur, c'est de l'azote NOUVEAU — la mécanique fondatrice
      // « couper les légumineuses et les épandre » (§16).
      const depositG = 0.5 * tree.uptakeYearG + treeNitrogenNeedGWeek(espece, tree.heightM) * 52;
      // On ÉPAND le broyat sur la zone (pas en tas au pied) : rayon large,
      // pour que les racines des voisins y accèdent.
      const crownR = Math.max(
        2.5,
        2 * crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm),
      );
      const cells: number[] = [];
      const x0 = Math.max(0, Math.floor(tree.x - crownR));
      const x1 = Math.min(dims.widthM - 1, Math.floor(tree.x + crownR));
      const y0 = Math.max(0, Math.floor(tree.y - crownR));
      const y1 = Math.min(dims.heightM - 1, Math.floor(tree.y + crownR));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - tree.x;
          const dy = y + 0.5 - tree.y;
          if (dx * dx + dy * dy <= crownR * crownR) cells.push(y * dims.widthM + x);
        }
      }
      if (cells.length === 0) cells.push(0);
      const share = depositG / cells.length;
      // Tout le carbone aérien broyé reste sur place, dans la litière.
      const shareC =
        (treeAboveCarbonKg(espece, tree.diametreCm, tree.heightM) * 1000) / cells.length;
      const kSpecies = 0.6 / BRF_CN_RATIO;
      for (const i of cells) {
        const oldN = litterNG[i] ?? 0;
        litterK[i] = (oldN * (litterK[i] ?? 0) + share * kSpecies) / (oldN + share);
        litterNG[i] = oldN + share;
        litterCG[i] = (litterCG[i] ?? 0) + shareC;
      }
    }
    coupes.push(id);
    retire.push({
      id,
      x: tree.x,
      y: tree.y,
      especeId: tree.especeId,
      diametreCm: tree.diametreCm,
      hauteurAvantM: tree.heightM,
      // Rien ne reste debout : c'est ce qui oblige à tout dire ici, l'arbre
      // n'est plus dans l'instantané où le rendu irait chercher le reste.
      hauteurApresM: 0,
      baseHouppierAvantM: tree.baseHouppierM ?? 0,
      baseHouppierApresM: 0,
      directionRad,
    });
    trees.splice(idx, 1); // l'arbre coupé quitte la carte (bois mort/carbone en V1)
  }

  return {
    state: {
      ...state,
      trees,
      soil: { ...state.soil, litterNG, litterCG, litterK, boisAuSolCG, boisEnTraversPart },
      stockBrf,
      carbon: {
        ...state.carbon,
        deadWoodKgC,
        exportedEnergyCumKgC,
        oeuvreCumKgC,
        oeuvreStockKgC,
      },
      economy: {
        ...state.economy,
        treasuryEur,
        hoursUsedWeek,
        hoursUsedYear,
        volumeVenduAnneeM3,
      },
    },
    refusals,
    // Les tiges RÉELLEMENT tombées, pas celles qu'on a demandées : le plafond
    // horaire arrête souvent le chantier en cours de route.
    gestes: coupes.length > 0 ? [{ type: "couper", ids: coupes, retire }] : [],
  };
}

/**
 * Épandre le tas de broyat sur une zone choisie : le geste qui déplace la
 * fertilité. On coupe les fixateurs là où ils poussent, et on porte leur azote
 * au pied de ce qu'on veut nourrir — au prix d'un temps de manutention, et
 * d'une faim d'azote passagère (nitrogen.ts) sous le tapis de plaquettes.
 */
function applyEpandreBrf(
  state: GameState,
  action: Extract<GameAction, { type: "epandreBrf" }>,
): ApplyResult {
  const part = Math.min(1, Math.max(0, action.part));
  const carboneG = state.stockBrf.carboneG * part;
  const azoteG = state.stockBrf.azoteG * part;
  if (carboneG <= 0) {
    return { state, refusals: [refuse(action.week, "epandreBrf", "le tas de broyat est vide")] };
  }
  const hours = (carboneG / 1000 / CARBON_FRACTION) * EPANDAGE_HEURES_PAR_KG;

  const cote = state.station.coteM;
  const dims = { widthM: cote, heightM: cote };
  const cells: number[] = [];
  pourChaqueCelluleDeLaZone(dims, action, (i) => cells.push(i));
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const litterK = state.soil.litterK.slice();
  const partN = azoteG / cells.length;
  const partC = carboneG / cells.length;
  const kBrf = 0.6 / BRF_CN_RATIO;
  for (const i of cells) {
    const oldN = litterNG[i] ?? 0;
    litterK[i] = (oldN * (litterK[i] ?? 0) + partN * kBrf) / (oldN + partN);
    litterNG[i] = oldN + partN;
    litterCG[i] = (litterCG[i] ?? 0) + partC;
  }

  return {
    state: {
      ...state,
      soil: { ...state.soil, litterNG, litterCG, litterK },
      stockBrf: {
        carboneG: state.stockBrf.carboneG - carboneG,
        azoteG: state.stockBrf.azoteG - azoteG,
      },
      economy: {
        ...state.economy,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
    gestes: cells.length > 0 ? [{ type: "epandreBrf", cellules: cells }] : [],
  };
}

function applyRecolter(
  state: GameState,
  action: Extract<GameAction, { type: "recolter" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  /** Les arbres réellement cueillis, et ce qu'on leur a pris (#100). */
  const cueillis: number[] = [];
  const masses: number[] = [];

  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "recolter", `arbre ${id} introuvable ou mort`));
      continue;
    }
    if (tree.fruitsKg <= 0) {
      refusals.push(refuse(action.week, "recolter", `arbre ${id} : rien à récolter`));
      continue;
    }
    const espece = getEspece(tree.especeId);
    const prix = espece.fruits?.prixEurKg ?? 0;
    // Cadence de cueillette propre à l'espèce (ramasser 19 kg de noisettes
    // n'a rien à voir avec cueillir 19 kg de pommes).
    const hours = tree.fruitsKg * (espece.fruits?.recolteHKg ?? 0.03);
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    treasuryEur += tree.fruitsKg * prix;
    cueillis.push(id);
    masses.push(tree.fruitsKg);
    trees[idx] = { ...tree, fruitsKg: 0 };
  }
  return {
    state: {
      ...state,
      trees,
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
    gestes: cueillis.length > 0 ? [{ type: "recolter", ids: cueillis, masseKg: masses }] : [],
  };
}

function applyChauler(
  state: GameState,
  action: Extract<GameAction, { type: "chauler" }>,
): ApplyResult {
  const areaM2 = aireM2DeLaZone(action);
  const part = partMecanisable(state.trees, action);
  const cost = areaM2 * (LIME_EUR_M2 + part * COUT_ENGIN_EUR_M2);
  const hours = areaM2 * (part * LIME_HOURS_M2_ENGIN + (1 - part) * LIME_HOURS_M2_MAIN);
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "chauler", "découvert plafonné")] };
  }
  // Le chaulage n'écrit plus le pH : il apporte des BASES, et le pH suit au
  // tick suivant (bases.ts). Ce n'est pas un détour — c'est ce qui fait qu'un
  // podzol sableux, dont le complexe est petit, monte beaucoup pour la même
  // chaux et le reperd vite, là où un limon argileux encaisse et retient.
  const basesEq = state.soil.basesEq.slice();
  const ph = state.soil.ph.slice();
  const cecEq = state.station.profil[0] ? capaciteEchangeEqM2(state.station.profil[0]) : 0;
  const cote = state.station.coteM;
  const chaulees: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      if (zoneContient(action, x + 0.5, y + 0.5)) {
        const i = y * cote + x;
        chaulees.push(i);
        basesEq[i] = Math.min(cecEq, (basesEq[i] ?? 0) + CHAULAGE_EQ_M2);
        // Le pH affiché suit tout de suite : un joueur qui chaule doit voir le
        // calque bouger dans la semaine, pas la semaine d'après.
        ph[i] = cecEq > 0 ? phDepuisSaturation((basesEq[i] ?? 0) / cecEq) : (ph[i] ?? 7);
      }
    }
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, basesEq, ph },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - cost,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
    gestes: chaulees.length > 0 ? [{ type: "chauler", cellules: chaulees }] : [],
  };
}

/**
 * Fenêtre de semis, en semaines de part et d'autre de la date de la fiche. Un
 * blé d'hiver se sème en octobre ; on laisse la latitude d'une arrière-saison
 * pluvieuse, pas celle de le semer au printemps *(à calibrer)*.
 */
export const FENETRE_SEMIS_SEMAINES = 4;

/**
 * Place libre moyenne en dessous de laquelle le semis est refusé. Un dixième :
 * il ne s'agit pas d'exiger un sol nu — une friche rase se sème — mais de ne
 * pas laisser passer un semis qui ne lèverait sur rien *(à calibrer)*.
 */
export const PLACE_MINIMALE_SEMIS = 0.1;

/** Écart en semaines entre deux dates de l'année, en passant par le plus court. */
function ecartSemaines(a: number, b: number): number {
  const d = Math.abs(a - b) % 52;
  return Math.min(d, 52 - d);
}

function applyFertiliser(
  state: GameState,
  action: Extract<GameAction, { type: "fertiliser" }>,
): ApplyResult {
  const dose = action.doseKgNHa;
  if (!(dose > 0)) {
    return { state, refusals: [refuse(action.week, "fertiliser", "dose nulle")] };
  }
  if (dose > DOSE_AZOTE_MAX_KG_HA) {
    return {
      state,
      refusals: [
        refuse(
          action.week,
          "fertiliser",
          `dose au-delà de ${DOSE_AZOTE_MAX_KG_HA} kg N/ha : ce n'est plus fertiliser`,
        ),
      ],
    };
  }
  const cote = state.station.coteM;
  const dims = { widthM: cote, heightM: cote };
  const cells: number[] = [];
  pourChaqueCelluleDeLaZone(dims, action, (i) => cells.push(i));
  if (cells.length === 0) {
    return { state, refusals: [refuse(action.week, "fertiliser", "zone hors parcelle")] };
  }
  // Une cellule fait un mètre carré, et la dose est à l'hectare.
  const azoteParCelluleG = dose * KG_PER_HA_TO_G_PER_M2;
  const areaHa = cells.length / 10_000;
  const mineral = action.forme === "mineral";
  const cost = dose * areaHa * (mineral ? AZOTE_MINERAL_EUR_KG : FUMIER_EUR_KG_N);
  const hours = areaHa * (mineral ? FERTILISATION_HEURES_HA : FUMIER_HEURES_HA);
  // Les heures n'arrêtent rien (#133) : elles montent, et `depassementHoraire`
  // les facture en fin de semaine. Ces trois gestes de culture — semer,
  // fertiliser, moissonner — ont été écrits pendant que la règle changeait sur
  // `main` ; ils suivent la nouvelle, comme les quinze autres.
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "fertiliser", "découvert plafonné")] };
  }

  const soil = { ...state.soil };
  if (mineral) {
    // **L'AZOTE MINÉRAL ARRIVE DISPONIBLE, ET DONC LESSIVABLE.** Il entre dans
    // le pool que les plantes prélèvent et que le drainage emporte : un apport
    // posé avant l'hiver part avec l'eau, et le moteur n'a rien eu à apprendre
    // pour ça (`nitrogen.ts:cellLeachedG`). C'est là tout le contraste avec le
    // fumier, et c'est le contenu du geste.
    const mineralNG = state.soil.mineralNG.slice();
    for (const i of cells) mineralNG[i] = (mineralNG[i] ?? 0) + azoteParCelluleG;
    soil.mineralNG = mineralNG;
  } else {
    // Le fumier entre dans la LITIÈRE avec son C/N : il se minéralise sur des
    // années, il ne lessive pas tant qu'il ne l'est pas, et il construit de
    // l'humus au passage. Même patron que `epandreBrf`, avec le C/N d'un
    // fumier au lieu de celui du bois — et la vitesse de décomposition suit,
    // parce que `litterK` est une moyenne pondérée par l'azote.
    const litterNG = state.soil.litterNG.slice();
    const litterCG = state.soil.litterCG.slice();
    const litterK = state.soil.litterK.slice();
    const kFumier = litterDecayRate(FUMIER_CN_RATIO);
    for (const i of cells) {
      const oldN = litterNG[i] ?? 0;
      litterK[i] =
        (oldN * (litterK[i] ?? 0) + azoteParCelluleG * kFumier) / (oldN + azoteParCelluleG);
      litterNG[i] = oldN + azoteParCelluleG;
      litterCG[i] = (litterCG[i] ?? 0) + azoteParCelluleG * FUMIER_CN_RATIO;
    }
    soil.litterNG = litterNG;
    soil.litterCG = litterCG;
    soil.litterK = litterK;
  }

  return {
    state: {
      ...state,
      soil,
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - cost,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
  };
}

function applySemer(state: GameState, action: Extract<GameAction, { type: "semer" }>): ApplyResult {
  const s = HERBACEES.findIndex((h) => h.id === action.cultureId);
  const fiche = HERBACEES[s];
  const culture = fiche?.culture;
  if (!fiche || !culture) {
    return {
      state,
      refusals: [refuse(action.week, "semer", `${action.cultureId} n'est pas une culture`)],
    };
  }
  const semaine = action.week % 52;
  if (ecartSemaines(semaine, culture.semisWeek) > FENETRE_SEMIS_SEMAINES) {
    return {
      state,
      refusals: [
        refuse(
          action.week,
          "semer",
          `hors fenêtre de semis (semaine ${culture.semisWeek} ± ${FENETRE_SEMIS_SEMAINES})`,
        ),
      ],
    };
  }
  const areaM2 = aireM2DeLaZone(action);
  const areaHa = areaM2 / 10_000;
  // Le semis est un chantier d'engin : ce qui n'est pas mécanisable ne se sème
  // pas au combiné, et le moteur sait déjà dire quelle part l'est.
  const part = partMecanisable(state.trees, action);
  const hours = areaHa * culture.heuresSemisHa * (part + (1 - part) * 20);
  const cost = areaHa * culture.semenceEurHa + areaM2 * part * COUT_ENGIN_EUR_M2;
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "semer", "découvert plafonné")] };
  }
  const herbeEmprise = state.soil.herbeEmprise.slice();
  const cultureGrain = state.soil.cultureGrain.slice();
  const cultureGrainPotentiel = state.soil.cultureGrainPotentiel.slice();
  const cellules = cellulesDeLaZone(state.station.coteM, action);
  // **CE QUE LE SEMIS POSE, C'EST LA PLACE LIBRE.** Un blé semé dans une
  // friche n'occupe que ce que les adventices lui laissent, et la règle
  // « préparer le lit de semence avant de semer » n'est écrite nulle part :
  // elle tombe du partage de la place (`herbacees.ts`) et du fait que
  // `labourer` remet les emprises à zéro. Deux mécanismes qui existaient déjà.
  let placeTotale = 0;
  for (const i of cellules) {
    const base = i * N_HERBACEES;
    let occupee = 0;
    for (let k = 0; k < N_HERBACEES; k++) {
      if (k !== s) occupee += herbeEmprise[base + k] ?? 0;
    }
    placeTotale += Math.max(0, 1 - occupee);
  }
  // Et semer dans un tapis fermé ne doit pas RÉUSSIR EN SILENCE. Mesuré avant
  // cette garde : le semis passait, l'emprise valait zéro, et la moisson
  // annonçait « rien à moissonner » neuf mois plus tard sans que rien n'ait
  // dit pourquoi. Le joueur doit l'apprendre au semis, pas à la récolte.
  if (cellules.length > 0 && placeTotale / cellules.length < PLACE_MINIMALE_SEMIS) {
    return {
      state,
      refusals: [
        refuse(
          action.week,
          "semer",
          "le tapis occupe déjà le sol : labourer ou faucher avant de semer",
        ),
      ],
    };
  }
  for (const i of cellules) {
    const base = i * N_HERBACEES;
    let occupee = 0;
    for (let k = 0; k < N_HERBACEES; k++) {
      if (k !== s) occupee += herbeEmprise[base + k] ?? 0;
    }
    herbeEmprise[base + s] = Math.max(0, 1 - occupee);
    cultureGrain[base + s] = 0;
    cultureGrainPotentiel[base + s] = 0;
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, herbeEmprise, cultureGrain, cultureGrainPotentiel },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - cost,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
  };
}

function applyMoissonner(
  state: GameState,
  action: Extract<GameAction, { type: "moissonner" }>,
): ApplyResult {
  const areaM2 = aireM2DeLaZone(action);
  const areaHa = areaM2 / 10_000;
  const part = partMecanisable(state.trees, action);
  const cellules = cellulesDeLaZone(state.station.coteM, action);
  const herbeEmprise = state.soil.herbeEmprise.slice();
  const herbeFeuillage = state.soil.herbeFeuillage.slice();
  const cultureGrain = state.soil.cultureGrain.slice();
  const cultureGrainPotentiel = state.soil.cultureGrainPotentiel.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const litterK = state.soil.litterK.slice();
  // La paille que la moisson laisse au champ, kg C : elle est rendue au sol ET
  // la plante l'avait fixée, donc elle entre au bilan par la production
  // primaire — sans quoi on la ferait apparaître de nulle part (#201).
  let pailleKgC = 0;
  // Ce qu'on récolte, culture par culture, en part de rendement maximal cumulée
  // sur les cellules. Diviser par le nombre de cellules donnerait la moyenne ;
  // on veut la SOMME, parce que c'est elle qui devient des tonnes.
  let recolteEur = 0;
  let cellulesRecoltees = 0;
  const m2ParCellule = 1;
  for (const s of INDEX_CULTURES) {
    const culture = HERBACEES[s]?.culture;
    if (!culture) continue;
    for (const i of cellules) {
      const base = i * N_HERBACEES;
      const grain = partDuRendement(
        cultureGrain[base + s] ?? 0,
        cultureGrainPotentiel[base + s] ?? 0,
      );
      if ((herbeEmprise[base + s] ?? 0) <= 0 && grain <= 0) continue;
      const tonnes = (grain * culture.rendementMaxTHa * m2ParCellule) / 10_000;
      recolteEur += tonnes * culture.prixEurT;
      cultureGrain[base + s] = 0;
      cultureGrainPotentiel[base + s] = 0;
      // ── LA PAILLE RESTE AU CHAMP (issue #201) ───────────────────────────
      //
      // Ce bloc mettait le feuillage à zéro et c'était tout : le grain était
      // vendu et **le reste s'évaporait**. Or ce qui est debout à la moisson
      // et qui n'est pas du grain, c'est la paille et le chaume — ils restent,
      // et ils rendent leur carbone et leur azote au sol.
      //
      // **Et c'est le trait le plus conséquent de la fiche** : le C/N d'une
      // paille de blé est de 90. Elle IMMOBILISE l'azote du sol le temps que
      // les micro-organismes la digèrent, et ne le rend qu'ensuite. Enfouir
      // une paille sans apport fait donc baisser la culture suivante avant de
      // la faire monter, ce qu'aucun coefficient n'aurait produit.
      //
      // *Ce qu'on ne fait pas* : la presser. Une botte de paille qui part est
      // un geste de gestion, avec son prix et ses heures — il lui faudra son
      // action. Par défaut elle reste, ce qui est la conduite la plus
      // répandue.
      const fiche = HERBACEES[s];
      const debout = herbeFeuillage[base + s] ?? 0;
      if (fiche && debout > 0) {
        const { c, n } = litiereRendue(debout, fiche.litiere.cSurN);
        pailleKgC += c / 1000;
        const oldN = litterNG[i] ?? 0;
        litterK[i] =
          (oldN * (litterK[i] ?? 0) + n * litterDecayRate(fiche.litiere.cSurN)) / (oldN + n);
        litterNG[i] = oldN + n;
        litterCG[i] = (litterCG[i] ?? 0) + c;
      }
      // La culture libère la place : le chaume n'occupe plus rien, et les
      // adventices reprendront la main dès la semaine suivante.
      herbeEmprise[base + s] = 0;
      herbeFeuillage[base + s] = 0;
      cellulesRecoltees++;
    }
  }
  if (cellulesRecoltees === 0) {
    return { state, refusals: [refuse(action.week, "moissonner", "rien à moissonner ici")] };
  }
  const heuresHa = HERBACEES[INDEX_CULTURES[0] ?? 0]?.culture?.heuresRecolteHa ?? 1;
  const hours = areaHa * heuresHa * (part + (1 - part) * 20);
  const herbeCouverture = state.soil.herbeCouverture.slice();
  for (const i of cellules) {
    let couverture = 0;
    for (let k = 0; k < N_HERBACEES; k++) couverture += herbeFeuillage[i * N_HERBACEES + k] ?? 0;
    herbeCouverture[i] = couverture;
  }
  return {
    state: {
      ...state,
      soil: {
        ...state.soil,
        herbeEmprise,
        herbeFeuillage,
        herbeCouverture,
        cultureGrain,
        cultureGrainPotentiel,
        litterNG,
        litterCG,
        litterK,
      },
      carbon: {
        ...state.carbon,
        nppCumKgC: state.carbon.nppCumKgC + pailleKgC,
      },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur + recolteEur - areaM2 * part * COUT_ENGIN_EUR_M2,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
  };
}

function applyFaucher(
  state: GameState,
  action: Extract<GameAction, { type: "faucher" }>,
): ApplyResult {
  const areaM2 = aireM2DeLaZone(action);
  // Ce que l'engin peut atteindre dépend de la façon dont c'est planté : le
  // reste se fait à la débroussailleuse, vingt fois plus lentement.
  const part = partMecanisable(state.trees, action);
  const hours = areaM2 * (part * FAUCHE_HOURS_M2_ENGIN + (1 - part) * FAUCHE_HOURS_M2_MAIN);
  const coutEngin = areaM2 * part * COUT_ENGIN_EUR_M2;
  const herbeCouverture = state.soil.herbeCouverture.slice();
  const herbeFeuillage = state.soil.herbeFeuillage.slice();
  const herbeBiomasse = state.soil.herbeBiomasse.slice();
  // Le feuillage AVANT la coupe : c'est lui qui dit quelle espèce était là, et
  // donc quel C/N porte ce qu'on laisse au sol. `rabattreParEspece` l'écrase
  // quelques lignes plus bas.
  const herbeFeuillageAvant = state.soil.herbeFeuillage.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const litterK = state.soil.litterK.slice();
  // Ce que la fauche laisse au sol, kg C. **La strate n'était pas au bilan
  // carbone du tout**, si bien que ce geste — le seul qui l'alimentait — en
  // créait en silence : la propriété de conservation ne passe pas par
  // `faucher`. C'est la plante qui l'a fixé, il entre par la production
  // primaire (#201).
  let fauchageKgC = 0;
  const cote = state.station.coteM;
  // Les cellules où l'outil a effectivement mordu : une pelouse déjà rase ne
  // se fauche pas, et le rendu n'a rien à y montrer.
  const fauchees: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      if (!zoneContient(action, x + 0.5, y + 0.5)) continue;
      const i = y * cote + x;
      const avant = herbeCouverture[i] ?? 0;
      if (avant <= FAUCHE_COUVERTURE_RESIDUELLE) continue;
      fauchees.push(i);
      const coupe = avant - FAUCHE_COUVERTURE_RESIDUELLE;
      herbeCouverture[i] = FAUCHE_COUVERTURE_RESIDUELLE;
      herbeBiomasse[i] = FAUCHE_COUVERTURE_RESIDUELLE;
      // La coupe se répartit sur les feuillages, dans la même proportion. Une
      // espèce déjà rentrée sous terre n'a rien à perdre : c'est ce qui laisse
      // une prairie de fauche garder sa flore de printemps (herbacees.ts).
      rabattreParEspece(herbeFeuillage, i * N_HERBACEES, FAUCHE_COUVERTURE_RESIDUELLE / avant);
      // ── L'herbe coupée reste sur place ──────────────────────────────────
      //
      // **Ces deux lignes portaient `coupe * 4` et `* 25`, sans nom ni
      // source** — les seuls nombres du moteur qui transformaient de l'herbe
      // en carbone, et ils étaient nus. Ils sont devenus
      // `CARBONE_COUVERT_FERME_G_M2` et le C/N de la fiche (#201), à la valeur
      // près : un couvert fermé de dactyle rend toujours 100 g de C et 4 g
      // d'azote au mètre carré, et ce geste n'a pas bougé d'un gramme. Ce qui
      // change est que le reste du moteur peut maintenant s'en servir.
      //
      // La coupe est répartie sur les espèces au prorata de ce qu'elles
      // couvraient, parce que c'est leur C/N qui décide de la suite : une
      // prairie de dactyle et une lande à molinie ne rendent pas la même
      // litière, et l'ancienne ligne les confondait sous un 25 unique.
      for (let k = 0; k < N_HERBACEES; k++) {
        const fiche = HERBACEES[k];
        const partEspece = herbeFeuillageAvant[i * N_HERBACEES + k] ?? 0;
        if (!fiche || partEspece <= 0 || avant <= 0) continue;
        const { c, n } = litiereRendue((coupe * partEspece) / avant, fiche.litiere.cSurN);
        fauchageKgC += c / 1000;
        const oldN = litterNG[i] ?? 0;
        litterK[i] =
          (oldN * (litterK[i] ?? 0) + n * litterDecayRate(fiche.litiere.cSurN)) / (oldN + n);
        litterNG[i] = oldN + n;
        litterCG[i] = (litterCG[i] ?? 0) + c;
      }
    }
  }
  return {
    state: {
      ...state,
      soil: {
        ...state.soil,
        herbeCouverture,
        herbeFeuillage,
        herbeBiomasse,
        litterNG,
        litterCG,
        litterK,
      },
      carbon: { ...state.carbon, nppCumKgC: state.carbon.nppCumKgC + fauchageKgC },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - coutEngin,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
    gestes: fauchees.length > 0 ? [{ type: "faucher", cellules: fauchees }] : [],
  };
}

/**
 * Ramasser le bois mort couché d'une zone. Le joueur y gagne du chauffage et
 * un peu moins de gros combustible ; il y perd de l'humus en devenir, un abri
 * pour la faune du sol et la protection que le tronc offrait à la terre sous
 * lui. Rien ici ne tranche à sa place.
 */
function applyRamasserBoisMort(
  state: GameState,
  action: Extract<GameAction, { type: "ramasserBoisMort" }>,
): ApplyResult {
  const cote = state.station.coteM;
  const boisAuSolCG = state.soil.boisAuSolCG.slice();
  const boisEnTraversPart = state.soil.boisEnTraversPart.slice();
  const cibles: number[] = [];
  let carboneKgC = 0;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      if (!zoneContient(action, x + 0.5, y + 0.5)) continue;
      const i = y * cote + x;
      const stock = boisAuSolCG[i] ?? 0;
      if (stock <= 0) continue;
      cibles.push(i);
      carboneKgC += stock / 1000;
    }
  }
  if (carboneKgC <= 0) {
    return {
      state,
      refusals: [refuse(action.week, "ramasserBoisMort", "pas de bois mort au sol ici")],
    };
  }
  const volumeM3 = carboneKgC / CARBON_FRACTION / DENSITE_BOIS_MORT_KG_M3;
  const hours = volumeM3 * RAMASSAGE_HOURS_M3;
  // Le tronc parti, il ne barre plus rien : la part en travers s'en va avec
  // lui. C'est le vrai prix caché du ramassage sur un versant.
  for (const i of cibles) {
    boisAuSolCG[i] = 0;
    boisEnTraversPart[i] = 0;
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, boisAuSolCG, boisEnTraversPart },
      // Il partira en fumée chez celui qui l'achète : c'est un export émetteur,
      // pas un stockage (§12).
      carbon: {
        ...state.carbon,
        exportedEnergyCumKgC: state.carbon.exportedEnergyCumKgC + carboneKgC,
      },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur + volumeM3 * WOOD_PRICE_EUR_M3 * DECOTE_BOIS_MORT,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
    // Sans ça, un tronc couché disparaît du sol d'une image à l'autre —
    // indiscernable de sa décomposition, qui est bien plus lente.
    gestes: [{ type: "ramasserBoisMort", cellules: cibles }],
  };
}

function applyElaguer(
  state: GameState,
  action: Extract<GameAction, { type: "elaguer" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  const elagues: number[] = [];
  const retire: ArbreRetire[] = [];
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "elaguer", `arbre ${id} introuvable`));
      continue;
    }
    // On n'élague que jusqu'à la moitié de la hauteur : au-delà, on ampute
    // la couronne et on prive l'arbre de sa croissance.
    const cible = Math.min(action.hauteurM, ELAGAGE_MAX_M, tree.heightM / 2);
    if (cible <= tree.hauteurElagueeM + 0.1) {
      refusals.push(
        refuse(action.week, "elaguer", `arbre ${id} : trop petit pour monter la bille plus haut`),
      );
      continue;
    }
    const hours = (cible - tree.hauteurElagueeM) * ELAGAGE_HOURS_PAR_M;
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    elagues.push(id);
    retire.push({
      id,
      x: tree.x,
      y: tree.y,
      especeId: tree.especeId,
      // La tige ne raccourcit pas d'un élagage : ce qui part, c'est la
      // hauteur de branches entre l'ancienne base de houppier et la nouvelle.
      diametreCm: tree.diametreCm,
      hauteurAvantM: tree.heightM,
      hauteurApresM: tree.heightM,
      baseHouppierAvantM: tree.baseHouppierM ?? 0,
      // `hauteurElagueeM` est un plancher pour la base du houppier : le
      // cliquet du tick la fera monter là (tick.ts), on l'annonce tout de
      // suite pour que le rendu n'attende pas une semaine.
      baseHouppierApresM: Math.max(tree.baseHouppierM ?? 0, cible),
    });
    trees[idx] = { ...tree, hauteurElagueeM: cible };
  }
  return {
    state: { ...state, trees, economy: { ...state.economy, hoursUsedWeek, hoursUsedYear } },
    refusals,
    gestes: elagues.length > 0 ? [{ type: "elaguer", ids: elagues, retire }] : [],
  };
}

/**
 * Chasser. Le prélèvement fait reculer la pression… quelques mois. Sur un
 * hectare pris dans un paysage qui en porte cinquante, le vide se comble par
 * immigration : c'est pour cette raison que la régulation du gibier se décide
 * à l'échelle d'un massif et pas d'une parcelle.
 */
/**
 * Étêter. Ce n'est ni un recépage (on garde le tronc) ni un élagage (on coupe
 * la charpente) : c'est une troisième chose, qui produit du bois et du
 * fourrage tous les dix ans sans jamais tuer l'arbre, et qui le fait vivre
 * bien plus longtemps qu'un arbre de plein vent.
 */
function applyTrogner(
  state: GameState,
  action: Extract<GameAction, { type: "trogner" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  let { exportedEnergyCumKgC, deadWoodKgC } = state.carbon;
  const etetes: number[] = [];
  const retire: ArbreRetire[] = [];
  const hauteurTete = Math.max(1, action.hauteurTeteM);
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "trogner", `arbre ${id} introuvable`));
      continue;
    }
    const espece = getEspece(tree.especeId);
    if (!espece.bois.rejetteDeSouche) {
      refusals.push(
        refuse(action.week, "trogner", `${espece.nom} ne rejette pas : la tête ne repartirait pas`),
      );
      continue;
    }
    // On ne trogne pas un arbre qui n'a pas encore dépassé la tête.
    if (tree.heightM < hauteurTete + 1) {
      refusals.push(
        refuse(action.week, "trogner", `arbre ${id} : trop court pour une tête à ${hauteurTete} m`),
      );
      continue;
    }
    hoursUsedWeek += TROGNE_HEURES;
    hoursUsedYear += TROGNE_HEURES;
    etetes.push(id);
    retire.push({
      id,
      x: tree.x,
      y: tree.y,
      especeId: tree.especeId,
      diametreCm: tree.diametreCm,
      hauteurAvantM: tree.heightM,
      // La tête reste debout, c'est toute la différence avec une coupe.
      hauteurApresM: hauteurTete,
      baseHouppierAvantM: tree.baseHouppierM ?? 0,
      baseHouppierApresM: Math.min(tree.baseHouppierM ?? 0, hauteurTete),
    });
    // Ce qu'on emporte : tout ce qui dépassait la tête, en bois de chauffage.
    const emporte =
      treeAboveCarbonKg(espece, tree.diametreCm, tree.heightM) -
      treeAboveCarbonKg(espece, tree.diametreCm, hauteurTete);
    treasuryEur +=
      (volumeTigeM3(tree.diametreCm, tree.heightM) - volumeTigeM3(tree.diametreCm, hauteurTete)) *
      WOOD_PRICE_EUR_M3;
    exportedEnergyCumKgC += Math.max(0, emporte);
    // Même chose qu'au recépage : ce que la tête perd en racines reste au sol.
    deadWoodKgC += racinesPerduesEnRabattant(espece, tree.diametreCm, tree.heightM, hauteurTete);
    trees[idx] = {
      ...tree,
      heightM: hauteurTete,
      teteTrogneM: hauteurTete,
      recepages: tree.recepages + 1,
      hauteurElagueeM: Math.min(tree.hauteurElagueeM, hauteurTete),
      // La tête est rabattue : ce qui repartira part d'elle, et une base de
      // houppier héritée d'un arbre plus haut n'aurait plus de support.
      baseHouppierM: Math.min(tree.baseHouppierM ?? 0, hauteurTete),
      pousseTendreM: 0,
      fruitsKg: 0,
      fruitProgress: 0,
    };
  }
  return {
    state: {
      ...state,
      trees,
      carbon: { ...state.carbon, exportedEnergyCumKgC, deadWoodKgC },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
    gestes: etetes.length > 0 ? [{ type: "trogner", ids: etetes, retire }] : [],
  };
}

// Plus rien à lire dans l'action : la chasse ne porte ni cible ni quantité, et
// depuis #133 la semaine ne la refuse plus. Le paramètre a donc disparu.
function applyChasser(state: GameState): ApplyResult {
  return {
    state: {
      ...state,
      pressionGibier: Math.max(0, state.pressionGibier - EFFET_CHASSE),
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur + CHASSE_RECETTE_EUR,
        hoursUsedWeek: state.economy.hoursUsedWeek + CHASSE_HEURES,
        hoursUsedYear: state.economy.hoursUsedYear + CHASSE_HEURES,
      },
    },
    refusals: [],
  };
}

/**
 * Clôturer. Le coût suit le PÉRIMÈTRE, pas la surface ni le nombre de plants :
 * c'est toute la différence avec les manchons. Clôturer un are est ruineux,
 * clôturer un hectare est la solution la moins chère dès qu'on y plante dense.
 */
function applyCloturer(
  state: GameState,
  action: Extract<GameAction, { type: "cloturer" }>,
): ApplyResult {
  const perimetreM = perimetreMDeLaZone(action);
  const cost = perimetreM * CLOTURE_EUR_M;
  const hours = perimetreM * CLOTURE_HEURES_M;
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "cloturer", "découvert plafonné")] };
  }
  const cloture = state.soil.cloture.slice();
  const dims = { widthM: state.station.coteM, heightM: state.station.coteM };
  const closes: number[] = [];
  pourChaqueCelluleDeLaZone(dims, action, (i) => {
    closes.push(i);
    cloture[i] = true;
  });
  return {
    state: {
      ...state,
      soil: { ...state.soil, cloture },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - cost,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
    gestes: closes.length > 0 ? [{ type: "cloturer", cellules: closes }] : [],
  };
}

function applyLabourer(
  state: GameState,
  action: Extract<GameAction, { type: "labourer" }>,
): ApplyResult {
  // On ne laboure que là où l'engin passe : entre des arbres serrés, la
  // question ne se pose même pas.
  const part = partMecanisable(state.trees, action);
  if (part < 0.5) {
    return {
      state,
      refusals: [refuse(action.week, "labourer", "l'engin ne peut pas manœuvrer ici")],
    };
  }
  const areaM2 = aireM2DeLaZone(action) * part;
  const hours = areaM2 * LABOUR_HOURS_M2;
  const cost = areaM2 * LABOUR_EUR_M2;
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "labourer", "découvert plafonné")] };
  }

  const humusCG = state.soil.humusCG.slice();
  const mineralNG = state.soil.mineralNG.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const herbeCouverture = state.soil.herbeCouverture.slice();
  const herbeEmprise = state.soil.herbeEmprise.slice();
  const herbeFeuillage = state.soil.herbeFeuillage.slice();
  const herbeBiomasse = state.soil.herbeBiomasse.slice();
  const mycorhizes = {
    ecto: state.soil.mycorhizes.ecto.slice(),
    arbusculaire: state.soil.mycorhizes.arbusculaire.slice(),
    ericoide: state.soil.mycorhizes.ericoide.slice(),
  };
  const cote = state.station.coteM;
  const labourees: number[] = [];
  // L'engin tasse là où il PASSE, et seulement là. `part` dit quelle fraction
  // de la zone lui est accessible selon la façon dont c'est planté
  // (mecanisation.ts) : une parcelle plantée serré ne se tasse pas, parce que
  // le tracteur n'y entre pas. La densité d'arbres protège donc la structure —
  // un bénéfice de l'agroforesterie que personne n'a écrit dans une règle
  // (tassement.ts).
  const tassement = state.soil.tassement.slice();
  let emisKgC = 0;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      if (!zoneContient(action, x + 0.5, y + 0.5)) continue;
      const i = y * cote + x;
      labourees.push(i);
      tassement[i] = tassementApresLabour(tassement[i] ?? 0, part);
      // Le coup de fouet : de l'humus part en fumée, son azote reste.
      const perdu = (humusCG[i] ?? 0) * LABOUR_PERTE_HUMUS;
      humusCG[i] = (humusCG[i] ?? 0) - perdu;
      mineralNG[i] = (mineralNG[i] ?? 0) + perdu / CN_HUMUS;
      emisKgC += (perdu * (1 - 1 / CN_HUMUS)) / 1000;
      // La litière est enfouie et se minéralise avec le reste.
      mineralNG[i] = (mineralNG[i] ?? 0) + (litterNG[i] ?? 0);
      emisKgC += (litterCG[i] ?? 0) / 1000;
      litterNG[i] = 0;
      litterCG[i] = 0;
      // Sol nu : c'est tout l'objet du labour, et c'est aussi son prix. La
      // charrue est le seul geste du jeu qui aille sous terre : elle retourne
      // les bulbes et tranche les rhizomes, donc l'emprise part avec le
      // feuillage et la strate se reconstitue à sa vitesse d'installation.
      herbeCouverture[i] = 0;
      herbeBiomasse[i] = 0;
      rabattreParEspece(herbeFeuillage, i * N_HERBACEES, 0);
      rabattreParEspece(herbeEmprise, i * N_HERBACEES, 0);
      // Et le prix qu'on ne voit pas sur la facture : les hyphes sont
      // tranchées. Le réseau mettra des années à se retisser (§7.5).
      for (const type of TYPES_MYCORHIZE) {
        const reseau = mycorhizes[type];
        reseau[i] = (reseau[i] ?? 0) * SURVIE_APRES_LABOUR;
      }
    }
  }
  // Tout ce qui n'a pas encore de tronc y passe.
  const trees = state.trees.map((t) => {
    if (!t.alive || t.heightM > LABOUR_HAUTEUR_DETRUITE_M) return t;
    if (!zoneContient(action, t.x, t.y)) return t;
    return { ...t, alive: false, causeMort: "labour" as const };
  });

  return {
    state: {
      ...state,
      trees,
      soil: {
        ...state.soil,
        humusCG,
        mineralNG,
        litterNG,
        litterCG,
        herbeCouverture,
        herbeEmprise,
        herbeFeuillage,
        herbeBiomasse,
        mycorhizes,
        tassement,
      },
      carbon: {
        ...state.carbon,
        emittedCumKgC: state.carbon.emittedCumKgC + emisKgC,
      },
      economy: {
        ...state.economy,
        treasuryEur: state.economy.treasuryEur - cost,
        hoursUsedWeek: state.economy.hoursUsedWeek + hours,
        hoursUsedYear: state.economy.hoursUsedYear + hours,
      },
    },
    refusals: [],
    gestes: labourees.length > 0 ? [{ type: "labourer", cellules: labourees }] : [],
  };
}

function applyProteger(
  state: GameState,
  action: Extract<GameAction, { type: "proteger" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "proteger", `arbre ${id} introuvable`));
      continue;
    }
    if (tree.protege) {
      refusals.push(refuse(action.week, "proteger", `arbre ${id} : déjà protégé`));
      continue;
    }
    if (tree.heightM > HAUTEUR_BROUTAGE_M) {
      // Il est sorti tout seul : dépenser pour lui serait de l'argent perdu.
      refusals.push(
        refuse(action.week, "proteger", `arbre ${id} : hors d'atteinte, protection inutile`),
      );
      continue;
    }
    hoursUsedWeek += PROTECTION_HEURES;
    hoursUsedYear += PROTECTION_HEURES;
    treasuryEur -= PROTECTION_EUR;
    trees[idx] = { ...tree, protege: true };
  }
  return {
    state: {
      ...state,
      trees,
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
  };
}

function applyReceper(
  state: GameState,
  action: Extract<GameAction, { type: "receper" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  let { exportedEnergyCumKgC, deadWoodKgC } = state.carbon;
  const recepes: number[] = [];
  const retire: ArbreRetire[] = [];
  const dims = { widthM: state.station.coteM, heightM: state.station.coteM };
  const altitudes = altitudeParCellule(state.station.relief, dims);
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "receper", `arbre ${id} introuvable`));
      continue;
    }
    const espece = getEspece(tree.especeId);
    if (!espece.bois.rejetteDeSouche) {
      refusals.push(
        refuse(action.week, "receper", `${espece.nom} ne rejette pas de souche : il en mourrait`),
      );
      continue;
    }
    hoursUsedWeek += RECEPAGE_HOURS;
    hoursUsedYear += RECEPAGE_HOURS;
    recepes.push(id);
    // La tige entière tombe avant d'être façonnée : même orientation, et pour
    // la même raison, que le fût d'une coupe (voir `ArbreRetire`).
    const { radians: aval } = versLAval(altitudes, dims, tree.x, tree.y);
    retire.push({
      id,
      x: tree.x,
      y: tree.y,
      especeId: tree.especeId,
      diametreCm: tree.diametreCm,
      hauteurAvantM: tree.heightM,
      // Il reste la souche, et c'est d'elle que repartiront les rejets.
      hauteurApresM: RECEPAGE_HAUTEUR_M,
      baseHouppierAvantM: tree.baseHouppierM ?? 0,
      baseHouppierApresM: 0,
      directionRad: aval + Math.PI / 2,
    });
    // On récolte la tige et la souche repart : c'est tout l'intérêt du taillis.
    // Ce qui part, c'est la tige MOINS la souche laissée sur place — la
    // compter entière vendait un demi-mètre de bois resté debout, et créait
    // le carbone correspondant.
    treasuryEur +=
      (volumeTigeM3(tree.diametreCm, tree.heightM) -
        volumeTigeM3(tree.diametreCm, RECEPAGE_HAUTEUR_M)) *
      WOOD_PRICE_EUR_M3;
    exportedEnergyCumKgC +=
      treeAboveCarbonKg(espece, tree.diametreCm, tree.heightM) -
      treeAboveCarbonKg(espece, tree.diametreCm, RECEPAGE_HAUTEUR_M);
    // Les racines que l'arbre cesse de porter restent dans le sol : elles ne
    // s'exportent pas avec la tige, elles se décomposent sur place (carbon.ts).
    deadWoodKgC += racinesPerduesEnRabattant(
      espece,
      tree.diametreCm,
      tree.heightM,
      RECEPAGE_HAUTEUR_M,
    );
    trees[idx] = {
      ...tree,
      heightM: RECEPAGE_HAUTEUR_M,
      hauteurElagueeM: 0,
      // La souche repart branchu : le fût nu de la tige coupée ne se transmet
      // pas aux rejets, c'est même tout l'inverse d'un taillis.
      baseHouppierM: 0,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
      stress: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      uptakeYearG: 0,
      recepages: tree.recepages + 1,
    };
  }
  return {
    state: {
      ...state,
      trees,
      carbon: { ...state.carbon, exportedEnergyCumKgC, deadWoodKgC },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
    gestes: recepes.length > 0 ? [{ type: "receper", ids: recepes, retire }] : [],
  };
}

/**
 * Désigne les arbres à retirer pour ramener une zone à sa densité cible.
 * C'est le cœur de l'éclaircie : le joueur dit ce qu'il veut obtenir, le
 * moteur choisit les tiges selon le critère demandé.
 */
export function choisirTigesAEclaircir(
  state: GameState,
  action: Extract<GameAction, { type: "eclaircir" }>,
): number[] {
  const dansZone = state.trees.filter((t) => t.alive && zoneContient(action, t.x, t.y));
  if (action.critere === "espece") {
    return dansZone.filter((t) => t.especeId === action.especeId).map((t) => t.id);
  }
  const surfaceHa = aireM2DeLaZone(action) / 10_000;
  const aGarder = Math.max(0, Math.round(action.densiteCibleParHa * surfaceHa));
  if (dansZone.length <= aGarder) return [];
  // Par le bas : on sacrifie les dominés. Par le haut : on prélève les gros.
  const ordre = [...dansZone].sort((a, b) =>
    action.critere === "parLeBas" ? a.heightM - b.heightM : b.heightM - a.heightM,
  );
  return ordre.slice(0, dansZone.length - aGarder).map((t) => t.id);
}

/** L'arbre est-il en état de donner son écorce (âge, délai depuis la dernière levée) ? */
export function ecorceRecoltable(
  tree: { especeId: string; ageWeeks: number; heightM: number; derniereLeveeSemaine?: number },
  semaine: number,
): boolean {
  const espece = getEspece(tree.especeId);
  const ecorce = espece.ecorce;
  if (!ecorce) return false;
  if (tree.ageWeeks < ecorce.premierAge * 52) return false;
  if (tree.derniereLeveeSemaine === undefined) return true;
  return semaine - tree.derniereLeveeSemaine >= ecorce.rotationAns * 52;
}

function applyLeverEcorce(
  state: GameState,
  action: Extract<GameAction, { type: "leverEcorce" }>,
): ApplyResult {
  const refusals: ActionRefusal[] = [];
  let { treasuryEur, hoursUsedWeek, hoursUsedYear } = state.economy;
  const trees = [...state.trees];
  /** Les arbres réellement démasclés, et le poids de liège levé (#100). */
  const demascles: number[] = [];
  const masses: number[] = [];
  /** Où les planches se posent (#124), sans doublon si deux arbres partagent une cellule. */
  const piedsDesArbres = new Set<number>();
  for (const id of action.treeIds) {
    const idx = trees.findIndex((t) => t.id === id && t.alive);
    const tree = idx >= 0 ? trees[idx] : undefined;
    if (!tree) {
      refusals.push(refuse(action.week, "leverEcorce", `arbre ${id} introuvable`));
      continue;
    }
    const ecorce = getEspece(tree.especeId).ecorce;
    if (!ecorce) {
      refusals.push(
        refuse(
          action.week,
          "leverEcorce",
          `${getEspece(tree.especeId).nom} n'a pas d'écorce à lever`,
        ),
      );
      continue;
    }
    if (!ecorceRecoltable(tree, action.week)) {
      refusals.push(
        refuse(
          action.week,
          "leverEcorce",
          `arbre ${id} : trop jeune ou levé il y a moins de ${ecorce.rotationAns} ans`,
        ),
      );
      continue;
    }
    // Le rendement suit la taille : un gros arbre porte plus de planches.
    const kg = ecorce.rendementKg * Math.min(1.5, tree.heightM / 12);
    const hours = kg * ecorce.recolteHKg;
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    treasuryEur += kg * ecorce.prixEurKg;
    demascles.push(id);
    masses.push(kg);
    // Les planches s'empilent AU PIED : la cellule de l'arbre est l'endroit,
    // et il n'y a rien à deviner de plus (#124).
    piedsDesArbres.add(Math.floor(tree.y) * state.station.coteM + Math.floor(tree.x));
    trees[idx] = { ...tree, derniereLeveeSemaine: action.week };
  }
  return {
    state: {
      ...state,
      trees,
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
    // Deux mailles ici aussi : les troncs mis à vif, et le pied où le liège
    // s'empile (#124). `masseKg` dit COMBIEN de planches, les cellules disent OÙ.
    gestes:
      demascles.length > 0
        ? [
            { type: "leverEcorce", ids: demascles, masseKg: masses },
            { type: "leverEcorce", cellules: [...piedsDesArbres] },
          ]
        : [],
  };
}

export function applyAction(state: GameState, action: GameAction): ApplyResult {
  if (state.economy.active && state.economy.bankrupt) {
    return { state, refusals: [refuse(action.week, action.type, "faillite")] };
  }
  switch (action.type) {
    case "planter":
      return applyPlanter(state, action);
    case "couper":
      return applyCouper(state, action);
    case "recolter":
      return applyRecolter(state, action);
    case "embaucher": {
      const contrat = action.contrat ?? "cdi";
      if (contrat === "saisonnier") {
        const semaines = Math.max(1, Math.round(action.semaines ?? 4));
        const cost = semaines * SEASONAL_EUR_WEEK;
        if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
          return { state, refusals: [refuse(action.week, "embaucher", "découvert plafonné")] };
        }
        return {
          state: {
            ...state,
            economy: {
              ...state.economy,
              uth: state.economy.uth + 1,
              treasuryEur: state.economy.treasuryEur - cost,
              saisonniersFinSemaine: [
                ...state.economy.saisonniersFinSemaine,
                action.week + semaines,
              ],
            },
          },
          refusals: [],
        };
      }
      // CDI : la première semaine se paie à l'embauche, le reste chaque semaine.
      if (state.economy.treasuryEur - SALARY_EUR_WEEK < OVERDRAFT_LIMIT_EUR) {
        return { state, refusals: [refuse(action.week, "embaucher", "découvert plafonné")] };
      }
      return {
        state: {
          ...state,
          economy: {
            ...state.economy,
            uth: state.economy.uth + 1,
            ouvriersCdi: state.economy.ouvriersCdi + 1,
            treasuryEur: state.economy.treasuryEur - SALARY_EUR_WEEK,
          },
        },
        refusals: [],
      };
    }
    case "licencier": {
      if (state.economy.ouvriersCdi === 0) {
        return {
          state,
          refusals: [
            refuse(
              action.week,
              "licencier",
              "aucun ouvrier en CDI (les saisonniers expirent seuls)",
            ),
          ],
        };
      }
      // Indemnités dues même en difficulté : licencier n'est jamais refusé.
      return {
        state: {
          ...state,
          economy: {
            ...state.economy,
            uth: Math.max(1, state.economy.uth - 1),
            ouvriersCdi: state.economy.ouvriersCdi - 1,
            treasuryEur: state.economy.treasuryEur - SEVERANCE_EUR,
          },
        },
        refusals: [],
      };
    }
    case "chauler":
      return applyChauler(state, action);
    case "faucher":
      return applyFaucher(state, action);
    case "fertiliser":
      return applyFertiliser(state, action);
    case "semer":
      return applySemer(state, action);
    case "moissonner":
      return applyMoissonner(state, action);
    case "ramasserBoisMort":
      return applyRamasserBoisMort(state, action);
    case "eclaircir": {
      const treeIds = choisirTigesAEclaircir(state, action);
      if (treeIds.length === 0) {
        return {
          state,
          refusals: [refuse(action.week, "eclaircir", "rien à prélever : la zone est déjà claire")],
        };
      }
      const coupe = applyCouper(state, {
        type: "couper",
        week: action.week,
        treeIds,
        devenir: action.devenir,
      });
      // Une éclaircie EST une coupe, mais le rendu la raconte autrement : une
      // dizaine de dominés qui s'effacent, pas un gros arbre qui tombe.
      return {
        ...coupe,
        gestes: (coupe.gestes ?? []).map((g) =>
          estGesteSurArbres(g) && g.type === "couper" ? { ...g, type: "eclaircir" as const } : g,
        ),
      };
    }
    case "leverEcorce":
      return applyLeverEcorce(state, action);
    case "elaguer":
      return applyElaguer(state, action);
    case "proteger":
      return applyProteger(state, action);
    case "labourer":
      return applyLabourer(state, action);
    case "chasser":
      return applyChasser(state);
    case "trogner":
      return applyTrogner(state, action);
    case "cloturer":
      return applyCloturer(state, action);
    case "epandreBrf":
      return applyEpandreBrf(state, action);
    case "receper":
      return applyReceper(state, action);
  }
}

/**
 * Ce qu'`applyAction` REFUSERAIT pour ce geste, sans rien changer à l'état.
 *
 * Le jeu en a besoin pour dire « ce clic sera refusé, et voici pourquoi »
 * AVANT le clic (#139, #120) : sous le curseur, le viseur passe au rouge avec
 * la raison écrite là où l'œil se trouve déjà.
 *
 * Deux chemins étaient possibles, et le second est le bon pour une raison
 * mesurée, pas supposée.
 *
 * Le premier — extraire de chaque `applyXxx` sa décision de refus, et
 * l'appeler des deux côtés — donne bien une règle unique, mais au prix d'une
 * réécriture des vingt et une actions, donc de vingt et une occasions de
 * laisser un refus derrière. Un préavis qui se désynchronise du geste réel est
 * pire que pas de préavis : il annonce un refus qui n'arrive pas, ou laisse
 * passer un clic qui sera refusé.
 *
 * Le second — appeler `applyAction` et ne garder que les refus — ne peut PAS
 * se désynchroniser, puisque c'est le geste réel qui répond. Il pose deux
 * questions, et les deux ont été mesurées plutôt que pariées :
 *
 * 1. Est-ce assez bon marché pour le survol ? Mesuré sur une parcelle pleine
 *    de 100 m portant deux cents arbres, et sur le chemin de TRAVAIL — celui
 *    qu'on paie quand la cible est légale, donc le cher : 1,8 ms au pire, pour
 *    un chaulage de 40 m de rayon qui couvre la moitié de la parcelle ; moins
 *    d'une milliseconde pour les gestes ordinaires. Le survol ne redemande que
 *    lorsque la cellule visée change : il peut le payer.
 *
 *    Pour comparaison, sur le MÊME état, copier l'état avant de l'appeler — la
 *    parade défensive évidente — coûte 53 ms, trente fois plus que le pire cas
 *    qu'elle protégerait. C'est cette mesure qui l'a écartée, pas un avis :
 *    l'idée prudente était la seule des deux qui rendait le préavis
 *    impossible.
 *
 * 2. `applyAction` laisse-t-elle vraiment son entrée intacte ? Aujourd'hui
 *    oui, et ce n'est plus une propriété du code du jour : `prevoir.test.ts`
 *    la vérifie pour CHAQUE type d'action, sur son chemin de refus ET sur son
 *    chemin de travail, par comparaison profonde de l'état avant et après. La
 *    table des cas y est indexée par `GameAction["type"]`, donc une action
 *    neuve qu'on oublierait d'y inscrire ne compile pas.
 *
 * Ce que l'issue reprochait à ce chemin — « le jeu n'a pas le droit de parier
 * sur du code dont il n'est pas responsable » — reste vrai, et c'est pour ça
 * que la fonction vit ICI. Le pari n'est plus celui du jeu : il est celui du
 * moteur sur son propre code, et la suite le tient.
 */
export function prevoirAction(state: GameState, action: GameAction): ActionRefusal[] {
  return applyAction(state, action).refusals;
}
