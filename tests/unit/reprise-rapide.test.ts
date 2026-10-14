/**
 * **Reprendre une partie sans la rejouer** (#338).
 *
 * Reprendre une sauvegarde rejouait toute la partie, semaine après semaine :
 * 35 s pour une friche de vingt ans, 276 s pour une lande sèche, mesuré à la
 * recette v0.4. La sauvegarde emporte maintenant un bloc de reprise — l'état
 * de la semaine ouverte et ce que le worker tient à côté (`reprise.ts`) — et
 * la reprise repart de lui s'il se relit.
 *
 * Ces épreuves passent par le **worker lui-même**, avec les messages que
 * l'interface envoie, et défendent trois promesses :
 *
 *  - la reprise depuis le bloc rend **la partie quittée**, et la même que la
 *    reprise par le journal — état, cumul, bilan, histoire des arbres —, et
 *    les deux continuent de même ;
 *  - un bloc qu'on ne sait pas relire, quelle qu'en soit la raison, rend la
 *    main au journal sans rien casser ;
 *  - une semaine ramenée sous le plafond (#133) oublie aussi ce que ses gestes
 *    avaient écrit dans l'histoire des arbres — condition pour que le bloc
 *    emporte l'histoire telle qu'elle était à l'ouverture de la semaine.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SANS_EAU } from "../../src/engine/eau_surface";
import { bordersUniformes } from "../../src/engine/paysage";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { FromWorker, SaveGame, Snapshot } from "../../src/game/protocol";
import { lireReprise } from "../../src/game/reprise";
import type { LigneDeSuivi } from "../../src/game/suivis";

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

interface Sauvegarde {
  save: SaveGame;
  etat?: Uint8Array;
}

/** Ce que fait le fil principal : la sauvegarde passe par le JSON, le bloc par IndexedDB. */
function sauvegarder(): Sauvegarde {
  const n = recus.length;
  envoyer({ type: "requestSave" });
  const m = recus.slice(n).find((r) => r.type === "save");
  if (m?.type !== "save") throw new Error("pas de sauvegarde");
  return {
    save: JSON.parse(JSON.stringify(m.save)) as SaveGame,
    ...(m.etat ? { etat: m.etat.slice() } : {}),
  };
}

/**
 * Reprendre ; rend vrai si le worker a rejoué. Il le dit en faisant avancer la
 * barre de chargement, que la reprise depuis le bloc n'a pas besoin d'afficher.
 */
function reprendre(save: SaveGame, etat?: Uint8Array): boolean {
  const n = recus.length;
  envoyer(etat ? { type: "resume", save, etat: etat.slice() } : { type: "resume", save });
  envoyer({ type: "autoHarvest", enabled: true });
  return recus.slice(n).some((r) => r.type === "progress");
}

/** Avancer de `n` semaines comme le bouton « +1 mois » : par l'horloge du worker. */
function avancer(n: number): void {
  envoyer({ type: "avancerDe", semaines: n, weeksPerSecond: 52, libelle: "" });
  vi.advanceTimersByTime(100 * Math.ceil(n / 5) + 300);
}

function histoire(id: number): LigneDeSuivi[] {
  const n = recus.length;
  envoyer({ type: "histoire", id });
  const m = recus.slice(n).find((r) => r.type === "histoire");
  if (m?.type !== "histoire") throw new Error("pas d'histoire");
  return m.evenements;
}

/**
 * Ce que le bloc emporte, relu : l'état du moteur et ce que le worker tient à
 * côté. La station de base suffit à le relire — le paysage choisi ne change ni
 * la taille de la parcelle ni son profil, donc ni la forme des grilles.
 */
function relu(s: Sauvegarde) {
  if (!s.etat) throw new Error("sauvegarde sans bloc");
  const r = lireReprise(s.etat, s.save, FRICHE_LIMON.station);
  if (!r) throw new Error("bloc illisible");
  return r;
}

/** Ce qui doit être identique entre la partie quittée et la partie reprise, à l'écran. */
const resume = (s: Snapshot) => ({
  week: s.week,
  arbres: s.trees.map((t) => `${t.id}:${t.especeId}:${t.x}:${t.y}:${t.heightM}`),
  tresorerie: s.economy.treasuryEur,
  heures: s.economy.hoursUsedWeek,
});

/** Où commence le bloc du moteur dans un bloc de reprise (`ecrireReprise`). */
function debutDuMoteur(bloc: Uint8Array): number {
  const longueur = new DataView(bloc.buffer, bloc.byteOffset).getUint32(10);
  return Math.ceil((14 + longueur) / 8) * 8;
}

let quittee: Sauvegarde;
let instantaneQuitte: Snapshot;
/** Les trois tiges abattues pendant la partie. */
let abattues: number[] = [];

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
    seed: 3,
    meteo: "synthetique",
    scenario: "ssp245",
    bordures: bordersUniformes("bocage"),
    relief: FRICHE_LIMON.station.relief,
    eau: SANS_EAU,
    nappeCm: FRICHE_LIMON.station.profondeurNappeEquilibreCm ?? 300,
    partBassin: 0,
    // Une année de vieillissement : le point zéro du carbone se fige à
    // l'arrivée (#202), et la parcelle a déjà une histoire (#225).
    maturationAns: 1,
    anneeDepart: 2026,
    economie: true,
    faune: true,
  });
  envoyer({ type: "autoHarvest", enabled: true });
  avancer(8);
  envoyer({
    type: "action",
    action: {
      type: "planter",
      week: 0,
      especeId: "malus_domestica",
      positions: [
        { x: 20.5, y: 20.5 },
        { x: 25.5, y: 20.5 },
        { x: 30.5, y: 20.5 },
      ],
      avecManchon: true,
    },
  });
  avancer(20);
  // Abattre les trois plus hautes tiges : un geste sur des arbres qui ont une
  // histoire, et qui quittent la parcelle.
  abattues = [...dernierInstantane().trees]
    .sort((a, b) => b.heightM - a.heightM)
    .slice(0, 3)
    .map((t) => t.id);
  envoyer({
    type: "action",
    action: { type: "couper", week: 0, treeIds: abattues, devenir: "vendre" },
  });
  avancer(30);
  // Un geste dans la semaine ouverte, puis quitter (#336).
  envoyer({
    type: "action",
    action: {
      type: "planter",
      week: 0,
      especeId: "corylus_avellana",
      positions: [{ x: 10.5, y: 40.5 }],
    },
  });
  instantaneQuitte = dernierInstantane();
  quittee = sauvegarder();
});

afterAll(() => {
  vi.useRealTimers();
  globaux.self = avant.self;
  globaux.postMessage = avant.postMessage;
});

describe("la sauvegarde emporte son bloc de reprise", () => {
  it("avec la première sauvegarde de chaque semaine, et pas avec les suivantes", () => {
    expect(quittee.etat).toBeDefined();
    expect(quittee.save.weeks).toBe(instantaneQuitte.week);
    // L'interface demande une sauvegarde après chaque geste : le bloc, qui ne
    // dépend pas des gestes de la semaine, ne repart pas à chaque fois.
    expect(sauvegarder().etat).toBeUndefined();
    avancer(1);
    expect(sauvegarder().etat).toBeDefined();
  });
});

describe("reprendre depuis le bloc", () => {
  it("ne rejoue rien, et rend la partie quittée à l'octet près", () => {
    expect(reprendre(quittee.save, quittee.etat)).toBe(false);
    expect(resume(dernierInstantane())).toEqual(resume(instantaneQuitte));
    // Le bloc de la partie reprise est celui de la partie quittée : l'état, le
    // cumul, le bilan, l'histoire des arbres, rien n'a bougé d'un bit.
    const reprise = sauvegarder();
    expect(reprise.save).toEqual(quittee.save);
    expect(reprise.etat).toEqual(quittee.etat);
  });

  it("rend la même partie que la reprise par le journal", () => {
    expect(reprendre(quittee.save)).toBe(true);
    expect(resume(dernierInstantane())).toEqual(resume(instantaneQuitte));
    const rejouee = relu(sauvegarder());
    const quitteeRelue = relu(quittee);
    // L'état complet, point zéro du carbone compris : le rejeu ne le figeait
    // pas après le vieillissement, et la comparaison l'a montré.
    expect(rejouee.etat).toEqual(quitteeRelue.etat);
    expect(rejouee.annexes.cumuls).toEqual(quitteeRelue.annexes.cumuls);
    expect(rejouee.annexes.bilan).toEqual(quitteeRelue.annexes.bilan);
    // L'histoire des arbres : le rejeu écrivait « a quitté la parcelle » après
    // « abattu », parce qu'il comptait la semaine d'un bloc avec les arbres
    // d'avant les gestes. La partie vécue ne l'écrit pas.
    expect(rejouee.annexes.histoires).toEqual(quitteeRelue.annexes.histoires);
    expect(rejouee.annexes.memoire).toEqual(quitteeRelue.annexes.memoire);
    for (const id of abattues) {
      const lignes = quitteeRelue.annexes.histoires.get(id) ?? [];
      expect(lignes.at(-1)?.texte).toBe("abattu");
    }
  });

  it("et les deux continuent de même", () => {
    reprendre(quittee.save, quittee.etat);
    avancer(10);
    const depuisLeBloc = sauvegarder();
    const ecranBloc = resume(dernierInstantane());
    reprendre(quittee.save);
    avancer(10);
    const depuisLeJournal = sauvegarder();
    expect(resume(dernierInstantane())).toEqual(ecranBloc);
    expect(relu(depuisLeBloc)).toEqual(relu(depuisLeJournal));
  });
});

describe("un bloc qu'on ne sait pas relire rend la main au journal", () => {
  const station = () => FRICHE_LIMON.station;

  it("tronqué, illisible, d'un autre format, d'une autre semaine, d'une autre partie, altéré", () => {
    const bloc = quittee.etat as Uint8Array;
    const save = quittee.save;
    expect(lireReprise(bloc, save, station())).toBeDefined();

    expect(lireReprise(bloc.slice(0, bloc.length / 2), save, station())).toBeUndefined();
    expect(lireReprise(bloc.slice(0, 10), save, station())).toBeUndefined();
    expect(lireReprise(new Uint8Array(0), save, station())).toBeUndefined();
    expect(lireReprise(new Uint8Array(4096).fill(7), save, station())).toBeUndefined();

    // Le conteneur d'une version que ce code ne connaît pas.
    const autreConteneur = bloc.slice();
    new DataView(autreConteneur.buffer).setUint16(8, 99);
    expect(lireReprise(autreConteneur, save, station())).toBeUndefined();

    // Le bloc du moteur d'un format que le moteur refuse : c'est ce qui arrive à
    // toutes les sauvegardes quand il change de format sans savoir relire
    // l'ancien. Le format 1, refusé depuis #203 (`serialisation.ts`), et non
    // « la version d'avant » : celle-là, une montée peut choisir de la relire.
    const ancienMoteur = bloc.slice();
    new DataView(ancienMoteur.buffer).setUint16(debutDuMoteur(bloc) + 8, 1);
    expect(lireReprise(ancienMoteur, save, station())).toBeUndefined();

    // Un autosave plus ancien que la sauvegarde : IndexedDB n'a pas suivi.
    expect(lireReprise(bloc, { ...save, weeks: save.weeks + 1 }, station())).toBeUndefined();

    // Une autre partie : réglages ou actions des semaines closes différents.
    expect(lireReprise(bloc, { ...save, seed: save.seed + 1 }, station())).toBeUndefined();
    expect(
      lireReprise(bloc, { ...save, actions: save.actions.slice(1) }, station()),
    ).toBeUndefined();
    // … mais un geste de plus dans la semaine ouverte ne change pas le bloc :
    // il est rejoué depuis la sauvegarde.
    const encore = { ...save.actions.at(-1), week: save.weeks } as SaveGame["actions"][number];
    expect(
      lireReprise(bloc, { ...save, actions: [...save.actions, encore] }, station()),
    ).toBeDefined();

    // Un état altéré : un chiffre changé dans les arbres, que l'empreinte voit.
    const altere = bloc.slice();
    const texte = new TextDecoder("latin1").decode(altere);
    const ou = texte.indexOf('"heightM":', debutDuMoteur(bloc)) + '"heightM":'.length;
    expect(ou).toBeGreaterThan(debutDuMoteur(bloc));
    altere[ou] = altere[ou] === 0x31 ? 0x32 : 0x31;
    expect(lireReprise(altere, save, station())).toBeUndefined();
  });

  it("et la reprise rejoue alors, sans exception, la même partie", () => {
    const tronque = (quittee.etat as Uint8Array).slice(0, 5000);
    expect(reprendre(quittee.save, tronque)).toBe(true);
    expect(resume(dernierInstantane())).toEqual(resume(instantaneQuitte));
  });
});

describe("une semaine ramenée sous le plafond oublie l'histoire de ses gestes (#133)", () => {
  it("l'arbre qu'on n'a finalement pas abattu n'est pas « abattu » dans son histoire", () => {
    reprendre(quittee.save, quittee.etat);
    const semaine = dernierInstantane().week;
    const debout = [...dernierInstantane().trees].sort((a, b) => b.heightM - a.heightM)[0];
    if (!debout) throw new Error("aucun arbre");
    const abattuCetteSemaine = () =>
      histoire(debout.id).some((l) => l.texte === "abattu" && l.semaine >= semaine);

    // Une haie de quatre-vingts plants, puis l'abattage : la semaine dépasse
    // les soixante heures (un plant coûte une heure, `PLANT_HOURS`).
    const haie = Array.from({ length: 80 }, (_, k) => ({
      x: 2.5 + (k % 40) * 1.2,
      y: 47.5 - Math.floor(k / 40) * 1.5,
    }));
    envoyer({
      type: "action",
      action: { type: "planter", week: 0, especeId: "crataegus_monogyna", positions: haie },
    });
    envoyer({
      type: "action",
      action: { type: "couper", week: 0, treeIds: [debout.id], devenir: "vendre" },
    });
    // La fiche voit le geste tout de suite, sans attendre la fin de la semaine.
    expect(abattuCetteSemaine()).toBe(true);

    const n = recus.length;
    avancer(1);
    const facture = recus.slice(n).find((r) => r.type === "facture");
    expect(facture?.type).toBe("facture");
    envoyer({ type: "reglerFacture", embaucher: false });
    expect(dernierInstantane().trees.some((t) => t.id === debout.id)).toBe(true);
    expect(abattuCetteSemaine()).toBe(false);
    // Et la semaine se ferme sans le réécrire.
    avancer(1);
    expect(dernierInstantane().week).toBe(semaine + 1);
    expect(abattuCetteSemaine()).toBe(false);
  });
});
