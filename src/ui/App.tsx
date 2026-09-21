/**
 * UI jetable de la V0 (« labo moteur ») : bilan hydrique, croissance des
 * espèces de la V0 et carte spatiale (eau du sol + couronnes) sur les stations de
 * test. Sera remplacée par la vraie UI (React + PixiJS) — ne rien construire
 * de précieux ici.
 *
 * **Le calcul n'est plus ici (#123).** Il vit dans `src/lab/sonde.ts` et
 * s'exécute dans le worker du labo, comme les expériences. Ce fichier ne fait
 * plus que demander, montrer l'avancement, et dessiner ce qui revient — ce qui
 * est justement ce qu'on peut jeter sans rien perdre. Le contraire aurait
 * voulu dire bâtir la tuyauterie dans le fichier destiné à disparaître, et
 * c'est ce qui avait fait repousser la correction.
 */

import { useEffect, useRef, useState } from "react";
import { serieMeteoPour } from "../data/meteo";
import { crownRadiusM, ESPECES_V0, type GameState, getEspece, STATIONS_V0 } from "../engine";
import { type Horizon, ruHorizonMm } from "../engine/soil";
import {
  type BilanCarbone,
  isSuccessionStation,
  PLANTED_MAX_ID,
  type SimResult,
  TREES_PER_SPECIES,
  type WeekPoint,
  YEARS,
} from "../lab/sonde";
import type { DuLabo, VersLabo } from "../lab/worker";

import { COULEUR_AUTRES, SPECIES_COLORS } from "./couleurs";

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
      const r = Math.max(
        1.5,
        crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm) * scale,
      );
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

/**
 * LA SONDE, dans le worker du labo (#123).
 *
 * **Un worker par demande, et c'est lui qui donne l'annulation.** Changer de
 * station ou de météo pendant que la sonde tourne demandait, sans ça, d'ignorer
 * un résultat qu'on aurait payé jusqu'au bout : cent cinquante ans de friche
 * continueraient de brûler un cœur pour une page que personne ne regarde.
 * `terminate()` coupe net, et la demande suivante repart sur un worker neuf.
 */
function useSonde(
  stationId: string,
  meteoReelle: boolean,
): {
  /** le résultat ET son bilan, ensemble : ils arrivent ensemble */
  pret?: { resultat: SimResult; bilan: BilanCarbone };
  annees: number;
  total: number;
  erreur?: string;
} {
  const [etat, setEtat] = useState<{
    pret?: { resultat: SimResult; bilan: BilanCarbone };
    annees: number;
    total: number;
    erreur?: string;
  }>({ annees: 0, total: 0 });

  useEffect(() => {
    setEtat({ annees: 0, total: 0 });
    const w = new Worker(new URL("../lab/worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("message", (event: MessageEvent<DuLabo>) => {
      const msg = event.data;
      if (msg.type === "avancementSonde") {
        setEtat((e) => ({ ...e, annees: msg.annees, total: msg.total }));
      } else if (msg.type === "sonde") {
        setEtat((e) => ({ ...e, pret: { resultat: msg.resultat, bilan: msg.bilan } }));
      } else if (msg.type === "erreur") {
        setEtat((e) => ({ ...e, erreur: msg.message }));
      }
    });
    const demande: VersLabo = { type: "sonder", stationId, meteoReelle };
    w.postMessage(demande);
    return () => w.terminate();
  }, [stationId, meteoReelle]);

  return etat;
}

/** Les stations, en boutons — le même bandeau avant et après le calcul. */
function ChoixDeStation({
  stationId,
  setStationId,
}: {
  stationId: string;
  setStationId: (id: string) => void;
}) {
  return (
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
            background: s.station.id === stationId ? "#3d6b3f" : "#f6f4ee",
            color: s.station.id === stationId ? "#fff" : "#2e2a20",
            cursor: "pointer",
          }}
        >
          {s.station.nom}
        </button>
      ))}
    </p>
  );
}

/** Où en est la sonde : des années simulées, et une barre qui avance. */
function Avancement({ annees, total }: { annees: number; total: number }) {
  const part = total > 0 ? annees / total : 0;
  return (
    <div style={{ color: "#6b6250" }}>
      <p>
        La sonde simule la station, année par année
        {total > 0 ? ` — ${annees} ans sur ${total}` : "…"}. La page reste vivante : le calcul
        tourne dans un worker, et changer de station l'arrête.
      </p>
      <div
        style={{
          width: 420,
          height: 10,
          border: "1px solid #b0a58c",
          borderRadius: 5,
          overflow: "hidden",
          background: "#f6f4ee",
        }}
      >
        <div
          style={{ width: `${(part * 100).toFixed(1)}%`, height: "100%", background: "#3d6b3f" }}
        />
      </div>
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
  const sonde = useSonde(sc.station.id, useReelle);

  // Tant que la sonde n'a pas rendu, on montre où elle en est — et la page
  // répond, ce qui est tout l'objet de #123.
  if (!sonde.pret) {
    return (
      <div>
        <h1 style={{ fontSize: "1.3rem" }}>Labo moteur (grille 1 m² : eau, azote, lumière)</h1>
        <ChoixDeStation stationId={sc.station.id} setStationId={setStationId} />
        {sonde.erreur ? (
          <p style={{ color: "#8a4b2d" }}>La sonde a échoué : {sonde.erreur}</p>
        ) : (
          <Avancement annees={sonde.annees} total={sonde.total} />
        )}
      </div>
    );
  }
  const { points, finalState } = sonde.pret.resultat;

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
      <ChoixDeStation stationId={sc.station.id} setStationId={setStationId} />
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
          const inv = sonde.pret.bilan;
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
