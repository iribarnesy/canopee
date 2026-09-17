/**
 * Le port serré (issue #105, critère B10) : le houppier suit le DIAMÈTRE.
 *
 * Ce que le moteur faisait : `rayon = houppierRatio × hauteur`. Une perche
 * étiolée de dix mètres et onze centimètres recevait donc le houppier d'un
 * dominant de dix mètres — un parasol sur un fil. Tant que l'ombre ne faisait
 * pas filer les dominés, ça ne se voyait pas ; depuis l'étiolement (#97), si.
 *
 * Ce que ce fichier vérifie :
 *   1. la loi est celle du tube — le rayon suit le diamètre, pas la hauteur ;
 *   2. **pour un arbre normalement conformé, RIEN ne change** — la garantie qui
 *      borne le rayon d'explosion d'un lot qui touche seize appels ;
 *   3. le gradient va dans le bon sens des DEUX côtés ;
 *   4. et ce que ça rend, mesuré sur le peuplement.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import {
  crownRadiusM,
  ELANCEMENT_HOUPPIER_REFERENCE,
  ELARGISSEMENT_HOUPPIER_MAX,
} from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { diametreInitialCm, elancement } from "../../src/engine/trees";

const RATIO = getEspece("fagus_sylvatica").lumiere.houppierRatio;

/** Le diamètre qu'il faut à cette hauteur pour porter cet élancement. */
function diametrePour(heightM: number, hd: number): number {
  return (100 * heightM) / hd;
}

describe("la loi du tube : le rayon suit le diamètre", () => {
  it("à hauteur ÉGALE, deux fois le diamètre fait deux fois le houppier", () => {
    // C'est l'énoncé, et il ne dépend d'aucune constante calée : `r ∝ D`.
    const mince = crownRadiusM(10, RATIO, 10);
    const gros = crownRadiusM(10, RATIO, 20);
    expect(gros).toBeCloseTo(2 * mince, 10);
  });

  it("à diamètre ÉGAL, la hauteur ne change plus rien", () => {
    // L'ancienne loi disait l'inverse : elle ne lisait QUE la hauteur.
    expect(crownRadiusM(20, RATIO, 30)).toBeCloseTo(crownRadiusM(10, RATIO, 30), 10);
  });
});

describe("l'arbre normalement conformé ne bouge pas", () => {
  it("à l'élancement de référence, le rayon vaut l'ANCIENNE formule", () => {
    // La garantie du lot, et elle se démontre : `diametreInitialCm` pose
    // D = 2 h, soit H/D 50, et c'est là que la nouvelle loi croise l'ancienne.
    for (const h of [0.3, 2, 10, 25]) {
      expect(crownRadiusM(h, RATIO, diametreInitialCm(h))).toBeCloseTo(RATIO * h, 10);
    }
    expect(elancement(diametreInitialCm(10), 10)).toBeCloseTo(ELANCEMENT_HOUPPIER_REFERENCE, 10);
  });

  it("une tige sans diamètre retombe sur l'ancienne formule", () => {
    // Un semis qu'on PROJETTE n'a pas de diamètre propre ; il ne doit pas pour
    // autant recevoir un houppier nul, ce qui l'effacerait de l'ombrage.
    expect(crownRadiusM(10, RATIO, 0)).toBeCloseTo(RATIO * 10, 10);
    expect(crownRadiusM(10, RATIO, Number.NaN)).toBeCloseTo(RATIO * 10, 10);
  });
});

describe("le gradient va dans le bon sens des deux côtés", () => {
  it("la perche referme sa couronne, l'arbre de plein vent l'étale", () => {
    const h = 10;
    const ancien = RATIO * h;
    const perche = crownRadiusM(h, RATIO, diametrePour(h, 90));
    const auLarge = crownRadiusM(h, RATIO, diametrePour(h, 35));
    // Relevé : 0,56 × l'ancien pour la perche, 1,43 × pour le sujet au large.
    expect(perche / ancien).toBeCloseTo(50 / 90, 2);
    expect(auLarge / ancien).toBeCloseTo(50 / 35, 2);
    expect(perche).toBeLessThan(ancien);
    expect(auLarge).toBeGreaterThan(ancien);
  });

  it("l'élargissement est plafonné, et le plafond ne mord sur RIEN aujourd'hui", () => {
    // Garde-fou, pas calibration. Il correspond à H/D 31, sous tout ce que le
    // moteur produit — le plus trapu mesuré est à 35, au large. S'il se met à
    // mordre, c'est qu'une tige anormalement courte est apparue et qu'il faut
    // le regarder.
    const hdOuLePlafondMord = ELANCEMENT_HOUPPIER_REFERENCE / ELARGISSEMENT_HOUPPIER_MAX;
    expect(hdOuLePlafondMord).toBeLessThan(35);
    const trapu = crownRadiusM(10, RATIO, diametrePour(10, 10));
    expect(trapu).toBeCloseTo(ELARGISSEMENT_HOUPPIER_MAX * RATIO * 10, 10);
  });
});

describe("ce que ça rend sur un peuplement", () => {
  it("dans une hêtraie serrée, la perche n'ombrage plus comme un dominant", () => {
    // Le banc de l'issue, réduit pour tenir dans la suite. On compare, DANS LE
    // MÊME peuplement, ce que la perche épand et ce qu'elle épandait avant.
    const COTE = 30;
    const station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
    const weather = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(station, rngStateFromSeed(7));
    for (let x = 2; x < COTE - 1; x += 2) {
      for (let y = 2; y < COTE - 1; y += 2) {
        state = plantAt(state, "fagus_sylvatica", x, y);
      }
    }
    for (let w = 0; w < 60 * 52; w++) {
      const m = weather[w % weather.length];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
    const vivants = state.trees.filter((t) => t.alive);
    const perche = [...vivants].sort(
      (a, b) => elancement(b.diametreCm, b.heightM) - elancement(a.diametreCm, a.heightM),
    )[0];
    const dominant = [...vivants].sort((a, b) => b.heightM - a.heightM)[0];
    if (!perche || !dominant) throw new Error("peuplement vide");

    // La perche EST étiolée — sans quoi l'essai ne mesurerait rien.
    expect(elancement(perche.diametreCm, perche.heightM)).toBeGreaterThan(80);
    // Et sa couronne s'est resserrée par rapport à l'ancienne loi.
    const ancien = RATIO * perche.heightM;
    expect(crownRadiusM(perche.heightM, RATIO, perche.diametreCm)).toBeLessThan(0.7 * ancien);
    // Le dominant, lui, garde la sienne : le lot ne l'a pas touché.
    const ancienDom = RATIO * dominant.heightM;
    const nouveauDom = crownRadiusM(dominant.heightM, RATIO, dominant.diametreCm);
    expect(nouveauDom).toBeGreaterThan(0.85 * ancienDom);
    expect(nouveauDom).toBeLessThan(1.3 * ancienDom);
  }, 600_000);
});
