import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import { cnHumusDuProfil } from "../../src/engine/carbon";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { phosphoreDeLAzoteOrganiqueG } from "../../src/engine/pk";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * **Le phosphore de la parcelle se referme** (#473), sol et plantes ensemble, sur
 * le modèle du bilan du potassium (`potassium-conservation.test.ts`).
 *
 * Le moteur n'a pas de stock de phosphore organique : la strate, sa litière,
 * l'humus et le bois mort portent celui de leur azote, au rapport du
 * prélèvement (`phosphoreDeLAzoteOrganiqueG`, pk.ts). Le phosphore ne bouge donc
 * que là où l'azote passe de la matière organique au minéral, ou l'inverse. Sur
 * une parcelle sans arbre, une semaine ne doit changer le total que de ce que la
 * roche et l'atmosphère apportent, moins ce que la terre emporte ; un geste que
 * de ce que le grain emporte, ou de ce que le fumier apporte avec son azote.
 *
 * Sur main, trois chemins le faisaient mentir, et ce bilan les attrape tous :
 * la litière rendait son azote sans son phosphore, l'immobilisait sans lui (il
 * revenait ensuite par l'humus avec un phosphore pris nulle part), et le labour
 * minéralisait l'humus sans rendre le sien.
 *
 * Un seul terme reste, et il est publié pour être compté : quand le sol n'a plus
 * le phosphore que la plante prend avec son azote, elle prend son azote sans
 * tout son phosphore (`phosphoreNonPrisKgHa`), et la matière organique qu'elle
 * fera en portera plus qu'elle n'en a pris. Il ne mord pas sous une prairie ;
 * il mord sous un blé fertilisé, et c'est dit plus bas.
 *
 * La précision est celle du bilan du potassium, pour la même raison : le
 * phosphore assimilable est tenu en flottants simples.
 */

const PRECISION = 4;
const moyenne = (a: ArrayLike<number>) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i] ?? 0;
  return a.length === 0 ? 0 : t / a.length;
};

/** Phosphore de la parcelle, kg/ha : le sol minéral, et celui de l'azote organique. */
function phosphoreKgHa(s: GameState): number {
  const cnHumus = cnHumusDuProfil(s.station.profil);
  const n = s.soil.phosphoreG.length;
  let azote = 0;
  for (let i = 0; i < n; i++) {
    azote +=
      (s.soil.litterNG[i] ?? 0) + (s.soil.humusCG[i] ?? 0) / cnHumus + (s.soil.boisAuSolNG[i] ?? 0);
  }
  for (const v of s.soil.herbeAzoteG) azote += v;
  for (const v of s.soil.herbeMorteAzoteG) azote += v;
  azote += s.carbon.deadWoodNG + s.stockBrf.azoteG;
  const mineral = moyenne(s.soil.phosphoreG) + moyenne(s.soil.phosphoreFixeG);
  return (mineral + phosphoreDeLAzoteOrganiqueG(azote / n)) * 10;
}

/** Ce que la moisson emportera, kg/ha : le phosphore de l'azote du grain. */
function grainPKgHa(s: GameState): number {
  const nCells = s.soil.phosphoreG.length;
  let azote = 0;
  for (let i = 0; i < nCells; i++) {
    for (let e = 0; e < N_HERBACEES; e++) {
      const culture = HERBACEES[e]?.culture;
      if (!culture) continue;
      azote += (s.soil.herbeAzoteG[i * N_HERBACEES + e] ?? 0) * culture.azoteDansLeGrain;
    }
  }
  return phosphoreDeLAzoteOrganiqueG(azote / nCells) * 10;
}

/** Ce qu'un geste apporte, kg/ha : le fumier, avec son azote. */
function apportPKgHa(g: GameAction): number {
  if (g.type === "fertiliser" && g.forme === "fumier")
    return phosphoreDeLAzoteOrganiqueG(g.doseKgNHa);
  return 0;
}

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
  let nonPris = 0;
  let exporte = 0;
  let laboure = false;
  for (let an = 0; an < ans; an++) {
    for (let w = 0; w < 52; w++) {
      for (const geste of gestes(an, w, centre)) {
        const avant = phosphoreKgHa(s);
        const grain = geste.type === "moissonner" ? grainPKgHa(s) : 0;
        s = applyAction(s, { ...geste, week: an * 52 + w }).state;
        // Un geste ne crée ni ne détruit : le grain sort, le fumier entre, et le
        // labour qui minéralise l'humus rend son phosphore avec son azote.
        expect(phosphoreKgHa(s) - avant).toBeCloseTo(apportPKgHa(geste) - grain, PRECISION);
        exporte += grain;
        if (geste.type === "labourer") laboure = true;
      }
      const avant = phosphoreKgHa(s);
      const m = meteo[w];
      if (!m) throw new Error("météo manquante");
      const r = tick(s, m);
      s = r.state;
      const f = r.fluxes;
      expect(f.phosphoreOrganiqueNonTrouveKgHa).toBe(0);
      expect(phosphoreKgHa(s) - avant).toBeCloseTo(
        f.apportPKgHa - f.erosionPKgHa - f.erosionPOrganiqueKgHa + f.phosphoreNonPrisKgHa,
        PRECISION,
      );
      nonPris += f.phosphoreNonPrisKgHa;
    }
  }
  return { nonPris, exporte, laboure };
}

describe("la parcelle sans arbre se referme, sol et plantes ensemble (#473)", () => {
  it("une prairie fauchée chaque été : le sol a toujours le phosphore de l'azote pris", () => {
    const r = mener(4, (_an, w, c) =>
      w === 25 ? [{ type: "faucher", week: 0, x: c, y: c, rayonM: 30 }] : [],
    );
    // La prairie ne prend jamais son azote sans son phosphore : le bilan y est
    // exact sans terme résiduel.
    expect(r.nonPris).toBe(0);
  }, 300_000);

  it("un blé labouré, fertilisé et moissonné : seul le plafond du prélèvement reste", () => {
    const r = mener(4, (an, w, c) => {
      const zone = { x: c, y: c, rayonM: 30 };
      const g: GameAction[] = [];
      if (w === 39)
        g.push({ type: "fertiliser", week: 0, ...zone, forme: "fumier", doseKgNHa: 40 });
      if (w === 40) g.push({ type: "labourer", week: 0, ...zone });
      if (w === 41) g.push({ type: "semer", week: 0, ...zone, cultureId: "triticum_aestivum" });
      if (w === 10 && an > 0)
        g.push({ type: "fertiliser", week: 0, ...zone, forme: "mineral", doseKgNHa: 192 });
      if (w === 28 && an > 0) g.push({ type: "moissonner", week: 0, ...zone });
      return g;
    });
    expect(r.laboure).toBe(true);
    expect(r.exporte).toBeGreaterThan(0);
    // **Sous un blé fertilisé, le sol n'a pas tout le phosphore que l'azote du
    // blé emporterait** : la plante prend son azote sans tout son phosphore, et
    // la paille rendra plus qu'elle n'a pris. C'est le seul terme qui reste, il
    // est compté, et il relève du phosphore des cultures (#434), non de la
    // boucle de l'herbe.
    expect(r.nonPris).toBeGreaterThan(0);
  }, 300_000);
});
