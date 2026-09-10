/**
 * La structure du sol : ce que les engins tassent et ce que les racines
 * réparent.
 *
 * Le moteur n'avait aucune variable de structure. Un sol y était défini par sa
 * texture, sa matière organique et son pH — trois choses qui ne bougent pas ou
 * peu — alors que ce qui change vraiment sous une conduite agricole, c'est
 * l'ARRANGEMENT de ces particules. Un limon tassé et le même limon en bonne
 * structure ont la même texture et ne se comportent pas pareil.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  facteurCroissanceTassement,
  facteurInfiltration,
  PERTE_CROISSANCE_MAX,
  tassementApresPassage,
  tassementApresUneAnnee,
} from "../../src/engine/tassement";
import { tick } from "../../src/engine/tick";

describe("un engin tasse là où il passe, et seulement là", () => {
  it("le tassement s'accumule passage après passage, sans dépasser 1", () => {
    let t = 0;
    for (let k = 0; k < 10; k++) t = tassementApresPassage(t, 1);
    expect(t).toBe(1);
    expect(tassementApresPassage(0, 1)).toBeGreaterThan(0);
  });

  it("là où le tracteur n'entre pas, il ne tasse pas", () => {
    // C'est le cœur de l'affaire, et c'est un argument agroforestier : une
    // parcelle plantée serré n'est pas mécanisable, donc elle ne se tasse pas.
    expect(tassementApresPassage(0, 0)).toBe(0);
    expect(tassementApresPassage(0, 0.3)).toBeLessThan(tassementApresPassage(0, 1));
  });
});

describe("les racines réparent ce que les roues ont défait", () => {
  it("un sol nu se répare, un sol enraciné se répare bien plus vite", () => {
    const nu = tassementApresUneAnnee(1, 0);
    const enracine = tassementApresUneAnnee(1, 1);
    expect(nu).toBeLessThan(1);
    expect(enracine).toBeLessThan(nu);
  });

  it("mais c'est LENT : il y faut des années, pas une saison", () => {
    // Le temps de retour n'est chiffré par aucune des sources consultées ; on
    // s'en tient à une échelle pluriannuelle et on le dit. Ce que l'essai
    // garantit, c'est qu'une seule saison ne suffit jamais.
    expect(tassementApresUneAnnee(1, 1)).toBeGreaterThan(0.5);
    let t = 1;
    let annees = 0;
    while (t > 0 && annees < 100) {
      t = tassementApresUneAnnee(t, 0);
      annees++;
    }
    expect(annees).toBeGreaterThan(5);
  });
});

describe("ce que le tassement coûte", () => {
  it("il ferme le sol à l'eau : ce qui n'entre pas ruisselle", () => {
    expect(facteurInfiltration(0)).toBe(1);
    expect(facteurInfiltration(1)).toBeLessThan(1);
    expect(facteurInfiltration(0.5)).toBeGreaterThan(facteurInfiltration(1));
  });

  it("et il coûte jusqu'à 30 % de croissance, comme le mesure Arvalis", () => {
    // Cinq ans d'essais, pertes de rendement de 5 à 30 % selon les passages,
    // quel que soit la culture ou le système. C'est le haut de cette fourchette
    // qui cale le pire cas.
    expect(facteurCroissanceTassement(0)).toBe(1);
    expect(facteurCroissanceTassement(1)).toBeCloseTo(1 - PERTE_CROISSANCE_MAX, 9);
  });
});

describe("dans une partie, labourer tasse — sauf sous les arbres", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 40, gibierParHa: 0, voisinage: [] };

  function apresLabour(arbres: number) {
    let state = createGameState(STATION, rngStateFromSeed(2));
    if (arbres > 0) state = plantScattered(state, "quercus_pubescens", arbres, 8);
    const { state: apres } = applyAction(state, {
      type: "labourer",
      week: 0,
      x: 20,
      y: 20,
      rayonM: 10,
    });
    const total = apres.soil.tassement.reduce((s, v) => s + v, 0);
    return total;
  }

  it("une parcelle nue se tasse", () => {
    expect(apresLabour(0)).toBeGreaterThan(0);
  });

  it("la même, plantée dense, se tasse moins — le tracteur n'y entre pas", () => {
    // L'agroforesterie protège la structure du sol, et ça ne vient d'aucune
    // règle qui le dirait : ça tombe de `partMecanisable`, qui existait déjà
    // pour chiffrer le coût du chantier.
    const dense = apresLabour(40);
    const nue = apresLabour(0);
    expect(dense).toBeLessThan(nue);
  });
});

describe("le tassement se paie sur ce qui pousse (câblage du moteur)", () => {
  /**
   * On ne compare PAS une parcelle labourée à une parcelle intacte : le labour
   * brûle de l'humus, libère de l'azote et tue les mycorhizes, et on ne saurait
   * pas lequel de ces effets on mesure. On fait varier LE SEUL tassement, tout
   * le reste identique, même graine.
   */
  function apresDesAnnees(tassementInitial: number, ans: number) {
    let state = createGameState(LIMON_RICHE.station, rngStateFromSeed(3));
    state = plantScattered(state, "quercus_pubescens", 12, 8);
    state = {
      ...state,
      soil: { ...state.soil, tassement: state.soil.tassement.map(() => tassementInitial) },
    };
    const annee = syntheticYear(LIMON_RICHE.climat);
    for (let s = 0; s < ans * 52; s++) {
      const w = annee[s % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    const vivants = state.trees.filter((t) => t.alive);
    return {
      hauteurMoyenne: vivants.reduce((s, t) => s + t.heightM, 0) / Math.max(1, vivants.length),
      herbe:
        state.soil.herbeCouverture.reduce((s, v) => s + v, 0) / state.soil.herbeCouverture.length,
      tassementRestant:
        state.soil.tassement.reduce((s, v) => s + v, 0) / state.soil.tassement.length,
    };
  }

  it("un arbre sur sol tassé pousse moins que le même sur sol intact", () => {
    const intact = apresDesAnnees(0, 3);
    const tasse = apresDesAnnees(1, 3);
    expect(tasse.hauteurMoyenne).toBeLessThan(intact.hauteurMoyenne);
  });

  it("et la strate herbacée en pâtit aussi — c'est là qu'Arvalis l'a mesuré", () => {
    const intact = apresDesAnnees(0, 3);
    const tasse = apresDesAnnees(1, 3);
    expect(tasse.herbe).toBeLessThan(intact.herbe);
  });

  it("mais la structure se répare pendant ce temps, elle ne reste pas à 1", () => {
    // Trois passages annuels de réparation : le sol ne revient pas à neuf,
    // mais il n'est plus au maximum non plus.
    const tasse = apresDesAnnees(1, 3);
    expect(tasse.tassementRestant).toBeLessThan(1);
    expect(tasse.tassementRestant).toBeGreaterThan(0.5);
  });
});
