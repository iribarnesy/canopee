/**
 * Relief et écoulement latéral (docs/regles.md §2).
 *
 * Le moteur raisonnait sur une parcelle plate et hydrologiquement isolée :
 * chaque mètre carré recevait sa pluie et ne parlait jamais à ses voisins.
 * Cette simplification interdisait tout un pan du réel — le bas de pente
 * humide et la crête sèche sur la même parcelle, l'effet entonnoir d'un
 * vallon, l'eau qui arrive de l'amont, le versant sud qui grille.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import {
  altitudeParCellule,
  anomalieAltitudeC,
  anomalieExpositionC,
  coefficientRuissellement,
  facteurExpositionRayonnement,
  fractionRuissellement,
  ordreDeDescente,
  RELIEF_PLAT,
  type Relief,
  voisineAval,
} from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const DIMS = { widthM: 20, heightM: 20 };

function relief(patch: Partial<Relief>): Relief {
  return { ...RELIEF_PLAT, ...patch };
}

describe("le terrain a une forme", () => {
  it("sur un versant, l'eau descend : les altitudes suivent la pente", () => {
    // Pente vers le sud (azimut 180) : le nord de la parcelle est en haut.
    const a = altitudeParCellule(relief({ pentePct: 20, expositionDeg: 180 }), DIMS);
    const nord = a[19 * 20 + 10] ?? 0;
    const sud = a[0 * 20 + 10] ?? 0;
    expect(nord).toBeGreaterThan(sud);
    // Vingt pour cent sur vingt mètres : environ quatre mètres de dénivelé.
    expect(nord - sud).toBeGreaterThan(3);
  });

  it("un vallon creuse au milieu, une croupe le bombe — c'est l'effet entonnoir", () => {
    const p = { pentePct: 15, expositionDeg: 180 };
    const vallon = altitudeParCellule(relief({ ...p, forme: "vallon" }), DIMS);
    const croupe = altitudeParCellule(relief({ ...p, forme: "croupe" }), DIMS);
    const auMilieu = (a: number[]) => (a[10 * 20 + 10] ?? 0) - (a[10 * 20 + 1] ?? 0);
    // Dans un vallon, le milieu est plus BAS que les côtés : l'eau des deux
    // versants s'y rassemble. Sur une croupe, l'inverse.
    expect(auMilieu(vallon)).toBeLessThan(0);
    expect(auMilieu(croupe)).toBeGreaterThan(0);
  });

  it("l'eau connaît sa voisine d'aval, et sort au point bas", () => {
    const a = altitudeParCellule(relief({ pentePct: 20, expositionDeg: 180 }), DIMS);
    const aval = voisineAval(a, DIMS);
    // Une cellule du haut a une voisine plus basse.
    expect(aval[19 * 20 + 10]).toBeGreaterThanOrEqual(0);
    // La rangée du bas n'en a plus : l'eau quitte la parcelle.
    expect(aval[0 * 20 + 10]).toBe(-1);
  });

  it("on traite les cellules du haut vers le bas : l'eau cascade en une passe", () => {
    const a = altitudeParCellule(relief({ pentePct: 20, expositionDeg: 180 }), DIMS);
    const ordre = ordreDeDescente(a);
    const premier = ordre[0] ?? 0;
    const dernier = ordre[ordre.length - 1] ?? 0;
    expect(a[premier] ?? 0).toBeGreaterThan(a[dernier] ?? 0);
  });

  it("sur du plat, rien ne ruisselle ; sur une pente franche, presque tout", () => {
    expect(fractionRuissellement(0)).toBe(0);
    expect(fractionRuissellement(40)).toBeGreaterThan(0.8);
  });
});

describe("ce qui décide de ruisseler ou de s'infiltrer", () => {
  it("sur du plat, rien ne ruisselle ; plus ça penche, plus ça part", () => {
    expect(coefficientRuissellement(0, 0.3, 0.5)).toBe(0);
    expect(coefficientRuissellement(30, 0.3, 0.5)).toBeGreaterThan(
      3 * coefficientRuissellement(3, 0.3, 0.5),
    );
  });

  it("COUVRIR LE SOL est ce qui garde l'eau : un sol nu ruisselle trois fois plus", () => {
    // Un couvert d'herbe et de litière casse l'énergie des gouttes et laisse
    // l'eau entrer. C'est pour ça qu'un labour érode et qu'un sol couvert
    // encaisse — et ça se paie directement en eau disponible.
    const nu = coefficientRuissellement(20, 0, 0.5);
    const couvert = coefficientRuissellement(20, 1, 0.5);
    expect(nu).toBeGreaterThan(3 * couvert);
  });

  it("un sol déjà plein ne peut plus rien prendre : ce sont les crues d'hiver", () => {
    expect(coefficientRuissellement(20, 0.3, 1)).toBeGreaterThan(
      2 * coefficientRuissellement(20, 0.3, 0),
    );
  });
});

describe("l'altitude et l'exposition", () => {
  it("il fait plus froid en montagne : 0,6 °C par cent mètres", () => {
    expect(anomalieAltitudeC(relief({ altitudeM: 1080 }), 80)).toBeCloseTo(-6, 1);
    expect(anomalieAltitudeC(relief({ altitudeM: 80 }), 80)).toBeCloseTo(0, 10);
  });

  it("adret et ubac : un versant sud reçoit nettement plus qu'un versant nord", () => {
    const sud = facteurExpositionRayonnement(relief({ pentePct: 40, expositionDeg: 180 }));
    const nord = facteurExpositionRayonnement(relief({ pentePct: 40, expositionDeg: 0 }));
    expect(sud).toBeGreaterThan(1.15);
    expect(nord).toBeLessThan(0.85);
    // À plat, pas d'exposition qui tienne.
    expect(facteurExpositionRayonnement(RELIEF_PLAT)).toBe(1);
  });
});

describe("dans une partie : le bas de pente est plus frais que la crête", () => {
  it("après un hiver, l'eau s'est accumulée en bas du versant", () => {
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    const station: Station = {
      ...LIMON_RICHE.station,
      coteM: 30,
      voisinage: [],
      gibierParHa: 0,
      relief: relief({ pentePct: 25, expositionDeg: 180, bassinAmontHa: 0 }),
    };
    let state = createGameState(station, rngStateFromSeed(2));
    for (let i = 0; i < 40; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const nH = station.profil.length;
    const eauLigne = (y: number) => {
      let somme = 0;
      for (let x = 0; x < 30; x++) somme += state.soil.waterMm[(y * 30 + x) * nH] ?? 0;
      return somme / 30;
    };
    // Le bas du versant (y = 0, vers le sud) a reçu l'eau de tout l'amont.
    expect(eauLigne(0)).toBeGreaterThan(eauLigne(29));
  });

  it("un vallon qui draine six hectares reçoit bien plus que ce qui lui tombe dessus", () => {
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    const base: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [], gibierParHa: 0 };
    const apport = (bassinAmontHa: number) => {
      let state = createGameState(
        { ...base, relief: relief({ pentePct: 5, bassinAmontHa }) },
        rngStateFromSeed(2),
      );
      let entrant = 0;
      for (let i = 0; i < 52; i++) {
        const w = weather[i % weather.length];
        if (!w) throw new Error("météo manquante");
        const r = advanceWeek(state, w, []);
        state = r.state;
        entrant += r.fluxes.ruissellementEntrantMm;
      }
      return entrant;
    };
    expect(apport(0)).toBe(0);
    expect(apport(6)).toBeGreaterThan(50);
  });
});

describe("l'adret est plus chaud, pas seulement plus sec", () => {
  it("l'écart adret/ubac reste dans la fourchette de terrain", () => {
    // Le seul vrai contrôle possible ici : confronter le chiffre du moteur à
    // ce que mesurent les relevés. Sous nos latitudes, l'écart de température
    // de l'AIR entre deux versants opposés de forte pente se compte en
    // dixièmes de degré à un degré et demi — bien moins que l'écart des
    // températures de sol, qui atteint plusieurs degrés et qu'on ne modélise
    // pas. Un test qui se contenterait de vérifier que `adret === +CONSTANTE`
    // ne vérifierait que l'algèbre de sa propre formule.
    const raide = { ...RELIEF_PLAT, pentePct: 50 };
    const ecart =
      anomalieExpositionC({ ...raide, expositionDeg: 180 }) -
      anomalieExpositionC({ ...raide, expositionDeg: 0 });
    expect(ecart).toBeGreaterThan(0.6);
    expect(ecart).toBeLessThan(4);
  });

  it("la chaleur et la soif ont la MÊME cause : elles ne peuvent pas diverger", () => {
    // C'est l'argument physique qui a motivé le mécanisme : le rayonnement
    // supplémentaire d'un adret évapore ET chauffe. Les deux effets se
    // déduisent donc d'un seul facteur, et le rapport de l'un à l'autre est le
    // même quelle que soit la pente ou l'orientation.
    const cas = [
      { pentePct: 10, expositionDeg: 180 },
      { pentePct: 35, expositionDeg: 180 },
      { pentePct: 60, expositionDeg: 0 },
      { pentePct: 25, expositionDeg: 225 },
    ];
    const rapports = cas.map((c) => {
      const relief = { ...RELIEF_PLAT, ...c };
      return anomalieExpositionC(relief) / (facteurExpositionRayonnement(relief) - 1);
    });
    for (const r of rapports) expect(r).toBeCloseTo(rapports[0] ?? 0, 6);
  });

  it("sans pente, ni chaleur ni soif supplémentaires — les deux s'annulent ensemble", () => {
    for (const deg of [0, 90, 180, 270]) {
      const plat = { ...RELIEF_PLAT, expositionDeg: deg };
      expect(Math.abs(anomalieExpositionC(plat))).toBe(0);
      expect(facteurExpositionRayonnement(plat)).toBe(1);
    }
  });

  it("l'est et l'ouest sont à mi-chemin, et l'écart croît avec la pente", () => {
    const sud = (p: number) =>
      anomalieExpositionC({ ...RELIEF_PLAT, pentePct: p, expositionDeg: 180 });
    expect(
      Math.abs(anomalieExpositionC({ ...RELIEF_PLAT, pentePct: 50, expositionDeg: 90 })),
    ).toBeLessThan(0.001);
    expect(sud(10)).toBeGreaterThan(0);
    expect(sud(30)).toBeGreaterThan(sud(10));
    expect(sud(50)).toBeGreaterThan(sud(30));
  });
});
