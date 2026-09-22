/**
 * Le volet LES ARBRES : ce que le peuplement est aujourd'hui, et ce qui lui
 * mange dessus. Tout vient de l'instantané du moteur — rien n'est recalculé.
 *
 * Il portait ces lignes dans la même liste que les scores et le sol, parce
 * qu'ils étaient tous dans la même colonne. Ce n'était pas une parenté.
 */

import { Fragment, useMemo } from "react";
import { getEspece } from "../../engine/especes";
import { COULEUR_AUTRES, SPECIES_COLORS } from "../../ui/couleurs";
import type { Snapshot, SnapshotTree } from "../protocol";
import { etatDeLaRecolte } from "../recolteAuto";
import { essencesPresentes } from "./recensement";
import { btn } from "./styles";

/**
 * LA LISTE DES ESSENCES, ET CE QU'ON CUEILLE D'OFFICE.
 *
 * La récolte automatique se limitait à ce que le joueur avait semé — c'était
 * mieux que de ramasser la friche à cent cinquante heures la semaine, mais
 * c'était encore une règle QU'IL SUBISSAIT. Ici il la voit et il la change,
 * essence par essence.
 *
 * La pastille dit l'état, et le point qui la suit dit d'où il vient : allumée
 * parce qu'on l'a semée, ou parce qu'on l'a demandé. La distinction compte —
 * une décision explicite survit à une plantation ultérieure, un défaut non.
 */
function ListeDesEssences({
  vivants,
  semees,
  choix,
  surBascule,
}: {
  vivants: readonly SnapshotTree[];
  semees: ReadonlySet<string>;
  choix: Record<string, boolean>;
  surBascule: (especeId: string, actif: boolean) => void;
}) {
  // Le MÊME recensement que l'éclaircie par essence (#156) : compter deux fois
  // les mêmes tiges finirait par donner deux comptes différents.
  const presentes = useMemo(() => essencesPresentes(vivants, undefined), [vivants]);
  if (presentes.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
      {presentes.map((e) => {
        const { active, choisi } = etatDeLaRecolte(e.especeId, semees, choix);
        return (
          <li
            key={e.especeId}
            style={{ display: "flex", gap: 8, alignItems: "center", margin: "3px 0" }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 3,
                flex: "0 0 auto",
                background: SPECIES_COLORS[e.especeId] ?? COULEUR_AUTRES,
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              {e.nom}{" "}
              <span className="detail">
                {e.tiges} tige{e.tiges > 1 ? "s" : ""} ·{" "}
                {e.hauteurMaxM < 10 ? e.hauteurMaxM.toFixed(1) : e.hauteurMaxM.toFixed(0)} m
              </span>
            </span>
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
}: {
  snapshot: Snapshot;
  vivants: readonly SnapshotTree[];
  recolteAuto: { semees: string[]; choix: Record<string, boolean> };
  reglerRecolteAuto: (especeId: string, actif: boolean) => void;
}) {
  const chandelles = snapshot.trees.length - vivants.length;
  /**
   * Qui domine la parcelle, en direct. On classe par NOMBRE de tiges et on
   * montre la hauteur du plus grand : une essence peut être partout en
   * sous-étage sans jamais atteindre la canopée, et c'est une information
   * différente de « qui occupe le terrain ».
   */
  const composition = useMemo(() => {
    if (vivants.length === 0) return [];
    const parEspece = new Map<string, { n: number; hauteurMax: number }>();
    for (const t of vivants) {
      const agg = parEspece.get(t.especeId) ?? { n: 0, hauteurMax: 0 };
      agg.n++;
      agg.hauteurMax = Math.max(agg.hauteurMax, t.heightM);
      parEspece.set(t.especeId, agg);
    }
    const total = vivants.length;
    return [...parEspece]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 5)
      .map(([especeId, agg]) => ({
        especeId,
        nom: getEspece(especeId).nom.toLowerCase(),
        part: Math.round((agg.n / total) * 100),
        hauteurMax: agg.hauteurMax,
      }));
  }, [vivants]);

  return (
    <dl className="stats">
      <dt>Arbres</dt>
      <dd>
        {vivants.length}
        {chandelles > 0 ? ` + ${chandelles} chandelle${chandelles > 1 ? "s" : ""}` : ""} · herbe{" "}
        {(snapshot.fluxes.herbeCouvertureMean * 100).toFixed(0)} % du sol
      </dd>
      <dt>Essences</dt>
      <dd>
        {composition.length === 0
          ? "aucun arbre"
          : composition.map((c, rang) => (
              // Le séparateur est DEHORS, et c'est ce qui laisse la ligne
              // se replier : deux `nowrap` collés l'un à l'autre sans
              // espace entre eux n'offrent aucune coupure, et la liste
              // débordait du panneau dès la troisième essence.
              <Fragment key={c.especeId}>
                {rang > 0 && " · "}
                <span style={{ whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: SPECIES_COLORS[c.especeId] ?? COULEUR_AUTRES,
                      marginRight: 4,
                    }}
                  />
                  {c.nom} <strong>{c.part}</strong> %
                  <span className="detail">
                    {" "}
                    ({c.hauteurMax < 10 ? c.hauteurMax.toFixed(1) : c.hauteurMax.toFixed(0)} m)
                  </span>
                </span>
              </Fragment>
            ))}
      </dd>
      <dt>Récolte automatique</dt>
      <dd>
        <span className="detail">
          Ce qui se cueille tout seul quand le temps passe vite. Par défaut, ce que vous avez semé —
          le reste se récolte à la main, en sélectionnant l'arbre.
        </span>
        <ListeDesEssences
          vivants={vivants}
          semees={new Set(recolteAuto.semees)}
          choix={recolteAuto.choix}
          surBascule={reglerRecolteAuto}
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
