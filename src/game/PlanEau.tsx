/**
 * Poser l'eau à la souris.
 *
 * Régler une mare avec trois curseurs — rayon, position est-ouest, position
 * sud-nord — demande de se représenter mentalement ce qu'on est en train de
 * décrire ; et pour un ruisseau, choisir un côté dans une liste de quatre mots
 * est encore pire. On montre donc la parcelle, et on clique dessus.
 */

import { useEffect, useRef } from "react";
import type { CoteParcelle, EauDeSurface } from "../engine/eau_surface";

const TAILLE_PX = 190;

/** Le côté dont on est le plus proche, pour poser un ruisseau. */
function coteLePlusProche(xRel: number, yRel: number): CoteParcelle {
  const distances: [CoteParcelle, number][] = [
    ["ouest", xRel],
    ["est", 1 - xRel],
    ["sud", yRel],
    ["nord", 1 - yRel],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]?.[0] ?? "sud";
}

export function PlanEau({
  eau,
  coteM,
  onChange,
}: {
  eau: EauDeSurface;
  coteM: number;
  onChange: (eau: EauDeSurface) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const t = TAILLE_PX;
    ctx.clearRect(0, 0, t, t);
    // La parcelle, vue du dessus, nord en haut.
    ctx.fillStyle = "#e8efe6";
    ctx.fillRect(0, 0, t, t);
    ctx.strokeStyle = "#b9cbb4";
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo((k * t) / 4, 0);
      ctx.lineTo((k * t) / 4, t);
      ctx.moveTo(0, (k * t) / 4);
      ctx.lineTo(t, (k * t) / 4);
      ctx.stroke();
    }
    ctx.fillStyle = "#2f86c5";
    if (eau.type === "mare") {
      const cx = (eau.xRel ?? 0.5) * t;
      // yRel se compte depuis le sud, l'écran depuis le nord.
      const cy = (1 - (eau.yRel ?? 0.5)) * t;
      const r = Math.max(3, ((eau.rayonM ?? 4) / coteM) * t);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fill();
    } else if (eau.type === "ruisseau") {
      const epaisseur = Math.max(4, t / 22);
      const cote = eau.cote ?? "sud";
      if (cote === "sud") ctx.fillRect(0, t - epaisseur, t, epaisseur);
      if (cote === "nord") ctx.fillRect(0, 0, t, epaisseur);
      if (cote === "ouest") ctx.fillRect(0, 0, epaisseur, t);
      if (cote === "est") ctx.fillRect(t - epaisseur, 0, epaisseur, t);
    }
    ctx.strokeStyle = "#8aa383";
    ctx.strokeRect(0.5, 0.5, t - 1, t - 1);
  }, [eau, coteM]);

  const poser = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const yRel = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    if (eau.type === "mare") onChange({ ...eau, xRel, yRel });
    else if (eau.type === "ruisseau") onChange({ ...eau, cote: coteLePlusProche(xRel, yRel) });
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 10 }}>
      <canvas
        ref={ref}
        width={TAILLE_PX}
        height={TAILLE_PX}
        style={{
          width: TAILLE_PX,
          border: "1px solid var(--trait)",
          borderRadius: 8,
          cursor: "crosshair",
          boxShadow: "var(--ombre)",
        }}
        onClick={poser}
      />
      <p style={{ margin: 0, fontSize: 13, color: "var(--encre-douce)", maxWidth: 260 }}>
        {eau.type === "mare"
          ? "Cliquez où creuser la mare. Nord en haut, comme sur la carte de jeu."
          : "Cliquez du côté par lequel le ruisseau passe."}
      </p>
    </div>
  );
}
