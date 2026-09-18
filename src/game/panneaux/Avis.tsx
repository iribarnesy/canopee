/**
 * Les AVIS : ce que la partie a besoin de dire tout de suite — une pause
 * automatique, un geste refusé, une récolte qui attend. Rien de permanent : ce
 * sont des choses qui arrivent, se lisent, et passent. Elles ne sont derrière
 * aucun bouton, justement parce qu'on ne pense pas à aller les chercher.
 */

import { useMemo } from "react";
import type { GameAction } from "../../engine/actions";
import type { SnapshotTree } from "../protocol";
import type { GameApi } from "../useGame";
import { btn, panel } from "./styles";

/**
 * Le nom du geste tel qu'on le dit, pour les refus. Sans cette table, le
 * joueur lisait l'identifiant du code — « ramasserBoisMort », « epandreBrf ».
 */
const NOM_DU_GESTE: Partial<Record<GameAction["type"], string>> = {
  planter: "Planter",
  couper: "Abattre",
  recolter: "Récolter",
  embaucher: "Embaucher",
  licencier: "Licencier",
  chauler: "Chauler",
  leverEcorce: "Cercler l'écorce",
  eclaircir: "Éclaircir",
  elaguer: "Élaguer",
  epandreBrf: "Épandre le broyat",
  trogner: "Trogner",
  chasser: "Chasser",
  cloturer: "Clôturer",
  labourer: "Labourer",
  proteger: "Protéger du gibier",
  receper: "Recéper",
  faucher: "Faucher",
  ramasserBoisMort: "Ramasser le bois mort",
};

export function Avis({ game, vivants }: { game: GameApi; vivants: readonly SnapshotTree[] }) {
  const fruitsPrets = useMemo(() => vivants.filter((t) => t.fruitsKg > 0.5), [vivants]);

  return (
    <>
      {game.notice && <div style={{ ...panel, background: "#f3e6c4" }}>⏸ {game.notice}</div>}
      {game.refusals.length > 0 && (
        <div style={{ ...panel, color: "#8a4b2d" }}>
          {game.refusals.slice(0, 3).map((r) => (
            <div key={r.uid}>
              ⚠ {NOM_DU_GESTE[r.action] ?? r.action} : {r.reason}
            </div>
          ))}
        </div>
      )}
      {fruitsPrets.length > 0 && !game.autoHarvest && (
        <div style={panel}>
          🍎 <strong>{fruitsPrets.reduce((s, t) => s + t.fruitsKg, 0).toFixed(0)} kg</strong> de
          fruits mûrs sur {fruitsPrets.length} arbres.
          <br />
          <button
            type="button"
            style={btn(true)}
            onClick={() =>
              game.dispatch({ type: "recolter", treeIds: fruitsPrets.map((t) => t.id) })
            }
          >
            Tout récolter
          </button>
        </div>
      )}
    </>
  );
}
