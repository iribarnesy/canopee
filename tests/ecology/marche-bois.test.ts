/**
 * Le marché du bois : un prix qui bouge, et qui s'effondre quand tout le monde
 * vend en même temps.
 *
 * Les prix du moteur étaient FIXES, quelle que soit l'année et quelle que soit
 * la quantité mise sur le marché. C'est faux de deux façons, et les deux
 * comptent pour un gestionnaire.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import {
  decoteEngorgement,
  INDICE_MAX,
  INDICE_MIN,
  indiceDuMarche,
  PLANCHER_ENGORGEMENT,
  VOLUME_SANS_DECOTE_M3,
} from "../../src/engine/marche";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

describe("les cours bougent d'une année à l'autre", () => {
  it("ils varient, sans jamais s'envoler ni s'effondrer", () => {
    // L'indice des bois sur pied en forêt privée a fait +7 % en 2024, −4 % en
    // 2025, +46 % depuis 2020 : des variations annuelles de l'ordre de ±10 %
    // sont la norme, pas l'accident. Mais un marché ne part pas à l'infini.
    const indices = Array.from({ length: 60 }, (_, an) => indiceDuMarche(12345, an));
    for (const i of indices) {
      expect(i).toBeGreaterThanOrEqual(INDICE_MIN);
      expect(i).toBeLessThanOrEqual(INDICE_MAX);
    }
    const min = Math.min(...indices);
    const max = Math.max(...indices);
    // Sur soixante ans, l'écart doit être franc : sinon on n'a pas simulé un
    // marché, on a ajouté du bruit décoratif.
    expect(max - min).toBeGreaterThan(0.25);
  });

  it("deux parties de même graine voient le même marché", () => {
    // C'est ce qui rend une partie rejouable, et ce qui permet de comparer deux
    // conduites sans que le marché ne fasse la différence à leur place.
    for (const an of [0, 7, 31]) {
      expect(indiceDuMarche(999, an)).toBe(indiceDuMarche(999, an));
      expect(indiceDuMarche(999, an)).not.toBe(indiceDuMarche(1000, an));
    }
  });
});

describe("vendre tout d'un coup fait baisser le prix", () => {
  it("un petit lot part au prix plein", () => {
    expect(decoteEngorgement(0)).toBe(1);
    expect(decoteEngorgement(VOLUME_SANS_DECOTE_M3)).toBe(1);
  });

  it("un gros lot ne trouve plus preneur au même prix", () => {
    // C'est ce que la France a vécu après Lothar en 1999 et Klaus en 2009 : des
    // millions de m³ de chablis jetés d'un coup sur un marché qui ne pouvait
    // pas les absorber, et des cours divisés par deux.
    expect(decoteEngorgement(100)).toBeLessThan(1);
    expect(decoteEngorgement(1000)).toBeCloseTo(PLANCHER_ENGORGEMENT, 9);
  });

  it("et la décote est continue : aucune falaise à raser au m³ près", () => {
    const a = decoteEngorgement(VOLUME_SANS_DECOTE_M3 + 0.01);
    expect(a).toBeLessThanOrEqual(1);
    expect(a).toBeGreaterThan(0.99);
    expect(decoteEngorgement(80)).toBeGreaterThan(decoteEngorgement(120));
  });
});

describe("dans une partie, étaler ses coupes rapporte plus", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 60, voisinage: [], gibierParHa: 0 };

  /** Vend `n` arbres identiques, soit d'un coup, soit répartis sur les années. */
  function recette(dUnCoup: boolean) {
    let state = createGameState(STATION, rngStateFromSeed(4));
    state = plantScattered(state, "pinus_sylvestris", 40, 18);
    const depart = state.economy.treasuryEur;
    const ids = state.trees.map((t) => t.id);
    if (dUnCoup) {
      state = applyAction(state, {
        type: "couper",
        week: 0,
        treeIds: ids,
        devenir: "vendre",
      }).state;
    } else {
      // Le même bois, mais réparti : on simule le passage des années en
      // remettant le compteur annuel à zéro entre les lots, ce que fait
      // `beginWeek` au 1er janvier (game.ts).
      for (let lot = 0; lot < 4; lot++) {
        state = applyAction(state, {
          type: "couper",
          week: 0,
          treeIds: ids.slice(lot * 10, lot * 10 + 10),
          devenir: "vendre",
        }).state;
        state = {
          ...state,
          economy: { ...state.economy, volumeVenduAnneeM3: 0, hoursUsedWeek: 0 },
        };
      }
    }
    return state.economy.treasuryEur - depart;
  }

  it("le même bois vendu en quatre fois rapporte plus qu'en une", () => {
    // C'est LA raison d'étaler ses coupes, et elle n'est écrite nulle part
    // ailleurs : le débouché local sature.
    expect(recette(false)).toBeGreaterThan(recette(true));
  });
});
