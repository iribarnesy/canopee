/**
 * **Le mort reste sur pied, et la hauteur du tapis se lit sur la matière** (#370).
 *
 * Un tissu herbacé qui meurt ne part plus en litière dans la semaine : il passe
 * sur pied avec l'azote que la plante n'a pas résorbé, et en tombe à la vitesse
 * d'abscission de ModVege. La hauteur de chaque espèce se lit sur ce qui est
 * debout, vivant et mort, à sa densité apparente, sous sa hauteur de canopée.
 *
 * Ces essais tiennent quatre choses : les deux fonctions, le bilan de la
 * plante (ce qu'elle a pris vaut ce qu'elle a rendu, plus ce qu'elle garde
 * vivant **et mort**), ce que fait la fauche, et la relecture d'un bloc de
 * version 12, qui n'avait pas de mort sur pied.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { HERBACEES, hauteurDuTapisM, N_HERBACEES } from "../../src/engine/herbacees";
import { CHUTE_DU_MORT_PAR_DJ, chuteDuMortSurPied } from "../../src/engine/herbe";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ecrireEtat, lireEtat } from "../../src/engine/serialisation";
import { createGameState, type GameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";

const COTE = 10;
const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [], gibierParHa: 0 };
const METEO = syntheticYear(LIMON_RICHE.climat);
const somme = (a: ArrayLike<number>) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
  return t;
};
const DACTYLE = HERBACEES.findIndex((h) => h.id === "dactylis_glomerata");

function avancer(s: GameState, semaines: number, depuis = 0) {
  let prisKgHa = 0;
  let renduKgHa = 0;
  for (let w = depuis; w < depuis + semaines; w++) {
    const m = METEO[w % METEO.length];
    if (!m) throw new Error("météo manquante");
    const r = tick(s, m);
    s = r.state;
    prisKgHa += r.fluxes.uptakeHerbeKgHa;
    renduKgHa += r.fluxes.litterfallKgHa;
  }
  return { s, prisKgHa, renduKgHa };
}

describe("les deux fonctions", () => {
  it("le mort ne tombe pas au gel, et tombe d'autant plus vite qu'il fait chaud", () => {
    expect(chuteDuMortSurPied(-5)).toBe(0);
    expect(chuteDuMortSurPied(0)).toBe(0);
    expect(chuteDuMortSurPied(10)).toBeLessThan(chuteDuMortSurPied(20));
    // Une semaine à 20 °C : 140 °C·j au taux de ModVege (facteur d'âge 2).
    expect(chuteDuMortSurPied(20)).toBeCloseTo(1 - Math.exp(-CHUTE_DU_MORT_PAR_DJ * 140), 12);
  });

  it("la hauteur se lit sur ce qui est debout, ramené à la place que l'espèce tient", () => {
    const h = HERBACEES[DACTYLE];
    if (!h) throw new Error("pas de dactyle");
    expect(hauteurDuTapisM(h, 100, 50, 0)).toBe(0);
    // 85 g/m² de vert sur toute la cellule, à 850 g/m³ : dix centimètres.
    expect(hauteurDuTapisM(h, 85, 0, 1)).toBeCloseTo(0.1, 12);
    // La même matière sur la moitié de la cellule fait une touffe deux fois plus haute.
    expect(hauteurDuTapisM(h, 85, 0, 0.5)).toBeCloseTo(0.2, 12);
    // Le vert et le mort occupent la même hauteur : la touffe a celle du plus haut.
    expect(hauteurDuTapisM(h, 85, 100, 1)).toBeCloseTo(100 / h.densiteApparente.mort, 12);
    // La hauteur de canopée de l'espèce la plafonne.
    expect(hauteurDuTapisM(h, 1e6, 0, 1)).toBe(h.hauteurM);
  });

  it("chaque espèce de l'atlas déclare une hauteur et des densités positives", () => {
    for (const h of HERBACEES) {
      expect(h.hauteurM).toBeGreaterThan(0);
      expect(h.densiteApparente.vert).toBeGreaterThan(0);
      expect(h.densiteApparente.mort).toBeGreaterThan(0);
    }
  });
});

describe("une prairie garde son foin sur pied", () => {
  it("l'été fabrique du mort sur pied, et l'hiver le fait tomber", () => {
    const depart = createGameState(STATION, rngStateFromSeed(3));
    const ete = avancer(depart, 52 + 32).s;
    const hiver = avancer(ete, 26, 52 + 32).s;
    const morteEte = somme(ete.soil.herbeMorteG);
    expect(morteEte).toBeGreaterThan(0);
    // Le mort tombe tout l'hiver, plus lentement qu'en été mais sans s'arrêter.
    expect(somme(hiver.soil.herbeMorteG)).toBeLessThan(morteEte);
    // Le mort porte l'azote que la plante n'a pas résorbé avant la mort de ses tissus.
    expect(somme(ete.soil.herbeMorteAzoteG)).toBeGreaterThan(0);
  }, 120_000);

  it("ce que la plante a pris vaut ce qu'elle a rendu, plus ce qu'elle garde vivant et mort", () => {
    // Le bilan de la plante, tenu au millionième : le mort sur pied est à elle
    // tant qu'il n'est pas tombé, et l'azote qu'il porte n'est ni perdu ni
    // compté deux fois.
    const depart = createGameState(STATION, rngStateFromSeed(3));
    const azote = (s: GameState) =>
      ((somme(s.soil.herbeAzoteG) + somme(s.soil.herbeMorteAzoteG)) / (COTE * COTE)) * 10;
    const r = avancer(depart, 2 * 52);
    expect(r.s.trees.length).toBe(0);
    expect(r.renduKgHa + azote(r.s) - azote(depart)).toBeCloseTo(r.prisKgHa, 6);
  }, 120_000);
});

describe("la fauche emporte le foin avec l'herbe", () => {
  it("il reste le dixième de la matière sur pied, donc le dixième de la hauteur", () => {
    const avant = avancer(createGameState(STATION, rngStateFromSeed(3)), 52 + 26).s;
    const apres = applyAction(avant, {
      type: "faucher",
      week: avant.week,
      x: COTE / 2,
      y: COTE / 2,
      rayonM: COTE,
    }).state;
    const h = HERBACEES[DACTYLE];
    if (!h) throw new Error("pas de dactyle");
    let hAvant = 0;
    let hApres = 0;
    for (let i = 0; i < COTE * COTE; i++) {
      const k = i * N_HERBACEES + DACTYLE;
      const vivantAvant = avant.soil.herbeMatiereSecheG[k] ?? 0;
      const mortAvant = avant.soil.herbeMorteG[k] ?? 0;
      // Le mort part dans la même proportion que le vivant.
      if (vivantAvant > 0 && mortAvant > 0) {
        expect((apres.soil.herbeMorteG[k] ?? 0) / mortAvant).toBeCloseTo(
          (apres.soil.herbeMatiereSecheG[k] ?? 0) / vivantAvant,
          9,
        );
      }
      hAvant += hauteurDuTapisM(h, vivantAvant, mortAvant, avant.soil.herbeEmprise[k] ?? 0);
      hApres += hauteurDuTapisM(
        h,
        apres.soil.herbeMatiereSecheG[k] ?? 0,
        apres.soil.herbeMorteG[k] ?? 0,
        apres.soil.herbeEmprise[k] ?? 0,
      );
    }
    expect(hAvant / (COTE * COTE)).toBeGreaterThan(0.2);
    // Un dixième de la couverture reste (FAUCHE_COUVERTURE_RESIDUELLE), et un
    // dixième de la matière avec : quelques centimètres, la hauteur de coupe.
    expect(hApres / hAvant).toBeLessThan(0.12);
    expect(hApres / (COTE * COTE)).toBeLessThan(0.08);
  }, 120_000);
});

describe("un bloc de version 12 se relit, le mort sur pied à zéro", () => {
  it("les deux grilles arrivent vides, à leur place, et la partie continue", () => {
    // Le bloc qu'un moteur de version 12 aurait écrit : le même état sans les
    // deux grilles, sous l'ancien numéro. Sous la version 12, ce mort était
    // déjà en litière : des grilles vides écrivent l'état qu'elle avait.
    const partie = avancer(createGameState(STATION, rngStateFromSeed(3)), 40).s;
    const { herbeMorteG: _m, herbeMorteAzoteG: _n, ...solV12 } = partie.soil;
    const b = ecrireEtat({ ...partie, soil: solV12 as GameState["soil"] });
    new DataView(b.buffer).setUint16(8, 12);
    const relu = lireEtat(b, STATION);
    if (!relu) throw new Error("le bloc de version 12 aurait dû se relire");
    expect(relu.soil.herbeMorteG).toBeInstanceOf(Float64Array);
    expect(relu.soil.herbeMorteG).toHaveLength(COTE * COTE * N_HERBACEES);
    expect(somme(relu.soil.herbeMorteG)).toBe(0);
    expect(somme(relu.soil.herbeMorteAzoteG)).toBe(0);
    // Rangé comme un sol de cette version : mêmes clés, même ordre.
    expect(Object.keys(relu.soil)).toEqual(Object.keys(partie.soil));
    // Le reste est relu à l'identique.
    expect(Array.from(relu.soil.herbeMatiereSecheG)).toEqual(
      Array.from(partie.soil.herbeMatiereSecheG),
    );
    const w = METEO[40];
    if (!w) throw new Error("météo manquante");
    expect(() => stateHash(tick(relu, w).state)).not.toThrow();
  }, 120_000);

  it("un bloc de version 12 qui porterait déjà les grilles est refusé", () => {
    // Ce n'est pas un bloc qu'un moteur de version 12 a pu écrire : on ne
    // devine pas, on refuse.
    const b = ecrireEtat(avancer(createGameState(STATION, rngStateFromSeed(3)), 4).s);
    new DataView(b.buffer).setUint16(8, 12);
    expect(lireEtat(b, STATION)).toBeUndefined();
  }, 120_000);
});
