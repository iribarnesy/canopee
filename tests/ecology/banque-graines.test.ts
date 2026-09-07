/**
 * La banque de graines du sol : la mémoire du passé d'une parcelle.
 *
 * Le moteur ne régénérait que par le PRÉSENT — les adultes qui grainent et le
 * voisinage qui ensemence. Une parcelle n'avait donc aucune mémoire.
 *
 * C'est faux pour toute une catégorie d'espèces, et c'est la clé de la
 * dynamique landaise. Une graine de chêne est RÉCALCITRANTE : elle ne survit
 * pas à un hiver sec. Une graine de légumineuse à tégument dur attend sous
 * terre pendant des décennies, et le feu la réveille.
 */

import { describe, expect, it } from "vitest";
import {
  banqueApresUneAnnee,
  leveeParM2,
  stockEquilibreParM2,
  survieAnnuelle,
} from "../../src/engine/banqueGraines";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const AJONC = getEspece("ulex_europaeus");
const CHENE = getEspece("quercus_pubescens");

describe("toutes les graines ne font pas une banque", () => {
  it("le chêne n'en fait aucune : un gland ne passe pas l'hiver sec", () => {
    expect(CHENE.regeneration.banqueGraines).toBeUndefined();
    expect(leveeParM2(CHENE, 1000, true)).toBe(0);
    expect(banqueApresUneAnnee(CHENE, 1000, 500, false)).toBe(0);
  });

  it("l'ajonc en fait une qui dure des décennies", () => {
    const banque = AJONC.regeneration.banqueGraines;
    expect(banque?.persistanceAns).toBeGreaterThan(20);
    // Après vingt-huit ans sans le moindre apport, il en reste encore le tiers.
    const survie = survieAnnuelle(banque?.persistanceAns ?? 1);
    expect(survie ** 28).toBeGreaterThan(0.3);
  });
});

describe("le feu réveille ce que rien d'autre n'aurait réveillé", () => {
  it("il fait lever dix fois plus qu'une année ordinaire", () => {
    const ordinaire = leveeParM2(AJONC, 1000, false);
    const apresFeu = leveeParM2(AJONC, 1000, true);
    expect(apresFeu).toBeGreaterThan(10 * ordinaire);
  });

  it("mais il ne détruit pas la banque : il en reste pour la fois d'après", () => {
    // Le sol isole : même un feu intense laisse les graines enfouies intactes,
    // il scarifie leur tégument sans les tuer. Une lande peut donc brûler
    // plusieurs fois et revenir à chaque fois.
    const apres = banqueApresUneAnnee(AJONC, 1000, 0, true);
    expect(apres).toBeGreaterThan(400);
    expect(apres).toBeLessThan(1000);
  });

  it("une lande installée atteint le millier de graines au m² qu'on mesure", () => {
    // 500 à 2 000 graines/m² sous une lande installée, d'après la littérature.
    // C'est ce sur quoi le dépôt annuel est calé.
    const surM2 = stockEquilibreParM2(AJONC, 400, 10_000);
    expect(surM2).toBeGreaterThan(300);
    expect(surM2).toBeLessThan(3000);
  });
});

describe("une lande brûlée revient en lande, DEPUIS LE SOL", () => {
  it("sans voisinage pour la réensemencer, elle repart quand même", () => {
    // Le décor est fait pour que la seule explication possible soit la banque :
    // aucun ajonc vivant ne survit au feu, aucun voisinage n'en apporte. Si des
    // ajoncs reviennent, ils viennent du sol.
    const station = {
      ...LANDE_SECHE.station,
      coteM: 30,
      gibierParHa: 0,
      voisinage: [],
    };
    const meteo = syntheticYear(LANDE_SECHE.climat);
    let state = createGameState(station, rngStateFromSeed(11));
    state = plantScattered(state, "ulex_europaeus", 40, 1.5);
    // Vingt ans à grainer : la banque se remplit.
    for (let i = 0; i < 20 * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    const banqueAvant = state.banqueGraines.ulex_europaeus ?? 0;
    expect(banqueAvant).toBeGreaterThan(0);

    // Puis on rase tout : plus un seul ajonc vivant sur la parcelle.
    state = { ...state, trees: [], aBruleDepuisLaLevee: true };
    for (let i = 0; i < 3 * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    const revenus = state.trees.filter((t) => t.especeId === "ulex_europaeus").length;
    expect(revenus).toBeGreaterThan(0);
  });

  it("et sans banque, la même parcelle rasée reste nue", () => {
    // Le témoin : même décor, banque vidée. C'est ce qui distingue la banque
    // d'un simple « les ajoncs repoussent ».
    const station = {
      ...LANDE_SECHE.station,
      coteM: 30,
      gibierParHa: 0,
      voisinage: [],
    };
    const meteo = syntheticYear(LANDE_SECHE.climat);
    let state = createGameState(station, rngStateFromSeed(11));
    state = plantScattered(state, "ulex_europaeus", 40, 1.5);
    for (let i = 0; i < 20 * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    state = { ...state, trees: [], banqueGraines: {}, aBruleDepuisLaLevee: true };
    for (let i = 0; i < 3 * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    expect(state.trees.filter((t) => t.especeId === "ulex_europaeus").length).toBe(0);
  });
}, 300_000);
