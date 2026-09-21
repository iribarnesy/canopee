/**
 * LA NAÏVETÉ AU VENT (issue #177, F18).
 *
 * « Un peuplement qu'on vient d'ouvrir verse pendant quelques années. » Le
 * moteur applique la nouvelle exposition à un arbre réputé instantanément
 * adapté, alors que l'épaississement du fût et de l'ancrage sous la contrainte
 * mécanique se compte en années.
 *
 * Chaque arbre retient donc l'abri sous lequel il a grandi, et c'est la CHUTE
 * entre cette mémoire et l'abri du jour qui le fragilise.
 *
 * **Ce fichier ne teste PAS que l'éclaircie fait verser davantage**, et c'est
 * délibéré : mesuré sur douze graines, le surcroît de ruines n'est pas
 * séparable du bruit (cf. le référentiel, F18). Ce qui est mesurable, et qui
 * l'est très nettement, c'est la naïveté elle-même : son ampleur, sa
 * décroissance, et le fait qu'elle distingue toute seule les deux façons
 * d'éclaircir.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction } from "../../src/engine/actions";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  type GameState,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  abriAuVent,
  facteurNaivete,
  HAUTEUR_SOUPLE_M,
  MEMOIRE_ABRI_ANS,
  memoireDAbri,
  naiveteAuVent,
  PERTE_NAIVETE,
} from "../../src/engine/tempete";
import { tick } from "../../src/engine/tick";

const COTE = 40;
const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
const SERIE = serieMeteoPour(LIMON_RICHE.station.id);
if (!SERIE) throw new Error("série manquante");
const METEO = serieToWeeks(SERIE);
const moyenne = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

describe("ce que la mémoire d'abri sait dire", () => {
  it("elle rattrape la réalité en quelques années, pas en une", () => {
    // Une mémoire qui rattraperait en un an ne serait pas une mémoire.
    let m = 0.8;
    for (let an = 0; an < MEMOIRE_ABRI_ANS; an++) m = memoireDAbri(m, 0);
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(0.4);
    // Et elle converge : au bout de vingt ans il ne reste rien de l'ancien.
    for (let an = 0; an < 15; an++) m = memoireDAbri(m, 0);
    expect(m).toBeLessThan(0.05);
  });

  it("être ABRITÉ ne rend pas naïf : le plancher est à zéro", () => {
    // Le cas symétrique, et il doit être inerte. Un arbre qu'un voisin vient
    // de protéger n'est pas fragile, il est mieux protégé.
    expect(naiveteAuVent(0.2, 0.9)).toBe(0);
    expect(naiveteAuVent(0.9, 0.2)).toBeCloseTo(0.7, 12);
    // Et un arbre sans mémoire — un semis qui n'a pas vu passer un 1ᵉʳ janvier
    // — n'est pas naïf non plus.
    expect(naiveteAuVent(undefined, 0)).toBe(0);
  });

  it("la pénalité est bornée, et nulle sans naïveté", () => {
    expect(facteurNaivete(0)).toBe(1);
    expect(facteurNaivete(1)).toBeCloseTo(1 - PERTE_NAIVETE, 12);
    expect(facteurNaivete(0.5)).toBeGreaterThan(facteurNaivete(1));
  });
});

/** Quarante ans de pins, puis une éclaircie, et ce qu'il en reste. */
function apresEclaircie(critere: "parLeBas" | "parLeHaut", ans = 40) {
  let s: GameState = plantScattered(
    createGameState(STATION, rngStateFromSeed(7)),
    "pinus_sylvestris",
    600,
  );
  for (let i = 0; i < ans * 52; i++) {
    const w = METEO[i % METEO.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  s = applyAction(s, {
    type: "eclaircir",
    week: ans * 52,
    x: COTE / 2,
    y: COTE / 2,
    rayonM: COTE,
    densiteCibleParHa: 250,
    critere,
    devenir: "laisser",
  }).state;
  const naivete = (etat: GameState) => {
    const v = etat.trees.filter((t) => t.alive && t.heightM > HAUTEUR_SOUPLE_M);
    return moyenne(v.map((t) => naiveteAuVent(t.abriHabituel, abriAuVent(etat.trees, t))));
  };
  return { etat: s, naivete, debut: ans * 52 };
}

describe("en partie : la naïveté distingue les deux façons d'éclaircir", () => {
  it("par le HAUT, elle est massive ; par le BAS, elle est nulle", () => {
    // LE RÉSULTAT QU'ON N'A PAS ÉCRIT, et le plus instructif du lot. Une
    // éclaircie par le bas retire les dominés et garde les DOMINANTS — or
    // `abriAuVent` ne compte que les voisins qui DÉPASSENT, donc les dominants
    // n'étaient abrités par personne : ils ne perdent rien, et ils ne
    // deviennent pas naïfs. C'est juste, et c'est exactement la règle
    // sylvicole : ce qui met un peuplement en danger, c'est d'ouvrir par le
    // haut. Relevé 0,589 contre 0,012.
    const haut = apresEclaircie("parLeHaut");
    const bas = apresEclaircie("parLeBas");
    expect(haut.naivete(haut.etat)).toBeGreaterThan(0.3);
    expect(bas.naivete(bas.etat)).toBeLessThan(0.05);
  });

  it("et elle s'estompe d'elle-même en quelques années", () => {
    // Le cœur du critère : « pendant quelques années », pas pour toujours.
    // Relevé après une éclaircie par le haut : 0,486 puis 0,252 / 0,157 /
    // 0,110 / 0,085 / 0,062 aux cinq anniversaires suivants.
    const { etat, naivete, debut } = apresEclaircie("parLeHaut");
    const juste = naivete(etat);
    expect(juste).toBeGreaterThan(0.3);
    let s = etat;
    for (let i = 0; i < MEMOIRE_ABRI_ANS * 52; i++) {
      const w = METEO[(debut + i) % METEO.length];
      if (!w) throw new Error("météo manquante");
      s = tick(s, w).state;
    }
    const apres = naivete(s);
    expect(apres).toBeLessThan(0.5 * juste);
  });
});
