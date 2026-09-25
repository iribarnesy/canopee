/**
 * **Le journal d'un arbre suivi** (#149).
 *
 * « Je plante des abricotiers, je veux surveiller très précisément ce qui leur
 * arrive — pas qu'ils meurent sans que je comprenne rien. »
 *
 * Ce que ces essais défendent tient en deux points, et les deux sont des
 * pièges qu'on ne voit pas à l'écran :
 *
 * 1. **Ce qui est un événement se recopie, ce qui est un état se compare.** Les
 *    gestes, les morts et les franchissements sont accumulés par le worker
 *    jusqu'à l'instantané ; le gel des fleurs et la souffrance lente, eux, se
 *    **lisent** sur l'arbre à chaque image et se rediraient sans fin.
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
import { causeDite } from "../../src/game/mots";
import type { Snapshot, SnapshotTree } from "../../src/game/protocol";
import { arbreDuSnapshot, construireSnapshot } from "../../src/game/snapshot";
import {
  accumulerLesSuivis,
  ajouterAuJournal,
  type EvenementSuivi,
  grouperLesSuivis,
  type LigneDeSuivi,
  type MemoireDesSuivis,
  SEUIL_SOUFFRANCE,
  suivisMorts,
} from "../../src/game/suivis";

const STATION: Station = { ...LIMON_RICHE.station, coteM: 12, voisinage: [], gibierParHa: 0 };
const WEATHER = syntheticYear(LIMON_RICHE.climat);

/**
 * Un instantané **vrai**, fabriqué par le moteur puis par `construireSnapshot`.
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

const VIDE: MemoireDesSuivis = new Map();

/**
 * Dépouiller une semaine entière, comme le worker le fait.
 *
 * L'instantané **est** un porteur de journal et porte ses arbres : depuis #225
 * la fonction prend les deux séparément, pour que le worker n'ait pas à
 * fabriquer un instantané afin de dépouiller une semaine qu'il vient de
 * simuler. Les essais, eux, partent d'un instantané vrai.
 */
const depouiller = (memoire: MemoireDesSuivis, snap: Snapshot) =>
  accumulerLesSuivis(memoire, snap.week, snap, snap.trees);

describe("rien n'est filtré : c'est tout le lot de #225", () => {
  it("une semaine chargée est retenue même si personne n'est suivi", () => {
    // *« Je voulais voir pourquoi mon pommier était mort a posteriori, c'est pas
    // possible — j'ai commencé à le suivre après qu'il soit mort. »* La fonction
    // commençait par `if (suivis.size === 0) return` : sans abonné, rien n'était
    // même regardé, et un arbre n'avait par construction aucun passé.
    const { evenements } = depouiller(
      VIDE,
      semaine(10, [arbre()], {
        gestes: [{ type: "couper", ids: [1] }],
        morts: [mort(1, "secheresse")],
      }),
    );
    expect(evenements.map((e) => e.texte)).toEqual(["abattu", "meurt de sécheresse"]);
  });

  it("chaque arbre garde ce qui lui arrive, sous son propre identifiant", () => {
    // Le tri par arbre se fait à la lecture : ce qui compte ici est qu'aucun
    // des deux ne soit jeté, et que les lignes ne se mélangent pas.
    const { evenements } = depouiller(
      VIDE,
      semaine(10, [arbre(), arbre({ id: 2 })], {
        gestes: [{ type: "elaguer", ids: [2, 1] }],
      }),
    );
    expect(evenements.map((e) => e.idArbre)).toEqual([2, 1]);
    expect(new Set(evenements.map((e) => e.texte))).toEqual(new Set(["élagué"]));
  });
});

describe("ce que le moteur a déjà nommé", () => {
  it("un geste subi est dit au passé, sous sa rubrique", () => {
    const { evenements } = depouiller(
      VIDE,
      semaine(7, [arbre()], { gestes: [{ type: "trogner", ids: [1] }] }),
    );
    expect(evenements).toHaveLength(1);
    expect(evenements[0]?.quoi).toBe("geste");
    expect(evenements[0]?.texte).toBe("étêté en trogne");
    expect(evenements[0]?.semaine).toBe(7);
  });

  it("le GIBIER passe par la même porte : le moteur le range dans les gestes", () => {
    const { evenements } = depouiller(
      VIDE,
      semaine(20, [arbre()], {
        gestes: [
          { type: "brouter", ids: [1] },
          { type: "frotter", ids: [1] },
        ],
      }),
    );
    expect(evenements.map((e) => e.quoi)).toEqual(["brout", "frottis"]);
  });

  it("un franchissement de stade se recopie, il ne se recalcule pas", () => {
    const { evenements } = depouiller(
      VIDE,
      semaine(60, [arbre()], {
        franchissements: [{ id: 1, deStade: "gaulis", versStade: "perchis" }],
      }),
    );
    expect(evenements[0]?.quoi).toBe("stade");
    expect(evenements[0]?.texte).toBe("passe de gaulis à perchis");
  });

  it("la mort arrive avec sa cause EN CLAIR, et au singulier", () => {
    const { evenements } = depouiller(VIDE, semaine(99, [], { morts: [mort(1, "secheresse")] }));
    expect(evenements[0]?.quoi).toBe("mort");
    expect(evenements[0]?.texte).toBe("meurt de sécheresse");
  });

  it("chaque cause du moteur a sa forme accordable, et aucune n'est vide", () => {
    for (const cause of Object.keys(LIBELLE_CAUSE) as CauseMort[]) {
      expect(causeDite(cause).length, cause).toBeGreaterThan(3);
    }
  });
});

describe("ce qui est un état ne se dit qu'une fois", () => {
  it("le gel des fleurs s'annonce, puis se tait tant qu'il dure", () => {
    const gele = semaine(15, [arbre({ bloomFrosted: true })]);
    const premier = depouiller(VIDE, gele);
    expect(premier.evenements.map((e) => e.quoi)).toEqual(["gel"]);
    const second = depouiller(premier.memoire, gele);
    expect(second.evenements).toEqual([]);
  });

  it("… et se redit l'année suivante, parce que c'est un autre gel", () => {
    const gele = semaine(15, [arbre({ bloomFrosted: true })]);
    const apres = depouiller(VIDE, gele);
    const degele = depouiller(apres.memoire, semaine(30, [arbre({ bloomFrosted: false })]));
    expect(degele.evenements).toEqual([]);
    const encore = depouiller(degele.memoire, semaine(67, [arbre({ bloomFrosted: true })]));
    expect(encore.evenements.map((e) => e.quoi)).toEqual(["gel"]);
  });

  it("une souffrance sous le seuil ne dit rien — et ne se fait pas oublier non plus", () => {
    const petiteSoif = semaine(20, [
      arbre({ causeLente: "secheresse", stressLent: SEUIL_SOUFFRANCE / 2 }),
    ]);
    const tue = depouiller(VIDE, petiteSoif);
    expect(tue.evenements).toEqual([]);
    // Le piège : si la cause avait été retenue sous le seuil, le jour où
    // l'arbre dépérit pour de bon n'aurait plus rien à annoncer.
    const vraiment = depouiller(
      tue.memoire,
      semaine(72, [arbre({ causeLente: "secheresse", stressLent: SEUIL_SOUFFRANCE * 3 })]),
    );
    expect(vraiment.evenements.map((e) => e.quoi)).toEqual(["souffre"]);
    expect(vraiment.evenements[0]?.texte).toBe("souffre : de sécheresse");
  });

  it("elle ne se redit pas chaque été, même quand le stress redescend l'hiver", () => {
    // Mesuré dans le navigateur avant correction : 149 arbres suivis
    // annonçaient « souffre : de sécheresse » à chaque instantané d'été, an
    // après an. `causeLente` est **collante** côté moteur ; c'est `stressLent` qui
    // respire avec la saison, et l'oubli sous le seuil rouvrait l'annonce.
    const ete = (week: number) =>
      semaine(week, [arbre({ causeLente: "secheresse", stressLent: 0.4 })]);
    const hiver = (week: number) =>
      semaine(week, [arbre({ causeLente: "secheresse", stressLent: 0.01 })]);
    let memoire: MemoireDesSuivis = VIDE;
    const dits: string[] = [];
    for (let an = 0; an < 5; an++) {
      for (const snap of [ete(an * 52 + 28), hiver(an * 52 + 50)]) {
        const tour = depouiller(memoire, snap);
        memoire = tour.memoire;
        dits.push(...tour.evenements.map((e) => e.texte));
      }
    }
    expect(dits).toEqual(["souffre : de sécheresse"]);
  });

  it("la souffrance qui dure ne se répète pas, celle qui CHANGE de cause se dit", () => {
    const soif = semaine(20, [arbre({ causeLente: "secheresse", stressLent: 0.5 })]);
    const un = depouiller(VIDE, soif);
    const deux = depouiller(un.memoire, soif);
    expect(deux.evenements).toEqual([]);
    const trois = depouiller(
      deux.memoire,
      semaine(40, [arbre({ causeLente: "ombre", stressLent: 0.5 })]),
    );
    expect(trois.evenements[0]?.texte).toBe("souffre : étouffé par l'ombre");
  });
});

describe("l'arbre qui disparaît", () => {
  it("un suivi qui quitte l'instantané sans mort rapportée est quand même dit", () => {
    const present = depouiller(VIDE, semaine(10, [arbre()]));
    const parti = depouiller(present.memoire, semaine(11, []));
    expect(parti.evenements.map((e) => e.texte)).toEqual(["a quitté la parcelle"]);
    // Et une seule fois : la mémoire sait qu'il n'est plus là.
    const encore = depouiller(parti.memoire, semaine(12, []));
    expect(encore.evenements).toEqual([]);
  });

  it("… mais pas quand la semaine dit DÉJÀ ce qui lui est arrivé", () => {
    const present = depouiller(VIDE, semaine(10, [arbre()]));
    const coupe = depouiller(
      present.memoire,
      semaine(11, [], { gestes: [{ type: "couper", ids: [1] }] }),
    );
    expect(coupe.evenements.map((e) => e.texte)).toEqual(["abattu"]);
  });
});

describe("les répétitions qu'on regroupe pour pouvoir lire", () => {
  const ev = (semaine: number, texte: string, idArbre = 1): EvenementSuivi => ({
    semaine,
    idArbre,
    quoi: "brout",
    texte,
  });

  it("les identiques qui se suivent font une ligne, avec leur compte et leur plage", () => {
    const lignes = grouperLesSuivis([
      ev(8, "brouté par le gibier"),
      ev(7, "brouté par le gibier"),
      ev(4, "brouté par le gibier"),
    ]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.fois).toBe(3);
    expect(lignes[0]?.semaine).toBe(8);
    expect(lignes[0]?.depuisSemaine).toBe(4);
  });

  it("… mais seulement CEUX QUI SE SUIVENT : l'histoire reste l'histoire", () => {
    const lignes = grouperLesSuivis([
      ev(9, "brouté par le gibier"),
      ev(8, "élagué"),
      ev(7, "brouté par le gibier"),
    ]);
    expect(lignes.map((l) => `${l.texte}×${l.fois}`)).toEqual([
      "brouté par le gibier×1",
      "élagué×1",
      "brouté par le gibier×1",
    ]);
  });

  it("deux arbres ne se regroupent jamais ensemble", () => {
    const lignes = grouperLesSuivis([
      ev(9, "brouté par le gibier", 1),
      ev(9, "brouté par le gibier", 2),
    ]);
    expect(lignes.map((l) => l.idArbre)).toEqual([1, 2]);
  });
});

describe("les morts qui arrêtent le temps", () => {
  it("ne retiennent que les suivis, avec où regarder et pourquoi", () => {
    // Le seul endroit qui filtre encore, et il le doit : c'est la caméra qui
    // va se poser sur l'arbre, pas le journal — on ne cadre que ce qu'on suit.
    const morts = suivisMorts(
      semaine(50, [], { morts: [mort(2, "ombre"), mort(1, "chablis")] }),
      new Set([1]),
    );
    expect(morts).toEqual([{ id: 1, x: 3, y: 4, cause: "chablis" }]);
  });
});

describe("l'histoire s'écrit groupée, pas seulement relue groupée (#225)", () => {
  const brout = (semaine: number): EvenementSuivi => ({
    semaine,
    idArbre: 1,
    quoi: "brout",
    texte: "brouté par le gibier",
  });

  it("dix ans de brouts hebdomadaires tiennent en une ligne", () => {
    // Mesuré dans le navigateur avant de l'écrire : sur trente ans de
    // maturation, un seul plant accumulait 806 lignes, dont 800 brouts. Le
    // worker garde l'histoire de tous les arbres depuis toujours — ce qui n'est
    // pas écrit est ce qui ne pèse rien.
    const lignes: LigneDeSuivi[] = [];
    for (let k = 0; k < 520; k++) ajouterAuJournal(lignes, brout(k));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.fois).toBe(520);
    expect(lignes[0]?.depuisSemaine).toBe(0);
    expect(lignes[0]?.semaine).toBe(519);
  });

  it("la plage est la même dans les deux sens de lecture", () => {
    // Le worker écrit du passé vers le présent ; le volet relit du présent vers
    // le passé. Une règle qui ne marcherait que dans un sens donnerait deux
    // dates différentes pour le même groupe.
    const montant: LigneDeSuivi[] = [];
    for (const e of [brout(10), brout(11), brout(12)]) ajouterAuJournal(montant, e);
    const descendant = grouperLesSuivis([brout(12), brout(11), brout(10)]);
    expect(montant[0]?.semaine).toBe(12);
    expect(montant[0]?.depuisSemaine).toBe(10);
    expect(descendant[0]?.semaine).toBe(12);
    expect(descendant[0]?.depuisSemaine).toBe(10);
  });

  it("ce qui s'intercale coupe le groupe : on ne perd pas l'histoire", () => {
    const lignes: LigneDeSuivi[] = [];
    for (const e of [
      brout(1),
      brout(2),
      { semaine: 3, idArbre: 1, quoi: "gel" as const, texte: "fleurs grillées par un gel tardif" },
      brout(4),
    ]) {
      ajouterAuJournal(lignes, e);
    }
    expect(lignes.map((l) => `${l.quoi}×${l.fois}`)).toEqual(["brout×2", "gel×1", "brout×1"]);
  });
});
