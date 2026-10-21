import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { applyAction, FUMIER_K_SUR_N, type GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { serieToWeeks, syntheticYear } from "../../src/engine/meteo";
import { K_SUR_K2O, potassiumDeLaStrateG } from "../../src/engine/pk";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * **Le potassium de la parcelle se referme** (#222), sur le modèle des bilans de
 * l'azote et du carbone (`tick-conservation.test.ts`, `carbon-conservation.test.ts`).
 *
 * La strate herbacée prélevait du potassium et ne le rendait jamais : ni à la
 * mort de ses tissus, ni au labour, ni à la fauche, ni au feu, ni avec la paille
 * laissée au champ. Le potassium d'une allée cultivée fuyait ainsi d'une
 * centaine de kilos par hectare et par an, et aucun essai ne regardait ce
 * bilan. Deux bilans le regardent maintenant.
 *
 *  1. **Le pool échangeable**, semaine après semaine, avec les flux que le tick
 *     publie : ce que la roche et l'atmosphère apportent, ce que les feuilles et
 *     la strate rendent, moins ce que les plantes prélèvent, ce que l'eau lessive
 *     et ce que la terre emporte hors de la parcelle. La réserve non échangeable
 *     en fait partie : leur échange est interne.
 *  2. **La parcelle sans arbre**, sol et plantes ensemble. Le potassium de la
 *     strate n'est pas un état : il suit son azote (`potassiumDeLaStrateG`).
 *     Le prélèvement et les retours y deviennent des transferts internes, si
 *     bien qu'une semaine ne doit changer le total que de l'apport moins les
 *     pertes, et un geste que de ce que le grain emporte, ou de ce que la
 *     potasse et le fumier apportent (#395).
 *
 * Le second bilan est le plus exigeant : il échoue si un retour manque, s'il
 * compte deux fois, ou si la strate prend son azote sans le potassium qui va
 * avec. Quand un blé fertilisé vide le potassium échangeable, la réserve non
 * échangeable fournit le reste (`prelevementPotassium`, pk.ts), et le bilan
 * reste exact **tant qu'elle n'est pas vide**. L'essai vérifie donc aussi qu'elle ne s'est vidée nulle part. Si
 * elle se vide, la plante prend son azote sans son potassium, le pool implicite
 * compte un potassium qu'elle n'a pas pris, et le bilan ne peut plus tenir :
 * l'essai le dit alors par son propre message, avant l'écart du bilan.
 *
 * La précision est de 1e-3 kg/ha, et elle suit la grandeur du stock : le
 * potassium échangeable est tenu en flottants simples. Elle était de 1e-4 quand
 * le limon riche en portait une dizaine de g/m². Depuis qu'il porte la teneur
 * d'une terre cultivée (#395), 54 g/m², une écriture s'arrondit à 3e-5 kg/ha
 * près. Sur cette parcelle plate, toutes les cellules sont identiques : leurs
 * arrondis s'additionnent au lieu de se compenser, et une semaine en compte
 * plusieurs. Mesuré : 5e-5 sur le blé, 9e-5 sous le fumier. Une fuite réelle
 * se compte en dixièmes de kilo par semaine.
 */

const PRECISION = 3;
const moyenne = (a: ArrayLike<number>) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
  return a.length === 0 ? 0 : t / a.length;
};

/** Potassium du sol, échangeable et réserve, kg/ha. */
function solKgHa(s: GameState): number {
  return (moyenne(s.soil.potassiumG) + moyenne(s.soil.potassiumReserveG)) * 10;
}

/** Potassium que porte la strate, kg/ha : celui de son azote. */
function strateKgHa(s: GameState): number {
  const nCells = s.soil.potassiumG.length;
  let t = 0;
  for (let k = 0; k < s.soil.herbeAzoteG.length; k++) {
    t += potassiumDeLaStrateG(s.soil.herbeAzoteG[k] ?? 0);
  }
  return (t / nCells) * 10;
}

/**
 * Ce qu'un geste apporte de potassium, kg/ha : la potasse, et le fumier avec son
 * azote (#395). Les zones de ces essais couvrent toute la parcelle.
 */
function apportKKgHa(g: GameAction): number {
  if (g.type !== "fertiliser") return 0;
  if (g.forme === "potasse") return g.doseKgK2OHa * K_SUR_K2O;
  if (g.forme === "fumier") return g.doseKgNHa * FUMIER_K_SUR_N;
  return 0;
}

/** Ce que la moisson emportera, kg/ha : le grain, au plus ce que la plante porte. */
function grainKKgHa(s: GameState): number {
  const nCells = s.soil.potassiumG.length;
  let t = 0;
  for (let i = 0; i < nCells; i++) {
    for (let e = 0; e < N_HERBACEES; e++) {
      const culture = HERBACEES[e]?.culture;
      if (!culture) continue;
      const k = i * N_HERBACEES + e;
      const grainKg = ((s.soil.herbeMatiereSecheG[k] ?? 0) * culture.indiceRecolte) / 1000;
      t += Math.min(
        potassiumDeLaStrateG(s.soil.herbeAzoteG[k] ?? 0),
        grainKg * culture.potassiumDansLeGrainGKgMS,
      );
    }
  }
  return (t / nCells) * 10;
}

describe("le pool échangeable se referme chaque semaine", () => {
  it("sur une lande d'ajoncs, jusqu'au premier incendie compris", () => {
    // La lande sèche a de la pente (l'érosion emporte du potassium hors de la
    // parcelle), un sol pauvre et des ajoncs qui finissent par brûler : le feu
    // rend aux cendres le potassium de la strate, et c'est un des chemins que
    // ce lot a ouverts. Le décor est celui de `feu.test.ts`.
    //
    // **La graine est choisie, et c'est dit** : il faut un incendie pour éprouver
    // ce chemin, et ils sont rares. Sur les treize graines de `feu.test.ts`, six
    // brûlaient en vingt-cinq ans, la 21 dès la semaine 237 ; les autres
    // demandent vingt ans de tick, trop pour un essai rapide. Ce n'est pas une
    // mesure de la fréquence des feux. Si le moteur change au point qu'elle ne
    // brûle plus, la dernière assertion tombe et le dit : il faudra en reprendre
    // une.
    //
    // **C'est arrivé avec #391** (l'eau du tapis en deux phases) : la 21 ne brûle
    // plus en vingt-cinq ans. Sur le même balayage, sept graines sur treize
    // brûlent, et la plus précoce est la 37, à la semaine 391 : c'est elle qu'on
    // reprend, par la même règle.
    const station: Station = { ...LANDE_SECHE.station, coteM: 30, voisinage: [] };
    const serie = serieMeteoPour("lande-seche");
    if (!serie) throw new Error("série manquante");
    const meteo = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(37));
    for (let i = 0; i < 36; i++) {
      state = plantAt(state, "ulex_europaeus", 2 + (i % 6) * 5, 2 + Math.floor(i / 6) * 5, 1.2);
    }
    let incendies = 0;
    let erosion = 0;
    for (let i = 0; i < 25 * 52 && incendies === 0; i++) {
      const w = meteo[i % meteo.length];
      if (!w) throw new Error("météo manquante");
      const avant = solKgHa(state);
      const r = advanceWeek(state, w, []);
      state = r.state;
      const f = r.fluxes;
      expect(solKgHa(state) - avant).toBeCloseTo(
        f.apportKKgHa + f.retourKKgHa - f.uptakeKKgHa - f.leachedKKgHa - f.erosionKKgHa,
        PRECISION,
      );
      erosion += f.erosionKKgHa;
      if (r.incendie) incendies++;
    }
    // Le décor doit vraiment brûler et s'éroder, sinon l'essai ne prouve rien.
    expect(incendies).toBe(1);
    expect(erosion).toBeGreaterThan(0);
  }, 300_000);
});

describe("la parcelle sans arbre se referme, sol et plantes ensemble", () => {
  /**
   * Une parcelle plate de limon riche, sans arbre ni gibier, menée `ans` années
   * avec les gestes donnés. Chaque semaine et chaque geste est vérifié.
   */
  function mener(ans: number, gestes: (an: number, w: number, centre: number) => GameAction[]) {
    const cote = 20;
    const centre = cote / 2;
    const station: Station = {
      ...LIMON_RICHE.station,
      relief: RELIEF_PLAT,
      coteM: cote,
      voisinage: [],
      gibierParHa: 0,
    };
    const meteo = syntheticYear(LIMON_RICHE.climat);
    let s = createGameState(station, rngStateFromSeed(5));
    const total = (e: GameState) => solKgHa(e) + strateKgHa(e);
    let exporte = 0;
    let apporte = 0;
    let rendu = 0;
    let reserveMinimum = Number.POSITIVE_INFINITY;
    for (let an = 0; an < ans; an++) {
      for (let w = 0; w < 52; w++) {
        for (const geste of gestes(an, w, centre)) {
          const avant = total(s);
          const grain = geste.type === "moissonner" ? grainKKgHa(s) : 0;
          const apport = apportKKgHa(geste);
          s = applyAction(s, { ...geste, week: an * 52 + w }).state;
          // Un geste ne crée ni ne détruit : seul le grain sort, seuls la
          // potasse et le fumier entrent.
          expect(total(s) - avant).toBeCloseTo(apport - grain, PRECISION);
          exporte += grain;
          apporte += apport;
        }
        const avant = total(s);
        const m = meteo[w];
        if (!m) throw new Error("météo manquante");
        const r = tick(s, m);
        s = r.state;
        const f = r.fluxes;
        // La condition du bilan exact : la réserve n'est vide nulle part.
        const reserveMin = Math.min(...s.soil.potassiumReserveG);
        expect(reserveMin, `réserve vide, an ${an} semaine ${w} : bilan inexact`).toBeGreaterThan(
          0,
        );
        reserveMinimum = Math.min(reserveMinimum, reserveMin);
        // Le prélèvement et les retours sont internes : seuls l'apport et les
        // pertes changent le total.
        expect(total(s) - avant).toBeCloseTo(
          f.apportKKgHa - f.leachedKKgHa - f.erosionKKgHa,
          PRECISION,
        );
        rendu += f.retourKKgHa;
      }
    }
    return {
      exporte,
      apporte,
      rendu,
      reserveMinimum,
      potassiumKgHa: moyenne(s.soil.potassiumG) * 10,
    };
  }

  it("un blé labouré, fertilisé et moissonné : la paille rend, le grain emporte", () => {
    const r = mener(4, (an, w, c) => {
      const zone = { x: c, y: c, rayonM: 30 };
      const g: GameAction[] = [];
      if (w === 40) g.push({ type: "labourer", week: 0, ...zone });
      if (w === 41) g.push({ type: "semer", week: 0, ...zone, cultureId: "triticum_aestivum" });
      if (w === 10 && an > 0)
        g.push({ type: "fertiliser", week: 0, ...zone, forme: "mineral", doseKgNHa: 192 });
      if (w === 28 && an > 0) g.push({ type: "moissonner", week: 0, ...zone });
      return g;
    });
    // Trois moissons de l'ordre de 6 à 8 t/ha de grain sec, à 4,88 kg K/t
    // (Comifer) : une centaine de kilos en tout, pas trois cents.
    expect(r.exporte).toBeGreaterThan(50);
    expect(r.exporte).toBeLessThan(150);
  }, 300_000);

  it("un blé fumé et potassé : le fumier et la potasse entrent, le grain sort (#395)", () => {
    const r = mener(4, (an, w, c) => {
      const zone = { x: c, y: c, rayonM: 30 };
      const g: GameAction[] = [];
      // Le fumier avant le labour, au plafond de la directive nitrates ; la
      // potasse au printemps, à la dose moyenne des blés qui en reçoivent
      // (Agreste 2017).
      if (w === 39)
        g.push({ type: "fertiliser", week: 0, ...zone, forme: "fumier", doseKgNHa: 170 });
      if (w === 40) g.push({ type: "labourer", week: 0, ...zone });
      if (w === 41) g.push({ type: "semer", week: 0, ...zone, cultureId: "triticum_aestivum" });
      if (w === 10 && an > 0)
        g.push({ type: "fertiliser", week: 0, ...zone, forme: "potasse", doseKgK2OHa: 48 });
      if (w === 28 && an > 0) g.push({ type: "moissonner", week: 0, ...zone });
      return g;
    });
    expect(r.apporte).toBeCloseTo(4 * 170 * FUMIER_K_SUR_N + 3 * 48 * K_SUR_K2O, 6);
    expect(r.exporte).toBeGreaterThan(0);
  }, 300_000);

  it("une prairie fauchée chaque été : rien ne sort, tout revient", () => {
    const r = mener(4, (_an, w, c) =>
      w === 25 ? [{ type: "faucher", week: 0, x: c, y: c, rayonM: 30 }] : [],
    );
    expect(r.exporte).toBe(0);
    // La strate rend bel et bien : le bilan ne tient pas parce qu'elle ne
    // ferait rien.
    expect(r.rendu).toBeGreaterThan(0);
  }, 300_000);
});
