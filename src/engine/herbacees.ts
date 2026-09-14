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
   * °C moyenne hebdomadaire à partir de laquelle la végétation démarre. Une
   * vernale pousse au froid — c'est même tout son avantage —, une molinie
   * attend la chaleur.
   */
  tBaseCroissanceC: number;
  /**
   * Gain d'emprise par semaine de pleine vigueur, en part de cellule. C'est la
   * vitesse de CONQUÊTE d'un sol libre, et elle sépare radicalement une
   * graminée qui talle d'un rhizome qui avance de quelques centimètres par an.
   */
  vitesseInstallation: number;
  sources: string[];
}

const SHIRREFFS_1985 =
  "Shirreffs 1985, Biological Flora of the British Isles: Anemone nemorosa L., Journal of Ecology 73:1005-1020 (Grande-Bretagne)";
const BEDDOWS_1959 =
  "Beddows 1959, Biological Flora of the British Isles: Dactylis glomerata L., Journal of Ecology 47:223-239 (Grande-Bretagne)";
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
    // Elle travaille à deux ou trois degrés, quand la prairie attend : c'est là
    // tout son avantage *(à calibrer)*.
    tBaseCroissanceC: 2,
    // Le rhizome avance de quelques centimètres par an (SHIRREFFS_1985, ordre
    // de grandeur repris par la littérature des indicatrices de forêt
    // ancienne) : soit ~17 ans pour remplir un mètre carré depuis son bord,
    // étalés sur la quinzaine de semaines où elle végète *(à confirmer)*.
    vitesseInstallation: 0.004,
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
    tBaseCroissanceC: 4,
    // Elle talle : un semis couvre en une saison (BEDDOWS_1959). La valeur est
    // celle de la reconquête du tapis d'avant ce lot (0,12 par semaine de
    // pleine végétation), pour la même raison que ses seuils de lumière.
    vitesseInstallation: 0.12,
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
    tBaseCroissanceC: 8,
    // Touffe, plus lente à couvrir qu'une graminée traçante *(à calibrer)*.
    vitesseInstallation: 0.05,
    sources: [TAYLOR_2001],
  },
];

/** Combien d'espèces : la longueur d'un « paquet » dans les tableaux à plat. */
export const N_HERBACEES = HERBACEES.length;

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
