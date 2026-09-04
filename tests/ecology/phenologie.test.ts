/**
 * Phénologie foliaire (phenologie.ts) : l'ordre de débourrement, la porte
 * photopériodique, et l'étalement de la chute.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { dureeDuJourH } from "../../src/engine/meteo";
import { ETALEMENT_CHUTE_SEMAINES, partFoliaire } from "../../src/engine/phenologie";

/** Jour au 15 avril, à la latitude du limon (49,5° N) et de la lande (44,5° N). */
const AVRIL_NORD = dureeDuJourH(49.5, 105);
const AVRIL_SUD = dureeDuJourH(44.5, 105);

describe("l'ordre de débourrement", () => {
  it("le bouleau part avant le chêne, qui part avant le hêtre et le frêne", () => {
    // C'est un fait de terrain, et c'est lui qui décide de qui profite de la
    // lumière d'avril sous un couvert encore nu.
    const dj = (id: string) => getEspece(id).phenologie.debourrementDJ;
    expect(dj("betula_pendula")).toBeLessThan(dj("quercus_pubescens"));
    expect(dj("quercus_pubescens")).toBeLessThan(dj("fagus_sylvatica"));
    expect(dj("fagus_sylvatica")).toBeLessThan(dj("fraxinus_excelsior"));
  });

  it("à cumul égal, le bouleau est feuillé quand le frêne est encore nu", () => {
    const bouleau = getEspece("betula_pendula");
    const frene = getEspece("fraxinus_excelsior");
    // 200 °C·j : mi-avril dans le nord de la France.
    expect(partFoliaire(bouleau, 200, AVRIL_NORD, false, 0)).toBeGreaterThan(0.9);
    expect(partFoliaire(frene, 200, AVRIL_NORD, false, 0)).toBe(0);
  });
});

describe("la porte photopériodique", () => {
  it("sans elle, le Sud débourrerait en hiver — elle l'en empêche", () => {
    // La lande girondine a déjà cumulé 340 °C·j au 12 avril quand le limon du
    // Nord n'en a que 123 : le forçage seul ferait partir le chêne six
    // semaines trop tôt. La photopériode, elle, ne se réchauffe pas.
    const chene = getEspece("quercus_pubescens");
    const cumulLargementSuffisant = 600;
    // Mi-février au sud : jour court, rien ne part malgré la chaleur.
    const fevrierSud = dureeDuJourH(44.5, 46);
    expect(partFoliaire(chene, cumulLargementSuffisant, fevrierSud, false, 0)).toBe(0);
    // Mi-avril, la porte s'entrouvre ; fin avril elle est grande ouverte.
    expect(partFoliaire(chene, cumulLargementSuffisant, AVRIL_SUD, false, 0)).toBeGreaterThan(0.4);
    const finAvrilSud = dureeDuJourH(44.5, 120);
    expect(partFoliaire(chene, cumulLargementSuffisant, finAvrilSud, false, 0)).toBe(1);
  });

  it("le hêtre est le plus photopériodique des feuillus de l'atlas", () => {
    const seuil = (id: string) => getEspece(id).phenologie.seuilJourH;
    expect(seuil("fagus_sylvatica")).toBeGreaterThan(seuil("betula_pendula"));
    expect(seuil("fagus_sylvatica")).toBeGreaterThanOrEqual(seuil("quercus_pubescens"));
  });
});

describe("le déploiement et la chute sont progressifs", () => {
  it("le feuillage sort par degrés, pas d'un coup", () => {
    const chene = getEspece("quercus_pubescens");
    const dj = chene.phenologie.debourrementDJ;
    const debut = partFoliaire(chene, dj + 5, 14, false, 0);
    const milieu = partFoliaire(chene, dj + 45, 14, false, 0);
    const fin = partFoliaire(chene, dj + 120, 14, false, 0);
    expect(debut).toBeGreaterThan(0);
    expect(milieu).toBeGreaterThan(debut);
    expect(fin).toBeGreaterThan(milieu);
    expect(fin).toBe(1);
  });

  it("les feuilles tombent sur plusieurs semaines", () => {
    const chene = getEspece("quercus_pubescens");
    const jourCourt = 10;
    const parts = [0, 1, 2, 3, 4, 5].map((s) => partFoliaire(chene, 900, jourCourt, true, s));
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i] ?? 0).toBeLessThanOrEqual(parts[i - 1] ?? 0);
    }
    expect(parts[0]).toBe(1);
    expect(parts[ETALEMENT_CHUTE_SEMAINES]).toBe(0);
  });

  it("un sempervirent garde son feuillage toute l'année", () => {
    const pin = getEspece("pinus_sylvestris");
    expect(partFoliaire(pin, 0, 9, false, 0)).toBe(1);
    expect(partFoliaire(pin, 900, 9, true, 10)).toBe(1);
  });
});
