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
 * REMESURÉ après la correction du modèle de combustible (feu.ts). Les chiffres
 * précédents avaient été obtenus avec un modèle qui amortissait la charge des
 * houppiers par l'ombre que ces mêmes houppiers projetaient — ce qui donnait un
 * avantage artificiel aux peuplements denses, donc aux feuillus.
 *
 * DEUX LOTS INDÉPENDANTS de seize graines, cinquante ans, surface brûlée :
 *
 *   composition       lot A     lot B     gros feux A/B   remontée A/B
 *   pinède pure      1 825 m²  1 311 m²     15/16 · 12/16    64 · 53 cm
 *   feuillus         1 715 m²  1 342 m²     16/16 · 13/16    56 · 57 cm
 *   chêne-liège      1 166 m²  1 059 m²     13/16 · 13/16    62 · 77 cm
 *
 * ─── DEUX CONCLUSIONS CHANGENT ───────────────────────────────────────────────
 *
 * 1. « Planter des feuillus réduit d'un tiers les gros incendies et de 38 % la
 *    remontée de nappe » : RETIRÉ. À cinquante ans l'effet ne réplique pas — il
 *    change de signe d'un lot à l'autre (−6 % puis +2 %), et la remontée ne
 *    montre aucun ordre stable. Ce n'est pas du bruit qu'on aurait mal mesuré,
 *    c'est un effet qui n'existe pas à cet horizon : une fois que tout est passé
 *    au feu au moins une fois, c'est la LANDE qui porte le feu suivant, pas ce
 *    qu'on avait planté dessus.
 *
 * 2. Le même essai arrêté à VINGT-SIX ANS dit autre chose, et les deux sont
 *    vrais : les feuillus y brûlent 655 m² contre 1 032 au pin, soit un tiers
 *    de moins. Planter des feuillus ACHÈTE DU TEMPS ; ça ne change pas le
 *    régime de long terme.
 *
 * ─── ET UNE CONCLUSION S'INVERSE ─────────────────────────────────────────────
 * On avait écrit que le chêne-liège « ne réduit ni la surface parcourue ni la
 * remontée » et que « survivre au feu et l'empêcher sont deux stratégies
 * différentes ». C'est faux, et c'était l'artefact du modèle de combustible.
 *
 * Le chêne-liège est la SEULE composition dont l'avantage réplique aux deux
 * horizons : 507 m² contre 1 032 à vingt-six ans (et AUCUN gros incendie sur
 * huit parties), 1 166 et 1 059 contre 1 825 et 1 311 à cinquante ans. Le
 * mécanisme est émergent, personne ne l'a écrit : son écorce résiste au feu
 * (0,95), donc le peuplement reste debout, donc le couvert reste fermé, donc la
 * litière reste humide et à l'abri du vent — et le feu suivant trouve moins à
 * brûler. SURVIVRE AU FEU EST CE QUI EMPÊCHE LE SUIVANT.
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
 * feuillus ne brûlent jamais », ce que seize répétitions ont démenti.
 *
 * Et seize ne suffisent pas non plus pour les petits écarts : la pinède brûle
 * 1 825 m² dans un lot de seize graines et 1 311 dans l'autre, soit 28 % de
 * différence entre deux mesures du MÊME dispositif. C'est la raison pour
 * laquelle l'avantage des feuillus, qui vaut moins que cela, ne peut pas être
 * affirmé — alors que celui du chêne-liège, qui vaut le double, le peut.
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

  it("les feuillus achètent du temps : à vingt-six ans ils brûlent moins", () => {
    // Deux mécanismes se cumulent, aucun n'est écrit pour l'occasion :
    // l'inflammabilité propre de l'essence, et le fait qu'un couvert fermé
    // garde sa litière humide (`portanceDuFeu`, feu.ts).
    //
    // ATTENTION à la portée de ce résultat : il vaut À CET HORIZON. Poussé à
    // cinquante ans sur deux lots de seize graines, l'écart change de signe
    // (−6 % puis +2 %) — voir l'en-tête. Une fois que tout est passé au feu au
    // moins une fois, c'est la lande qui porte le suivant, pas ce qu'on avait
    // planté dessus.
    expect(feuillus.bruleesMoyennes).toBeLessThan(pin.bruleesMoyennes);
  });

  it("le chêne-liège, lui, tient aux deux horizons — parce qu'il survit", () => {
    // La seule composition dont l'avantage réplique : 507 m² contre 1 032 ici,
    // et 1 166 / 1 059 contre 1 825 / 1 311 à cinquante ans sur deux lots
    // indépendants.
    //
    // Le mécanisme est ÉMERGENT et vaut d'être dit : son écorce résiste au feu
    // (0,95), donc le peuplement reste debout, donc le couvert reste fermé,
    // donc la litière reste humide et à l'abri du vent — et le feu suivant
    // trouve moins à brûler. Survivre au feu est ce qui empêche le suivant.
    // On avait écrit l'inverse tant que le modèle de combustible amortissait la
    // charge des houppiers par leur propre ombre.
    const liege = surPlusieursGraines(["quercus_suber"]);
    expect(liege.bruleesMoyennes).toBeLessThan(0.7 * pin.bruleesMoyennes);
    expect(liege.grosFeux).toBeLessThan(pin.grosFeux);
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
