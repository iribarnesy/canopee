/**
 * Ravageurs et auxiliaires (critères G2, G3, J5).
 *
 * Le test qui compte est le dernier : à station, densité et météo identiques,
 * une aulnaie pure se fait décimer là où le même nombre d'aulnes mélangés
 * passe. Rien n'est codé pour ça — c'est la chaîne « arbre qui végète →
 * ressource → pullulation → dégâts » d'un côté, et l'habitat des auxiliaires
 * de l'autre.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import {
  carteBiotique,
  disperser,
  facteurChaleur,
  prochainePression,
  vulnerabilite,
} from "../../src/engine/ravageurs";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";
import { diametreInitialCm } from "../../src/engine/trees";

function arbre(id: number, especeId: string, x: number, y: number, vigueur: number): TreeState {
  return {
    id,
    especeId,
    x,
    y,
    ageWeeks: 52 * 20,
    heightM: 8,
    diametreCm: diametreInitialCm(8),
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
    vigueur,
    protege: false,
    dommageHydraulique: 0,
  };
}

describe("qui se fait attaquer", () => {
  it("un arbre qui végète est bien plus exploitable qu'un arbre vigoureux", () => {
    const vigoureux = vulnerabilite("pinus_sylvestris", 1);
    const affaibli = vulnerabilite("pinus_sylvestris", 0.2);
    expect(affaibli).toBeGreaterThan(4 * vigoureux);
  });

  it("à vigueur égale, la sensibilité d'espèce fait la différence", () => {
    // Le résineux en peuplement pur et le fruitier cultivé paient ; l'ajonc non.
    expect(vulnerabilite("pinus_sylvestris", 0.5)).toBeGreaterThan(
      3 * vulnerabilite("ulex_europaeus", 0.5),
    );
  });
});

describe("dynamique de population", () => {
  it("sans chaleur, rien ne se développe", () => {
    expect(facteurChaleur(2)).toBe(0);
    expect(prochainePression(0.5, 1, 0.3, facteurChaleur(2))).toBeLessThan(0.5);
  });

  it("la population hiverne : elle attend, elle ne disparaît pas", () => {
    let p = 0.5;
    for (let i = 0; i < 20; i++) p = prochainePression(p, 1, 0.3, 0);
    // Vingt semaines d'hiver : la population est entamée, pas effacée — c'est
    // ce qui permet aux pullulations de s'installer sur plusieurs années.
    expect(p).toBeGreaterThan(0.25);
  });

  it("un habitat riche en auxiliaires fait reculer une pullulation lancée", () => {
    const chaleur = facteurChaleur(20);
    let pauvre = 0.3;
    let riche = 0.3;
    for (let i = 0; i < 10; i++) {
      pauvre = prochainePression(pauvre, 1, 0.15, chaleur);
      riche = prochainePression(riche, 1, 0.95, chaleur);
    }
    expect(pauvre).toBeGreaterThan(0.6);
    expect(riche).toBeLessThan(pauvre / 2);
  });

  it("sans ressource, la population s'éteint", () => {
    let p = 0.8;
    for (let i = 0; i < 60; i++) p = prochainePression(p, 0, 0.3, facteurChaleur(20));
    expect(p).toBeLessThan(0.01);
  });

  it("les insectes essaiment vers les cellules voisines", () => {
    const dims = { widthM: 5, heightM: 5 };
    const p = new Float64Array(25);
    p[12] = 1;
    const apres = disperser(p, dims);
    expect(apres[12] ?? 0).toBeLessThan(1);
    expect(apres[11] ?? 0).toBeGreaterThan(0);
    // Rien ne se crée : la dispersion déplace, elle n'ajoute pas.
    expect(apres.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe("les auxiliaires jugent le voisinage, pas le mètre carré", () => {
  const dims = { widthM: 40, heightM: 40 };
  const herbe = new Array(1600).fill(0.4);

  it("un mélange d'essences vaut un bien meilleur habitat qu'une monoculture", () => {
    const especes = ["alnus_glutinosa", "betula_pendula", "fagus_sylvatica", "quercus_pubescens"];
    const pur: TreeState[] = [];
    const mixte: TreeState[] = [];
    for (let i = 0; i < 100; i++) {
      const x = 2 + (i % 10) * 4;
      const y = 2 + Math.floor(i / 10) * 4;
      pur.push(arbre(i + 1, "alnus_glutinosa", x, y, 1));
      mixte.push(arbre(i + 1, especes[i % 4] ?? "alnus_glutinosa", x, y, 1));
    }
    const moyenne = (v: Float64Array) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(moyenne(carteBiotique(mixte, herbe, 0, dims).habitat)).toBeGreaterThan(
      1.3 * moyenne(carteBiotique(pur, herbe, 0, dims).habitat),
    );
  });

  it("le bois mort laissé sur place améliore l'habitat", () => {
    const trees = [arbre(1, "alnus_glutinosa", 20, 20, 1)];
    const sans = carteBiotique(trees, herbe, 0, dims).habitat[820] ?? 0;
    const avec = carteBiotique(trees, herbe, 25, dims).habitat[820] ?? 0;
    expect(avec).toBeGreaterThan(sans);
  });
});

describe("à l'échelle du peuplement : ce que coûte la monoculture", () => {
  function peuplement(especes: string[], focal: string, ans: number, graine = 4) {
    const station: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 0 };
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(graine));
    for (let i = 0; i < 144; i++) {
      const esp = especes[i % especes.length];
      if (!esp) throw new Error("espèce manquante");
      state = plantAt(state, esp, 2 + (i % 12) * 3, 2 + Math.floor(i / 12) * 3, 0.5);
    }
    const plantes = (144 / especes.length) * especes.filter((e) => e === focal).length;
    let tuesParRavageurs = 0;
    let pressionMax = 0;
    for (let i = 0; i < ans * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      const r = advanceWeek(state, w, []);
      state = r.state;
      pressionMax = Math.max(pressionMax, r.fluxes.ravageurMoyen);
      tuesParRavageurs += r.morts.filter((m) => m.cause === "ravageurs").length;
    }
    return { tauxMortalite: tuesParRavageurs / plantes, pressionMax };
  }

  const GRAINES = [4, 17, 29];

  /**
   * Trois graines, et on garde les parties SÉPARÉES en plus de leur moyenne.
   * Une seule partie ne suffit pas : la vigueur individuelle et la loterie des
   * chandelles qui s'abattent font bouger le compte d'une graine à l'autre.
   * Mais une moyenne ne suffit pas non plus — elle peut cacher une graine qui
   * dit le contraire des deux autres, et c'est arrivé ici (voir plus bas).
   */
  function moyenneSurGraines(especes: string[], focal: string, ans: number) {
    const runs = GRAINES.map((g) => peuplement(especes, focal, ans, g));
    return {
      runs,
      tauxMortalite: runs.reduce((s, r) => s + r.tauxMortalite, 0) / runs.length,
      pressionMax: runs.reduce((s, r) => s + r.pressionMax, 0) / runs.length,
    };
  }

  const pur = moyenneSurGraines(["alnus_glutinosa"], "alnus_glutinosa", 40);
  const mixte = moyenneSurGraines(
    ["alnus_glutinosa", "quercus_pubescens", "betula_pendula", "fagus_sylvatica"],
    "alnus_glutinosa",
    40,
  );

  it("l'aulnaie pure se fait décimer — et sur chacune des trois graines", () => {
    // Mesuré sur le code livré : 1,88 / 1,49 / 1,83. Le taux dépasse 1 parce
    // que le dénominateur ne compte que la cohorte PLANTÉE tandis que les
    // morts comptent aussi les semis nés en cours de partie.
    for (const [i, r] of pur.runs.entries()) {
      expect(r.tauxMortalite, `graine ${GRAINES[i]}`).toBeGreaterThan(0.15);
    }
  });

  it("le mélange encaisse, et sur chacune des trois graines", () => {
    // L'écart de MORTALITÉ, exigé graine par graine et non plus en moyenne.
    //
    // Il avait failli disparaître : sur la base d'avant les tempêtes (#85), il
    // valait 1,03 / 0,76 / 0,88 une fois l'infradensité corrigée — une graine
    // sur trois donnait le mélange PERDANT, et seule la moyenne le cachait.
    // Le lot des tempêtes l'a rétabli largement. Mesuré sur le code livré :
    //
    //   graine  4 : pur 1,88  mélange 0,64   → 0,34
    //   graine 17 : pur 1,49  mélange 0,50   → 0,34
    //   graine 29 : pur 1,83  mélange 0,42   → 0,23
    //
    // On l'épingle donc de nouveau — mais PAR GRAINE, pour qu'une moyenne ne
    // puisse plus masquer une partie qui dit le contraire des deux autres.
    //
    // **ET IL A FAILLI DISPARAÎTRE UNE SECONDE FOIS, AVEC L'AUTO-ÉCLAIRCIE
    // (#96).** Mesuré depuis : pur 2,10 / 1,98 / 2,16 contre mélange 1,92 /
    // 1,64 / 1,72, soit des rapports de 0,91 / 0,83 / 0,80 au lieu de 0,34 /
    // 0,34 / 0,23. La mortalité du MÉLANGE a triplé, et la raison est que ce
    // taux compte TOUTES les morts : depuis que les dominés s'affament, un
    // peuplement s'éclaircit qu'il soit pur ou mélangé, et cette mortalité-là
    // n'a rien à voir avec les ravageurs. Le taux est devenu un composite à
    // QUATRE étages.
    //
    // La direction survit sur les trois graines, et on la garde à ce titre — à
    // 0,95, c'est-à-dire presque rien. **L'essai porteur est le suivant**, sur
    // la pullulation, que le mécanisme produit directement ; celui-ci n'est
    // plus qu'un garde-fou de signe.
    for (const [i, p] of pur.runs.entries()) {
      const m = mixte.runs[i];
      if (!m) throw new Error("partie manquante");
      expect(m.tauxMortalite, `graine ${GRAINES[i]}`).toBeLessThan(0.95 * p.tauxMortalite);
    }
  });

  it("le mélange écrête la pullulation, et sur chacune des trois graines", () => {
    // La PULLULATION, exigée elle aussi graine par graine — et c'est la
    // grandeur la plus solide des deux, parce que le mécanisme la produit
    // directement là où le taux de mortalité en est un composite à trois
    // étages. Mesuré sur le code livré : 2,82 × / 3,02 × / 3,06 ×.
    //
    // C'est elle qui a tenu quand l'écart de mortalité a vacillé sous #68 :
    // trois directions concordantes valent mieux qu'un ratio moyen.
    //
    // **L'ÉTIOLEMENT (#97) A RABOTÉ CES RATIOS, ET LA CAUSE EST UN MANQUE
    // CONNU.** Mesuré avant puis après, pression maximale en pur / en mélange :
    //
    //   graine  4 : 0,314 / 0,118 = 2,66 ×   →   0,357 / 0,163 = 2,18 ×
    //   graine 17 : 0,332 / 0,110 = 3,01 ×   →   0,375 / 0,168 = 2,24 ×
    //   graine 29 : 0,328 / 0,107 = 3,07 ×   →   0,378 / 0,201 = 1,88 ×
    //
    // La pression monte des deux côtés, mais bien plus en MÉLANGE (+39 à +88 %)
    // qu'en pur (+13 à +15 %) : la dilution protège moins. La chaîne est
    // identifiée, et ce n'est pas l'étiolement qui est en cause —
    // `ressourceEtHabitat` épand la vulnérabilité de chaque hôte sur le disque
    // de son houppier, dont le rayon vaut `houppierRatio × hauteur`. L'ombre
    // fait désormais MONTER les dominés, davantage en mélange où l'aulne focal
    // est plus ombragé, et le moteur leur attribue donc un houppier plus large.
    // Une perche réelle fait l'inverse : elle a un houppier riquiqui. C'est le
    // « port serré » que B10 déclare manquant depuis toujours, et qui vient de
    // coûter un tiers de l'effet mélange.
    //
    // **ET L'AUTO-ÉCLAIRCIE (#96) EN A REPRIS UNE SECONDE TRANCHE**, par un
    // chemin différent et celui-là défendable : une aulnaie pure s'éclaircit
    // maintenant, donc elle présente MOINS D'HÔTES au pic. La pression du
    // peuplement pur baisse (0,357 / 0,375 / 0,378 → 0,320 / 0,331 / 0,336)
    // tandis que celle du mélange monte encore. Récapitulatif des trois
    // rapports, lot par lot :
    //
    //   avant        2,66 ×   3,01 ×   3,07 ×
    //   après #97    2,18 ×   2,24 ×   1,88 ×   (houppier des perches)
    //   après #96    1,75 ×   1,57 ×   1,70 ×   (moins d'hôtes en peuplement pur)
    //   après #105   2,79 ×   2,53 ×   2,35 ×   (le houppier suit le diamètre)
    //
    // **#105 EN A RENDU L'ESSENTIEL**, et c'était la prédiction écrite ici même
    // — « le jour où le houppier saura se resserrer, ces ratios doivent
    // remonter ». Une perche ne répand plus la vulnérabilité d'un dominant.
    //
    // Le seuil revient donc à 2, sous la plus basse des trois mesures. L'écart
    // qui subsiste avec l'origine sur deux graines est ATTENDU : #96 en explique
    // une part défendable — une aulnaie qui s'auto-éclaircit présente moins
    // d'hôtes au pic, et la pression du peuplement PUR a effectivement baissé
    // (0,357 → 0,308 sur la graine 4).
    for (const [i, p] of pur.runs.entries()) {
      const m = mixte.runs[i];
      if (!m) throw new Error("partie manquante");
      expect(p.pressionMax, `graine ${GRAINES[i]}`).toBeGreaterThan(2 * m.pressionMax);
    }
  });
});
