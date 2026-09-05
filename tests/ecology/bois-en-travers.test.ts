/**
 * Le bois couché EN TRAVERS : ce qu'un tronc fait à l'eau qui passe à côté.
 *
 * Un tronc au sol protégeait déjà la terre SOUS lui, comme un paillage. Mais un
 * tronc couché en travers d'un thalweg fait autre chose, et de plus important :
 * il barre. L'eau s'y met en flaque et a le temps de rentrer dans la terre, le
 * sédiment se dépose derrière lui. C'est l'effet mesuré des « log erosion
 * barriers » de la restauration post-incendie, et c'est un des rares leviers
 * réels contre le ruissellement d'un versant.
 *
 * Tout tient à l'ORIENTATION, et ces essais sont là pour l'établir : le même
 * tronc, de la même masse, ne fait rien du tout s'il gît dans le sens de la
 * pente. Adams et al. (2023) ne mesurent aucune accumulation derrière un tronc
 * orienté à moins de 30° du courant.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import {
  capaciteDuCoinM3M2,
  DIAMETRE_TRONC_M,
  directionDeChute,
  graineDeChute,
  sedimentPiegeKgM2,
  transversalite,
  versLAval,
  volumeDuCoinM3ParM,
} from "../../src/engine/boisMort";
import { livingCarbonKg } from "../../src/engine/carbon";
import { syntheticYear } from "../../src/engine/meteo";
import { RELIEF_PLAT } from "../../src/engine/relief";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const COTE = 30;
/** Un mètre de tronc par mètre carré : une ligne continue de billes. */
const BOIS_CG = 15_000;
/** Rangée sur laquelle on couche les troncs, en bas de versant. */
const RANGEE = 8;

const STATION = {
  ...LIMON_RICHE.station,
  coteM: COTE,
  herbeInitiale: 0,
  voisinage: [],
  gibierParHa: 0,
  relief: {
    ...RELIEF_PLAT,
    pentePct: 25,
    expositionDeg: 180,
    forme: "vallon" as const,
    bassinAmontHa: 0.5,
  },
};

const METEO = syntheticYear(LIMON_RICHE.climat);

/** Couche une rangée de troncs en travers du versant, avec l'orientation voulue. */
function avecTroncs(state: GameState, part: number | undefined): GameState {
  if (part === undefined) return state;
  const boisAuSolCG = state.soil.boisAuSolCG.slice();
  const boisEnTraversPart = state.soil.boisEnTraversPart.slice();
  for (let x = 0; x < COTE; x++) {
    boisAuSolCG[RANGEE * COTE + x] = BOIS_CG;
    boisEnTraversPart[RANGEE * COTE + x] = part;
  }
  return { ...state, soil: { ...state.soil, boisAuSolCG, boisEnTraversPart } };
}

/**
 * Un versant nu, quelques années. `part` vaut `undefined` pour « pas de bois »,
 * 0 pour « du bois dans le sens de la pente », 1 pour « du bois en travers ».
 *
 * L'eau de surface se lit sur `overflowMm` autant que sur
 * `ruissellementSortantMm` : le point bas d'une parcelle n'a pas de voisine
 * plus basse, donc pas de pente, donc tout ce qui y arrive y stagne avant de
 * s'en aller. Ne compter que le second ferait croire à un versant étanche.
 */
function versant(graine: number, part: number | undefined, annees: number, bassinAmontHa = 0.5) {
  const station = { ...STATION, relief: { ...STATION.relief, bassinAmontHa } };
  let state = avecTroncs(createGameState(station, rngStateFromSeed(graine)), part);
  let eau = 0;
  let terre = 0;
  let retenue = 0;
  let piege = 0;
  for (let i = 0; i < annees * 52; i++) {
    const r = tick(state, METEO[i % 52] as never);
    state = r.state;
    eau += r.fluxes.overflowMm + r.fluxes.ruissellementSortantMm;
    terre += r.fluxes.erosionSortieKgM2;
    retenue += r.fluxes.boisRetenueMm;
    piege += r.fluxes.boisSedimentPiegeKgM2;
  }
  return { eau, terre, retenue, piege };
}

/** Moyenne sur plusieurs graines : une partie unique ne prouve rien ici. */
function surPlusieursGraines(
  graines: number[],
  part: number | undefined,
  annees: number,
  bassinAmontHa = 0.5,
) {
  const r = graines.map((g) => versant(g, part, annees, bassinAmontHa));
  const m = (f: (v: (typeof r)[number]) => number) => r.reduce((a, v) => a + f(v), 0) / r.length;
  return {
    eau: m((v) => v.eau),
    terre: m((v) => v.terre),
    retenue: m((v) => v.retenue),
    piege: m((v) => v.piege),
  };
}

const GRAINES = [3, 11, 29, 47, 61];

describe("l'orientation d'un tronc décide de tout", () => {
  it("un tronc dans le sens de la pente ne barre rien, en travers il barre tout", () => {
    const aval = 0;
    expect(transversalite(aval, aval)).toBeCloseTo(0, 12);
    expect(transversalite(aval + Math.PI, aval)).toBeCloseTo(0, 12);
    expect(transversalite(aval + Math.PI / 2, aval)).toBeCloseTo(1, 12);
    // Un tronc n'a pas de sens : couché vers l'est ou vers l'ouest, il barre
    // pareil. D'où la valeur absolue, et non le sinus signé.
    expect(transversalite(aval - Math.PI / 2, aval)).toBeCloseTo(1, 12);
  });

  it("un chablis naturel barre d'autant moins que la pente est raide", () => {
    // La conséquence gênante, et elle tient : là où l'érosion fait le plus de
    // dégâts, la chute naturelle sert le moins. Sur une pente marquée, l'arbre
    // part plutôt vers l'aval et son tronc devient une gouttière — d'où
    // l'intérêt d'ABATTRE sur courbe de niveau, ce que fait la restauration
    // post-incendie.
    //
    // « Plutôt », et non « toujours » : l'écart s'est nettement resserré le
    // jour où la dispersion résiduelle est entrée dans `directionDeChute`
    // (0,64 à plat → 0,49 à 50 %, là où le modèle donnait 0 auparavant). Ce
    // zéro était un artefact de forme, pas une mesure : la contrainte de pente
    // atteignait exactement 1 et alignait tous les arbres au cordeau. La
    // littérature dit l'inverse — Rentch et al. concluent que la forte
    // variation des directions de chute empêche d'établir une relation
    // constante avec la pente, et l'asymétrie du houppier s'en mêle.
    const dims = { widthM: COTE, heightM: COTE };
    const moyenne = (pentePct: number) => {
      const alt = Array.from(
        { length: COTE * COTE },
        (_, i) => (Math.floor(i / COTE) * pentePct) / 100,
      );
      let somme = 0;
      const n = 400;
      for (let k = 0; k < n; k++) {
        const d = directionDeChute(alt, dims, 15, 15, graineDeChute(k, 7));
        somme += transversalite(d, versLAval(alt, dims, 15, 15).radians);
      }
      return somme / n;
    };
    // À plat, la chute est quelconque : la transversalité moyenne d'un angle
    // tiré au hasard vaut 2/π ≈ 0,64.
    expect(moyenne(2)).toBeGreaterThan(0.5);
    expect(moyenne(2)).toBeLessThan(0.8);
    expect(moyenne(25)).toBeLessThan(moyenne(8));
    // La pente oriente, elle ne range pas : à 50 % il reste la moitié du bois
    // en travers. Ce qui doit rester vrai, c'est le SENS et l'écart net.
    expect(moyenne(50)).toBeLessThan(0.85 * moyenne(2));
    expect(moyenne(50)).toBeGreaterThan(0.3);
  });

  it("la chute enregistre l'orientation dans le sol qu'elle couvre", () => {
    // Le champ ne se remplit pas tout seul : c'est le tick, à la chute, qui
    // moyenne la transversalité pondérée par les masses posées.
    const partMoyenne = (pentePct: number) => {
      const station = {
        ...STATION,
        relief: { ...RELIEF_PLAT, pentePct, expositionDeg: 180, forme: "plan" as const },
      };
      let state = plantScattered(createGameState(station, rngStateFromSeed(5)), "salix_alba", 120);
      // On les tue tous : ils feront des chandelles, puis des troncs couchés.
      state = { ...state, trees: state.trees.map((t) => ({ ...t, alive: false })) };
      for (let i = 0; i < 40 * 52; i++) state = tick(state, METEO[i % 52] as never).state;
      let masse = 0;
      let travers = 0;
      for (let k = 0; k < state.soil.boisAuSolCG.length; k++) {
        const b = state.soil.boisAuSolCG[k] ?? 0;
        masse += b;
        travers += b * (state.soil.boisEnTraversPart[k] ?? 0);
      }
      expect(masse).toBeGreaterThan(0);
      return travers / masse;
    };
    const raide = partMoyenne(60);
    const plat = partMoyenne(0);
    // Le versant raide barre moins que le plat, sans jamais tomber à zéro :
    // même à 60 %, la dispersion résiduelle des chutes laisse un quart du bois
    // en travers (`DISPERSION_RESIDUELLE`, boisMort.ts).
    // Mesuré : un quart de barrage en moins sur le versant raide. C'est net, et
    // c'est loin du zéro qu'affichait le modèle avant que la dispersion
    // résiduelle des chutes ne soit rétablie.
    expect(raide).toBeLessThan(0.85 * plat);
    expect(raide).toBeGreaterThan(0.04);
    // Chute quelconque : l'espérance de l'efficacité barrante d'un angle tiré
    // au hasard vaut (2/π)·(√3 − π/3) ≈ 0,44 une fois le seuil des 30° passé —
    // puis le quart, parce qu'un chablis repose sur ses branches et ne touche
    // le sol que sur 1,6 point de mesure sur 7 (`CONTACT_CHABLIS_BRANCHU`).
    expect(plat).toBeGreaterThan(0.08);
    expect(plat).toBeLessThan(0.15);
  });
});

describe("un tronc en travers freine l'eau et piège la terre — pas celui qui gît le long", () => {
  it("à masse égale, seul le tronc en travers change quoi que ce soit", () => {
    const sans = surPlusieursGraines(GRAINES, undefined, 5);
    const leLong = surPlusieursGraines(GRAINES, 0, 5);
    const enTravers = surPlusieursGraines(GRAINES, 1, 5);

    // Le tronc couché dans le sens de la pente ne détourne pas une goutte et ne
    // retient pas un gramme : le paillage qu'il fait sous lui est un AUTRE
    // mécanisme, sans orientation, et il est déjà compté ailleurs.
    expect(leLong.retenue).toBe(0);
    expect(leLong.piege).toBe(0);
    expect(enTravers.retenue).toBeGreaterThan(0);
    expect(enTravers.piege).toBeGreaterThan(0);

    // Deux effets DISTINCTS : moins d'eau court en surface, et moins de terre
    // quitte la parcelle. Le second est le plus net, comme sur le terrain.
    expect(enTravers.eau).toBeLessThan(sans.eau);
    expect(enTravers.terre).toBeLessThan(0.95 * leLong.terre);
    // ... et la même masse de bois posée dans l'autre sens ne fait ni l'un ni
    // l'autre : l'écart entre les deux bras EST l'effet de l'orientation.
    expect(leLong.eau).toBeGreaterThan(0.99 * sans.eau);
  });

  it("plus la crue est grosse, moins le barrage compte", () => {
    // Sans ce plafond, trois troncs empêcheraient une inondation. Robichaud et
    // al. (2008) ne trouvent aucun effet des barrages de bois au-delà d'une
    // pluie de temps de retour deux ans : le coin amont se remplit, et le reste
    // passe par-dessus.
    const gain = (bassinAmontHa: number) => {
      const sans = surPlusieursGraines(GRAINES, undefined, 3, bassinAmontHa);
      const avec = surPlusieursGraines(GRAINES, 1, 3, bassinAmontHa);
      return 1 - avec.terre / sans.terre;
    };
    const petit = gain(0.5);
    const gros = gain(12);
    expect(petit).toBeGreaterThan(0);
    expect(gros).toBeLessThan(petit / 2);
  });
});

describe("le barrage a une capacité, et elle s'épuise", () => {
  it("le coin amont se ferme quand la pente se redresse", () => {
    // Géométrie, pas réglage : le coin fait d/tanθ de long, donc il rétrécit
    // quand la pente monte, et au-delà d'une tangente de 4/π le tronc surplombe
    // son propre tas et ne retient plus rien (Adams et al. 2023, éq. 3).
    expect(volumeDuCoinM3ParM(10)).toBeGreaterThan(volumeDuCoinM3ParM(40));
    expect(volumeDuCoinM3ParM(140)).toBe(0);
    expect(volumeDuCoinM3ParM(0)).toBe(0);
  });

  it("un coin enseveli ne piège plus", () => {
    const pente = 20;
    const neuf = capaciteDuCoinM3M2(1, pente, 0);
    expect(neuf).toBeGreaterThan(0);
    // Le colluvium monte : à mi-tronc il reste la moitié de la place.
    expect(capaciteDuCoinM3M2(1, pente, 50 * DIAMETRE_TRONC_M)).toBeCloseTo(neuf / 2, 9);
    // Le dépôt atteint le haut du tronc : le tronc est enterré, il ne sert plus.
    expect(capaciteDuCoinM3M2(1, pente, 100 * DIAMETRE_TRONC_M)).toBe(0);
    expect(sedimentPiegeKgM2(1, 100, pente, 100 * DIAMETRE_TRONC_M, 1.3)).toBe(0);
  });

  it("un tronc plus court que la cellule laisse passer par ses bouts", () => {
    const plein = sedimentPiegeKgM2(1, 1, 20, 0, 1.3);
    const moitie = sedimentPiegeKgM2(0.5, 1, 20, 0, 1.3);
    expect(moitie).toBeGreaterThan(0);
    expect(moitie).toBeLessThan(plein);
  });
});

describe("le bois d'un peuplement qui vit et meurt", () => {
  it("ramasser le bois emporte le barrage avec la masse", () => {
    const state = avecTroncs(createGameState(STATION, rngStateFromSeed(2)), 1);
    const r = applyAction(state, {
      type: "ramasserBoisMort",
      week: 0,
      x: 15,
      y: RANGEE + 0.5,
      rayonM: 6,
    });
    const i = RANGEE * COTE + 15;
    expect(r.state.soil.boisAuSolCG[i]).toBe(0);
    expect(r.state.soil.boisEnTraversPart[i]).toBe(0);
  });

  it("un peuplement laissé à lui-même barre son propre versant", () => {
    // Scénario de jeu, et la conclusion est moyennée sur plusieurs graines : un
    // peuplement de versant à 15 % vit, meurt et se couche tout seul. Bras A :
    // le bois garde l'orientation qu'il a prise en tombant. Bras B : même bois,
    // même masse, même paillage, mais transversalité annulée — comme si tous
    // les troncs gisaient dans le sens de la pente. Seule l'orientation change.
    const station = {
      ...STATION,
      relief: { ...STATION.relief, pentePct: 15, bassinAmontHa: 0.4 },
      herbeInitiale: 0.2,
    };
    const bras = (graine: number, aPlat: boolean) => {
      let state = plantScattered(
        createGameState(station, rngStateFromSeed(graine)),
        "fagus_sylvatica",
        60,
      );
      state = plantScattered(state, "pinus_sylvestris", 60);
      let eau = 0;
      let piege = 0;
      let travers = 0;
      let n = 0;
      for (let i = 0; i < 60 * 52; i++) {
        if (aPlat) {
          const boisEnTraversPart = state.soil.boisEnTraversPart.map(() => 0);
          state = { ...state, soil: { ...state.soil, boisEnTraversPart } };
        }
        const r = tick(state, METEO[i % 52] as never);
        state = r.state;
        eau += r.fluxes.overflowMm + r.fluxes.ruissellementSortantMm;
        piege += r.fluxes.boisSedimentPiegeKgM2;
        if (i % 52 === 0) {
          let masse = 0;
          let t = 0;
          for (let k = 0; k < state.soil.boisAuSolCG.length; k++) {
            const b = state.soil.boisAuSolCG[k] ?? 0;
            masse += b;
            t += b * (state.soil.boisEnTraversPart[k] ?? 0);
          }
          if (masse > 0) {
            travers += t / masse;
            n++;
          }
        }
      }
      return { eau, piege, travers: n > 0 ? travers / n : 0 };
    };
    const graines = [3, 11, 29];
    const oriente = graines.map((g) => bras(g, false));
    const aPlat = graines.map((g) => bras(g, true));
    const moy = (r: typeof oriente, k: "eau" | "piege" | "travers") =>
      r.reduce((a, v) => a + v[k], 0) / r.length;

    // Sur une pente de 15 %, la chute reste largement désorientée. Mais le
    // chablis tombe avec ses branches et repose dessus : son efficacité
    // barrante réelle est le quart de sa transversalité (`CONTACT_CHABLIS_
    // BRANCHU`). Une forêt livrée à elle-même arme donc mal son versant — et
    // c'est bien pour ça que le geste d'abattre et de coucher existe.
    expect(moy(oriente, "travers")).toBeGreaterThan(0.08);
    // Il piège de la terre — sur place, derrière les troncs — là où le même
    // bois couché dans le sens de la pente n'en piège aucune. Le TONNAGE, lui,
    // dépend d'abord de ce que le versant a à donner : mesuré à 1,6 kg/m² sur
    // soixante ans avant que les vitesses de croissance ne soient calées sur
    // les tables, il tombe à 0,8 ensuite. Ce n'est pas le mécanisme qui a
    // faibli — c'est la forêt qui, poussant à son rythme réel, couvre plus vite
    // et laisse moins partir. Un piège ne retient que ce qui passe.
    //
    // Puis il a fallu le diviser encore par deux, pour une raison différente et
    // plus intéressante : le chablis tombe avec son houppier et repose dessus.
    // Une forêt livrée à elle-même arme mal son versant, et c'est précisément
    // pour ça que le geste d'abattre et de coucher en travers a un sens.
    expect(moy(oriente, "piege")).toBeGreaterThan(0.15);
    expect(moy(aPlat, "piege")).toBe(0);
    // Et il détourne une part nette de l'eau de surface vers le sol.
    expect(moy(oriente, "eau")).toBeLessThan(0.97 * moy(aPlat, "eau"));
  });
});

/**
 * Le geste que la science désigne, et que le joueur peut enfin faire.
 *
 * Le mécanisme de barrage existait sans qu'aucune action ne permette de
 * l'armer : couper un arbre, c'était le vendre, le broyer ou l'épandre — dans
 * les trois cas le fût quittait le sol. Or la restauration post-incendie ne
 * fait pas autre chose que d'abattre et de COUCHER EN TRAVERS.
 */
describe("abattre et laisser le tronc en travers", () => {
  function parcelleAvecArbres() {
    let state = createGameState(STATION, rngStateFromSeed(7));
    state = plantScattered(state, "pinus_sylvestris", 12, 8);
    return state;
  }

  it("le fût reste au sol, en travers, et rien ne rentre en caisse", () => {
    const avant = parcelleAvecArbres();
    const ids = avant.trees.map((t) => t.id);
    const { state, refusals } = applyAction(avant, {
      type: "couper",
      week: 10,
      treeIds: ids,
      devenir: "laisser",
    });
    expect(refusals).toHaveLength(0);
    const auSol = state.soil.boisAuSolCG.reduce((a, v) => a + v, 0);
    expect(auSol).toBeGreaterThan(0);
    // En travers du versant : c'est tout l'intérêt du geste.
    const masse = state.soil.boisAuSolCG.reduce((a, v) => a + v, 0);
    const travers =
      state.soil.boisAuSolCG.reduce(
        (a, v, i) => a + v * (state.soil.boisEnTraversPart[i] ?? 0),
        0,
      ) / masse;
    // 0,8 de contact × la pleine transversalité d'un tronc posé exprès en
    // travers : un fût calé barre presque tout ce qu'il peut barrer.
    expect(travers).toBeGreaterThan(0.75);
    // Ça ne rapporte rien, et ça coûte moins que d'aller chercher le bois.
    expect(state.economy.treasuryEur).toBe(avant.economy.treasuryEur);
    const vendu = applyAction(avant, {
      type: "couper",
      week: 10,
      treeIds: ids,
      devenir: "vendre",
    }).state;
    expect(vendu.economy.treasuryEur).toBeGreaterThan(state.economy.treasuryEur);
    expect(state.economy.hoursUsedWeek).toBeLessThan(vendu.economy.hoursUsedWeek);
  });

  it("le carbone du fût passe au sol, il n'en apparaît ni n'en disparaît", () => {
    const avant = parcelleAvecArbres();
    const stock = (s: GameState) =>
      livingCarbonKg(s.trees) +
      s.carbon.deadWoodKgC +
      s.soil.boisAuSolCG.reduce((a, v) => a + v, 0) / 1000;
    const { state } = applyAction(avant, {
      type: "couper",
      week: 10,
      treeIds: avant.trees.map((t) => t.id),
      devenir: "laisser",
    });
    // Rien n'est vendu ni brûlé : le total ne bouge pas d'un gramme.
    expect(stock(state)).toBeCloseTo(stock(avant), 6);
    expect(state.carbon.exportedEnergyCumKgC).toBe(avant.carbon.exportedEnergyCumKgC);
  });

  it("et ça arme vraiment le versant : moins de terre part", () => {
    // Le contrôle est le même arbre coupé et VENDU : même parcelle, mêmes
    // arbres en moins, seule différence le fût laissé ou emporté.
    const partieAvec = (devenir: "laisser" | "vendre") => {
      let state = parcelleAvecArbres();
      state = applyAction(state, {
        type: "couper",
        week: 0,
        treeIds: state.trees.map((t) => t.id),
        devenir,
      }).state;
      let terre = 0;
      for (let i = 0; i < 3 * 52; i++) {
        const r = tick(state, METEO[i % 52] as never);
        state = r.state;
        terre += r.fluxes.erosionSortieKgM2 ?? 0;
      }
      return terre;
    };
    expect(partieAvec("laisser")).toBeLessThan(partieAvec("vendre"));
  });
});
