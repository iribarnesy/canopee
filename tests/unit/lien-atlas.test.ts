/**
 * **L'atlas est à un clic depuis le choix des essences** (#513).
 *
 * `v1.md` : « Consultable depuis le jeu […] Un lien suffit pour la V1. » Aucun
 * lien vers l'atlas n'existait dans `src/`.
 *
 * Ce que ces essais défendent :
 *
 * 1. **Le lien d'une essence mène à elle** : l'atlas cherche dans le nom latin,
 *    et l'identifiant d'une essence du moteur est ce nom latin.
 * 2. **Les deux volets portent le lien** : celui du choix des essences, pour
 *    l'essence choisie, et la fiche d'un arbre sélectionné. On les rend en HTML
 *    et on lit leurs liens — un essai sur la seule fonction passerait même si
 *    un volet oubliait de s'en servir.
 * 3. **Le lien ouvre un nouvel onglet** : la partie est la page, et la quitter
 *    pour lire une fiche déclencherait l'avertissement de sortie.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ESPECES_V0 } from "../../src/engine/especes";
import { ATLAS, lienAtlas, nomLatin } from "../../src/game/atlas";
import { PanneauEssences } from "../../src/game/panneaux/PanneauEssences";
import { PanneauSelection } from "../../src/game/panneaux/PanneauSelection";
import type { Snapshot, SnapshotTree, StationInfo } from "../../src/game/protocol";
import type { GameApi } from "../../src/game/useGame";

/** Les liens vers l'atlas d'un HTML rendu : adresse, cible, texte. */
function liensAtlas(html: string): { href: string; target: string; texte: string }[] {
  return [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)]
    .map((m) => ({
      attributs: m[1] ?? "",
      texte: (m[2] ?? "").replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'"),
    }))
    .filter(({ attributs }) => attributs.includes("atlas-especes"))
    .map(({ attributs, texte }) => ({
      href: (/href="([^"]*)"/.exec(attributs)?.[1] ?? "").replace(/&amp;/g, "&"),
      target: /target="([^"]*)"/.exec(attributs)?.[1] ?? "",
      texte: texte.replace(/\s+/g, " ").trim(),
    }));
}

// Les portraits se cuisent dans un canvas, qu'un essai sans navigateur n'a pas :
// le volet des essences se rend sans eux, ce n'est pas eux qu'on lit ici.
vi.mock("../../src/game/panneaux/portraits", () => ({ portraitDEspece: () => undefined }));

const GAME = { dispatch: () => {} } as unknown as GameApi;

/** Ce que le volet des essences lit de l'instantané et de la station. */
const SNAPSHOT = { soilPh: [7, 7, 7, 7] } as unknown as Snapshot;
const STATION = { phInitial: 7, ruMm: 186 } as unknown as StationInfo;

function pommier(id: number): SnapshotTree {
  return {
    id,
    especeId: "malus_domestica",
    heightM: 3.2,
    ageWeeks: 9 * 52,
    chandelle: false,
    stress: 0,
    hauteurElagueeM: 0,
    fruitsKg: 0,
  } as unknown as SnapshotTree;
}

function rendreLaSelection(arbres: SnapshotTree[]): string {
  return renderToStaticMarkup(
    createElement(PanneauSelection, {
      game: GAME,
      vivants: arbres,
      tous: arbres,
      selectedTrees: arbres,
      setSelectedIds: () => {},
      suivis: new Set<number>(),
      basculerSuivi: () => {},
    }),
  );
}

describe("l'adresse de l'atlas (#513)", () => {
  it("sans essence, la liste de l'atlas, celle que v1.md donne", () => {
    expect(lienAtlas()).toBe("https://iribarnesy.github.io/atlas-especes/#/atlas");
    expect(lienAtlas()).toBe(ATLAS);
  });

  it("une essence se cherche par son nom latin", () => {
    expect(nomLatin("malus_domestica")).toBe("Malus domestica");
    expect(lienAtlas("malus_domestica")).toBe(`${ATLAS}?q=Malus%20domestica`);
  });

  it("chaque essence du moteur a un nom latin à chercher", () => {
    for (const e of ESPECES_V0) {
      // Deux mots au moins : un genre et une épithète, comme dans l'atlas.
      expect(nomLatin(e.id).split(" ").length, e.id).toBeGreaterThanOrEqual(2);
      expect(lienAtlas(e.id).startsWith(`${ATLAS}?q=`), e.id).toBe(true);
    }
  });
});

describe("le volet « Qu'est-ce qu'on plante ? »", () => {
  const rendre = (especeId: string) =>
    renderToStaticMarkup(
      createElement(PanneauEssences, {
        snapshot: SNAPSHOT,
        station: STATION,
        especeId,
        setEspeceId: () => {},
        avecManchon: false,
        setAvecManchon: () => {},
        seulementTenables: true,
        setSeulementTenables: () => {},
      }),
    );

  it("mène à l'essence choisie dans l'atlas, dans un nouvel onglet", () => {
    const liens = liensAtlas(rendre("malus_domestica"));
    expect(liens).toHaveLength(1);
    expect(liens[0]?.href).toBe(lienAtlas("malus_domestica"));
    expect(liens[0]?.target).toBe("_blank");
    expect(liens[0]?.texte).toContain("Pommier dans l'atlas des espèces");
  });

  it("suit le choix : une autre essence, un autre lien", () => {
    const liens = liensAtlas(rendre("quercus_pubescens"));
    expect(liens[0]?.href).toBe(lienAtlas("quercus_pubescens"));
    expect(liens[0]?.texte).toContain("Chêne pubescent");
  });
});

describe("la fiche d'un arbre sélectionné", () => {
  it("un pommier mène à l'atlas, dans un nouvel onglet", () => {
    const liens = liensAtlas(rendreLaSelection([pommier(1)]));
    expect(liens).toHaveLength(1);
    expect(liens[0]?.href).toBe(lienAtlas("malus_domestica"));
    expect(liens[0]?.target).toBe("_blank");
  });

  it("douze pommiers aussi, et le lien dit lesquels", () => {
    const liens = liensAtlas(
      rendreLaSelection(Array.from({ length: 12 }, (_, i) => pommier(i + 1))),
    );
    expect(liens).toHaveLength(1);
    expect(liens[0]?.texte).toContain("pommier dans l'atlas");
  });

  it("une sélection de plusieurs essences ne choisit pas pour le joueur", () => {
    const aulne = { ...pommier(2), especeId: "alnus_glutinosa" } as SnapshotTree;
    expect(liensAtlas(rendreLaSelection([pommier(1), aulne]))).toHaveLength(0);
  });
});
