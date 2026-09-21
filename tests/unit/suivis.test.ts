/**
 * LE JOURNAL D'UN ARBRE SUIVI (#149).
 *
 * « Je plante des abricotiers, je veux surveiller très précisément ce qui leur
 * arrive — pas qu'ils meurent sans que je comprenne rien. »
 *
 * Ce que ces essais défendent tient en deux points, et les deux sont des
 * pièges qu'on ne voit pas à l'écran :
 *
 * 1. **Ce qui est un ÉVÉNEMENT se recopie, ce qui est un ÉTAT se compare.** Les
 *    gestes, les morts et les franchissements sont accumulés par le worker
 *    jusqu'à l'instantané ; le gel des fleurs et la souffrance lente, eux, se
 *    LISENT sur l'arbre à chaque image et se rediraient sans fin.
 * 2. **Une souffrance retenue trop tôt se tait pour toujours.** Un arbre qui a
 *    un peu soif pendant dix ans avant de dépérir porte la même `causeLente`
 *    tout du long : retenir la cause dès qu'on la lit aurait fait manquer le
 *    seul moment qui compte, celui où elle franchit le seuil.
 */

import { describe, expect, it } from "vitest";
import type { GesteVisible } from "../../src/engine/actions";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { type FranchissementDeStade, type MortDeLaSemaine, tick } from "../../src/engine/tick";
import {
  type CauseMort,
  diametreInitialCm,
  LIBELLE_CAUSE,
  type TreeState,
} from "../../src/engine/trees";
import type { Snapshot, SnapshotTree } from "../../src/game/protocol";
import { arbreDuSnapshot, construireSnapshot } from "../../src/game/snapshot";
import {
  accumulerLesSuivis,
  CAUSE_AU_SINGULIER,
  type MemoireDesSuivis,
  SEUIL_SOUFFRANCE,
  suivisMorts,
} from "../../src/game/suivis";

const STATION: Station = { ...LIMON_RICHE.station, coteM: 12, voisinage: [], gibierParHa: 0 };
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/**
 * Un instantané VRAI, fabriqué par le moteur puis par `construireSnapshot`.
 *
 * Pas un simulacre : un objet partiel passe le test et casse le typecheck, ou
 * pire, passe les deux en mentant sur ce que le rendu reçoit vraiment. On part
 * donc d'un instantané complet et l'on ne remplace que les listes qui nous
 * intéressent.
 */
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

const ARBRE: TreeState = {
  id: 1,
  especeId: "prunus_armeniaca",
  x: 3,
  y: 4,
  ageWeeks: 520,
  heightM: 6,
  diametreCm: diametreInitialCm(6),
  stress: 1,
  alive: true,
  uptakeYearG: 10,
  fruitsKg: 0,
  fruitProgress: 0,
  bloomFrosted: false,
  hauteurElagueeM: 0,
  recepages: 0,
  teteTrogneM: 0,
  rootDepthCm: 80,
  pousseTendreM: 0.3,
  dommageHydraulique: 0,
  vigueur: 1,
  vigueurIndividuelle: 1,
  protege: false,
};

const arbre = (champs: Partial<TreeState> = {}): SnapshotTree =>
  arbreDuSnapshot({ ...ARBRE, ...champs }, 0);

function semaine(
  week: number,
  trees: SnapshotTree[],
  evenements: {
    gestes?: GesteVisible[];
    morts?: MortDeLaSemaine[];
    franchissements?: FranchissementDeStade[];
  } = {},
): Snapshot {
  return {
    ...BASE,
    week,
    trees,
    gestes: evenements.gestes ?? [],
    morts: evenements.morts ?? [],
    franchissements: evenements.franchissements ?? [],
  };
}

const mort = (id: number, cause: CauseMort): MortDeLaSemaine => ({
  id,
  x: 3,
  y: 4,
  especeId: "prunus_armeniaca",
  cause,
  heightM: 6,
});

const SUIVI = new Set([1]);
const VIDE: MemoireDesSuivis = new Map();

describe("ce qui n'est pas suivi ne fait pas de journal", () => {
  it("un ensemble vide ne rend rien, même une semaine chargée", () => {
    const { evenements } = accumulerLesSuivis(
      VIDE,
      semaine(10, [arbre()], {
        gestes: [{ type: "couper", ids: [1] }],
        morts: [mort(1, "secheresse")],
      }),
      new Set(),
    );
    expect(evenements).toEqual([]);
  });

  it("les arbres voisins ne s'invitent pas dans le journal de celui qu'on suit", () => {
    const { evenements } = accumulerLesSuivis(
      VIDE,
      semaine(10, [arbre(), arbre({ id: 2 })], {
        gestes: [{ type: "elaguer", ids: [2, 1] }],
      }),
      SUIVI,
    );
    expect(evenements.map((e) => e.idArbre)).toEqual([1]);
  });
});

describe("ce que le moteur a déjà nommé", () => {
  it("un geste subi est dit au passé, sous sa rubrique", () => {
    const { evenements } = accumulerLesSuivis(
      VIDE,
      semaine(7, [arbre()], { gestes: [{ type: "trogner", ids: [1] }] }),
      SUIVI,
    );
    expect(evenements).toHaveLength(1);
    expect(evenements[0]?.quoi).toBe("geste");
    expect(evenements[0]?.texte).toBe("étêté en trogne");
    expect(evenements[0]?.semaine).toBe(7);
  });

  it("le GIBIER passe par la même porte : le moteur le range dans les gestes", () => {
    const { evenements } = accumulerLesSuivis(
      VIDE,
      semaine(20, [arbre()], {
        gestes: [
          { type: "brouter", ids: [1] },
          { type: "frotter", ids: [1] },
        ],
      }),
      SUIVI,
    );
    expect(evenements.map((e) => e.quoi)).toEqual(["brout", "frottis"]);
  });

  it("un franchissement de stade se recopie, il ne se recalcule pas", () => {
    const { evenements } = accumulerLesSuivis(
      VIDE,
      semaine(60, [arbre()], {
        franchissements: [{ id: 1, deStade: "gaulis", versStade: "perchis" }],
      }),
      SUIVI,
    );
    expect(evenements[0]?.quoi).toBe("stade");
    expect(evenements[0]?.texte).toBe("passe de gaulis à perchis");
  });

  it("la mort arrive avec sa cause EN CLAIR, et au singulier", () => {
    const { evenements } = accumulerLesSuivis(
      VIDE,
      semaine(99, [], { morts: [mort(1, "secheresse")] }),
      SUIVI,
    );
    expect(evenements[0]?.quoi).toBe("mort");
    expect(evenements[0]?.texte).toBe("meurt de sécheresse");
  });

  it("chaque cause du moteur a sa forme au singulier, et aucune n'est vide", () => {
    for (const cause of Object.keys(LIBELLE_CAUSE) as CauseMort[]) {
      expect(CAUSE_AU_SINGULIER[cause]?.length).toBeGreaterThan(3);
    }
  });
});

describe("ce qui est un état ne se dit qu'une fois", () => {
  it("le gel des fleurs s'annonce, puis se tait tant qu'il dure", () => {
    const gele = semaine(15, [arbre({ bloomFrosted: true })]);
    const premier = accumulerLesSuivis(VIDE, gele, SUIVI);
    expect(premier.evenements.map((e) => e.quoi)).toEqual(["gel"]);
    const second = accumulerLesSuivis(premier.memoire, gele, SUIVI);
    expect(second.evenements).toEqual([]);
  });

  it("… et se redit l'année suivante, parce que c'est un autre gel", () => {
    const gele = semaine(15, [arbre({ bloomFrosted: true })]);
    const apres = accumulerLesSuivis(VIDE, gele, SUIVI);
    const degele = accumulerLesSuivis(
      apres.memoire,
      semaine(30, [arbre({ bloomFrosted: false })]),
      SUIVI,
    );
    expect(degele.evenements).toEqual([]);
    const encore = accumulerLesSuivis(
      degele.memoire,
      semaine(67, [arbre({ bloomFrosted: true })]),
      SUIVI,
    );
    expect(encore.evenements.map((e) => e.quoi)).toEqual(["gel"]);
  });

  it("une souffrance sous le seuil ne dit rien — et ne se fait pas oublier non plus", () => {
    const petiteSoif = semaine(20, [
      arbre({ causeLente: "secheresse", stressLent: SEUIL_SOUFFRANCE / 2 }),
    ]);
    const tue = accumulerLesSuivis(VIDE, petiteSoif, SUIVI);
    expect(tue.evenements).toEqual([]);
    // Le piège : si la cause avait été retenue sous le seuil, le jour où
    // l'arbre dépérit pour de bon n'aurait plus rien à annoncer.
    const vraiment = accumulerLesSuivis(
      tue.memoire,
      semaine(72, [arbre({ causeLente: "secheresse", stressLent: SEUIL_SOUFFRANCE * 3 })]),
      SUIVI,
    );
    expect(vraiment.evenements.map((e) => e.quoi)).toEqual(["souffre"]);
    expect(vraiment.evenements[0]?.texte).toBe("souffre : de sécheresse");
  });

  it("elle ne se redit pas chaque été, même quand le stress redescend l'hiver", () => {
    // Mesuré dans le navigateur avant correction : 149 arbres suivis
    // annonçaient « souffre : de sécheresse » à chaque instantané d'été, an
    // après an. `causeLente` est COLLANTE côté moteur ; c'est `stressLent` qui
    // respire avec la saison, et l'oubli sous le seuil rouvrait l'annonce.
    const ete = (week: number) =>
      semaine(week, [arbre({ causeLente: "secheresse", stressLent: 0.4 })]);
    const hiver = (week: number) =>
      semaine(week, [arbre({ causeLente: "secheresse", stressLent: 0.01 })]);
    let memoire: MemoireDesSuivis = VIDE;
    const dits: string[] = [];
    for (let an = 0; an < 5; an++) {
      for (const snap of [ete(an * 52 + 28), hiver(an * 52 + 50)]) {
        const tour = accumulerLesSuivis(memoire, snap, SUIVI);
        memoire = tour.memoire;
        dits.push(...tour.evenements.map((e) => e.texte));
      }
    }
    expect(dits).toEqual(["souffre : de sécheresse"]);
  });

  it("la souffrance qui dure ne se répète pas, celle qui CHANGE de cause se dit", () => {
    const soif = semaine(20, [arbre({ causeLente: "secheresse", stressLent: 0.5 })]);
    const un = accumulerLesSuivis(VIDE, soif, SUIVI);
    const deux = accumulerLesSuivis(un.memoire, soif, SUIVI);
    expect(deux.evenements).toEqual([]);
    const trois = accumulerLesSuivis(
      deux.memoire,
      semaine(40, [arbre({ causeLente: "ombre", stressLent: 0.5 })]),
      SUIVI,
    );
    expect(trois.evenements[0]?.texte).toBe("souffre : étouffé par l'ombre");
  });
});

describe("l'arbre qui disparaît", () => {
  it("un suivi qui quitte l'instantané sans mort rapportée est quand même dit", () => {
    const present = accumulerLesSuivis(VIDE, semaine(10, [arbre()]), SUIVI);
    const parti = accumulerLesSuivis(present.memoire, semaine(11, []), SUIVI);
    expect(parti.evenements.map((e) => e.texte)).toEqual(["a quitté la parcelle"]);
    // Et une seule fois : la mémoire sait qu'il n'est plus là.
    const encore = accumulerLesSuivis(parti.memoire, semaine(12, []), SUIVI);
    expect(encore.evenements).toEqual([]);
  });

  it("… mais pas quand la semaine dit DÉJÀ ce qui lui est arrivé", () => {
    const present = accumulerLesSuivis(VIDE, semaine(10, [arbre()]), SUIVI);
    const coupe = accumulerLesSuivis(
      present.memoire,
      semaine(11, [], { gestes: [{ type: "couper", ids: [1] }] }),
      SUIVI,
    );
    expect(coupe.evenements.map((e) => e.texte)).toEqual(["abattu"]);
  });
});

describe("les morts qui arrêtent le temps", () => {
  it("ne retiennent que les suivis, avec où regarder et pourquoi", () => {
    const morts = suivisMorts(
      semaine(50, [], { morts: [mort(2, "ombre"), mort(1, "chablis")] }),
      SUIVI,
    );
    expect(morts).toEqual([{ id: 1, x: 3, y: 4, cause: "chablis" }]);
  });
});
