/**
 * **Le verger se joue comme un tutoriel, et se gagne à la main** (#514).
 *
 * Le premier niveau se gagnait en deux gestes et neuf « +1 an » : la récolte
 * automatique remplissait seule son dernier palier (état des lieux du
 * 25 novembre 2026, § 4.2). Le propriétaire a tranché le même jour : la
 * récolte automatique est coupée dans les niveaux, qui prennent un tour de
 * tutoriel, et chaque niveau dure de dix à trente minutes.
 *
 * Cet essai joue le niveau **par le worker lui-même**, avec les messages que
 * l'interface envoie, et comme un joueur : il n'appuie que sur les boutons que
 * le niveau montre à cet instant (`gestesOuverts`), il fait avancer le temps
 * par « +1 mois » puis « +1 an », et il cueille quand le temps s'arrête sur
 * des pommes mûres. Il défend quatre choses :
 *
 *  1. les gestes s'ouvrent un à un — planter, puis protéger quand le gibier a
 *     brouté un premier plant, puis récolter quand les premières pommes sont
 *     mûres ;
 *  2. dans un niveau, **rien ne se cueille d'office** : des pommes mûres
 *     restent sur l'arbre tant que le joueur ne les cueille pas ;
 *  3. l'objectif tombe, avant la fin du temps imparti ;
 *  4. il ne tombe pas d'avance : il y faut une cueillette par automne, et
 *     plusieurs automnes.
 *
 * La mesure sur trois graines, et le temps réel dans le navigateur, sont en
 * tête de `niveauxLivres.ts` ; ici, la graine du niveau.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  type Avancement,
  avancementDuNiveau,
  type Cumuls,
  type Geste,
  gesteOuvert,
  gestesOuverts,
  paliersFranchis,
} from "../../src/game/niveaux";
import { niveauParId } from "../../src/game/niveauxLivres";
import type { FromWorker, Snapshot, SnapshotTree } from "../../src/game/protocol";
import { recolteAutoPermise } from "../../src/game/recolteAuto";

const POMMIER = "malus_domestica";
const VERGER = niveauParId("verger");
if (!VERGER) throw new Error("le verger n'est plus livré");
const NIVEAU = VERGER;

const recus: FromWorker[] = [];
let ecoute: ((e: { data: unknown }) => void) | undefined;
const envoyer = (data: unknown) => ecoute?.({ data });
const globaux = globalThis as unknown as Record<string, unknown>;

function dernier(): { snapshot: Snapshot; cumuls: Cumuls } {
  for (let i = recus.length - 1; i >= 0; i--) {
    const m = recus[i];
    if (m?.type === "snapshot") return { snapshot: m.snapshot, cumuls: m.cumuls };
  }
  throw new Error("aucun instantané");
}

/**
 * La mémoire des paliers, comme `useNiveau` la tient : ce qui a été franchi une
 * fois le reste, et l'écran la renvoie au worker.
 */
const acquis = new Set<string>();

function ouLonEnEst(): Avancement {
  const { snapshot, cumuls } = dernier();
  const a = avancementDuNiveau(NIVEAU, { snapshot, cumuls, semaines: snapshot.week }, acquis);
  for (const id of paliersFranchis(a)) acquis.add(id);
  return a;
}

function ouverts(): ReadonlySet<Geste> {
  const g = gestesOuverts(NIVEAU, ouLonEnEst());
  if (!g) throw new Error("le verger déclare ses gestes");
  return g;
}

/** Les boutons du temps, à la vitesse que le bandeau leur donne. */
function avancerDe(semaines: number, weeksPerSecond: number): FromWorker[] {
  const n = recus.length;
  envoyer({ type: "avancerDe", semaines, weeksPerSecond, libelle: "" });
  vi.advanceTimersByTime(Math.ceil((1000 * semaines) / weeksPerSecond) + 300);
  return recus.slice(n);
}
const plusUnMois = () => avancerDe(4, 4);
/** « +1 an » va à ×13 ; ×52 rend la même partie, en moins de pas d'horloge. */
const plusUnAn = () => avancerDe(52, 52);

function pommiers(): SnapshotTree[] {
  return dernier().snapshot.trees.filter((t) => t.especeId === POMMIER && !t.chandelle);
}

function pommesCueillies(): number {
  return dernier().cumuls.fruitsParEspece[POMMIER] ?? 0;
}

/** « Tout récolter » : le bouton de l'avis des fruits mûrs (`Avis.tsx`). */
function toutRecolter(): void {
  const murs = dernier().snapshot.trees.filter((t) => !t.chandelle && t.fruitsKg > 0.5);
  envoyer({ type: "action", action: { type: "recolter", treeIds: murs.map((t) => t.id) } });
}

beforeAll(async () => {
  vi.useFakeTimers();
  globaux.self = {
    addEventListener: (_type: string, fn: (e: { data: unknown }) => void) => {
      ecoute = fn;
    },
    postMessage: (m: FromWorker) => recus.push(m),
  };
  globaux.postMessage = (m: FromWorker) => recus.push(m);
  await import("../../src/game/worker");

  // `lancerLeNiveau` : une partie neuve aux réglages de la fiche — un bac à
  // sable, qui cueille d'office —, puis le niveau qu'on range, qui le coupe
  // (`useGame.rangerLeNiveau`).
  const d = NIVEAU.depart;
  envoyer({
    type: "init",
    stationId: d.stationId,
    seed: NIVEAU.seed,
    meteo: NIVEAU.meteo,
    scenario: d.scenario,
    bordures: d.bordures,
    relief: d.relief,
    eau: d.eau,
    nappeCm: d.nappeCm,
    partBassin: d.partBassinSemblable,
    maturationAns: d.maturationAns,
    anneeDepart: d.anneeDepart,
    economie: NIVEAU.economie,
    faune: true,
  });
  envoyer({ type: "autoHarvest", enabled: true });
  envoyer({ type: "niveau", id: NIVEAU.id, acquis: [] });
  envoyer({ type: "autoHarvest", enabled: recolteAutoPermise(NIVEAU.id) });
});

describe("le verger, joué comme un tutoriel (#514)", () => {
  it("coupe la récolte automatique dans un niveau, et la garde au bac à sable", () => {
    expect(recolteAutoPermise(NIVEAU.id)).toBe(false);
    expect(recolteAutoPermise(undefined)).toBe(true);
  });

  it("n'ouvre d'abord que la plantation, sans la case du manchon", () => {
    expect([...ouverts()]).toEqual(["planter"]);
    // La case du manchon suit le geste « protéger » (#507) : on plante nu.
    const positions = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 2; j++) positions.push({ x: 30.5 + 8 * i, y: 44.5 + 10 * j });
    envoyer({
      type: "action",
      action: { type: "planter", especeId: POMMIER, positions, avecManchon: false },
    });
    expect(pommiers()).toHaveLength(12);
    const a = ouLonEnEst();
    expect(a.courant?.palier.id).toBe("gibier");
    // Le palier d'attente n'ouvre rien : il apprend les boutons du temps.
    expect([...ouverts()]).toEqual(["planter"]);
  });

  it("ouvre la protection quand le gibier a brouté un premier pommier, dans l'année", () => {
    while (ouLonEnEst().courant?.palier.id === "gibier") {
      expect(gesteOuvert(ouverts(), "proteger")).toBe(false);
      expect(dernier().snapshot.week).toBeLessThan(52);
      plusUnMois();
    }
    expect(pommiers().some((t) => t.brouteSemaine !== undefined)).toBe(true);
    expect(ouLonEnEst().courant?.palier.id).toBe("proteger");
    expect(gesteOuvert(ouverts(), "proteger")).toBe(true);
    expect(gesteOuvert(ouverts(), "recolter")).toBe(false);

    // « Les arbres » → Pommier, puis « Protéger ».
    envoyer({
      type: "action",
      action: { type: "proteger", treeIds: pommiers().map((t) => t.id) },
    });
    expect(pommiers().filter((t) => t.protege)).toHaveLength(12);
    expect(ouLonEnEst().courant?.palier.id).toBe("fruits");
  });

  it("laisse les pommes mûres sur l'arbre : rien ne se cueille d'office", () => {
    let pause = false;
    while (ouLonEnEst().courant?.palier.id === "fruits") {
      expect(gesteOuvert(ouverts(), "recolter")).toBe(false);
      expect(dernier().snapshot.week).toBeLessThan(NIVEAU.semainesImparties);
      const vus = plusUnAn();
      pause = vus.some((m) => m.type === "autopause" && m.reason.includes("fruits sont mûrs"));
    }
    // Le temps s'est arrêté sur les pommes mûres, et la récolte s'ouvre.
    expect(pause).toBe(true);
    expect(gesteOuvert(ouverts(), "recolter")).toBe(true);
    const murs = pommiers().filter((t) => t.fruitsKg > 0.5);
    expect(murs.length).toBeGreaterThan(0);
    // **Rien de cueilli** : sur `main`, la récolte automatique les aurait pris.
    expect(pommesCueillies()).toBe(0);
    // Le joueur passe son tour : un an plus tard, les pommes sont tombées, et le
    // compteur n'a pas bougé.
    const semaine = dernier().snapshot.week;
    while (dernier().snapshot.week < semaine + 6) plusUnMois();
    expect(pommiers().every((t) => t.fruitsKg === 0)).toBe(true);
    expect(pommesCueillies()).toBe(0);
  });

  /**
   * Un « +1 an », et la cueillette si le temps s'est arrêté sur des pommes
   * mûres. Rend vrai s'il a fallu cueillir.
   */
  function unAutomne(): boolean {
    expect(dernier().snapshot.week).toBeLessThan(NIVEAU.semainesImparties);
    plusUnAn();
    if (!pommiers().some((t) => t.fruitsKg > 0.5)) return false;
    toutRecolter();
    return true;
  }

  // Deux moitiés, pour que chacune tienne dans le temps d'un essai.
  let cueillettes = 0;

  it("cueille chaque automne, et la tonne ne tombe pas en trois cueillettes", () => {
    while (cueillettes < 3) if (unAutomne()) cueillettes++;
    expect(pommesCueillies()).toBeGreaterThan(0);
    expect(pommesCueillies()).toBeLessThan(1000);
    expect(ouLonEnEst().issue).toBe("en-cours");
  });

  it("se gagne avant la fin du temps imparti", () => {
    let a = ouLonEnEst();
    while (a.issue === "en-cours") {
      if (unAutomne()) cueillettes++;
      a = ouLonEnEst();
    }
    expect(a.issue).toBe("reussi");
    expect(pommesCueillies()).toBeGreaterThanOrEqual(1000);
    // **Pas d'avance** : une tonne demande une cueillette par automne pendant
    // des années, et ne tombe pas avant la dixième année.
    expect(cueillettes).toBeGreaterThanOrEqual(5);
    expect(dernier().snapshot.week).toBeGreaterThan(10 * 52);
  });
});
