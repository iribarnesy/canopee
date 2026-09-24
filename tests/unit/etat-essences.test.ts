/**
 * **L'état d'une essence**, **et non d'un arbre**.
 *
 * Le volet des suivis surveille des individus ; celui des essences surveille
 * des **populations**, et c'est une autre question. Sur deux mille ronces, une
 * seule qui dépérit ne dit rien ; un tiers qui dépérit dit tout.
 *
 * Ce que ces essais défendent :
 *
 * 1. **La même définition de « souffrir » que le journal des suivis** — le
 *    moteur **nomme** la peine, et elle dépasse le seuil. Deux définitions dans le
 *    même jeu finiraient par se contredire d'un panneau à l'autre.
 * 2. **Une part, pas une pire tige** — c'est ce que la pastille montre.
 * 3. **La cause la plus fréquente**, parce qu'une population peut souffrir de
 *    deux choses à la fois et qu'il faut bien en nommer une.
 */

import { describe, expect, it } from "vitest";
import { etatDesEssences, type TigeSurveillee } from "../../src/game/panneaux/recensement";
import { SEUIL_SOUFFRANCE } from "../../src/game/suivis";

const tige = (especeId: string, extra: Partial<TigeSurveillee> = {}): TigeSurveillee => ({
  especeId,
  x: 0,
  y: 0,
  heightM: 3,
  ...extra,
});

describe("l'état des essences", () => {
  it("compte la part qui souffre, et non la pire tige", () => {
    const [ronce] = etatDesEssences([
      tige("rubus_fruticosus", { stressLent: 0.9, causeLente: "ombre" }),
      tige("rubus_fruticosus"),
      tige("rubus_fruticosus"),
      tige("rubus_fruticosus"),
    ]);
    expect(ronce?.enSouffrance).toBe(1);
    expect(ronce?.part).toBe(0.25);
  });

  it("ne compte pas une peine que le moteur ne nomme pas", () => {
    // `stressLent` sans `causeLente` : le moteur n'a pas su dire de quoi. La
    // même règle que `suivis.ts`, qui ne parle que de ce qui est nommé.
    const [e] = etatDesEssences([tige("malus_domestica", { stressLent: 0.9 })]);
    expect(e?.enSouffrance).toBe(0);
    expect(e?.cause).toBeUndefined();
  });

  it("ne compte pas une peine sous le seuil", () => {
    const sous = etatDesEssences([
      tige("malus_domestica", { stressLent: SEUIL_SOUFFRANCE - 0.001, causeLente: "secheresse" }),
    ]);
    expect(sous[0]?.enSouffrance).toBe(0);
    const juste = etatDesEssences([
      tige("malus_domestica", { stressLent: SEUIL_SOUFFRANCE, causeLente: "secheresse" }),
    ]);
    expect(juste[0]?.enSouffrance).toBe(1);
  });

  it("nomme la cause la PLUS FRÉQUENTE quand il y en a plusieurs", () => {
    const [e] = etatDesEssences([
      tige("corylus_avellana", { stressLent: 0.5, causeLente: "ombre" }),
      tige("corylus_avellana", { stressLent: 0.5, causeLente: "ombre" }),
      tige("corylus_avellana", { stressLent: 0.5, causeLente: "secheresse" }),
    ]);
    expect(e?.cause).toBe("ombre");
    expect(e?.part).toBe(1);
  });

  it("garde le recensement : compte, hauteur et tri par effectif", () => {
    const etat = etatDesEssences([
      tige("malus_domestica", { heightM: 4 }),
      tige("rubus_fruticosus", { heightM: 1 }),
      tige("rubus_fruticosus", { heightM: 2 }),
      tige("rubus_fruticosus", { heightM: 1.5 }),
    ]);
    expect(etat.map((e) => e.especeId)).toEqual(["rubus_fruticosus", "malus_domestica"]);
    expect(etat[0]?.tiges).toBe(3);
    expect(etat[0]?.hauteurMaxM).toBe(2);
    expect(etat[1]?.hauteurMaxM).toBe(4);
  });

  it("une essence dont rien ne souffre a une part nulle", () => {
    const [e] = etatDesEssences([tige("malus_domestica"), tige("malus_domestica")]);
    expect(e?.part).toBe(0);
    expect(e?.cause).toBeUndefined();
  });
});
