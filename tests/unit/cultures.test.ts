/**
 * **Labourer, semer, moissonner, enfin atteignables** (#451, `src/game/cultures.ts`).
 *
 * Le moteur fait pousser un blé depuis #136, et aucun bouton ne le lui
 * demandait. Ce que ces épreuves tiennent est que le jeu **ne décide rien** du
 * champ : les cultures proposées sont celles du moteur, la fenêtre de semis que
 * le panneau nomme en mois est celle que le moteur tient semaine par semaine,
 * les prix affichés sont ceux qu'il facture, et les lignes du journal disent
 * la surface, l'argent et le grain qu'il a comptés — pas une estimation refaite
 * à côté.
 */

import { describe, expect, it } from "vitest";
import {
  applyAction,
  COUT_ENGIN_EUR_M2,
  estGesteSurZone,
  FENETRE_SEMIS_SEMAINES,
  type GameAction,
  grainRecoltableT,
  LABOUR_EUR_M2,
  prevoirAction,
} from "../../src/engine/actions";
import { HERBACEES, INDEX_CULTURES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { cellulesDeLaZone, type Zone } from "../../src/engine/zone";
import {
  actionDuChamp,
  auMoinsUnKilo,
  bornesDuSemis,
  CULTURE_PAR_DEFAUT,
  CULTURES,
  cultureDuMoteur,
  direLaMoisson,
  direLeLabour,
  direLeSemis,
  estGesteDuChamp,
  fenetreDeSemisDite,
  GESTES_DU_CHAMP,
  grainLu,
  heuresLues,
  moissonDite,
  partDeLaPlace,
  semaineDite,
} from "../../src/game/cultures";
import { moisDeLaSemaine, SEMAINES_PAR_MOIS } from "../../src/game/mots";
import type { ActionSansSemaine } from "../../src/game/protocol";
import { NOM_DU_GESTE, refusDit } from "../../src/game/refus";

const COTE = 20;
const STATION = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
const METEO = syntheticYear(LIMON_RICHE.climat);
const DISQUE: Zone = { x: 10, y: 10, rayonM: 5 };

const BLE = cultureDuMoteur("triticum_aestivum");
if (!BLE) throw new Error("le moteur ne sème plus de blé");

/** L'action telle que le worker la date, à la semaine voulue. */
function datee(action: ActionSansSemaine, week: number): GameAction {
  return { ...action, week } as GameAction;
}

/** Une parcelle neuve, menée jusqu'à la semaine de l'année `semaine`. */
function parcelleEn(semaine: number): GameState {
  let s = createGameState(STATION, rngStateFromSeed(4));
  while (s.week % 52 !== semaine) {
    const m = METEO[s.week % 52];
    if (!m) throw new Error("météo manquante");
    s = tick(s, m).state;
  }
  return s;
}

/** Avance une partie de `n` semaines. */
function avance(etat: GameState, n: number): GameState {
  let s = etat;
  for (let k = 0; k < n; k++) {
    const m = METEO[s.week % 52];
    if (!m) throw new Error("météo manquante");
    s = tick(s, m).state;
  }
  return s;
}

describe("le catalogue est celui du moteur", () => {
  it("les cultures proposées sont les siennes, dans son ordre, et ses fiches mêmes", () => {
    // Aucune liste tenue côté jeu : le jour où le moteur apprend l'orge, le
    // bouton apparaît — et ce qu'on lit de la culture est **sa** fiche, pas une
    // copie qui dériverait au premier recalibrage.
    expect(CULTURES.map((c) => c.id)).toEqual(INDEX_CULTURES.map((i) => HERBACEES[i]?.id));
    for (const c of CULTURES) {
      const fiche = HERBACEES.find((h) => h.id === c.id);
      expect(c.culture).toBe(fiche?.culture);
      expect(c.nom).toBe(fiche?.nom);
    }
    expect(CULTURES.map((c) => c.id)).toContain("triticum_aestivum");
    expect(CULTURE_PAR_DEFAUT).toBe(CULTURES[0]?.id);
  });

  it("une herbacée spontanée n'est pas une culture qu'on sème", () => {
    expect(cultureDuMoteur("dactylis_glomerata")).toBeUndefined();
    expect(cultureDuMoteur("quercus_robur")).toBeUndefined();
  });
});

describe("l'action envoyée", () => {
  it("les trois gestes demandent une zone, le semis sa culture", () => {
    expect(actionDuChamp("labourer", DISQUE, "triticum_aestivum")).toEqual({
      type: "labourer",
      ...DISQUE,
    });
    expect(actionDuChamp("semer", DISQUE, "triticum_aestivum")).toEqual({
      type: "semer",
      ...DISQUE,
      cultureId: "triticum_aestivum",
    });
    expect(actionDuChamp("moissonner", DISQUE, "triticum_aestivum")).toEqual({
      type: "moissonner",
      ...DISQUE,
    });
  });

  it("une bande passe telle quelle — une parcelle d'essai de blé est une bande", () => {
    const bande: Zone = {
      zone: "bande",
      x: 10,
      y: 10,
      longueurM: 16,
      largeurM: 4,
      orientationRad: 0.3,
    };
    for (const geste of GESTES_DU_CHAMP) {
      expect(actionDuChamp(geste, bande, "triticum_aestivum")).toMatchObject(bande);
    }
  });

  it("les trois modes du panneau sont les trois gestes du champ, et eux seuls", () => {
    expect(GESTES_DU_CHAMP).toEqual(["labourer", "semer", "moissonner"]);
    for (const geste of GESTES_DU_CHAMP) expect(estGesteDuChamp(geste)).toBe(true);
    for (const autre of ["selection", "planter", "faucher", "fertiliser", "chauler"]) {
      expect(estGesteDuChamp(autre)).toBe(false);
    }
  });
});

describe("la date dite est celle du bandeau", () => {
  it("un mois de jeu est un douzième d'année", () => {
    expect(SEMAINES_PAR_MOIS).toBe(52 / 12);
    expect(moisDeLaSemaine(0)).toBe("janvier");
    expect(moisDeLaSemaine(4)).toBe("janvier");
    expect(moisDeLaSemaine(5)).toBe("février");
    expect(moisDeLaSemaine(28)).toBe("juillet");
    expect(moisDeLaSemaine(41)).toBe("octobre");
    expect(moisDeLaSemaine(51)).toBe("décembre");
  });

  it("une semaine hors de l'année y est ramenée, comme le moteur ramène la sienne", () => {
    expect(moisDeLaSemaine(52)).toBe("janvier");
    expect(moisDeLaSemaine(52 + 41)).toBe("octobre");
    expect(moisDeLaSemaine(-1)).toBe("décembre");
    expect(semaineDite(52 + 28)).toBe("semaine 28, en juillet");
  });
});

describe("la fenêtre de semis que le panneau nomme est celle que le moteur tient", () => {
  // Labouré, donc libre : le seul refus qui reste possible est la saison.
  const laboure = applyAction(parcelleEn(0), datee(actionDuChamp("labourer", DISQUE, ""), 0)).state;

  it("les cinquante-deux semaines de l'année, l'une après l'autre", () => {
    // **Le test qui compte** : le panneau dit « de septembre à novembre » à
    // partir de deux bornes, et le moteur décide semaine par semaine. Le jour où
    // les deux divergent — une fenêtre recalibrée, un écart compté autrement —,
    // c'est ici qu'on le voit, et pas sur un joueur qui sème à la date dite.
    const { debut, fin } = bornesDuSemis(BLE);
    const dedans = (w: number) => (debut <= fin ? w >= debut && w <= fin : w >= debut || w <= fin);
    for (let w = 0; w < 52; w++) {
      const refus = prevoirAction(
        laboure,
        datee(actionDuChamp("semer", DISQUE, BLE.id), laboure.week - (laboure.week % 52) + w),
      );
      const horsSaison = refus.some((r) => r.reason.startsWith("hors fenêtre de semis"));
      expect(horsSaison, `semaine ${w}`).toBe(!dedans(w));
    }
  });

  it("les bornes sont la semaine de la fiche, plus ou moins la fenêtre du moteur", () => {
    const { debut, fin } = bornesDuSemis(BLE);
    expect((debut + FENETRE_SEMIS_SEMAINES) % 52).toBe(BLE.culture.semisWeek);
    expect((fin - FENETRE_SEMIS_SEMAINES + 52) % 52).toBe(BLE.culture.semisWeek);
  });

  it("dite en semaines comme le refus du moteur, et en mois comme le bandeau", () => {
    // La phrase du refus est « hors fenêtre de semis (semaine 41 ± 4) » : le
    // panneau dit la même chose, avant le clic, et la nomme en mois.
    expect(fenetreDeSemisDite(BLE)).toBe("semaine 41 ± 4, de septembre à novembre");
    const refus = prevoirAction(laboure, datee(actionDuChamp("semer", DISQUE, BLE.id), 12));
    expect(refus[0]?.reason).toContain(fenetreDeSemisDite(BLE).split(",")[0] ?? "∅");
  });

  it("la moisson, elle, n'est qu'une date : celle de la fiche", () => {
    expect(moissonDite(BLE)).toBe(`semaine ${BLE.culture.recolteWeek}, en juillet`);
  });
});

describe("les refus se lisent en français", () => {
  it("semer et moissonner ont leur nom, comme labourer", () => {
    expect(NOM_DU_GESTE.labourer).toBe("Labourer");
    expect(NOM_DU_GESTE.semer).toBe("Semer");
    expect(NOM_DU_GESTE.moissonner).toBe("Moissonner");
  });

  it("aucun geste ne se refuse sous l'identifiant du code", () => {
    for (const [id, nom] of Object.entries(NOM_DU_GESTE)) {
      expect(nom, id).not.toBe(id);
      expect(nom.charAt(0), id).toBe(nom.charAt(0).toUpperCase());
    }
  });

  it("les refus du moteur, tels que la boîte des avis les écrit", () => {
    const vierge = parcelleEn(12);
    const rien = prevoirAction(vierge, datee(actionDuChamp("moissonner", DISQUE, ""), vierge.week));
    expect(rien.map(refusDit)).toEqual(["Moissonner : rien à moissonner ici"]);
    const horsSaison = prevoirAction(
      vierge,
      datee(actionDuChamp("semer", DISQUE, BLE.id), vierge.week),
    );
    expect(horsSaison.map(refusDit)).toEqual([
      `Semer : hors fenêtre de semis (semaine ${BLE.culture.semisWeek} ± ${FENETRE_SEMIS_SEMAINES})`,
    ]);
    const inconnue = prevoirAction(vierge, datee(actionDuChamp("semer", DISQUE, "orge"), 41));
    expect(inconnue.map(refusDit)).toEqual(["Semer : orge n'est pas une culture"]);
  });
});

describe("les lignes du journal", () => {
  it("le labour dit la surface, le prix et le temps", () => {
    expect(direLeLabour(208, 4.0212, 0.0402)).toBe(
      "Labour : 208 m², 4,02 € (2 min) — le sol est nu, l'azote est libéré",
    );
    expect(direLeLabour(12_000, 240, 2.4)).toBe(
      "Labour : 1,2 ha, 240 € (2,4 h) — le sol est nu, l'azote est libéré",
    );
  });

  it("le semis dit la culture et la place qu'il a prise", () => {
    expect(direLeSemis("triticum_aestivum", 201, 4.2223, 0.0302, 0.88)).toBe(
      "Semis de blé tendre d'hiver : 201 m², 4,22 € (2 min) — il n'a que 88 % de la place, le tapis tient le reste",
    );
    expect(direLeSemis("triticum_aestivum", 201, 4.2223, 0.0302, 1)).toBe(
      "Semis de blé tendre d'hiver : 201 m², 4,22 € (2 min) — il a toute la place",
    );
  });

  it("la moisson dit le grain vendu et ce que la caisse a gagné", () => {
    // Au centime sous dix euros, à l'euro au-delà — `eurosLus`, comme la fertilisation.
    expect(direLaMoisson(0.0629, 9.18, 0.02)).toBe(
      "Moisson : 63 kg de grain vendu, +9,18 € net de la moissonneuse (1 min) — la paille reste au champ",
    );
    expect(direLaMoisson(1.4, 250, 1.2)).toBe(
      "Moisson : 1,4 t de grain vendu, +250 € net de la moissonneuse (1,2 h) — la paille reste au champ",
    );
    // Un grain qui ne paie pas l'engin : la caisse a perdu, et la ligne le dit.
    expect(direLaMoisson(0.002, -1.98, 0.02)).toBe(
      "Moisson : 2 kg de grain vendu, −1,98 € net de la moissonneuse (1 min) — la paille reste au champ",
    );
  });

  it("une moisson sans un kilo de grain se dit aussi : l'engin a été payé", () => {
    expect(direLaMoisson(0, -2.41, 0.02)).toBe(
      "Moisson : pas un kilo de grain à vendre, 2,41 € de moissonneuse (1 min) — la culture a quitté le champ",
    );
    // Quelques dizaines de grammes ne font pas « 0 kg de grain vendu ».
    expect(direLaMoisson(0.00007, -2.4, 0.02)).toContain("pas un kilo de grain à vendre");
    expect(auMoinsUnKilo(0.00007)).toBe(false);
    expect(auMoinsUnKilo(0.001)).toBe(true);
  });

  it("les heures et le grain dans l'unité qui se lit", () => {
    expect(heuresLues(0.004)).toBe("1 min");
    expect(heuresLues(0.5)).toBe("30 min");
    expect(heuresLues(1)).toBe("1 h");
    expect(heuresLues(2.25)).toBe("2,3 h");
    expect(grainLu(0.0629)).toBe("63 kg");
    expect(grainLu(1)).toBe("1 t");
    expect(grainLu(7.25)).toBe("7,3 t");
  });
});

describe("ce que les lignes disent est ce que le moteur a fait", () => {
  // Une campagne entière sur un disque : labour et semis à la semaine de la
  // fiche, moisson à la sienne. Parcelle sans arbre : l'engin passe partout.
  const semis = BLE.culture.semisWeek;
  const avantLabour = parcelleEn(semis);
  const labour = applyAction(
    avantLabour,
    datee(actionDuChamp("labourer", DISQUE, ""), avantLabour.week),
  );
  const seme = applyAction(
    labour.state,
    datee(actionDuChamp("semer", DISQUE, BLE.id), labour.state.week),
  );
  const cellules = cellulesDeLaZone(COTE, DISQUE);
  // **Le moteur facture ses cellules** (#456), d'un mètre carré chacune : la
  // surface que la ligne du journal écrit est celle qu'il fait payer. Il
  // facturait l'aire du disque, bord de parcelle compris.
  const aireHa = cellules.length / 10_000;

  it("le labour : la surface est celle de son geste, le prix celui que le panneau affiche", () => {
    expect(labour.refusals).toEqual([]);
    const geste = labour.gestes?.find((g) => g.type === "labourer");
    if (!geste || !estGesteSurZone(geste)) throw new Error("le labour ne rapporte plus son geste");
    expect(geste.cellules).toHaveLength(cellules.length);
    const cout = avantLabour.economy.treasuryEur - labour.state.economy.treasuryEur;
    // Le panneau dit « 200 €/ha » : `LABOUR_EUR_M2`, sur la surface que le moteur facture.
    expect(cout).toBeCloseTo(cellules.length * LABOUR_EUR_M2, 9);
  });

  it("le semis : la semence et l'engin du panneau, et toute la place sur un sol labouré", () => {
    expect(seme.refusals).toEqual([]);
    const cout = labour.state.economy.treasuryEur - seme.state.economy.treasuryEur;
    expect(cout).toBeCloseTo(aireHa * (BLE.culture.semenceEurHa + COUT_ENGIN_EUR_M2 * 10_000), 9);
    // Labouré la semaine même : rien n'a repris, le blé prend toute la place.
    expect(partDeLaPlace(seme.state.soil.herbeEmprise, cellules, BLE.id)).toBeCloseTo(1, 9);
  });

  it("une semaine après le labour, l'herbe a repris : la ligne le dit", () => {
    // Labouré la semaine d'avant le semis, comme les essais du moteur : la
    // place que le tapis a reprise est celle que le blé n'aura pas.
    const tot = parcelleEn(semis - 1);
    const laboureTot = avance(
      applyAction(tot, datee(actionDuChamp("labourer", DISQUE, ""), tot.week)).state,
      1,
    );
    const semeTard = applyAction(
      laboureTot,
      datee(actionDuChamp("semer", DISQUE, BLE.id), laboureTot.week),
    );
    expect(semeTard.refusals).toEqual([]);
    const part = partDeLaPlace(semeTard.state.soil.herbeEmprise, cellules, BLE.id);
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    expect(direLeSemis(BLE.id, cellules.length, 0, 0, part)).toContain("il n'a que");
  });

  it("la moisson : le grain est celui que le moteur vend, la caisse le prix moins l'engin", () => {
    const recolte = BLE.culture.recolteWeek;
    const mur = avance(seme.state, (recolte - (seme.state.week % 52) + 52) % 52);
    const grain = grainRecoltableT(mur, DISQUE);
    expect(grain).toBeGreaterThan(0);
    const moisson = applyAction(mur, datee(actionDuChamp("moissonner", DISQUE, ""), mur.week));
    expect(moisson.refusals).toEqual([]);
    const dEur = moisson.state.economy.treasuryEur - mur.economy.treasuryEur;
    // « net de la moissonneuse » : la recette au prix de la fiche, moins
    // l'engin au prix que le panneau affiche. Si le moteur changeait l'un ou
    // l'autre, la ligne et le panneau mentiraient, et c'est ici qu'on le verrait.
    expect(dEur).toBeCloseTo(grain * BLE.culture.prixEurT - cellules.length * COUT_ENGIN_EUR_M2, 6);
    expect(direLaMoisson(grain, dEur, 0.02)).toContain(`${grainLu(grain)} de grain vendu`);
    // Et la place est rendue : rien à moissonner une seconde fois.
    const encore = prevoirAction(moisson.state, datee(actionDuChamp("moissonner", DISQUE, ""), 0));
    expect(encore.map(refusDit)).toEqual(["Moissonner : rien à moissonner ici"]);
  });

  it("avant sa maturité, le blé ne se moissonne pas : le panneau dit le refus du moteur (#455)", () => {
    // Le panneau ne dit pas « hors saison » de lui-même : il affiche ce que
    // `prevoir` rapporte, et c'est le moteur qui décide que le blé n'est pas
    // mûr. Il le décide sur son calendrier, pas sur la date de la fiche : le
    // jeu n'a rien à recalculer, et rien à changer le jour où la maturité
    // bougera avec l'année.
    const pasMur = `Moissonner : ${BLE.nom} n'est pas mûr`;
    const toutJusteSeme = prevoirAction(
      seme.state,
      datee(actionDuChamp("moissonner", DISQUE, ""), seme.state.week),
    );
    expect(toutJusteSeme.map(refusDit)).toEqual([pasMur]);
    const auPrintemps = avance(seme.state, 52 - semis + 14);
    const enAvril = prevoirAction(
      auPrintemps,
      datee(actionDuChamp("moissonner", DISQUE, ""), auPrintemps.week),
    );
    expect(enAvril.map(refusDit)).toEqual([pasMur]);
  });
});
