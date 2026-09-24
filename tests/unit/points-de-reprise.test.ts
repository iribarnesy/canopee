/**
 * **La prémisse du rembobinage** (#128, §6.8 №3) : un état retenu reste figé.
 *
 * Le rembobinage garde des points de reprise — des états de partie mis de côté
 * tous les tant de semaines — et revient à l'un d'eux pour rejouer la période.
 * **Tout repose sur une propriété du moteur** : `advanceWeek` rend un état **neuf**
 * et ne touche pas à celui qu'on lui donne. Si elle tombait, un point de
 * reprise vieillirait avec la partie et le rembobinage ramènerait au présent
 * sans que rien ne casse — le pire des défauts, celui qui ne se voit pas.
 *
 * Le worker en dépendait déjà sans le dire : `prefixeSousLePlafond` rejoue une
 * semaine trop chargée depuis l'état retenu à son ouverture (#133). Cet essai
 * rend la dépendance explicite, et sur une échelle qui compte : soixante arbres
 * et deux cents semaines d'écart.
 *
 * **La première version de cet essai ne prouvait rien** : la parcelle était
 * vide, donc `trees` — le tableau qu'on craint le plus de voir muter — n'avait
 * aucun contenu à perdre.
 */

import { describe, expect, it } from "vitest";
import type { GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";

const STATION: Station = { ...LIMON_RICHE.station, coteM: 40, voisinage: [], gibierParHa: 2 };
const WEATHER = syntheticYear(LIMON_RICHE.climat);
const meteo = (i: number) => {
  const w = WEATHER[i % 52];
  if (!w) throw new Error("météo manquante");
  return w;
};

/** Ce qui doit rester identique : tout ce dont un point de reprise a besoin. */
function empreinte(etat: ReturnType<typeof createGameState>) {
  return JSON.stringify({
    week: etat.week,
    eau: etat.soil.waterMm.reduce((s, v) => s + v, 0),
    ph: etat.soil.ph.reduce((s, v) => s + v, 0),
    azote: etat.soil.mineralNG.reduce((s, v) => s + v, 0),
    humus: etat.soil.humusCG.reduce((s, v) => s + v, 0),
    tiges: etat.trees.map((a) => [a.id, a.heightM, a.diametreCm, a.stress]),
    rng: [...etat.rng],
    banque: etat.banqueGraines,
    nextTreeId: etat.nextTreeId,
    tresorerie: etat.economy.treasuryEur,
  });
}

describe("un point de reprise", () => {
  it("reste figé pendant que la partie continue sans lui", () => {
    let etat = createGameState(STATION, rngStateFromSeed(7));
    const semis: GameAction[] = [
      {
        type: "planter",
        week: 0,
        especeId: "betula_pendula",
        positions: Array.from({ length: 60 }, (_, k) => ({
          x: 2 + (k % 10) * 3,
          y: 2 + Math.floor(k / 10) * 3,
        })),
      },
    ];
    etat = advanceWeek(etat, meteo(0), semis).state;
    for (let i = 1; i < 300; i++) etat = advanceWeek(etat, meteo(i), []).state;

    const point = etat;
    const avant = empreinte(point);
    expect(point.trees.length, "la sonde doit porter sur un VRAI peuplement").toBe(60);

    let suite = point;
    for (let i = 300; i < 500; i++) suite = advanceWeek(suite, meteo(i), []).state;
    expect(suite.week).toBe(500);

    expect(empreinte(point)).toBe(avant);
  });

  it("ne partage avec la suite aucun tableau que la suite modifie", () => {
    let etat = createGameState(STATION, rngStateFromSeed(3));
    for (let i = 0; i < 30; i++) etat = advanceWeek(etat, meteo(i), []).state;
    const point = etat;
    const suite = advanceWeek(point, meteo(30), []).state;
    // Partager un seul de ces tableaux suffirait à faire vieillir le point.
    expect(point.soil).not.toBe(suite.soil);
    expect(point.soil.waterMm).not.toBe(suite.soil.waterMm);
    expect(point.soil.ph).not.toBe(suite.soil.ph);
    expect(point.trees).not.toBe(suite.trees);
    // **`rng`, lui, peut être le même objet**, et l'essai l'a appris en
    // échouant : une semaine qui ne tire rien le laisse tel quel. Ce n'est pas
    // un danger, c'est la preuve inverse — le moteur **remplace** au lieu de
    // modifier, donc un tableau partagé est un tableau qui n'a pas changé.
    // Ce qui se vérifie est donc le **contenu**, et c'est l'essai du dessus.
  });
});
