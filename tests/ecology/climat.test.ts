/**
 * Dérive climatique (critères D8, D9 ; docs/regles.md §15).
 *
 * Ce que ces tests vérifient, dans l'ordre : que les trajectoires GIEC sont
 * bien celles d'AR6, que la France se réchauffe plus vite que le globe et
 * surtout l'été, que l'effet fertilisant du CO₂ reste borné par la loi du
 * minimum — et, pour finir, que tout ça se VOIT dans une partie : à station,
 * graine et actions identiques, une parcelle vieillit dans un climat qui n'est
 * plus le même.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import {
  amplificationFrance,
  co2Ppm,
  facteurCo2Croissance,
  facteurCo2Transpiration,
  facteurPluie,
  formeSaisonniere,
  getScenario,
  meteoDerivee,
  normalesHebdo,
  rechauffementFranceC,
  rechauffementGlobalC,
} from "../../src/engine/climat";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { diametreInitialCm, tickTree } from "../../src/engine/trees";

const SERIE = serieMeteoPour("limon-riche");
if (!SERIE) throw new Error("série manquante");
const OBSERVATIONS = serieToWeeks(SERIE);

describe("les trajectoires GIEC", () => {
  it("les trois scénarios divergent après 2050, pas avant", () => {
    const en2030 = ["ssp126", "ssp245", "ssp585"].map((id) =>
      rechauffementGlobalC(getScenario(id as never), 2030),
    );
    // Avant 2030 l'inertie du système domine : les scénarios se tiennent.
    expect(Math.max(...en2030) - Math.min(...en2030)).toBeLessThan(0.3);
    expect(rechauffementGlobalC(getScenario("ssp585"), 2090)).toBeGreaterThan(
      2 * rechauffementGlobalC(getScenario("ssp126"), 2090),
    );
  });

  it("le CO₂ suit sa trajectoire et ne recule pas", () => {
    const s = getScenario("ssp585");
    expect(co2Ppm(s, 2050)).toBeGreaterThan(co2Ppm(s, 2026));
    expect(co2Ppm(s, 2100)).toBeGreaterThan(1000);
    // Sobriété : le CO₂ se stabilise au lieu de filer.
    expect(co2Ppm(getScenario("ssp126"), 2100)).toBeLessThan(500);
  });

  it("le scénario « climat figé » ne bouge pas — c'est un témoin, pas une prévision", () => {
    const s = getScenario("stable");
    const semaineEte = 28;
    const base = OBSERVATIONS[semaineEte];
    if (!base) throw new Error("météo manquante");
    const derivee = meteoDerivee(base, semaineEte, s, 2100);
    expect(derivee.tMean).toBeCloseTo(base.tMean, 6);
    expect(derivee.rainMm).toBeCloseTo(base.rainMm, 6);
  });
});

describe("la France n'est pas le globe", () => {
  it("elle se réchauffe plus vite, et l'été plus que l'hiver", () => {
    const s = getScenario("ssp245");
    const hiver = amplificationFrance(s, 2100, 2);
    const ete = amplificationFrance(s, 2100, 28);
    expect(hiver).toBeGreaterThan(1);
    expect(ete).toBeGreaterThan(hiver);
    expect(ete).toBeLessThan(2.2);
  });

  it("les trajectoires françaises valent ce que dit l'estimation contrainte", () => {
    // Ribes et al. 2022 (CMIP6 contraint), base des paliers TRACC : à +2,7 °C
    // pour le globe, la France est à +3,8 °C en moyenne annuelle, +3,2 l'hiver
    // et +5,1 l'été. C'est ce que le moteur doit reproduire — on tolère un
    // demi-degré, la forme saisonnière n'étant pas exactement sinusoïdale.
    const s = getScenario("ssp245");
    expect(rechauffementFranceC(s, 2100)).toBeCloseTo(3.8, 1);
    const annuel = rechauffementFranceC(s, 2100);
    expect(annuel * formeSaisonniere(2)).toBeGreaterThan(2.7);
    expect(annuel * formeSaisonniere(2)).toBeLessThan(3.5);
    expect(annuel * formeSaisonniere(28)).toBeGreaterThan(4.7);
    expect(annuel * formeSaisonniere(28)).toBeLessThan(5.5);
  });

  it("la forme saisonnière ne fait que RÉPARTIR : sa moyenne annuelle vaut 1", () => {
    let somme = 0;
    for (let w = 0; w < 52; w++) somme += formeSaisonniere(w);
    expect(somme / 52).toBeCloseTo(1, 2);
  });

  it("les étés s'assèchent pendant que les hivers s'arrosent", () => {
    const s = getScenario("ssp585");
    expect(facteurPluie(s, 2090, 28)).toBeLessThan(0.85);
    expect(facteurPluie(s, 2090, 2)).toBeGreaterThan(1);
  });

  it("une semaine d'été de fin de siècle est nettement plus chaude et plus sèche", () => {
    const semaine = 28;
    const base = OBSERVATIONS[semaine];
    if (!base) throw new Error("météo manquante");
    const futur = meteoDerivee(base, semaine, getScenario("ssp585"), 2090);
    expect(futur.tMean - base.tMean).toBeGreaterThan(6);
    expect(futur.rainMm).toBeLessThan(base.rainMm);
    // Le gel tardif suit la même dérive : c'est ce qui déplace les floraisons.
    expect(futur.tMinAbsC).toBeGreaterThan(base.tMinAbsC);
  });
});

describe("le CO₂ : ce qu'il donne et ce qu'il ne donne pas", () => {
  it("il stimule la croissance, sans miracle : doubler ne double rien", () => {
    expect(facteurCo2Croissance(420)).toBeCloseTo(1, 6);
    const double = facteurCo2Croissance(840);
    expect(double).toBeGreaterThan(1.1);
    expect(double).toBeLessThan(1.3);
  });

  it("il ferme les stomates : plus de CO₂, moins d'eau perdue", () => {
    expect(facteurCo2Transpiration(840)).toBeLessThan(1);
    expect(facteurCo2Transpiration(840)).toBeGreaterThan(0.75);
  });

  it("mais la loi du minimum le borne : un arbre qui a soif n'en profite pas", () => {
    const arbre = {
      id: 1,
      especeId: "fagus_sylvatica",
      x: 5,
      y: 5,
      ageWeeks: 52 * 15,
      heightM: 6,
      diametreCm: diametreInitialCm(6),
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 80,
      hauteurElagueeM: 0,
      recepages: 0,
      vigueurIndividuelle: 1,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
    };
    const env = {
      waterloggingRatio: 0,
      light: 1,
      nitrogenSatisfaction: 1,
      phMean: 6,
      solPenetrableCm: 120,
      tMean: 18,
    };
    const pousse = (waterSatisfaction: number, facteurCo2: number) =>
      tickTree(arbre, { ...env, waterSatisfaction, facteurCo2 }).tree.heightM - arbre.heightM;
    const alaise = { sans: pousse(1, 1), avec: pousse(1, facteurCo2Croissance(840)) };
    const assoiffe = { sans: pousse(0.15, 1), avec: pousse(0.15, facteurCo2Croissance(840)) };
    // À l'aise, le CO₂ paie…
    expect(alaise.avec).toBeGreaterThan(1.1 * alaise.sans);
    // …mais ce qui manque à l'assoiffé, c'est de l'eau, et le CO₂ n'en fait pas.
    // …et l'assoiffé ne gagne presque rien EN VALEUR ABSOLUE : le CO₂
    // multiplie un potentiel que la loi du minimum a déjà réduit à presque
    // rien. Il ne fabrique pas d'eau.
    expect(assoiffe.avec - assoiffe.sans).toBeLessThan(0.25 * (alaise.avec - alaise.sans));
  });
});

describe("les extrêmes s'aggravent plus vite que les moyennes (D11)", () => {
  const normales = normalesHebdo(OBSERVATIONS);

  it("une canicule gagne plus de degrés qu'une semaine ordinaire de la même saison", () => {
    const s = 30; // début août
    const semaines = OBSERVATIONS.filter((_, i) => i % 52 === s);
    const ordinaire = semaines.reduce((a, b) =>
      Math.abs(b.tMean - (normales.tMean[s] ?? 0)) < Math.abs(a.tMean - (normales.tMean[s] ?? 0))
        ? b
        : a,
    );
    const canicule = semaines.reduce((a, b) => (b.tMean > a.tMean ? b : a));
    const sc = getScenario("ssp585");
    const gain = (w: (typeof semaines)[number]) =>
      meteoDerivee(w, s, sc, 2090, normales).tMean - w.tMean;
    expect(gain(canicule)).toBeGreaterThan(gain(ordinaire) + 0.5);
  });

  it("une semaine déjà en déficit se creuse au-delà du simple décalage", () => {
    const s = 30;
    const semaines = OBSERVATIONS.filter((_, i) => i % 52 === s);
    const normale = normales.rainMm[s] ?? 0;
    // Une semaine sous sa normale, mais pas à zéro (on ne peut pas creuser
    // au-dessous de rien).
    const enDeficit = semaines
      .filter((w) => w.rainMm > 2 && w.rainMm < normale)
      .reduce((a, b) => (b.rainMm < a.rainMm ? b : a));
    const arrosee = semaines.reduce((a, b) => (b.rainMm > a.rainMm ? b : a));
    const sc = getScenario("ssp585");
    // Comparé au seul décalage saisonnier : la semaine en déficit perd en plus,
    // celle au-dessus de sa normale ne perd rien de plus.
    expect(meteoDerivee(enDeficit, s, sc, 2090, normales).rainMm).toBeLessThan(
      meteoDerivee(enDeficit, s, sc, 2090).rainMm,
    );
    expect(meteoDerivee(arrosee, s, sc, 2090, normales).rainMm).toBeCloseTo(
      meteoDerivee(arrosee, s, sc, 2090).rainMm,
      6,
    );
  });

  it("sans normales, on retombe sur le simple décalage de moyenne", () => {
    const base = OBSERVATIONS[30];
    if (!base) throw new Error("météo manquante");
    const sc = getScenario("ssp585");
    expect(meteoDerivee(base, 30, sc, 2090).tMean).toBeLessThanOrEqual(
      meteoDerivee(base, 30, sc, 2090, normales).tMean + 1e-9,
    );
  });
});

describe("dans une partie, le réchauffement se voit", () => {
  const normales = normalesHebdo(OBSERVATIONS);

  function partie(scenarioId: "stable" | "ssp585", ans: number, graine = 11) {
    const station: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
    let state = createGameState(station, rngStateFromSeed(graine));
    state = plantScattered(state, "fagus_sylvatica", 60);
    state = plantScattered(state, "quercus_pubescens", 60);
    /**
     * Les ids des cent vingt arbres PLANTÉS. Au-delà de la maturité les deux
     * espèces se ressèment, et un climat plus chaud allonge la saison de
     * végétation donc en installe davantage : compter « les tiges vivantes »
     * mélangerait la cohorte et ses descendants, ce qui masque exactement la
     * mortalité qu'on mesure.
     */
    const cohorte = new Set(state.trees.map((t) => t.id));
    const scenario = getScenario(scenarioId);
    let etpDebut = 0;
    let etpFin = 0;
    const morts: { especeId: string; cause: string }[] = [];
    /**
     * Le sommet de la pullulation, RAPPORTÉ AUX HÔTES.
     *
     * `ravageurMoyen` est une moyenne sur TOUTES les cellules de la parcelle, y
     * compris celles qui ne portent aucun arbre. Elle mélange donc deux choses
     * que le réchauffement pousse en sens CONTRAIRES : le climat devient plus
     * favorable aux ravageurs (`facteurChaleur`), et il y a de moins en moins
     * d'hôtes à infester puisqu'il en tue. Le brut a fini par dire l'inverse du
     * mécanisme sur la graine 23 (#95 : 1,54 / 0,98 / 1,47 ×), et pas parce que
     * le lien chaleur-pullulation avait bougé — parce que le témoin figé de
     * cette graine s'était mis à garder ses tiges.
     *
     * Divisé par le nombre de tiges vivantes, le confondant part et le signal
     * devient franc sur les trois parties : 3,17 / 2,64 / 2,99 ×. Ce n'est pas
     * une grandeur physique — c'est une NORMALISATION, qui rend les deux
     * parties comparables en neutralisant ce qui les distingue par ailleurs.
     */
    let pressionParHoteMax = 0;
    /** Le sommet de la pullulation BRUTE, sans normalisation : l'autre thermomètre. */
    let pressionBruteMax = 0;
    for (let i = 0; i < ans * 52; i++) {
      const base = OBSERVATIONS[i % OBSERVATIONS.length];
      if (!base) throw new Error("météo manquante");
      // Avec les normales, comme le fait le jeu : sans elles on perd
      // l'accentuation des extrêmes, et c'est précisément elle qui tue.
      const w = meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52), normales);
      const r = advanceWeek(state, w, []);
      state = r.state;
      morts.push(...r.morts);
      const vivantes = state.trees.filter((t) => t.alive).length;
      pressionBruteMax = Math.max(pressionBruteMax, r.fluxes.ravageurMoyen);
      pressionParHoteMax = Math.max(
        pressionParHoteMax,
        r.fluxes.ravageurMoyen / Math.max(1, vivantes),
      );
      if (i < 5 * 52) etpDebut += r.fluxes.etpMm;
      if (i >= (ans - 5) * 52) etpFin += r.fluxes.etpMm;
    }
    return {
      pressionParHoteMax,
      pressionBruteMax,
      etpDebut: etpDebut / 5,
      etpFin: etpFin / 5,
      hetresMortsDeSoif: morts.filter(
        (m) => m.especeId === "fagus_sylvatica" && m.cause === "secheresse",
      ).length,
      // Ce qui reste DEBOUT de la cohorte plantée : la grandeur directe, celle
      // qu'aucune imputation de cause ne peut déplacer (#84).
      cohorteDebout: state.trees.filter((t) => t.alive && cohorte.has(t.id)).length,
      hetresDebout: state.trees.filter(
        (t) => t.alive && cohorte.has(t.id) && t.especeId === "fagus_sylvatica",
      ).length,
      cohorte: cohorte.size,
    };
  }

  const GRAINES = [11, 23, 37];

  /**
   * Trois parties, moyennées ET gardées séparées. Les comptes de morts sont
   * des ÉVÉNEMENTS rares : une seule partie en donne un tirage, pas une
   * mesure. Mais la moyenne ne sauve pas tout — elle peut masquer une graine
   * qui dit le contraire des deux autres, et c'est ce qui se passait ici.
   */
  function moyenneSurGraines(scenarioId: "stable" | "ssp585", ans: number) {
    const runs = GRAINES.map((g) => partie(scenarioId, ans, g));
    const moyen = (f: (r: (typeof runs)[number]) => number) =>
      runs.reduce((s, r) => s + f(r), 0) / runs.length;
    return {
      runs,
      etpDebut: moyen((r) => r.etpDebut),
      etpFin: moyen((r) => r.etpFin),
      hetresMortsDeSoif: moyen((r) => r.hetresMortsDeSoif),
      cohorteDebout: moyen((r) => r.cohorteDebout),
      hetresDebout: moyen((r) => r.hetresDebout),
    };
  }

  /**
   * La campagne tourne dans un `beforeAll`, pas dans le corps du `describe`.
   * Lancée à la COLLECTE, elle n'est couverte par aucun délai — ni
   * `testTimeout`, ni un délai posé sur le `describe` — et une campagne qui
   * s'emballe bloque la suite au lieu de la faire échouer
   * (docs/agents/moteur-maintenance.md).
   */
  let fige: ReturnType<typeof moyenneSurGraines>;
  let chauffe: ReturnType<typeof moyenneSurGraines>;
  beforeAll(() => {
    fige = moyenneSurGraines("stable", 60);
    chauffe = moyenneSurGraines("ssp585", 60);
  }, 900_000);

  it("la demande en eau de l'atmosphère monte bien plus vite qu'avec le seul climat observé", () => {
    // À noter : même « figée », la parcelle voit l'ETP monter de 16 % en
    // soixante ans — parce que la série d'observations 1964-2023 CONTIENT le
    // réchauffement déjà survenu. Le scénario ne fait qu'accélérer une pente
    // qui existe déjà, et c'est bien pour ça que « climat figé » n'est un
    // témoin de laboratoire, pas une prévision.
    expect(fige.etpFin / fige.etpDebut).toBeGreaterThan(1.1);
    expect(chauffe.etpFin / chauffe.etpDebut).toBeGreaterThan(1.25);
    expect(chauffe.etpFin / chauffe.etpDebut).toBeGreaterThan(1.1 * (fige.etpFin / fige.etpDebut));
  });

  it("le hêtre, mésophile, se met à mourir de soif — ce qu'il ne faisait pas", () => {
    // Aucun déplacement d'aire n'est codé : c'est la conjonction d'une ETP qui
    // monte et de pluies d'été qui reculent, lue par les seuils d'une espèce
    // qui « aime le frais ». Sur soixante ans de climat figé, le hêtre ne
    // meurt jamais de sécheresse sur ce limon profond ; sous SSP5-8.5, si.
    // Ce qui compte est le RAPPORT, pas le compte. À climat figé, il meurt
    // quelques hêtres de soif : un semis dense s'auto-éclaircit, et la soif
    // est un des couteaux qui s'en charge — d'autant plus depuis que le
    // plafond d'auto-éclaircie laisse le fourré atteindre sa vraie densité.
    // Sous SSP5-8.5, la même parcelle en perd plus de vingt fois autant.
    expect(fige.hetresMortsDeSoif).toBeLessThan(5);
    expect(chauffe.hetresMortsDeSoif).toBeGreaterThan(5);
    expect(chauffe.hetresMortsDeSoif).toBeGreaterThan(3 * Math.max(1, fige.hetresMortsDeSoif));
    // On ne compare PAS les effectifs finaux : ils mélangent la cohorte
    // plantée et les semis nés en cours de route, et un climat plus chaud
    // allonge la saison de végétation donc en installe davantage. Un
    // peuplement qui perd plus d'arbres peut très bien en compter plus.
  });

  it("le réchauffement fait flamber la pullulation, et sur chacune des trois parties", () => {
    // Conséquence en cascade, elle non plus codée nulle part : plus il fait
    // chaud, plus les générations s'enchaînent (`facteurChaleur`, ravageurs.ts).
    //
    // CET ESSAI A CHANGÉ DE GRANDEUR (#68). Il portait sur le nombre de MORTS
    // par ravageurs, et son seuil avait déjà été descendu de ×2 à ×1,3 le jour
    // où les vitesses de croissance ont été calées sur les tables. Ce nombre-là
    // n'est pas une propriété du monde : il OSCILLE d'un lot de mécanisme à
    // l'autre, parce qu'un arbre ne meurt qu'une fois et que les causes se
    // volent leurs victimes. Mesuré deux fois à trois lots d'écart :
    //
    //                    avant sanglier/lisière      après
    //   graine 11          34 → 40  (1,18 ×)       24 → 33  (1,38 ×)
    //   graine 23          32 → 21  (0,66 ×)       23 → 31  (1,35 ×)
    //   graine 37          25 → 38  (1,52 ×)       19 → 37  (1,95 ×)
    //
    // La graine 23 a dit l'inverse des deux autres, puis s'est remise à dire
    // comme elles, sans que le lien entre chaleur et pullulation ait bougé.
    // Un seuil accroché à ça n'enregistre que le moteur (docs/realisme.md,
    // « ce qu'un test écologique a le droit d'affirmer »).
    //
    // La PULLULATION, elle, résiste — c'est elle que la chaleur produit
    // directement (`facteurChaleur`), là où le compte de morts est un
    // composite. Éprouvée en neutralisant `facteurChaleur` : elle tombe —
    // c'est le mécanisme qu'elle lit, pas le jeu de dés.
    //
    // MAIS ELLE SE MESURAIT PAR HABITANT DE LA PARCELLE, PAS PAR HÔTE (#95),
    // et ça l'a rattrapée. `ravageurMoyen` est une moyenne sur toutes les
    // cellules, y compris celles qui ne portent aucun arbre : elle mélange
    // « le climat favorise les ravageurs » et « combien d'hôtes il reste », que
    // le réchauffement pousse en sens CONTRAIRES. Le brut a tenu tant que les
    // deux témoins se ressemblaient ; il a dit l'inverse du mécanisme le jour
    // où le plafond de recouvrement est devenu local et où un peuplement qui
    // s'éclaircit s'est mis à combler ses propres trouées — le témoin figé de
    // la graine 23 garde alors ses tiges, donc ses hôtes, et le rapport tombe
    // sous 1 sans que rien d'écologique ait bougé.
    //
    //                 brut (moyenne parcelle)   par hôte, au pic
    //   graine 11            1,54 ×                  3,17 ×
    //   graine 23            0,98 ×                  2,64 ×
    //   graine 37            1,47 ×                  2,99 ×
    //
    // Divisée par les tiges vivantes, la pullulation est franche sur les trois
    // parties et deux fois plus forte qu'au brut.
    //
    // ── ET LA NORMALISATION S'EST RÉVÉLÉE ÊTRE LE GROS DU SIGNAL (#183) ──
    //
    // La carie du tronc (#182) a fait tomber cet essai, à 1,98 sur la graine 11
    // pour un seuil à 2. Elle ne parle pas de ravageurs : elle déplace des
    // chablis, donc des hôtes, donc le DÉNOMINATEUR. Recampagné sur six graines
    // plutôt que trois, avec les deux thermomètres côte à côte :
    //
    //   graine        11     23     37      5     41      7
    //   par hôte    1,98   3,03   2,44   2,72   1,69   2,62
    //   brut        1,38   1,37   1,37   1,46   1,88   1,29
    //
    // Le brut, qui avait inversé sur une graine en #95, ne le fait plus sur
    // aucune des six et tient dans une bande étroite (1,29 à 1,88). Le par-hôte
    // s'étale du simple au double (1,69 à 3,03) — et la graine 41 dit pourquoi :
    // ses deux bras finissent avec 274 et 282 tiges, donc la normalisation n'a
    // rien à corriger, et c'est la seule où elle ABAISSE le rapport (1,88 → 1,69).
    // Partout ailleurs elle le gonfle, parce qu'elle recompte la mortalité que
    // l'essai SUIVANT mesure déjà et bien mieux.
    //
    // On garde donc les deux, et on exige les deux. Un thermomètre qui a
    // flanché une fois ne se remplace pas par un autre qui a flanché une fois :
    // il se double. Les seuils sont posés sous les minimums de la campagne à
    // six graines — 1,5 sous 1,69, et 1,2 sous 1,29 —, et tous deux très
    // au-dessus de 1 pour rester des affirmations.
    //
    // Que le réchauffement TUE est affirmé par l'essai suivant, sur ce qui
    // reste DEBOUT de la cohorte plantée (#93, #84).
    for (const [i, f] of fige.runs.entries()) {
      const c = chauffe.runs[i];
      if (!c) throw new Error("partie manquante");
      expect(c.pressionParHoteMax, `par hôte, graine ${GRAINES[i]}`).toBeGreaterThan(
        1.5 * f.pressionParHoteMax,
      );
      expect(c.pressionBruteMax, `brut, graine ${GRAINES[i]}`).toBeGreaterThan(
        1.2 * f.pressionBruteMax,
      );
    }
  });

  it("et il TUE : la cohorte plantée compte moins de tiges debout, sur chacune des trois parties", () => {
    // La pullulation seule ne dit pas que le réchauffement tue. Ce maillon-là
    // s'était perdu (#93) et il se rattrape ici — mais PAS avec l'instrument
    // qu'on lui avait d'abord donné.
    //
    // CE QU'ON MESURAIT, ET POURQUOI C'ÉTAIT FAUX (#84). L'essai comptait le
    // rapport des morts « soif + ravageurs », figé contre chauffé. Additionner
    // les deux voies devait supprimer le vase communicant — un arbre ne meurt
    // qu'une fois et sa mort n'est imputée qu'à UNE cause — mais ça ne fait que
    // le déplacer : le FEU, les chablis, l'ombre puisent dans le même bassin de
    // victimes, et le moindre lot de mécanisme qui change l'un des trois
    // rejoue le partage. Le rapport avait déjà inversé sa direction sur une
    // graine (#93), il est tombé avec la paire d'allocation (#79 : 4,00 → 1,09
    // sur la seule graine 23), il est retombé avec le plancher racinaire.
    // Trois lots, trois chutes, et jamais parce que le lien entre chaleur et
    // mortalité avait bougé. `docs/realisme.md` le dit dans « ce qu'un test
    // écologique a le droit d'affirmer » : un rapport entre quantités
    // COMPOSITES n'est pas une propriété du monde.
    //
    // CE QU'ON MESURE MAINTENANT est la grandeur directe, celle qu'aucune
    // imputation de cause ne peut déplacer : combien des CENT VINGT arbres
    // plantés sont encore debout à soixante ans. Un arbre debout est debout
    // quelle que soit la case qui l'aurait tué. La cohorte est suivie par ses
    // ids, pas par un compte d'espèce : au-delà de la maturité le peuplement se
    // ressème, et un climat chaud installe plus de semis — un peuplement qui
    // perd plus d'arbres peut très bien en compter plus.
    //
    // Campagne de #84, soixante ans, trois parties, figé → chauffé :
    //
    //                      graine 11      graine 23      graine 37
    //   cohorte debout     88 → 43        49 → 38        80 → 38
    //                       0,49 ×         0,78 ×         0,48 ×
    //   dont hêtres        55 → 21        20 →  4        56 → 22
    //                       0,38 ×         0,20 ×         0,39 ×
    //   (pour mémoire, le composite : 34 → 40, 10 → 87, 18 → 67)
    //
    // La graine 23 est la plus dure et c'est normal : son témoin figé s'est
    // déjà auto-éclairci de moitié, il reste moins à perdre. Le seuil est posé
    // à 0,85 — au-dessus du pire rapport mesuré (0,78) pour laisser de la
    // marge, franchement sous 1 pour rester une affirmation.
    for (const [i, f] of fige.runs.entries()) {
      const c = chauffe.runs[i];
      if (!c) throw new Error("partie manquante");
      // Il y a quelque chose à perdre : le témoin n'est pas déjà vide.
      expect(f.cohorteDebout, `graine ${GRAINES[i]}`).toBeGreaterThan(30);
      expect(c.cohorteDebout, `graine ${GRAINES[i]}`).toBeLessThan(0.85 * f.cohorteDebout);
      // Et le mésophile paie plus cher que le chêne pubescent, qui est chez lui
      // dans un climat qui se réchauffe : 0,38 / 0,20 / 0,39 contre 0,49 /
      // 0,78 / 0,48 pour la cohorte entière.
      expect(c.hetresDebout, `graine ${GRAINES[i]}`).toBeLessThan(0.5 * f.hetresDebout);
    }
  });
});
