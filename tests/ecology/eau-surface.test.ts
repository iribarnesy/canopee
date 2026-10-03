/**
 * L'eau de surface (eau_surface.ts) : un ruisseau ou une mare tient une nappe
 * sous la parcelle, et c'est cette nappe — pas une règle sur les espèces — qui
 * fabrique la ripisylve. On vérifie la forme du champ de nappe, puis ce qu'il
 * produit sur des arbres : l'aulne tient au bord de l'eau où le hêtre s'y
 * noie, et le rapport s'inverse en s'éloignant.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { CrueResult } from "../../src/engine/crue";
import {
  cellulesEnEau,
  drainageAvecNappe,
  type EauDeSurface,
  facteurExutoire,
  profondeurNappeCm,
  remonteeCapillaireMm,
  SANS_EAU,
} from "../../src/engine/eau_surface";
import { serieToWeeks, syntheticYear, type WeekWeather } from "../../src/engine/meteo";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon } from "../../src/engine/soil";
import { createGameState, gridDims, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE, type StationClimat, VALLEE_ENGORGEE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Une parcelle carrée de limon, avec le relief et l'eau qu'on veut. */
function station(eau: EauDeSurface, pentePct = 2) {
  return {
    ...LIMON_RICHE.station,
    coteM: 40,
    eau,
    relief: { ...RELIEF_PLAT, pentePct, expositionDeg: 180 },
    // Un exutoire fini : on veut voir la nappe, pas le plateau qui vidange.
    drainageExterneMmSemaine: 40,
    voisinage: [],
    gibierParHa: 0,
  };
}

const RUISSEAU: EauDeSurface = { type: "ruisseau", cote: "sud", bergeM: 0.2 };

describe("le champ de nappe", () => {
  it("affleure à la berge et s'enfonce à mesure qu'on s'éloigne", () => {
    const st = station(RUISSEAU);
    const dims = gridDims(st);
    const nappe = profondeurNappeCm(
      st.eau,
      altitudesTest(dims.widthM, dims.heightM),
      dims,
      st.profil,
    );
    const auBord = nappe[1 * dims.widthM + 20] ?? 0;
    const auMilieu = nappe[20 * dims.widthM + 20] ?? 0;
    const auFond = nappe[39 * dims.widthM + 20] ?? 0;
    expect(auBord).toBeLessThan(60);
    expect(auMilieu).toBeGreaterThan(auBord);
    expect(auFond).toBeGreaterThan(auMilieu);
  });

  it("sans eau de surface, la nappe est hors de portée partout", () => {
    const st = station(SANS_EAU);
    const dims = gridDims(st);
    const nappe = profondeurNappeCm(
      st.eau,
      altitudesTest(dims.widthM, dims.heightM),
      dims,
      st.profil,
    );
    expect([...nappe].every((v) => !Number.isFinite(v))).toBe(true);
    // …et la cellule retombe alors sur le comportement d'avant : exutoire
    // intact, aucune remontée ajoutée.
    expect(facteurExutoire(Number.POSITIVE_INFINITY, st.profil)).toBe(1);
    expect(remonteeCapillaireMm(Number.POSITIVE_INFINITY, st.profil)).toBe(0);
  });

  it("une berge encaissée abaisse la nappe partout", () => {
    const st = station(RUISSEAU);
    const creuse = station({ ...RUISSEAU, bergeM: 3 });
    const dims = gridDims(st);
    const alt = altitudesTest(dims.widthM, dims.heightM);
    const a = profondeurNappeCm(st.eau, alt, dims, st.profil);
    const b = profondeurNappeCm(creuse.eau, alt, dims, creuse.profil);
    for (let i = 0; i < a.length; i++) {
      expect(b[i] ?? 0).toBeGreaterThanOrEqual((a[i] ?? 0) - 1e-6);
    }
  });

  it("la mare mouille ses abords et pas les coins de la parcelle", () => {
    const st = station({ type: "mare", xRel: 0.5, yRel: 0.5, rayonM: 3, bergeM: 0.2 }, 0);
    const dims = gridDims(st);
    const enEau = cellulesEnEau(st.eau, dims);
    expect(enEau.filter(Boolean).length).toBeGreaterThan(20);
    const nappe = profondeurNappeCm(
      st.eau,
      altitudesTest(dims.widthM, dims.heightM),
      dims,
      st.profil,
    );
    const auBord = nappe[20 * dims.widthM + 24] ?? 0;
    const auCoin = nappe[0] ?? 0;
    expect(auBord).toBeLessThan(auCoin);
  });

  it("un exutoire déclaré infini redevient fini dès que la nappe monte", () => {
    const profil = [horizon(30, { sable: 20, limon: 60, argile: 20 }, { moPct: 2, ph: 6.8 })];
    expect(drainageAvecNappe(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, profil)).toBe(
      Number.POSITIVE_INFINITY,
    );
    const bride = drainageAvecNappe(Number.POSITIVE_INFINITY, 10, profil);
    expect(Number.isFinite(bride)).toBe(true);
    expect(bride).toBeGreaterThan(0);
  });
});

describe("la crue", () => {
  /** Une semaine de pluie sur une parcelle dominée par un grand bassin amont. */
  function semaineDePluie(eau: EauDeSurface, bassinAmontHa: number) {
    const st = {
      ...station(eau),
      relief: { ...RELIEF_PLAT, pentePct: 3, expositionDeg: 180, bassinAmontHa },
    };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(st, rngStateFromSeed(3));
    // La semaine la plus pluvieuse de l'année synthétique.
    const pluvieuse = meteo.reduce((a, b) => (b.rainMm > a.rainMm ? b : a));
    let derniere = tick(state, pluvieuse);
    for (let i = 0; i < 6; i++) {
      state = derniere.state;
      derniere = tick(state, pluvieuse);
    }
    return derniere.fluxes;
  }

  it("un grand bassin d'amont fait monter le cours d'eau et noie le bas", () => {
    const petite = semaineDePluie(RUISSEAU, 0.5);
    const grosse = semaineDePluie(RUISSEAU, 40);
    expect(grosse.partInondee).toBeGreaterThan(petite.partInondee);
    expect(grosse.partInondee).toBeGreaterThan(0.1);
  });

  it("sans cours d'eau ni mare, la même pluie n'inonde rien", () => {
    // L'eau ruisselle et s'en va : c'est la nappe du plan d'eau qui noie, pas
    // la pluie elle-même.
    expect(semaineDePluie(SANS_EAU, 40).partInondee).toBe(0);
  });

  it("la crue reflue quand l'amont ne verse plus", () => {
    const st = {
      ...station(RUISSEAU),
      relief: { ...RELIEF_PLAT, pentePct: 3, expositionDeg: 180, bassinAmontHa: 40 },
    };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    const pluvieuse = meteo.reduce((a, b) => (b.rainMm > a.rainMm ? b : a));
    const sec = { ...pluvieuse, rainMm: 0 };
    let state = createGameState(st, rngStateFromSeed(3));
    const enCrue = tick(state, pluvieuse);
    state = enCrue.state;
    const apres = tick(state, sec);
    expect(apres.fluxes.partInondee).toBeLessThan(enCrue.fluxes.partInondee);
  });
});

describe("la crue comme événement (#288)", () => {
  /**
   * Deux ans de météo réelle sur une station : chaque semaine, la crue s'il y
   * en a une, le plus fort débordement, et si l'état garde une mémoire.
   */
  function deuxAns(sc: StationClimat, coteM: number) {
    const st: Station = { ...sc.station, coteM, voisinage: [], gibierParHa: 0 };
    const serie = serieMeteoPour(sc.station.id);
    const meteo: WeekWeather[] = serie ? serieToWeeks(serie, sc.climat) : syntheticYear(sc.climat);
    let state = createGameState(st, rngStateFromSeed(5));
    const semaines: { crue?: CrueResult; debordementMax: number; memoire: boolean }[] = [];
    for (let i = 0; i < 2 * 52; i++) {
      const w = meteo[i % meteo.length];
      if (!w) throw new Error("météo manquante");
      const r = tick(state, w);
      state = r.state;
      semaines.push({
        crue: r.crue,
        debordementMax: Math.max(...r.debordementParCellule),
        memoire: state.crue !== undefined,
      });
    }
    return semaines;
  }

  // **Un hectare, la taille des parcelles du jeu, et pas trente mètres.** La
  // rangée du pied de la parcelle, où la nappe converge, reste inondée toute
  // l'année : sur trente mètres elle pèse 2,7 % de la surface, au-dessus du
  // seuil de fin, et la crue ne se ferme jamais (relevé : six ans d'une seule
  // crue) ; sur un hectare elle pèse 1 %. C'est une limite de la définition par
  // part de parcelle, écrite dans crue.ts.
  //
  // Relevé (graine 5, 1964-1965) : la première semaine sort d'un état initial
  // à l'équilibre et s'inonde une semaine, puis l'hiver 1964-65 fait une crue de
  // plusieurs mois. Le talweg y porte plus de 100 000 mm de débit pendant que
  // les lames restent à quelques dizaines de millimètres.
  let memo: ReturnType<typeof deuxAns> | undefined;
  const valleeDeuxAns = () => {
    memo ??= deuxAns(VALLEE_ENGORGEE, 100);
    return memo;
  };

  it("le fond de vallée a sa crue d'hiver, qui commence, dure et se ferme", () => {
    const vallee = valleeDeuxAns();
    const ids = [...new Set(vallee.flatMap((s) => (s.crue ? [s.crue.id] : [])))];
    const longues = ids.filter((id) => vallee.filter((s) => s.crue?.id === id).length >= 4);
    expect(longues.length).toBeGreaterThanOrEqual(1);
    const id = longues[0];
    const suite = vallee.filter((s) => s.crue?.id === id).map((s) => s.crue as CrueResult);
    expect(suite[0]?.phase).toBe("montée");
    expect(suite.map((c) => c.semaine)).toEqual(suite.map((_, k) => k));
    // Elle se ferme : la semaine qui suit la dernière n'a ni crue ni mémoire.
    const derniere = vallee.map((s) => s.crue?.id).lastIndexOf(id);
    expect(derniere).toBeLessThan(vallee.length - 1);
    expect(vallee[derniere + 1]?.crue?.id).not.toBe(id);
    expect(vallee[derniere]?.memoire).toBe(true);
    // Sans eau libre déclarée, la montée est souterraine : zéro.
    expect(suite.every((c) => c.monteeM === 0)).toBe(true);
  }, 300_000);

  it("ses lames ne comptent pas l'eau qui ne fait que passer", () => {
    const vallee = valleeDeuxAns();
    // Le défaut des 652 835 mm : `debordementParCellule` cumule le long du
    // talweg toute l'eau du bassin d'amont, c'est un débit. Une lame lue là
    // dedans mettrait des centaines de mètres d'eau sur le lit.
    const debitMax = Math.max(...vallee.map((s) => s.debordementMax));
    let lameMax = 0;
    for (const s of vallee) for (const l of s.crue?.lamesMm ?? []) lameMax = Math.max(lameMax, l);
    expect(debitMax).toBeGreaterThan(100_000);
    expect(lameMax).toBeGreaterThan(0);
    expect(lameMax).toBeLessThan(500);
  }, 300_000);

  it("un plateau sans bassin ni nappe n'a aucune crue", () => {
    const plateau = deuxAns(LIMON_RICHE, 30);
    expect(plateau.filter((s) => s.crue).length).toBe(0);
    expect(plateau.some((s) => s.memoire)).toBe(false);
  }, 300_000);

  it("un ruisseau qui monte pose sa hauteur sur ce qu'il noie", () => {
    const st = {
      ...station(RUISSEAU),
      relief: { ...RELIEF_PLAT, pentePct: 3, expositionDeg: 180, bassinAmontHa: 40 },
    };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    const pluvieuse = meteo.reduce((a, b) => (b.rainMm > a.rainMm ? b : a));
    let state = createGameState(st, rngStateFromSeed(3));
    let crue: CrueResult | undefined;
    for (let i = 0; i < 3 && !crue; i++) {
      const r = tick(state, pluvieuse);
      state = r.state;
      crue = r.crue;
    }
    if (!crue) throw new Error("le ruisseau en crue aurait dû noyer le bas");
    expect(crue.monteeM).toBeGreaterThan(0);
    // Le plan d'eau ne monte pas plus haut que sa montée : aucune lame ne la dépasse.
    for (const l of crue.lamesMm) expect(l).toBeLessThanOrEqual(crue.monteeM * 1000 + 1e-3);
  });
});

/** Altitudes de test : plan incliné descendant vers le sud (y = 0). */
function altitudesTest(w: number, h: number): number[] {
  const alt = new Array<number>(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alt[y * w + x] = y * 0.02;
  return alt;
}

describe("la ripisylve s'installe toute seule", () => {
  /** Plante deux espèces à trois distances du ruisseau et fait tourner. */
  function essai(eau: EauDeSurface, annees: number) {
    const st = station(eau);
    const meteo = syntheticYear(LIMON_RICHE.climat);
    let state = createGameState(st, rngStateFromSeed(7));
    const distances = [2, 20, 38];
    for (const d of distances) {
      for (let k = 0; k < 4; k++) {
        state = plantAt(state, "alnus_glutinosa", 6 + k * 3, d, 0.5);
        state = plantAt(state, "fagus_sylvatica", 24 + k * 3, d, 0.5);
      }
    }
    for (let i = 0; i < annees * 52; i++) {
      const w = meteo[i % meteo.length];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    const hauteur = (especeId: string, d: number) => {
      const arbres = state.trees.filter(
        (t) => t.especeId === especeId && t.alive && Math.abs(t.y - d) < 0.5,
      );
      if (arbres.length === 0) return 0;
      return arbres.reduce((s, t) => s + t.heightM, 0) / arbres.length;
    };
    return { hauteur, state };
  }

  it("au bord de l'eau l'aulne domine le hêtre, et l'inverse à l'écart", () => {
    const { hauteur } = essai(RUISSEAU, 12);
    const aulneBord = hauteur("alnus_glutinosa", 2);
    const hetreBord = hauteur("fagus_sylvatica", 2);
    const aulneLoin = hauteur("alnus_glutinosa", 38);
    const hetreLoin = hauteur("fagus_sylvatica", 38);
    // L'aulne tolère l'engorgement (toleranceEngorgement 1), le hêtre non (0,1) :
    // la même nappe les sépare, sans qu'aucune règle ne les nomme.
    expect(aulneBord).toBeGreaterThan(hetreBord);
    expect(hetreLoin / Math.max(0.01, aulneLoin)).toBeGreaterThan(
      hetreBord / Math.max(0.01, aulneBord),
    );
  });

  it("sans ruisseau, la position dans la parcelle ne change plus rien", () => {
    const { hauteur } = essai(SANS_EAU, 12);
    const bord = hauteur("fagus_sylvatica", 2);
    const loin = hauteur("fagus_sylvatica", 38);
    // Il reste la pente (le bas de pente reçoit l'eau de l'amont), mais plus
    // l'écart massif que crée une nappe affleurante.
    expect(Math.abs(bord - loin)).toBeLessThan(0.5 * Math.max(bord, loin));
  });
});
