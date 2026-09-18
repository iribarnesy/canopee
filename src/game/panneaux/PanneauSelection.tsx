/**
 * Le panneau de SÉLECTION : ce que portent les arbres qu'on a cliqués, et les
 * gestes qui ne s'appliquent qu'à eux.
 */

import { useMemo } from "react";
import { getEspece } from "../../engine/especes";
import type { SnapshotTree } from "../protocol";
import type { GameApi } from "../useGame";
import { btn, panel } from "./styles";

export function PanneauSelection({
  game,
  vivants,
  selectedTrees,
  setSelectedIds,
}: {
  game: GameApi;
  vivants: readonly SnapshotTree[];
  selectedTrees: readonly SnapshotTree[];
  setSelectedIds: (ids: ReadonlySet<number>) => void;
}) {
  const fruitsPrets = useMemo(() => vivants.filter((t) => t.fruitsKg > 0.5), [vivants]);
  const selEspeces = [...new Set(selectedTrees.map((t) => t.especeId))];
  const selFruitsKg = selectedTrees.reduce((s, t) => s + t.fruitsKg, 0);

  return (
    <>
      {selectedTrees.length > 0 && (
        <div style={panel}>
          <strong>
            {selectedTrees.length === 1
              ? getEspece(selectedTrees[0]?.especeId ?? "").nom
              : `${selectedTrees.length} arbres sélectionnés`}
          </strong>
          {selectedTrees.length === 1 && selectedTrees[0] && (
            <>
              {" "}
              · {selectedTrees[0].heightM.toFixed(1)} m ·{" "}
              {Math.floor(selectedTrees[0].ageWeeks / 52)} ans
              {/* Le dire, sinon on lit l'âge et le stress d'un arbre mort
                    comme ceux d'un vivant, et on s'étonne qu'aucun geste ne
                    marche dessus : le moteur les refuse tous, à raison. */}
              {selectedTrees[0].chandelle && " · chandelle (bois mort sur pied)"}
              {!selectedTrees[0].chandelle &&
                selectedTrees[0].stress > 1 &&
                ` · stress ${selectedTrees[0].stress.toFixed(0)}/10`}
              {selectedTrees[0].hauteurElagueeM > 0 &&
                ` · bille ${selectedTrees[0].hauteurElagueeM.toFixed(1)} m`}
            </>
          )}
          {selFruitsKg > 0.5 && <> · 🍎 {selFruitsKg.toFixed(0)} kg mûrs</>}
          <br />
          {selEspeces.map((id) => (
            <button
              key={id}
              type="button"
              style={btn()}
              onClick={() =>
                setSelectedIds(
                  // Les vivants seuls : on sélectionne une essence pour lui
                  // faire quelque chose, et le moteur refuse tout geste sur
                  // une chandelle.
                  new Set(vivants.filter((t) => t.especeId === id).map((t) => t.id)),
                )
              }
            >
              + tous les {getEspece(id).nom.toLowerCase()}s
            </button>
          ))}
          <br />
          {selFruitsKg > 0.5 && (
            <button
              type="button"
              style={btn(true)}
              onClick={() =>
                game.dispatch({ type: "recolter", treeIds: selectedTrees.map((t) => t.id) })
              }
            >
              🧺 Récolter
            </button>
          )}
          <button
            type="button"
            style={btn()}
            onClick={() =>
              game.dispatch({
                type: "couper",
                treeIds: selectedTrees.map((t) => t.id),
                devenir: "broyer",
              })
            }
            title="Broyer et charger : le bois rejoint le tas, à épandre où vous voudrez"
          >
            🍂 Couper & broyer (en tas)
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() =>
              game.dispatch({ type: "proteger", treeIds: selectedTrees.map((t) => t.id) })
            }
            title="Poser un manchon : le plant échappe aux dents jusqu'à ce qu'il ait sa flèche hors d'atteinte"
          >
            🛡️ Protéger
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() =>
              game.dispatch({ type: "leverEcorce", treeIds: selectedTrees.map((t) => t.id) })
            }
            title="Lever le liège : une récolte qui ne tue pas l'arbre et revient tous les dix ans"
          >
            🟤 Lever l'écorce
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() =>
              game.dispatch({
                type: "elaguer",
                treeIds: selectedTrees.map((t) => t.id),
                hauteurM: 6,
              })
            }
            title="Couper les branches basses des arbres sélectionnés, qui restent debout : la bille montée fera du bois d'œuvre au lieu du chauffage. Le houppier remonte, on le voit sur la carte — et un houppier haut ne s'enflamme plus d'un feu rampant, ce qui fait de l'élagage une mesure de prévention."
          >
            ✂️ Élaguer à 6 m
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() =>
              game.dispatch({ type: "receper", treeIds: selectedTrees.map((t) => t.id) })
            }
            title="Couper au ras : la souche repart en cépée (taillis). Seules les espèces qui rejettent le supportent."
          >
            🪵 Recéper
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() => {
              game.dispatch({
                type: "couper",
                treeIds: selectedTrees.map((t) => t.id),
                devenir: "vendre",
              });
              setSelectedIds(new Set());
            }}
          >
            🪓 Couper &amp; vendre
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() => {
              game.dispatch({
                type: "couper",
                treeIds: selectedTrees.map((t) => t.id),
                devenir: "epandre",
              });
              setSelectedIds(new Set());
            }}
          >
            🪓 Couper &amp; épandre (BRF)
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() => {
              game.dispatch({
                type: "couper",
                treeIds: selectedTrees.map((t) => t.id),
                devenir: "laisser",
              });
              setSelectedIds(new Set());
            }}
            title="Abattre et coucher le fût en travers de la pente : rien ne rentre en caisse, mais l'eau ralentit et la terre se dépose derrière le tronc"
          >
            🪵 Couper &amp; coucher en travers
          </button>
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
