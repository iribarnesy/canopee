/**
 * CE QUE LA STRATE BASSE REND AU SOL (issue #201).
 *
 * Elle ne rendait RIEN, et le trou ne se voyait qu'en ÉNUMÉRANT : tout le
 * moteur verse au pool de litière — la chute des feuilles d'un ARBRE, les
 * crottes de chevreuil, le BRF et le fumier, l'érosion qui redépose — sauf la
 * strate herbacée. Ni sénescence, ni racines fines, ni chaume, ni paille.
 *
 * **Et le vrai défaut n'est pas celui qu'on cherchait.** On cherchait le
 * carbone : une prairie qui perd 42 % de son humus en cinquante ans. On a
 * trouvé une FUITE D'AZOTE. La strate prélevait ~31 kg N/ha/an et rien ne les
 * rendait : dans un moteur où l'herbe n'a pas de masse, cet azote ne partait
 * pas dans une plante, il DISPARAISSAIT. Mesuré, prairie permanente sur limon
 * riche, azote minéral moyen :
 *
 *     an           1       6      11      16
 *     avant     1,236   1,108   1,015   0,931  g N/m²   (et ça continue)
 *     après     1,262   1,332   1,255   1,178
 *
 * Une prairie permanente stérilisait son propre sol. C'est ce que ce lot
 * bouche, et c'est pour ça qu'il déplace beaucoup de choses calibrées sur un
 * moteur qui fuyait.
 *
 * Ce fichier tient quatre choses :
 *
 *   1. **la conservation** — une plante ne rend que ce qu'elle a pris, et
 *      c'est ce que la deuxième version du lot a dû apprendre de force ;
 *   2. **la fuite bouchée**, mesurée sur la prairie ;
 *   3. **ce que le lot ne fait PAS** : l'humus continue de baisser, et on
 *      écrit pourquoi au lieu de remonter un coefficient ;
 *   4. **le C/N de la paille**, le trait qui décide de la suite.
 */

import { describe, expect, it } from "vitest";
import { HERBACEES, N_HERBACEES } from "../../src/engine/herbacees";
import { HERBE_AZOTE_G_M2_SEMAINE } from "../../src/engine/herbe";
import { syntheticYear } from "../../src/engine/meteo";
import { litterDecayRate } from "../../src/engine/nitrogen";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const METEO = syntheticYear(LIMON_RICHE.climat);
const somme = (a: readonly number[] | Float64Array) => Array.from(a).reduce((x, y) => x + y, 0);
const moyenne = (a: readonly number[] | Float64Array) => somme(a) / a.length;

/** Une prairie spontanée, sans arbre et sans geste, sur `ans` années. */
function prairie(ans: number, cote = 30) {
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [] };
  let s: GameState = createGameState(station, rngStateFromSeed(4));
  const mineral: number[] = [];
  const humus: number[] = [];
  const litiere: number[] = [];
  for (let i = 0; i < ans * 52; i++) {
    const m = METEO[i % 52];
    if (!m) throw new Error("météo manquante");
    s = tick(s, m).state;
    if (i % 52 === 51) {
      mineral.push(moyenne(s.soil.mineralNG));
      humus.push(somme(s.soil.humusCG) / 1000);
      litiere.push(somme(s.soil.litterCG) / 1000);
    }
  }
  return { mineral, humus, litiere, etat: s, aireHa: (cote * cote) / 10_000 };
}

describe("une plante ne rend que ce qu'elle a pris", () => {
  it("le retour est BORNÉ par le prélèvement, et c'est la loi du lot", () => {
    // **La deuxième version de ce lot l'a appris de force.** La première posait
    // un taux de renouvellement sur la fiche et en tirait la litière : elle
    // rendait 120 kg N/ha/an là où la strate en prélève 31. Trente-quatre
    // essais sont tombés, un frêne poussait 17 % au-dessus de sa table, et
    // `tick-conservation` a chiffré la fuite à 0,38 kg N/ha par semaine.
    //
    // Le mécanisme n'avait pas besoin d'un taux inventé : le moteur porte déjà
    // le flux annuel de la strate, c'est son prélèvement d'azote.
    const parAn = HERBE_AZOTE_G_M2_SEMAINE * 52 * 10; // g/m²/sem → kg/ha/an
    expect(parAn).toBeGreaterThan(20);
    expect(parAn).toBeLessThan(50);
  });

  it("et le carbone qui l'accompagne suit le C/N de l'espèce", () => {
    // C'est le seul degré de liberté qui reste, et il est sur la fiche : à
    // azote égal, une paille apporte trois fois et demie plus de carbone qu'une
    // feuille tendre, parce qu'elle en porte trois fois et demie plus.
    const ble = HERBACEES.find((h) => h.id === "triticum_aestivum");
    const anemone = HERBACEES.find((h) => h.id === "anemone_nemorosa");
    if (!ble || !anemone) throw new Error("fiches manquantes");
    expect(ble.litiere.cSurN / anemone.litiere.cSurN).toBeGreaterThan(3);
  });

  it("une culture garde dans son grain l'azote qui quitte la parcelle", () => {
    // Sans ce champ, une céréale restituerait tout ce qu'elle a pris, y compris
    // ce qu'on vend, et le moteur rendrait l'exportation gratuite. Une pérenne
    // n'a pas de bloc `culture` : elle rend tout, ce qui est sa biologie.
    const ble = HERBACEES.find((h) => h.id === "triticum_aestivum");
    if (!ble?.culture) throw new Error("fiche du blé manquante");
    expect(ble.culture.azoteDansLeGrain).toBeGreaterThan(0.5);
    expect(ble.culture.azoteDansLeGrain).toBeLessThan(1);
    for (const h of HERBACEES) {
      if (!h.culture) continue;
      expect(h.culture.azoteDansLeGrain).toBeGreaterThanOrEqual(0);
      expect(h.culture.azoteDansLeGrain).toBeLessThanOrEqual(1);
    }
  });
});

describe("LE RÉSULTAT DU LOT : la prairie cesse de stériliser son sol", () => {
  it("l'azote minéral tient, au lieu de descendre sans fin", () => {
    // **Voilà ce que le lot répare, et ce n'est pas ce qu'on cherchait.** Dans
    // un moteur où l'herbe n'a pas de masse, l'azote qu'elle prélevait ne
    // partait pas dans une plante : il disparaissait du système. Une prairie
    // permanente perdait donc son azote minéral pour toujours — 1,236 → 0,931
    // g/m² en seize ans, soit un quart, sans plancher en vue.
    //
    // La propriété de conservation ne pouvait pas le voir : elle compte le
    // prélèvement comme une SORTIE légitime, puisqu'une plante l'a pris. Rien
    // ne vérifiait qu'il revienne, parce que pour les arbres il revient
    // (`LITTER_RETURN_FRACTION`) et que personne n'avait regardé la strate.
    const r = prairie(16);
    const an = (a: number) => r.mineral[a - 1] ?? 0;
    // Il ne s'effondre plus : seize ans plus tard il est encore à plus de 90 %
    // de son départ, là où l'ancien moteur en avait perdu un quart.
    expect(an(16)).toBeGreaterThan(0.9 * an(1));
    // Et il ne s'envole pas non plus — on rend ce qui a été pris, pas plus.
    expect(an(16)).toBeLessThan(1.2 * an(1));
  }, 600_000);

  it("la litière trouve un stock d'équilibre au lieu de rester à zéro", () => {
    // Elle restait à 0,00 les deux mille six cents semaines. Et la première
    // version du lot l'a fait s'empiler à 99 t C/ha en quarante ans, parce que
    // `litterK` — la vitesse de décomposition d'une cellule, mélange pondéré de
    // ce qui y est tombé — n'avait jamais été posée sur une parcelle sans
    // arbre et valait zéro. Elle se déduit du C/N, donc le trait suffisait.
    const r = prairie(40);
    const parHa = (kg: number) => kg / r.aireHa / 1000;
    const fin = r.litiere[39] ?? 0;
    expect(parHa(fin)).toBeGreaterThan(0.1);
    expect(parHa(fin)).toBeLessThan(10);
    // Et c'est un ÉQUILIBRE, pas une pente.
    const avant = r.litiere[29] ?? 0;
    expect(Math.abs(fin - avant) / avant).toBeLessThan(0.1);
  }, 900_000);
});

describe("ce que ce lot ne fait PAS, et il faut le mesurer aussi", () => {
  it("l'humus continue de baisser, et la cause est en amont", () => {
    // **On n'annonce pas ce qu'on ne tient pas.** L'issue visait Park Grass —
    // prairie permanente non fertilisée depuis 1856, qui tient son stock. Le
    // moteur n'y arrive pas : l'humus descend encore, à peine moins vite
    // qu'avant (−36 % à quarante ans au lieu de −42 %).
    //
    // La raison est arithmétique et elle est EN AMONT, pas dans ce lot : le
    // retour conservateur fait ~0,5 t C/ha/an, là où il en faudrait ~1,9 pour
    // équilibrer la décomposition de l'humus. Une plante ne peut rendre que ce
    // qu'elle a pris, et la strate de ce moteur prend 31 kg N/ha/an quand une
    // prairie tempérée réelle en prend 100 à 200.
    //
    // **Remonter un coefficient pour faire passer le chiffre serait exactement
    // la faute que #197 a corrigée chez le sanglier** : un nombre calé sur le
    // moteur n'est pas une ancre. Le prélèvement de la strate est marqué
    // *(à calibrer)* depuis toujours ; le relever est un lot à soi, avec ses
    // propres ancres, et il touchera beaucoup de vert.
    const r = prairie(40);
    const depart = r.humus[0] ?? 0;
    const fin = r.humus[39] ?? 0;
    expect(fin).toBeLessThan(depart);
    // Il descend, mais il descend MOINS qu'avant le lot (−42 % mesuré alors).
    expect(fin / depart).toBeGreaterThan(0.6);
  }, 900_000);
});

describe("la paille, et le trait qui décide de la suite", () => {
  it("le C/N du blé est le plus élevé de l'atlas, et de loin", () => {
    // Une paille de céréale est à 80-100 : elle IMMOBILISE l'azote du sol le
    // temps que les micro-organismes la digèrent, et ne le rend qu'ensuite. Un
    // feuillage herbacé jeune est à 15-25 et se minéralise en quelques
    // semaines. C'est ce que `azoteNetDecomposition` (C9) savait traiter depuis
    // longtemps sans jamais en voir un seul cas.
    const cn = HERBACEES.map((h) => h.litiere.cSurN);
    const ble = HERBACEES.find((h) => h.id === "triticum_aestivum");
    if (!ble) throw new Error("fiche du blé manquante");
    expect(ble.litiere.cSurN).toBe(Math.max(...cn));
    expect(ble.litiere.cSurN).toBeGreaterThan(70);
    // Et le C/N commande la vitesse sans qu'on l'écrive : une paille se
    // décompose plusieurs fois plus lentement qu'une feuille tendre.
    const anemone = HERBACEES.find((h) => h.id === "anemone_nemorosa");
    if (!anemone) throw new Error("fiche de l'anémone manquante");
    expect(litterDecayRate(ble.litiere.cSurN)).toBeLessThan(
      litterDecayRate(anemone.litiere.cSurN) / 3,
    );
  });

  it("chaque herbacée déclare son trait, dans une gamme tenable", () => {
    expect(HERBACEES.length).toBe(N_HERBACEES);
    for (const h of HERBACEES) {
      // Un C/N de litière végétale vit entre la légumineuse et la paille.
      expect(h.litiere.cSurN).toBeGreaterThanOrEqual(10);
      expect(h.litiere.cSurN).toBeLessThanOrEqual(100);
    }
  });

  it("une litière de molinie est plus dure qu'une litière de dactyle", () => {
    // La molinie fait une touradon sèche et fibreuse qui tient l'hiver, et
    // c'est ce qui fait la litière acide d'une lande à molinie. Aucune espèce
    // n'est nommée dans le moteur : c'est la fiche qui porte l'écart.
    const molinie = HERBACEES.find((h) => h.id === "molinia_caerulea");
    const dactyle = HERBACEES.find((h) => h.id === "dactylis_glomerata");
    if (!molinie || !dactyle) throw new Error("fiches manquantes");
    expect(molinie.litiere.cSurN).toBeGreaterThan(dactyle.litiere.cSurN);
  });
});
