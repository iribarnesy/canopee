/**
 * Modeler le terrain à la main : on peint des altitudes, et l'eau apparaît
 * toute seule pendant qu'on creuse (terrain.ts). C'est le seul endroit de
 * l'interface où l'on voit le moteur répondre en direct — creuser un trou fait
 * naître une mare, la percer jusqu'au bord la vide.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { SoilProfile } from "../engine/soil";
import { eauxDuTerrain } from "../engine/terrain";

type Outil = "creuser" | "monter" | "lisser";

/** Même allure que les boutons du reste de l'écran de départ. */
const styleBouton = (actif: boolean): React.CSSProperties => ({
  padding: "4px 11px",
  border: "1px solid",
  borderColor: actif ? "var(--foret)" : "var(--trait)",
  borderRadius: 6,
  background: actif ? "var(--foret)" : "#fff",
  color: actif ? "#fff" : "var(--encre)",
  cursor: "pointer",
});

export interface TerrainDessine {
  altitudesM: number[];
  coteM: number;
}

const ALTITUDE_BASE = 10;

/** Terrain de départ : un plan incliné doux, sur lequel on modèle. */
export function terrainInitial(coteM: number, pentePct = 0): number[] {
  const alt = new Array<number>(coteM * coteM);
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      alt[y * coteM + x] = ALTITUDE_BASE + ((coteM - y) * pentePct) / 100;
    }
  }
  return alt;
}

/** Couleur hypsométrique : du vert sombre des creux au beige des hauts. */
function couleurAltitude(z: number, min: number, max: number): [number, number, number] {
  const t = max - min < 1e-9 ? 0.5 : (z - min) / (max - min);
  // Vert profond → vert clair → beige : lisible et sans ambiguïté avec l'eau.
  const hue = 105 - 35 * t;
  const sat = 30 - 12 * t;
  const light = 38 + 42 * t;
  return [hue, sat, light];
}

export function EditeurTerrain({
  coteM,
  pluieAnnuelleMm,
  profil,
  valeur,
  onChange,
}: {
  coteM: number;
  pluieAnnuelleMm: number;
  /** profil du sol : c'est lui qui décide si une cuvette tient l'eau */
  profil: SoilProfile;
  valeur: number[] | undefined;
  onChange: (altitudes: number[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [outil, setOutil] = useState<Outil>("creuser");
  const [rayon, setRayon] = useState(6);
  const [force, setForce] = useState(0.4);
  const peintRef = useRef(false);
  const altitudes = useMemo(() => valeur ?? terrainInitial(coteM), [valeur, coteM]);

  // L'eau que ce terrain tient, recalculée à chaque coup de pinceau.
  const eaux = useMemo(
    () => eauxDuTerrain(altitudes, { widthM: coteM, heightM: coteM }, { pluieAnnuelleMm, profil }),
    [altitudes, coteM, pluieAnnuelleMm, profil],
  );

  const cellulesEnEau = eaux.enEau.filter(Boolean).length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const echelle = canvas.width / coteM;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const z of altitudes) {
      min = Math.min(min, z);
      max = Math.max(max, z);
    }
    for (let y = 0; y < coteM; y++) {
      for (let x = 0; x < coteM; x++) {
        const i = y * coteM + x;
        if (eaux.enEau[i]) {
          // Plus c'est profond, plus c'est sombre : on lit le fond de la mare.
          const profondeur = (eaux.niveauM[i] ?? 0) - (altitudes[i] ?? 0);
          const l = 58 - 26 * Math.min(1, profondeur / 1.5);
          ctx.fillStyle = `hsl(203 58% ${l}%)`;
        } else {
          const [h, s, l] = couleurAltitude(altitudes[i] ?? 0, min, max);
          ctx.fillStyle = `hsl(${h} ${s}% ${l}%)`;
        }
        // nord en haut de l'écran, comme la carte de jeu
        ctx.fillRect(
          x * echelle,
          (coteM - 1 - y) * echelle,
          Math.ceil(echelle),
          Math.ceil(echelle),
        );
      }
    }
  }, [altitudes, eaux, coteM]);

  const peindre = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * coteM;
    const cy = coteM - ((e.clientY - rect.top) / rect.height) * coteM;
    const suivant = [...altitudes];
    for (let y = 0; y < coteM; y++) {
      for (let x = 0; x < coteM; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= rayon) continue;
        // Pinceau en cloche : le centre creuse plein pot, le bord effleure.
        const poids = 0.5 * (1 + Math.cos((Math.PI * d) / rayon));
        const i = y * coteM + x;
        const z = suivant[i] ?? 0;
        if (outil === "lisser") {
          // Moyenne du voisinage : efface les marches sans changer le niveau.
          let somme = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= coteM || ny >= coteM) continue;
              somme += altitudes[ny * coteM + nx] ?? 0;
              n++;
            }
          }
          suivant[i] = z + poids * (somme / Math.max(1, n) - z);
        } else {
          suivant[i] = z + (outil === "creuser" ? -1 : 1) * force * poids;
        }
      }
    }
    onChange(suivant);
  };

  return (
    <div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {(
          [
            ["creuser", "⛏ Creuser"],
            ["monter", "⛰ Monter"],
            ["lisser", "🫧 Lisser"],
          ] as const
        ).map(([o, libelle]) => (
          <button
            key={o}
            type="button"
            style={styleBouton(outil === o)}
            onClick={() => setOutil(o)}
          >
            {libelle}
          </button>
        ))}
        <button
          type="button"
          style={styleBouton(false)}
          onClick={() => onChange(terrainInitial(coteM))}
          title="Repartir d'un terrain plat"
        >
          ↺ Aplanir
        </button>
        <button
          type="button"
          style={styleBouton(false)}
          onClick={() => onChange(terrainInitial(coteM, 8))}
          title="Repartir d'un versant régulier descendant vers le sud"
        >
          ⟋ Versant
        </button>
      </div>
      <div className="reglages" style={{ marginBottom: 8 }}>
        <label htmlFor="pinceau">Pinceau</label>
        <input
          id="pinceau"
          type="range"
          min={2}
          max={Math.max(4, Math.round(coteM / 3))}
          step={1}
          value={rayon}
          onChange={(e) => setRayon(Number(e.target.value))}
        />
        <span className="valeur">{rayon} m</span>
        <label htmlFor="forceOutil">Profondeur</label>
        <input
          id="forceOutil"
          type="range"
          min={0.1}
          max={1.5}
          step={0.1}
          value={force}
          onChange={(e) => setForce(Number(e.target.value))}
        />
        <span className="valeur">{force.toFixed(1)} m</span>
      </div>
      <canvas
        ref={canvasRef}
        width={460}
        height={460}
        style={{
          width: "100%",
          maxWidth: 460,
          border: "1px solid var(--trait)",
          borderRadius: 8,
          cursor: "crosshair",
          touchAction: "none",
        }}
        onMouseDown={(e) => {
          peintRef.current = true;
          peindre(e);
        }}
        onMouseMove={(e) => {
          if (peintRef.current) peindre(e);
        }}
        onMouseUp={() => {
          peintRef.current = false;
        }}
        onMouseLeave={() => {
          peintRef.current = false;
        }}
      />
      <p className="glose" style={{ minHeight: 0 }}>
        {cellulesEnEau === 0
          ? "Ce terrain ne retient pas d'eau. Creusez une cuvette fermée — et souvenez-vous qu'un sol sableux la laisse fuir."
          : `${cellulesEnEau} m² d'eau libre : la nappe qui va avec fera le reste.`}
      </p>
    </div>
  );
}
