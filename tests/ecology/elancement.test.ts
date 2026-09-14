/**
 * L'élancement H/D : la forme d'un arbre dit l'histoire de son peuplement.
 *
 * Le coefficient d'élancement — hauteur sur diamètre — est L'indicateur du
 * risque de chablis en sylviculture française : au-dessus de 80 un peuplement
 * est réputé fragile, en dessous de 70 stable. Le moteur le fixait à 50 pour
 * tout arbre, toujours, parce que le diamètre se déduisait de la seule hauteur.
 *
 * Ce qui le fait varier n'est pas l'espèce mais la CONCURRENCE, et c'est ce que
 * ce fichier vérifie : rien n'est déclaré par essence, tout tombe de la lumière
 * que chaque individu reçoit (`dendrometrie.ts`).
 */

import { describe, expect, it } from "vitest";
import {
  diametreApresPousse,
  diametreDeReferenceCm,
  ELANCEMENT_AU_LARGE,
  ELANCEMENT_SOUS_COUVERT,
  elancementCible,
  elancementDe,
} from "../../src/engine/dendrometrie";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

describe("l'élancement visé suit la lumière, et rien d'autre", () => {
  it("au large on épaissit, sous couvert on file", () => {
    expect(elancementCible(1)).toBe(ELANCEMENT_AU_LARGE);
    expect(elancementCible(0)).toBe(ELANCEMENT_SOUS_COUVERT);
    expect(elancementCible(0.5)).toBeGreaterThan(ELANCEMENT_AU_LARGE);
    expect(elancementCible(0.5)).toBeLessThan(ELANCEMENT_SOUS_COUVERT);
  });

  it("à pousse égale, l'ombre épaissit moins", () => {
    const auLarge = diametreApresPousse(10, 0.5, 1);
    const sousCouvert = diametreApresPousse(10, 0.5, 0.1);
    expect(auLarge).toBeGreaterThan(sousCouvert);
    expect(sousCouvert).toBeGreaterThan(10);
  });

  it("aucune pousse, aucun épaississement", () => {
    expect(diametreApresPousse(10, 0, 1)).toBe(10);
    expect(diametreApresPousse(10, -1, 1)).toBe(10);
  });
});

describe("serré = élancé : la forme émerge de la densité (E10)", () => {
  /**
   * Deux peuplements, même espèce, même station, MÊME GRAINE. Seul l'écartement
   * change. On ne touche à aucun trait d'espèce : si l'élancement diverge, il ne
   * peut venir que de la lumière que les voisins laissent.
   */
  function peuplement(ecartementM: number, ans: number) {
    const cote = 60;
    const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [], gibierParHa: 0 };
    let state = createGameState(station, rngStateFromSeed(7));
    for (let y = ecartementM; y < cote - ecartementM; y += ecartementM) {
      for (let x = ecartementM; x < cote - ecartementM; x += ecartementM) {
        state = plantAt(state, "fagus_sylvatica", x, y, 0.5);
      }
    }
    const plantes = state.trees.length;
    const annee = syntheticYear(LIMON_RICHE.climat);
    for (let s = 0; s < ans * 52; s++) {
      const w = annee[s % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    // On mesure les DOMINANTS — les plus grands — pour comparer ce qui est
    // comparable : un peuplement serré porte en plus une foule de dominés que
    // le peuplement clair n'a pas, et leur moyenne noierait le signal.
    const vivants = state.trees
      .filter((t) => t.alive && t.especeId === "fagus_sylvatica")
      .sort((a, b) => b.heightM - a.heightM)
      .slice(0, 10);
    const elancements = vivants.map((t) =>
      elancementDe(t.heightM, t.diametreCm ?? diametreDeReferenceCm(t.heightM)),
    );
    return {
      plantes,
      n: vivants.length,
      hauteur: vivants.reduce((a, t) => a + t.heightM, 0) / Math.max(1, vivants.length),
      elancement: elancements.reduce((a, e) => a + e, 0) / Math.max(1, elancements.length),
    };
  }

  const serre = peuplement(2, 30);
  const large = peuplement(10, 30);

  it("le peuplement serré produit des perches, le clair des sujets trapus", () => {
    // Aucune règle ne dit « serré = élancé » : les deux parties tournent avec
    // les mêmes espèces et les mêmes constantes. Seule la lumière diffère.
    expect(serre.n).toBeGreaterThan(0);
    expect(large.n).toBeGreaterThan(0);
    expect(serre.elancement).toBeGreaterThan(large.elancement);
  });

  it("et l'écart est monotone, sans que rien ne le déclare", () => {
    // Mesuré sur quatre écartements, dominants à trente ans :
    //
    //    2 m — 784 plantés — H 13,1 m — D 30,7 cm — H/D 43,8
    //    4 m — 169 plantés — H 14,7 m — D 34,6 cm — H/D 43,2
    //    6 m —  64 plantés — H 14,5 m — D 37,8 cm — H/D 38,6
    //   10 m —  16 plantés — H 12,9 m — D 36,3 cm — H/D 35,5
    //
    // ─── CE QUE LE MOTEUR N'ATTEINT PAS, ET POURQUOI ────────────────────────
    // La sylviculture mesure 25 à 40 pour un sujet de plein vent et 90 à 100
    // pour une perche de plantation serrée. Le moteur va de 35 à 44 : le bon
    // ORDRE, une amplitude trop faible.
    //
    // La cause est identifiée et elle est ANTÉRIEURE à ce lot. Dans
    // `extinctionAt` (light.ts), un voisin plus haut ombrage à plein poids ;
    // un CODOMINANT — entre 75 et 100 % de la hauteur visée — ne compte que
    // pour 0,4. Or dans une plantation régulière, tout le monde est codominant
    // de tout le monde : c'est précisément la situation que ce poids atténue.
    // Les dominants d'un peuplement serré reçoivent donc trop de lumière, et
    // s'épaississent trop.
    //
    // On ne touche pas à ce 0,4 ici. Il gouverne l'auto-éclaircie, la
    // succession et le tri des espèces : le bouger déplacerait toutes les
    // conclusions écologiques du dépôt, et ça se mérite son propre lot.
    //
    // Les deux écartements les plus serrés sont d'ailleurs à égalité (43,8 et
    // 43,2), ce qui est le même symptôme : sous un certain espacement, le
    // terme latéral sature et la densité cesse de compter.
    expect(large.elancement).toBeLessThan(40);
    expect(serre.elancement).toBeGreaterThan(large.elancement * 1.15);
  });
});
