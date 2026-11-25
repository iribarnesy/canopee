/**
 * **Le renversement de ForestGALES** (#483, décision du 25 novembre 2026).
 *
 * La motte cède quand le moment du vent, `T_C · u²`, dépasse `C_reg · SW`, le
 * poids de tige vert multiplié par le coefficient des arbres tirés : c'est la
 * méthode TMC du paquet `fgr`. Ce fichier épingle les nombres sourcés de la
 * cible, et la façon dont le moteur les assemble :
 *
 *  - le C_reg du pin sylvestre de `fgr` (Nicoll et al. 2006), la densité verte
 *    de 850 kg/m³ et le coefficient `T_C = 111,604 · dbh² · h` ;
 *  - l'ancre sur l'arbre en feuille, et la prise au vent de l'arbre nu ;
 *  - la perte d'un sol saturé (Défossez et al. 2021) ;
 *  - la chaîne de l'OMM, de la rafale de la station à la cime ;
 *  - le diagnostic hors domaine, que le labo lit et que la simulation ignore.
 *
 * Rien ici ne tourne de partie : ce sont des fonctions pures, et l'essai dure
 * quelques millisecondes.
 */

import { describe, expect, it } from "vitest";
import { getPaysage, rugositeDuVent } from "../../src/engine/paysage";
import type { GameState } from "../../src/engine/state";
import { LIMON_RICHE, STATIONS_V0, VALLEE_ENGORGEE } from "../../src/engine/stations";
import {
  DENSITE_VERTE_KG_M3,
  domaineDuRenversement,
  type ExpositionAuVent,
  facteurDeRafale,
  facteurSolGorge,
  PERTE_PRISE_AU_VENT,
  poidsDeTigeVertKg,
  rafaleRecue,
  VITESSE_CRITIQUE_VOLIS_FEUILLE_MS,
  vitesseCritiqueMs,
  vitesseCritiqueTmcMs,
  vitesseCritiqueVolisMs,
} from "../../src/engine/tempete";
import type { TreeState } from "../../src/engine/trees";
import { horsDomaineDuVent } from "../../src/lab/sonde";

const arbre = (heightM: number, diametreCm: number, rootDepthCm = 120): TreeState =>
  ({
    id: 1,
    especeId: "pinus_sylvestris",
    heightM,
    diametreCm,
    rootDepthCm,
    alive: true,
  }) as TreeState;

/** Un arbre sur sol ressuyé, sans voisin, ni naïf ni carié : rien que la forme. */
const exposition = (partFoliaire: number, profondeurEffectiveCm = 120): ExpositionAuVent => ({
  rafaleMs: 40,
  ventExposition: 1,
  abriVent: 0,
  engorgement: 0,
  toleranceEngorgement: 0.2,
  partFoliaire,
  profondeurEffectiveCm,
});

/** `u = √(C_reg · ρ · f · π/4 / 111,604)` : la forme de `fgr`, le `d² · h` simplifié. */
const uFgr = (cReg: number) => Math.sqrt((cReg * 850 * 0.5 * (Math.PI / 4)) / 111.604);

describe("la motte : la vitesse de ForestGALES, lue sur l'arbre", () => {
  it("le C_reg du pin tiré, par classe d'enracinement, et la densité de fgr", () => {
    expect(DENSITE_VERTE_KG_M3).toBe(850);
    // Sol A, 137 pins tirés (Nicoll et al. 2006) : 140,1 N·m/kg sous 80 cm
    // d'enracinement, 162,9 au-delà.
    expect(vitesseCritiqueTmcMs(arbre(20, 40), "A", 79)).toBeCloseTo(uFgr(140.1), 12);
    expect(vitesseCritiqueTmcMs(arbre(20, 40), "A", 80)).toBeCloseTo(uFgr(162.9), 12);
    expect(uFgr(140.1)).toBeCloseTo(20.47, 2);
    expect(uFgr(162.9)).toBeCloseTo(22.07, 2);
    // Sol B : la matrice de l'épicéa de Sitka que `fgr` reprend pour le pin.
    expect(vitesseCritiqueTmcMs(arbre(20, 40), "B", 50)).toBeCloseTo(uFgr(124.2), 12);
    expect(vitesseCritiqueTmcMs(arbre(20, 40), "B", 120)).toBeCloseTo(uFgr(144.4), 12);
  });

  it("le poids de tige et le coefficient de moment vont comme d² · h : la taille s'en va", () => {
    const reference = vitesseCritiqueTmcMs(arbre(20, 40), "A", 120);
    for (const [h, d] of [
      [8, 10],
      [30, 30],
      [25, 60],
    ] as const) {
      expect(vitesseCritiqueTmcMs(arbre(h, d), "A", 120)).toBeCloseTo(reference, 12);
    }
  });

  it("l'arbre en feuille garde la vitesse de ForestGALES, l'arbre nu en tient plus", () => {
    // Les traînées de ForestGALES sont prises sur des arbres feuillés : c'est
    // l'arbre nu qui s'en déduit (décision du 19 novembre).
    const a = arbre(20, 40);
    const tmc = vitesseCritiqueTmcMs(a, "A", 120);
    expect(vitesseCritiqueMs(a, exposition(1))).toBeCloseTo(tmc, 12);
    expect(vitesseCritiqueMs(a, exposition(0))).toBeCloseTo(tmc / (1 - PERTE_PRISE_AU_VENT), 12);
    // Koizumi et al. 2010 : 0,12 à 0,26 sur la vitesse, à 10 m/s.
    expect(PERTE_PRISE_AU_VENT).toBeGreaterThanOrEqual(0.12);
    expect(PERTE_PRISE_AU_VENT).toBeLessThanOrEqual(0.26);
    // Le volis suit la même ancre : l'arbre de référence (densité 0,5, H/D 50).
    expect(vitesseCritiqueVolisMs(a, 0.5, exposition(1))).toBeCloseTo(
      VITESSE_CRITIQUE_VOLIS_FEUILLE_MS,
      12,
    );
  });

  it("un sol saturé retire ce que Défossez et al. mesurent : 40 % du moment", () => {
    // Moment × 0,6 à saturation complète, donc vitesse × √0,6.
    expect(facteurSolGorge(1, 0)).toBeCloseTo(Math.sqrt(0.6), 3);
  });
});

describe("la classe de sol est un trait de station", () => {
  it("chaque station la déclare : A partout, B au fond de vallée", () => {
    for (const sc of STATIONS_V0) {
      const attendue = sc.station.id === VALLEE_ENGORGEE.station.id ? "B" : "A";
      expect(sc.station.classeSolForestGales, sc.station.id).toBe(attendue);
    }
  });
});

describe("la rafale : de la station à la cime, par la chaîne de l'OMM", () => {
  it("à 10 m sur le terrain de la station, la cime reçoit la moyenne horaire de la rafale", () => {
    // Monter à 60 m puis redescendre sur la même rugosité rend la hauteur de
    // départ : il ne reste que le facteur de rafale (Harper et al. 2010).
    expect(facteurDeRafale(0.03)).toBeCloseTo(1.52, 2);
    expect(rafaleRecue(arbre(10, 20), exposition(0))).toBeCloseTo(40 / facteurDeRafale(0.03), 9);
  });

  it("le paysage qui fait l'exposition décide de la rugosité ; une exposition posée à la main n'en a pas", () => {
    const st = LIMON_RICHE.station;
    expect(rugositeDuVent(st.bordures, st.ventExposition)).toBe(getPaysage(st.paysageId).rugositeM);
    expect(rugositeDuVent(st.bordures, 1)).toBeUndefined();
    // Un paysage plus rugueux freine la cime.
    const lisse = rafaleRecue(arbre(20, 40), { ...exposition(0), rugositeM: 0.1 });
    const rugueux = rafaleRecue(arbre(20, 40), { ...exposition(0), rugositeM: 0.5 });
    expect(rugueux).toBeLessThan(lisse);
  });
});

describe("le diagnostic hors domaine : il signale, il n'affaiblit pas", () => {
  it("au-delà du plus lourd des pins tirés, puis au-delà du plus lourd de la base", () => {
    // `msw` du pin sylvestre dans `fgr` : 469 kg (superficiel) et 576 kg
    // (profond) en sol A ; aucun pin tiré en sol B ; 2068 kg pour le plus
    // lourd épicéa de Sitka de la base britannique.
    const petit = arbre(12, 20); // 160 kg
    const moyen = arbre(20, 40); // 1068 kg
    const gros = arbre(25, 60); // 3004 kg
    expect(poidsDeTigeVertKg(40, 20)).toBeCloseTo(850 * 0.5 * (Math.PI / 4) * 0.16 * 20, 9);
    expect(domaineDuRenversement(petit, "A")).toBe("dans");
    expect(domaineDuRenversement(moyen, "A")).toBe("au-dela-des-pins");
    expect(domaineDuRenversement(gros, "A")).toBe("au-dela-de-la-base");
    expect(domaineDuRenversement(petit, "B")).toBe("au-dela-des-pins");
    // Le seuil suit la classe d'enracinement : 500 kg passe 469, pas 576.
    const d = Math.sqrt(500 / (850 * 0.5 * (Math.PI / 4) * 15)) * 100;
    expect(domaineDuRenversement(arbre(15, d, 60), "A")).toBe("au-dela-des-pins");
    expect(domaineDuRenversement(arbre(15, d, 120), "A")).toBe("dans");
  });

  it("le labo compte les arbres que la tempête regarde, sur la classe de la station", () => {
    const etat = (station: typeof LIMON_RICHE.station) =>
      ({
        station,
        trees: [
          arbre(4, 8),
          arbre(12, 20),
          arbre(20, 40),
          arbre(25, 60),
          { ...arbre(25, 60), alive: false },
        ],
      }) as unknown as GameState;
    expect(horsDomaineDuVent(etat(LIMON_RICHE.station))).toEqual({
      candidats: 3,
      auDelaDesPins: 2,
      auDelaDeLaBase: 1,
    });
    expect(horsDomaineDuVent(etat(VALLEE_ENGORGEE.station))).toEqual({
      candidats: 3,
      auDelaDesPins: 3,
      auDelaDeLaBase: 1,
    });
  });
});
