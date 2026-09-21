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

export function Avis({
  game,
  vivants,
  rejouer,
}: {
  game: GameApi;
  vivants: readonly SnapshotTree[];
  /**
   * Rejouer l'ellipse de la semaine, s'il y a quelque chose à revoir (#157).
   *
   * Absent quand la semaine n'a rien à montrer : un bouton « revoir » qui ne
   * rejoue rien est pire qu'un bouton absent.
   */
  rejouer?: (() => void) | undefined;
}) {
  const fruitsPrets = useMemo(() => vivants.filter((t) => t.fruitsKg > 0.5), [vivants]);

  return (
    <>
      {/*
        LA FACTURE HORAIRE (#133) — une QUESTION, pas un avis : le temps est
        arrêté et ne repartira qu'avec la réponse. Elle passe donc devant le
        reste, et dit ce qu'on perd dans les deux cas, y compris lesquels : le
        joueur doit pouvoir choisir, pas découvrir.
      */}
      {game.facture && (
        <div style={{ ...panel, background: "#f3e6c4", border: "1px solid var(--foret)" }}>
          <strong>⏱ {game.facture.heures.toFixed(0)} h au-delà des 60 h de la semaine</strong>
          <div style={{ fontSize: 13, margin: "4px 0 8px" }}>
            Il faudrait {game.facture.embauches} saisonnier
            {game.facture.embauches > 1 ? "s" : ""} pour les couvrir, soit{" "}
            <strong>{game.facture.eur.toFixed(0)} €</strong> — payés pour des heures déjà faites.
            Sinon, la semaine est ramenée à 60 h et{" "}
            {game.facture.gestesAnnules > 0
              ? `les ${game.facture.gestesAnnules} derniers gestes posés sont annulés`
              : "rien n'est perdu"}
            .
          </div>
          <button type="button" style={btn(true)} onClick={() => game.reglerFacture(true)}>
            🧑‍🌾 Embaucher ({game.facture.eur.toFixed(0)} €)
          </button>
          <button type="button" style={btn()} onClick={() => game.reglerFacture(false)}>
            ⏱ S'en tenir à 60 h
          </button>
        </div>
      )}
      {game.notice && (
        <div style={{ ...panel, background: "#f3e6c4" }}>
          ⏸ {game.notice}
          {/*
            **Le bouton qui répond à « on ne voit pas l'incendie » (#157).**
            L'ellipse se joue une fois, à l'instant précis où ce bandeau
            apparaît — donc au moment où le joueur lit le bandeau et pas la
            parcelle. Allonger l'acte ne suffisait pas : le défaut n'est pas sa
            durée, c'est qu'il n'a lieu qu'une fois. Il est POSÉ SUR L'AVIS et
            non dans le journal, parce que c'est là que le regard est.
          */}
          {rejouer && (
            <button
              type="button"
              style={{ ...btn(false), marginLeft: 10, marginRight: 0, marginBottom: 0 }}
              onClick={rejouer}
              title="Rejouer l'animation de la semaine"
            >
              ▶ revoir
            </button>
          )}
        </div>
      )}
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
