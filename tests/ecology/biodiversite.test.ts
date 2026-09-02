/**
 * L'indice de biodiversité (docs/regles.md §13) : ce qui distingue une pinède
 * monospécifique d'un peuplement riche — et qui donne au chêne-liège une
 * valeur que son seul bois ne dit pas.
 */

import { describe, expect, it } from "vitest";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import type { TreeState } from "../../src/engine/trees";

function arbre(id: number, especeId: string, heightM: number): TreeState {
  return {
    id,
    especeId,
    x: id % 50,
    y: Math.floor(id / 50),
    ageWeeks: 52 * 30,
    heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 80,
    hauteurElagueeM: 0,
    recepages: 0,
  };
}

/** Pinède pure : 60 pins tous de la même taille. */
const pinede = Array.from({ length: 60 }, (_, i) => arbre(i + 1, "pinus_sylvestris", 14));

/** Même densité, mais mélangée et étagée. */
const melange = [
  ...Array.from({ length: 20 }, (_, i) => arbre(i + 1, "pinus_sylvestris", 16)),
  ...Array.from({ length: 15 }, (_, i) => arbre(i + 100, "quercus_suber", 11)),
  ...Array.from({ length: 10 }, (_, i) => arbre(i + 200, "arbutus_unedo", 3)),
  ...Array.from({ length: 10 }, (_, i) => arbre(i + 300, "castanea_sativa", 18)),
  ...Array.from({ length: 5 }, (_, i) => arbre(i + 400, "ulex_europaeus", 0.8)),
];

describe("ce que l'indice sait voir", () => {
  it("un peuplement mélangé et étagé vaut bien mieux qu'une pinède pure", () => {
    const pure = indiceBiodiversite(pinede, 0, 1);
    const riche = indiceBiodiversite(melange, 0, 1);
    expect(riche.note).toBeGreaterThan(2 * pure.note);
  });

  it("une monoculture a beau être dense, son équitabilité est nulle", () => {
    const pure = indiceBiodiversite(pinede, 0, 1);
    expect(pure.richesse).toBe(1);
    expect(pure.equitabilite).toBe(0);
  });

  it("le bois mort compte : c'est un habitat, pas un déchet (ch4-A)", () => {
    const sans = indiceBiodiversite(melange, 0, 1);
    const avec = indiceBiodiversite(melange, 20_000, 1);
    expect(avec.note).toBeGreaterThan(sans.note);
    expect(avec.boisMort).toBeCloseTo(1, 3);
  });

  it("les gros arbres comptent double : ils sont des habitats à eux seuls", () => {
    const jeunes = Array.from({ length: 30 }, (_, i) => arbre(i + 1, "quercus_suber", 8));
    const vieux = Array.from({ length: 30 }, (_, i) => arbre(i + 1, "quercus_suber", 18));
    expect(indiceBiodiversite(vieux, 0, 1).grosArbres).toBeGreaterThan(
      indiceBiodiversite(jeunes, 0, 1).grosArbres,
    );
  });

  it("un couvert sempervirent protège le sol toute l'année", () => {
    const caducs = Array.from({ length: 20 }, (_, i) => arbre(i + 1, "castanea_sativa", 15));
    const persistants = Array.from({ length: 20 }, (_, i) => arbre(i + 1, "quercus_suber", 15));
    expect(indiceBiodiversite(persistants, 0, 1).couvertPermanent).toBeGreaterThan(0.9);
    expect(indiceBiodiversite(caducs, 0, 1).couvertPermanent).toBeLessThan(0.1);
  });
});

describe("l'apport du chêne-liège à une pinède", () => {
  it("introduire des chênes-lièges dans une pinède élève nettement l'indice", () => {
    const avant = indiceBiodiversite(pinede, 0, 1);
    const apres = indiceBiodiversite(
      [
        ...pinede.slice(0, 40),
        ...Array.from({ length: 20 }, (_, i) => arbre(i + 500, "quercus_suber", 9)),
      ],
      0,
      1,
    );
    expect(apres.note).toBeGreaterThan(avant.note + 15);
    expect(apres.couvertPermanent).toBeGreaterThan(avant.couvertPermanent * 0.9);
  });
});
