/**
 * L'écran de jeu : parcelle en vue de dessus (le « plan de gestion »,
 * docs/regles.md §15), HUD (temps, trésorerie, heures, carbone), actions
 * (planter, couper, récolter, chauler, embaucher). Rendu Canvas 2D — la vue
 * isométrique viendra comme couche visuelle ultérieure.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ESPECES_V0, getEspece } from "../engine/especes";
import { crownRadiusM } from "../engine/light";
import { STATIONS_V0 } from "../engine/stations";
import { SPECIES_COLORS } from "../ui/couleurs";
import type { Snapshot, SnapshotTree } from "./protocol";
import { loadSave, useGame } from "./useGame";

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

type Mode = "selection" | "planter" | "chauler";
type Overlay = "eau" | "ph" | "azote";

const panel: React.CSSProperties = {
  border: "1px solid #b0a58c",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#faf8f2",
};

const btn = (active = false): React.CSSProperties => ({
  padding: "3px 10px",
  marginRight: 6,
  marginBottom: 4,
  border: "1px solid #b0a58c",
  borderRadius: 4,
  background: active ? "#3d6b3f" : "#f6f4ee",
  color: active ? "#fff" : "#2e2a20",
  cursor: "pointer",
});

function drawParcel(
  canvas: HTMLCanvasElement,
  snapshot: Snapshot,
  coteM: number,
  ruMm: number,
  overlay: Overlay,
  selectedId: number | undefined,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = canvas.width / coteM;
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      const i = y * coteM + x;
      let l: number;
      let hue = 90;
      let sat = 18;
      if (overlay === "eau") {
        l = 88 - 45 * Math.min(1, (snapshot.soilWater[i] ?? 0) / ruMm);
      } else if (overlay === "ph") {
        const ph = snapshot.soilPh[i] ?? 7;
        hue = 20 + ((ph - 4) / 4.5) * 200; // acide = orangé, calcaire = bleuté
        sat = 35;
        l = 70;
      } else {
        l = 90 - 50 * Math.min(1, (snapshot.soilN[i] ?? 0) / 3);
        hue = 55;
        sat = 30;
      }
      ctx.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
      ctx.fillRect(x * scale, (coteM - 1 - y) * scale, Math.ceil(scale), Math.ceil(scale));
    }
  }
  for (const tree of snapshot.trees) {
    const espece = getEspece(tree.especeId);
    const r = Math.max(2, crownRadiusM(tree.heightM, espece.lumiere.houppierRatio) * scale);
    const cx = tree.x * scale;
    const cy = (coteM - tree.y) * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = `${SPECIES_COLORS[tree.especeId] ?? "#555"}b8`;
    ctx.fill();
    if (tree.fruitsKg > 0.5) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1.5, 0, 2 * Math.PI);
      ctx.strokeStyle = "#e8871e";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (tree.id === selectedId) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, 2 * Math.PI);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function StartScreen({
  onStart,
  onResume,
}: {
  onStart: (stationId: string, seed: number, meteo: "reelle" | "synthetique") => void;
  onResume: () => void;
}) {
  const [stationId, setStationId] = useState(STATIONS_V0[0]?.station.id ?? "");
  const [seed, setSeed] = useState(42);
  const save = loadSave();
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: "1.1rem" }}>Nouvelle partie</h2>
      <p>
        {STATIONS_V0.map((s) => (
          <button
            key={s.station.id}
            type="button"
            style={btn(s.station.id === stationId)}
            onClick={() => setStationId(s.station.id)}
          >
            {s.station.nom}
          </button>
        ))}
      </p>
      <p>
        Seed :{" "}
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value) || 0)}
          style={{ width: 90 }}
        />
      </p>
      <p>
        <button type="button" style={btn(true)} onClick={() => onStart(stationId, seed, "reelle")}>
          Démarrer (météo réelle)
        </button>
        {save && (
          <button type="button" style={btn()} onClick={onResume}>
            Reprendre la partie sauvegardée ({save.stationId}, an {Math.floor(save.weeks / 52) + 1})
          </button>
        )}
      </p>
    </div>
  );
}

export function GameView() {
  const game = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("selection");
  const [overlay, setOverlay] = useState<Overlay>("eau");
  const [especeId, setEspeceId] = useState("betula_pendula");
  const [rayonChaulage, setRayonChaulage] = useState(8);
  const [selectedId, setSelectedId] = useState<number>();

  const { station, snapshot } = game;
  const selected = useMemo(
    () => snapshot?.trees.find((t) => t.id === selectedId),
    [snapshot, selectedId],
  );
  const fruitsPrets = useMemo(
    () => (snapshot ? snapshot.trees.filter((t) => t.fruitsKg > 0.5) : []),
    [snapshot],
  );

  useEffect(() => {
    if (canvasRef.current && snapshot && station) {
      drawParcel(canvasRef.current, snapshot, station.coteM, station.ruMm, overlay, selectedId);
    }
  }, [snapshot, station, overlay, selectedId]);

  if (!station || !snapshot) {
    return (
      <div>
        {game.replayProgress && (
          <p>Rechargement de la partie… {Math.round(game.replayProgress.done / 52)} ans rejoués.</p>
        )}
        <StartScreen
          onStart={game.newGame}
          onResume={() => {
            const save = loadSave();
            if (save) game.resume(save);
          }}
        />
      </div>
    );
  }

  const annee = Math.floor(snapshot.week / 52) + 1;
  const semaine = snapshot.week % 52;
  const mois = MOIS[Math.min(11, Math.floor(semaine / 4.34))];
  const canvasPx = 600;

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * station.coteM;
    const my = station.coteM - ((e.clientY - rect.top) / rect.height) * station.coteM;
    if (mode === "planter") {
      game.dispatch({ type: "planter", especeId, positions: [{ x: mx, y: my }] });
    } else if (mode === "chauler") {
      game.dispatch({ type: "chauler", x: mx, y: my, rayonM: rayonChaulage });
    } else {
      // Sélection : l'arbre dont la couronne contient le clic, le plus proche.
      let best: SnapshotTree | undefined;
      let bestD = Infinity;
      for (const t of snapshot.trees) {
        const espece = getEspece(t.especeId);
        const r = Math.max(0.8, crownRadiusM(t.heightM, espece.lumiere.houppierRatio));
        const d = Math.hypot(t.x - mx, t.y - my);
        if (d <= r + 0.5 && d < bestD) {
          best = t;
          bestD = d;
        }
      }
      setSelectedId(best?.id);
    }
  };

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div>
        <p style={{ margin: "0 0 6px" }}>
          <strong>
            An {annee}, {mois}
          </strong>{" "}
          · {snapshot.weather.tMean.toFixed(0)} °C · {snapshot.weather.rainMm.toFixed(0)} mm ·{" "}
          {station.nom} ({station.meteoLabel})
        </p>
        <p style={{ margin: "0 0 6px" }}>
          {[0, 1, 4, 13, 52].map((v) => (
            <button
              key={v}
              type="button"
              style={btn(game.speed === v)}
              onClick={() => game.setSpeed(v)}
            >
              {v === 0 ? "⏸ pause" : `×${v}`}
            </button>
          ))}
          <button type="button" style={btn()} onClick={game.quit}>
            Quitter (sauvegarde auto)
          </button>
        </p>
        <canvas
          ref={canvasRef}
          width={canvasPx}
          height={canvasPx}
          style={{
            width: canvasPx,
            border: "1px solid #b0a58c",
            cursor: mode === "selection" ? "default" : "crosshair",
          }}
          onClick={onCanvasClick}
        />
        <p style={{ margin: "4px 0 0", color: "#6b6250", fontSize: 13 }}>
          Calque :{" "}
          {(["eau", "ph", "azote"] as const).map((o) => (
            <button key={o} type="button" style={btn(overlay === o)} onClick={() => setOverlay(o)}>
              {o}
            </button>
          ))}
          — nord en haut · cercle orange = fruits mûrs
        </p>
      </div>

      <div style={{ width: 330, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={panel}>
          <strong>{snapshot.economy.treasuryEur.toFixed(0)} €</strong>
          {snapshot.economy.bankrupt && <strong style={{ color: "#c0392b" }}> — FAILLITE</strong>}
          <br />
          Semaine : {snapshot.economy.hoursUsedWeek.toFixed(0)} h / {60 * snapshot.economy.uth} h ·
          Année : {snapshot.economy.hoursUsedYear.toFixed(0)} h · {snapshot.economy.uth} UTH
          <br />
          <button type="button" style={btn()} onClick={() => game.dispatch({ type: "embaucher" })}>
            Embaucher (600 €/sem)
          </button>
          <button type="button" style={btn()} onClick={() => game.dispatch({ type: "licencier" })}>
            Licencier
          </button>
        </div>

        <div style={panel}>
          Carbone : vivant {snapshot.inventory.vivantTHa.toFixed(1)} · humus{" "}
          {snapshot.inventory.humusTHa.toFixed(1)} ·{" "}
          <strong>
            bilan {snapshot.inventory.bilanNetTHa >= 0 ? "+" : ""}
            {snapshot.inventory.bilanNetTHa.toFixed(1)} t C/ha
          </strong>
        </div>

        <div style={panel}>
          <strong>Action</strong>
          <br />
          <button
            type="button"
            style={btn(mode === "selection")}
            onClick={() => setMode("selection")}
          >
            Sélection
          </button>
          <button type="button" style={btn(mode === "planter")} onClick={() => setMode("planter")}>
            Planter
          </button>
          <button type="button" style={btn(mode === "chauler")} onClick={() => setMode("chauler")}>
            Chauler
          </button>
          {mode === "planter" && (
            <div style={{ marginTop: 6 }}>
              {ESPECES_V0.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  style={{
                    ...btn(especeId === e.id),
                    borderLeft: `6px solid ${SPECIES_COLORS[e.id]}`,
                  }}
                  onClick={() => setEspeceId(e.id)}
                >
                  {e.nom} ({e.economie.prixPlantEur} €)
                </button>
              ))}
              <div style={{ color: "#6b6250", fontSize: 13 }}>
                Clic sur la carte = 1 plant (1 h, espacement ≥ 1 m).
              </div>
            </div>
          )}
          {mode === "chauler" && (
            <div style={{ marginTop: 6 }}>
              Rayon :{" "}
              <input
                type="range"
                min={3}
                max={20}
                value={rayonChaulage}
                onChange={(e) => setRayonChaulage(Number(e.target.value))}
              />{" "}
              {rayonChaulage} m — pH +0,5 sur le disque.
            </div>
          )}
        </div>

        {selected && (
          <div style={panel}>
            <strong>{getEspece(selected.especeId).nom}</strong> · {selected.heightM.toFixed(1)} m ·{" "}
            {Math.floor(selected.ageWeeks / 52)} ans
            {selected.stress > 1 && ` · stress ${selected.stress.toFixed(0)}/10`}
            {selected.fruitsKg > 0.5 && (
              <>
                {" "}
                · 🍎 {selected.fruitsKg.toFixed(0)} kg mûrs
                <br />
                <button
                  type="button"
                  style={btn(true)}
                  onClick={() => game.dispatch({ type: "recolter", treeIds: [selected.id] })}
                >
                  Récolter
                </button>
              </>
            )}
            <br />
            <button
              type="button"
              style={btn()}
              onClick={() => {
                game.dispatch({ type: "couper", treeIds: [selected.id], devenir: "vendre" });
                setSelectedId(undefined);
              }}
            >
              Couper &amp; vendre
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() => {
                game.dispatch({ type: "couper", treeIds: [selected.id], devenir: "epandre" });
                setSelectedId(undefined);
              }}
            >
              Couper &amp; épandre (BRF)
            </button>
          </div>
        )}

        {fruitsPrets.length > 0 && (
          <div style={panel}>
            🍎 <strong>{fruitsPrets.reduce((s, t) => s + t.fruitsKg, 0).toFixed(0)} kg</strong> de
            fruits mûrs sur {fruitsPrets.length} arbres — vite, avant la fin de la fenêtre !
            <br />
            <button
              type="button"
              style={btn(true)}
              onClick={() =>
                game.dispatch({ type: "recolter", treeIds: fruitsPrets.map((t) => t.id) })
              }
            >
              Tout récolter
            </button>
          </div>
        )}

        {game.notice && (
          <div style={{ ...panel, background: "#f3e6c4" }}>
            ⏸ Pause automatique : {game.notice}. Récoltez, puis relancez le temps !
          </div>
        )}

        {game.refusals.length > 0 && (
          <div style={{ ...panel, color: "#8a4b2d" }}>
            {game.refusals.map((r, i) => (
              <div key={`${r.week}-${r.action}-${i}`}>
                ⚠ {r.action} : {r.reason}
              </div>
            ))}
          </div>
        )}

        <div style={{ ...panel, fontSize: 13, color: "#6b6250" }}>
          {snapshot.trees.length} arbres vivants. La régénération naturelle sème toute seule —
          fauchez (coupez) ce qui vous gêne.
        </div>
      </div>
    </div>
  );
}
