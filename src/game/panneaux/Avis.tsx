/**
 * Les **avis** : ce que la partie a besoin de dire tout de suite — une pause
 * automatique, un geste refusé, une récolte qui attend. Rien de permanent : ce
 * sont des choses qui arrivent, se lisent, et passent. Elles ne sont derrière
 * aucun bouton, justement parce qu'on ne pense pas à aller les chercher.
 */

import { type CSSProperties, useMemo, useState } from "react";
import type { GameAction } from "../../engine/actions";
import type { SnapshotTree } from "../protocol";
import type { AvisDuGel } from "../useAvisDuGel";
import type { GameApi } from "../useGame";
import { btn, panel } from "./styles";

/** Le ✕ d'un avis qu'on referme : petit, collé en haut à droite de sa ligne. */
const FERMER: CSSProperties = {
  ...btn(),
  marginRight: 0,
  marginBottom: 0,
  padding: "0 6px",
  alignSelf: "start",
};

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
  voirLesMorts,
  gel,
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
  /**
   * Sélectionner les arbres qu'une mortalité de masse vient de tuer (#401).
   *
   * Absent quand l'avis n'en annonce pas, ou qu'aucun n'est resté debout pour
   * être montré.
   */
  voirLesMorts?: (() => void) | undefined;
  /** La gelée qui commence, et ce qu'elle fait (#355). */
  gel?: AvisDuGel | undefined;
}) {
  const fruitsPrets = useMemo(() => vivants.filter((t) => t.fruitsKg > 0.5), [vivants]);
  /** La case reste cochée d'une facture à l'autre : c'est une intention, pas un clic. */
  const [seSouvenir, setSeSouvenir] = useState(false);

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
          <button
            type="button"
            style={btn(true)}
            onClick={() => game.reglerFacture(true, seSouvenir)}
          >
            🧑‍🌾 Embaucher ({game.facture.eur.toFixed(0)} €)
          </button>
          <button type="button" style={btn()} onClick={() => game.reglerFacture(false, seSouvenir)}>
            ⏱ S'en tenir à 60 h
          </button>
          {/*
            **Se souvenir du choix** : une semaine trop chargée est une
            situation ordinaire dans une partie longue, et reposer la même
            question chaque semaine n'est plus un arbitrage, c'est une corvée.
            La consigne se révoque dans « La partie », et le journal dit à
            chaque fois ce qu'elle a coûté — un automatisme qui dépense en
            silence serait pire que la question.
          */}
          <label style={{ display: "block", marginTop: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={seSouvenir}
              onChange={(e) => setSeSouvenir(e.target.checked)}
            />{" "}
            se souvenir de mon choix pour les semaines suivantes
          </label>
        </div>
      )}
      {game.notice && (
        <div style={{ ...panel, background: "#f3e6c4" }}>
          ⏸ {game.notice}
          {/*
            **Lu, on repart (#359).** La pause coupe un « +1 an » en juin : le
            seul bouton était « revoir », et l'année ne pouvait plus aller à son
            terme qu'en la redemandant — douze mois de plus. « Continuer » mène
            la traversée où elle allait ; sans traversée, une mort suivie qu'on a
            lue se reprend à la vitesse d'avant.
          */}
          {game.enRoute ? (
            <button
              type="button"
              style={{ ...btn(true), marginLeft: 10, marginRight: 0, marginBottom: 0 }}
              onClick={game.continuer}
              title="Reprendre l'avance là où elle s'est arrêtée, jusqu'à son terme"
            >
              ▶ Continuer
            </button>
          ) : (
            game.pauseSurUneMort && (
              <button
                type="button"
                style={{ ...btn(true), marginLeft: 10, marginRight: 0, marginBottom: 0 }}
                onClick={game.basculer}
                title="Reprendre à la vitesse d'avant"
              >
                ▶ Reprendre
              </button>
            )
          )}
          {/*
            **Lesquels** (#401). « 16 arbres meurent d'un coup » se lisait, et
            rien ne disait où : le joueur cherchait des chandelles parmi des
            centaines de tiges. Le bouton les sélectionne — la surbrillance les
            allume sur la parcelle, et le volet de sélection dit ce qu'on peut
            faire de ce bois. Posé sur l'avis pour la même raison que le
            rejeu : c'est là que le regard est quand on se le demande.
          */}
          {voirLesMorts && (
            <button
              type="button"
              style={{ ...btn(false), marginLeft: 10, marginRight: 0, marginBottom: 0 }}
              onClick={voirLesMorts}
              title="Sélectionner les arbres morts : ils s'éclairent sur la parcelle"
            >
              👁 Les voir
            </button>
          )}
          {/*
            REVOIR — UN SEUL BOUTON, celui qui montre le plus (#401).

            Il y en avait deux côte à côte — le retour de jeu les cite
            ensemble, sans voir ce qui les sépare — pour deux rejeux dont l'un
            contient l'autre. « ▶ revoir » rejoue l'ELLIPSE de l'instantané
            (#157) — à
            ×52, vingt-six semaines rangées dans deux secondes et demie, où la
            catastrophe est un acte parmi quarante ; « ↺ Revoir la scène »
            (#128, §6.8) REMBOBINE jusqu'au dernier instantané montré et rejoue
            à ×1 — la scène s'y déroule au lieu d'y être résumée, et tout ce que
            l'ellipse aurait montré s'y joue aussi, semaine par semaine. C'est
            ce que le §6.8 demande d'une catastrophe : « on repasse en temps
            réel, ce sont les moments où le joueur doit voir se dérouler, pas
            résumer ».

            Le second contient donc le premier : quand la pause porte une
            scène, il est seul. « ▶ revoir » reste pour les pauses qui n'en
            ont pas — une mort suivie, l'arrivée d'un « +1 an » — où l'ellipse
            est tout ce qu'il y a à rejouer, et où un bouton qui ne rejoue rien
            serait pire qu'un bouton absent. Pendant que la scène se rejoue,
            ni l'un ni l'autre : on est déjà en train de la revoir.
          */}
          {game.sceneARevoir !== undefined
            ? game.rembobinage.enCours === undefined && (
                <button
                  type="button"
                  style={{ ...btn(true), marginLeft: 10, marginRight: 0, marginBottom: 0 }}
                  onClick={() => {
                    const depuis = game.sceneARevoir;
                    if (depuis !== undefined) game.rembobinage.revoir(depuis, 1);
                  }}
                  title="Revenir juste avant, et rejouer au ralenti"
                >
                  ↺ Revoir la scène
                </button>
              )
            : rejouer && (
                <button
                  type="button"
                  style={{ ...btn(false), marginLeft: 10, marginRight: 0, marginBottom: 0 }}
                  onClick={rejouer}
                  title="Rejouer l'animation de la semaine"
                >
                  ▶ revoir
                </button>
              )}
          {/*
            **Refuser l'interruption, là où elle arrive** (#359). On ne va pas
            chercher un réglage dans un menu au moment où il agace : la case est
            sur l'avis. Elle se décoche dans « La partie » et dans le volet des
            suivis, où la mort reste notée avec son 🔔.
          */}
          {game.pauseSurUneMort && (
            <label style={{ display: "block", marginTop: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!game.arretSurLesMorts}
                onChange={(e) => game.setArretSurLesMorts(!e.target.checked)}
              />{" "}
              ne plus m'interrompre quand un arbre suivi meurt
            </label>
          )}
        </div>
      )}
      {/*
        **La gelée se dit** (#355) : une ligne, la semaine où elle commence, sans
        arrêter le temps — elle ne demande rien au joueur, elle explique ce qu'il
        voit blanchir.
      */}
      {gel && (
        <div style={{ ...panel, background: "#eef3f8", display: "flex", gap: 8 }}>
          <span style={{ flex: 1 }}>❄️ {gel.texte}</span>
          <button
            type="button"
            style={FERMER}
            onClick={gel.fermer}
            title="Fermer jusqu'à la prochaine gelée"
          >
            ✕
          </button>
        </div>
      )}
      {/*
        **Les refus passent** (#402) : chacun s'efface seul après quelques
        secondes, les identiques font une ligne avec leur compte, et le ✕ les
        efface tous d'un coup — on a lu, on veut voir la parcelle.
      */}
      {game.refusals.length > 0 && (
        <div style={{ ...panel, color: "#8a4b2d", display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            {game.refusals.map((r) => (
              <div key={r.cle}>
                ⚠ {NOM_DU_GESTE[r.action] ?? r.action} : {r.reason}
                {r.fois > 1 && <strong> ×{r.fois}</strong>}
              </div>
            ))}
          </div>
          <button
            type="button"
            style={FERMER}
            onClick={game.fermerLesRefus}
            title="Effacer ces refus"
          >
            ✕
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
