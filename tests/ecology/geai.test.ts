/**
 * Le geai, disséminateur des grosses graines (critère G5, ch4-C).
 *
 * Un gland ne va nulle part tout seul : il tombe au pied de l'arbre et y
 * pourrit ou s'y fait manger. Ce qui déplace les chênes, c'est un oiseau — le
 * geai enterre des milliers de glands par automne, jusqu'à un kilomètre, et il
 * les cache **en terrain découvert** parce qu'il doit les retrouver.
 *
 * Deux conséquences que le moteur doit produire, et qui expliquent une bonne
 * partie du paysage français : les chênes colonisent les friches, et ils se
 * régénèrent mal sous leur propre couvert.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { drawPosition } from "../../src/engine/regeneration";
import { rngStateFromSeed } from "../../src/engine/rng";
import type { TreeState } from "../../src/engine/trees";

const COTE = 40;

function parent(especeId: string): TreeState {
  return {
    id: 1,
    especeId,
    x: 20,
    y: 20,
    ageWeeks: 52 * 60,
    heightM: 18,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 150,
    hauteurElagueeM: 0,
    recepages: 0,
    pousseTendreM: 0,
    vigueur: 1,
    dommageHydraulique: 0,
    protege: false,
  };
}

/** Parcelle sombre à gauche, clairière à droite. */
function lumiereMiPartie(): number[] {
  const l = new Array<number>(COTE * COTE).fill(0.05);
  for (let y = 0; y < COTE; y++) {
    for (let x = COTE / 2; x < COTE; x++) l[y * COTE + x] = 0.9;
  }
  return l;
}

describe("les grosses graines voyagent par le geai", () => {
  it("le chêne et le châtaignier ne comptent plus sur la gravité", () => {
    expect(getEspece("quercus_pubescens").regeneration.dissemination).toBe("geai");
    expect(getEspece("quercus_suber").regeneration.dissemination).toBe("geai");
    expect(getEspece("castanea_sativa").regeneration.dissemination).toBe("geai");
    // Le hêtre, lui, reste tributaire de la gravité : ses faînes roulent.
    expect(getEspece("fagus_sylvatica").regeneration.dissemination).toBe("gravite");
  });

  it("il cache loin du parent, là où la faîne tomberait à ses pieds", () => {
    const lumiere = new Array<number>(COTE * COTE).fill(0.5);
    const distance = (especeId: string) => {
      let rng = rngStateFromSeed(7);
      let somme = 0;
      for (let i = 0; i < 200; i++) {
        const pos = drawPosition(rng, getEspece(especeId), parent(especeId), COTE, lumiere);
        rng = pos.rng;
        somme += Math.hypot(pos.x - 20, pos.y - 20);
      }
      return somme / 200;
    };
    // Deux fois plus loin — et encore, c'est la parcelle qui borne le geai :
    // dans la réalité il va jusqu'au kilomètre, ici il ne peut pas sortir des
    // quarante mètres du carré.
    expect(distance("quercus_pubescens")).toBeGreaterThan(1.8 * distance("fagus_sylvatica"));
  });

  it("et il cache EN DÉCOUVERT : c'est ce qui fait coloniser les friches", () => {
    const lumiere = lumiereMiPartie();
    let rng = rngStateFromSeed(11);
    let dansLaClairiere = 0;
    const essais = 300;
    for (let i = 0; i < essais; i++) {
      const pos = drawPosition(
        rng,
        getEspece("quercus_pubescens"),
        parent("quercus_pubescens"),
        COTE,
        lumiere,
      );
      rng = pos.rng;
      if (pos.x >= COTE / 2) dansLaClairiere++;
    }
    // Sans biais, on attendrait la moitié. Le geai en met bien davantage au
    // clair — et rien dans le code ne parle de chênes : c'est le biais de
    // l'oiseau qui produit le résultat.
    expect(dansLaClairiere / essais).toBeGreaterThan(0.85);
  });

  it("le semis venu du paysage, lui, arrive n'importe où", () => {
    // Pas de parent sur la parcelle : c'est la pluie de semis du voisinage.
    const lumiere = lumiereMiPartie();
    let rng = rngStateFromSeed(3);
    let dansLaClairiere = 0;
    for (let i = 0; i < 200; i++) {
      const pos = drawPosition(rng, getEspece("quercus_pubescens"), null, COTE, lumiere);
      rng = pos.rng;
      if (pos.x >= COTE / 2) dansLaClairiere++;
    }
    expect(dansLaClairiere / 200).toBeGreaterThan(0.3);
    expect(dansLaClairiere / 200).toBeLessThan(0.7);
  });
});
