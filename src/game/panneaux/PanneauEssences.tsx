/**
 * Le volet **essences** : choisir ce qu'on plante en le connaissant.
 *
 * On choisissait sur un nom et un prix, dans vingt-cinq boutons empilés —
 * « Arbousier (9 €) » — sans jamais voir l'arbre ni savoir s'il avait la
 * moindre chance sur ce terrain-là.
 *
 * **« Tient ici » se lit chez le moteur.** `especeTenable` est la fonction
 * dont le moteur se sert déjà pour filtrer les semis naturels d'un paysage
 * (`entourageDeLaStation`) : le filtre du joueur et celui de la nature sont
 * donc la **même** règle, et ils ne peuvent pas diverger. Refaire ici une
 * comparaison de pH aurait donné une seconde règle qui dérive en silence.
 */

import { ESPECES_V0 } from "../../engine/especes";
import { especeTenable } from "../../engine/paysage";
import { SPECIES_COLORS } from "../../ui/couleurs";
import type { Snapshot, StationInfo } from "../protocol";
import { portraitDEspece } from "./portraits";

/** Le pH moyen de la parcelle, pour demander au moteur ce qui y tiendrait. */
function phMoyen(snapshot: Snapshot, secours: number): number {
  const sol = snapshot.soilPh;
  if (!sol || sol.length === 0) return secours;
  let somme = 0;
  for (let i = 0; i < sol.length; i++) somme += sol[i] ?? 0;
  return somme / sol.length;
}

/** Ce que l'espèce demande à la lumière, en un mot. */
function temperament(compensation: number): string {
  if (compensation <= 0.05) return "d'ombre";
  if (compensation <= 0.12) return "de demi-ombre";
  return "de pleine lumière";
}

export function PanneauEssences({
  snapshot,
  station,
  especeId,
  setEspeceId,
  avecManchon,
  setAvecManchon,
  seulementTenables,
  setSeulementTenables,
}: {
  snapshot: Snapshot;
  station: StationInfo;
  especeId: string;
  setEspeceId: (id: string) => void;
  avecManchon: boolean;
  setAvecManchon: (v: boolean) => void;
  seulementTenables: boolean;
  setSeulementTenables: (v: boolean) => void;
}) {
  const ph = phMoyen(snapshot, station.phInitial);
  const liste = ESPECES_V0.map((e) => ({ e, tient: especeTenable(e, ph, station.ruMm) }));
  const montrees = seulementTenables ? liste.filter((x) => x.tient) : liste;
  const ecartees = liste.length - montrees.length;

  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 13 }}>
        <label style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={seulementTenables}
            onChange={(ev) => setSeulementTenables(ev.target.checked)}
          />{" "}
          seulement ce qui tient sur ce terrain
        </label>
        <span className="detail">
          {" "}
          — pH {ph.toFixed(1)}, réserve utile {station.ruMm.toFixed(0)} mm
          {seulementTenables && ecartees > 0 ? ` · ${ecartees} écartées` : ""}
        </span>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {montrees.map(({ e, tient }) => {
          const choisie = especeId === e.id;
          const portrait = portraitDEspece(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setEspeceId(e.id)}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                textAlign: "left",
                padding: 8,
                border: "1px solid",
                borderColor: choisie ? "var(--foret)" : "var(--trait)",
                borderLeft: `6px solid ${SPECIES_COLORS[e.id] ?? "var(--trait)"}`,
                borderRadius: 8,
                background: choisie ? "var(--foret-pale)" : "var(--carte)",
                cursor: "pointer",
                // Une essence hors gamme reste **choisissable** : le moteur, lui,
                // ne l'interdit pas — il la laissera végéter puis mourir. Lui
                // barrer le passage serait inventer une règle ; l'afficher
                // effacée dit ce que le moteur sait, sans décider à sa place.
                opacity: tient ? 1 : 0.55,
              }}
            >
              {portrait && (
                <img
                  src={portrait}
                  alt=""
                  style={{ width: 38, height: 54, objectFit: "contain", alignSelf: "center" }}
                />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{e.nom}</strong>
                <br />
                <span className="detail" style={{ fontSize: 11.5 }}>
                  pH {e.ph[0]}–{e.ph[1]} · {e.hauteurMaxM} m · {e.economie.prixPlantEur} €
                  <br />
                  arbre {temperament(e.lumiere.compensation)}
                  {e.azote.fixateur ? " · fixe l'azote" : ""}
                  {e.fruits ? ` · ${e.fruits.rendementMaxKg} kg de fruits/an` : ""}
                  {!tient && (
                    <>
                      <br />
                      <span style={{ color: "#8a4b2d" }}>ne tient pas sur ce sol</span>
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 10 }}>
        <label style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={avecManchon}
            onChange={(ev) => setAvecManchon(ev.target.checked)}
          />{" "}
          🛡️ poser un manchon en même temps (+8 €, +30 min par plant)
        </label>
        <br />
        Clic sur la parcelle = 1 plant (1 h, espacement ≥ 1 m). Sans manchon, un plant appétent se
        fait brouter tant qu'il n'a pas sa flèche hors d'atteinte — vous pourrez toujours en poser
        un après coup en sélectionnant l'arbre.
      </div>
    </>
  );
}
