/**
 * Le laboratoire : voir les mécanismes plutôt que les croire sur parole.
 *
 * Chaque expérience compare deux conduites toutes choses égales par ailleurs
 * et trace une courbe par variante. Ce sont les situations des tests
 * écologiques, mais un test dit « ça passe » ; ici on voit de combien, à
 * partir de quand, et ce que ça coûte.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { App as SondeStation } from "../ui/App";
import { EXPERIENCES, type ResultatExperience } from "./experiences";
import type { DuLabo, VersLabo } from "./worker";

const CADRE = {
  border: "1px solid #d8d3c4",
  borderRadius: 6,
  padding: "12px 14px",
  background: "#fbfaf6",
};

function bouton(actif = false): React.CSSProperties {
  return {
    padding: "4px 10px",
    marginRight: 6,
    marginBottom: 4,
    borderRadius: 4,
    border: "1px solid #b9b3a1",
    background: actif ? "#3f5f3f" : "#fff",
    color: actif ? "#fff" : "#222",
    cursor: "pointer",
  };
}

/** Axe et courbes : un graphe suffit, on ne cherche pas la dataviz. */
function Graphe({ resultat }: { resultat: ResultatExperience }) {
  const L = 620;
  const H = 220;
  // Marge haute suffisante pour que l'étiquette d'une barre au maximum tienne.
  const marge = { g: 52, d: 8, h: 18, b: 26 };
  const toutes = resultat.series.flatMap((s) => s.valeurs);
  const max = Math.max(1e-6, ...toutes);
  const min = Math.min(0, ...toutes);
  const nx = Math.max(1, ...resultat.series.map((s) => s.valeurs.length));
  const x = (i: number) => marge.g + (i / Math.max(1, nx - 1)) * (L - marge.g - marge.d);
  const y = (v: number) => H - marge.b - ((v - min) / (max - min)) * (H - marge.h - marge.b);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${L} ${H}`}
      style={{ display: "block", maxWidth: L }}
      role="img"
      aria-label={resultat.uniteY}
    >
      <title>{resultat.uniteY}</title>
      <line x1={marge.g} y1={y(min)} x2={L - marge.d} y2={y(min)} stroke="#bbb" />
      <line x1={marge.g} y1={marge.h} x2={marge.g} y2={H - marge.b} stroke="#bbb" />
      {[min, (min + max) / 2, max].map((v) => (
        <text key={v} x={marge.g - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#666">
          {v >= 100 ? v.toFixed(0) : v.toFixed(1)}
        </text>
      ))}
      {resultat.forme === "barres"
        ? resultat.series.map((s, i) => {
            const largeur = (L - marge.g - marge.d) / resultat.series.length - 14;
            const gx = marge.g + i * ((L - marge.g - marge.d) / resultat.series.length) + 7;
            const v = s.valeurs[0] ?? 0;
            return (
              <g key={s.nom}>
                <rect x={gx} y={y(v)} width={largeur} height={y(min) - y(v)} fill={s.couleur} />
                <text x={gx + largeur / 2} y={y(v) - 5} textAnchor="middle" fontSize="11">
                  {v.toFixed(0)}
                </text>
                <text
                  x={gx + largeur / 2}
                  y={H - marge.b + 14}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill="#444"
                >
                  {s.nom}
                </text>
              </g>
            );
          })
        : resultat.series.map((s) => (
            <path
              key={s.nom}
              d={s.valeurs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.couleur}
              strokeWidth={2}
            />
          ))}
      {resultat.forme === "courbe" && (
        <text x={L - marge.d} y={H - 6} textAnchor="end" fontSize="10.5" fill="#666">
          {nx} ans
        </text>
      )}
    </svg>
  );
}

export function LabView() {
  const workerRef = useRef<Worker | undefined>(undefined);
  const [resultats, setResultats] = useState<Record<string, ResultatExperience>>({});
  const [enCours, setEnCours] = useState<string | undefined>();
  const [durees, setDurees] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | undefined>();

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("message", (event: MessageEvent<DuLabo>) => {
      const msg = event.data;
      setEnCours(undefined);
      if (msg.type === "erreur") setErreur(msg.message);
      else {
        setResultats((r) => ({ ...r, [msg.resultat.id]: msg.resultat }));
        setDurees((d) => ({ ...d, [msg.resultat.id]: msg.dureeMs }));
      }
    });
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const lancer = useCallback((id: string) => {
    setErreur(undefined);
    setEnCours(id);
    workerRef.current?.postMessage({ type: "executer", id } satisfies VersLabo);
  }, []);

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ color: "#555", marginTop: 0 }}>
        Chaque expérience compare deux conduites <em>toutes choses égales par ailleurs</em> : même
        station, même graine, même météo. Rien n'est mis en scène — ce sont les mêmes situations que
        les tests du moteur, rendues visibles.
      </p>
      {erreur && <p style={{ color: "#b5462f" }}>⚠ {erreur}</p>}
      {EXPERIENCES.map((e) => {
        const resultat = resultats[e.id];
        const duree = durees[e.id];
        return (
          <div key={e.id} style={{ ...CADRE, marginBottom: 14 }}>
            <strong>{e.titre}</strong> — {e.question}
            <p style={{ color: "#555", fontSize: 13, margin: "6px 0 8px" }}>{e.attendu}</p>
            <button
              type="button"
              style={bouton(enCours === e.id)}
              disabled={enCours !== undefined}
              onClick={() => lancer(e.id)}
            >
              {enCours === e.id
                ? "calcul en cours…"
                : resultat
                  ? "relancer"
                  : `lancer (${e.cout === "long" ? "quelques secondes" : "rapide"})`}
            </button>
            {resultat && (
              <>
                <div style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>
                  {resultat.uniteY}
                  {duree !== undefined && ` · calculé en ${(duree / 1000).toFixed(1)} s`}
                </div>
                <Graphe resultat={resultat} />
                {resultat.forme === "courbe" && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {resultat.series.map((s) => (
                      <span key={s.nom} style={{ marginRight: 14, whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 18,
                            height: 3,
                            background: s.couleur,
                            verticalAlign: "middle",
                            marginRight: 5,
                          }}
                        />
                        {s.nom}
                      </span>
                    ))}
                  </div>
                )}
                <p style={{ marginBottom: 0, marginTop: 8 }}>{resultat.verdict}</p>
              </>
            )}
          </div>
        );
      })}
      <details style={{ ...CADRE, marginBottom: 14 }}>
        <summary style={{ cursor: "pointer" }}>
          <strong>Sonde d'une station</strong> — une seule parcelle, semaine par semaine (eau des
          horizons, hauteurs, carte)
        </summary>
        <div style={{ marginTop: 12 }}>
          <SondeStation />
        </div>
      </details>
    </div>
  );
}
