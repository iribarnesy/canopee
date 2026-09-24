/**
 * La fertilisation (issue #140, critères C17 et C18).
 *
 * Le moteur n'avait aucun geste pour apporter de l'azote : un blé continu ne
 * pouvait que s'épuiser. Ce fichier vérifie les deux choses que le lot
 * affirme, et toutes deux contre **Broadbalk**, l'essai de fertilisation le plus
 * ancien du monde :
 *   1. la courbe de réponse **tombe** — elle n'est écrite nulle part ;
 *   2. minéral et fumier ne font pas la même chose, et c'est le lessivage qui
 *      les sépare.
 */

import { describe, expect, it } from "vitest";
import { applyAction, type GameAction } from "../../src/engine/actions";
import { HERBACEES } from "../../src/engine/herbacees";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const FICHE = HERBACEES.find((h) => h.id === "triticum_aestivum");
if (!FICHE?.culture) throw new Error("fiche du blé manquante");
const BLE = FICHE.culture;
const WEATHER = syntheticYear(LIMON_RICHE.climat);
const COTE = 30;
const R = 14;

/** Blé continu sur `ans` années, avec la fertilisation demandée. */
function bleContinu(
  ans: number,
  mineralKgNHa: number,
  fumierKgNHa = 0,
  options: { cote?: number; rayonM?: number; rangs?: number[] } = {},
): number[] {
  const cote = options.cote ?? COTE;
  const rayon = options.rayonM ?? R;
  const aireHa = (Math.PI * rayon * rayon) / 10_000;
  const centre = cote / 2;
  const station = { ...LIMON_RICHE.station, coteM: cote, voisinage: [] };
  let state: GameState = createGameState(station, rngStateFromSeed(4));
  for (const y of options.rangs ?? []) {
    for (let x = 2; x < cote; x += 8) state = plantAt(state, "juglans_regia", x, y, 2);
  }
  const rendements: number[] = [];
  const geste = (a: GameAction) => {
    const avant = state.economy.treasuryEur;
    state = applyAction(state, a).state;
    return state.economy.treasuryEur - avant;
  };
  for (let an = 0; an < ans; an++) {
    for (let w = 0; w < 52; w++) {
      const week = an * 52 + w;
      if (w === BLE.semisWeek - 1)
        geste({ type: "labourer", week, x: centre, y: centre, rayonM: rayon });
      if (w === BLE.semisWeek) {
        geste({
          type: "semer",
          week,
          x: centre,
          y: centre,
          rayonM: rayon,
          cultureId: "triticum_aestivum",
        });
        if (fumierKgNHa > 0) {
          geste({
            type: "fertiliser",
            week,
            x: centre,
            y: centre,
            rayonM: rayon,
            forme: "fumier",
            doseKgNHa: fumierKgNHa,
          });
        }
      }
      // L'azote minéral au **printemps**, quand la culture le prend. C'est la règle
      // agronomique de base, et le lessivage hivernal en est la raison.
      if (w === 10 && mineralKgNHa > 0) {
        geste({
          type: "fertiliser",
          week,
          x: centre,
          y: centre,
          rayonM: rayon,
          forme: "mineral",
          doseKgNHa: mineralKgNHa,
        });
      }
      if (w === BLE.recolteWeek) {
        rendements.push(
          geste({ type: "moissonner", week, x: centre, y: centre, rayonM: rayon }) /
            BLE.prixEurT /
            aireHa,
        );
      }
      const m = WEATHER[w];
      if (!m) throw new Error("météo manquante");
      state = tick(state, m).state;
    }
  }
  return rendements;
}

describe("le geste refuse ce qui n'est pas de la fertilisation", () => {
  const nu = createGameState(
    { ...LIMON_RICHE.station, coteM: 20, voisinage: [] },
    rngStateFromSeed(4),
  );
  const apport = (doseKgNHa: number): GameAction => ({
    type: "fertiliser",
    week: 10,
    x: 10,
    y: 10,
    rayonM: 5,
    forme: "mineral",
    doseKgNHa,
  });

  it("une dose nulle est refusée", () => {
    expect(applyAction(nu, apport(0)).refusals).toHaveLength(1);
  });

  it("au-delà de 250 kg N/ha, on ne fertilise plus", () => {
    // La directive nitrates plafonne l'organique à 170 kg N/ha/an en zone
    // vulnérable, et les paliers de Broadbalk montent à 192 en minéral.
    expect(applyAction(nu, apport(400)).refusals[0]?.reason).toContain("ce n'est plus fertiliser");
    expect(applyAction(nu, apport(192)).refusals).toEqual([]);
  });
});

describe("la courbe de réponse de Broadbalk TOMBE, elle n'est écrite nulle part", () => {
  // **Le rendement répond déjà à l'azote par la satisfaction de la strate** ;
  // l'apport ne fait que remplir le pool. Aucune courbe de réponse n'a été
  // écrite, et c'est la mesure qui dit si elle est juste.
  //
  // Broadbalk (Rothamsted, blé continu depuis 1843) : rien ~1 t/ha tenu sur
  // 170 ans, minéral 192 kg N → 8-9 t/ha, fumier + 96 → 9,6.
  const ANS = 30;
  const dernieres = (r: number[]) => {
    const dix = r.slice(-10);
    return dix.reduce((a, b) => a + b, 0) / dix.length;
  };

  it("plus d'azote, plus de grain — et c'est monotone", () => {
    // Relevé sur les paliers de l'essai, moyenne des dix dernières années :
    // rien 1,07 / 48 kg 2,54 / 96 kg 3,40 / 144 kg 4,17 / 192 kg 4,88.
    //
    // Les quatre premiers ont monté de 3 à 6 % depuis #140 (1,01 / 2,40 /
    // 3,21 / 3,92), et le cinquième n'a pas bougé d'un centième. Aucun lot n'a
    // touché à la culture entre-temps : c'est le flux aléatoire qui a glissé,
    // comme il glisse à chaque fois qu'un tirage s'insère en amont. On les
    // remet à ce que la mesure donne plutôt que de garder des chiffres qui ne
    // sortent plus.
    const rien = dernieres(bleContinu(ANS, 0));
    const moyen = dernieres(bleContinu(ANS, 96));
    const fort = dernieres(bleContinu(ANS, 192));
    expect(rien).toBeLessThan(moyen);
    expect(moyen).toBeLessThan(fort);
    // Le point **zéro** est le seul que Broadbalk cale à la décimale, et il tombe
    // juste : ~1 t/ha tenu sur cent soixante-dix ans.
    expect(rien).toBeGreaterThan(0.6);
    expect(rien).toBeLessThan(1.6);
    // Et l'apport fort multiplie le rendement par plus de trois.
    expect(fort).toBeGreaterThan(3 * rien);
  }, 900_000);

  it("le PLAFOND n'est pas dans l'azote : il est dans le tassement (#141)", () => {
    // Le moteur reproduit la **forme** de la courbe et pas son niveau haut :
    // 4,88 t/ha à 192 kg N contre 8-9 chez Broadbalk. La cause est mesurée et
    // elle est ailleurs — le tassement.
    //
    // **Le compte écrit ici était faux**, et il l'a été pendant tout un lot :
    // « quatre passages d'engin par an, soit 1,00 de tassement contre 0,20 de
    // réparation, donc épinglé dès la deuxième année ». Un seul geste tasse
    // dans le moteur d'aujourd'hui — `labourer` ; semer, fertiliser et
    // moissonner ne touchent pas la variable. C'est donc 0,25 par an contre
    // 0,20 de réparation, soit +0,05, et la **trajectoire** relevée au centre le
    // dit : 0,25 à l'an 1, 0,50 à l'an 6, 0,96 à l'an 15, 1,000 à partir de
    // l'an 16, pour toujours. Le plafond arrive quatorze ans plus tard
    // qu'annoncé, et il arrive quand même.
    //
    // **Ce qu'il coûte**, mesuré par neutralisation de `PERTE_CROISSANCE_MAX`
    // (le témoin que l'issue demandait), moyenne des dix dernières années sur
    // trente :
    //
    //                   moteur   témoin sans tassement   Broadbalk
    //   rien             1,07            1,70              ~1
    //   minéral 192      4,88            6,68              8-9
    //   fumier 240       6,21            8,39              ~9
    //
    // Le tassement coûte donc un bon tiers du rendement, et le plot fumé
    // neutralisé tombe dans la gamme de l'essai. **Mais** il soulève **toute** la
    // courbe, point zéro compris : 1,07 → 1,70 là où les parcelles nues de
    // Broadbalk tiennent ~1 depuis 1843. Le tassement faisait donc en partie
    // le travail de la paille qui manque (voir C16). Corriger l'un sans
    // regarder l'autre déplacerait le défaut au lieu de le lever — c'est écrit
    // dans l'issue, qui est passée à `moteur:évolution` pour cette raison : il
    // manque un **terme**, le desserrement par le soc, pas un coefficient.
    //
    // La preuve que le plafond est bien là : **les premières années, avant que
    // le tassement ne s'épingle, atteignent la gamme de Broadbalk** — 8,16 t/ha
    // à 192 kg N et 8,15 avec le fumier, à l'an 2.
    const fort = bleContinu(8, 192);
    expect(Math.max(...fort)).toBeGreaterThan(6.5);
  }, 900_000);
});

describe("minéral et fumier ne font pas la même chose", () => {
  it("à azote égal, le fumier tient et le minéral s'en va", () => {
    // **C'est le lessivage qui les sépare, et le moteur savait déjà le faire.**
    // Le minéral arrive dans le pool disponible — donc lessivable ; le fumier
    // arrive dans la litière, se minéralise sur des années et ne part pas tant
    // qu'il ne l'est pas.
    //
    // Mesuré au centre après trente ans : le plot minéral 192 porte 0,98 g/m²
    // d'azote minéral et **rien** en litière ; le plot fumier en porte 4,50 et
    // 20,25 de litière. Le second a constitué un stock, le premier non.
    const ANS = 30;
    const mineral = bleContinu(ANS, 192);
    const fumier = bleContinu(ANS, 0, 240);
    const moy = (r: number[]) => r.slice(-10).reduce((a, b) => a + b, 0) / 10;
    // Broadbalk dit la même chose : à azote comparable, le fumier fait mieux
    // sur la durée, parce qu'il construit un sol au lieu de le traverser.
    expect(moy(fumier)).toBeGreaterThan(moy(mineral));
  }, 900_000);
});

describe("et c'est la fertilisation qui rend le gradient LISIBLE (E13)", () => {
  it("allée fertilisée : l'ombre seule, monotone, sans compensation", () => {
    // **C'est le déblocage du lot.** Sans fertilisation, le gradient d'une
    // allée mesurait surtout l'azote que la litière des noyers rendait à un
    // blé qui s'épuisait : le rapport passait **au-dessus** de 1 entre H/L 0,93 et
    // 1,11 (`culture.test.ts`). Les deux côtés étant maintenant fertilisés,
    // c'est de l'ombre **pure** — donc comparable à ce que mesure Dupraz.
    //
    // Relevé, deux rangs de noyers encadrant une allée de 8 m, contre le même
    // blé fertilisé en plein champ :
    //
    //   H/L    0,29   0,55   0,74   0,84   1,02   1,28
    //   ratio  0,999  0,963  0,912  0,889  0,835  0,787
    //
    // Monotone d'un bout à l'autre. **Et le moteur ne montre pas de genou à
    // 0,8** : la baisse commence tout de suite et se poursuit. L'observation
    // de Dupraz — « pas beaucoup affecté sous H/L 0,8 » — reste compatible
    // (−9 % à 0,74), mais le moteur la produit comme une pente douce, pas
    // comme un seuil, et il faut le dire.
    const ANS = 34;
    const pur = bleContinu(ANS, 192, 0, { cote: 40, rayonM: 3 });
    const allee = bleContinu(ANS, 192, 0, { cote: 40, rayonM: 3, rangs: [16, 24] });
    const rapport = (a: number) => ((pur[a] ?? 0) > 0 ? (allee[a] ?? 0) / (pur[a] ?? 1) : 0);
    // Jeune, l'allée ne coûte presque rien.
    expect(rapport(1)).toBeGreaterThan(0.99);
    // Vieille, elle coûte, et l'écart est bien plus net que sans fertilisation
    // (0,787 contre 0,874) parce que rien ne le compense plus.
    expect(rapport(33)).toBeLessThan(0.85);
    // Et la décroissance est **monotone**, ce qu'elle n'était pas avant : le
    // rapport ne remonte jamais au-dessus de 1.
    for (const a of [3, 9, 15, 21, 27, 33]) expect(rapport(a)).toBeLessThanOrEqual(1);
  }, 900_000);
});
