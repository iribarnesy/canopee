/**
 * Le gel des jeunes pousses (#371, gelPousses.ts) : une nuit de printemps grille
 * le feuillage qui vient de sortir, l'arbre le refait sur ses réserves, et sa
 * croissance de l'année en paie le prix.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import {
  ECART_AIR_FEUILLE_C,
  feuillageTendre,
  REFEUILLAISON_ATTENTE_SEMAINES,
  REFEUILLAISON_DUREE_SEMAINES,
  refeuillaison,
  SEUIL_TISSU_LE_PLUS_BAS_C,
  SEUIL_TISSU_LE_PLUS_HAUT_C,
  seuilAirGelPousses,
  seuilTissuGelPousses,
} from "../../src/engine/gelPousses";
import { syntheticYear } from "../../src/engine/meteo";
import {
  contextePhenologique,
  debourrementExigeDJ,
  FROID_REFERENCE,
  partFoliaireActiveDans,
} from "../../src/engine/phenologie";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

describe("le seuil se tire de la précocité, pas d'un trait d'essence", () => {
  it("ce qui débourre tôt résiste mieux à l'émergence", () => {
    // Vitasse et al. 2014 : de −8,3 °C (merisier, précoce) à −3,5 °C (frêne,
    // tardif) ; Lenz et al. 2016 : la date de débourrement converge vers un
    // risque presque nul une fois cette résistance prise en compte.
    const seuil = (id: string) => seuilAirGelPousses(getEspece(id));
    expect(seuil("betula_pendula")).toBeLessThan(seuil("quercus_pubescens"));
    expect(seuil("quercus_pubescens")).toBeLessThan(seuil("fagus_sylvatica"));
    expect(seuil("fagus_sylvatica")).toBeLessThan(seuil("fraxinus_excelsior"));
  });

  it("il passe par ses deux ancrages et reste dans l'étendue mesurée", () => {
    expect(seuilTissuGelPousses(getEspece("fagus_sylvatica"))).toBeCloseTo(-5, 9);
    expect(seuilTissuGelPousses(getEspece("fraxinus_excelsior"))).toBeCloseTo(-3.5, 9);
    for (const id of ["salix_alba", "corylus_avellana", "castanea_sativa", "juglans_regia"]) {
      const t = seuilTissuGelPousses(getEspece(id));
      expect(t).toBeGreaterThanOrEqual(SEUIL_TISSU_LE_PLUS_BAS_C);
      expect(t).toBeLessThanOrEqual(SEUIL_TISSU_LE_PLUS_HAUT_C);
    }
    // L'air sous abri, pas la feuille : le seuil d'air est plus haut d'autant.
    const hetre = getEspece("fagus_sylvatica");
    expect(seuilAirGelPousses(hetre) - seuilTissuGelPousses(hetre)).toBeCloseTo(
      ECART_AIR_FEUILLE_C,
      9,
    );
  });

  it("le noyer hybride suit le commun tant que sa fiche n'a pas tranché son calendrier", () => {
    // Charrier et al. 2018 : chez le noyer, l'exposition décide plus que la
    // vulnérabilité. Sa moindre sensibilité tombera de son débourrement (#213).
    expect(seuilAirGelPousses(getEspece("juglans_x_intermedia"))).toBe(
      seuilAirGelPousses(getEspece("juglans_regia")),
    );
  });
});

describe("seul le feuillage tendre gèle", () => {
  const hetre = getEspece("fagus_sylvatica");
  const exige = debourrementExigeDJ(hetre, FROID_REFERENCE);
  const ctx = (dd: number, semaine = 18) =>
    contextePhenologique(49.5, semaine, dd, FROID_REFERENCE);
  const tendre = (dd: number, semaine?: number) => {
    const c = ctx(dd, semaine);
    return feuillageTendre(hetre, c, partFoliaireActiveDans(hetre, c));
  };

  it("le bourgeon dormant ne craint rien, la feuille qui sort si, la feuille durcie non", () => {
    expect(tendre(exige - 10)).toBe(false);
    expect(tendre(exige + 20)).toBe(true);
    expect(tendre(exige + 150)).toBe(true);
    expect(tendre(exige + 400)).toBe(false);
  });

  it("ni en automne, ni chez un sempervirent", () => {
    expect(tendre(exige + 20, 40)).toBe(false);
    const pin = getEspece("pinus_sylvestris");
    const c = ctx(exige + 20);
    expect(feuillageTendre(pin, c, partFoliaireActiveDans(pin, c))).toBe(false);
  });

  it("le feuillage perdu revient après l'attente, en quelques semaines", () => {
    for (let k = 1; k <= REFEUILLAISON_ATTENTE_SEMAINES; k++) expect(refeuillaison(k)).toBe(0);
    expect(refeuillaison(REFEUILLAISON_ATTENTE_SEMAINES + 1)).toBeGreaterThan(0);
    expect(refeuillaison(REFEUILLAISON_ATTENTE_SEMAINES + REFEUILLAISON_DUREE_SEMAINES)).toBe(1);
  });
});

describe("une nuit de gel après le débourrement", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 30, gibierParHa: 0, voisinage: [] };
  /**
   * Deux hêtres de deux mètres, l'un en plein découvert, l'autre au milieu d'une
   * couronne de charmes de douze mètres ; un printemps où chaque semaine connaît
   * une nuit à −3 °C — sous le seuil du hêtre en air (−2,5 °C), au-dessus de celui
   * des charmes (−4,4 °C).
   */
  function deuxPrintemps(nuitC: number) {
    let state = createGameState(STATION, rngStateFromSeed(5));
    state = plantAt(state, "fagus_sylvatica", 6, 6, 2);
    const nu = state.nextTreeId - 1;
    for (const [dx, dy] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
      [-2, -2],
      [2, 2],
      [-2, 2],
      [2, -2],
    ] as const) {
      state = plantAt(state, "carpinus_betulus", 20 + dx, 20 + dy, 12);
    }
    state = plantAt(state, "fagus_sylvatica", 20, 20, 2);
    const abrite = state.nextTreeId - 1;
    const meteo = syntheticYear(LIMON_RICHE.climat).map((w, i) => ({
      ...w,
      tMinAbsC: i >= 10 && i <= 26 ? nuitC : w.tMinAbsC,
    }));
    let stressMaxNu = 0;
    for (let i = 0; i < 2 * 52; i++) {
      state = tick(state, meteo[i % 52] as never).state;
      stressMaxNu = Math.max(stressMaxNu, state.trees.find((t) => t.id === nu)?.stress ?? 0);
    }
    const arbre = (id: number) => state.trees.find((t) => t.id === id);
    return { nu: arbre(nu), abrite: arbre(abrite), stressMaxNu };
  }

  it("le hêtre du découvert gèle, celui qui pousse sous les charmes non", () => {
    // La régénération sous abri des forestiers, et c'est #407 qui la porte : la
    // nuit se juge sous le couvert qui surplombe l'arbre.
    const { nu, abrite } = deuxPrintemps(-3);
    expect(nu?.gelPousseSemaine).toBeDefined();
    expect(abrite?.gelPousseSemaine).toBeUndefined();
  });

  it("le gel coûte de la croissance et des réserves, il ne tue pas d'un coup", () => {
    const gele = deuxPrintemps(-3);
    const temoin = deuxPrintemps(0);
    expect(temoin.nu?.gelPousseSemaine).toBeUndefined();
    expect(gele.nu?.alive).toBe(true);
    expect(gele.nu?.heightM ?? 0).toBeLessThan(temoin.nu?.heightM ?? 0);
    // Les semaines sans feuilles se paient sur les réserves (reserves.ts).
    expect(gele.stressMaxNu).toBeGreaterThan(temoin.stressMaxNu);
  });
});
