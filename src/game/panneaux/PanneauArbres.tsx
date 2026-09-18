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

export function PanneauArbres({
  snapshot,
  vivants,
}: {
  snapshot: Snapshot;
  vivants: readonly SnapshotTree[];
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
      <dt>Pression</dt>
      <dd>
        broutage {snapshot.fluxes.broutageKg.toFixed(2)} kg/sem · ravageurs{" "}
        {(snapshot.fluxes.ravageurMoyen * 100).toFixed(0)} % · auxiliaires{" "}
        {(snapshot.fluxes.auxiliairesMoyen * 100).toFixed(0)} %
      </dd>
    </dl>
  );
}
