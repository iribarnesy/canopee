/**
 * Le volet PARTIE : ce qui concerne la partie plutôt que la parcelle — la
 * récolte automatique, la porte de sortie, et comment on pilote la vue.
 */

import type { GameApi } from "../useGame";
import { btn } from "./styles";

export function PanneauMenu({ game }: { game: GameApi }) {
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>
        <label>
          <input
            type="checkbox"
            checked={game.autoHarvest}
            onChange={(e) => game.setAutoHarvest(e.target.checked)}
          />{" "}
          🧺 récolte auto
        </label>
      </p>
      {/*
        La seule porte de sortie : il n'y a plus d'en-tête de site par-dessus le
        jeu. Elle sauvegarde d'abord, et le dit — voir `quit`.
      */}
      <p style={{ margin: "0 0 10px" }}>
        <button type="button" style={btn()} onClick={game.quit}>
          💾 Sauvegarder et quitter
        </button>
      </p>
      <p style={{ margin: 0, color: "var(--encre-douce)", fontSize: 13 }}>
        Glisser pour déplacer · molette pour zoomer · ← → pour tourner d'un quart de tour · maj+clic
        = sélection multiple · Échap referme les volets
      </p>
    </>
  );
}
