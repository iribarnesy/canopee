/**
 * Protocole UI ↔ worker de simulation (docs/stack.md : le moteur tourne dans
 * un Web Worker, l'UI ne reçoit que des instantanés). La sauvegarde est le
 * journal d'actions datées + la seed (rejouable, src/engine/game.ts).
 */

import type { ActionRefusal, EconomyState, GameAction, GesteVisible } from "../engine/actions";
import type { IndiceBiodiversite } from "../engine/biodiversite";
import type { CarbonInventory } from "../engine/carbon";
import type { ScenarioId } from "../engine/climat";
import type { EauDeSurface } from "../engine/eau_surface";
import type { WeekWeather } from "../engine/meteo";
import type { Bordures } from "../engine/paysage";
import type { ContextePhenologique } from "../engine/phenologie";
import type { Relief } from "../engine/relief";
import type { TickFluxes } from "../engine/state";
import type { ChuteDeChandelle, IncendieResult, MortDeLaSemaine } from "../engine/tick";
import type { CauseMort } from "../engine/trees";

/** Omit distributif sur l'union des actions (Omit natif écrase l'union). */
type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
/** Une action sans sa date : le worker la datera de la semaine courante. */
export type ActionSansSemaine = DistributiveOmit<GameAction, "week">;

export interface SaveGame {
  version: 1;
  stationId: string;
  seed: number;
  meteo: "reelle" | "synthetique";
  /** trajectoire climatique GIEC suivie par la partie (climat.ts) */
  scenario: ScenarioId;
  /** paysage autour de la parcelle (paysage.ts) */
  paysageId: string;
  /** ce qu'il y a de chaque côté ; absent = ancienne sauvegarde uniforme */
  bordures?: Bordures;
  /** relief choisi ; absent = celui d'origine de la station */
  relief?: Relief;
  /** eau libre choisie ; absent = aucune */
  eau?: EauDeSurface;
  /** profondeur d'équilibre de la nappe choisie, cm ; absent = celle de la station */
  nappeCm?: number;
  /** part du bassin qui subit le même sort que la parcelle ∈ [0,1] */
  partBassin?: number;
  /** années simulées à vide avant l'arrivée du joueur ; absent = 0 */
  maturationAns?: number;
  /** année civile du début de partie */
  anneeDepart: number;
  /** semaines déjà simulées (pour rejouer jusqu'au même point) */
  weeks: number;
  actions: GameAction[];
}

export interface SnapshotTree {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  ageWeeks: number;
  stress: number;
  fruitsKg: number;
  /** hauteur de bille élaguée, m (ce qui fera du bois d'œuvre) */
  hauteurElagueeM: number;
  /** plant sous manchon : le gibier ne l'atteint pas */
  protege: boolean;
  /**
   * Chandelle : un tronc mort resté debout. Il ne pousse plus, ne fait plus
   * d'ombre, mais il occupe la place et sert d'habitat (trees.ts).
   */
  chandelle: boolean;
  /**
   * Hauteur de la tête de trogne, m ; absent = jamais étêté. LA TROGNE : une
   * tête renflée à hauteur fixe et un faisceau de rejets au-dessus. C'est la
   * silhouette la plus reconnaissable du bocage, et sans ce champ le rendu
   * dessine un arbre ordinaire.
   */
  teteTrogneM?: number;
  /**
   * Nombre de recépages subis. La tête d'une trogne grossit et se creuse à
   * chaque étêtage : c'est ce compteur qui donne la cavité.
   */
  recepages: number;
  /**
   * Vigueur ∈ [0,1] : l'arbre pousse-t-il à son potentiel, ou végète-t-il ?
   * Un feuillage clairsemé et pâle, bien avant le moindre stress.
   */
  vigueur: number;
  /**
   * Dommage hydraulique ∈ [0,1] : la CIME SÈCHE. C'est la mémoire des
   * sécheresses passées, et elle ne se répare pas (trees.ts).
   */
  dommageHydraulique: number;
  /**
   * Semaine où la mort a été enregistrée ; absent = vivant. C'est l'ÂGE de la
   * chandelle : elle grisonne, se creuse et finit par tomber.
   */
  mortSemaine?: number;
  /**
   * Semaine où le feu l'a tué ; absent = pas brûlé. Ce qui distingue la
   * chandelle NOIRE de la GRISE.
   */
  brulEeSemaine?: number;
  /** ce qui a eu raison de l'arbre : onze causes, onze animations de mort */
  causeMort?: CauseMort;
  /**
   * Semaine de la dernière levée d'écorce ; absent = jamais démasclé. Le tronc
   * d'un chêne-liège démasclé est ocre-rouge, et il reverdit avec les années.
   */
  derniereLeveeSemaine?: number;
  /** avancement des fruits de l'année ∈ [0,1] : floraison → nouaison → maturation */
  fruitProgress: number;
  /** fleurs détruites par un gel tardif : elles brunissent au lieu de nouer */
  bloomFrosted: boolean;
  /** longueur de pousse encore tendre, m — ce que le chevreuil a mangé (gibier.ts) */
  pousseTendreM: number;
  /** semaine du dernier frottis ; absent = jamais frotté (écorce arrachée au pied) */
  frotteSemaine?: number;
}

/** Événement de jeu pour le fil d'actualité (morts, gels, récoltes, ventes…). */
export interface GameEvent {
  week: number;
  icone: string;
  message: string;
}

export interface Snapshot {
  week: number;
  weather: WeekWeather;
  economy: EconomyState;
  inventory: CarbonInventory;
  biodiversite: IndiceBiodiversite;
  /** année civile en cours (climat.ts) */
  anneeCivile: number;
  /** nom du paysage autour de la parcelle */
  paysage: string;
  /** CO₂ de l'année, ppm */
  co2Ppm: number;
  /** broyat en réserve, kg de matière sèche */
  stockBrfKg: number;
  /** pression de gibier locale ∈ [0,1] (la chasse la fait baisser, l'immigration la relève) */
  pressionGibier: number;
  fluxes: TickFluxes;
  trees: SnapshotTree[];
  soilWater: Float32Array;
  soilPh: Float32Array;
  /**
   * Bois mort COUCHÉ, g C par m². Ce que les chandelles abattues ont laissé là
   * où elles sont tombées (boisMort.ts) : le rendu peut y poser des troncs, et
   * ce sont les mêmes cellules qui font de l'humus et retiennent la terre.
   */
  soilBoisAuSol: Float32Array;
  soilN: Float32Array;
  /** couverture herbacée par cellule ∈ [0,1] */
  soilHerbe: Float32Array;
  /**
   * Biomasse herbacée par cellule ∈ [0,1] (herbe.ts). Ce n'est pas la
   * couverture : le foin sur pied jaunit en été alors que la couverture a
   * déjà chuté, et c'est cette matière-là qui reste à dessiner — et à brûler.
   */
  soilHerbeBiomasse: Float32Array;
  /**
   * Population de ravageurs par cellule ∈ [0,1] (ravageurs.ts). Seule la
   * moyenne voyageait (`TickFluxes.ravageurMoyen`), et une moyenne ne se
   * dessine pas : la défoliation se lit par TACHES, et c'est là que les
   * arbres finissent par mourir.
   */
  soilRavageurs: Float32Array;
  /**
   * Épaisseur d'horizon de surface perdue par cellule, cm — NÉGATIVE là où le
   * sédiment s'est déposé (erosion.ts). Les moyennes de `TickFluxes` disent
   * combien la parcelle a perdu, jamais où : sans cette carte le rendu ne peut
   * placer ni les ravines ni les zones d'accumulation.
   */
  soilEpaisseurPerdueCm: Float32Array;
  /** profondeur de la nappe sous chaque cellule, cm — elle vit, elle (nappe.ts) */
  soilNappeCm: Float32Array;
  /** engorgement moyen du profil par cellule ∈ [0,1] : ce qui asphyxie les racines */
  soilEngorgement: Float32Array;
  /** cellules closes (1) — le gibier n'y entre pas */
  soilCloture: Uint8Array;
  /**
   * Ce qui n'a pas pu rentrer dans le sol cette semaine, mm par cellule
   * (débordement du profil + ruissellement refusé). La crue, la lame d'eau,
   * la ravine (tick.ts).
   */
  soilDebordementMm: Float32Array;
  /**
   * Lumière relative arrivant au sol par cellule ∈ [0,1] (light.ts) : le
   * sous-bois sombre, les taches de lumière, l'ambiance.
   */
  soilLumiere: Float32Array;
  /**
   * Litière au sol, gC/m² par cellule : le tapis de feuilles de novembre, le
   * paillage d'un BRF fraîchement épandu, le noir des cendres après un feu.
   */
  soilLitiereCG: Float32Array;
  /**
   * Le calendrier foliaire de la semaine (phenologie.ts) : cinq scalaires
   * avec lesquels le rendu recalcule `partFoliaire` et la sénescence espèce
   * par espèce, sans qu'on ait à transporter une valeur par arbre.
   */
  pheno: ContextePhenologique;
  /** refus d'actions depuis le dernier instantané */
  refusals: ActionRefusal[];
  /** événements depuis le dernier instantané */
  events: GameEvent[];
  /**
   * Arbres morts depuis le dernier instantané, avec leur position : c'est ce
   * qui déclenche les animations de mort, une par cause.
   */
  morts: MortDeLaSemaine[];
  /**
   * Gestes subis par des arbres nommés depuis le dernier instantané (coupe,
   * éclaircie, élagage, étêtage, recépage, broutage, frottis).
   */
  gestes: GesteVisible[];
  /**
   * Chandelles abattues depuis le dernier instantané. `soilBoisAuSol` dit où
   * le tronc s'est retrouvé, mais pas qu'il vient de TOMBER : sans ces
   * événements, la trouée n'est qu'un changement d'éclairage entre deux
   * images, au lieu d'être la conséquence lisible d'une chute (boisMort.ts).
   */
  chutes: ChuteDeChandelle[];
  /** l'incendie de la semaine, avec son front, s'il y en a eu un (feu.ts) */
  incendie?: IncendieResult;
}

export interface StationInfo {
  id: string;
  nom: string;
  coteM: number;
  /** réserve utile de l'horizon de surface, mm (échelle de la carte) */
  ruMm: number;
  phInitial: number;
  meteoLabel: string;
  /** eau libre de la parcelle : l'UI la dessine (eau_surface.ts) */
  eau: EauDeSurface;
  /** cellules occupées par l'eau libre, telles que le moteur les voit */
  enEau: boolean[];
  /** profondeur d'équilibre de la nappe, cm */
  nappeEquilibreCm: number;
  /**
   * Exposition au vent de la parcelle ∈ [0,1], telle que les bordures la font
   * (paysage.ts). Elles sont fixées au départ : elle part une fois, avec la
   * station. C'est ce qui règle le balancement des arbres.
   */
  ventExposition: number;
  /** profondeur de la nappe sous chaque cellule, cm — fixe, envoyée une fois */
  nappeCm: Float32Array;
  /**
   * Altitude de chaque cellule, m — le RELIEF, tel que le moteur le voit
   * (`altitudeParCellule`, relief.ts). Il ne bouge pas d'une semaine à
   * l'autre : envoyé une fois, avec le reste de la station. Sans lui il n'y a
   * pas de vue isométrique du tout.
   */
  altitudesM: readonly number[];
}

export type ToWorker =
  | {
      type: "init";
      stationId: string;
      seed: number;
      meteo: "reelle" | "synthetique";
      scenario: ScenarioId;
      bordures: Bordures;
      relief: Relief;
      eau: EauDeSurface;
      /** profondeur d'équilibre de la nappe, cm */
      nappeCm: number;
      /** part du bassin qui subit le même sort que la parcelle ∈ [0,1] */
      partBassin: number;
      /** années à faire passer sur le terrain avant que le joueur n'arrive */
      maturationAns: number;
      anneeDepart: number;
    }
  | { type: "resume"; save: SaveGame }
  | { type: "speed"; weeksPerSecond: number }
  | { type: "action"; action: ActionSansSemaine }
  | { type: "autoHarvest"; enabled: boolean }
  | { type: "requestSave" };

export type FromWorker =
  | { type: "ready"; station: StationInfo }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "save"; save: SaveGame }
  | { type: "progress"; done: number; total: number; phase?: "vieillissement" | "rejeu" }
  /** le temps s'est arrêté tout seul (fruits mûrs…) : l'UI resynchronise la vitesse */
  | { type: "autopause"; reason: string };
