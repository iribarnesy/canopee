import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GameView } from "./game/GameView";
import { LabView } from "./lab/LabView";
import "./ui/theme.css";

function Root() {
  const [tab, setTab] = useState<"jeu" | "labo">("jeu");
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 14px",
    border: "1px solid",
    borderColor: active ? "var(--foret)" : "var(--trait)",
    borderRadius: 6,
    background: active ? "var(--foret)" : "#fff",
    color: active ? "#fff" : "var(--encre)",
    cursor: "pointer",
  });
  return (
    <main style={{ maxWidth: 990, margin: "1.5rem auto", padding: "0 1rem" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          borderBottom: "1px solid var(--trait)",
          paddingBottom: 10,
          marginBottom: 18,
        }}
      >
        <strong style={{ fontSize: "1.35rem", letterSpacing: "0.02em" }}>Canopée</strong>
        <span style={{ flex: 1, fontSize: 13, color: "var(--encre-douce)" }}>
          agroforesterie tempérée, une semaine à la fois
        </span>
        <button type="button" style={tabBtn(tab === "jeu")} onClick={() => setTab("jeu")}>
          Jouer
        </button>
        <button type="button" style={tabBtn(tab === "labo")} onClick={() => setTab("labo")}>
          Labo moteur
        </button>
      </header>
      {tab === "jeu" ? <GameView /> : <LabView />}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("élément #root manquant");
createRoot(root).render(<Root />);
