/**
 * L'écran de jeu : parcelle en vue OBLIQUE (les arbres montrent leur hauteur,
 * triés du fond vers l'avant) sur le sol en vue de dessus, HUD, fil
 * d'événements, actions (planter, couper, récolter, chauler, embaucher).
 * Rendu Canvas 2D — l'isométrique complète viendra comme couche visuelle.
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

/** hauteur à l'écran d'un mètre d'arbre, en fraction de l'échelle horizontale */
const VERTICAL = 0.55;

function drawTreeOblique(
  ctx: CanvasRenderingContext2D,
  tree: SnapshotTree,
  scale: number,
  coteM: number,
  selected: boolean,
) {
  const espece = getEspece(tree.especeId);
  const bx = tree.x * scale;
  const by = (coteM - tree.y) * scale;
  const hPx = Math.max(4, tree.heightM * scale * VERTICAL);
  const crownR = Math.max(2.5, crownRadiusM(tree.heightM, espece.lumiere.houppierRatio) * scale);
  const color = SPECIES_COLORS[tree.especeId] ?? "#4a6b4a";

  // ombre au sol : ancre l'arbre
  ctx.beginPath();
  ctx.ellipse(bx, by, crownR, crownR * 0.35, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(40,50,30,0.18)";
  ctx.fill();

  // tronc
  const trunkW = Math.max(1.5, hPx * 0.06);
  ctx.fillStyle = "#6b4d2f";
  ctx.fillRect(bx - trunkW / 2, by - hPx * 0.45, trunkW, hPx * 0.45);

  const conifere = !espece.lumiere.caduc;
  if (conifere) {
    // silhouette en triangle (pin)
    ctx.beginPath();
    ctx.moveTo(bx, by - hPx);
    ctx.lineTo(bx - crownR, by - hPx * 0.2);
    ctx.lineTo(bx + crownR, by - hPx * 0.2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    // houppier en ellipse (feuillu)
    ctx.beginPath();
    ctx.ellipse(bx, by - hPx * 0.68, crownR, hPx * 0.38, 0, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  if (tree.fruitsKg > 0.5) {
    // fruits mûrs : points orange sur le houppier, impossibles à rater
    ctx.fillStyle = "#ff8c1a";
    for (const [dx, dy] of [
      [-0.5, -0.6],
      [0.4, -0.75],
      [0, -0.5],
      [0.55, -0.5],
      [-0.3, -0.85],
    ] as const) {
      ctx.beginPath();
      ctx.arc(bx + dx * crownR, by + dy * hPx, Math.max(1.8, scale * 0.35), 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  if (selected) {
    ctx.beginPath();
    ctx.ellipse(bx, by, crownR + 2, crownR * 0.35 + 2, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawParcel(
  canvas: HTMLCanvasElement,
  snapshot: Snapshot,
  coteM: number,
  ruMm: number,
  overlay: Overlay,
  selectedIds: ReadonlySet<number>,
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
  // du fond (nord, haut de l'écran) vers l'avant : l'occlusion raconte la profondeur
  const sorted = [...snapshot.trees].sort((a, b) => b.y - a.y);
  for (const tree of sorted) {
    drawTreeOblique(ctx, tree, scale, coteM, selectedIds.has(tree.id));
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
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());

  const { station, snapshot } = game;
  const selectedTrees = useMemo(
    () => (snapshot ? snapshot.trees.filter((t) => selectedIds.has(t.id)) : []),
    [snapshot, selectedIds],
  );
  const fruitsPrets = useMemo(
    () => (snapshot ? snapshot.trees.filter((t) => t.fruitsKg > 0.5) : []),
    [snapshot],
  );

  useEffect(() => {
    if (canvasRef.current && snapshot && station) {
      drawParcel(canvasRef.current, snapshot, station.coteM, station.ruMm, overlay, selectedIds);
    }
  }, [snapshot, station, overlay, selectedIds]);

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
  const canvasPx = 620;
  const tresorerie = snapshot.economy.treasuryEur;

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * station.coteM;
    const my = station.coteM - ((e.clientY - rect.top) / rect.height) * station.coteM;
    if (mode === "planter") {
      game.dispatch({ type: "planter", especeId, positions: [{ x: mx, y: my }] });
    } else if (mode === "chauler") {
      game.dispatch({ type: "chauler", x: mx, y: my, rayonM: rayonChaulage });
    } else {
      // Sélection au pied de l'arbre ; maj/ctrl = ajouter à la sélection.
      let best: SnapshotTree | undefined;
      let bestD = Infinity;
      for (const t of snapshot.trees) {
        const espece = getEspece(t.especeId);
        const r = Math.max(1, crownRadiusM(t.heightM, espece.lumiere.houppierRatio));
        const d = Math.hypot(t.x - mx, t.y - my);
        if (d <= r + 0.5 && d < bestD) {
          best = t;
          bestD = d;
        }
      }
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (best) {
          const next = new Set(selectedIds);
          if (next.has(best.id)) next.delete(best.id);
          else next.add(best.id);
          setSelectedIds(next);
        }
      } else {
        setSelectedIds(best ? new Set([best.id]) : new Set());
      }
    }
  };

  const selEspeces = [...new Set(selectedTrees.map((t) => t.especeId))];
  const selFruitsKg = selectedTrees.reduce((s, t) => s + t.fruitsKg, 0);

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div>
        <p style={{ margin: "0 0 6px", display: "flex", gap: 16, alignItems: "baseline" }}>
          <strong style={{ fontSize: "1.25rem" }}>
            An {annee} · {mois}
          </strong>
          <strong style={{ fontSize: "1.25rem", color: tresorerie < 0 ? "#c0392b" : "#2e5b30" }}>
            {tresorerie.toFixed(0)} €
          </strong>
          <span>
            ⏱ {snapshot.economy.hoursUsedWeek.toFixed(0)}/{60 * snapshot.economy.uth} h ·{" "}
            {snapshot.economy.uth} UTH
          </span>
          <span>
            🌡 {snapshot.weather.tMean.toFixed(0)} °C · 🌧 {snapshot.weather.rainMm.toFixed(0)} mm
          </span>
          {snapshot.economy.bankrupt && <strong style={{ color: "#c0392b" }}>FAILLITE</strong>}
        </p>
        <p style={{ margin: "0 0 6px" }}>
          {[0, 1, 4, 13, 52].map((v) => (
            <button
              key={v}
              type="button"
              style={btn(game.speed === v)}
              onClick={() => game.setSpeed(v)}
            >
              {v === 0 ? "⏸" : `×${v}`}
            </button>
          ))}
          <label style={{ marginRight: 10 }}>
            <input
              type="checkbox"
              checked={game.autoHarvest}
              onChange={(e) => game.setAutoHarvest(e.target.checked)}
            />{" "}
            🧺 récolte auto
          </label>
          <button type="button" style={btn()} onClick={game.quit}>
            Quitter
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
          Sol :{" "}
          {(["eau", "ph", "azote"] as const).map((o) => (
            <button key={o} type="button" style={btn(overlay === o)} onClick={() => setOverlay(o)}>
              {o}
            </button>
          ))}
          — nord au fond · points orange = fruits mûrs · maj+clic = sélection multiple
        </p>
      </div>

      <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 10 }}>
        {game.notice && <div style={{ ...panel, background: "#f3e6c4" }}>⏸ {game.notice}</div>}
        {game.refusals.length > 0 && (
          <div style={{ ...panel, color: "#8a4b2d" }}>
            {game.refusals.slice(0, 3).map((r, i) => (
              <div key={`${r.week}-${r.action}-${i}`}>
                ⚠ {r.action} : {r.reason}
              </div>
            ))}
          </div>
        )}

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
          <button
            type="button"
            style={btn()}
            onClick={() => game.dispatch({ type: "embaucher" })}
            title="600 €/sem, première semaine payée d'avance — embaucher la semaine d'une récolte = saisonnier"
          >
            👷 Embaucher
          </button>
          <button type="button" style={btn()} onClick={() => game.dispatch({ type: "licencier" })}>
            Licencier
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

        {selectedTrees.length > 0 && (
          <div style={panel}>
            <strong>
              {selectedTrees.length === 1
                ? getEspece(selectedTrees[0]?.especeId ?? "").nom
                : `${selectedTrees.length} arbres sélectionnés`}
            </strong>
            {selectedTrees.length === 1 && selectedTrees[0] && (
              <>
                {" "}
                · {selectedTrees[0].heightM.toFixed(1)} m ·{" "}
                {Math.floor(selectedTrees[0].ageWeeks / 52)} ans
                {selectedTrees[0].stress > 1 &&
                  ` · stress ${selectedTrees[0].stress.toFixed(0)}/10`}
              </>
            )}
            {selFruitsKg > 0.5 && <> · 🍎 {selFruitsKg.toFixed(0)} kg mûrs</>}
            <br />
            {selEspeces.map((id) => (
              <button
                key={id}
                type="button"
                style={btn()}
                onClick={() =>
                  setSelectedIds(
                    new Set(snapshot.trees.filter((t) => t.especeId === id).map((t) => t.id)),
                  )
                }
              >
                + tous les {getEspece(id).nom.toLowerCase()}s
              </button>
            ))}
            <br />
            {selFruitsKg > 0.5 && (
              <button
                type="button"
                style={btn(true)}
                onClick={() =>
                  game.dispatch({ type: "recolter", treeIds: selectedTrees.map((t) => t.id) })
                }
              >
                🧺 Récolter
              </button>
            )}
            <button
              type="button"
              style={btn()}
              onClick={() => {
                game.dispatch({
                  type: "couper",
                  treeIds: selectedTrees.map((t) => t.id),
                  devenir: "vendre",
                });
                setSelectedIds(new Set());
              }}
            >
              🪓 Couper &amp; vendre
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() => {
                game.dispatch({
                  type: "couper",
                  treeIds: selectedTrees.map((t) => t.id),
                  devenir: "epandre",
                });
                setSelectedIds(new Set());
              }}
            >
              🪓 Couper &amp; épandre (BRF)
            </button>
          </div>
        )}

        {fruitsPrets.length > 0 && !game.autoHarvest && (
          <div style={panel}>
            🍎 <strong>{fruitsPrets.reduce((s, t) => s + t.fruitsKg, 0).toFixed(0)} kg</strong> de
            fruits mûrs sur {fruitsPrets.length} arbres.
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

        <div style={{ ...panel, fontSize: 13 }}>
          🌲 {snapshot.trees.length} arbres · carbone {snapshot.inventory.vivantTHa.toFixed(1)} t
          vivant + {snapshot.inventory.humusTHa.toFixed(1)} t humus ·{" "}
          <strong>
            bilan {snapshot.inventory.bilanNetTHa >= 0 ? "+" : ""}
            {snapshot.inventory.bilanNetTHa.toFixed(1)} t C/ha
          </strong>
        </div>

        <div style={{ ...panel, maxHeight: 320, overflowY: "auto", fontSize: 13 }}>
          <strong>Journal</strong>
          {game.events.length === 0 && (
            <div style={{ color: "#6b6250" }}>Rien à signaler pour l'instant.</div>
          )}
          {game.events.map((ev, i) => (
            <div key={`${ev.week}-${i}`} style={{ marginTop: 3 }}>
              <span style={{ color: "#6b6250" }}>
                an {Math.floor(ev.week / 52) + 1} s{ev.week % 52}
              </span>{" "}
              {ev.icone} {ev.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
