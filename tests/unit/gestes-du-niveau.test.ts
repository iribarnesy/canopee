/**
 * **Un niveau ne montre que les gestes qu'il enseigne** (#507).
 *
 * Le premier niveau ouvrait treize boutons — labourer, semer, moissonner,
 * chasser, ramasser le bois mort, embaucher — et la sélection d'un pommier y
 * proposait de lever son écorce. `v1.md` demande l'inverse : « les premiers sont
 * courts et faciles : planter, voir pousser, découvrir quelques gestes ».
 *
 * Ce que ces essais défendent :
 *
 * 1. **Les panneaux eux-mêmes** n'exposent que ce que la fiche déclare : on les
 *    rend en HTML, et on lit leurs boutons. Un essai sur la seule liste des
 *    gestes ouverts passerait même si un panneau oubliait de la consulter.
 * 2. **Le bac à sable n'a rien perdu** : sans niveau, chaque geste a son bouton.
 * 3. **Les gestes s'ouvrent par palier** quand la fiche le demande : celui
 *    qu'un palier enseigne paraît quand on y arrive, pas avant — c'est le tour
 *    de tutoriel des niveaux, et le verger l'écrit (#514).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type Avancement,
  type Geste,
  type GestesOuverts,
  gesteOuvert,
  gestesOuverts,
  type Niveau,
} from "../../src/game/niveaux";
import { niveauParId } from "../../src/game/niveauxLivres";
import { PanneauAction } from "../../src/game/panneaux/PanneauAction";
import { PanneauSelection } from "../../src/game/panneaux/PanneauSelection";
import { useReglagesDeGeste } from "../../src/game/panneaux/reglages";
import type { Snapshot, SnapshotTree } from "../../src/game/protocol";
import type { GameApi } from "../../src/game/useGame";

/**
 * Le bouton de chaque geste, par un mot de son libellé.
 *
 * **Un `Record` sur `Geste`**, et c'est le point : un geste ajouté au
 * vocabulaire sans libellé ici ne compile plus, donc l'essai du bac à sable ne
 * peut pas l'oublier.
 */
const BOUTON: Record<Geste, string> = {
  planter: "Planter",
  chauler: "Chauler",
  fertiliser: "Fertiliser",
  labourer: "Labourer",
  semer: "Semer",
  moissonner: "Moissonner",
  eclaircir: "Éclaircir",
  brf: "Épandre le BRF",
  cloturer: "Clôturer",
  chasser: "Chasser",
  faucher: "Faucher",
  boisMort: "Bois mort",
  embaucher: "Main-d'œuvre",
  recolter: "Récolter",
  proteger: "Protéger",
  leverEcorce: "Lever l'écorce",
  elaguer: "Élaguer",
  receper: "Recéper",
  couper: "Couper",
};

/** Les gestes armés dans le panneau des gestes, et ceux de la sélection. */
const DU_PANNEAU: readonly Geste[] = [
  "planter",
  "chauler",
  "fertiliser",
  "labourer",
  "semer",
  "moissonner",
  "eclaircir",
  "brf",
  "cloturer",
  "chasser",
  "faucher",
  "boisMort",
  "embaucher",
];
const DE_LA_SELECTION: readonly Geste[] = [
  "recolter",
  "proteger",
  "leverEcorce",
  "elaguer",
  "receper",
  "couper",
];

/** Le libellé de chaque bouton du HTML rendu, sans balises ni entités. */
function boutons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) =>
    (m[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function montre(libelles: readonly string[], geste: Geste): boolean {
  return libelles.some((l) => l.includes(BOUTON[geste]));
}

/**
 * Le joueur n'appuie sur rien : un `dispatch` qui ne fait rien suffit, et c'est
 * tout ce que les deux panneaux lisent du jeu.
 */
const GAME = { dispatch: () => {} } as unknown as GameApi;

/**
 * Un instantané **réduit à ce que le panneau des gestes lit** : les arbres pour
 * le recensement, le tas de broyat pour le bouton du BRF, la semaine pour les
 * gestes du champ. Assez de broyat pour que son bouton paraisse — sans quoi le
 * bac à sable en montrerait un de moins, et l'essai ne dirait rien du BRF.
 */
const SNAPSHOT = { trees: [], stockBrfKg: 50, week: 10 } as unknown as Snapshot;

/** Deux pommiers vivants qui portent des fruits : de quoi offrir la récolte. */
function pommier(id: number): SnapshotTree {
  return {
    id,
    especeId: "malus_domestica",
    heightM: 3.2,
    ageWeeks: 9 * 52,
    chandelle: false,
    stress: 0,
    hauteurElagueeM: 0,
    fruitsKg: 14,
  } as unknown as SnapshotTree;
}
const POMMIERS = [pommier(1), pommier(2)];

function PanneauDesGestes({ gestes }: { gestes: GestesOuverts }) {
  // Les réglages par défaut, ceux d'une partie qui commence : rien d'armé.
  const geste = useReglagesDeGeste();
  return createElement(PanneauAction, {
    game: GAME,
    snapshot: SNAPSHOT,
    geste,
    surChoisirEssence: () => {},
    gestes,
  });
}

function rendreLesGestes(gestes: GestesOuverts): string[] {
  return boutons(renderToStaticMarkup(createElement(PanneauDesGestes, { gestes })));
}

function rendreLaSelection(gestes: GestesOuverts): string[] {
  return boutons(
    renderToStaticMarkup(
      createElement(PanneauSelection, {
        game: GAME,
        vivants: POMMIERS,
        tous: POMMIERS,
        selectedTrees: POMMIERS,
        setSelectedIds: () => {},
        suivis: new Set<number>(),
        basculerSuivi: () => {},
        gestes,
      }),
    ),
  );
}

const VERGER = niveauParId("verger");
if (!VERGER) throw new Error("le verger n'est plus livré");

/**
 * Un avancement de `niveau` où les `n` premiers paliers sont atteints. Les
 * mesures ne servent pas ici — c'est l'avancement qu'on donne qui décide.
 */
function apresPaliers(niveau: Niveau, n: number): Avancement {
  const paliers = niveau.paliers.map((palier, i) => ({
    palier,
    valeur: i < n ? 1 : 0,
    atteint: i < n,
    part: i < n ? 1 : 0,
  }));
  const courant = paliers.find((p) => !p.atteint);
  return {
    paliers,
    ...(courant ? { courant } : {}),
    issue: courant ? "en-cours" : "reussi",
  };
}

describe("le verger ne montre que ce qu'il enseigne (#507), un geste à la fois (#514)", () => {
  /** Sur le dernier palier : tout ce que le niveau ouvre est ouvert. */
  const ouverts = gestesOuverts(VERGER, apresPaliers(VERGER, VERGER.paliers.length - 1));

  it("ouvre en tout planter, protéger et récolter — les trois gestes de son objectif", () => {
    expect(ouverts && [...ouverts].sort()).toEqual(["planter", "proteger", "recolter"]);
  });

  it("les ouvre un à un : planter, protéger après le gibier, récolter aux premières pommes", () => {
    const parPalier = VERGER.paliers.map((p, n) => [
      p.id,
      [...(gestesOuverts(VERGER, apresPaliers(VERGER, n)) ?? [])].sort(),
    ]);
    expect(parPalier).toEqual([
      ["planter", ["planter"]],
      ["gibier", ["planter"]],
      ["proteger", ["planter", "proteger"]],
      ["agrandir", ["planter", "proteger"]],
      ["fruits", ["planter", "proteger"]],
      ["recolter", ["planter", "proteger", "recolter"]],
    ]);
  });

  it("dit à chaque palier ce qu'il apprend, et nomme le bouton qu'il ouvre", () => {
    for (const palier of VERGER.paliers) {
      expect(palier.apprend, palier.id).toBeTruthy();
      // Une phrase courte : elle se lit dans le panneau, pendant qu'on joue.
      expect(palier.apprend?.length ?? 0, palier.id).toBeLessThan(110);
      for (const geste of palier.gestes ?? []) {
        expect(palier.apprend, `${palier.id} → ${geste}`).toContain(BOUTON[geste]);
      }
    }
  });

  it("n'ouvre dans le panneau des gestes que la sélection et la plantation", () => {
    // Treize boutons au premier niveau, avant : labourer, semer, moissonner,
    // chasser, le bois mort, la main-d'œuvre…
    expect(rendreLesGestes(ouverts)).toEqual(["Sélection", "Planter"]);
  });

  it("ne propose sur un pommier ni d'écorce à lever, ni de quoi le couper", () => {
    const libelles = rendreLaSelection(ouverts);
    expect(montre(libelles, "recolter")).toBe(true);
    expect(montre(libelles, "proteger")).toBe(true);
    for (const geste of ["leverEcorce", "elaguer", "receper", "couper"] as const) {
      expect(montre(libelles, geste), geste).toBe(false);
    }
    // Suivre un arbre n'est pas un geste sur la parcelle, c'est regarder : il
    // reste, comme la sélection elle-même.
    expect(libelles.some((l) => l.includes("Suivre"))).toBe(true);
  });
});

describe("le bac à sable montre tout", () => {
  it("n'a pas de liste : sans niveau, tout geste est ouvert", () => {
    expect(gestesOuverts(undefined)).toBeUndefined();
    expect(gesteOuvert(undefined, "leverEcorce")).toBe(true);
  });

  it("garde un bouton pour chaque geste du panneau", () => {
    const libelles = rendreLesGestes(undefined);
    for (const geste of DU_PANNEAU) expect(montre(libelles, geste), geste).toBe(true);
  });

  it("garde un bouton pour chaque geste de la sélection", () => {
    const libelles = rendreLaSelection(undefined);
    for (const geste of DE_LA_SELECTION) expect(montre(libelles, geste), geste).toBe(true);
  });

  it("vaut aussi pour un niveau qui ne déclare rien", () => {
    const { gestes: _, ...sansListe } = VERGER;
    const sansRien = { ...sansListe, paliers: VERGER.paliers.map(({ gestes: _g, ...p }) => p) };
    expect(gestesOuverts(sansRien)).toBeUndefined();
  });
});

describe("les gestes s'ouvrent par palier", () => {
  /**
   * Un tutoriel d'essai : la plantation d'entrée, la protection quand on arrive
   * au deuxième palier, la récolte au troisième. Les mesures ne servent pas ici
   * — c'est l'avancement qu'on donne qui décide.
   */
  const TUTORIEL: Niveau = {
    ...VERGER,
    gestes: ["planter"],
    paliers: [
      { id: "un", quoi: "Planter", mesure: () => 0, cible: 1, unite: "" },
      { id: "deux", quoi: "Protéger", mesure: () => 0, cible: 1, unite: "", gestes: ["proteger"] },
      {
        id: "trois",
        quoi: "Récolter",
        mesure: () => 0,
        cible: 1,
        unite: "",
        gestes: ["recolter", "couper"],
      },
    ],
  };

  const apres = (n: number) => apresPaliers(TUTORIEL, n);
  const ouverts = (n: number) => [...(gestesOuverts(TUTORIEL, apres(n)) ?? [])].sort();

  it("n'ouvre au départ que les gestes de la fiche", () => {
    expect(ouverts(0)).toEqual(["planter"]);
  });

  it("ouvre le geste d'un palier quand on y arrive, et le garde ensuite", () => {
    expect(ouverts(1)).toEqual(["planter", "proteger"]);
    expect(ouverts(2)).toEqual(["couper", "planter", "proteger", "recolter"]);
    expect(ouverts(3)).toEqual(["couper", "planter", "proteger", "recolter"]);
  });

  it("sans avancement encore, s'en tient au premier palier", () => {
    // Le premier instantané n'est pas arrivé : rien n'est atteint.
    expect([...(gestesOuverts(TUTORIEL) ?? [])].sort()).toEqual(["planter"]);
  });

  it("n'ouvre pas un palier franchi en avance tant que celui d'avant manque", () => {
    // Le troisième atteint, pas le premier : le tutoriel suit l'ordre des
    // paliers, comme le palier « courant » que le panneau annonce.
    const enDesordre = apres(0);
    const troisieme = enDesordre.paliers[2];
    if (!troisieme) throw new Error("palier manquant");
    enDesordre.paliers[2] = { ...troisieme, atteint: true };
    expect([...(gestesOuverts(TUTORIEL, enDesordre) ?? [])].sort()).toEqual(["planter"]);
  });

  it("un niveau qui ne déclare ses gestes que sur ses paliers part de rien d'autre", () => {
    const { gestes: _, ...sansFiche } = TUTORIEL;
    expect([...(gestesOuverts(sansFiche, apres(1)) ?? [])].sort()).toEqual(["proteger"]);
  });
});
