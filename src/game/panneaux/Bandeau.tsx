/**
 * Le BANDEAU : la seule chose affichée en permanence.
 *
 * La date, l'argent, les heures et le temps qu'il fait — ce qu'on lit à chaque
 * semaine de jeu — et les vitesses, sans lesquelles on ne peut pas jouer du
 * tout. Le reste est derrière un bouton.
 */

import type { Snapshot } from "../protocol";
import type { GameApi } from "../useGame";
import { btn } from "./styles";

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function Bandeau({ game, snapshot }: { game: GameApi; snapshot: Snapshot }) {
  const annee = Math.floor(snapshot.week / 52) + 1;
  const semaine = snapshot.week % 52;
  const mois = MOIS[Math.min(11, Math.floor(semaine / 4.34))];
  const tresorerie = snapshot.economy.treasuryEur;

  return (
    <>
      <p className="bandeau">
        <strong style={{ fontSize: "1.25rem" }}>
          An {annee} · {mois}
        </strong>
        <strong style={{ fontSize: "1.25rem", color: tresorerie < 0 ? "#c0392b" : "#2e5b30" }}>
          {tresorerie.toFixed(0)} €
        </strong>
        <span>
          ⏱ {snapshot.economy.hoursUsedWeek.toFixed(0)}/{60 * snapshot.economy.uth} h · vous
          {snapshot.economy.ouvriersCdi > 0 && ` + ${snapshot.economy.ouvriersCdi} CDI`}
          {snapshot.economy.saisonniersFinSemaine.length > 0 &&
            ` + ${snapshot.economy.saisonniersFinSemaine.length} sais.`}
        </span>
        <span>
          🌡 {snapshot.weather.tMean.toFixed(0)} °C · 🌧 {snapshot.weather.rainMm.toFixed(0)} mm
        </span>
        {snapshot.economy.bankrupt && <strong style={{ color: "#c0392b" }}>FAILLITE</strong>}
      </p>
      <p style={{ margin: 0 }}>
        {[0, 1, 4, 13, 52].map((v) => (
          <button
            key={v}
            type="button"
            style={btn(game.speed === v)}
            onClick={() => game.setSpeed(v)}
          >
            {v === 0 ? "⏸" : `×${v}`}
          </button>
        ))}
      </p>
    </>
  );
}
