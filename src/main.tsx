import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GameView } from "./game/GameView";
import { LabView } from "./lab/LabView";
import { PageModele } from "./modele/PageModele";
import "./ui/theme.css";

function Root() {
  const [tab, setTab] = useState<"jeu" | "modele" | "labo">("jeu");
  /**
   * Une partie tourne-t-elle ? `GameView` le dit, parce que lui seul le sait.
   *
   * Tant qu'aucune partie ne tourne, on est sur l'écran de départ et la
   * coquille du site est là : le titre, et l'accès au labo. Dès qu'une partie
   * commence, tout ça disparaît — la parcelle prend l'écran entier, et l'on en
   * ressort par « sauvegarder et quitter », comme dans un jeu.
   */
  const [enPartie, setEnPartie] = useState(false);
  const pleinEcran = tab === "jeu" && enPartie;

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 14px",
    border: "1px solid",
    borderColor: active ? "var(--foret)" : "var(--trait)",
    borderRadius: 6,
    background: active ? "var(--foret)" : "#fff",
    color: active ? "#fff" : "var(--encre)",
    cursor: "pointer",
  });

  // Hors jeu, une colonne centrée : l'écran de départ et le labo sont des
  // pages à lire. En jeu, on ne contraint plus rien — `GameView` se pose sur
  // toute la fenêtre.
  return (
    <main style={pleinEcran ? {} : { maxWidth: 1160, margin: "1.5rem auto", padding: "0 1rem" }}>
      {!pleinEcran && (
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
          {/*
            LE MODÈLE (#224), entre le jeu et le labo, et pas au bout.

            C'est la question qu'on se pose en arrivant — « qu'est-ce que ça
            simule, au juste ? » — et elle vient avant celle du labo, qui est
            « montre-moi les courbes ». Un visiteur qui n'a pas encore joué doit
            pouvoir y répondre sans lancer une partie ni lire le code.
          */}
          <button type="button" style={tabBtn(tab === "modele")} onClick={() => setTab("modele")}>
            Le modèle
          </button>
          <button type="button" style={tabBtn(tab === "labo")} onClick={() => setTab("labo")}>
            Labo moteur
          </button>
        </header>
      )}
      {/*
        Les vues gardent leur place dans l'arbre d'un rendu à l'autre : un
        `GameView` qui changerait de position serait démonté, et avec lui le
        worker qui porte la partie en cours.

        Changer d'onglet pendant une partie est de toute façon impossible —
        l'en-tête disparaît dès qu'une partie tourne — mais la place reste
        fixe pour que ça le demeure si l'en-tête revenait un jour.
      */}
      {tab === "jeu" && <GameView surPartie={setEnPartie} />}
      {tab === "modele" && <PageModele />}
      {tab === "labo" && <LabView />}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("élément #root manquant");
createRoot(root).render(<Root />);
