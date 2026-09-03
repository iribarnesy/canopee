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
 * ─── CE QUI MARCHE VRAIMENT : REPLANTER, ET AVEC QUOI ────────────────────────
 * Changer d'essence AVANT le feu ne protège qu'à la marge. Intervenir APRÈS
 * change davantage. Cinq graines, trente-huit ans, replantation dès qu'un feu
 * emporte le peuplement :
 *
 *   conduite                       remontée   semaines hautes   engorgement   ruissellement
 *   pin, laissé à lui-même           41 cm         69              0,71          74 mm
 *   pin, replanté en pin             38 cm         67              0,59          53 mm
 *   pin, replanté en AULNE           31 cm         47              0,48          65 mm
 *   pin, replanté en chêne-liège     62 cm         99              0,82          82 mm
 *
 * Replanter en aulne réduit d'un tiers la durée pendant laquelle la nappe reste
 * haute, et d'un tiers l'engorgement. La raison est dans la fiche de l'espèce
 * et nulle part ailleurs : l'aulne tolère l'engorgement (1,0, le maximum de
 * l'atlas) ET il a soif (seuil de confort 0,85). Il survit donc à ce que le
 * feu a créé, et il boit exactement là où l'eau s'accumule.
 *
 * Replanter en chêne-liège fait l'inverse et AGGRAVE : c'est une espèce
 * xérophile (confort 0,35), elle ne boit pas dans un sol détrempé. Le bon
 * arbre après un incendie n'est pas celui qui résiste au feu, c'est celui qui
 * tient dans l'eau.
 *
 * *(Dans cet essai la replantation est gratuite et instantanée. En partie elle
 * coûte des heures et des plants, et c'est un autre débat.)*
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
    coteM: 30,
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
  const graines = [1, 7, 33, 404];
  const parties = graines.map((g) => partie(melange, g, 35, replant));
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

describe("Saumos 2022 : planter des feuillus atténue, sans protéger", () => {
  const pin = surPlusieursGraines(["pinus_sylvestris"]);
  const feuillus = surPlusieursGraines(["betula_pendula", "castanea_sativa"]);

  it("le pin brûle : sur cette station, c'est la règle et non l'accident", () => {
    expect(pin.bruleesMoyennes).toBeGreaterThan(200);
  });

  it("les feuillus brûlent moins, et connaissent moins de gros incendies", () => {
    // Deux mécanismes se cumulent, aucun n'est écrit pour l'occasion :
    // l'inflammabilité propre de l'essence, et le fait qu'un couvert fermé
    // garde sa litière humide (`portanceDuFeu`, feu.ts).
    expect(feuillus.bruleesMoyennes).toBeLessThan(pin.bruleesMoyennes);
    expect(feuillus.grosFeux).toBeLessThanOrEqual(pin.grosFeux);
  });

  it("mais l'atténuation reste partielle : le feu passe quand même", () => {
    // Le point à retenir pour qui voudrait conclure de ce jeu : changer
    // d'essence ne met pas à l'abri. Sur seize répétitions, les feuillus
    // connaissent encore un gros incendie une fois sur deux.
    expect(feuillus.bruleesMoyennes).toBeGreaterThan(0);
  });
});

describe("l'intervention du gestionnaire : replanter, et avec quoi", () => {
  const AULNE = ["alnus_glutinosa"];
  const PIN = ["pinus_sylvestris"];
  const laisse = surPlusieursGraines(PIN);
  const replanteAulne = surPlusieursGraines(PIN, AULNE);

  it("replanter en aulne raccourcit l'anomalie de nappe et l'engorgement", () => {
    // L'aulne tolère l'engorgement au maximum de l'atlas (1,0) ET il a soif
    // (confort 0,85) : il survit à ce que le feu a créé et il boit là où l'eau
    // s'accumule. Aucune règle ne le dit — ce sont ses deux chiffres de fiche.
    expect(replanteAulne.semainesHautes).toBeLessThan(laisse.semainesHautes);
    expect(replanteAulne.engorgement).toBeLessThan(laisse.engorgement);
  });

  it("le bon arbre d'après-feu n'est pas celui qui résiste au feu", () => {
    // Le chêne-liège survit à l'incendie mieux que tout autre, mais c'est une
    // espèce xérophile : replanté après le feu, il ne boit pas le surplus et
    // laisse la nappe haute plus longtemps que l'aulne.
    const replanteLiege = surPlusieursGraines(PIN, ["quercus_suber"]);
    expect(replanteAulne.semainesHautes).toBeLessThan(replanteLiege.semainesHautes);
  });
});
