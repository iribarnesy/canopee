/**
 * UI jetable de la V0 (« labo moteur ») : visualise le bilan hydrique sur 3 ans
 * pour vérifier à l'œil que le moteur se comporte. Sera remplacée par la vraie
 * UI (React + PixiJS) en V0.5/V1 — ne rien construire de précieux ici.
 */

import { useMemo } from "react";
import {
  createGameState,
  rngStateFromSeed,
  type Station,
  syntheticYear,
  type TickFluxes,
  tick,
} from "../engine";

const STATION: Station = {
  id: "gironde-v0",
  nom: "Lande du Sud-Gironde (V0 : RU faible)",
  latitudeDeg: 44.5,
  ruMm: 70,
};

const CLIMATE = {
  tMeanAnnual: 13.5,
  tSeasonalAmplitude: 7,
  tDiurnalRange: 10,
  rainAnnualMm: 900,
  rainWinterShare: 0.65,
};

const YEARS = 3;

interface WeekPoint {
  week: number;
  waterMm: number;
  fluxes: TickFluxes;
}

function simulate(): WeekPoint[] {
  const weather = syntheticYear(CLIMATE);
  let state = createGameState(STATION, rngStateFromSeed(42));
  const points: WeekPoint[] = [];
  for (let i = 0; i < YEARS * 52; i++) {
    const w = weather[i % 52];
    if (!w) throw new Error("météo manquante");
    const result = tick(state, w);
    state = result.state;
    points.push({ week: i, waterMm: state.soil.waterMm, fluxes: result.fluxes });
  }
  return points;
}

const W = 900;
const H = 260;
const PAD = 40;

function Chart({ points }: { points: WeekPoint[] }) {
  const xScale = (week: number) => PAD + (week / (points.length - 1)) * (W - 2 * PAD);
  const yScale = (mm: number) => H - PAD - (mm / STATION.ruMm) * (H - 2 * PAD);

  const waterPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xScale(p.week).toFixed(1)},${yScale(p.waterMm).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg width={W} height={H} role="img" aria-label="Stock d'eau du sol par semaine">
      <rect width={W} height={H} fill="#f6f4ee" />
      {/* pluie (barres) */}
      {points.map((p) => (
        <rect
          key={p.week}
          x={xScale(p.week) - 1}
          y={yScale(Math.min(p.fluxes.rainMm, STATION.ruMm))}
          width={2}
          height={H - PAD - yScale(Math.min(p.fluxes.rainMm, STATION.ruMm))}
          fill="#9db8d2"
        />
      ))}
      {/* réserve utile pleine */}
      <line
        x1={PAD}
        y1={yScale(STATION.ruMm)}
        x2={W - PAD}
        y2={yScale(STATION.ruMm)}
        stroke="#b0a58c"
        strokeDasharray="4 4"
      />
      {/* stock d'eau */}
      <path d={waterPath} fill="none" stroke="#3d6b3f" strokeWidth={2} />
      {/* séparateurs d'années */}
      {Array.from({ length: YEARS }, (_, y) => y * 52).map((weekStart) => (
        <line
          key={`year-start-${weekStart}`}
          x1={xScale(weekStart)}
          y1={PAD / 2}
          x2={xScale(weekStart)}
          y2={H - PAD}
          stroke="#ccc4b2"
        />
      ))}
      <text x={PAD} y={yScale(STATION.ruMm) - 6} fontSize={11} fill="#7a7261">
        RU = {STATION.ruMm} mm
      </text>
    </svg>
  );
}

export function App() {
  const points = useMemo(simulate, []);
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
      <h1 style={{ fontSize: "1.3rem" }}>Canopée — labo moteur (V0 : bilan hydrique)</h1>
      <p style={{ color: "#6b6250" }}>
        {STATION.nom} · lat {STATION.latitudeDeg}° · météo synthétique déterministe · {YEARS} ans
        simulés
      </p>
      <Chart points={points} />
      <p>
        Dernière année — pluie : <strong>{sum((p) => p.fluxes.rainMm)} mm</strong> · ETP :{" "}
        <strong>{sum((p) => p.fluxes.etpMm)} mm</strong> · ETR :{" "}
        <strong>{sum((p) => p.fluxes.etrMm)} mm</strong> · drainage :{" "}
        <strong>{sum((p) => p.fluxes.drainageMm)} mm</strong>
      </p>
    </main>
  );
}
