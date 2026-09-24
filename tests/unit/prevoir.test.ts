import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  ecorceRecoltable,
  type GameAction,
  prevoirAction,
} from "../../src/engine/actions";
import { syntheticYear, type WeekWeather } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * `prevoirAction` répond « ce geste passerait-il ? » sans rien changer, pour
 * que le viseur du jeu puisse le dire avant le clic (#139).
 *
 * Elle le fait en appelant `applyAction` et en ne gardant que les refus. Tout
 * repose donc sur une propriété : `applyAction` ne modifie pas l'état qu'on lui
 * donne, elle en rend un nouveau. Cet essai est ce qui fait de cette propriété
 * un **contrat** plutôt qu'un usage — et le jour où une branche modifiera un
 * tableau en place, il tombera sur le commit fautif, pas six mois plus tard au
 * chargement d'une sauvegarde.
 *
 * Deux exigences qu'un essai naïf raterait :
 *
 * — Chaque type d'action doit être éprouvé sur son chemin de **travail**, pas
 *   seulement sur son refus. Un geste refusé rend l'état d'entrée tel quel et
 *   passe donc trivialement : c'est le code qui écrit qui pourrait muter. Un
 *   premier jet de cet essai « passait » sur onze actions dont le corps n'avait
 *   jamais tourné.
 * — Chaque cas déclare ce qu'il attend (`travail` ou `refus`) et on le vérifie.
 *   Sans ça, un cas qui cesse un jour de faire travailler l'action — une espèce
 *   qui change, une fenêtre qui se déplace — se met à ne plus rien éprouver, en
 *   silence et en vert.
 *
 * La table est indexée par `GameAction["type"]` : une action neuve qu'on
 * oublierait d'y inscrire ne compile pas.
 */

interface Cas {
  nom: string;
  state: GameState;
  action: GameAction;
  /** `travail` : l'action doit aboutir et changer l'état. `refus` : elle doit refuser. */
  attendu: "travail" | "refus";
}

/** Premier chemin où deux valeurs divergent, pour que l'échec **désigne** le champ muté. */
function premiereDivergence(a: unknown, b: unknown, chemin = ""): string | null {
  if (a === b) return null;
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    return `${chemin} : ${a} → ${b}`;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return `${chemin} : ${String(a)} → ${String(b)}`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${chemin}.length : ${a.length} → ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = premiereDivergence(a[i], b[i], `${chemin}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const d = premiereDivergence(ra[k], rb[k], `${chemin}.${k}`);
    if (d) return d;
  }
  return null;
}

function avance(s: GameState, semaines: number, meteo: WeekWeather[]): GameState {
  let e = s;
  for (let i = 0; i < semaines; i++) {
    const w = meteo[e.week % meteo.length];
    if (!w) throw new Error("météo manquante");
    e = tick(e, w).state;
  }
  return e;
}

/**
 * Parcelle de 40 m plutôt que les 100 m des stations : une écriture en place se
 * verrait aussi bien sur une petite grille, et la taille normale portait le
 * coût de cet essai à trois minutes et demie — assez pour faire déborder le
 * hook. Ce qui compte ici est d'**atteindre** chaque chemin de travail, pas de
 * simuler un peuplement crédible.
 */
const COTE_M = 40;

function parcelle(
  sc: StationClimat,
  plantations: { especeId: string; count: number }[],
  annees: number,
  seed = 7,
): GameState {
  let s = createGameState(
    { ...sc.station, coteM: COTE_M, gibierParHa: 0, voisinage: [] },
    rngStateFromSeed(seed),
  );
  for (const p of plantations) s = plantScattered(s, p.especeId, p.count, 0.3);
  return avance(s, annees * 52, syntheticYear(sc.climat));
}

let CAS: Record<GameAction["type"], Cas[]>;

beforeAll(() => {
  const meteo = syntheticYear(LIMON_RICHE.climat);

  // Une parcelle vieille et peuplée : grilles pleines, arbres nombreux, c'est
  // là qu'une écriture en place se verrait.
  const vieux = parcelle(
    LIMON_RICHE,
    [
      { especeId: "juglans_regia", count: 6 },
      { especeId: "carpinus_betulus", count: 6 },
      { especeId: "corylus_avellana", count: 6 },
    ],
    20,
  );
  const c = vieux.station.coteM / 2;
  const w = vieux.week;
  const vivants = vieux.trees.filter((t) => t.alive);
  const ids = vivants.slice(0, 4).map((t) => t.id);
  // Le charme rejette de souche : trogner et receper ont besoin de lui, le
  // noyer les refuserait tous les deux.
  const charmes = vivants
    .filter((t) => t.especeId === "carpinus_betulus")
    .slice(0, 3)
    .map((t) => t.id);

  const avecCdi = applyAction(vieux, { type: "embaucher", week: w, contrat: "cdi" }).state;
  const avecBroyat = applyAction(vieux, {
    type: "couper",
    week: w,
    treeIds: ids,
    devenir: "broyer",
  }).state;
  // Du bois laissé sur place, puis une semaine pour qu'il se couche au sol.
  const coupeLaissee = applyAction(vieux, {
    type: "couper",
    week: w,
    treeIds: ids,
    devenir: "laisser",
  }).state;
  const avecBois = avance(coupeLaissee, 1, meteo);
  const premierCoupe = vieux.trees.find((t) => t.id === ids[0]);

  // Des arbres encore à portée de dent : passé 1,5 m, protéger est refusé.
  const jeune = parcelle(LIMON_RICHE, [{ especeId: "juglans_regia", count: 8 }], 1);
  const petits = jeune.trees
    .filter((t) => t.alive && t.heightM <= 1.5)
    .slice(0, 4)
    .map((t) => t.id);

  // Une parcelle **nue** : l'engin y manœuvre (labourer), et le labour ouvre le
  // sol assez pour qu'un semis prenne place.
  const nu = parcelle(LIMON_RICHE, [], 3);
  const cn = nu.station.coteM / 2;
  const versSemis = (41 - (nu.week % 52) + 52) % 52;
  const nuEnSaison = avance(nu, versSemis, meteo);
  const laboure = applyAction(nuEnSaison, {
    type: "labourer",
    week: nuEnSaison.week,
    x: cn,
    y: cn,
    rayonM: 12,
  }).state;
  const seme = applyAction(laboure, {
    type: "semer",
    week: laboure.week,
    x: cn,
    y: cn,
    rayonM: 12,
    cultureId: "triticum_aestivum",
  }).state;
  const mur = avance(seme, 30, meteo);

  // Un fourré **voulu**, plutôt que l'endroit où le semis dispersé est tombé :
  // vingt-cinq tiges à 1,3 m, sous les 2,2 m de large de l'engin, donc aucun
  // couloir dans aucune direction. Un premier jet mettait ce cas au milieu de
  // la parcelle boisée ; sur une parcelle réduite l'engin s'y est mis à passer,
  // et le cas a cessé d'éprouver quoi que ce soit — en vert.
  const centreFourre = 10;
  const positionsFourre: { x: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      positionsFourre.push({ x: centreFourre + i * 1.3, y: centreFourre + j * 1.3 });
    }
  }
  const fourre = applyAction(nu, {
    type: "planter",
    week: nu.week,
    especeId: "corylus_avellana",
    positions: positionsFourre,
  }).state;
  const cf = centreFourre + 2 * 1.3;

  // Le chêne-liège ne tient pas sur le limon — il y meurt en moins de dix ans.
  // Il faut la lande sableuse, et trente ans : l'écorce ne se lève pas avant
  // vingt-cinq (atlas, `ecorce.premierAge`).
  const lieges = parcelle(LANDE_SECHE, [{ especeId: "quercus_suber", count: 8 }], 30);
  const liegesRecoltables = lieges.trees
    .filter((t) => t.alive && ecorceRecoltable(t, lieges.week))
    .slice(0, 3)
    .map((t) => t.id);

  // Des pommiers en fruits : la semaine 39 de l'année est celle qui les porte.
  const pommiers = parcelle(LIMON_RICHE, [{ especeId: "malus_domestica", count: 8 }], 12);
  const enFruits = avance(pommiers, (39 - (pommiers.week % 52) + 52) % 52, meteo);
  const pIds = enFruits.trees
    .filter((t) => t.alive)
    .slice(0, 4)
    .map((t) => t.id);

  CAS = {
    planter: [
      {
        nom: "une position libre",
        state: vieux,
        action: {
          type: "planter",
          week: w,
          especeId: "quercus_pubescens",
          positions: [{ x: 3, y: 3 }],
        },
        attendu: "travail",
      },
      {
        nom: "collé à un arbre vivant",
        state: vieux,
        action: {
          type: "planter",
          week: w,
          especeId: "quercus_pubescens",
          positions: [{ x: vivants[0]?.x ?? 0, y: vivants[0]?.y ?? 0 }],
        },
        attendu: "refus",
      },
    ],
    couper: (["vendre", "epandre", "broyer", "laisser"] as const).map((devenir) => ({
      nom: `devenir ${devenir}`,
      state: vieux,
      action: { type: "couper", week: w, treeIds: ids, devenir } as GameAction,
      attendu: "travail" as const,
    })),
    recolter: [
      {
        nom: "des pommiers en fruits",
        state: enFruits,
        action: { type: "recolter", week: enFruits.week, treeIds: pIds },
        attendu: "travail",
      },
      {
        nom: "des arbres sans fruits",
        state: vieux,
        action: { type: "recolter", week: w, treeIds: ids },
        attendu: "refus",
      },
    ],
    embaucher: [
      {
        nom: "un CDI",
        state: vieux,
        action: { type: "embaucher", week: w, contrat: "cdi" },
        attendu: "travail",
      },
      {
        nom: "un saisonnier",
        state: vieux,
        action: { type: "embaucher", week: w, contrat: "saisonnier", semaines: 4 },
        attendu: "travail",
      },
    ],
    licencier: [
      {
        nom: "avec un CDI en poste",
        state: avecCdi,
        action: { type: "licencier", week: w },
        attendu: "travail",
      },
      {
        nom: "sans personne à licencier",
        state: vieux,
        action: { type: "licencier", week: w },
        attendu: "refus",
      },
    ],
    chauler: [
      {
        nom: "un disque",
        state: vieux,
        action: { type: "chauler", week: w, x: c, y: c, rayonM: 8 },
        attendu: "travail",
      },
    ],
    leverEcorce: [
      {
        nom: "des chênes-lièges de trente ans",
        state: lieges,
        action: { type: "leverEcorce", week: lieges.week, treeIds: liegesRecoltables },
        attendu: "travail",
      },
      {
        nom: "une espèce sans écorce à lever",
        state: vieux,
        action: { type: "leverEcorce", week: w, treeIds: ids },
        attendu: "refus",
      },
    ],
    eclaircir: [
      {
        nom: "une zone dense",
        state: vieux,
        action: {
          type: "eclaircir",
          week: w,
          x: c,
          y: c,
          rayonM: 10,
          densiteCibleParHa: 80,
          critere: "parLeBas",
          devenir: "vendre",
        },
        attendu: "travail",
      },
      {
        nom: "une zone déjà claire",
        state: nu,
        action: {
          type: "eclaircir",
          week: nu.week,
          x: cn,
          y: cn,
          rayonM: 10,
          densiteCibleParHa: 80,
          critere: "parLeBas",
          devenir: "vendre",
        },
        attendu: "refus",
      },
    ],
    elaguer: [
      {
        nom: "quatre arbres",
        state: vieux,
        action: { type: "elaguer", week: w, treeIds: ids, hauteurM: 4 },
        attendu: "travail",
      },
    ],
    epandreBrf: [
      {
        nom: "avec du broyat en stock",
        state: avecBroyat,
        action: { type: "epandreBrf", week: w, x: c, y: c, rayonM: 10, part: 1 },
        attendu: "travail",
      },
      {
        nom: "le tas est vide",
        state: vieux,
        action: { type: "epandreBrf", week: w, x: c, y: c, rayonM: 10, part: 1 },
        attendu: "refus",
      },
    ],
    fertiliser: [
      {
        nom: "minéral",
        state: vieux,
        action: {
          type: "fertiliser",
          week: w,
          x: c,
          y: c,
          rayonM: 10,
          forme: "mineral",
          doseKgNHa: 100,
        },
        attendu: "travail",
      },
      {
        nom: "fumier",
        state: vieux,
        action: {
          type: "fertiliser",
          week: w,
          x: c,
          y: c,
          rayonM: 10,
          forme: "fumier",
          doseKgNHa: 100,
        },
        attendu: "travail",
      },
      {
        nom: "au-delà de la dose maximale",
        state: vieux,
        action: {
          type: "fertiliser",
          week: w,
          x: c,
          y: c,
          rayonM: 10,
          forme: "mineral",
          doseKgNHa: 400,
        },
        attendu: "refus",
      },
    ],
    trogner: [
      {
        nom: "des charmes, qui rejettent",
        state: vieux,
        action: { type: "trogner", week: w, treeIds: charmes, hauteurTeteM: 2 },
        attendu: "travail",
      },
      {
        nom: "des noyers, qui ne rejettent pas",
        state: vieux,
        action: { type: "trogner", week: w, treeIds: ids, hauteurTeteM: 2 },
        attendu: "refus",
      },
    ],
    chasser: [
      { nom: "une battue", state: vieux, action: { type: "chasser", week: w }, attendu: "travail" },
    ],
    cloturer: [
      {
        nom: "un disque",
        state: vieux,
        action: { type: "cloturer", week: w, x: c, y: c, rayonM: 8 },
        attendu: "travail",
      },
    ],
    labourer: [
      {
        nom: "une parcelle nue",
        state: nu,
        action: { type: "labourer", week: nu.week, x: cn, y: cn, rayonM: 12 },
        attendu: "travail",
      },
      {
        nom: "dans un fourré, où l'engin ne passe pas",
        state: fourre,
        action: { type: "labourer", week: fourre.week, x: cf, y: cf, rayonM: 4 },
        attendu: "refus",
      },
    ],
    proteger: [
      {
        nom: "des arbres à portée de dent",
        state: jeune,
        action: { type: "proteger", week: jeune.week, treeIds: petits },
        attendu: "travail",
      },
      {
        nom: "des arbres hors d'atteinte",
        state: vieux,
        action: { type: "proteger", week: w, treeIds: ids },
        attendu: "refus",
      },
    ],
    receper: [
      {
        nom: "des charmes, qui rejettent de souche",
        state: vieux,
        action: { type: "receper", week: w, treeIds: charmes },
        attendu: "travail",
      },
      {
        nom: "des noyers, qui en mourraient",
        state: vieux,
        action: { type: "receper", week: w, treeIds: ids },
        attendu: "refus",
      },
    ],
    faucher: [
      {
        nom: "un disque",
        state: vieux,
        action: { type: "faucher", week: w, x: c, y: c, rayonM: 8 },
        attendu: "travail",
      },
    ],
    semer: [
      {
        nom: "en fenêtre, sur sol ouvert",
        state: laboure,
        action: {
          type: "semer",
          week: laboure.week,
          x: cn,
          y: cn,
          rayonM: 12,
          cultureId: "triticum_aestivum",
        },
        attendu: "travail",
      },
      {
        nom: "hors fenêtre de semis",
        state: vieux,
        action: { type: "semer", week: w, x: c, y: c, rayonM: 12, cultureId: "triticum_aestivum" },
        attendu: "refus",
      },
    ],
    moissonner: [
      {
        nom: "un blé mûr",
        state: mur,
        action: { type: "moissonner", week: mur.week, x: cn, y: cn, rayonM: 12 },
        attendu: "travail",
      },
      {
        nom: "rien de semé",
        state: vieux,
        action: { type: "moissonner", week: w, x: c, y: c, rayonM: 12 },
        attendu: "refus",
      },
    ],
    ramasserBoisMort: [
      {
        nom: "du bois couché au sol",
        state: avecBois,
        action: {
          type: "ramasserBoisMort",
          week: avecBois.week,
          x: premierCoupe?.x ?? c,
          y: premierCoupe?.y ?? c,
          rayonM: 8,
        },
        attendu: "travail",
      },
      {
        nom: "un sol sans bois mort",
        state: nu,
        action: { type: "ramasserBoisMort", week: nu.week, x: cn, y: cn, rayonM: 8 },
        attendu: "refus",
      },
    ],
  };
}, 120_000);

describe("prevoirAction : répondre sans rien changer", () => {
  it("chaque cas éprouve bien ce qu'il prétend éprouver", () => {
    const manques: string[] = [];
    for (const [type, cas] of Object.entries(CAS)) {
      for (const k of cas) {
        const r = applyAction(k.state, k.action);
        const aTravaille = premiereDivergence(k.state, r.state) !== null;
        if (k.attendu === "travail" && !aTravaille) {
          manques.push(`${type} — « ${k.nom} » n'a rien changé : ce cas n'éprouve plus rien`);
        }
        if (k.attendu === "refus" && r.refusals.length === 0) {
          manques.push(`${type} — « ${k.nom} » n'a rien refusé`);
        }
      }
    }
    expect(manques).toEqual([]);
  });

  it("applyAction ne modifie jamais l'état qu'on lui donne", () => {
    const mutations: string[] = [];
    for (const [type, cas] of Object.entries(CAS)) {
      for (const k of cas) {
        const avant = structuredClone(k.state);
        applyAction(k.state, k.action);
        const d = premiereDivergence(avant, k.state);
        if (d) mutations.push(`${type} — « ${k.nom} » : ${d}`);
      }
    }
    expect(mutations).toEqual([]);
  });

  it("prevoirAction rend exactement les refus d'applyAction, et ne touche à rien", () => {
    const ecarts: string[] = [];
    for (const [type, cas] of Object.entries(CAS)) {
      for (const k of cas) {
        const avant = structuredClone(k.state);
        const prevus = prevoirAction(k.state, k.action);
        const d = premiereDivergence(avant, k.state);
        if (d) ecarts.push(`${type} — « ${k.nom} » a modifié l'état : ${d}`);
        const reels = applyAction(k.state, k.action).refusals;
        const e = premiereDivergence(prevus, reels);
        if (e) ecarts.push(`${type} — « ${k.nom} » : préavis ≠ refus réel — ${e}`);
      }
    }
    expect(ecarts).toEqual([]);
  });
});
