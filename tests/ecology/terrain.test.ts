/**
 * Le terrain comme donnée (terrain.ts) : on dessine des altitudes, et l'eau
 * libre se DÉDUIT au lieu d'être déclarée. Creuser un trou fait une mare ;
 * percer ce trou sur le côté n'en fait plus ; un talweg assez drainé devient
 * un cours d'eau. Ensuite, la nappe et la ripisylve suivent sans savoir d'où
 * l'eau vient.
 */

import { describe, expect, it } from "vitest";
import { champDeNappeCm, profondeurNappeCm } from "../../src/engine/eau_surface";
import { syntheticYear } from "../../src/engine/meteo";
import { entreesDAmont, RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  accumulationEcoulement,
  eauxDuTerrain,
  remplirDepressions,
  sourcesDuTerrain,
} from "../../src/engine/terrain";
import { tick } from "../../src/engine/tick";

const COTE = 30;
const DIMS = { widthM: COTE, heightM: COTE };

/** Terrain plat, en m. */
function plat(): number[] {
  return new Array<number>(COTE * COTE).fill(10);
}

/** Creuse une cuvette conique de rayon r et de profondeur p autour de (cx, cy). */
function creuser(alt: number[], cx: number, cy: number, r: number, p: number): number[] {
  const out = [...alt];
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r) out[y * COTE + x] = (out[y * COTE + x] ?? 0) - p * (1 - d / r);
    }
  }
  return out;
}

describe("le terrain fabrique son eau", () => {
  it("un trou creusé au milieu d'un plat devient une mare", () => {
    const eaux = eauxDuTerrain(creuser(plat(), 15, 15, 5, 1.5), DIMS);
    const cellules = eaux.enEau.filter(Boolean).length;
    expect(cellules).toBeGreaterThan(20);
    // La surface libre est horizontale : toutes les cellules en eau au même
    // niveau, celui du déversoir.
    const niveaux = eaux.niveauM.filter((_, i) => eaux.enEau[i]);
    const min = Math.min(...niveaux);
    const max = Math.max(...niveaux);
    expect(max - min).toBeLessThan(0.01);
    // Le centre de la cuvette est bien en eau, les coins ne le sont pas.
    expect(eaux.enEau[15 * COTE + 15]).toBe(true);
    expect(eaux.enEau[0]).toBe(false);
  });

  it("le même trou, percé jusqu'au bord, ne retient plus rien", () => {
    // On creuse une saignée du trou jusqu'à la bordure : le déversoir descend
    // au niveau du fond, il n'y a plus de cuvette.
    const alt = creuser(plat(), 15, 15, 5, 1.5);
    for (let y = 0; y <= 15; y++) alt[y * COTE + 15] = 8.4;
    const eaux = eauxDuTerrain(alt, DIMS);
    expect(eaux.enEau.filter(Boolean).length).toBeLessThan(5);
  });

  it("un talweg qui draine assez de surface devient un cours d'eau", () => {
    // Vallée en V descendant vers le sud, plus un bassin d'amont.
    const alt = new Array<number>(COTE * COTE);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) {
        alt[y * COTE + x] = 10 + y * 0.15 + Math.abs(x - 15) * 0.08;
      }
    }
    const sansAmont = eauxDuTerrain(alt, DIMS);
    // Un bassin d'amont à l'échelle de la parcelle : 0,3 ha versant sur
    // 900 m². Au-delà, ce n'est plus un ruisseau qui traverse, c'est une
    // inondation, et la notion de lit n'a plus de sens.
    const avecAmont = eauxDuTerrain(alt, DIMS, { apportAmontM2: 3000 });
    expect(sansAmont.enEau.filter(Boolean).length).toBe(0);
    const lit = avecAmont.enEau.filter(Boolean).length;
    expect(lit).toBeGreaterThan(5);
    // Le lit suit le fond du V : l'écart moyen à l'axe reste faible devant la
    // demi-largeur de la parcelle.
    const ecarts = avecAmont.enEau
      .map((e, i) => (e ? Math.abs((i % COTE) - 15) : -1))
      .filter((v) => v >= 0);
    const ecartMoyen = ecarts.reduce((s2, v) => s2 + v, 0) / ecarts.length;
    expect(ecartMoyen).toBeLessThan(3);
  });

  it("le remplissage ne descend jamais sous le terrain", () => {
    const alt = creuser(creuser(plat(), 8, 8, 4, 2), 22, 20, 6, 1);
    const remplies = remplirDepressions(alt, DIMS);
    for (let i = 0; i < alt.length; i++) {
      expect(remplies[i] ?? 0).toBeGreaterThanOrEqual((alt[i] ?? 0) - 1e-9);
    }
  });

  it("l'accumulation conserve les surfaces : le point bas reçoit tout", () => {
    const alt = new Array<number>(COTE * COTE);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) alt[y * COTE + x] = 10 + y * 0.2 + x * 0.001;
    }
    const acc = accumulationEcoulement(alt, DIMS);
    expect(Math.max(...acc)).toBeGreaterThan(COTE);
  });

  it("deux mares à des hauteurs différentes gardent chacune sa cote", () => {
    // Deux cuvettes sur un versant : leurs déversoirs ne sont pas à la même
    // hauteur, donc leurs surfaces libres non plus. C'est ce que le champ de
    // nappe doit transporter — sinon les deux mares se mélangeraient.
    const versant = new Array<number>(COTE * COTE);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) versant[y * COTE + x] = 10 + y * 0.2;
    }
    const alt = creuser(creuser(versant, 7, 7, 4, 2.5), 23, 23, 4, 2.5);
    const sources = sourcesDuTerrain(alt, DIMS);
    if (!sources) throw new Error("aucune eau");
    const niveaux = sources.niveauM.filter((_, i) => sources.enEau[i]);
    expect(Math.max(...niveaux) - Math.min(...niveaux)).toBeGreaterThan(0.5);
  });
});

describe("la mare creusée vaut la mare déclarée", () => {
  it("la nappe d'un trou creusé ressemble à celle d'une mare posée au même endroit", () => {
    const profil = LIMON_RICHE.station.profil;
    const alt = creuser(plat(), 15, 15, 5, 1.2);
    const creusee = champDeNappeCm(sourcesDuTerrain(alt, DIMS), alt, DIMS, profil);
    const declaree = profondeurNappeCm(
      { type: "mare", xRel: 0.5, yRel: 0.5, rayonM: 4, bergeM: 0.9 },
      plat(),
      DIMS,
      profil,
    );
    // Au bord de l'eau, les deux nappes sont proches de la surface ; loin, les
    // deux sont hors de portée. C'est le même mécanisme.
    const auBord = 15 * COTE + 21;
    const auCoin = 0;
    // Même forme : la nappe est à portée de racines au bord de l'eau, hors de
    // portée au coin opposé. Les cotes exactes diffèrent — une cuvette pleine
    // à ras bord n'est pas une mare encaissée de 90 cm — mais le mécanisme
    // est le même et il ne sait pas laquelle des deux il traite.
    expect(creusee[auBord] ?? 0).toBeLessThan(150);
    expect(declaree[auBord] ?? 0).toBeLessThan(150);
    expect(creusee[auCoin] ?? 0).toBeGreaterThan(150);
    expect(declaree[auCoin] ?? 0).toBeGreaterThan(150);
  });

  it("autour du trou creusé, le hêtre souffre et l'aulne non", () => {
    const alt = creuser(plat(), 15, 15, 6, 1.4);
    const st = {
      ...LIMON_RICHE.station,
      coteM: COTE,
      relief: { ...RELIEF_PLAT, altitudesM: alt },
      eau: { type: "terrain" as const, bergeM: 0 },
      drainageExterneMmSemaine: 40,
      voisinage: [],
      gibierParHa: 0,
    };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(st, rngStateFromSeed(5));
    // Deux couronnes : au bord de l'eau, et dans le coin sec.
    for (let k = 0; k < 4; k++) {
      state = plantAt(state, "fagus_sylvatica", 22 + k * 0.6, 15, 0.5);
      state = plantAt(state, "alnus_glutinosa", 15, 22 + k * 0.6, 0.5);
      state = plantAt(state, "fagus_sylvatica", 2 + k * 0.6, 2, 0.5);
      state = plantAt(state, "alnus_glutinosa", 2, 5 + k * 0.6, 0.5);
    }
    for (let i = 0; i < 12 * 52; i++) state = tick(state, meteo[i % 52] as never).state;
    const hauteur = (especeId: string, pres: boolean) =>
      state.trees
        .filter((t) => {
          if (t.especeId !== especeId || !t.alive) return false;
          const loinDuCentre = Math.hypot(t.x - 15, t.y - 15) > 12;
          return pres ? !loinDuCentre : loinDuCentre;
        })
        .reduce((s, t, _, a) => s + t.heightM / a.length, 0);
    // Le hêtre au bord de la mare est plus petit que le hêtre du coin sec ;
    // l'aulne, lui, ne perd rien à avoir les pieds dans l'eau.
    expect(hauteur("fagus_sylvatica", true)).toBeLessThan(hauteur("fagus_sylvatica", false));
    expect(hauteur("alnus_glutinosa", true)).toBeGreaterThan(
      0.9 * hauteur("alnus_glutinosa", false),
    );
  });
});

describe("une cuvette ne tient pas l'eau partout", () => {
  const cuvette = creuser(plat(), 15, 15, 5, 1.5);
  const sable = [
    {
      epaisseurCm: 30,
      sable: 0.9,
      limon: 0.07,
      argile: 0.03,
      pierrosite: 0,
      moPct: 1,
      ph: 6,
      induration: 0,
    },
  ];
  const argile = [
    {
      epaisseurCm: 30,
      sable: 0.1,
      limon: 0.3,
      argile: 0.6,
      pierrosite: 0,
      moPct: 2,
      ph: 7,
      induration: 0,
    },
  ];

  it("dans du sable, le trou se vide : pas de mare", () => {
    const eaux = eauxDuTerrain(cuvette, DIMS, { pluieAnnuelleMm: 800, profil: sable });
    expect(eaux.enEau.filter(Boolean).length).toBe(0);
  });

  it("dans de l'argile, le même trou tient l'eau", () => {
    const eaux = eauxDuTerrain(cuvette, DIMS, { pluieAnnuelleMm: 800, profil: argile });
    expect(eaux.enEau.filter(Boolean).length).toBeGreaterThan(20);
  });

  it("un cours d'eau, lui, n'a pas à se justifier : l'amont l'alimente", () => {
    const alt = new Array<number>(COTE * COTE);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) alt[y * COTE + x] = 10 + y * 0.15 + Math.abs(x - 15) * 0.08;
    }
    const eaux = eauxDuTerrain(alt, DIMS, {
      apportAmontM2: 3000,
      pluieAnnuelleMm: 800,
      profil: sable,
    });
    expect(eaux.enEau.filter(Boolean).length).toBeGreaterThan(5);
  });
});

describe("les bords de la parcelle", () => {
  it("l'eau d'amont entre par la bordure haute, pas en pluie uniforme", () => {
    const alt = new Array<number>(COTE * COTE);
    for (let y = 0; y < COTE; y++) {
      for (let x = 0; x < COTE; x++) alt[y * COTE + x] = 10 + y * 0.2;
    }
    const poids = entreesDAmont(alt, DIMS);
    const somme = poids.reduce((s, v) => s + v, 0);
    expect(somme).toBeCloseTo(1, 9);
    // Tout arrive par le haut (y = 29), rien par le bas ni par le milieu.
    const enHaut = poids.slice((COTE - 1) * COTE).reduce((s, v) => s + v, 0);
    // La majorité entre par la crête ; le reste par le haut des côtés, ce qui
    // est juste aussi — une parcelle en pente reçoit de l'eau sur tout son
    // pourtour amont.
    expect(enHaut).toBeGreaterThan(0.55);
    expect(poids[0]).toBe(0);
    expect(poids[15 * COTE + 15]).toBe(0);
  });

  it("sur un terrain plat, faute de bordure haute, elle entre par tout le pourtour", () => {
    const poids = entreesDAmont(plat(), DIMS);
    expect(poids.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
    expect(poids[0]).toBeGreaterThan(0);
    // Mais jamais par l'intérieur : ce qui entre traverse une bordure.
    expect(poids[15 * COTE + 15]).toBe(0);
  });
});
