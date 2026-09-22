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

import type { LigneLue } from "../bilan";
import type { Avancement, Niveau } from "../niveaux";
import { arrondi, libelleDuPalier } from "../niveaux";
import { PanneauBilan } from "./PanneauBilan";
import { btn, panel } from "./styles";

export function FinDeNiveau({
  niveau,
  avancement,
  annees,
  bilan,
  surRejouer,
  surQuitter,
}: {
  niveau: Niveau;
  avancement: Avancement;
  /** années écoulées dans la partie, pour dire en combien de temps */
  annees: number;
  /** ce qui s'est passé pendant le niveau, groupé (#128) */
  bilan: readonly LigneLue[];
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
      <section
        // Plus large qu'avant, et pour une raison qui se voit : les lignes du
        // bilan portent une phrase ET une date, et à 460 px « il manquait 12
        // pommiers » repassait à la ligne au milieu d'un palier.
        style={{
          ...panel,
          maxWidth: 560,
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "18px 22px",
        }}
        aria-label="Fin du niveau"
      >
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

        {/*
          CE QUI S'EST PASSÉ, et pas seulement ce qui a été atteint.

          C'est la demande de #128 autant que celle de #188, et le
          commanditaire a rangé les deux ensemble pour cette raison : « le
          bilan de période et la fin de niveau sont le même écran ». Un palier
          manqué dit DE COMBIEN ; ces lignes-ci disent ce qu'il s'est passé
          pendant qu'on le manquait — trois cents semis levés, cent tiges
          broutées, deux hectares brûlés.

          Elles ne sont pas cliquables ici, et c'est délibéré : la partie est
          finie, il n'y a plus de caméra à envoyer quelque part.
        */}
        <h3 style={{ margin: "14px 0 4px", fontSize: 13 }}>Ce qui s'est passé</h3>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          <PanneauBilan lignes={bilan} quandVide="La parcelle n'a pas bougé." />
        </div>

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
