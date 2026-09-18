/**
 * Le volet SOL : le diagnostic que la vue isométrique ne peut pas donner.
 *
 * La carte à plat pour ce qui se répartit — l'eau, le pH, l'azote — et sous
 * elle les grandeurs qui n'ont pas de place où se poser : ce que le sol porte,
 * où est la nappe, ce que l'érosion emporte. Elles vivaient dans le pavé
 * « La parcelle », mêlées au peuplement et aux scores ; c'est ici qu'on les
 * cherche.
 */

import { useEffect, useRef, useState } from "react";
import type { Snapshot, StationInfo } from "../protocol";
import { btn } from "./styles";

type Overlay = "eau" | "ph" | "azote" | "herbe" | "nappe" | "engorgement";

/**
 * Côté de la carte du sol, px.
 *
 * Elle était petite parce qu'elle était affichée en permanence, et qu'il
 * fallait bien lui prendre le moins de place possible. Maintenant qu'on
 * l'ouvre exprès, elle peut être lisible : à 210 px, une parcelle homogène
 * n'était qu'un aplat.
 */
const CARTE_PX = 360;

/**
 * La CARTE DU SOL : une vue de dessus, un pixel par cellule, qui montre ce que
 * la parcelle cache.
 *
 * **Elle ne dessine plus les arbres**, et c'est ce qui lui reste à faire. La
 * parcelle elle-même se voit maintenant en isométrique (`VueParcelle`), où le
 * peuplement se lit comme un peuplement et non comme des taches triées du fond
 * vers l'avant. Ce que la vue isométrique ne peut PAS montrer, c'est le pH, la
 * nappe ou l'azote : ce sont des grandeurs d'un sol qu'on ne voit pas, et une
 * carte à plat reste la bonne forme pour elles — le §5 n'a jamais prétendu
 * qu'un rendu joli remplaçait un diagnostic.
 */
function dessinerCarteDuSol(
  canvas: HTMLCanvasElement,
  snapshot: Snapshot,
  coteM: number,
  ruMm: number,
  overlay: Overlay,
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
        // de portée : c'est la carte qui explique la ripisylve, et celle qui
        // montre la nappe monter après un incendie.
        const prof = Math.min(
          snapshot.soilNappeCm[i] ?? Number.POSITIVE_INFINITY,
          nappeCm?.[i] ?? Number.POSITIVE_INFINITY,
        );
        const proximite = Number.isFinite(prof) ? Math.max(0, 1 - prof / 300) : 0;
        hue = 205;
        sat = 8 + 52 * proximite;
        l = 88 - 40 * proximite;
      } else if (overlay === "engorgement") {
        // Ce que les racines subissent vraiment : la macroporosité noyée. Du
        // beige au violet, parce que ce n'est pas de l'eau disponible — c'est
        // de l'asphyxie.
        const e = Math.min(1, Math.max(0, snapshot.soilEngorgement[i] ?? 0));
        hue = 280;
        sat = 6 + 44 * e;
        l = 90 - 45 * e;
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
  // La clôture : on ne peint pas l'intérieur — ce serait un aplat de plus sur
  // une carte qui en a déjà — on trace le GRILLAGE, c'est-à-dire les côtés de
  // cellules qui séparent le clos du dehors.
  ctx.strokeStyle = "#8a6d3b";
  ctx.lineWidth = Math.max(1.5, scale * 0.22);
  ctx.beginPath();
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      if (!snapshot.soilCloture[y * coteM + x]) continue;
      const gauche = x > 0 ? snapshot.soilCloture[y * coteM + x - 1] : 0;
      const droite = x < coteM - 1 ? snapshot.soilCloture[y * coteM + x + 1] : 0;
      const dessous = y > 0 ? snapshot.soilCloture[(y - 1) * coteM + x] : 0;
      const dessus = y < coteM - 1 ? snapshot.soilCloture[(y + 1) * coteM + x] : 0;
      const px = x * scale;
      const py = (coteM - 1 - y) * scale;
      if (!gauche) {
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + scale);
      }
      if (!droite) {
        ctx.moveTo(px + scale, py);
        ctx.lineTo(px + scale, py + scale);
      }
      if (!dessus) {
        ctx.moveTo(px, py);
        ctx.lineTo(px + scale, py);
      }
      if (!dessous) {
        ctx.moveTo(px, py + scale);
        ctx.lineTo(px + scale, py + scale);
      }
    }
  }
  ctx.stroke();
}

export function CarteDuSol({ snapshot, station }: { snapshot: Snapshot; station: StationInfo }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState<Overlay>("eau");

  useEffect(() => {
    if (canvasRef.current) {
      dessinerCarteDuSol(
        canvasRef.current,
        snapshot,
        station.coteM,
        station.ruMm,
        overlay,
        station.nappeCm,
        station.enEau,
      );
    }
  }, [snapshot, station, overlay]);

  return (
    <>
      {/*
        La carte du sol montre ce que la vue ne peut pas montrer : le pH, la
        nappe, l'azote. Ce sont des grandeurs d'un sol qu'on ne voit pas, et
        une vue jolie ne remplace pas un diagnostic.
      */}
      <canvas
        ref={canvasRef}
        width={CARTE_PX}
        height={CARTE_PX}
        style={{
          width: "100%",
          display: "block",
          border: "1px solid var(--trait)",
          borderRadius: 6,
        }}
      />
      <p style={{ margin: "8px 0 0", color: "var(--encre-douce)", fontSize: 13 }}>
        Nord en haut
        <br />
        {(
          [
            ["eau", "Eau"],
            ["ph", "pH"],
            ["azote", "Azote"],
            ["herbe", "Herbe"],
            ["nappe", "Nappe"],
            ["engorgement", "Engorgement"],
          ] as const
        ).map(([o, libelle]) => (
          <button key={o} type="button" style={btn(overlay === o)} onClick={() => setOverlay(o)}>
            {libelle}
          </button>
        ))}
      </p>

      <dl className="stats" style={{ marginTop: 12 }}>
        <dt>Sol</dt>
        <dd>
          P {(snapshot.fluxes.phosphoreMoyenGM2 * 10).toFixed(1)} · K{" "}
          {(snapshot.fluxes.potassiumMoyenGM2 * 10).toFixed(0)} kg/ha assimilables · mycorhizes{" "}
          {(snapshot.fluxes.mycorhizesMoyen * 100).toFixed(0)} %
        </dd>
        <dt>Nappe</dt>
        <dd>
          à {(snapshot.fluxes.nappeProfondeurCm / 100).toFixed(2)} m sous la surface
          <span className="detail">
            {" "}
            · équilibre régional {(station.nappeEquilibreCm / 100).toFixed(1)} m — la forêt la fait
            descendre en transpirant, un incendie la fait remonter
          </span>
        </dd>
        {snapshot.fluxes.erosionArracheeKgM2 > 0 && (
          <>
            <dt>Érosion</dt>
            <dd>
              {(snapshot.fluxes.erosionArracheeKgM2 * 520).toFixed(1)} t/ha/an arrachées ·{" "}
              <strong>{(snapshot.fluxes.erosionSortieKgM2 * 520).toFixed(1)}</strong> sorties de la
              parcelle
              <span className="detail">
                {" "}
                · avec {(snapshot.fluxes.erosionNKgHa * 52).toFixed(1)} N ·{" "}
                {(snapshot.fluxes.erosionPKgHa * 52).toFixed(2)} P ·{" "}
                {(snapshot.fluxes.erosionKKgHa * 52).toFixed(1)} K kg/ha/an
              </span>
            </dd>
          </>
        )}
        {(snapshot.fluxes.boisSedimentPiegeKgM2 > 0 || snapshot.fluxes.boisRetenueMm > 0) && (
          <>
            <dt>Bois en travers</dt>
            <dd>
              retient <strong>{(snapshot.fluxes.boisRetenueMm * 52).toFixed(0)} mm/an</strong> d'eau
              et{" "}
              {/* En kg et non en tonnes : le bois mort NATUREL barre peu (un
                      chablis repose sur ses branches), et « 0,0 t/ha » ne dirait
                      rien de ce qui se passe. */}
              <strong>
                {(snapshot.fluxes.boisSedimentPiegeKgM2 * 520_000).toFixed(0)} kg/ha/an
              </strong>{" "}
              de terre
              <span className="detail">
                {" "}
                · un tronc couché en travers de la pente met l'eau en flaque, le temps qu'elle
                rentre, et fait déposer derrière lui ce que le ruissellement emportait
              </span>
            </dd>
          </>
        )}
        {snapshot.fluxes.partInondee > 0 && (
          <>
            <dt>Crue</dt>
            <dd>
              la nappe affleure sur {(snapshot.fluxes.partInondee * 100).toFixed(0)} % de la
              parcelle
            </dd>
          </>
        )}
      </dl>
    </>
  );
}
