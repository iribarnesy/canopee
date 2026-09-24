import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  DIAMETRE_FUT_CM,
  FAUCHE_HOURS_M2_MAIN,
  fellingHours,
  heuresPourAbattre,
  PLANT_HOURS,
  PLANT_MIN_SPACING_M,
  rayonEncombrement,
} from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { FRICHE_LIMON, LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * La brousse n'est pas un arbre (#154).
 *
 * `state.trees` contient aussi bien un chêne de trente mètres qu'un brin de
 * ronce, et le moteur les traitait pareil : la ronce bloquait un potet comme un
 * fût, et la débroussailler se facturait comme un abattage — 822 h/ha, contre
 * les 60 h/ha que `FAUCHE_HOURS_M2_MAIN` documente pour ce geste exact. Le
 * moteur se contredisait d'un facteur quatorze.
 *
 * Deux grandeurs distinctes le corrigent, et ce n'est pas la même question :
 * l'exclusion d'un potet se cale sur ce que l'essence peut **devenir** (un semis de
 * chêne bloque, une ronce adulte non), le prix du geste sur ce que l'individu
 * **est** aujourd'hui (un brin de 4 cm se couche, un fût de 40 s'abat).
 */

const meteo = syntheticYear(FRICHE_LIMON.climat);

function avance(s: GameState, n: number): GameState {
  let e = s;
  for (let i = 0; i < n; i++) {
    const w = meteo[e.week % meteo.length];
    if (!w) throw new Error("météo manquante");
    e = tick(e, w).state;
  }
  return e;
}

let friche: GameState;
let libres: { x: number; y: number }[];

beforeAll(() => {
  friche = avance(
    createGameState({ ...FRICHE_LIMON.station, gibierParHa: 0 }, rngStateFromSeed(5)),
    10 * 52,
  );
  const cote = friche.station.coteM;
  const vivants = friche.trees.filter((t) => t.alive);
  libres = [];
  for (let y = 2; y < cote - 2; y += 4) {
    for (let x = 2; x < cote - 2; x += 4) {
      const px = x + 0.5;
      const py = y + 0.5;
      const gene = vivants.some(
        (t) => (t.x - px) ** 2 + (t.y - py) ** 2 < rayonEncombrement(t.especeId) ** 2,
      );
      if (!gene) libres.push({ x: px, y: py });
    }
  }
}, 180_000);

describe("la brousse n'est pas un arbre", () => {
  it("l'exclusion d'un potet suit ce que l'essence peut devenir", () => {
    // Une ronce plafonne à 2,5 m : elle ne sera jamais un arbre, on la
    // débroussaille. Un chêne en sera un, même haut de trente centimètres.
    expect(rayonEncombrement("rubus_fruticosus")).toBeLessThan(0.4);
    expect(rayonEncombrement("calluna_vulgaris")).toBeLessThan(0.1);
    // **Témoin** : tout ce qui est un arbre garde **exactement** l'ancienne exclusion.
    // L'atlas est vide entre 8 et 20 m, donc le lot ne déplace que la strate
    // basse — si ce test tombe, c'est une essence qu'on vient de déclasser.
    for (const id of [
      "quercus_pubescens",
      "fagus_sylvatica",
      "juglans_regia",
      "malus_domestica",
      "corylus_avellana",
    ]) {
      expect(rayonEncombrement(id)).toBe(PLANT_MIN_SPACING_M);
    }
  });

  it("une ronce laisse planter à cinquante centimètres, un hêtre non", () => {
    const station = { ...LIMON_RICHE.station, gibierParHa: 0, voisinage: [] };
    for (const [especeVoisine, refusAttendu] of [
      ["rubus_fruticosus", false],
      ["fagus_sylvatica", true],
    ] as const) {
      let s = createGameState(station, rngStateFromSeed(1));
      s = plantScattered(s, especeVoisine, 0, 0.3);
      s = {
        ...s,
        trees: [
          {
            ...s.trees[0],
            id: 1,
            especeId: especeVoisine,
            x: 10,
            y: 10,
            ageWeeks: 520,
            heightM: 2,
            diametreCm: 4,
            stress: 0,
            alive: true,
            uptakeYearG: 0,
            fruitsKg: 0,
            fruitProgress: 0,
            bloomFrosted: false,
            rootDepthCm: 20,
            hauteurElagueeM: 0,
            pousseTendreM: 0,
            vigueur: 1,
            vigueurIndividuelle: 1,
            dommageHydraulique: 0,
            protege: false,
            recepages: 0,
          },
        ],
        nextTreeId: 2,
      };
      const r = applyAction(s, {
        type: "planter",
        week: 0,
        especeId: "quercus_pubescens",
        positions: [{ x: 10.5, y: 10 }],
      });
      expect(r.refusals.length > 0).toBe(refusAttendu);
    }
  });

  it("débroussailler se facture comme un débroussaillage, pas comme un abattage", () => {
    const ronces = friche.trees.filter((t) => t.alive && t.especeId === "rubus_fruticosus");
    expect(ronces.length).toBeGreaterThan(200);
    const ha = (friche.station.coteM * friche.station.coteM) / 10_000;
    const commeDesArbres = ronces.reduce((a, t) => a + fellingHours(t.heightM), 0) / ha;
    const reel = ronces.reduce((a, t) => a + heuresPourAbattre(t), 0) / ha;
    const ancre = FAUCHE_HOURS_M2_MAIN * 10_000; // 60 h/ha, le dégagement à la main

    // L'ancienne facture était absurde, et c'est le moteur lui-même qui le dit.
    expect(commeDesArbres).toBeGreaterThan(10 * ancre);
    // La nouvelle tient dans le même ordre de grandeur que l'ancre. Pas à
    // l'unité près : la friche porte des ronces plus grosses que la moyenne, et
    // caler le seuil **pour** tomber sur 60 reviendrait à enregistrer le moteur.
    expect(reel).toBeLessThan(2 * ancre);
    expect(reel).toBeGreaterThan(ancre / 3);
  });

  it("abattre un vrai fût ne change pas d'un iota", () => {
    // Le lot ne doit déplacer que la brousse. Au-delà du diamètre de fût, le
    // prix est celui d'avant, à la virgule.
    for (const [h, d] of [
      [20, 45],
      [12, DIAMETRE_FUT_CM],
      [30, 80],
    ] as const) {
      expect(heuresPourAbattre({ heightM: h, diametreCm: d, especeId: "quercus_pubescens" })).toBe(
        fellingHours(h),
      );
    }
  });

  it("le potet paie son dégagement, et c'est une minute, pas une heure", () => {
    const cote = friche.station.coteM;
    let pire = 0;
    for (const pos of libres) {
      const r = applyAction(friche, {
        type: "planter",
        week: friche.week,
        especeId: "quercus_pubescens",
        positions: [pos],
      });
      const h = r.state.economy.hoursUsedWeek - friche.economy.hoursUsedWeek;
      pire = Math.max(pire, h);
    }
    // Il existe, donc le joueur paie la brousse qu'il ouvre…
    expect(pire).toBeGreaterThan(PLANT_HOURS);
    // …mais il reste petit, et c'est le bon ordre : dégager trois mètres carrés
    // à 60 h/ha prend une minute. Gonfler ce chiffre pour « faire jeu »
    // compterait deux fois la punition, puisque l'étouffement est déjà simulé.
    expect(pire).toBeLessThan(PLANT_HOURS * 1.1);
    void cote;
  });

  it("nettoyer avant de planter paie — et c'est la simulation qui le dit", () => {
    const cote = friche.station.coteM;
    const nettoyee = applyAction(friche, {
      type: "eclaircir",
      week: friche.week,
      x: cote / 2,
      y: cote / 2,
      rayonM: cote,
      densiteCibleParHa: 0,
      critere: "espece",
      especeId: "rubus_fruticosus",
      devenir: "laisser",
    });
    const coutNettoyage = nettoyee.state.economy.hoursUsedWeek - friche.economy.hoursUsedWeek;
    // Le nettoyage est désormais payable : il l'était à plus de trois cents
    // heures avant ce lot, ce qui interdisait la manœuvre au lieu de la tarifer.
    expect(coutNettoyage).toBeLessThan(40);

    const survie: number[] = [];
    for (const base of [friche, nettoyee.state]) {
      const r = applyAction(base, {
        type: "planter",
        week: base.week,
        especeId: "quercus_pubescens",
        positions: libres,
      });
      // Les identifiants que l'**action** rend : une friche régénère toute seule, et
      // compter « ce qui est apparu depuis » mesurait la recolonisation.
      const geste = (r.gestes ?? []).find((g) => g.type === "planter" && "ids" in g);
      const poses = new Set(geste && "ids" in geste ? geste.ids : []);
      expect(poses.size).toBe(libres.length);
      const apres = avance(r.state, 15 * 52);
      // Dénominateur = les plants **posés** : un arbre mort finit par être retiré du
      // tableau, donc compter les présents faisait disparaître les morts.
      survie.push(apres.trees.filter((t) => poses.has(t.id) && t.alive).length / poses.size);
    }
    const [avecRonces, nettoye] = survie as [number, number];
    // Aucune punition n'a été écrite : les ronces prennent la lumière, et le
    // moteur en tire tout seul de quoi rendre le débroussaillage rentable.
    expect(nettoye).toBeGreaterThan(avecRonces * 1.3);
  }, 180_000);
});
