/**
 * **L'eau du tapis** (critères A3 et A18, #391, #210).
 *
 * Une prairie fermée buvait autant qu'un sol nu, environ 320 mm/an sur le limon
 * riche : sous le tapis, le sol évaporait comme s'il était découvert, et la
 * strate ne transpirait que 0,3 fois l'ETP. Le pied désherbé d'un plant était
 * donc plus sec que le pied enherbé, l'inverse de ce que le terrain mesure.
 *
 * Le terrain, pour ce qui est vérifié ici :
 *  - un gazon boit plus qu'un sol nu sur l'année : 483 mm contre 371 sous les
 *    lysimètres de Châlons-sur-Marne, 1973-1980 (Ballif et al. 1983,
 *    *Agronomie*) ;
 *  - le déficit hydrique d'été est plus grand sous l'herbe que sous un sol nu,
 *    parce qu'un sol nu cesse vite d'évaporer une fois sa surface sèche (Davies
 *    et Gardiner 1989, *Arboriculture Research Note* 59/89/ARB) ;
 *  - un sol nu draine encore l'été : un quart de la pluie de juin à août sous
 *    les jauges de Rothamsted (*Rothamsted Report for 1936*, p. 176, moyenne
 *    1870-1936), presque rien sous une prairie.
 *
 * Le banc : un carré de 10 m de limon riche, sans arbre, sans bassin amont (le
 * bilan vertical seul, comme une case lysimétrique), la météo réelle
 * d'Abbeville depuis 1964. Un an d'amorce, cinq ans comptés. Le sol nu est tenu
 * sans herbe chaque semaine, l'herbe tuée versée à la litière : aucun geste du
 * jeu ne désherbe (#392). Rien n'est tiré au hasard sur ce banc.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { CARBON_FRACTION } from "../../src/engine/carbon";
import { N_HERBACEES, rabattreParEspece } from "../../src/engine/herbacees";
import { serieToWeeks } from "../../src/engine/meteo";
import { litterDecayRate } from "../../src/engine/nitrogen";
import { potassiumDeLaStrateG } from "../../src/engine/pk";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Tient toute la parcelle sans herbe : l'herbe tuée part à la litière. */
function desherber(state: GameState): void {
  const s = state.soil;
  let carbone = 0;
  for (let i = 0; i < s.herbeCouverture.length; i++) {
    let c = 0;
    let n = 0;
    for (let k = 0; k < N_HERBACEES; k++) {
      const j = i * N_HERBACEES + k;
      c += (s.herbeMatiereSecheG[j] ?? 0) * CARBON_FRACTION;
      n += s.herbeAzoteG[j] ?? 0;
      s.herbeMatiereSecheG[j] = 0;
      s.herbeAzoteG[j] = 0;
    }
    s.potassiumG[i] = (s.potassiumG[i] ?? 0) + potassiumDeLaStrateG(n);
    if (n > 0) {
      const avant = s.litterNG[i] ?? 0;
      if (c > 0)
        s.litterK[i] = (avant * (s.litterK[i] ?? 0) + n * litterDecayRate(c / n)) / (avant + n);
      s.litterNG[i] = avant + n;
      s.litterCG[i] = (s.litterCG[i] ?? 0) + c;
    }
    carbone += c;
    s.herbeCouverture[i] = 0;
    s.herbeBiomasse[i] = 0;
    rabattreParEspece(s.herbeFeuillage, i * N_HERBACEES, 0);
    rabattreParEspece(s.herbeEmprise, i * N_HERBACEES, 0);
  }
  state.carbon.nppCumKgC += carbone / 1000;
}

interface Bilan {
  pluie: number;
  /** évaporation du sol et transpiration de la strate, mm/an */
  et: number;
  drainageEteSurPluieEte: number;
  /** eau de l'horizon de surface, juillet-août, mm */
  surfaceEteMm: number;
}

function bilan(nu: boolean): Bilan {
  const station: Station = {
    ...LIMON_RICHE.station,
    coteM: 10,
    voisinage: [],
    gibierParHa: 0,
    relief: { ...LIMON_RICHE.station.relief, bassinAmontHa: 0 },
    herbeInitiale: nu ? 0 : LIMON_RICHE.station.herbeInitiale,
  };
  const serie = serieMeteoPour("limon-riche");
  if (!serie) throw new Error("série manquante");
  const meteo = serieToWeeks(serie);
  let state = createGameState(station, rngStateFromSeed(1));
  const nH = station.profil.length;
  const ans = 5;
  let pluie = 0;
  let et = 0;
  let pluieEte = 0;
  let drainageEte = 0;
  let surface = 0;
  let nSurface = 0;
  for (let w = 0; w < (ans + 1) * 52; w++) {
    if (nu) desherber(state);
    const semaine = meteo[w];
    if (!semaine) throw new Error("météo manquante");
    const r = tick(state, semaine);
    state = r.state;
    if (w < 52) continue;
    const s = w % 52;
    pluie += r.fluxes.rainMm;
    et += r.fluxes.evapMm + r.fluxes.transpirationMm;
    if (s >= 22 && s < 35) {
      pluieEte += r.fluxes.rainMm;
      drainageEte += r.fluxes.drainageMm;
    }
    if (s >= 26 && s < 35) {
      for (let i = 0; i < state.soil.herbeCouverture.length; i++) {
        surface += state.soil.waterMm[i * nH] ?? 0;
        nSurface++;
      }
    }
  }
  return {
    pluie: pluie / ans,
    et: et / ans,
    drainageEteSurPluieEte: drainageEte / pluieEte,
    surfaceEteMm: surface / nSurface,
  };
}

describe("l'eau du tapis : ce qu'une prairie boit, et ce qu'un sol nu garde", () => {
  const prairie = bilan(false);
  const nu = bilan(true);

  it("la prairie boit davantage que le sol nu sur l'année", () => {
    // Châlons : 112 mm d'écart (483 contre 371). Prédit avant la mesure, sur ce
    // banc : de 60 à 160 mm. L'essai garde la moitié de l'écart de Châlons, pas
    // un chiffre du moteur.
    expect(prairie.et - nu.et).toBeGreaterThan(56);
  });

  it("en été, la surface est plus sèche sous la prairie que sous le sol nu", () => {
    expect(prairie.surfaceEteMm).toBeLessThan(nu.surfaceEteMm);
  });

  it("le sol nu draine encore en été, la prairie presque plus", () => {
    expect(nu.drainageEteSurPluieEte).toBeGreaterThan(prairie.drainageEteSurPluieEte);
    expect(nu.drainageEteSurPluieEte).toBeGreaterThan(0.1);
  });

  it("le sol nu évapore entre le tiers et les deux tiers de la pluie", () => {
    // Rothamsted 47 à 49 % (trois jauges, 1870-1936), Châlons 57 % : une bande
    // large autour des deux, qui attrape un sol qui ne s'arrête plus d'évaporer
    // ou qui n'évapore plus.
    expect(nu.et / nu.pluie).toBeGreaterThan(1 / 3);
    expect(nu.et / nu.pluie).toBeLessThan(2 / 3);
  });
});
