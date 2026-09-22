/**
 * LA FIN D'UN NIVEAU : ce qui s'est passé, et si l'objectif est atteint (#188).
 *
 * `v1.md` en fait une exigence à part entière, et ajoute pourquoi : le premier
 * public est celui des experts de sol et de biodiversité, et *« un expert du
 * sol qui joue doit pouvoir contester un résultat, donc comprendre d'où il
 * sort »*. Un écran qui dirait « perdu » sans dire quoi ni combien serait donc
 * un défaut de fond, pas de forme.
 *
 * D'où la règle de ce fichier : **chaque ligne porte son chiffre**. Le palier
 * manqué dit de combien, celui qui est tenu dit avec quelle marge, et la raison
 * de la fin est celle que le mécanisme a retenue — jamais une phrase écrite
 * pour faire joli.
 *
 * L'ÉCHEC EST UNE FIN COMME UNE AUTRE, et il n'est pas un reproche : le même
 * écran, le même détail, et de quoi repartir.
 */

import type { Avancement, Niveau } from "../niveaux";
import { arrondi, libelleDuPalier } from "../niveaux";
import { btn, panel } from "./styles";

export function FinDeNiveau({
  niveau,
  avancement,
  annees,
  surRejouer,
  surQuitter,
}: {
  niveau: Niveau;
  avancement: Avancement;
  /** années écoulées dans la partie, pour dire en combien de temps */
  annees: number;
  surRejouer: () => void;
  surQuitter: () => void;
}) {
  const gagne = avancement.issue === "reussi";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(30, 26, 18, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 40,
      }}
    >
      <section style={{ ...panel, maxWidth: 460, padding: "18px 22px" }} aria-label="Fin du niveau">
        <h2 style={{ margin: 0 }}>
          {gagne ? "Objectif atteint" : "Niveau manqué"} — {niveau.nom}
        </h2>
        <p style={{ margin: "6px 0 0", opacity: 0.85 }}>{avancement.raison}</p>

        <ul style={{ margin: "12px 0 0", padding: 0 }}>
          {avancement.paliers.map((ligne) => (
            <li
              key={ligne.palier.id}
              style={{
                listStyle: "none",
                margin: "4px 0",
                display: "flex",
                gap: 8,
                alignItems: "baseline",
              }}
            >
              <span aria-hidden="true">{ligne.atteint ? "✔" : "✘"}</span>
              <span style={{ flex: 1 }}>{libelleDuPalier(ligne)}</span>
              {!ligne.atteint && (
                // DE COMBIEN il s'en est fallu : c'est la seule chose qui
                // permette de savoir si l'on est passé à côté ou très loin.
                <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
                  il manquait {arrondi(Math.max(0, ligne.palier.cible - ligne.valeur))}{" "}
                  {ligne.palier.unite}
                </span>
              )}
            </li>
          ))}
        </ul>

        <p style={{ margin: "12px 0 0", fontSize: "0.9em", opacity: 0.8 }}>
          {annees < 1 ? "Moins d'un an" : `${Math.floor(annees)} ans`} de parcelle.
        </p>

        <div style={{ marginTop: 14 }}>
          <button type="button" style={btn(true)} onClick={surRejouer}>
            ↻ Rejouer le niveau
          </button>
          <button type="button" style={btn()} onClick={surQuitter}>
            ← Revenir à l'accueil
          </button>
        </div>
      </section>
    </div>
  );
}
