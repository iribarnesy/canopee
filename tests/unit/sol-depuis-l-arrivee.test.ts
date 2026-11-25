/**
 * **Le sol depuis votre arrivée, sur la carte** (#509).
 *
 * La carte du sol montrait l'état et jamais l'écart : « pH 6,4 » ne disait
 * rien à qui ne se souvenait pas qu'il était à 7,0. Le relevé d'arrivée
 * (`StationInfo.solALArrivee`) donne le repère ; ces épreuves défendent qu'il
 * se lit **comme** le présent — même grille, même conversion, même eau libre
 * écartée — et que la carte dit où le sol a bougé, pas seulement de combien
 * en moyenne.
 *
 * Les épreuves qui passent par le worker (relevé, sauvegarde, reprise) sont
 * dans `sol-a-l-arrivee.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ruHorizonMm } from "../../src/engine/soil";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_ACIDE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  CALQUE_ECART_PH,
  CALQUES,
  calquesDeLaCarte,
  couleurDeLaCellule,
  ecartSigne,
  etendueALArrivee,
  etendueDuCalque,
  ficheDuCalque,
  partDuDegrade,
  TEINTE_EAU_LIBRE,
} from "../../src/game/panneaux/calquesDuSol";
import { solDepuisLArrivee } from "../../src/game/panneaux/solDepuisLArrivee";
import type { SaveGame, Snapshot, SolALArrivee, StationInfo } from "../../src/game/protocol";
import { ecrireReprise, empreinteDeLaPartie, lireReprise } from "../../src/game/reprise";
import { construireSnapshot, releverLeSol } from "../../src/game/snapshot";

const COTE_M = 10;
const N = COTE_M * COTE_M;
const STATION: Station = { ...LIMON_ACIDE.station, coteM: COTE_M, voisinage: [], gibierParHa: 0 };
const METEO = syntheticYear(LIMON_ACIDE.climat);

/** Une semaine simulée sur un petit limon acide : l'état, son tick et son instantané. */
function uneSemaine() {
  const state = createGameState(STATION, rngStateFromSeed(11));
  const w = METEO[state.week % METEO.length];
  if (!w) throw new Error("météo manquante");
  const ticked = tick(state, w);
  const snapshot = construireSnapshot({
    state: ticked.state,
    weather: w,
    anneeCivile: 2026,
    paysage: "bocage",
    fluxes: ticked.fluxes,
    refusals: [],
    events: [],
    morts: ticked.morts,
    naissances: ticked.naissances,
    franchissements: ticked.franchissements,
    gestes: ticked.gestes,
    chutes: ticked.chutes,
    installationsFaune: [],
    departsFaune: [],
  });
  return { avant: state, ticked, snapshot };
}

const SEMAINE = uneSemaine();
const SNAPSHOT = SEMAINE.snapshot;

/** La station telle que la carte la reçoit, avec ou sans relevé d'arrivée. */
function station(
  solALArrivee?: SolALArrivee,
  enEau: boolean[] = new Array<boolean>(N).fill(false),
): StationInfo {
  const horizon = STATION.profil[0];
  return {
    id: STATION.id,
    nom: STATION.nom,
    coteM: COTE_M,
    ruMm: STATION.ruMm,
    ruHorizonSurfaceMm: horizon ? ruHorizonMm(horizon) : STATION.ruMm,
    epaisseurHorizonSurfaceCm: horizon?.epaisseurCm ?? 0,
    phInitial: STATION.phInitial,
    potassiumEchangeableMgKg: STATION.potassiumEchangeableMgKg,
    meteoLabel: "essai",
    enEau,
    nappeEquilibreCm: 500,
    ventExposition: 0.3,
    nappeCm: new Float32Array(N).fill(Number.POSITIVE_INFINITY),
    altitudesM: new Array(N).fill(0),
    ...(solALArrivee ? { solALArrivee } : {}),
  } as unknown as StationInfo;
}

/**
 * Le relevé de l'instantané lui-même, puis un sol qui a bougé : la cellule 0
 * a perdu 0,7 pH — celle d'un arbre, où la litière acidifie —, toutes les
 * autres 0,01. La moyenne ne bouge presque pas, et c'est le cas mesuré sur la
 * friche vieillie de vingt ans : pH moyen 6,70 avant comme après, cellule la
 * plus acide de 6,24 à 5,53.
 */
function solQuiABouge(): { arrivee: SolALArrivee; maintenant: Snapshot } {
  const arrivee: SolALArrivee = {
    ph: Float32Array.from(SNAPSHOT.soilPh),
    azote: Float32Array.from(SNAPSHOT.soilN),
    potassium: Float32Array.from(SNAPSHOT.soilPotassiumMgKg),
    humusTHa: SNAPSHOT.inventory.humusTHa + 3,
    phosphoreMoyenGM2: (SNAPSHOT.fluxes?.phosphoreMoyenGM2 ?? 0) + 0.2,
  };
  const ph = Float32Array.from(SNAPSHOT.soilPh, (v, i) => v - (i === 0 ? 0.7 : 0.01));
  return { arrivee, maintenant: { ...SNAPSHOT, soilPh: ph } };
}

describe("le relevé d'arrivée se lit comme l'instantané", () => {
  it("mêmes grilles, même conversion du potassium, même humus", () => {
    const releve = releverLeSol(SEMAINE.ticked.state);
    expect(Array.from(releve.ph)).toEqual(Array.from(SNAPSHOT.soilPh));
    expect(Array.from(releve.azote)).toEqual(Array.from(SNAPSHOT.soilN));
    expect(Array.from(releve.potassium)).toEqual(Array.from(SNAPSHOT.soilPotassiumMgKg));
    expect(releve.humusTHa).toBe(SNAPSHOT.inventory.humusTHa);
  });

  it("le phosphore est la moyenne que le tick publie dans ses flux", () => {
    // L'interface lit le phosphore dans les flux du dernier tick, qui n'existent
    // pas encore à l'arrivée sur une parcelle neuve. Le relevé prend la moyenne
    // de la grille que le tick laisse à l'état : c'est la même grandeur, et
    // cette épreuve casse le jour où le moteur la compterait autrement.
    expect(releverLeSol(SEMAINE.ticked.state).phosphoreMoyenGM2).toBeCloseTo(
      SEMAINE.ticked.fluxes.phosphoreMoyenGM2,
      6,
    );
  });

  it("le relevé est une copie : le sol qui bouge ne l'emporte pas", () => {
    const releve = releverLeSol(SEMAINE.avant);
    const avant = Array.from(releve.ph);
    SEMAINE.avant.soil.ph[0] = (SEMAINE.avant.soil.ph[0] ?? 7) - 1;
    expect(Array.from(releve.ph)).toEqual(avant);
  });
});

describe("le bloc de reprise emporte le relevé, et se relit sans lui", () => {
  const etat = SEMAINE.ticked.state;
  const save = {
    version: 1,
    stationId: STATION.id,
    seed: 11,
    meteo: "synthetique",
    scenario: "ssp245",
    paysageId: "bocage",
    anneeDepart: 2026,
    actions: [],
    weeks: etat.week,
  } as unknown as SaveGame;
  const partie = empreinteDeLaPartie(save, etat.week);
  const annexes = {
    cumuls: { kgRecoltes: {} },
    bilan: new Map(),
    histoires: new Map(),
    memoire: new Map(),
  } as unknown as Parameters<typeof ecrireReprise>[1];
  const releve = releverLeSol(etat);

  it("écrit puis relu, le relevé revient au bit près", () => {
    const bloc = ecrireReprise(etat, { ...annexes, solALArrivee: releve }, partie);
    const lu = lireReprise(bloc, save, STATION)?.annexes.solALArrivee;
    expect(lu).toBeDefined();
    expect(Array.from(lu?.ph ?? [])).toEqual(Array.from(releve.ph));
    expect(Array.from(lu?.azote ?? [])).toEqual(Array.from(releve.azote));
    expect(Array.from(lu?.potassium ?? [])).toEqual(Array.from(releve.potassium));
    expect(lu?.humusTHa).toBe(releve.humusTHa);
    expect(lu?.phosphoreMoyenGM2).toBe(releve.phosphoreMoyenGM2);
  });

  it("un bloc d'avant le relevé se relit, l'état intact et le relevé absent", () => {
    const bloc = ecrireReprise(etat, annexes, partie);
    const lu = lireReprise(bloc, save, STATION);
    expect(lu).toBeDefined();
    expect(lu?.etat).toEqual(etat);
    expect(lu?.annexes.solALArrivee).toBeUndefined();
  });

  it("un relevé qui n'a pas la taille de la parcelle est un bloc abîmé, refusé", () => {
    const tronque = { ...releve, ph: releve.ph.slice(0, N - 1) };
    const bloc = ecrireReprise(etat, { ...annexes, solALArrivee: tronque }, partie);
    expect(lireReprise(bloc, save, STATION)).toBeUndefined();
  });
});

describe("la carte compare le présent à l'arrivée", () => {
  it("sans relevé, la carte propose les neuf calques de toujours", () => {
    expect(calquesDeLaCarte(station())).toBe(CALQUES);
  });

  it("avec un relevé, l'écart de pH vient juste après le pH", () => {
    const ids = calquesDeLaCarte(station(solQuiABouge().arrivee)).map((c) => c.id);
    expect(ids.length).toBe(CALQUES.length + 1);
    expect(ids[ids.indexOf("ph") + 1]).toBe("ecartPh");
    expect(ficheDuCalque("ecartPh")).toBe(CALQUE_ECART_PH);
  });

  it("le pH, l'azote et le potassium ont leur valeur d'arrivée, cellule par cellule", () => {
    const { arrivee } = solQuiABouge();
    const st = station(arrivee);
    expect(ficheDuCalque("ph").aLArrivee?.(st, 3)).toBe(arrivee.ph[3]);
    expect(ficheDuCalque("azote").aLArrivee?.(st, 3)).toBe(arrivee.azote[3]);
    expect(ficheDuCalque("potassium").aLArrivee?.(st, 3)).toBe(arrivee.potassium[3]);
    // Sans relevé, rien : la carte n'invente pas de repère.
    expect(ficheDuCalque("ph").aLArrivee?.(station(), 3)).toBeUndefined();
    expect(etendueALArrivee(ficheDuCalque("ph"), station(), N)).toBeUndefined();
    // Et un calque sans grille d'arrivée n'en a pas.
    expect(ficheDuCalque("eau").aLArrivee).toBeUndefined();
  });

  it("la moyenne d'arrivée se compte comme celle du présent, eau libre écartée", () => {
    const { arrivee } = solQuiABouge();
    const enEau = new Array<boolean>(N).fill(false);
    enEau[5] = true;
    const st = station(
      { ...arrivee, ph: Float32Array.from(arrivee.ph, (v, i) => (i === 5 ? 1 : v)) },
      enEau,
    );
    const e = etendueALArrivee(ficheDuCalque("ph"), st, N);
    // Le pH aberrant de la cellule en eau n'entre pas dans la moyenne.
    expect(e?.bas).toBeGreaterThan(1);
    expect(e?.moyenne).toBeCloseTo(
      etendueDuCalque(ficheDuCalque("ph"), SNAPSHOT, station(undefined, enEau), N)?.moyenne ?? 0,
      5,
    );
  });
});

describe("le calque de l'écart dit où le sol a bougé", () => {
  const FICHE = CALQUE_ECART_PH;

  it("lit maintenant moins l'arrivée, cellule par cellule", () => {
    const { arrivee, maintenant } = solQuiABouge();
    const st = station(arrivee);
    expect(FICHE.lire(maintenant, st, 0)).toBeCloseTo(-0.7, 5);
    expect(FICHE.lire(maintenant, st, 1)).toBeCloseTo(-0.01, 5);
    // Sans relevé, pas de valeur — et pas un zéro qui ferait croire à un sol stable.
    expect(Number.isNaN(FICHE.lire(maintenant, station(), 0))).toBe(true);
  });

  it("l'étendue trouve la cellule que la moyenne cache", () => {
    const { arrivee, maintenant } = solQuiABouge();
    const e = etendueDuCalque(FICHE, maintenant, station(arrivee), N);
    expect(e?.bas).toBeCloseTo(-0.7, 5);
    expect(e?.moyenne).toBeGreaterThan(-0.03);
  });

  it("rien n'a bougé : le milieu, pâle", () => {
    expect(partDuDegrade(0, FICHE, station())).toBeCloseTo(0.5, 10);
    const [, saturation, clarte] = FICHE.teinte(0.5);
    expect(saturation).toBeLessThan(10);
    expect(clarte).toBeGreaterThan(90);
  });

  it("l'acidifié est orangé comme l'acide du pH, le remonté bleuté comme le calcaire", () => {
    const st = station();
    const [teinteAcide] = FICHE.teinte(partDuDegrade(-0.5, FICHE, st));
    const [teinteRemonte] = FICHE.teinte(partDuDegrade(0.5, FICHE, st));
    const [teintePhAcide] = ficheDuCalque("ph").teinte(0);
    expect(teinteAcide).toBe(teintePhAcide);
    expect(teinteRemonte).toBeGreaterThan(180);
  });

  it("un dixième de pH se voit déjà, sans attendre qu'il soit trop tard", () => {
    // Une échelle droite sur ±1 laissait un dixième au vingtième du chemin vers
    // le bout, dans le blanc du milieu. La racine le met au tiers.
    const part = partDuDegrade(-0.1, FICHE, station());
    expect(0.5 - part).toBeGreaterThan(0.15);
    const [, saturation] = FICHE.teinte(part);
    expect(saturation).toBeGreaterThan(20);
  });

  it("les deux bornes sont des seuils, et l'eau libre prime", () => {
    expect(FICHE.borneBasseOuverte).toBe(true);
    expect(FICHE.borneHauteOuverte).toBe(true);
    const enEau = new Array<boolean>(N).fill(false);
    enEau[2] = true;
    const { arrivee, maintenant } = solQuiABouge();
    expect(couleurDeLaCellule(FICHE, maintenant, station(arrivee, enEau), 2)).toEqual(
      TEINTE_EAU_LIBRE,
    );
  });

  it("l'écart s'écrit avec son signe, et zéro sans signe", () => {
    expect(FICHE.format(-0.351)).toBe("−0.35");
    expect(FICHE.format(0.12)).toBe("+0.12");
    expect(FICHE.format(-0.001)).toBe("0.00");
    expect(ecartSigne(-3.14, 1)).toBe("−3.1");
  });
});

describe("le tableau « Depuis votre arrivée »", () => {
  it("chaque grandeur suivie, maintenant, à l'arrivée et l'écart", () => {
    const { arrivee, maintenant } = solQuiABouge();
    const lignes = solDepuisLArrivee(maintenant, station(arrivee), N);
    expect(lignes?.map((l) => l.id)).toEqual(["ph", "humus", "azote", "phosphore", "potassium"]);
    const humus = lignes?.find((l) => l.id === "humus");
    expect(humus?.maintenant).toBe(SNAPSHOT.inventory.humusTHa.toFixed(1));
    expect(humus?.aLArrivee).toBe((SNAPSHOT.inventory.humusTHa + 3).toFixed(1));
    expect(humus?.ecart).toBe("−3.0");
    expect(lignes?.find((l) => l.id === "phosphore")?.ecart).toBe("−2.0");
    expect(lignes?.find((l) => l.id === "potassium")?.ecart).toBe("0");
  });

  it("le pH dit ce que la moyenne cache : la cellule qui a perdu 0,7", () => {
    const { arrivee, maintenant } = solQuiABouge();
    const ph = solDepuisLArrivee(maintenant, station(arrivee), N)?.find((l) => l.id === "ph");
    expect(ph?.ecart).toBe("−0.02");
    expect(ph?.selonLaCellule).toEqual({ bas: "−0.70", haut: "−0.01" });
  });

  it("l'azote minéral porte sa mise en garde : il suit les saisons", () => {
    const { arrivee, maintenant } = solQuiABouge();
    const azote = solDepuisLArrivee(maintenant, station(arrivee), N)?.find((l) => l.id === "azote");
    expect(azote?.note).toContain("saisons");
    expect(azote?.note).toContain("janvier");
  });

  it("le phosphore d'une parcelle neuve, pas encore mesuré, se dit « — »", () => {
    const { arrivee, maintenant } = solQuiABouge();
    const sansFlux = { ...maintenant, fluxes: undefined };
    const p = solDepuisLArrivee(sansFlux, station(arrivee), N)?.find((l) => l.id === "phosphore");
    expect(p?.maintenant).toBeUndefined();
    expect(p?.ecart).toBeUndefined();
    expect(p?.aLArrivee).toBeDefined();
  });

  it("sans relevé, pas de tableau : la carte montre l'état seul, comme avant", () => {
    expect(solDepuisLArrivee(SNAPSHOT, station(), N)).toBeUndefined();
  });
});
