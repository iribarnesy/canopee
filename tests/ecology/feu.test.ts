/**
 * Le feu (critère F10, ch5 « concevoir contre le FEU »).
 * Ce qu'il doit produire :
 *  - il ne part que si saison, sécheresse et combustible s'alignent ;
 *  - il ne franchit pas une coupure sans combustible ;
 *  - il trie les espèces : le liège traverse ce qui carbonise le pin ;
 *  - les pyrophytes repartent de souche ;
 *  - il renvoie d'un coup le carbone accumulé.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { livingCarbonKg, treeTotalCarbonKg } from "../../src/engine/carbon";
import { getEspece } from "../../src/engine/especes";
import {
  chargeCombustible,
  departDeFeu,
  indiceRisqueFeu,
  portanceDuFeu,
  propager,
  rangsDuFront,
  survitAuFeu,
} from "../../src/engine/feu";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { frequentationHumaine, getPaysage } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import type { TreeState } from "../../src/engine/trees";

const serie = serieMeteoPour("lande-seche");
if (!serie) throw new Error("série manquante");
const WEATHER = serieToWeeks(serie);

function arbre(especeId: string, heightM: number): TreeState {
  return {
    id: 1,
    especeId,
    x: 5,
    y: 5,
    ageWeeks: 52 * 20,
    heightM,
    stress: 0,
    alive: true,
    uptakeYearG: 0,
    fruitsKg: 0,
    fruitProgress: 0,
    bloomFrosted: false,
    rootDepthCm: 60,
    hauteurElagueeM: 0,
    pousseTendreM: 0,
    vigueur: 1,
    dommageHydraulique: 0,
    protege: false,
    recepages: 0,
    vigueurIndividuelle: 1,
  };
}

describe("départ de feu : il faut que tout s'aligne", () => {
  const charge = { parCellule: new Array(100).fill(1), moyenne: 1 };
  const rng = rngStateFromSeed(1);
  const CANICULE = 32;

  it("rien ne part en hiver, même sur un terrain sec et chargé", () => {
    expect(departDeFeu(rng, 5, 0.05, CANICULE, charge, 0.8, 10).origine).toBeUndefined();
    expect(departDeFeu(rng, 48, 0.05, CANICULE, charge, 0.8, 10).origine).toBeUndefined();
  });

  it("rien ne part si le sol est humide", () => {
    expect(departDeFeu(rng, 30, 0.8, CANICULE, charge, 0.8, 10).origine).toBeUndefined();
  });

  it("rien ne part s'il n'y a pas de combustible", () => {
    const vide = { parCellule: new Array(100).fill(0), moyenne: 0 };
    expect(departDeFeu(rng, 30, 0.05, CANICULE, vide, 0.8, 10).origine).toBeUndefined();
  });

  it("rien ne part par temps frais, même sur sol sec", () => {
    expect(departDeFeu(rng, 30, 0.05, 18, charge, 0.8, 10).origine).toBeUndefined();
  });
});

describe("le risque de feu émerge des conditions, il n'est pas décrété", () => {
  it("aucune station n'est marquée « à feu » : seul le climat décide", () => {
    // Mêmes combustible et vent : c'est la chaleur et la sécheresse qui font
    // basculer le risque — c'est ainsi que le réchauffement le fera remonter
    // vers le nord (ch8).
    const frais = indiceRisqueFeu(0.5, 20, 1, 0.5);
    const chaudEtSec = indiceRisqueFeu(0.02, 36, 1, 0.5);
    expect(frais).toBe(0);
    expect(chaudEtSec).toBeGreaterThan(0.3);
    expect(chaudEtSec).toBeLessThanOrEqual(1);
  });

  it("à conditions égales, le vent aggrave le risque", () => {
    expect(indiceRisqueFeu(0.05, 32, 1, 1)).toBeGreaterThan(indiceRisqueFeu(0.05, 32, 1, 0));
  });

  it("un été qui se réchauffe de 6 °C fait apparaître un risque là où il n'y en avait pas", () => {
    // Mêmes sol et végétation ; seule la température de l'été change.
    const aujourdhui = indiceRisqueFeu(0.08, 23, 0.8, 0.4);
    const rechauffe = indiceRisqueFeu(0.08, 29, 0.8, 0.4);
    expect(aujourdhui).toBe(0);
    expect(rechauffe).toBeGreaterThan(0);
  });
});

describe("propagation : une coupure arrête le feu", () => {
  it("le feu ne franchit pas une bande sans combustible", () => {
    const cote = 11;
    const parCellule = new Array(cote * cote).fill(1);
    // Colonne centrale rase (fauchée) : le feu ne doit pas passer à droite.
    for (let y = 0; y < cote; y++) parCellule[y * cote + 5] = 0;
    const { brulees } = propager(0, { parCellule, moyenne: 1 }, cote, rngStateFromSeed(2));
    const droite = [...brulees].filter((i) => i % cote > 5);
    expect(brulees.size).toBeGreaterThan(30);
    expect(droite).toHaveLength(0);
  });

  it("le front s'essouffle dans ce qui brûle mal, fonce dans ce qui brûle bien", () => {
    const cote = 21;
    const faible = propager(
      0,
      { parCellule: new Array(cote * cote).fill(0.35), moyenne: 0.35 },
      cote,
      rngStateFromSeed(9),
    );
    const fort = propager(
      0,
      { parCellule: new Array(cote * cote).fill(1), moyenne: 1 },
      cote,
      rngStateFromSeed(9),
    );
    expect(faible.brulees.size).toBeLessThan(0.5 * fort.brulees.size);
  });

  it("sans coupure, il parcourt tout le terrain", () => {
    const cote = 11;
    const { brulees } = propager(
      0,
      { parCellule: new Array(cote * cote).fill(1), moyenne: 1 },
      cote,
      rngStateFromSeed(2),
    );
    expect(brulees.size).toBe(cote * cote);
  });
});

describe("le rejet de souche ne crée ni ne détruit de carbone", () => {
  it("ce qui part en fumée est l'aérien MOINS le rejet resté debout", () => {
    // Un ajonc qui repart de souche garde 40 cm sur pied. Les imputer à la
    // fumée émettait un carbone que l'arbre porte encore ; et comme son
    // carbone racinaire se déduit de sa hauteur, le rabattre en faisait
    // disparaître par ailleurs. Les deux erreurs se compensaient à moitié,
    // donc aucune des deux ne se voyait.
    const station: Station = { ...LANDE_SECHE.station, coteM: 30, voisinage: [] };
    let state = createGameState(station, rngStateFromSeed(2));
    for (let i = 0; i < 36; i++) {
      state = plantAt(state, "ulex_europaeus", 2 + (i % 6) * 5, 2 + Math.floor(i / 6) * 5, 1.2);
    }
    /**
     * Stocks + tout ce qui est sorti du système. La litière et l'humus en font
     * partie : un feu les convertit en fumée, donc les omettre ferait voir une
     * création de carbone là où il n'y a qu'un transfert.
     */
    /**
     * Le grand livre complet, à la semaine. Trois termes s'y invitent qu'on
     * oublie facilement, et chacun ferait voir une fausse fuite : la litière
     * et l'humus, qu'un feu convertit en fumée ; le bois couché ; et le bois
     * des arbres TUÉS mais pas encore enregistrés morts — un arbre brûlé
     * reste debout et récupérable un an, son carbone quitte le stock vivant à
     * l'instant du feu et ne rejoint le pool des morts qu'à l'enregistrement.
     */
    const bilan = (s: typeof state) => {
      let solG = 0;
      for (let k = 0; k < s.soil.boisAuSolCG.length; k++) {
        solG += (s.soil.boisAuSolCG[k] ?? 0) + (s.soil.litterCG[k] ?? 0) + (s.soil.humusCG[k] ?? 0);
      }
      let enSuspensKgC = 0;
      for (const t of s.trees) {
        if (!t.alive && t.mortSemaine === undefined) {
          enSuspensKgC += treeTotalCarbonKg(getEspece(t.especeId), t.heightM);
        }
      }
      return (
        livingCarbonKg(s.trees) +
        enSuspensKgC +
        s.carbon.deadWoodKgC +
        solG / 1000 +
        s.carbon.exportedEnergyCumKgC +
        s.carbon.oeuvreCumKgC +
        s.carbon.emittedCumKgC
      );
    };
    let rejets = 0;
    for (let i = 0; i < 15 * 52 && rejets === 0; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      const avant = bilan(state);
      const entreesAvant = state.carbon.nppCumKgC + state.carbon.importedPlantsCumKgC;
      const r = advanceWeek(state, w, []);
      state = r.state;
      if (!r.incendie || r.incendie.rejets === 0) continue;
      rejets = r.incendie.rejets;
      const entrees = state.carbon.nppCumKgC + state.carbon.importedPlantsCumKgC - entreesAvant;
      // Égalité, donc : ni création ni fuite. C'est ce qui rend le test
      // capable d'attraper les DEUX erreurs, qui se compensaient à moitié —
      // l'aérien du rejet imputé deux fois d'un côté, ses racines évaporées
      // de l'autre.
      expect(bilan(state) - avant).toBeCloseTo(entrees, 3);
    }
    // Le décor doit vraiment produire des rejets, sinon le test ne prouve rien.
    expect(rejets).toBeGreaterThan(300);
  });
});

describe("le front du feu : où il est passé, et dans quel ordre", () => {
  it("le rang, c'est la distance à l'origine à travers ce qui a brûlé", () => {
    const cote = 11;
    const parCellule = new Array(cote * cote).fill(1);
    const origine = 5 * cote + 5;
    const { brulees } = propager(origine, { parCellule, moyenne: 1 }, cote, rngStateFromSeed(2));
    const rangs = rangsDuFront(brulees, origine, cote);
    // Tout l'ensemble brûlé est atteint : le feu ne saute pas.
    expect(rangs.size).toBe(brulees.size);
    expect(rangs.get(origine)).toBe(0);
    // Distance de Manhattan, puisqu'on avance de proche en proche en croix.
    for (const [cellule, rang] of rangs) {
      const dx = Math.abs((cellule % cote) - 5);
      const dy = Math.abs(Math.floor(cellule / cote) - 5);
      expect(rang).toBe(dx + dy);
    }
  });

  it("contourne la coupure : derrière l'obstacle, le front arrive plus tard", () => {
    const cote = 11;
    const parCellule = new Array(cote * cote).fill(1);
    // Un mur rase sauf une porte, en bas : le feu doit faire le tour.
    for (let y = 0; y < cote - 1; y++) parCellule[y * cote + 5] = 0;
    const { brulees } = propager(0, { parCellule, moyenne: 1 }, cote, rngStateFromSeed(3));
    const rangs = rangsDuFront(brulees, 0, cote);
    const derriere = rangs.get(5 + 1); // juste à droite du mur, en haut
    expect(derriere).toBeDefined();
    // À vol d'oiseau six cellules ; par la porte du bas, bien davantage.
    expect(derriere ?? 0).toBeGreaterThan(6);
  });

  it("ne consomme aucun tirage : le déterminisme du feu est intact", () => {
    const cote = 11;
    const charge = { parCellule: new Array(cote * cote).fill(0.5), moyenne: 0.5 };
    const avant = propager(0, charge, cote, rngStateFromSeed(5));
    // La passe de rangs est postérieure et pure : elle ne peut pas déplacer
    // l'état du PRNG, donc le tirage suivant est le même.
    rangsDuFront(avant.brulees, 0, cote);
    const apres = propager(0, charge, cote, rngStateFromSeed(5));
    expect([...apres.brulees].sort((a, b) => a - b)).toEqual(
      [...avant.brulees].sort((a, b) => a - b),
    );
    expect(apres.rng).toEqual(avant.rng);
  });

  it("un feu qui ne prend pas à l'origine ne laisse pas de front", () => {
    const cote = 5;
    const charge = { parCellule: new Array(cote * cote).fill(0), moyenne: 0 };
    const { brulees } = propager(0, charge, cote, rngStateFromSeed(1));
    expect(brulees.size).toBe(0);
    expect(rangsDuFront(brulees, 0, cote).size).toBe(0);
  });
});

describe("le feu trie les espèces", () => {
  it("le chêne-liège traverse un incendie qui tue le pin", () => {
    const intensite = 0.8;
    expect(survitAuFeu(arbre("quercus_suber", 8), intensite)).toBe(true);
    expect(survitAuFeu(arbre("pinus_sylvestris", 8), intensite)).toBe(false);
  });

  it("l'ajonc et la callune sont détruits (mais leur souche repart)", () => {
    expect(survitAuFeu(arbre("ulex_europaeus", 2), 0.5)).toBe(false);
    expect(getEspece("ulex_europaeus").feu.rejetteApresFeu).toBe(true);
  });

  it("un grand arbre échappe mieux au feu courant qu'un jeune", () => {
    expect(survitAuFeu(arbre("castanea_sativa", 20), 0.5)).toBe(true);
    expect(survitAuFeu(arbre("castanea_sativa", 1), 0.5)).toBe(false);
  });
});

describe("la charge de combustible", () => {
  it("un résineux charge plus qu'un feuillu frais, à taille égale", () => {
    const cote = 20;
    const herbe = new Array(cote * cote).fill(0);
    const litiere = new Array(cote * cote).fill(0);
    const pin = chargeCombustible(
      [{ ...arbre("pinus_sylvestris", 8), x: 10, y: 10 }],
      herbe,
      litiere,
      cote,
    );
    const aulne = chargeCombustible(
      [{ ...arbre("alnus_glutinosa", 8), x: 10, y: 10 }],
      herbe,
      litiere,
      cote,
    );
    expect(pin.moyenne).toBeGreaterThan(2 * aulne.moyenne);
  });

  it("l'herbe sèche porte le feu même sans arbres", () => {
    const cote = 10;
    const charge = chargeCombustible([], new Array(100).fill(1), new Array(100).fill(0), cote);
    expect(charge.moyenne).toBeGreaterThan(0.3);
  });
});

describe("un incendie sur la lande, en conditions de jeu", () => {
  const station: Station = { ...LANDE_SECHE.station, coteM: 50, voisinage: [] };
  let state = createGameState(station, rngStateFromSeed(12));
  for (let i = 0; i < 20; i++) {
    state = plantAt(state, "pinus_sylvestris", 5 + (i % 5) * 10, 5 + Math.floor(i / 5) * 10, 6);
  }
  for (let i = 0; i < 10; i++) {
    state = plantAt(state, "quercus_suber", 10 + (i % 5) * 9, 12 + Math.floor(i / 5) * 14, 5);
  }
  let incendies = 0;
  let arbresTues = 0;
  const tuesParLeFeu: Record<string, number> = {};
  const mortsTotales: Record<string, number> = {};
  let dernier: NonNullable<ReturnType<typeof advanceWeek>["incendie"]> | undefined;
  // Ce scénario portait aussi un relevé de carbone sur les rejets de souche.
  // Il ne relevait rien, et pour une raison structurelle : le pin est tué mais
  // ne rejette pas, le chêne-liège rejette mais son écorce à 0,95 ne le laisse
  // pas tuer. `rejets` valait donc zéro sur les quarante ans, et le calcul
  // était du code mort — ce qu'un avertissement de lint signalait sans dire
  // pourquoi. Son bilan omettait de surcroît litière et humus, qui bougent
  // précisément pendant un feu, donc il aurait été faux s'il s'était déclenché.
  // L'invariant est maintenant testé sur une lande de genêts qui rejette pour
  // de bon, avec la comptabilité complète : voir
  // `tests/properties/carbon-conservation.test.ts`.
  for (let i = 0; i < 40 * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, []);
    state = r.state;
    for (const m of r.morts) {
      mortsTotales[m.especeId] = (mortsTotales[m.especeId] ?? 0) + 1;
      if (m.cause === "feu") tuesParLeFeu[m.especeId] = (tuesParLeFeu[m.especeId] ?? 0) + 1;
    }
    if (r.incendie) {
      incendies++;
      arbresTues += r.incendie.arbresTues;
      dernier = r.incendie;
    }
  }

  it("la lande finit par brûler et le feu tue", () => {
    expect(incendies).toBeGreaterThan(0);
    expect(arbresTues).toBeGreaterThan(5);
  });

  it("l'incendie rend son front, pas seulement des compteurs", () => {
    // Sans les cellules ET leur rang d'arrivée, le rendu ne peut que noircir
    // une tache d'un coup : pas de ligne de flammes qui court.
    expect(dernier).toBeDefined();
    if (!dernier) return;
    expect(dernier.brulees).toHaveLength(dernier.cellulesBrulees);
    expect(dernier.rangs).toHaveLength(dernier.cellulesBrulees);
    expect(dernier.brulees[0]).toBe(dernier.origine);
    expect(dernier.rangs[0]).toBe(0);
    // Rangées par rang croissant : le rendu n'a qu'à les découper en tranches.
    const croissants = [...dernier.rangs].every(
      (r, i) => i === 0 || r >= (dernier?.rangs[i - 1] ?? 0),
    );
    expect(croissants).toBe(true);
    // Et chaque cellule est bien dans la grille.
    for (const c of dernier.brulees) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(station.coteM * station.coteM);
    }
  });

  it("le feu trie : il emporte des pins et épargne les chênes-lièges", () => {
    // On regarde QUI le feu tue, pas qui domine à la fin — ce dernier chiffre
    // dépend de la date du dernier incendie et bascule pour un rien. Ce qui
    // est structurel, c'est l'écorce : le liège est la réponse évolutive au
    // feu, et ça doit se lire dans les causes de mort.
    // On compare les PERTES au feu rapportées aux effectifs plantés, et non la
    // part du feu dans les causes de mort : quand le feu devient la seule
    // cause de mort — ce qui arrive dès que la station est confortable par
    // ailleurs — cette part vaut 1 pour tout le monde et ne trie plus rien.
    expect(tuesParLeFeu.pinus_sylvestris ?? 0).toBeGreaterThan(0);
    expect(tuesParLeFeu.pinus_sylvestris ?? 0).toBeGreaterThan(
      2 * (tuesParLeFeu.quercus_suber ?? 0),
    );
  });

  it("le feu est déterministe : même graine, mêmes incendies", () => {
    let bis = createGameState(station, rngStateFromSeed(12));
    for (let i = 0; i < 20; i++) {
      bis = plantAt(bis, "pinus_sylvestris", 5 + (i % 5) * 10, 5 + Math.floor(i / 5) * 10, 6);
    }
    for (let i = 0; i < 10; i++) {
      bis = plantAt(bis, "quercus_suber", 10 + (i % 5) * 9, 12 + Math.floor(i / 5) * 14, 5);
    }
    let n = 0;
    for (let i = 0; i < 40 * 52; i++) {
      const w = WEATHER[i % WEATHER.length];
      if (!w) throw new Error("météo manquante");
      const r = advanceWeek(bis, w, []);
      bis = r.state;
      if (r.incendie) n++;
    }
    expect(n).toBe(incendies);
  });
});

describe("il faut une SOURCE, et un combustible qui porte", () => {
  const charge = { parCellule: new Array(100).fill(1), moyenne: 1 };
  const CANICULE = 32;

  it("à conditions identiques, un massif isolé s'enflamme moins qu'une lisière de banlieue", () => {
    // La quasi-totalité des départs français est d'origine humaine — mégot,
    // travaux, barbecue, ligne électrique — et non la foudre. Sans ce facteur,
    // le moteur faisait de l'autocombustion.
    const departs = (paysageId: string) => {
      let rng = rngStateFromSeed(4);
      let n = 0;
      const freq = frequentationHumaine(getPaysage(paysageId));
      for (let i = 0; i < 400; i++) {
        const r = departDeFeu(rng, 30, 0.03, CANICULE, charge, 0.6, 10, freq);
        rng = r.rng;
        if (r.origine !== undefined) n++;
      }
      return n;
    };
    expect(departs("peri-urbain")).toBeGreaterThan(1.5 * departs("massif-forestier"));
  });

  it("sous un couvert fermé, la litière reste humide et ne porte pas le feu", () => {
    // C'est la vraie raison pour laquelle les incendies français courent en
    // pinède, en maquis et en lande, et presque jamais en hêtraie.
    expect(portanceDuFeu(1)).toBe(1);
    expect(portanceDuFeu(0.02)).toBeLessThan(0.35);
  });

  it("une hêtraie fermée ne brûle pas, une lande ouverte oui", () => {
    const cote = 20;
    const litiere = new Array(cote * cote).fill(400);
    const herbe = new Array(cote * cote).fill(0);
    const sombre = new Array(cote * cote).fill(0.03);
    const ouvert = new Array(cote * cote).fill(1);
    const hetres = Array.from({ length: 40 }, (_, i) => ({
      ...arbre("fagus_sylvatica", 25),
      id: i + 1,
      x: 2 + (i % 7) * 2.5,
      y: 2 + Math.floor(i / 7) * 3,
    }));
    const sousCouvert = chargeCombustible(hetres, herbe, litiere, cote, sombre);
    const aDecouvert = chargeCombustible(hetres, herbe, litiere, cote, ouvert);
    expect(sousCouvert.moyenne).toBeLessThan(aDecouvert.moyenne / 2);
  });
});
