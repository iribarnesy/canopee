/**
 * État du jeu : une station, une grille de sol 1 m² (eau + azote par cellule),
 * des arbres positionnés. Chaque étape de la feuille de route
 * (docs/regles.md §17) enrichit ces types.
 */

import type { EconomyState } from "./actions";
import { createEconomy } from "./actions";
import {
  CALCIUM_NEUTRE_MG_G,
  capaciteEchangeEqM2,
  capaciteEchangeProfondeEqM2,
  saturationDepuisPh,
} from "./bases";
import type { CarbonState } from "./carbon";
import { createCarbonState, T_HA_TO_G_M2 } from "./carbon";
import type { EauDeSurface } from "./eau_surface";
import { getEspece } from "./especes";
import type { IndividuFaune } from "./faune";
import type { GridDims } from "./grid";
import { cellCount } from "./grid";
import { empriseInitiale, N_HERBACEES } from "./herbacees";
import { stockEquilibreMm, stocksEquilibreParCellule } from "./nappe";
import { KG_PER_HA_TO_G_PER_M2 } from "./nitrogen";
import type { Bordures } from "./paysage";
import type { Relief } from "./relief";
import { altitudeParCellule } from "./relief";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import type { Horizon, SoilProfile } from "./soil";
import { profondeurPenetrableCm, ruHorizonMm } from "./soil";
import {
  diametreInitialCm,
  profondeurRacinesCm,
  type TreeState,
  tirerVigueurIndividuelle,
} from "./trees";

/** Paramètres immuables de la station (extrait V0 de docs/regles.md §2). */
export interface Station {
  id: string;
  nom: string;
  latitudeDeg: number;
  /**
   * Profil de sol : la description PHYSIQUE dont tout le reste est dérivé
   * (soil.ts). Les champs qui suivent sont calculés, jamais saisis.
   */
  profil: SoilProfile;
  /** réserve utile du sol, mm (dérivée de texture × profondeur en V1) */
  ruMm: number;
  /** porosité de drainage (eau gravitaire max avant débordement), mm */
  excessCapacityMm: number;
  /** vitesse max de drainage, mm/semaine (conductivité du sol) */
  drainagePerWeekMm: number;
  /** minéralisation potentielle de l'humus, kg N/ha/semaine en conditions optimales */
  mineralizationPotentialKgHaWeek: number;
  /** azote minéral au démarrage, kg/ha */
  initialMineralNKgHa: number;
  /** stock initial de carbone du sol (humus), t C/ha — LE gros stock (§12) */
  initialSoilCTHa: number;
  /** pH initial du sol (nuancier acidiphile→calcicole des espèces, atlas) */
  phInitial: number;
  /** remontée capillaire de nappe, mm/semaine (0 = pas de nappe accessible) */
  remonteeNappeMmSemaine: number;
  /**
   * Drainage EXTERNE, mm/semaine : ce que l'exutoire peut évacuer, quelle que
   * soit la perméabilité du sol. Un fond de vallée à nappe affleurante ne peut
   * rien évacuer même sur sol sableux — c'est la topographie qui commande.
   * `Infinity` = versant bien drainé.
   */
  drainageExterneMmSemaine: number;
  /**
   * Exposition au vent ∈ [0,1] : 0 = vallon abrité, 1 = lande atlantique ou
   * plateau ouvert. Le vent dessèche les sujets découverts — c'est ce qui rend
   * l'effet brise-vent d'une haie ou d'une nurse payant (ch5, docs §9).
   *
   * C'est l'ABRI du site, pas le vent : la vitesse régionale de la semaine est
   * dans `WeekWeather.ventMoyMs`, et ce que la parcelle reçoit vraiment est le
   * produit des deux (`ventRecuParLeSite`, feu.ts).
   */
  ventExposition: number;
  /** relief de la parcelle : altitude, pente, exposition, forme (relief.ts) */
  relief: Relief;
  /** eau libre permanente : ruisseau longeant un côté, mare (eau_surface.ts) */
  eau: EauDeSurface;
  /**
   * Profondeur d'équilibre de la nappe sous la parcelle, cm : le niveau que le
   * réseau hydrographique régional lui impose. C'est un relevé de terrain, pas
   * un calcul (nappe.ts). Absente, elle se déduit des autres déclarations.
   */
  profondeurNappeEquilibreCm?: number;
  /**
   * Part du bassin versant qui subit le même sort que la parcelle ∈ [0,1].
   * 0 : une parcelle isolée, la région tient son niveau quoi qu'il lui arrive.
   * 1 : elle est représentative de tout son bassin — un incendie qui l'emporte
   * emporte aussi les alentours, et la nappe régionale monte avec (nappe.ts).
   */
  partBassinSemblable?: number;
  /**
   * Pluie annuelle, mm. Elle ne sert qu'à savoir si une cuvette tient l'eau
   * (terrain.ts) ; le bilan hydrique, lui, travaille semaine par semaine sur
   * la météo réelle. Absente, on prend une valeur française ordinaire.
   */
  pluieAnnuelleMm?: number;
  /** côté de la parcelle carrée, m (grille de widthM × heightM cellules de 1 m²) */
  coteM: number;
  /** couverture herbacée au démarrage ∈ [0,1] (friche enherbée vs sol nu) */
  herbeInitiale: number;
  /**
   * Le paysage autour de la parcelle (paysage.ts). C'est LUI qui décide de la
   * pluie de semis, de la densité de gibier, des dépôts d'azote, de
   * l'exposition au vent et de la fréquentation humaine — ces cinq choses ne
   * sont pas indépendantes, et les saisir séparément permettait de décrire une
   * parcelle « au cœur d'une hêtraie » qui ne recevait aucun semis de hêtre.
   */
  paysageId: string;
  /**
   * Ce qu'il y a de chaque côté (paysage.ts). `paysageId` reste le résumé
   * affiché ; ce sont les bordures qui font foi.
   */
  bordures: Bordures;
  /** pluie de semis annuelle venant du paysage voisin (docs/regles.md §8) */
  voisinage: { especeId: string; semisParAn: number }[];
  /**
   * Densité de cervidés du paysage, individus/ha (« équivalent chevreuil »).
   * C'est une donnée de CONTEXTE, au même titre que le voisinage semencier :
   * le domaine vital d'un chevreuil fait des dizaines d'hectares, la parcelle
   * ne détermine pas sa population, elle en reçoit la part que son attrait
   * justifie (gibier.ts). Ordres de grandeur français : 0,05/ha en plaine
   * cultivée, 0,3/ha dans un massif à forte densité.
   */
  gibierParHa: number;
  /**
   * LA FAUNE EST-ELLE FAITE D'INDIVIDUS DANS CETTE PARTIE ? (#187)
   *
   * Absent ou faux : rien ne change, et ça veut dire RIEN — le tick ne parcourt
   * rien, n'alloue rien, ne tire rien. C'est ce commutateur qui porte la preuve
   * de neutralité du mécanisme, et c'est sa vraie raison d'être : le coût de
   * calcul, lui, ne le justifiait pas (mesuré : plat jusqu'à cinq cents
   * individus). Sa seconde raison est la reproductibilité — les individus
   * ajoutent des tirages, donc une partie avec faune ne se superpose pas à une
   * partie sans, même à graine égale.
   *
   * Ce n'est PAS une donnée de contexte comme `gibierParHa` : le gibier
   * traverse, les individus s'ancrent (`faune.ts`).
   */
  faune?: boolean;
  /**
   * Dépôts atmosphériques d'azote, kg/ha/an. Ce n'est pas un détail : entre
   * les oxydes d'azote de la combustion et l'ammoniac de l'élevage, le ciel
   * français apporte 8 à 25 kg N/ha/an selon la région. Sur un sol pauvre,
   * c'est PLUS que ce que la minéralisation de l'humus fournit — c'est même
   * ce qui fait disparaître les landes et les pelouses maigres d'Europe, en
   * les fertilisant assez pour que les graminées et les ligneux prennent le
   * dessus. L'ignorer rendait nos stations pauvres invivables.
   */
  depositionNKgHaAn: number;
  /**
   * Densité de sangliers du paysage, individus/ha (`sanglier.ts`). Donnée de
   * CONTEXTE comme celle des cervidés, et pour une raison plus forte encore :
   * le domaine vital d'un sanglier fait 500 à 2000 hectares.
   */
  sanglierParHa: number;
  /** phosphore assimilable au départ, g/m² (dérivé du profil) */
  phosphoreInitialGM2: number;
  /** potassium échangeable au départ, g/m² (dérivé du profil) */
  potassiumInitialGM2: number;
}

export function gridDims(station: Station): GridDims {
  return { widthM: station.coteM, heightM: station.coteM };
}

/**
 * État dynamique du sol. L'eau est stratifiée : indexée par
 * `cellule * nbHorizons + horizon` (critère A10). L'azote, le carbone et le pH
 * restent mono-couche — la vie du sol, l'absorption d'azote et le chaulage se
 * jouent pour l'essentiel dans les premiers centimètres *(approximation
 * assumée, à lever si le besoin apparaît)*.
 */
export interface SoilState {
  /** eau de la réserve utile, mm — par (cellule, horizon) */
  waterMm: number[];
  /** eau gravitaire au-dessus de la capacité au champ, mm — par (cellule, horizon) */
  excessMm: number[];
  /** azote minéral, g/m² (1 kg/ha = 0,1 g/m²) */
  mineralNG: number[];
  /** azote de la litière au sol, g/m² (libéré vers le minéral en se décomposant) */
  litterNG: number[];
  /** carbone de la litière au sol, g/m² (se décompose avec l'azote) */
  litterCG: number[];
  /** carbone de l'humus, g/m² — pool lent, alimenté par l'humification */
  humusCG: number[];
  /**
   * Carbone du bois mort COUCHÉ sur cette cellule, g/m². Distinct du bois mort
   * debout (`carbon.deadWoodKgC`, qui reste un stock de parcelle tant que les
   * chandelles tiennent) : un tronc par terre se décompose plus vite, fait de
   * l'humus là où il est, protège la terre sous lui et abrite d'autres bêtes
   * que le bois sur pied (boisMort.ts).
   */
  boisAuSolCG: number[];
  /**
   * Part de ce bois couché qui BARRE l'eau, ∈ [0,1] : moyenne, pondérée par
   * les masses posées, de l'efficacité barrante de chaque tronc — sa longueur
   * efficace au-delà du seuil de 30° (boisMort.ts). Ce n'est PAS un stock de
   * carbone : c'est un descriptif du stock voisin, et l'ajouter aux bilans
   * compterait le même bois deux fois.
   *
   * Une masse seule ne suffisait pas : un tronc en travers d'un thalweg barre
   * l'eau, le même tronc couché dans le sens de la pente ne barre rien. Deux
   * choses entrent donc ici, et pas une : l'ORIENTATION du tronc, et son
   * CONTACT avec le sol — un tronc qui repose sur son houppier laisse l'eau
   * passer dessous, quelle que soit sa direction (boisMort.ts). Un chablis
   * naturel barre ainsi près de quatre fois moins qu'un fût qu'on a ébranché
   * et calé.
   *
   * Comme la décomposition et le ramassage agissent proportionnellement sur
   * toute la masse d'une cellule, cette part-là ne bouge pas avec eux : elle ne
   * change que lorsqu'un nouveau tronc se pose.
   */
  boisEnTraversPart: number[];
  /**
   * TASSEMENT du sol par cellule ∈ [0,1] : 0 = structure intacte, 1 = tassé.
   *
   * Ce qui change vraiment sous une conduite agricole n'est pas la texture ni
   * le pH, c'est l'ARRANGEMENT des particules. Un limon tassé et le même limon
   * en bonne structure ne se comportent pas pareil (tassement.ts).
   */
  tassement: number[];
  /**
   * Phosphore ASSIMILABLE, g/m². Il ne diffuse pas : ce qui est dans une
   * cellule n'y bougera pas (pk.ts).
   */
  phosphoreG: number[];
  /**
   * Phosphore FIXÉ (fer, aluminium, calcium), g/m². Immense et lentement
   * relargué : un sol peut être riche en phosphore total et affamer les
   * plantes.
   */
  phosphoreFixeG: number[];
  /** Potassium ÉCHANGEABLE, g/m² : retenu par le complexe, lessivable. */
  potassiumG: number[];
  /**
   * Réserve de potassium non échangeable, g/m² : coincée entre les feuillets
   * des argiles, elle tamponne la solution — elle relargue quand les racines
   * puisent, elle réabsorbe quand il y en a trop.
   */
  potassiumReserveG: number[];
  /** cellule enclose : le gibier n'y entre pas (gibier.ts) */
  cloture: boolean[];
  /**
   * Eau stockée dans l'aquifère sous chaque cellule, mm (nappe.ts). C'est le
   * stock qui manquait : sans lui, ce que la végétation ne transpire pas
   * disparaissait au lieu de faire monter la nappe.
   */
  nappeMm: number[];
  /**
   * Niveau de référence du réseau régional, mm. Il ne bouge que si ce qui
   * arrive à la parcelle arrive aussi à son bassin (nappe.ts).
   */
  nappeRegionaleMm: number;
  /**
   * Épaisseur d'horizon de surface perdue par érosion, cm (négative là où le
   * sédiment s'est déposé). Un sol qui s'amincit retient moins d'eau, donc
   * ruisselle davantage, donc s'érode plus vite (erosion.ts).
   */
  epaisseurPerdueCm: number[];
  /**
   * BASES ÉCHANGEABLES de la cellule, eq/m² : le calcium, le magnésium, le
   * potassium et le sodium fixés sur le complexe argilo-humique (`bases.ts`).
   *
   * C'est ce pool-là qui est l'état ; le pH n'en est que la lecture.
   */
  basesEq: number[];
  /**
   * Les bases échangeables du SOUS-SOL, eq/m² : tout ce qui est sous l'horizon
   * de surface, en un seul compartiment (`bases.ts`, critère C15).
   *
   * C'est un BUDGET, pas un compteur : il reçoit l'altération de ses propres
   * horizons et ce que la surface lui lessive, il perd ce que les racines y
   * pompent et ce qui passe sous la zone racinaire. Aucun arbre ne le LIT
   * encore : le moteur sait dire que le fond s'appauvrit, pas encore ce que
   * l'appauvrissement fait aux racines qui y poussent.
   */
  basesProfondEq: number[];
  /**
   * Teneur en calcium de la litière PRÉSENTE sur la cellule, mg/g de matière
   * sèche : moyenne pondérée par les masses déposées, tenue comme l'est déjà la
   * vitesse de décomposition (`litterK`). C'est elle qui décide si ce qui se
   * décompose ici acidifie le complexe ou l'alimente.
   */
  litterCaMgG: number[];
  /**
   * pH de la cellule. **Ce n'est plus un état : c'est une LECTURE** du taux de
   * saturation du complexe, recalculée à chaque tick depuis `basesEq`
   * (`bases.ts`). Le chaulage n'écrit plus ici — il apporte des bases, et le pH
   * suit. Le tableau est conservé parce que tout le moteur lit un pH par
   * cellule et n'a aucune raison de connaître la chimie qui le produit.
   */
  ph: number[];
  /**
   * Couverture de la strate herbacée ∈ [0,1] par cellule (herbe.ts) : la
   * concurrence que subissent les jeunes plants, et la protection du sol.
   *
   * C'est une SOMME, recalculée chaque semaine depuis `herbeEmprise` : ce que
   * les espèces présentes couvrent VRAIMENT cette semaine-là. Tout ce qui lit
   * la strate — le feu, l'érosion, l'évaporation, le gibier — lit cette ligne
   * et n'a pas à connaître les espèces.
   */
  herbeCouverture: number[];
  /**
   * Emprise de chaque espèce herbacée sur chaque cellule ∈ [0,1], à plat :
   * `herbeEmprise[i * N_HERBACEES + s]` (herbacees.ts). C'est la place que
   * l'espèce TIENT — bulbes et rhizomes compris —, pas ce qu'elle montre : une
   * anémone tient son mètre carré toute l'année et ne le couvre qu'en avril.
   * La somme sur une cellule ne dépasse jamais 1 : le sol est fini.
   */
  herbeEmprise: number[];
  /**
   * Feuillage de chaque espèce herbacée, même indexation à plat : ce qui est
   * VERT. Il suit l'emprise à travers la saison et la sécheresse, et c'est lui
   * que la fauche, le feu et le gibier emportent — l'emprise, elle, reste.
   * `herbeCouverture` en est la somme par cellule.
   */
  herbeFeuillage: number[];
  /**
   * Biomasse herbacée présente ∈ [0,1] : elle SUIT la couverture mais ne
   * disparaît pas quand l'herbe jaunit — le foin sur pied reste le meilleur
   * combustible de l'été. Seuls le feu, la fauche et la décomposition la font
   * baisser.
   */
  herbeBiomasse: number[];
  /**
   * GRAIN accumulé par cellule et par culture, en part du rendement annuel
   * maximal de l'espèce (#136). Même indexation à plat que `herbeEmprise`.
   *
   * C'est une INTÉGRALE : le grain est ce que la plante a assimilé pendant sa
   * saison, semaine après semaine, et non une fonction de son état du jour.
   * La moisson le remet à zéro et l'emporte hors de la parcelle.
   */
  cultureGrain: number[];
  /**
   * Le DÉNOMINATEUR du rendement : ce que la culture aurait assimilé sans
   * aucun facteur limitant, cumulé de la même façon. Le rapport des deux est
   * la part du rendement maximal (`herbacees.ts:partDuRendement`).
   */
  cultureGrainPotentiel: number[];
  /**
   * RESSOURCE FLORALE vécue par cellule ∈ [0,1] (#70, critère G4) : ce que les
   * pollinisateurs ont trouvé à manger ici, ces dernières semaines.
   *
   * C'est une MÉMOIRE, comme `herbeHumidite`, et c'est tout le sujet : une
   * colonie qui a jeûné en mars n'est pas là en juin pour polliniser le
   * pommier. Une valeur instantanée dirait l'inverse — que chaque arbre se
   * pollinise lui-même à proportion de ses propres fleurs.
   */
  ressourceFlorale: number[];
  /**
   * Humidité de surface telle que le tapis la « vit » : moyenne lissée sur
   * plusieurs semaines (herbe.ts). Sans cette mémoire, la couverture réagit à
   * sa propre consommation avec une semaine de retard et se met à osciller.
   */
  herbeHumidite: number[];
  /**
   * Population de ravageurs par cellule ∈ [0,1] (ravageurs.ts). Elle vit là où
   * des hôtes sensibles s'affaiblissent, et recule là où l'habitat nourrit les
   * auxiliaires.
   */
  ravageurs: number[];
  /**
   * Réseaux mycorhiziens par cellule, un par type (mycorhizes.ts) : ils
   * mettent des années à se tisser et ne survivent pas au labour.
   */
  mycorhizes: { ecto: number[]; arbusculaire: number[]; ericoide: number[] };
  /** vitesse de décomposition de la litière de la cellule, /semaine à T°/humidité optimales
   * (moyenne pondérée des apports : litière d'aulne rapide, aiguilles de pin lentes, ch2-B) */
  litterK: number[];
}

export interface GameState {
  /** semaine absolue depuis le début de partie (0, 1, 2, …) */
  week: number;
  station: Station;
  soil: SoilState;
  trees: TreeState[];
  nextTreeId: number;
  economy: EconomyState;
  carbon: CarbonState;
  /**
   * Tas de broyat en attente d'être épandu. C'est un TAS : il n'a pas de
   * position sur la parcelle, contrairement à tout le reste du modèle — et
   * c'est bien ce qu'il est dans la réalité, une remorque de plaquettes qu'on
   * ira vider là où on en a besoin.
   */
  stockBrf: { carboneG: number; azoteG: number };
  /**
   * Pression de gibier locale, en part de la densité du paysage ∈ [0,1].
   * La chasse la fait baisser ; l'immigration des voisins la fait remonter —
   * c'est ce qui rend la régulation illusoire à l'échelle d'une parcelle.
   */
  pressionGibier: number;
  /** degrés-jours base 5 °C cumulés depuis le 1er janvier (phénologie, §7.2) */
  ddYearBase5: number;
  /**
   * Semaines de froid accumulées depuis l'automne, pour la levée de dormance
   * (phenologie.ts). Un hiver doux en compte peu, et le débourrement recule.
   */
  semainesDeFroid: number;
  /**
   * Banque de graines du sol, graines/m² par espèce (banqueGraines.ts). La
   * mémoire du passé de la parcelle : ce qui y a grainé y attend sous terre,
   * parfois des décennies, et le feu la réveille.
   */
  banqueGraines: Record<string, number>;
  /**
   * Identifiant stable de la partie, figé à sa création. Le marché du bois en
   * tire ses variations annuelles : deux parties de même graine voient le même
   * marché, et le marché ne consomme pas le flux aléatoire principal
   * (marche.ts).
   */
  graineMarche: number;
  /**
   * Le carbone que la parcelle PORTAIT DÉJÀ quand le joueur est arrivé, t/ha —
   * le point zéro du bilan (`carbon.ts`, issue #202).
   *
   * **C'était `station.initialSoilCTHa`, et c'était faux dès qu'une partie
   * démarrait sur une parcelle vieillie.** Ce champ-là est le carbone du PROFIL
   * pédologique : il sert à remplir `humusCG` à la création, et c'est son
   * rôle. Mais `faireVieillir` (critère A26) fait tourner le moteur pendant des
   * décennies avant l'arrivée du joueur — la friche se boise toute seule,
   * l'humus dérive — puis remet la semaine à zéro. La référence, elle, ne
   * bougeait pas. Sur un limon riche boisé depuis soixante ans, le joueur lisait
   * « vous avez stocké 108 tonnes de carbone à l'hectare » avant d'avoir posé un
   * seul plant, et ces tonnes étaient celles d'arbres venus tout seuls.
   *
   * Le défaut avait une seconde face : pendant la maturation l'humus BAISSE
   * (73,97 → 56,31 t/ha en trente ans), si bien que la référence surestimait le
   * sol en même temps qu'elle ignorait les arbres. Les deux erreurs ne se
   * compensaient pas, elles s'additionnaient dans deux cases du même total.
   *
   * La valeur appartient donc à la PARTIE et non à la station, au même titre que
   * `graineMarche` : une partie rechargée doit retrouver la sienne. Elle vaut
   * exactement `station.initialSoilCTHa` à la création — une parcelle nue démarre
   * à zéro, comme avant — et n'est refigée qu'une fois, après la maturation.
   */
  carboneDeReferenceTHa: number;
  /**
   * La parcelle a-t-elle brûlé depuis la dernière levée annuelle ? Le feu
   * scarifie les téguments durs : c'est lui qui fait lever d'un coup une banque
   * que rien d'autre n'aurait réveillée.
   */
  aBruleDepuisLaLevee: boolean;
  /**
   * Les individus de faune installés sur la parcelle (`faune.ts`, #187).
   *
   * ABSENT tant que `station.faune` n'est pas allumé, et c'est voulu : un
   * tableau vide serait déjà une allocation, et l'égalité de `stateHash` d'une
   * partie sans faune avec celle d'avant le lot en dépend.
   */
  faune?: readonly IndividuFaune[];
  /** Prochaine identité à distribuer à un individu — même règle que `nextTreeId`. */
  nextFauneId?: number;
  rng: RngState;
}

/** Flux de la semaine, moyennés sur la parcelle (affichage + tests de conservation). */
export interface TickFluxes {
  rainMm: number;
  etpMm: number;
  /** évaporation du sol, mm moyen */
  evapMm: number;
  /** remontée de nappe absorbée, mm moyen (flux entrant) */
  nappeMm: number;
  /** transpiration des arbres, mm moyen (Σ L / surface) */
  transpirationMm: number;
  drainageMm: number;
  overflowMm: number;
  /** engorgement moyen ∈ [0,1] */
  waterloggingMean: number;
  /** couverture herbacée moyenne ∈ [0,1] */
  herbeCouvertureMean: number;
  /** phosphore et potassium prélevés, kg/ha */
  /** stocks moyens, g/m² (suivis, pas encore couplés à la croissance) */
  phosphoreMoyenGM2: number;
  potassiumMoyenGM2: number;
  uptakePKgHa: number;
  uptakeKKgHa: number;
  /** potassium lessivé, kg/ha */
  leachedKKgHa: number;
  /**
   * LE BUDGET DE BASES de la semaine, eq/ha, terme par terme (bases.ts). Il est
   * exposé pour être VÉRIFIÉ : la variation du pool doit valoir apports +
   * litière − lessivage − charge acide, à l'arrondi près. Un pool dont on ne
   * publie pas le budget est un pool qu'on ne peut pas mettre en défaut.
   */
  basesApportEqHa: number;
  /** ce qui DESCEND de la surface vers le sous-sol (ce n'est plus une sortie) */
  basesLessiveEqHa: number;
  basesLitiereEqHa: number;
  basesAcideEqHa: number;
  /**
   * LA POMPE : bases retirées au sous-sol par les racines cette semaine, eq/ha
   * (bases.ts, critère C15). Elle n'entre pas dans le budget de SURFACE ci-
   * dessus — c'est le budget du pool profond à elle seule, et la variation de
   * `basesProfondEq` doit valoir exactement son opposé.
   */
  basesPreleveEqHa: number;
  /**
   * LE BUDGET DU SOUS-SOL, eq/ha : ce qu'il reçoit (son altération, plus ce que
   * la surface lui a lessivé) et ce qui QUITTE le profil par le bas. Avec la
   * pompe ci-dessus, la variation de `basesProfondEq` doit valoir
   * `apportProfond − prélèvement − export`.
   */
  basesApportProfondEqHa: number;
  basesExportEqHa: number;
  /** taux de saturation moyen du complexe ∈ [0,1] — le pH en est la lecture */
  saturationMoyenne: number;
  /** le même taux, pour le sous-sol : c'est lui que la pompe fait baisser */
  saturationProfondeMoyenne: number;
  /** eau arrivée de l'amont par ruissellement, mm */
  ruissellementEntrantMm: number;
  /** eau partie de la parcelle par ruissellement, mm */
  ruissellementSortantMm: number;
  /** part de la parcelle dont la nappe affleure (inondée) ∈ [0,1] */
  partInondee: number;
  /** eau sortie de la parcelle par la nappe (vers la région et l'aval), mm */
  vidangeNappeMm: number;
  /** eau reçue du réseau régional, mm — un fond de vallée en reçoit */
  apportRegionalMm: number;
  /** eau entrée dans le sol depuis un ruisseau ou une mare voisine, mm */
  apportEauLibreMm: number;
  /** profondeur moyenne de la nappe sous la parcelle, cm */
  nappeProfondeurCm: number;
  /** terre arrachée par le ruissellement cette semaine, kg/m² */
  erosionArracheeKgM2: number;
  /** terre effectivement sortie de la parcelle, kg/m² (le reste s'est déposé) */
  erosionSortieKgM2: number;
  /**
   * Lame que le bois couché EN TRAVERS a détournée du ruissellement vers le
   * sol cette semaine, mm (boisMort.ts). Zéro dès que le sol est plein : un
   * barrage ne fait pas rentrer l'eau dans une éponge saturée.
   */
  boisRetenueMm: number;
  /** terre que le bois couché en travers a retenue derrière lui, kg/m² */
  boisSedimentPiegeKgM2: number;
  /** azote parti avec la terre, kg/ha */
  erosionNKgHa: number;
  /** phosphore assimilable parti avec la terre, kg/ha */
  erosionPKgHa: number;
  /** potassium échangeable parti avec la terre, kg/ha */
  erosionKKgHa: number;
  /** matière sèche prélevée par le gibier cette semaine, kg */
  broutageKg: number;
  /** azote apporté par les dépôts atmosphériques, kg/ha (semaine) */
  depositionKgHa: number;
  /** population moyenne de ravageurs sur la parcelle ∈ [0,1] */
  ravageurMoyen: number;
  /** qualité moyenne de l'habitat des auxiliaires ∈ [0,1] */
  auxiliairesMoyen: number;
  /** développement moyen des réseaux mycorhiziens ∈ [0,1] */
  mycorhizesMoyen: number;
  mineralizationKgHa: number;
  /** N SORTI du sol cette semaine (arbres + tapis), kg/ha */
  uptakeKgHa: number;
  /**
   * N réellement SERVI aux arbres non fixateurs, kg/ha. Avec `uptakeHerbeKgHa`,
   * il doit retrouver `uptakeKgHa` au gramme près : le sol ne perd rien qui
   * n'arrive dans une plante. L'égalité est tenue par
   * `tests/properties/tick-conservation.test.ts` — elle manquait, et un
   * huitième de l'azote d'un limon pauvre s'évaporait entre les deux (#115).
   */
  uptakeArbresKgHa: number;
  /** N réellement servi à la strate herbacée, kg/ha */
  uptakeHerbeKgHa: number;
  leachedKgHa: number;
  /** N retourné au sol par la chute des feuilles (recyclage interne), kg/ha */
  litterfallKgHa: number;
  /** N libéré par la décomposition de la litière, kg/ha */
  litterDecayKgHa: number;
  /** N NOUVEAU entré par la fixation symbiotique (litière des fixateurs), kg/ha */
  fixationKgHa: number;
}

export function createGameState(
  station: Station,
  rng: RngState,
  options: { treasuryEur?: number; economie?: boolean } = {},
): GameState {
  const n = cellCount(gridDims(station));
  const nH = Math.max(1, station.profil.length);
  // Chaque horizon démarre à sa propre réserve utile (sol ressuyé du 1er janvier).
  const eauInitiale: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let h = 0; h < nH; h++) eauInitiale.push(ruHorizonMm(station.profil[h] as Horizon));
  }
  // La même friche de départ dans toutes les cellules : la station ne décrit
  // qu'un taux d'enherbement, l'atlas dit qui le compose (herbacees.ts).
  const depart = empriseInitiale(station.herbeInitiale, station.phInitial);
  // Le complexe d'échange de l'horizon de surface, et ce que le pH de la
  // station implique qu'il porte de bases (bases.ts).
  const cecDepart = station.profil[0] ? capaciteEchangeEqM2(station.profil[0]) : 0;
  const saturationDepart = saturationDepuisPh(station.phInitial);
  const basesDepart = cecDepart * saturationDepart;
  // Le sous-sol démarre au MÊME taux de saturation que la surface : la station
  // ne déclare qu'un pH, et lui inventer un gradient de départ serait affirmer
  // quelque chose qu'elle ne dit pas.
  const basesProfondDepart = capaciteEchangeProfondeEqM2(station.profil) * saturationDepart;
  return {
    week: 0,
    station,
    economy: createEconomy(options.treasuryEur ?? 20_000, options.economie ?? true),
    // Un identifiant stable de la partie, figé à la création. Le marché du bois
    // en tire ses variations annuelles sans puiser dans le flux aléatoire
    // principal, qui lui change à chaque tick (marche.ts).
    graineMarche: (rng[0] ?? 1) >>> 0,
    // Une parcelle neuve ne porte que le carbone de son profil : le bilan part
    // donc de zéro, et rien ne change tant qu'on ne vieillit pas la parcelle.
    carboneDeReferenceTHa: station.initialSoilCTHa,
    carbon: createCarbonState(),
    ddYearBase5: 0,
    // Une partie démarre au 1ᵉʳ janvier : l'hiver qui précède est supposé
    // normal, sans quoi la première année débourrerait en retard sans raison.
    semainesDeFroid: 20,
    banqueGraines: {},
    aBruleDepuisLaLevee: false,
    // Début de partie au 1er janvier : réserve utile rechargée, pas d'eau gravitaire.
    soil: {
      waterMm: eauInitiale,
      excessMm: new Array(n * nH).fill(0),
      mineralNG: new Array(n).fill(station.initialMineralNKgHa * KG_PER_HA_TO_G_PER_M2),
      litterNG: new Array(n).fill(0),
      litterCG: new Array(n).fill(0),
      humusCG: new Array(n).fill(station.initialSoilCTHa * T_HA_TO_G_M2),
      boisAuSolCG: new Array(n).fill(0),
      boisEnTraversPart: new Array(n).fill(0),
      tassement: new Array(n).fill(0),
      // Les bases sont INVERSÉES depuis le pH déclaré par la station, et non
      // l'inverse : les stations décrivent un pH, pas un taux de saturation, et
      // une partie doit démarrer exactement au pH annoncé (bases.ts).
      basesEq: new Array(n).fill(basesDepart),
      basesProfondEq: new Array(n).fill(basesProfondDepart),
      litterCaMgG: new Array(n).fill(CALCIUM_NEUTRE_MG_G),
      ph: new Array(n).fill(station.phInitial),
      cloture: new Array(n).fill(false),
      // La partie démarre à l'équilibre : la nappe est là où la région la met,
      // creux par creux — elle est plus plate que le terrain (nappe.ts).
      epaisseurPerdueCm: new Array(n).fill(0),
      nappeRegionaleMm: stockEquilibreMm(
        station.profil,
        station.remonteeNappeMmSemaine,
        station.drainageExterneMmSemaine,
        station.profondeurNappeEquilibreCm,
      ),
      nappeMm: [
        ...stocksEquilibreParCellule(
          station.profil,
          altitudeParCellule(station.relief, { widthM: station.coteM, heightM: station.coteM }),
          station.remonteeNappeMmSemaine,
          station.drainageExterneMmSemaine,
          station.profondeurNappeEquilibreCm,
        ),
      ],
      phosphoreG: new Array(n).fill(station.phosphoreInitialGM2),
      // Le stock fixé de départ : dix fois l'assimilable, l'ordre de grandeur
      // habituel entre phosphore total et phosphore assimilable.
      phosphoreFixeG: new Array(n).fill(station.phosphoreInitialGM2 * 10),
      potassiumG: new Array(n).fill(station.potassiumInitialGM2),
      potassiumReserveG: new Array(n).fill(station.potassiumInitialGM2 * 10),
      // Une parcelle nue au départ : la strate s'installe d'elle-même. Qui la
      // compose au premier jour, c'est l'atlas qui le dit, d'après le pH de la
      // station et la vitesse d'installation de chacune (herbacees.ts).
      herbeCouverture: new Array(n).fill(station.herbeInitiale),
      herbeEmprise: Array.from({ length: n }, () => depart).flat(),
      // Le feuillage part au niveau de l'emprise : la station dit un sol déjà
      // couvert, pas des souches nues. La première semaine le ramènera à ce
      // que la saison permet.
      herbeFeuillage: Array.from({ length: n }, () => depart).flat(),
      herbeBiomasse: new Array(n).fill(station.herbeInitiale),
      // Rien de semé au premier jour : une culture s'obtient par une action.
      cultureGrain: new Array(n * N_HERBACEES).fill(0),
      cultureGrainPotentiel: new Array(n * N_HERBACEES).fill(0),
      // Aucune mémoire florale au premier jour : la première saison la
      // construit. Partir d'un plancher supposerait une année d'avant.
      ressourceFlorale: new Array(n).fill(0),
      // Le 1er janvier, la réserve de surface est pleine.
      herbeHumidite: new Array(n).fill(1),
      ravageurs: new Array(n).fill(0),
      // Une parcelle de départ porte déjà un fond de réseau : elle n'a pas
      // été stérilisée. C'est le labour qui remet à zéro.
      mycorhizes: {
        ecto: new Array(n).fill(0.25),
        arbusculaire: new Array(n).fill(0.25),
        ericoide: new Array(n).fill(0.25),
      },
      litterK: new Array(n).fill(0),
    },
    trees: [],
    stockBrf: { carboneG: 0, azoteG: 0 },
    pressionGibier: 1,
    nextTreeId: 1,
    rng,
  };
}

/** Proto-action : planter un plant à une position donnée (30 cm par défaut). */
/**
 * Part du potentiel qu'on prête aux racines d'un arbre instancié : la même que
 * `RACINES_PLANCHER` dans `trees.ts`, dont c'est exactement la définition.
 */
const RACINES_PLANCHER_INSTANCIE = 0.35;

/**
 * Profondeur racinaire d'un arbre qu'on INSTANCIE à une taille donnée, cm.
 *
 * Les deux semeurs posaient 20 cm quelle que soit la hauteur demandée (#84) :
 * un arbre instancié à vingt-cinq mètres — ce que font une bonne part des essais
 * écologiques et le laboratoire — avait donc les racines d'un semis pendant sa
 * première semaine. Tout le reste de son état est pourtant dérivé de sa hauteur,
 * le diamètre compris.
 *
 * On lui donne donc le PLANCHER que `nouvelleProfondeurRacines` lui garantirait
 * de toute façon, et jamais moins que les 20 cm d'un semis. Ce n'est pas une
 * faveur : c'est l'état qu'il aurait s'il avait poussé jusque-là.
 */
function racinesInitialesCm(especeId: string, heightM: number, station: Station): number {
  const penetrable = profondeurPenetrableCm(station.profil);
  const potentiel = profondeurRacinesCm(getEspece(especeId), heightM, penetrable);
  return Math.max(20, Math.min(potentiel, RACINES_PLANCHER_INSTANCIE * potentiel));
}

export function plantAt(
  state: GameState,
  especeId: string,
  x: number,
  y: number,
  heightM = 0.3,
): GameState {
  getEspece(especeId); // valide l'id
  // Chaque plant a sa vigueur : deux semis plantés côte à côte le même jour ne
  // font pas le même arbre (trees.ts).
  const tirage = tirerVigueurIndividuelle(state.rng);
  const tree: TreeState = {
    vigueurIndividuelle: tirage.vigueur,
    id: state.nextTreeId,
    especeId,
    x,
    y,
    ageWeeks: 0,
    heightM,
    diametreCm: diametreInitialCm(heightM),
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: racinesInitialesCm(especeId, heightM, state.station),
    hauteurElagueeM: 0,
    pousseTendreM: 0,
    vigueur: 1,
    protege: false,
    dommageHydraulique: 0,
    recepages: 0,
  };
  return {
    ...state,
    trees: [...state.trees, tree],
    nextTreeId: state.nextTreeId + 1,
    rng: tirage.rng,
  };
}

/**
 * Proto-action : planter n plants à des positions pseudo-aléatoires SEEDÉES
 * (consomme le rng de la partie — deux parties de même seed plantent pareil).
 */
export function plantScattered(
  state: GameState,
  especeId: string,
  count: number,
  heightM = 0.3,
): GameState {
  getEspece(especeId);
  const side = state.station.coteM;
  let rng = state.rng;
  const trees = [...state.trees];
  for (let i = 0; i < count; i++) {
    const rx = rngFloat(rng);
    const ry = rngFloat(rx.state);
    const tirage = tirerVigueurIndividuelle(ry.state);
    rng = tirage.rng;
    trees.push({
      vigueurIndividuelle: tirage.vigueur,
      id: state.nextTreeId + i,
      especeId,
      x: rx.value * side,
      y: ry.value * side,
      ageWeeks: 0,
      heightM,
      diametreCm: diametreInitialCm(heightM),
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: racinesInitialesCm(especeId, heightM, state.station),
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
      recepages: 0,
    });
  }
  return { ...state, trees, nextTreeId: state.nextTreeId + count, rng };
}

/** Semaine dans l'année (0–51). */
export function weekOfYear(state: GameState): number {
  return state.week % 52;
}
