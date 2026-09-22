/**
 * L'OBJECTIF ET SES PALIERS, pendant qu'on joue (#188).
 *
 * `v1.md` : *« Un niveau a un objectif général et des objectifs intermédiaires
 * … annoncés. »* Annoncés, donc tous visibles dès le départ — le joueur voit le
 * chemin entier, pas seulement le pas suivant. Ce qui change en cours de
 * route, c'est lequel est le SIEN à cet instant.
 *
 * Le volet vit en haut à gauche, sous le bandeau : c'est le seul endroit que
 * l'œil retrouve sans chercher, et un objectif qu'on doit aller ouvrir n'en est
 * pas un.
 */

import type { Avancement, AvancementPalier, Niveau } from "../niveaux";
import { libelleDuPalier } from "../niveaux";
import { VOLET } from "./styles";

/** La jauge d'un palier : verte quand il est acquis, sinon dans le ton du bois. */
function Jauge({ ligne }: { ligne: AvancementPalier }) {
  return (
    <div
      style={{
        height: 4,
        borderRadius: 2,
        background: "rgba(60, 50, 30, 0.13)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.round(ligne.part * 100)}%`,
          height: "100%",
          background: ligne.atteint ? "var(--foret)" : "var(--bois, #8a6d3b)",
          transition: "width 240ms ease",
        }}
      />
    </div>
  );
}

function Ligne({ ligne, courant }: { ligne: AvancementPalier; courant: boolean }) {
  return (
    <li
      style={{
        listStyle: "none",
        margin: "6px 0 0",
        opacity: ligne.atteint ? 0.62 : 1,
        fontWeight: courant ? 600 : 400,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        <span aria-hidden="true">{ligne.atteint ? "✔" : courant ? "▸" : "·"}</span>
        <span style={{ flex: 1 }}>{libelleDuPalier(ligne)}</span>
      </div>
      {!ligne.atteint && <Jauge ligne={ligne} />}
      {/* L'aide ne s'affiche que sur le palier COURANT : les trois d'un coup
          feraient un mode d'emploi, et personne ne lit un mode d'emploi. */}
      {courant && ligne.palier.aide && (
        <div style={{ fontSize: "0.82em", opacity: 0.72, marginTop: 2 }}>{ligne.palier.aide}</div>
      )}
    </li>
  );
}

export function PanneauNiveau({ niveau, avancement }: { niveau: Niveau; avancement: Avancement }) {
  const annees = avancement.restantes === undefined ? undefined : avancement.restantes / 52;
  return (
    <section
      style={{ ...VOLET, top: 104, left: 12, maxWidth: 330, fontSize: "0.92em" }}
      aria-label="Objectif du niveau"
    >
      <h2 style={{ margin: 0, fontSize: "1em" }}>{niveau.nom}</h2>
      <p style={{ margin: "2px 0 0", opacity: 0.8 }}>{niveau.enonce}</p>
      <ul style={{ margin: "4px 0 0", padding: 0 }}>
        {avancement.paliers.map((ligne) => (
          <Ligne
            key={ligne.palier.id}
            ligne={ligne}
            courant={ligne.palier.id === avancement.courant?.palier.id}
          />
        ))}
      </ul>
      {annees !== undefined && (
        <div style={{ marginTop: 6, fontSize: "0.85em", opacity: 0.75 }}>
          {/* Des ANNÉES et non des semaines : un objectif à mille semaines ne
              se compare à rien, un objectif à vingt ans se compare à un arbre. */}
          Il reste {annees < 1 ? "moins d'un an" : `${Math.floor(annees)} ans`}
        </div>
      )}
    </section>
  );
}
