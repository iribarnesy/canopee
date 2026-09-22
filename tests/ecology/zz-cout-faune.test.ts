import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { IndividuFaune, ModeFaune } from "../../src/engine/faune";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  type GameState,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { stateHash, tick } from "../../src/engine/tick";

/**
 * CE QUE LE PREMIER BANC MESURAIT, ET POURQUOI C'ÉTAIT FAUX.
 *
 * Il rendait des surcoûts NÉGATIFS — la faune plus rapide que son absence, de
 * 28 %. Impossible, donc il mesurait autre chose. Trois défauts, tous les
 * trois miens :
 *
 *  1. LA FAUNE CHANGEAIT LA SIMULATION. Elle ajoute de la prédation, donc moins
 *     de ravageurs, donc des arbres qui ne meurent pas aux mêmes semaines : au
 *     bout de trente ans de chauffe les peuplements avaient divergé, et je
 *     comparais le coût de DEUX FORÊTS DIFFÉRENTES. Corrigé en donnant aux
 *     individus une prédation NULLE : ils font tout le travail de calcul et ne
 *     changent rien au monde. La partie doit alors finir sur le même
 *     `stateHash`, et l'essai l'exige — sans quoi la comparaison ne vaut rien.
 *
 *  2. L'ORDRE DES MESURES COMPTAIT. Le témoin passait en premier et payait la
 *     compilation JIT dont les suivants profitaient. Corrigé en mesurant les
 *     trois modes en ROTATION, plusieurs fois, et en retenant le minimum de
 *     chacun — la mesure la moins polluée, pas la moyenne des pollutions.
 *
 *  3. LA DENSITÉ RÉALISTE NE PEUPLAIT PERSONNE. « Un couple à l'hectare » sur
 *     0,16 ha s'arrondissait à ZÉRO individu : le banc comparait le témoin à
 *     lui-même et appelait ça une mesure. On fixe désormais des EFFECTIFS, pas
 *     des densités.
 *
 * Et on part d'un état déjà chauffé, partagé par les trois modes, pour que la
 * chauffe ne soit pas comptée dans la mesure.
 *
 * ── LE RELEVÉ, 0,64 ha, 731 arbres, 200 ticks, meilleur de 3 ────────────────
 *
 *   effectif   bruit du témoin   par bloc   par cellule
 *       10         ±16,6 %        +1,5 %       −0,4 %
 *       50          ±4,1 %        +0,4 %       +4,3 %
 *      200          ±0,7 %        +0,5 %      +11,0 %
 *      500          ±1,5 %        −0,5 %      +26,8 %
 *
 * PAR BLOC : PLAT. De −0,5 à +1,5 %, toujours dans le bruit, y compris à cinq
 * cents individus. Gratuit, au sens strict de non mesurable.
 *
 * PAR CELLULE : LINÉAIRE, à ≈ 0,055 % par individu — 1 % tous les dix-huit. Aux
 * effectifs réalistes (quelques dizaines pour une parcelle, puisqu'un individu
 * s'ancre par un nid et qu'un nid occupe une place) c'est sous 1 %. Ça ne mord
 * qu'à partir de plusieurs centaines.
 *
 * Noter que le plancher de bruit s'effondre au fil des mesures : c'est le JIT
 * qui chauffe, et c'est pourquoi la ligne à dix individus n'est pas
 * exploitable. Ce sont les lignes à 200 et 500 qui portent la conclusion.
 *
 * CE QUE ÇA DÉCIDE. Le commutateur n'est PAS justifié par le calcul — il le
 * reste par la reproductibilité et parce qu'il EST le contrôle de neutralité du
 * lot. Et le choix d'implémentation reste libre : on peut prendre le mode par
 * cellule, le plus expressif, sans le payer.
 */

const L: string[] = [];

function individus(n: number, coteM: number, territoireM: number): IndividuFaune[] {
  const out: IndividuFaune[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: i,
      especeId: "parus_major",
      x: ((i * 37) % coteM) + 0.5,
      y: ((i * 61) % coteM) + 0.5,
      territoireM,
      // NULLE, et c'est tout le contrôle : le calcul a lieu, le monde ne bouge pas.
      predation: 0,
    });
  }
  return out;
}

const SERIE = serieMeteoPour(LIMON_RICHE.station.id);
if (!SERIE) throw new Error("série");
const METEO = serieToWeeks(SERIE);

/** Un état déjà installé, dont les trois modes partiront tous. */
function chauffer(coteM: number, arbresParHa: number): GameState {
  const ha = (coteM * coteM) / 10_000;
  const station: Station = { ...LIMON_RICHE.station, coteM, voisinage: [] };
  let s = plantScattered(
    createGameState(station, rngStateFromSeed(7)),
    "quercus_pubescens",
    Math.round(arbresParHa * ha),
  );
  for (let i = 0; i < 30 * 52; i++) s = tick(s, METEO[i % METEO.length]!).state;
  return s;
}

/** N ticks depuis l'état donné, dans le mode donné. Rend le temps et l'empreinte. */
function courir(depart: GameState, mode: ModeFaune, ind: IndividuFaune[], n: number) {
  let s: GameState = {
    ...depart,
    station: { ...depart.station, faune: mode, individus: ind },
  };
  const t0 = performance.now();
  for (let i = 0; i < n; i++) s = tick(s, METEO[i % METEO.length]!).state;
  return { ms: (performance.now() - t0) / n, empreinte: stateHash(s) };
}

describe("ce que coûte la faune en individus", () => {
  it("mesuré, à monde identique et en rotation", () => {
    const N = 200;
    const TOURS = 3;
    for (const [coteM, effectifs] of [[80, [10, 50, 200, 500]]] as const) {
      const depart = chauffer(coteM, 1200);
      const ha = (coteM * coteM) / 10_000;
      L.push(
        `\n═══ ${coteM}×${coteM} (${ha.toFixed(2)} ha, ${depart.trees.filter((t) => t.alive).length} arbres) — ${N} ticks, meilleur de ${TOURS}`,
      );
      process.stdout.write(`${L[L.length - 1]}\n`);
      for (const n of effectifs) {
        const ind = individus(n, coteM, 56);
        const best: Record<string, number> = {};
        const pire: Record<string, number> = {};
        const hashes: Record<string, number> = {};
        for (let tour = 0; tour < TOURS; tour++) {
          for (const mode of ["densite", "individus-bloc", "individus-cellule"] as const) {
            const r = courir(depart, mode, mode === "densite" ? [] : ind, N);
            best[mode] = Math.min(best[mode] ?? Number.POSITIVE_INFINITY, r.ms);
            pire[mode] = Math.max(pire[mode] ?? 0, r.ms);
            hashes[mode] = r.empreinte;
          }
        }
        // LE CONTRÔLE : à prédation nulle, les trois modes doivent produire le
        // MÊME monde. Sinon on compare le coût de deux simulations distinctes.
        expect(hashes["individus-bloc"]).toBe(hashes.densite);
        expect(hashes["individus-cellule"]).toBe(hashes.densite);
        const base = best.densite ?? 1;
        const pc = (x: number) => {
          const d = ((x - base) / base) * 100;
          return `${d >= 0 ? "+" : ""}${d.toFixed(1)} %`;
        };
        // Le PLANCHER DE BRUIT, mesuré et non supposé : l'écart du témoin avec
        // lui-même d'un tour à l'autre. Tout surcoût plus petit n'est pas lisible.
        const bruit = (((pire.densite ?? 0) - base) / base) * 100;
        L.push(
          `   ${String(n).padStart(3)} individus  ` +
            `densité ${base.toFixed(2)} ms (bruit ±${bruit.toFixed(1)} %)` +
            ` | bloc ${pc(best["individus-bloc"] ?? 0)}` +
            ` | cellule ${pc(best["individus-cellule"] ?? 0)}`,
        );
        // `process.stdout.write` et non `console.log` : vitest capture le
        // second. Et pas de fichier — `check:boundaries` l'interdit désormais
        // aux essais, pour la raison qui a fait tomber la CI de la v0.3.
        process.stdout.write(`${L[L.length - 1]}\n`);
      }
    }
  }, 1_800_000);
});
