/**
 * Les chandelles : un arbre mort ne disparaît pas, il reste debout.
 *
 * Jusqu'ici, un arbre tué par la sécheresse quittait la parcelle le tick même.
 * C'est faux de plusieurs façons : un tronc mort sèche sur pied et tient des
 * années, il occupe la place, et surtout c'est LE bois mort qui compte pour la
 * faune. Les pics attaquent le bois debout, et le trou qu'ils abandonnent sert
 * ensuite à des dizaines d'espèces qui ne savent pas creuser — mésanges,
 * sittelles, chauves-souris, abeilles solitaires. Un arbre vivant sain n'offre
 * rien de tel.
 */

import { describe, expect, it } from "vitest";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import { couvertureDuBoisAuSol, directionDeChute, ecrasePar } from "../../src/engine/boisMort";
import { treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { chargeCombustible } from "../../src/engine/feu";
import { computeLight } from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  CHANDELLE_ANS_PAR_DENSITE,
  dureeChandelleSemaines,
  type TreeState,
} from "../../src/engine/trees";

const STATION = { ...LIMON_RICHE.station, coteM: 20, voisinage: [], gibierParHa: 0 };
const METEO = syntheticYear(LIMON_RICHE.climat);

/** Une chandelle morte à la semaine 0, plantée au milieu. */
function chandelle(heightM = 18): TreeState {
  return {
    id: 1,
    especeId: "fagus_sylvatica",
    x: 10,
    y: 10,
    ageWeeks: 80 * 52,
    heightM,
    stress: 0,
    alive: false,
    mortSemaine: 0,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 100,
    hauteurElagueeM: 0,
    pousseTendreM: 0,
    vigueur: 0,
    dommageHydraulique: 0,
    protege: false,
    recepages: 0,
    vigueurIndividuelle: 1,
    causeMort: "secheresse",
  } satisfies TreeState & { causeMort: "secheresse" } as TreeState & { mortSemaine: number };
}

describe("un arbre mort reste debout", () => {
  it("il ne quitte plus la parcelle le jour de sa mort", () => {
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = plantAt(state, "fagus_sylvatica", 10, 10, 2);
    // On le tue à la main : on veut éprouver le devenir du mort, pas la cause.
    state = { ...state, trees: state.trees.map((t) => ({ ...t, alive: false })) };
    const apres = tick(state, METEO[20] as never).state;
    expect(apres.trees).toHaveLength(1);
    expect(apres.trees[0]?.alive).toBe(false);
    expect(apres.trees[0]?.mortSemaine).toBeDefined();
  });

  it("le bois dense tient plus longtemps que le bois tendre", () => {
    // Un chêne mort reste debout une décennie là où un saule s'écroule vite.
    const chene = dureeChandelleSemaines(getEspece("quercus_pubescens"));
    const sureau = dureeChandelleSemaines(getEspece("sambucus_nigra"));
    expect(chene).toBeGreaterThan(sureau);
    expect(chene / 52).toBeLessThan(CHANDELLE_ANS_PAR_DENSITE);
  });

  it("elle finit par tomber", () => {
    const espece = getEspece("fagus_sylvatica");
    const duree = dureeChandelleSemaines(espece);
    let state = createGameState(STATION, rngStateFromSeed(3));
    state = { ...state, trees: [chandelle()], nextTreeId: 2 };
    for (let i = 0; i < duree + 60; i++) state = tick(state, METEO[i % 52] as never).state;
    expect(state.trees).toHaveLength(0);
  });

  it("elle ne fait plus d'ombre : elle n'a plus de feuilles", () => {
    // L'ombre est décalée vers le nord (light.ts) : on place le semis là où
    // elle tombe, pas au pied de l'arbre.
    const semis = { ...chandelle(0.5), id: 2, alive: true, x: 10, y: 10 + 0.4 * 18 };
    const sousLaChandelle = computeLight([chandelle(), semis], () => 1)[1] ?? 0;
    const vivant = { ...chandelle(), id: 3, alive: true };
    const sousLArbre = computeLight([vivant, semis], () => 1)[1] ?? 0;
    expect(sousLaChandelle).toBeCloseTo(1, 6);
    expect(sousLArbre).toBeLessThan(0.2);
  });

  it("mais elle vaut un arbre-habitat, ce qu'un jeune arbre sain n'est pas", () => {
    const avec = indiceBiodiversite([chandelle()], 0, 0.04);
    const sans = indiceBiodiversite([{ ...chandelle(4), id: 9, alive: true }], 0, 0.04);
    expect(avec.grosArbres).toBeGreaterThan(sans.grosArbres);
  });

  it("une chandelle trop courte ne compte pas : un pic n'y creuse rien", () => {
    const haute = indiceBiodiversite([chandelle(18)], 0, 0.04);
    const basse = indiceBiodiversite([chandelle(3)], 0, 0.04);
    expect(haute.grosArbres).toBeGreaterThan(basse.grosArbres);
  });
});

describe("une chandelle est du combustible sur pied", () => {
  it("elle charge plus que le même arbre vivant : c'est du bois sec", () => {
    // Une parcelle déjà passée au feu, ou frappée par la sécheresse, rebrûle
    // mieux que celle d'à côté — et c'est pour ça.
    const morte = chandelle(18);
    const vive = { ...morte, alive: true };
    const herbe = new Array(400).fill(0);
    const litiere = new Array(400).fill(0);
    const avecMorte = chargeCombustible([morte], herbe, litiere, 20);
    const avecVive = chargeCombustible([vive], herbe, litiere, 20);
    expect(avecMorte.moyenne).toBeGreaterThan(avecVive.moyenne);
  });
});

/**
 * Ce qu'un tronc devient une fois par terre (boisMort.ts).
 *
 * Jusqu'ici la chandelle tombée quittait la parcelle et son bois se dissolvait
 * dans un pool global, indifférent à l'endroit où l'arbre avait vécu. Un tronc
 * tombe pourtant QUELQUE PART : ce qu'il devient — humus, abri, obstacle à
 * l'eau, écrasement de ce qui poussait dessous — se joue sur les quelques
 * mètres carrés qu'il recouvre.
 */
describe("un tronc qui tombe tombe quelque part", () => {
  /** Fait vivre la parcelle jusqu'à la semaine où la chandelle s'abat. */
  function jusquALaChute(graine = 3, station = STATION) {
    const duree = dureeChandelleSemaines(getEspece("fagus_sylvatica"));
    let state = createGameState(station, rngStateFromSeed(graine));
    // On pose la chandelle à la main, donc son bois n'est jamais passé par la
    // mort : il faut le mettre dans le pool des morts debout nous-mêmes, sans
    // quoi elle tomberait sans rien avoir à déposer.
    state = {
      ...state,
      trees: [chandelle()],
      nextTreeId: 2,
      carbon: {
        ...state.carbon,
        deadWoodKgC: treeTotalCarbonKg(getEspece("fagus_sylvatica"), 18),
      },
    };
    for (let i = 0; i < duree + 20; i++) {
      const avant = state;
      const r = tick(state, METEO[i % 52] as never);
      state = r.state;
      if (r.chutes.length > 0) return { avant, apres: state, chutes: r.chutes };
    }
    throw new Error("la chandelle n'est jamais tombée");
  }

  it("son bois se couche sur les cellules qu'il recouvre", () => {
    const { apres, chutes } = jusquALaChute();
    expect(chutes).toHaveLength(1);
    const chute = chutes[0];
    if (!chute) throw new Error("pas de chute");
    expect(chute.masseKgC).toBeGreaterThan(0);
    // Un hêtre de dix-huit mètres ne tient pas sur un mètre carré.
    expect(chute.empreinte.length).toBeGreaterThan(5);
    const couvert = chute.empreinte.reduce((s, c) => s + c.longueurM, 0);
    expect(couvert).toBeGreaterThan(10);
    expect(couvert).toBeLessThanOrEqual(chute.heightM + 0.5);
    const auSol = apres.soil.boisAuSolCG.reduce((s, v) => s + v, 0);
    expect(auSol).toBeGreaterThan(0);
  });

  it("le carbone passe du debout au couché sans en gagner ni en perdre", () => {
    const { avant, apres } = jusquALaChute();
    const total = (s: typeof avant) =>
      s.carbon.deadWoodKgC + s.soil.boisAuSolCG.reduce((a, v) => a + v, 0) / 1000;
    // La décomposition d'une semaine retire un peu des deux stocks ; le
    // transfert, lui, ne doit rien créer. On borne donc par le haut.
    expect(total(apres)).toBeLessThanOrEqual(total(avant) + 1e-6);
    expect(total(apres)).toBeGreaterThan(total(avant) * 0.9);
    expect(apres.carbon.deadWoodKgC).toBeGreaterThanOrEqual(0);
  });

  it("sur une pente, il tombe vers l'aval — et à plat, n'importe où", () => {
    // Une seule chute ne prouve rien : le tirage est aléatoire et c'est le
    // RESSERREMENT autour de l'aval que la pente produit, pas une direction
    // imposée. On compare donc deux nuages de directions.
    const dims = { widthM: 20, heightM: 20 };
    const versLeSud = (pentePct: number) => {
      // Terrain qui descend vers +y : l'aval est à +y, soit un angle de +π/2.
      const altitudes = Array.from(
        { length: 400 },
        (_, i) => -Math.floor(i / 20) * (pentePct / 100),
      );
      let rng = rngStateFromSeed(11);
      const ecarts: number[] = [];
      for (let n = 0; n < 200; n++) {
        const d = directionDeChute(altitudes, dims, 10, 10, rng);
        rng = d.rng;
        const ecart = Math.abs(
          Math.atan2(Math.sin(d.radians - Math.PI / 2), Math.cos(d.radians - Math.PI / 2)),
        );
        ecarts.push(ecart);
      }
      return ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
    };
    const raide = versLeSud(60);
    const plat = versLeSud(0);
    expect(raide).toBeLessThan(0.2);
    // À plat, l'écart moyen à une direction quelconque vaut π/2 : le hasard
    // n'a plus de préférence.
    expect(plat).toBeGreaterThan(1.2);
  });

  it("ce qui pousse dessous casse si le tronc pèse plus lourd que lui", () => {
    const hetre = getEspece("fagus_sylvatica");
    const tronc = treeTotalCarbonKg(hetre, 18);
    const semis = treeTotalCarbonKg(hetre, 0.5);
    const adulte = treeTotalCarbonKg(hetre, 20);
    // Le tronc se répartit sur sa longueur : c'est la part reçue par la
    // cellule qui compte, pas la masse entière.
    const parCellule = tronc / 18;
    expect(ecrasePar(parCellule, semis)).toBe(true);
    expect(ecrasePar(parCellule, adulte)).toBe(false);
  });

  it("le tronc couché protège la terre sous lui", () => {
    // Un mètre de tronc masque une part du mètre carré, pas sa totalité ; il
    // faut plusieurs mètres empilés pour couvrir la cellule entière.
    expect(couvertureDuBoisAuSol(0)).toBe(0);
    expect(couvertureDuBoisAuSol(1)).toBeGreaterThan(0);
    expect(couvertureDuBoisAuSol(1)).toBeLessThan(1);
    expect(couvertureDuBoisAuSol(10)).toBe(1);
  });
});
