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
import { applyAction, DECOTE_CHANDELLE } from "../../src/engine/actions";
import { indiceBiodiversite } from "../../src/engine/biodiversite";
import { getEspece } from "../../src/engine/especes";
import { chargeCombustible } from "../../src/engine/feu";
import { computeLight } from "../../src/engine/light";
import { partMecanisable } from "../../src/engine/mecanisation";
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

describe("abattre une chandelle", () => {
  /** Une parcelle avec une seule chandelle de hêtre, morte depuis un moment. */
  function avecChandelle(patch: Partial<TreeState> = {}) {
    const vide = createGameState(STATION, rngStateFromSeed(7));
    return { ...vide, trees: [{ ...chandelle(), ...patch }], nextTreeId: 2 };
  }

  /** Ce qu'une coupe rapporte, sur une parcelle donnée. */
  function gainDeLaCoupe(etat: ReturnType<typeof avecChandelle>) {
    const apres = applyAction(etat, { type: "couper", week: 60, treeIds: [1], devenir: "vendre" });
    return {
      eur: apres.state.economy.treasuryEur - etat.economy.treasuryEur,
      etat: apres.state,
      refusals: apres.refusals,
    };
  }

  it("un fût sec se coupe : c'est du bois de chauffage, pas un intouchable", () => {
    const coupe = gainDeLaCoupe(avecChandelle());
    expect(coupe.refusals).toHaveLength(0);
    expect(coupe.etat.trees).toHaveLength(0);
    expect(coupe.eur).toBeGreaterThan(0);
  });

  it("elle rapporte moins que la même tige verte, et jamais d'œuvre", () => {
    // Le fût est fendillé, l'aubier parti, les insectes passés : même élaguée
    // de son vivant, une chandelle ne fait pas une bille de scierie.
    const morte = gainDeLaCoupe(avecChandelle({ hauteurElagueeM: 8 }));
    expect(morte.etat.carbon.oeuvreCumKgC).toBe(0);
    expect(DECOTE_CHANDELLE).toBeLessThan(1);

    const vive = gainDeLaCoupe(
      avecChandelle({ hauteurElagueeM: 8, alive: true, mortSemaine: undefined }),
    );
    expect(vive.etat.carbon.oeuvreCumKgC).toBeGreaterThan(0);
    expect(morte.eur).toBeLessThan(vive.eur);
  });

  it("le carbone est DÉPLACÉ, pas créé : le bois mort baisse d'autant", () => {
    // Le piège de l'opération. Le carbone aérien d'une chandelle est déjà
    // dans le pool de bois mort — il y est entré à sa mort. L'emporter doit
    // l'en retirer ; l'y ajouter une seconde fois fabriquerait du carbone.
    const base = avecChandelle();
    const avant = { ...base, carbon: { ...base.carbon, deadWoodKgC: 5000 } };
    const coupe = gainDeLaCoupe(avant);
    const exporte = coupe.etat.carbon.exportedEnergyCumKgC - avant.carbon.exportedEnergyCumKgC;
    const boisMortPerdu = avant.carbon.deadWoodKgC - coupe.etat.carbon.deadWoodKgC;
    expect(exporte).toBeGreaterThan(0);
    expect(boisMortPerdu).toBeCloseTo(exporte, 6);
  });

  it("une chandelle très décomposée ne rend plus que ce qu'il reste d'elle", () => {
    // Le pool de bois mort se décompose : une chandelle de dix ans a déjà
    // rendu l'essentiel au sol et à l'air. On ne peut pas en emporter plus
    // qu'il n'en reste, sinon le pool passe sous zéro et on crée du carbone.
    const base = avecChandelle();
    const presqueVide = { ...base, carbon: { ...base.carbon, deadWoodKgC: 3 } };
    const coupe = gainDeLaCoupe(presqueVide);
    expect(coupe.etat.carbon.deadWoodKgC).toBe(0);
    expect(
      coupe.etat.carbon.exportedEnergyCumKgC - presqueVide.carbon.exportedEnergyCumKgC,
    ).toBeCloseTo(3, 6);
    // Le bois se vend quand même : l'argent et le carbone sont deux livres
    // de comptes séparés, et la décote couvre l'état du fût.
    expect(coupe.eur).toBeGreaterThan(0);
  });

  it("une chandelle sèche ne fait pas de BRF : le broyat veut du bois FRAIS", () => {
    // Ce n'est pas une limite technique, c'est l'agronomie : l'intérêt du BRF
    // est dans le cambium vivant et l'azote du rameau de l'année.
    const avant = avecChandelle();
    for (const devenir of ["epandre", "broyer"] as const) {
      const apres = applyAction(avant, { type: "couper", week: 60, treeIds: [1], devenir });
      expect(apres.refusals).toHaveLength(1);
      expect(apres.state.trees).toHaveLength(1);
    }
  });

  it("un tracteur ne passe pas à travers un fût mort", () => {
    // Une chandelle n'ombrage plus rien, mais elle occupe le couloir : après
    // une mortalité, la fauche et le chaulage restent chers jusqu'au nettoyage.
    const morts: TreeState[] = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
      ...chandelle(),
      id: i,
      x: 4 + i * 1.6,
      y: 10 + ((i * 7) % 5),
    }));
    expect(partMecanisable(morts, 10, 10, 8)).toBeLessThan(1);
    expect(partMecanisable([], 10, 10, 8)).toBe(1);
  });
});
