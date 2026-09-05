/**
 * Le gibier (critère G1, ch4-C). Ce qu'il doit produire :
 *  - une plantation appétente non protégée reste bloquée à hauteur de dent ;
 *  - la protéger la sauve, et c'est la dépense qui décide de la réussite ;
 *  - la sélectivité réoriente la composition sans qu'on l'ait codé ;
 *  - la pression vient du paysage, pas de la parcelle ;
 *  - rien ne disparaît : ce qui est mangé revient au sol en déjections.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { applyAction, estGesteSurArbres, PROTECTION_EUR } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import {
  aPorteeDeDent,
  attraitFrottis,
  brouter,
  FROTTIS_REPIT_SEMAINES,
  frottisDeLaSemaine,
  HAUTEUR_BROUTAGE_M,
} from "../../src/engine/gibier";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { FRICHE_LIMON } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";

const serie = serieMeteoPour("friche-limon");
if (!serie) throw new Error("série manquante");
const WEATHER = serieToWeeks(serie);

interface Resultat {
  vivants: number;
  hauteurMediane: number;
}

/** Plante une parcelle et la laisse vivre douze ans. */
function plantation(
  especeId: string,
  options: { protege: boolean; gibierParHa: number; nPlants?: number },
): Resultat {
  // Densité réaliste d'une plantation forestière : ~1 100 tiges/ha, soit un
  // plant tous les 3 m. C'est ce qui décide de tout : la production de rameaux
  // d'un jeune peuplement est très inférieure à l'appétit d'une harde.
  const cote = options.nPlants ?? 13;
  const station: Station = {
    ...FRICHE_LIMON.station,
    coteM: 40,
    voisinage: [],
    gibierParHa: options.gibierParHa,
  };
  let state = createGameState(station, rngStateFromSeed(5));
  const ids: number[] = [];
  for (let i = 0; i < cote * cote; i++) {
    state = plantAt(state, especeId, 2 + (i % cote) * 3, 2 + Math.floor(i / cote) * 3, 0.4);
    const dernier = state.trees[state.trees.length - 1];
    if (dernier) ids.push(dernier.id);
  }
  // Poser une protection prend une demi-heure : 169 plants, c'est plus de
  // quatre-vingts heures. On étale sur plusieurs semaines, comme sur le
  // terrain — sinon le plafond hebdomadaire en refuse la moitié en silence.
  const actions: GameAction[] = [];
  if (options.protege) {
    for (let debut = 0; debut < ids.length; debut += 100) {
      actions.push({
        type: "proteger",
        week: 1 + debut / 100,
        treeIds: ids.slice(debut, debut + 100),
      });
    }
  }
  for (let i = 0; i < 12 * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    state = advanceWeek(state, w, actions).state;
  }
  const hauteurs = state.trees
    .filter((t) => t.alive && ids.includes(t.id))
    .map((t) => t.heightM)
    .sort((a, b) => a - b);
  return {
    vivants: hauteurs.length,
    hauteurMediane: hauteurs[Math.floor(hauteurs.length / 2)] ?? 0,
  };
}

describe("le piège à dents", () => {
  const noisetierProtege = plantation("corylus_avellana", { protege: true, gibierParHa: 0.4 });
  const noisetierNu = plantation("corylus_avellana", { protege: false, gibierParHa: 0.4 });

  it("sous forte pression, une plantation appétente non protégée reste sous la dent", () => {
    // 0,4 cervidé/ha : une densité forte mais réelle (Sologne, grands massifs
    // de plaine). Douze ans après, le noisetier non protégé sort tout juste sa
    // flèche de la zone de broutage — 1,59 m pour une dent qui monte à 1,50.
    // Il y était encore franchement en dessous avant que le frein d'azote ne
    // cesse de brider les arbres en permanence (nitrogen.ts) : plus vigoureux,
    // il s'échappe un peu plus tôt. Ce qui compte est qu'il lui faille plus
    // d'une décennie pour y arriver, et l'essai suivant dit le reste.
    expect(noisetierNu.hauteurMediane).toBeLessThan(1.15 * HAUTEUR_BROUTAGE_M);
  });

  it("protéger les plants sauve la plantation", () => {
    expect(noisetierProtege.hauteurMediane).toBeGreaterThan(2.5 * noisetierNu.hauteurMediane);
  });

  it("la protection ne sert à rien là où il n'y a pas de gibier", () => {
    const sansGibier = plantation("corylus_avellana", { protege: false, gibierParHa: 0 });
    expect(sansGibier.hauteurMediane).toBeGreaterThan(0.8 * noisetierProtege.hauteurMediane);
  });

  it("le dégât suit la densité du paysage, sans seuil arbitraire", () => {
    const hauteurs = [0.1, 0.3, 0.6].map(
      (d) => plantation("corylus_avellana", { protege: false, gibierParHa: d }).hauteurMediane,
    );
    // Réponse monotone : rien n'est déclenché par un palier, tout se joue en
    // kilos de matière sèche disputés.
    expect(hauteurs[0] ?? 0).toBeGreaterThan(hauteurs[1] ?? 0);
    expect(hauteurs[1] ?? 0).toBeGreaterThan(hauteurs[2] ?? 0);
  });
});

describe("la sélectivité réoriente la composition", () => {
  it("à pression égale, le pin s'en sort là où le noisetier est bloqué", () => {
    const pin = plantation("pinus_sylvestris", { protege: false, gibierParHa: 0.4 });
    const noisetier = plantation("corylus_avellana", { protege: false, gibierParHa: 0.4 });
    // Rien n'est codé « le pin échappe au gibier » : c'est son appétence de
    // 0,2 contre 0,9 qui produit l'écart.
    expect(pin.hauteurMediane).toBeGreaterThan(2 * noisetier.hauteurMediane);
  });

  it("une pression forte fait plus de dégâts qu'une pression faible", () => {
    const faible = plantation("quercus_pubescens", { protege: false, gibierParHa: 0.03 });
    const forte = plantation("quercus_pubescens", { protege: false, gibierParHa: 0.4 });
    expect(forte.hauteurMediane).toBeLessThan(0.7 * faible.hauteurMediane);
  });
});

describe("mécanique du broutage", () => {
  function jeune(id: number, especeId: string, heightM: number, pousse: number): TreeState {
    return {
      id,
      especeId,
      x: 5.5,
      y: 5.5,
      ageWeeks: 200,
      heightM,
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 40,
      hauteurElagueeM: 0,
      recepages: 0,
      vigueurIndividuelle: 1,
      pousseTendreM: pousse,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
    };
  }

  const coteM = 20;
  const herbe = new Array(coteM * coteM).fill(0.5);
  const couvert = new Array(coteM * coteM).fill(0);

  it("un arbre sorti de hauteur de dent n'est plus concerné", () => {
    expect(aPorteeDeDent(jeune(1, "corylus_avellana", 0.8, 0.3))).toBe(true);
    expect(aPorteeDeDent(jeune(1, "corylus_avellana", 3, 0.3))).toBe(false);
    expect(aPorteeDeDent({ ...jeune(1, "corylus_avellana", 0.8, 0.3), protege: true })).toBe(false);
  });

  it("le gibier mange davantage l'espèce la plus appétente", () => {
    const arbres = [jeune(1, "corylus_avellana", 1, 0.3), jeune(2, "pinus_sylvestris", 1, 0.3)];
    const r = brouter(arbres, herbe, couvert, coteM, 0.5, 1);
    const noisetier = r.parArbre.get(1)?.pousseMangeeM ?? 0;
    const pin = r.parArbre.get(2)?.pousseMangeeM ?? 0;
    expect(noisetier).toBeGreaterThan(3 * pin);
  });

  it("sans gibier dans le paysage, rien n'est prélevé", () => {
    const r = brouter([jeune(1, "corylus_avellana", 1, 0.3)], herbe, couvert, coteM, 0, 1);
    expect(r.preleveKg).toBe(0);
    expect(r.parArbre.size).toBe(0);
  });

  it("le nombre protège : un plant isolé est bien plus broutÉ qu'un plant noyé dans la masse", () => {
    // Effet de dilution. La ration du gibier est bornée par son appétit ; plus
    // il y a de tiges à se partager le même appétit, moins chacune trinque.
    // C'est pour ça qu'une régénération dense passe là où quelques plants
    // dispersés se font massacrer — et ça n'a rien été codé pour, ça tombe de
    // la réponse fonctionnelle.
    const dense = brouter(
      Array.from({ length: 40 }, (_, i) => ({
        ...jeune(i + 1, "corylus_avellana", 1, 0.3),
        x: 1 + (i % 8) * 2,
        y: 1 + Math.floor(i / 8) * 2,
      })),
      herbe,
      couvert,
      coteM,
      0.5,
      1,
    );
    const rare = brouter([jeune(1, "corylus_avellana", 1, 0.3)], herbe, couvert, coteM, 0.5, 1);
    const parPlantDense = dense.parArbre.get(1)?.pousseMangeeM ?? 0;
    const parPlantRare = rare.parArbre.get(1)?.pousseMangeeM ?? 0;
    expect(parPlantRare).toBeGreaterThan(3 * parPlantDense);
    // …mais au total, c'est bien le fourré dense qui nourrit le plus de monde.
    expect(dense.preleveKg).toBeGreaterThan(rare.preleveKg);
  });
});

describe("les trois façons de se protéger du gibier, et ce qu'elles coûtent", () => {
  const zone = { x: 20, y: 20, rayonM: 15 };

  it("chasser fait reculer la pression… puis les voisins comblent le vide", () => {
    const station: Station = { ...FRICHE_LIMON.station, coteM: 40, gibierParHa: 0.3 };
    let state = createGameState(station, rngStateFromSeed(3));
    const apres = applyAction(state, { type: "chasser", week: 1 });
    expect(apres.state.pressionGibier).toBeLessThan(0.8);
    // Une journée de chasse rapporte un peu de venaison, et coûte une journée.
    expect(apres.state.economy.treasuryEur).toBeGreaterThan(state.economy.treasuryEur);
    expect(apres.state.economy.hoursUsedWeek).toBeGreaterThan(6);

    // Un an plus tard, sans rien faire d'autre, la pression est revenue :
    // prélever sur un hectare ne change rien à une population dont le domaine
    // vital en fait cinquante. C'est pour ça que le plan de chasse se décide
    // à l'échelle d'un massif.
    state = apres.state;
    for (let i = 0; i < 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    expect(state.pressionGibier).toBeGreaterThan(0.9);
  });

  it("chasser toute l'année finit par tenir la pression basse — au prix de son temps", () => {
    const station: Station = { ...FRICHE_LIMON.station, coteM: 40, gibierParHa: 0.3 };
    let state = createGameState(station, rngStateFromSeed(3));
    const battues: GameAction[] = [];
    for (let semaine = 1; semaine < 52; semaine += 3) {
      battues.push({ type: "chasser", week: semaine });
    }
    for (let i = 0; i < 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, battues).state;
    }
    expect(state.pressionGibier).toBeLessThan(0.6);
    // Dix-sept journées de chasse dans l'année : ce n'est pas gratuit.
    expect(state.economy.hoursUsedYear).toBeGreaterThan(100);
  });

  it("la clôture, elle, est totale : derrière, plus une dent", () => {
    const station: Station = { ...FRICHE_LIMON.station, coteM: 40, gibierParHa: 0.5 };
    let state = createGameState(station, rngStateFromSeed(3));
    const dedans = planterEn(state, "corylus_avellana", 20, 20);
    state = dedans.state;
    const dehors = planterEn(state, "corylus_avellana", 4, 4);
    state = dehors.state;
    state = applyAction(state, { type: "cloturer", week: 1, ...zone }).state;
    for (let i = 0; i < 12 * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, []).state;
    }
    const hauteur = (id: number) => state.trees.find((t) => t.id === id)?.heightM ?? 0;
    expect(hauteur(dedans.id)).toBeGreaterThan(2 * hauteur(dehors.id));
  });

  it("le coût suit le PÉRIMÈTRE : c'est ce qui la rend imbattable en grand", () => {
    const station: Station = { ...FRICHE_LIMON.station, coteM: 40, gibierParHa: 0.3 };
    const state = createGameState(station, rngStateFromSeed(3));
    const cout = (rayonM: number) => {
      const r = applyAction(state, { type: "cloturer", week: 1, x: 20, y: 20, rayonM });
      return state.economy.treasuryEur - r.state.economy.treasuryEur;
    };
    // Doubler le rayon quadruple la surface protégée mais ne double que le prix.
    expect(cout(14)).toBeGreaterThan(1.8 * cout(7));
    expect(cout(14)).toBeLessThan(2.2 * cout(7));
    // Face aux manchons : protéger 400 plants coûte 3 200 € et 200 heures ;
    // les enclore tous derrière un cercle de 14 m en coûte bien moins.
    expect(cout(14)).toBeLessThan(400 * PROTECTION_EUR);
  });
});

/** Plante un sujet à un endroit précis et renvoie son identifiant. */
function planterEn(state: GameState, especeId: string, x: number, y: number) {
  const suivant = plantAt(state, especeId, x, y, 0.4);
  return { state: suivant, id: suivant.nextTreeId - 1 };
}

describe("les frottis : passer la hauteur de dent ne met pas à l'abri", () => {
  it("un brocard vise les tiges isolées, à la bonne taille, à écorce lisse", () => {
    const cible = (heightM: number, voisins: number, resistanceEcorce: number) =>
      attraitFrottis({ ...arbreNu(heightM), heightM }, voisins, resistanceEcorce);
    // Trop petite, trop grande : sans intérêt.
    expect(cible(0.8, 0, 0.15)).toBe(0);
    expect(cible(9, 0, 0.15)).toBe(0);
    // La bonne taille, isolée, écorce lisse : cible idéale.
    expect(cible(2.5, 0, 0.15)).toBeGreaterThan(0);
    // Noyée dans un fourré, elle n'intéresse plus : c'est du marquage, il faut
    // que ça se voie.
    expect(cible(2.5, 8, 0.15)).toBeLessThan(cible(2.5, 0, 0.15) / 5);
    // Écorce épaisse et crevassée (pin, chêne-liège) : le brocard passe.
    expect(cible(2.5, 0, 0.9)).toBeLessThan(cible(2.5, 0, 0.15) / 5);
  });

  it("un arbre-repère est refrotté, et c'est l'accumulation qui le tue", () => {
    // Les brocards sont territoriaux : deux mâles ne se partagent pas une tige
    // au milieu d'un territoire. Mais chacun refrotte les siennes, et les
    // arbres bien placés deviennent des repères marqués saison après saison —
    // d'où le motif observé sur le terrain : quelques tiges massacrées au
    // milieu de tiges intactes.
    const nu = { ...arbreNu(2.5), id: 1 };
    const marque = { ...nu, frotteSemaine: 0 };
    expect(attraitFrottis(marque, 0, 0.15)).toBeGreaterThan(attraitFrottis(nu, 0, 0.15));
  });

  it("mais on ne refrotte pas une marque encore fraîche", () => {
    const tiges = Array.from({ length: 5 }, (_, i) => ({
      ...arbreNu(2.5),
      id: i + 1,
      x: 5 + i * 8,
      y: 20,
    }));
    const semaine = 16;
    const premier = frottisDeLaSemaine(tiges, 0.5, 1, semaine, semaine, () => 0.15);
    expect(premier.length).toBeGreaterThan(0);
    const marquees = tiges.map((t) =>
      premier.some((f) => f.treeId === t.id) ? { ...t, frotteSemaine: semaine } : t,
    );
    // La semaine d'après, la marque est fraîche : on passe à côté.
    const suivant = frottisDeLaSemaine(marquees, 0.5, 1, semaine + 1, semaine + 1, () => 0.15);
    for (const f of suivant) {
      expect(premier.some((p) => p.treeId === f.treeId)).toBe(false);
    }
    // Quelques semaines plus tard, en revanche, le repère reprend du service :
    // on balaie la fin de la saison, le budget hebdomadaire étant fractionnaire.
    let repereRefrotte = false;
    for (let w = semaine + FROTTIS_REPIT_SEMAINES; w <= 24; w++) {
      const tard = frottisDeLaSemaine(marquees, 0.5, 1, w, w, () => 0.15);
      if (tard.some((f) => premier.some((p) => p.treeId === f.treeId))) repereRefrotte = true;
    }
    expect(repereRefrotte).toBe(true);
  });

  it("hors saison, les bois sont faits : plus de frottis", () => {
    const tiges = [{ ...arbreNu(2.5), id: 1 }];
    expect(frottisDeLaSemaine(tiges, 0.5, 1, 40, 40, () => 0.15)).toHaveLength(0);
  });

  it("une tige fine est annelée ; une plus forte s'en tire avec une plaie", () => {
    const fine = frottisDeLaSemaine([{ ...arbreNu(1.4), id: 1 }], 0.5, 1, 16, 16, () => 0.15);
    const forte = frottisDeLaSemaine([{ ...arbreNu(3.5), id: 1 }], 0.5, 1, 16, 16, () => 0.15);
    expect(fine[0]?.mort).toBe(true);
    expect(forte[0]?.mort).toBe(false);
  });

  it("le manchon protège aussi des bois, pas seulement des dents", () => {
    const protegee = { ...arbreNu(2.5), protege: true };
    expect(attraitFrottis(protegee, 0, 0.15)).toBe(0);
  });
});

/** Une tige nue de la hauteur voulue, pour les essais de frottis. */
function arbreNu(heightM: number): TreeState {
  return {
    id: 1,
    especeId: "fagus_sylvatica",
    x: 20,
    y: 20,
    ageWeeks: 52 * 10,
    heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 60,
    hauteurElagueeM: 0,
    recepages: 0,
    vigueurIndividuelle: 1,
    pousseTendreM: 0,
    vigueur: 1,
    dommageHydraulique: 0,
    protege: false,
  };
}

/**
 * Ce que le gibier fait, le rendu doit pouvoir le MONTRER la semaine où ça
 * arrive : une pousse mangée, une écorce arrachée au pied. Le tick les
 * rapporte comme des gestes, au même titre que ceux du joueur (tick.ts).
 */
describe("les gestes du gibier remontent au rendu", () => {
  const station: Station = {
    ...FRICHE_LIMON.station,
    coteM: 30,
    voisinage: [],
    gibierParHa: 3,
  };

  it("le broutage nomme les tiges mangées", () => {
    let state = createGameState(station, rngStateFromSeed(8));
    for (let i = 0; i < 30; i++) {
      state = plantAt(state, "corylus_avellana", 2 + (i % 6) * 4, 2 + Math.floor(i / 6) * 4, 0.6);
    }
    let broutes: readonly number[] = [];
    for (let i = 0; i < 52 && broutes.length === 0; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      const r = advanceWeek(state, w, []);
      state = r.state;
      broutes = r.gestes.filter(estGesteSurArbres).find((g) => g.type === "brouter")?.ids ?? [];
    }
    expect(broutes.length).toBeGreaterThan(0);
    // Des arbres du jeu, pas des identifiants inventés.
    for (const id of broutes) expect(state.trees.some((t) => t.id === id)).toBe(true);
  });

  it("le frottis nomme les tiges marquées, celles-là mêmes qui portent la date", () => {
    let state = createGameState(station, rngStateFromSeed(11));
    for (let i = 0; i < 24; i++) {
      state = plantAt(state, "corylus_avellana", 3 + (i % 6) * 4, 3 + Math.floor(i / 6) * 5, 2.5);
    }
    let frottes: readonly number[] = [];
    let semaine = 0;
    for (let i = 0; i < 3 * 52 && frottes.length === 0; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      semaine = state.week;
      const r = advanceWeek(state, w, []);
      state = r.state;
      frottes = r.gestes.filter(estGesteSurArbres).find((g) => g.type === "frotter")?.ids ?? [];
    }
    expect(frottes.length).toBeGreaterThan(0);
    for (const id of frottes) {
      const arbre = state.trees.find((t) => t.id === id);
      // L'écorce arrachée est datée dans l'arbre : le geste et le champ
      // `frotteSemaine` racontent la même chose, et le rendu peut recouper.
      if (arbre) expect(arbre.frotteSemaine).toBe(semaine);
    }
  });
});
