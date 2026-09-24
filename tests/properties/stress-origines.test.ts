import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LIMON_RICHE, VALLEE_ENGORGEE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * D'où vient le stress d'un arbre **vivant** (#153).
 *
 * `stress` est une somme : la famine, les facteurs de station, les ravageurs et
 * les maladies y tombent ensemble. Jusqu'ici seules les causes lentes en
 * ressortaient nommées (`stressLent` / `causeLente`) ; les deux causes
 * biotiques n'étaient nommées qu'à la **mort** de l'arbre, c'est-à-dire presque
 * jamais, puisqu'il survit. Mesuré avant le correctif : soixante abricotiers
 * sur vingt-cinq ans encaissaient 592 unités de dégâts, dont aucune n'était
 * imputable parce qu'aucun arbre n'en mourait.
 *
 * Deux choses à tenir, et la seconde est celle qui peut se casser en silence.
 */

function parcelle(
  sc: StationClimat,
  plantations: { especeId: string; count: number }[],
  annees: number,
  seed: number,
): GameState[] {
  const meteo = syntheticYear(sc.climat);
  let s = createGameState(
    { ...sc.station, coteM: 50, gibierParHa: 0, voisinage: [] },
    rngStateFromSeed(seed),
  );
  for (const p of plantations) s = plantScattered(s, p.especeId, p.count, 0.3);
  /** Un relevé par an : l'invariant doit tenir en chemin, pas seulement à la fin. */
  const releves: GameState[] = [];
  for (let i = 0; i < annees * 52; i++) {
    const w = meteo[s.week % meteo.length];
    if (!w) throw new Error("météo manquante");
    s = tick(s, w).state;
    if (s.week % 52 === 0) releves.push(s);
  }
  releves.push(s);
  return releves;
}

describe("les origines du stress sont des PARTS de stress", () => {
  it("leur somme ne dépasse jamais le stress, sur deux stations", () => {
    const debordements: string[] = [];
    for (const [nom, sc, especes] of [
      [
        "limon riche",
        LIMON_RICHE,
        [
          { especeId: "prunus_armeniaca", count: 25 },
          { especeId: "malus_domestica", count: 25 },
        ],
      ],
      [
        "vallée engorgée",
        VALLEE_ENGORGEE,
        [
          { especeId: "alnus_glutinosa", count: 25 },
          { especeId: "salix_alba", count: 25 },
        ],
      ],
      // Une frênaie serrée : c'est le **seul** banc où la maladie tire, puisque la
      // chalarose du frêne est la seule maladie de l'atlas. Sans elle, la
      // moitié « maladie » du lot serait livrée sans avoir jamais tourné.
      ["frênaie", LIMON_RICHE, [{ especeId: "fraxinus_excelsior", count: 60 }]],
    ] as const) {
      for (const etat of parcelle(sc, [...especes], 20, 11)) {
        for (const t of etat.trees) {
          const nommé = (t.stressLent ?? 0) + (t.stressRavageurs ?? 0) + (t.stressMaladie ?? 0);
          // Le frottis ajoute du stress sans compteur nommé — il se lit par
          // `frotteSemaine`. La somme des origines est donc **inférieure ou égale**
          // au stress, jamais supérieure : une part qui dépasserait son tout
          // voudrait dire qu'une origine a échappé à l'amortissement.
          if (nommé > t.stress + 1e-9) {
            debordements.push(
              `${nom} an ${Math.floor(etat.week / 52)} arbre ${t.id} : ${nommé.toFixed(4)} nommé > ${t.stress.toFixed(4)} de stress`,
            );
          }
          expect(t.stressRavageurs ?? 0).toBeGreaterThanOrEqual(0);
          expect(t.stressMaladie ?? 0).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(debordements.slice(0, 5)).toEqual([]);
  });

  it("un arbre VIVANT attaqué sait désormais nommer son agresseur", () => {
    // Une monoculture serrée d'une espèce sensible : le cas du retour de partie
    // qui a ouvert #149 (« je plante des abricotiers et je veux comprendre »).
    const releves = parcelle(LIMON_RICHE, [{ especeId: "prunus_armeniaca", count: 60 }], 25, 11);
    const fin = releves[releves.length - 1];
    if (!fin) throw new Error("aucun relevé");
    const vivants = fin.trees.filter((t) => t.alive);
    const nommés = vivants.filter((t) => (t.stressRavageurs ?? 0) + (t.stressMaladie ?? 0) > 0);
    const mortsBiotiques = fin.trees.filter(
      (t) => !t.alive && (t.causeMort === "ravageurs" || t.causeMort === "maladie"),
    );

    // C'est bien le trou que #153 décrit : les dégâts sont massifs et la mort
    // ne les révèle pas. Si un jour des arbres meurent des ravageurs sur ce
    // banc, la première assertion tiendra toujours — mais l'essai aura cessé
    // d'éprouver le cas difficile, alors on le dit.
    expect(mortsBiotiques.length).toBe(0);
    expect(vivants.length).toBeGreaterThan(40);
    // La majorité des survivants porte une trace biotique nommée : avant ce
    // lot, ce nombre était structurellement zéro.
    expect(nommés.length).toBeGreaterThan(vivants.length / 2);
  });

  it("la MALADIE se nomme aussi, et pas seulement les ravageurs", () => {
    // La chalarose est la seule maladie de l'atlas et elle ne frappe que le
    // frêne : un banc sans frêne laisse `stressMaladie` à zéro partout et
    // n'éprouve rien. Le premier jet de cet essai faisait exactement ça — des
    // abricotiers, des pommiers, des aulnes et des saules, et une moitié du lot
    // jamais exécutée, en vert.
    const releves = parcelle(LIMON_RICHE, [{ especeId: "fraxinus_excelsior", count: 60 }], 20, 11);
    const fin = releves[releves.length - 1];
    if (!fin) throw new Error("aucun relevé");
    const vivants = fin.trees.filter((t) => t.alive);
    const malades = vivants.filter((t) => (t.stressMaladie ?? 0) > 0);
    expect(vivants.length).toBeGreaterThan(30);
    expect(malades.length).toBe(vivants.length);
    // Et la part nommée est **séparée** de celle des ravageurs : un frêne peut
    // porter les deux, et le jeu doit pouvoir dire lequel pèse.
    const cumulMaladie = vivants.reduce((a, t) => a + (t.stressMaladie ?? 0), 0);
    expect(cumulMaladie).toBeGreaterThan(1);
  });
});
