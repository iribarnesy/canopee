/**
 * Mécanisation (critère H14 bis, docs/regles.md §10).
 *
 * Il n'y a pas un temps de fauche mais deux, et c'est la façon dont on a
 * planté qui décide lequel s'applique. Rien n'est déclaré mécanisable : la
 * part accessible se déduit de la position des arbres.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { applyAction } from "../../src/engine/actions";
import { partMecanisable } from "../../src/engine/mecanisation";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [] };

function parcelle(positions: readonly { x: number; y: number }[]) {
  let state = createGameState(STATION, rngStateFromSeed(1));
  for (const p of positions) state = plantAt(state, "quercus_pubescens", p.x, p.y, 3);
  return state;
}

/** Générateur reproductible, pour disperser sans dépendre du rng du moteur. */
function positionsDispersees(n: number): { x: number; y: number }[] {
  let graine = 12345;
  const suivant = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648;
  };
  return Array.from({ length: n }, () => ({ x: 2 + suivant() * 36, y: 2 + suivant() * 36 }));
}

const ALIGNEES: { x: number; y: number }[] = [];
for (let rang = 0; rang < 8; rang++) {
  for (let i = 0; i < 20; i++) ALIGNEES.push({ x: 3 + rang * 4.5, y: 2 + i * 2 });
}
const SERREES: { x: number; y: number }[] = [];
for (let a = 0; a < 20; a++) {
  for (let b = 0; b < 20; b++) SERREES.push({ x: 2 + a * 1.8, y: 2 + b * 1.8 });
}

describe("ce qu'un engin peut atteindre", () => {
  it("une parcelle nue se travaille entièrement à la machine", () => {
    expect(partMecanisable(parcelle([]).trees, 20, 20, 15)).toBe(1);
  });

  it("des alignements espacés laissent passer l'engin", () => {
    expect(partMecanisable(parcelle(ALIGNEES).trees, 20, 20, 15)).toBeGreaterThan(0.6);
  });

  it("les mêmes arbres dispersés au hasard ne laissent presque rien passer", () => {
    // Même nombre de tiges, même parcelle : seule la disposition change.
    const dispersees = positionsDispersees(160);
    expect(partMecanisable(parcelle(dispersees).trees, 20, 20, 15)).toBeLessThan(0.25);
  });

  it("une plantation trop serrée ferme le passage, même parfaitement alignée", () => {
    // 1,8 m entre rangs : il n'y a pas la place, l'alignement n'y change rien.
    expect(partMecanisable(parcelle(SERREES).trees, 20, 20, 15)).toBeLessThan(0.1);
  });

  it("un engin plus étroit passe là où le gros ne passe pas", () => {
    const trees = parcelle(SERREES).trees;
    expect(partMecanisable(trees, 20, 20, 15, 1)).toBeGreaterThan(
      partMecanisable(trees, 20, 20, 15, 2.2),
    );
  });
});

describe("ce que ça change au chantier", () => {
  function faucher(state: ReturnType<typeof parcelle>) {
    const action: GameAction = { type: "faucher", week: 1, x: 20, y: 20, rayonM: 15 };
    const apres = applyAction(state, action);
    return {
      heures: apres.state.economy.hoursUsedWeek - state.economy.hoursUsedWeek,
      euros: state.economy.treasuryEur - apres.state.economy.treasuryEur,
      refus: apres.refusals.length,
    };
  }

  const aligne = faucher(parcelle(ALIGNEES));
  const disperse = faucher(parcelle(positionsDispersees(160)));

  it("faucher une plantation dispersée coûte des jours, une plantation alignée des heures", () => {
    expect(aligne.refus).toBe(0);
    // Trois fois plus de temps, pas vingt : même sur des rangs bien espacés,
    // la ligne des arbres elle-même reste à faire à la main. C'est ce
    // plancher-là qui borne le gain de la mécanisation.
    expect(disperse.heures).toBeGreaterThan(2.5 * aligne.heures);
  });

  it("mais la machine se paie : elle achète du temps, elle ne le donne pas", () => {
    expect(aligne.euros).toBeGreaterThan(0);
    expect(disperse.euros).toBeLessThan(aligne.euros);
  });
});
