/**
 * À QUI IMPUTER UNE MORT (#103).
 *
 * `causeMort` retenait le DERNIER COUP et non la cause. Un dominé remplit son
 * compteur de stress pendant des décennies, puis un dégât de ravageur le pousse
 * au-delà du seuil — et le moteur écrivait « ravageurs ». C'est juste comme
 * description du coup de grâce, et faux comme rapport au joueur : le journal
 * l'envoyait traiter là où il fallait éclaircir.
 *
 * Le moteur tient donc, par arbre, la part de son stress venue des causes
 * LENTES (`stressLent`) et laquelle domine (`causeLente`). Un coup brusque cède
 * la place quand cette part fait plus de la moitié de ce qui a tué l'arbre.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getScenario, meteoDerivee, normalesHebdo } from "../../src/engine/climat";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série météo manquante");
const OBSERVATIONS = serieToWeeks(SERIE);

describe("un coup de grâce n'est pas une cause", () => {
  const causes = new Map<string, number>();

  /**
   * Une parcelle qui se réchauffe : c'est LE cas où les ravageurs tuent
   * vraiment, puisque la chaleur enchaîne leurs générations. Il faut donc que
   * les deux lectures y coexistent — des morts par ravageurs ET des morts
   * imputées à la charge lente.
   */
  beforeAll(() => {
    const station: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
    let state = createGameState(station, rngStateFromSeed(11));
    state = plantScattered(state, "fagus_sylvatica", 60);
    state = plantScattered(state, "quercus_pubescens", 60);
    const normales = normalesHebdo(OBSERVATIONS);
    const scenario = getScenario("ssp585");
    for (let i = 0; i < 60 * 52; i++) {
      const base = OBSERVATIONS[i % OBSERVATIONS.length];
      if (!base) throw new Error("météo manquante");
      const w = meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52), normales);
      const r = advanceWeek(state, w, []);
      state = r.state;
      // La cause se lit à la SEMAINE DE LA MORT : le moteur purge les morts.
      for (const m of r.morts) causes.set(m.cause, (causes.get(m.cause) ?? 0) + 1);
    }
  }, 900_000);

  it("les morts par ravageurs ne sont PAS effacées : il en meurt vraiment", () => {
    // C'est la moitié qui compte le plus de cet essai. Trois règles ont été
    // essayées pour #103 et deux effaçaient TOUTES les morts par ravageurs,
    // y compris ici — 89 devenaient zéro, et la case serait devenue du code
    // mort. Mesuré sur le code livré : 67.
    expect(causes.get("ravageurs") ?? 0).toBeGreaterThan(20);
  });

  it("et une part d'entre elles revient à la charge lente qui les précédait", () => {
    // Mesuré : 89 → 67 morts par ravageurs, et « ombre » passe de 30 à 38.
    // Le reste du report va aux autres causes lentes (soif, engorgement).
    expect(causes.get("ombre") ?? 0).toBeGreaterThan(0);
  });

  it("aucune mort n'est imputée à un sol hors gamme sur un limon riche", () => {
    // Un relevé hebdomadaire naïf de la cause lente départageait des égalités
    // à 1 avec `Math.min`, qui rendait le pH — premier testé. Une hêtraie de
    // limon riche accumulait alors 189 morts « solHorsGamme ». La cause lente
    // ne se relève donc que les semaines où quelque chose a vraiment pesé.
    expect(causes.get("solHorsGamme") ?? 0).toBe(0);
  });
});
