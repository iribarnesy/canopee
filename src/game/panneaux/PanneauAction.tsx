/**
 * Le panneau ACTION : le geste qu'on s'apprête à faire, et ses réglages.
 */

import { ESPECES_V0 } from "../../engine/especes";
import { SPECIES_COLORS } from "../../ui/couleurs";
import type { Snapshot } from "../protocol";
import type { GameApi } from "../useGame";
import type { Mode, ReglagesDeGeste } from "./reglages";
import { btn } from "./styles";

/**
 * Ce que le disque va faire, mode par mode. Une seule phrase par geste : trois
 * modes affichaient jusqu'ici la légende de la fauche parce que la condition
 * s'arrêtait au chaulage.
 */
const LEGENDE_RAYON: Partial<Record<Mode, string>> = {
  chauler: "pH +0,5 sur le disque",
  faucher: "l'herbe est rabattue, elle repoussera",
  boisMort: "les troncs tombés partent au chauffage — plus d'humus ni d'abri dessous",
  brf: "le broyat est épandu, l'azote va où on le porte",
  cloturer: "le disque est mis hors d'atteinte du gibier",
};

export function PanneauAction({
  game,
  snapshot,
  geste,
}: {
  game: GameApi;
  snapshot: Snapshot;
  geste: ReglagesDeGeste;
}) {
  const {
    mode,
    setMode,
    especeId,
    setEspeceId,
    avecManchon,
    setAvecManchon,
    rayonChaulage,
    setRayonChaulage,
    semainesSaison,
    setSemainesSaison,
    densiteCible,
    setDensiteCible,
    critereEclaircie,
    setCritereEclaircie,
    mainOuvertePanneau,
    setMainOuvertePanneau,
  } = geste;

  // Ce que l'éclaircie va garder : c'est l'arithmétique que le joueur ne peut
  // pas faire de tête, et sans elle « densité visée » ne veut rien dire.
  const tigesGardees = Math.max(
    0,
    Math.round((densiteCible * Math.PI * rayonChaulage * rayonChaulage) / 10_000),
  );

  return (
    <>
      <button type="button" style={btn(mode === "selection")} onClick={() => setMode("selection")}>
        Sélection
      </button>
      <button type="button" style={btn(mode === "planter")} onClick={() => setMode("planter")}>
        Planter
      </button>
      <button type="button" style={btn(mode === "chauler")} onClick={() => setMode("chauler")}>
        Chauler
      </button>
      <button
        type="button"
        style={btn(mode === "eclaircir")}
        onClick={() => setMode("eclaircir")}
        title="Abattre des tiges entières pour ramener une zone à la densité choisie. Rien à voir avec l'élagage, qui laisse l'arbre debout."
      >
        🪚 Éclaircir (abattre)
      </button>
      {snapshot.stockBrfKg > 1 && (
        <button
          type="button"
          style={btn(mode === "brf")}
          onClick={() => setMode("brf")}
          title="Épandre le tas de broyat là où vous voulez porter la fertilité"
        >
          🍂 Épandre le BRF ({snapshot.stockBrfKg.toFixed(0)} kg)
        </button>
      )}
      <button
        type="button"
        style={btn(mode === "cloturer")}
        onClick={() => setMode("cloturer")}
        title="Enclore une zone : cher au mètre de périmètre, mais le gibier n'y entre plus"
      >
        🚧 Clôturer
      </button>
      <button
        type="button"
        style={btn()}
        onClick={() => game.dispatch({ type: "chasser" })}
        title="Une journée de chasse : la pression recule, puis les voisins comblent le vide"
      >
        🎯 Chasser
      </button>
      <button
        type="button"
        style={btn(mode === "faucher")}
        onClick={() => setMode("faucher")}
        title="Dégager la strate herbacée autour des jeunes plants — l'entretien qui sauve une plantation sur sol pauvre"
      >
        🌾 Faucher
      </button>
      <button
        type="button"
        style={btn(mode === "boisMort")}
        onClick={() => setMode("boisMort")}
        title="Ramasser les troncs tombés pour le chauffage — moins de combustible, mais moins d'humus, d'abris et de terre retenue"
      >
        🪵 Bois mort
      </button>
      <button
        type="button"
        style={btn(mainOuvertePanneau)}
        onClick={() => setMainOuvertePanneau(!mainOuvertePanneau)}
        title="Embaucher de la main-d'œuvre"
      >
        👷 Main-d'œuvre
      </button>
      {mainOuvertePanneau && (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            style={btn()}
            onClick={() =>
              game.dispatch({
                type: "embaucher",
                contrat: "saisonnier",
                semaines: semainesSaison,
              })
            }
            title="Payé d'avance, repart tout seul à la fin du contrat — l'outil des récoltes"
          >
            Saisonnier {semainesSaison} sem ({semainesSaison * 700} €)
          </button>
          <input
            type="range"
            min={1}
            max={12}
            value={semainesSaison}
            onChange={(e) => setSemainesSaison(Number(e.target.value))}
            style={{ verticalAlign: "middle", width: 70 }}
          />
          <br />
          <button
            type="button"
            style={btn()}
            onClick={() => game.dispatch({ type: "embaucher", contrat: "cdi" })}
            title="600 €/sem, rupture 1 200 € (indemnités + préavis)"
          >
            CDI (600 €/sem)
          </button>
          <button
            type="button"
            style={btn()}
            onClick={() => game.dispatch({ type: "licencier" })}
            title="Rompre un CDI : 1 200 € d'indemnités"
          >
            Licencier (1 200 €)
          </button>
        </div>
      )}
      {mode === "planter" && (
        <div style={{ marginTop: 6 }}>
          {ESPECES_V0.map((e) => (
            <button
              key={e.id}
              type="button"
              style={{
                ...btn(especeId === e.id),
                borderLeft: `6px solid ${SPECIES_COLORS[e.id]}`,
              }}
              onClick={() => setEspeceId(e.id)}
            >
              {e.nom} ({e.economie.prixPlantEur} €)
            </button>
          ))}
          <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 4 }}>
            <label style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={avecManchon}
                onChange={(e) => setAvecManchon(e.target.checked)}
              />{" "}
              🛡️ poser un manchon en même temps (+8 €, +30 min par plant)
            </label>
            <br />
            Clic sur la carte = 1 plant (1 h, espacement ≥ 1 m). Sans manchon, un plant appétent se
            fait brouter tant qu'il n'a pas sa flèche hors d'atteinte — vous pourrez toujours en
            poser un après coup en sélectionnant l'arbre.
          </div>
        </div>
      )}
      {mode === "eclaircir" && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: "#8a4b2d", fontSize: 13, marginBottom: 6 }}>
            ⚠️ Éclaircir, c'est <strong>abattre des tiges entières</strong> pour desserrer le
            peuplement — pas couper des branches. Pour travailler les branches d'un arbre et le
            laisser debout, c'est <strong>élaguer</strong>, sur une sélection d'arbres.
          </div>
          <button
            type="button"
            style={btn(critereEclaircie === "parLeBas")}
            onClick={() => setCritereEclaircie("parLeBas")}
            title="Retirer les dominés : la croissance se concentre sur les plus beaux"
          >
            par le bas (on abat les petits)
          </button>
          <button
            type="button"
            style={btn(critereEclaircie === "parLeHaut")}
            onClick={() => setCritereEclaircie("parLeHaut")}
            title="Prélever les gros : on récolte le capital sur pied et on libère les dominés"
          >
            par le haut (on abat les gros)
          </button>
          <br />
          Densité visée :{" "}
          <input
            type="range"
            min={100}
            max={1500}
            step={50}
            value={densiteCible}
            onChange={(e) => setDensiteCible(Number(e.target.value))}
            style={{ verticalAlign: "middle", width: 90 }}
          />{" "}
          {densiteCible} tiges/ha · rayon{" "}
          <input
            type="range"
            min={3}
            max={20}
            value={rayonChaulage}
            onChange={(e) => setRayonChaulage(Number(e.target.value))}
            style={{ verticalAlign: "middle", width: 70 }}
          />{" "}
          {rayonChaulage} m
          <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 4 }}>
            Un cercle de {rayonChaulage} m fait{" "}
            {Math.round(Math.PI * rayonChaulage * rayonChaulage)} m² : à {densiteCible} tiges/ha, on
            y <strong>garde {tigesGardees} tiges</strong> et on abat tout le reste, en commençant
            par les {critereEclaircie === "parLeHaut" ? "plus grandes" : "plus petites"}.
          </div>
        </div>
      )}
      {(mode === "chauler" ||
        mode === "faucher" ||
        mode === "boisMort" ||
        mode === "brf" ||
        mode === "cloturer") && (
        <div style={{ marginTop: 6 }}>
          Rayon :{" "}
          <input
            type="range"
            min={3}
            max={20}
            value={rayonChaulage}
            onChange={(e) => setRayonChaulage(Number(e.target.value))}
          />{" "}
          {rayonChaulage} m — {LEGENDE_RAYON[mode] ?? ""}.
        </div>
      )}
    </>
  );
}
