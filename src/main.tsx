import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GameView } from "./game/GameView";
import { LabView } from "./lab/LabView";

function Root() {
  const [tab, setTab] = useState<"jeu" | "labo">("jeu");
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 14px",
    marginRight: 8,
    border: "1px solid #b0a58c",
    borderRadius: 4,
    background: active ? "#3d6b3f" : "#f6f4ee",
    color: active ? "#fff" : "#2e2a20",
    cursor: "pointer",
  });
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 990,
        margin: "1.5rem auto",
        color: "#2e2a20",
      }}
    >
      <p>
        <strong style={{ marginRight: 14 }}>Canopée</strong>
        <button type="button" style={tabBtn(tab === "jeu")} onClick={() => setTab("jeu")}>
          Jouer
        </button>
        <button type="button" style={tabBtn(tab === "labo")} onClick={() => setTab("labo")}>
          Labo moteur
        </button>
      </p>
      {tab === "jeu" ? <GameView /> : <LabView />}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("élément #root manquant");
createRoot(root).render(<Root />);
