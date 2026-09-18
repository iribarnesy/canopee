/**
 * Les AVIS : la pause automatique et les refus du moteur. Rien de permanent —
 * ce sont des choses qui arrivent, se lisent, et passent.
 */

import type { GameAction } from "../../engine/actions";
import type { GameApi } from "../useGame";
import { panel } from "./styles";

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

export function Avis({ game }: { game: GameApi }) {
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
    </>
  );
}
