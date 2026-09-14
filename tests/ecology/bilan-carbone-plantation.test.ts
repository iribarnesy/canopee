/**
 * « Le bilan carbone peut être négatif au début d'une plantation »
 * (docs/realisme.md I8) — l'enseignement le plus contre-intuitif du projet, et
 * il n'était garanti par rien.
 *
 * Le mécanisme attendu : planter, c'est d'abord travailler le sol, donc
 * déstocker de l'humus (I6, `labourer` émet 5 % de l'humus par passage) ; et
 * les jeunes arbres ne compensent pas avant des années.
 *
 * LA MESURE EN DIT PLUS QUE L'ÉNONCÉ, et c'est la raison d'être du témoin
 * intact. Le creux existe AUSSI sans labour : une parcelle nue plantée de
 * chênes perd 7,7 à 8,1 t C/ha avant de remonter, parce que l'humus se
 * minéralise à 1,5 %/an (`HUMUS_DECAY_PER_YEAR`) pendant que des plants de
 * trente centimètres ne rendent presque rien à la litière. Le labour n'est donc
 * pas la CAUSE du bilan négatif : il l'aggrave d'un tiers et retarde le retour
 * à l'équilibre de deux ans. Sans le témoin, cet essai aurait attribué au
 * labour un creux qu'il ne fait que creuser.
 *
 * Ce qui est épinglé ici, ce sont des DIRECTIONS vérifiées graine par graine.
 * La date du croisement est relevée en commentaire et non assertée : elle
 * dépend de tout le moteur de croissance, et un seuil posé dessus périmerait au
 * premier changement d'allométrie (docs/realisme.md, « ce qu'un test écologique
 * a le droit d'affirmer »).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { applyAction } from "../../src/engine/actions";
import { carbonInventory } from "../../src/engine/carbon";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const COTE = 50;
const ANS = 30;
const PLANTS = 150;
const GRAINES = [1, 2, 3];

interface Serie {
  /** total des stocks AVANT le travail du sol, t C/ha */
  depart: number;
  /** total des stocks à la fin de chaque année, t C/ha */
  parAn: number[];
  /** creux le plus profond, relatif au départ (négatif = la parcelle a déstocké) */
  creux: number;
  /** année du creux (1 = fin de la première année) */
  anneeDuCreux: number;
  /** première année où le total repasse au-dessus du départ, 0 si jamais */
  croisement: number;
}

/** Une plantation de chênes, labour préalable ou non. */
function plantation(seed: number, laboure: boolean): Serie {
  const station = { ...LIMON_RICHE.station, coteM: COTE, gibierParHa: 0, voisinage: [] };
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let state: GameState = createGameState(station, rngStateFromSeed(seed));
  const depart = carbonInventory(state, station.initialSoilCTHa).totalTHa;
  if (laboure) {
    const { state: apres, refusals } = applyAction(state, {
      type: "labourer",
      week: 0,
      x: COTE / 2,
      y: COTE / 2,
      rayonM: COTE,
    });
    // Un labour refusé (trésorerie, heures, engin bloqué) rendrait les deux
    // séries identiques et l'essai muet : il faut le voir échouer ici.
    expect(refusals).toEqual([]);
    state = apres;
  }
  state = plantScattered(state, "quercus_pubescens", PLANTS);
  const parAn: number[] = [];
  for (let a = 0; a < ANS; a++) {
    for (let w = 0; w < 52; w++) {
      const m = meteo[w % 52];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
    parAn.push(carbonInventory(state, station.initialSoilCTHa).totalTHa);
  }
  const min = Math.min(...parAn);
  const anneeDuCreux = parAn.indexOf(min) + 1;
  const croisement = parAn.findIndex((v, i) => i >= anneeDuCreux && v > depart) + 1;
  return { depart, parAn, creux: min - depart, anneeDuCreux, croisement };
}

describe("le bilan carbone d'une plantation", () => {
  const parties: { seed: number; laboure: Serie; intact: Serie }[] = [];

  // Six parties de trente ans sur 2 500 cellules : plus de deux minutes sur ma
  // machine, davantage sur le runner d'intégration. Le hook porte donc son
  // délai, et la campagne ne tourne pas à la collecte, où rien ne la couvrirait.
  beforeAll(() => {
    for (const seed of GRAINES) {
      parties.push({ seed, laboure: plantation(seed, true), intact: plantation(seed, false) });
    }
  }, 900_000);

  it("passe SOUS son point de départ dans les premières années", () => {
    // Mesuré sur le code livré, départ à 73,97 t C/ha : le creux vaut −11,14 /
    // −11,36 / −11,30 t C/ha après labour, toujours à la douzième année.
    for (const p of parties) {
      expect(p.laboure.creux).toBeLessThan(0);
      // Et il est atteint TÔT : pas un déclin sans fin, un creux qu'on franchit.
      expect(p.laboure.anneeDuCreux).toBeLessThan(ANS);
    }
  });

  it("puis repasse au-dessus, sans que la date du croisement soit épinglée", () => {
    // Croisement relevé : 24ᵉ année après labour, 22ᵉ sans. Le chiffre est là
    // pour être relu, pas pour contraindre — il tient à toute la croissance.
    for (const p of parties) {
      expect(p.laboure.croisement).toBeGreaterThan(0);
      expect(p.laboure.parAn[ANS - 1]).toBeGreaterThan(p.laboure.depart);
    }
  });

  it("le labour CREUSE le déficit et retarde le retour, graine par graine", () => {
    // C'est ici que le travail du sol se lit, et nulle part ailleurs :
    // −11,14 / −11,36 / −11,30 avec labour contre −7,82 / −8,05 / −8,00 sans,
    // et le croisement passe de la 22ᵉ à la 24ᵉ année sur les trois graines.
    for (const p of parties) {
      expect(p.laboure.creux).toBeLessThan(p.intact.creux);
      expect(p.laboure.croisement).toBeGreaterThan(p.intact.croisement);
    }
  });

  it("mais le labour n'est PAS la cause du bilan négatif : le creux existe sans lui", () => {
    // La découverte de cette campagne, et la raison pour laquelle le témoin
    // intact existe. Une parcelle nue plantée sans aucun travail du sol perd
    // quand même 7,7 à 8,1 t C/ha : l'humus se minéralise à 1,5 %/an et de
    // jeunes plants ne rendent presque rien à la litière. Le labour ajoute un
    // tiers à un creux qu'il n'a pas créé.
    //
    // Cet essai dit donc l'énoncé de I8 plus précisément que I8 lui-même : ce
    // n'est pas le travail du sol qui rend le bilan négatif, c'est la JEUNESSE
    // du peuplement.
    for (const p of parties) {
      expect(p.intact.creux).toBeLessThan(0);
      expect(p.intact.parAn[ANS - 1]).toBeGreaterThan(p.intact.depart);
    }
  });
});
