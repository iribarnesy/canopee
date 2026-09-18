/**
 * Le JOURNAL : ce que la parcelle a fait pendant qu'on regardait ailleurs.
 */

import type { GameEvent } from "../protocol";
import type { WithUid } from "../useGame";

export function PanneauJournal({ evenements }: { evenements: readonly WithUid<GameEvent>[] }) {
  return (
    <div className="journal" style={{ fontSize: 13 }}>
      {evenements.length === 0 && (
        <div style={{ color: "var(--encre-douce)" }}>Rien à signaler pour l'instant.</div>
      )}
      {evenements.map((ev) => (
        <div key={ev.uid} className="entree">
          <span className="quand">
            AN {Math.floor(ev.week / 52) + 1} · S{ev.week % 52}
          </span>{" "}
          {ev.icone} {ev.message}
        </div>
      ))}
    </div>
  );
}
