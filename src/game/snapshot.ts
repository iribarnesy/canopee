/**
 * Traduction état du moteur → INSTANTANÉ (protocol.ts). Pure, testable, et
 * volontairement sortie du worker.
 *
 * Pourquoi elle ne vit plus dans `worker.ts` : un `filter((t) => t.alive)`
 * posé juste avant `chandelle: !t.alive` a rendu ce drapeau constamment faux
 * et une fonctionnalité entière invisible — les troncs morts sur pied — sans
 * qu'aucun test ne bronche, parce que la traduction vivait dans un worker
 * qu'aucun test n'instancie. Le worker ASSEMBLE, il ne décide pas : tout
 * nouveau champ passe par ici, et se teste ici.
 */

import type { ActionRefusal, GesteVisible } from "../engine/actions";
import { indiceBiodiversite } from "../engine/biodiversite";
import { CARBON_FRACTION, carbonInventory } from "../engine/carbon";
import { CO2_ACTUEL_PPM } from "../engine/climat";
import type { WeekWeather } from "../engine/meteo";
import { profondeurPourStock } from "../engine/nappe";
import { contextePhenologique } from "../engine/phenologie";
import { porositeDrainageMm } from "../engine/soil";
import type { GameState, TickFluxes } from "../engine/state";
import { weekOfYear } from "../engine/state";
import type { IncendieResult, MortDeLaSemaine } from "../engine/tick";
import type { TreeState } from "../engine/trees";
import type { GameEvent, Snapshot, SnapshotTree } from "./protocol";

/**
 * Un arbre, tel que le rendu doit pouvoir le DESSINER. Aucun filtre ici : les
 * chandelles sont des arbres du jeu, elles ont juste cessé de vivre.
 */
export function arbreDuSnapshot(t: TreeState): SnapshotTree {
  return {
    id: t.id,
    especeId: t.especeId,
    x: t.x,
    y: t.y,
    heightM: t.heightM,
    ageWeeks: t.ageWeeks,
    stress: t.stress,
    fruitsKg: t.fruitsKg,
    hauteurElagueeM: t.hauteurElagueeM,
    protege: t.protege,
    chandelle: !t.alive,
    teteTrogneM: t.teteTrogneM,
    recepages: t.recepages,
    vigueur: t.vigueur,
    dommageHydraulique: t.dommageHydraulique,
    mortSemaine: t.mortSemaine,
    brulEeSemaine: t.brulEeSemaine,
    causeMort: t.causeMort,
    derniereLeveeSemaine: t.derniereLeveeSemaine,
    fruitProgress: t.fruitProgress,
    bloomFrosted: t.bloomFrosted,
    pousseTendreM: t.pousseTendreM,
    frotteSemaine: t.frotteSemaine,
  };
}

/** Eau de l'horizon de SURFACE, par cellule (le sol est stratifié, cf. soil.ts). */
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
 * racines subissent, et ce qu'on veut pouvoir REGARDER sur la carte.
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
  /** carbone du sol au départ, t/ha (pour le bilan) */
  initialSoilCTHa: number;
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
  gestes: GesteVisible[];
  incendie?: IncendieResult;
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
    inventory: carbonInventory(state, e.initialSoilCTHa),
    anneeCivile: e.anneeCivile,
    paysage: e.paysage,
    co2Ppm: e.weather.co2Ppm ?? CO2_ACTUEL_PPM,
    stockBrfKg: state.stockBrf.carboneG / 1000 / CARBON_FRACTION,
    pressionGibier: state.pressionGibier,
    biodiversite: indiceBiodiversite(state.trees, state.carbon.deadWoodKgC, areaHa),
    fluxes: e.fluxes,
    // Le calendrier foliaire se RECALCULE à l'identique : mêmes entrées que
    // celles du tick, donc mêmes couleurs de saison de part et d'autre.
    pheno: contextePhenologique(
      station.latitudeDeg,
      weekOfYear(state),
      state.ddYearBase5,
      state.semainesDeFroid,
    ),
    // Aucun filtre : les chandelles sont des arbres, elles ont juste cessé de
    // vivre. Les compter comme vivants est l'affaire de l'UI, pas la nôtre.
    trees: state.trees.map(arbreDuSnapshot),
    // Carte : on montre l'eau de l'horizon de SURFACE, celle que voient les
    // semis et l'évaporation.
    soilWater: eauDeSurface(state, nH),
    soilPh: Float32Array.from(state.soil.ph),
    soilN: Float32Array.from(state.soil.mineralNG),
    soilHerbe: Float32Array.from(state.soil.herbeCouverture),
    // La nappe et l'engorgement changent chaque semaine : ils voyagent avec
    // l'instantané, contrairement au champ figé de l'eau libre.
    soilNappeCm: nappeParCellule(state),
    soilEngorgement: engorgementParCellule(state, nH),
    // La clôture change quand le joueur en pose : elle voyage à chaque
    // instantané, sinon il ne verrait pas ce qu'il vient de payer.
    soilCloture: Uint8Array.from(state.soil.cloture, (c) => (c ? 1 : 0)),
    // Grandeurs du dernier tick. On les COPIE : elles sont transférées avec
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
    // La litière EST de l'état (elle s'accumule et se décompose) : on la lit
    // dans le sol, comme le pH, plutôt que de la faire remonter du tick.
    soilLitiereCG: Float32Array.from(state.soil.litterCG),
    refusals: e.refusals,
    events: e.events,
    morts: e.morts,
    gestes: e.gestes,
    incendie: e.incendie,
  };
}

/**
 * Les tampons à TRANSFÉRER avec l'instantané. À côté de `construireSnapshot`
 * pour qu'un champ ajouté d'un côté ne s'oublie pas de l'autre : oublié, il se
 * paie en une copie complète par semaine simulée.
 */
export function transferablesDuSnapshot(s: Snapshot): Transferable[] {
  const buffers: ArrayBufferLike[] = [
    s.soilWater.buffer,
    s.soilPh.buffer,
    s.soilN.buffer,
    s.soilHerbe.buffer,
    s.soilNappeCm.buffer,
    s.soilEngorgement.buffer,
    s.soilCloture.buffer,
    s.soilDebordementMm.buffer,
    s.soilLumiere.buffer,
    s.soilLitiereCG.buffer,
  ];
  if (s.incendie) buffers.push(s.incendie.brulees.buffer, s.incendie.rangs.buffer);
  return buffers as Transferable[];
}
