/**
 * **Ce que la strate basse rend au sol** (issues #201 et #247).
 *
 * Elle ne rendait **rien** avant #201, et une prairie permanente stérilisait son
 * propre sol. #201 l'a fait rendre l'azote qu'elle venait de prélever, la
 * semaine même, au C/N déclaré de l'espèce, moins une moitié « retenue » qui
 * n'allait nulle part faute d'un pool d'azote dans la plante. La prairie
 * perdait encore 36 % de son humus en quarante ans, parce que la strate ne
 * prélevait que ~31 kg N/ha/an, un débit fixe *(à calibrer)* qui ne savait rien
 * de ce qu'elle fabriquait.
 *
 * **Depuis #247, la strate fabrique de la matière**, et c'est d'elle que viennent
 * son prélèvement et sa litière. Elle pousse avec le rayonnement qu'elle
 * intercepte (RUE des plantes en C3), elle a faim d'azote selon la courbe
 * critique de dilution, ses tissus meurent avec l'âge et tombent en litière
 * avec la moitié de leur azote, l'autre moitié restant dans la plante. Aucun
 * débit, aucun C/N de litière déclaré par espèce.
 *
 * Ce fichier tient quatre choses :
 *
 *   1. **la conservation** côté plante : ce qu'elle rend, plus ce qu'elle
 *      garde, vaut exactement ce qu'elle a pris ;
 *   2. **la prairie de Park Grass** : un prélèvement de prairie non fertilisée,
 *      et un humus qui tient ;
 *   3. **la litière**, qui trouve un équilibre ;
 *   4. **la paille**, dont le C/N sort de la plante au lieu d'être déclaré.
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import { CARBON_FRACTION } from "../../src/engine/carbon";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const METEO = syntheticYear(LIMON_RICHE.climat);
const somme = (a: ArrayLike<number>) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
  return t;
};
const moyenne = (a: ArrayLike<number>) => (a.length === 0 ? 0 : somme(a) / a.length);

/**
 * Une prairie spontanée, sans arbre, sans gibier et sans geste, sur `ans`
 * années. Sans arbre ni gibier, toute la litière qui tombe est celle de la
 * strate.
 */
function prairie(ans: number, cote = 30) {
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [], gibierParHa: 0 };
  let s: GameState = createGameState(station, rngStateFromSeed(4));
  // L'azote de la strate, kg N/ha : la somme des espèces, moyennée sur la parcelle.
  const azotePlante = () => moyenne(s.soil.herbeAzoteG) * N_HERBACEES * 10;
  const azote0 = azotePlante();
  const humus: number[] = [];
  const litiere: number[] = [];
  const prelevement: number[] = [];
  let prisCumul = 0;
  let renduCumul = 0;
  let arbres = 0;
  for (let an = 0; an < ans; an++) {
    let pris = 0;
    for (let w = 0; w < 52; w++) {
      const m = METEO[w];
      if (!m) throw new Error("météo manquante");
      const r = tick(s, m);
      s = r.state;
      pris += r.fluxes.uptakeHerbeKgHa;
      prisCumul += r.fluxes.uptakeHerbeKgHa;
      renduCumul += r.fluxes.litterfallKgHa;
    }
    prelevement.push(pris);
    humus.push(moyenne(s.soil.humusCG) / 100);
    litiere.push(moyenne(s.soil.litterCG) / 100);
    arbres = Math.max(arbres, s.trees.length);
  }
  return {
    humus,
    litiere,
    prelevement,
    prisCumul,
    renduCumul,
    gardeKgHa: azotePlante() - azote0,
    arbres,
  };
}

describe("une plante ne rend que ce qu'elle a pris", () => {
  it("ce qu'elle rend, plus ce qu'elle garde, vaut ce qu'elle a pris", () => {
    // La strate a maintenant un pool d'azote (`herbeAzoteG`) : il entre par le
    // prélèvement et sort à la litière quand des tissus meurent. Sur une
    // prairie sans arbre ni gibier, le bilan de la plante se referme sur ces
    // trois termes, au milliardième. C'est la fuite que #201 avait nommée — la
    // moitié « retenue » qui n'allait nulle part — et elle est fermée.
    const r = prairie(10);
    expect(r.arbres).toBe(0);
    expect(r.prisCumul).toBeGreaterThan(0);
    expect(r.renduCumul + r.gardeKgHa).toBeCloseTo(r.prisCumul, 6);
  }, 600_000);

  it("une culture garde dans son grain l'azote qui quitte la parcelle", () => {
    // Le partage de l'azote à la moisson reste un trait de la fiche : le grain
    // emporte les trois quarts de l'azote du blé (indice de récolte azoté).
    const ble = HERBACEES.find((h) => h.id === "triticum_aestivum");
    if (!ble?.culture) throw new Error("le blé n'est pas une culture");
    expect(ble.culture.azoteDansLeGrain).toBeGreaterThan(0.5);
    expect(ble.culture.azoteDansLeGrain).toBeLessThan(1);
    for (const h of HERBACEES) {
      if (!h.culture) continue;
      expect(h.culture.azoteDansLeGrain).toBeGreaterThanOrEqual(0);
      expect(h.culture.azoteDansLeGrain).toBeLessThanOrEqual(1);
    }
  });
});

describe("la prairie de Park Grass", () => {
  // Calculée une fois : quarante ans de prairie servent aux trois essais.
  const r = prairie(40);

  it("elle prélève ce qu'une prairie non fertilisée prélève", () => {
    // Le prélèvement sort de ce qu'elle fabrique : 48 à 53 kg N/ha/an une fois
    // installée, avec un foin sur pied qui culmine à ~1,8 t/ha. Il était de 31,
    // un débit fixe. La fourchette de 40 à 120 kg N/ha/an est celle écrite avant
    // la mesure, pour une prairie tempérée sans apport *(ordre de grandeur, à
    // confirmer)*. Les parcelles sans engrais de Park Grass donnent un foin de
    // l'ordre de 1 à 2 t/ha/an.
    const installe = r.prelevement.slice(10);
    const parAn = installe.reduce((a, b) => a + b, 0) / installe.length;
    expect(parAn).toBeGreaterThan(40);
    expect(parAn).toBeLessThan(120);
  });

  it("son humus tient, comme celui de Park Grass", () => {
    // **Le fait que #201 n'atteignait pas.** Park Grass, prairie permanente non
    // fertilisée depuis 1856, tient son stock ; le moteur perdait 36 % en
    // quarante ans, parce que la strate ne rendait que ce que son débit fixe
    // lui faisait prendre. Elle rend maintenant ce qu'elle fabrique.
    // Relevé : 73,0 → 77,8 t C/ha en quarante ans (+6,6 %). La prédiction écrite
    // avant le code demandait ±10 % sur cinquante ans.
    const depart = r.humus[0] ?? 0;
    const fin = r.humus[39] ?? 0;
    expect(Math.abs(fin / depart - 1)).toBeLessThan(0.1);
  });

  it("sa litière trouve un équilibre", () => {
    // Une pente serait une erreur de vitesse de décomposition. Relevé : 11,4
    // puis 11,6 t C/ha aux ans 30 et 40, C/N 45. Le niveau est haut pour une
    // prairie, et la vitesse de décomposition (0,6 / C/N) reste sans ancre
    // *(à calibrer)* : l'essai porte sur l'équilibre, pas sur le niveau.
    const avant = r.litiere[29] ?? 0;
    const fin = r.litiere[39] ?? 0;
    expect(fin).toBeGreaterThan(0);
    expect(Math.abs(fin - avant) / avant).toBeLessThan(0.1);
  });
});

describe("la paille, dont le C/N sort de la plante", () => {
  it("le C/N de la paille sort du blé, dans la gamme des pailles", () => {
    // Le C/N de la paille n'est plus déclaré (il valait 90). Il sort du blé : le
    // carbone de ce qui n'est pas grain (1 − indice de récolte) sur l'azote que
    // le grain n'emporte pas. Relevé, limon riche, 192 kg N : C/N ~115, contre
    // 45 à 59 pour la litière de la prairie. La gamme de 50 à 150 est une
    // gamme de pailles de blé *(ordre de grandeur, à confirmer)* ; le sens, lui,
    // est le fait : la paille immobilise l'azote du sol avant de le rendre (C9).
    const cote = 20;
    const c = cote / 2;
    const station = {
      ...LIMON_RICHE.station,
      coteM: cote,
      voisinage: [],
      gibierParHa: 0,
    };
    let s: GameState = createGameState(station, rngStateFromSeed(1));
    const agir = (a: GameAction) => {
      s = applyAction(s, a).state;
    };
    const k = HERBACEES.findIndex((h) => h.id === "triticum_aestivum");
    const ble = HERBACEES[k];
    if (!ble?.culture) throw new Error("le blé n'est pas une culture");
    let cnPaille = 0;
    for (let an = 0; an < 4; an++) {
      for (let w = 0; w < 52; w++) {
        const week = an * 52 + w;
        if (w === 40) agir({ type: "labourer", week, x: c, y: c, rayonM: 30 });
        if (w === 41)
          agir({ type: "semer", week, x: c, y: c, rayonM: 30, cultureId: "triticum_aestivum" });
        if (w === 10 && an > 0)
          agir({
            type: "fertiliser",
            week,
            x: c,
            y: c,
            rayonM: 30,
            forme: "mineral",
            doseKgNHa: 192,
          });
        if (w === 28 && an > 0) {
          let matiere = 0;
          let azote = 0;
          for (let i = 0; i < cote * cote; i++) {
            matiere += s.soil.herbeMatiereSecheG[i * N_HERBACEES + k] ?? 0;
            azote += s.soil.herbeAzoteG[i * N_HERBACEES + k] ?? 0;
          }
          const carbonePaille = matiere * (1 - ble.culture.indiceRecolte) * CARBON_FRACTION;
          const azotePaille = azote * (1 - ble.culture.azoteDansLeGrain);
          cnPaille = carbonePaille / azotePaille;
          agir({ type: "moissonner", week, x: c, y: c, rayonM: 30 });
        }
        const m = METEO[w];
        if (!m) throw new Error("météo manquante");
        s = tick(s, m).state;
      }
    }
    expect(cnPaille).toBeGreaterThan(50);
    expect(cnPaille).toBeLessThan(150);
  }, 600_000);
});
