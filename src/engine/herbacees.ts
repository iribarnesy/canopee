/**
 * Les ESPÈCES de la strate herbacée (critères B8 et E9 ; issue #70).
 *
 * `herbe.ts` tenait une couverture par cellule : un taux ∈ [0,1] qui montait
 * avec la lumière et l'humidité. C'était une seule plante moyenne, sans espèce,
 * sans calendrier, sans préférence de sol. Un taux de couverture n'a pas de
 * printemps — et c'est précisément le printemps qui manquait, parce que la
 * FENÊTRE VERNALE est un mécanisme forestier majeur : anémone, jacinthe, ail
 * des ours bouclent tout leur cycle avant que la canopée ne se referme, sur
 * quelques semaines où le sol d'une hêtraie reçoit la lumière d'une clairière.
 * Le moteur savait déjà que les caducs n'ombragent pas hors saison (B5,
 * `phenologie.ts`) : cette lumière existait dans le calcul, personne ne s'en
 * servait.
 *
 * ## Un modèle de POPULATIONS, et il faut l'assumer
 *
 * Le reste du moteur raisonne par individu. Pas ici : suivre dix mille pieds
 * d'anémone par parcelle n'est pas tenable, et ne dirait rien de plus. Chaque
 * cellule porte donc une PART DE SOL par espèce. C'est un modèle différent de
 * celui des arbres, il est écrit ici pour qu'on ne le confonde pas — mais il
 * reste local : chaque cellule décide seule, sur sa lumière, son humidité et
 * son pH, sans jamais consulter une moyenne de parcelle.
 *
 * ## Deux grandeurs, et c'est la clé de la fenêtre vernale
 *
 *  - **l'emprise** : la place que l'espèce TIENT au sol, bulbes, rhizomes et
 *    souches compris. Elle est pérenne et bouge lentement — des saisons pour
 *    une graminée, des décennies pour un rhizome de vernale ;
 *  - **le feuillage** : ce qui est VERT cette semaine. Il vise l'emprise,
 *    ramenée à ce que la saison et la sécheresse en laissent, et il y va à sa
 *    vitesse de repousse. C'est lui que voient le feu, l'érosion,
 *    l'évaporation, le gibier et les semis, sous la forme de leur somme —
 *    `herbeCouverture`.
 *
 * Une anémone tient 40 % du sol toute l'année et ne le couvre qu'en avril ;
 * en juillet elle n'est plus là, et le tapis d'une hêtraie est nu.
 *
 * Les deux ne se confondent pas, et une seule variable ne suffisait pas : une
 * fauche, un feu, une dent de chevreuil emportent le FEUILLAGE et laissent
 * l'emprise. Confondre les deux — c'est ce qu'on a essayé d'abord — fait
 * disparaître une lande sous la dent du gibier en un hiver, parce que chaque
 * bouchée était prise sur les rhizomes.
 *
 * ## La règle qui TOMBE de ce découpage
 *
 * Une espèce ne fait bouger son emprise que pendant sa saison de croissance :
 * dormante, elle est gelée — elle ne gagne rien et ne perd rien. Donc
 * **chaque espèce juge sa station au moment où elle pousse**. L'anémone la juge
 * en mars, sous un couvert caduc encore nu : elle s'installe. La graminée la
 * juge en mai, sous le même couvert refermé : elle recule. Sous un couvert
 * sempervirent, les deux voient la même lumière et la vernale n'a plus
 * d'avantage — pour peu que ce couvert soit dense, car un pin clair laisse
 * assez de jour toute l'année pour que la graminée tienne le sol.
 *
 * Rien de tout cela n'est écrit dans une règle : ça sort de la phénologie de
 * chaque espèce et de la lumière hebdomadaire que `light.ts` calcule déjà.
 *
 * ## Ce que le modèle NE fait pas
 *
 *  - **Pas de hiérarchie de hauteur.** La concurrence se joue sur la place
 *    LIBRE : une espèce occupe ce que les autres lâchent, elle ne les déloge
 *    pas. Une graminée haute n'étouffe donc pas une rosette qui se maintient.
 *  - **Fauche, feu et broutage ne trient pas entre les espèces PRÉSENTES** :
 *    ils rabattent le feuillage à la même enseigne, alors qu'une faucheuse
 *    prend les hautes et qu'un chevreuil choisit. Ils épargnent en revanche les
 *    dormantes, et sans qu'on ait eu à l'écrire : une espèce rentrée sous terre
 *    n'a pas de feuillage à perdre. C'est pour cela qu'une prairie fauchée en
 *    juin garde sa flore de printemps.
 *  - **Le feu ne stérilise pas.** Il emporte tout le feuillage et laisse les
 *    emprises : une lande brûlée repart de ses souches, ce qui est le
 *    comportement observé, mais un incendie assez chaud pour cuire l'horizon de
 *    surface ferait la même chose ici.
 *  - **Pas de sécheresse pluriannuelle.** L'eau joue sur le feuillage, pas sur
 *    l'emprise : deux étés de suite ne délogent donc personne.
 *  - **Pas d'azote.** Les herbacées en consomment (`herbe.ts`) mais leur
 *    capacité ne le lit pas encore : il manque la nitrophile — l'ortie — qui
 *    ferait de l'épandage un choix visible au sol.
 */

import type { ContextePhenologique } from "./phenologie";
import { ETALEMENT_CHUTE_SEMAINES, LARGEUR_PORTE_H, SEUIL_SENESCENCE_H } from "./phenologie";
import { facteurGammePh } from "./soil";

export interface HerbaceeV0 {
  id: string;
  nom: string;
  nomLatin: string;
  lumiere: {
    /**
     * Point de compensation ∈ [0,1] : part de la pleine lumière en dessous de
     * laquelle l'espèce ne tient plus. Même sens que chez les ligneux
     * (`especes.ts`), et les mêmes ordres de grandeur : une plante de sous-bois
     * descend à 0,02, une graminée de prairie exige 0,15.
     */
    compensation: number;
    /**
     * Saturation ∈ [0,1] : lumière au-delà de laquelle la capacité plafonne.
     * Les plantes d'ombre saturent BAS — c'est ce qui les rend efficaces sous
     * couvert, pas ce qui les empêche de vivre au soleil.
     */
    saturation: number;
  };
  eau: {
    /**
     * Humidité de surface VÉCUE (`herbe.ts`, lissée sur plusieurs semaines) en
     * dessous de laquelle le feuillage grille, proportionnellement. L'herbe
     * grille la première : ses racines sont fines et superficielles. Ce seuil
     * ne touche pas l'emprise — voir `facteurEauHerbacee`.
     */
    seuilConfort: number;
  };
  /**
   * Gamme de pH tolérée [min, max], bordure douce de ±0,7 comme pour les
   * ligneux (`soil.ts:facteurGammePh`). C'est l'axe qui sépare le plus
   * nettement les deux graminées : le dactyle fuit l'acidité, la molinie y
   * règne.
   */
  ph: [number, number];
  phenologie: {
    /**
     * Cumul de degrés-jours base 5 °C depuis le 1ᵉʳ janvier au démarrage de la
     * végétation. Même horloge que les ligneux (`phenologie.ts`), pour que la
     * course entre l'herbe et la canopée se joue sur un seul calendrier.
     */
    debutDJ: number;
    /**
     * Durée du jour minimale, heures. Sans cette porte, la chaleur seule ferait
     * démarrer le Sud-Ouest six semaines avant le Nord — le même défaut que
     * chez les arbres, et la même correction.
     */
    seuilJourH: number;
    /**
     * Retrait PROGRAMMÉ : cumul de degrés-jours auquel l'espèce se retire, que
     * le sol soit encore éclairé ou non. C'est la signature des géophytes
     * vernales — elles ne se retirent pas parce que la canopée les prive de
     * lumière, elles se retirent parce que leur cycle est fini.
     */
    finDJ?: number;
    /**
     * Les parties aériennes meurent-elles quand le jour raccourcit ?
     *
     * Oui pour une molinie, dont la touradon sèche est tout ce qui reste en
     * février. Non pour une touffe de dactyle, qui passe l'hiver verte et
     * REPART au premier redoux — y compris en novembre sous un couvert caduc
     * qui vient de s'ouvrir. La différence n'est pas cosmétique : elle décide
     * si l'espèce peut profiter de la fenêtre d'AUTOMNE, qui dure bien plus
     * longtemps que celle de printemps.
     */
    senescenceAutomnale: boolean;
    /**
     * Part de l'appareil COUVRANT qui reste en place hors saison de croissance
     * ∈ [0,1]. Une touffe de dactyle reste verte l'hiver ; une molinie ne
     * laisse que sa touradon sèche ; une anémone ne laisse rien.
     */
    partPersistante: number;
  };
  /**
   * Exigence minérale, même échelle que les ligneux (`especes.ts`) : une
   * essence forestière est à 1, et c'est la référence. Une céréale
   * sélectionnée pour le rendement, dont on exporte la récolte chaque année,
   * est à dix ou vingt — c'est par ce nombre, et non par un cas particulier
   * dans le moteur, que les cultures s'ajoutent.
   *
   * Les trois herbacées spontanées sont à 1, ce qui rend le lot des cultures
   * IDENTIQUE pour elles : la demande d'azote du tapis était une constante
   * multipliée par la couverture, elle devient une somme par espèce, et la
   * somme vaut exactement l'ancienne tant que tout le monde est à 1.
   */
  exigenceMinerale: number;
  /**
   * Ce que l'espèce offre aux pollinisateurs quand elle fleurit, et QUAND
   * (#70, critères G4 et J6). Même forme que sur la fiche ligneuse
   * (`especes.ts:floraison`), même horloge en degrés-jours.
   *
   * **Absent pour une anémophile**, et c'est le contenu du champ : deux des
   * trois herbacées du moteur sont des GRAMINÉES. Elles fleurissent
   * abondamment, leur pollen part au vent, et aucun insecte ne vient le
   * chercher. La strate basse ne nourrit donc les pollinisateurs que par sa
   * vernale — ce qui est exactement ce que dit la littérature de la soudure de
   * printemps, et ce qui laisse la soudure d'ÉTÉ à la charge des ligneux.
   */
  floraison?: {
    /** ouverture : cumul de degrés-jours base 5 °C depuis le 1ᵉʳ janvier */
    debutDJ: number;
    /** largeur de la fenêtre, en degrés-jours */
    dureeDJ: number;
    /** ce que la floraison offre ∈ [0,1], à pleine emprise */
    nectar: number;
  };
  /**
   * °C moyenne hebdomadaire à partir de laquelle la végétation démarre. Une
   * vernale pousse au froid — c'est même tout son avantage —, une molinie
   * attend la chaleur.
   */
  tBaseCroissanceC: number;
  /**
   * Gain d'emprise par semaine de pleine vigueur, en part de cellule. C'est la
   * vitesse de CONQUÊTE d'un sol libre, et elle sépare radicalement une
   * graminée qui talle d'un rhizome qui avance de quelques centimètres par an.
   *
   * **Nulle pour une culture**, qui ne conquiert rien : son emprise est POSÉE
   * par le semis. Voir `culture`.
   */
  vitesseInstallation: number;
  /**
   * CULTURE : présent quand l'espèce est semée et récoltée plutôt que
   * spontanée. C'est une histoire de vie différente, et il faut l'assumer —
   * tout le reste de ce module décrit des PÉRENNES.
   *
   *  - une pérenne CONQUIERT la place libre et REFLUE quand la station ne la
   *    porte plus ; une culture ne fait ni l'un ni l'autre. Son emprise est
   *    posée au semis et remise à zéro à la moisson, et rien entre les deux ne
   *    la fait bouger ;
   *  - une pérenne rend TOUTE sa litière à la cellule ; une culture n'en rend
   *    que la paille et le chaume, le grain partant pour de bon avec son
   *    azote. (Cette ligne a longtemps décrit une intention plutôt qu'un
   *    mécanisme : jusqu'à #201, aucune des deux ne rendait quoi que ce
   *    soit.) ;
   *  - une parcelle laissée seule se couvre de molinie, jamais de blé.
   *
   * Ce qui ne change PAS : le feuillage suit la saison et la sécheresse comme
   * pour tout le monde, si bien qu'une céréale d'hiver profite d'elle-même de
   * la fenêtre où les caducs sont nus — la mécanique de la vernale, sans une
   * ligne de plus.
   */
  culture?: {
    /**
     * Rendement en grain à pleine emprise et sans aucun facteur limitant,
     * t/ha. C'est un PLAFOND, que la lumière, l'eau et l'azote rabotent.
     */
    rendementMaxTHa: number;
    /** Prix de vente du grain, €/t. */
    prixEurT: number;
    /** Semaine de semis (0-51). */
    semisWeek: number;
    /** Semaine de moisson (0-51). */
    recolteWeek: number;
    /** Travail du semis puis de la moisson, h/ha pour chacun. */
    heuresSemisHa: number;
    heuresRecolteHa: number;
    /** Coût de la semence, €/ha. */
    semenceEurHa: number;
    /**
     * Part de l'azote absorbé par la culture qui QUITTE la parcelle dans le
     * grain (issue #201).
     *
     * Le reste — la paille, le chaume, les racines — est rendu au sol. Sans ce
     * champ, une céréale restituerait tout ce qu'elle a pris, y compris ce
     * qu'on vend, et le moteur rendrait l'exportation gratuite.
     *
     * Le blé est réputé pour son indice de récolte AZOTÉ élevé : l'essentiel de
     * l'azote absorbé finit dans le grain, bien plus que la part de biomasse
     * que le grain représente. C'est d'ailleurs le pendant du C/N de 90 de sa
     * paille — ce qui reste au champ est riche en carbone et pauvre en azote,
     * et c'est la même observation vue des deux côtés *(à confirmer)*.
     */
    azoteDansLeGrain: number;
  };
  /**
   * CE QUE L'ESPÈCE REND AU SOL (issue #201).
   *
   * La strate basse ne rendait RIEN. Mesuré avant ce lot, une prairie
   * spontanée à 0,95 de couverture sur limon riche : le stock d'humus perd
   * 42 % en cinquante ans et la litière reste à 0,00 les deux mille six cents
   * semaines. Park Grass, prairie permanente non fertilisée depuis 1856, tient
   * son stock. Une prairie ne se décarbonise pas — c'est même le couvert qui
   * en stocke le plus vite dans l'horizon de surface.
   *
   * Le seul retour qui existait était celui de la FAUCHE, et il portait deux
   * nombres nus (`coupe * 4` et `* 25`) qui sont devenus les constantes
   * nommées de ce bloc, à la valeur près : la fauche n'a pas bougé d'un
   * gramme.
   */
  /**
   * Hauteur du FEUILLAGE en pleine végétation, m (issue #210).
   *
   * **Elle ne sert qu'à une chose, et il faut la lire pour ce qu'elle est :
   * faire de l'ombre à ce qui est plus court.** Ce fichier écrit plus haut qu'il
   * n'y a « pas de hiérarchie de hauteur » entre herbacées, et ça ne change
   * pas : une graminée haute ne déloge toujours pas une rosette, la concurrence
   * dans la strate se joue sur la place LIBRE. Ce que ce trait ajoute est
   * l'ombre portée sur la strate LIGNEUSE — un plant de trente centimètres dans
   * un dactyle de soixante-dix est à l'ombre, et le moteur ne le disait pas.
   *
   * C'est la hauteur des FEUILLES, pas celle des épis : ce sont elles qui
   * interceptent. Un dactyle monte ses chaumes à 1,40 m et porte son limbe à
   * 0,70 ; c'est 0,70 qui ombrage un semis.
   */
  hauteurFeuillageM: number;
  litiere: {
    /**
     * Rapport C/N de la litière de l'espèce.
     *
     * C'est le trait qui décide si un résidu NOURRIT la culture suivante ou
     * lui VOLE son azote, et l'écart entre les deux bouts est énorme : une
     * feuille tendre de vernale se minéralise en quelques semaines, une paille
     * de blé immobilise l'azote du sol pendant un an avant de le rendre.
     * Ordres de grandeur usuels : feuillage herbacé jeune 15-25, foin de
     * graminée 25-40, paille de céréale 80-100 *(à confirmer)*.
     */
    cSurN: number;
  };
  /**
   * **L'AZOTE DU GRAIN N'EST PAS COMPTÉ À LA MOISSON, et c'est voulu.** Il est
   * déjà sorti du sol pendant la saison, par le prélèvement de la strate
   * (`tick.ts`, pondéré par `exigenceMinerale`), et la strate ne rend pas de
   * litière. Le recompter à la récolte le ferait disparaître deux fois — ce
   * que la propriété de conservation attraperait (#115). Ce qui manque
   * vraiment est le retour de la PAILLE, qui reste au champ et devrait rendre
   * son azote : c'est une dette de ce lot, écrite ici pour ne pas être oubliée.
   */
  sources: string[];
}

const SHIRREFFS_1985 =
  "Shirreffs 1985, Biological Flora of the British Isles: Anemone nemorosa L., Journal of Ecology 73:1005-1020 (Grande-Bretagne)";
const BEDDOWS_1959 =
  "Beddows 1959, Biological Flora of the British Isles: Dactylis glomerata L., Journal of Ecology 47:223-239 (Grande-Bretagne)";
const ARTRU_2019 =
  "Artru et al. 2019, Wheat and barley can increase grain yield in shade through acclimation of physiological and morphological traits in Mediterranean conditions, Scientific Reports 9:9834 (serre irriguée, Espagne centrale)";
const DUPRAZ_CAPILLON =
  "Dupraz & Capillon, L'agroforesterie, INRAE Montpellier (essai de Restinclières, noyer x blé dur, Hérault)";
const ROTHAMSTED_BROADBALK =
  "Rothamsted, essai de Broadbalk (blé continu depuis 1843, le plus ancien essai agronomique au monde) : parcelles sans aucun apport ~1 t/ha tenues sur 170 ans, parcelles pleinement fumées 8-9 t/ha (e-RA, dataset 03-OAWWYields)";
const AGRESTE_BLE =
  "Agreste, statistique agricole annuelle : rendement moyen français du blé tendre d'hiver, ordre de 7 t/ha sur la dernière décennie";
const TAYLOR_2001 =
  "Taylor, Rowland & Jones 2001, Biological Flora of the British Isles: Molinia caerulea (L.) Moench, Journal of Ecology 89:126-144 (Grande-Bretagne)";

/**
 * TROIS espèces, contrastées sur les axes que le moteur sait déjà lire : la
 * lumière, le pH, le calendrier et la température de départ. Trois, et pas
 * trente : la strate tourne sur toutes les cellules toutes les semaines, et le
 * coût se paye sur toute la suite de tests.
 *
 * Ce ne sont pas trois espèces « représentatives » : ce sont trois STRATÉGIES
 * qu'on voulait pouvoir opposer — la vernale qui vit avant la canopée, la
 * graminée sociale qui étouffe les plantations sur sol riche, et celle qui fait
 * la même chose sur sol acide. La rudérale nitrophile manque, et il faudra
 * d'abord que la capacité lise l'azote.
 */
export const HERBACEES: readonly HerbaceeV0[] = [
  {
    id: "anemone_nemorosa",
    nom: "Anémone des bois",
    nomLatin: "Anemone nemorosa",
    // Géophyte de sous-bois : elle sature autour du quart de la pleine
    // lumière, l'ordre de grandeur des plantes d'ombre *(à calibrer)*.
    lumiere: { compensation: 0.02, saturation: 0.25 },
    // Elle demande un sol frais — et n'est plus là quand l'été le dessèche
    // *(à calibrer)*.
    eau: { seuilConfort: 0.5 },
    // Sols bruns forestiers, humus doux (SHIRREFFS_1985 la décrit sur mull et
    // moder). La borne basse n'est pas cosmétique : elle tient l'anémone HORS
    // des podzols de lande, où elle n'a rien à faire — et on l'a appris en la
    // laissant à 4,0, ce qui installait une vernale sous les ajoncs girondins
    // et y renversait l'effet nurse. La borne haute est *à calibrer* : la
    // source donne un optimum, pas une gamme.
    ph: [4.5, 7.8],
    phenologie: {
      // Les feuilles sortent en février, la floraison suit en mars-avril
      // (SHIRREFFS_1985) : c'est la porte photopériodique qui commande à cette
      // date, pas la chaleur — d'où un forçage presque nul et un seuil de jour
      // très bas *(à calibrer)*.
      debutDJ: 10,
      seuilJourH: 9.5,
      // Le retrait est PROGRAMMÉ, achevé en juin : elle disparaît même dans une
      // trouée en plein soleil (SHIRREFFS_1985). L'automne la trouve donc
      // depuis longtemps rentrée.
      finDJ: 500,
      senescenceAutomnale: true,
      partPersistante: 0,
    },
    // Mars-avril, six à huit semaines (SHIRREFFS_1985). Elle n'a PAS de
    // nectaires : ses visiteurs — diptères, coléoptères, abeilles solitaires —
    // viennent pour le POLLEN. L'offre est donc réelle mais moindre que celle
    // d'une rosacée, et elle tombe très tôt, au moment où presque rien d'autre
    // n'est ouvert *(à calibrer : la source décrit les visiteurs, pas un
    // débit)*.
    floraison: { debutDJ: 60, dureeDJ: 300, nectar: 0.4 },
    // Elle travaille à deux ou trois degrés, quand la prairie attend : c'est là
    // tout son avantage *(à calibrer)*.
    exigenceMinerale: 1,
    tBaseCroissanceC: 2,
    // Le rhizome avance de quelques centimètres par an (SHIRREFFS_1985, ordre
    // de grandeur repris par la littérature des indicatrices de forêt
    // ancienne) : soit ~17 ans pour remplir un mètre carré depuis son bord,
    // étalés sur la quinzaine de semaines où elle végète *(à confirmer)*.
    vitesseInstallation: 0.004,
    // Une feuille d'anémone est tendre et disparaît en quelques semaines : elle
    // est du côté bas de la gamme du feuillage herbacé jeune *(à confirmer)*.
    // Géophyte de quelques centimètres : les flores donnent 5 à 25 cm, et son
    // limbe est étalé au ras du sol. Elle n'ombrage personne, et c'est le bon
    // témoin du mécanisme — une herbacée peut couvrir le sol sans le priver de
    // lumière *(à confirmer)*.
    hauteurFeuillageM: 0.15,
    litiere: { cSurN: 18 },
    sources: [SHIRREFFS_1985],
  },
  {
    id: "dactylis_glomerata",
    nom: "Dactyle aggloméré",
    nomLatin: "Dactylis glomerata",
    // Héliophile : c'est LA graminée qui étouffe une plantation sur sol riche.
    // Point de compensation et saturation REPRIS TELS QUELS du tapis moyen
    // d'avant ce lot (0,12 et 0,47 dans `herbe.ts`, calés sur « le tapis
    // disparaît sous un couvert fermé », ch4-A). Les relever parce que ce tapis
    // moyennait aussi des plantes d'ombre était tentant, et c'était déplacer
    // une calibration acquise : ce lot AJOUTE une espèce sous le plancher, il
    // ne déplace pas le plancher.
    lumiere: { compensation: 0.12, saturation: 0.47 },
    // Elle grille en été sur sol séchant. Seuil repris du tapis moyen (0,35
    // dans `herbe.ts`), pour la même raison que les seuils de lumière.
    eau: { seuilConfort: 0.35 },
    // Neutrophile à calcicole, absente des sols franchement acides
    // (BEDDOWS_1959 ; bornes *à calibrer*).
    ph: [4.8, 8.3],
    phenologie: {
      // Ni forçage ni porte : une hémicryptophyte n'a pas de bourgeon en
      // dormance à lever, elle repart dès qu'il fait assez chaud. C'est
      // `tBaseCroissanceC` qui le dit, et lui seul.
      debutDJ: 0,
      seuilJourH: 8,
      // Ni retrait programmé ni sénescence, pour la même raison : la touffe
      // passe l'hiver verte et repart au premier redoux — y compris en
      // novembre, sous un couvert caduc qui vient de s'ouvrir.
      //
      // C'est très exactement le tapis que `herbe.ts` faisait pousser avant ce
      // lot. Lui donner la phénologie des ligneux — une porte au printemps, une
      // sénescence à l'automne — lui coûtait un cinquième de sa couverture
      // annuelle sous futaie feuillue (0,61 contre 0,75 sur soixante ans), et
      // l'essentiel venait de la sénescence : la fenêtre qui compte pour une
      // graminée de sous-bois n'est pas avril, c'est OCTOBRE À MARS.
      senescenceAutomnale: false,
      partPersistante: 1,
    },
    exigenceMinerale: 1,
    tBaseCroissanceC: 4,
    // Elle talle : un semis couvre en une saison (BEDDOWS_1959). La valeur est
    // celle de la reconquête du tapis d'avant ce lot (0,12 par semaine de
    // pleine végétation), pour la même raison que ses seuils de lumière.
    vitesseInstallation: 0.12,
    // Foin de graminée : le milieu de la gamme, et la valeur que la fauche
    // portait en dur avant #201 — d'où une fauche inchangée au gramme près.
    // Touffe dense : le limbe monte à 50-80 cm en pleine végétation, les
    // chaumes florifères bien plus haut (jusqu'à 1,40 m). C'est le limbe qui
    // intercepte, d'où 0,70 *(à confirmer)*.
    hauteurFeuillageM: 0.7,
    litiere: { cSurN: 25 },
    sources: [BEDDOWS_1959],
  },
  {
    id: "molinia_caerulea",
    nom: "Molinie bleue",
    nomLatin: "Molinia caerulea",
    lumiere: { compensation: 0.12, saturation: 0.45 },
    // Même seuil que le dactyle : ce n'est pas par la sécheresse qu'elles se
    // séparent, c'est par le pH et par le calendrier *(à calibrer)*.
    eau: { seuilConfort: 0.35 },
    // Acidiphile stricte : landes et sols podzoliques (TAYLOR_2001 ; bornes
    // *à calibrer*).
    ph: [3.2, 6.2],
    phenologie: {
      // Démarrage NOTOIREMENT tardif — avril-mai — et sénescence complète à
      // l'automne : la lande vire au paille et sa touradon sèche devient le
      // combustible de l'hiver (TAYLOR_2001).
      debutDJ: 250,
      seuilJourH: 11.5,
      senescenceAutomnale: true,
      partPersistante: 0.25,
    },
    exigenceMinerale: 1,
    tBaseCroissanceC: 8,
    // Touffe, plus lente à couvrir qu'une graminée traçante *(à calibrer)*.
    vitesseInstallation: 0.05,
    // La molinie fait une touradon sèche et fibreuse qui tient l'hiver : plus
    // dure qu'un dactyle, et c'est ce qui fait la litière acide d'une lande
    // à molinie *(à confirmer)*.
    // Touradon de molinie : les feuilles font 40 à 80 cm, les hampes montent à
    // 1,50 m sur les stations fraîches. Même lecture que pour le dactyle, un
    // cran plus haut parce qu'elle fait des touffes hautes *(à confirmer)*.
    hauteurFeuillageM: 0.8,
    litiere: { cSurN: 38 },
    sources: [TAYLOR_2001],
  },
  {
    id: "triticum_aestivum",
    nom: "Blé tendre d'hiver",
    nomLatin: "Triticum aestivum",
    /**
     * **LA SATURATION EST LE CHIFFRE DU LOT, et elle vient d'une mesure
     * contre-intuitive.** Je supposais « moins de lumière, moins de grain ».
     * En Méditerranée, blé et orge font +19 % de rendement à 50 %
     * d'éclairement, et le MÊME +19 % à 90 % : un plateau (ARTRU_2019, serre
     * IRRIGUÉE — ce n'est donc pas une économie d'eau, c'est un excès de
     * lumière au départ). Les auteurs disent explicitement que dans les
     * régions moins ensoleillées, l'ombre fait baisser le rendement.
     *
     * Une saturation à 0,5 reproduit ce plateau sans un mécanisme de plus.
     *
     * **LIMITE, et il faut la lire avant d'exploiter un chiffre du nord** : la
     * lumière du moteur est une FRACTION de la pleine lumière locale, pas un
     * éclairement absolu. Dire 0,5 revient donc à dire « la moitié du soleil
     * d'ici suffit au blé » PARTOUT — ce qui est juste dans le Midi, d'où
     * viennent les deux ancres de ce lot, et trop généreux sur le plateau
     * picard. Rendre la saturation absolue demande le rayonnement de la
     * station, et c'est un lot à part.
     *
     * Le point de compensation, lui, est celui d'une héliophile stricte : sous
     * un cinquième de la pleine lumière, une céréale ne fait plus de grain
     * *(à calibrer)*.
     */
    lumiere: { compensation: 0.2, saturation: 0.5 },
    // Elle souffre de la sécheresse comme les graminées, et plus tôt : le
    // remplissage du grain se joue en juin *(à calibrer)*.
    eau: { seuilConfort: 0.4 },
    // Neutrophile : le blé veut un sol chaulé, il décroche sous 5,5
    // *(bornes à calibrer)*.
    ph: [5.2, 8.3],
    phenologie: {
      // Semée en octobre, elle lève avant l'hiver, passe la mauvaise saison en
      // rosette et repart au premier redoux : ni forçage ni porte
      // photopériodique, comme le dactyle, et pour la même raison — il n'y a
      // pas de bourgeon en dormance à lever.
      debutDJ: 0,
      seuilJourH: 8,
      // Elle MÛRIT, elle ne sénesce pas : le retrait est programmé, comme chez
      // une vernale, sauf qu'il s'appelle la maturation et qu'il finit à la
      // moisson.
      finDJ: 1250,
      senescenceAutomnale: false,
      partPersistante: 0,
    },
    tBaseCroissanceC: 3,
    // Elle ne conquiert RIEN : son emprise est posée par le semis.
    vitesseInstallation: 0,
    /**
     * Dix fois une essence forestière. Le commentaire d'`especes.ts` le
     * réservait depuis longtemps : « une céréale ou un maraîchage seraient à
     * dix ou vingt ». C'est ce nombre qui fait qu'un blé a faim là où un chêne
     * se contente, et donc que la concurrence pour l'azote se voie.
     */
    exigenceMinerale: 10,
    culture: {
      /**
       * Le rendement SANS AUCUN FACTEUR LIMITANT — ni lumière, ni eau, ni
       * azote. Ce n'est donc pas la moyenne française (7 t/ha), qui est déjà
       * une moyenne de parcelles fertilisées et diversement limitées : c'est
       * le plafond que les parcelles pleinement fumées de BROADBALK
       * atteignent, 8 à 9 t/ha (ROTHAMSTED_BROADBALK).
       *
       * Et le même essai fournit la VALIDATION, sur un autre chiffre : ses
       * parcelles sans aucun apport tiennent ~1 t/ha depuis 1843. Le moteur
       * n'a pas d'action de fertilisation, donc un blé continu doit y
       * descendre de lui-même — ce qui se vérifie et ne se cale pas.
       */
      rendementMaxTHa: 9,
      // Ordre de grandeur des dernières campagnes *(à calibrer : le prix du
      // blé varie du simple au double d'une année à l'autre, et le moteur n'a
      // pas de marché céréalier)*.
      prixEurT: 200,
      // Semis mi-octobre, moisson mi-juillet.
      semisWeek: 41,
      recolteWeek: 28,
      // Un semis se fait à 1 ha/h avec un combiné, une moisson guère plus
      // lentement *(à calibrer)*.
      heuresSemisHa: 1.5,
      heuresRecolteHa: 1,
      semenceEurHa: 90,
      azoteDansLeGrain: 0.75,
    },
    // **La paille de blé, et c'est le trait le plus conséquent du bloc.** Son
    // C/N est célèbre pour son effet : à 90, elle IMMOBILISE l'azote du sol
    // le temps que les micro-organismes la digèrent, et ne le rend qu'ensuite.
    // Enfouir une paille sans apport d'azote fait donc baisser la culture
    // suivante avant de la faire monter — c'est un fait d'agronomie que le
    // moteur ne pouvait pas produire tant que la paille n'existait pas
    // *(à confirmer)*.
    // Blé tendre moderne : les variétés semi-naines plafonnent à 70-90 cm,
    // paille comprise. La distinction limbe/épi n'a pas de sens ici — un blé
    // est un couvert plein sur toute sa hauteur.
    hauteurFeuillageM: 0.8,
    litiere: { cSurN: 90 },
    sources: [ROTHAMSTED_BROADBALK, AGRESTE_BLE, ARTRU_2019, DUPRAZ_CAPILLON],
  },
];

/** Combien d'espèces : la longueur d'un « paquet » dans les tableaux à plat. */
export const N_HERBACEES = HERBACEES.length;

/** Hauteurs de feuillage, rangées une fois dans l'ordre de `HERBACEES`. */
const HAUTEURS_FEUILLAGE = HERBACEES.map((h) => h.hauteurFeuillageM);

/**
 * Extinction de la lumière sous un couvert herbacé PLEIN, sans dimension.
 *
 * Loi de Beer-Lambert, la même forme que pour les houppiers (`light.ts`) :
 * `transmission = exp(−k × opacité)`, où l'opacité est la part du couvert qui
 * passe au-dessus du sujet. Sous une prairie fermée en pleine végétation, les
 * relevés au ras du sol donnent deux à dix pour cent de la lumière incidente ;
 * cinq pour cent, soit k = 3, situe le moteur au milieu *(à confirmer)*.
 */
export const EXTINCTION_HERBE = 3;

/**
 * Ce qu'un couvert herbacé laisse à une tige LIGNEUSE de hauteur donnée, ∈ [0,1]
 * (issue #210).
 *
 * **Le moteur ne disputait à un jeune plant que l'AZOTE et l'EAU** : il faisait
 * pousser un semis de trente centimètres au plein soleil au milieu d'une
 * molinie d'un mètre. Mesuré, faucher autour d'un pin sur lande ne lui rendait
 * que deux pour cent de hauteur à douze ans — trois et demi en fauchant chaque
 * année —, quand le dégagement est le premier facteur de réussite d'une
 * plantation sur le terrain.
 *
 * Chaque espèce n'intercepte que la part d'elle-même qui DÉPASSE la tige :
 * `max(0, 1 − h / H)`. Une tige plus haute que tout le tapis reçoit exactement
 * ce qu'elle recevait avant ce lot, au bit près — c'est le témoin d'identité du
 * mécanisme, et il est structurel, pas mesuré.
 *
 * Aucune espèce n'est nommée : le trait tranche, et l'anémone le prouve — elle
 * couvre le sol d'un tapis continu en avril sans ombrager quoi que ce soit,
 * parce qu'elle fait quinze centimètres.
 */
export function lumiereSousLHerbe(
  hauteurTigeM: number,
  feuillage: readonly number[],
  base: number,
): number {
  let opacite = 0;
  for (let s = 0; s < N_HERBACEES; s++) {
    const hauteur = HAUTEURS_FEUILLAGE[s] ?? 0;
    if (hauteur <= 0) continue;
    const part = feuillage[base + s] ?? 0;
    if (part <= 0) continue;
    const dessus = 1 - hauteurTigeM / hauteur;
    if (dessus <= 0) continue;
    opacite += part * dessus;
  }
  if (opacite <= 0) return 1;
  return Math.exp(-EXTINCTION_HERBE * opacite);
}

/**
 * Sur combien de degrés-jours l'appareil végétatif se déploie, une fois parti.
 * Moins de la moitié des 90 °C·j d'un houppier (`phenologie.ts`) : une touffe
 * d'herbe sort plus vite qu'un arbre *(à calibrer)*.
 */
export const ETALEMENT_DEPART_DJ = 40;
/**
 * Sur combien de degrés-jours une vernale se retire, une fois son terme
 * atteint : deux à trois semaines de printemps *(à calibrer)*.
 */
export const ETALEMENT_RETRAIT_DJ = 150;
/**
 * Vitesse de repli de l'EMPRISE quand la station ne porte plus l'espèce, par
 * semaine de pleine vigueur. Reprise telle quelle de `herbe.ts` : le tapis
 * reculait déjà à 0,2 par semaine, et rien dans ce lot ne justifie de la
 * changer.
 */
export const REGRESSION_PAR_SEMAINE = 0.2;
/**
 * Vitesse à laquelle le FEUILLAGE rattrape ce que l'emprise et la saison lui
 * permettent, par semaine : la repousse après une coupe, une dent ou un feu.
 *
 * Elle ne dépend pas de l'espèce, à la différence de la conquête du sol : un
 * chaume repousse, un rhizome avance. Elle est plus RAPIDE — une pelouse
 * fauchée se referme en un mois, un sol nu met une saison *(à calibrer)*.
 *
 * Et elle doit l'être : `herbe.ts` faisait tout d'un coup, à 0,12 par semaine.
 * Couper le même trajet en deux étapes SÉRIELLES au même rythme le rend deux
 * fois plus lent, ce qui se voyait — le tapis d'une futaie feuillue perdait un
 * dixième de sa couverture annuelle sans qu'aucune cause écologique n'ait
 * bougé.
 */
export const REPOUSSE_PAR_SEMAINE = 0.25;

/**
 * Inertie de la RESSOURCE FLORALE vécue, par semaine (#70). Même forme que
 * l'humidité vécue de `herbe.ts`, et pour une raison du même ordre : ce qui
 * décide n'est pas ce qui est ouvert aujourd'hui, c'est ce qui l'a été.
 *
 * 0,15 donne une constante de temps d'environ sept semaines — l'ordre de
 * grandeur d'une génération de pollinisateur, et donc le délai avec lequel une
 * population suit sa table *(à calibrer : les sources donnent des durées de
 * développement par espèce, pas un temps de réponse de communauté)*.
 */
/**
 * Ce qu'il faut d'offre OUVERTE dans une cellule pour que les insectes y
 * trouvent à manger — au-delà, la table est garnie et en rajouter ne nourrit
 * personne de plus (#70).
 *
 * Sans ce seuil, la mémoire florale mesure une QUANTITÉ de nectar et non une
 * ADÉQUATION, et elle reste basse partout : mesuré à 0,10 dans le meilleur cas
 * du banc, contre un habitat à 0,5 — le minimum des deux ne départageait donc
 * plus rien, il remplaçait l'habitat. Avec le seuil, la mémoire devient la
 * PART DE LA SAISON pendant laquelle la cellule a eu de quoi nourrir, qui est
 * une grandeur sans dimension et comparable à l'habitat.
 *
 * 0,25 : un arbuste mellifère en pleine fleur au-dessus de la cellule
 * (aubépine, nectar 0,9) la nourrit largement, un quart de cellule de vernale
 * la nourrit à peu près *(à calibrer — aucune source ne donne un débit de
 * nectar par mètre carré)*.
 */
export const OFFRE_FLORALE_SUFFISANTE = 0.25;

export const INERTIE_RESSOURCE_FLORALE = 0.15;

const borne = (x: number) => Math.min(1, Math.max(0, x));

/**
 * VIGUEUR ∈ [0,1] : où en est l'espèce dans sa saison de croissance. Zéro veut
 * dire dormante — et une espèce dormante ne gagne ni ne perd de terrain.
 *
 * Le calcul suit celui du feuillage des arbres (`partFoliaireActive`) : un
 * forçage en degrés-jours, une porte photopériodique qui ne s'applique qu'au
 * printemps, et une sortie — programmée pour les vernales, commandée par la
 * photopériode pour les autres.
 */
export function vigueurHerbacee(h: HerbaceeV0, ctx: ContextePhenologique): number {
  const p = h.phenologie;
  let v = borne((ctx.ddYearBase5 - p.debutDJ) / ETALEMENT_DEPART_DJ);
  // La porte ne vaut qu'au printemps : onze heures de jour en mars ne veulent
  // pas dire la même chose qu'en octobre (phenologie.ts).
  if (!ctx.automne) v = Math.min(v, borne((ctx.jourH - p.seuilJourH) / LARGEUR_PORTE_H));
  if (p.finDJ !== undefined) {
    v = Math.min(
      v,
      borne((p.finDJ + ETALEMENT_RETRAIT_DJ - ctx.ddYearBase5) / ETALEMENT_RETRAIT_DJ),
    );
  } else if (p.senescenceAutomnale && ctx.automne && ctx.jourH <= SEUIL_SENESCENCE_H) {
    v = Math.min(v, borne(1 - ctx.semainesDepuisSenescence / ETALEMENT_CHUTE_SEMAINES));
  }
  return v;
}

/**
 * PART SAISONNIÈRE ∈ [0,1] : ce que l'espèce déploie à cette date de l'année,
 * sécheresse mise à part. C'est la vigueur, relevée par ce qui reste en place
 * hors saison — touffes, chaumes, feuilles d'hiver. Le plancher joue comme
 * celui des semi-persistants chez les arbres : il vaut en mars comme en
 * décembre.
 *
 * Elle ne dépend que du calendrier : une seule valeur par espèce pour toute la
 * parcelle, que l'appelant calcule une fois par semaine.
 */
export function partSaisonniere(h: HerbaceeV0, ctx: ContextePhenologique): number {
  return Math.max(h.phenologie.partPersistante, vigueurHerbacee(h, ctx));
}

/**
 * Ce que la sécheresse de surface laisse du feuillage ∈ [0,1].
 *
 * Elle joue sur ce qui est VERT, pas sur l'emprise : un été sec grille le
 * tapis, il ne tue pas les souches. C'est le partage qui donne son sens aux
 * deux grandeurs — la lumière et le pH décident de qui TIENT le sol, sur des
 * années ; l'eau décide de ce qu'on en VOIT, cette semaine. La faire porter
 * sur l'emprise faisait disparaître la molinie d'une lande à chaque été, pour
 * la faire repartir de rien au printemps suivant : mesuré, et faux.
 */
export function facteurEauHerbacee(h: HerbaceeV0, humiditeVecue: number): number {
  return Math.min(1, humiditeVecue / h.eau.seuilConfort);
}

/**
 * ACTIVITÉ ∈ [0,1] : la part de son emprise que l'espèce COUVRE réellement
 * cette semaine, saison et sécheresse comprises.
 */
export function activiteHerbacee(
  h: HerbaceeV0,
  ctx: ContextePhenologique,
  humiditeVecue: number,
): number {
  return partSaisonniere(h, ctx) * facteurEauHerbacee(h, humiditeVecue);
}

/**
 * Facteur thermique de la semaine ∈ [0,1] : à quelle vitesse la végétation
 * travaille. Une vernale démarre au froid, une molinie attend la chaleur — la
 * strate n'a plus une seule saison, elle en a une par espèce.
 */
export function facteurThermique(h: HerbaceeV0, tMeanC: number): number {
  return borne((tMeanC - h.tBaseCroissanceC) / 8);
}

/**
 * CAPACITÉ ∈ [0,1] : la part de sol que l'espèce pourrait TENIR dans cette
 * cellule, si elle y était seule. Deux facteurs de station seulement, et tous
 * deux durables : la lumière qui arrive au sol et le pH. La sécheresse n'y est
 * pas — elle est dans l'activité, parce qu'elle grille un feuillage sans
 * déloger une souche.
 */
export function capaciteHerbacee(h: HerbaceeV0, lumiereAuSol: number, ph: number): number {
  const parLumiere = borne(
    (lumiereAuSol - h.lumiere.compensation) / (h.lumiere.saturation - h.lumiere.compensation),
  );
  return parLumiere * facteurGammePh(h.ph, ph);
}

/**
 * Vitesses d'installation, à plat. La strate tourne sur toutes les cellules
 * toutes les semaines : aller relire la fiche à chaque cellule se paie sur
 * toute la suite de tests.
 */
const VITESSES = HERBACEES.map((h) => h.vitesseInstallation);
/**
 * Qui est une CULTURE, précalculé : la question se pose pour chaque espèce et
 * chaque cellule, toutes les semaines.
 */
const EST_CULTURE = HERBACEES.map((h) => h.culture !== undefined);

/**
 * Les cultures, rangées une fois : leur indice dans `HERBACEES` et la durée de
 * leur cycle. La boucle du tick les parcourt toutes les semaines et dans
 * toutes les cellules — la balayer en entier pour trouver les deux ou trois
 * qui comptent se paierait.
 */
export const INDEX_CULTURES = HERBACEES.map((h, i) => (h.culture ? i : -1)).filter((i) => i >= 0);
export const N_CULTURES = INDEX_CULTURES.length;

/** La fiche est-elle celle d'une culture semée, plutôt que d'une spontanée ? */
export function estCulture(h: HerbaceeV0): boolean {
  return h.culture !== undefined;
}

/**
 * Le GRAIN est la moyenne des facteurs limitants, PONDÉRÉE PAR LE FEUILLAGE
 * (#136) — et cette forme-là ne demande aucune constante à caler.
 *
 * Le premier jet divisait le cumul par le nombre de semaines de culture, ce qui
 * suppose un feuillage plein d'un bout à l'autre de la saison. Aucun blé ne
 * fait ça : il lève à l'automne, passe l'hiver en rosette et mûrit en juin.
 * Mesuré, le plafond de la fiche devenait inatteignable par construction —
 * 1,1 t/ha là où la fiche annonce 7 — et « rendement maximal » ne voulait plus
 * dire ce que son commentaire promettait.
 *
 * La bonne grandeur est un RAPPORT. On cumule d'un côté ce que la plante a
 * réellement assimilé — son feuillage, multiplié par ce que la station lui
 * permet et par ce que l'azote lui laisse —, de l'autre ce qu'elle aurait
 * assimilé sans aucune limite, c'est-à-dire son feuillage seul. Le quotient
 * vaut 1 pour une culture que rien ne bride, et `rendementMaxTHa` retrouve
 * exactement le sens que la fiche lui donne.
 */
export function grainDeLaSemaine(
  feuillage: number,
  facteurLumiere: number,
  facteurAzote: number,
): { assimile: number; potentiel: number } {
  return { assimile: feuillage * facteurLumiere * facteurAzote, potentiel: feuillage };
}

/** Le rendement, en part du maximum de la fiche : le quotient des deux cumuls. */
export function partDuRendement(assimileCum: number, potentielCum: number): number {
  return potentielCum > 0 ? assimileCum / potentielCum : 0;
}

/**
 * Nombre de semaines entre le semis et la moisson, en tenant compte du passage
 * par le 1ᵉʳ janvier : une céréale d'HIVER est semée en semaine 41 et moissonnée
 * en semaine 28 de l'année suivante.
 */
export function semainesDeCulture(semisWeek: number, recolteWeek: number): number {
  const d = recolteWeek - semisWeek;
  return d > 0 ? d : d + 52;
}

/** La durée du cycle de chaque culture, dans l'ordre d'`INDEX_CULTURES`. */
export const SEMAINES_DE_CULTURE = INDEX_CULTURES.map((i) => {
  const c = HERBACEES[i]?.culture;
  return c ? semainesDeCulture(c.semisWeek, c.recolteWeek) : 1;
});

/**
 * Tampon des demandes d'une cellule. Vit ici, hors de la fonction, pour la même
 * raison : une allocation par cellule et par semaine coûterait plus que le
 * mécanisme. Le moteur est mono-thread, la fonction s'en sert et le laisse
 * derrière elle.
 */
const demandes = new Array<number>(N_HERBACEES).fill(0);

/**
 * Fait évoluer d'une semaine les emprises d'UNE cellule, en place.
 *
 * `emprises` est le tableau à plat de la partie (nCells × N_HERBACEES),
 * `base = i × N_HERBACEES` ; `capacites`, `vigueurs` et `facteursThermiques`
 * sont des tampons de taille N_HERBACEES que l'appelant réutilise d'une cellule
 * à l'autre.
 *
 * Le sol est fini, et la conquête se fait sur la PLACE LIBRE : chacune
 * commence par lâcher ce qu'elle ne peut plus tenir — ce terrain devient libre
 * pour les autres, dans la semaine —, puis les prétendantes se partagent ce
 * qui reste au prorata de ce qu'elles savent prendre. D'une trouée que les deux
 * convoitent, une graminée qui talle à 0,10 par semaine emporte donc vingt-cinq
 * fois plus qu'un rhizome qui avance à 0,004 — et c'est ce qui tient une vernale
 * hors d'une prairie fermée sans qu'on ait eu à l'écrire.
 *
 * Le partage ne dépend pas de l'ordre de déclaration dans l'atlas : repli et
 * conquête sont deux ensembles disjoints d'espèces, et la part se calcule sur
 * des totaux. Un partage qui dépendrait de cet ordre serait un cas particulier
 * déguisé.
 */
export function evoluerEmprises(
  emprises: number[],
  base: number,
  capacites: readonly number[],
  vigueurs: readonly number[],
  facteursThermiques: readonly number[],
): void {
  let libre = 1;
  for (let s = 0; s < N_HERBACEES; s++) libre -= emprises[base + s] ?? 0;

  let demandeTotale = 0;
  for (let s = 0; s < N_HERBACEES; s++) {
    demandes[s] = 0;
    // **UNE CULTURE NE JUGE PAS SA STATION** (#136). Son emprise est posée au
    // semis et remise à zéro à la moisson ; rien entre les deux ne la fait
    // bouger, ni la conquête ni le repli. Un blé à l'ombre ne perd pas son
    // emprise, il perd son GRAIN — et c'est `croissanceDuGrain` qui le dit.
    if (EST_CULTURE[s]) continue;
    const vigueur = vigueurs[s] ?? 0;
    // Dormante : ni gain ni perte. C'est de là que sort la fenêtre vernale —
    // une espèce ne juge sa station que pendant sa saison de croissance.
    if (vigueur <= 0) continue;
    const emprise = emprises[base + s] ?? 0;
    const capacite = capacites[s] ?? 0;
    if (capacite < emprise) {
      const perte = Math.min(emprise - capacite, REGRESSION_PAR_SEMAINE * vigueur);
      emprises[base + s] = emprise - perte;
      libre += perte;
    } else {
      const vitesse = (VITESSES[s] ?? 0) * vigueur * (facteursThermiques[s] ?? 0);
      const demande = Math.min(capacite - emprise, vitesse);
      demandes[s] = demande;
      demandeTotale += demande;
    }
  }

  if (demandeTotale <= 0) return;
  const part = demandeTotale > libre ? Math.max(0, libre) / demandeTotale : 1;
  for (let s = 0; s < N_HERBACEES; s++) {
    const gain = (demandes[s] ?? 0) * part;
    if (gain > 0) emprises[base + s] = (emprises[base + s] ?? 0) + gain;
  }
}

/**
 * Fait suivre le FEUILLAGE d'une cellule : il vise ce que l'emprise, la saison
 * et l'humidité lui permettent, et il y monte à la vitesse de repousse.
 *
 * La montée est freinée par le FROID : une feuille se fabrique avec de la
 * chaleur, et une pelouse rasée en décembre attend mars pour se refermer. Sans
 * ce frein, le tapis rattrapait en plein hiver ce qu'une dent de chevreuil lui
 * avait pris, et se remettait à faire des vagues d'une semaine sur l'autre —
 * mesuré, et corrigé.
 *
 * À la descente il n'y a rien à amortir : la cible porte déjà la sénescence et
 * le grillage, tous deux progressifs.
 */
export function suivreFeuillage(
  feuillage: number[],
  emprises: number[],
  base: number,
  partsSaisonnieres: readonly number[],
  facteursEau: readonly number[],
  facteursThermiques: readonly number[],
): void {
  for (let s = 0; s < N_HERBACEES; s++) {
    const cible = (emprises[base + s] ?? 0) * (partsSaisonnieres[s] ?? 0) * (facteursEau[s] ?? 0);
    const actuel = feuillage[base + s] ?? 0;
    if (cible <= actuel) {
      // Une feuille ne disparaît pas non plus du jour au lendemain : elle
      // jaunit, elle grille, elle se couche. Même vitesse de repli que le
      // tapis d'avant ce lot — laisser la chute être INSTANTANÉE rendait le
      // tapis asymétrique (chute immédiate, repousse en huit semaines) et lui
      // faisait perdre un dixième de couverture moyenne sur soixante ans.
      feuillage[base + s] = Math.max(cible, actuel - REGRESSION_PAR_SEMAINE);
      continue;
    }
    const pas = REPOUSSE_PAR_SEMAINE * (facteursThermiques[s] ?? 0);
    feuillage[base + s] = Math.min(cible, actuel + pas);
  }
}

/**
 * Rabat toutes les espèces d'une cellule au même facteur, dans le tableau
 * qu'on lui donne.
 *
 * Appelée sur le FEUILLAGE par la fauche, le feu et le broutage : ils
 * emportent ce qui est sorti et laissent le sol reprendre. Appelée en plus sur
 * l'EMPRISE par le labour, et par lui seul — la charrue retourne les bulbes et
 * tranche les rhizomes, c'est le seul geste du jeu qui aille les chercher sous
 * terre.
 */
export function rabattreParEspece(parEspece: number[], base: number, facteur: number): void {
  for (let s = 0; s < N_HERBACEES; s++) {
    parEspece[base + s] = (parEspece[base + s] ?? 0) * facteur;
  }
}

/**
 * Répartition d'un enherbement de DÉPART entre les espèces, pour une cellule.
 *
 * La station ne dit qu'un taux (`herbeInitiale`) : à charge pour l'atlas de
 * dire qui le compose. On le pondère par la capacité EN TERRAIN DÉCOUVERT
 * — toutes les stations de départ le sont — multipliée par la vitesse
 * d'installation : ce qui couvre une friche au premier jour, c'est ce qui
 * s'installe vite. Une anémone n'y tient donc presque rien, ce qui est la
 * bonne réponse : c'est une colonisatrice lente, et sa présence dans un
 * boisement se gagne en décennies.
 */
export function empriseInitiale(herbeInitiale: number, ph: number): number[] {
  const poids = HERBACEES.map((h) => capaciteHerbacee(h, 1, ph) * h.vitesseInstallation);
  const somme = poids.reduce((a, b) => a + b, 0);
  if (somme <= 0) return HERBACEES.map(() => 0);
  return poids.map((p) => (herbeInitiale * p) / somme);
}
