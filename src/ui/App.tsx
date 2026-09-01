/**
 * UI jetable de la V0 (« labo moteur ») : bilan hydrique, croissance des
 * 5 espèces et carte spatiale (eau du sol + couronnes) sur les stations de
 * test. Sera remplacée par la vraie UI (React + PixiJS) — ne rien construire
 * de précieux ici.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  syntheticYear,
  type TickFluxes,
  tick,
} from "../engine";

const YEARS = 20;
const TREES_PER_SPECIES = 30;

const SPECIES_COLORS: Record<string, string> = {
  alnus_glutinosa: "#2c6e49",
  fagus_sylvatica: "#7d5ba6",
  quercus_pubescens: "#c05746",
  pinus_sylvestris: "#3a7ca5",
  betula_pendula: "#c9a227",
};

interface WeekPoint {
  week: number;
  meanWaterMm: number;
  waterlogging: number;
  fluxes: TickFluxes;
  heights: Record<string, number>;
  aliveCounts: Record<string, number>;
}

interface SimResult {
  points: WeekPoint[];
  /** état en fin d'été de la dernière année : l'assèchement local est visible */
  finalState: GameState;
}

function simulate(sc: StationClimat): SimResult {
  const weather = syntheticYear(sc.climat);
  let state = createGameState(sc.station, rngStateFromSeed(42));
  for (const espece of ESPECES_V0) {
    state = plantScattered(state, espece.id, TREES_PER_SPECIES);
  }
  let lateSummerState = state;
  const points: WeekPoint[] = [];
  for (let i = 0; i < YEARS * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    const result = tick(state, w);
    state = result.state;
    const heights: Record<string, number> = {};
    const aliveCounts: Record<string, number> = {};
    for (const espece of ESPECES_V0) {
      const alive = state.trees.filter((t) => t.especeId === espece.id && t.alive);
      aliveCounts[espece.id] = alive.length;
      heights[espece.id] =
        alive.length > 0 ? alive.reduce((s, t) => s + t.heightM, 0) / alive.length : 0;
    }
    const waterArr = state.soil.waterMm;
    points.push({
      week: i,
      meanWaterMm: waterArr.reduce((a, b) => a + b, 0) / waterArr.length,
      waterlogging: result.fluxes.waterloggingMean,
      fluxes: result.fluxes,
      heights,
      aliveCounts,
    });
    if (i % 52 === 35) lateSummerState = state;
  }
  return { points, finalState: lateSummerState };
}

const W = 900;
const H = 200;
const PAD = 40;

function linePath(values: number[], yScale: (v: number) => number): string {
  const xStep = (W - 2 * PAD) / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(PAD + i * xStep).toFixed(1)},${yScale(v).toFixed(1)}`)
    .join(" ");
}

function WaterChart({ points, ruMm }: { points: WeekPoint[]; ruMm: number }) {
  const yScale = (mm: number) => H - PAD - (mm / ruMm) * (H - 2 * PAD);
  const yScaleRatio = (r: number) => H - PAD - r * (H - 2 * PAD);
  return (
    <svg width={W} height={H} role="img" aria-label="Eau du sol et engorgement">
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

function HeightChart({ points }: { points: WeekPoint[] }) {
  const maxH = Math.max(4, ...points.map((p) => Math.max(...Object.values(p.heights))));
  const yScale = (m: number) => H - PAD - (m / maxH) * (H - 2 * PAD);
  return (
    <svg width={W} height={H} role="img" aria-label="Hauteur moyenne par espèce">
      <rect width={W} height={H} fill="#f6f4ee" />
      {ESPECES_V0.map((espece) => (
        <path
          key={espece.id}
          d={linePath(
            points.map((p) => p.heights[espece.id] ?? 0),
            yScale,
          )}
          fill="none"
          stroke={SPECIES_COLORS[espece.id] ?? "#555"}
          strokeWidth={2}
        />
      ))}
      <text x={PAD} y={PAD - 8} fontSize={11} fill="#7a7261">
        hauteur moyenne des vivants, m (max affiché : {maxH.toFixed(1)} m)
      </text>
    </svg>
  );
}

/** Carte spatiale : eau du sol (clair = sec, foncé = humide) + couronnes. */
function ParcelMap({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const side = state.station.coteM;
  const scale = 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ru = state.station.ruMm;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const w = (state.soil.waterMm[y * side + x] ?? 0) / ru;
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
      ctx.fillStyle = `${SPECIES_COLORS[tree.especeId] ?? "#555"}b0`;
      ctx.fill();
    }
  }, [state, side]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={side * scale}
        height={side * scale}
        style={{ border: "1px solid #b0a58c" }}
      />
      <p style={{ color: "#6b6250", fontSize: 13, margin: "4px 0 0" }}>
        Parcelle en fin d'été de la dernière année (nord en haut) — fond : eau du sol (clair = sec)
        ; disques : couronnes. On voit chaque arbre assécher sa zone racinaire.
      </p>
    </div>
  );
}

export function App() {
  const [stationId, setStationId] = useState(STATIONS_V0[0]?.station.id ?? "");
  const sc = STATIONS_V0.find((s) => s.station.id === stationId) ?? STATIONS_V0[0];
  if (!sc) throw new Error("aucune station");
  const { points, finalState } = useMemo(() => simulate(sc), [sc]);

  const last = points[points.length - 1];
  const lastYear = points.slice(-52);
  const sum = (f: (p: WeekPoint) => number) => Math.round(lastYear.reduce((a, p) => a + f(p), 0));

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 960,
        margin: "2rem auto",
        color: "#2e2a20",
      }}
    >
      <h1 style={{ fontSize: "1.3rem" }}>
        Canopée — labo moteur (grille 1 m² : eau, azote, lumière)
      </h1>
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
        {YEARS} ans simulés · {TREES_PER_SPECIES} plants/espèce dispersés (seed 42) · météo
        synthétique déterministe
      </p>
      <WaterChart points={points} ruMm={sc.station.ruMm} />
      <HeightChart points={points} />
      <p>
        {ESPECES_V0.map((espece) => (
          <span key={espece.id} style={{ marginRight: 16 }}>
            <span style={{ color: SPECIES_COLORS[espece.id], fontWeight: 700 }}>■</span>{" "}
            {espece.nom} : {(last?.heights[espece.id] ?? 0).toFixed(1)} m ·{" "}
            {last?.aliveCounts[espece.id] ?? 0}/{TREES_PER_SPECIES} vivants
          </span>
        ))}
      </p>
      <ParcelMap state={finalState} />
      <p style={{ color: "#6b6250" }}>
        Dernière année — pluie {sum((p) => p.fluxes.rainMm)} mm · évaporation{" "}
        {sum((p) => p.fluxes.evapMm)} mm · transpiration {sum((p) => p.fluxes.transpirationMm)} mm ·
        drainage {sum((p) => p.fluxes.drainageMm)} mm · minéralisation N{" "}
        {sum((p) => p.fluxes.mineralizationKgHa)} kg/ha · prélèvement N{" "}
        {sum((p) => p.fluxes.uptakeKgHa)} kg/ha · lessivage N {sum((p) => p.fluxes.leachedKgHa)}{" "}
        kg/ha
      </p>
    </main>
  );
}
