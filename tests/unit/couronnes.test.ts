/**
 * La plasticité latérale des couronnes (couronnes.ts, #474) : quatre quarts
 * d'ellipse, la règle de HETEROFOR (Jonard et al. 2020, §2.2.5), le rayon de la
 * loi pour un quart sans concurrent à 12 m, un pas d'au plus 0,2 m par an, et un
 * concurrent qui dépasse le niveau le plus large de la couronne.
 *
 * Ce que ces essais vérifient, c'est la règle décidée les 13 et 16 novembre,
 * nombre par nombre, sur des arbres posés à la main : aucune simulation.
 */

import { describe, expect, it } from "vitest";
import {
  couronnesALEquilibre,
  couronnesDeLAnnee,
  EXTENSION_QUART_M_AN,
  PORTEE_CONCURRENT_M,
  RECOUVREMENT_COURONNES,
  rayonsDEquilibre,
} from "../../src/engine/couronnes";
import { getEspece } from "../../src/engine/especes";
import {
  crownRadiusM,
  EXTENSION_HOUPPIER_MAX,
  indexerOmbres,
  lumiereAuPointIndexee,
  niveauLePlusLargeM,
  quartsDuHouppier,
  SHADOW_NORTH_OFFSET,
} from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { ecrireEtat, lireEtat, VERSION_FORMAT } from "../../src/engine/serialisation";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";
import { diametreInitialCm, type TreeState } from "../../src/engine/trees";

/** Un hêtre de `heightM` mètres, à l'élancement d'une tige sans histoire (H/D 50). */
function hetre(id: number, x: number, y: number, heightM = 10, baseHouppierM = 0): TreeState {
  return {
    id,
    especeId: "fagus_sylvatica",
    x,
    y,
    ageWeeks: 40 * 52,
    heightM,
    diametreCm: diametreInitialCm(heightM),
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    hauteurElagueeM: 0,
    baseHouppierM,
    recepages: 0,
    rootDepthCm: 120,
    pousseTendreM: 0,
    dommageHydraulique: 0,
    vigueur: 1,
    vigueurIndividuelle: 1,
    protege: false,
  };
}

/** Le rayon de la loi d'un hêtre de 10 m à H/D 50 : 0,35 × 10 = 3,5 m. */
const R_LOI = crownRadiusM(10, getEspece("fagus_sylvatica").lumiere.houppierRatio, 20);
const R_POT = EXTENSION_HOUPPIER_MAX * R_LOI;

function annees(trees: TreeState[], n: number): TreeState[] {
  let t = trees;
  for (let k = 0; k < n; k++) t = couronnesDeLAnnee(t);
  return t;
}

describe("le rayon d'équilibre d'un quart (HETEROFOR, éq. 44-45)", () => {
  it("les constantes de la décision", () => {
    expect(R_LOI).toBeCloseTo(3.5, 12);
    expect(EXTENSION_HOUPPIER_MAX).toBe(1.5);
    expect(RECOUVREMENT_COURONNES).toBe(1.2);
    expect(PORTEE_CONCURRENT_M).toBe(12);
    expect(EXTENSION_QUART_M_AN).toBe(0.2);
  });

  it("deux égaux à 6 m se partagent l'espace et se recouvrent d'un cinquième", () => {
    // r_eq = r_pot / (r_pot + r_pot) × 6 × 1,2 = 3,6 m, entre la loi (3,5) et son
    // plafond (5,25). Les trois autres quarts n'ont pas de concurrent.
    const [a, b] = rayonsDEquilibre([hetre(1, 20, 20), hetre(2, 26, 20)]);
    expect(a?.[0]).toBeCloseTo(3.6, 12);
    expect(a?.[1]).toBe(R_LOI);
    expect(a?.[2]).toBe(R_LOI);
    expect(a?.[3]).toBe(R_LOI);
    expect(b?.[2]).toBeCloseTo(3.6, 12);
    expect(b?.[0]).toBe(R_LOI);
  });

  it("le plus fort prend la plus grande part, et le rayon reste entre la loi et 1,5 fois la loi", () => {
    // Un hêtre de 12 m (r_loi 4,2 m) et un de 10 m (3,5 m) à 8 m, chacun plus
    // haut que le milieu du houppier de l'autre : le grand prend 4,2/7,7 × 8 ×
    // 1,2 = 5,24 m, le petit 3,5/7,7 × 9,6 = 4,36 m, tous deux entre leur loi et
    // leur plafond.
    const r12 = crownRadiusM(12, 0.35, diametreInitialCm(12));
    const [a, b] = rayonsDEquilibre([hetre(1, 20, 20, 12), hetre(2, 28, 20, 10)]);
    expect(a?.[0]).toBeCloseTo((r12 / (r12 + R_LOI)) * 8 * 1.2, 12);
    expect(b?.[2]).toBeCloseTo((R_LOI / (r12 + R_LOI)) * 8 * 1.2, 12);
    expect(a?.[0]).toBeGreaterThan(b?.[2] as number);
    // Un hêtre de 20 m (r_loi 7 m) et un de 10 m à 8 m : le petit prendrait
    // 1/3 × 9,6 = 3,2 m, sous sa loi, donc la loi. Le grand ne le voit pas : à
    // 10 m, le petit reste sous le milieu de son houppier (11 m), et le quart
    // sans concurrent garde la loi.
    const [grand, petit] = rayonsDEquilibre([hetre(1, 20, 20, 20), hetre(2, 28, 20, 10)]);
    expect(grand?.[0]).toBeCloseTo(crownRadiusM(20, 0.35, 40), 12);
    expect(petit?.[2]).toBe(R_LOI);
    // Seul à 10 m : 0,5 × 10 × 1,2 = 6 m, au-delà du plafond de 5,25 m.
    const [seul] = rayonsDEquilibre([hetre(1, 20, 20), hetre(2, 30, 20)]);
    expect(seul?.[0]).toBeCloseTo(R_POT, 12);
  });

  it("le concurrent d'un quart est le plus proche voisin de son secteur, et chaque secteur couvre 90°", () => {
    // Au nord-nord-est (dy > dx) : le quart nord. Au sud-est (dy = −dx) : la
    // diagonale va au sud. Le plus proche des deux voisins du nord compte seul.
    const [a] = rayonsDEquilibre([
      hetre(1, 20, 20),
      hetre(2, 23, 28), // nord, à 8,54 m
      hetre(3, 20, 30), // nord aussi, à 10 m : plus loin, ignoré
      hetre(4, 27, 13), // sud-est, sur la diagonale : le quart sud
    ]);
    expect(a?.[1]).toBeCloseTo(Math.min(R_POT, 0.6 * Math.hypot(3, 8)), 12);
    expect(a?.[3]).toBeCloseTo(Math.min(R_POT, 0.6 * Math.hypot(7, 7)), 12);
    expect(a?.[0]).toBe(R_LOI);
    expect(a?.[2]).toBe(R_LOI);
  });

  it("un voisin qui ne dépasse pas le niveau le plus large de la couronne n'est pas un concurrent (16 novembre)", () => {
    // Le houppier va de 6 à 10 m : l'ellipsoïde est le plus large à 8 m. Un
    // voisin de 5 m passe sous la base, un de 7 m dépasse la base mais pas le
    // milieu ; sous la lettre de HETEROFOR il était un concurrent, il ne l'est
    // plus. Un voisin de 8,5 m l'est.
    expect(niveauLePlusLargeM(hetre(1, 20, 20, 10, 6))).toBeCloseTo(8, 12);
    const [sousLaBase] = rayonsDEquilibre([hetre(1, 20, 20, 10, 6), hetre(2, 28, 20, 5)]);
    expect(sousLaBase?.[0]).toBe(R_LOI);
    const [sousLeMilieu] = rayonsDEquilibre([hetre(1, 20, 20, 10, 6), hetre(2, 28, 20, 7)]);
    expect(sousLeMilieu?.[0]).toBe(R_LOI);
    const [audessus] = rayonsDEquilibre([hetre(1, 20, 20, 10, 6), hetre(2, 28, 20, 8.5)]);
    expect(audessus?.[0]).toBeGreaterThan(R_LOI);
  });

  it("le niveau le plus large est le milieu du houppier vivant que lit l'ombre", () => {
    // Venu au large (base au sol), le houppier ne descend pas sous un dixième
    // de la hauteur (`PROFONDEUR_HOUPPIER_MAX`, 0,9) : de 1 à 10 m, le plus
    // large à 5,5 m. Une recrue de 5 m passe dessous ; une de 6 m le dispute.
    expect(niveauLePlusLargeM(hetre(1, 20, 20, 10, 0))).toBeCloseTo(5.5, 12);
    const [recrue5] = rayonsDEquilibre([hetre(1, 20, 20, 10, 0), hetre(2, 25, 20, 5)]);
    expect(recrue5?.[0]).toBe(R_LOI);
    const [recrue6] = rayonsDEquilibre([hetre(1, 20, 20, 10, 0), hetre(2, 25, 20, 6)]);
    expect(recrue6?.[0]).toBeGreaterThan(R_LOI);
    // Entre égaux, rien ne change : la cime de l'un dépasse toujours le milieu
    // du houppier de l'autre.
    const [a, b] = rayonsDEquilibre([hetre(1, 20, 20, 10, 6), hetre(2, 26, 20, 10, 6)]);
    expect(a?.[0]).toBeCloseTo(3.6, 12);
    expect(b?.[2]).toBeCloseTo(3.6, 12);
  });

  it("le saut de la portée : un concurrent à 11,9 m étend le quart jusqu'à son plafond, à 12,1 m il le laisse à la loi", () => {
    // Décidé et assumé (#474) : aucune source ne donne de raccord progressif.
    const [pres] = rayonsDEquilibre([hetre(1, 20, 20), hetre(2, 31.9, 20)]);
    expect(pres?.[0]).toBeCloseTo(R_POT, 12);
    const [loin] = rayonsDEquilibre([hetre(1, 20, 20), hetre(2, 32.1, 20)]);
    expect(loin?.[0]).toBe(R_LOI);
  });

  it("deux tiges au même pied ne se repoussent pas", () => {
    const [a, b] = rayonsDEquilibre([hetre(1, 20, 20), hetre(2, 20, 20)]);
    expect(a).toEqual([R_LOI, R_LOI, R_LOI, R_LOI]);
    expect(b).toEqual([R_LOI, R_LOI, R_LOI, R_LOI]);
  });
});

describe("la mémoire des quarts, une fois l'an", () => {
  it("un arbre sans voisin à portée garde le rayon de la loi : il reste le même objet, sans mémoire", () => {
    const seul = [hetre(1, 20, 20), hetre(2, 40, 40)];
    const apres = annees(seul, 10);
    expect(apres[0]).toBe(seul[0]);
    expect(apres[1]).toBe(seul[1]);
    expect(apres[0]?.rayonsHouppierM).toBeUndefined();
    expect(quartsDuHouppier(apres[0] as TreeState)).toEqual([R_LOI, R_LOI, R_LOI, R_LOI]);
  });

  it("un quart s'étend d'au plus 0,2 m par an, jusqu'à son équilibre", () => {
    // Équilibre à 10 m : le plafond, 5,25 m. Au pas de 0,2 m, il faut neuf ans.
    const paire = [hetre(1, 20, 20), hetre(2, 30, 20)];
    const unAn = annees(paire, 1);
    expect(unAn[0]?.rayonsHouppierM?.[0]).toBeCloseTo(R_LOI + 0.2, 12);
    expect(unAn[0]?.rayonsHouppierM?.[1]).toBe(R_LOI);
    expect(annees(paire, 5)[0]?.rayonsHouppierM?.[0]).toBeCloseTo(R_LOI + 1, 12);
    expect(annees(paire, 9)[0]?.rayonsHouppierM?.[0]).toBe(R_POT);
    expect(annees(paire, 20)[0]?.rayonsHouppierM?.[0]).toBe(R_POT);
    // L'entrée n'est pas touchée.
    expect(paire[0]?.rayonsHouppierM).toBeUndefined();
  });

  it("et se retire au même pas quand son concurrent disparaît, jusqu'à la loi", () => {
    const etendus = annees([hetre(1, 20, 20), hetre(2, 30, 20)], 9);
    const veuf = [etendus[0] as TreeState, { ...(etendus[1] as TreeState), alive: false }];
    expect(annees(veuf, 1)[0]?.rayonsHouppierM?.[0]).toBeCloseTo(R_POT - 0.2, 12);
    const revenu = annees(veuf, 9)[0] as TreeState;
    expect(revenu.rayonsHouppierM).toBeUndefined();
    expect(quartsDuHouppier(revenu)).toEqual([R_LOI, R_LOI, R_LOI, R_LOI]);
  });

  it("un arbre qui grossit entre deux mises à jour ne passe jamais sous sa loi, ni au-dessus de son plafond", () => {
    const [a] = annees([hetre(1, 20, 20), hetre(2, 30, 20)], 1);
    const grandi = { ...(a as TreeState), heightM: 12, diametreCm: 24 };
    const rGrandi = crownRadiusM(12, 0.35, 24);
    const q = quartsDuHouppier(grandi);
    expect(q[0]).toBe(rGrandi); // 3,7 m de mémoire, sous la nouvelle loi de 4,2 m
    expect(q[1]).toBe(rGrandi);
    const memoireTropGrande = { ...(a as TreeState), rayonsHouppierM: [9, 3.5, 3.5, 3.5] as const };
    expect(quartsDuHouppier(memoireTropGrande)[0]).toBe(R_POT);
  });

  it("posées à l'équilibre d'un coup, sans le pas annuel", () => {
    const [a] = couronnesALEquilibre([hetre(1, 20, 20), hetre(2, 30, 20)]);
    expect(a?.rayonsHouppierM).toEqual([R_POT, R_LOI, R_LOI, R_LOI]);
  });
});

describe("l'ombre d'une couronne de quarts", () => {
  it("le profil ellipsoïde : à l'aplomb d'un houppier isolé, l'extinction vaut 1,5 × k × lai", () => {
    const seul = [hetre(1, 20, 20)];
    const ombres = indexerOmbres(seul, () => 1);
    const centre = lumiereAuPointIndexee(ombres, 20, 20 + SHADOW_NORTH_OFFSET * 10);
    expect(centre).toBeCloseTo(Math.exp(-1.5 * 0.5 * getEspece("fagus_sylvatica").lumiere.lai), 12);
  });

  it("le feuillage est gardé : une couronne étendue éteint au total ce qu'éteint son disque", () => {
    // ∫ −ln(lumière) sur le plan = k × lai × π r_loi², quelle que soit la forme.
    const disque = hetre(1, 20, 20);
    const etendu = { ...disque, rayonsHouppierM: [R_POT, R_LOI, 4.2, 3.9] as const };
    const integrale = (t: TreeState): number => {
      const ombres = indexerOmbres([t], () => 1);
      const h = 0.05;
      let s = 0;
      for (let x = 13; x < 27; x += h) {
        for (let y = 17; y < 31; y += h)
          s -= Math.log(lumiereAuPointIndexee(ombres, x + h / 2, y + h / 2));
      }
      return s * h * h;
    };
    const attendu = 0.5 * getEspece("fagus_sylvatica").lumiere.lai * Math.PI * R_LOI * R_LOI;
    expect(integrale(disque) / attendu).toBeCloseTo(1, 2);
    expect(integrale(etendu) / attendu).toBeCloseTo(1, 2);
    // Et l'ombre étendue est plus claire au centre, et porte plus loin vers l'est.
    const centre = (t: TreeState) =>
      lumiereAuPointIndexee(
        indexerOmbres([t], () => 1),
        20,
        24,
      );
    expect(centre(etendu)).toBeGreaterThan(centre(disque));
    const bordEst = (t: TreeState) =>
      lumiereAuPointIndexee(
        indexerOmbres([t], () => 1),
        24.5,
        24,
      );
    expect(bordEst(disque)).toBe(1);
    expect(bordEst(etendu)).toBeLessThan(1);
  });
});

describe("la plasticité dans le tick et dans la sauvegarde", () => {
  const COTE = 40;
  const STATION: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [], gibierParHa: 0 };
  const METEO = syntheticYear(LIMON_RICHE.climat);

  function deuxHetres(): ReturnType<typeof createGameState> {
    let s = createGameState(STATION, rngStateFromSeed(7));
    s = plantAt(s, "fagus_sylvatica", 15, 20, 10);
    s = plantAt(s, "fagus_sylvatica", 25, 20, 10);
    return s;
  }

  it("les quarts bougent une fois l'an, à la semaine du recrutement", () => {
    let s = deuxHetres();
    for (let w = 0; w < 14; w++) s = tick(s, METEO[w] as (typeof METEO)[number]).state;
    expect(s.trees.every((t) => t.rayonsHouppierM === undefined)).toBe(true);
    s = tick(s, METEO[14] as (typeof METEO)[number]).state;
    const [ouest, est] = s.trees as [TreeState, TreeState];
    const rOuest = crownRadiusM(ouest.heightM, 0.35, ouest.diametreCm);
    const rEst = crownRadiusM(est.heightM, 0.35, est.diametreCm);
    // Chacun s'étend de 0,2 m vers l'autre, et garde sa loi partout ailleurs.
    expect(ouest.rayonsHouppierM?.[0]).toBeCloseTo(rOuest + 0.2, 9);
    expect(est.rayonsHouppierM?.[2]).toBeCloseTo(rEst + 0.2, 9);
    expect(ouest.rayonsHouppierM?.[2]).toBe(rOuest);
    expect(est.rayonsHouppierM?.[0]).toBe(rEst);
  }, 60_000);

  it("un bloc de version 16 se relit, ses couronnes posées à l'équilibre (#474)", () => {
    expect(VERSION_FORMAT).toBe(17);
    const partie = deuxHetres();
    const b = ecrireEtat(partie);
    new DataView(b.buffer).setUint16(8, 16);
    const relu = lireEtat(b, STATION);
    if (!relu) throw new Error("le bloc de version 16 aurait dû se relire");
    const [ouest, est] = relu.trees;
    const r = crownRadiusM(10, 0.35, 20);
    // À 10 m l'un de l'autre : 0,5 × 10 × 1,2 = 6 m, au-delà du plafond de 5,25 m.
    expect(ouest?.rayonsHouppierM).toEqual([1.5 * r, r, r, r]);
    expect(est?.rayonsHouppierM).toEqual([r, r, 1.5 * r, r]);
    // Le même état en version 17 se relit tel quel : sans mémoire, à la loi.
    const relu17 = lireEtat(ecrireEtat(partie), STATION);
    expect(relu17?.trees.every((t) => t.rayonsHouppierM === undefined)).toBe(true);
    // La mémoire voyage avec l'état.
    const etendue = { ...partie, trees: couronnesALEquilibre(partie.trees) };
    expect(lireEtat(ecrireEtat(etendue), STATION)?.trees[0]?.rayonsHouppierM).toEqual([
      1.5 * r,
      r,
      r,
      r,
    ]);
  }, 60_000);

  it("un bloc de version 17 relu continue comme la partie qui ne s'est pas arrêtée, quarts compris", () => {
    // La mémoire des quarts est de l'état : relue, la partie doit reprendre au
    // même pas, pas repartir de la loi. Comparé dans le même processus, comme
    // `serialisation.test.ts` (#193).
    const avancer = (depart: ReturnType<typeof createGameState>, de: number, a: number) => {
      let s = depart;
      for (let w = de; w < a; w++) s = tick(s, METEO[w % 52] as (typeof METEO)[number]).state;
      return s;
    };
    // Un an et demi : les deux hêtres ont fait un pas vers l'autre.
    const moitie = avancer(deuxHetres(), 0, 78);
    expect(moitie.trees.some((t) => t.rayonsHouppierM !== undefined)).toBe(true);
    const relu = lireEtat(ecrireEtat(moitie), STATION);
    if (!relu) throw new Error("le bloc de version 17 aurait dû se relire");
    expect(stateHash(relu)).toBe(stateHash(moitie));
    expect(relu.trees.map((t) => t.rayonsHouppierM)).toEqual(
      moitie.trees.map((t) => t.rayonsHouppierM),
    );
    // Une année de plus de chaque côté, le deuxième pas compris.
    const droit = avancer(moitie, 78, 130);
    const repris = avancer(relu, 78, 130);
    expect(stateHash(repris)).toBe(stateHash(droit));
    const [ouest] = droit.trees as [TreeState];
    const rOuest = crownRadiusM(ouest.heightM, 0.35, ouest.diametreCm);
    expect(ouest.rayonsHouppierM?.[0]).toBeGreaterThan(rOuest);
  }, 120_000);
});
