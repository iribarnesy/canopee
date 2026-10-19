/**
 * **Une parcelle vieillie ne revit pas son vieillissement** (#348).
 *
 * `faireVieillir` simule les années d'avant l'arrivée du joueur sur la série
 * observée depuis son début, puis remet le compteur de semaines à zéro. La
 * partie relisait ensuite la série depuis son début, et tirait la rafale sur ce
 * même compteur : le joueur revivait, une à une, les sécheresses, les hivers et
 * les tempêtes que la parcelle venait de traverser sans lui.
 *
 * Le compteur du joueur repart toujours de zéro, c'est son an 1. Le temps qu'il
 * fait, lui, continue : la météo de la partie porte la semaine continue
 * (`WeekWeather.semaineContinue`), et la rafale se tire sur elle.
 *
 * L'essai passe par le **worker** : c'est lui qui tient la série et le
 * vieillissement. Il mesure deux choses :
 *
 *  - la météo, sans rien espionner : une parcelle vieillie d'un an qui démarre
 *    en 2026 doit voir, semaine après semaine, le temps qu'une parcelle neuve
 *    démarrée en 2025 voit un an plus tard ;
 *  - la rafale, en relevant la semaine sur laquelle `tick` la tire : un
 *    enrobage de `rafaleDeLaSemaine` qui rend ce qu'elle rend.
 *
 * Et les dates que l'état garde du vieillissement : elles se comptent dans le
 * compte du joueur, négatives puisqu'elles précèdent son arrivée (#397). Les
 * autres tirages qui suivent la rafale sont éprouvés au tick
 * (`tirages-du-temps.test.ts`), les dates une à une dans `dates-de-l-etat.test.ts`.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SANS_EAU } from "../../src/engine/eau_surface";
import type { WeekWeather } from "../../src/engine/meteo";
import { bordersUniformes } from "../../src/engine/paysage";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { FromWorker, Snapshot, SnapshotTree } from "../../src/game/protocol";

/** Les semaines sur lesquelles la rafale a été tirée, dans l'ordre. */
const semainesDeRafale: number[] = [];

vi.mock("../../src/engine/tempete", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/engine/tempete")>();
  return {
    ...orig,
    rafaleDeLaSemaine: (...a: Parameters<typeof orig.rafaleDeLaSemaine>) => {
      semainesDeRafale.push(a[1]);
      return orig.rafaleDeLaSemaine(...a);
    },
  };
});

const recus: FromWorker[] = [];
let ecoute: ((e: { data: unknown }) => void) | undefined;
const envoyer = (data: unknown) => ecoute?.({ data });
const globaux = globalThis as unknown as Record<string, unknown>;
const avant = { self: globaux.self, postMessage: globaux.postMessage };

const instantanes = (): Snapshot[] =>
  recus.flatMap((m) => (m.type === "snapshot" ? [m.snapshot] : []));

/** Une partie sur la friche du limon, série réelle, sans économie ni faune. */
function partie(maturationAns: number, anneeDepart: number): void {
  recus.length = 0;
  envoyer({
    type: "init",
    stationId: FRICHE_LIMON.station.id,
    seed: 4,
    meteo: "reelle",
    scenario: "ssp245",
    bordures: bordersUniformes("bocage"),
    relief: FRICHE_LIMON.station.relief,
    eau: SANS_EAU,
    nappeCm: FRICHE_LIMON.station.profondeurNappeEquilibreCm ?? 300,
    partBassin: 0,
    maturationAns,
    anneeDepart,
    economie: false,
    faune: false,
  });
  envoyer({ type: "arretSurLesMorts", oui: false });
}

/**
 * Avancer jusqu'à la semaine `cible` à dix semaines par seconde : l'horloge du
 * worker en fait une par battement, et poste un instantané à chacune. Une
 * traversée que le worker interrompt (un événement à montrer) est relancée.
 */
function avancerJusqua(cible: number): void {
  for (let essai = 0; essai < 20; essai++) {
    const semaine = instantanes().at(-1)?.week ?? 0;
    if (semaine >= cible) return;
    envoyer({ type: "avancerDe", semaines: cible - semaine, weeksPerSecond: 10, libelle: "" });
    vi.advanceTimersByTime(100 * (cible - semaine) + 300);
  }
  throw new Error(`la partie n'atteint pas la semaine ${cible}`);
}

/** Le temps de la semaine ouverte, tel que l'instantané le donne, semaine par semaine. */
function tempsParSemaine(): Map<number, WeekWeather> {
  const m = new Map<number, WeekWeather>();
  for (const s of instantanes()) m.set(s.week, structuredClone(s.weather));
  return m;
}

const SEMAINES = 8;
/** Parcelle vieillie d'un an, démarrée en 2026. */
let vieillie: Map<number, WeekWeather>;
let rafaleDuVieillissement: number[];
let rafaleDeLaVieillie: number[];
/** Les arbres de la vieillie à l'arrivée du joueur, semaine 0. */
let arbresALArrivee: SnapshotTree[];
/** Parcelle neuve démarrée en 2025 : son an 2 est l'an 1 de la vieillie. */
let neuveDeLaVeille: Map<number, WeekWeather>;
/** Parcelle neuve démarrée en 2026 : ce que la vieillie relisait avant #348. */
let neuve: Map<number, WeekWeather>;
let rafaleDeLaNeuve: number[];

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

  semainesDeRafale.length = 0;
  partie(1, 2026);
  rafaleDuVieillissement = semainesDeRafale.splice(0);
  arbresALArrivee = structuredClone(instantanes()[0]?.trees ?? []);
  avancerJusqua(SEMAINES);
  vieillie = tempsParSemaine();
  rafaleDeLaVieillie = semainesDeRafale.splice(0);

  partie(0, 2025);
  avancerJusqua(52 + SEMAINES);
  neuveDeLaVeille = tempsParSemaine();
  semainesDeRafale.length = 0;

  partie(0, 2026);
  avancerJusqua(SEMAINES);
  neuve = tempsParSemaine();
  rafaleDeLaNeuve = semainesDeRafale.splice(0);
}, 120_000);

afterAll(() => {
  vi.useRealTimers();
  globaux.self = avant.self;
  globaux.postMessage = avant.postMessage;
});

describe("la partie continue le temps du vieillissement (#348)", () => {
  it("le joueur voit le temps qui suit le vieillissement, pas celui qui l'a commencé", () => {
    // La prémisse : il y a des semaines à comparer, de part et d'autre.
    for (let w = 0; w < SEMAINES; w++) {
      expect(vieillie.has(w), `semaine ${w} de la vieillie`).toBe(true);
      expect(neuveDeLaVeille.has(52 + w), `semaine ${52 + w} de la neuve de 2025`).toBe(true);
    }
    for (let w = 0; w < SEMAINES; w++) {
      // Même année civile, même semaine de la série : le même temps, au bit près.
      expect(vieillie.get(w), `semaine ${w}`).toEqual(neuveDeLaVeille.get(52 + w));
    }
    // Et ce n'est pas le temps qu'elle relisait : celui de l'an 1 d'une
    // parcelle neuve de la même année (même anomalie, première année de la
    // série). Les deux séries de semaines doivent différer.
    const temperatures = (m: Map<number, WeekWeather>, d: number) =>
      Array.from({ length: SEMAINES }, (_, w) => m.get(d + w)?.tMean);
    expect(temperatures(vieillie, 0)).not.toEqual(temperatures(neuve, 0));
  });

  it("la rafale se tire sur la semaine continue, et une parcelle neuve n'y voit aucune différence", () => {
    // Le vieillissement d'un an a tiré ses 52 rafales sur les semaines 0 à 51.
    expect(rafaleDuVieillissement).toEqual(Array.from({ length: 52 }, (_, k) => k));
    // Le joueur arrive à la semaine 0 de son compte, 52 du temps qu'il fait.
    expect(rafaleDeLaVieillie).toEqual(Array.from({ length: SEMAINES }, (_, w) => 52 + w));
    // Sans vieillissement, les deux comptes sont le même : rien ne change.
    expect(rafaleDeLaNeuve).toEqual(Array.from({ length: SEMAINES }, (_, w) => w));
    for (let w = 0; w < SEMAINES; w++) {
      expect(neuve.get(w)?.semaineContinue, `semaine ${w}`).toBe(w);
      expect(vieillie.get(w)?.semaineContinue, `semaine ${w}`).toBe(52 + w);
    }
  });
});

describe("les dates du vieillissement sont comptées dans le compte du joueur (#397)", () => {
  it("toutes précèdent son arrivée, et aucune n'est plus vieille que le vieillissement", () => {
    const dates = [
      "mortSemaine",
      "renverseSemaine",
      "brulEeSemaine",
      "frotteSemaine",
      "brouteSemaine",
      "derniereLeveeSemaine",
    ] as const;
    const trouvees = arbresALArrivee.flatMap((a) =>
      dates.flatMap((champ) => (a[champ] === undefined ? [] : [{ champ, semaine: a[champ] }])),
    );
    // La prémisse : un an de friche laisse des marques — des semis broutés au moins.
    expect(trouvees.length).toBeGreaterThan(0);
    // Le vieillissement d'un an a duré les semaines −52 à −1 du compte du
    // joueur. Une date positive dirait qu'elle est encore à venir : c'était le
    // défaut, une chandelle du vieillissement y tenait debout un an de trop.
    for (const { champ, semaine } of trouvees) {
      expect(semaine, champ).toBeGreaterThanOrEqual(-52);
      expect(semaine, champ).toBeLessThan(0);
    }
  });
});
