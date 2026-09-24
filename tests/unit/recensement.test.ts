/**
 * **Le recensement des essences présentes** (#156).
 *
 * L'éclaircie par essence existait dans le moteur et n'était demandable nulle
 * part : c'est le seul outil de nettoyage sélectif du jeu, et il était
 * invisible. Mesuré en partie : sur une friche de dix ans, un joueur qui veut
 * ouvrir un roncier fauche en boucle sans effet, parce que `faucher` n'écrit
 * que dans la strate herbacée.
 *
 * Ce que ces épreuves tiennent : le recensement compte ce qui est **là**, dans le
 * cercle visé, et le trie comme l'issue le demande — par effectif décroissant,
 * avec un second critère pour que la liste ne clignote pas sous le curseur.
 */

import { describe, expect, it } from "vitest";
import { essencesPresentes, type TigeRecensee } from "../../src/game/panneaux/recensement";

const tige = (especeId: string, x: number, y: number, heightM = 5): TigeRecensee => ({
  especeId,
  x,
  y,
  heightM,
});

describe("qui est là", () => {
  it("compte par essence et trie par effectif décroissant", () => {
    const liste = essencesPresentes(
      [
        tige("betula_pendula", 10, 10),
        tige("rubus_fruticosus", 10, 10),
        tige("rubus_fruticosus", 11, 10),
        tige("rubus_fruticosus", 12, 10),
        tige("fagus_sylvatica", 10, 11),
        tige("fagus_sylvatica", 11, 11),
      ],
      undefined,
    );
    expect(liste.map((e) => [e.especeId, e.tiges])).toEqual([
      ["rubus_fruticosus", 3],
      ["fagus_sylvatica", 2],
      ["betula_pendula", 1],
    ]);
  });

  it("ne retient que le disque visé", () => {
    const tiges = [tige("a", 0, 0), tige("a", 3, 0), tige("b", 20, 20)];
    const proche = essencesPresentes(tiges, { x: 0, y: 0, rayonM: 5 });
    expect(proche.map((e) => [e.especeId, e.tiges])).toEqual([["a", 2]]);
    // Le bord compte : une tige pile sur le cercle est dedans, comme chez le
    // moteur (`dx² + dy² <= r²`).
    expect(essencesPresentes([tige("a", 5, 0)], { x: 0, y: 0, rayonM: 5 })).toHaveLength(1);
    expect(essencesPresentes([tige("a", 5.01, 0)], { x: 0, y: 0, rayonM: 5 })).toHaveLength(0);
  });

  it("sans zone, c'est toute la parcelle", () => {
    const tiges = [tige("a", 0, 0), tige("b", 900, 900)];
    expect(essencesPresentes(tiges, undefined)).toHaveLength(2);
  });

  it("garde la plus haute tige de chaque essence", () => {
    const liste = essencesPresentes(
      [tige("a", 0, 0, 3), tige("a", 1, 0, 17.5), tige("a", 2, 0, 9)],
      undefined,
    );
    expect(liste[0]?.hauteurMaxM).toBe(17.5);
  });

  it("à effectif égal, l'ordre est stable et alphabétique", () => {
    // Sans second critère, deux essences à égalité permuteraient d'une image à
    // l'autre et la liste clignoterait sous le curseur.
    const tiges = [tige("fagus_sylvatica", 0, 0), tige("betula_pendula", 0, 0)];
    const a = essencesPresentes(tiges, undefined).map((e) => e.especeId);
    const b = essencesPresentes([...tiges].reverse(), undefined).map((e) => e.especeId);
    expect(a).toEqual(b);
    expect(a[0]).toBe("betula_pendula");
  });

  it("donne le nom de l'atlas, et se rabat sur l'identifiant sinon", () => {
    const liste = essencesPresentes(
      [tige("betula_pendula", 0, 0), tige("inconnue_xyz", 0, 0)],
      undefined,
    );
    const bouleau = liste.find((e) => e.especeId === "betula_pendula");
    const inconnue = liste.find((e) => e.especeId === "inconnue_xyz");
    // Le nom de l'atlas, pas l'identifiant — et surtout **pas** d'exception :
    // `getEspece` lève sur un inconnu, ce que le premier jet ignorait.
    expect(bouleau?.nom).not.toBe("betula_pendula");
    expect(bouleau?.nom?.length ?? 0).toBeGreaterThan(3);
    expect(inconnue?.nom).toBe("inconnue_xyz");
  });

  it("rend une liste vide sur une parcelle nue", () => {
    expect(essencesPresentes([], undefined)).toEqual([]);
    expect(essencesPresentes([tige("a", 50, 50)], { x: 0, y: 0, rayonM: 3 })).toEqual([]);
  });
});
