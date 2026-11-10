/**
 * La strate arbustive (prunellier, aubépine, ronce, sureau), et ce qu'elle
 * change à la succession.
 *
 * L'atlas les classe tous « pionniers » et trois d'entre eux « nurse » : ce
 * sont eux qui prennent une friche en premier, et sous lesquels les arbres
 * passent leurs premières années. Sans eux, le noisetier — arbuste de
 * sous-étage — jouait à lui seul toute la strate basse.
 */

import { describe, expect, it } from "vitest";
import { getEspece } from "../../src/engine/especes";
import { syntheticYear } from "../../src/engine/meteo";
import { bordersUniformes, entourageDeLaStation } from "../../src/engine/paysage";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const ARBUSTES = ["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus", "sambucus_nigra"];

function friche(paysageId: string, annees: number[], graine = 21): Map<number, GameState> {
  const base = LIMON_RICHE.station;
  const b = bordersUniformes(paysageId);
  const st = { ...base, coteM: 40, ...entourageDeLaStation(b, base.phInitial, base.ruMm) };
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let state = createGameState(st, rngStateFromSeed(graine));
  const etapes = new Map<number, GameState>();
  for (const an of annees) {
    while (state.week < an * 52) state = tick(state, meteo[state.week % 52] as never).state;
    etapes.set(an, state);
  }
  return etapes;
}

function part(state: GameState, ids: readonly string[]): number {
  const vivants = state.trees.filter((t) => t.alive);
  if (vivants.length === 0) return 0;
  return vivants.filter((t) => ids.includes(t.especeId)).length / vivants.length;
}

describe("la fruticée prend la friche, puis se fait dominer", () => {
  const etapes = friche("lisiere-forestiere", [15, 40, 120]);

  it("à quinze ans, la friche est d'abord un fourré", () => {
    const jeune = etapes.get(15);
    if (!jeune) throw new Error("étape manquante");
    expect(part(jeune, ARBUSTES)).toBeGreaterThan(0.4);
  });

  it("à cent vingt ans, les arbres ont pris le dessus et la ronce s'efface", () => {
    const vieux = etapes.get(120);
    const jeune = etapes.get(15);
    if (!vieux || !jeune) throw new Error("étape manquante");
    // La ronce vit quinze ans et ne tolère que la demi-ombre (compensation
    // 0,06 dans l'atlas) : elle tient sous un couvert clair, et sous la futaie
    // elle recule. La phrase disait « héliophile », ce que l'atlas ne dit pas
    // (#438).
    expect(part(vieux, ["rubus_fruticosus"])).toBeLessThan(0.3 * part(jeune, ["rubus_fruticosus"]));
  });

  it("l'aubépine reste debout sur chacune des cinq graines", () => {
    // **L'énoncé passait pour vrai**, **et c'est la mesure qu'on accusait** ; il a fallu trois
    // recalibrations pour s'en apercevoir. L'essai exigeait 5 % des tiges, puis
    // un multiple de 2, puis de 1,5 sur **une** graine — or à cent vingt ans il ne
    // reste qu'une poignée de pionnières, et un rapport entre deux ou trois
    // individus mesure le tirage, pas l'écologie. Relevé à l'écriture :
    //
    //     graine 21 : 239 tiges — aubépine  2, prunellier 0, ronce 2, sureau 1
    //     graine  3 : 257 tiges — aubépine  5, prunellier 1, ronce 0, sureau 0
    //     graine  7 : 279 tiges — aubépine  6, prunellier 2, ronce 0, sureau 0
    //     graine 11 : 274 tiges — aubépine 12, prunellier 4, ronce 1, sureau 3
    //     graine 42 : 256 tiges — aubépine 13, prunellier 0, ronce 0, sureau 1
    //
    // L'aubépine est en tête sur les cinq, à égalité une fois. C'est **ça** que la
    // phrase veut dire, et ça se dit en cumulant — comme §16 le demande pour un
    // critère écologique. Trois graines suffisent à le trancher et coûtent deux
    // parties de plus ; les cinq sont au relevé pour la mémoire.
    //
    // **Les cinq depuis #370.** Le foin qui reste sur pied a dévié les
    // trajectoires, et au cumul des trois la ronce est passée devant d'une tige
    // en CI (55 contre 54) ; sous Node 22, 47 contre 44, la graine 11 portant à
    // elle seule 32 ronces (3 à la base). Relevé sous Node 22, à cent vingt ans,
    // graines 21 / 11 / 42 / 3 / 7 :
    //
    //     base    : aubépine 57 (16/13/15/8/5), prunellier 31, ronce 33, sureau 25
    //     branche : aubépine 67 (19/14/11/12/11), prunellier 39, ronce 54, sureau 25
    //
    // Le classement tient au cumul des cinq des deux côtés, la phrase reste la
    // même. La graine 21 est celle des étapes du haut : sa partie n'est pas
    // refaite.
    //
    // **Le classement au cumul est retiré (#438, décision du propriétaire).**
    // L'essai exigeait que l'aubépine passe devant chacune des trois autres au
    // cumul des cinq graines. Rien ne le sourçait. Il était déjà tombé quatre
    // fois avec le tirage, et l'atlas dit la ronce de « demi-ombre tolérée »
    // (compensation 0,06, contre 0,10 pour l'aubépine). Depuis que la pénombre
    // conserve le feuillage des couronnes, le couvert de cent vingt ans est plus
    // sombre, et la ronce y tient mieux que l'aubépine, comme sa fiche le dit.
    // Relevé à cent vingt ans, cinq graines, au cumul :
    //
    //     main 18dbb29 : aubépine 68, prunellier 28, ronce 52, sureau 28
    //     branche      : aubépine 18, prunellier 17, ronce 26, sureau 5
    //
    // Ce qui reste affirmé, c'est l'aubépine **debout** sur chaque graine, et la
    // ronce qui s'efface (l'essai précédent).
    const graines = [21, 11, 42, 3, 7];
    for (const graine of graines) {
      const fin =
        graine === 21 ? etapes.get(120) : friche("lisiere-forestiere", [120], graine).get(120);
      if (!fin) throw new Error("étape manquante");
      const vivants = fin.trees.filter((t) => t.alive);
      const n = (id: string) => vivants.filter((t) => t.especeId === id).length;
      const aubepine = n("crataegus_monogyna");
      // **Debout** sur chaque graine — c'est ça qui se vérifie par partie, et rien
      // de plus. L'essai exigeait aussi qu'elle soit **en tête** sur chacune, et
      // cette ligne-là est tombée pour la quatrième fois (#170, graine 21 :
      // 7 aubépines contre 11 sureaux). Elle disait en code l'inverse de ce que
      // le commentaire ci-dessus dit en français — « un rapport entre deux ou
      // trois individus mesure le tirage, pas l'écologie » — et il a fallu
      // quatre chutes pour s'en apercevoir.
      expect(aubepine, `graine ${graine}`).toBeGreaterThan(0);
    }
  }, 1_500_000);
});

describe("ce que les épineux apportent", () => {
  it("le gibier les délaisse : c'est ce qui en fait des nurses", () => {
    // Un chevreuil broute d'abord le noisetier et le pommier ; l'épine noire
    // et l'aubépine, il les contourne. C'est sous elles que les semis passent.
    const epineux = ["prunus_spinosa", "crataegus_monogyna"];
    const appetants = ["corylus_avellana", "malus_domestica"];
    for (const e of epineux) {
      for (const a of appetants) {
        expect(getEspece(e).gibier.appetence).toBeLessThan(getEspece(a).gibier.appetence);
      }
    }
  });

  it("le sureau est nitrophile : il demande plus d'azote que les autres arbustes", () => {
    const sureau = getEspece("sambucus_nigra").azote.demandeRelative;
    for (const id of ["prunus_spinosa", "crataegus_monogyna", "rubus_fruticosus"]) {
      expect(sureau).toBeGreaterThan(getEspece(id).azote.demandeRelative);
    }
  });

  it("la ronce est la plus rapide de l'atlas — c'est pour ça qu'elle gagne d'abord", () => {
    const ronce = getEspece("rubus_fruticosus").pousseMaxMAn;
    for (const id of ARBUSTES) {
      if (id === "rubus_fruticosus") continue;
      expect(ronce).toBeGreaterThan(getEspece(id).pousseMaxMAn);
    }
  });
});
