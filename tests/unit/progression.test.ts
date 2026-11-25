/**
 * **La progression** : **un niveau ne s'ouvre qu'une fois le précédent réussi** (#506).
 *
 * Le jeu ne livre encore qu'un niveau, donc rien de ce verrouillage ne se voit à
 * l'écran. Ces essais l'éprouvent sur une **liste factice** de quatre niveaux —
 * les quatre de la V1 —, bâtie dans l'essai et nulle part ailleurs : le jeu ne
 * doit pas montrer de niveau qui n'existe pas.
 *
 * Ce qu'ils défendent :
 *
 * 1. **L'ordre.** Le premier est toujours ouvert, chacun des suivants s'ouvre
 *    quand celui d'avant est réussi, et un niveau verrouillé dit lequel réussir.
 * 2. **La persistance.** Une réussite survit à la relecture du stockage, ne se
 *    compte qu'une fois, et une valeur illisible ne ferme pas le premier niveau.
 * 3. **La suite proposée à la fin** : le niveau suivant, seulement si l'objectif
 *    est atteint et qu'il y en a un.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Niveau } from "../../src/game/niveaux";
import { NIVEAUX_LIVRES } from "../../src/game/niveauxLivres";
import {
  CLE_PROGRESSION,
  niveauSuivant,
  niveauxReussis,
  placesDesNiveaux,
  retenirLaReussite,
} from "../../src/game/progression";

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

/** Un stockage que le navigateur refuse : navigation privée, quota, réglage. */
class StockRefuse extends FauxStock {
  override getItem(): string | null {
    throw new Error("SecurityError");
  }
  override setItem(): void {
    throw new Error("QuotaExceededError");
  }
}

const VERGER = NIVEAUX_LIVRES[0] as Niveau;

/**
 * **Les quatre niveaux de la V1, factices** : de vraies fiches (celle du verger),
 * sous d'autres noms. Seuls l'identifiant et le nom comptent pour la progression.
 */
const QUATRE: readonly Niveau[] = [
  VERGER,
  { ...VERGER, id: "clairiere", nom: "La clairière" },
  { ...VERGER, id: "sol-pauvre", nom: "Le sol pauvre" },
  { ...VERGER, id: "parcelle-qui-se-paie", nom: "La parcelle qui se paie" },
];

/** L'état de chaque niveau, dans l'ordre : de quoi lire l'essai d'un coup d'œil. */
function etats(reussis: Iterable<string>): string[] {
  return placesDesNiveaux(QUATRE, new Set(reussis)).map((p) => `${p.niveau.id}:${p.etat}`);
}

let stock: FauxStock;
beforeEach(() => {
  stock = new FauxStock();
});

describe("l'ouverture dans l'ordre", () => {
  it("au premier lancement, seul le premier niveau est ouvert, et c'est le prochain", () => {
    expect(etats([])).toEqual([
      "verger:prochain",
      "clairiere:verrouille",
      "sol-pauvre:verrouille",
      "parcelle-qui-se-paie:verrouille",
    ]);
  });

  it("chaque réussite ouvre le niveau suivant, et lui seul", () => {
    expect(etats(["verger"])).toEqual([
      "verger:reussi",
      "clairiere:prochain",
      "sol-pauvre:verrouille",
      "parcelle-qui-se-paie:verrouille",
    ]);
    expect(etats(["verger", "clairiere"])).toEqual([
      "verger:reussi",
      "clairiere:reussi",
      "sol-pauvre:prochain",
      "parcelle-qui-se-paie:verrouille",
    ]);
    expect(etats(QUATRE.map((n) => n.id))).toEqual([
      "verger:reussi",
      "clairiere:reussi",
      "sol-pauvre:reussi",
      "parcelle-qui-se-paie:reussi",
    ]);
  });

  it("un niveau verrouillé nomme celui qu'il faut réussir pour l'ouvrir", () => {
    const places = placesDesNiveaux(QUATRE, new Set(["verger"]));
    expect(places.map((p) => p.requis?.nom)).toEqual([
      undefined,
      undefined,
      "La clairière",
      "Le sol pauvre",
    ]);
  });

  it("il n'y a jamais qu'un niveau mis en avant", () => {
    // Le cas d'une liste qui change sous une progression déjà rangée : un
    // niveau inséré avant un niveau réussi. Les deux restent jouables, mais un
    // seul est « le prochain ».
    const places = placesDesNiveaux(QUATRE, new Set(["verger", "sol-pauvre"]));
    expect(places.map((p) => p.etat)).toEqual(["reussi", "prochain", "reussi", "ouvert"]);
  });

  it("le premier niveau livré est toujours ouvert", () => {
    const [premier] = placesDesNiveaux(NIVEAUX_LIVRES, new Set());
    expect(premier?.niveau.id).toBe(VERGER.id);
    expect(premier?.etat).toBe("prochain");
  });

  it("une réussite d'un niveau qui n'existe plus n'ouvre rien", () => {
    expect(etats(["un-niveau-retire"])).toEqual(etats([]));
  });
});

describe("la persistance", () => {
  it("une réussite retenue se relit d'un stockage à l'autre", () => {
    expect(niveauxReussis(stock).size).toBe(0);
    retenirLaReussite(stock, "verger");
    // Une autre lecture du même stockage : c'est ce que fait l'accueil quand
    // on revient d'une partie, ou quand on rouvre le jeu le lendemain.
    expect([...niveauxReussis(stock)]).toEqual(["verger"]);
    expect(etats(niveauxReussis(stock))[1]).toBe("clairiere:prochain");
  });

  it("retenir deux fois la même réussite ne la compte qu'une fois", () => {
    retenirLaReussite(stock, "verger");
    retenirLaReussite(stock, "verger");
    retenirLaReussite(stock, "clairiere");
    expect([...niveauxReussis(stock)]).toEqual(["verger", "clairiere"]);
    const brut = JSON.parse(stock.getItem(CLE_PROGRESSION) ?? "null");
    expect(brut).toEqual({ version: 1, reussis: ["verger", "clairiere"] });
  });

  it("rend la progression après l'écriture", () => {
    expect([...retenirLaReussite(stock, "verger")]).toEqual(["verger"]);
  });

  it("une valeur illisible rend une progression vide, et le premier niveau reste ouvert", () => {
    for (const brut of ["{pas du json", "null", "[]", '{"version":2,"reussis":["verger"]}']) {
      stock.setItem(CLE_PROGRESSION, brut);
      expect(niveauxReussis(stock).size).toBe(0);
    }
    stock.setItem(CLE_PROGRESSION, JSON.stringify({ version: 1, reussis: ["verger", 3, null] }));
    expect([...niveauxReussis(stock)]).toEqual(["verger"]);
  });

  it("un stockage refusé ne fait pas tomber le jeu", () => {
    const refuse = new StockRefuse();
    expect(niveauxReussis(refuse).size).toBe(0);
    // La réussite vaut pour la visite, même si elle ne s'écrit pas.
    expect([...retenirLaReussite(refuse, "verger")]).toEqual(["verger"]);
  });

  it("ne touche à aucune autre clé du stockage", () => {
    stock.setItem("canopee-sauvegardes", "[]");
    retenirLaReussite(stock, "verger");
    expect(stock.getItem("canopee-sauvegardes")).toBe("[]");
    expect(stock.length).toBe(2);
  });
});

describe("la suite proposée à la fin d'un niveau", () => {
  it("un niveau réussi propose le suivant", () => {
    expect(niveauSuivant(QUATRE, "verger", "reussi")?.nom).toBe("La clairière");
    expect(niveauSuivant(QUATRE, "sol-pauvre", "reussi")?.nom).toBe("La parcelle qui se paie");
  });

  it("un niveau manqué, ou encore en cours, ne propose rien", () => {
    expect(niveauSuivant(QUATRE, "verger", "echoue")).toBeUndefined();
    expect(niveauSuivant(QUATRE, "verger", "en-cours")).toBeUndefined();
  });

  it("le dernier niveau réussi n'a pas de suite", () => {
    expect(niveauSuivant(QUATRE, "parcelle-qui-se-paie", "reussi")).toBeUndefined();
    // Aujourd'hui, le verger est le seul niveau livré : sa fin ne propose rien.
    expect(niveauSuivant(NIVEAUX_LIVRES, VERGER.id, "reussi")).toBeUndefined();
  });

  it("un niveau inconnu n'a pas de suite", () => {
    expect(niveauSuivant(QUATRE, "inconnu", "reussi")).toBeUndefined();
  });

  it("le niveau proposé est ouvert une fois la réussite retenue", () => {
    const suivant = niveauSuivant(QUATRE, "verger", "reussi");
    const reussis = retenirLaReussite(stock, "verger");
    const place = placesDesNiveaux(QUATRE, reussis).find((p) => p.niveau.id === suivant?.id);
    expect(place?.etat).toBe("prochain");
  });
});
