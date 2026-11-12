/**
 * Tests écologiques — la lumière spatiale (docs/regles.md §5, §16) :
 * un héliophile meurt sous canopée fermée, un sciaphile y survit et attend.
 * L'ombre d'un arbre de 25 m est décalée de ~10 m vers le nord : les semis
 * sont placés au centre des ombres, pas au pied des troncs.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { lightAtPoint } from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE, type StationClimat } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { STRESS_ONSET } from "../../src/engine/trees";
import { aliveCount, meanHeight, runYears } from "../helpers";

/** Limon riche à climat plus arrosé et régulier : la vieille futaie ne manque pas d'eau. */
const LIMON_FRAIS: StationClimat = {
  station: { ...LIMON_RICHE.station, id: "limon-frais", nom: "Limon frais" },
  climat: { ...LIMON_RICHE.climat, rainAnnualMm: 1100, rainWinterShare: 0.5 },
};

const SPACING = 12.5;
const CANOPY_H = 25;
/** décalage nord des ombres pour un arbre de 25 m (0,4 × H, cf. light.ts) */
const SHADOW_OFFSET = 0.4 * CANOPY_H;

/**
 * Futaie fermée : hêtres adultes en grille 8×8 (l'ombre des couronnes couvre
 * le cœur de parcelle), puis semis plantés au centre exact de quelques ombres.
 */
function underClosedCanopy(understoreyEspece: string, years: number) {
  const weather = syntheticYear(LIMON_FRAIS.climat);
  // Pas de pluie de semis du paysage : cet essai isole la réponse à la
  // lumière, pas la dynamique du voisinage (les recrues de frêne et de chêne
  // du bocage viendraient s'ajouter au comptage).
  let state = createGameState({ ...LIMON_FRAIS.station, voisinage: [] }, rngStateFromSeed(42));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      state = plantAt(state, "fagus_sylvatica", 6.25 + i * SPACING, 6.25 + j * SPACING, CANOPY_H);
    }
  }
  const semisPositions = [1, 2, 3, 4, 5].map((k) => ({
    x: 6.25 + k * SPACING,
    y: 6.25 + k * SPACING + SHADOW_OFFSET,
  }));
  for (const p of semisPositions) {
    state = plantAt(state, understoreyEspece, p.x, p.y, 0.3);
  }
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
  }
  return state;
}

describe("lumière — sous futaie fermée de hêtres", () => {
  it("le semis de pin sylvestre (très héliophile) meurt en quelques années", () => {
    const state = underClosedCanopy("pinus_sylvestris", 5);
    expect(aliveCount(state, "pinus_sylvestris")).toBe(0);
    // Et la futaie, elle, n'a pas souffert.
    expect(aliveCount(state, "fagus_sylvatica")).toBe(64);
  });

  it("le semis de hêtre (sciaphile) survit et pousse lentement", () => {
    const state = underClosedCanopy("fagus_sylvatica", 5);
    const semis = state.trees.filter((t) => t.heightM < 20);
    expect(semis).toHaveLength(5);
    expect(semis.every((t) => t.alive)).toBe(true);
    const hMoy = semis.reduce((s, t) => s + t.heightM, 0) / semis.length;
    expect(hMoy).toBeGreaterThan(0.3);
    expect(hMoy).toBeLessThan(1.5); // il végète, il ne file pas
  });
});

describe("lumière — en plein découvert, personne n'est limité", () => {
  it("les héliophiles poussent normalement à ciel ouvert (peuplement clair)", () => {
    const state = runYears(LIMON_RICHE, 10, {
      plantations: [{ especeId: "betula_pendula", count: 10 }],
    });
    expect(aliveCount(state, "betula_pendula")).toBe(10);
    expect(meanHeight(state, "betula_pendula")).toBeGreaterThan(4);
  });
});

/**
 * **Plus de plancher de lumière**, et ce qu'il rendait impossible (#484).
 *
 * Il y avait un plancher. `saturer` menait l'extinction des couronnes empilées
 * vers `MAX_EXTINCTION` = 4,5 sans l'atteindre, et il restait toujours
 * exp(−4,5) = 1,11 % de lumière, quoi qu'on empile *(à calibrer)*. Or le stress
 * d'ombre ne monte pas au point de compensation mais à 0,9 fois celui-ci :
 * `fLumSurvival = min(1, 0,5 × lumière / compensation)` doit passer sous
 * `STRESS_ONSET` = 0,45. Le hêtre (0,0090) passait sous le plancher : il ne
 * pouvait plus jamais accumuler de stress d'ombre, où qu'il soit et quoi qu'on
 * plante autour de lui. La campagne de #65 a cherché cent vingt ans pourquoi une
 * hêtraie plantée à deux mètres gardait ses 361 tiges ; la réponse tenait dans
 * ces deux nombres, et ces essais les épinglaient.
 *
 * Le plafond est tombé sur décision du propriétaire, le 12 novembre (#484) : les
 * ombres s'additionnent telles quelles, et un hêtre dominé peut mourir d'ombre.
 * Ce qui reste vrai, et que ces essais bornent sans simulation : sous des
 * couronnes empilées, la lumière que le moteur calcule passe sous le seuil de
 * stress de toutes les espèces de l'atlas, et chaque couronne de plus la divise
 * du même facteur.
 */
describe("plus de plancher de lumière : aucune espèce n'est hors d'atteinte de l'ombre", () => {
  /**
   * Lumière en dessous de laquelle une espèce commence à accumuler du stress
   * d'ombre. `fLumSurvival = min(1, 0,5 × lumière / compensation)` doit passer
   * sous `STRESS_ONSET` (0,45), d'où 0,9 × compensation — et non la
   * compensation elle-même, qui ne gouverne que l'arrêt de la **croissance**.
   */
  const seuilStress = (id: string) => 2 * STRESS_ONSET * getEspece(id).lumiere.compensation;

  /**
   * Lumière au sol au centre de l'ombre de `n` hêtres de canopée plantés au même
   * pied, en pleine feuille et sans élagage : la lumière que le moteur calcule
   * sous `n` couronnes superposées.
   */
  function lumiereSousHetres(n: number): number {
    let state = createGameState({ ...LIMON_FRAIS.station, voisinage: [] }, rngStateFromSeed(42));
    for (let i = 0; i < n; i++) state = plantAt(state, "fagus_sylvatica", 20, 10, CANOPY_H);
    return lightAtPoint(state.trees, 20, 10 + SHADOW_OFFSET, () => 1);
  }

  it("deux couronnes de hêtre suffisent à mettre toutes les espèces sous leur seuil, le hêtre compris", () => {
    // Au centre de son ombre, une couronne de hêtre éteint 2 × k × lai = 3,5
    // (la pénombre rapportée à sa moyenne, #438) : il passe 3,0 % de la lumière.
    // Deux couronnes superposées en laissent 0,09 %, dix fois moins que le seuil
    // de stress du hêtre (0,0090), le plus bas de l'atlas. Sous l'ancien
    // plancher, les mêmes deux couronnes en laissaient 1,56 %, et le hêtre
    // restait hors d'atteinte.
    const sousDeux = lumiereSousHetres(2);
    expect(sousDeux).toBeLessThan(seuilStress("fagus_sylvatica"));
    const horsDAtteinte = ESPECES_V0.filter((e) => seuilStress(e.id) <= sousDeux);
    expect(horsDAtteinte.map((e) => e.id)).toEqual([]);
  });

  it("et la lumière n'a plus de mur : chaque couronne de plus la divise du même facteur", () => {
    // Le garde-fou du précédent : un plancher revenu plus bas que 0,09 % le
    // laisserait passer sans rien dire. Ici, quatre couronnes rendent le carré de
    // ce que rendent deux, et deux le carré d'une, au dernier chiffre près.
    const une = lumiereSousHetres(1);
    const deux = lumiereSousHetres(2);
    const quatre = lumiereSousHetres(4);
    expect(deux / une).toBeCloseTo(une, 12);
    expect(quatre / deux).toBeCloseTo(deux, 12);
  });
});
