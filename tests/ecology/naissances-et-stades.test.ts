/**
 * Le journal de la semaine sait enfin dire ce qui ARRIVE et ce qui GRANDIT
 * (issue #46). Il disait déjà très bien ce qui meurt, ce qui tombe et ce qu'on
 * a fait ; un calque des changements qui ne pointe que les mauvaises nouvelles
 * donne une lecture fausse de la parcelle — une friche qui se boise, le sujet
 * même du jeu, n'y laissait aucune trace.
 *
 * Deux grandeurs, deux raisons d'exister différentes :
 *
 * - `naissances` : le tick les avait sous la main et les jetait. Rien de
 *   nouveau n'est calculé, on arrête juste de perdre.
 * - `franchissements` : le stade est une fonction pure de la hauteur, que le
 *   rendu calcule seul (`stadeDe`). Ce qu'il ne peut pas faire, c'est comparer
 *   deux instants — et c'est la seule chose que le moteur ajoute ici.
 */

import { describe, expect, it } from "vitest";
import { applyAction, estGesteSurArbres } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  SEUIL_FUTAIE_CM,
  SEUIL_GAULIS_CM,
  SEUIL_PERCHIS_CM,
  STADES,
  stadeDe,
} from "../../src/engine/stades";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const METEO = syntheticYear(LIMON_RICHE.climat);

/** Une friche qui reçoit du bouleau du voisinage, sans gibier pour l'écrêter. */
function friche(seed: number, coteM = 30) {
  const station = {
    ...LIMON_RICHE.station,
    coteM,
    gibierParHa: 0,
    voisinage: [{ especeId: "betula_pendula", semisParAn: 40 }],
  };
  return createGameState(station, rngStateFromSeed(seed));
}

describe("l'échelle des stades", () => {
  it("monte dans l'ordre du tableau, et chaque borne fait basculer", () => {
    // Les bornes sont en DIAMÈTRE, et passent par `diametreCm` : on les
    // franchit donc en hauteur là où ce proxy les place.
    expect(STADES).toEqual(["semis", "gaulis", "perchis", "futaie"]);
    expect(stadeDe(0.3)).toBe("semis");
    expect(stadeDe(SEUIL_GAULIS_CM / 2 - 0.01)).toBe("semis");
    expect(stadeDe(SEUIL_GAULIS_CM / 2)).toBe("gaulis");
    expect(stadeDe(SEUIL_PERCHIS_CM / 2 - 0.01)).toBe("gaulis");
    expect(stadeDe(SEUIL_PERCHIS_CM / 2)).toBe("perchis");
    expect(stadeDe(SEUIL_FUTAIE_CM / 2 - 0.01)).toBe("perchis");
    expect(stadeDe(SEUIL_FUTAIE_CM / 2)).toBe("futaie");
    expect(stadeDe(30)).toBe("futaie");
  });

  it("la borne basse est la hauteur de poitrine, là où le diamètre existe", () => {
    // Un arbre plus court que 1,30 m n'a pas de diamètre à 1,30 m : on ne peut
    // pas le mesurer. « Semis » et « pas mesurable » doivent désigner le même
    // arbre, sinon le bas de l'échelle raconte une mesure qui n'existe pas.
    const hauteurDeLaBorne = SEUIL_GAULIS_CM / 2;
    expect(hauteurDeLaBorne).toBeGreaterThan(1);
    expect(hauteurDeLaBorne).toBeLessThan(1.4);
  });
});

describe("les naissances remontent avec leur position", () => {
  it("un semis installé se retrouve dans le journal, et dans l'état", () => {
    let state = friche(3);
    let naissances: ReturnType<typeof tick>["naissances"] = [];
    // Le recrutement n'a lieu qu'une semaine par an : on tourne jusque-là.
    for (let i = 0; i < 3 * 52 && naissances.length === 0; i++) {
      const r = tick(state, METEO[i % 52] as never);
      state = r.state;
      naissances = r.naissances;
    }
    expect(naissances.length).toBeGreaterThan(0);
    for (const n of naissances) {
      // Des arbres du jeu, à leur vraie place : c'est tout l'intérêt sur une
      // carte, un simple compte ne se dessine pas.
      const arbre = state.trees.find((t) => t.id === n.id);
      expect(arbre).toBeDefined();
      expect(arbre?.x).toBe(n.x);
      expect(arbre?.y).toBe(n.y);
      expect(arbre?.especeId).toBe(n.especeId);
      expect(arbre?.heightM).toBe(n.heightM);
    }
  });

  it("le compte des naissances est celui des arbres réellement apparus", () => {
    let state = friche(5);
    let vu = false;
    for (let i = 0; i < 3 * 52 && !vu; i++) {
      const avant = state.trees.length;
      const r = tick(state, METEO[i % 52] as never);
      state = r.state;
      if (r.naissances.length === 0) continue;
      vu = true;
      // Effectif après = effectif avant + naissances (personne ne quitte
      // `state.trees` dans un tick : les morts y restent en chandelles).
      expect(state.trees.length).toBe(avant + r.naissances.length);
    }
    expect(vu).toBe(true);
  });

  it("une semaine sans recrutement n'annonce aucune naissance", () => {
    const state = friche(7);
    // La semaine 0 n'est pas la semaine du recrutement.
    expect(tick(state, METEO[0] as never).naissances).toEqual([]);
  });

  /**
   * Pourquoi `naissances` voyage alors que `ageWeeks` est déjà dans
   * l'instantané (issue #46, correctif du 2026-09-10).
   *
   * On pourrait croire qu'une recrue se reconnaît à son `ageWeeks` jeune. Mais
   * les trois endroits qui créent un arbre — le recrutement naturel
   * (regeneration.ts), le geste `planter` et le semis en vrac (state.ts) —
   * posent tous `ageWeeks: 0`, et l'incrémentent d'un par tick. Un plant acheté
   * et un semis levé le même jour portent donc le MÊME âge pour toujours :
   * aucune règle lisant `ageWeeks` ne peut les séparer.
   *
   * Or le §6.8 demande un point vert sur les RECRUES. Pointer d'un point vert
   * ce que le joueur vient de planter lui-même n'est pas la même image, et
   * c'est le genre d'erreur qu'on ne voit pas avant de planter deux cents
   * tiges d'un coup. `naissances` ne contient que ce que le recrutement a
   * installé, et c'est là toute sa valeur.
   */
  it("un arbre PLANTÉ porte le même `ageWeeks` qu'une recrue, et n'est pas une naissance", () => {
    const station = { ...LIMON_RICHE.station, coteM: 30, gibierParHa: 0, voisinage: [] };
    let state = createGameState(station, rngStateFromSeed(4));
    const planted = applyAction(state, {
      type: "planter",
      week: 0,
      especeId: "betula_pendula",
      positions: [{ x: 10, y: 10 }],
    });
    expect(planted.refusals).toEqual([]);
    state = planted.state;

    // Le marqueur de naissance est le même que celui d'une recrue…
    expect(state.trees[0]?.ageWeeks).toBe(0);
    // …et pourtant le journal ne l'annonce pas comme un semis installé.
    expect(tick(state, METEO[0] as never).naissances).toEqual([]);
  });
});

describe("les franchissements de stade", () => {
  it("un arbre qui grandit franchit, une fois, dans le bon sens", () => {
    // Un bouleau planté juste sous la borne du perchis la passera en grandissant.
    const station = { ...LIMON_RICHE.station, coteM: 20, gibierParHa: 0, voisinage: [] };
    let state = createGameState(station, rngStateFromSeed(11));
    state = plantAt(state, "betula_pendula", 10, 10, SEUIL_PERCHIS_CM / 2 - 0.05);
    const id = state.trees[0]?.id ?? 0;
    expect(stadeDe(state.trees[0]?.heightM ?? 0)).toBe("gaulis");

    const vus: ReturnType<typeof tick>["franchissements"] = [];
    for (let i = 0; i < 52; i++) {
      const r = tick(state, METEO[i % 52] as never);
      state = r.state;
      for (const f of r.franchissements) if (f.id === id) vus.push(f);
    }
    // Une seule fois : on annonce la traversée, pas l'état d'après.
    expect(vus).toEqual([{ id, deStade: "gaulis", versStade: "perchis" }]);
    // Et l'état confirme : le franchissement n'est pas une annonce en l'air.
    expect(stadeDe(state.trees.find((t) => t.id === id)?.heightM ?? 0)).toBe("perchis");
  });

  it("un arbre qui ne change pas de classe ne franchit rien", () => {
    const station = { ...LIMON_RICHE.station, coteM: 20, gibierParHa: 0, voisinage: [] };
    let state = createGameState(station, rngStateFromSeed(11));
    // Loin de toute borne : il grandit sans rien traverser en un an.
    state = plantAt(state, "betula_pendula", 10, 10, 5);
    let total = 0;
    for (let i = 0; i < 52; i++) {
      const r = tick(state, METEO[i % 52] as never);
      state = r.state;
      total += r.franchissements.length;
    }
    expect(total).toBe(0);
  });

  it("une trogne rabattue ne remonte pas ici : sa chute voyage par `retire`", () => {
    // Le moteur ne dit pas deux fois la même chose. Un étêtage fait descendre
    // l'échelle, et `ArbreRetire` porte déjà les deux hauteurs (actions.ts) —
    // le rendu en tire les deux stades lui-même.
    const station = { ...LIMON_RICHE.station, coteM: 20, gibierParHa: 0, voisinage: [] };
    let state = createGameState(station, rngStateFromSeed(13));
    state = plantAt(state, "castanea_sativa", 10, 10, 12);
    const id = state.trees[0]?.id ?? 0;
    expect(stadeDe(12)).toBe("futaie");

    const r = applyAction(state, { type: "trogner", week: 0, treeIds: [id], hauteurTeteM: 2 });
    const geste = (r.gestes ?? []).filter(estGesteSurArbres).find((g) => g.type === "trogner");
    const retire = geste?.retire?.[0];
    expect(retire).toBeDefined();
    expect(stadeDe(retire?.hauteurAvantM ?? 0)).toBe("futaie");
    expect(stadeDe(retire?.hauteurApresM ?? 0)).toBe("gaulis");

    // Le tick qui suit ne réannonce pas la descente.
    const apres = tick(r.state, METEO[0] as never);
    expect(apres.franchissements.filter((f) => f.id === id)).toEqual([]);
  });

  it("une chandelle ne franchit rien : elle ne grandit plus", () => {
    let state = friche(17, 20);
    // Soixante ans : de quoi voir mourir des tiges et vérifier qu'aucune
    // chandelle n'est annoncée comme franchissant un stade.
    const morts = new Set<number>();
    for (let i = 0; i < 60 * 52; i++) {
      const r = tick(state, METEO[i % 52] as never);
      state = r.state;
      for (const m of r.morts) morts.add(m.id);
      for (const f of r.franchissements) expect(morts.has(f.id)).toBe(false);
    }
    expect(morts.size).toBeGreaterThan(0);
  });
});
