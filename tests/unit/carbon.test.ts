import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { carbonInventory, treeAboveCarbonKg, treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import { diametreInitialCm, volumeTigeM3 } from "../../src/engine/trees";
import { runYears } from "../helpers";

describe("allométrie carbone", () => {
  it("la tige d'un grand hêtre pèse ce que pèsent les tiges de hêtre mesurées", () => {
    // C'EST L'ANCRE QUI TIENT L'INFRADENSITÉ (#68), et elle porte sur la TIGE
    // à dessein. L'ancre d'avant portait sur l'arbre entier et ne discriminait
    // rien : elle acceptait 1 078 kg C (infradensité 0,55) comme 1 333 kg C
    // (densité du commerce 0,68), si bien que le défaut a pu vivre sous un
    // essai vert. Une ancre que la correction ne fait pas basculer ne prouve
    // pas la correction.
    //
    // La tige, elle, discrimine, parce que son volume ne fait pas débat : le
    // moteur en donne 2,454 m³ pour cet arbre, et le tarif français EMERGE
    // (Deleuze et al. 2014, constante Fagus sylvatica 0,515 — reproduit en
    // annexe 4 de la méthode CNPF du label bas-carbone) en donne 2,528 m³,
    // soit 3 % d'écart. Sur un volume aussi bien tenu, la masse sèche ne
    // mesure plus qu'une chose : l'infradensité.
    //
    // Les bornes viennent de Zianis, Muukkonen, Mäkipää & Mencuccini 2005,
    // Biomass and Stem Volume Equations for Tree Species in Europe, Silva
    // Fennica Monographs 4, annexe A. Quatre équations de biomasse de tige
    // (ST) y sont applicables à un hêtre adulte de 50 cm et 25 m — celles qui
    // ne sont ni hors de leur plage de diamètre ni calées sur une autre classe
    // d'âge :
    //
    //   Cienciala 2005 (Tchéquie, D 5,7–62,1, n=20)  1 624 kg
    //   Calamini & Gregori 2001 (Italie, adultes)    1 512 kg
    //   Bartelink 1997 (Pays-Bas, D et H, n=38)      1 307 kg
    //   Bartelink 1997 (Pays-Bas, D seul, n=38)      1 474 kg
    //
    // soit une enveloppe de 1 307 à 1 624 kg de matière sèche, arrondie vers
    // l'extérieur ci-dessous pour ne jamais serrer plus que la mesure. Divisée
    // par le volume de tige, elle borne l'infradensité entre 0,53 et 0,66 —
    // ce qui contient les 0,55 de l'IGN et les 0,585 du GWDD, et exclut les
    // 0,68 d'avant.
    //
    // VÉRIFIÉ : à 0,68, le moteur donne 1 669 kg et cet essai TOMBE. C'est la
    // seule preuve que la correction en est une.
    const hetre = getEspece("fagus_sylvatica");

    // Le volume de tige d'abord, séparément : si un jour il dérive, on saura
    // que c'est lui et non l'infradensité qui a fait tomber la borne suivante.
    const volumeTige = volumeTigeM3(50, 25);
    expect(volumeTige).toBeGreaterThan(2.3);
    expect(volumeTige).toBeLessThan(2.7);

    const tigeAnhydreKg = volumeTige * hetre.bois.densite * 1000;
    expect(tigeAnhydreKg).toBeGreaterThan(1300);
    expect(tigeAnhydreKg).toBeLessThan(1630);
  });

  it("l'arbre entier reste dans l'enveloppe des équations de biomasse", () => {
    // Garde-fou d'ordre de grandeur, PAS l'ancre : ces bornes-ci ne
    // discriminent pas l'infradensité (0,55 donne 1 078 kg, 0,68 en donnait
    // 1 333, les deux passent). C'est l'essai précédent qui tranche ; celui-ci
    // attrape les dérives grossières d'allométrie ou de fraction de carbone.
    //
    // Bornes tirées des mêmes équations (Zianis 2005, annexe A), compartiment
    // AB cette fois : de 1 819 kg (Hochbichler 2002, Autriche) à 2 302 kg
    // (Duvigneaud 1977, Belgique) de matière sèche aérienne. Converties avec
    // `CARBON_FRACTION` et `ROOT_SHOOT_RATIO`, et élargies vers le bas jusqu'à
    // la plus petite tige publiée augmentée du plus faible rapport
    // aérien/tige observé (1 307 × 1,20), elles donnent 960 à 1 420 kg C.
    //
    // Le moteur y place 1 078 kg, soit 3 % SOUS le plancher qu'on obtiendrait
    // en partant des seules équations AB : son expansion de branches (1,30) et
    // l'infradensité de l'IGN (0,55) sont toutes deux au bas de leur
    // fourchette, et les deux se cumulent. C'est à regarder, mais séparément —
    // deux corrections de biomasse dans le même lot se masqueraient.
    const kg = treeTotalCarbonKg(getEspece("fagus_sylvatica"), 50, 25);
    expect(kg).toBeGreaterThan(960);
    expect(kg).toBeLessThan(1420);
  });

  it("un semis stocke un carbone négligeable, et racines < aérien", () => {
    const espece = getEspece("betula_pendula");
    expect(treeTotalCarbonKg(espece, diametreInitialCm(0.3), 0.3)).toBeLessThan(1);
    expect(treeTotalCarbonKg(espece, diametreInitialCm(10), 10)).toBeGreaterThan(
      treeAboveCarbonKg(espece, diametreInitialCm(10), 10),
    );
    expect(treeTotalCarbonKg(espece, diametreInitialCm(10), 10)).toBeLessThan(
      2 * treeAboveCarbonKg(espece, diametreInitialCm(10), 10),
    );
  });
});

describe("inventaire carbone d'une parcelle", () => {
  it("l'humus domine les stocks, et une jeune plantation stocke du vivant", () => {
    const state = runYears(LIMON_RICHE, 15, {
      plantations: [
        { especeId: "betula_pendula", count: 40 },
        { especeId: "fagus_sylvatica", count: 40 },
      ],
    });
    const inv = carbonInventory(state, LIMON_RICHE.station.initialSoilCTHa);
    // Le sol reste LE stock dominant en tempéré (§12).
    expect(inv.humusTHa).toBeGreaterThan(inv.vivantTHa);
    expect(inv.humusTHa).toBeGreaterThan(50);
    expect(inv.humusTHa).toBeLessThan(70);
    expect(inv.vivantTHa).toBeGreaterThan(0.5);
    expect(inv.nppCumTHa).toBeGreaterThan(0);
    // Rien vendu ni brûlé dans ce run.
    expect(inv.exporteCumTHa).toBe(0);
  });
});

/**
 * Une chandelle brûlée qu'on vient chercher trop tard. Tant que l'arbre tué par
 * le feu est récupérable, son carbone attend sur pied : le tick n'a rien versé
 * au pool de bois mort. Passé ce délai (CHABLIS_RECUPERABLE_SEMAINES), le tick
 * verse la TOTALITÉ du carbone de l'arbre au pool et pose `mortSemaine` — une
 * fois pour toutes. Le couper ensuite, ce n'est plus abattre un arbre : c'est
 * puiser dans le pool, qui a d'ailleurs commencé à se décomposer.
 */
describe("couper une chandelle déjà versée au bois mort", () => {
  const STATION = { ...LIMON_RICHE.station, coteM: 50 };
  const WEATHER = syntheticYear(LIMON_RICHE.climat);
  const PIN = getEspece("pinus_sylvestris");
  const AERIEN = treeAboveCarbonKg(PIN, diametreInitialCm(15), 15);
  const TOTAL = treeTotalCarbonKg(PIN, diametreInitialCm(15), 15);

  /** Un pin de 15 m tué par le feu en semaine 0, laissé debout `semaines`. */
  function pinBrule(semaines: number): GameState {
    let state = createGameState(STATION, rngStateFromSeed(13));
    state = plantAt(state, "pinus_sylvestris", 25, 25, 15);
    state = {
      ...state,
      trees: state.trees.map((t) => ({ ...t, alive: false, causeMort: "feu", brulEeSemaine: 0 })),
    };
    for (let i = 0; i < semaines; i++) {
      const w = WEATHER[i % 52];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
    }
    return state;
  }

  function couper(state: GameState) {
    const { state: apres, refusals } = applyAction(state, {
      type: "couper",
      week: state.week,
      treeIds: [1],
      devenir: "vendre",
    });
    expect(refusals).toEqual([]);
    return apres;
  }

  it("encore récupérable : rien n'a été versé, la coupe laisse les racines au sol", () => {
    const avant = pinBrule(10);
    expect(avant.trees.find((t) => t.id === 1)?.mortSemaine).toBeUndefined();
    const poolAvant = avant.carbon.deadWoodKgC;
    const apres = couper(avant);
    expect(apres.carbon.exportedEnergyCumKgC).toBeCloseTo(AERIEN, 6);
    expect(apres.carbon.deadWoodKgC - poolAvant).toBeCloseTo(TOTAL - AERIEN, 6);
  });

  it("passé le délai : le bois est déjà au pool, la coupe l'en RETIRE", () => {
    const avant = pinBrule(60);
    // Le tick a posé la mort en semaine 52 et versé l'arbre ENTIER au pool.
    // On le dit relativement à `TOTAL` et non en kilos : un nombre en dur ici
    // ne décrirait que l'allométrie du jour, et celle-ci a déjà changé une fois
    // d'un facteur six (#62).
    expect(avant.trees.find((t) => t.id === 1)?.mortSemaine).toBe(52);
    const poolAvant = avant.carbon.deadWoodKgC;
    expect(poolAvant).toBeGreaterThan(0.9 * TOTAL);

    const apres = couper(avant);
    expect(apres.carbon.exportedEnergyCumKgC).toBeCloseTo(AERIEN, 6);
    // Le pool BAISSE de ce qu'on emporte, au lieu de gonfler des racines une
    // deuxième fois : plus de carbone créé de rien, et plus de tronc au pool
    // pour un arbre qui n'est plus debout.
    expect(poolAvant - apres.carbon.deadWoodKgC).toBeCloseTo(AERIEN, 6);
    // Il ne reste au pool que les racines, déjà entamées par la décomposition.
    expect(apres.carbon.deadWoodKgC).toBeGreaterThan(0);
    expect(apres.carbon.deadWoodKgC).toBeLessThan(TOTAL - AERIEN);
  });

  it("on n'en sort pas plus que ce que la décomposition a laissé", () => {
    const vieilli = pinBrule(60);
    // Une chandelle à moitié retournée au sol. Le reste à prélever se dit en
    // part de l'aérien, pas en kilos : ce qu'on épingle est un PLAFOND — on ne
    // sort pas du pool plus qu'il ne contient — et ce plafond ne dépend pas du
    // niveau absolu de l'allométrie.
    const restant = AERIEN / 2;
    const avant = { ...vieilli, carbon: { ...vieilli.carbon, deadWoodKgC: restant } };
    const apres = couper(avant);
    expect(apres.carbon.exportedEnergyCumKgC).toBeCloseTo(restant, 6);
    expect(apres.carbon.deadWoodKgC).toBeCloseTo(0, 9);
    expect(apres.carbon.deadWoodKgC).toBeGreaterThanOrEqual(0);
  });
});
