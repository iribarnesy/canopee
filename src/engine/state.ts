/**
 * État du jeu : une station, une grille de sol 1 m² (eau + azote par cellule),
 * des arbres positionnés. Chaque étape de la feuille de route
 * (docs/regles.md §17) enrichit ces types.
 */

import type { EconomyState } from "./actions";
import { createEconomy } from "./actions";
import type { CarbonState } from "./carbon";
import { createCarbonState, T_HA_TO_G_M2 } from "./carbon";
import type { EauDeSurface } from "./eau_surface";
import { getEspece } from "./especes";
import type { GridDims } from "./grid";
import { cellCount } from "./grid";
import { stockEquilibreMm, stocksEquilibreParCellule } from "./nappe";
import { KG_PER_HA_TO_G_PER_M2 } from "./nitrogen";
import type { Bordures } from "./paysage";
import type { Relief } from "./relief";
import { altitudeParCellule } from "./relief";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import type { Horizon, SoilProfile } from "./soil";
import { ruHorizonMm } from "./soil";
import { type TreeState, tirerVigueurIndividuelle } from "./trees";

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
   * Dépôts atmosphériques d'azote, kg/ha/an. Ce n'est pas un détail : entre
   * les oxydes d'azote de la combustion et l'ammoniac de l'élevage, le ciel
   * français apporte 8 à 25 kg N/ha/an selon la région. Sur un sol pauvre,
   * c'est PLUS que ce que la minéralisation de l'humus fournit — c'est même
   * ce qui fait disparaître les landes et les pelouses maigres d'Europe, en
   * les fertilisant assez pour que les graminées et les ligneux prennent le
   * dessus. L'ignorer rendait nos stations pauvres invivables.
   */
  depositionNKgHaAn: number;
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
  /** pH de la cellule (modifiable par chaulage ; dérive lente en V1) */
  ph: number[];
  /**
   * Couverture de la strate herbacée ∈ [0,1] par cellule (herbe.ts) : la
   * concurrence que subissent les jeunes plants, et la protection du sol.
   */
  herbeCouverture: number[];
  /**
   * Biomasse herbacée présente ∈ [0,1] : elle SUIT la couverture mais ne
   * disparaît pas quand l'herbe jaunit — le foin sur pied reste le meilleur
   * combustible de l'été. Seuls le feu, la fauche et la décomposition la font
   * baisser.
   */
  herbeBiomasse: number[];
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
  uptakeKgHa: number;
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
  options: { treasuryEur?: number } = {},
): GameState {
  const n = cellCount(gridDims(station));
  const nH = Math.max(1, station.profil.length);
  // Chaque horizon démarre à sa propre réserve utile (sol ressuyé du 1er janvier).
  const eauInitiale: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let h = 0; h < nH; h++) eauInitiale.push(ruHorizonMm(station.profil[h] as Horizon));
  }
  return {
    week: 0,
    station,
    economy: createEconomy(options.treasuryEur ?? 20_000),
    carbon: createCarbonState(),
    ddYearBase5: 0,
    // Une partie démarre au 1ᵉʳ janvier : l'hiver qui précède est supposé
    // normal, sans quoi la première année débourrerait en retard sans raison.
    semainesDeFroid: 20,
    // Début de partie au 1er janvier : réserve utile rechargée, pas d'eau gravitaire.
    soil: {
      waterMm: eauInitiale,
      excessMm: new Array(n * nH).fill(0),
      mineralNG: new Array(n).fill(station.initialMineralNKgHa * KG_PER_HA_TO_G_PER_M2),
      litterNG: new Array(n).fill(0),
      litterCG: new Array(n).fill(0),
      humusCG: new Array(n).fill(station.initialSoilCTHa * T_HA_TO_G_M2),
      boisAuSolCG: new Array(n).fill(0),
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
      // Une parcelle nue au départ : la strate s'installe d'elle-même.
      herbeCouverture: new Array(n).fill(station.herbeInitiale),
      herbeBiomasse: new Array(n).fill(station.herbeInitiale),
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
