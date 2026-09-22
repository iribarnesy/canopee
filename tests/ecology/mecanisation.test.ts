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
    expect(partMecanisable(parcelle([]).trees, { x: 20, y: 20, rayonM: 15 })).toBe(1);
  });

  it("des alignements espacés laissent passer l'engin", () => {
    expect(partMecanisable(parcelle(ALIGNEES).trees, { x: 20, y: 20, rayonM: 15 })).toBeGreaterThan(
      0.6,
    );
  });

  it("les mêmes arbres dispersés au hasard ne laissent presque rien passer", () => {
    // Même nombre de tiges, même parcelle : seule la disposition change.
    const dispersees = positionsDispersees(160);
    expect(partMecanisable(parcelle(dispersees).trees, { x: 20, y: 20, rayonM: 15 })).toBeLessThan(
      0.25,
    );
  });

  it("une plantation trop serrée ferme le passage, même parfaitement alignée", () => {
    // 1,8 m entre rangs : il n'y a pas la place, l'alignement n'y change rien.
    expect(partMecanisable(parcelle(SERREES).trees, { x: 20, y: 20, rayonM: 15 })).toBeLessThan(
      0.1,
    );
  });

  it("un engin plus étroit passe là où le gros ne passe pas", () => {
    const trees = parcelle(SERREES).trees;
    expect(partMecanisable(trees, { x: 20, y: 20, rayonM: 15 }, 1)).toBeGreaterThan(
      partMecanisable(trees, { x: 20, y: 20, rayonM: 15 }, 2.2),
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

describe("une bande se mesure sur sa propre largeur (#186)", () => {
  // Pour un disque, la largeur du chantier en travers d'un passage est le
  // rayon, quelle que soit la direction — c'est ce que le code faisait, et le
  // contrôle d'identité de `zone.test.ts` y tient au bit près. Pour une bande
  // elle DÉPEND de la direction : un engin qui remonte l'allée dans son axe
  // n'a que la largeur devant lui, le même engin qui la traverse a toute la
  // longueur. Les deux essais ci-dessous tiennent ce fait par ses deux bouts,
  // chacun étant faux si la demi-largeur était figée.
  const bande = (longueurM: number, largeurM: number) =>
    ({ zone: "bande", x: 20, y: 20, longueurM, largeurM, orientationRad: 0 }) as const;

  it("on ne remonte pas une allée qu'un arbre bouche, on la traverse", () => {
    // Un arbre au milieu d'une allée de 4 m : dans l'axe il reste 1,65 m de
    // chaque côté pour un engin qui en demande 2,2 — bouché. En travers, le
    // chantier fait 30 m et l'arbre n'en mange que 0,70. C'est ce passage-là
    // qui l'emporte. Demi-largeur figée à celle de la bande, on lirait 0.
    const auMilieu = parcelle([{ x: 20, y: 20 }]).trees;
    expect(partMecanisable(auMilieu, bande(30, 4))).toBeGreaterThan(0.97);
  });

  it("et une haie plantée dans l'axe se contourne dans l'axe, pas en travers", () => {
    // Le cas inverse, et le plus proche du terrain : des tiges en ligne au
    // milieu d'une allée de 8 m, tous les mètres. Les traverser est impossible
    // — 0,30 m entre deux troncs. Les longer ne l'est pas : il reste 3,65 m de
    // part et d'autre, donc 7,30 sur 8. Demi-largeur figée à la demi-LONGUEUR,
    // on lirait 0,977 : la bande ferait mine d'être large de 30 m là où elle
    // n'en fait que 8.
    const haie = Array.from({ length: 29 }, (_, i) => ({ x: 6 + i, y: 20 }));
    expect(partMecanisable(parcelle(haie).trees, bande(30, 8))).toBeCloseTo(7.3 / 8, 6);
  });

  it("une allée vide se travaille entièrement, quelle que soit son orientation", () => {
    // Le rang est planté nord-sud tous les 4 m ; la bande se glisse entre deux
    // rangs sans les toucher. Rien à contourner.
    const rangs: { x: number; y: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let i = 0; i < 20; i++) rangs.push({ x: 2 + r * 4, y: 1 + i * 2 });
    }
    const allee = {
      zone: "bande",
      x: 20,
      y: 20,
      longueurM: 30,
      largeurM: 3,
      orientationRad: Math.PI / 2,
    } as const;
    expect(partMecanisable(parcelle(rangs).trees, allee)).toBe(1);
  });
});
