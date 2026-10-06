/**
 * **Le voile de chaleur et les flaques disent le moteur** (§5.7).
 *
 * L'air ne tremble qu'au-dessus du sol nu et chaud — le couvert tamponne la
 * chaleur par la fonction du moteur —, et les flaques ne se posent que là où la
 * nappe affleure après une semaine de pluie, hors crue.
 */

import { describe, expect, it } from "vitest";
import { NAPPE_AFFLEURANTE_CM } from "../../src/engine/crue";
import { CHALEUR_MUETTE_C, foyersDeChaleur, ondesDeChaleur } from "../../src/render/temps/chaleur";
import { flaquesDeLaSemaine } from "../../src/render/temps/flaques";

const COTE = 12;
const N = COTE * COTE;
const plein = (v: number) => new Float32Array(N).fill(v);

describe("le voile de chaleur", () => {
  it("rien sous la chaleur muette", () => {
    expect(foyersDeChaleur(CHALEUR_MUETTE_C - 1, plein(1), plein(0), COTE)).toEqual([]);
  });

  it("tremble au-dessus du sol nu par forte chaleur", () => {
    expect(foyersDeChaleur(36, plein(1), plein(0), COTE).length).toBeGreaterThan(0);
  });

  it("pas au-dessus d'une prairie haute", () => {
    expect(foyersDeChaleur(36, plein(1), plein(1), COTE)).toEqual([]);
  });

  it("le couvert fermé tamponne la chaleur : la futaie ne miroite pas comme la friche", () => {
    const nu = foyersDeChaleur(30, plein(1), plein(0), COTE);
    const sousCouvert = foyersDeChaleur(30, plein(0.05), plein(0), COTE);
    const force = (fs: typeof nu) => fs.reduce((s, f) => s + f.force, 0);
    expect(force(sousCouvert)).toBeLessThan(force(nu));
  });

  it("les ondes montent puis s'effacent, et le même instant rend les mêmes ondes", () => {
    const foyers = foyersDeChaleur(36, plein(1), plein(0), COTE);
    expect(ondesDeChaleur(foyers, 1234)).toEqual(ondesDeChaleur(foyers, 1234));
    for (const o of ondesDeChaleur(foyers, 999)) {
      expect(o.opacite).toBeGreaterThanOrEqual(0);
      expect(o.hauteurM).toBeGreaterThan(0);
      expect(o.hauteurM).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("les flaques", () => {
  const nappe = new Float32Array(N).fill(300);
  nappe[5] = 0;
  nappe[6] = NAPPE_AFFLEURANTE_CM;
  nappe[7] = NAPPE_AFFLEURANTE_CM + 1;

  it("se posent là où la nappe affleure, après la pluie", () => {
    expect(flaquesDeLaSemaine(nappe, 20, false, 10).map((f) => f.cellule)).toEqual([5, 6]);
  });

  it("pas sans pluie liquide", () => {
    expect(flaquesDeLaSemaine(nappe, 0, false, 10)).toEqual([]);
  });

  it("pas pendant une crue : c'est sa lame qui tient ces cellules", () => {
    expect(flaquesDeLaSemaine(nappe, 20, true, 10)).toEqual([]);
  });

  it("pas dans l'eau libre", () => {
    const enEau = new Array(N).fill(false);
    enEau[5] = true;
    expect(flaquesDeLaSemaine(nappe, 20, false, 10, enEau).map((f) => f.cellule)).toEqual([6]);
  });

  it("des taches et non des carreaux", () => {
    for (const f of flaquesDeLaSemaine(nappe, 20, false, 10)) expect(f.brulure).toBeDefined();
  });
});
