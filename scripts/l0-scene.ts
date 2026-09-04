/**
 * LOT L0 — le générateur de la scène que le banc rejoue.
 *
 * La scène est **figée en JSON exprès** : c'est ce qui permet de comparer
 * Pixi et Canvas 2D sur le MÊME jeu d'arbres d'une machine à l'autre
 * (docs/lot0-pointe-technique.md). Mais figée ne veut pas dire
 * irreproductible : ce script est l'autre moitié du marché, et il faut le
 * relancer chaque fois que le moteur change ce que la parcelle contient. Le
 * premier jet ne l'était pas — d'où celui-ci.
 *
 *   npm run l0:scene                 # l'an 50 seul
 *   L0_ANS=10,25,30,50 npm run l0:scene
 *
 * Paramètres : station `friche-limon` portée à 1 ha, graine 42, météo réelle,
 * climat figé. Le voisinage de la station est CONSERVÉ — c'est lui qui
 * colonise la friche, et sans lui la parcelle reste nue.
 *
 * Une passe unique produit tous les instantanés demandés : c'est cinquante ans
 * de simulation sur dix mille cellules, on ne les refait pas par année.
 */

import { writeFileSync } from "node:fs";
import { serieMeteoPour } from "../src/data/meteo";
import { getScenario, meteoDerivee, normalesHebdo } from "../src/engine/climat";
import { advanceWeek } from "../src/engine/game";
import { serieToWeeks } from "../src/engine/meteo";
import { altitudeParCellule } from "../src/engine/relief";
import { rngStateFromSeed } from "../src/engine/rng";
import { createGameState, type GameState, type Station } from "../src/engine/state";
import { FRICHE_LIMON } from "../src/engine/stations";

const GRAINE = 42;
const COTE_M = 100;
const DOSSIER = process.env.L0_DOSSIER ?? "spike";
const ANS = (process.env.L0_ANS ?? "50")
  .split(",")
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);

/** Un arbre tel que le banc l'attend — la forme est un contrat, ne pas la changer. */
interface ArbreScene {
  id: number;
  especeId: string;
  x: number;
  y: number;
  heightM: number;
  chandelle: boolean;
  hauteurElagueeM: number;
}

const arrondi = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;

/**
 * **Ne pas filtrer les arbres vivants avant de poser `chandelle`.** Le piège
 * historique du dépôt : garder `t.alive` puis calculer le drapeau sur ce qui
 * reste rend toutes les chandelles invisibles — or un mort debout est
 * précisément ce qu'on veut voir.
 */
function figer(state: GameState): ArbreScene[] {
  return state.trees.map((t) => ({
    id: t.id,
    especeId: t.especeId,
    x: arrondi(t.x, 2),
    y: arrondi(t.y, 2),
    heightM: arrondi(t.heightM, 3),
    chandelle: !t.alive,
    hauteurElagueeM: arrondi(t.hauteurElagueeM, 2),
  }));
}

function recensement(an: number, fichier: string, trees: ArbreScene[]): string {
  const vivants = trees.filter((t) => !t.chandelle);
  const hMax = (a: ArbreScene[]) => a.reduce((m, t) => Math.max(m, t.heightM), 0);
  const compte = (a: ArbreScene[]) => {
    const c = new Map<string, number>();
    for (const t of a) c.set(t.especeId, (c.get(t.especeId) ?? 0) + 1);
    return [...c].sort((x, y) => y[1] - x[1]);
  };
  const parEspeceVivants = new Map(compte(vivants));
  const lignes = [
    `AN ${an} — ${fichier}`,
    `  tiges                ${trees.length}`,
    `  dont chandelles      ${trees.length - vivants.length}`,
    `  vivantes             ${vivants.length}`,
    `  hauteur maximale     ${hMax(trees).toFixed(2)} m (vivantes : ${hMax(vivants).toFixed(2)} m)`,
    `  tiges sous 1 m       ${trees.filter((t) => t.heightM < 1).length} (vivantes : ${vivants.filter((t) => t.heightM < 1).length})`,
    "  six espèces les plus nombreuses (toutes tiges / vivantes) :",
  ];
  for (const [id, n] of compte(trees).slice(0, 6)) {
    lignes.push(`    ${id.padEnd(22)} ${String(n).padStart(5)} / ${parEspeceVivants.get(id) ?? 0}`);
  }
  return lignes.join("\n");
}

/**
 * Le SOL de la même scène, ajouté pour le lot L1.
 *
 * Le premier jet ne figeait que les arbres, parce que le banc de L0 ne
 * dessinait le sol qu'en carte d'humidité. Le lot L1 lui donne sa vraie
 * palette — herbe, biomasse sur pied, litière — et il faut donc que ces
 * grilles voyagent aussi, sinon on regarde un sol inventé.
 *
 * Les valeurs sont arrondies : trois décimales suffisent pour huit paliers de
 * quantification, et le fichier reste lisible.
 */
function figerLeSol(state: GameState, station: Station) {
  const arrondi = (a: readonly number[], d = 3) => Array.from(a, (v) => Number(v.toFixed(d)));
  const dims = { widthM: station.coteM, heightM: station.coteM };
  return {
    ruMm: station.ruMm,
    altitudesM: arrondi(altitudeParCellule(station.relief, dims), 2),
    waterMm: arrondi(state.soil.waterMm, 2),
    herbeCouverture: arrondi(state.soil.herbeCouverture),
    herbeBiomasse: arrondi(state.soil.herbeBiomasse),
    litiereCG: arrondi(state.soil.litterCG, 1),
  };
}

function main() {
  // 1 ha au lieu des 50 × 50 m de la station de test : c'est la taille du
  // pire cas annoncé par l'inventaire.
  const station: Station = { ...FRICHE_LIMON.station, coteM: COTE_M };
  const serie = serieMeteoPour(station.id);
  if (!serie) throw new Error(`série météo manquante : ${station.id}`);
  const weather = serieToWeeks(serie);
  const normales = normalesHebdo(weather);
  const scenario = getScenario("stable");

  let state = createGameState(station, rngStateFromSeed(GRAINE));
  const dernierAn = ANS[ANS.length - 1] ?? 50;
  const aEcrire = new Set(ANS);
  const rapports: string[] = [];
  // La trajectoire année par année : c'est elle qui dit OÙ est le pire cas,
  // et ce n'est plus là où le premier jet l'avait trouvé.
  process.stderr.write("an\ttiges\tvivantes\tchandelles\thmax\n");
  for (let i = 0; i < dernierAn * 52; i++) {
    const base = weather[i % weather.length];
    if (!base) throw new Error("météo manquante");
    const w = meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52), normales);
    state = advanceWeek(state, w, []).state;
    if ((i + 1) % 52 !== 0) continue;
    const an = (i + 1) / 52;
    const vivantes = state.trees.filter((t) => t.alive).length;
    const hMax = state.trees.reduce((m, t) => Math.max(m, t.heightM), 0);
    process.stderr.write(
      `${an}\t${state.trees.length}\t${vivantes}\t${state.trees.length - vivantes}\t${hMax.toFixed(2)}\n`,
    );
    if (!aEcrire.has(an)) continue;
    const trees = figer(state);
    const fichier = `${DOSSIER}/scene-an${an}.json`;
    writeFileSync(
      fichier,
      `${JSON.stringify({ coteM: COTE_M, week: an * 52, trees, sol: figerLeSol(state, station) })}\n`,
    );
    rapports.push(recensement(an, fichier, trees));
  }
  console.log(
    [
      `station ${station.id} · ${COTE_M} × ${COTE_M} m · graine ${GRAINE} · climat stable · météo réelle`,
      "",
      ...rapports,
    ].join("\n\n"),
  );
}

main();
