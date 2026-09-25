/**
 * Worker de simulation : le moteur (pur) tourne ici, hors du thread UI
 * (docs/stack.md). L'état vit toujours « semaine ouverte » (beginWeek fait) :
 * une action reçue s'applique immédiatement — même en pause — et est datée de
 * la semaine courante dans le journal ; le rejeu du journal (sauvegarde)
 * reproduit exactement la même partie.
 */

import { serieMeteoPour } from "../data/meteo";
import type { ActionRefusal, GameAction, GesteVisible } from "../engine/actions";
import {
  applyAction,
  coutDuDepassement,
  depassementHoraire,
  prevoirAction,
  valeurSurPied,
} from "../engine/actions";
import { figerCarboneDeReference } from "../engine/carbon";
import {
  getScenario,
  meteoDerivee,
  type Normales,
  normalesHebdo,
  type ScenarioId,
} from "../engine/climat";
import { champDeNappeCm, type EauDeSurface } from "../engine/eau_surface";
import { getEspece } from "../engine/especes";
import { advanceWeek, beginWeek } from "../engine/game";
import { partMecanisable } from "../engine/mecanisation";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../engine/meteo";
import { profondeurEquilibreCm } from "../engine/nappe";
import {
  type Bordures,
  bordersUniformes,
  entourageDeLaStation,
  resumeBordures,
} from "../engine/paysage";
import {
  ALTITUDE_SERIE_M,
  altitudeParCellule,
  anomalieAltitudeC,
  anomalieExpositionC,
  type Relief,
} from "../engine/relief";
import { rngStateFromSeed } from "../engine/rng";
import { ruHorizonMm } from "../engine/soil";
import {
  createGameState,
  type GameState,
  gridDims,
  type Station,
  type TickFluxes,
} from "../engine/state";
import { STATIONS_V0, type StationClimat } from "../engine/stations";
import { sourcesDeLaParcelle } from "../engine/terrain";
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  IncendieResult,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
  TempeteResult,
} from "../engine/tick";
import { tick } from "../engine/tick";
import type { CauseMort, TreeState } from "../engine/trees";
import { HAUTEUR_TROUVABLE_M } from "../render/temps/changements";
import { agreger, BILAN_VIDE, type Bilan } from "./bilan";
import { prefixeSousLePlafond } from "./facture";
import { journalDe, type PorteurDeJournal } from "./journal";
import { accord, causeDite, estFeminin, nomEspece, nomEspeces, s } from "./mots";
import { accumuler, CUMULS_VIDES, type Cumuls } from "./niveaux";
import { decorDesBordures } from "./parcelle";
import type {
  FactureHoraire,
  FromWorker,
  GameEvent,
  PolitiqueHoraire,
  SaveGame,
  StationInfo,
  ToWorker,
} from "./protocol";
import {
  arbresMurs,
  type ChoixRecolte,
  especesRecoltees,
  especesSemees,
  fautIlPrevenir,
} from "./recolteAuto";
import { estUneMortaliteDeMasse, estUneTempeteAVoir } from "./scenes";
import { construireSnapshot, transferablesDuSnapshot } from "./snapshot";

let sc: StationClimat | undefined;
let weather: WeekWeather[] = [];
/** état courant, toujours « semaine ouverte » */
let state: GameState | undefined;
let journal: GameAction[] = [];
/**
 * Ce que le joueur a **semé**, tiré de son propre journal.
 *
 * C'est ce qui sépare son verger de la friche qui l'entoure, et la récolte
 * automatique s'y tient : elle existe pour qu'on ne rate pas **sa** fenêtre de
 * récolte en avançant vite, pas pour cueillir des ronces à cent cinquante
 * heures la semaine.
 */
let semees: ReadonlySet<string> = new Set();
/** Ce que le joueur a décidé essence par essence, et qui prime sur le défaut. */
let choixRecolte: ChoixRecolte = {};
/** Ce qui est effectivement cueilli d'office — la règle, appliquée une fois. */
let recoltees: ReadonlySet<string> = new Set();

/** Recalculer ce qui est cueilli, et le dire à l'écran. */
function majRecolteAuto(): void {
  recoltees = especesRecoltees(semees, choixRecolte);
  post({ type: "recolteAuto", semees: [...semees], choix: { ...choixRecolte } });
}
let meteoMode: "reelle" | "synthetique" = "reelle";
let scenario: ScenarioId = "ssp245";
let anneeDepart = 2026;
let bordures: Bordures = bordersUniformes("bocage");
// Relief choisi au lancement ; à défaut, celui d'origine de la station.
let relief: Relief | undefined;
/** Vrai tant qu'une animation bloquante retient le temps du jeu (#163). */
let retenu = false;
/** Les arbres que le joueur suit : leur mort arrête le temps (#149). */
let suivis: ReadonlySet<number> = new Set();
/**
 * ─── **la facture horaire** (#133) ───────────────────────────────────────────
 *
 * Le plafond de soixante heures ne refuse plus rien (#137) : il se paie. Pour
 * pouvoir le présenter en fin de semaine — « tant d'heures, tant d'euros :
 * vous embauchez, ou on s'en tient à vos 60 h ? » — il faut savoir revenir en
 * arrière, et c'est là qu'était le point dur : une action est appliquée **au**
 * **clic**, et couper un arbre change beaucoup de choses.
 *
 * **On ne défait donc rien : on rejoue la semaine depuis son début avec une
 * liste élaguée**, ce que l'issue désignait comme la piste à instruire. Il
 * suffit pour ça de garder l'état tel qu'il était à l'ouverture de la semaine
 * — une référence, l'état étant remplacé en entier à chaque application — et
 * la liste des actions posées depuis.
 */
let debutDeSemaine: GameState | undefined;
let actionsDeLaSemaine: GameAction[] = [];
/**
 * Ce qui s'est accumulé depuis le début de la partie (#188) : les kilos
 * cueillis, les plants mis en terre, les tiges abattues.
 *
 * **Ici et pas dans l'interface**, parce que c'est ici que la partie se
 * **rejoue** : reprendre une sauvegarde rejoue son journal d'actions, et un cumul
 * tenu ailleurs repartirait de zéro à chaque reprise. Un objectif comme
 * « récolter une tonne de pommes » porte sur des fruits qui ont quitté la
 * parcelle — aucun instantané ne les montre plus.
 */
let cumuls: Cumuls = CUMULS_VIDES;
/** Le cumul à l'ouverture de la semaine, jumeau de `debutDeSemaine`. */
let cumulsAuDebut: Cumuls = CUMULS_VIDES;
/**
 * **le bilan de la partie** (#128) : tout ce qui a changé depuis son début.
 *
 * **Ici pour la même raison que `cumuls`, et la raison est décisive** :
 * reprendre une sauvegarde **rejoue** le journal d'actions, semaine après semaine,
 * sans qu'un seul instantané intermédiaire ne remonte à l'écran. Un bilan tenu
 * là-haut repartirait de zéro à chaque reprise — et c'est justement à la fin
 * d'un niveau, souvent repris, qu'on veut raconter ce qui s'est passé.
 *
 * L'écran, lui, n'en tient pas de second : la période qu'il affiche est ce
 * bilan-ci moins celui qu'il avait au début de la période (`soustraire`).
 */
let bilan: Bilan = BILAN_VIDE;
/** Le bilan à l'ouverture de la semaine, jumeau de `cumulsAuDebut`. */
let bilanAuDebut: Bilan = BILAN_VIDE;

/**
 * ═══ **le rembobinage** (#128, §6.8 №3) ═══
 *
 * *« Garder les instantanés récents en mémoire et pouvoir revenir en arrière
 * pour rejouer la période à ×1, avec toutes les animations. C'est la seule
 * façon honnête de tout voir : on ne montre pas une année en une image, on
 * offre de la revoir. »*
 *
 * ## Des états, pas des instantanés
 *
 * Le §6.8 prévoyait de garder les **instantanés** — « ~280 ko pièce, une année
 * tient dans 15 Mo » — et notait que le worker devrait alors en poster un par
 * semaine simulée au lieu d'un par lot de vingt-six. C'est beaucoup de travail
 * en pure perte, et il y a moins cher : garder des **états de partie**, et
 * refabriquer les instantanés au moment de la relecture.
 *
 * **Ça ne coûte qu'une référence retenue**, parce que le moteur ne modifie
 * jamais un état : `advanceWeek` en rend un neuf et laisse l'ancien intact —
 * son sol, ses arbres, sa graine aléatoire, sa banque de graines. Un essai le
 * tient (`tests/unit/points-de-reprise.test.ts`), et il a fallu le vérifier
 * avant d'écrire une ligne d'ici : si la propriété tombait, un point de reprise
 * vieillirait avec la partie et le rembobinage ramènerait au présent **sans que
 * rien ne casse**. Le pire des défauts, celui qui ne se voit pas.
 *
 * Le worker en dépendait d'ailleurs déjà sans le dire : une semaine trop
 * chargée se rejoue depuis l'état retenu à son ouverture (#133).
 *
 * ## Le grain, et ce qu'il coûte — **mesuré**, et deux fois plutôt qu'une
 *
 * Le premier jet gardait quarante points, un par trimestre, sur la foi d'un
 * « quelques centaines de kilo-octets par point » que personne n'avait pesé.
 * **L'onglet a planté pendant une relecture sur lande sèche**, et c'est ce qui
 * a fait poser la question.
 *
 * La première pesée a répondu six mégaoctets, la deuxième vingt-huit : les deux
 * étaient fausses, et pour la même raison — sans ramasse-miettes forcé, on
 * mesure les **déchets** des états intermédiaires et non ce qui est retenu. Avec
 * `--expose-gc`, deux traversées identiques dont une seule retient : **3,9 Mo
 * par point**. Quarante points valaient donc cent cinquante mégaoctets, à côté
 * de la scène Pixi et des instantanés.
 *
 * Quatre mégaoctets pour dix mille cellules, parce que `SoilState` porte une
 * quinzaine de `number[]` dont deux par cellule **et** par horizon. Des tableaux
 * typés diviseraient ça par deux et rendraient d'autant plus de recul — c'était
 * au moteur de le décider, pas au rendu.
 *
 * **Le moteur a décidé, et la réponse est un tiers, pas la moitié** (#203). Les
 * grilles du sol sont désormais typées et leur précision est déclarée par leur
 * type : **4,46 Mo par point retenu, contre 3,03 après**, mesuré en apparié.
 * Pas la moitié, parce que les plus grosses grilles du sol sont précisément
 * celles qu'une propriété de conservation compte — l'eau, l'azote, le carbone,
 * les bases — et que la simple précision casse la fermeture de ces bilans à
 * 5e-7. Elles restent en double, et c'est écrit dans leur type.
 *
 * Ce qui veut dire qu'à mémoire égale le grain peut se resserrer ou la fenêtre
 * s'allonger : douze points au lieu de huit pour les mêmes trente mégaoctets.
 * `POINTS_GARDES` n'a pas bougé pour autant — c'est un réglage du rendu, et il
 * se décide avec la scène Pixi sous les yeux, pas depuis le moteur.
 *
 * D'où le grain d'aujourd'hui : **un point par semestre, huit points, quatre
 * ans de recul pour trente et un mégaoctets mesurés**. Le §6.8 s'était donné
 * « une fenêtre glissante d'un an » ; on en tient quatre. Entre deux points, on
 * rejoue au plus vingt-cinq semaines pour tomber juste, soit quelques secondes
 * de calcul avant que la relecture ne commence.
 */
const PAS_DE_REPRISE = 26;
const POINTS_GARDES = 8;

/** Les états mis de côté, du plus ancien au plus récent. */
let pointsDeReprise: { semaine: number; etat: GameState }[] = [];

/**
 * La semaine du dernier instantané **posté**.
 *
 * C'est le début de ce que le joueur n'a pas vu : entre elle et maintenant, le
 * worker a avalé tout un lot de semaines sans rien montrer. Le mode cinéma
 * repart de là.
 */
let semaineDuDernierInstantane = 0;

/**
 * **la relecture en cours**, s'il y en a une.
 *
 * `vivant` est le présent mis de côté : la relecture ne le touche pas, elle
 * marche à côté. C'est ce qui en fait une relecture et non une reprise — le
 * §6.8 demande de **revoir** la période, pas de repartir de là, et rien de ce qui
 * se joue pendant n'est compté deux fois.
 */
let relecture: { depuis: number; jusqua: number; vivant: GameState; vitesse: number } | undefined;

/** Met l'état de la semaine de côté, si c'est une semaine à garder. */
function poserUnPointDeReprise(etat: GameState): void {
  if (etat.week % PAS_DE_REPRISE !== 0) return;
  const dernier = pointsDeReprise[pointsDeReprise.length - 1];
  if (dernier && dernier.semaine >= etat.week) return;
  pointsDeReprise.push({ semaine: etat.week, etat });
  if (pointsDeReprise.length > POINTS_GARDES) pointsDeReprise.shift();
}

/**
 * **le mode cinéma** (#128, §6.8) : d'où rejouer la scène qui vient de se passer.
 *
 * *« L'`autopause` existe déjà pour l'incendie et la faillite ; on l'étend à la
 * crue et aux mortalités de masse, puis on rejoue la scène à ×1. »*
 *
 * **Depuis le dernier instantané, et pas depuis la semaine d'avant.** La
 * première version rembobinait d'une seule semaine, et l'essai dans le
 * navigateur l'a prise en faute : la relecture était finie avant qu'on la voie,
 * et elle ne montrait rien de plus que le bouton « ▶ revoir » d'à côté.
 *
 * Ce qu'il faut rejouer, c'est ce que le **saut** a enjambé. À ×52 l'écran avale
 * vingt-six semaines entre deux images : la catastrophe est quelque part
 * dedans, avec ce qui l'a amenée. Repartir du dernier instantané montré, c'est
 * exactement rejouer ce que le joueur n'a pas vu — vingt-six semaines à ×1,
 * une ellipse entière par semaine. À ×4, où un instantané couvre une semaine,
 * c'est une semaine : tout ce qui a été sauté, ni plus ni moins.
 *
 * Rend `undefined` s'il n'y a pas de point de reprise assez ancien — mieux vaut
 * pas de bouton qu'un bouton qui ne fait rien.
 */
function sceneDeLaSemaine(): number | undefined {
  if (!state) return undefined;
  const depuis = semaineDuDernierInstantane;
  return plusAncienRetour() <= depuis && depuis < state.week ? depuis : undefined;
}

/**
 * La plus ancienne semaine où l'on sait revenir.
 *
 * Sans le moindre point de reprise, c'est la semaine courante — c'est-à-dire
 * « nulle part ». Rendre zéro dirait le contraire et ferait afficher un bouton
 * « Revoir » qui ne fait rien.
 */
function plusAncienRetour(): number {
  return pointsDeReprise[0]?.semaine ?? state?.week ?? 0;
}

/**
 * Replie une semaine dans le bilan de la partie.
 *
 * `arbres` sert à **situer** : les gestes et les franchissements ne nomment que des
 * identifiants. On passe les tiges d'**après** la semaine — un arbre abattu n'y est
 * plus, et sa ligne existera donc sans endroit, ce qui est plus honnête qu'un
 * doigt pointé sur un coin de parcelle.
 */
function replierLeBilan(
  porteur: PorteurDeJournal,
  semaine: number,
  arbres: readonly TreeState[],
): void {
  if (!sc) return;
  const ou = new Map(arbres.map((a) => [a.id, a]));
  bilan = agreger(bilan, journalDe(porteur), semaine, sc.station.coteM, (id) => ou.get(id));
}
/**
 * Le niveau joué et ses paliers franchis (#188) — **rangés**, pas joués.
 *
 * Le worker ne sait pas ce qu'est un palier : les fiches portent des
 * fermetures, qui ne traversent pas la frontière d'un worker. Il tient les
 * deux valeurs pour que la sauvegarde les porte et que la reprise les rende.
 */
let niveauId: string | undefined;
let paliersAcquis: string[] = [];
/** Où en était le journal de sauvegarde à l'ouverture de la semaine. */
let journalAuDebut = 0;
/** Une facture attend sa réponse : le temps ne repart pas avant. */
let factureEnAttente = false;
/**
 * Ce que le joueur a demandé qu'on fasse des heures supplémentaires.
 *
 * « Demander » est le défaut, et il le reste tant qu'on n'a pas coché « se
 * souvenir de mon choix » : une consigne qui s'installerait toute seule
 * dépenserait de l'argent — ou annulerait des gestes — sans qu'on l'ait voulu.
 */
let politiqueHoraire: PolitiqueHoraire = "demander";
let maturationAns = 0;
/** L'argent contraint-il la partie ? Choisi au démarrage (actions.ts). */
let economie = true;
// Eau libre choisie au lancement (ruisseau, mare) ; à défaut, aucune.
let eau: EauDeSurface | undefined;
// Profondeur d'équilibre de la nappe choisie au lancement, cm.
let nappeCm: number | undefined;
// Part du bassin qui subit le même sort que la parcelle (nappe.ts).
let partBassin: number | undefined;
// Normales saisonnières de la série : elles servent à accentuer les extrêmes.
let normales: Normales | undefined;
let seed = 1;
let weeksPerSecond = 0;
let pendingRefusals: ActionRefusal[] = [];
let lastFluxes: TickFluxes | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let fractionalWeeks = 0;
/**
 * La semaine où la traversée demandée doit s'arrêter, s'il y en a une en
 * cours. Toute reprise de contrôle par le joueur l'annule — sinon une pause
 * suivie d'un « lecture » repartirait avec une arrivée fantôme.
 */
let semaineDArret: number | undefined;
/** Ce que l'arrivée annoncera — posé par le jeu, qui sait nommer un mois. */
let libelleDArrivee = "";
let prevFruitsReadyKg = 0;
let autoHarvest = true;
let pendingEvents: GameEvent[] = [];
// Ce qui s'est passé depuis le dernier instantané et que le rendu doit **animer**.
let pendingMorts: MortDeLaSemaine[] = [];
let pendingNaissances: NaissanceDeLaSemaine[] = [];
let pendingFranchissements: FranchissementDeStade[] = [];
let pendingGestes: GesteVisible[] = [];
let pendingChutes: ChuteDeChandelle[] = [];
let pendingIncendie: IncendieResult | undefined;
/** Même traitement que l'incendie : l'événement attend l'instantané (#87). */
let pendingTempete: TempeteResult | undefined;
// Grandeurs du dernier tick : elles ne sont pas dans l'état, et sans elles le
// rendu n'a ni crue, ni sous-bois sombre (tick.ts).
let lastDebordement: Float32Array | undefined;
let lastLumiereAuSol: Float32Array | undefined;
let droughtYearFlagged = -1;
// Part inondée la semaine précédente : on ne raconte la crue qu'une fois.
let partInondeePrecedente = 0;
// Terre perdue depuis le début de l'année civile de jeu, kg/m².
let erosionAnnee = 0;
let bankruptcyAnnounced = false;

/**
 * Dire au joueur **pourquoi** un chantier a coûté ce qu'il a coûté : c'est la
 * disposition de ses arbres qui décide si l'engin entre.
 */
function moyen(
  state: GameState,
  action: Extract<GameAction, { type: "faucher" | "chauler" }>,
): string {
  const part = partMecanisable(state.trees, action);
  if (part >= 0.85) return "à la machine";
  if (part <= 0.15) return "à la main : l'engin ne passe pas";
  return `${Math.round(part * 100)} % à la machine, le reste à la main`;
}

function event(icone: string, message: string) {
  if (!state) return;
  pendingEvents.push({ week: state.week, icone, message });
}

/**
 * Ce que dit la pause quand un arbre suivi meurt : son essence et sa cause.
 *
 * Au **singulier**, par la table du journal des suivis (`suivis.ts`) — « meurt de
 * sécheresse » et non « morts de sécheresse : 1 ». C'est un arbre qu'on
 * regardait, pas une ligne de bilan.
 *
 * **L'essence est mise entre parenthèses, et c'est de la grammaire et non du
 * style.** Le premier jet écrivait « L'bouleau verruqueux que vous suivez » —
 * relevé tel quel dans le navigateur. Rien dans les données ne donne le genre
 * d'une essence : « le » se trompe sur la ronce et la callune, « l' » sur tout
 * ce qui commence par une consonne. La seule phrase toujours juste fait porter
 * l'accord par « arbre », et nomme l'essence en apposition.
 */
function raisonDesMorts(morts: readonly MortDeLaSemaine[]): string {
  const premier = morts[0];
  if (!premier) return "";
  const nom = nomEspece(premier.especeId);
  if (morts.length === 1) {
    return `Un arbre suivi (${nom}) meurt ${causeDite(premier.cause)}`;
  }
  return `${morts.length} arbres suivis meurent — le premier (${nom}) ${causeDite(premier.cause)}`;
}

/** Dit si la coupe part en scierie ou en bûches, pour le journal. */
function qualiteVente(avant: GameState, treeIds: readonly number[]): string {
  let oeuvre = 0;
  for (const id of treeIds) {
    const t = avant.trees.find((x) => x.id === id);
    if (t && valeurSurPied(getEspece(t.especeId), t).qualite === "oeuvre") oeuvre++;
  }
  if (oeuvre === 0) return "bois de chauffage";
  if (oeuvre === treeIds.length) return "bois d'œuvre";
  return `${oeuvre} en bois d'œuvre, le reste en chauffage`;
}

/** Applique une action, la date, la journalise et raconte son résultat. */
/**
 * Ouvrir une semaine, et retenir d'où elle part.
 *
 * Les trois endroits qui ouvraient une semaine le faisaient chacun de leur
 * côté ; celui-ci ajoute la seule chose dont la facture a besoin — le point de
 * retour — et personne n'a plus à y penser (#133).
 */
function ouvrirLaSemaine(etat: GameState): void {
  state = beginWeek(etat);
  debutDeSemaine = state;
  actionsDeLaSemaine = [];
  journalAuDebut = journal.length;
  // Le cumul a le même point de retour que l'état : une semaine ramenée sous
  // le plafond se rejoue amputée, et ce qu'elle a récolté doit se rejouer avec.
  cumulsAuDebut = cumuls;
  bilanAuDebut = bilan;
  // Un point de reprise, tous les tant de semaines. Ici parce que c'est le
  // seul endroit traversé exactement une fois par semaine, quelle que soit la
  // vitesse — `stepWeeks` en avale jusqu'à vingt-six d'un coup.
  if (!relecture) poserUnPointDeReprise(state);
  // Une facture appartient à la semaine qui la porte : aucune ne peut survivre
  // à l'ouverture de la suivante — ni, surtout, à une partie neuve.
  factureEnAttente = false;
}

function performAction(action: GameAction) {
  if (!state) return;
  journal.push(action);
  actionsDeLaSemaine.push(action);
  const before = state;
  const result = applyAction(state, action);
  state = result.state;
  pendingRefusals.push(...result.refusals);
  pendingGestes.push(...(result.gestes ?? []));
  // Compté **ici**, à la source (#188). Compter au moment de l'instantané aurait
  // été plus simple d'un cran, et faux : `ouvrirLaSemaine` fige le point de
  // retour du cumul, et un instantané couvre jusqu'à vingt-six semaines. Le
  // point de retour aurait donc toujours été en retard d'un lot entier — et
  // une semaine ramenée sous le plafond aurait effacé les récoltes de tout ce
  // lot, pas seulement les siennes.
  // Les arbres d'**après** le geste : une cueillette laisse l'arbre debout, donc
  // son essence s'y lit encore — et c'est elle qui distingue « deux cents kilos
  // de pommes » de « deux cents kilos de n'importe quoi » (#188).
  cumuls = accumuler(cumuls, result.gestes ?? [], state.trees);
  replierLeBilan(
    { morts: [], chutes: [], naissances: [], franchissements: [], gestes: result.gestes ?? [] },
    state.week,
    state.trees,
  );
  const dEur = state.economy.treasuryEur - before.economy.treasuryEur;
  const dHeures = state.economy.hoursUsedWeek - before.economy.hoursUsedWeek;
  const eur = dEur >= 0 ? `+${dEur.toFixed(0)} €` : `${dEur.toFixed(0)} €`;
  switch (action.type) {
    case "planter": {
      semees = especesSemees(journal);
      majRecolteAuto();
      const n = state.trees.length - before.trees.length;
      if (n > 0)
        event(
          "🌱",
          `${n} ${nomEspeces(action.especeId, n)} planté${s(n)}${action.avecManchon ? ` et manchonné${s(n)}` : ""} (${eur}, ${dHeures.toFixed(0)} h)`,
        );
      break;
    }
    case "couper": {
      const n = before.trees.length - state.trees.length;
      if (n > 0)
        event(
          "🪓",
          action.devenir === "vendre"
            ? `${n} arbre${n > 1 ? "s" : ""} vendu${n > 1 ? "s" : ""} (${qualiteVente(before, action.treeIds)}) : ${eur}`
            : action.devenir === "laisser"
              ? `${n} fût${n > 1 ? "s" : ""} couché${n > 1 ? "s" : ""} en travers de la pente — rien en caisse, mais l'eau ralentit et la terre se dépose derrière`
              : `${n} arbre${n > 1 ? "s" : ""} broyé${n > 1 ? "s" : ""} et épandu${n > 1 ? "s" : ""} en BRF (azote et carbone au sol)`,
        );
      break;
    }
    case "recolter": {
      if (dEur <= 0) break;
      // Détail par espèce : ce qui a été ramassé, et combien.
      const parEspece = new Map<string, number>();
      for (const id of action.treeIds) {
        const avant = before.trees.find((t) => t.id === id);
        if (!avant || avant.fruitsKg <= 0) continue;
        parEspece.set(avant.especeId, (parEspece.get(avant.especeId) ?? 0) + avant.fruitsKg);
      }
      const detail = [...parEspece]
        .map(([id, kg]) => `${kg.toFixed(0)} kg de ${nomEspece(id)}`)
        .join(", ");
      event("🧺", `Récolte : ${detail || "fruits"} → ${eur} (${dHeures.toFixed(1)} h)`);
      break;
    }
    case "embaucher":
      if (dEur < 0)
        event(
          "👷",
          action.contrat === "saisonnier"
            ? `Saisonnier embauché ${Math.max(1, Math.round(action.semaines ?? 4))} semaines (${eur})`
            : `Ouvrier embauché en CDI (600 €/sem, 1re semaine payée d'avance)`,
        );
      break;
    case "licencier":
      if (dEur < 0) event("👋", `CDI rompu : ${eur} d'indemnités`);
      break;
    case "chauler": {
      event("🪨", `Chaulage : ${eur} (${dHeures.toFixed(1)} h, ${moyen(before, action)})`);
      break;
    }
    case "faucher": {
      event(
        "🌾",
        `Fauche : ${dHeures.toFixed(1)} h ${eur} (${moyen(before, action)}) — les jeunes plants respirent`,
      );
      break;
    }
    case "ramasserBoisMort": {
      const enleve =
        (before.soil.boisAuSolCG.reduce((t, v) => t + v, 0) -
          state.soil.boisAuSolCG.reduce((t, v) => t + v, 0)) /
        1000;
      if (enleve > 0)
        event(
          "🪵",
          `Bois mort ramassé : ${Math.round(enleve)} kg C ${eur} — autant d'humus et d'abris en moins`,
        );
      break;
    }
    case "eclaircir": {
      const n = before.trees.length - state.trees.length;
      if (n > 0)
        event(
          "🌲",
          `Éclaircie ${action.critere === "parLeBas" ? "par le bas" : action.critere === "parLeHaut" ? "par le haut" : "sélective"} : ${n} tiges prélevées, ${eur}`,
        );
      break;
    }
    case "epandreBrf": {
      event("🍂", `Broyat épandu (${dHeures.toFixed(1)} h) — l'azote va où on l'a porté`);
      break;
    }
    case "labourer": {
      event("🚜", `Labour : ${eur} (${dHeures.toFixed(1)} h) — le sol est nu, l'azote est libéré`);
      break;
    }
    case "trogner": {
      const n = state.trees.filter((t) => t.teteTrogneM !== undefined).length;
      event(
        "🪵",
        `Étêtage : ${eur} (${dHeures.toFixed(1)} h) — ${n} trogne${n > 1 ? "s" : ""} en tête`,
      );
      break;
    }
    case "chasser": {
      event(
        "🎯",
        `Journée de chasse : ${eur}, la pression retombe à ${(state.pressionGibier * 100).toFixed(0)} % — mais les voisins reviendront`,
      );
      break;
    }
    case "cloturer": {
      event("🚧", `Clôture posée : ${eur} (${dHeures.toFixed(1)} h) — plus une dent à l'intérieur`);
      break;
    }
    case "proteger": {
      const n =
        state.trees.filter((t) => t.protege).length - before.trees.filter((t) => t.protege).length;
      if (n > 0)
        event("🛡️", `${n} plant${n > 1 ? "s" : ""} protégé${n > 1 ? "s" : ""} du gibier, ${eur}`);
      break;
    }
    case "leverEcorce": {
      if (dEur > 0)
        event("🟤", `Liège levé : ${eur} (${dHeures.toFixed(1)} h) — les arbres restent debout`);
      break;
    }
    case "elaguer": {
      const n = action.treeIds.length;
      event(
        "✂️",
        `${n} arbre${n > 1 ? "s" : ""} élagué${n > 1 ? "s" : ""} (${dHeures.toFixed(1)} h) — une bille propre pour la scierie`,
      );
      break;
    }
    case "receper": {
      const n = action.treeIds.length;
      event(
        "🪵",
        `${n} cépée${n > 1 ? "s" : ""} recépée${n > 1 ? "s" : ""} : ${eur} — la souche repartira`,
      );
      break;
    }
  }
}

/**
 * Faire vieillir la parcelle avant que le joueur n'arrive.
 *
 * Un terrain qu'on vient de modeler n'est pas un terrain : c'est une
 * topographie. Ce qui en fait un lieu — l'humus accumulé, l'herbe installée,
 * les semis venus du voisinage, la ceinture d'aulnes autour du trou qui s'est
 * rempli — demande du temps. On le lui donne d'un coup, en simulant les
 * années qui précèdent le début de partie : le joueur ne fait rien, seul le
 * moteur tourne. Le climat de ces années-là est celui de l'époque, pas celui
 * du début de partie.
 */
function faireVieillir(depart: GameState, annees: number): GameState {
  let etat = depart;
  const semaines = annees * 52;
  const anneeBase = anneeDepart - annees;
  for (let k = 0; k < semaines; k++) {
    etat = advanceWeek(etat, meteoSemaine(k, anneeBase), []).state;
    if (k % 260 === 0)
      post({ type: "progress", done: k, total: semaines, phase: "vieillissement" });
  }
  // Le compteur de semaines repart de zéro : l'an 1 du joueur, c'est son
  // arrivée, pas la naissance du terrain.
  return { ...etat, week: 0 };
}

const post = (msg: FromWorker, transfer: Transferable[] = []) =>
  (postMessage as (m: FromWorker, t?: Transferable[]) => void)(msg, transfer);

/**
 * Météo d'une semaine de partie : l'observation correspondante, décalée par la
 * trajectoire climatique choisie. C'est ici que le climat se met à dériver —
 * le moteur, lui, ne sait rien du scénario, il ne voit qu'une semaine plus
 * chaude et un CO₂ plus élevé.
 */
function meteoSemaine(absolue: number, anneeBase = anneeDepart): WeekWeather {
  const base = weather[((absolue % weather.length) + weather.length) % weather.length];
  if (!base) throw new Error("météo manquante");
  return meteoDerivee(
    base,
    ((absolue % 52) + 52) % 52,
    getScenario(scenario),
    anneeBase + Math.floor(absolue / 52),
    normales,
    // L'altitude de la parcelle par rapport à celle de la station météo.
    // Ce que le relief change à la température : l'altitude refroidit, et
    // l'exposition sépare l'adret de l'ubac (relief.ts).
    sc
      ? anomalieAltitudeC(relief ?? sc.station.relief, ALTITUDE_SERIE_M) +
          anomalieExpositionC(relief ?? sc.station.relief)
      : 0,
  );
}

/** La station telle qu'elle est, mais dans le paysage et le relief choisis. */
function stationAvecPaysage(base: Station): Station {
  return {
    ...base,
    relief: relief ?? base.relief,
    eau: eau ?? base.eau,
    profondeurNappeEquilibreCm: nappeCm ?? base.profondeurNappeEquilibreCm,
    partBassinSemblable: partBassin ?? base.partBassinSemblable,
    // Sert à savoir si une cuvette creusée tient l'eau (terrain.ts).
    pluieAnnuelleMm: sc?.climat.rainAnnualMm,
    paysageId: bordures.nord,
    bordures,
    ...entourageDeLaStation(bordures, base.phInitial, base.ruMm),
  };
}

function loadWeather(stationId: string, mode: "reelle" | "synthetique"): WeekWeather[] {
  const serie = mode === "reelle" ? serieMeteoPour(stationId) : undefined;
  const station = STATIONS_V0.find((s) => s.station.id === stationId);
  if (!station) throw new Error(`station inconnue : ${stationId}`);
  // La série est cherchée d'abord, mais le climat de la station est chargé dans
  // les deux cas : une série mesure la température et la pluie, pas le vent.
  if (serie) return serieToWeeks(serie, station.climat);
  return syntheticYear(station.climat);
}

function emptyFluxes(): TickFluxes {
  return {
    basesApportEqHa: 0,
    basesLessiveEqHa: 0,
    basesLitiereEqHa: 0,
    basesAcideEqHa: 0,
    basesAcideNonTamponneEqHa: 0,
    basesPreleveEqHa: 0,
    basesApportProfondEqHa: 0,
    basesExportEqHa: 0,
    saturationMoyenne: 0,
    saturationProfondeMoyenne: 0,
    partInondee: 0,
    erosionArracheeKgM2: 0,
    erosionSortieKgM2: 0,
    boisRetenueMm: 0,
    boisSedimentPiegeKgM2: 0,
    erosionNKgHa: 0,
    vidangeNappeMm: 0,
    apportRegionalMm: 0,
    apportEauLibreMm: 0,
    nappeProfondeurCm: 0,
    erosionPKgHa: 0,
    erosionKKgHa: 0,
    rainMm: 0,
    etpMm: 0,
    evapMm: 0,
    nappeMm: 0,
    transpirationMm: 0,
    drainageMm: 0,
    overflowMm: 0,
    waterloggingMean: 0,
    ruissellementEntrantMm: 0,
    ruissellementSortantMm: 0,
    herbeCouvertureMean: 0,
    broutageKg: 0,
    depositionKgHa: 0,
    ravageurMoyen: 0,
    auxiliairesMoyen: 0,
    mycorhizesMoyen: 0,
    mineralizationKgHa: 0,
    uptakeKgHa: 0,
    uptakeArbresKgHa: 0,
    uptakeHerbeKgHa: 0,
    leachedKgHa: 0,
    phosphoreMoyenGM2: 0,
    potassiumMoyenGM2: 0,
    uptakePKgHa: 0,
    uptakeKKgHa: 0,
    leachedKKgHa: 0,
    litterfallKgHa: 0,
    litterDecayKgHa: 0,
    fixationKgHa: 0,
  };
}

function postSnapshot() {
  if (!state || !sc) return;
  // Le worker **assemble**, il ne décide pas : la traduction état → instantané
  // est pure et testée dans snapshot.ts.
  const snapshot = construireSnapshot({
    state,
    weather: meteoSemaine(state.week),
    anneeCivile: anneeDepart + Math.floor(state.week / 52),
    paysage: resumeBordures(bordures),
    fluxes: lastFluxes ?? emptyFluxes(),
    debordementParCellule: lastDebordement,
    lumiereAuSol: lastLumiereAuSol,
    refusals: pendingRefusals,
    events: pendingEvents,
    morts: pendingMorts,
    naissances: pendingNaissances,
    franchissements: pendingFranchissements,
    gestes: pendingGestes,
    chutes: pendingChutes,
    incendie: pendingIncendie,
    tempete: pendingTempete,
  });
  pendingRefusals = [];
  pendingEvents = [];
  pendingMorts = [];
  pendingNaissances = [];
  pendingFranchissements = [];
  pendingGestes = [];
  pendingChutes = [];
  // Les tampons du feu partent avec l'instantané : on ne les garde pas pour le
  // suivant, sinon la même flambée se rejouerait à l'écran.
  pendingIncendie = undefined;
  pendingTempete = undefined;
  // Les grandeurs du tick, elles, se **gardent** : une action reçue en pause
  // déclenche un instantané sans qu'aucune semaine n'ait été simulée, et le
  // joueur ne doit pas voir la crue disparaître entre deux clics.
  post(
    { type: "snapshot", snapshot, cumuls, bilan, rembobinable: plusAncienRetour() },
    transferablesDuSnapshot(snapshot),
  );
  // **Après** l'envoi : la scène à rejouer part du dernier instantané montré, donc
  // de celui-ci une fois qu'il est parti, pas de celui d'avant.
  if (!relecture) semaineDuDernierInstantane = snapshot.week;
}

/**
 * Ferme la semaine courante (tick) puis ouvre la suivante, n fois.
 * Pause automatique quand des fruits arrivent à maturité : à grande vitesse,
 * le joueur raterait la fenêtre de récolte (3 semaines) sans s'en apercevoir.
 */
/**
 * Ce que coûterait la semaine telle qu'elle est composée, et ce qu'on perdrait
 * à s'en tenir aux soixante heures — sans rien changer à l'état.
 *
 * Les deux nombres viennent du **moteur** (`depassementHoraire`,
 * `coutDuDepassement`) : le rendu ne recalcule ni le plafond ni le prix d'un
 * bras. Le troisième — combien de gestes tomberaient — ne peut se connaître
 * qu'en rejouant la semaine, et c'est ce qu'on fait ici à blanc.
 */
function factureDeLaSemaine(): FactureHoraire | undefined {
  if (!state) return undefined;
  // **Pas de facture quand l'argent ne compte pas.** La facture **est**
  // l'arbitrage économique ; sans argent, « embaucher » est un clic gratuit et
  // la question n'en est plus une. Le moteur a tranché dans le même sens en
  // livrant sa part (#133) : en économie coupée, la limite de travail
  // disparaît, et un garde-fou serait un mécanisme neuf.
  if (!state.economy.active) return undefined;
  const heures = depassementHoraire(state.economy);
  if (heures <= 0) return undefined;
  const { embauches, eur } = coutDuDepassement(heures);
  return { heures, embauches, eur, gestesAnnules: gestesQuiTomberaient() };
}

/** Combien d'actions la semaine perdrait si on la ramenait sous le plafond. */
function gestesQuiTomberaient(): number {
  if (!debutDeSemaine) return 0;
  return prefixeSousLePlafond(debutDeSemaine, actionsDeLaSemaine).annulees;
}

/**
 * **s'en tenir aux soixante heures** : la semaine se rejoue amputée de sa fin.
 *
 * **L'ordre inverse de saisie**, comme l'issue le demandait : on garde le plus
 * long préfixe qui tienne dans le plafond, donc ce sont les derniers gestes
 * posés qui tombent. C'est la seule règle prévisible, et l'écran la dit.
 *
 * **Le journal de sauvegarde porte la décision, pas les tentatives** — c'était
 * le piège nommé dans l'issue : un journal qui garderait les actions annulées
 * les rejouerait au rechargement, et la partie divergerait.
 */
function seTenirAuPlafond(): number {
  if (!state || !debutDeSemaine) return 0;
  const posees = actionsDeLaSemaine;
  // Les gestes déjà mis en scène appartiennent à des actions qu'on est en
  // train de reprendre : on repart d'une feuille blanche, le rejeu les
  // reproduira pour celles qui restent.
  const elaguee = prefixeSousLePlafond(debutDeSemaine, posees);
  pendingGestes = elaguee.gestes;
  // Le cumul se rejoue comme l'état : il repart du début de la semaine, puis
  // recompte les gestes des **seules** actions gardées. Sans ça, une récolte
  // annulée resterait acquise.
  cumuls = accumuler(cumulsAuDebut, elaguee.gestes, elaguee.etat.trees);
  // Le bilan repart du même point que le cumul et l'état. Il n'y a que les
  // **gestes** à recompter : la semaine n'a pas encore été close, donc ni mort ni
  // naissance n'y est encore arrivée.
  bilan = bilanAuDebut;
  replierLeBilan(
    { morts: [], chutes: [], naissances: [], franchissements: [], gestes: elaguee.gestes },
    elaguee.etat.week,
    elaguee.etat.trees,
  );
  state = elaguee.etat;
  journal = [...journal.slice(0, journalAuDebut), ...elaguee.gardees];
  actionsDeLaSemaine = elaguee.gardees;
  return elaguee.annulees;
}

/**
 * Répondre à la facture : embaucher, ou s'en tenir au plafond (#133).
 *
 * Écrite à part et non dans le gestionnaire de messages, pour une raison de
 * portée : la fonction qui écrit au journal s'appelle `event`, et le
 * gestionnaire nomme `event` son message. Dans ce bloc-là, écrire au journal
 * était impossible.
 */
function reglerLaFacture(embaucher: boolean, pourToujours = false): void {
  if (!state || !factureEnAttente) return;
  factureEnAttente = false;
  if (pourToujours) definirLaPolitique(embaucher ? "embaucher" : "plafond");
  if (embaucher) {
    // **L'embauche est rétroactive à la semaine écoulée**, et c'est ce que
    // l'issue demandait : on ne fait pas travailler quelqu'un plus
    // longtemps, on ajoute des bras — pour des heures déjà faites. Un
    // saisonnier par tranche de plafond entamée, pour **une** semaine : c'est
    // exactement ce que `coutDuDepassement` a chiffré.
    const { embauches } = coutDuDepassement(depassementHoraire(state.economy));
    for (let i = 0; i < embauches; i++) {
      performAction({
        type: "embaucher",
        week: state.week,
        contrat: "saisonnier",
        semaines: 1,
      });
    }
    const reste = depassementHoraire(state.economy);
    if (reste > 0) {
      // L'embauche a été refusée (découvert plafonné) : la question se
      // repose, avec les nombres d'après. Rien ne part en silence.
      const encore = factureDeLaSemaine();
      if (encore) {
        factureEnAttente = true;
        post({ type: "facture", facture: encore });
        postSnapshot();
        return;
      }
    } else {
      event(
        "🧑‍🌾",
        `${embauches} saisonnier${embauches > 1 ? "s" : ""} embauché${embauches > 1 ? "s" : ""} pour la semaine : les heures supplémentaires sont couvertes`,
      );
    }
  } else {
    const tombes = seTenirAuPlafond();
    event(
      "⏱",
      tombes > 0
        ? `Semaine ramenée à 60 h : ${tombes} geste${tombes > 1 ? "s" : ""} annulé${tombes > 1 ? "s" : ""}, les derniers posés`
        : "Semaine ramenée à 60 h",
    );
  }
  postSnapshot();
}

/** Poser la consigne, et le dire — à l'écran comme au journal. */
function definirLaPolitique(politique: PolitiqueHoraire): void {
  if (politiqueHoraire === politique) return;
  politiqueHoraire = politique;
  post({ type: "politiqueHoraire", politique });
  event(
    "⏱",
    politique === "embaucher"
      ? "Consigne retenue : on embauchera ce qu'il faut à chaque dépassement"
      : politique === "plafond"
        ? "Consigne retenue : chaque semaine sera ramenée à 60 h"
        : "Consigne levée : la question sera reposée à chaque dépassement",
  );
}

function stepWeeks(n: number) {
  if (!state) return;
  /**
   * Une scène a arrêté le temps : on ne simule pas la suite du lot.
   *
   * **La tempête et la mortalité de masse ne s'arrêtaient pas vraiment.** Elles
   * posaient leur autopause, mettaient l'horloge à zéro… et la boucle
   * continuait à ticker les semaines restantes du lot — jusqu'à quatre de plus
   * à ×52, vingt-cinq au plafond. Tout ce qui s'y passait était replié dans le
   * même instantané que la scène, donc joué dans la même ellipse : le joueur
   * lisait « 350 arbres meurent d'un coup » pendant qu'un mois de plus lui
   * passait sous les yeux. L'incendie, lui, rendait déjà la main.
   *
   * Le drapeau plutôt qu'un `return` sur place : la semaine va **au bout** de
   * son tour, donc l'incendie de la même semaine écrit encore sa ligne de
   * journal, et le compteur de fruits reste juste.
   */
  let scenePosee = false;
  for (let i = 0; i < n; i++) {
    // **La facture se présente avant que la semaine ne se ferme (#133).** Le
    // joueur compose sa semaine librement ; c'est au moment de passer à la
    // suivante qu'on lui demande s'il embauche. Le temps s'arrête le temps
    // qu'il réponde — comme il s'arrête pour un incendie ou une mort suivie.
    const facture = factureEnAttente ? undefined : factureDeLaSemaine();
    if (facture) {
      factureEnAttente = true;
      // **La consigne retenue répond à la place du joueur**, sans arrêter le
      // temps — c'est tout l'objet de « se souvenir de mon choix ». Elle ne
      // passe pas en silence pour autant : `reglerLaFacture` écrit au journal
      // ce qu'elle a coûté ou ce qu'elle a annulé.
      if (politiqueHoraire !== "demander") {
        reglerLaFacture(politiqueHoraire === "embaucher");
        // L'embauche a pu être refusée — découvert plafonné : la facture est
        // alors reposée, et il faut bien s'arrêter pour l'entendre.
        if (factureEnAttente) {
          weeksPerSecond = 0;
          return;
        }
      } else {
        weeksPerSecond = 0;
        post({ type: "facture", facture });
        return;
      }
    }
    const w = meteoSemaine(state.week);
    if (!w) return;
    const before = state;
    const ticked = tick(state, w);
    lastFluxes = ticked.fluxes;
    // Ce que le rendu doit **animer**, accumulé jusqu'au prochain instantané : à
    // ×64 un instantané couvre plusieurs semaines, et rien ne doit se perdre
    // en route (une mort qu'on n'a pas vue est un arbre qui s'escamote).
    lastDebordement = ticked.debordementParCellule;
    lastLumiereAuSol = ticked.lumiereAuSol;
    pendingMorts.push(...ticked.morts);
    pendingNaissances.push(...ticked.naissances);
    pendingFranchissements.push(...ticked.franchissements);
    pendingGestes.push(...ticked.gestes);
    cumuls = accumuler(cumuls, ticked.gestes, ticked.state.trees);
    replierLeBilan(ticked, before.week, ticked.state.trees);
    pendingChutes.push(...ticked.chutes);
    // Deux incendies dans un même lot d'instantané : on garde le dernier, le
    // seul dont l'écran a encore quelque chose à montrer.
    if (ticked.incendie) pendingIncendie = ticked.incendie;
    // Deux tempêtes dans un même lot d'instantané : on garde la dernière, comme
    // pour l'incendie — c'est elle dont les troncs sont encore au sol.
    if (ticked.tempete) pendingTempete = ticked.tempete;
    // Les aides publiques, une fois l'an. On raconte surtout le cas où elles
    // **ne** tombent **pas** : perdre l'éligibilité en plantant un arbre de trop est
    // la décision que ce mécanisme met sur la table (aides.ts).
    if (ticked.aides) {
      const a = ticked.aides;
      if (a.eligible) {
        event(
          "🇪🇺",
          `Aides PAC : ${a.totalEur.toFixed(0)} € (${a.densiteParHa.toFixed(0)} arbres/ha, ` +
            `${(a.partIae * 100).toFixed(0)} % d'infrastructures agroécologiques)`,
        );
      } else {
        event(
          "🚫",
          `Aucune aide PAC : ${a.densiteParHa.toFixed(0)} arbres/ha dépasse le plafond de 100. ` +
            `La parcelle n'est plus agricole aux yeux de la PAC, c'est un boisement`,
        );
      }
    }
    ouvrirLaSemaine(ticked.state);
    const finis =
      before.economy.saisonniersFinSemaine.length - state.economy.saisonniersFinSemaine.length;
    if (finis > 0) {
      event(
        "👋",
        `Fin de contrat : ${finis} saisonnier${finis > 1 ? "s" : ""} reparti${finis > 1 ? "s" : ""}`,
      );
    }

    // ── Fil d'événements : ce qui a changé cette semaine ────────────────────
    const weekOfYear = before.week % 52;
    // Morts : regroupées par espèce **et** par cause, pour que le joueur sache
    // ce qui a tué ses arbres et puisse corriger le tir.
    const parEspeceEtCause = new Map<string, { n: number; hMax: number; phPire: number }>();
    for (const mort of ticked.morts) {
      const cle = `${mort.especeId}|${mort.cause}`;
      const agg = parEspeceEtCause.get(cle) ?? { n: 0, hMax: 0, phPire: Number.NaN };
      agg.n++;
      agg.hMax = Math.max(agg.hMax, mort.heightM);
      // **Le** pH **sous l'arbre**, pas celui de la station : il dérive chaque semaine
      // avec la saturation en bases (C10) et le chaulage le déplace d'un geste.
      // On retient le plus acide du groupe, qui est celui qui a tué.
      if (state) {
        const i = Math.floor(mort.y) * state.station.coteM + Math.floor(mort.x);
        const ph = state.soil.ph[i];
        if (ph !== undefined) agg.phPire = Number.isNaN(agg.phPire) ? ph : Math.min(agg.phPire, ph);
      }
      parEspeceEtCause.set(cle, agg);
    }
    for (const [cle, agg] of parEspeceEtCause) {
      const [id, cause] = cle.split("|");
      if (!id) continue;
      // **Accordé, et le mot « mortes » enfin dit.** La table du moteur est au
      // masculin pluriel et n'a pas de verbe : « 90 ronces étouffés par
      // l'ombre ». Celle du jeu accorde en genre et en nombre, et c'est la
      // même que lit le bilan de période — une seule phrase pour les deux.
      const feminin = estFeminin(id);
      const libelle = `mort${accord(feminin, agg.n)} ${causeDite((cause ?? "secheresse") as CauseMort, agg.n, feminin)}`;
      const taille = agg.hMax >= 1 ? ` (jusqu'à ${agg.hMax.toFixed(1)} m)` : " (semis)";
      // Sur un sol hors gamme, on donne les chiffres : c'est la seule cause de
      // mort que le joueur peut corriger d'un geste (chauler).
      // Le pH cité est celui du **sol sous l'arbre**, pas celui de la station au
      // départ : il dérive chaque semaine avec la saturation en bases (C10) et
      // le chaulage le déplace d'un geste. La gamme citée est celle de l'atlas,
      // et depuis que la réponse au pH est unimodale elle est vraie — un arbre
      // qui meurt dedans est désormais un arbre qu'on a laissé au bord.
      const gamme = cause === "solHorsGamme" ? getEspece(id).ph : null;
      const precision =
        gamme && !Number.isNaN(agg.phPire)
          ? ` — sol à pH ${agg.phPire.toFixed(1)}, il leur en faut ${gamme[0]} à ${gamme[1]}`
          : "";
      event("💀", `${agg.n} ${nomEspeces(id, agg.n)} ${libelle}${taille}${precision}`);
    }
    // Gel des fleurs
    const frostedBefore = new Set(before.trees.filter((t) => t.bloomFrosted).map((t) => t.id));
    const frosted = new Map<string, number>();
    for (const t of state.trees) {
      if (t.bloomFrosted && !frostedBefore.has(t.id)) {
        frosted.set(t.especeId, (frosted.get(t.especeId) ?? 0) + 1);
      }
    }
    for (const [id, n2] of frosted) {
      event(
        "❄️",
        `Gel tardif (${w.tMinAbsC.toFixed(0)} °C) : fleurs de ${n2} ${nomEspeces(id, n2)} détruites — récolte perdue`,
      );
    }
    // Semis naturels (semaine du recrutement)
    if (weekOfYear === 14) {
      // Le compte **exact**, depuis `naissances`. La soustraction d'effectifs
      // qu'on faisait ici se trompait dès qu'un geste de la même semaine avait
      // retiré des tiges : une éclaircie en semaine 14 gonflait le chiffre.
      const recruits = ticked.naissances.length;
      if (recruits > 0) event("🌿", `${recruits} semis naturels se sont installés`);
    }
    // Sécheresse (sol moyen presque à sec en saison de végétation)
    const year = Math.floor(before.week / 52);
    if (weekOfYear >= 20 && weekOfYear <= 40 && droughtYearFlagged !== year && sc) {
      const arr = state.soil.waterMm;
      let sum = 0;
      for (let k = 0; k < arr.length; k++) sum += arr[k] ?? 0;
      if (sum / arr.length < 0.2 * sc.station.ruMm) {
        droughtYearFlagged = year;
        event("🔥", "Sécheresse : la réserve du sol est presque à sec — les sensibles souffrent");
      }
    }
    // Érosion : on ne la raconte pas semaine par semaine — elle est
    // insensible à cette échelle — mais une fois l'an, et seulement quand elle
    // dépasse ce qu'un sol peut reconstituer (~1 t/ha/an de formation).
    erosionAnnee += ticked.fluxes.erosionSortieKgM2;
    if (weekOfYear === 51) {
      const tHaAn = erosionAnnee * 10;
      if (tHaAn >= 1) {
        event(
          "🏜",
          `Le versant perd sa terre : ${tHaAn.toFixed(1)} t/ha sorties cette année — couvrir le sol est le premier remède`,
        );
      }
      erosionAnnee = 0;
    }
    // Crue : le cours d'eau reçoit l'eau de son bassin d'amont et monte, la
    // nappe avec lui. On la raconte au moment où elle noie, pas chaque semaine.
    const inondee = ticked.fluxes.partInondee;
    if (inondee >= 0.05 && partInondeePrecedente < 0.05) {
      event("🌊", `Crue : la nappe affleure sur ${Math.round(inondee * 100)} % de la parcelle`);
    }
    partInondeePrecedente = inondee;
    // Tempête : elle arrive en une semaine et doit se dire, sinon des arbres
    // s'escamotent.
    if (ticked.tempete) {
      const t = ticked.tempete;
      event(
        "🌬️",
        `TEMPÊTE : rafale à ${Math.round(t.rafaleMs * 3.6)} km/h, ${t.arbresVerses} arbre` +
          `${t.arbresVerses > 1 ? "s couchés" : " couché"} — ${t.volumeM3.toFixed(1)} m³ ` +
          `à sortir dans l'année avant que le bois ne se déprécie`,
      );
      // **Elle arrête le temps, désormais (#128).** Elle ne le faisait pas, et
      // le raisonnement écrit ici était : « un chablis reste récupérable un an,
      // le joueur a le temps de décider ». C'est vrai de la **décision** et faux du
      // **spectacle** — le §6.8 range la tempête parmi les scènes qu'on rejoue, et
      // à ×52 une rafale qui couche trente arbres passe entre deux images.
      if (weeksPerSecond > 1 && estUneTempeteAVoir(t.arbresVerses)) {
        weeksPerSecond = 0;
        scenePosee = true;
        post({
          type: "autopause",
          reason: `Tempête : ${t.arbresVerses} arbres couchés`,
          scene: sceneDeLaSemaine(),
        });
      }
    }
    // **Une mortalité de masse est une scène**, et c'est la troisième que le
    // §6.8 nomme. Pas une cause en particulier : ce qui la fait, c'est le
    // **nombre** — une sécheresse qui emporte le tiers d'un peuplement en une
    // semaine se voit autant qu'un feu, et ne se dit nulle part ailleurs.
    if (weeksPerSecond > 1 && estUneMortaliteDeMasse(ticked.morts.length, before.trees.length)) {
      const part = ticked.morts.length / Math.max(1, before.trees.length);
      /**
       * **Dire ce que la parcelle peut montrer** (#233).
       *
       * Le bandeau annonçait « 924 arbres meurent d'un coup (34 % du
       * peuplement) », et le joueur ne voyait rien. Les deux sont vrais et ne
       * parlent pas de la même chose : sur ces 924 tiges, **852 font moins d'un
       * mètre** — moins de huit pixels — et la médiane en fait 37 centimètres.
       * Le chiffre promettait un spectacle que l'écran ne pouvait pas rendre.
       *
       * La phrase le dit maintenant, et seulement quand elle a quelque chose à
       * dire : si tout ce qui meurt se voit, l'ancienne suffit. Le compte
       * complet, lui, reste dans le bilan de période — « un phénomène de masse
       * ne se cherche pas, il se lit dans une phrase » (`changements.ts`).
       */
      const trouvables = ticked.morts.filter((m) => m.heightM >= HAUTEUR_TROUVABLE_M).length;
      weeksPerSecond = 0;
      scenePosee = true;
      post({
        type: "autopause",
        reason:
          trouvables < ticked.morts.length
            ? `${ticked.morts.length} arbres meurent d'un coup, dont ${trouvables} de plus d'un mètre`
            : `${ticked.morts.length} arbres meurent d'un coup (${Math.round(part * 100)} % du peuplement)`,
        scene: sceneDeLaSemaine(),
      });
    }
    // Incendie : l'événement le plus marquant d'une partie sur lande.
    if (ticked.incendie) {
      const f = ticked.incendie;
      const are = Math.round(f.cellulesBrulees / 100);
      event(
        "🔥",
        `INCENDIE : ${are > 0 ? `${are} ares` : `${f.cellulesBrulees} m²`} brûlés, ` +
          `${f.arbresTues} arbres tués${f.rejets > 0 ? `, ${f.rejets} repartent de souche` : ""} — ` +
          `${f.carboneTHa.toFixed(1)} t C/ha parties en fumée`,
      );
      if (weeksPerSecond > 1) {
        weeksPerSecond = 0;
        post({
          type: "autopause",
          reason: `Incendie : ${f.arbresTues} arbres perdus`,
          scene: sceneDeLaSemaine(),
        });
        // **Pas d'instantané ici**, et c'est le correctif de l'incendie
        // invisible. `startLoop` en poste un dès que `stepWeeks` rend la main ;
        // en poster un de plus depuis ici en faisait **deux** pour la même
        // semaine — le premier portant le feu, le second vidé par le premier,
        // puisque `postSnapshot` emporte les tampons. L'écran gardait le
        // second. Le front ne se jouait pas, et « ↺ Revoir la scène » rejouait
        // le plan de l'instantané courant, c'est-à-dire un plan vide.
        return;
      }
    }
    // **Un arbre suivi meurt : le temps s'arrête (#149).** C'est la demande
    // même de l'issue — « pas qu'ils meurent sans que je comprenne rien ». Ici
    // et pas côté jeu, parce qu'ici seulement la mort est connue à la semaine
    // où elle arrive : l'instantané, lui, peut en porter vingt-six.
    const morts = ticked.morts.filter((m) => suivis.has(m.id));
    if (morts.length > 0) {
      weeksPerSecond = 0;
      post({ type: "autopause", reason: raisonDesMorts(morts) });
      return;
    }
    // Faillite : le temps s'arrête, le joueur doit regarder ses comptes.
    if (state.economy.bankrupt && !bankruptcyAnnounced) {
      bankruptcyAnnounced = true;
      event("💸", "FAILLITE : le découvert a dépassé −20 000 €");
      weeksPerSecond = 0;
      post({
        type: "autopause",
        reason: "FAILLITE — le découvert a dépassé −20 000 €. Vendez, licenciez, ou recommencez.",
      });
      return;
    }
    // Fruits mûrs : récolte auto, ou pause pour laisser la main. Les deux
    // décisions vivent dans `recolteAuto.ts`, où un essai peut les prendre en
    // faute — ici elles étaient confondues en une seule condition.
    const murs = arbresMurs(state.trees, recoltees);
    // Le front montant : on n'agit qu'à l'**arrivée** d'une maturité, pas à chaque
    // semaine où elle dure. Il ne vaut que si les deux termes comparés sont la
    // **même** grandeur — voir la mise à jour de `prevFruitsReadyKg` plus bas, qui
    // ne l'était pas (#191).
    if (fautIlPrevenir(murs.kg, prevFruitsReadyKg)) {
      if (autoHarvest) {
        const refusalsBefore = pendingRefusals.length;
        performAction({ type: "recolter", week: state.week, treeIds: murs.ids });
        if (pendingRefusals.length > refusalsBefore) {
          weeksPerSecond = 0;
          post({
            type: "autopause",
            reason:
              "récolte auto incomplète : plus assez d'heures cette semaine — embauchez un saisonnier ou récoltez à la main",
          });
          prevFruitsReadyKg = 0;
          return;
        }
      } else if (weeksPerSecond > 4) {
        prevFruitsReadyKg = murs.kg;
        weeksPerSecond = 0;
        post({ type: "autopause", reason: `${Math.round(murs.kg)} kg de fruits sont mûrs` });
        return;
      }
    }
    // **la même mesure des deux côtés (#191).** Ce compteur additionnait le
    // fruit de **tous** les arbres, sans le seuil de 0,5 kg par pied que la
    // récolte applique. Deux mesures de la même chose, donc deux mesures qui
    // divergent : sur une parcelle où des milliers de ronces portent chacune
    // quelques grammes, le résidu tenait le total au-dessus du kilo toute
    // l'année, le front ne retombait jamais, et plus rien n'était cueilli après
    // la première essence mûre. Mesuré en jeu : 115 kg de pommes sur l'arbre en
    // semaine 39, comparés à un « précédent » de 28 kg de miettes.
    prevFruitsReadyKg = arbresMurs(state.trees, recoltees).kg;
    // La scène a arrêté le temps : la suite du lot n'est pas simulée.
    if (scenePosee) return;
  }
}

/**
 * Avance la relecture d'une semaine à la fois.
 *
 * **`advanceWeek` et non `tick`**, et c'est ce qui rend la relecture fidèle :
 * elle rejoue aussi les **gestes** du joueur, que le journal porte datés. Ticker
 * seul rejouerait une parcelle où personne n'aurait rien fait.
 *
 * Rien n'est compté ici — ni le cumul du niveau, ni le bilan, ni le journal de
 * sauvegarde : ce qui est rejoué a déjà été vécu une fois.
 */
function avancerLaRelecture(n: number): void {
  if (!state || !relecture) return;
  for (let k = 0; k < n && state.week < relecture.jusqua; k++) {
    const w = meteoSemaine(state.week);
    if (!w) return;
    const step = advanceWeek(state, w, journal);
    state = step.state;
    pendingMorts.push(...step.morts);
    pendingNaissances.push(...step.naissances);
    pendingFranchissements.push(...step.franchissements);
    pendingGestes.push(...step.gestes);
    pendingChutes.push(...step.chutes);
    if (step.incendie) pendingIncendie = step.incendie;
    if (step.tempete) pendingTempete = step.tempete;
    lastFluxes = step.fluxes;
    lastDebordement = step.debordementParCellule;
    lastLumiereAuSol = step.lumiereAuSol;
  }
}

/**
 * Revenir en arrière et rejouer jusqu'au présent.
 *
 * On repart du point de reprise le plus proche **avant** la semaine demandée, puis
 * on rejoue en silence jusqu'à elle — au plus un pas de reprise, donc moins de
 * deux secondes. C'est seulement à partir de là que les instantanés repartent.
 */
function commencerLaRelecture(deSemaine: number, vitesse: number): void {
  if (!state || relecture) return;
  const vivant = state;
  const depart = [...pointsDeReprise].reverse().find((p) => p.semaine <= deSemaine);
  if (!depart || vivant.week <= depart.semaine) {
    post({
      type: "relecture",
      enCours: false,
      depuis: vivant.week,
      semaine: vivant.week,
      jusqua: vivant.week,
      vitesse: 0,
    });
    return;
  }
  relecture = {
    depuis: Math.max(depart.semaine, deSemaine),
    jusqua: vivant.week,
    vivant,
    vitesse,
  };
  state = depart.etat;
  // Rattraper la semaine demandée sans rien montrer : ce qu'on veut revoir
  // commence à `deSemaine`, pas au point de reprise qui la précède.
  while (state.week < deSemaine && state.week < vivant.week) {
    const w = meteoSemaine(state.week);
    if (!w) break;
    state = advanceWeek(state, w, journal).state;
  }
  viderLesTampons();
  weeksPerSecond = vitesse;
  fractionalWeeks = 0;
  semaineDArret = undefined;
  post({
    type: "relecture",
    enCours: true,
    depuis: relecture.depuis,
    semaine: state.week,
    jusqua: relecture.jusqua,
    vitesse: relecture.vitesse,
  });
  postSnapshot();
}

/** Revenir au présent, que la relecture soit allée au bout ou non. */
function arreterLaRelecture(): void {
  if (!relecture) return;
  state = relecture.vivant;
  const jusqua = relecture.jusqua;
  relecture = undefined;
  weeksPerSecond = 0;
  fractionalWeeks = 0;
  viderLesTampons();
  post({ type: "relecture", enCours: false, depuis: jusqua, semaine: jusqua, jusqua, vitesse: 0 });
  postSnapshot();
}

/**
 * Jette ce qui attendait d'être montré.
 *
 * Au départ d'une relecture comme à son retour : les morts et les gestes
 * accumulés appartiennent à l'autre temps, et les jouer à l'arrivée ferait
 * tomber des arbres qui sont debout.
 */
function viderLesTampons(): void {
  pendingRefusals = [];
  pendingEvents = [];
  pendingMorts = [];
  pendingNaissances = [];
  pendingFranchissements = [];
  pendingGestes = [];
  pendingChutes = [];
  pendingIncendie = undefined;
  pendingTempete = undefined;
}

function startLoop() {
  if (timer) clearInterval(timer);
  fractionalWeeks = 0;
  timer = setInterval(() => {
    if (!state || weeksPerSecond <= 0) return;
    // **L'horloge attend la fin d'une animation bloquante (#163).** On sort
    // **avant** d'accumuler la fraction de semaine : sinon la retenue ne ferait
    // que différer les semaines, qui repartiraient toutes d'un coup au
    // relâchement — ce qui est le contraire de ce qu'on cherche.
    if (retenu) return;
    fractionalWeeks += weeksPerSecond / 10;
    if (relecture) {
      const pas = Math.floor(fractionalWeeks);
      if (pas > 0) {
        fractionalWeeks -= pas;
        avancerLaRelecture(pas);
        postSnapshot();
        post({
          type: "relecture",
          enCours: true,
          depuis: relecture.depuis,
          semaine: state.week,
          jusqua: relecture.jusqua,
          vitesse: relecture.vitesse,
        });
        if (state.week >= relecture.jusqua) arreterLaRelecture();
      }
      return;
    }
    let n = Math.floor(fractionalWeeks);
    if (n > 0) {
      fractionalWeeks -= n;
      // **On ne dépasse jamais l'arrivée.** Sans ce rabot, une traversée à
      // grande vitesse franchirait la semaine visée au milieu d'un pas et
      // s'arrêterait après — un mois demandé, cinq semaines rendues.
      if (semaineDArret !== undefined) n = Math.min(n, semaineDArret - state.week);
      if (n > 0) {
        stepWeeks(Math.min(n, 26));
        postSnapshot();
      }
      if (semaineDArret !== undefined && state.week >= semaineDArret) {
        semaineDArret = undefined;
        weeksPerSecond = 0;
        fractionalWeeks = 0;
        post({ type: "autopause", reason: libelleDArrivee });
      }
    }
  }, 100);
}

function stationInfo(): StationInfo {
  if (!sc) throw new Error("pas de station");
  const serie = meteoMode === "reelle" ? serieMeteoPour(sc.station.id) : undefined;
  const station = stationAvecPaysage(sc.station);
  const dims = gridDims(station);
  const altitudes = altitudeParCellule(station.relief, dims);
  // La **même** résolution que le tick : l'eau affichée est celle que la
  // simulation connaît, qu'elle soit déclarée ou déduite du modelé.
  const sources = sourcesDeLaParcelle(station.eau, altitudes, dims, {
    apportAmontM2: station.relief.bassinAmontHa * 10_000,
    pluieAnnuelleMm: station.pluieAnnuelleMm,
    profil: station.profil,
  });
  return {
    eau: station.eau,
    nappeEquilibreCm: profondeurEquilibreCm(
      station.profil,
      station.remonteeNappeMmSemaine,
      station.drainageExterneMmSemaine,
      station.profondeurNappeEquilibreCm,
    ),
    // Déjà calculée par `stationAvecPaysage` pour le moteur : elle ne dépend
    // que des bordures, qui ne changent pas en cours de partie.
    ventExposition: station.ventExposition,
    // Ni les cellules en eau ni le champ de nappe ne bougent : on les envoie
    // une fois pour toutes, la carte s'en sert telles quelles.
    enEau: sources
      ? [...sources.enEau]
      : new Array<boolean>(dims.widthM * dims.heightM).fill(false),
    nappeCm: champDeNappeCm(sources, altitudes, dims, station.profil),
    // Le relief, celui-là même qui a servi à placer l'eau libre. Il ne change
    // pas d'une semaine à l'autre : il part une fois, avec la station.
    altitudesM: altitudes,
    // Ce qui verse d'en haut : la même grandeur que `apportAmontM2` ci-dessus,
    // dans son unité d'origine, parce que le décor s'en sert pour savoir où
    // poser la crête (#150).
    bassinAmontHa: station.relief.bassinAmontHa,
    // Et ce qu'il y a **autour**, réduit à ce que le décor en dessine. Même
    // raison : les bordures sont choisies au départ et ne bougent plus. La vue
    // ne peut pas les retrouver seule — une partie reprise d'une sauvegarde
    // n'a jamais vu passer les réglages.
    bordures: decorDesBordures(station.bordures),
    id: sc.station.id,
    nom: sc.station.nom,
    coteM: sc.station.coteM,
    ruMm: sc.station.ruMm,
    ruHorizonSurfaceMm: sc.station.profil[0] ? ruHorizonMm(sc.station.profil[0]) : sc.station.ruMm,
    phInitial: sc.station.phInitial,
    meteoLabel: serie
      ? `${serie.stationMeteo} ${serie.periode[0]}-${serie.periode[1]} (Météo-France)`
      : "année synthétique répétée",
  };
}

function init(
  stationId: string,
  newSeed: number,
  mode: "reelle" | "synthetique",
  scenarioId: ScenarioId,
  bordersChoisies: Bordures,
  reliefChoisi: Relief,
  eauChoisie: EauDeSurface,
  nappeChoisieCm: number,
  partBassinChoisie: number,
  maturation: number,
  annee: number,
  economieActive: boolean,
) {
  scenario = scenarioId;
  anneeDepart = annee;
  bordures = bordersChoisies;
  relief = reliefChoisi;
  eau = eauChoisie;
  nappeCm = nappeChoisieCm;
  partBassin = partBassinChoisie;
  maturationAns = maturation;
  economie = economieActive;
  sc = STATIONS_V0.find((s) => s.station.id === stationId);
  if (!sc) throw new Error(`station inconnue : ${stationId}`);
  meteoMode = mode;
  seed = newSeed;
  weather = loadWeather(stationId, mode);
  normales = normalesHebdo(weather);
  // Le paysage choisi remplace celui de la station : c'est la même terre, mais
  // au milieu d'une hêtraie, de champs ou d'un lotissement (paysage.ts).
  const neuf = createGameState(stationAvecPaysage(sc.station), rngStateFromSeed(newSeed), {
    economie,
  });
  politiqueHoraire = "demander";
  // Une partie neuve n'a rien récolté : le cumul de la précédente ne survit pas.
  cumuls = CUMULS_VIDES;
  bilan = BILAN_VIDE;
  pointsDeReprise = [];
  relecture = undefined;
  semaineDuDernierInstantane = 0;
  semees = new Set();
  choixRecolte = {};
  recoltees = new Set();
  // …ni son niveau : l'interface réinstalle celui qu'elle lance.
  niveauId = undefined;
  paliersAcquis = [];
  // **le point zéro du bilan carbone se fige ici, et pas ailleurs** (#202) :
  // c'est l'instant exact où le joueur prend la main. Ce qu'il trouve sur la
  // parcelle — les arbres venus tout seuls pendant la maturation compris — est
  // son acquis, pas son mérite.
  ouvrirLaSemaine(
    maturationAns > 0 ? figerCarboneDeReference(faireVieillir(neuf, maturationAns)) : neuf,
  );
  journal = [];
  pendingRefusals = [];
  pendingEvents = [];
  pendingMorts = [];
  pendingNaissances = [];
  pendingFranchissements = [];
  pendingGestes = [];
  pendingChutes = [];
  pendingIncendie = undefined;
  pendingTempete = undefined;
  lastFluxes = undefined;
  lastDebordement = undefined;
  lastLumiereAuSol = undefined;
  weeksPerSecond = 0;
  bankruptcyAnnounced = false;
  droughtYearFlagged = -1;
  partInondeePrecedente = 0;
  erosionAnnee = 0;
  prevFruitsReadyKg = 0;
  post({ type: "ready", station: stationInfo() });
  postSnapshot();
  startLoop();
}

self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      init(
        msg.stationId,
        msg.seed,
        msg.meteo,
        msg.scenario,
        msg.bordures,
        msg.relief,
        msg.eau,
        msg.nappeCm,
        msg.partBassin,
        msg.maturationAns,
        msg.anneeDepart,
        msg.economie,
      );
      break;
    case "resume": {
      // Rejoue la sauvegarde : même séquence beginWeek → actions → tick.
      sc = STATIONS_V0.find((s) => s.station.id === msg.save.stationId);
      if (!sc) throw new Error(`station inconnue : ${msg.save.stationId}`);
      meteoMode = msg.save.meteo;
      scenario = msg.save.scenario;
      bordures = msg.save.bordures ?? bordersUniformes(msg.save.paysageId);
      relief = msg.save.relief;
      eau = msg.save.eau;
      nappeCm = msg.save.nappeCm;
      partBassin = msg.save.partBassin;
      maturationAns = msg.save.maturationAns ?? 0;
      // Absent = vrai : une sauvegarde d'avant l'option a été jouée **avec**
      // l'économie, et doit se rejouer ainsi ou elle divergerait.
      economie = msg.save.economie ?? true;
      politiqueHoraire = msg.save.politiqueHoraire ?? "demander";
      niveauId = msg.save.niveauId;
      paliersAcquis = msg.save.paliersAcquis ? [...msg.save.paliersAcquis] : [];
      anneeDepart = msg.save.anneeDepart;
      seed = msg.save.seed;
      weather = loadWeather(msg.save.stationId, msg.save.meteo);
      normales = normalesHebdo(weather);
      journal = msg.save.actions;
      // Le journal rejoué rend aussi ce qui a été semé : sans ça, reprendre une
      // partie ferait cueillir la friche. Les décisions du joueur, elles,
      // viennent de la sauvegarde — rien ne permettrait de les deviner.
      semees = especesSemees(journal);
      choixRecolte = { ...(msg.save.recolteAuto ?? {}) };
      let replayed = createGameState(stationAvecPaysage(sc.station), rngStateFromSeed(seed), {
        economie,
      });
      // Le vieillissement fait partie de l'histoire de la parcelle : il se
      // rejoue à l'identique avant les actions du joueur.
      if (maturationAns > 0) replayed = faireVieillir(replayed, maturationAns);
      // Le cumul se **refait** pendant le rejeu (#188). Rien d'autre ne pourrait le
      // rendre : les kilos cueillis il y a dix ans ne sont plus nulle part dans
      // l'état, et le journal de sauvegarde porte les actions, pas ce qu'elles
      // ont donné. C'est le même rejeu qui refait la parcelle et son compte.
      cumuls = CUMULS_VIDES;
      bilan = BILAN_VIDE;
      pointsDeReprise = [];
      relecture = undefined;
      semaineDuDernierInstantane = 0;
      for (let i = 0; i < msg.save.weeks; i++) {
        const step = advanceWeek(replayed, meteoSemaine(i), journal);
        replayed = step.state;
        cumuls = accumuler(cumuls, step.gestes, step.state.trees);
        // **Le rejeu compte, et c'est tout l'intérêt de tenir le bilan ici** :
        // une partie reprise retrouve les morts, les semis et les gestes de
        // toutes ses années, qu'aucun instantané n'a jamais montrés.
        replierLeBilan(step, i, step.state.trees);
        lastFluxes = step.fluxes;
        // La dernière semaine rejouée est celle qu'on va montrer : son
        // débordement et sa lumière au sol servent au premier instantané.
        lastDebordement = step.debordementParCellule;
        lastLumiereAuSol = step.lumiereAuSol;
        if (i % 104 === 0)
          post({ type: "progress", done: i, total: msg.save.weeks, phase: "rejeu" });
      }
      ouvrirLaSemaine(replayed);
      // Le rejeu n'a rien à raconter : ce sont des semaines déjà vécues.
      pendingRefusals = [];
      pendingEvents = [];
      pendingMorts = [];
      pendingNaissances = [];
      pendingFranchissements = [];
      pendingGestes = [];
      pendingChutes = [];
      pendingIncendie = undefined;
      pendingTempete = undefined;
      weeksPerSecond = 0;
      post({ type: "ready", station: stationInfo() });
      // La consigne vient de la sauvegarde : l'écran ne la devinerait pas.
      post({ type: "politiqueHoraire", politique: politiqueHoraire });
      // Le niveau vient de la sauvegarde : l'écran ne le devinerait pas.
      post({ type: "niveau", id: niveauId, acquis: [...paliersAcquis] });
      majRecolteAuto();
      postSnapshot();
      startLoop();
      break;
    }
    case "suivre":
      suivis = new Set(msg.ids);
      break;
    case "niveau":
      // On **range**, on ne joue pas : l'avancement se calcule côté interface, où
      // les fiches vivent (#188).
      niveauId = msg.id;
      paliersAcquis = [...msg.acquis];
      break;
    case "recolteAuto":
      // Une décision explicite, qui doit survivre à une plantation ultérieure :
      // retirer la ronce puis en semer ne doit pas la réintroduire en douce.
      choixRecolte = { ...choixRecolte, [msg.especeId]: msg.actif };
      majRecolteAuto();
      break;
    case "reglerFacture":
      reglerLaFacture(msg.embaucher, msg.pourToujours);
      break;
    case "politiqueHoraire":
      definirLaPolitique(msg.politique);
      postSnapshot();
      break;
    case "attendre":
      // On ne touche **ni** à `weeksPerSecond` **ni** à `semaineDArret` : c'est une
      // retenue, pas une reprise en main. Une traversée « +1 mois » qui
      // s'interromprait pour montrer une chute doit repartir où elle allait.
      retenu = msg.retenu;
      break;
    case "speed":
      // Changer de vitesse pendant une relecture la règle, sans la quitter :
      // c'est le seul bouton du bandeau qui garde son sens.
      weeksPerSecond = msg.weeksPerSecond;
      // Le joueur reprend la main : la traversée en cours n'a plus d'objet.
      semaineDArret = undefined;
      break;
    case "avancerDe": {
      if (!state || relecture) return;
      semaineDArret = state.week + Math.max(1, Math.round(msg.semaines));
      weeksPerSecond = msg.weeksPerSecond;
      libelleDArrivee = msg.libelle;
      break;
    }
    case "action": {
      if (!state) return;
      // **Pendant une relecture, on regarde.** Agir écrirait dans le journal
      // une action datée d'une semaine déjà vécue, et le rejeu d'après en
      // sortirait une autre partie.
      if (relecture) return;
      // La semaine est déjà « ouverte » : l'action s'applique immédiatement,
      // en pause comme en lecture — le rejeu donnera le même résultat.
      performAction({ ...msg.action, week: state.week } as GameAction);
      postSnapshot();
      break;
    }
    case "prevoir": {
      if (!state) return;
      // **C'est le moteur qui répond, par sa propre fonction.** Le jeu
      // appliquait l'action et jetait le résultat, en tenant lui-même par un
      // essai la propriété dont il dépendait — que `applyAction` ne mute pas
      // l'état qu'on lui donne. Le moteur en a fait un contrat (#139, #152) :
      // `prevoirAction` porte la garantie dans sa signature, et l'essai qui la
      // défend éprouve désormais **tous** les types d'action sur leur chemin de
      // travail, là où le mien ne couvrait que la plantation.
      const refusals = prevoirAction(state, { ...msg.action, week: state.week } as GameAction);
      const reponse: FromWorker = { type: "prevision", cle: msg.cle, refusals };
      self.postMessage(reponse);
      break;
    }
    case "relire":
      commencerLaRelecture(msg.deSemaine, msg.weeksPerSecond);
      break;
    case "arreterLaRelecture":
      arreterLaRelecture();
      break;
    case "autoHarvest":
      autoHarvest = msg.enabled;
      break;
    case "requestSave": {
      // **Pas de sauvegarde pendant une relecture** : l'état courant est un
      // passé, et l'enregistrer raccourcirait la partie de tout ce qu'on est
      // en train de revoir.
      if (!state || relecture) return;
      const save: SaveGame = {
        version: 1,
        stationId: sc?.station.id ?? "",
        seed,
        meteo: meteoMode,
        scenario,
        paysageId: bordures.nord,
        bordures,
        relief: relief ?? sc?.station.relief,
        eau: eau ?? sc?.station.eau,
        nappeCm: nappeCm ?? sc?.station.profondeurNappeEquilibreCm,
        partBassin: partBassin ?? sc?.station.partBassinSemblable,
        maturationAns,
        economie,
        anneeDepart,
        // La consigne suit la partie : c'est un choix de conduite, pas un
        // réglage de la session (#133).
        ...(politiqueHoraire === "demander" ? {} : { politiqueHoraire }),
        ...(Object.keys(choixRecolte).length > 0 ? { recolteAuto: { ...choixRecolte } } : {}),
        ...(niveauId ? { niveauId } : {}),
        ...(paliersAcquis.length > 0 ? { paliersAcquis: [...paliersAcquis] } : {}),
        weeks: state.week,
        actions: journal,
      };
      post({ type: "save", save });
      break;
    }
  }
});
