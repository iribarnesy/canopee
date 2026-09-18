/**
 * Le panneau LA PARCELLE : ce que le peuplement pèse, porte et abrite. Tout
 * vient de l'instantané du moteur — rien n'est recalculé ici.
 */

import { Fragment, useMemo } from "react";
import { getEspece } from "../../engine/especes";
import { COULEUR_AUTRES, SPECIES_COLORS } from "../../ui/couleurs";
import type { Snapshot, SnapshotTree, StationInfo } from "../protocol";

export function PanneauParcelle({
  snapshot,
  station,
  vivants,
}: {
  snapshot: Snapshot;
  station: StationInfo;
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
    <section className="carte">
      <h3>La parcelle</h3>
      <dl className="stats">
        <dt>Arbres</dt>
        <dd>
          {vivants.length}
          {chandelles > 0 ? ` + ${chandelles} chandelle${chandelles > 1 ? "s" : ""}` : ""} · herbe{" "}
          {(snapshot.fluxes.herbeCouvertureMean * 100).toFixed(0)} % du sol
        </dd>
        <dt>Carbone</dt>
        <dd>
          {snapshot.inventory.vivantTHa.toFixed(1)} t vivant +{" "}
          {snapshot.inventory.humusTHa.toFixed(1)} t humus ·{" "}
          <strong>
            bilan {snapshot.inventory.bilanNetTHa >= 0 ? "+" : ""}
            {snapshot.inventory.bilanNetTHa.toFixed(1)} t C/ha
          </strong>
        </dd>
        <dt>Entourage</dt>
        <dd>
          {snapshot.paysage}
          <span className="detail"> · gibier {(snapshot.pressionGibier * 100).toFixed(0)} %</span>
        </dd>
        <dt>Époque</dt>
        <dd>
          {snapshot.anneeCivile}{" "}
          <span className="detail">· CO₂ {snapshot.co2Ppm.toFixed(0)} ppm</span>
        </dd>
        <dt>Pression</dt>
        <dd>
          broutage {snapshot.fluxes.broutageKg.toFixed(2)} kg/sem · ravageurs{" "}
          {(snapshot.fluxes.ravageurMoyen * 100).toFixed(0)} % · auxiliaires{" "}
          {(snapshot.fluxes.auxiliairesMoyen * 100).toFixed(0)} %
        </dd>
        <dt>Nappe</dt>
        <dd>
          à {(snapshot.fluxes.nappeProfondeurCm / 100).toFixed(2)} m sous la surface
          <span className="detail">
            {" "}
            · équilibre régional {(station.nappeEquilibreCm / 100).toFixed(1)} m — la forêt la fait
            descendre en transpirant, un incendie la fait remonter
          </span>
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
        <dt>Sol</dt>
        <dd>
          P {(snapshot.fluxes.phosphoreMoyenGM2 * 10).toFixed(1)} · K{" "}
          {(snapshot.fluxes.potassiumMoyenGM2 * 10).toFixed(0)} kg/ha assimilables · mycorhizes{" "}
          {(snapshot.fluxes.mycorhizesMoyen * 100).toFixed(0)} %
        </dd>
        {snapshot.fluxes.erosionArracheeKgM2 > 0 && (
          <>
            <dt>Érosion</dt>
            <dd>
              {(snapshot.fluxes.erosionArracheeKgM2 * 520).toFixed(1)} t/ha/an arrachées ·{" "}
              <strong>{(snapshot.fluxes.erosionSortieKgM2 * 520).toFixed(1)}</strong> sorties de la
              parcelle
              <span className="detail">
                {" "}
                · avec {(snapshot.fluxes.erosionNKgHa * 52).toFixed(1)} N ·{" "}
                {(snapshot.fluxes.erosionPKgHa * 52).toFixed(2)} P ·{" "}
                {(snapshot.fluxes.erosionKKgHa * 52).toFixed(1)} K kg/ha/an
              </span>
            </dd>
          </>
        )}
        {(snapshot.fluxes.boisSedimentPiegeKgM2 > 0 || snapshot.fluxes.boisRetenueMm > 0) && (
          <>
            <dt>Bois en travers</dt>
            <dd>
              retient <strong>{(snapshot.fluxes.boisRetenueMm * 52).toFixed(0)} mm/an</strong> d'eau
              et{" "}
              {/* En kg et non en tonnes : le bois mort NATUREL barre peu (un
                      chablis repose sur ses branches), et « 0,0 t/ha » ne dirait
                      rien de ce qui se passe. */}
              <strong>
                {(snapshot.fluxes.boisSedimentPiegeKgM2 * 520_000).toFixed(0)} kg/ha/an
              </strong>{" "}
              de terre
              <span className="detail">
                {" "}
                · un tronc couché en travers de la pente met l'eau en flaque, le temps qu'elle
                rentre, et fait déposer derrière lui ce que le ruissellement emportait
              </span>
            </dd>
          </>
        )}
        {snapshot.fluxes.partInondee > 0 && (
          <>
            <dt>Crue</dt>
            <dd>
              la nappe affleure sur {(snapshot.fluxes.partInondee * 100).toFixed(0)} % de la
              parcelle
            </dd>
          </>
        )}
        <dt>Biodiversité</dt>
        <dd>
          <strong>{snapshot.biodiversite.note.toFixed(0)}/100</strong>{" "}
          <span className="detail">
            ({snapshot.biodiversite.richesse} essence
            {snapshot.biodiversite.richesse > 1 ? "s" : ""}, strates{" "}
            {(snapshot.biodiversite.strates * 100).toFixed(0)} %, couvert permanent{" "}
            {(snapshot.biodiversite.couvertPermanent * 100).toFixed(0)} %, bois mort{" "}
            {(snapshot.biodiversite.boisMort * 100).toFixed(0)} %)
          </span>
        </dd>
      </dl>
    </section>
  );
}
