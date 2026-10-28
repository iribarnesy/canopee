/**
 * Phénologie fruitière (docs/regles.md §7.2) sur la météo réelle de Dijon :
 * l'abricotier (floraison très précoce, atlas : « gel des fleurs = risque »)
 * perd régulièrement sa récolte aux gels tardifs ; le pommier (floraison
 * tardive) ne gèle pas. La pollinisation croisée (§7.5) : un pommier
 * auto-stérile isolé ne produit presque rien.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { cellIndexAt } from "../../src/engine/grid";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { FRICHE_LIMON } from "../../src/engine/stations";
import { servicePollinisation, type TickResult } from "../../src/engine/tick";

const STATION = { ...FRICHE_LIMON.station, coteM: 40, voisinage: [], phInitial: 7 };
const serie = serieMeteoPour("friche-limon");
if (!serie) throw new Error("série Dijon manquante");
const WEATHER = serieToWeeks(serie);

function run(
  actions: GameAction[],
  years: number,
  onWeek: (s: GameState, i: number, r: TickResult) => void,
) {
  let state = createGameState(STATION, rngStateFromSeed(3));
  for (let i = 0; i < years * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, actions);
    state = r.state;
    onWeek(state, i, r);
  }
  return state;
}

describe("gel tardif à Dijon (série réelle 1964→) : précoce vs tardif", () => {
  const actions: GameAction[] = [
    {
      type: "planter",
      week: 0,
      especeId: "prunus_armeniaca",
      positions: [
        { x: 10, y: 10 },
        { x: 14, y: 10 },
        { x: 10, y: 14 },
      ],
    },
    {
      type: "planter",
      week: 1,
      especeId: "malus_domestica",
      positions: [
        { x: 25, y: 25 },
        { x: 29, y: 25 },
        { x: 25, y: 29 },
      ],
    },
  ];
  let abricotGel = 0;
  let abricotFruit = 0;
  let pommeGel = 0;
  let pommeFruit = 0;
  run(actions, 20, (state, i) => {
    if (Math.floor(i / 52) < 7) return; // après l'entrée en production
    const w = i % 52;
    if (w === 27) {
      const kg = state.trees
        .filter((t) => t.especeId === "prunus_armeniaca")
        .reduce((s, t) => s + t.fruitsKg, 0);
      if (kg > 1) abricotFruit++;
      if (state.trees.some((t) => t.especeId === "prunus_armeniaca" && t.bloomFrosted))
        abricotGel++;
    }
    if (w === 38) {
      const kg = state.trees
        .filter((t) => t.especeId === "malus_domestica")
        .reduce((s, t) => s + t.fruitsKg, 0);
      if (kg > 1) pommeFruit++;
      if (state.trees.some((t) => t.especeId === "malus_domestica" && t.bloomFrosted)) pommeGel++;
    }
  });

  it("l'abricotier perd régulièrement des récoltes au gel, mais produit les bonnes années", () => {
    expect(abricotGel).toBeGreaterThanOrEqual(2);
    expect(abricotFruit).toBeGreaterThanOrEqual(5);
  });

  it("le pommier, à floraison tardive, ne gèle jamais sur cette période", () => {
    expect(pommeGel).toBe(0);
    expect(pommeFruit).toBeGreaterThanOrEqual(4);
  });
});

describe("pollinisation croisée (§7.5) et récolte (§10)", () => {
  it("un pommier auto-stérile isolé produit ~5× moins qu'un couple", () => {
    const runYield = (positions: { x: number; y: number }[]) => {
      const actions: GameAction[] = [
        { type: "planter", week: 0, especeId: "malus_domestica", positions },
      ];
      let bestKg = 0;
      run(actions, 10, (state, i) => {
        if (i % 52 === 38) {
          const first = state.trees.find((t) => t.id === 1);
          bestKg = Math.max(bestKg, first?.fruitsKg ?? 0);
        }
      });
      return bestKg;
    };
    const seul = runYield([{ x: 20, y: 20 }]);
    const couple = runYield([
      { x: 20, y: 20 },
      { x: 25, y: 20 },
    ]);
    expect(seul).toBeGreaterThan(0);
    expect(couple).toBeGreaterThan(4 * seul);
  });

  it("récolter rapporte ; ne pas récolter = fruits perdus après la fenêtre", () => {
    const base: GameAction[] = [
      {
        type: "planter",
        week: 0,
        especeId: "malus_domestica",
        positions: [
          { x: 20, y: 20 },
          { x: 25, y: 20 },
        ],
      },
      // Un verger se protège du gibier : sans manchon, des pommiers (parmi
      // les essences les plus appétentes) ne montent jamais à fruit. Ce test
      // porte sur la récolte, pas sur le broutage — on met donc l'arboriculteur
      // dans les conditions où il travaille vraiment.
      { type: "proteger", week: 1, treeIds: [1, 2] },
    ];
    // Les fruits mûrissent pendant le tick de la semaine 38 : on récolte la
    // semaine suivante (les actions s'exécutent avant le tick).
    const harvestWeek = 8 * 52 + 39;
    const avecRecolte: GameAction[] = [
      ...base,
      { type: "recolter", week: harvestWeek, treeIds: [1, 2] },
    ];
    let treasuryAvec = 0;
    let treasurySans = 0;
    let fruitsApresFenetre = -1;
    run(avecRecolte, 9, (state, i) => {
      if (i === harvestWeek) treasuryAvec = state.economy.treasuryEur;
    });
    run(base, 9, (state, i) => {
      if (i === harvestWeek) treasurySans = state.economy.treasuryEur;
      if (i === 8 * 52 + 42) {
        fruitsApresFenetre = state.trees.reduce((s, t) => s + t.fruitsKg, 0);
      }
    });
    // Le verger nu récolte peu — sans habitat pour les pollinisateurs, la
    // nouaison plafonne (§7.4). Ce qui est testé ici, c'est que récolter
    // rapporte et que ne pas récolter perd tout.
    expect(treasuryAvec).toBeGreaterThan(treasurySans + 5);
    expect(fruitsApresFenetre).toBe(0); // récolte non faite = perdue (§10)
  });
});

describe("service de pollinisation (§7.4, critère G4)", () => {
  /**
   * **cet essai avait choisi trois espèces qui ne nourrissent personne.**
   *
   * Son « environnement diversifié » était une haie de noisetier, chêne
   * pubescent et bouleau. Les trois sont **anémophiles** : leur pollen part au
   * vent, aucun insecte ne se déplace pour eux. L'essai passait quand même,
   * parce que le service ne lisait que l'habitat — lequel compte la richesse
   * en essences. Le moteur affirmait donc que planter trois arbres pollinisés
   * par le vent améliore la nouaison d'un verger de 15 %.
   *
   * Depuis le calendrier des fleurs (#70), le service demande un gîte **et** une
   * table, et la table de cette haie-là est vide : mesuré, elle ne rend plus
   * que +0,9 %. Ce n'est pas une régression, c'est la correction d'une
   * affirmation fausse.
   *
   * L'essai garde donc son énoncé — un verger accompagné produit plus qu'un
   * verger nu — et se donne le dispositif qui peut le montrer, avec le bras
   * anémophile conservé comme **témoin** : c'est lui qui sépare « des voisins »
   * de « des voisins qui nourrissent ».
   */
  const positions = [
    { x: 20, y: 20 },
    { x: 25, y: 20 },
  ];
  /** Les mêmes six emplacements dans les trois bras : seules les espèces changent. */
  const EMPLACEMENTS: [number, number][][] = [
    [
      [14, 20],
      [14, 24],
    ],
    [
      [14, 16],
      [31, 20],
    ],
    [
      [31, 16],
      [31, 24],
    ],
  ];
  const haie = (especes: readonly string[]): GameAction[] =>
    especes.map((especeId, i) => ({
      type: "planter",
      week: 0,
      especeId,
      positions: (EMPLACEMENTS[i] ?? []).map(([x, y]) => ({ x, y })),
    }));

  const DIMS = { widthM: STATION.coteM, heightM: STATION.coteM };
  /** Semaine de récolte du pommier : c'est là que le service multiplie la récolte. */
  const RECOLTE_POMMIER = 38;
  /**
   * La meilleure récolte d'un pommier, et le meilleur service de pollinisation
   * qu'ils aient eu une semaine de récolte : la nouaison que le moteur applique,
   * lue là où il la lit (`servicePollinisation`).
   */
  const recolte = (accompagnement: GameAction[]): { kg: number; nouaison: number } => {
    const actions: GameAction[] = [
      { type: "planter", week: 0, especeId: "malus_domestica", positions },
      { type: "proteger", week: 1, treeIds: [1, 2] },
      ...accompagnement,
    ];
    let kg = 0;
    let nouaison = 0;
    run(actions, 12, (state, i, r) => {
      for (const t of state.trees) {
        if (t.especeId !== "malus_domestica") continue;
        kg = Math.max(kg, t.fruitsKg);
        if (i % 52 === RECOLTE_POMMIER && t.alive) {
          const ici = r.pollinisateurs[cellIndexAt(DIMS, t.x, t.y)] ?? 0;
          nouaison = Math.max(nouaison, servicePollinisation(ici));
        }
      }
    });
    return { kg, nouaison };
  };

  const nuBras = recolte([]);
  // Noisetier, chêne, bouleau : trois essences, trois strates, zéro nectar.
  const anemophileBras = recolte(haie(["corylus_avellana", "quercus_pubescens", "betula_pendula"]));
  // Prunellier (mars), aubépine (mai), ronce (juin à août) : même nombre de
  // tiges, mêmes emplacements, et de quoi manger d'un bout à l'autre de la
  // saison. Les trois mûrissent en deux à huit ans, donc elles fleurissent
  // avant la fin du banc.
  const mellifereBras = recolte(haie(["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus"]));
  const nu = nuBras.kg;
  const anemophile = anemophileBras.kg;
  const mellifere = mellifereBras.kg;

  it("une haie qui NOURRIT fait mieux nouer le verger", () => {
    // Relevé : nu 11,52 kg, anémophile 11,62 kg (+0,9 %), mellifère 14,74 kg
    // (+28,0 %). Le banc du verger de `floraison.test.ts`, dispositif tout
    // différent — quarante mètres de côté, deux haies complètes, vingt-deux
    // ans —, donne +28,2 %. Deux bancs indépendants, le même chiffre.
    // Relevé après G1 (#391), graine 3 : nu 4,79 kg, anémophile 5,12 kg,
    // mellifère 6,96 kg (+45 %) ; les pommiers se défeuillent à la soif six
    // étés sur neuf, et les récoltes baissent dans les trois bras (8,63 /
    // 8,74 / 11,54 kg sans G1, sur la tête du lot).
    expect(mellifere).toBeGreaterThan(1.15 * nu);
  });

  it("une haie qui n'offre que le gîte ne le fait PAS, et c'est le témoin", () => {
    // Elle abrite autant — même nombre de tiges, mêmes strates, même richesse
    // en essences — et elle ne nourrit rien. Le service étant le minimum du
    // gîte et de la table, c'est la table qui décide ici.
    //
    // **Réécrit sur son critère (#391, G1) : la nouaison se lit sur le service
    // de pollinisation, pas sur la récolte.** La récolte suit aussi la taille
    // du pommier, et le gîte de la haie loge des auxiliaires qui freinent les
    // ravageurs (G2, G3). Depuis que la soif défeuille les pommiers six étés
    // sur neuf sur cette série (vitesse de cavitation de Walthert, 0,16) et
    // qu'un arbre défeuillé ne refait pas ses réserves pendant un an (Bréda et
    // al. 2006), le stress des ravageurs ne cicatrise plus entre deux
    // défeuillaisons : à onze ans, graine 3, 1,95 point sur les pommiers du
    // verger nu, 0,62 près de la haie anémophile, 2,45 m contre 2,54, et
    // 4,79 kg contre 5,12 (+7 %), pour un service de pollinisation identique
    // (0,001 d'insectes dans les deux bras). La haie anémophile protège
    // mieux le verger ; elle ne le fait pas mieux nouer, et c'est ce que le
    // témoin dit. La borne ne bouge pas.
    expect(anemophileBras.nouaison).toBeLessThan(1.05 * nuBras.nouaison);
    expect(mellifere).toBeGreaterThan(1.1 * anemophile);
  });
});
