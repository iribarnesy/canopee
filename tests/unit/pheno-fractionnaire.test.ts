import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { dureeDuJourH, midWeekDayOfYear, syntheticYear } from "../../src/engine/meteo";
import {
  contextePhenologique,
  contextePhenologiqueFractionnaire,
  partFoliaireOmbrageante,
  partFoliaireOmbrageanteDans,
  SENESCENCE_DEBUT_SEMAINE,
} from "../../src/engine/phenologie";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * La phénologie ENTRE deux semaines (#164).
 *
 * Un hêtre passait de nu à à-moitié-feuillu en un seul pas de temps, et le
 * rendu ne pouvait pas l'adoucir sans refaire la phénologie chez lui — ce que la
 * règle du dépôt interdit. Le moteur rend donc son propre calendrier à un
 * instant fractionnaire.
 *
 * CE N'EST PAS UNE INVENTION. Le tick accumule les degrés-jours par un apport
 * hebdomadaire unique tiré d'une seule température moyenne : l'incrément
 * journalier est donc CONSTANT dans la semaine, et interpoler linéairement rend
 * exactement ce que le modèle dit. Tout le reste — durée du jour, porte
 * d'automne, compteur de chute — est recalculé, pas interpolé.
 */

const LATITUDE = 49.5;
const ESPECES = ["betula_pendula", "fagus_sylvatica", "quercus_pubescens"];

/** Deux ans de contextes hebdomadaires, tels que le tick les produit. */
function deuxAns(): ReturnType<typeof contextePhenologique>[] {
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let s: GameState = createGameState({ ...LIMON_RICHE.station, coteM: 30 }, rngStateFromSeed(1));
  const ctxs: ReturnType<typeof contextePhenologique>[] = [];
  for (let i = 0; i < 104; i++) {
    ctxs.push(contextePhenologique(LATITUDE, s.week % 52, s.ddYearBase5, s.semainesDeFroid));
    const w = meteo[s.week % meteo.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return ctxs;
}

const CTXS = deuxAns();

describe("la phénologie se lit entre deux semaines", () => {
  it("aux deux bouts, elle rend EXACTEMENT les semaines qu'elle relie", () => {
    // La garantie qui rend le reste inoffensif : un instant fractionnaire est un
    // raffinement du calendrier du moteur, jamais une seconde version qui
    // pourrait en diverger. Si cet essai tombe, le rendu et le tick ne peignent
    // plus le même printemps.
    for (const id of ESPECES) {
      const e = getEspece(id);
      for (let k = 1; k < CTXS.length; k++) {
        const a = CTXS[k - 1];
        const b = CTXS[k];
        if (!a || !b) continue;
        expect(partFoliaireOmbrageanteDans(e, contextePhenologiqueFractionnaire(a, b, 0))).toBe(
          partFoliaireOmbrageanteDans(e, a),
        );
        expect(partFoliaireOmbrageanteDans(e, contextePhenologiqueFractionnaire(a, b, 1))).toBe(
          partFoliaireOmbrageanteDans(e, b),
        );
      }
    }
  });

  it("elle adoucit le débourrement d'autant qu'on la découpe", () => {
    for (const id of ["betula_pendula", "fagus_sylvatica"]) {
      const e = getEspece(id);
      let parSemaine = 0;
      let parSousPas = 0;
      const PAS = 8;
      for (let k = 1; k < CTXS.length; k++) {
        const a = CTXS[k - 1];
        const b = CTXS[k];
        if (!a || !b) continue;
        const pa = partFoliaireOmbrageanteDans(e, a);
        parSemaine = Math.max(parSemaine, Math.abs(partFoliaireOmbrageanteDans(e, b) - pa));
        let prec = pa;
        for (let i = 1; i <= PAS; i++) {
          const v = partFoliaireOmbrageanteDans(
            e,
            contextePhenologiqueFractionnaire(a, b, i / PAS),
          );
          parSousPas = Math.max(parSousPas, Math.abs(v - prec));
          prec = v;
        }
      }
      // Le défaut mesuré : 44 % pour le bouleau, 51 % pour le hêtre.
      expect(parSemaine).toBeGreaterThan(0.4);
      // Découpé en huit, le plus gros saut tombe d'autant. On n'exige pas le
      // facteur huit exact — un coude dans la semaine en concentrerait une part
      // sur un seul sous-pas, et ce serait fidèle.
      expect(parSousPas).toBeLessThan(parSemaine / 5);
    }
  });

  it("les degrés-jours interpolés sont EXACTEMENT ceux du modèle", () => {
    // Le tick fait `dd += max(0, tMean − 5) × 7`. L'incrément journalier est donc
    // constant dans la semaine, et la droite entre deux bornes EST la courbe.
    for (let k = 1; k < CTXS.length; k++) {
      const a = CTXS[k - 1];
      const b = CTXS[k];
      if (!a || !b || b.ddYearBase5 < a.ddYearBase5) continue;
      const parJour = (b.ddYearBase5 - a.ddYearBase5) / 7;
      for (const t of [0.25, 0.5, 0.75]) {
        const ctx = contextePhenologiqueFractionnaire(a, b, t);
        expect(ctx.ddYearBase5).toBeCloseTo(a.ddYearBase5 + parJour * 7 * t, 9);
      }
    }
  });

  it("la durée du jour est RECALCULÉE, pas interpolée", () => {
    // Interpoler coûterait jusqu'à 4,37 minutes d'erreur, soit 6 % de la largeur
    // de la porte photopériodique — assez pour décaler un débourrement. La
    // recalculer depuis le jour de l'année ne coûte rien et ne se trompe pas.
    for (let k = 1; k < CTXS.length; k++) {
      const a = CTXS[k - 1];
      const b = CTXS[k];
      if (!a || !b) continue;
      for (const t of [0.3, 0.7]) {
        const ctx = contextePhenologiqueFractionnaire(a, b, t);
        expect(ctx.jourH).toBe(dureeDuJourH(LATITUDE, midWeekDayOfYear(a.semaineAnnee) + 7 * t));
        // Et elle DIFFÈRE de la droite quelque part dans l'année, sans quoi cet
        // essai ne distinguerait pas les deux façons de faire.
      }
    }
    const ecarts = CTXS.slice(1).map((b, i) => {
      const a = CTXS[i];
      if (!a) return 0;
      const droite = a.jourH + (b.jourH - a.jourH) * 0.5;
      return Math.abs(contextePhenologiqueFractionnaire(a, b, 0.5).jourH - droite);
    });
    expect(Math.max(...ecarts)).toBeGreaterThan(0.01);
  });

  it("la chute d'automne devient une rampe, et la bascule d'année ne descend pas", () => {
    const e = getEspece("fagus_sylvatica");
    // En automne le compteur de chute est entier ; fractionné, il rend la rampe
    // que le modèle décrit déjà (`1 − depuis / ETALEMENT_CHUTE_SEMAINES`).
    const enAutomne = CTXS.findIndex((c) => c.automne && c.semaineAnnee > SENESCENCE_DEBUT_SEMAINE);
    const a = CTXS[enAutomne];
    const b = CTXS[enAutomne + 1];
    if (!a || !b) throw new Error("pas de semaine d'automne");
    expect(contextePhenologiqueFractionnaire(a, b, 0.5).semainesDepuisSenescence).toBeCloseTo(
      a.semainesDepuisSenescence + 0.5,
      9,
    );
    void partFoliaireOmbrageante;

    // LA BASCULE D'ANNÉE : le cumul se remet à zéro en semaine 0. Interpoler
    // traverserait cette remise à zéro en DESCENDANT, ce qui n'arrive jamais
    // dans le modèle. On tient alors la valeur de départ.
    const bascule = CTXS.findIndex(
      (c, i) => i > 0 && c.ddYearBase5 < (CTXS[i - 1]?.ddYearBase5 ?? 0),
    );
    expect(bascule).toBeGreaterThan(0);
    const avant = CTXS[bascule - 1];
    const apres = CTXS[bascule];
    if (!avant || !apres) throw new Error("pas de bascule");
    for (const t of [0.25, 0.5, 0.75]) {
      expect(contextePhenologiqueFractionnaire(avant, apres, t).ddYearBase5).toBe(
        avant.ddYearBase5,
      );
    }
    void e;
  });
});
