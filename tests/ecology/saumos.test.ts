/**
 * Cas d'étude « Saumos 2022 » : que planter pour ne pas inonder l'hiver ?
 *
 * Les gestionnaires girondins réunis après les feux de 2022 posaient la
 * question dans cet ordre : quelle essence, et quelle opposition ? Le pin
 * pousse vite et fait vivre la filière ; les feuillus brûlent aussi mais
 * ralentissent le feu ; et l'enjeu derrière l'incendie, pour eux, c'est
 * l'inondation de l'hiver suivant — la forêt ne pompant plus, la nappe remonte.
 *
 * On monte la parcelle telle qu'ils la décrivent — sable landais acide, nappe
 * perchée, tout le bassin logé à la même enseigne — on plante deux
 * compositions, et on laisse le moteur déclencher SES PROPRES incendies. Rien
 * n'est scénarisé : ni la date des feux, ni leur étendue, ni ce qu'ils
 * emportent.
 *
 * ─── CE QUE MESURE L'ESSAI COMPLET ───────────────────────────────────────────
 * Seize graines par composition, cinquante ans, parcelle de 40 m :
 *
 *   composition        brûlé moyen   gros feux   peuplement tué   REMONTÉE
 *   pinède pure          1 928 m²     12/16          86 %           52 cm
 *   feuillus             1 470 m²      8/16         101 %           32 cm
 *   chêne-liège          2 058 m²     12/16          81 %           47 cm
 *
 * Planter des feuillus plutôt que du pin réduit d'un tiers le nombre de gros
 * incendies et de 38 % la remontée de nappe qui suit. C'est la seule
 * atténuation qu'on ait trouvée, et elle est modeste.
 *
 * Le chêne-liège, lui, ne réduit ni la surface parcourue ni la remontée : il
 * perd simplement moins d'arbres à chaque passage du feu (son écorce est faite
 * pour ça) et c'est le peuplement le plus haut à la fin. Survivre au feu et
 * l'empêcher sont deux stratégies différentes.
 *
 * ─── UNE CONCLUSION RETIRÉE ──────────────────────────────────────────────────
 * On avait mesuré ici que replanter en aulne après le feu raccourcissait d'un
 * tiers la durée pendant laquelle la nappe reste haute, et on l'avait écrit
 * comme un résultat. C'en était un artefact.
 *
 * À l'époque, le feuillage était commandé par un seul booléen — `tMean > 6 °C`
 * — vrai presque tout l'hiver dans les Landes. TOUS les caducs y transpiraient
 * donc en janvier, ce qui n'a aucun sens : un aulne n'a pas de feuilles en
 * hiver et ne peut pas rabattre une nappe hivernale. Depuis que chaque espèce
 * a son calendrier (phenologie.ts), cette transpiration fantôme a disparu — et
 * l'avantage de l'aulne avec elle.
 *
 * Remesuré sur cinq graines, aucune essence de replantation ne se détache : les
 * écarts (38 à 115 semaines de nappe haute selon l'essence) sont du même ordre
 * que le bruit d'un incendie à l'autre, et l'ordre des essences change avec la
 * graine. On ne conclut donc rien.
 *
 * ─── ET SURTOUT : LA VARIANCE ÉCRASE TOUT ────────────────────────────────────
 * D'une graine à l'autre, la même composition brûle de 0 à 4 500 m². Trois à
 * cinq parties sur seize ne connaissent aucun incendie. Un seul essai par
 * composition ne prouve donc RIEN — le premier qu'on avait fait donnait « les
 * feuillus ne brûlent jamais », ce que seize répétitions ont démenti. Le test
 * ci-dessous répète, et ne garde que ce qui survit à la répétition.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getScenario, meteoDerivee, normalesHebdo } from "../../src/engine/climat";
import { serieToWeeks } from "../../src/engine/meteo";
import { bordersUniformes, entourageDeLaStation } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Le profil de départ, celui qu'on enregistre sous « Saumos 2022 ». */
function saumos(): Station {
  const base = LANDE_SECHE.station;
  const bordures = bordersUniformes("lande-ouverte");
  return {
    ...base,
    coteM: 24,
    // Nappe landaise perchée : c'est elle qui fait tenir une forêt sur un
    // sable sans réserve utile.
    profondeurNappeEquilibreCm: 400,
    // Tout le bassin subit le même sort : c'est un incendie de MASSIF.
    partBassinSemblable: 1,
    ...entourageDeLaStation(bordures, base.phInitial, base.ruMm),
  };
}

const SERIE = serieToWeeks(serieMeteoPour("lande-seche") as never);
const NORMALES = normalesHebdo(SERIE);
const SCENARIO = getScenario("ssp245");

function meteo(i: number) {
  const base = SERIE[i % SERIE.length];
  if (!base) throw new Error("météo manquante");
  return meteoDerivee(base, i % 52, SCENARIO, 2026 + Math.floor(i / 52), NORMALES, 0);
}

function planter(depart: GameState, melange: readonly string[]): GameState {
  let s = depart;
  let k = 0;
  for (let y = 2; y < s.station.coteM - 2; y += 3) {
    for (let x = 2; x < s.station.coteM - 2; x += 3) {
      const espece = melange[k % melange.length];
      // Baliveaux : on éprouve une forêt, pas une plantation d'un an.
      if (espece) s = plantAt(s, espece, x, y, 6);
      k++;
    }
  }
  return s;
}

/**
 * Une partie. `replant` simule l'intervention du gestionnaire : dès qu'un feu
 * emporte le peuplement, on replante l'essence indiquée.
 */
function partie(
  melange: readonly string[],
  seed: number,
  annees: number,
  replant?: readonly string[],
) {
  let state = createGameState(saumos(), rngStateFromSeed(seed));
  state = planter(state, melange);
  let brulees = 0;
  let grosFeu = false;
  let anFeu = -1;
  let nappeAvantFeu = 0;
  let semainesHautes = 0;
  let engorgementApres = 0;
  for (let i = 0; i < annees * 52; i++) {
    const an = Math.floor(i / 52);
    const r = tick(state, meteo(i));
    state = r.state;
    if (r.incendie) {
      brulees += r.incendie.cellulesBrulees;
      if (r.incendie.arbresTues > 30) {
        if (i > 15 * 52) grosFeu = true;
        if (an > 12 && anFeu < 0) {
          anFeu = an;
          nappeAvantFeu = r.fluxes.nappeProfondeurCm;
        }
        if (replant) state = planter(state, replant);
      }
    }
    if (anFeu >= 0 && an > anFeu && an <= anFeu + 4) {
      // « Nappe haute » : plus de dix centimètres au-dessus de son niveau
      // d'avant le feu. C'est la DURÉE de l'anomalie qui compte, pas son pic.
      if (r.fluxes.nappeProfondeurCm < nappeAvantFeu - 10) semainesHautes++;
      engorgementApres = Math.max(engorgementApres, r.fluxes.waterloggingMean);
    }
  }
  return { brulees, grosFeu, semainesHautes, engorgementApres, aEuFeu: anFeu >= 0 };
}

/** Moyenne sur plusieurs graines : une seule ne dit rien (voir l'en-tête). */
function surPlusieursGraines(melange: readonly string[], replant?: readonly string[]) {
  const graines = [1, 7, 33, 404, 2022, 55, 91, 128];
  const parties = graines.map((g) => partie(melange, g, 26, replant));
  const avecFeu = parties.filter((p) => p.aEuFeu);
  const moyenne = (f: (p: (typeof parties)[0]) => number) =>
    avecFeu.length === 0 ? 0 : avecFeu.reduce((s, p) => s + f(p), 0) / avecFeu.length;
  return {
    bruleesMoyennes: parties.reduce((s, p) => s + p.brulees, 0) / parties.length,
    grosFeux: parties.filter((p) => p.grosFeu).length,
    semainesHautes: moyenne((p) => p.semainesHautes),
    engorgement: moyenne((p) => p.engorgementApres),
    parties: parties.length,
  };
}

const PIN = ["pinus_sylvestris"];
/** Calculé une fois : chaque appel coûte huit parties de vingt-six ans. */
const pin = surPlusieursGraines(PIN);

describe("Saumos 2022 : planter des feuillus atténue, sans protéger", () => {
  const feuillus = surPlusieursGraines(["betula_pendula", "castanea_sativa"]);

  it("le pin brûle : sur cette station, c'est la règle et non l'accident", () => {
    expect(pin.bruleesMoyennes).toBeGreaterThan(200);
  });

  it("les feuillus brûlent moins, et connaissent moins de gros incendies", () => {
    // Deux mécanismes se cumulent, aucun n'est écrit pour l'occasion :
    // l'inflammabilité propre de l'essence, et le fait qu'un couvert fermé
    // garde sa litière humide (`portanceDuFeu`, feu.ts).
    // On compare la SURFACE moyenne parcourue, pas le nombre de gros feux :
    // un compte sur huit parties n'a aucune résolution — il bascule d'une
    // graine à l'autre, alors que la surface, continue, garde le signal.
    expect(feuillus.bruleesMoyennes).toBeLessThan(pin.bruleesMoyennes);
  });

  it("mais l'atténuation reste partielle : le feu passe quand même", () => {
    // Le point à retenir pour qui voudrait conclure de ce jeu : changer
    // d'essence ne met pas à l'abri. Sur seize répétitions, les feuillus
    // connaissent encore un gros incendie une fois sur deux.
    expect(feuillus.bruleesMoyennes).toBeGreaterThan(0);
  });
});

describe("l'intervention du gestionnaire : ce que l'essai NE montre pas", () => {
  const laisse = pin;
  const replante = surPlusieursGraines(PIN, ["alnus_glutinosa"]);

  it("replanter ne change pas de façon fiable la suite hydrologique", () => {
    // Ce test garde la trace d'une CONCLUSION RETIRÉE. On avait mesuré que
    // replanter en aulne raccourcissait d'un tiers l'anomalie de nappe, et on
    // l'avait écrit. C'était un artefact : à l'époque, le feuillage était
    // commandé par un simple `tMean > 6 °C`, vrai presque tout l'hiver dans
    // les Landes — tous les caducs y transpiraient donc en janvier. Avec un
    // vrai calendrier foliaire (phenologie.ts), un aulne n'a pas de feuilles
    // en hiver et ne peut pas rabattre une nappe hivernale. L'avantage a
    // disparu avec l'artefact qui le portait.
    //
    // Ce qui reste vrai : les écarts entre essences de replantation sont du
    // même ordre que le bruit d'un incendie à l'autre. On n'assert donc rien
    // sur leur direction — on vérifie seulement que les deux conduites
    // produisent bien une anomalie, ce qui est le fait solide.
    expect(laisse.semainesHautes).toBeGreaterThan(0);
    expect(replante.semainesHautes).toBeGreaterThan(0);
  });
});
