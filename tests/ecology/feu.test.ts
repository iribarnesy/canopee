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
  accessibiliteDuHouppier,
  anisotropieDuFront,
  chargeCombustible,
  departDeFeu,
  excentriciteDuFront,
  indiceRisqueFeu,
  intensiteDuFeu,
  portanceDuFeu,
  propager,
  rangsDuFront,
  SANS_VENT,
  survitAuFeu,
  ventRecuParLeSite,
} from "../../src/engine/feu";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks, VENT_DOMINANT_VERS_RAD, ventDeLaSemaine } from "../../src/engine/meteo";
import { frequentationHumaine, getPaysage } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
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

  it("à conditions égales, l'exposition au vent aggrave le risque", () => {
    // Ce facteur reste l'EXPOSITION, pas la vitesse hebdomadaire : le vent est
    // désormais dans la météo, et le déclenchement ne le lit volontairement pas
    // (`feu.ts`). Il demanderait une grandeur de rafale et une recalibration
    // assumée de la fréquence des départs.
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
    const bilan = (s: GameState) => {
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
    // On CHERCHE un incendie avec rejets au lieu d'en espérer un. La version
    // précédente s'en remettait à une seule partie de quinze ans sur une seule
    // graine, et elle a fini par ne plus en trouver : un ajonc qui pousse un
    // peu plus vite referme le couvert plus tôt, l'herbe ne s'installe plus, et
    // c'est elle qui portait le feu sur les 88 % de cellules sans houppier. Le
    // décor était juste ; c'est de l'avoir fait tenir sur un tirage unique qui
    // ne l'était pas.
    let rejets = 0;
    for (const graine of [2, 5, 9, 13, 21]) {
      let state = createGameState(station, rngStateFromSeed(graine));
      for (let i = 0; i < 36; i++) {
        state = plantAt(state, "ulex_europaeus", 2 + (i % 6) * 5, 2 + Math.floor(i / 6) * 5, 1.2);
      }
      for (let i = 0; i < 25 * 52 && rejets === 0; i++) {
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
      if (rejets > 0) break;
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
  /** Effectif vivant de chaque espèce PRÉSENT dans les cellules brûlées. */
  const dansLeFront: Record<string, number> = {};
  /** Un relevé par semaine d'incendie, pour vérifier ce qui arrive ENSEMBLE. */
  const semainesDIncendie: {
    victimes: readonly { id: number; hauteurAvantM: number; rejet: boolean }[];
    arbresTues: number;
    mortsFeuLaMemeSemaine: number;
    idsEnJeu: ReadonlySet<number>;
  }[] = [];
  const celluleDe = (x: number, y: number) =>
    Math.min(station.coteM - 1, Math.max(0, Math.floor(y))) * station.coteM +
    Math.min(station.coteM - 1, Math.max(0, Math.floor(x)));
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
    const avant = state;
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
      // Le DÉNOMINATEUR du tri : qui était sur le passage du front, relevé
      // AVANT le tick, donc avant que le feu n'en retire personne.
      const brulees = new Set(r.incendie.brulees);
      for (const t of avant.trees) {
        if (!t.alive) continue;
        if (brulees.has(celluleDe(t.x, t.y))) {
          dansLeFront[t.especeId] = (dansLeFront[t.especeId] ?? 0) + 1;
        }
      }
      semainesDIncendie.push({
        victimes: r.incendie.victimes,
        arbresTues: r.incendie.arbresTues,
        mortsFeuLaMemeSemaine: r.morts.filter((m) => m.cause === "feu").length,
        // Après le tick : c'est là que le rendu ferait la jointure.
        idsEnJeu: new Set(state.trees.map((t) => t.id)),
      });
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

  /**
   * La charge de chaque cellule brûlée (issue #50). Sans elle, le rendu dessine
   * toutes ses flammes à la même hauteur de convention, faute de savoir DANS
   * QUOI elles brûlent : « le feu s'essouffle dans le feuillu frais, fonce dans
   * la lande » ne se lit alors que sur la vitesse du front, jamais sur la
   * flamme. Une lande de pins et d'ajoncs ne brûle pas partout pareil, et c'est
   * précisément ce que le calque doit montrer.
   */
  it("l'incendie rend AUSSI dans quoi chaque cellule a brûlé", () => {
    expect(dernier).toBeDefined();
    if (!dernier) return;
    // Alignée sur `brulees`, cellule par cellule : c'est ce qui permet de lire
    // les deux ensemble sans table de correspondance.
    expect(dernier.charges).toHaveLength(dernier.cellulesBrulees);
    // Une cellule qui a brûlé portait du combustible : une charge nulle
    // partout voudrait dire qu'on relève la charge APRÈS consommation, ce qui
    // serait le contraire de ce qu'on veut montrer.
    const total = [...dernier.charges].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    for (const c of dernier.charges) {
      expect(c).toBeGreaterThanOrEqual(0);
      // Borne haute de l'indice de `chargeCombustible`, avec de la marge.
      expect(c).toBeLessThan(3);
    }
    // Et ça VARIE : une lande de pins et d'ajoncs ne brûle pas partout à la
    // même intensité. Une charge uniforme rendrait le champ inutile.
    const distinctes = new Set([...dernier.charges].map((c) => c.toFixed(3)));
    expect(distinctes.size).toBeGreaterThan(1);
  });

  it("le feu trie : il emporte des pins et épargne les chênes-lièges", () => {
    // On regarde QUI le feu tue, pas qui domine à la fin — ce dernier chiffre
    // dépend de la date du dernier incendie et bascule pour un rien. Ce qui
    // est structurel, c'est l'écorce : le liège est la réponse évolutive au
    // feu, et ça doit se lire dans les causes de mort.
    //
    // On compare des TAUX : les pertes au feu rapportées à l'effectif de
    // l'espèce qui était sur le passage du front. C'est ce que cette
    // vérification annonçait depuis toujours, mais elle comparait en fait des
    // effectifs BRUTS, et ça ne tenait que par accident — le liège affichait
    // zéro mort, si bien que « 20 > 2 × 0 » passait sans rien démontrer. Dès
    // que le front s'est allongé sous le vent, il a atteint des cellules à
    // très forte charge, où même le liège y passe : 30 lièges morts contre 20
    // pins, et la comparaison brute s'effondrait — alors qu'il y avait dix
    // fois plus de lièges que de pins sur le passage du feu. Comparer des
    // effectifs bruts entre populations d'un ordre de grandeur d'écart ne
    // mesure rien.
    //
    // En taux, le tri est net et bien plus fort que ce que l'ancienne
    // assertion pouvait montrer : le pin y passe en entier, le liège en
    // réchappe largement.
    const taux = (id: string) => (tuesParLeFeu[id] ?? 0) / (dansLeFront[id] ?? 1);
    // Les deux espèces ont bien été exposées : sans ça, un taux ne veut rien dire.
    expect(dansLeFront.pinus_sylvestris ?? 0).toBeGreaterThan(0);
    expect(dansLeFront.quercus_suber ?? 0).toBeGreaterThan(0);
    expect(taux("pinus_sylvestris")).toBeGreaterThan(2 * taux("quercus_suber"));
  });

  it("l'incendie dit QUI il a emporté, et le dit la semaine où il brûle", () => {
    // Le grief de l'issue #52. `arbresTues` donnait le nombre, jamais les
    // identités, et `TickResult.morts` ne pouvait pas suppléer : un arbre tué
    // par le feu reste debout, récupérable en coupe sanitaire, et n'entre dans
    // `morts` qu'un an plus tard — une semaine où `incendie` est `undefined`.
    // L'incendie et ses victimes ne pouvaient donc jamais figurer dans le même
    // journal, et une mise en scène du torchage n'avait rien à animer.
    expect(semainesDIncendie.length).toBeGreaterThan(0);
    let victimesEnTout = 0;
    for (const s of semainesDIncendie) {
      // Les deux comptes sortent du même endroit : ils ne peuvent pas diverger.
      expect(s.victimes.length).toBe(s.arbresTues);
      victimesEnTout += s.victimes.length;
      for (const v of s.victimes) {
        // La jointure du rendu marche : l'arbre est encore dans l'instantané,
        // en chandelle ou rabattu sur son rejet.
        expect(s.idsEnJeu.has(v.id)).toBe(true);
        expect(v.hauteurAvantM).toBeGreaterThan(0);
      }
      // Et voici POURQUOI le champ existe : la même semaine, `morts` ne
      // rapporte aucune mort par le feu. Si un jour cette ligne casse, c'est
      // que le rapport de mortalité a changé — et que `victimes` mérite d'être
      // rediscuté, pas rafistolé.
      expect(s.mortsFeuLaMemeSemaine).toBe(0);
    }
    expect(victimesEnTout).toBeGreaterThan(0);
  });

  it("une victime dit sa hauteur d'AVANT, que le rejet écrase", () => {
    // Chez un rejet, `heightM` est rabattue dans le même tick : la hauteur
    // d'avant le feu ne se lit plus nulle part dans l'instantané. C'est la
    // seule chose que `id` ne suffit pas à retrouver, donc la seule qui voyage
    // en plus de lui.
    const toutes = semainesDIncendie.flatMap((s) => [...s.victimes]);
    const rejets = toutes.filter((v) => v.rejet);
    const chandelles = toutes.filter((v) => !v.rejet);
    // Le scénario tue des pins, qui ne rejettent pas : il y a des chandelles.
    expect(chandelles.length).toBeGreaterThan(0);
    // Toute victime avait une hauteur, aussi petite soit-elle. Et elle peut
    // être TRÈS petite : un semis de 55 cm qui ne rejette pas meurt et laisse
    // une chandelle minuscule. Ma première version prenait le seuil de rejet
    // (60 cm) pour un plancher valable pour tout le monde — il ne vaut que
    // pour les rejets, et un pin de 55 cm l'a démentie.
    for (const v of toutes) expect(v.hauteurAvantM).toBeGreaterThan(0);
    // Chez un rejet, en revanche, le seuil est structurel : une souche ne
    // repart que si la tige faisait plus de 60 cm. Et c'est bien au-dessus des
    // 40 cm auxquels le tick la rabat DANS LE MÊME TICK — donc `hauteurAvantM`
    // porte une information que l'instantané a déjà perdue. C'est sa raison
    // d'être. (Vide si le scénario n'a tué aucun pyrophyte : le pin domine.)
    for (const v of rejets) expect(v.hauteurAvantM).toBeGreaterThan(0.6);
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
    // L'ombre divise la charge par 1,5 dans ce peuplement-ci, non plus par 2 :
    // elle n'agit QUE sur le compartiment de SURFACE. C'est ce que disent les
    // modèles de comportement du feu — le couvert n'éteint pas sa propre
    // biomasse, il maintient la litière humide et à l'abri du vent. Rothermel
    // (1983, table II-6) chiffre ce dernier effet : le vent à hauteur de flamme
    // vaut 0,4 fois le vent de référence en terrain découvert et 0,1 sous une
    // futaie dense, soit un rapport de 0,25 — l'ordre de grandeur de notre
    // `PORTANCE_SOUS_COUVERT`.
    expect(sousCouvert.moyenne).toBeLessThan(0.75 * aDecouvert.moyenne);
  });

  /**
   * DÉFAUT CONNU, non corrigé — l'essai énonce ce qui devrait être vrai et
   * échoue exprès, pour qu'on ne l'oublie pas.
   *
   * Ce qui compte n'est pas un peuplement sous deux éclairements imposés,
   * c'est la comparaison entre deux VÉGÉTATIONS. À couvert égal, une lande
   * d'ajoncs devrait porter le feu bien plus qu'une hêtraie : ce n'est pas la
   * densité qui fait le brasier, c'est ce dont le couvert est fait. Mesuré, le
   * moteur dit le CONTRAIRE — 3,34 pour la hêtraie contre 0,83 pour la lande,
   * un facteur quatre à l'envers.
   *
   * Deux causes, trouvées en changeant les vitesses de croissance (un ajonc un
   * peu plus vif a fait disparaître tous les incendies d'un essai) :
   *
   * 1. La charge des houppiers s'ADDITIONNE à chaque recouvrement, sans
   *    plafond. Un peuplement fermé finit par porter plusieurs fois la charge
   *    d'une lande, uniquement parce que ses couronnes se chevauchent.
   * 2. L'ombre amortit AUSSI la charge des houppiers, ce qui rend le modèle
   *    circulaire : plus un peuplement porte de combustible, moins il peut
   *    brûler. Un fourré d'ajoncs finit par ne plus s'enflammer, le contraire
   *    de ce qu'on observe dans les landes.
   *
   * Les deux corrections ont été écrites puis RETIRÉES : elles changent
   * l'échelle de la charge, sur laquelle la propagation du feu est calibrée, et
   * un incendie d'essai a cessé de consumer quoi que ce soit. Le feu mérite sa
   * propre passe, pas un raccourci en fin de chantier.
   */
  it("un houppier haut ne s'enflamme pas d'un feu rampant", () => {
    // L'amorçage de feu de cime (Van Wagner 1977) : le feu de surface doit
    // dépasser une intensité critique pour atteindre le houppier, et cette
    // intensité croît comme la puissance 3/2 de la hauteur de base du houppier.
    // C'est pourquoi une futaie élaguée haut ne passe pas en feu de cime là où
    // un fourré s'embrase.
    //
    // La hauteur de base n'est pas un trait d'espèce : elle se calcule par
    // arbre, celui-ci élaguant lui-même ses branches passées sous leur point de
    // compensation (`baseHouppierCible`, light.ts).
    expect(accessibiliteDuHouppier(0.2, 1)).toBe(1); // un fourré : tout est à portée
    expect(accessibiliteDuHouppier(4, 1)).toBe(1); // le repère de calage
    expect(accessibiliteDuHouppier(12, 0.12)).toBeLessThan(0.05); // une futaie sombre
    // Et le même houppier haut DEVIENT accessible si le sol brûle assez fort :
    // c'est bien un seuil d'intensité, pas une immunité de la futaie.
    expect(accessibiliteDuHouppier(12, 0.12)).toBeLessThan(accessibiliteDuHouppier(12, 3));
    // Monotone dans les deux sens, sans discontinuité.
    expect(accessibiliteDuHouppier(6, 1)).toBeLessThan(accessibiliteDuHouppier(3, 1));
  });

  it("élaguer est une mesure de prévention, et personne ne l'a écrit", () => {
    // Trois mécanismes qui existaient chacun de leur côté se rejoignent ici, et
    // le résultat n'est écrit nulle part : l'élagage relève la base du houppier
    // (`hauteurElagueeM` entre dans `baseHouppierM`, tick.ts) ; la base du
    // houppier décide de l'amorçage de feu de cime (`accessibiliteDuHouppier`,
    // ci-dessus) ; donc élaguer met le couvert hors d'atteinte d'un feu
    // rampant. C'est exactement ce que prescrit le débroussaillement
    // réglementaire dans les Landes, et le moteur y arrive tout seul.
    const cote = 20;
    const litiere = new Array(cote * cote).fill(400);
    const herbe = new Array(cote * cote).fill(0.3);
    const ouvert = new Array(cote * cote).fill(1);
    const peuplement = (base: number) =>
      Array.from({ length: 40 }, (_, i) => ({
        ...arbre("pinus_sylvestris", 14),
        id: i + 1,
        x: 2 + (i % 7) * 2.5,
        y: 2 + Math.floor(i / 7) * 3,
        baseHouppierM: base,
      }));
    const branchu = chargeCombustible(peuplement(1), herbe, litiere, cote, ouvert);
    const elague = chargeCombustible(peuplement(6), herbe, litiere, cote, ouvert);
    expect(elague.moyenne).toBeLessThan(0.7 * branchu.moyenne);
    // Mais l'élagage ne met pas à l'abri : le combustible de SURFACE, lui, n'a
    // pas bougé d'un gramme. Un pin élagué sur une lande d'herbe sèche brûle
    // toujours au sol — ce qu'il ne fait plus, c'est passer en cime.
    expect(elague.moyenne).toBeGreaterThan(0);
  });

  it("à couvert égal, une lande d'ajoncs porte le feu plus qu'une hêtraie", () => {
    const cote = 20;
    const litiere = new Array(cote * cote).fill(400);
    const herbe = new Array(cote * cote).fill(0);
    const ouvert = new Array(cote * cote).fill(1);
    const disposition = (especeId: string, hauteur: number) =>
      Array.from({ length: 40 }, (_, i) => ({
        ...arbre(especeId, hauteur),
        id: i + 1,
        x: 2 + (i % 7) * 2.5,
        y: 2 + Math.floor(i / 7) * 3,
      }));
    const hetraie = chargeCombustible(
      disposition("fagus_sylvatica", 25),
      herbe,
      litiere,
      cote,
      new Array(cote * cote).fill(0.03),
    );
    const lande = chargeCombustible(
      disposition("ulex_europaeus", 2.2),
      herbe,
      litiere,
      cote,
      ouvert,
    );
    expect(lande.moyenne).toBeGreaterThan(hetraie.moyenne);
  });
});

describe("le vent : une direction et une vitesse, pas un scalaire d'abri", () => {
  it("le vent d'une semaine est purement déterministe", () => {
    // Aucun tirage : deux appels rendent le même vent, et la seule présence des
    // champs ne peut donc pas déplacer l'empreinte d'une partie.
    expect(ventDeLaSemaine(30)).toEqual(ventDeLaSemaine(30));
  });

  it("le cap ne vire pas dans l'année : un régime dominant se maintient", () => {
    // C'est ce qui règle le vrai grief de l'issue #50 — deux incendies de la
    // même parcelle penchaient en éventail autour de leur origine, alors qu'un
    // vent les incline tous du même côté.
    const caps = new Set(Array.from({ length: 52 }, (_, w) => ventDeLaSemaine(w).ventVersRad));
    expect(caps).toEqual(new Set([VENT_DOMINANT_VERS_RAD]));
  });

  it("il vente plus en hiver qu'au cœur de l'été", () => {
    // Sous régime océanique, la vitesse moyenne passe par un maximum en hiver
    // (rail des dépressions) et un minimum en été. Conséquence assumée : la
    // saison des feux tombe dans le BAS de la plage de vent.
    const juillet = ventDeLaSemaine(29).ventMoyMs;
    const janvier = ventDeLaSemaine(3).ventMoyMs;
    expect(janvier).toBeGreaterThan(juillet);
    expect(juillet).toBeGreaterThan(0);
  });

  it("un vallon sous tempête reçoit plus qu'une lande par temps calme", () => {
    // L'abri et le vent ne sont pas interchangeables : c'était tout le
    // problème. `ventExposition` seul ne pouvait pas dire cela.
    expect(ventRecuParLeSite(15, 0.1)).toBeGreaterThan(ventRecuParLeSite(1, 0.95));
  });
});

describe("le front s'allonge dans le vent", () => {
  const CAP_EST = 0;

  it("le vent AJOUTE : il sert la tête, et n'ampute aucun cap", () => {
    // Deux versions ont échoué ici, dans le même sens. Normaliser l'ellipse sur
    // la tête, puis sur le flanc, faisait RETIRER quelque chose à des pas que
    // le vent n'aurait pas dû freiner — et comme `propager` est une percolation
    // sans budget de temps, où le pas sous le vent passait déjà librement en
    // combustible saturé, le bonus y était perdu et seule la pénalité mordait.
    // Un feu venté brûlait donc MOINS qu'un feu calme, l'inverse du fait à
    // modéliser. Le 1 est maintenant sur l'ARRIÈRE : aucun cap ne peut plus
    // brûler moins qu'il n'aurait brûlé sans vent.
    const vent = { versRad: CAP_EST, vitesseMs: 6 };
    const tete = anisotropieDuFront(CAP_EST, vent);
    const flanc = anisotropieDuFront(Math.PI / 2, vent);
    const arriere = anisotropieDuFront(Math.PI, vent);
    expect(tete).toBeGreaterThan(flanc);
    expect(flanc).toBeGreaterThan(arriere);
    for (const f of [tete, flanc, arriere]) expect(f).toBeGreaterThanOrEqual(1);
    // Les RAPPORTS restent ceux de l'ellipse : tête/arrière = (1+e)/(1−e).
    const e = excentriciteDuFront(6);
    expect(tete / arriere).toBeCloseTo((1 + e) / (1 - e), 10);
  });

  it("en combustible saturé, le vent ne retire pas une cellule", () => {
    // La conséquence directe du 1 sur l'arrière, et ce qu'un test de
    // conservation du carbone — écrit pour tout autre chose — avait pris en
    // défaut : son feu de chandelles ne nettoyait plus la parcelle. Tous les
    // facteurs valant ≥ 1, aucun pas ne se met à tirer, donc le même ensemble
    // brûle et AUCUN tirage n'est consommé.
    const cote = 21;
    const charge = { parCellule: new Array(cote * cote).fill(1), moyenne: 1 };
    const calme = propager(0, charge, cote, rngStateFromSeed(2));
    const vente = propager(0, charge, cote, rngStateFromSeed(2), {
      versRad: CAP_EST,
      vitesseMs: 6,
    });
    expect(vente.brulees.size).toBe(cote * cote);
    expect(vente.brulees.size).toBe(calme.brulees.size);
    expect(vente.rng).toEqual(calme.rng);
  });

  it("sans vent, aucun cap n'est privilégié", () => {
    for (const cap of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      expect(anisotropieDuFront(cap, SANS_VENT)).toBe(1);
    }
  });

  it("un feu venté fait une ellipse, un feu calme une tache", () => {
    // Combustible marginal et homogène : la FORME ne peut venir que du vent.
    // 0,4 de charge met le pas de flanc SOUS le seuil de percolation d'un
    // réseau carré à quatre voisins (≈ 0,59) et le pas de tête au-dessus : les
    // flancs s'éteignent, la tête court. Sur un combustible saturé il n'y
    // aurait rien à voir — tout brûle, vent ou pas (cf. l'essai précédent).
    const cote = 41;
    const centre = 20 * cote + 20;
    const charge = { parCellule: new Array(cote * cote).fill(0.4), moyenne: 0.4 };
    // On mesure les deux sens de x SÉPARÉMENT. Les confondre en une « longueur »
    // ne disait rien : la tête atteint le bord de la parcelle, donc la mesure
    // saturait à la moitié du côté et le rapport à la largeur ne prouvait plus
    // rien. L'asymétrie tête/arrière, elle, ne dépend pas du bord.
    const etendues = (brulees: ReadonlySet<number>) => {
      let tete = 0;
      let arriere = 0;
      let flanc = 0;
      for (const c of brulees) {
        tete = Math.max(tete, (c % cote) - 20);
        arriere = Math.max(arriere, 20 - (c % cote));
        flanc = Math.max(flanc, Math.abs(Math.floor(c / cote) - 20));
      }
      return { tete, arriere, flanc };
    };
    const vent = { versRad: CAP_EST, vitesseMs: 6 };
    const calme = propager(centre, charge, cote, rngStateFromSeed(7)).brulees;
    const vente = propager(centre, charge, cote, rngStateFromSeed(7), vent).brulees;
    const e = etendues(vente);
    // Vent d'est : le front part vers l'est et ne remonte pas au vent.
    expect(e.tete).toBeGreaterThan(3 * e.arriere);
    // Et il est plus long que large : c'est l'ellipse, pas la tache.
    expect(e.tete).toBeGreaterThan(e.flanc);
    // Par temps calme, à la même charge, le départ s'éteint sur place.
    expect(vente.size).toBeGreaterThan(10 * calme.size);
  });

  it("un feu venté brûle plus large qu'un feu calme, à combustible égal", () => {
    const cote = 41;
    const charge = { parCellule: new Array(cote * cote).fill(0.4), moyenne: 0.4 };
    let vente = 0;
    let calme = 0;
    // Plusieurs graines : l'affaire est statistique, pas anecdotique.
    for (let graine = 1; graine <= 12; graine++) {
      const centre = 20 * cote + 20;
      calme += propager(centre, charge, cote, rngStateFromSeed(graine)).brulees.size;
      vente += propager(centre, charge, cote, rngStateFromSeed(graine), {
        versRad: CAP_EST,
        vitesseMs: 6,
      }).brulees.size;
    }
    expect(vente).toBeGreaterThan(calme);
  });

  it("le vent n'allume pas ce qui n'a rien à brûler : la coupure tient", () => {
    // L'anisotropie est un FACTEUR : elle ne peut pas franchir un zéro. Sans
    // quoi le vent aurait effacé la seule défense que le joueur puisse
    // construire (ch5 « concevoir contre le FEU »).
    const cote = 21;
    const parCellule = new Array(cote * cote).fill(1);
    for (let y = 0; y < cote; y++) parCellule[y * cote + 10] = 0;
    // Vent d'est plein sur la coupure : le pire cas.
    const { brulees } = propager(0, { parCellule, moyenne: 1 }, cote, rngStateFromSeed(2), {
      versRad: CAP_EST,
      vitesseMs: 6,
    });
    expect([...brulees].filter((i) => i % cote > 10)).toHaveLength(0);
    expect(brulees.size).toBeGreaterThan(30);
  });
});

describe("l'intensité du feu a un nom et un seul propriétaire", () => {
  it("elle suit le combustible local, bornée à [0,1]", () => {
    // Elle vivait en une ligne anonyme au milieu du tick, ce qui obligeait
    // quiconque veut reproduire la sélection du moteur à la recopier.
    expect(intensiteDuFeu(0)).toBe(0);
    expect(intensiteDuFeu(0.6)).toBeGreaterThan(0);
    expect(intensiteDuFeu(1.2)).toBe(1);
    // Saturée au-delà : la charge peut monter à ~1,5 (fourré d'ajoncs).
    expect(intensiteDuFeu(1.5)).toBe(1);
    expect(intensiteDuFeu(1)).toBeGreaterThan(intensiteDuFeu(0.5));
  });

  it("c'est elle qui fait le tri des espèces, en face de l'écorce", () => {
    // Le lien avec `survitAuFeu` : à charge de lande, le pin y passe et le
    // liège en réchappe. Sans un nom partagé, les deux règles dérivent.
    const arbrePin = { ...arbre("pinus_sylvestris", 8) };
    const arbreLiege = { ...arbre("quercus_suber", 8) };
    const intensite = intensiteDuFeu(1.1);
    expect(survitAuFeu(arbrePin, intensite)).toBe(false);
    expect(survitAuFeu(arbreLiege, intensite)).toBe(true);
  });
});
