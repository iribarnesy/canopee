/**
 * Le volet **scores** : les deux notes sur lesquelles une parcelle se juge — la
 * biodiversité et le carbone — et le cadre dans lequel elles se lisent, car
 * 42/100 ne veut pas dire la même chose dans un bocage et dans une plaine
 * céréalière, ni en 2026 et en 2080.
 */

import type { Snapshot } from "../protocol";

export function PanneauScores({ snapshot }: { snapshot: Snapshot }) {
  return (
    <dl className="stats">
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
    </dl>
  );
}
