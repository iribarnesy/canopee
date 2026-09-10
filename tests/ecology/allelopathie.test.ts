/**
 * L'allélopathie : empêcher les autres de pousser chez soi.
 *
 * Le moteur ne connaissait que la CONCURRENCE — pour la lumière, l'eau, les
 * minéraux. Or certaines plantes ne se contentent pas de prendre : elles
 * émettent. Le noyer libère de la juglone par ses racines et sa litière, et
 * elle inhibe la germination et la croissance dans un rayon de quinze à vingt
 * mètres.
 *
 * C'est la contrainte classique de l'agroforesterie au noyer. Pour ce jeu, elle
 * rend le choix des VOISINS décisif là où, ailleurs, seule la lumière compte.
 */

import { describe, expect, it } from "vitest";
import {
  facteurAllelopathie,
  intensiteAllelopathique,
  RETENTION_SUR_SABLE,
  SENSIBILITE_MEDIANE,
} from "../../src/engine/allelopathie";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const NOYER = getEspece("juglans_regia");
const PORTEE = NOYER.allelopathie?.porteeM ?? 0;

describe("la juglone porte loin, puis s'arrête net", () => {
  it("le noyer est le seul émetteur de l'atlas", () => {
    expect(NOYER.allelopathie).toBeDefined();
    expect(PORTEE).toBeGreaterThanOrEqual(15);
    expect(PORTEE).toBeLessThanOrEqual(20);
    expect(getEspece("quercus_pubescens").allelopathie).toBeUndefined();
  });

  it("l'intensité décroît avec la distance et s'annule à la portée", () => {
    const pres = intensiteAllelopathique(1, PORTEE, 0.15);
    const loin = intensiteAllelopathique(PORTEE - 1, PORTEE, 0.15);
    expect(pres).toBeGreaterThan(loin);
    expect(intensiteAllelopathique(PORTEE, PORTEE, 0.15)).toBe(0);
    expect(intensiteAllelopathique(PORTEE + 5, PORTEE, 0.15)).toBe(0);
  });

  it("le sable lessive la juglone, le limon lourd la retient", () => {
    // C'est ce qui permet d'en faire une règle plutôt qu'une constante : un
    // noyer sur limon stérilise autour de lui, le même sur sable gêne bien
    // moins.
    const surLimon = intensiteAllelopathique(2, PORTEE, 0.15);
    const surSable = intensiteAllelopathique(2, PORTEE, 0.9);
    expect(surSable).toBeLessThan(surLimon);
    // Jamais nul pour autant : la molécule est émise en continu tant que
    // l'arbre est là.
    expect(surSable).toBeGreaterThan(RETENTION_SUR_SABLE * surLimon * 0.9);
  });
});

describe("toutes les espèces n'en souffrent pas pareil", () => {
  it("le pommier, le pin et le bouleau sont documentés comme sensibles", () => {
    for (const id of ["malus_domestica", "pinus_sylvestris", "betula_pendula"]) {
      expect(getEspece(id).sensibiliteAllelopathie ?? SENSIBILITE_MEDIANE).toBeGreaterThan(0.8);
    }
  });

  it("une espèce indifférente ne perd rien, même collée au tronc", () => {
    expect(facteurAllelopathie(1, 0)).toBe(1);
    // Et une pleinement sensible au contact perd tout.
    expect(facteurAllelopathie(1, 1)).toBe(0);
    // Entre les deux, c'est proportionnel — aucun seuil.
    expect(facteurAllelopathie(0.5, 0.5)).toBeCloseTo(0.75, 9);
  });
});

describe("dans une partie, un pommier sous un noyer ne pousse pas", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 60, gibierParHa: 0, voisinage: [] };
  const METEO = syntheticYear(LIMON_RICHE.climat);

  /** Un pommier à `distance` mètres d'un noyer adulte, ou seul. */
  function pommierApres(ans: number, distance: number | null) {
    let state = createGameState(STATION, rngStateFromSeed(9));
    // Le noyer à gauche, le pommier à `distance` de lui — les deux dans la
    // parcelle, sans quoi le second serait simplement refusé et l'essai
    // comparerait un arbre à rien.
    if (distance !== null) state = plantAt(state, "juglans_regia", 10, 30, 18);
    state = plantAt(state, "malus_domestica", 10 + (distance ?? 40), 30, 1);
    const id = state.nextTreeId - 1;
    for (let i = 0; i < ans * 52; i++) state = tick(state, METEO[i % 52] as never).state;
    return state.trees.find((t) => t.id === id)?.heightM ?? 0;
  }

  it("collé au noyer il végète, à trente mètres il pousse", () => {
    // Trente mètres : au-delà de la portée de la juglone, donc hors d'atteinte.
    // C'est la distance que conseille tout guide de plantation, et le moteur y
    // arrive sans qu'on l'écrive — le pommier n'a pas de règle « éviter le
    // noyer », il a une sensibilité et le noyer une portée.
    const colle = pommierApres(15, 3);
    const loin = pommierApres(15, 30);
    expect(colle).toBeLessThan(loin);
    // Et il ne s'agit pas seulement de l'ombre : à trois mètres d'un noyer de
    // dix-huit mètres, l'ombre compte, mais l'écart doit être FRANC.
    expect(colle).toBeLessThan(0.7 * loin);
  });
}, 300_000);
