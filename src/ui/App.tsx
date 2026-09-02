/**
 * UI jetable de la V0 (« labo moteur ») : bilan hydrique, croissance des
 * 5 espèces et carte spatiale (eau du sol + couronnes) sur les stations de
 * test. Sera remplacée par la vraie UI (React + PixiJS) — ne rien construire
 * de précieux ici.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { serieMeteoPour } from "../data/meteo";
import {
  createGameState,
  crownRadiusM,
  ESPECES_V0,
  type GameState,
  getEspece,
  plantScattered,
  rngStateFromSeed,
  STATIONS_V0,
  type StationClimat,
  serieToWeeks,
  syntheticYear,
  type TickFluxes,
  tick,
  type WeekWeather,
} from "../engine";
import { carbonInventory } from "../engine/carbon";
import { type Horizon, ruHorizonMm } from "../engine/soil";

const YEARS = 20;
const TREES_PER_SPECIES = 30;
/** ids ≤ ce seuil = cohorte plantée ; au-delà = recrues de la régénération */
const PLANTED_MAX_ID = TREES_PER_SPECIES * 5;

import { COULEUR_AUTRES, SPECIES_COLORS } from "./couleurs";

interface WeekPoint {
  week: number;
  meanWaterMm: number;
  waterlogging: number;
  fluxes: TickFluxes;
  heights: Record<string, number>;
  /** tous les individus vivants, recrues comprises */
  aliveCounts: Record<string, number>;
  /** ceux qui viennent de la cohorte plantée (0 en succession) */
  plantesVivants: Record<string, number>;
}

interface SimResult {
  points: WeekPoint[];
  /** état en fin d'été de la dernière année : l'assèchement local est visible */
  finalState: GameState;
}

/** Sur la friche, on ne plante rien : on regarde la succession se dérouler. */
function isSuccessionStation(sc: StationClimat): boolean {
  return sc.station.id === "friche-limon";
}

function simulate(sc: StationClimat, weather: WeekWeather[]): SimResult {
  const succession = isSuccessionStation(sc);
  const years = succession ? 150 : YEARS;
  let state = createGameState(sc.station, rngStateFromSeed(42));
  if (!succession) {
    for (const espece of ESPECES_V0) {
      state = plantScattered(state, espece.id, TREES_PER_SPECIES);
    }
  }
  const statMaxId = succession ? Infinity : PLANTED_MAX_ID;
  let lateSummerState = state;
  const points: WeekPoint[] = [];
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    const result = tick(state, w);
    state = result.state;
    const heights: Record<string, number> = {};
    const aliveCounts: Record<string, number> = {};
    const plantesVivants: Record<string, number> = {};
    for (const espece of ESPECES_V0) {
      // Hauteur DOMINANTE (max des vivants, recrues comprises) : la métrique
      // forestière standard, sans l'artefact des moyennes qui s'effondrent
      // quand un individu meurt. Les comptages distinguent la cohorte plantée.
      const alive = state.trees.filter((t) => t.especeId === espece.id && t.alive);
      // On compte TOUT ce qui est vivant — sans les recrues, une parcelle
      // couverte de semis paraissait vide, ce qui est le contraire de ce
      // qu'on veut lire sur une régénération naturelle.
      aliveCounts[espece.id] = alive.length;
      plantesVivants[espece.id] = alive.filter((t) => t.id <= statMaxId).length;
      heights[espece.id] = alive.reduce((max, t) => Math.max(max, t.heightM), 0);
    }
    const waterArr = state.soil.waterMm;
    const nHoriz = Math.max(1, state.station.profil.length);
    let surfaceSum = 0;
    for (let c = 0; c < waterArr.length; c += nHoriz) surfaceSum += waterArr[c] ?? 0;
    points.push({
      week: i,
      meanWaterMm: surfaceSum / (waterArr.length / nHoriz),
      waterlogging: result.fluxes.waterloggingMean,
      fluxes: result.fluxes,
      heights,
      aliveCounts,
      plantesVivants,
    });
    if (i % 52 === 35) lateSummerState = state;
  }
  return { points, finalState: lateSummerState };
}

const W = 900;
const H = 200;
const PAD = 40;

function linePath(values: number[], yScale: (v: number) => number, xMax = W - PAD): string {
  const xStep = (xMax - PAD) / Math.max(1, values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(PAD + i * xStep).toFixed(1)},${yScale(v).toFixed(1)}`)
    .join(" ");
}

function WaterChart({ points, ruMm }: { points: WeekPoint[]; ruMm: number }) {
  const yScale = (mm: number) => H - PAD - (mm / ruMm) * (H - 2 * PAD);
  const yScaleRatio = (r: number) => H - PAD - r * (H - 2 * PAD);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", maxWidth: W }}
      role="img"
      aria-label="Eau du sol et engorgement"
    >
      <rect width={W} height={H} fill="#f6f4ee" />
      <line
        x1={PAD}
        y1={yScale(ruMm)}
        x2={W - PAD}
        y2={yScale(ruMm)}
        stroke="#b0a58c"
        strokeDasharray="4 4"
      />
      <path
        d={linePath(
          points.map((p) => p.waterlogging),
          yScaleRatio,
        )}
        fill="none"
        stroke="#8a6d3b"
        strokeWidth={1.5}
      />
      <path
        d={linePath(
          points.map((p) => p.meanWaterMm),
          yScale,
        )}
        fill="none"
        stroke="#3d6b3f"
        strokeWidth={2}
      />
      <text x={PAD} y={yScale(ruMm) - 6} fontSize={11} fill="#7a7261">
        vert : eau moyenne (RU = {ruMm} mm) · brun : engorgement moyen (0–1)
      </text>
    </svg>
  );
}

/**
 * Hauteur dominante par espèce. On ne trace QUE les espèces encore vivantes à
 * la fin, au plus six, et chaque courbe porte son nom à son extrémité : au-delà
 * d'une demi-douzaine de couleurs, une légende devient un jeu de devinettes.
 * Les autres restent en gris, présentes mais sans prétendre à une identité.
 */
function HeightChart({ points, classement }: { points: WeekPoint[]; classement: LigneEspece[] }) {
  const maxH = Math.max(4, ...points.map((p) => Math.max(...Object.values(p.heights))));
  const yScale = (m: number) => H - PAD - (m / maxH) * (H - 2 * PAD);
  const enAvant = classement.filter((l) => l.vivants > 0).slice(0, 6);
  const ids = new Set(enAvant.map((l) => l.espece.id));
  // Deux espèces qui finissent à la même hauteur superposeraient leurs
  // étiquettes : on les écarte du minimum lisible, du haut vers le bas.
  const ESPACEMENT = 12;
  const etiquettes = [...enAvant]
    .sort((a, b) => b.hauteur - a.hauteur)
    .reduce<{ ligne: LigneEspece; y: number }[]>((acc, ligne) => {
      const voulu = yScale(ligne.hauteur);
      const precedent = acc[acc.length - 1];
      acc.push({
        ligne,
        y: precedent ? Math.max(voulu, precedent.y + ESPACEMENT) : voulu,
      });
      return acc;
    }, []);
  const largeurEtiquette = 96;
  const xFin = W - PAD - largeurEtiquette;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", maxWidth: W }}
      role="img"
      aria-label="Hauteur dominante par espèce, les six premières nommées"
    >
      <rect width={W} height={H} fill="#f6f4ee" />
      {ESPECES_V0.filter((e) => !ids.has(e.id)).map((espece) => (
        <path
          key={espece.id}
          d={linePath(
            points.map((p) => p.heights[espece.id] ?? 0),
            yScale,
            xFin,
          )}
          fill="none"
          stroke={COULEUR_AUTRES}
          strokeWidth={1}
          opacity={0.55}
        />
      ))}
      {etiquettes.map(({ ligne, y }) => {
        const couleur = SPECIES_COLORS[ligne.espece.id] ?? "#555";
        const yCourbe = yScale(ligne.hauteur);
        return (
          <g key={ligne.espece.id}>
            <path
              d={linePath(
                points.map((p) => p.heights[ligne.espece.id] ?? 0),
                yScale,
                xFin,
              )}
              fill="none"
              stroke={couleur}
              strokeWidth={2}
            />
            <circle cx={xFin} cy={yCourbe} r={3} fill={couleur} />
            {/* Trait de rappel quand l'étiquette a dû être décalée. */}
            <line x1={xFin} y1={yCourbe} x2={xFin + 5} y2={y} stroke={couleur} strokeWidth={1} />
            <text x={xFin + 8} y={y + 3.5} fontSize={10.5} fill="#3b352a">
              {ligne.espece.nom}
            </text>
          </g>
        );
      })}
      <text x={PAD} y={PAD - 8} fontSize={11} fill="#7a7261">
        hauteur dominante (max des vivants, recrues comprises), m — max affiché : {maxH.toFixed(1)}{" "}
        m ; en gris, les espèces éteintes
      </text>
    </svg>
  );
}

/** Carte spatiale : eau du sol (clair = sec, foncé = humide) + couronnes. */
function ParcelMap({ state, classement }: { state: GameState; classement: LigneEspece[] }) {
  // Mêmes six espèces en couleur que sur le graphe, le reste en gris : la
  // carte et la courbe racontent alors la même histoire.
  const nommees = new Set(
    classement
      .filter((l) => l.vivants > 0)
      .slice(0, 6)
      .map((l) => l.espece.id),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const side = state.station.coteM;
  const scale = 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // La carte montre l'horizon de surface (le sol est stratifié).
    const ru = ruHorizonMm(state.station.profil[0] as Horizon);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const nH = Math.max(1, state.station.profil.length);
        const w = (state.soil.waterMm[(y * side + x) * nH] ?? 0) / ru;
        // sec = beige clair, humide = brun-vert sombre
        const l = 88 - 45 * w;
        ctx.fillStyle = `hsl(90 18% ${l}%)`;
        // y de la grille vers le nord = haut du canvas
        ctx.fillRect(x * scale, (side - 1 - y) * scale, scale, scale);
      }
    }
    for (const tree of state.trees) {
      if (!tree.alive) continue;
      const espece = getEspece(tree.especeId);
      const r = Math.max(1.5, crownRadiusM(tree.heightM, espece.lumiere.houppierRatio) * scale);
      ctx.beginPath();
      ctx.arc(tree.x * scale, (side - tree.y) * scale, r, 0, 2 * Math.PI);
      ctx.fillStyle = `${(nommees.has(tree.especeId) ? SPECIES_COLORS[tree.especeId] : COULEUR_AUTRES) ?? "#555"}c0`;
      ctx.fill();
      // Un liseré clair : sans lui, deux couronnes qui se chevauchent forment
      // une tache et on ne compte plus rien.
      ctx.strokeStyle = "#f6f4eecc";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }, [state, side, nommees]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={side * scale}
        height={side * scale}
        style={{ border: "1px solid #b0a58c", maxWidth: "100%", height: "auto" }}
      />
      <p style={{ color: "#6b6250", fontSize: 13, margin: "4px 0 0" }}>
        Parcelle en fin d'été de la dernière année (nord en haut),{" "}
        <strong>arbres vivants seulement</strong> — fond : eau du sol (clair = sec) ; disques :
        couronnes, aux couleurs du tableau ci-dessus (en gris, les espèces hors des six premières).
        On voit chaque arbre assécher sa zone racinaire.
      </p>
    </div>
  );
}

interface LigneEspece {
  espece: (typeof ESPECES_V0)[number];
  /** tous les vivants, recrues comprises */
  vivants: number;
  /** parmi eux, ceux de la cohorte plantée */
  plantes: number;
  hauteur: number;
}

/**
 * Qui occupe le terrain, et de combien. Un tableau trié répond en un coup
 * d'œil à la question que la liste alphabétique laissait sans réponse ; les
 * disparues sont reléguées à la fin, en une ligne.
 */
function TableauEspeces({
  classement,
  succession,
}: {
  classement: LigneEspece[];
  succession: boolean;
}) {
  const presentes = classement.filter((l) => l.vivants > 0);
  const disparues = classement.filter((l) => l.vivants === 0);
  const cellule: React.CSSProperties = { padding: "2px 10px 2px 0", textAlign: "right" };
  return (
    <div style={{ margin: "8px 0" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: "#7a7261", textAlign: "left" }}>
            <th style={{ ...cellule, textAlign: "left" }}>espèce</th>
            <th style={cellule}>vivants</th>
            {!succession && <th style={cellule}>dont plantés / {TREES_PER_SPECIES}</th>}
            <th style={cellule}>hauteur dominante</th>
          </tr>
        </thead>
        <tbody>
          {presentes.map((l) => (
            <tr key={l.espece.id}>
              <td style={{ ...cellule, textAlign: "left", whiteSpace: "nowrap" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: SPECIES_COLORS[l.espece.id] ?? "#555",
                    marginRight: 7,
                  }}
                />
                {l.espece.nom}
              </td>
              <td style={{ ...cellule, fontVariantNumeric: "tabular-nums" }}>{l.vivants}</td>
              {!succession && (
                <td style={{ ...cellule, fontVariantNumeric: "tabular-nums", color: "#7a7261" }}>
                  {l.plantes}
                </td>
              )}
              <td style={{ ...cellule, fontVariantNumeric: "tabular-nums" }}>
                {l.hauteur.toFixed(1)} m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {disparues.length > 0 && (
        <p style={{ color: "#8a8271", fontSize: 12.5, margin: "6px 0 0" }}>
          Disparues ({disparues.length}) : {disparues.map((l) => l.espece.nom).join(", ")}.
        </p>
      )}
    </div>
  );
}

export function App() {
  const [stationId, setStationId] = useState(STATIONS_V0[0]?.station.id ?? "");
  const [meteoReelle, setMeteoReelle] = useState(true);
  const sc = STATIONS_V0.find((s) => s.station.id === stationId) ?? STATIONS_V0[0];
  if (!sc) throw new Error("aucune station");
  const serie = serieMeteoPour(sc.station.id);
  const useReelle = meteoReelle && serie !== undefined;
  const { points, finalState } = useMemo(() => {
    const weather = useReelle && serie ? serieToWeeks(serie) : syntheticYear(sc.climat);
    return simulate(sc, weather);
  }, [sc, useReelle, serie]);

  const last = points[points.length - 1];
  // Classement décroissant par effectif vivant : ce qui domine le peuplement se
  // lit en premier, et les espèces disparues tombent en bas.
  const classement: LigneEspece[] = ESPECES_V0.map((espece) => ({
    espece,
    vivants: last?.aliveCounts[espece.id] ?? 0,
    plantes: last?.plantesVivants[espece.id] ?? 0,
    hauteur: last?.heights[espece.id] ?? 0,
  })).sort((a, b) => b.vivants - a.vivants || b.hauteur - a.hauteur);
  const lastYear = points.slice(-52);
  const sum = (f: (p: WeekPoint) => number) => Math.round(lastYear.reduce((a, p) => a + f(p), 0));

  return (
    <div>
      <h1 style={{ fontSize: "1.3rem" }}>Labo moteur (grille 1 m² : eau, azote, lumière)</h1>
      <p>
        {STATIONS_V0.map((s) => (
          <button
            key={s.station.id}
            type="button"
            onClick={() => setStationId(s.station.id)}
            style={{
              marginRight: 8,
              padding: "4px 10px",
              border: "1px solid #b0a58c",
              borderRadius: 4,
              background: s.station.id === sc.station.id ? "#3d6b3f" : "#f6f4ee",
              color: s.station.id === sc.station.id ? "#fff" : "#2e2a20",
              cursor: "pointer",
            }}
          >
            {s.station.nom}
          </button>
        ))}
      </p>
      <p style={{ color: "#6b6250" }}>
        {isSuccessionStation(sc)
          ? "150 ans simulés · RIEN n'est planté : succession émergente depuis le voisinage (seed 42)"
          : `${YEARS} ans simulés · ${TREES_PER_SPECIES} plants/espèce dispersés (seed 42)`}{" "}
        ·{" "}
        <button
          type="button"
          onClick={() => setMeteoReelle(!meteoReelle)}
          style={{
            border: "1px solid #b0a58c",
            borderRadius: 4,
            background: "#f6f4ee",
            cursor: "pointer",
            padding: "1px 8px",
          }}
        >
          météo : {useReelle ? "réelle" : "synthétique"}
        </button>{" "}
        {useReelle && serie
          ? `${serie.stationMeteo} ${serie.periode[0]}-${serie.periode[1]} (Météo-France, rejouée en boucle)`
          : "année type répétée"}
      </p>
      <WaterChart points={points} ruMm={sc.station.ruMm} />
      <HeightChart points={points} classement={classement} />
      <TableauEspeces classement={classement} succession={isSuccessionStation(sc)} />
      <p style={{ color: "#6b6250" }}>
        Régénération naturelle :{" "}
        {finalState.trees.filter((t) => t.alive && t.id > PLANTED_MAX_ID).length} recrues vivantes
        (semis du voisinage et des adultes de la parcelle, positions seedées).
      </p>
      <ParcelMap state={finalState} classement={classement} />
      <p style={{ color: "#6b6250" }}>
        {(() => {
          const inv = carbonInventory(finalState, sc.station.initialSoilCTHa);
          return (
            <>
              Carbone (t C/ha) — vivant {inv.vivantTHa.toFixed(1)} · bois mort{" "}
              {inv.boisMortTHa.toFixed(1)} · litière {inv.litiereTHa.toFixed(1)} · humus{" "}
              {inv.humusTHa.toFixed(1)} ·{" "}
              <strong>
                bilan net {inv.bilanNetTHa >= 0 ? "+" : ""}
                {inv.bilanNetTHa.toFixed(1)}
              </strong>{" "}
              (NPP cumulée {inv.nppCumTHa.toFixed(1)}, émis {inv.emisCumTHa.toFixed(1)}, exporté{" "}
              {inv.exporteCumTHa.toFixed(1)})
            </>
          );
        })()}
      </p>
      <p style={{ color: "#6b6250" }}>
        Dernière année — pluie {sum((p) => p.fluxes.rainMm)} mm · évaporation{" "}
        {sum((p) => p.fluxes.evapMm)} mm · transpiration {sum((p) => p.fluxes.transpirationMm)} mm ·
        drainage {sum((p) => p.fluxes.drainageMm)} mm · débordement{" "}
        {sum((p) => p.fluxes.overflowMm)} mm · minéralisation N{" "}
        {sum((p) => p.fluxes.mineralizationKgHa)} kg/ha · prélèvement N{" "}
        {sum((p) => p.fluxes.uptakeKgHa)} kg/ha · lessivage N {sum((p) => p.fluxes.leachedKgHa)}{" "}
        kg/ha · retour litière N {sum((p) => p.fluxes.litterfallKgHa)} kg/ha · fixation N{" "}
        {sum((p) => p.fluxes.fixationKgHa)} kg/ha
      </p>
    </div>
  );
}
