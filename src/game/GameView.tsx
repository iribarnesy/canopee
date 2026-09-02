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

type Mode = "selection" | "planter" | "chauler" | "faucher" | "eclaircir";
type Overlay = "eau" | "ph" | "azote" | "herbe";

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

  if (tree.protege && tree.heightM <= 1.5) {
    // Manchon : un petit fût clair au pied du plant, pour voir d'un coup d'œil
    // ce qui est encore à la merci du gibier.
    ctx.fillStyle = "#d8d2c4";
    const w = Math.max(1.5, scale * 0.5);
    ctx.fillRect(bx - w / 2, by - Math.min(hPx, scale * 1.2), w, Math.min(hPx, scale * 1.2));
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
      } else if (overlay === "herbe") {
        // Plus l'herbe couvre, plus le vert est franc.
        const c = snapshot.soilHerbe[i] ?? 0;
        hue = 95;
        sat = 15 + 45 * c;
        l = 85 - 35 * c;
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
  const [semainesSaison, setSemainesSaison] = useState(4);
  const [densiteCible, setDensiteCible] = useState(400);
  const [critereEclaircie, setCritereEclaircie] = useState<"parLeBas" | "parLeHaut">("parLeBas");
  const [mainOuvertePanneau, setMainOuvertePanneau] = useState(false);
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
    } else if (mode === "faucher") {
      game.dispatch({ type: "faucher", x: mx, y: my, rayonM: rayonChaulage });
    } else if (mode === "eclaircir") {
      game.dispatch({
        type: "eclaircir",
        x: mx,
        y: my,
        rayonM: rayonChaulage,
        densiteCibleParHa: densiteCible,
        critere: critereEclaircie,
        devenir: "vendre",
      });
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
            ⏱ {snapshot.economy.hoursUsedWeek.toFixed(0)}/{60 * snapshot.economy.uth} h · vous
            {snapshot.economy.ouvriersCdi > 0 && ` + ${snapshot.economy.ouvriersCdi} CDI`}
            {snapshot.economy.saisonniersFinSemaine.length > 0 &&
              ` + ${snapshot.economy.saisonniersFinSemaine.length} sais.`}
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
          {(["eau", "ph", "azote", "herbe"] as const).map((o) => (
            <button key={o} type="button" style={btn(overlay === o)} onClick={() => setOverlay(o)}>
              {o}
            </button>
          ))}
          — nord au fond · points orange = fruits mûrs · maj+clic = sélection multiple
        </p>
      </div>

      <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 10 }}>
        {game.notice && <div style={{ ...panel, background: "#f3e6c4" }}>⏸ {game.notice}</div>}
        {game.refusals.length > 0 && (
          <div style={{ ...panel, color: "#8a4b2d" }}>
            {game.refusals.slice(0, 3).map((r) => (
              <div key={r.uid}>
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
            style={btn(mode === "eclaircir")}
            onClick={() => setMode("eclaircir")}
            title="Ramener une zone à une densité choisie, en désignant les tiges par un critère"
          >
            🌲 Éclaircir
          </button>
          <button
            type="button"
            style={btn(mode === "faucher")}
            onClick={() => setMode("faucher")}
            title="Dégager la strate herbacée autour des jeunes plants — l'entretien qui sauve une plantation sur sol pauvre"
          >
            🌾 Faucher
          </button>
          <button
            type="button"
            style={btn(mainOuvertePanneau)}
            onClick={() => setMainOuvertePanneau(!mainOuvertePanneau)}
            title="Embaucher de la main-d'œuvre"
          >
            👷 Main-d'œuvre
          </button>
          {mainOuvertePanneau && (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                style={btn()}
                onClick={() =>
                  game.dispatch({
                    type: "embaucher",
                    contrat: "saisonnier",
                    semaines: semainesSaison,
                  })
                }
                title="Payé d'avance, repart tout seul à la fin du contrat — l'outil des récoltes"
              >
                Saisonnier {semainesSaison} sem ({semainesSaison * 700} €)
              </button>
              <input
                type="range"
                min={1}
                max={12}
                value={semainesSaison}
                onChange={(e) => setSemainesSaison(Number(e.target.value))}
                style={{ verticalAlign: "middle", width: 70 }}
              />
              <br />
              <button
                type="button"
                style={btn()}
                onClick={() => game.dispatch({ type: "embaucher", contrat: "cdi" })}
                title="600 €/sem, rupture 1 200 € (indemnités + préavis)"
              >
                CDI (600 €/sem)
              </button>
              <button
                type="button"
                style={btn()}
                onClick={() => game.dispatch({ type: "licencier" })}
                title="Rompre un CDI : 1 200 € d'indemnités"
              >
                Licencier (1 200 €)
              </button>
            </div>
          )}
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
          {mode === "eclaircir" && (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                style={btn(critereEclaircie === "parLeBas")}
                onClick={() => setCritereEclaircie("parLeBas")}
                title="Retirer les dominés : la croissance se concentre sur les plus beaux"
              >
                par le bas
              </button>
              <button
                type="button"
                style={btn(critereEclaircie === "parLeHaut")}
                onClick={() => setCritereEclaircie("parLeHaut")}
                title="Prélever les gros : on récolte le capital"
              >
                par le haut
              </button>
              <br />
              Densité visée :{" "}
              <input
                type="range"
                min={100}
                max={1500}
                step={50}
                value={densiteCible}
                onChange={(e) => setDensiteCible(Number(e.target.value))}
                style={{ verticalAlign: "middle", width: 90 }}
              />{" "}
              {densiteCible} tiges/ha · rayon{" "}
              <input
                type="range"
                min={3}
                max={20}
                value={rayonChaulage}
                onChange={(e) => setRayonChaulage(Number(e.target.value))}
                style={{ verticalAlign: "middle", width: 70 }}
              />{" "}
              {rayonChaulage} m
            </div>
          )}
          {(mode === "chauler" || mode === "faucher") && (
            <div style={{ marginTop: 6 }}>
              Rayon :{" "}
              <input
                type="range"
                min={3}
                max={20}
                value={rayonChaulage}
                onChange={(e) => setRayonChaulage(Number(e.target.value))}
              />{" "}
              {rayonChaulage} m —{" "}
              {mode === "chauler"
                ? "pH +0,5 sur le disque"
                : "l'herbe est rabattue, elle repoussera"}
              .
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
                {selectedTrees[0].hauteurElagueeM > 0 &&
                  ` · bille ${selectedTrees[0].hauteurElagueeM.toFixed(1)} m`}
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
              onClick={() =>
                game.dispatch({ type: "proteger", treeIds: selectedTrees.map((t) => t.id) })
              }
              title="Poser un manchon : le plant échappe aux dents jusqu'à ce qu'il ait sa flèche hors d'atteinte"
            >
              🛡️ Protéger
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() =>
                game.dispatch({ type: "leverEcorce", treeIds: selectedTrees.map((t) => t.id) })
              }
              title="Lever le liège : une récolte qui ne tue pas l'arbre et revient tous les dix ans"
            >
              🟤 Lever l'écorce
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() =>
                game.dispatch({
                  type: "elaguer",
                  treeIds: selectedTrees.map((t) => t.id),
                  hauteurM: 6,
                })
              }
              title="Monter une bille propre : c'est ce qui fera du bois d'œuvre au lieu du chauffage"
            >
              ✂️ Élaguer
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() =>
                game.dispatch({ type: "receper", treeIds: selectedTrees.map((t) => t.id) })
              }
              title="Couper au ras : la souche repart en cépée (taillis). Seules les espèces qui rejettent le supportent."
            >
              🪵 Recéper
            </button>
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
          🌲 {snapshot.trees.length} arbres · 🌾 herbe{" "}
          {(snapshot.fluxes.herbeCouvertureMean * 100).toFixed(0)} % · carbone{" "}
          {snapshot.inventory.vivantTHa.toFixed(1)} t vivant +{" "}
          {snapshot.inventory.humusTHa.toFixed(1)} t humus ·{" "}
          <strong>
            bilan {snapshot.inventory.bilanNetTHa >= 0 ? "+" : ""}
            {snapshot.inventory.bilanNetTHa.toFixed(1)} t C/ha
          </strong>
          <br />🦌 broutage {snapshot.fluxes.broutageKg.toFixed(2)} kg/sem
          <br />🦋 biodiversité <strong>{snapshot.biodiversite.note.toFixed(0)}/100</strong>{" "}
          <span style={{ opacity: 0.7 }}>
            ({snapshot.biodiversite.richesse} essence
            {snapshot.biodiversite.richesse > 1 ? "s" : ""}, strates{" "}
            {(snapshot.biodiversite.strates * 100).toFixed(0)} %, couvert permanent{" "}
            {(snapshot.biodiversite.couvertPermanent * 100).toFixed(0)} %, bois mort{" "}
            {(snapshot.biodiversite.boisMort * 100).toFixed(0)} %)
          </span>
        </div>

        <div style={{ ...panel, maxHeight: 560, overflowY: "auto", fontSize: 13, flex: 1 }}>
          <strong>Journal</strong>
          {game.events.length === 0 && (
            <div style={{ color: "#6b6250" }}>Rien à signaler pour l'instant.</div>
          )}
          {game.events.map((ev) => (
            <div key={ev.uid} style={{ marginTop: 3 }}>
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
