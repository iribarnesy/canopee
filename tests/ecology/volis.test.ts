/**
 * **Le volis** : une tempête ne sait plus seulement déraciner (issue #176, F17).
 *
 * `tempete.ts` ne calculait qu'une vitesse critique et rendait un seul verdict :
 * l'arbre tient, ou il verse en entier, racines en l'air. Les modèles de la
 * famille ForestGALES, que ce fichier cite déjà, en calculent **deux** — le
 * renversement et la rupture du fût — et c'est la plus basse qui décide.
 *
 * Ce fichier vérifie, dans cet ordre : que la seconde vitesse se lit sur des
 * traits déjà déclarés ; que la dichotomie sol ferme / sol gorgé tombe toute
 * seule de ce qui **n'entre pas** dans le calcul du volis ; que le lot ne change
 * rien pour un arbre qui ne casse pas ; et qu'en partie les deux ruines
 * coexistent, une souche qui rejette survivant à sa cassure.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getEspece } from "../../src/engine/especes";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantScattered, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  type ExpositionAuVent,
  facteurDensiteBois,
  HOUPPIER_ARRACHE_MAX,
  hauteurDeVolisM,
  houppierArrache,
  modeDeRuine,
  PART_CASSE_BRANCHES,
  probabiliteRenversement,
  prochainHouppierPerdu,
  vitesseCritiqueMs,
  vitesseCritiqueVolisMs,
} from "../../src/engine/tempete";
import { tick } from "../../src/engine/tick";
import type { TreeState } from "../../src/engine/trees";

const arbre = (heightM: number, diametreCm: number): TreeState => ({
  id: 1,
  especeId: "fagus_sylvatica",
  x: 5,
  y: 5,
  ageWeeks: 52 * 40,
  heightM,
  diametreCm,
  stress: 0,
  alive: true,
  uptakeYearG: 0,
  fruitsKg: 0,
  fruitProgress: 0,
  bloomFrosted: false,
  rootDepthCm: 120,
  hauteurElagueeM: 0,
  pousseTendreM: 0,
  vigueur: 1,
  dommageHydraulique: 0,
  protege: false,
  recepages: 0,
  vigueurIndividuelle: 1,
});

const exposition = (engorgement: number, toleranceEngorgement: number): ExpositionAuVent => ({
  rafaleMs: 40,
  ventExposition: 1,
  abriVent: 0,
  engorgement,
  toleranceEngorgement,
  partFoliaire: 1,
  profondeurEffectiveCm: 120,
});

describe("la rupture du fût se lit sur des traits déjà déclarés", () => {
  it("un bois dense casse plus tard, et le rapport est celui des fiches", () => {
    // Aucun trait nouveau : `bois.densite` est à l'atlas depuis #68. Le module
    // de rupture suit la densité, d'où la racine carrée sur la vitesse.
    const saule = getEspece("salix_alba").bois.densite;
    const chene = getEspece("quercus_pubescens").bois.densite;
    expect(chene).toBeGreaterThan(saule);
    expect(facteurDensiteBois(chene)).toBeGreaterThan(facteurDensiteBois(saule));
    expect(facteurDensiteBois(chene) / facteurDensiteBois(saule)).toBeCloseTo(
      Math.sqrt(chene / saule),
      12,
    );
  });

  it("l'élancement pèse PLUS sur la rupture que sur le renversement", () => {
    // La différence de forme, et elle est physique : une motte résiste par un
    // bras de levier, un fût par son module de section — qui va comme le **cube**
    // du diamètre. Doubler l'élancement doit donc coûter bien plus au volis.
    const ferme = exposition(0, 0.3);
    const trapu = arbre(20, 40);
    const perche = arbre(30, 30);
    const chuteRenv = vitesseCritiqueMs(perche, ferme) / vitesseCritiqueMs(trapu, ferme);
    const chuteVolis =
      vitesseCritiqueVolisMs(perche, 0.55, ferme) / vitesseCritiqueVolisMs(trapu, 0.55, ferme);
    expect(chuteVolis).toBeLessThan(chuteRenv);
    // Et la perche finit par casser plutôt que verser.
    expect(modeDeRuine(trapu, 0.55, ferme)).toBe("chablis");
    expect(modeDeRuine(perche, 0.55, ferme)).toBe("volis");
  });

  it("le fût casse à la base du houppier, jamais au ras du sol", () => {
    // Un volis qui casserait à zéro serait un recépage. Le plancher tient même
    // sur un arbre resté branchu, dont la base de houppier vaut zéro.
    expect(hauteurDeVolisM(20, 12)).toBe(12);
    expect(hauteurDeVolisM(20, 0)).toBeGreaterThan(0);
    expect(hauteurDeVolisM(20, 0)).toBeLessThan(20);
    // Et jamais au-dessus de la cime, sur un houppier qui descend très bas.
    expect(hauteurDeVolisM(20, 25)).toBeLessThan(20);
  });
});

describe("la dichotomie tombe de ce qui N'ENTRE PAS dans le calcul", () => {
  it("un sol gorgé fait DÉRACINER ce qui aurait cassé sur sol ferme", () => {
    // Le cœur du lot. Ni l'ancrage ni l'engorgement n'entrent dans la rupture :
    // un fût casse aussi bien sur un sol gelé que sur un sol saturé. Personne
    // n'écrit « les fonds de vallon déracinent » — ça sort de cette absence.
    const pin = getEspece("pinus_sylvestris");
    const a = arbre(20, 40);
    const ferme = exposition(0, pin.eau.toleranceEngorgement);
    const gorge = exposition(0.95, pin.eau.toleranceEngorgement);
    expect(modeDeRuine(a, pin.bois.densite, ferme)).toBe("volis");
    expect(modeDeRuine(a, pin.bois.densite, gorge)).toBe("chablis");
    // Et la raison se lit dans les chiffres : la rupture ne bouge **pas** d'un
    // millième entre les deux sols, c'est le renversement qui s'effondre.
    expect(vitesseCritiqueVolisMs(a, pin.bois.densite, gorge)).toBeCloseTo(
      vitesseCritiqueVolisMs(a, pin.bois.densite, ferme),
      12,
    );
    expect(vitesseCritiqueMs(a, gorge)).toBeLessThan(0.8 * vitesseCritiqueMs(a, ferme));
  });

  it("à géométrie égale, c'est la densité qui trie les essences", () => {
    const ferme = exposition(0, 0.3);
    const a = arbre(20, 40);
    expect(modeDeRuine(a, getEspece("salix_alba").bois.densite, ferme)).toBe("volis");
    expect(modeDeRuine(a, getEspece("quercus_pubescens").bois.densite, ferme)).toBe("chablis");
  });
});

describe("ce que le lot ne déplace pas", () => {
  it("pour un arbre qui ne casse pas, la probabilité est INCHANGÉE", () => {
    // La garantie du lot, et elle est structurelle : quand la rupture demande
    // plus de vent que le renversement, le minimum des deux **est** le
    // renversement, donc le lot ne peut rien avoir déplacé. Vérifié sur le cas
    // qui compte — un bois dense et trapu, celui qui déracine.
    const ferme = exposition(0, 0.3);
    const a = arbre(20, 40);
    const chene = getEspece("quercus_pubescens").bois.densite;
    expect(modeDeRuine(a, chene, ferme)).toBe("chablis");
    expect(probabiliteRenversement(a, ferme, chene)).toBe(probabiliteRenversement(a, ferme));
  });

  it("et un arbre qui casse est FORCÉMENT plus fragile qu'avant, jamais moins", () => {
    // L'autre moitié de la garantie : ajouter un second mode de ruine ne peut
    // que rendre les arbres plus fragiles, puisqu'on prend un minimum. Un lot
    // qui rendrait un arbre plus résistant serait un bug.
    const ferme = exposition(0, 0.3);
    for (const [h, d] of [
      [10, 30],
      [20, 40],
      [25, 35],
      [30, 30],
    ] as const) {
      for (const espece of ["salix_alba", "fagus_sylvatica", "quercus_pubescens"]) {
        const densite = getEspece(espece).bois.densite;
        const a = arbre(h, d);
        expect(probabiliteRenversement(a, ferme, densite)).toBeGreaterThanOrEqual(
          probabiliteRenversement(a, ferme),
        );
      }
    }
  });
});

describe("en partie : les deux ruines coexistent", () => {
  it("une saulaie casse au lieu de verser, et ses souches repartent", () => {
    // **La prémisse** : si aucun arbre ne cassait jamais, le mécanisme serait du
    // code mort — c'est ce que l'issue demandait de vérifier avant d'écrire.
    // Le saule est le bois le plus tendre de l'atlas (0,28) et il rejette de
    // souche : c'est le cas où les deux moitiés du lot se voient.
    const COTE = 40;
    const station: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
    const serie = serieMeteoPour(LIMON_RICHE.station.id);
    if (!serie) throw new Error("série manquante");
    const meteo = serieToWeeks(serie);
    let s = plantScattered(createGameState(station, rngStateFromSeed(7)), "salix_alba", 300);
    let verses = 0;
    let casses = 0;
    for (let i = 0; i < 60 * 52; i++) {
      const w = meteo[i % meteo.length];
      if (!w) throw new Error("météo manquante");
      const r = tick(s, w);
      s = r.state;
      if (r.tempete) {
        verses += r.tempete.arbresVerses;
        casses += r.tempete.arbresCasses;
      }
    }
    expect(casses).toBeGreaterThan(10);
    // Le saule rejette de souche : un volis ne le tue pas, il le rabat.
    expect(getEspece("salix_alba").bois.rejetteDeSouche).toBe(true);
    expect(s.trees.some((t) => t.alive)).toBe(true);
    // Et le bois tendre casse bien plus qu'il ne verse : relevé 97 % de volis
    // sur trois graines. C'est la **direction** qui est testée, pas la part — elle
    // dépend de l'élancement, cf. le commentaire du référentiel.
    expect(casses).toBeGreaterThan(verses);
  });
});

describe("le troisième mode : des branches en moins, l'arbre debout", () => {
  it("rien en dessous du seuil, et jamais plus que le plafond", () => {
    // La casse partielle commence **bien** avant la ruine : c'est le dégât qu'on
    // voit après chaque coup de vent sans que rien ne soit par terre.
    const critique = 30;
    expect(houppierArrache(0.3 * critique, critique)).toBe(0);
    expect(houppierArrache(PART_CASSE_BRANCHES * critique, critique)).toBe(0);
    expect(houppierArrache(critique, critique)).toBeCloseTo(HOUPPIER_ARRACHE_MAX, 12);
    expect(houppierArrache(3 * critique, critique)).toBe(HOUPPIER_ARRACHE_MAX);
    // Et c'est une rampe : un vent à peine suffisant casse une branche, un
    // vent proche de la ruine écime.
    const milieu = (PART_CASSE_BRANCHES + 1) / 2;
    expect(houppierArrache(milieu * critique, critique)).toBeGreaterThan(0);
    expect(houppierArrache(milieu * critique, critique)).toBeLessThan(HOUPPIER_ARRACHE_MAX);
  });

  it("elle se lit sur le MÊME rapport que la ruine", () => {
    // Ce qui rend le troisième mode cohérent sans rien coûter : tout ce qui
    // fragilise un arbre le rend du même coup plus facile à ébrancher. Ici,
    // l'élancement.
    const ferme = exposition(0, 0.3);
    const trapu = arbre(20, 40);
    const perche = arbre(30, 30);
    const rafale = 22;
    expect(houppierArrache(rafale, vitesseCritiqueMs(perche, ferme))).toBeGreaterThan(
      houppierArrache(rafale, vitesseCritiqueMs(trapu, ferme)),
    );
  });

  it("la plaie se referme, et ne s'aggrave pas toute seule", () => {
    let perdu = HOUPPIER_ARRACHE_MAX;
    for (let semaine = 0; semaine < 52 * 3; semaine++) perdu = prochainHouppierPerdu(perdu, 0);
    expect(perdu).toBe(0);
    // Un coup plus fort écrase le précédent ; un coup plus faible ne le guérit pas.
    expect(prochainHouppierPerdu(0.1, 0.3)).toBeGreaterThan(0.25);
    expect(prochainHouppierPerdu(0.3, 0.05)).toBeGreaterThan(0.25);
  });
});

describe("en partie : la casse partielle est le dégât le plus FRÉQUENT", () => {
  it("elle arrive cent fois plus souvent qu'une ruine, et elle guérit", () => {
    // Ce que le critère appelle « la casse partielle » : elle ne tue personne,
    // et c'est justement pour ça qu'elle manquait — le moteur ne comptait que
    // ce qui meurt. Relevé sur soixante ans d'une pinède de 400 plants :
    // 28 chablis, 33 volis, et plus de 1 500 ébranchages.
    const COTE = 40;
    const station: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
    const serie = serieMeteoPour(LIMON_RICHE.station.id);
    if (!serie) throw new Error("série manquante");
    const meteo = serieToWeeks(serie);
    let s = plantScattered(createGameState(station, rngStateFromSeed(7)), "pinus_sylvestris", 400);
    let ruines = 0;
    let ebranches = 0;
    let plaieMax = 0;
    let arrachePlusFort = 0;
    let rafalePlusForte = 0;
    for (let i = 0; i < 60 * 52; i++) {
      const w = meteo[i % meteo.length];
      if (!w) throw new Error("météo manquante");
      const r = tick(s, w);
      s = r.state;
      if (!r.tempete) continue;
      ruines += r.tempete.arbresVerses + r.tempete.arbresCasses;
      ebranches += r.tempete.arbresEbranches;
      const perdus = s.trees.filter((t) => t.alive && (t.houppierPerdu ?? 0) > 0);
      const pire = Math.max(0, ...perdus.map((t) => t.houppierPerdu ?? 0));
      plaieMax = Math.max(plaieMax, pire);
      // La profondeur du dégât suit la force du coup : c'est une rampe, pas un
      // interrupteur. Relevé : 3 % du houppier à 27 m/s, 20 % à 48 m/s.
      if (r.tempete.arbresEbranches > 0 && r.tempete.rafaleMs > rafalePlusForte) {
        rafalePlusForte = r.tempete.rafaleMs;
        arrachePlusFort = pire;
      }
    }
    expect(ruines).toBeGreaterThan(0);
    expect(ebranches).toBeGreaterThan(10 * ruines);
    expect(plaieMax).toBeGreaterThan(0.1);
    expect(plaieMax).toBeLessThanOrEqual(HOUPPIER_ARRACHE_MAX);
    expect(arrachePlusFort).toBeGreaterThan(0.1);
    // Et elle guérit : après soixante ans, la plupart des arbres sont intacts.
    const vivants = s.trees.filter((t) => t.alive);
    const blesses = vivants.filter((t) => (t.houppierPerdu ?? 0) > 0);
    expect(blesses.length).toBeLessThan(0.5 * vivants.length);
  }, 900_000);
});
