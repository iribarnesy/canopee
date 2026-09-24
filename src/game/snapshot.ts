/**
 * Traduction état du moteur → **instantané** (protocol.ts). Pure, testable, et
 * volontairement sortie du worker.
 *
 * Pourquoi elle ne vit plus dans `worker.ts` : un `filter((t) => t.alive)`
 * posé juste avant `chandelle: !t.alive` a rendu ce drapeau constamment faux
 * et une fonctionnalité entière invisible — les troncs morts sur pied — sans
 * qu'aucun test ne bronche, parce que la traduction vivait dans un worker
 * qu'aucun test n'instancie. Le worker **assemble**, il ne décide pas : tout
 * nouveau champ passe par ici, et se teste ici.
 */

import type { ActionRefusal, GesteVisible } from "../engine/actions";
import { indiceBiodiversite } from "../engine/biodiversite";
import { CARBON_FRACTION, carbonInventory } from "../engine/carbon";
import { CO2_ACTUEL_PPM } from "../engine/climat";
import { getEspece } from "../engine/especes";
import { HERBACEES, N_HERBACEES } from "../engine/herbacees";
import type { WeekWeather } from "../engine/meteo";
import { profondeurPourStock } from "../engine/nappe";
import { contextePhenologique, partFloraison } from "../engine/phenologie";
import { porositeDrainageMm } from "../engine/soil";
import type { GameState, TickFluxes } from "../engine/state";
import { weekOfYear } from "../engine/state";
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  IncendieResult,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
  TempeteResult,
} from "../engine/tick";
import type { TreeState } from "../engine/trees";
import { diametreTeteCm, volumeCaviteL } from "../engine/trogne";
import type { GameEvent, Snapshot, SnapshotTree } from "./protocol";

/**
 * Un arbre, tel que le rendu doit pouvoir le **dessiner**. Aucun filtre ici : les
 * chandelles sont des arbres du jeu, elles ont juste cessé de vivre.
 *
 * `ddYearBase5` est le cumul de degrés-jours de la semaine (l'état le porte) :
 * c'est le calendrier qui décide de la floraison, et il se lit ici plutôt que
 * de se recopier côté rendu.
 */
/**
 * Éclate l'emprise à plat du moteur — `herbeEmprise[i * N_HERBACEES + s]` — en
 * une grille par espèce, quantifiée sur un octet (#86).
 *
 * L'emprise vaut au plus 1 par espèce et la somme d'une cellule ne dépasse
 * jamais 1 : multiplier par 255 et arrondir garde donc tout l'intervalle, et
 * 1/255 est bien au-delà de ce qu'une teinte ou un seuil pondéré demandent.
 */
export function emprisesParEspece(emprise: ArrayLike<number>): Uint8Array[] {
  const n = emprise.length / N_HERBACEES;
  const grilles = Array.from({ length: N_HERBACEES }, () => new Uint8Array(n));
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < N_HERBACEES; s++) {
      const grille = grilles[s];
      if (grille)
        grille[i] = Math.round(255 * Math.min(1, Math.max(0, emprise[i * N_HERBACEES + s] ?? 0)));
    }
  }
  return grilles;
}

export function arbreDuSnapshot(t: TreeState, ddYearBase5: number): SnapshotTree {
  return {
    id: t.id,
    especeId: t.especeId,
    x: t.x,
    y: t.y,
    heightM: t.heightM,
    diametreCm: t.diametreCm,
    ageWeeks: t.ageWeeks,
    stress: t.stress,
    // L'origine du stress, relayée telle quelle (#153). `causeLente` existait
    // déjà sur l'arbre et n'arrivait pas jusqu'ici : le moteur la calculait
    // chaque semaine puis elle était jetée. La livrer sans elle aurait donné un
    // journal capable de dire « attaqué par des ravageurs » et muet sur « il
    // dépérit de sécheresse » — la moitié la plus fréquente.
    stressLent: t.stressLent,
    causeLente: t.causeLente,
    stressRavageurs: t.stressRavageurs,
    stressMaladie: t.stressMaladie,
    fruitsKg: t.fruitsKg,
    hauteurElagueeM: t.hauteurElagueeM,
    // Absente sur un arbre qui vient de naître : il est branchu jusqu'en bas.
    baseHouppierM: t.baseHouppierM ?? 0,
    protege: t.protege,
    chandelle: !t.alive,
    floraison: floraisonDe(t, ddYearBase5),
    teteTrogneM: t.teteTrogneM,
    recepages: t.recepages,
    // La tête ne se déduit pas du compteur d'étêtages sans recopier le modèle :
    // c'est le moteur qui la dimensionne, et `biodiversite.ts` lit la même.
    diametreTeteCm: diametreTeteCm(t),
    caviteTeteL: volumeCaviteL(t),
    vigueur: t.vigueur,
    dommageHydraulique: t.dommageHydraulique,
    mortSemaine: t.mortSemaine,
    brulEeSemaine: t.brulEeSemaine,
    renverseSemaine: t.renverseSemaine,
    chuteRad: t.chuteRad,
    causeMort: t.causeMort,
    derniereLeveeSemaine: t.derniereLeveeSemaine,
    fruitProgress: t.fruitProgress,
    bloomFrosted: t.bloomFrosted,
    pousseTendreM: t.pousseTendreM,
    frotteSemaine: t.frotteSemaine,
    brouteSemaine: t.brouteSemaine,
  };
}

/**
 * Part de la couronne en fleur d'un arbre donné. Trois conditions, et pas une
 * de moins : l'espèce fructifie, l'arbre est vivant, l'arbre est mature. Une
 * chandelle ne fleurit pas, et un jeune plant non plus — c'est la même
 * maturité que celle qui commande la nouaison dans `tick.ts`.
 */
function floraisonDe(t: TreeState, ddYearBase5: number): number {
  if (!t.alive) return 0;
  const espece = getEspece(t.especeId);
  const fruits = espece.fruits;
  if (!fruits) return 0;
  const floraison = espece.floraison;
  if (!floraison) return 0;
  if (t.ageWeeks < espece.regeneration.maturiteAns * 52) return 0;
  return partFloraison(floraison.debutDJ, ddYearBase5, floraison.dureeDJ);
}

/**
 * Emprise moyenne de chaque herbacée sur la parcelle, dans l'ordre de
 * `HERBACEES`. C'est une moyenne de parcelle, et c'est assumé : l'indice de
 * biodiversité est lui-même une note de parcelle. Le **mécanisme**, lui, reste
 * local — la ressource florale que lit la pollinisation est par cellule
 * (`tick.ts`).
 */
function empriseHerbaceeMoyenne(state: GameState): number[] {
  const nCells = state.soil.mineralNG.length;
  const out = new Array<number>(N_HERBACEES).fill(0);
  if (nCells === 0) return out;
  for (let i = 0; i < nCells; i++) {
    for (let s = 0; s < N_HERBACEES; s++) {
      out[s] = (out[s] ?? 0) + (state.soil.herbeEmprise[i * N_HERBACEES + s] ?? 0);
    }
  }
  for (let s = 0; s < N_HERBACEES; s++) out[s] = (out[s] ?? 0) / nCells;
  return out;
}

/** Eau de l'horizon de **surface**, par cellule (le sol est stratifié, cf. soil.ts). */
export function eauDeSurface(state: GameState, nH: number): Float32Array {
  const nCells = state.soil.mineralNG.length;
  const out = new Float32Array(nCells);
  for (let i = 0; i < nCells; i++) out[i] = state.soil.waterMm[i * nH] ?? 0;
  return out;
}

/** Profondeur de la nappe sous chaque cellule, cm (nappe.ts). */
export function nappeParCellule(state: GameState): Float32Array {
  const profil = state.station.profil;
  return Float32Array.from(state.soil.nappeMm, (mm) => profondeurPourStock(mm, profil));
}

/**
 * Engorgement moyen du profil sous chaque cellule ∈ [0,1] : la part de la
 * macroporosité occupée par l'eau, moyennée sur les horizons. C'est ce que les
 * racines subissent, et ce qu'on veut pouvoir **regarder** sur la carte.
 */
export function engorgementParCellule(state: GameState, nH: number): Float32Array {
  const profil = state.station.profil;
  const porosites = profil.map((h) => porositeDrainageMm(h));
  const n = state.soil.mineralNG.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let somme = 0;
    for (let h = 0; h < nH; h++) {
      const capacite = porosites[h] ?? 0;
      if (capacite > 0) somme += Math.min(1, (state.soil.excessMm[i * nH + h] ?? 0) / capacite);
    }
    out[i] = somme / Math.max(1, nH);
  }
  return out;
}

/**
 * Ce qu'il faut au constructeur d'instantané en plus de l'état : la météo de
 * la semaine, les grandeurs du dernier tick (elles ne sont pas dans l'état),
 * et ce qui s'est passé depuis le dernier envoi.
 */
export interface EntreesSnapshot {
  /** état « semaine ouverte » à montrer */
  state: GameState;
  weather: WeekWeather;
  anneeCivile: number;
  /** nom du paysage autour de la parcelle (paysage.ts) */
  paysage: string;
  fluxes: TickFluxes;
  /**
   * Débordement de la dernière semaine simulée, mm par cellule
   * (`TickResult`). Absent au premier instantané : aucun tick n'a tourné.
   */
  debordementParCellule?: Float32Array;
  /** lumière au sol de la dernière semaine simulée, par cellule (`TickResult`) */
  lumiereAuSol?: Float32Array;
  refusals: ActionRefusal[];
  events: GameEvent[];
  morts: MortDeLaSemaine[];
  naissances: NaissanceDeLaSemaine[];
  franchissements: FranchissementDeStade[];
  gestes: GesteVisible[];
  /** chandelles abattues depuis le dernier instantané (`TickResult`) */
  chutes: ChuteDeChandelle[];
  incendie?: IncendieResult;
  tempete?: TempeteResult;
}

/**
 * L'instantané complet. Une seule fonction, un seul endroit à compléter quand
 * le rendu a besoin d'un champ de plus.
 */
export function construireSnapshot(e: EntreesSnapshot): Snapshot {
  const { state } = e;
  const station = state.station;
  const nH = Math.max(1, station.profil.length);
  const nCells = state.soil.mineralNG.length;
  const areaHa = (station.coteM * station.coteM) / 10_000;
  return {
    week: state.week,
    weather: e.weather,
    economy: state.economy,
    // Le point zéro du bilan est **dans** l'état (`carboneDeReferenceTHa`), et ce
    // n'est pas un détail de plomberie : il valait `station.initialSoilCTHa`,
    // donc une parcelle vieillie avant l'arrivée du joueur lui offrait le
    // carbone de ses arbres en avance gratuite (#202).
    inventory: carbonInventory(state),
    anneeCivile: e.anneeCivile,
    paysage: e.paysage,
    co2Ppm: e.weather.co2Ppm ?? CO2_ACTUEL_PPM,
    stockBrfKg: state.stockBrf.carboneG / 1000 / CARBON_FRACTION,
    pressionGibier: state.pressionGibier,
    // Le bois **couché** compte autant que le debout, et pas pour les mêmes
    // bêtes : les pics veulent du sur-pied, les carabes et les salamandres du
    // par-terre. L'indice ne fait pour l'instant pas la différence, mais il
    // serait faux d'oublier la moitié du bois mort d'une vieille parcelle.
    biodiversite: indiceBiodiversite(
      state.trees,
      state.carbon.deadWoodKgC + somme(state.soil.boisAuSolCG) / 1000,
      areaHa,
      // Le côté de la parcelle : c'est lui qui permet de voir la **mosaïque** et
      // l'étagement local, donc de récompenser la disposition (biodiversite.ts).
      state.station.coteM,
      // L'emprise **moyenne** de chaque herbacée : c'est par elle que la strate
      // basse entre enfin dans l'étalement des floraisons (#70). Une vernale
      // qui tient un tiers du sol nourrit les pollinisateurs de mars, et
      // l'indice l'ignorait.
      empriseHerbaceeMoyenne(state),
    ),
    fluxes: e.fluxes,
    // Le calendrier foliaire se **recalcule** à l'identique : mêmes entrées que
    // celles du tick, donc mêmes couleurs de saison de part et d'autre.
    pheno: contextePhenologique(
      station.latitudeDeg,
      weekOfYear(state),
      state.ddYearBase5,
      state.semainesDeFroid,
    ),
    // Aucun filtre : les chandelles sont des arbres, elles ont juste cessé de
    // vivre. Les compter comme vivants est l'affaire de l'UI, pas la nôtre.
    trees: state.trees.map((t) => arbreDuSnapshot(t, state.ddYearBase5)),
    // Carte : on montre l'eau de l'horizon de **surface**, celle que voient les
    // semis et l'évaporation.
    soilWater: eauDeSurface(state, nH),
    soilPh: Float32Array.from(state.soil.ph),
    /** bois mort couché, g C/m² : de quoi dessiner les troncs au sol */
    soilBoisAuSol: Float32Array.from(state.soil.boisAuSolCG),
    /** et sa part en travers de la pente : celle qui barre l'eau */
    soilBoisEnTravers: Float32Array.from(state.soil.boisEnTraversPart),
    soilN: Float32Array.from(state.soil.mineralNG),
    soilHerbe: Float32Array.from(state.soil.herbeCouverture),
    // La biomasse ne se déduit pas de la couverture : elle reste sur pied
    // quand l'herbe jaunit, et seul le feu, la fauche et la décomposition la
    // font baisser.
    soilHerbeBiomasse: Float32Array.from(state.soil.herbeBiomasse),
    // L'humidité **vécue**, pas celle de la semaine : le moteur la porte d'une
    // semaine à l'autre (elle est récurrente par construction), et c'est cette
    // mémoire-là qui fait griller un tapis — pas la pluie de mardi.
    soilHerbeHumidite: Float32Array.from(state.soil.herbeHumidite),
    soilHerbeEmprises: emprisesParEspece(state.soil.herbeEmprise),
    herbesIds: HERBACEES.map((h) => h.id),
    // Les ravageurs par cellule, pas seulement leur moyenne : c'est la tache
    // de défoliation, et la mort qui la suit, que le rendu doit montrer.
    soilRavageurs: Float32Array.from(state.soil.ravageurs),
    // L'érosion est un **cumul** signé porté par l'état, pas un flux de la
    // semaine : c'est lui qui dit où le sol s'est creusé et où il s'est
    // rechargé.
    soilEpaisseurPerdueCm: Float32Array.from(state.soil.epaisseurPerdueCm),
    // La nappe et l'engorgement changent chaque semaine : ils voyagent avec
    // l'instantané, contrairement au champ figé de l'eau libre.
    soilNappeCm: nappeParCellule(state),
    soilEngorgement: engorgementParCellule(state, nH),
    // La clôture change quand le joueur en pose : elle voyage à chaque
    // instantané, sinon il ne verrait pas ce qu'il vient de payer.
    soilCloture: Uint8Array.from(state.soil.cloture, (c) => (c ? 1 : 0)),
    // Grandeurs du dernier tick. On les **copie** : elles sont transférées avec
    // l'instantané (donc détachées), et le worker en a encore besoin pour
    // l'instantané suivant — une action reçue en pause en déclenche un sans
    // qu'aucune semaine n'ait été simulée entre-temps.
    soilDebordementMm: e.debordementParCellule
      ? Float32Array.from(e.debordementParCellule)
      : new Float32Array(nCells),
    // Au premier instantané, aucun tick n'a tourné : sans arbres tout le sol
    // est éclairé, et c'est bien ce que le tick calculera.
    soilLumiere: e.lumiereAuSol
      ? Float32Array.from(e.lumiereAuSol)
      : new Float32Array(nCells).fill(1),
    // La litière **est** de l'état (elle s'accumule et se décompose) : on la lit
    // dans le sol, comme le pH, plutôt que de la faire remonter du tick.
    soilLitiereCG: Float32Array.from(state.soil.litterCG),
    refusals: e.refusals,
    events: e.events,
    morts: e.morts,
    naissances: e.naissances,
    franchissements: e.franchissements,
    gestes: e.gestes,
    chutes: e.chutes,
    incendie: e.incendie,
    tempete: e.tempete,
  };
}

/**
 * Les tampons à **transférer** avec l'instantané. À côté de `construireSnapshot`
 * pour qu'un champ ajouté d'un côté ne s'oublie pas de l'autre : oublié, il se
 * paie en une copie complète par semaine simulée.
 */
/** Somme d'un champ par cellule — assez fréquent pour ne pas se réécrire. */
function somme(champ: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < champ.length; i++) total += champ[i] ?? 0;
  return total;
}

export function transferablesDuSnapshot(s: Snapshot): Transferable[] {
  const buffers: ArrayBufferLike[] = [
    s.soilWater.buffer,
    s.soilPh.buffer,
    s.soilBoisAuSol.buffer,
    s.soilBoisEnTravers.buffer,
    s.soilN.buffer,
    s.soilHerbe.buffer,
    s.soilHerbeBiomasse.buffer,
    s.soilHerbeHumidite.buffer,
    ...s.soilHerbeEmprises.map((g) => g.buffer),
    s.soilRavageurs.buffer,
    s.soilEpaisseurPerdueCm.buffer,
    s.soilNappeCm.buffer,
    s.soilEngorgement.buffer,
    s.soilCloture.buffer,
    s.soilDebordementMm.buffer,
    s.soilLumiere.buffer,
    s.soilLitiereCG.buffer,
  ];
  if (s.incendie) {
    buffers.push(s.incendie.brulees.buffer, s.incendie.rangs.buffer, s.incendie.charges.buffer);
  }
  return buffers as Transferable[];
}
