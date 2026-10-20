/**
 * **Les grandeurs du dernier tick montrent le présent, et rien que lui** (#387).
 *
 * Le worker garde à côté de l'état ce que la dernière semaine simulée a mesuré :
 * la crue, la lumière au sol, les insectes, les oiseaux de passage. Elles ne
 * sont pas dans l'état, et elles se **gardent** d'un instantané à l'autre : une
 * action reçue en pause en déclenche un sans qu'aucune semaine n'ait tourné.
 * La sonde de la recette v0.4 (#338) les a prises en faute deux fois :
 *
 * 1. un abattage en pause, et l'instantané nommait encore l'arbre abattu parmi
 *    ceux qui attirent les oiseaux de passage ;
 * 2. une relecture arrêtée en route, et le présent retrouvé montrait la crue, la
 *    lumière et les insectes de la semaine relue.
 *
 * L'essai passe par le **worker lui-même**, avec les messages de l'interface :
 * c'est lui qui tient ces grandeurs, et aucun essai du moteur ne pouvait le voir.
 * Une seule partie pour les quatre cas, qui se suivent : la vieillir coûte
 * l'essentiel du temps. Le dernier vient de #393 : le premier instantané d'une
 * relecture montrait les grandeurs du présent sur la semaine relue.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SANS_EAU } from "../../src/engine/eau_surface";
import { bordersUniformes } from "../../src/engine/paysage";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { FromWorker, SaveGame, Snapshot } from "../../src/game/protocol";

const recus: FromWorker[] = [];
let ecoute: ((e: { data: unknown }) => void) | undefined;
const envoyer = (data: unknown) => ecoute?.({ data });
const globaux = globalThis as unknown as Record<string, unknown>;
const avant = { self: globaux.self, postMessage: globaux.postMessage };

function dernierInstantane(): Snapshot {
  for (let i = recus.length - 1; i >= 0; i--) {
    const m = recus[i];
    if (m?.type === "snapshot") return m.snapshot;
  }
  throw new Error("aucun instantané");
}

/** Avancer de `n` semaines comme le bouton « +1 mois » : par l'horloge du worker. */
function avancer(n: number): void {
  envoyer({ type: "avancerDe", semaines: n, weeksPerSecond: 52, libelle: "" });
  vi.advanceTimersByTime(100 * Math.ceil(n / 5) + 300);
}

/** Une empreinte exacte d'une grille : l'écart se lit en une ligne, pas en 2 500. */
function empreinte(grille: Float32Array): string {
  let h = 2166136261;
  for (const mot of new Uint32Array(Float32Array.from(grille).buffer)) {
    h = Math.imul(h ^ mot, 16777619);
  }
  return `${grille.length}:${(h >>> 0).toString(16)}`;
}

/**
 * Ce que l'instantané porte du dernier tick, **copié** : le faux `postMessage`
 * de l'essai ne clone pas, à la différence du vrai.
 */
const grandeurs = (s: Snapshot) => ({
  debordement: empreinte(s.soilDebordementMm),
  lumiere: empreinte(s.soilLumiere),
  pollinisateurs: empreinte(s.soilPollinisateurs),
  oiseaux: structuredClone(s.oiseauxDePassage),
  fluxes: structuredClone(s.fluxes),
  // La soif de chaque arbre (#372) : une grandeur du tick comme les autres, qui
  // doit suivre le présent après une relecture et revenir avec la sauvegarde.
  soif: s.trees.flatMap((t) =>
    t.satisfactionEau === undefined ? [] : [`${t.id}:${t.satisfactionEau}`],
  ),
});

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
  envoyer({
    type: "init",
    stationId: FRICHE_LIMON.station.id,
    seed: 7,
    meteo: "synthetique",
    scenario: "ssp245",
    bordures: bordersUniformes("bocage"),
    relief: FRICHE_LIMON.station.relief,
    eau: SANS_EAU,
    nappeCm: FRICHE_LIMON.station.profondeurNappeEquilibreCm ?? 300,
    partBassin: 0,
    // Une friche de trois ans : des fourrés de plus d'un mètre, donc des
    // passereaux de haie posés sur une vingtaine d'arbres nommés (mesuré).
    maturationAns: 3,
    anneeDepart: 2026,
    economie: false,
    faune: true,
  });
});

afterAll(() => {
  vi.useRealTimers();
  globaux.self = avant.self;
  globaux.postMessage = avant.postMessage;
});

describe("les grandeurs du dernier tick (#387)", () => {
  it("un abattage en pause ne laisse pas d'oiseau sur un arbre abattu", () => {
    avancer(10);
    const avantLaCoupe = dernierInstantane();
    const guildes = avantLaCoupe.oiseauxDePassage ?? [];
    const nommes = [...new Set(guildes.flatMap((g) => g.arbres))];
    // Sans arbre nommé, l'essai ne prouverait rien.
    expect(nommes.length).toBeGreaterThanOrEqual(5);

    // En pause : abattre cinq des arbres qui attirent les oiseaux.
    const abattus = nommes.slice(0, 5);
    envoyer({
      type: "action",
      action: { type: "couper", week: 0, treeIds: abattus, devenir: "vendre" },
    });
    const apres = dernierInstantane();
    expect(apres.week).toBe(avantLaCoupe.week);
    expect(apres.refusals).toEqual([]);
    const debout = new Set(apres.trees.filter((t) => !t.chandelle).map((t) => t.id));
    expect(debout.size).toBeGreaterThan(0);
    for (const id of abattus) expect(debout.has(id), `arbre ${id} abattu`).toBe(false);

    // Plus aucun arbre nommé qui ne soit pas debout dans l'instantané…
    for (const g of apres.oiseauxDePassage ?? []) {
      for (const id of g.arbres) expect(debout.has(id), `arbre ${id}`).toBe(true);
    }
    // …mais la fréquentation n'est **pas** recalculée : c'est une règle du
    // moteur, et elle reste celle de la dernière semaine simulée.
    expect(apres.oiseauxDePassage).toEqual(
      guildes.map((g) => ({ ...g, arbres: g.arbres.filter((id) => !abattus.includes(id)) })),
    );
  });

  it("une relecture arrêtée en route rend les grandeurs du présent, et la sauvegarde aussi", () => {
    avancer(30);
    const present = dernierInstantane();
    expect(present.week).toBeGreaterThanOrEqual(36);
    const duPresent = grandeurs(present);
    // Des arbres qui ont une soif mesurée : sans eux, la comparaison ne dirait rien.
    expect(duPresent.soif.length).toBeGreaterThan(10);

    // Revoir depuis une vingtaine de semaines, et revenir en route.
    envoyer({ type: "relire", deSemaine: present.week - 20, weeksPerSecond: 10 });
    vi.advanceTimersByTime(300);
    const relu = dernierInstantane();
    expect(relu.week).toBeLessThan(present.week - 10);
    // La relecture a bien écrasé les grandeurs : sans ça, l'essai ne prouverait rien.
    expect(grandeurs(relu)).not.toEqual(duPresent);

    envoyer({ type: "arreterLaRelecture" });
    const retour = dernierInstantane();
    expect(retour.week).toBe(present.week);
    expect(grandeurs(retour)).toEqual(duPresent);

    // Une sauvegarde prise à cet instant se reprend avec les grandeurs du présent.
    const n = recus.length;
    envoyer({ type: "requestSave" });
    const m = recus.slice(n).find((r) => r.type === "save");
    if (m?.type !== "save") throw new Error("pas de sauvegarde");
    const save = JSON.parse(JSON.stringify(m.save)) as SaveGame;
    envoyer({ type: "resume", save });
    const reprise = dernierInstantane();
    expect(reprise.week).toBe(present.week);
    expect(grandeurs(reprise)).toEqual(duPresent);
  });

  it("une relecture menée à son terme rend aussi les grandeurs du présent", () => {
    // La reprise n'a gardé aucun point de retour : on en passe un, en semaine 52.
    avancer(56 - dernierInstantane().week);
    const present = dernierInstantane();
    expect(present.week).toBe(56);
    const duPresent = grandeurs(present);
    const n = recus.length;
    envoyer({ type: "relire", deSemaine: 52, weeksPerSecond: 52 });
    vi.advanceTimersByTime(1000);
    const relectures = recus.slice(n).filter((r) => r.type === "relecture");
    expect(relectures[0]).toMatchObject({ enCours: true, depuis: 52 });
    expect(relectures.at(-1)).toMatchObject({ enCours: false });
    const retour = dernierInstantane();
    expect(retour.week).toBe(present.week);
    expect(grandeurs(retour)).toEqual(duPresent);
  });

  it("le premier instantané d'une relecture porte les grandeurs de sa semaine (#393)", () => {
    // Vivre semaine par semaine jusqu'au-delà du point de retour de la semaine
    // 78, en notant ce que chaque instantané montrait.
    const vecues = new Map<number, ReturnType<typeof grandeurs>>();
    while (dernierInstantane().week < 84) {
      avancer(1);
      const s = dernierInstantane();
      vecues.set(s.week, grandeurs(s));
    }
    // Pile sur le point de retour : rien à rattraper, et il fallait donc que le
    // point garde lui-même ses grandeurs. Puis entre deux points : la semaine
    // rattrapée en silence laisse les siennes.
    for (const deSemaine of [78, 80]) {
      envoyer({ type: "relire", deSemaine, weeksPerSecond: 1 });
      const premier = dernierInstantane();
      expect(premier.week).toBe(deSemaine);
      expect(grandeurs(premier), `semaine ${deSemaine}`).toEqual(vecues.get(deSemaine));
      envoyer({ type: "arreterLaRelecture" });
      expect(dernierInstantane().week).toBe(84);
    }
  });
});
