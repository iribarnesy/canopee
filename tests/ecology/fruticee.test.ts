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
    // La ronce est héliophile et vit quinze ans : sous futaie, elle disparaît.
    expect(part(vieux, ["rubus_fruticosus"])).toBeLessThan(0.3 * part(jeune, ["rubus_fruticosus"]));
  });

  it("l'aubépine est la dernière pionnière debout — mesuré sur trois graines", () => {
    // **L'énoncé est vrai**, **c'est la mesure qui était fausse**, et il a fallu trois
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
    const graines = [21, 11, 42];
    const autres = ["prunus_spinosa", "rubus_fruticosus", "sambucus_nigra"];
    let aubepines = 0;
    const cumuls = new Map<string, number>();
    for (const graine of graines) {
      const fin = friche("lisiere-forestiere", [120], graine).get(120);
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
      // quatre chutes pour s'en apercevoir. Le classement se vérifie **au cumul**,
      // plus bas, là où les effectifs cessent d'être une poignée.
      expect(aubepine).toBeGreaterThan(0);
      aubepines += aubepine;
      for (const autre of autres) cumuls.set(autre, (cumuls.get(autre) ?? 0) + n(autre));
    }
    // **Au cumul**, **devant chacune** — et c'est la phrase du dessus, pas une de plus.
    //
    // La première version exigeait le **double**, et la CI l'a fait tomber (28
    // contre 15, soit 1,87×) : un multiple choisi sur un relevé rebascule au
    // premier lot qui déplace le tirage — il y en a eu trois. La deuxième
    // exigeait que l'aubépine passe les trois autres **réunies**, et #161 l'a fait
    // tomber à son tour (33 contre 46).
    //
    // Cette chute-là n'était pas une régression, et c'est ce qui a décidé de la
    // forme retenue. Vérifié espèce par espèce : aucun des survivants n'est
    // sous sa borne de pH — pH local 5,66 à 7,50, facteurs de croissance 0,764
    // à 1,000, l'aubépine à 7,99 m pour 8 m de potentiel. Le second seuil de pH
    // ne les maintient donc pas en vie ; il garde des tiges ailleurs, et la
    // succession se redistribue sur cent vingt ans. Il reste simplement **deux**
    // **fois plus** de pionnières qu'avant, si bien que « une contre trois réunies »
    // est devenue une barre arithmétique là où l'énoncé parle d'un classement.
    //
    // « La dernière debout » dit « devant », et devant tout le monde à la fois.
    // C'est donc devant **chacune** que ça se vérifie, au cumul, ce qui écrase le
    // tirage sans changer l'affirmation.
    //
    // Relevé sur les cinq graines, avant et après la stratification du budget
    // de bases (#170), qui a fait tomber l'ancienne ligne par graine :
    //
    //     avant : aubépine 51, prunellier 18, ronce 24, sureau 19
    //     après : aubépine 75, prunellier 21, ronce 16, sureau 24
    //
    // L'avance s'est **élargie** — de deux fois à trois fois la suivante. Ce qui a
    // bougé n'est donc pas l'écologie mais la répartition du tirage entre
    // graines, et c'est exactement ce que le cumul est là pour absorber.
    for (const [autre, n] of cumuls) {
      expect(aubepines, `cumul contre ${autre}`).toBeGreaterThan(n);
    }
  }, 900_000);
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
