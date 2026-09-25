import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GameView } from "./game/GameView";
import { LabView } from "./lab/LabView";
import { PageModele } from "./modele/PageModele";
import { hashDeLOnglet, type Onglet, ongletDeLUrl, TITRE } from "./onglets";
import "./ui/theme.css";

function Root() {
  /**
   * **L'onglet vient de l'URL**, pour qu'un lien mène où il dit (#224).
   *
   * Lu à l'ouverture, réécrit à chaque clic, et suivi ensuite : changer
   * d'onglet pose une entrée d'historique, donc le bouton « retour » du
   * navigateur ramène à l'onglet précédent, ce qu'on attend d'un site.
   */
  const [tab, setTab] = useState<Onglet>(() =>
    typeof window === "undefined" ? "jeu" : ongletDeLUrl(window.location.hash),
  );
  useEffect(() => {
    const suivre = () => setTab(ongletDeLUrl(window.location.hash));
    window.addEventListener("hashchange", suivre);
    return () => window.removeEventListener("hashchange", suivre);
  }, []);
  // Le titre suit l'onglet : c'est ce que montrent l'onglet du navigateur et
  // l'aperçu d'un lien partagé.
  useEffect(() => {
    document.title = TITRE[tab];
  }, [tab]);
  /**
   * Aller à un onglet **par l'URL**, et se laisser ramener par `hashchange`.
   *
   * Poser l'état ici en plus serait une seconde copie de la même grandeur : le
   * jour où l'une des deux ne serait pas mise à jour, l'écran et l'adresse
   * diraient deux choses différentes. L'URL décide, l'état suit.
   */
  const allerA = (onglet: Onglet) => {
    const cible = hashDeLOnglet(onglet);
    if (cible === window.location.hash) return;
    // Un hash vide ne s'écrit pas avec `location.hash = ""` — ça laisse un
    // « # » orphelin dans la barre d'adresse. `pushState` rend l'adresse nue,
    // et `hashchange` ne se déclenchant pas dessus, on pose l'état à la main.
    if (cible === "") {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
      setTab(onglet);
    } else {
      window.location.hash = cible;
    }
  };
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
          <button type="button" style={tabBtn(tab === "jeu")} onClick={() => allerA("jeu")}>
            Jouer
          </button>
          {/*
            LE MODÈLE (#224), entre le jeu et le labo, et pas au bout.

            C'est la question qu'on se pose en arrivant — « qu'est-ce que ça
            simule, au juste ? » — et elle vient avant celle du labo, qui est
            « montre-moi les courbes ». Un visiteur qui n'a pas encore joué doit
            pouvoir y répondre sans lancer une partie ni lire le code.
          */}
          <button type="button" style={tabBtn(tab === "modele")} onClick={() => allerA("modele")}>
            Le modèle
          </button>
          <button type="button" style={tabBtn(tab === "labo")} onClick={() => allerA("labo")}>
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
