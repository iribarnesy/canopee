/**
 * Le générateur des scènes de l'APERÇU (docs/interface-visuelle.md §5).
 *
 * **Ce script a changé d'usage, et il a failli disparaître avec le banc.** Il
 * est né pour figer la scène que le banc du lot L0 rejouait, afin de comparer
 * Pixi et Canvas 2D sur le MÊME jeu d'arbres d'une machine à l'autre. Ce
 * travail-là est fini : D1 est tranchée, le banc est supprimé.
 *
 * Ce qui reste, et qui n'est pas la même chose : **la boucle de revue du
 * rendu**. Pour juger une palette, une texture ou un décor, il faut des
 * instantanés du moteur — vrais, reproductibles, pris à des saisons et sur des
 * stations choisies. C'est ce que ce script produit, et c'est pour ça qu'il
 * survit au banc sous un autre nom.
 *
 *   npm run apercu:scene
 *   APERCU_NOM=friche.json APERCU_ANS=30 APERCU_SEMAINES=4,17,28,42 npm run apercu:scene
 *   APERCU_NOM=mare.json APERCU_EAU=mare npm run apercu:scene
 *
 * Paramètres : station `friche-limon` portée à 1 ha, graine 42, météo réelle,
 * climat figé. Le voisinage de la station est CONSERVÉ — c'est lui qui
 * colonise la friche, et sans lui la parcelle reste nue.
 *
 * Une passe unique produit tous les instantanés demandés : c'est des décennies
 * de simulation sur dix mille cellules, on ne les refait pas par année.
 *
 * **La leçon de méthode du lot L0 vaut toujours** : une scène produite par un
 * script non versionné devient fausse sans que rien ne le signale. Les scènes
 * elles-mêmes ne sont pas versionnées (un mégaoctet pièce) ; ce script, si.
 */

import { writeFileSync } from "node:fs";
import { serieMeteoPour } from "../src/data/meteo";
import { getScenario, meteoDerivee, normalesHebdo } from "../src/engine/climat";
import { cellulesEnEau } from "../src/engine/eau_surface";
import { advanceWeek } from "../src/engine/game";
import { serieToWeeks } from "../src/engine/meteo";
import { getPaysage } from "../src/engine/paysage";
import { altitudeParCellule } from "../src/engine/relief";
import { rngStateFromSeed } from "../src/engine/rng";
import { createGameState, type GameState, type Station } from "../src/engine/state";
import { FRICHE_LIMON } from "../src/engine/stations";

const GRAINE = 42;
const COTE_M = 100;
const DOSSIER = process.env.APERCU_DOSSIER ?? "apercu/scenes";
/** Nom du fichier produit ; par défaut `scene-anN.json`. */
const NOM = process.env.APERCU_NOM;
/**
 * Variantes de STATION. Sans pente on ne voit pas l'ombrage de relief, et sans
 * eau on ne voit pas l'eau : une seule station ne suffit pas à juger un rendu.
 */
const PENTE_PCT = process.env.APERCU_PENTE ? Number(process.env.APERCU_PENTE) : undefined;
const EAU = process.env.APERCU_EAU as "ruisseau" | "mare" | undefined;
/**
 * Semaines DANS L'ANNÉE à figer, en plus de la fin d'année.
 *
 * Sans ça on ne capture qu'au 31 décembre — soit la semaine la plus humide de
 * l'année, celle où le sol rejette l'eau partout. Le rendu en concluait que la
 * parcelle était inondée en permanence. Pour juger une palette de saison, il
 * faut des instantanés PRIS à ces saisons, pas un instantané d'hiver repeint.
 */
const SEMAINES = (process.env.APERCU_SEMAINES ?? "")
  .split(",")
  .map((v) => Number.parseInt(v.trim(), 10))
  .filter((n) => Number.isFinite(n) && n >= 0 && n < 52);
const ANS = (process.env.APERCU_ANS ?? "50")
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
function figerLeSol(
  state: GameState,
  station: Station,
  debordementMm: Float32Array<ArrayBufferLike>,
) {
  const arrondi = (a: readonly number[] | Float32Array<ArrayBufferLike>, d = 3) =>
    Array.from(a, (v) => Number(v.toFixed(d)));
  const dims = { widthM: station.coteM, heightM: station.coteM };
  return {
    ruMm: station.ruMm,
    // L'eau libre est FIXE avec la station ; le débordement, lui, est de la
    // semaine — les deux voyagent séparément dans le protocole, et le rendu
    // les dessine différemment (bord franc contre lame translucide).
    enEau: cellulesEnEau(station.eau, dims),
    // Le débordement vient du RÉSULTAT DU TICK, pas de `state.soil.excessMm`.
    // Les deux existent et ne disent pas la même chose : `excessMm` est la
    // réserve de débordement du profil, une grandeur d'état, tandis que le
    // rendu veut ce qui n'a pas pu rentrer CETTE SEMAINE — c'est ce que
    // `soilDebordementMm` transporte (protocol.ts). Confondre les deux
    // inondait la parcelle entière sur l'aperçu.
    debordementMm: arrondi(debordementMm, 2),
    altitudesM: arrondi(altitudeParCellule(station.relief, dims), 2),
    waterMm: arrondi(state.soil.waterMm, 2),
    herbeCouverture: arrondi(state.soil.herbeCouverture),
    herbeBiomasse: arrondi(state.soil.herbeBiomasse),
    litiereCG: arrondi(state.soil.litterCG, 1),
    // Les quatre bordures, réduites à ce dont le décor a besoin : trois parts
    // par côté. Le rendu n'a que faire des semenciers ou du gibier, et lui
    // passer le `Paysage` entier lui donnerait accès à des données de moteur
    // qu'il n'a aucune raison de connaître (D6).
    bordures: Object.fromEntries(
      (["nord", "est", "sud", "ouest"] as const).map((cote) => {
        const p = getPaysage(station.bordures[cote]);
        return [cote, { boise: p.partBoisee, cultive: p.partCultivee, urbain: p.partUrbaine }];
      }),
    ),
  };
}

function main() {
  // 1 ha au lieu des 50 × 50 m de la station de test : c'est la taille du
  // pire cas annoncé par l'inventaire.
  const base = FRICHE_LIMON.station;
  const station: Station = {
    ...base,
    coteM: COTE_M,
    ...(PENTE_PCT === undefined
      ? {}
      : { relief: { ...base.relief, pentePct: PENTE_PCT, forme: "croupe" as const } }),
    ...(EAU === undefined
      ? {}
      : {
          eau:
            EAU === "ruisseau"
              ? ({ type: "ruisseau", cote: "sud", bergeM: 0.3 } as const)
              : ({ type: "mare", xRel: 0.6, yRel: 0.4, rayonM: 9, bergeM: 0.5 } as const),
        }),
  };
  const serie = serieMeteoPour(station.id);
  if (!serie) throw new Error(`série météo manquante : ${station.id}`);
  const weather = serieToWeeks(serie);
  const normales = normalesHebdo(weather);
  const scenario = getScenario("stable");

  let state = createGameState(station, rngStateFromSeed(GRAINE));
  const dernierAn = ANS[ANS.length - 1] ?? 50;
  const aEcrire = new Set(ANS);
  const rapports: string[] = [];
  let dernierDebordement: Float32Array<ArrayBufferLike> = new Float32Array(COTE_M * COTE_M);
  // La trajectoire année par année : c'est elle qui dit OÙ est le pire cas,
  // et ce n'est plus là où le premier jet l'avait trouvé.
  process.stderr.write("an\ttiges\tvivantes\tchandelles\thmax\n");
  for (let i = 0; i < dernierAn * 52; i++) {
    const base = weather[i % weather.length];
    if (!base) throw new Error("météo manquante");
    const w = meteoDerivee(base, i % 52, scenario, 2026 + Math.floor(i / 52), normales);
    const semaine = advanceWeek(state, w, []);
    state = semaine.state;
    dernierDebordement = semaine.debordementParCellule;
    // Les semaines demandées de la DERNIÈRE année, figées au passage.
    const anEnCours = Math.floor(i / 52) + 1;
    if (anEnCours === dernierAn && SEMAINES.includes(i % 52)) {
      const nom = NOM ? NOM.replace(/\.json$/, "") : `scene-an${dernierAn}`;
      writeFileSync(
        `${DOSSIER}/${nom}-s${i % 52}.json`,
        `${JSON.stringify({
          coteM: COTE_M,
          week: i,
          trees: figer(state),
          sol: figerLeSol(state, station, semaine.debordementParCellule),
        })}\n`,
      );
    }
    if ((i + 1) % 52 !== 0) continue;
    const an = (i + 1) / 52;
    const vivantes = state.trees.filter((t) => t.alive).length;
    const hMax = state.trees.reduce((m, t) => Math.max(m, t.heightM), 0);
    process.stderr.write(
      `${an}\t${state.trees.length}\t${vivantes}\t${state.trees.length - vivantes}\t${hMax.toFixed(2)}\n`,
    );
    if (!aEcrire.has(an)) continue;
    const trees = figer(state);
    const fichier = NOM ? `${DOSSIER}/${NOM}` : `${DOSSIER}/scene-an${an}.json`;
    writeFileSync(
      fichier,
      `${JSON.stringify({
        coteM: COTE_M,
        week: an * 52,
        trees,
        sol: figerLeSol(state, station, dernierDebordement),
      })}\n`,
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
