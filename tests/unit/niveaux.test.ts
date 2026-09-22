/**
 * UN NIVEAU : SON OBJECTIF, SES PALIERS, SA FIN (#188).
 *
 * Ce que ces essais défendent, et ce sont trois pièges qu'aucune capture
 * d'écran ne montrerait :
 *
 * 1. **Un cumul n'est pas un stock.** « Récolter une tonne de pommes » —
 *    l'exemple de `v1.md` — porte sur des fruits qui ont QUITTÉ la parcelle :
 *    l'instantané ne les montre plus, et un palier branché sur `fruitsKg` des
 *    arbres retomberait à zéro à l'instant même où l'objectif est atteint.
 * 2. **Un geste de zone porte parfois le même nom qu'un geste sur arbres**
 *    (#124) : `planter` et `leverEcorce` touchent les deux mailles. Compter les
 *    deux doublerait le cumul.
 * 3. **Un palier acquis le reste.** Les objectifs intermédiaires « font
 *    découvrir les gestes dans l'ordre » : perdre un arbre planté ne
 *    désapprend pas la plantation. Un objectif qui doit TENIR à la fin, lui,
 *    doit pouvoir se reperdre.
 */

import { describe, expect, it } from "vitest";
import type { GesteVisible } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { bordersUniformes } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";
import {
  accumuler,
  avancementDuNiveau,
  CUMULS_VIDES,
  type EtatDuNiveau,
  libelleDuPalier,
  type Niveau,
  paliersFranchis,
} from "../../src/game/niveaux";
import type { ProfilDepart } from "../../src/game/profils";
import type { Snapshot } from "../../src/game/protocol";
import { construireSnapshot } from "../../src/game/snapshot";

const STATION: Station = { ...LIMON_RICHE.station, coteM: 12, voisinage: [], gibierParHa: 0 };
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/** Un instantané VRAI, pas un simulacre : un objet partiel mentirait. */
function instantaneDeBase(): Snapshot {
  const state = createGameState(STATION, rngStateFromSeed(7));
  const w = WEATHER[0];
  if (!w) throw new Error("météo manquante");
  const ticked = tick(state, w);
  return construireSnapshot({
    state: ticked.state,
    weather: w,
    anneeCivile: 2026,
    paysage: "bocage",
    initialSoilCTHa: STATION.initialSoilCTHa,
    fluxes: ticked.fluxes,
    debordementParCellule: ticked.debordementParCellule,
    lumiereAuSol: ticked.lumiereAuSol,
    refusals: [],
    events: [],
    morts: [],
    naissances: [],
    franchissements: [],
    gestes: [],
    chutes: [],
  });
}

const BASE = instantaneDeBase();

const DEPART: ProfilDepart = {
  version: 1,
  nom: "essai",
  stationId: "limon-riche",
  bordures: bordersUniformes("bocage"),
  relief: { altitudeM: 120, pentePct: 2, expositionDeg: 180, forme: "plan", bassinAmontHa: 0 },
  eau: { type: "aucune", bergeM: 0 },
  nappeCm: 200,
  partBassinSemblable: 0,
  scenario: "ssp245",
  anneeDepart: 2026,
  maturationAns: 0,
};

/** Un niveau d'essai : un cumul acquis, une trésorerie qui doit tenir. */
const NIVEAU: Niveau = {
  id: "essai",
  nom: "Essai",
  enonce: "Récolter des fruits sans se ruiner.",
  depart: DEPART,
  seed: 7,
  meteo: "synthetique",
  economie: true,
  semainesImparties: 520,
  paliers: [
    {
      id: "planter",
      quoi: "Planter des fruitiers",
      mesure: (e) => e.cumuls.plantes,
      cible: 12,
      unite: "arbres",
    },
    {
      id: "recolter",
      quoi: "Récolter des fruits",
      mesure: (e) => e.cumuls.fruitsKg,
      cible: 200,
      unite: "kg",
    },
    {
      id: "tresorerie",
      quoi: "Finir avec une trésorerie positive",
      mesure: (e) => e.snapshot.economy.treasuryEur,
      cible: 1,
      unite: "€",
      acquis: false,
    },
  ],
};

function etat(cumuls = CUMULS_VIDES, snapshot = BASE, semaines = 0): EtatDuNiveau {
  return { snapshot, cumuls, semaines };
}

describe("les cumuls", () => {
  it("additionne les kilos réellement cueillis, pas les fruits sur l'arbre", () => {
    const gestes: GesteVisible[] = [{ type: "recolter", ids: [1, 2], masseKg: [12.5, 7.5] }];
    expect(accumuler(CUMULS_VIDES, gestes).fruitsKg).toBe(20);
  });

  it("s'ajoute d'une semaine à l'autre", () => {
    const une: GesteVisible[] = [{ type: "recolter", ids: [1], masseKg: [10] }];
    const deux: GesteVisible[] = [{ type: "recolter", ids: [1], masseKg: [15] }];
    expect(accumuler(accumuler(CUMULS_VIDES, une), deux).fruitsKg).toBe(25);
  });

  it("compte les plants, les abattages et l'écorce à leur place", () => {
    const gestes: GesteVisible[] = [
      { type: "planter", ids: [1, 2, 3] },
      { type: "couper", ids: [4] },
      { type: "eclaircir", ids: [5, 6] },
      { type: "leverEcorce", ids: [7], masseKg: [30] },
    ];
    expect(accumuler(CUMULS_VIDES, gestes)).toEqual({
      fruitsKg: 0,
      ecorceKg: 30,
      plantes: 3,
      abattues: 3,
    });
  });

  it("ne compte PAS deux fois un geste qui touche aussi le sol (#124)", () => {
    // `planter` et `leverEcorce` voyagent sous le même nom en version ZONE :
    // la terre retournée autour du plant, les planches empilées au pied. Elles
    // n'ont pas d'`ids`, et ne doivent rien ajouter.
    const gestes: GesteVisible[] = [
      { type: "planter", ids: [1, 2] },
      { type: "planter", cellules: [10, 11, 12] },
      { type: "leverEcorce", ids: [3], masseKg: [30] },
      { type: "leverEcorce", cellules: [13] },
    ];
    const cumuls = accumuler(CUMULS_VIDES, gestes);
    expect(cumuls.plantes).toBe(2);
    expect(cumuls.ecorceKg).toBe(30);
  });

  it("ne bronche pas sur un geste sans masse", () => {
    const gestes: GesteVisible[] = [{ type: "recolter", ids: [1] }];
    expect(accumuler(CUMULS_VIDES, gestes).fruitsKg).toBe(0);
  });

  it("se rejoue depuis un point de retour : une semaine élaguée ne garde que ce qu'elle garde", () => {
    // Le cas du worker, réduit à son arithmétique. Une semaine trop chargée se
    // REJOUE amputée de sa fin (#133) ; le cumul doit se rejouer avec elle,
    // depuis le cumul qu'il avait à l'ouverture de la semaine.
    //
    // Et c'est pour ça que le worker compte À LA SOURCE et non au moment de
    // l'instantané : un instantané couvre jusqu'à vingt-six semaines, donc un
    // point de retour posé avant lui serait en retard d'autant, et le repli
    // effacerait les récoltes de tout le lot.
    const ouverture = accumuler(CUMULS_VIDES, [
      { type: "recolter", ids: [1], masseKg: [10] },
    ] as GesteVisible[]);
    const posees: GesteVisible[] = [
      { type: "recolter", ids: [2], masseKg: [30] },
      { type: "recolter", ids: [3], masseKg: [25] },
    ];
    const gardees = posees.slice(0, 1);
    expect(accumuler(ouverture, gardees).fruitsKg).toBe(40);
    // Ce que donnerait un cumul qui ne se rejouerait pas — la faute à éviter.
    expect(accumuler(accumuler(ouverture, posees), gardees).fruitsKg).toBe(95);
  });

  it("ignore les gestes que personne ne compte", () => {
    const gestes: GesteVisible[] = [
      { type: "brouter", ids: [1] },
      { type: "elaguer", ids: [2] },
    ];
    expect(accumuler(CUMULS_VIDES, gestes)).toEqual(CUMULS_VIDES);
  });
});

describe("l'avancement", () => {
  it("est en cours tant qu'un palier manque", () => {
    const a = avancementDuNiveau(NIVEAU, etat({ ...CUMULS_VIDES, plantes: 12 }));
    expect(a.issue).toBe("en-cours");
    expect(a.courant?.palier.id).toBe("recolter");
  });

  it("donne la part de chaque palier, bornée à 1", () => {
    const a = avancementDuNiveau(NIVEAU, etat({ ...CUMULS_VIDES, plantes: 24, fruitsKg: 50 }));
    expect(a.paliers[0]?.part).toBe(1);
    expect(a.paliers[1]?.part).toBeCloseTo(0.25, 5);
  });

  it("réussit quand tous les paliers sont atteints", () => {
    const riche = { ...BASE, economy: { ...BASE.economy, treasuryEur: 5000 } };
    const a = avancementDuNiveau(
      NIVEAU,
      etat({ ...CUMULS_VIDES, plantes: 12, fruitsKg: 200 }, riche),
    );
    expect(a.issue).toBe("reussi");
    expect(a.courant).toBeUndefined();
  });

  it("échoue quand le temps imparti est écoulé", () => {
    const a = avancementDuNiveau(NIVEAU, etat(CUMULS_VIDES, BASE, 520));
    expect(a.issue).toBe("echoue");
    expect(a.raison).toContain("temps");
    expect(a.restantes).toBe(0);
  });

  it("échoue à la faillite AVANT la fin du temps, et le dit autrement", () => {
    const ruine = { ...BASE, economy: { ...BASE.economy, bankrupt: true } };
    const a = avancementDuNiveau(NIVEAU, etat(CUMULS_VIDES, ruine, 10));
    expect(a.issue).toBe("echoue");
    expect(a.raison).toContain("trésorerie");
    expect(a.restantes).toBe(510);
  });

  it("ne compte pas de temps restant quand le niveau n'en impartit pas", () => {
    const sansFin: Niveau = { ...NIVEAU, semainesImparties: 0 };
    expect(avancementDuNiveau(sansFin, etat(CUMULS_VIDES, BASE, 9999)).restantes).toBeUndefined();
    expect(avancementDuNiveau(sansFin, etat(CUMULS_VIDES, BASE, 9999)).issue).toBe("en-cours");
  });
});

describe("la mémoire des paliers", () => {
  it("garde acquis un palier franchi, même si la grandeur redescend", () => {
    const acquis = new Set(["planter"]);
    const a = avancementDuNiveau(NIVEAU, etat({ ...CUMULS_VIDES, plantes: 0 }), acquis);
    expect(a.paliers[0]?.atteint).toBe(true);
    expect(a.courant?.palier.id).toBe("recolter");
  });

  it("laisse se reperdre un palier qui doit TENIR à la fin", () => {
    // La trésorerie porte `acquis: false` : avoir été riche une fois ne vaut
    // pas finir à flot.
    const acquis = new Set(["planter", "recolter", "tresorerie"]);
    const aSec = { ...BASE, economy: { ...BASE.economy, treasuryEur: -40 } };
    const a = avancementDuNiveau(NIVEAU, etat(CUMULS_VIDES, aSec, 10), acquis);
    expect(a.paliers[2]?.atteint).toBe(false);
    // …alors que les deux autres, eux, restent acquis dans le même état.
    expect(a.paliers[0]?.atteint).toBe(true);
    expect(a.paliers[1]?.atteint).toBe(true);
    expect(a.courant?.palier.id).toBe("tresorerie");
  });

  it("rend les paliers franchis, pour nourrir la mémoire", () => {
    const a = avancementDuNiveau(NIVEAU, etat({ ...CUMULS_VIDES, plantes: 12 }));
    expect(paliersFranchis(a)).toContain("planter");
    expect(paliersFranchis(a)).not.toContain("recolter");
  });
});

describe("le libellé", () => {
  it("écrit la phrase À PARTIR de la cible, sans la recopier", () => {
    const a = avancementDuNiveau(NIVEAU, etat({ ...CUMULS_VIDES, fruitsKg: 40.25 }));
    const ligne = a.paliers[1];
    if (!ligne) throw new Error("palier manquant");
    expect(libelleDuPalier(ligne)).toBe("Récolter des fruits — 40.3 / 200 kg");
  });

  it("n'affiche pas de décimale quand il n'y en a pas", () => {
    const a = avancementDuNiveau(NIVEAU, etat({ ...CUMULS_VIDES, plantes: 5 }));
    const ligne = a.paliers[0];
    if (!ligne) throw new Error("palier manquant");
    expect(libelleDuPalier(ligne)).toBe("Planter des fruitiers — 5 / 12 arbres");
  });
});
