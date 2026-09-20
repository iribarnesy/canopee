import { describe, expect, it } from "vitest";
import { ESPECES_V0, getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  facteurGammePh,
  facteurSurviePh,
  horizon,
  MARGE_SURVIE_PH,
  VIGUEUR_A_LA_BORNE,
} from "../../src/engine/soil";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE, stationDepuisProfil } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { phFactor, phFactorSurvie } from "../../src/engine/trees";

/**
 * Le pH a deux seuils, comme l'eau en a deux (#161).
 *
 * L'eau distingue depuis toujours un CONFORT, qui ralentit la croissance, et un
 * STRESS, qui tue — « le hêtre pousse mal dès que l'eau manque mais son semis
 * survit ». Le pH n'avait qu'un facteur pour les deux, si bien qu'une espèce au
 * bord de son amplitude ne pouvait pas pousser mal ET tenir : elle mourait.
 *
 * Une amplitude d'atlas est une amplitude de PRÉSENCE. Y être, c'est y être
 * rare et chétif, pas y être mort.
 */

/**
 * LE LIMON RICHE, MAIS ACIDE — et rien d'autre de changé.
 *
 * Même texture, même profondeur, même nappe, même azote : seul le pH descend, à
 * 4,2. C'est le seul banc qui ISOLE le facteur. Un premier jet mesurait sur la
 * lande sableuse, dont le pH (4,50) est pile la borne du hêtre — mais on y meurt
 * de SOIF avant d'y mourir du pH, et le banc ne prouvait donc rien du lot.
 */
const PH_ACIDE = 4.2;
const ACIDE = stationDepuisProfil({
  id: "limon-riche-acide",
  relief: { altitudeM: 110, pentePct: 4, expositionDeg: 180, forme: "plan", bassinAmontHa: 0.5 },
  paysageId: "bocage",
  nom: "Limon riche acidifié",
  latitudeDeg: 49.5,
  profil: [
    horizon(35, { sable: 15, limon: 70, argile: 15 }, { moPct: 2.2, ph: PH_ACIDE }),
    horizon(65, { sable: 15, limon: 70, argile: 15 }, { moPct: 0.8, ph: PH_ACIDE + 0.2 }),
  ],
  initialMineralNKgHa: 60,
  profondeurNappeEquilibreCm: 630,
  remonteeNappeMmSemaine: 0,
  drainageExterneMmSemaine: Number.POSITIVE_INFINITY,
  herbeInitiale: 0.2,
  // 40 m : le banc isole un facteur du sol, pas une dynamique de peuplement.
  coteM: 40,
});

const GRAINES = [11, 23, 37];
const meteo = syntheticYear(LIMON_RICHE.climat);

function peuplement(plantations: [string, number][], annees: number, seed: number): GameState {
  let s = createGameState({ ...ACIDE, gibierParHa: 0, voisinage: [] }, rngStateFromSeed(seed));
  for (const [id, n] of plantations) s = plantScattered(s, id, n, 0.3);
  for (let i = 0; i < annees * 52; i++) {
    const w = meteo[s.week % meteo.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
  }
  return s;
}

describe("le pH distingue enfin pousser mal et mourir", () => {
  it("DANS son amplitude, aucune espèce ne voit son facteur bouger d'un iota", () => {
    // LA GARANTIE QUI PROTÈGE LES TABLES DE PRODUCTION, et elle est structurelle
    // plutôt que mesurée : la queue de croissance ne vit qu'au-dehors, donc à
    // l'intérieur `phFactor` rend exactement l'ancienne valeur. Aucune espèce
    // n'étant calée hors de sa gamme — le pin sylvestre est à pH 7 dans 4–7,5,
    // le châtaignier sur le limon acide où il vaut 1 — aucune table ne PEUT
    // bouger. Si cet essai tombe, c'est la calibration entière qui est en jeu.
    const ecarts: string[] = [];
    for (const e of ESPECES_V0) {
      const [min, max] = e.ph;
      for (let ph = min; ph <= max + 1e-9; ph += 0.05) {
        const avant = facteurGammePh(e.ph, ph);
        const apres = phFactor(e, ph);
        if (Math.abs(avant - apres) > 1e-12) {
          ecarts.push(`${e.nom} à pH ${ph.toFixed(2)} : ${avant} → ${apres}`);
        }
      }
    }
    expect(ecarts.slice(0, 5)).toEqual([]);
  });

  it("les deux courbes se rejoignent à la borne, sans marche", () => {
    for (const e of ESPECES_V0) {
      const [min] = e.ph;
      // À la borne : la rampe vaut VIGUEUR_A_LA_BORNE, la survie vaut 1.
      expect(phFactor(e, min)).toBeCloseTo(VIGUEUR_A_LA_BORNE, 6);
      expect(phFactorSurvie(e, min)).toBeCloseTo(1, 6);
      // PAS DE SAUT — et c'est bien un saut qu'on cherche, pas une pente. Une
      // première version comparait `min ± 0,01` en exigeant moins de 0,01
      // d'écart : la rampe a une pente de 1/0,7, elle bouge donc de 0,014 sur
      // cet intervalle rien qu'en étant continue. L'essai mesurait la
      // PLATITUDE et tombait sur une fonction parfaitement saine.
      //
      // Un coude à la borne est légitime : au-dessus c'est la rampe qui
      // commande, en dessous la queue. Ce qui ne le serait pas, c'est une
      // marche — que ce test attraperait, puisqu'elle ne s'efface pas quand ε
      // tend vers zéro.
      const eps = 1e-6;
      expect(Math.abs(phFactor(e, min + eps) - phFactor(e, min - eps))).toBeLessThan(1e-4);
      expect(phFactor(e, min - eps)).toBeLessThanOrEqual(VIGUEUR_A_LA_BORNE + 1e-9);
    }
  });

  it("la survie va plus loin que la croissance, exactement de sa marge", () => {
    const hetre = getEspece("fagus_sylvatica");
    const [min] = hetre.ph;
    // La croissance s'éteint juste sous la borne ; la survie tient une marge
    // de plus. C'est tout l'objet du lot.
    expect(facteurGammePh(hetre.ph, min - 0.1)).toBe(0);
    expect(facteurSurviePh(hetre.ph, min - 0.1)).toBeGreaterThan(0.45);
    expect(facteurSurviePh(hetre.ph, min - MARGE_SURVIE_PH - 0.2)).toBe(0);
  });

  it("un hêtre sous sa borne SURVIT, là où il mourait à 20 sur 20", () => {
    // Avant ce lot, mesuré sur ces trois graines : 0/20 vivants à cinq ans,
    // cause `solHorsGamme`, à un pH que l'atlas donne pour tolérable.
    for (const g of GRAINES) {
      const s = peuplement([["fagus_sylvatica", 20]], 15, g);
      const coh = s.trees.filter((t) => t.id <= 20);
      const vivants = coh.filter((t) => t.alive);
      expect(vivants.length).toBeGreaterThan(15);
      expect(coh.filter((t) => t.causeMort === "solHorsGamme")).toHaveLength(0);
    }
  });

  it("mais il VÉGÈTE : il pousse, très peu, et n'est pas un nain immortel", () => {
    // Le premier jet de ce lot laissait la croissance à zéro sous la borne : le
    // hêtre tenait cinquante ans à ses 0,30 m de plantation, sans grandir d'un
    // millimètre ni mourir. L'issue dit « pousse mal ET tient », pas « ne pousse
    // pas ». D'où la queue de croissance dans la marge.
    const hauteurs = GRAINES.map((g) => {
      const s = peuplement([["fagus_sylvatica", 20]], 40, g);
      const v = s.trees.filter((t) => t.alive && t.id <= 20);
      return v.reduce((a, t) => a + t.heightM, 0) / v.length;
    });
    for (const h of hauteurs) {
      expect(h).toBeGreaterThan(0.45); // il a poussé
      expect(h).toBeLessThan(2); // et très peu : quarante ans pour deux tiers de mètre
    }
  });

  it("et il est exclu par la CONCURRENCE, pas par la mort : C7 tient autrement", () => {
    // Le point délicat du lot. Si le pH ne tue plus, la bio-indication doit
    // venir d'ailleurs — et elle vient de là où elle devrait : l'espèce à qui le
    // sol convient prend la lumière. Le pin (gamme 4–7,5) est chez lui à 4,2, le
    // hêtre (4,5–8) n'y est pas.
    for (const g of GRAINES) {
      const s = peuplement(
        [
          ["pinus_sylvestris", 15],
          ["fagus_sylvatica", 15],
        ],
        50,
        g,
      );
      const coh = s.trees.filter((t) => t.id <= 30 && t.alive);
      const pins = coh.filter((t) => t.especeId === "pinus_sylvestris");
      const hetres = coh.filter((t) => t.especeId === "fagus_sylvatica");
      expect(pins.length).toBeGreaterThan(10);
      const hp = pins.reduce((a, t) => a + t.heightM, 0) / pins.length;
      const hh = hetres.length ? hetres.reduce((a, t) => a + t.heightM, 0) / hetres.length : 0;
      // Un ordre de grandeur d'écart : le peuplement est une pinède, et les
      // hêtres n'y sont que des brins dominés.
      expect(hp).toBeGreaterThan(10 * hh);
    }
  });
});
