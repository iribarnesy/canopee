/**
 * **Une racine qui touche l'eau ne boit qu'à proportion de ce qu'elle y met** (#312).
 *
 * La satisfaction en eau d'un arbre vaut ω / max(ω, ωc), avec ω la somme, sur
 * les horizons, de la part de ses racines dans l'horizon fois la disponibilité
 * de son eau (`fractionsRacinairesParHorizon`, `drynessFactor`). Un arbre dont
 * la surface est sèche et qui n'entre que d'un centimètre dans un horizon humide
 * n'y a que quelques pour cent de ses racines : il ne doit recevoir que quelques
 * pour cent de sa demande, pas la voir servie parce que « ses racines touchent
 * l'eau ». Le défaut que #312 a d'abord soupçonné était celui-là ; la mesure
 * l'a écarté, et cet essai le garde écarté.
 *
 * Le dispositif : une parcelle de sable à deux horizons (20 et 55 cm, les
 * textures de la lande), sans herbe, un hêtre de trente centimètres seul au
 * milieu. On l'amène à l'été, puis on vide l'horizon de surface, on remplit
 * l'horizon profond à sa réserve utile, on fixe la profondeur de ses racines
 * et on fait passer une semaine sans pluie. Sa transpiration, rapportée à celle
 * du même arbre sur un profil plein, est sa satisfaction en eau.
 *
 * Prédit avant la mesure, des formules du moteur (L = 15 cm, ωc = 0,9) :
 * à 21 cm de racines, 2,3 % d'entre elles sont dans l'horizon humide, et
 * l'arbre reçoit 0,023 / 0,9 = 2,5 % de sa demande ; à 30 cm, 14,8 % et 16,5 %.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon, ruHorizonMm } from "../../src/engine/soil";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LANDE_SECHE, stationDepuisProfil } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { fractionsRacinairesParHorizon } from "../../src/engine/trees";

const PROFIL = [
  horizon(20, { sable: 85, limon: 10, argile: 5 }, { moPct: 1.8, ph: 5.5 }),
  horizon(55, { sable: 92, limon: 6, argile: 2 }, { moPct: 0.4, ph: 5.5 }),
];
const station = {
  ...stationDepuisProfil({
    ...LANDE_SECHE.station,
    id: "sable-deux-horizons",
    nom: "Sable à deux horizons",
    relief: RELIEF_PLAT,
    profil: PROFIL,
    initialMineralNKgHa: 30,
    herbeInitiale: 0,
    coteM: 6,
  }),
  voisinage: [],
  gibierParHa: 0,
  ventExposition: 0,
};
const meteo = syntheticYear(LANDE_SECHE.climat);
const SEMAINE_ETE = 28;

/** Le hêtre amené à l'été, feuilles sorties, sur la parcelle sans herbe. */
function aLEte(): GameState {
  let state = createGameState(station, rngStateFromSeed(7));
  state = plantAt(state, "fagus_sylvatica", 3, 3, 0.3);
  for (let w = 0; w < SEMAINE_ETE; w++) {
    const m = meteo[w];
    if (!m) throw new Error("météo manquante");
    state = tick(state, m).state;
  }
  return state;
}
const ETE = aLEte();

/** Transpiration d'une semaine sans pluie, L, pour un remplissage et une profondeur donnés. */
function transpiration(surfacePleine: boolean, racinesCm: number): number {
  const nH = PROFIL.length;
  const eau = new Float64Array(ETE.soil.waterMm.length);
  for (let i = 0; i < eau.length / nH; i++) {
    eau[i * nH] = surfacePleine ? ruHorizonMm(PROFIL[0]!) : 0;
    eau[i * nH + 1] = ruHorizonMm(PROFIL[1]!);
  }
  const state: GameState = {
    ...ETE,
    soil: { ...ETE.soil, waterMm: eau },
    trees: ETE.trees.map((t) => ({ ...t, rootDepthCm: racinesCm })),
  };
  const m = meteo[SEMAINE_ETE];
  if (!m) throw new Error("météo manquante");
  const r = tick(state, { ...m, rainMm: 0 });
  return r.fluxes.transpirationMm * station.coteM * station.coteM;
}

describe("la soif d'une racine qui touche à peine l'eau (#312)", () => {
  const demande = transpiration(true, 21);
  const unCentimetre = transpiration(false, 21);
  const dixCentimetres = transpiration(false, 30);

  it("le hêtre transpire quand son profil est plein", () => {
    expect(ETE.trees[0]?.alive).toBe(true);
    expect(demande).toBeGreaterThan(0);
  });

  it("un centimètre dans l'horizon humide ne rend qu'une petite part de la demande", () => {
    const part = unCentimetre / demande;
    expect(part).toBeLessThan(0.05);
    // **proportionnelle** à ses racines dans l'horizon, rabattue de ωc
    const racines = fractionsRacinairesParHorizon([20, 55], 21)[1] ?? 0;
    expect(part).toBeCloseTo(racines / 0.9, 2);
  });

  it("dix centimètres en rendent nettement plus, toujours à proportion des racines", () => {
    const part = dixCentimetres / demande;
    expect(part).toBeGreaterThan(4 * (unCentimetre / demande));
    const racines = fractionsRacinairesParHorizon([20, 55], 30)[1] ?? 0;
    expect(part).toBeCloseTo(racines / 0.9, 2);
  });
});
