/**
 * « Le bilan carbone peut être négatif au début d'une plantation »
 * (docs/realisme.md I8) — l'enseignement le plus contre-intuitif du projet, et
 * il n'était garanti par rien.
 *
 * Le mécanisme attendu : planter, c'est d'abord travailler le sol, donc
 * déstocker de l'humus (I6, `labourer` émet 1 % de l'humus par passage, calé sur
 * West et Post 2002) ; et
 * les jeunes arbres ne compensent pas avant des années.
 *
 * **La mesure a corrigé l'énoncé deux fois.** Elle a d'abord trouvé un creux
 * **sans** labour (−7,3 à −7,5 t C/ha) et conclu que c'était la jeunesse du
 * peuplement, pas le travail du sol. C'était la prairie : elle ne rendait
 * qu'un débit fixe et minait son humus. Depuis que la strate fabrique sa
 * matière (#247), une prairie installée tient son humus (Park Grass), et la
 * plantation qu'on y fait sans travailler le sol **ne creuse pas** : le stock
 * ne descend jamais sous le départ (+0,20 t C/ha au plus bas). Le creux revient
 * avec le labour. C'est ce que dit la littérature de l'afforestation des
 * prairies : la perte vient de la préparation du sol et de l'arrêt des apports,
 * pas de l'arbre.
 *
 * **Ce creux est mince, et il tient au mélange des litières** (#482). Les
 * −2,04 t C/ha de la première année qu'écrivait cet en-tête étaient périmés :
 * avant #482, main ne creusait plus que de 0,35 t C/ha, à la troisième année, et
 * repassait au-dessus du départ la cinquième. Le creux vient de la litière que
 * la prairie a bâtie en vingt ans, 11,4 t C/ha au labour. L'herbe retournée,
 * verte, puis celle qui repousse sur le labour, où l'humus brûlé vient de rendre
 * 68 kg N/ha, apportent une litière plus riche (C/N 62 la première année,
 * contre 83) ; la vitesse de décomposition de toute la litière de la cellule,
 * qui mêle ce qui y est tombé, monte alors de 15 % : le stock perd 0,74 t C/ha
 * en trois ans, quand celui du bras intact en gagne. **C'est ce saut qui creuse,
 * plus que le niveau de la litière** : une sonde qui la divise par deux ou par
 * quatre en accélérant sa décomposition garde un creux (−0,39 et −0,13 t C/ha),
 * alors que sous O2 (#470), où la litière tombe déjà riche (C/N 37) et ne
 * change presque pas au labour, il disparaît (+0,30 au plus bas). Le niveau de
 * la litière (11,4 t C/ha, plusieurs fois ce qu'une prairie abandonnée porte
 * sur le terrain : les sources sont à la ligne I8 de docs/realisme.md) et ce
 * mélange sont instruits dans #482, sans décision encore.
 *
 * **L'herbe sur pied est à l'inventaire depuis #482.** Elle n'y était pas : au
 * labour, elle passait à la litière et entrait au bilan le jour même, et ses
 * 0,72 t C/ha masquaient la perte d'humus du labour (0,75). Le total part
 * maintenant de 87,2 t C/ha, perd 0,75 t C/ha au labour, finit la première année
 * au-dessus du départ (+0,34 : l'herbe a repoussé, l'humus remonte), descend à
 * −0,33 et −0,34 les deux suivantes et repasse au-dessus la cinquième, sur les
 * trois graines.
 *
 * Ce qui est épinglé ici, ce sont des **directions** vérifiées graine par graine.
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
  /** total des stocks **avant** le travail du sol, t C/ha */
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

const STATION = { ...LIMON_RICHE.station, coteM: COTE, gibierParHa: 0, voisinage: [] };
const METEO = syntheticYear(LIMON_RICHE.climat);
/**
 * Années de prairie avant la plantation. On plante dans une prairie
 * **installée**, comme sur le terrain : la parcelle de départ porte une strate
 * mais pas de litière, et depuis que la strate fabrique sa matière (#247), elle
 * bâtit 3,8 t C/ha de litière la première année. Partir de là mesurait la
 * naissance d'une litière, pas une plantation. Vingt ans la mettent à ~11 t C/ha.
 */
const ANS_DE_PRAIRIE = 20;

/** La prairie installée d'une graine, calculée une fois pour les deux bras. */
function prairieInstallee(seed: number): GameState {
  let state: GameState = createGameState(STATION, rngStateFromSeed(seed));
  for (let a = 0; a < ANS_DE_PRAIRIE; a++) {
    for (let w = 0; w < 52; w++) {
      const m = METEO[w % 52];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  return state;
}

/** Une plantation de chênes dans une prairie installée, labour préalable ou non. */
function plantation(prairie: GameState, laboure: boolean): Serie {
  const station = STATION;
  const meteo = METEO;
  let state = prairie;
  const depart = carbonInventory(state, station.initialSoilCTHa).totalTHa;
  if (laboure) {
    const { state: apres, refusals } = applyAction(state, {
      type: "labourer",
      week: ANS_DE_PRAIRIE * 52,
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
      const prairie = prairieInstallee(seed);
      parties.push({
        seed,
        laboure: plantation(prairie, true),
        intact: plantation(prairie, false),
      });
    }
  }, 900_000);

  it("passe SOUS son point de départ dans les premières années", () => {
    // Mesuré dans une prairie installée (87,2 t C/ha au départ, herbe sur pied
    // comprise) : −0,34 t C/ha après labour, à la troisième année, sur les trois
    // graines. La borne est une direction, sans nombre sourcé (#482).
    for (const p of parties) {
      expect(p.laboure.creux).toBeLessThan(0);
      // Et il est atteint **tôt** : pas un déclin sans fin, un creux qu'on franchit.
      expect(p.laboure.anneeDuCreux).toBeLessThan(ANS);
    }
  });

  it("puis repasse au-dessus, sans que la date du croisement soit épinglée", () => {
    // Croisement relevé : 5ᵉ année après labour (7ᵉ quand la litière de la
    // prairie était plus haute encore, 22ᵉ–23ᵉ avant #247, quand la prairie
    // minait son humus). Le chiffre
    // est là pour être relu, pas pour contraindre — il tient à toute la
    // croissance, et il a d'ailleurs reculé de deux ans quand l'infradensité
    // (#68) a allégé le carbone vivant des jeunes tiges.
    for (const p of parties) {
      expect(p.laboure.croisement).toBeGreaterThan(0);
      expect(p.laboure.parAn[ANS - 1]).toBeGreaterThan(p.laboure.depart);
    }
  });

  it("le labour CREUSE le déficit et ne hâte jamais le retour, graine par graine", () => {
    // C'est ici que le travail du sol se lit : −0,34 t C/ha avec labour contre
    // +0,20 sans, et le retour au-dessus du départ à la cinquième année contre
    // la deuxième. Le labour brûle un pour cent de l'humus, et la litière de la
    // prairie se décompose plus vite pendant que l'herbe repousse.
    for (const p of parties) {
      expect(p.laboure.creux).toBeLessThan(p.intact.creux);
      expect(p.laboure.croisement).toBeGreaterThanOrEqual(p.intact.croisement);
    }
  });

  it("sans labour, une plantation dans une prairie installée ne creuse pas", () => {
    // **L'essai disait le contraire, et c'est la prairie qui avait tort.** Il
    // affirmait « le creux existe sans lui » : une parcelle plantée sans travail
    // du sol perdait 7,3 à 7,5 t C/ha. La strate ne rendait alors qu'un débit
    // fixe, et l'humus se minéralisait sans rien en face. Une prairie qui
    // fabrique sa matière tient son humus, et les jeunes chênes s'ajoutent à
    // elle au lieu de la remplacer.
    //
    // Prédit avant la mesure : un creux plus faible que 0,5 t C/ha. Mesuré :
    // le stock ne descend jamais sous le départ (+0,20 au plus bas).
    for (const p of parties) {
      expect(p.intact.creux).toBeGreaterThan(-0.5);
      expect(p.intact.parAn[ANS - 1]).toBeGreaterThan(p.intact.depart);
    }
  });
});
