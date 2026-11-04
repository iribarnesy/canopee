/**
 * **Une vernale juge sa station sur sa saison** (#468).
 *
 * Une géophyte vernale fait sa matière pendant que ses feuilles sont sorties et
 * la range dans son rhizome : ce qu'elle peut tenir se lit sur la saison
 * entière. Jugée sur la lumière de chaque semaine, elle l'était en fait sur la
 * pire, celle d'après le débourrement du hêtre, et son tapis se réglait sur mai
 * (herbacees.ts). On vérifie ici la règle elle-même, sur des saisons écrites à
 * la main, et la relecture d'un bloc de sauvegarde de version 15.
 */

import { describe, expect, it } from "vitest";
import {
  capaciteHerbacee,
  HERBACEES,
  type HerbaceeV0,
  JUGE_SA_SAISON,
  lumiereJugee,
  N_HERBACEES,
  poidsDeSaison,
} from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ecrireEtat, lireEtat, VERSION_FORMAT } from "../../src/engine/serialisation";
import { createGameState, type GameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";

function espece(id: string): HerbaceeV0 {
  const h = HERBACEES.find((e) => e.id === id);
  if (!h) throw new Error(`espèce herbacée inconnue : ${id}`);
  return h;
}

const ANEMONE = espece("anemone_nemorosa");

/** Joue une saison sur une cellule : la lumière jugée chaque semaine. */
function saison(lumieres: readonly number[], vigueurs: readonly number[]): number[] {
  const sommes = new Float32Array(1);
  let poids = 0;
  return lumieres.map((l, s) => {
    const v = vigueurs[s] ?? 0;
    poids = poidsDeSaison(poids, v);
    return lumiereJugee(sommes, 0, poids, v, l);
  });
}

describe("la lumière d'une saison", () => {
  it("est la moyenne des semaines de la saison, pondérée par la vigueur", () => {
    const jugees = saison([0.8, 0.5, 0.2], [0.5, 1, 1]);
    expect(jugees[0]).toBeCloseTo(0.8, 6);
    expect(jugees[1]).toBeCloseTo((0.5 * 0.8 + 0.5) / 1.5, 6);
    expect(jugees[2]).toBeCloseTo((0.5 * 0.8 + 0.5 + 0.2) / 2.5, 6);
  });

  it("s'efface quand l'espèce dort, et la saison suivante repart de sa première semaine", () => {
    const jugees = saison([0.9, 0.9, 0.1, 0.2], [1, 1, 0, 1]);
    // Dormante, elle ne juge rien : la lumière rendue est celle de la semaine.
    expect(jugees[2]).toBe(0.1);
    // La saison suivante ne garde rien de la précédente.
    expect(jugees[3]).toBeCloseTo(0.2, 6);
  });

  it("sous un hêtre qui se feuille avant qu'elle ne rentre, mars compte encore en mai", () => {
    // Le calendrier relevé dans le moteur (#468, an 40, 2003) : neuf semaines de
    // pleine vigueur sous le hêtre nu (0,47, les feuilles mortes comprises),
    // puis quatre semaines et demie sous le couvert fermé, au centre d'une
    // couronne (0,05).
    const lumieres = [...new Array(9).fill(0.47), ...new Array(5).fill(0.05)];
    const vigueurs = [...new Array(13).fill(1), 0.55];
    const jugees = saison(lumieres, vigueurs);
    const derniere = jugees[jugees.length - 1] ?? 0;
    // Jugée sur la semaine, elle n'y tiendrait plus que le cinquième du sol ;
    // jugée sur sa saison, elle le tient entier.
    expect(capaciteHerbacee(ANEMONE, 0.05, 6.5)).toBeLessThan(0.2);
    expect(capaciteHerbacee(ANEMONE, derniere, 6.5)).toBe(1);
  });

  it("sous un couvert sombre toute la saison, elle n'a toujours rien", () => {
    // La fenêtre ne se fabrique pas : une saison entière à 4 % reste à 4 %.
    const jugees = saison(new Array(14).fill(0.04), new Array(14).fill(1));
    expect(capaciteHerbacee(ANEMONE, jugees[13] ?? 0, 6.5)).toBeLessThan(0.1);
  });

  it("seules les espèces à retrait programmé jugent leur saison, et aucune culture", () => {
    // C'est le trait `finDJ` qui décide, pas un nom d'espèce.
    for (const [s, h] of HERBACEES.entries()) {
      const attendu = h.phenologie.finDJ !== undefined && h.culture === undefined;
      expect(JUGE_SA_SAISON[s], h.id).toBe(attendu);
    }
    expect(JUGE_SA_SAISON[HERBACEES.indexOf(ANEMONE)]).toBe(true);
  });
});

describe("un bloc de version 15 se relit, la mémoire de saison vide", () => {
  const COTE = 10;
  const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [], gibierParHa: 0 };
  const METEO = syntheticYear(LIMON_RICHE.climat);

  function avancer(s: GameState, semaines: number): GameState {
    let etat = s;
    for (let i = 0; i < semaines; i++) {
      const w = METEO[i % METEO.length];
      if (!w) throw new Error("météo manquante");
      etat = tick(etat, w).state;
    }
    return etat;
  }

  it("les deux grilles arrivent vides, et la partie continue", () => {
    expect(VERSION_FORMAT).toBe(16);
    // Mi-mars : l'anémone est sortie, sa mémoire n'est pas vide.
    const partie = avancer(createGameState(STATION, rngStateFromSeed(3)), 12);
    const iA = HERBACEES.indexOf(ANEMONE);
    expect(partie.soil.herbeVigueurSaison[iA]).toBeGreaterThan(0);
    // Le bloc qu'un moteur de version 15 aurait écrit : le même état sans la
    // mémoire de saison, sous l'ancien numéro.
    const { herbeLumiereSaison: _l, herbeVigueurSaison: _v, ...solV15 } = partie.soil;
    const b = ecrireEtat({ ...partie, soil: solV15 as GameState["soil"] });
    new DataView(b.buffer).setUint16(8, 15);
    const relu = lireEtat(b, STATION);
    if (!relu) throw new Error("le bloc de version 15 aurait dû se relire");
    expect(relu.soil.herbeLumiereSaison).toBeInstanceOf(Float32Array);
    expect(relu.soil.herbeLumiereSaison).toHaveLength(COTE * COTE * N_HERBACEES);
    expect(relu.soil.herbeVigueurSaison).toHaveLength(N_HERBACEES);
    expect(Array.from(relu.soil.herbeVigueurSaison).every((v) => v === 0)).toBe(true);
    expect(Object.keys(relu.soil).sort()).toEqual(Object.keys(partie.soil).sort());
    // La semaine suivante, la mémoire se rouvre sur cette semaine-là.
    const w = METEO[12];
    if (!w) throw new Error("météo manquante");
    const apres = tick(relu, w).state;
    expect(() => stateHash(apres)).not.toThrow();
    expect(apres.soil.herbeVigueurSaison[iA]).toBeGreaterThan(0);
  }, 120_000);

  it("un bloc de version 15 qui porterait déjà la mémoire est refusé", () => {
    const partie = avancer(createGameState(STATION, rngStateFromSeed(3)), 4);
    const b = ecrireEtat(partie);
    new DataView(b.buffer).setUint16(8, 15);
    expect(lireEtat(b, STATION)).toBeUndefined();
  }, 120_000);
});
