/**
 * Tests écologiques — la lumière spatiale (docs/regles.md §5, §16) :
 * un héliophile meurt sous canopée fermée, un sciaphile y survit et attend.
 * L'ombre d'un arbre de 25 m est décalée de ~10 m vers le nord : les semis
 * sont placés au centre des ombres, pas au pied des troncs.
 */

import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { MAX_EXTINCTION } from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE, type StationClimat } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
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
 * LE PLANCHER DE LUMIÈRE, et ce qu'il rend impossible.
 *
 * `MAX_EXTINCTION` borne l'empilement des couronnes : sous le couvert le plus
 * sombre que le moteur sache produire, il reste `exp(−MAX_EXTINCTION)` de
 * lumière. Une espèce dont le point de compensation passe SOUS ce plancher ne
 * peut alors plus jamais mourir d'ombre, où qu'elle soit et quoi qu'on plante
 * autour d'elle.
 *
 * Ces essais ne coûtent aucune simulation — c'est une comparaison de deux
 * constantes — et ils auraient épargné une campagne de cent vingt ans. La
 * campagne de #65 cherchait pourquoi une hêtraie plantée à deux mètres garde
 * ses 361 tiges au bout d'un siècle ; la réponse tenait dans ces deux nombres.
 */
describe("ce que le plancher de lumière rend impossible", () => {
  const plancher = Math.exp(-MAX_EXTINCTION);

  it("le hêtre est hors d'atteinte de l'ombre, et il est le seul", () => {
    // Plancher 0,0111 contre une compensation de 0,01 : il reste toujours au
    // hêtre un peu plus de lumière qu'il ne lui en faut pour respirer. C'est
    // une propriété ARITHMÉTIQUE du couple de constantes, pas un résultat de
    // simulation, et elle explique qu'une cohorte dense de hêtres ne s'éclaircit
    // jamais (361 tiges plantées, 361 vivantes à cent vingt ans).
    const hetre = getEspece("fagus_sylvatica").lumiere.compensation;
    expect(hetre).toBeLessThan(plancher);

    // Et c'est bien une exception, pas la règle : toutes les autres espèces de
    // l'atlas peuvent être étouffées. La suivante par l'ombre est le houx
    // (0,02), qui garde près du double du plancher.
    const exceptions = ESPECES_V0.filter((e) => e.lumiere.compensation < plancher);
    expect(exceptions.map((e) => e.id)).toEqual(["fagus_sylvatica"]);
  });

  it("le sciaphile suivant, lui, reste tuable", () => {
    // Le garde-fou de l'essai précédent : si le plancher montait au point de
    // mettre tout le monde à l'abri, l'égalité ci-dessus passerait encore et ne
    // voudrait plus rien dire.
    expect(getEspece("ilex_aquifolium").lumiere.compensation).toBeGreaterThan(plancher);
    expect(getEspece("carpinus_betulus").lumiere.compensation).toBeGreaterThan(plancher);
  });
});
