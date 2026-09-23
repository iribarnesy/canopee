/**
 * Le BANDEAU : la seule chose affichée en permanence.
 *
 * La date, l'argent, les heures et le temps qu'il fait — ce qu'on lit à chaque
 * semaine de jeu — et les vitesses, sans lesquelles on ne peut pas jouer du
 * tout. Le reste est derrière un bouton.
 */

import { coutDuDepassement, depassementHoraire } from "../../engine/actions";
import type { Snapshot } from "../protocol";
import type { GameApi } from "../useGame";
import { btn } from "./styles";

/**
 * Semaines dans un mois : 52 / 12.
 *
 * Le même nombre que celui qui nomme le mois deux lignes plus bas — un mois de
 * jeu n'est pas un mois de calendrier, c'est un douzième d'année, et les deux
 * doivent dire la même chose sous peine d'annoncer « un mois plus tard » sur
 * un bandeau qui n'a pas changé de nom.
 */
const SEMAINES_PAR_MOIS = 52 / 12;

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
  // L'économie coupée ne facture pas les heures : voir `factureDeLaSemaine`.
  const depassement = snapshot.economy.active ? depassementHoraire(snapshot.economy) : 0;
  const annee = Math.floor(snapshot.week / 52) + 1;
  const semaine = snapshot.week % 52;
  const mois = MOIS[Math.min(11, Math.floor(semaine / SEMAINES_PAR_MOIS))];
  const tresorerie = snapshot.economy.treasuryEur;
  const relecture = game.rembobinage.enCours;
  // La part parcourue, bornée : une relecture qui démarre a `semaine` égale à
  // son départ, et l'arrivée est `jusqua`.
  const part = relecture
    ? Math.max(
        0,
        Math.min(
          1,
          (relecture.semaine - relecture.depuis) / Math.max(1, relecture.jusqua - relecture.depuis),
        ),
      )
    : 0;

  return (
    <>
      <p className="bandeau">
        {/*
          La DATE d'abord, le temps joué en petit.
          `anneeCivile` vient du moteur : c'est l'année qui décide du climat,
          du CO₂ et de la dérive. « An 1 » ne dit que depuis combien de temps
          on joue — et sur une parcelle vieillie de quinze ans avant qu'on y
          touche, il annonçait l'an 1 devant mille trois cents arbres.
        */}
        <strong style={{ fontSize: "1.25rem" }}>
          {mois} {snapshot.anneeCivile}
          <span className="detail" style={{ fontSize: "0.72rem", fontWeight: 400, marginLeft: 6 }}>
            an {annee}
          </span>
        </strong>
        <strong style={{ fontSize: "1.25rem", color: tresorerie < 0 ? "#c0392b" : "#2e5b30" }}>
          {tresorerie.toFixed(0)} €
        </strong>
        {/*
          **Le dépassement se voit AU FUR ET À MESURE (#133)**, et pas à la
          fin : le plafond ne refuse plus rien, il se paie, et une facture qui
          tombe sans prévenir n'est pas un arbitrage. Le nombre d'heures et son
          prix viennent du moteur (`depassementHoraire`, `coutDuDepassement`) —
          le bandeau ne recalcule ni le plafond ni le tarif d'un bras.
        */}
        <span style={depassement > 0 ? { color: "#c0392b", fontWeight: 600 } : {}}>
          ⏱ {snapshot.economy.hoursUsedWeek.toFixed(0)}/{60 * snapshot.economy.uth} h · vous
          {snapshot.economy.ouvriersCdi > 0 && ` + ${snapshot.economy.ouvriersCdi} CDI`}
          {snapshot.economy.saisonniersFinSemaine.length > 0 &&
            ` + ${snapshot.economy.saisonniersFinSemaine.length} sais.`}
          {depassement > 0 &&
            ` · +${depassement.toFixed(0)} h à payer (${coutDuDepassement(depassement).eur} €)`}
        </span>
        <span>
          🌡 {snapshot.weather.tMean.toFixed(0)} °C · 🌧 {snapshot.weather.rainMm.toFixed(0)} mm
        </span>
        {snapshot.economy.bankrupt && <strong style={{ color: "#c0392b" }}>FAILLITE</strong>}
      </p>
      {/*
        ON REGARDE LE PASSÉ, et il faut que ça se voie (#128).

        Une relecture ressemble trait pour trait à une partie qui joue : même
        parcelle, même horloge qui avance, mêmes animations. C'est justement
        pourquoi elle a besoin d'être DITE — sans ça, le joueur croit avoir
        perdu cinq ans, et cherche ce qu'il a fait de travers.

        Les vitesses restent utilisables pendant : c'est la même horloge, et
        vouloir revoir plus vite ou plus lentement est légitime. Le reste des
        gestes est refusé par le worker, pas par l'écran — une règle, un
        endroit.
      */}
      {relecture && (
        <p
          style={{
            margin: "0 0 4px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "4px 10px",
            borderRadius: 8,
            background: "var(--foret)",
            color: "#fff",
          }}
        >
          <strong>↺ Relecture</strong>
          {/*
            **En SEMAINES quand la relecture tient dans une année.** Elle
            annonçait « an 19 sur 19 » pour une scène de vingt-six semaines :
            vrai, et parfaitement muet. L'unité suit la durée de ce qu'on
            regarde, comme partout ailleurs dans cette interface.
          */}
          <span>
            {relecture.jusqua - relecture.depuis < 52
              ? `semaine ${(relecture.semaine % 52) + 1} sur ${(relecture.jusqua % 52) + 1}, an ${Math.floor(relecture.jusqua / 52) + 1}`
              : `an ${Math.floor(relecture.semaine / 52) + 1} sur ${Math.floor(relecture.jusqua / 52) + 1}`}
          </span>
          {/* Une barre, parce qu'une relecture a une FIN et qu'on veut savoir
              où l'on en est sans compter les années. */}
          <span
            aria-hidden="true"
            style={{
              flex: 1,
              minWidth: 60,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.3)",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                borderRadius: 2,
                background: "#fff",
                width: `${Math.round(100 * part)}%`,
              }}
            />
          </span>
          <button
            type="button"
            style={{ ...btn(), marginRight: 0, marginBottom: 0 }}
            onClick={game.rembobinage.revenir}
          >
            ⏹ Revenir au présent
          </button>
        </p>
      )}
      <p style={{ margin: 0, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {/*
          **Une seule cible pour partir et pour s'arrêter.** La pause et la
          lecture étaient deux boutons différents qu'il fallait chercher à
          chaque fois ; la bascule montre l'état courant et le renverse. Les
          vitesses restent à côté, parce qu'elles disent autre chose — non pas
          « le temps coule-t-il ? » mais « à quel rythme ».
        */}
        <button
          type="button"
          // Allumé quand le temps COULE, éteint à l'arrêt : dans toute cette
          // interface le vert veut dire « en cours », et un ▶ vert à l'arrêt
          // dirait le contraire de ce que le bouton montre.
          style={{ ...btn(game.speed > 0), marginRight: 0, marginBottom: 0, minWidth: 44 }}
          onClick={game.basculer}
          title={game.speed > 0 ? "Mettre en pause (espace)" : "Laisser filer le temps (espace)"}
          aria-label={game.speed > 0 ? "Mettre en pause" : "Reprendre"}
        >
          {game.speed > 0 ? "⏸" : "▶"}
        </button>
        {[1, 4, 13, 52].map((v) => (
          <button
            key={v}
            type="button"
            style={{ ...btn(game.speed === v), marginRight: 0, marginBottom: 0 }}
            onClick={() => game.setSpeed(v)}
          >
            ×{v}
          </button>
        ))}
        {/*
          **La traversée est jouée, pas sautée.** C'est la demande : voir la
          parcelle changer pendant le mois, pas la retrouver changée. Les
          vitesses choisies sont celles où une ellipse tient encore : à ×4 une
          semaine dure 250 ms, de quoi jouer deux actes ; au-delà de ×13 le
          budget passe sous le plancher de lisibilité et les actes sautent.
        */}
        <button
          type="button"
          style={{ ...btn(), marginRight: 0, marginBottom: 0 }}
          onClick={() => game.avancerDe(SEMAINES_PAR_MOIS, 4, "un mois plus tard")}
          title="Avance d'un mois, puis s'arrête"
        >
          ⏩ +1 mois
        </button>
        <button
          type="button"
          style={{ ...btn(), marginRight: 0, marginBottom: 0 }}
          onClick={() => game.avancerDe(52, 13, "un an plus tard")}
          title="Avance d'un an, puis s'arrête"
        >
          ⏭ +1 an
        </button>
      </p>
    </>
  );
}
