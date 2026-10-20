/**
 * **L'avis « Sécheresse » compare la même grandeur des deux côtés** (#343).
 *
 * Il prenait la moyenne de `soil.waterMm` — une grille cellule × horizon — et
 * la comparait à la réserve du **profil**. À trois horizons il criait au sec
 * dès 60 % de la réserve, à deux il attendait 40 %. L'essai le pose sur de
 * vrais états du moteur, à deux et trois horizons.
 */

import { describe, expect, it } from "vitest";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ruHorizonMm } from "../../src/engine/soil";
import { createGameState } from "../../src/engine/state";
import { LANDE_SECHE, LIMON_RICHE, STATIONS_V0 } from "../../src/engine/stations";
import {
  compterLaSoif,
  direLaSecheresse,
  eauDuProfilMoyenMm,
  PART_A_SEC,
  solPresqueASec,
} from "../../src/game/avisSecheresse";

/** Un état dont chaque horizon est rempli à `part` de sa réserve. */
function remplieA(station: (typeof STATIONS_V0)[number]["station"], part: number) {
  const s = createGameState({ ...station, coteM: 20 }, rngStateFromSeed(1));
  const n = s.station.coteM * s.station.coteM;
  const nH = station.profil.length;
  expect(s.soil.waterMm.length).toBe(n * nH);
  for (let k = 0; k < s.soil.waterMm.length; k++) {
    // L'ordre cellule × horizon n'importe pas à la somme ; seul compte qu'on
    // remplisse chaque horizon selon sa réserve.
    const h = station.profil[k % nH];
    s.soil.waterMm[k] = h ? part * ruHorizonMm(h) : 0;
  }
  return { waterMm: s.soil.waterMm, n };
}

describe("l'avis Sécheresse", () => {
  it("lit l'eau d'un profil moyen : pleine, c'est la réserve utile de la station", () => {
    for (const { station } of [LANDE_SECHE, LIMON_RICHE]) {
      const { waterMm, n } = remplieA(station, 1);
      expect(eauDuProfilMoyenMm(waterMm, n)).toBeCloseTo(station.ruMm, 0);
    }
  });

  it("se tait à 47 % de la réserve, quel que soit le nombre d'horizons", () => {
    const horizons = new Set<number>();
    for (const { station } of STATIONS_V0) {
      horizons.add(station.profil.length);
      const { waterMm, n } = remplieA(station, 0.47);
      expect(solPresqueASec(waterMm, n, station.ruMm)).toBe(false);
    }
    // L'essai ne vaut que s'il couvre les deux cas que #343 oppose.
    expect(horizons.size).toBeGreaterThan(1);
  });

  it("parle sous le seuil, à deux comme à trois horizons", () => {
    for (const { station } of STATIONS_V0) {
      const { waterMm, n } = remplieA(station, PART_A_SEC * 0.9);
      expect(solPresqueASec(waterMm, n, station.ruMm)).toBe(true);
    }
  });
});

describe("qui a soif, compté contre sa propre essence (#429)", () => {
  const arbre = (id: number, especeId: string, alive = true) => ({ id, especeId, alive });

  it("un même manque laisse un pin tranquille et met un aulne en détresse", () => {
    // 0,5 : sous le seuil de stress de l'aulne (0,65), au-dessus de celui du pin.
    const soif = compterLaSoif(
      [arbre(1, "alnus_glutinosa"), arbre(2, "pinus_sylvestris")],
      new Map([
        [1, 0.5],
        [2, 0.5],
      ]),
    );
    expect(soif.enDetresse).toEqual(["alnus_glutinosa"]);
  });

  it("ne compte ni les morts ni les arbres dont la soif n'est pas connue", () => {
    const soif = compterLaSoif(
      [arbre(1, "alnus_glutinosa", false), arbre(2, "alnus_glutinosa")],
      new Map([[1, 0.1]]),
    );
    expect(soif).toEqual({ enDetresse: [], ralentis: 0 });
  });

  it("nomme les essences en détresse, et compte à part ceux qui ralentissent", () => {
    const phrase = direLaSecheresse({
      enDetresse: ["betula_pendula", "betula_pendula", "alnus_glutinosa"],
      ralentis: 40,
    });
    expect(phrase).toContain("3 arbres en détresse, qui puisent dans leurs réserves");
    expect(phrase).toContain("2 bouleaux verruqueux");
    expect(phrase).toContain("40 autres ralentissent leur croissance");
    expect(phrase).not.toContain("sensibles");
  });

  it("s'accorde au singulier", () => {
    expect(direLaSecheresse({ enDetresse: ["alnus_glutinosa"], ralentis: 1 })).toContain(
      "1 arbre en détresse, qui puise dans ses réserves",
    );
    expect(direLaSecheresse({ enDetresse: [], ralentis: 1 })).toContain(
      "1 arbre ralentit sa croissance",
    );
  });

  it("sans soif, ne promet aucune souffrance", () => {
    expect(direLaSecheresse({ enDetresse: [], ralentis: 0 })).toContain(
      "les arbres tiennent encore",
    );
  });
});
