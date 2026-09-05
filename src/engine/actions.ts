/**
 * Actions du joueur (docs/regles.md §9-10) et économie V0 : argent (€) et
 * temps de travail (heures, plafond hebdomadaire par UTH). Les actions sont
 * DATÉES (semaine absolue) : le journal d'actions + la seed + la station
 * forment la sauvegarde rejouable (docs/stack.md).
 * Une action refusée l'est déterministiquement, avec sa raison ; une action
 * partiellement exécutée traite ses éléments dans l'ordre et s'arrête au
 * plafond (heures ou découvert).
 */

import { empreinteDeChute, poserBoisAuSol, versLAval } from "./boisMort";
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
import { forEachDiscCell } from "./grid";
import { crownRadiusM } from "./light";
import { partMecanisable } from "./mecanisation";
import { SURVIE_APRES_LABOUR, TYPES_MYCORHIZE } from "./mycorhizes";
import { altitudeParCellule } from "./relief";
import type { GameState } from "./state";
import { tirerVigueurIndividuelle, treeNitrogenNeedGWeek } from "./trees";

/** plafond d'heures de travail par UTH et par semaine (docs/regles.md §10) */
export const WEEK_HOURS_CAP = 60;
/** heures d'une UTH sur l'année (~1 800 h) */
export const UTH_HOURS_PER_YEAR = 1800;
/** découvert autorisé avant faillite, € (décision §15) */
export const OVERDRAFT_LIMIT_EUR = -20_000;
/** temps de plantation d'un arbre (trouaison, plant, protection), h *(à calibrer)* */
export const PLANT_HOURS = 1;
/** espacement minimal imposé à la plantation, m */
export const PLANT_MIN_SPACING_M = 1;
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
 * Décote d'un bois brûlé récupéré en coupe sanitaire : il vaut encore quelque
 * chose (chauffage, trituration), mais l'œuvre est perdue *(à calibrer)*.
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
/** effet d'un chaulage sur le pH (plafonné à 7,5) */
export const LIME_PH_STEP = 0.5;
/**
 * C/N du bois raméal fragmenté épandu : du BOIS, pas des feuilles — libération
 * lente sur plusieurs années, c'est toute la valeur du BRF (ch2-B).
 */
export const BRF_CN_RATIO = 40;
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
}

export function createEconomy(treasuryEur: number): EconomyState {
  return {
    treasuryEur,
    hoursUsedWeek: 0,
    hoursUsedYear: 0,
    uth: 1,
    ouvriersCdi: 0,
    saisonniersFinSemaine: [],
    bankrupt: false,
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
  | {
      /** chauler un disque : pH +0,5 (plafond 7,5) — pour les calcicoles (§9) */
      type: "chauler";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    }
  | {
      /**
       * Lever l'écorce (démasclage du liège) : une récolte qui ne tue pas
       * l'arbre et qui revient tous les dix ans.
       */
      type: "leverEcorce";
      week: number;
      treeIds: number[];
    }
  | {
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
      x: number;
      y: number;
      rayonM: number;
      /** tiges/ha visées après passage */
      densiteCibleParHa: number;
      critere: "parLeBas" | "parLeHaut" | "espece";
      /** pour le critère « espece » */
      especeId?: string;
      devenir: "vendre" | "epandre" | "broyer" | "laisser";
    }
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
  | {
      /**
       * Épandre le tas de broyat sur une zone choisie. C'est LE geste de
       * transfert de fertilité : on coupe les fixateurs d'azote là où ils
       * poussent, et on porte leur azote au pied des arbres qu'on veut nourrir.
       */
      type: "epandreBrf";
      week: number;
      x: number;
      y: number;
      rayonM: number;
      /** part du tas à épandre ∈ ]0,1] */
      part: number;
    }
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
  | {
      /**
       * Clôturer une zone : cher au mètre de périmètre, mais total. À la
       * différence des manchons, le coût ne dépend pas du nombre de plants —
       * c'est ce qui le rend imbattable au-delà d'une certaine surface.
       */
      type: "cloturer";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    }
  | {
      /**
       * Labourer : retourner le sol d'une zone. Le geste fondateur de
       * l'agriculture, et celui qui coûte le plus cher au sol.
       */
      type: "labourer";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    }
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
  | {
      /**
       * Faucher/dégager un disque : rabat la strate herbacée, qui repartira.
       * C'est l'entretien qui sauve une plantation de la concurrence (ch4-B) —
       * et l'herbe coupée reste au sol en litière.
       */
      type: "faucher";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    }
  | {
      /**
       * Ramasser le bois mort COUCHÉ d'une zone pour le chauffage. Le geste
       * n'est pas neutre : il enlève de l'humus en devenir, un abri et une
       * protection du sol, et il retire du gros combustible. C'est l'arbitrage
       * même du bois mort, et il n'a de bonne réponse qu'au cas par cas.
       */
      type: "ramasserBoisMort";
      week: number;
      x: number;
      y: number;
      rayonM: number;
    };

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
}

export interface GesteSurZone {
  type: GesteTypeZone;
  /** cellules réellement touchées, indices `y * coteM + x` */
  cellules: readonly number[];
}

/** Gestes qui désignent des arbres. Le gibier est l'auteur des deux derniers. */
export type GesteTypeArbre =
  | "couper"
  | "eclaircir"
  | "elaguer"
  | "trogner"
  | "receper"
  | "brouter"
  | "frotter";

/** Gestes qui désignent une zone de sol. */
export type GesteTypeZone =
  | "chauler"
  | "faucher"
  | "epandreBrf"
  | "labourer"
  | "ramasserBoisMort"
  | "cloturer";

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

/** Volume de bois récoltable, m³ — proxy allométrique V0 *(à calibrer IFN)*. */
export function woodVolumeM3(heightM: number): number {
  return 0.015 * heightM * heightM;
}

/**
 * Diamètre à hauteur de poitrine, cm — proxy tiré de la hauteur *(à calibrer)*.
 * Un arbre de 20 m fait environ 40 cm de diamètre.
 */
export function diametreCm(heightM: number): number {
  return 2 * heightM;
}

/**
 * Ce que vaut un arbre sur pied, € — et à quel titre. Une bille droite,
 * élaguée et de bon diamètre part en scierie à plusieurs centaines d'euros le
 * m³ ; le reste finit en bûches. C'est l'écart qui justifie l'élagage et la
 * patience (ch5-A).
 */
export function valeurSurPied(
  espece: EspeceV0,
  tree: { heightM: number; hauteurElagueeM: number },
): { eur: number; qualite: "oeuvre" | "chauffage" } {
  const volume = woodVolumeM3(tree.heightM);
  const assezGros = diametreCm(tree.heightM) >= DIAMETRE_OEUVRE_MIN_CM;
  const assezElague = tree.hauteurElagueeM >= BILLE_OEUVRE_MIN_M;
  if (assezGros && assezElague) {
    // Seule la bille élaguée fait de l'œuvre ; le houppier reste du chauffage.
    const partOeuvre = Math.min(0.6, tree.hauteurElagueeM / tree.heightM);
    return {
      eur:
        volume * partOeuvre * espece.bois.prixOeuvreEurM3 +
        volume * (1 - partOeuvre) * WOOD_PRICE_EUR_M3,
      qualite: "oeuvre",
    };
  }
  return { eur: volume * WOOD_PRICE_EUR_M3, qualite: "chauffage" };
}

/** Temps d'abattage + façonnage d'un arbre, h *(à calibrer)*. */
export function fellingHours(heightM: number): number {
  return 0.3 + 0.15 * heightM;
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
  // La vigueur de chaque plant se tire dans le générateur de la partie : deux
  // parties de même graine plantent donc exactement les mêmes individus.
  let rng = state.rng;

  const heuresParPlant = PLANT_HOURS + (action.avecManchon ? PROTECTION_HEURES : 0);
  const euroParPlant = espece.economie.prixPlantEur + (action.avecManchon ? PROTECTION_EUR : 0);
  for (const pos of action.positions) {
    if (hoursUsedWeek + heuresParPlant > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(
        refuse(action.week, "planter", `plafond hebdomadaire atteint (${planted} plantés)`),
      );
      break;
    }
    if (treasuryEur - euroParPlant < OVERDRAFT_LIMIT_EUR) {
      refusals.push(refuse(action.week, "planter", `découvert plafonné (${planted} plantés)`));
      break;
    }
    if (pos.x < 0 || pos.x >= state.station.coteM || pos.y < 0 || pos.y >= state.station.coteM) {
      refusals.push(refuse(action.week, "planter", "position hors parcelle"));
      continue;
    }
    const tooClose = trees.some((t) => {
      if (!t.alive) return false;
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      return dx * dx + dy * dy < PLANT_MIN_SPACING_M * PLANT_MIN_SPACING_M;
    });
    if (tooClose) {
      refusals.push(refuse(action.week, "planter", "trop proche d'un arbre vivant (< 1 m)"));
      continue;
    }
    const tirage = tirerVigueurIndividuelle(rng);
    rng = tirage.rng;
    trees.push({
      vigueurIndividuelle: tirage.vigueur,
      id: nextTreeId++,
      especeId: action.especeId,
      x: pos.x,
      y: pos.y,
      ageWeeks: 0,
      heightM: 0.3,
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
    hoursUsedWeek += heuresParPlant;
    hoursUsedYear += heuresParPlant;
    importedKgC += treeTotalCarbonKg(espece, 0.3); // le plant arrive avec sa biomasse
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
  let { deadWoodKgC, exportedEnergyCumKgC, oeuvreCumKgC } = state.carbon;
  let stockBrf = state.stockBrf;
  const coupes: number[] = [];
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
    const hours = fellingHours(tree.heightM) * facteurTravail;
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "couper", `plafond hebdomadaire atteint (arbre ${id})`));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;

    const aerienKgC = treeAboveCarbonKg(espece, tree.heightM);
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
      deadWoodKgC += treeTotalCarbonKg(espece, tree.heightM) - aerienKgC;
    }
    if (action.devenir === "laisser") {
      // Le fût reste là où il tombe, couché EN TRAVERS de la pente : c'est le
      // geste de la restauration post-incendie, et le moteur suppose que le
      // bûcheron qui choisit de laisser le bois le pose correctement — on ne
      // simule pas la maladresse. Sur un terrain plat l'orientation ne veut
      // rien dire, et elle ne sert à rien non plus : sans pente, pas d'eau qui
      // court.
      const { radians: aval } = versLAval(altitudes, dims, tree.x, tree.y);
      const empreinte = empreinteDeChute(tree.x, tree.y, tree.heightM, aval + Math.PI / 2, dims);
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
            aval + Math.PI / 2,
          );
        }
      } else {
        // Rien de la parcelle sous le tronc : son bois retourne au pool.
        deadWoodKgC += emporteKgC;
      }
    } else if (action.devenir === "vendre") {
      const vente = valeurSurPied(espece, tree);
      const brule = tree.brulEeSemaine !== undefined;
      if (dejaEnBoisMort) {
        // Une chandelle ne fait JAMAIS d'œuvre, même si elle a été élaguée de
        // son vivant : le bois est fendillé, l'aubier parti, les insectes
        // passés. Elle se vend au volume, au prix du chauffage, décotée — et
        // un fût noirci par le feu vaut encore moins qu'un fût gris.
        const decote = brule ? DECOTE_CHABLIS : DECOTE_CHANDELLE;
        treasuryEur += woodVolumeM3(tree.heightM) * WOOD_PRICE_EUR_M3 * decote;
      } else {
        treasuryEur += vente.eur * (brule ? DECOTE_CHABLIS : 1);
      }
      if (vente.qualite === "oeuvre" && !brule && !dejaEnBoisMort) {
        // Bois d'œuvre : le carbone reste piégé dans le produit (charpente,
        // meuble) pour des décennies — ce n'est pas une émission (§12).
        oeuvreCumKgC += emporteKgC;
      } else {
        // Bois de chauffage : brûlé chez le client → émis immédiatement.
        exportedEnergyCumKgC += emporteKgC;
      }
    } else if (action.devenir === "broyer") {
      // Le broyat rejoint le tas : rien ne touche le sol pour l'instant.
      stockBrf = {
        carboneG: stockBrf.carboneG + treeAboveCarbonKg(espece, tree.heightM) * 1000,
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
      const crownR = Math.max(2.5, 2 * crownRadiusM(tree.heightM, espece.lumiere.houppierRatio));
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
      const shareC = (treeAboveCarbonKg(espece, tree.heightM) * 1000) / cells.length;
      const kSpecies = 0.6 / BRF_CN_RATIO;
      for (const i of cells) {
        const oldN = litterNG[i] ?? 0;
        litterK[i] = (oldN * (litterK[i] ?? 0) + share * kSpecies) / (oldN + share);
        litterNG[i] = oldN + share;
        litterCG[i] = (litterCG[i] ?? 0) + shareC;
      }
    }
    coupes.push(id);
    trees.splice(idx, 1); // l'arbre coupé quitte la carte (bois mort/carbone en V1)
  }

  return {
    state: {
      ...state,
      trees,
      soil: { ...state.soil, litterNG, litterCG, litterK, boisAuSolCG, boisEnTraversPart },
      stockBrf,
      carbon: { ...state.carbon, deadWoodKgC, exportedEnergyCumKgC, oeuvreCumKgC },
      economy: { ...state.economy, treasuryEur, hoursUsedWeek, hoursUsedYear },
    },
    refusals,
    // Les tiges RÉELLEMENT tombées, pas celles qu'on a demandées : le plafond
    // horaire arrête souvent le chantier en cours de route.
    gestes: coupes.length > 0 ? [{ type: "couper", ids: coupes }] : [],
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
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return {
      state,
      refusals: [refuse(action.week, "epandreBrf", "plafond hebdomadaire atteint")],
    };
  }

  const cote = state.station.coteM;
  const dims = { widthM: cote, heightM: cote };
  const cells: number[] = [];
  forEachDiscCell(dims, action.x, action.y, action.rayonM, (i) => cells.push(i));
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
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "recolter", `plafond hebdomadaire atteint (arbre ${id})`));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    treasuryEur += tree.fruitsKg * prix;
    trees[idx] = { ...tree, fruitsKg: 0 };
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

function applyChauler(
  state: GameState,
  action: Extract<GameAction, { type: "chauler" }>,
): ApplyResult {
  const areaM2 = Math.PI * action.rayonM * action.rayonM;
  const part = partMecanisable(state.trees, action.x, action.y, action.rayonM);
  const cost = areaM2 * (LIME_EUR_M2 + part * COUT_ENGIN_EUR_M2);
  const hours = areaM2 * (part * LIME_HOURS_M2_ENGIN + (1 - part) * LIME_HOURS_M2_MAIN);
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "chauler", "plafond hebdomadaire atteint")] };
  }
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "chauler", "découvert plafonné")] };
  }
  const ph = state.soil.ph.slice();
  const cote = state.station.coteM;
  const r2 = action.rayonM * action.rayonM;
  const chaulees: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - action.x;
      const dy = y + 0.5 - action.y;
      if (dx * dx + dy * dy <= r2) {
        const i = y * cote + x;
        chaulees.push(i);
        ph[i] = Math.min(7.5, (ph[i] ?? 7) + LIME_PH_STEP);
      }
    }
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, ph },
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

function applyFaucher(
  state: GameState,
  action: Extract<GameAction, { type: "faucher" }>,
): ApplyResult {
  const areaM2 = Math.PI * action.rayonM * action.rayonM;
  // Ce que l'engin peut atteindre dépend de la façon dont c'est planté : le
  // reste se fait à la débroussailleuse, vingt fois plus lentement.
  const part = partMecanisable(state.trees, action.x, action.y, action.rayonM);
  const hours = areaM2 * (part * FAUCHE_HOURS_M2_ENGIN + (1 - part) * FAUCHE_HOURS_M2_MAIN);
  const coutEngin = areaM2 * part * COUT_ENGIN_EUR_M2;
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "faucher", "plafond hebdomadaire atteint")] };
  }
  const herbeCouverture = state.soil.herbeCouverture.slice();
  const herbeBiomasse = state.soil.herbeBiomasse.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const cote = state.station.coteM;
  const r2 = action.rayonM * action.rayonM;
  // Les cellules où l'outil a effectivement mordu : une pelouse déjà rase ne
  // se fauche pas, et le rendu n'a rien à y montrer.
  const fauchees: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - action.x;
      const dy = y + 0.5 - action.y;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * cote + x;
      const avant = herbeCouverture[i] ?? 0;
      if (avant <= FAUCHE_COUVERTURE_RESIDUELLE) continue;
      fauchees.push(i);
      const coupe = avant - FAUCHE_COUVERTURE_RESIDUELLE;
      herbeCouverture[i] = FAUCHE_COUVERTURE_RESIDUELLE;
      herbeBiomasse[i] = FAUCHE_COUVERTURE_RESIDUELLE;
      // L'herbe coupée reste sur place : litière tendre, vite recyclée.
      litterNG[i] = (litterNG[i] ?? 0) + coupe * 4;
      litterCG[i] = (litterCG[i] ?? 0) + coupe * 4 * 25;
    }
  }
  return {
    state: {
      ...state,
      soil: { ...state.soil, herbeCouverture, herbeBiomasse, litterNG, litterCG },
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
  const r2 = action.rayonM * action.rayonM;
  const boisAuSolCG = state.soil.boisAuSolCG.slice();
  const boisEnTraversPart = state.soil.boisEnTraversPart.slice();
  const cibles: number[] = [];
  let carboneKgC = 0;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - action.x;
      const dy = y + 0.5 - action.y;
      if (dx * dx + dy * dy > r2) continue;
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
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return {
      state,
      refusals: [refuse(action.week, "ramasserBoisMort", "plafond hebdomadaire atteint")],
    };
  }
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
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "elaguer", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    elagues.push(id);
    trees[idx] = { ...tree, hauteurElagueeM: cible };
  }
  return {
    state: { ...state, trees, economy: { ...state.economy, hoursUsedWeek, hoursUsedYear } },
    refusals,
    gestes: elagues.length > 0 ? [{ type: "elaguer", ids: elagues }] : [],
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
    if (hoursUsedWeek + TROGNE_HEURES > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "trogner", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += TROGNE_HEURES;
    hoursUsedYear += TROGNE_HEURES;
    etetes.push(id);
    // Ce qu'on emporte : tout ce qui dépassait la tête, en bois de chauffage.
    const emporte =
      treeAboveCarbonKg(espece, tree.heightM) - treeAboveCarbonKg(espece, hauteurTete);
    treasuryEur += (woodVolumeM3(tree.heightM) - woodVolumeM3(hauteurTete)) * WOOD_PRICE_EUR_M3;
    exportedEnergyCumKgC += Math.max(0, emporte);
    // Même chose qu'au recépage : ce que la tête perd en racines reste au sol.
    deadWoodKgC += racinesPerduesEnRabattant(espece, tree.heightM, hauteurTete);
    trees[idx] = {
      ...tree,
      heightM: hauteurTete,
      teteTrogneM: hauteurTete,
      recepages: tree.recepages + 1,
      hauteurElagueeM: Math.min(tree.hauteurElagueeM, hauteurTete),
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
    gestes: etetes.length > 0 ? [{ type: "trogner", ids: etetes }] : [],
  };
}

function applyChasser(
  state: GameState,
  action: Extract<GameAction, { type: "chasser" }>,
): ApplyResult {
  if (state.economy.hoursUsedWeek + CHASSE_HEURES > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "chasser", "plafond hebdomadaire atteint")] };
  }
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
  const perimetreM = 2 * Math.PI * action.rayonM;
  const cost = perimetreM * CLOTURE_EUR_M;
  const hours = perimetreM * CLOTURE_HEURES_M;
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "cloturer", "plafond hebdomadaire atteint")] };
  }
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "cloturer", "découvert plafonné")] };
  }
  const cloture = state.soil.cloture.slice();
  const dims = { widthM: state.station.coteM, heightM: state.station.coteM };
  const closes: number[] = [];
  forEachDiscCell(dims, action.x, action.y, action.rayonM, (i) => {
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
  const part = partMecanisable(state.trees, action.x, action.y, action.rayonM);
  if (part < 0.5) {
    return {
      state,
      refusals: [refuse(action.week, "labourer", "l'engin ne peut pas manœuvrer ici")],
    };
  }
  const areaM2 = Math.PI * action.rayonM * action.rayonM * part;
  const hours = areaM2 * LABOUR_HOURS_M2;
  const cost = areaM2 * LABOUR_EUR_M2;
  if (state.economy.hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
    return { state, refusals: [refuse(action.week, "labourer", "plafond hebdomadaire atteint")] };
  }
  if (state.economy.treasuryEur - cost < OVERDRAFT_LIMIT_EUR) {
    return { state, refusals: [refuse(action.week, "labourer", "découvert plafonné")] };
  }

  const humusCG = state.soil.humusCG.slice();
  const mineralNG = state.soil.mineralNG.slice();
  const litterNG = state.soil.litterNG.slice();
  const litterCG = state.soil.litterCG.slice();
  const herbeCouverture = state.soil.herbeCouverture.slice();
  const herbeBiomasse = state.soil.herbeBiomasse.slice();
  const mycorhizes = {
    ecto: state.soil.mycorhizes.ecto.slice(),
    arbusculaire: state.soil.mycorhizes.arbusculaire.slice(),
    ericoide: state.soil.mycorhizes.ericoide.slice(),
  };
  const cote = state.station.coteM;
  const r2 = action.rayonM * action.rayonM;
  const labourees: number[] = [];
  let emisKgC = 0;
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const dx = x + 0.5 - action.x;
      const dy = y + 0.5 - action.y;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * cote + x;
      labourees.push(i);
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
      // Sol nu : c'est tout l'objet du labour, et c'est aussi son prix.
      herbeCouverture[i] = 0;
      herbeBiomasse[i] = 0;
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
    const dx = t.x - action.x;
    const dy = t.y - action.y;
    if (dx * dx + dy * dy > r2) return t;
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
        herbeBiomasse,
        mycorhizes,
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
    if (hoursUsedWeek + PROTECTION_HEURES > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "proteger", "plafond hebdomadaire atteint"));
      break;
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
    if (hoursUsedWeek + RECEPAGE_HOURS > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "receper", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += RECEPAGE_HOURS;
    hoursUsedYear += RECEPAGE_HOURS;
    recepes.push(id);
    // On récolte la tige et la souche repart : c'est tout l'intérêt du taillis.
    // Ce qui part, c'est la tige MOINS la souche laissée sur place — la
    // compter entière vendait un demi-mètre de bois resté debout, et créait
    // le carbone correspondant.
    treasuryEur +=
      (woodVolumeM3(tree.heightM) - woodVolumeM3(RECEPAGE_HAUTEUR_M)) * WOOD_PRICE_EUR_M3;
    exportedEnergyCumKgC +=
      treeAboveCarbonKg(espece, tree.heightM) - treeAboveCarbonKg(espece, RECEPAGE_HAUTEUR_M);
    // Les racines que l'arbre cesse de porter restent dans le sol : elles ne
    // s'exportent pas avec la tige, elles se décomposent sur place (carbon.ts).
    deadWoodKgC += racinesPerduesEnRabattant(espece, tree.heightM, RECEPAGE_HAUTEUR_M);
    trees[idx] = {
      ...tree,
      heightM: RECEPAGE_HAUTEUR_M,
      hauteurElagueeM: 0,
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
    gestes: recepes.length > 0 ? [{ type: "receper", ids: recepes }] : [],
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
  const r2 = action.rayonM * action.rayonM;
  const dansZone = state.trees.filter((t) => {
    if (!t.alive) return false;
    const dx = t.x - action.x;
    const dy = t.y - action.y;
    return dx * dx + dy * dy <= r2;
  });
  if (action.critere === "espece") {
    return dansZone.filter((t) => t.especeId === action.especeId).map((t) => t.id);
  }
  const surfaceHa = (Math.PI * r2) / 10_000;
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
    if (hoursUsedWeek + hours > WEEK_HOURS_CAP * state.economy.uth) {
      refusals.push(refuse(action.week, "leverEcorce", "plafond hebdomadaire atteint"));
      break;
    }
    hoursUsedWeek += hours;
    hoursUsedYear += hours;
    treasuryEur += kg * ecorce.prixEurKg;
    trees[idx] = { ...tree, derniereLeveeSemaine: action.week };
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

export function applyAction(state: GameState, action: GameAction): ApplyResult {
  if (state.economy.bankrupt) {
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
      return applyChasser(state, action);
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
