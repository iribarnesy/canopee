/**
 * Le panneau de SÉLECTION : ce que portent les arbres qu'on a cliqués, et les
 * gestes qui ne s'appliquent qu'à eux.
 *
 * Il ne décide plus de son affichage : l'écran l'ouvre quand il y a une
 * sélection, et le referme quand il n'y en a plus.
 */

import { getEspece } from "../../engine/especes";
import type { SnapshotTree } from "../protocol";
import type { GameApi } from "../useGame";
import { btn } from "./styles";

/** Combien d'essences de la sélection reçoivent leurs boutons. */
const ESSENCES_LISTEES = 4;

/** Un bouton qu'on laisse voir mais qu'on ne peut pas presser. */
const ETEINT = { opacity: 0.45, cursor: "not-allowed" } as const;

/**
 * Le bois de cet arbre est-il DÉJÀ dans le pool de bois mort ?
 *
 * **La question du moteur, mot pour mot** (`actions.ts`) : `mortSemaine` est
 * posée au tick qui suit la mort, en même temps que le carbone aérien est
 * versé au bois mort. C'est ELLE et non `chandelle` qui commande — un brûlé de
 * l'année est une chandelle sans `mortSemaine`, son carbone est encore dans
 * l'arbre, et son bois fait donc encore du BRF.
 */
function dejaEnBoisMort(t: SnapshotTree): boolean {
  return t.mortSemaine !== undefined;
}

export function PanneauSelection({
  game,
  vivants,
  tous,
  selectedTrees,
  setSelectedIds,
  suivis,
  basculerSuivi,
}: {
  game: GameApi;
  vivants: readonly SnapshotTree[];
  /**
   * TOUS les arbres, chandelles comprises (#158).
   *
   * `vivants` ne suffisait pas : « + tous les pins » filtrait sur les vivants,
   * si bien qu'une essence entièrement morte rendait une sélection VIDE — et
   * l'encart, qui ne s'affiche que s'il y a une sélection, se fermait au lieu
   * de répondre.
   */
  tous: readonly SnapshotTree[];
  selectedTrees: readonly SnapshotTree[];
  setSelectedIds: (ids: ReadonlySet<number>) => void;
  /** les arbres déjà suivis, pour savoir ce que le bouton doit proposer (#149) */
  suivis: ReadonlySet<number>;
  /** suivre toute la sélection, ou la lâcher si elle l'est déjà */
  basculerSuivi: (ids: Iterable<number>) => void;
}) {
  /**
   * Les essences de la sélection, les plus nombreuses d'abord.
   *
   * **Bornée à quatre, et c'est une mesure et pas une prudence** : une
   * sélection de toutes les chandelles d'un fond de vallon en porte treize,
   * soit vingt-six boutons, et les gestes se retrouvaient poussés hors du
   * volet — on pouvait tout sélectionner et plus rien en faire.
   */
  const selEspeces = [...new Set(selectedTrees.map((t) => t.especeId))].sort(
    (a, b) =>
      selectedTrees.filter((t) => t.especeId === b).length -
      selectedTrees.filter((t) => t.especeId === a).length,
  );
  const essencesMontrees = selEspeces.slice(0, ESSENCES_LISTEES);
  const selFruitsKg = selectedTrees.reduce((s, t) => s + t.fruitsKg, 0);
  const selBoisMort = selectedTrees.filter(dejaEnBoisMort);
  const selVivants = selectedTrees.length - selBoisMort.length;
  /**
   * Ce que le moteur refuse sur du bois mort, dans ses propres termes.
   *
   * Son message de refus énumère ce qui marche : « une chandelle sèche ne fait
   * pas de BRF (il faut du bois frais) — à vendre en chauffage, à coucher au
   * sol, ou à laisser debout ». On ne devine donc pas la règle, on la cite :
   * broyer et épandre sont exclus, vendre et coucher ne le sont pas.
   */
  const queDuBoisMort = selectedTrees.length > 0 && selVivants === 0;
  const tousSuivis = selectedTrees.length > 0 && selectedTrees.every((t) => suivis.has(t.id));
  const chandellesDeLaParcelle = tous.filter(dejaEnBoisMort);

  return (
    <>
      <strong>
        {selectedTrees.length === 1
          ? getEspece(selectedTrees[0]?.especeId ?? "").nom
          : selBoisMort.length === 0
            ? `${selectedTrees.length} arbres sélectionnés`
            : // Compter les deux, parce que ce ne sont pas les mêmes gestes :
              // « 393 chandelles · 12 vivants » et non « 405 arbres ».
              `${selBoisMort.length} chandelle${selBoisMort.length > 1 ? "s" : ""}` +
              (selVivants > 0 ? ` · ${selVivants} vivant${selVivants > 1 ? "s" : ""}` : "")}
      </strong>
      {selectedTrees.length === 1 && selectedTrees[0] && (
        <>
          {" "}
          · {selectedTrees[0].heightM.toFixed(1)} m · {Math.floor(selectedTrees[0].ageWeeks / 52)}{" "}
          ans
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
      {essencesMontrees.map((id) => {
        const vivantsDeLEssence = vivants.filter((t) => t.especeId === id);
        const chandellesDeLEssence = chandellesDeLaParcelle.filter((t) => t.especeId === id);
        const nom = getEspece(id).nom.toLowerCase();
        return (
          <span key={id}>
            {/*
              **Désactivé plutôt que vide (#158).** Ce bouton prenait les
              vivants seuls ; quand toute l'essence est morte, la sélection
              devenait vide et l'encart — qui ne s'affiche que s'il y a une
              sélection — se fermait. Le joueur cliquait « + tous les pins » et
              le panneau disparaissait, sans un mot.
            */}
            <button
              type="button"
              style={{ ...btn(), ...(vivantsDeLEssence.length === 0 ? ETEINT : {}) }}
              disabled={vivantsDeLEssence.length === 0}
              onClick={() => setSelectedIds(new Set(vivantsDeLEssence.map((t) => t.id)))}
              title={
                vivantsDeLEssence.length === 0
                  ? `aucun ${nom} vivant sur la parcelle`
                  : `les ${vivantsDeLEssence.length} ${nom} encore vivants`
              }
            >
              + tous les {nom}s ({vivantsDeLEssence.length})
            </button>
            {chandellesDeLEssence.length > 0 && (
              <button
                type="button"
                style={btn()}
                onClick={() => setSelectedIds(new Set(chandellesDeLEssence.map((t) => t.id)))}
                title="Le bois mort sur pied de cette essence : à vendre en chauffage ou à coucher au sol"
              >
                + les chandelles de {nom} ({chandellesDeLEssence.length})
              </button>
            )}
          </span>
        );
      })}
      {selEspeces.length > essencesMontrees.length && (
        <span style={{ color: "var(--encre-douce)", fontSize: 13 }}>
          … et {selEspeces.length - essencesMontrees.length} autres essences, moins nombreuses.{" "}
        </span>
      )}
      {/*
        La sélection en masse que l'issue demande, et le geste sylvicole qui va
        avec : on prend tout, puis on RETIRE au maj+clic les deux ou trois
        qu'on garde — ce sont elles que le score de biodiversité récompense,
        pour leurs creux et leur bois mort sur pied.
      */}
      {chandellesDeLaParcelle.length > 0 && (
        <button
          type="button"
          style={btn()}
          onClick={() => setSelectedIds(new Set(chandellesDeLaParcelle.map((t) => t.id)))}
          title="Toutes les chandelles de la parcelle — maj+clic pour en retirer celles qu'on garde"
        >
          + toutes les chandelles ({chandellesDeLaParcelle.length})
        </button>
      )}
      <br />
      {/*
        **Suivre, c'est-à-dire ne plus rien rater de ces arbres-là (#149).** Le
        journal de la partie raconte la parcelle ; celui-ci raconte un arbre —
        et sa mort arrête le temps au lieu de se découvrir trois ans plus tard
        en comptant les troncs.
      */}
      <button
        type="button"
        style={btn(tousSuivis)}
        onClick={() => basculerSuivi(selectedTrees.map((t) => t.id))}
        title={
          tousSuivis
            ? "Ne plus suivre : leur journal s'efface et le temps ne s'arrêtera plus pour eux"
            : "Tenir leur journal — gestes, stades, dégâts — et arrêter le temps s'ils meurent"
        }
      >
        {tousSuivis ? "🚫 Ne plus suivre" : "👁 Suivre"}
        {selectedTrees.length > 1 ? ` (${selectedTrees.length})` : ""}
      </button>
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
      {/*
        **Ce qui n'a pas de sens sur du bois mort disparaît (#158).** Un fût
        sec ne fait pas de BRF — le moteur le refuse nommément — et on ne
        protège, n'élague, n'écorce ni ne recèpe un mort. Les laisser visibles
        revenait à proposer cinq gestes dont aucun ne passe, et à répondre par
        cinq refus.
      */}
      {!queDuBoisMort && (
        <>
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
        </>
      )}
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
      {!queDuBoisMort && (
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
      )}
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
      {queDuBoisMort && (
        <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 4 }}>
          Du bois mort sur pied : il se vend en chauffage ou se couche au sol. Pas de BRF — il faut
          du bois frais — et rien à protéger, élaguer ni recéper. <strong>Maj+clic</strong> pour en
          retirer de la sélection : quelques chandelles debout, c'est ce que le score de
          biodiversité récompense.
        </div>
      )}
      {!queDuBoisMort && selBoisMort.length > 0 && (
        <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 4 }}>
          {selBoisMort.length} chandelle{selBoisMort.length > 1 ? "s" : ""} dans la sélection : le
          BRF les refusera (il faut du bois frais), le reste passera.
        </div>
      )}
    </>
  );
}
