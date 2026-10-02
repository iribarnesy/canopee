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
   * Sol à deux étages très différents : un **manteau de sable** qui sèche vite, sur
   * un horizon limoneux profond qui garde l'eau. Le pivot atteint la réserve
   * profonde, le traçant reste prisonnier de la surface.
   *
   * **Le sable faisait** 25 cm, **et ce banc ne démontrait rien**. Un manteau de vingt-
   * cinq centimètres n'emprisonne personne : le bouleau est **le** pionnier des
   * sables — il colonise les terrains pauvres et sableux — et l'essentiel de ses
   * racines occupe les soixante premiers centimètres, sans pivot. Il traversait
   * donc le sable sans y penser, et s'il mourait quand même, c'est que son
   * plancher racinaire tombait par hasard **à l'intérieur** de la couche (19 cm pour
   * 25 cm de sable). La conclusion tenait à dix centimètres, pas à une espèce.
   *
   * Le sable fait maintenant 120 cm — un manteau de couverture sur limon, ce qui
   * est un profil réel du nord de l'Europe — et le contraste tient au **trait**
   * **d'espèce** que l'atlas déclare : le bouleau plafonne à 100 cm de profondeur
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
   * **Cet essai exigeait la mort du traçant**, **et c'était faux deux fois** (#84).
   *
   * Faux écologiquement : le bouleau est **le** pionnier des sables, et sous
   * 750 mm/an sur un profil sable-sur-limon aucun des deux arbres n'a de raison
   * de mourir. Mesuré après correction du plancher racinaire, ni l'un ni l'autre
   * n'accumule le moindre stress — 0,002 et 0,003 à douze ans, pas même
   * 0,006 à 320 mm/an, tant la réserve du profil est grande. Le bouleau y
   * **dépasse** d'ailleurs le chêne (11,6 m contre 7,2), ce qui est juste : un
   * pionnier rapide contre un chêne lent.
   *
   * Faux mécaniquement : il passait parce que le plancher racinaire du bouleau
   * tombait par hasard **à l'intérieur** des vingt-cinq centimètres de sable d'alors
   * (19 cm), donc l'arbre mourait de faim d'eau dans une couche qu'il aurait
   * traversée sans y penser. Une conclusion écologique portée par une
   * coïncidence de dix centimètres.
   *
   * **Ce qui est vrai**, **et mesurable**, est plus intéressant : le pivot **convertit la**
   * **sécheresse en profondeur**, le traçant ne le peut pas. C'est la
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
    // dedans. Mesuré à douze ans, année arrosée : 142 cm contre 79.
    expect(arrose.pivot.rootDepthCm).toBeGreaterThan(SABLE_CM);
    expect(arrose.tracant.rootDepthCm).toBeLessThan(SABLE_CM);

    // Et l'écart se **creuse** quand on assèche, ce qui est le mécanisme lui-même :
    // 165 cm contre 84. Le pivot gagne vingt-trois centimètres, le traçant six.
    expect(sec.pivot.rootDepthCm).toBeGreaterThan(arrose.pivot.rootDepthCm);
    expect(sec.pivot.rootDepthCm - arrose.pivot.rootDepthCm).toBeGreaterThan(
      sec.tracant.rootDepthCm - arrose.tracant.rootDepthCm,
    );

    // Et c'est bien qu'il **ne peut pas**, non qu'il n'a pas soif : à 320 mm il est
    // collé au potentiel que sa taille et son espèce lui accordent (84,29 cm pour
    // 84,32 de potentiel). Sans cette ligne, l'essai ne saurait pas distinguer
    // « il plafonne » de « rien ne lui a été demandé » — et c'est exactement la
    // confusion qui avait fait écrire la mort du bouleau.
    //
    // Le pivot, lui, avait de la place et ne l'a prise qu'en ayant soif : arrosé,
    // il tient à son plancher (142 cm pour 178 de potentiel, 0,80). Sous 320 mm
    // il va maintenant presque au bout du sien (165 pour 170) : depuis que le
    // plancher ne traite plus un jeune arbre comme un semis (#310), il part
    // plus profond et douze étés secs suffisent à combler l'écart. Ce qui
    // trie les deux espèces sous la sécheresse est le plafond lui-même, que
    // l'espèce et la taille fixent.
    const penetrable = profondeurPenetrableCm(station.profil);
    const potentielTracant = profondeurRacinesCm(
      getEspece("betula_pendula"),
      sec.tracant.heightM,
      penetrable,
    );
    expect(sec.tracant.rootDepthCm).toBeGreaterThan(0.98 * potentielTracant);
    expect(arrose.pivot.rootDepthCm).toBeLessThan(
      0.9 * profondeurRacinesCm(getEspece("quercus_pubescens"), arrose.pivot.heightM, penetrable),
    );
  });
});

describe("plasticité racinaire : on ne creuse que si on a soif", () => {
  /** Sol profond identique ; seul le régime hydrique change. */
  const PROFIL = [
    horizon(25, { sable: 60, limon: 30, argile: 10 }, { moPct: 2, ph: 6.5 }),
    horizon(120, { sable: 30, limon: 55, argile: 15 }, { moPct: 0.9, ph: 6.8 }),
  ];

  function eleverUnChene(nappeMm: number, pluieAnnuelleMm: number, ans: number, hauteurM = 2) {
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
    state = plantAt(state, "quercus_pubescens", 15, 15, hauteurM);
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

  /**
   * Un **semis**, pas un plant de deux mètres : l'essai plantait le chêne des
   * deux autres à 2 m, et ne passait que parce que le plancher racinaire
   * traitait tout jeune arbre comme une plantule (0,35 du potentiel). Plancher
   * constant (#310), ce chêne de 2 m a 74 cm de racines un an après, ce qui
   * n'a rien d'absurde pour un pivot de cette taille. Un semis de 30 cm en a
   * 35 (prédit 35 à 40 avant la mesure), loin des 250 que l'espèce peut
   * atteindre.
   */
  it("un semis démarre en surface, quelles que soient ses capacités d'espèce", () => {
    const semis = eleverUnChene(10, 1000, 1, 0.3);
    expect(semis.rootDepthCm).toBeLessThan(60);
  });
});
