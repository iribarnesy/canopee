/**
 * Les onze mises en scène de mort.
 *
 * **Ce que ces essais gardent, c'est la LISIBILITÉ des causes** : le §6.3 ne
 * demande pas onze animations jolies, il demande onze animations qu'on
 * distingue. Deux causes qui donneraient la même suite d'images ne diraient
 * rien au joueur, et c'est une propriété qui se teste sans regarder.
 */

import { describe, expect, it } from "vitest";
import type { MortDeLaSemaine } from "../../src/engine/tick";
import type { CauseMort } from "../../src/engine/trees";
import {
  type ArbreVivant,
  dansLaFenetre,
  mortAccomplie,
  mourirEnCours,
  PALIERS_DE_MORT,
  parCause,
  RAPETISSEMENT_MAXIMAL,
  TRAJECTOIRES,
} from "../../src/render/temps/mort";

const CAUSES = Object.keys(TRAJECTOIRES) as CauseMort[];

/** Un arbre en pleine forme : le cas le plus courant au moment de mourir. */
const vif: ArbreVivant = {
  partFoliaire: 1,
  senescence: 0,
  vigueur: 1,
  dommageHydraulique: 0,
};

/** L'empreinte d'une mort : la suite des états qu'elle traverse, arrondie. */
function empreinte(cause: CauseMort, depart = vif): string {
  const pas: string[] = [];
  for (let a = 0; a <= 1.0001; a += 0.1) {
    const e = mourirEnCours(cause, depart, a);
    pas.push(
      [
        e.partFoliaire.toFixed(1),
        e.senescence.toFixed(1),
        e.vigueur.toFixed(1),
        e.dommageHydraulique.toFixed(1),
        e.chandelle ? "C" : "-",
        e.opacite.toFixed(1),
        e.hauteur.toFixed(1),
      ].join(","),
    );
  }
  return pas.join(" ");
}

describe("dansLaFenetre", () => {
  it("vaut 0 avant, 1 après, et monte linéairement dedans", () => {
    expect(dansLaFenetre(0.1, [0.2, 0.6])).toBe(0);
    expect(dansLaFenetre(0.2, [0.2, 0.6])).toBe(0);
    expect(dansLaFenetre(0.4, [0.2, 0.6])).toBeCloseTo(0.5, 6);
    expect(dansLaFenetre(0.6, [0.2, 0.6])).toBe(1);
    expect(dansLaFenetre(0.9, [0.2, 0.6])).toBe(1);
  });

  it("rend 0 quand la fenêtre est absente : la grandeur ne bouge pas", () => {
    expect(dansLaFenetre(0.5, undefined)).toBe(0);
  });

  it("ne divise pas par zéro sur une fenêtre plate", () => {
    expect(Number.isFinite(dansLaFenetre(0.5, [0.5, 0.5]))).toBe(true);
  });
});

describe("les onze causes", () => {
  it("ont toutes une trajectoire : la table est exhaustive", () => {
    // Le type l'impose déjà, mais une valeur ajoutée au moteur doit CASSER ici
    // et non passer silencieusement.
    expect(CAUSES.length).toBe(12);
  });

  it("se distinguent DEUX À DEUX : aucune paire ne donne la même suite", () => {
    // La propriété centrale du §6.3 — « chacune raconte quelque chose de
    // différent, et c'est exactement ce que le joueur doit comprendre ». Le feu
    // est écarté : sa mise en scène est au §6.4 et sa trajectoire est neutre
    // exprès.
    const empreintes = new Map<string, CauseMort>();
    for (const cause of CAUSES) {
      if (cause === "feu") continue;
      const e = empreinte(cause);
      const deja = empreintes.get(e);
      expect(deja, `${cause} se dessine comme ${deja}`).toBeUndefined();
      empreintes.set(e, cause);
    }
  });

  it("partent de l'état VIVANT et n'y touchent pas à l'avancement zéro", () => {
    // Un arbre qui végétait depuis trois ans ne doit pas reverdir au moment de
    // mourir : c'est le piège d'une trajectoire qui partirait d'un arbre neuf.
    const faible: ArbreVivant = {
      partFoliaire: 0.4,
      senescence: 0.3,
      vigueur: 0.35,
      dommageHydraulique: 0.5,
    };
    for (const cause of CAUSES) {
      const e = mourirEnCours(cause, faible, 0);
      expect(e.partFoliaire).toBeCloseTo(faible.partFoliaire, 6);
      expect(e.senescence).toBeCloseTo(faible.senescence, 6);
      expect(e.vigueur).toBeCloseTo(faible.vigueur, 6);
      expect(e.dommageHydraulique).toBeCloseTo(faible.dommageHydraulique, 6);
      expect(e.opacite).toBe(1);
      expect(e.hauteur).toBe(1);
    }
  });

  it("ne traversent que `PALIERS_DE_MORT` états de CLASSE", () => {
    // La propriété qui borne la cuisson : deux arbres à des avancements
    // voisins doivent partager leur vignette. Sans elle, une mort de friche a
    // coûté 965 recuissons — mesuré, pas supposé.
    for (const cause of CAUSES) {
      const etats = new Set<string>();
      for (let a = 0; a <= 1; a += 0.005) {
        const e = mourirEnCours(cause, vif, a);
        etats.add(
          `${e.partFoliaire}|${e.senescence}|${e.vigueur}|${e.dommageHydraulique}|${e.chandelle}`,
        );
      }
      expect(etats.size, cause).toBeLessThanOrEqual(PALIERS_DE_MORT);
    }
  });

  it("ne rendent jamais de grandeur hors de [0,1]", () => {
    const etats: ArbreVivant[] = [
      vif,
      { partFoliaire: 0, senescence: 1, vigueur: 0, dommageHydraulique: 1 },
      { partFoliaire: 0.5, senescence: 0.5, vigueur: 0.5, dommageHydraulique: 0.5 },
    ];
    for (const cause of CAUSES) {
      for (const depart of etats) {
        for (let a = 0; a <= 1; a += 0.05) {
          const e = mourirEnCours(cause, depart, a);
          for (const v of [
            e.partFoliaire,
            e.senescence,
            e.vigueur,
            e.dommageHydraulique,
            e.opacite,
            e.hauteur,
          ]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("ne laissent jamais un sprite de hauteur nulle", () => {
    // Un sprite de hauteur zéro n'est pas un plant qui a rapetissé, c'est un
    // sprite dégénéré que Pixi pose n'importe où.
    for (const cause of CAUSES) {
      for (let a = 0; a <= 1; a += 0.02) {
        expect(mourirEnCours(cause, vif, a).hauteur).toBeGreaterThanOrEqual(RAPETISSEMENT_MAXIMAL);
      }
    }
  });

  it("bornent l'avancement au lieu d'extrapoler", () => {
    for (const cause of CAUSES) {
      expect(empreinte(cause)).toBeTruthy();
      const apres = mourirEnCours(cause, vif, 4);
      const fin = mortAccomplie(cause, vif);
      expect(apres).toEqual(fin);
      const avant = mourirEnCours(cause, vif, -2);
      expect(avant.partFoliaire).toBe(vif.partFoliaire);
    }
  });
});

describe("ce que chaque cause raconte", () => {
  it("sécheresse : jaunit AVANT de se défeuiller", () => {
    // L'ordre est la demande explicite du §6.3, et c'est lui qui distingue une
    // sécheresse d'un automne (où les deux vont ensemble) et d'une défoliation
    // de ravageurs (où le feuillage part sans jaunir).
    const tot = mourirEnCours("secheresse", vif, 0.3);
    expect(tot.senescence).toBeGreaterThan(0.5);
    expect(tot.partFoliaire).toBeGreaterThan(0.85);
    const tard = mourirEnCours("secheresse", vif, 0.8);
    expect(tard.partFoliaire).toBeLessThan(0.3);
  });

  it("ravageurs : se défeuille SANS jaunir", () => {
    for (let a = 0; a <= 1; a += 0.1) {
      expect(mourirEnCours("ravageurs", vif, a).senescence).toBe(0);
    }
    // Pas tout à fait zéro à 0,8 : l'avancement est quantifié en
    // `PALIERS_DE_MORT` états, donc 0,8 se lit 0,75 — voulu, et c'est ce qui
    // borne le nombre de vignettes à cuire.
    expect(mourirEnCours("ravageurs", vif, 0.8).partFoliaire).toBeLessThan(0.1);
    expect(mortAccomplie("ravageurs", vif).partFoliaire).toBe(0);
  });

  it("solHorsGamme : meurt en GARDANT sa couronne, jaune", () => {
    // La chlorose est la seule des onze où la couronne reste entière presque
    // jusqu'au bout : « jaunit entre les nervures en gardant sa forme ».
    const e = mourirEnCours("solHorsGamme", vif, 0.8);
    expect(e.senescence).toBeGreaterThan(0.6);
    expect(e.partFoliaire).toBeGreaterThan(0.5);
  });

  it("maladie : garde ses feuilles brunes accrochées", () => {
    const e = mortAccomplie("maladie", vif);
    expect(e.partFoliaire).toBeGreaterThan(0.3);
    expect(e.senescence).toBeGreaterThan(0.8);
  });

  it("frottis : ne montre RIEN puis s'effondre", () => {
    // « l'arbre garde ses feuilles puis s'effondre d'un coup (annelé) » — une
    // mort sans préavis, et c'est ce qui la rend lisible.
    for (let a = 0; a <= 0.8; a += 0.1) {
      const e = mourirEnCours("frottis", vif, a);
      expect(e.partFoliaire).toBe(1);
      expect(e.senescence).toBe(0);
      expect(e.vigueur).toBe(1);
    }
    expect(mourirEnCours("frottis", vif, 0.95).chandelle).toBe(true);
  });

  it("labour : disparaît tout de suite, et ne devient pas une chandelle", () => {
    expect(mourirEnCours("labour", vif, 0.35).opacite).toBe(0);
    expect(mortAccomplie("labour", vif).chandelle).toBe(false);
  });

  it("abroutissement : rapetisse puis disparaît", () => {
    const milieu = mourirEnCours("abroutissement", vif, 0.4);
    expect(milieu.hauteur).toBeLessThan(0.8);
    expect(milieu.opacite).toBe(1);
    expect(mortAccomplie("abroutissement", vif).opacite).toBe(0);
    // Un plant brouté ne laisse pas de chandelle : il n'y a rien à laisser.
    expect(mortAccomplie("abroutissement", vif).chandelle).toBe(false);
  });

  it("ombre : s'efface sans jaunir, et ne vole pas la vedette", () => {
    for (let a = 0; a <= 1; a += 0.1) {
      expect(mourirEnCours("ombre", vif, a).senescence).toBe(0);
    }
    expect(mortAccomplie("ombre", vif).opacite).toBe(0);
  });

  it("vieillesse : la cime sèche d'abord", () => {
    const tot = mourirEnCours("vieillesse", vif, 0.3);
    expect(tot.dommageHydraulique).toBeGreaterThan(0.4);
    expect(tot.partFoliaire).toBe(1);
  });

  it("les trois causes qui font DISPARAÎTRE sont les seules à s'effacer", () => {
    // Un arbre mort de sécheresse reste debout en chandelle : le moteur le
    // garde en jeu, et l'effacer serait le contredire.
    const effacent = CAUSES.filter((c) => mortAccomplie(c, vif).opacite < 1);
    expect(new Set(effacent)).toEqual(new Set(["labour", "abroutissement", "ombre", "ecrasement"]));
  });

  it("les morts qui laissent une chandelle la laissent, les autres non", () => {
    const chandelles = CAUSES.filter((c) => mortAccomplie(c, vif).chandelle);
    // Le feu a sa trajectoire neutre (§6.4) : `chandelleA: 0` la rend vraie
    // dès le premier instant, ce qui est correct — un arbre torché EST une
    // chandelle noire.
    expect(chandelles).toContain("secheresse");
    expect(chandelles).toContain("vieillesse");
    expect(chandelles).toContain("frottis");
    expect(chandelles).not.toContain("labour");
    expect(chandelles).not.toContain("abroutissement");
    expect(chandelles).not.toContain("ecrasement");
  });
});

describe("parCause", () => {
  const mort = (id: number, cause: CauseMort): MortDeLaSemaine => ({
    id,
    x: id,
    y: id,
    especeId: "betula_pendula",
    cause,
    heightM: 8,
  });

  it("groupe les morts d'une semaine par cause", () => {
    const par = parCause([mort(1, "secheresse"), mort(2, "ombre"), mort(3, "secheresse")]);
    expect(par.get("secheresse")?.length).toBe(2);
    expect(par.get("ombre")?.length).toBe(1);
    expect(par.get("labour")).toBeUndefined();
  });

  it("rend une carte vide sur un journal vide", () => {
    expect(parCause([]).size).toBe(0);
  });
});
