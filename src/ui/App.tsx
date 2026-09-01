/**
 * UI jetable de la V0 (« labo moteur ») : bilan hydrique + croissance des
 * 5 espèces sur les stations de test. Sera remplacée par la vraie UI
 * (React + PixiJS) en V0.5/V1 — ne rien construire de précieux ici.
 */

import { useMemo, useState } from "react";
import {
  createGameState,
  ESPECES_V0,
  plant,
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
  waterMm: number;
  waterlogging: number;
  fluxes: TickFluxes;
  /** hauteur moyenne des vivants par espèce (0 = tous morts) */
  heights: Record<string, number>;
  aliveCounts: Record<string, number>;
}

function simulate(sc: StationClimat): WeekPoint[] {
  const weather = syntheticYear(sc.climat);
  let state = createGameState(sc.station, rngStateFromSeed(42));
  for (const espece of ESPECES_V0) {
    state = plant(state, espece.id, TREES_PER_SPECIES);
  }
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
    points.push({
      week: i,
      waterMm: state.soil.waterMm,
      waterlogging: result.fluxes.waterloggingRatio,
      fluxes: result.fluxes,
      heights,
      aliveCounts,
    });
  }
  return points;
}

const W = 900;
const H = 220;
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
          points.map((p) => p.waterMm),
          yScale,
        )}
        fill="none"
        stroke="#3d6b3f"
        strokeWidth={2}
      />
      <text x={PAD} y={yScale(ruMm) - 6} fontSize={11} fill="#7a7261">
        vert : réserve utile (RU = {ruMm} mm) · brun : engorgement (0–1)
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

export function App() {
  const [stationId, setStationId] = useState(STATIONS_V0[0]?.station.id ?? "");
  const sc = STATIONS_V0.find((s) => s.station.id === stationId) ?? STATIONS_V0[0];
  if (!sc) throw new Error("aucune station");
  const points = useMemo(() => simulate(sc), [sc]);

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
      <h1 style={{ fontSize: "1.3rem" }}>Canopée — labo moteur (V0 : eau, azote, croissance)</h1>
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
        {YEARS} ans simulés · {TREES_PER_SPECIES} plants/espèce · météo synthétique déterministe ·
        seed 42
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
      <p style={{ color: "#6b6250" }}>
        Dernière année — pluie {sum((p) => p.fluxes.rainMm)} mm · ETR {sum((p) => p.fluxes.etrMm)}{" "}
        mm · drainage {sum((p) => p.fluxes.drainageMm)} mm · minéralisation N{" "}
        {sum((p) => p.fluxes.mineralizationKgHa)} kg/ha · prélèvement N{" "}
        {sum((p) => p.fluxes.uptakeKgHa)} kg/ha · lessivage N {sum((p) => p.fluxes.leachedKgHa)}{" "}
        kg/ha
      </p>
    </main>
  );
}
