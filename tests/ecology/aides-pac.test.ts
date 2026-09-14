/**
 * Les aides publiques, et l'hypothèse qu'on gèle pour pouvoir en parler.
 *
 * Les règles simulées sont FIGÉES sur la programmation 2023-2027 française, et
 * la réalité ne l'est pas : la PAC se renégocie tous les cinq à sept ans. Un
 * jeu qui simule deux siècles avec la PAC de 2023 ment forcément ; il vaut
 * mieux mentir en le disant.
 *
 * Ce qui reste vrai malgré le gel, et que ces essais éprouvent : la STRUCTURE
 * de l'arbitrage. Une aide à l'hectare conditionnée à un plafond d'arbres, un
 * bonus pour les infrastructures agroécologiques, un autre pour les haies.
 */

import { describe, expect, it } from "vitest";
import {
  AIDE_BASE_REVENU_EUR_HA,
  aidesAnnuelles,
  BONUS_HAIES_EUR_HA,
  DENSITE_MAX_AGROFORESTERIE_PAR_HA,
  ECOREGIME_BASE_EUR_HA,
  ECOREGIME_SUPERIEUR_EUR_HA,
  PART_HAIES_BONUS,
  PART_IAE_NIVEAU_SUPERIEUR,
} from "../../src/engine/aides";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

describe("le plafond de cent arbres à l'hectare décide de tout", () => {
  it("en dessous, la parcelle est agricole et touche ses aides", () => {
    const a = aidesAnnuelles(1, DENSITE_MAX_AGROFORESTERIE_PAR_HA, 0);
    expect(a.eligible).toBe(true);
    expect(a.totalEur).toBeGreaterThan(0);
  });

  it("un arbre de plus, et elle devient un boisement : plus rien", () => {
    // C'est le seul endroit du jeu où planter un arbre PEUT COÛTER de l'argent,
    // et c'est un vrai arbitrage de terrain. Au-delà du plafond, ce n'est plus
    // une parcelle agricole avec des arbres, c'est une forêt.
    const a = aidesAnnuelles(1, DENSITE_MAX_AGROFORESTERIE_PAR_HA + 1, 0.5);
    expect(a.eligible).toBe(false);
    expect(a.totalEur).toBe(0);
    // Même avec la moitié de la parcelle en infrastructures agroécologiques :
    // l'éligibilité passe AVANT les bonus, elle ne se rattrape pas.
    expect(a.ecoregimeEur).toBe(0);
  });

  it("le plafond est une densité, pas un nombre : deux hectares en portent deux fois plus", () => {
    expect(aidesAnnuelles(2, 200, 0).eligible).toBe(true);
    expect(aidesAnnuelles(2, 201, 0).eligible).toBe(false);
  });
});

describe("l'écorégime récompense les infrastructures agroécologiques", () => {
  it("au-delà de 10 % d'IAE, on passe au niveau supérieur", () => {
    const juste = aidesAnnuelles(1, 50, PART_IAE_NIVEAU_SUPERIEUR - 0.001);
    const sup = aidesAnnuelles(1, 50, PART_IAE_NIVEAU_SUPERIEUR);
    expect(juste.ecoregimeEur).toBeCloseTo(ECOREGIME_BASE_EUR_HA, 9);
    expect(sup.ecoregimeEur).toBeCloseTo(ECOREGIME_SUPERIEUR_EUR_HA, 9);
  });

  it("et le bonus haies s'ajoute dès 6 %", () => {
    expect(aidesAnnuelles(1, 50, PART_HAIES_BONUS - 0.001).bonusHaiesEur).toBe(0);
    expect(aidesAnnuelles(1, 50, PART_HAIES_BONUS).bonusHaiesEur).toBeCloseTo(
      BONUS_HAIES_EUR_HA,
      9,
    );
  });

  it("une parcelle nue touche le socle, et rien de plus", () => {
    const nue = aidesAnnuelles(1, 0, 0);
    expect(nue.totalEur).toBeCloseTo(AIDE_BASE_REVENU_EUR_HA + ECOREGIME_BASE_EUR_HA, 9);
    expect(nue.bonusHaiesEur).toBe(0);
  });
});

describe("dans une partie, les aides tombent une fois l'an", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 50, voisinage: [], gibierParHa: 0 };
  const METEO = syntheticYear(LIMON_RICHE.climat);

  function apresUnAn(economie: boolean, arbres: number) {
    let state = createGameState(STATION, rngStateFromSeed(7), { economie });
    if (arbres > 0) state = plantScattered(state, "malus_domestica", arbres, 1.5);
    const depart = state.economy.treasuryEur;
    let versements = 0;
    for (let i = 0; i < 52; i++) {
      const r = advanceWeek(state, METEO[i % 52] as never, []);
      state = r.state;
      if (r.aides) versements++;
    }
    return { gain: state.economy.treasuryEur - depart, versements };
  }

  it("une seule fois, pas cinquante-deux", () => {
    expect(apresUnAn(true, 5).versements).toBe(1);
  });

  it("sans économie, aucune aide : le compte tournerait faux", () => {
    // Le compte reste affiché pour information quand l'économie est coupée
    // (actions.ts). Y verser des aides le fausserait — on montrerait une
    // trésorerie qui monte sans que rien de ce qui la fait monter ne compte.
    expect(apresUnAn(false, 5).versements).toBe(0);
  });

  it("une parcelle trop dense ne touche rien, et ça se voit sur le compte", () => {
    // 0,25 ha, donc le plafond est à 25 arbres. Cinq passent, cent non.
    const clair = apresUnAn(true, 5).gain;
    const dense = apresUnAn(true, 100).gain;
    expect(clair).toBeGreaterThan(dense);
  });
});
