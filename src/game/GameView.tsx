/**
 * L'écran de jeu : parcelle en vue OBLIQUE (les arbres montrent leur hauteur,
 * triés du fond vers l'avant) sur le sol en vue de dessus, HUD, fil
 * d'événements, actions (planter, couper, récolter, chauler, embaucher).
 * Rendu Canvas 2D — l'isométrique complète viendra comme couche visuelle.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SCENARIOS, type ScenarioId } from "../engine/climat";
import {
  type CoteParcelle,
  type EauDeSurface,
  profondeurNappeCm,
  resumeEau,
  SANS_EAU,
} from "../engine/eau_surface";
import { ESPECES_V0, getEspece } from "../engine/especes";
import { crownRadiusM } from "../engine/light";
import {
  type Bordures,
  bordersUniformes,
  entourageDeLaStation,
  frequentationDesBordures,
  PAYSAGES,
  resumeBordures,
} from "../engine/paysage";
import {
  ALTITUDE_SERIE_M,
  altitudeParCellule,
  anomalieAltitudeC,
  coefficientRuissellement,
  facteurExpositionRayonnement,
  penteParCellule,
  type Relief,
  RUISSELLEMENT_AMONT,
} from "../engine/relief";
import { STATIONS_V0 } from "../engine/stations";
import { SPECIES_COLORS } from "../ui/couleurs";
import { EditeurTerrain, terrainInitial } from "./EditeurTerrain";
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

type Mode = "selection" | "planter" | "chauler" | "faucher" | "eclaircir" | "brf" | "cloturer";
type Overlay = "eau" | "ph" | "azote" | "herbe" | "nappe";

const panel: React.CSSProperties = {
  border: "1px solid var(--trait)",
  borderRadius: 8,
  padding: "8px 12px",
  background: "var(--carte)",
};

const btn = (active = false): React.CSSProperties => ({
  padding: "4px 11px",
  marginRight: 5,
  marginBottom: 4,
  border: "1px solid",
  borderColor: active ? "var(--foret)" : "var(--trait)",
  borderRadius: 6,
  background: active ? "var(--foret)" : "#fff",
  color: active ? "#fff" : "var(--encre)",
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
  nappeCm: Float32Array | undefined,
  enEau: readonly boolean[] | undefined,
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
      } else if (overlay === "nappe") {
        // Du bleu franc là où la nappe affleure au beige là où elle est hors
        // de portée : c'est la carte qui explique la ripisylve.
        const prof = nappeCm?.[i] ?? Number.POSITIVE_INFINITY;
        const proximite = Number.isFinite(prof) ? Math.max(0, 1 - prof / 300) : 0;
        hue = 205;
        sat = 8 + 52 * proximite;
        l = 88 - 40 * proximite;
      } else {
        l = 90 - 50 * Math.min(1, (snapshot.soilN[i] ?? 0) / 3);
        hue = 55;
        sat = 30;
      }
      // L'eau libre elle-même : elle prime sur tous les calques.
      if (enEau?.[i]) {
        hue = 200;
        sat = 55;
        l = 45;
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
  onStart: (
    stationId: string,
    seed: number,
    meteo: "reelle" | "synthetique",
    scenario: ScenarioId,
    bordures: Bordures,
    relief: Relief,
    eau: EauDeSurface,
    maturationAns: number,
    anneeDepart: number,
  ) => void;
  onResume: () => void;
}) {
  const [stationId, setStationId] = useState(STATIONS_V0[0]?.station.id ?? "");
  const [seed, setSeed] = useState(42);
  const [scenario, setScenario] = useState<ScenarioId>("ssp245");
  const [bordures, setBordures] = useState<Bordures>(bordersUniformes(PAYSAGES[1]?.id ?? "bocage"));
  const [cotesSeparees, setCotesSeparees] = useState(false);
  const [anneeDepart, setAnneeDepart] = useState(2026);
  const [relief, setRelief] = useState<Relief>(
    STATIONS_V0[0]?.station.relief ?? {
      altitudeM: 120,
      pentePct: 0,
      expositionDeg: 180,
      forme: "plan",
      bassinAmontHa: 0,
    },
  );
  const [eau, setEau] = useState<EauDeSurface>(SANS_EAU);
  const [terrain, setTerrain] = useState<number[] | undefined>(undefined);
  const [maturationAns, setMaturationAns] = useState(0);
  const save = loadSave();

  const choisie = STATIONS_V0.find((s) => s.station.id === stationId);
  /**
   * Choisir un terrain remet le relief d'origine de la station — c'est celui
   * qui va avec ce sol, un podzol landais n'est pas sur un flanc de montagne —
   * et abandonne le modelage, qui valait pour une parcelle d'une autre taille.
   *
   * Tout se fait ICI, dans le gestionnaire de clic, et non dans un effet : un
   * effet se déclenche APRÈS le rendu, si bien qu'un joueur qui choisissait
   * une station puis ouvrait l'éditeur voyait son modelage effacé dans la
   * foulée par l'effet en retard.
   */
  const choisirStation = (id: string) => {
    setStationId(id);
    const s = STATIONS_V0.find((x) => x.station.id === id);
    if (s) setRelief(s.station.relief);
    setTerrain(undefined);
    setEau((e) => (e.type === "terrain" ? SANS_EAU : e));
  };
  // Ce que l'entourage donnera vraiment, calculé par le moteur lui-même : les
  // semis annoncés par un paysage sont filtrés par ce que CE sol supporte.
  const entourage = useMemo(
    () =>
      choisie
        ? entourageDeLaStation(bordures, choisie.station.phInitial, choisie.station.ruMm)
        : null,
    [bordures, choisie],
  );
  const semisParAn = entourage?.voisinage.reduce((s, v) => s + v.semisParAn, 0) ?? 0;
  const essences = [...(entourage?.voisinage ?? [])]
    .sort((a, b) => b.semisParAn - a.semisParAn)
    .slice(0, 3)
    .map((v) => getEspece(v.especeId).nom.toLowerCase());

  // Le terrain dessiné remplace la silhouette paramétrique (relief.ts), et il
  // impose l'eau déduite : on ne déclare plus rien, c'est le modelé qui parle.
  const reliefFinal: Relief = terrain ? { ...relief, altitudesM: terrain } : relief;

  // Ce que le relief change, calculé par le moteur : température avec
  // l'altitude, rayonnement avec l'exposition, part de la pluie qui file en
  // surface au lieu de s'infiltrer, et ce qui arrive du bassin d'amont.
  const anomalieC = anomalieAltitudeC(relief, ALTITUDE_SERIE_M);
  const rayonnement = facteurExpositionRayonnement(relief);
  // Quand le terrain est dessiné, la pente n'est plus un réglage : elle se lit
  // sur le modelé, exactement comme le moteur la lira (relief.ts).
  const penteEffective = useMemo(() => {
    if (!terrain || !choisie) return relief.pentePct;
    const pentes = penteParCellule(terrain, {
      widthM: choisie.station.coteM,
      heightM: choisie.station.coteM,
    });
    let somme = 0;
    for (const p of pentes) somme += p;
    return somme / pentes.length;
  }, [terrain, choisie, relief.pentePct]);
  const ruissellementNu = coefficientRuissellement(penteEffective, 0.1, 0.5);
  const ruissellementCouvert = coefficientRuissellement(penteEffective, 0.95, 0.5);
  const pluieHebdoMm = (choisie?.climat.rainAnnualMm ?? 800) / 52;
  const surfaceHa = (choisie?.station.coteM ?? 100) ** 2 / 10000;
  const amontMm = (pluieHebdoMm * RUISSELLEMENT_AMONT * relief.bassinAmontHa) / surfaceHa;

  // Aperçu du champ de nappe sur CETTE parcelle : mêmes fonctions que le
  // moteur, appliquées au terrain et au relief choisis.
  const nappe = useMemo(() => {
    if (!choisie || eau.type === "aucune") return undefined;
    const dims = { widthM: choisie.station.coteM, heightM: choisie.station.coteM };
    const champ = profondeurNappeCm(
      eau,
      altitudeParCellule(reliefFinal, dims),
      dims,
      choisie.station.profil,
    );
    let proche = Number.POSITIVE_INFINITY;
    let loin = 0;
    for (const v of champ) {
      if (Number.isFinite(v)) {
        proche = Math.min(proche, v);
        loin = Math.max(loin, v);
      }
    }
    return { proche: Number.isFinite(proche) ? proche : 0, loin };
  }, [choisie, eau, reliefFinal]);

  const setCote = (cote: keyof Bordures, id: string) =>
    setBordures(cotesSeparees ? { ...bordures, [cote]: id } : bordersUniformes(id));

  const selecteur = (cote: keyof Bordures, libelle: string) => (
    <label className="cote">
      <span className="cote-nom">{libelle}</span>
      <select value={bordures[cote]} onChange={(e) => setCote(cote, e.target.value)}>
        {PAYSAGES.map((p) => (
          <option key={p.id} value={p.id} title={p.description}>
            {p.court}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="depart">
      <h2>Nouvelle partie</h2>
      <p className="accroche">
        Un sol, un entourage, un climat — et cinquante ans devant vous. Rien n'est scripté&nbsp;:
        tout ce qui arrivera découlera de ces trois choix.
      </p>

      <section className="carte">
        <h3>Le terrain</h3>
        <p className="sous">
          Le sol décide de ce qu'il retient d'eau, de ce qu'il minéralise, de ce qu'il supporte.
        </p>
        <div className="seg">
          {STATIONS_V0.map((s) => (
            <button
              key={s.station.id}
              type="button"
              style={btn(s.station.id === stationId)}
              onClick={() => choisirStation(s.station.id)}
            >
              {s.station.nom}
            </button>
          ))}
        </div>
        {choisie && (
          <p className="glose">
            {choisie.station.coteM} × {choisie.station.coteM} m · réserve utile{" "}
            {choisie.station.ruMm.toFixed(0)} mm · pH {choisie.station.phInitial.toFixed(1)} ·{" "}
            {choisie.climat.rainAnnualMm} mm de pluie par an ·{" "}
            {choisie.station.relief.pentePct > 0
              ? `pente ${choisie.station.relief.pentePct} % à ${choisie.station.relief.altitudeM} m`
              : `terrain plat à ${choisie.station.relief.altitudeM} m`}
          </p>
        )}
      </section>

      <section className="carte">
        <h3>Ce qu'il y a autour</h3>
        <p className="sous">
          L'entourage décide du gibier, des semis qui arrivent tout seuls, de l'azote qui tombe du
          ciel, du vent et des départs de feu.
        </p>
        {cotesSeparees ? (
          <div className="compas">
            <div />
            {selecteur("nord", "NORD")}
            <div />
            {selecteur("ouest", "OUEST")}
            <div className="parcelle">votre parcelle</div>
            {selecteur("est", "EST")}
            <div />
            {selecteur("sud", "SUD")}
            <div />
          </div>
        ) : (
          <div className="seg">
            {PAYSAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                style={btn(p.id === bordures.nord)}
                onClick={() => setCote("nord", p.id)}
                title={p.description}
              >
                {p.court}
              </button>
            ))}
          </div>
        )}
        <p style={{ margin: "10px 0 0", fontSize: 13 }}>
          <label style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={cotesSeparees}
              onChange={(e) => setCotesSeparees(e.target.checked)}
            />{" "}
            un entourage différent de chaque côté
          </label>
        </p>
        <p className="glose" style={{ minHeight: 0 }}>
          {cotesSeparees
            ? resumeBordures(bordures)
            : PAYSAGES.find((p) => p.id === bordures.nord)?.description}
        </p>
        {entourage && (
          <div className="effets">
            <span title="densité de cervidés : ils broutent les pousses et frottent les jeunes tiges">
              🦌 {entourage.gibierParHa.toFixed(1)} cervidé/ha
            </span>
            <span title="semis arrivant du voisinage, après filtrage par ce que ce sol supporte">
              🌱 {semisParAn} semis/an{essences.length > 0 && ` — ${essences.join(", ")}`}
            </span>
            <span title="dépôts atmosphériques d'azote (élevages, trafic, cultures)">
              💧 {entourage.depositionNKgHaAn.toFixed(0)} kg N/ha/an
            </span>
            <span title="exposition au vent : un côté ouvert suffit à laisser passer">
              💨 vent {(entourage.ventExposition * 100).toFixed(0)} %
            </span>
            <span title="fréquentation humaine : d'où partent les feux">
              🔥 départs ×{frequentationDesBordures(bordures).toFixed(1)}
            </span>
          </div>
        )}
      </section>

      <section className="carte">
        <h3>Le relief</h3>
        <p className="sous">
          L'eau et la chaleur ne se répartissent pas à plat : une pente fait filer la pluie, un
          versant sud grille, un vallon reçoit ce que le bassin d'amont lui envoie.
        </p>
        <div className="reglages">
          <label htmlFor="altitude">Altitude</label>
          <input
            id="altitude"
            type="range"
            min={20}
            max={1600}
            step={20}
            value={relief.altitudeM}
            onChange={(e) => setRelief({ ...relief, altitudeM: Number(e.target.value) })}
          />
          <span className="valeur">{relief.altitudeM} m</span>

          <label htmlFor="pente">Pente</label>
          <input
            id="pente"
            type="range"
            min={0}
            max={45}
            step={1}
            value={relief.pentePct}
            disabled={terrain !== undefined}
            title={
              terrain
                ? "La pente se lit sur le terrain que vous avez dessiné"
                : "Pente moyenne de la parcelle"
            }
            onChange={(e) => setRelief({ ...relief, pentePct: Number(e.target.value) })}
          />
          <span className="valeur">
            {terrain ? `${penteEffective.toFixed(1)} % (dessinée)` : `${relief.pentePct} %`}
          </span>

          <label htmlFor="amont">Bassin amont</label>
          <input
            id="amont"
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={relief.bassinAmontHa}
            onChange={(e) => setRelief({ ...relief, bassinAmontHa: Number(e.target.value) })}
          />
          <span className="valeur">{relief.bassinAmontHa.toFixed(1)} ha</span>

          <span className="intitule">Exposition</span>
          <div className="choix">
            {(
              [
                [0, "Nord (ubac)"],
                [90, "Est"],
                [180, "Sud (adret)"],
                [270, "Ouest"],
              ] as const
            ).map(([deg, libelle]) => (
              <button
                key={deg}
                type="button"
                style={btn(relief.expositionDeg === deg)}
                disabled={relief.pentePct === 0 && !terrain}
                title={
                  relief.pentePct === 0
                    ? "Sans pente, l'exposition ne change rien"
                    : "Le versant que regarde la pente"
                }
                onClick={() => setRelief({ ...relief, expositionDeg: deg })}
              >
                {libelle}
              </button>
            ))}
          </div>

          <span className="intitule">Forme</span>
          <div className="choix">
            {(
              [
                ["plan", "Versant régulier", "Une pente d'un seul tenant."],
                [
                  "vallon",
                  "Vallon (entonnoir)",
                  "Les versants convergent : l'eau se concentre au milieu de la parcelle.",
                ],
                [
                  "croupe",
                  "Croupe (dos d'âne)",
                  "Le terrain bombe : l'eau s'écarte des deux côtés et le sommet reste sec.",
                ],
              ] as const
            ).map(([forme, libelle, aide]) => (
              <button
                key={forme}
                type="button"
                style={btn(relief.forme === forme)}
                disabled={terrain !== undefined}
                title={terrain ? "Sans effet : votre terrain dessiné fait foi" : aide}
                onClick={() => setRelief({ ...relief, forme })}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>
        <div className="effets">
          <span title="0,6 °C de moins par 100 m d'altitude, par rapport à la station météo">
            🌡 {anomalieC >= 0 ? "+" : ""}
            {anomalieC.toFixed(1)} °C
          </span>
          <span title="un versant sud reçoit plus d'énergie : il évapore plus et sèche plus tôt">
            ☀️ rayonnement {rayonnement >= 1 ? "+" : ""}
            {((rayonnement - 1) * 100).toFixed(0)} %
          </span>
          <span title="part de la pluie qui file en surface au lieu de s'infiltrer">
            💧 ruissellement {(ruissellementNu * 100).toFixed(0)} % à nu ·{" "}
            {(ruissellementCouvert * 100).toFixed(0)} % sous couvert
          </span>
          <span title="eau reçue du bassin situé au-dessus, en semaine de pluie moyenne">
            ⬇️ {amontMm.toFixed(1)} mm/sem d'amont
          </span>
        </div>
      </section>

      <section className="carte">
        <h3>L'eau de surface</h3>
        <p className="sous">
          Un ruisseau ou une mare, ce n'est pas un décor : c'est une nappe sous vos pieds. Elle
          affleure au bord, s'enfonce en s'éloignant, et c'est elle — pas une règle sur les espèces
          — qui fait pousser l'aulne là où le hêtre se noie.
        </p>
        <div className="seg">
          {(
            [
              ["aucune", "Aucune"],
              ["ruisseau", "Un ruisseau"],
              ["mare", "Une mare"],
            ] as const
          ).map(([type, libelle]) => (
            <button
              key={type}
              type="button"
              style={btn(eau.type === type)}
              onClick={() =>
                setEau(
                  type === "aucune"
                    ? SANS_EAU
                    : type === "ruisseau"
                      ? { type, cote: "sud", bergeM: 0.3 }
                      : { type, xRel: 0.5, yRel: 0.5, rayonM: 4, bergeM: 0.6 },
                )
              }
            >
              {libelle}
            </button>
          ))}
        </div>
        {eau.type !== "aucune" && (
          <div className="reglages" style={{ marginTop: 10 }}>
            {eau.type === "ruisseau" && (
              <>
                <span className="intitule">Il longe le</span>
                <div className="choix">
                  {(["nord", "est", "sud", "ouest"] as const).map((cote) => (
                    <button
                      key={cote}
                      type="button"
                      style={btn(eau.cote === cote)}
                      onClick={() => setEau({ ...eau, cote: cote as CoteParcelle })}
                    >
                      {cote}
                    </button>
                  ))}
                </div>
              </>
            )}
            {eau.type === "mare" && (
              <>
                <label htmlFor="rayon">Rayon</label>
                <input
                  id="rayon"
                  type="range"
                  min={2}
                  max={12}
                  step={1}
                  value={eau.rayonM ?? 4}
                  onChange={(e) => setEau({ ...eau, rayonM: Number(e.target.value) })}
                />
                <span className="valeur">{eau.rayonM ?? 4} m</span>
                <label htmlFor="marex">Position O-E</label>
                <input
                  id="marex"
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={eau.xRel ?? 0.5}
                  onChange={(e) => setEau({ ...eau, xRel: Number(e.target.value) })}
                />
                <span className="valeur">{((eau.xRel ?? 0.5) * 100).toFixed(0)} %</span>
                <label htmlFor="marey">Position S-N</label>
                <input
                  id="marey"
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={eau.yRel ?? 0.5}
                  onChange={(e) => setEau({ ...eau, yRel: Number(e.target.value) })}
                />
                <span className="valeur">{((eau.yRel ?? 0.5) * 100).toFixed(0)} %</span>
              </>
            )}
            <label htmlFor="berge">Encaissement</label>
            <input
              id="berge"
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={eau.bergeM}
              onChange={(e) => setEau({ ...eau, bergeM: Number(e.target.value) })}
            />
            <span className="valeur">{eau.bergeM.toFixed(1)} m</span>
          </div>
        )}
        {nappe && (
          <div className="effets">
            <span title="profondeur de la nappe sous la cellule la plus proche de l'eau">
              💧 nappe à {nappe.proche.toFixed(0)} cm au bord
            </span>
            <span title="profondeur de la nappe au point le plus éloigné de l'eau">
              🏜 {nappe.loin > 350 ? "hors de portée" : `${nappe.loin.toFixed(0)} cm`} au plus loin
            </span>
            <span>{resumeEau(eau)}</span>
          </div>
        )}
      </section>

      <section className="carte">
        <h3>Modeler le terrain</h3>
        <p className="sous">
          Facultatif. Creusez, montez, lissez — et l'eau apparaît d'elle-même là où le terrain la
          retient. Ce n'est pas un décor : la cuvette qui tient l'eau tiendra une nappe, et la nappe
          fera la ripisylve.
        </p>
        <div className="seg">
          <button
            type="button"
            style={btn(terrain !== undefined)}
            onClick={() => {
              if (terrain) {
                setTerrain(undefined);
                if (eau.type === "terrain") setEau(SANS_EAU);
              } else if (choisie) {
                setTerrain(terrainInitial(choisie.station.coteM, relief.pentePct));
                setEau({ type: "terrain", bergeM: 0 });
              }
            }}
          >
            {terrain ? "↩ revenir au relief paramétré" : "✎ dessiner le terrain"}
          </button>
        </div>
        {terrain && choisie && (
          <div style={{ marginTop: 10 }}>
            <EditeurTerrain
              coteM={choisie.station.coteM}
              pluieAnnuelleMm={choisie.climat.rainAnnualMm}
              profil={choisie.station.profil}
              valeur={terrain}
              onChange={setTerrain}
            />
          </div>
        )}
      </section>

      <section className="carte">
        <h3>Avant votre arrivée</h3>
        <p className="sous">
          Un terrain qu'on vient de modeler n'est qu'une topographie. L'humus, l'herbe, les semis
          venus du voisinage et la ceinture d'arbres autour de l'eau demandent du temps — on peut le
          lui donner d'avance.
        </p>
        <div className="reglages">
          <label htmlFor="maturation">Vieillissement</label>
          <input
            id="maturation"
            type="range"
            min={0}
            max={120}
            step={5}
            value={maturationAns}
            onChange={(e) => setMaturationAns(Number(e.target.value))}
          />
          <span className="valeur">{maturationAns === 0 ? "aucun" : `${maturationAns} ans`}</span>
        </div>
        <p className="glose" style={{ minHeight: 0 }}>
          {maturationAns === 0
            ? "Vous arrivez sur le terrain tel qu'il est décrit ci-dessus."
            : `Le moteur simule ${maturationAns} ans sans vous (${anneeDepart - maturationAns}-${anneeDepart}), puis vous arrivez. Ce qui aura poussé aura poussé tout seul.`}
        </p>
      </section>

      <section className="carte">
        <h3>Le climat</h3>
        <p className="sous">Ce qu'on plante aujourd'hui vivra dedans.</p>
        <div className="seg">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              style={btn(sc.id === scenario)}
              onClick={() => setScenario(sc.id)}
              title={sc.description}
            >
              {sc.nom}
            </button>
          ))}
        </div>
        <p className="glose">{SCENARIOS.find((sc) => sc.id === scenario)?.description}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>Année de départ</span>
          <div className="seg">
            {[2026, 2040].map((a) => (
              <button
                key={a}
                type="button"
                style={btn(a === anneeDepart)}
                onClick={() => setAnneeDepart(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, marginLeft: 8 }}>Graine du hasard</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
            style={{ width: 80 }}
            title="Deux parties avec la même graine se déroulent à l'identique."
          />
        </div>
      </section>

      <p className="seg">
        <button
          type="button"
          style={{ ...btn(true), padding: "8px 20px", fontSize: 14, fontWeight: 600 }}
          onClick={() =>
            onStart(
              stationId,
              seed,
              "reelle",
              scenario,
              bordures,
              reliefFinal,
              eau,
              maturationAns,
              anneeDepart,
            )
          }
        >
          Démarrer
        </button>
        {save && (
          <button
            type="button"
            style={{ ...btn(), padding: "8px 16px" }}
            onClick={onResume}
            title={`${save.stationId}, semaine ${save.weeks}`}
          >
            Reprendre la partie sauvegardée (an {Math.floor(save.weeks / 52) + 1})
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
      drawParcel(
        canvasRef.current,
        snapshot,
        station.coteM,
        station.ruMm,
        overlay,
        selectedIds,
        station.nappeCm,
        station.enEau,
      );
    }
  }, [snapshot, station, overlay, selectedIds]);

  if (!station || !snapshot) {
    return (
      <div>
        {game.replayProgress && (
          <p>
            {game.replayProgress.phase === "vieillissement"
              ? `Le terrain vieillit sans vous… ${Math.round(game.replayProgress.done / 52)} ans sur ${Math.round(game.replayProgress.total / 52)}.`
              : `Rechargement de la partie… ${Math.round(game.replayProgress.done / 52)} ans rejoués.`}
          </p>
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
    } else if (mode === "cloturer") {
      game.dispatch({ type: "cloturer", x: mx, y: my, rayonM: rayonChaulage });
    } else if (mode === "brf") {
      game.dispatch({ type: "epandreBrf", x: mx, y: my, rayonM: rayonChaulage, part: 1 });
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
        <p className="bandeau">
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
            border: "1px solid var(--trait)",
            borderRadius: 8,
            boxShadow: "var(--ombre)",
            cursor: mode === "selection" ? "default" : "crosshair",
          }}
          onClick={onCanvasClick}
        />
        <p style={{ margin: "6px 0 0", color: "var(--encre-douce)", fontSize: 13 }}>
          Sol :{" "}
          {(
            [
              ["eau", "Eau"],
              ["ph", "pH"],
              ["azote", "Azote"],
              ["herbe", "Herbe"],
              ...(station.eau.type !== "aucune" ? ([["nappe", "Nappe"]] as const) : []),
            ] as const
          ).map(([o, libelle]) => (
            <button key={o} type="button" style={btn(overlay === o)} onClick={() => setOverlay(o)}>
              {libelle}
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

        <section className="carte">
          <h3>Action</h3>
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
          {snapshot.stockBrfKg > 1 && (
            <button
              type="button"
              style={btn(mode === "brf")}
              onClick={() => setMode("brf")}
              title="Épandre le tas de broyat là où vous voulez porter la fertilité"
            >
              🍂 Épandre le BRF ({snapshot.stockBrfKg.toFixed(0)} kg)
            </button>
          )}
          <button
            type="button"
            style={btn(mode === "cloturer")}
            onClick={() => setMode("cloturer")}
            title="Enclore une zone : cher au mètre de périmètre, mais le gibier n'y entre plus"
          >
            🚧 Clôturer
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() => game.dispatch({ type: "chasser" })}
            title="Une journée de chasse : la pression recule, puis les voisins comblent le vide"
          >
            🎯 Chasser
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
          {(mode === "chauler" || mode === "faucher" || mode === "brf" || mode === "cloturer") && (
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
        </section>

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
                game.dispatch({
                  type: "couper",
                  treeIds: selectedTrees.map((t) => t.id),
                  devenir: "broyer",
                })
              }
              title="Broyer et charger : le bois rejoint le tas, à épandre où vous voudrez"
            >
              🍂 Couper & broyer (en tas)
            </button>
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

        <section className="carte">
          <h3>La parcelle</h3>
          <dl className="stats">
            <dt>Arbres</dt>
            <dd>
              {snapshot.trees.length} · herbe{" "}
              {(snapshot.fluxes.herbeCouvertureMean * 100).toFixed(0)} % du sol
            </dd>
            <dt>Carbone</dt>
            <dd>
              {snapshot.inventory.vivantTHa.toFixed(1)} t vivant +{" "}
              {snapshot.inventory.humusTHa.toFixed(1)} t humus ·{" "}
              <strong>
                bilan {snapshot.inventory.bilanNetTHa >= 0 ? "+" : ""}
                {snapshot.inventory.bilanNetTHa.toFixed(1)} t C/ha
              </strong>
            </dd>
            <dt>Entourage</dt>
            <dd>
              {snapshot.paysage}
              <span className="detail">
                {" "}
                · gibier {(snapshot.pressionGibier * 100).toFixed(0)} %
              </span>
            </dd>
            <dt>Époque</dt>
            <dd>
              {snapshot.anneeCivile}{" "}
              <span className="detail">· CO₂ {snapshot.co2Ppm.toFixed(0)} ppm</span>
            </dd>
            <dt>Pression</dt>
            <dd>
              broutage {snapshot.fluxes.broutageKg.toFixed(2)} kg/sem · ravageurs{" "}
              {(snapshot.fluxes.ravageurMoyen * 100).toFixed(0)} % · auxiliaires{" "}
              {(snapshot.fluxes.auxiliairesMoyen * 100).toFixed(0)} %
            </dd>
            <dt>Sol</dt>
            <dd>
              P {(snapshot.fluxes.phosphoreMoyenGM2 * 10).toFixed(1)} · K{" "}
              {(snapshot.fluxes.potassiumMoyenGM2 * 10).toFixed(0)} kg/ha assimilables · mycorhizes{" "}
              {(snapshot.fluxes.mycorhizesMoyen * 100).toFixed(0)} %
            </dd>
            {snapshot.fluxes.partInondee > 0 && (
              <>
                <dt>Crue</dt>
                <dd>
                  la nappe affleure sur {(snapshot.fluxes.partInondee * 100).toFixed(0)} % de la
                  parcelle
                </dd>
              </>
            )}
            <dt>Biodiversité</dt>
            <dd>
              <strong>{snapshot.biodiversite.note.toFixed(0)}/100</strong>{" "}
              <span className="detail">
                ({snapshot.biodiversite.richesse} essence
                {snapshot.biodiversite.richesse > 1 ? "s" : ""}, strates{" "}
                {(snapshot.biodiversite.strates * 100).toFixed(0)} %, couvert permanent{" "}
                {(snapshot.biodiversite.couvertPermanent * 100).toFixed(0)} %, bois mort{" "}
                {(snapshot.biodiversite.boisMort * 100).toFixed(0)} %)
              </span>
            </dd>
          </dl>
        </section>

        <section
          className="carte journal"
          style={{ maxHeight: 560, overflowY: "auto", fontSize: 13, flex: 1 }}
        >
          <h3>Journal</h3>
          {game.events.length === 0 && (
            <div style={{ color: "var(--encre-douce)" }}>Rien à signaler pour l'instant.</div>
          )}
          {game.events.map((ev) => (
            <div key={ev.uid} className="entree">
              <span className="quand">
                AN {Math.floor(ev.week / 52) + 1} · S{ev.week % 52}
              </span>{" "}
              {ev.icone} {ev.message}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
