/**
 * Profondeur d'enracinement et stratification (critères A10 et E7).
 * Deux espèces peuvent partager le même mètre carré sans puiser dans la même
 * eau : un pivot descend chercher la réserve profonde, un système traçant
 * reste en surface. C'est la base de la complémentarité agroforestière — et
 * ça explique pourquoi un pin tient sur un sable où un bouleau souffre.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear as anneeSynthetique, syntheticYear } from "../../src/engine/meteo";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon, profondeurPenetrableCm } from "../../src/engine/soil";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { fractionsRacinairesParHorizon, profondeurRacinesCm } from "../../src/engine/trees";

describe("profondeur explorée", () => {
  const chene = getEspece("quercus_pubescens"); // pivot puissant
  const bouleau = getEspece("betula_pendula"); // traçant

  it("un semis n'explore que la surface, un adulte descend", () => {
    const semis = profondeurRacinesCm(chene, 0.3, 300);
    const adulte = profondeurRacinesCm(chene, 18, 300);
    expect(semis).toBeLessThan(50);
    expect(adulte).toBeGreaterThan(200);
  });

  it("à taille égale, un pivot descend plus bas qu'un traçant", () => {
    expect(profondeurRacinesCm(chene, 15, 300)).toBeGreaterThan(
      profondeurRacinesCm(bouleau, 15, 300),
    );
  });

  it("un sol peu profond bride tout le monde (roche, alios)", () => {
    const surAlios = profondeurRacinesCm(chene, 18, 25);
    expect(surAlios).toBeLessThanOrEqual(25);
  });

  it("la densité racinaire décroît avec la profondeur", () => {
    const fractions = fractionsRacinairesParHorizon([30, 70], 200);
    expect(fractions[0]).toBeGreaterThan(0.3); // beaucoup en surface malgré 30/100 cm
    expect(fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("un enracinement superficiel ignore l'horizon profond", () => {
    const fractions = fractionsRacinairesParHorizon([30, 70], 28);
    expect(fractions[1]).toBe(0);
    expect(fractions[0]).toBeCloseTo(1, 6);
  });
});

/** Épaisseur du manteau de sable : au-delà de ce que le bouleau sait franchir. */
const SABLE_CM = 120;

describe("complémentarité verticale sur sol contrasté", () => {
  /**
   * Sol à deux étages très différents : un MANTEAU DE SABLE qui sèche vite, sur
   * un horizon limoneux profond qui garde l'eau. Le pivot atteint la réserve
   * profonde, le traçant reste prisonnier de la surface.
   *
   * LE SABLE FAISAIT 25 cm, ET CE BANC NE DÉMONTRAIT RIEN. Un manteau de vingt-
   * cinq centimètres n'emprisonne personne : le bouleau est LE pionnier des
   * sables — il colonise les terrains pauvres et sableux — et l'essentiel de ses
   * racines occupe les soixante premiers centimètres, sans pivot. Il traversait
   * donc le sable sans y penser, et s'il mourait quand même, c'est que son
   * plancher racinaire tombait par hasard À L'INTÉRIEUR de la couche (19 cm pour
   * 25 cm de sable). La conclusion tenait à dix centimètres, pas à une espèce.
   *
   * Le sable fait maintenant 120 cm — un manteau de couverture sur limon, ce qui
   * est un profil réel du nord de l'Europe — et le contraste tient au TRAIT
   * D'ESPÈCE que l'atlas déclare : le bouleau plafonne à 100 cm de profondeur
   * racinaire, le chêne pubescent descend à 250. L'un reste dans le sable parce
   * qu'il ne sait pas faire mieux, l'autre atteint le limon. C'est ce que
   * l'essai voulait dire depuis le début.
   */
  const SOL_CONTRASTE: Station = {
    ...LIMON_RICHE.station,
    // Terrain plat et fermé : ces essais isolent un mécanisme vertical, pas
    // l'hydrologie d'un versant (relief.ts).
    relief: RELIEF_PLAT,
    id: "sol-contraste",
    nom: "Sable sur limon profond",
    profil: [
      horizon(SABLE_CM, { sable: 90, limon: 8, argile: 2 }, { moPct: 1.5, ph: 6.5 }),
      horizon(120, { sable: 20, limon: 65, argile: 15 }, { moPct: 0.9, ph: 6.8 }),
    ],
    ruMm: 0, // recalculés ci-dessous
    coteM: 30,
    voisinage: [],
    ventExposition: 0.3,
  };
  // Les paramètres dérivés doivent rester cohérents avec le profil.
  const station: Station = {
    ...SOL_CONTRASTE,
    ruMm: SABLE_CM * 0.75 + 120 * 1.5,
  };

  it("le sol est profond et pénétrable", () => {
    expect(profondeurPenetrableCm(station.profil)).toBeGreaterThan(100);
  });

  it("un pivot adulte puise majoritairement en profondeur, un traçant en surface", () => {
    const epaisseurs = station.profil.map((h) => h.epaisseurCm);
    const pivot = fractionsRacinairesParHorizon(
      epaisseurs,
      profondeurRacinesCm(getEspece("quercus_pubescens"), 16, 145),
    );
    const tracant = fractionsRacinairesParHorizon(
      epaisseurs,
      profondeurRacinesCm(getEspece("betula_pendula"), 16, 145),
    );
    expect(pivot[1] ?? 0).toBeGreaterThan(tracant[1] ?? 0);
  });

  /**
   * CET ESSAI EXIGEAIT LA MORT DU TRAÇANT, ET C'ÉTAIT FAUX DEUX FOIS (#84).
   *
   * Faux écologiquement : le bouleau est LE pionnier des sables, et sous
   * 750 mm/an sur un profil sable-sur-limon aucun des deux arbres n'a de raison
   * de mourir. Mesuré après correction du plancher racinaire, ni l'un ni l'autre
   * n'accumule le moindre stress — 0,002 et 0,003 à douze ans, pas même
   * 0,006 à 320 mm/an, tant la réserve du profil est grande. Le bouleau y
   * DÉPASSE d'ailleurs le chêne (11,6 m contre 7,2), ce qui est juste : un
   * pionnier rapide contre un chêne lent.
   *
   * Faux mécaniquement : il passait parce que le plancher racinaire du bouleau
   * tombait par hasard À L'INTÉRIEUR des vingt-cinq centimètres de sable d'alors
   * (19 cm), donc l'arbre mourait de faim d'eau dans une couche qu'il aurait
   * traversée sans y penser. Une conclusion écologique portée par une
   * coïncidence de dix centimètres.
   *
   * CE QUI EST VRAI, ET MESURABLE, est plus intéressant : le pivot CONVERTIT LA
   * SÉCHERESSE EN PROFONDEUR, le traçant ne le peut pas. C'est la
   * complémentarité verticale que ce `describe` annonce, et elle se lit sur la
   * réponse des deux espèces au même assèchement.
   */
  it("le pivot convertit la sécheresse en profondeur, le traçant plafonne", () => {
    /** Les deux arbres, douze ans, sous une pluviométrie donnée. */
    function sousLaPluie(pluieMm: number) {
      const weather = syntheticYear({ ...LIMON_RICHE.climat, rainAnnualMm: pluieMm });
      let state = createGameState(station, rngStateFromSeed(4));
      state = plantAt(state, "quercus_pubescens", 12, 15, 4); // pivot
      state = plantAt(state, "betula_pendula", 18, 15, 4); // traçant
      for (let i = 0; i < 12 * 52; i++) {
        const w = weather[i % weather.length];
        if (!w) throw new Error("météo manquante");
        state = advanceWeek(state, w, []).state;
      }
      const pivot = state.trees.find((t) => t.id === 1);
      const tracant = state.trees.find((t) => t.id === 2);
      if (!pivot?.alive || !tracant?.alive) throw new Error("un arbre du banc est mort");
      return { pivot, tracant };
    }

    const arrose = sousLaPluie(750);
    const sec = sousLaPluie(320);

    // Le pivot va chercher le limon sous le manteau de sable ; le traçant reste
    // dedans. Mesuré à douze ans, année arrosée : 122 cm contre 81.
    expect(arrose.pivot.rootDepthCm).toBeGreaterThan(SABLE_CM);
    expect(arrose.tracant.rootDepthCm).toBeLessThan(SABLE_CM);

    // Et l'écart se CREUSE quand on assèche, ce qui est le mécanisme lui-même :
    // 147 cm contre 81. Le pivot gagne vingt-cinq centimètres, le traçant PAS
    // UN SEUL.
    expect(sec.pivot.rootDepthCm).toBeGreaterThan(arrose.pivot.rootDepthCm);
    expect(sec.pivot.rootDepthCm - arrose.pivot.rootDepthCm).toBeGreaterThan(
      sec.tracant.rootDepthCm - arrose.tracant.rootDepthCm,
    );

    // Et c'est bien qu'il NE PEUT PAS, non qu'il n'a pas soif : à 320 mm il est
    // collé au potentiel que sa taille et son espèce lui accordent (81 cm pour
    // 81,1 de potentiel), quand le pivot en a encore trente devant lui. Sans
    // cette ligne, l'essai ne saurait pas distinguer « il plafonne » de « rien
    // ne lui a été demandé » — et c'est exactement la confusion qui avait fait
    // écrire la mort du bouleau.
    const penetrable = profondeurPenetrableCm(station.profil);
    const potentielTracant = profondeurRacinesCm(
      getEspece("betula_pendula"),
      sec.tracant.heightM,
      penetrable,
    );
    expect(sec.tracant.rootDepthCm).toBeGreaterThan(0.98 * potentielTracant);
    expect(sec.pivot.rootDepthCm).toBeLessThan(
      0.9 * profondeurRacinesCm(getEspece("quercus_pubescens"), sec.pivot.heightM, penetrable),
    );
  });
});

describe("plasticité racinaire : on ne creuse que si on a soif", () => {
  /** Sol profond identique ; seul le régime hydrique change. */
  const PROFIL = [
    horizon(25, { sable: 60, limon: 30, argile: 10 }, { moPct: 2, ph: 6.5 }),
    horizon(120, { sable: 30, limon: 55, argile: 15 }, { moPct: 0.9, ph: 6.8 }),
  ];

  function eleverUnChene(nappeMm: number, pluieAnnuelleMm: number, ans: number) {
    const station: Station = {
      ...LIMON_RICHE.station,
      // Terrain plat et fermé : ces essais isolent un mécanisme vertical, pas
      // l'hydrologie d'un versant (relief.ts).
      relief: RELIEF_PLAT,
      id: "plasticite",
      profil: PROFIL,
      coteM: 30,
      voisinage: [],
      remonteeNappeMmSemaine: nappeMm,
      ventExposition: 0.3,
      ruMm: 200,
    };
    const weather = anneeSynthetique({ ...LIMON_RICHE.climat, rainAnnualMm: pluieAnnuelleMm });
    let state = createGameState(station, rngStateFromSeed(4));
    state = plantAt(state, "quercus_pubescens", 15, 15, 2);
    for (let i = 0; i < ans * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const arbre = state.trees[0];
    if (!arbre?.alive) throw new Error("l'arbre du test est mort");
    return arbre;
  }

  const gate = eleverUnChene(10, 1000, 20); // nappe généreuse, climat arrosé
  const endurci = eleverUnChene(0, 550, 20); // pas de nappe, climat sec

  it("un arbre qui n'a jamais manqué d'eau garde un système superficiel", () => {
    expect(gate.rootDepthCm).toBeLessThan(endurci.rootDepthCm);
  });

  it("l'arbre assoiffé descend chercher la réserve profonde", () => {
    expect(endurci.rootDepthCm).toBeGreaterThan(70);
  });

  it("les deux atteignent des tailles comparables : c'est bien l'allocation qui diffère", () => {
    expect(gate.heightM).toBeGreaterThan(0.7 * endurci.heightM);
  });

  it("un semis démarre en surface, quelles que soient ses capacités d'espèce", () => {
    const jeune = eleverUnChene(10, 1000, 1);
    expect(jeune.rootDepthCm).toBeLessThan(60);
  });
});
