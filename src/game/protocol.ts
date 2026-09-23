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
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  IncendieResult,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
  TempeteResult,
} from "../engine/tick";
import type { CauseMort } from "../engine/trees";
import type { DecorBordures } from "../render/couches/decor";
import type { Bilan } from "./bilan";
import type { Cumuls } from "./niveaux";
import type { ChoixRecolte } from "./recolteAuto";

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
  /**
   * L'argent contraignait-il la partie ? Absent = oui, pour que les
   * sauvegardes d'avant restent lisibles. Sans ce champ, une partie jouée sans
   * contrainte se rejouerait AVEC, et divergerait.
   */
  economie?: boolean;
  /** année civile du début de partie */
  anneeDepart: number;
  /**
   * Ce que le joueur a demandé qu'on fasse des heures supplémentaires, s'il
   * l'a demandé (#133). Absent = on lui repose la question.
   */
  politiqueHoraire?: PolitiqueHoraire;
  /**
   * Le niveau joué, s'il y en a un (#188). Absent = bac à sable.
   *
   * Seul l'IDENTIFIANT est rangé, pas la fiche : un niveau corrigé doit
   * s'appliquer aux parties en cours, et une fiche recopiée dans chaque
   * sauvegarde serait une seconde copie de la règle, donc une divergence (§2.1).
   */
  niveauId?: string;
  /**
   * Les paliers déjà franchis.
   *
   * La plupart se retrouvent tout seuls au rejeu — un cumul ne redescend pas.
   * Ceux qui portent sur un STOCK, eux, ne se retrouvent pas : douze arbres
   * protégés puis morts ne laissent aucune trace dans l'état. Sans cette
   * liste, reprendre une partie reprendrait un objectif déjà gagné.
   */
  paliersAcquis?: string[];
  /**
   * Ce que le joueur a décidé de la récolte automatique, essence par essence.
   *
   * Seules ses DÉCISIONS sont rangées, pas la liste effective : celle-ci se
   * recalcule du journal (ce qu'il a semé) et de ces décisions. Ranger la liste
   * effective en ferait une seconde copie d'une règle, qui dériverait du jour
   * où la règle par défaut changerait.
   */
  recolteAuto?: ChoixRecolte;
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
  /**
   * Diamètre à 1,30 m, cm. Il ne se déduit PLUS de la hauteur : deux arbres de
   * même taille n'ont pas la même grosseur selon qu'ils ont poussé serrés ou
   * au large (#62).
   *
   * Sans lui, le rendu ne pourrait plus calculer le stade de développement,
   * qui est une classe de diamètre (`stades.ts`) — et il ne pourrait pas
   * dessiner un tronc à la bonne épaisseur, ce qu'il déduisait jusqu'ici d'un
   * proxy faux.
   */
  diametreCm: number;
  ageWeeks: number;
  stress: number;
  /**
   * D'OÙ vient ce stress, pour les origines que le moteur sait nommer sur un
   * arbre VIVANT (#153). `stress` seul est une somme : sécheresse, famine,
   * ravageurs et maladie y tombent ensemble, et le jeu ne peut pas les
   * départager — il n'a pas le droit de refaire le calcul, et l'information
   * n'y est plus.
   *
   * Les trois sont des parts de `stress`, amorties avec lui : leur somme lui
   * reste inférieure ou égale, et ce qui manque est ce que personne ne nomme
   * encore (le frottis, qui se lit par `frotteSemaine`).
   */
  stressLent?: number;
  causeLente?: CauseMort;
  stressRavageurs?: number;
  stressMaladie?: number;
  fruitsKg: number;
  /** hauteur de bille élaguée, m (ce qui fera du bois d'œuvre) */
  hauteurElagueeM: number;
  /**
   * Base du houppier, m : en dessous, plus une branche vivante — donc du fût
   * nu à dessiner (`trees.ts`, docs/realisme.md B10).
   *
   * Elle voyage parce qu'elle ne se déduit de RIEN : ni de l'espèce (le même
   * chêne est branchu en pré et nu sur quinze mètres en futaie), ni de
   * `hauteurElagueeM` (qui ne compte que le coup de scie, pas l'ombre). Le
   * rendu en avait fabriqué une approximation privée — 0,3 pour un caduc,
   * 0,2 pour un conifère — qui ne disait rien de la compétition subie.
   */
  baseHouppierM: number;
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
   * chaque étêtage — mais la DIMENSION qui en découle ne se déduit pas de ce
   * seul compteur sans recopier le modèle : elle voyage, ci-dessous.
   */
  recepages: number;
  /**
   * Diamètre de la tête de trogne, cm — 0 si l'arbre n'a jamais été étêté
   * (`trogne.ts`). C'est le renflement à dessiner, et il GROSSIT coupe après
   * coupe : une tête de trois étêtages et un saule têtard centenaire n'ont
   * pas la même silhouette, ni de loin la même valeur.
   */
  diametreTeteCm: number;
  /**
   * Volume de la cavité de la tête, litres — 0 tant qu'elle ne s'est pas
   * creusée. C'est ce creux qui vaut habitat, et le rendu peut le montrer :
   * quelques litres pour une mésange, des dizaines pour une chevêche.
   *
   * Il ne se déduit ni de `recepages` (la part creusée n'est pas linéaire) ni
   * du diamètre : c'est le moteur qui tient ce calcul, et `biodiversite.ts`
   * lit exactement la même valeur pour noter la parcelle.
   */
  caviteTeteL: number;
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
  /**
   * Semaine où une tempête l'a couché ; absent = pas de chablis.
   *
   * SANS ELLE, L'INSTANTANÉ MENT (#87). Un chablis reste dans `state.trees`
   * l'année où son bois est encore récupérable, mort mais non purgé — et le
   * rendu le recevait avec `chandelle: true`, c'est-à-dire annoncé comme un
   * tronc mort resté DEBOUT là où le moteur a un arbre par terre. Ce n'était
   * pas une donnée manquante, c'était une donnée fausse.
   */
  renverseSemaine?: number;
  /**
   * Direction dans laquelle le tronc est parti, radians ; absent = pas de
   * chablis.
   *
   * Tous les arbres d'une même rafale la partagent, puisqu'elle est le cap du
   * vent de la semaine : un bouquet de troncs couchés dans le même sens est la
   * signature d'une tempête sur le terrain, et elle se lit d'un coup d'œil sur
   * la carte. Elle ne se déduit de rien — la pente orienterait une chandelle,
   * pas un chablis (`boisMort.ts`).
   */
  chuteRad?: number;
  /** ce qui a eu raison de l'arbre : onze causes, onze animations de mort */
  causeMort?: CauseMort;
  /**
   * Semaine de la dernière levée d'écorce ; absent = jamais démasclé. Le tronc
   * d'un chêne-liège démasclé est ocre-rouge, et il reverdit avec les années.
   */
  derniereLeveeSemaine?: number;
  /**
   * Part de la couronne EN FLEUR ∈ [0,1] (phenologie.ts). Elle ne se déduit
   * d'aucun autre champ : `fruitProgress` vaut 0 avant la floraison, 0
   * pendant, et 0 toute l'année pour un arbre immature — les trois cas sont
   * indiscernables. Et elle ne se recalcule pas côté rendu : la fenêtre est un
   * seuil de degrés-jours, et deux copies dériveraient d'une semaine ou deux
   * sans que rien ne le signale.
   *
   * C'est le seul moment de l'année où un verger se voit de loin, et c'est
   * aussi là que se jouent le gel tardif (`bloomFrosted`) et la pollinisation.
   */
  floraison: number;
  /** avancement des fruits de l'année ∈ [0,1] : floraison → nouaison → maturation */
  fruitProgress: number;
  /** fleurs détruites par un gel tardif : elles brunissent au lieu de nouer */
  bloomFrosted: boolean;
  /** longueur de pousse encore tendre, m — ce que le chevreuil a mangé (gibier.ts) */
  pousseTendreM: number;
  /** semaine du dernier frottis ; absent = jamais frotté (écorce arrachée au pied) */
  frotteSemaine?: number;
  /**
   * Semaine du dernier abroutissement ; absent = jamais brouté. La flèche
   * coupée, le plant rabattu — et le moment où c'est arrivé, pour que la
   * marque s'estompe.
   *
   * `pousseTendreM` ne la remplace pas : c'est un stock qui baisse aussi bien
   * par lignification et par dormance que par la dent du chevreuil. Une valeur
   * basse peinte en « brouté » couvrirait surtout des arbres en hiver.
   */
  brouteSemaine?: number;
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
  /**
   * Part de ce bois qui BARRE l'eau, ∈ [0,1] (boisMort.ts) : ce qui reste de sa
   * longueur une fois projetée sur la courbe de niveau et le seuil des 30° passé.
   * C'est elle, et pas la masse, qui dit si le tronc barre l'eau ou s'il fait
   * gouttière : deux cellules aussi chargées de bois n'ont pas le même effet
   * sur le ruissellement, et le rendu doit pouvoir le montrer.
   */
  soilBoisEnTravers: Float32Array;
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
   * Humidité VÉCUE par le tapis herbacé, par cellule ∈ [0,1] (herbe.ts) : le
   * remplissage de l'horizon de SURFACE, lissé sur ~6 semaines.
   *
   * Ce n'est ni `soilWater` (la réserve du profil entier, instantanée) ni la
   * couverture : c'est la grandeur sur laquelle le moteur décide lui-même si
   * une cellule peut porter de l'herbe. L'inertie compte autant que la valeur —
   * un tapis ne jaunit pas en une semaine sèche et ne reverdit pas sur une
   * averse ; branchée sur l'humidité instantanée, la couleur du gazon
   * clignoterait à chaque pluie, ce que ce lissage existe pour éviter.
   *
   * C'est ce qui distingue la pelouse GRILLÉE — couverture pleine, biomasse
   * basse, et pourtant brune — du foin sur pied et de l'herbe qui recule.
   */
  soilHerbeHumidite: Float32Array;
  /**
   * Emprise de CHAQUE espèce herbacée, par cellule — une grille par espèce,
   * dans l'ordre de `HERBACEES` (herbacees.ts), en 0-255 pour une emprise de
   * 0 à 1. `herbesIds` donne la correspondance.
   *
   * POURQUOI LE MÉLANGE ET NON LA DOMINANTE (#86). Le rendu lisait le seuil
   * d'eau chez le dactyle pour toutes les cellules, faute de savoir qui les
   * tient — exact tant que le tapis était un dactyle qui s'ignorait, faux dès
   * qu'autre chose pousse. L'envoi d'un simple indice d'espèce dominante était
   * la réponse évidente, et la mesure la refuse : sur limon riche et sur
   * friche, la première espèce ne tient qu'une médiane de 0,88 à 0,92 de sa
   * cellule, et surtout SON IDENTITÉ BASCULE d'avril à juillet sur près de
   * quarante pour cent des cellules — le dactyle régresse à la sécheresse
   * pendant que l'anémone, dormante, ne perd rien. Un indice unique ferait donc
   * sauter la teinte ET le seuil (0,35 → 0,50) d'une saison à l'autre, alors
   * que le mélange, lui, ne bouge presque pas. Sur la lande sèche la question
   * ne se pose pas : la molinie tient 100 % de chaque cellule.
   *
   * Un octet par espèce et par cellule, et non un flottant : le rendu en tire
   * une teinte et un seuil pondéré, où 1/255 est très au-delà du nécessaire.
   * Ça coûte le tiers d'un `Float32Array`, ce qui compte puisque le nombre
   * d'espèces grandira avec l'atlas.
   */
  soilHerbeEmprises: Uint8Array[];
  /** les identifiants d'espèce, dans l'ordre de `soilHerbeEmprises`. */
  herbesIds: readonly string[];
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
   * avec lesquels le rendu recalcule les parts foliaires et la sénescence espèce
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
   * Semis installés depuis le dernier instantané, avec leur position : la
   * moitié positive de l'histoire, sans quoi le calque des changements ne sait
   * montrer que ce qui meurt (tick.ts).
   */
  naissances: NaissanceDeLaSemaine[];
  /**
   * Tiges que la CROISSANCE a fait changer de stade depuis le dernier
   * instantané (stades.ts). Le stade lui-même se calcule côté rendu depuis
   * `heightM` (`stadeDe`) ; c'est le franchissement, qui demande de comparer
   * deux instants, que le moteur seul peut voir.
   */
  franchissements: FranchissementDeStade[];
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
  /**
   * La tempête de la semaine, s'il y en a eu une (tempete.ts) — la rafale, le
   * cap du vent, et les tiges qu'elle a couchées avec leur hauteur.
   *
   * Elle voyage pour la même raison que l'incendie : sans l'événement, le rendu
   * ne voit qu'un état changé entre deux images et n'a pas de MOMENT où jouer
   * l'acte. Le moteur la calculait déjà en entier ; elle s'arrêtait au journal
   * de la semaine (#87).
   */
  tempete?: TempeteResult;
}

export interface StationInfo {
  id: string;
  nom: string;
  coteM: number;
  /**
   * Réserve utile du PROFIL ENTIER, mm — la même grandeur que `Station.ruMm`
   * du moteur, et sous le même nom exprès.
   *
   * C'est elle que lisent les règles qui parlent du sol où un arbre s'enracine :
   * `especeTenable` écarte les espèces exigeantes en eau sous 120 mm, et ce
   * seuil-là parle du profil, pas de la couche de surface (#190).
   */
  ruMm: number;
  /**
   * Réserve utile du seul HORIZON DE SURFACE, mm.
   *
   * Séparée, et nommée autrement, parce que c'en est une autre : c'est la
   * borne haute du calque « Eau » de la carte du sol, dont `soilWater` ne
   * rapporte que cet horizon. Les deux ont vécu sous le nom `ruMm`, et le
   * sélecteur d'essences a pris l'une pour l'autre — il écartait huit espèces
   * du limon le plus riche du jeu (#190).
   */
  ruHorizonSurfaceMm: number;
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
  /**
   * Surface qui verse sur la parcelle depuis l'amont, hectares
   * (`Relief.bassinAmontHa`).
   *
   * **Elle part parce que le décor la dessine** (#150) : c'est elle qui dit
   * jusqu'où le versant amont monte avant de buter sur une crête. Elle était
   * déjà dans la partie — c'est un curseur de l'écran de départ — mais elle
   * n'arrivait pas jusqu'au rendu, qui ne pouvait donc pas distinguer une
   * parcelle de crête d'un fond de vallon.
   *
   * Comme le relief et les bordures : choisie au départ, envoyée une fois, et
   * conservée par la sauvegarde.
   */
  bassinAmontHa: number;
  /**
   * Ce qui entoure la parcelle, réduit à ce que le DÉCOR en dessine : trois
   * parts de couvert et les semenciers, par côté (`decorDesBordures`).
   *
   * Les bordures sont choisies au départ et ne changent plus : elles partent
   * une fois, comme le relief. La vue ne peut pas les redemander au moteur —
   * elle ne garde pas les réglages de la partie, et une partie reprise d'une
   * sauvegarde ne les a jamais vus passer.
   */
  bordures: DecorBordures;
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
      /** l'argent contraint-il la partie ? (actions.ts) */
      economie: boolean;
    }
  | { type: "resume"; save: SaveGame }
  | { type: "speed"; weeksPerSecond: number }
  /**
   * RETENIR l'horloge sans toucher à la vitesse (#163).
   *
   * Le temps du jeu attend qu'une animation bloquante finisse. Distinct d'une
   * mise en pause, et il le faut : la vitesse choisie par le joueur doit être
   * intacte quand on relâche, et une pause qu'on pose puis qu'on lève écraserait
   * une traversée en cours (`avancerDe`) comme une reprise en main.
   */
  | { type: "attendre"; retenu: boolean }
  | { type: "action"; action: ActionSansSemaine }
  | { type: "autoHarvest"; enabled: boolean }
  /**
   * « Ce geste passerait-il ? » — sans le faire.
   *
   * Le worker le demande au moteur, qui répond par `prevoirAction` sans rien
   * changer. C'est le seul moyen d'annoncer un refus avant le clic sans tenir
   * dans le jeu une seconde copie des règles, qui dériverait en silence.
   *
   * Le jeu a d'abord appliqué l'action en jetant le résultat, en tenant
   * lui-même par un essai la propriété dont il dépendait. #139 demandait que
   * le moteur en fasse un contrat ; #152 l'a livré.
   *
   * `cle` revient telle quelle dans la réponse : le survol pose la question
   * plusieurs fois par seconde, et sans elle on ne saurait pas de quelle
   * position vient la réponse qui arrive.
   */
  | { type: "prevoir"; cle: string; action: ActionSansSemaine }
  /**
   * « Avance de tant de semaines, puis arrête-toi. »
   *
   * **La traversée est jouée, pas sautée.** Le joueur qui demande un mois veut
   * voir la parcelle changer, pas la retrouver changée : le worker avance donc
   * à la vitesse demandée, semaine après semaine, et c'est LUI qui s'arrête au
   * bon moment. Le faire côté jeu voudrait dire guetter le bandeau et
   * re-cliquer sur pause au jugé, ce que le joueur faisait déjà à la main.
   *
   * L'arrivée se signale par `autopause`, comme les fruits mûrs : c'est le
   * message qui resynchronise la vitesse de l'interface.
   */
  | {
      type: "avancerDe";
      semaines: number;
      weeksPerSecond: number;
      /** ce que l'arrivée dira au joueur — le worker ne sait pas nommer un mois */
      libelle: string;
    }
  /**
   * LES ARBRES SUIVIS, pour que le worker sache s'arrêter quand l'un meurt (#149).
   *
   * La liste entière à chaque fois, et non un ajout : c'est un ENSEMBLE, et
   * s'envoyer des deltas demanderait aux deux côtés de tenir la même liste —
   * deux copies d'un même état, ce que le §2.1 nous a déjà coûté ailleurs.
   *
   * Le jeu, lui, tient le journal : le worker n'a besoin de savoir que ce
   * qu'il est seul à pouvoir faire, arrêter le temps au bon tick. Le faire
   * côté jeu voudrait dire découvrir la mort à l'instantané suivant, c'est-à-
   * dire jusqu'à vingt-six semaines trop tard.
   */
  | { type: "suivre"; ids: number[] }
  /**
   * Le niveau joué et les paliers déjà franchis (#188).
   *
   * Le worker ne JOUE pas le niveau — il n'en connaît ni les paliers ni les
   * cibles, qui sont des fermetures et ne traverseraient pas la frontière du
   * worker. Il les RANGE, pour que la sauvegarde les porte.
   */
  | { type: "niveau"; id?: string; acquis: string[] }
  /** allumer ou éteindre la récolte automatique d'une essence */
  | { type: "recolteAuto"; especeId: string; actif: boolean }
  /**
   * La réponse à la facture (#133). `embaucher` vrai paie les bras qu'il faut
   * — rétroactivement, pour des heures déjà faites — ; faux ramène la semaine
   * sous le plafond en rejouant sans ses derniers gestes.
   */
  | { type: "reglerFacture"; embaucher: boolean; pourToujours: boolean }
  /** Changer la consigne sans qu'une facture soit posée — pour la révoquer. */
  | { type: "politiqueHoraire"; politique: PolitiqueHoraire }
  /**
   * REVENIR EN ARRIÈRE et rejouer jusqu'au présent (#128, §6.8 №3).
   *
   * Une RELECTURE, pas une reprise : le présent est mis de côté et retrouvé
   * intact au bout, rien de ce qui est rejoué n'est compté deux fois, et le
   * joueur ne peut pas agir pendant. « On ne montre pas une année en une
   * image, on offre de la revoir. »
   */
  | { type: "relire"; deSemaine: number; weeksPerSecond: number }
  /** Rendre la main au présent, que la relecture soit finie ou non. */
  | { type: "arreterLaRelecture" }
  | { type: "requestSave" };

/**
 * LA FACTURE D'UNE SEMAINE TROP CHARGÉE (#133).
 *
 * Le plafond de soixante heures ne refuse plus rien : il se paie. Ces trois
 * nombres viennent du moteur (`depassementHoraire`, `coutDuDepassement`) ; le
 * quatrième se mesure en rejouant la semaine à blanc, côté worker, parce que
 * lui seul sait ce que le joueur a posé depuis lundi.
 */
/**
 * QUE FAIRE DES HEURES SUPPLÉMENTAIRES, la fois d'après (#133).
 *
 * « Se souvenir de mon choix » : une semaine trop chargée est une situation
 * ordinaire dans une partie longue, et répondre à la même question toutes les
 * semaines n'est plus un arbitrage, c'est une corvée. Le choix retenu
 * s'applique alors tout seul — et le journal le dit à chaque fois, parce qu'un
 * automatisme qui dépense de l'argent en silence est pire que la question.
 */
export type PolitiqueHoraire = "demander" | "embaucher" | "plafond";

export interface FactureHoraire {
  /** heures au-delà du plafond, toutes UTH comptées */
  heures: number;
  /** combien de bras il faudrait pour les couvrir */
  embauches: number;
  /** ce que ces bras coûtent, € */
  eur: number;
  /** combien de gestes tomberaient si l'on s'en tenait au plafond */
  gestesAnnules: number;
}

export type FromWorker =
  | { type: "ready"; station: StationInfo }
  /**
   * L'instantané, et ce qui s'est ACCUMULÉ depuis le début de la partie (#188).
   *
   * Le cumul voyage à côté de l'instantané, et non dedans : l'instantané est ce
   * que le MOTEUR dit de la parcelle à cette semaine, le cumul est ce que le
   * jeu a compté des gestes qu'il a rapportés. Les mélanger ferait croire que
   * le moteur tient un compte qu'il ne tient pas.
   *
   * `bilan` est du même bois (#128) : tout ce qui a changé depuis le début de
   * la partie, groupé et situé. Il est compté dans le worker pour la raison qui
   * y garde le cumul — reprendre une sauvegarde rejoue le journal sans qu'un
   * seul instantané intermédiaire ne remonte. L'écran n'en tient pas de
   * second : la période qu'il affiche est celui-ci moins celui qu'il avait au
   * début de la période.
   */
  | {
      type: "snapshot";
      snapshot: Snapshot;
      cumuls: Cumuls;
      bilan: Bilan;
      /**
       * La plus ancienne semaine où le rembobinage sait revenir (#128).
       *
       * Elle voyage à chaque instantané parce qu'elle AVANCE : les points de
       * reprise sont une fenêtre glissante, et l'écran ne doit pas proposer de
       * revoir une période dont le début est déjà tombé par-dessus bord.
       */
      rembobinable: number;
    }
  /** Le niveau et ses paliers franchis, tels que la sauvegarde les portait. */
  | { type: "niveau"; id?: string; acquis: string[] }
  /**
   * Ce qui est cueilli d'office, et pourquoi.
   *
   * `semees` vient du journal du joueur, `choix` de ses décisions : l'écran a
   * besoin des DEUX pour dire si une pastille est allumée par défaut ou parce
   * qu'on l'a voulu.
   */
  | { type: "recolteAuto"; semees: string[]; choix: ChoixRecolte }
  | { type: "save"; save: SaveGame }
  | { type: "progress"; done: number; total: number; phase?: "vieillissement" | "rejeu" }
  /**
   * Le temps s'est arrêté tout seul (fruits mûrs…) : l'UI resynchronise la
   * vitesse.
   *
   * `scene` n'est renseignée que pour ce qui MÉRITE D'ÊTRE REVU — un incendie,
   * une tempête, une mortalité de masse — et porte la semaine où revenir. C'est
   * le « mode cinéma » du §6.8 : *« l'autopause existe déjà pour l'incendie ; on
   * l'étend à la crue et aux mortalités de masse, puis on rejoue la scène à
   * ×1 »*. Absente pour une pause qui n'a rien à montrer — l'arrivée d'un saut
   * « +1 an », des fruits mûrs, une faillite.
   */
  | { type: "autopause"; reason: string; scene?: number }
  /**
   * « Votre semaine dépasse : vous embauchez, ou on s'en tient à 60 h ? »
   *
   * Le temps est arrêté quand ce message part, et il ne repart pas avant la
   * réponse (`reglerFacture`) : c'est une question, pas une notification.
   */
  | { type: "facture"; facture: FactureHoraire }
  /** la consigne en vigueur, à chaque fois qu'elle change (y compris au rejeu) */
  | { type: "politiqueHoraire"; politique: PolitiqueHoraire }
  /** la réponse à `prevoir` : les refus qu'aurait produits ce geste */
  | { type: "prevision"; cle: string; refusals: ActionRefusal[] }
  /**
   * OÙ EN EST LA RELECTURE (#128).
   *
   * `enCours` faux dit qu'on est revenu au présent — y compris quand la
   * demande a été refusée faute de point de reprise assez ancien. L'écran en a
   * besoin pour bien plus que l'afficher : pendant une relecture il doit
   * geler ce qui COMPTE — les paliers du niveau, la période du bilan, le
   * journal des arbres suivis — sans quoi une partie revue se mettrait à
   * gagner des objectifs qu'elle a déjà gagnés.
   */
  | {
      type: "relecture";
      enCours: boolean;
      depuis: number;
      semaine: number;
      jusqua: number;
      /**
       * La vitesse à laquelle la relecture se joue.
       *
       * Elle revient à l'écran au lieu d'y être posée d'avance, et ce n'est pas
       * un détail : poser la vitesse AVANT de savoir qu'une relecture commence
       * ouvre une image où l'horloge coule sans qu'on relise — et la partie
       * jouée l'a prise en faute, la période du bilan s'effaçait au clic même
       * sur « Revoir ».
       */
      vitesse: number;
    };
