/**
 * LA PLOMBERIE DE F19 : la trajectoire climatique atteint enfin la rafale.
 *
 * Le critère demande que la fréquence des tempêtes suive la dérive du climat.
 * Le blocage n'était pas conceptuel mais topologique : `meteoDerivee` connaît le
 * scénario et pas la graine de partie, donc ne peut tirer de rafale ; `tick`
 * tire la rafale et ne connaît pas le scénario. Deux moitiés dans deux
 * fonctions qui ne se voient pas.
 *
 * Ce lot les réunit, et RIEN DE PLUS. Le facteur vaut 1, parce que le chiffre
 * manque et que son signe même n'est pas établi pour la France
 * (`AMPLIFICATION_RAFALE`). Ce fichier vérifie donc deux choses opposées, et
 * c'est voulu : que le tuyau existe VRAIMENT, et qu'il ne coule pas encore.
 */

import { describe, expect, it } from "vitest";
import {
  AMPLIFICATION_RAFALE,
  facteurRafale,
  meteoDerivee,
  normalesHebdo,
  SCENARIOS,
} from "../../src/engine/climat";
import { syntheticYear } from "../../src/engine/meteo";
import { LIMON_RICHE } from "../../src/engine/stations";
import { rafaleDeLaSemaine } from "../../src/engine/tempete";

const SERIE = syntheticYear(LIMON_RICHE.climat);
const NORMALES = normalesHebdo(SERIE);

describe("le tuyau existe : un facteur non neutre change la rafale", () => {
  it("la rafale répond au facteur climatique, proportionnellement", () => {
    // LA PRÉMISSE. Un champ qu'on branche sans vérifier qu'il agit est un
    // ornement ; le jour où le chiffre arrivera, il faut qu'il serve.
    const sans = rafaleDeLaSemaine(12345, 40, 6);
    expect(rafaleDeLaSemaine(12345, 40, 6, 1.2)).toBeCloseTo(1.2 * sans, 9);
    expect(rafaleDeLaSemaine(12345, 40, 6, 0.8)).toBeCloseTo(0.8 * sans, 9);
  });

  it("et il ne touche pas au tirage : même graine, même semaine, même hasard", () => {
    // Le facteur MULTIPLIE ce qui a été tiré ; il ne retire pas un tirage
    // différent. Sans quoi brancher le climat rebattrait toutes les tempêtes
    // d'une partie, au lieu de les échelonner.
    for (const vent of [3, 6, 11]) {
      const a = rafaleDeLaSemaine(7, 100, vent, 1.5);
      const b = rafaleDeLaSemaine(7, 100, vent * 1.5);
      expect(a).toBeCloseTo(b, 9);
    }
  });

  it("par défaut, il vaut 1 : l'appel sans facteur est l'appel d'avant", () => {
    for (const semaine of [0, 17, 520]) {
      expect(rafaleDeLaSemaine(3, semaine, 5, 1)).toBe(rafaleDeLaSemaine(3, semaine, 5));
    }
  });
});

describe("mais il ne coule pas encore, et c'est une décision", () => {
  it("l'amplification est NULLE, et la changer doit être un geste délibéré", () => {
    // Ce garde-fou existe pour casser le jour où quelqu'un posera un chiffre.
    // Le signe lui-même n'est pas établi pour la France : les projections
    // européennes de tempêtes hivernales sont de faible confiance et se
    // contredisent. Poser +8 % par degré, comme pour la chaleur, déciderait en
    // creux que les tempêtes futures couchent plus d'arbres.
    expect(AMPLIFICATION_RAFALE).toBe(0);
  });

  it("aucun scénario, aucune année ne déplace la rafale d'un cheveu", () => {
    for (const scenario of SCENARIOS) {
      for (const annee of [2026, 2050, 2075, 2100]) {
        expect(facteurRafale(scenario, annee)).toBe(1);
      }
    }
  });

  it("la météo dérivée porte le facteur, et il vaut 1 sur tout l'horizon", () => {
    // Le pont lui-même : c'est la météo qui transporte le scénario jusqu'au
    // tick, exactement comme elle le fait déjà pour le CO₂ et l'année.
    const base = SERIE[10];
    if (!base) throw new Error("semaine manquante");
    for (const scenario of SCENARIOS) {
      for (const annee of [2026, 2100]) {
        const w = meteoDerivee(base, 10, scenario, annee, NORMALES);
        expect(w.facteurRafale).toBe(1);
        // Et le reste de la dérive continue de fonctionner : le CO₂ bouge,
        // lui, sinon on ne testerait qu'un scénario vide.
        expect(w.co2Ppm).toBeGreaterThan(0);
      }
    }
    // Contrôle de la prémisse du contrôle : sous SSP5-8.5 en 2100, quelque
    // chose DOIT avoir bougé dans cette météo — sans quoi « le vent ne bouge
    // pas » ne dirait rien.
    const chaud = SCENARIOS.find((s) => s.id === "ssp585");
    if (!chaud) throw new Error("scénario manquant");
    const froid = meteoDerivee(base, 10, chaud, 2026, NORMALES);
    const tard = meteoDerivee(base, 10, chaud, 2100, NORMALES);
    expect(tard.tMean).toBeGreaterThan(froid.tMean + 1);
    expect(tard.ventMoyMs).toBe(froid.ventMoyMs);
    expect(tard.facteurRafale).toBe(froid.facteurRafale);
  });
});
