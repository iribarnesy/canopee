/**
 * La traduction état → instantané (src/game/snapshot.ts).
 *
 * Elle vivait dans le worker, et personne ne l'instancie dans un test : un
 * `filter((t) => t.alive)` posé avant `chandelle: !t.alive` a donc rendu ce
 * drapeau constamment faux et les troncs morts sur pied invisibles, sans
 * qu'un seul test ne bronche. Ces essais sont le garde-fou : ils regardent ce
 * que le rendu reçoit RÉELLEMENT, pas ce que le moteur calcule.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { contextePhenologique } from "../../src/engine/phenologie";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";
import {
  arbreDuSnapshot,
  construireSnapshot,
  type EntreesSnapshot,
  transferablesDuSnapshot,
} from "../../src/game/snapshot";

const STATION: Station = {
  ...LIMON_RICHE.station,
  coteM: 12,
  voisinage: [],
  gibierParHa: 0,
};
const WEATHER = syntheticYear(LIMON_RICHE.climat);

function etatNeuf() {
  return createGameState(STATION, rngStateFromSeed(7));
}

function entrees(state: ReturnType<typeof etatNeuf>): EntreesSnapshot {
  const w = WEATHER[state.week % WEATHER.length];
  if (!w) throw new Error("météo manquante");
  const ticked = tick(state, w);
  return {
    state: ticked.state,
    weather: w,
    anneeCivile: 2026,
    paysage: "bocage",
    initialSoilCTHa: STATION.initialSoilCTHa,
    fluxes: ticked.fluxes,
    debordementParCellule: ticked.debordementParCellule,
    lumiereAuSol: ticked.lumiereAuSol,
    refusals: [],
    events: [],
    morts: ticked.morts,
    gestes: ticked.gestes,
    chutes: ticked.chutes,
    incendie: ticked.incendie,
  };
}

describe("les arbres de l'instantané", () => {
  const vivant: TreeState = {
    id: 1,
    especeId: "carpinus_betulus",
    x: 3,
    y: 4,
    ageWeeks: 520,
    heightM: 9,
    stress: 1,
    alive: true,
    uptakeYearG: 10,
    fruitsKg: 2,
    fruitProgress: 0.4,
    bloomFrosted: false,
    hauteurElagueeM: 2,
    recepages: 2,
    teteTrogneM: 1.8,
    rootDepthCm: 80,
    pousseTendreM: 0.3,
    dommageHydraulique: 0.25,
    vigueur: 0.6,
    vigueurIndividuelle: 1.1,
    protege: false,
    derniereLeveeSemaine: 44,
    frotteSemaine: 12,
  };

  it("porte les chandelles, et les dit chandelles", () => {
    const mort = { ...vivant, id: 2, alive: false, mortSemaine: 300 } as TreeState;
    let state = etatNeuf();
    state = { ...state, trees: [vivant, mort] };
    const snapshot = construireSnapshot({ ...entrees(state), state });

    // Le piège d'origine : filtrer les vivants AVANT de calculer `chandelle`
    // laissait ce drapeau à false partout et escamotait les troncs morts.
    expect(snapshot.trees).toHaveLength(2);
    expect(snapshot.trees.map((t) => t.chandelle)).toEqual([false, true]);
    expect(snapshot.trees[1]?.mortSemaine).toBe(300);
  });

  it("transporte ce qui donne à un arbre sa silhouette", () => {
    const t = arbreDuSnapshot(vivant);
    // La trogne, la cime sèche, l'arbre qui végète, l'écorce arrachée :
    // chacun de ces champs porte un visuel, et aucun ne se déduit des autres.
    expect(t.teteTrogneM).toBe(1.8);
    expect(t.recepages).toBe(2);
    expect(t.vigueur).toBe(0.6);
    expect(t.dommageHydraulique).toBe(0.25);
    expect(t.fruitProgress).toBe(0.4);
    expect(t.pousseTendreM).toBe(0.3);
    expect(t.frotteSemaine).toBe(12);
    expect(t.derniereLeveeSemaine).toBe(44);
  });

  it("dit de quoi l'arbre est mort — onze causes, onze récits", () => {
    const brule = {
      ...vivant,
      alive: false,
      mortSemaine: 200,
      brulEeSemaine: 199,
      causeMort: "feu",
    } as TreeState;
    const t = arbreDuSnapshot(brule);
    expect(t.causeMort).toBe("feu");
    // La chandelle NOIRE se distingue de la grise par cette seule semaine.
    expect(t.brulEeSemaine).toBe(199);
  });
});

describe("les grilles de l'instantané", () => {
  it("porte le relief de l'eau, la lumière au sol et la litière", () => {
    const state = etatNeuf();
    const snapshot = construireSnapshot(entrees(state));
    const nCells = STATION.coteM * STATION.coteM;
    expect(snapshot.soilDebordementMm).toHaveLength(nCells);
    expect(snapshot.soilLumiere).toHaveLength(nCells);
    expect(snapshot.soilLitiereCG).toHaveLength(nCells);
    // Sans arbre, tout le sol est éclairé.
    expect(snapshot.soilLumiere[0]).toBeCloseTo(1, 6);
  });

  it("porte l'herbe sur pied, les ravageurs et l'érosion, cellule par cellule", () => {
    const state = etatNeuf();
    const nCells = STATION.coteM * STATION.coteM;
    // Des valeurs distinctes par cellule : une moyenne les confondrait, et
    // c'est justement ce que le rendu ne peut pas dessiner.
    const modifie = {
      ...state,
      soil: {
        ...state.soil,
        herbeBiomasse: state.soil.herbeBiomasse.map((_, i) => i / nCells),
        ravageurs: state.soil.ravageurs.map((_, i) => (i === 3 ? 0.8 : 0.05)),
      },
    };
    const snapshot = construireSnapshot({ ...entrees(modifie), state: modifie });

    expect(snapshot.soilHerbeBiomasse).toHaveLength(nCells);
    expect(snapshot.soilRavageurs).toHaveLength(nCells);
    expect(snapshot.soilEpaisseurPerdueCm).toHaveLength(nCells);
    expect([...snapshot.soilHerbeBiomasse]).toEqual(
      modifie.soil.herbeBiomasse.map((v) => Math.fround(v)),
    );
    // La tache de ravageurs reste une tache : la cellule 3 se distingue.
    expect(snapshot.soilRavageurs[3]).toBeCloseTo(0.8, 6);
    expect(snapshot.soilRavageurs[0]).toBeCloseTo(0.05, 6);
    // La biomasse n'est pas la couverture : deux cartes, deux valeurs.
    expect([...snapshot.soilHerbe]).not.toEqual([...snapshot.soilHerbeBiomasse]);
  });

  it("garde le SIGNE de l'épaisseur perdue : un dépôt est négatif", () => {
    // Là où le sédiment s'accumule, la perte est négative. Un transport qui
    // la ramènerait à zéro effacerait les zones d'accumulation.
    const state = etatNeuf();
    const modifie = {
      ...state,
      soil: {
        ...state.soil,
        epaisseurPerdueCm: state.soil.epaisseurPerdueCm.map((_, i) => (i === 5 ? -0.75 : 0.25)),
      },
    };
    const snapshot = construireSnapshot({ ...entrees(modifie), state: modifie });
    expect(snapshot.soilEpaisseurPerdueCm[5]).toBeCloseTo(-0.75, 6);
    expect(snapshot.soilEpaisseurPerdueCm[0]).toBeCloseTo(0.25, 6);
  });

  it("sans grandeur de tick, l'instantané reste dessinable", () => {
    // Le tout premier instantané part avant qu'aucun tick n'ait tourné.
    const state = etatNeuf();
    const snapshot = construireSnapshot({
      ...entrees(state),
      state,
      debordementParCellule: undefined,
      lumiereAuSol: undefined,
    });
    const nCells = STATION.coteM * STATION.coteM;
    expect(snapshot.soilDebordementMm).toHaveLength(nCells);
    expect([...snapshot.soilLumiere].every((v) => v === 1)).toBe(true);
  });

  it("copie les grilles du tick : elles servent aussi à l'instantané suivant", () => {
    // Elles sont transférées, donc détachées. Si l'instantané embarquait le
    // tableau du tick lui-même, un instantané déclenché par une action en
    // pause verrait la crue disparaître.
    const state = etatNeuf();
    const e = entrees(state);
    const snapshot = construireSnapshot(e);
    expect(snapshot.soilDebordementMm).not.toBe(e.debordementParCellule);
    expect(snapshot.soilLumiere).not.toBe(e.lumiereAuSol);
    expect([...snapshot.soilLumiere]).toEqual([...(e.lumiereAuSol ?? [])]);
  });

  it("transfère TOUS ses tampons : un oubli se paie en une copie par semaine", () => {
    const state = etatNeuf();
    const snapshot = construireSnapshot(entrees(state));
    const transferes = new Set(transferablesDuSnapshot(snapshot));
    const oublies = Object.entries(snapshot)
      .filter(([, v]) => ArrayBuffer.isView(v as object))
      .filter(([, v]) => !transferes.has((v as ArrayBufferView).buffer as Transferable))
      .map(([cle]) => cle);
    expect(oublies).toEqual([]);
  });
});

describe("les chutes de chandelle", () => {
  it("voyagent dans l'instantané, avec de quoi coucher le tronc", () => {
    // Le rendu n'a que l'instantané : `soilBoisAuSol` lui dit où le tronc est
    // arrivé, mais pas qu'il vient de TOMBER. Sans l'événement, la trouée
    // n'est qu'un changement d'éclairage entre deux images.
    const state = etatNeuf();
    const chute = {
      id: 42,
      x: 5.5,
      y: 6.25,
      especeId: "carpinus_betulus",
      heightM: 14,
      directionRad: 1.2,
      masseKgC: 210,
      empreinte: [
        { cellule: 6 * STATION.coteM + 5, longueurM: 1 },
        { cellule: 7 * STATION.coteM + 5, longueurM: 0.5 },
      ],
    };
    const snapshot = construireSnapshot({ ...entrees(state), state, chutes: [chute] });
    expect(snapshot.chutes).toEqual([chute]);
    // La direction et l'empreinte survivent au passage : ce sont elles qui
    // disent dans quel sens basculer et où poser le fût.
    expect(snapshot.chutes[0]?.directionRad).toBeCloseTo(1.2, 6);
    expect(snapshot.chutes[0]?.empreinte).toHaveLength(2);
  });

  it("un instantané sans chute en porte une liste vide, pas `undefined`", () => {
    const state = etatNeuf();
    const snapshot = construireSnapshot({ ...entrees(state), state, chutes: [] });
    expect(snapshot.chutes).toEqual([]);
  });
});

describe("le contexte phénologique", () => {
  it("est celui de la semaine montrée, recalculable à l'identique", () => {
    let state = etatNeuf();
    state = plantAt(state, "carpinus_betulus", 6, 6, 5);
    // Assez de semaines pour être en pleine sénescence d'automne.
    for (let i = 0; i < 44; i++) {
      const w = WEATHER[state.week % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    const snapshot = construireSnapshot({ ...entrees(state), state });
    // Le rendu n'a que l'instantané : ces cinq scalaires doivent suffire à
    // retrouver exactement le calendrier du moteur (phenologie.ts).
    expect(snapshot.pheno).toEqual(
      contextePhenologique(
        STATION.latitudeDeg,
        state.week % 52,
        state.ddYearBase5,
        state.semainesDeFroid,
      ),
    );
    expect(snapshot.pheno.automne).toBe(true);
    expect(snapshot.pheno.semainesDepuisSenescence).toBeGreaterThan(0);
  });
});

describe("ce qui s'est passé cette semaine", () => {
  it("remonte les gestes du joueur, avec les arbres qu'ils ont touchés", () => {
    let state = etatNeuf();
    state = plantAt(state, "carpinus_betulus", 5, 5, 12);
    const id = state.nextTreeId - 1;
    const resultat = applyAction(state, {
      type: "couper",
      week: state.week,
      treeIds: [id],
      devenir: "vendre",
    });
    // Sans cette liste, le rendu voit un instantané avec un arbre en moins et
    // n'a aucun moyen de savoir lequel : l'arbre s'escamote au lieu de tomber.
    expect(resultat.gestes).toEqual([{ type: "couper", ids: [id] }]);
    const snapshot = construireSnapshot({
      ...entrees(resultat.state),
      state: resultat.state,
      gestes: resultat.gestes ?? [],
    });
    expect(snapshot.gestes).toEqual([{ type: "couper", ids: [id] }]);
  });

  it("spatialise les morts : un id et une position, pas seulement un compte", () => {
    // Un arbre qui vient de mourir (`alive: false`, pas encore de
    // `mortSemaine`) : c'est le tick qui l'enregistre et verse son bois au
    // pool de bois mort, une fois pour toutes.
    const mourant: TreeState = {
      id: 77,
      especeId: "carpinus_betulus",
      x: 3.5,
      y: 8.25,
      ageWeeks: 1040,
      heightM: 7,
      stress: 12,
      alive: false,
      causeMort: "secheresse",
      uptakeYearG: 20,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      hauteurElagueeM: 0,
      recepages: 0,
      rootDepthCm: 90,
      pousseTendreM: 0,
      dommageHydraulique: 0.8,
      vigueur: 0.1,
      vigueurIndividuelle: 1,
      protege: false,
    };
    let state = etatNeuf();
    state = { ...state, trees: [mourant] };
    const w = WEATHER[0];
    if (!w) throw new Error("météo manquante");
    const ticked = tick(state, w);

    // Le compte ne suffit pas : sans id ni position, le rendu ne sait pas OÙ
    // animer QUOI, et les onze morts se ressemblent toutes à l'écran.
    expect(ticked.morts).toEqual([
      { id: 77, x: 3.5, y: 8.25, especeId: "carpinus_betulus", cause: "secheresse", heightM: 7 },
    ]);
    // Et l'arbre reste en jeu comme chandelle, à la même place.
    const snapshot = construireSnapshot({
      ...entrees(state),
      state: ticked.state,
      morts: ticked.morts,
    });
    const chandelle = snapshot.trees.find((t) => t.id === 77);
    expect(chandelle?.chandelle).toBe(true);
    expect(chandelle?.mortSemaine).toBe(state.week);
    expect(snapshot.morts).toHaveLength(1);
  });
});
