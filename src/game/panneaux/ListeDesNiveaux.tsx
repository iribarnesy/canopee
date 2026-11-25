/**
 * **Les niveaux, à l'accueil** : lesquels sont faits, lequel vient, lesquels
 * attendent (#506).
 *
 * La liste disait les niveaux sans dire où l'on en était : on revenait d'un
 * niveau réussi devant le même bouton qu'avant de l'avoir joué. Chaque ligne
 * porte maintenant sa place, que `progression.ts` décide :
 *
 * - **réussi** : coché, et il se rejoue ;
 * - **le prochain** : mis en avant — c'est lui qu'on vient chercher ;
 * - **verrouillé** : grisé, et il dit **quoi réussir** pour l'ouvrir. Un bouton
 *   gris qui ne dirait pas pourquoi serait une porte fermée sans serrure.
 *
 * Un niveau verrouillé reste dans la liste, énoncé compris : savoir ce qui vient
 * fait partie de ce qui donne envie d'y aller.
 */

import type { Niveau } from "../niveaux";
import { type EtatALAccueil, placesDesNiveaux } from "../progression";

/** Le signe en tête de ligne, et le mot qui le suit. */
const MARQUE: Record<EtatALAccueil, { signe: string; mot?: string }> = {
  reussi: { signe: "✓", mot: "réussi" },
  prochain: { signe: "▶", mot: "à faire" },
  ouvert: { signe: "▶" },
  verrouille: { signe: "🔒" },
};

export function ListeDesNiveaux({
  niveaux,
  reussis,
  surNiveau,
}: {
  niveaux: readonly Niveau[];
  reussis: ReadonlySet<string>;
  surNiveau: (niveau: Niveau) => void;
}) {
  return (
    <>
      {placesDesNiveaux(niveaux, reussis).map(({ niveau, etat, requis }, i) => {
        const verrouille = etat === "verrouille";
        const enAvant = etat === "prochain";
        const { signe, mot } = MARQUE[etat];
        return (
          <button
            key={niveau.id}
            type="button"
            // **Désactivé, et pas seulement gris** : un clic sur un niveau
            // verrouillé ne doit rien lancer, même au clavier. Le gris vient de
            // la règle commune des boutons désactivés (`theme.css`).
            disabled={verrouille}
            onClick={() => surNiveau(niveau)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginTop: 8,
              padding: "10px 12px",
              borderStyle: "solid",
              borderWidth: "1px 1px 1px 6px",
              borderRadius: 8,
              // Le prochain porte la couleur de la forêt sur tout son tour et
              // un fond pâle ; un niveau fait garde le liseré, plus discret.
              borderColor: enAvant ? "var(--foret)" : "var(--trait)",
              borderLeftColor: verrouille ? "var(--trait)" : "var(--foret)",
              background: enAvant ? "var(--foret-pale)" : "var(--carte)",
              cursor: verrouille ? "not-allowed" : "pointer",
              font: "inherit",
            }}
          >
            <strong>
              <span aria-hidden="true">{signe}</span> {i + 1}. {niveau.nom}
            </strong>
            {mot && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  color: etat === "reussi" ? "var(--foret)" : "var(--encre-douce)",
                }}
              >
                — {mot}
              </span>
            )}
            <div className="sous" style={{ marginTop: 2 }}>
              {niveau.enonce}
            </div>
            {verrouille && requis && (
              <div className="sous" style={{ marginTop: 2, fontStyle: "italic" }}>
                Réussir « {requis.nom} » pour l'ouvrir.
              </div>
            )}
          </button>
        );
      })}
    </>
  );
}
