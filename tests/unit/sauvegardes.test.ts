/**
 * **Plusieurs parties sauvegardées**, **et lisibles** (#147).
 *
 * Cas vécu : « changer des paramètres, lancer, sortir — et plus aucun moyen de
 * relire les paramètres de la partie précédente ». Une seule sauvegarde, que la
 * partie suivante écrasait au premier autosave.
 *
 * Ce que ces épreuves défendent : qu'on ne perde **rien** — ni la partie d'avant en
 * en commençant une autre, ni celle d'un joueur qui avait déjà joué sous
 * l'ancien rangement — et que la fiche dise ce qui a été demandé, pas ce que le
 * moteur en a fait.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { SaveGame } from "../../src/game/protocol";
import {
  CLE_ANCIENNE,
  CLE_LISTE,
  derniereSauvegarde,
  type EntreeSauvegarde,
  ecrireSauvegarde,
  essencesPlantees,
  libelleDeLaPartie,
  listerSauvegardes,
  nomParDefaut,
  PARTIES_GARDEES,
  reglagesDeLaPartie,
  supprimerSauvegarde,
} from "../../src/game/sauvegardes";

/** Un `localStorage` de bureau : le module ne connaît pas `window`, on lui donne. */
class FauxStock implements Storage {
  private donnees = new Map<string, string>();
  get length(): number {
    return this.donnees.size;
  }
  clear(): void {
    this.donnees.clear();
  }
  getItem(cle: string): string | null {
    return this.donnees.get(cle) ?? null;
  }
  key(i: number): string | null {
    return [...this.donnees.keys()][i] ?? null;
  }
  removeItem(cle: string): void {
    this.donnees.delete(cle);
  }
  setItem(cle: string, valeur: string): void {
    this.donnees.set(cle, valeur);
  }
}

const partie = (champs: Partial<SaveGame> = {}): SaveGame => ({
  version: 1,
  stationId: "limon-riche",
  seed: 42,
  meteo: "reelle",
  scenario: "ssp245",
  paysageId: "bocage",
  anneeDepart: 2026,
  weeks: 104,
  actions: [],
  ...champs,
});

/** La première entrée rangée, sans point d'exclamation : il n'y en a jamais zéro ici. */
function premiere(stock: Storage): EntreeSauvegarde {
  const e = listerSauvegardes(stock)[0];
  if (!e) throw new Error("aucune partie rangée");
  return e;
}

let stock: FauxStock;
beforeEach(() => {
  stock = new FauxStock();
});

describe("le rangement", () => {
  it("garde chaque partie sous son identifiant, la plus récente en tête", () => {
    ecrireSauvegarde(stock, "a", partie({ seed: 1 }));
    ecrireSauvegarde(stock, "b", partie({ seed: 2 }));
    expect(listerSauvegardes(stock).map((e) => e.id)).toEqual(["b", "a"]);
    // Le cas de l'issue : jouer la première ne doit pas effacer la seconde.
    ecrireSauvegarde(stock, "a", partie({ seed: 1, weeks: 208 }));
    const liste = listerSauvegardes(stock);
    expect(liste.map((e) => e.id)).toEqual(["a", "b"]);
    expect(liste.find((e) => e.id === "b")?.save.seed).toBe(2);
  });

  it("ne garde pas le nom pour lui : réécrire une partie ne la renomme pas", () => {
    ecrireSauvegarde(stock, "a", partie(), "Ma futaie");
    ecrireSauvegarde(stock, "a", partie({ weeks: 520 }));
    expect(listerSauvegardes(stock)[0]?.nom).toBe("Ma futaie");
  });

  // Le défaut vu en jouant : une partie créée l'an 3 et menée jusqu'à l'an 36
  // s'annonçait « an 3 » dans la liste, et « an 36 » dans sa propre fiche. Le
  // nom par défaut était écrit une fois puis reconduit à chaque autosave.
  it("suit la partie : le libellé par défaut donne l'année où elle en est", () => {
    ecrireSauvegarde(stock, "a", partie({ weeks: 104 }));
    expect(libelleDeLaPartie(premiere(stock))).toContain("an 3");
    ecrireSauvegarde(stock, "a", partie({ weeks: 1820 }));
    const entree = premiere(stock);
    expect(libelleDeLaPartie(entree)).toContain("an 36");
    expect(reglagesDeLaPartie(entree.save).find((l) => l.quoi === "Avancement")?.valeur).toContain(
      "an 36",
    );
  });

  // Les entrées déjà rangées portent un nom par défaut gelé. On le reconnaît à
  // sa forme et on le laisse tomber, sans quoi le correctif ne réparerait que
  // les parties commencées après lui.
  it("dégèle les noms par défaut déjà écrits", () => {
    stock.setItem(
      CLE_LISTE,
      JSON.stringify([{ id: "a", nom: "Saumos · an 6", quand: 1, save: partie({ weeks: 1820 }) }]),
    );
    const entree = premiere(stock);
    expect(entree.nom).toBeUndefined();
    expect(libelleDeLaPartie(entree)).toContain("an 36");
  });

  it("ne dégèle pas un nom que le joueur a choisi", () => {
    stock.setItem(
      CLE_LISTE,
      JSON.stringify([{ id: "a", nom: "Ma futaie", quand: 1, save: partie({ weeks: 1820 }) }]),
    );
    expect(libelleDeLaPartie(premiere(stock))).toBe("Ma futaie");
  });

  it("borne la liste, et c'est la plus ancienne qui part", () => {
    for (let i = 0; i < PARTIES_GARDEES + 3; i++) {
      ecrireSauvegarde(stock, `p${i}`, partie({ seed: i }));
    }
    const liste = listerSauvegardes(stock);
    expect(liste).toHaveLength(PARTIES_GARDEES);
    expect(liste[0]?.id).toBe(`p${PARTIES_GARDEES + 2}`);
    expect(liste.map((e) => e.id)).not.toContain("p0");
  });

  it("oublie sur demande, et la dernière écrite se retrouve", () => {
    ecrireSauvegarde(stock, "a", partie());
    ecrireSauvegarde(stock, "b", partie());
    expect(derniereSauvegarde(stock)?.id).toBe("b");
    supprimerSauvegarde(stock, "b");
    expect(derniereSauvegarde(stock)?.id).toBe("a");
  });
});

describe("la migration", () => {
  it("l'ancienne clé unique devient la première entrée, et ne revient pas", () => {
    stock.setItem(CLE_ANCIENNE, JSON.stringify(partie({ seed: 7, weeks: 312 })));
    const liste = listerSauvegardes(stock);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.save.seed).toBe(7);
    expect(libelleDeLaPartie(premiere(stock))).toContain("an 7");
    // Une seule fois : la clé disparaît, sinon chaque lecture ajouterait un
    // doublon de la même partie.
    expect(stock.getItem(CLE_ANCIENNE)).toBeNull();
    expect(listerSauvegardes(stock)).toHaveLength(1);
  });

  it("ne perd pas les parties déjà rangées quand elle a lieu", () => {
    ecrireSauvegarde(stock, "a", partie({ seed: 1 }));
    stock.setItem(CLE_ANCIENNE, JSON.stringify(partie({ seed: 9 })));
    expect(listerSauvegardes(stock).map((e) => e.save.seed)).toEqual([9, 1]);
  });
});

describe("ce qu'on sait relire", () => {
  it("une liste illisible ne fait pas tomber l'écran de départ", () => {
    stock.setItem(CLE_LISTE, "{pas du json");
    expect(listerSauvegardes(stock)).toEqual([]);
  });

  it("une entrée d'une autre version est écartée, pas les autres", () => {
    ecrireSauvegarde(stock, "bonne", partie());
    const liste = JSON.parse(stock.getItem(CLE_LISTE) ?? "[]");
    liste.push({ id: "future", nom: "?", quand: 0, save: { version: 2 } });
    stock.setItem(CLE_LISTE, JSON.stringify(liste));
    expect(listerSauvegardes(stock).map((e) => e.id)).toEqual(["bonne"]);
  });
});

describe("la fiche d'une partie", () => {
  it("dit les réglages DEMANDÉS, avec les mots de l'écran de réglages", () => {
    const lignes = reglagesDeLaPartie(
      partie({ maturationAns: 40, economie: false, partBassin: 0.5, nappeCm: 120 }),
    );
    const dit = (quoi: string) => lignes.find((l) => l.quoi === quoi)?.valeur;
    expect(dit("Station")).toBe("Limon profond riche");
    expect(dit("Paysage")).toBe("Dans un bocage d'élevage");
    // Le libellé du **moteur**, pas l'identifiant : c'est le mot que l'écran de
    // réglages affiche, et l'issue demande les mêmes.
    expect(dit("Scénario climatique")).toBe("SSP2-4.5");
    expect(dit("Météo")).toContain("réelle");
    expect(dit("Terrain vieilli")).toBe("40 ans avant l'arrivée");
    expect(dit("Nappe")).toBe("120 cm");
    expect(dit("Bassin semblable")).toBe("50 %");
    expect(dit("Économie")).toBe("désactivée");
    expect(dit("Avancement")).toContain("an 3");
  });

  it("ne dit pas ce qui n'a pas été choisi", () => {
    const quoi = reglagesDeLaPartie(partie()).map((l) => l.quoi);
    expect(quoi).not.toContain("Terrain vieilli");
    expect(quoi).not.toContain("Économie");
    expect(quoi).not.toContain("Bassin semblable");
  });

  it("nomme une partie par sa station et son an", () => {
    expect(nomParDefaut(partie({ weeks: 0 }))).toBe("Limon profond riche · an 1");
  });

  it("retrouve les essences plantées dans le journal des actions", () => {
    const save = partie({
      actions: [
        { type: "planter", week: 3, especeId: "quercus_pubescens", positions: [{ x: 1, y: 1 }] },
        { type: "planter", week: 9, especeId: "quercus_pubescens", positions: [{ x: 2, y: 2 }] },
        { type: "chauler", week: 4, x: 1, y: 1, rayonM: 4 },
      ],
    });
    expect(essencesPlantees(save)).toEqual(["Chêne pubescent"]);
  });
});
