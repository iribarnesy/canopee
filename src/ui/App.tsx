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

const YEARS = 20;
const TREES_PER_SPECIES = 30;
/** ids ≤ ce seuil = cohorte plantée ; au-delà = recrues de la régénération */
const PLANTED_MAX_ID = TREES_PER_SPECIES * 5;

import { SPECIES_COLORS } from "./couleurs";

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
    for (const espece of ESPECES_V0) {
      // Hauteur DOMINANTE (max des vivants, recrues comprises) : la métrique
      // forestière standard, sans l'artefact des moyennes qui s'effondrent
      // quand un individu meurt. Les comptages distinguent la cohorte plantée.
      const alive = state.trees.filter((t) => t.especeId === espece.id && t.alive);
      aliveCounts[espece.id] = alive.filter((t) => t.id <= statMaxId).length;
      heights[espece.id] = alive.reduce((max, t) => Math.max(max, t.heightM), 0);
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
        hauteur dominante par espèce (max des vivants, recrues comprises), m — max affiché :{" "}
        {maxH.toFixed(1)} m
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
      <HeightChart points={points} />
      <p>
        {ESPECES_V0.map((espece) => (
          <span key={espece.id} style={{ marginRight: 16 }}>
            <span style={{ color: SPECIES_COLORS[espece.id], fontWeight: 700 }}>■</span>{" "}
            {espece.nom} : {(last?.heights[espece.id] ?? 0).toFixed(1)} m ·{" "}
            {last?.aliveCounts[espece.id] ?? 0}
            {isSuccessionStation(sc) ? " vivants" : `/${TREES_PER_SPECIES} plantés vivants`}
          </span>
        ))}
      </p>
      <p style={{ color: "#6b6250" }}>
        Régénération naturelle :{" "}
        {finalState.trees.filter((t) => t.alive && t.id > PLANTED_MAX_ID).length} recrues vivantes
        (semis du voisinage et des adultes de la parcelle, positions seedées).
      </p>
      <ParcelMap state={finalState} />
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
