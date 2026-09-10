/**
 * La taille d'un semis dépend de l'espèce, pas d'une constante.
 *
 * Tous les semis naissaient à trente centimètres. C'est la bonne taille pour un
 * chêne, dont le gland porte les réserves qu'il faut. C'est la MOITIÉ de sa
 * taille adulte pour la callune : elle naissait presque faite, et sautait
 * entièrement sa phase pionnière — celle qui dure des années dans la nature, et
 * pendant laquelle un sous-arbrisseau est vulnérable au broutage, à la
 * concurrence herbacée et au piétinement.
 *
 * Le défaut touchait tous les sous-arbrisseaux de l'atlas, et il faussait dans
 * le sens de la facilité.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { hauteurDuSemisM } from "../../src/engine/regeneration";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const hauteurAdulte = (id: string) => getEspece(id).hauteurMaxM;

describe("un semis n'a pas la même taille selon ce qu'il deviendra", () => {
  it("la callune naît à six centimètres, pas à trente", () => {
    // Un dixième de sa taille adulte, contre la moitié auparavant.
    expect(hauteurDuSemisM(hauteurAdulte("calluna_vulgaris"))).toBeCloseTo(0.06, 6);
  });

  it("les arbres, eux, ne bougent pas d'un centimètre", () => {
    // Le plafond joue dès trois mètres de hauteur adulte : pour un chêne, un
    // hêtre ou un pin, la règle proportionnelle donnerait deux mètres et c'est
    // absurde. Trente centimètres restent la valeur, et cette borne est ce qui
    // permet de corriger les arbustes sans toucher aux arbres.
    for (const id of ["quercus_pubescens", "fagus_sylvatica", "pinus_sylvestris"]) {
      expect(hauteurDuSemisM(hauteurAdulte(id))).toBeCloseTo(0.3, 9);
    }
  });

  it("et entre les deux, c'est continu — aucun palier", () => {
    // L'ajonc, à deux mètres et demi d'adulte, tombe juste sous le plafond.
    expect(hauteurDuSemisM(hauteurAdulte("ulex_europaeus"))).toBeCloseTo(0.25, 6);
    // Monotone, et jamais au-dessus du plafond, quelle que soit la taille.
    expect(hauteurDuSemisM(1)).toBeLessThan(hauteurDuSemisM(2));
    expect(hauteurDuSemisM(1000)).toBeCloseTo(0.3, 9);
  });
});

describe("la phase pionnière existe enfin, et elle dure", () => {
  it("une callune met quinze ans à faire sa taille, et elle y arrive", () => {
    // Les deux moitiés du résultat comptent. Qu'elle mette des années est le
    // correctif ; qu'elle y arrive quand même prouve qu'on n'a pas simplement
    // rendu les sous-arbrisseaux incapables de s'installer sur la lande, qui
    // est pourtant leur terrain.
    const station = { ...LANDE_SECHE.station, coteM: 30, gibierParHa: 0, voisinage: [] };
    const meteo = syntheticYear(LANDE_SECHE.climat);
    let state = createGameState(station, rngStateFromSeed(3));
    state = plantScattered(
      state,
      "calluna_vulgaris",
      20,
      hauteurDuSemisM(hauteurAdulte("calluna_vulgaris")),
    );

    let anAdulte = -1;
    for (let i = 0; i < 20 * 52; i++) {
      state = tick(state, meteo[i % 52] as never).state;
      const vivantes = state.trees.filter((t) => t.alive && t.id <= 20);
      const moyenne = vivantes.length
        ? vivantes.reduce((s, t) => s + t.heightM, 0) / vivantes.length
        : 0;
      if (anAdulte < 0 && moyenne > 0.5) anAdulte = Math.floor(i / 52);
    }
    // Elle survit : ce n'est pas un semis condamné qu'on a fabriqué.
    expect(state.trees.filter((t) => t.alive && t.id <= 20).length).toBeGreaterThan(15);
    // Mais il lui faut plus d'une décennie, là où elle partait presque faite.
    expect(anAdulte).toBeGreaterThan(8);
    expect(anAdulte).toBeLessThan(20);
  });
}, 300_000);
