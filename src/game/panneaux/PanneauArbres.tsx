/**
 * Le volet LES ARBRES : ce que le peuplement est aujourd'hui, et ce qui lui
 * mange dessus. Tout vient de l'instantané du moteur — rien n'est recalculé.
 *
 * Il portait ces lignes dans la même liste que les scores et le sol, parce
 * qu'ils étaient tous dans la même colonne. Ce n'était pas une parenté.
 */

import { useMemo } from "react";
import { LIBELLE_CAUSE } from "../../engine/trees";
import { COULEUR_AUTRES, SPECIES_COLORS } from "../../ui/couleurs";
import type { Snapshot, SnapshotTree } from "../protocol";
import { etatDeLaRecolte } from "../recolteAuto";
import { couleurDeLaPart } from "./fiche";
import { etatDesEssences } from "./recensement";
import { btn } from "./styles";

/**
 * LA LISTE DES ESSENCES : un œil sur toute la parcelle, essence par essence.
 *
 * Le pendant du volet des suivis, à l'autre échelle : là on surveille des
 * individus, ici des POPULATIONS. Sur une parcelle de deux mille huit cents
 * tiges, lire des fiches une par une n'a aucun sens ; savoir que le tiers des
 * noisetiers est étouffé par l'ombre, si.
 *
 * Deux choses à ne pas confondre, et la forme les sépare :
 *
 * - **la couleur de l'essence** est un repère d'identité — la même que la carte
 *   et que le choix des plants. Elle est un LISERÉ au bord de la ligne, comme
 *   dans « qu'est-ce qu'on plante ? », pas une pastille : elle ne dit rien de
 *   l'état, et une pastille ferait croire le contraire ;
 * - **la pastille** est un STATUT : la part de l'essence qui souffre, du vert au
 *   rouge, par la même règle que le point d'alerte d'un arbre suivi.
 */
function ListeDesEssences({
  vivants,
  semees,
  choix,
  surBascule,
  surSelectionner,
}: {
  vivants: readonly SnapshotTree[];
  semees: ReadonlySet<string>;
  choix: Record<string, boolean>;
  surBascule: (especeId: string, actif: boolean) => void;
  surSelectionner: (especeId: string) => void;
}) {
  // Le MÊME recensement que l'éclaircie par essence (#156) : compter deux fois
  // les mêmes tiges finirait par donner deux comptes différents.
  const essences = useMemo(() => etatDesEssences(vivants), [vivants]);
  if (essences.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
      {essences.map((e) => {
        const { active, choisi } = etatDeLaRecolte(e.especeId, semees, choix);
        return (
          <li
            key={e.especeId}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              margin: "4px 0",
              padding: "4px 6px",
              border: "1px solid var(--trait)",
              borderLeft: `6px solid ${SPECIES_COLORS[e.especeId] ?? COULEUR_AUTRES}`,
              borderRadius: 6,
              background: "var(--carte)",
            }}
          >
            <span
              title={
                e.enSouffrance === 0
                  ? "Aucune tige ne souffre d'une peine que le moteur sache nommer."
                  : `${e.enSouffrance} tige${e.enSouffrance > 1 ? "s" : ""} sur ${e.tiges} ${
                      e.enSouffrance > 1 ? "souffrent" : "souffre"
                    }${e.cause ? ` — ${LIBELLE_CAUSE[e.cause]}` : ""}.`
              }
              style={{
                display: "inline-block",
                width: 9,
                height: 9,
                borderRadius: 5,
                flex: "0 0 auto",
                background: couleurDeLaPart(e.part, "hautMauvais"),
              }}
            />
            {/*
              CLIQUER UNE ESSENCE LA SÉLECTIONNE TOUT ENTIÈRE, et c'est ce qui
              rend la liste agissante au lieu d'informative : une fois les
              quarante ronces sélectionnées, tous les gestes de masse du jeu
              s'appliquent — éclaircir, recéper, récolter à la main.
            */}
            <button
              type="button"
              onClick={() => surSelectionner(e.especeId)}
              title={`Sélectionner les ${e.tiges} ${e.nom.toLowerCase()} de la parcelle`}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                border: "none",
                background: "none",
                font: "inherit",
                color: "inherit",
                padding: 0,
                cursor: "pointer",
              }}
            >
              {e.nom}{" "}
              {/*
                LA PART DE LA PARCELLE, et pas seulement le compte. « 308 tiges »
                oblige à diviser de tête ; « 97 % » dit d'un coup que la parcelle
                est un roncier. C'est ce que disait l'ancienne ligne compacte que
                cette liste remplace, et qu'elle ne devait pas perdre en route.
              */}
              <span className="detail">
                <strong>{Math.round((e.tiges / Math.max(1, vivants.length)) * 100)} %</strong> ·{" "}
                {e.tiges} tige{e.tiges > 1 ? "s" : ""} · jusqu'à{" "}
                {e.hauteurMaxM < 10 ? e.hauteurMaxM.toFixed(1) : e.hauteurMaxM.toFixed(0)} m
              </span>
              {e.enSouffrance > 0 && (
                <div className="detail" style={{ fontSize: "0.85em" }}>
                  {e.enSouffrance} {e.enSouffrance > 1 ? "souffrent" : "souffre"}
                  {e.cause ? ` — ${LIBELLE_CAUSE[e.cause]}` : ""}
                </div>
              )}
            </button>
            <button
              type="button"
              style={{ ...btn(active), marginRight: 0, whiteSpace: "nowrap" }}
              onClick={() => surBascule(e.especeId, !active)}
              title={
                active
                  ? choisi
                    ? "cueillie d'office parce que vous l'avez demandé"
                    : "cueillie d'office parce que vous l'avez semée"
                  : choisi
                    ? "laissée sur pied parce que vous l'avez demandé"
                    : "laissée sur pied : vous ne l'avez pas semée"
              }
            >
              {active ? "🧺 cueillie" : "· laissée"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PanneauArbres({
  snapshot,
  vivants,
  recolteAuto,
  reglerRecolteAuto,
  surSelectionnerEssence,
}: {
  snapshot: Snapshot;
  vivants: readonly SnapshotTree[];
  recolteAuto: { semees: string[]; choix: Record<string, boolean> };
  reglerRecolteAuto: (especeId: string, actif: boolean) => void;
  /** sélectionner toutes les tiges d'une essence, pour agir dessus */
  surSelectionnerEssence: (especeId: string) => void;
}) {
  const chandelles = snapshot.trees.length - vivants.length;
  return (
    <dl className="stats">
      <dt>Arbres</dt>
      <dd>
        {vivants.length}
        {chandelles > 0 ? ` + ${chandelles} chandelle${chandelles > 1 ? "s" : ""}` : ""} · herbe{" "}
        {(snapshot.fluxes.herbeCouvertureMean * 100).toFixed(0)} % du sol
      </dd>
      {/*
        UNE SEULE LISTE D'ESSENCES, et pas deux. Ce volet portait au-dessus un
        résumé compact — les cinq premières, en pourcentage — qui disait moins
        que la liste tout en disant la même chose. Deux affichages d'une même
        grandeur divergent le jour où l'un des deux change de règle ; celui-ci
        s'arrêtait d'ailleurs à cinq essences, sans le dire.
      */}
      <dt>Les essences</dt>
      <dd>
        <span className="detail">
          La pastille dit la part de l'essence qui souffre, le liseré est sa couleur — celle de la
          carte et du choix des plants. Le bouton décide de ce qui se cueille tout seul quand le
          temps passe vite : par défaut ce que vous avez semé, le reste se récolte à la main en
          sélectionnant l'arbre.
        </span>
        <ListeDesEssences
          vivants={vivants}
          semees={new Set(recolteAuto.semees)}
          choix={recolteAuto.choix}
          surBascule={reglerRecolteAuto}
          surSelectionner={surSelectionnerEssence}
        />
      </dd>
      <dt>Pression</dt>
      <dd>
        broutage {snapshot.fluxes.broutageKg.toFixed(2)} kg/sem · ravageurs{" "}
        {(snapshot.fluxes.ravageurMoyen * 100).toFixed(0)} % · auxiliaires{" "}
        {(snapshot.fluxes.auxiliairesMoyen * 100).toFixed(0)} %
      </dd>
    </dl>
  );
}
