/**
 * LES ARBRES SUIVIS : un par ligne, avec ce qui leur est arrivé (#149).
 *
 * « Je plante des abricotiers, je veux surveiller très précisément ce qui leur
 * arrive. » Le panneau de sélection dit l'état COURANT d'un arbre ; celui-ci
 * dit son HISTOIRE, accumulée au fil des instantanés, et qui survit à sa mort —
 * c'est même là qu'elle sert le plus.
 *
 * Rien n'est calculé ici : les phrases viennent de `suivis.ts`, qui ne fait que
 * relire ce que le moteur a nommé.
 */

import { getEspece } from "../../engine/especes";
import type { SnapshotTree } from "../protocol";
import type { EvenementSuivi, QuoiSuivi } from "../suivis";
import { btn } from "./styles";

/** Une pastille par sorte d'événement, pour survoler la liste des yeux. */
const ICONE: Record<QuoiSuivi, string> = {
  geste: "✋",
  stade: "📏",
  brout: "🦌",
  frottis: "🦌",
  gel: "❄️",
  souffre: "⚠️",
  mort: "✝️",
};

/** « AN 3 · S12 », comme le journal de la partie. */
function quand(semaine: number): string {
  return `AN ${Math.floor(semaine / 52) + 1} · S${semaine % 52}`;
}

/**
 * Combien d'événements on montre par arbre.
 *
 * Le journal complet est gardé ; c'est l'AFFICHAGE qui est borné. Un arbre
 * suivi cinquante ans finirait par pousser les autres hors de l'écran, et
 * c'est le dernier qui lui est arrivé qu'on vient lire.
 */
const LIGNES_PAR_ARBRE = 6;

export function PanneauSuivis({
  suivis,
  journal,
  tous,
  oublier,
  selectionner,
}: {
  suivis: ReadonlySet<number>;
  journal: readonly EvenementSuivi[];
  /** TOUS les arbres de l'instantané, chandelles comprises : un suivi mort en est une. */
  tous: readonly SnapshotTree[];
  oublier: (id: number) => void;
  selectionner: (id: number) => void;
}) {
  if (suivis.size === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--encre-douce)" }}>
        Personne de suivi pour l'instant. Cliquez un arbre — ou toute une plantation — puis{" "}
        <strong>👁 Suivre</strong> : son journal s'écrit ici, et sa mort arrête le temps.
      </div>
    );
  }
  /**
   * **Ceux à qui il arrive quelque chose d'abord.** Suivre toute une plantation
   * est le cas que l'issue demande, et cent quarante-neuf bouleaux rangés par
   * identifiant mettent celui qui vient de mourir au milieu de la liste — au
   * moment précis où le temps s'est arrêté pour lui. Le journal est déjà trié
   * du plus récent au plus ancien : la place d'un arbre y est donc son rang.
   */
  const rang = new Map<number, number>();
  journal.forEach((e, i) => {
    if (!rang.has(e.idArbre)) rang.set(e.idArbre, i);
  });
  const ordre = [...suivis].sort(
    (a, b) => (rang.get(a) ?? Number.MAX_SAFE_INTEGER) - (rang.get(b) ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "var(--encre-douce)", marginBottom: 6 }}>
        {suivis.size} arbre{suivis.size > 1 ? "s" : ""} suivi{suivis.size > 1 ? "s" : ""} — le temps
        s'arrête quand l'un d'eux meurt.
      </div>
      {ordre.map((id) => {
        const arbre = tous.find((t) => t.id === id);
        // **Rangé par la SEMAINE, pas par l'ordre d'arrivée.** Les deux
        // coïncident presque toujours, et « presque » suffit à faire lire un
        // journal qui saute d'une année à l'autre : relevé à l'écran, un lot
        // de semaine 18 se plaçait devant un lot de semaine 28. Le tri est
        // stable, donc les événements d'un même instantané — qui portent tous
        // sa semaine — gardent l'ordre où le moteur les a nommés.
        const sien = journal.filter((e) => e.idArbre === id).sort((a, b) => b.semaine - a.semaine);
        return (
          <div key={id} style={{ marginBottom: 10 }}>
            <strong>
              {arbre ? getEspece(arbre.especeId).nom : `Arbre n°${id}`}
              {arbre && (
                <span style={{ fontWeight: 400 }}>
                  {" "}
                  · {arbre.heightM.toFixed(1)} m · {Math.floor(arbre.ageWeeks / 52)} ans
                  {arbre.chandelle && " · chandelle"}
                </span>
              )}
              {!arbre && <span style={{ fontWeight: 400 }}> · a quitté la parcelle</span>}
            </strong>{" "}
            {arbre && (
              <button
                type="button"
                style={btn()}
                onClick={() => selectionner(id)}
                title="Le sélectionner pour agir dessus"
              >
                Sélectionner
              </button>
            )}
            <button type="button" style={btn()} onClick={() => oublier(id)}>
              Ne plus suivre
            </button>
            {sien.length === 0 ? (
              <div style={{ color: "var(--encre-douce)" }}>
                Rien ne lui est arrivé depuis qu'on le suit.
              </div>
            ) : (
              <div className="journal">
                {sien.slice(0, LIGNES_PAR_ARBRE).map((e) => (
                  <div key={`${e.semaine}-${e.quoi}-${e.texte}`} className="entree">
                    <span className="quand">{quand(e.semaine)}</span> {ICONE[e.quoi]} {e.texte}
                  </div>
                ))}
                {sien.length > LIGNES_PAR_ARBRE && (
                  <div style={{ color: "var(--encre-douce)" }}>
                    … et {sien.length - LIGNES_PAR_ARBRE} plus anciens
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
