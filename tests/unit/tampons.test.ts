/**
 * LE GARDE-FOU DES TAMPONS PRÊTÉS.
 *
 * `tampons.ts` prête des tableaux de travail à `tick` au lieu d'en allouer une
 * trentaine par semaine simulée. C'est un état de MODULE, ce que `src/engine`
 * évite partout ailleurs, et le danger est précis : si l'un de ces tampons
 * s'échappait du tick — retenu par l'état retourné, glissé dans `soil`, confié
 * à quoi que ce soit qui survit à la semaine — alors la semaine suivante le
 * réécrirait sous la précédente, et deux parties menées dans le même processus
 * se contamineraient.
 *
 * Rien dans le typage ne l'attraperait : un tampon est un tableau de nombres
 * comme un autre. Cet essai le vérifie donc par l'expérience, en menant deux
 * parties EN ALTERNANCE, tick par tick, et en exigeant qu'elles rendent
 * exactement ce qu'elles rendent jouées séparément.
 *
 * On exige l'égalité STRICTE, jamais une approximation : l'addition flottante
 * n'est pas associative, donc une contamination même infime se verrait sur les
 * bits de poids faible et c'est précisément ce qu'on veut voir.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";
import { oublierLesTampons, tampon } from "../../src/engine/tampons";
import { tick } from "../../src/engine/tick";

const SEMAINES = 3 * 52;

function partie(sc: typeof LIMON_RICHE, espece: string, coteM: number, graine: number) {
  const station = { ...sc.station, coteM };
  let state = createGameState(station, rngStateFromSeed(graine));
  state = plantScattered(state, espece, 12, 0.3);
  return { state, meteo: syntheticYear(sc.climat) };
}

/** Une empreinte qui touche tout ce qu'un tampon pourrait salir. */
function empreinte(s: GameState): string {
  const vivants = s.trees.filter((t) => t.alive);
  const somme = (xs: ArrayLike<number>) => {
    let v = 0;
    for (let i = 0; i < xs.length; i++) v += xs[i] ?? 0;
    return v;
  };
  return [
    vivants.length,
    vivants.reduce((a, t) => a + t.heightM, 0),
    vivants.reduce((a, t) => a + t.stress, 0),
    somme(s.soil.ph),
    somme(s.soil.humusCG),
    somme(s.soil.mineralNG),
    s.economy.treasuryEur,
  ].join("|");
}

describe("les tampons prêtés ne s'échappent pas du tick", () => {
  it("deux parties menées en alternance valent deux parties menées séparément", () => {
    // Deux stations et deux espèces DIFFÉRENTES, donc des tailles de parcelle
    // différentes : c'est le cas qui force le pool à réallouer, et celui où une
    // fuite se verrait le plus.
    const seule = (mk: () => ReturnType<typeof partie>) => {
      const { state, meteo } = mk();
      let s = state;
      for (let w = 0; w < SEMAINES; w++) s = tick(s, meteo[w % 52] as never).state;
      return empreinte(s);
    };
    const faireA = () => partie(LIMON_RICHE, "fagus_sylvatica", 24, 5);
    const faireB = () => partie(LANDE_SECHE, "pinus_sylvestris", 30, 11);

    const refA = seule(faireA);
    const refB = seule(faireB);

    // Maintenant les deux ensemble, une semaine chacune à tour de rôle.
    const a = faireA();
    const b = faireB();
    let sa = a.state;
    let sb = b.state;
    for (let w = 0; w < SEMAINES; w++) {
      sa = tick(sa, a.meteo[w % 52] as never).state;
      sb = tick(sb, b.meteo[w % 52] as never).state;
    }
    expect(empreinte(sa)).toBe(refA);
    expect(empreinte(sb)).toBe(refB);
  }, 300_000);

  it("un tampon part toujours de la valeur demandée, jamais de la semaine d'avant", () => {
    // Le contrat du pool, isolé : c'est le `fill` systématique qui empêche une
    // valeur de survivre d'un emprunt au suivant.
    const a = tampon("essai", 4, 0);
    a[0] = 42;
    a[3] = -7;
    const b = tampon("essai", 4, 0);
    expect(Array.from(b)).toEqual([0, 0, 0, 0]);
    // Et la valeur de remplissage est respectée, y compris quand ce n'est pas 0.
    expect(Array.from(tampon("essai", 4, 1))).toEqual([1, 1, 1, 1]);
    // Changer de taille donne un tampon neuf, pas une vue tronquée.
    expect(tampon("essai", 7, 0)).toHaveLength(7);
    oublierLesTampons();
  });
});
