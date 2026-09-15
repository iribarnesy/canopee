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
  PENTE_ORIENTANT_LA_CHUTE_PCT,
  SANS_VENT_AU_SOL,
  sedimentPiegeKgM2,
  transversalite,
  VENT_ORIENTANT_LA_CHUTE_MS,
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
    //
    // Ce test est long — deux bras, soixante ans, deux graines — et ce n'est
    // pas du gras. Mesuré avant de raccourcir quoi que ce soit :
    //
    //  - SOIXANTE ANS sont nécessaires. À quarante, `piege` vaut 0,068 pour un
    //    seuil à 0,15 et le rapport d'eau 0,9835 pour un seuil à 0,97 : deux
    //    assertions sur trois échouent. Le bois doit pousser, mourir, tomber,
    //    et seulement alors barrer. Raccourcir ne l'allégerait pas, ça le
    //    falsifierait.
    //  - LA PARCELLE aussi porte le phénomène. À trente mètres de côté, le
    //    rapport d'eau vaut 0,957 ; à vingt, il remonte à 0,984 et l'assertion
    //    tombe — une pente plus courte accumule moins de ruissellement, donc un
    //    barrage y compte moins. À vingt-quatre, il ne reste que 0,0005 de
    //    marge : plus rapide, mais fragile, ce qui est pire que lent.
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
    // DEUX graines, pas trois. Chacune passe déjà seule (transversalité 0,11 à
    // 0,17 pour un seuil à 0,08 ; eau 0,949 à 0,968 pour un seuil à 0,97), et
    // la moyenne sert à amortir la plus juste des trois. Passer de trois à deux
    // coûte 27 % de temps en moins sans rogner une marge : 0,1404 / 0,3279 /
    // 0,9586 contre 0,1450 / 0,3113 / 0,9574 à trois. C'est la SEULE dimension
    // de ce scénario qui ne porte pas le phénomène — voir plus bas.
    const graines = [3, 11];
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
    //
    // Et il a fallu l'abaisser une TROISIÈME fois, pour la raison la plus
    // franche des trois : le volume de bois était faux. Le moteur faisait peser
    // à ses arbres jusqu'à neuf fois un cylindre plein de leur propre diamètre
    // (#62), donc le tonnage qui tombait au sol et piégeait la terre était
    // gonflé d'autant. Mesuré après correction : 0,135. Le mécanisme n'a pas
    // bougé d'un cheveu — c'est la masse qui redevient celle d'un vrai arbre.
    //
    // Et une QUATRIÈME fois, pour la raison que ce commentaire annonçait :
    // « un piège ne retient que ce qui passe ». La strate herbacée par espèces
    // change ce qui passe — la couverture moyenne de ce versant tombe de 0,661
    // à 0,641 sur soixante ans, mais elle se répartit autrement dans l'année,
    // et il descend 0,093 au lieu de 0,135. Ce qui ne bouge pas, et c'est
    // l'objet du test : à plat, le même bois ne piège RIEN.
    expect(moy(oriente, "piege")).toBeGreaterThan(0.08);
    expect(moy(aPlat, "piege")).toBe(0);
    // Et il détourne une part de l'eau de surface vers le sol — une part
    // MINCE, et c'est le résultat, pas un aveu de faiblesse.
    //
    // Ce seuil exigeait 3 % quand le moteur faisait peser à ses arbres jusqu'à
    // neuf fois leur propre cylindre (#62). À masse corrigée, la part tombe à
    // 0,64 % : moins de bois au sol barre moins d'eau, exactement en
    // proportion. Le SENS est intact sur les deux graines.
    //
    // Et cette petitesse dit la même chose que les deux lignes du dessus : une
    // forêt livrée à elle-même arme mal son versant. C'est la prémisse même du
    // geste d'abattre et de coucher en travers, que cet essai existe pour
    // justifier. La marge est fine, mais le moteur est déterministe à graine
    // fixée : ce 0,9936 est reproductible, pas un tirage heureux.
    expect(moy(oriente, "eau")).toBeLessThan(0.995 * moy(aPlat, "eau"));
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

/**
 * Le VENT oriente la chute autant que la pente (`directionDeChute`).
 *
 * **Ce que ces essais gardent : que les deux tendances se COMPOSENT.** Un
 * versant dont l'aval regarde le vent dominant doit coucher ses troncs en
 * faisceau ; un versant qui lui tourne le dos doit les coucher dans tous les
 * sens. C'est cette différence-là qui se voit sur la carte du bois mort, et
 * c'est elle qui décide si l'eau trouve des barrages ou une gouttière.
 */
describe("le vent couche les chandelles dans son sens", () => {
  const dims = { widthM: COTE, heightM: COTE };
  const plat = Array.from({ length: COTE * COTE }, () => 0);
  const pente = (pentePct: number) =>
    Array.from({ length: COTE * COTE }, (_, i) => (Math.floor(i / COTE) * pentePct) / 100);

  /**
   * Direction MOYENNE et concentration d'un paquet de chutes.
   *
   * Une moyenne d'angles ne se calcule pas comme une moyenne de nombres — la
   * moyenne de 359° et 1° vaut 180°, soit l'exact opposé. On somme donc les
   * vecteurs unitaires : l'argument de la résultante est la direction moyenne,
   * et sa LONGUEUR (∈ [0,1]) dit à quel point le paquet est concentré. C'est la
   * statistique circulaire ordinaire, et c'est la seule qui ait un sens ici.
   */
  const paquet = (
    alt: readonly number[],
    vent?: { versRad: number; recuMs: number },
  ): { moyenneRad: number; concentration: number } => {
    let sx = 0;
    let sy = 0;
    const n = 600;
    for (let k = 0; k < n; k++) {
      const d = directionDeChute(alt, dims, 15, 15, graineDeChute(k, 7), vent);
      sx += Math.cos(d);
      sy += Math.sin(d);
    }
    return { moyenneRad: Math.atan2(sy, sx), concentration: Math.hypot(sx, sy) / n };
  };

  /** Écart angulaire entre deux caps, ∈ [0, π]. */
  const ecart = (a: number, b: number) =>
    Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

  it("ne change RIEN quand on ne lui donne pas de vent", () => {
    // Le vent est optionnel et vaut zéro par défaut : une partie d'avant doit
    // tomber exactement comme avant, sans quoi l'ajout serait une
    // recalibration déguisée de tout le dépôt de bois mort.
    for (let k = 0; k < 50; k++) {
      const graine = graineDeChute(k, 3);
      expect(directionDeChute(pente(30), dims, 15, 15, graine)).toBe(
        directionDeChute(pente(30), dims, 15, 15, graine, SANS_VENT_AU_SOL),
      );
    }
  });

  it("couche les troncs SOUS LE VENT sur un terrain plat", () => {
    // À plat, la pente ne dit rien : le vent est la seule tendance, et la
    // direction moyenne doit être la sienne.
    const versRad = 1.1;
    const p = paquet(plat, { versRad, recuMs: VENT_ORIENTANT_LA_CHUTE_MS });
    expect(ecart(p.moyenneRad, versRad)).toBeLessThan(0.25);
    // et ça CONCENTRE, là où le temps calme ne concentre rien
    expect(p.concentration).toBeGreaterThan(paquet(plat).concentration + 0.3);
  });

  it("laisse le hasard décider par temps calme à plat", () => {
    // Aucune tendance : la chute est isotrope, et la résultante d'un paquet
    // d'angles pris au hasard est proche de zéro.
    expect(paquet(plat).concentration).toBeLessThan(0.15);
  });

  it("RESSERRE quand la pente et le vent s'accordent", () => {
    // Le cas intéressant : deux tendances de même sens contraignent plus que
    // chacune séparément.
    const alt = pente(30);
    const aval = versLAval(alt, dims, 15, 15).radians;
    const seule = paquet(alt).concentration;
    const ensemble = paquet(alt, {
      versRad: aval,
      recuMs: VENT_ORIENTANT_LA_CHUTE_MS,
    }).concentration;
    expect(ensemble).toBeGreaterThan(seule);
  });

  it("REND LA MAIN au hasard quand elles s'opposent", () => {
    // Un versant qui tourne le dos au vent dominant couche ses troncs dans tous
    // les sens — et c'est là que l'eau trouve des barrages.
    const alt = pente(30);
    const aval = versLAval(alt, dims, 15, 15).radians;
    const contre = paquet(alt, {
      versRad: aval + Math.PI,
      recuMs: (VENT_ORIENTANT_LA_CHUTE_MS * 30) / PENTE_ORIENTANT_LA_CHUTE_PCT,
    });
    // les deux poids sont égaux et opposés : la résultante s'annule
    expect(contre.concentration).toBeLessThan(0.15);
  });

  it("garde TOUJOURS sa part de hasard, même quand tout pousse dans le même sens", () => {
    // La littérature que le module cite l'impose : Rentch et al. concluent que
    // la forte variation des directions de chute empêche d'établir une relation
    // constante avec la pente OU le vent. Un faisceau parfait serait un
    // artefact de forme, comme l'alignement au cordeau que la dispersion
    // résiduelle a déjà corrigé une fois.
    const alt = pente(80);
    const aval = versLAval(alt, dims, 15, 15).radians;
    const p = paquet(alt, { versRad: aval, recuMs: 30 });
    expect(p.concentration).toBeLessThan(0.95);
  });
});
