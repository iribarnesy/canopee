/**
 * Le volet **partie** : ce qui concerne la partie plutôt que la parcelle — la
 * récolte automatique, la porte de sortie, et comment on pilote la vue.
 */

import type { GameApi } from "../useGame";
import { btn } from "./styles";

export function PanneauMenu({
  game,
  surQuitter,
}: {
  game: GameApi;
  /**
   * Sortir de la partie. Ce n'est plus `game.quit` directement : depuis #148,
   * la partie occupe une entrée d'historique, et la porte de sortie doit la
   * consommer — sinon le bouton retour du navigateur resterait coincé sur un
   * écran qu'on a déjà quitté.
   */
  surQuitter: () => void;
}) {
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
        LA CONSIGNE HORAIRE (#133), et de quoi la lever. Une consigne qu'on ne
        peut pas révoquer n'est pas un choix, c'est un piège : celle-ci
        embauche ou annule des gestes toutes les semaines.
      */}
      {game.politiqueHoraire !== "demander" && (
        <p style={{ margin: "0 0 10px", fontSize: 13 }}>
          Heures supplémentaires :{" "}
          <strong>
            {game.politiqueHoraire === "embaucher"
              ? "on embauche à chaque dépassement"
              : "la semaine est ramenée à 60 h"}
          </strong>{" "}
          <button
            type="button"
            style={btn()}
            onClick={() => game.setPolitiqueHoraire("demander")}
            title="Reposer la question à chaque dépassement"
          >
            ↺ me redemander
          </button>
        </p>
      )}
      {/*
        La seule porte de sortie : il n'y a plus d'en-tête de site par-dessus le
        jeu. Elle sauvegarde d'abord, et le dit — voir `quit`.
      */}
      <p style={{ margin: "0 0 10px" }}>
        <button type="button" style={btn()} onClick={surQuitter}>
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
