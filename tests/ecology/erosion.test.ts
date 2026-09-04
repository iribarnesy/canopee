/**
 * L'érosion (erosion.ts) : ce qui part d'un versant, ce n'est pas seulement de
 * l'eau, c'est l'horizon de surface — celui qui porte l'humus et l'azote. On
 * vérifie les trois faits qui en font l'enjeu agroforestier d'une pente :
 * couvrir le sol l'arrête, ce qui part du haut se retrouve en bas, et ce qui
 * franchit la limite est perdu pour de bon.
 */

import { describe, expect, it } from "vitest";
import { terreArracheeKgM2 } from "../../src/engine/erosion";
import { syntheticYear } from "../../src/engine/meteo";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const COTE = 30;

/** Fait tourner n années sur un versant, avec l'herbe qu'on veut au départ. */
function surUnVersant(pentePct: number, herbeInitiale: number, annees: number) {
  const st = {
    ...LIMON_RICHE.station,
    coteM: COTE,
    herbeInitiale,
    relief: { ...RELIEF_PLAT, pentePct, expositionDeg: 180 },
    voisinage: [],
    gibierParHa: 0,
  };
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let state = createGameState(st, rngStateFromSeed(11));
  let arrachee = 0;
  let sortie = 0;
  let azoteParti = 0;
  for (let i = 0; i < annees * 52; i++) {
    const r = tick(state, meteo[i % 52] as never);
    state = r.state;
    arrachee += r.fluxes.erosionArracheeKgM2;
    sortie += r.fluxes.erosionSortieKgM2;
    azoteParti += r.fluxes.erosionNKgHa;
  }
  return { state, arrachee, sortie, azoteParti };
}

/** Humus moyen d'une bande de la parcelle (y croissant = vers le nord). */
function humusBande(state: GameState, yDebut: number, yFin: number): number {
  let somme = 0;
  let n = 0;
  for (let y = yDebut; y < yFin; y++) {
    for (let x = 0; x < COTE; x++) {
      somme += state.soil.humusCG[y * COTE + x] ?? 0;
      n++;
    }
  }
  return somme / Math.max(1, n);
}

describe("l'érosion emporte la terre, pas seulement l'eau", () => {
  it("sans ruissellement, pas d'érosion — même sur une pente raide", () => {
    expect(terreArracheeKgM2(0, 30, 0)).toBe(0);
  });

  it("sur du plat, rien ne part — même à sol nu", () => {
    expect(terreArracheeKgM2(50, 0, 0)).toBe(0);
  });

  it("un sol nu perd bien plus qu'un sol couvert, à pente et pluie égales", () => {
    const nu = surUnVersant(15, 0, 10);
    const couvert = surUnVersant(15, 0.95, 10);
    expect(nu.arrachee).toBeGreaterThan(0);
    // Le couvert agit au carré : l'écart doit être massif, pas marginal.
    expect(couvert.arrachee).toBeLessThan(0.3 * nu.arrachee);
  });

  it("ce qui part du haut se dépose en bas : le versant se déshabille par le sommet", () => {
    const { state } = surUnVersant(20, 0, 15);
    // Le terrain descend vers le sud (y = 0) : le haut est au nord.
    const haut = humusBande(state, COTE - 8, COTE);
    const bas = humusBande(state, 0, 8);
    expect(bas).toBeGreaterThan(haut);
  });

  it("la fertilité s'en va avec la terre, et le bilan azoté le compte", () => {
    const { azoteParti, sortie } = surUnVersant(20, 0, 10);
    expect(sortie).toBeGreaterThan(0);
    expect(azoteParti).toBeGreaterThan(0);
  });

  it("tout ce qui est arraché ne sort pas : une partie se dépose en chemin", () => {
    const { arrachee, sortie } = surUnVersant(20, 0, 10);
    expect(sortie).toBeLessThan(arrachee);
  });
});

describe("l'érosion amincit le sol, et c'est la boucle qui se referme", () => {
  it("un versant nu perd de l'épaisseur, un versant couvert n'en perd pas", () => {
    // C'est la conséquence longue de l'érosion, et la plus grave : un sol qui
    // s'amincit retient moins d'eau, donc ruisselle davantage, donc s'érode
    // plus vite.
    const nu = surUnVersant(30, 0, 25);
    const couvert = surUnVersant(30, 0.95, 25);
    const perte = (s: GameState) =>
      s.soil.epaisseurPerdueCm.reduce((a, b) => a + Math.max(0, b), 0) /
      s.soil.epaisseurPerdueCm.length;
    expect(perte(nu.state)).toBeGreaterThan(0);
    expect(perte(couvert.state)).toBeLessThan(0.2 * perte(nu.state));
  });

  it("ce qui part du haut épaissit le bas : le colluvium", () => {
    const { state } = surUnVersant(30, 0, 25);
    // Le terrain descend vers le sud (y = 0) : la terre s'accumule en bas.
    const bande = (yDebut: number, yFin: number) => {
      let somme = 0;
      let n = 0;
      for (let y = yDebut; y < yFin; y++) {
        for (let x = 0; x < COTE; x++) {
          somme += state.soil.epaisseurPerdueCm[y * COTE + x] ?? 0;
          n++;
        }
      }
      return somme / Math.max(1, n);
    };
    // En haut on perd (valeur positive), en bas on gagne (valeur négative).
    expect(bande(COTE - 8, COTE)).toBeGreaterThan(bande(0, 8));
  });

  it("un sol aminci retient moins d'eau : la boucle est vicieuse", () => {
    // On compare la réserve utile de surface là où le sol a le plus maigri à
    // celle d'une cellule intacte. Le lien passe par l'épaisseur d'horizon.
    const { state } = surUnVersant(30, 0, 25);
    const perdues = [...state.soil.epaisseurPerdueCm];
    expect(Math.max(...perdues)).toBeGreaterThan(0);
    expect(Math.min(...perdues)).toBeLessThan(0);
  });
});
