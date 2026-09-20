import { useMemo } from "react";
import { getEspece } from "../../engine/especes";
import type { Snapshot } from "../protocol";
import type { GameApi } from "../useGame";
import { essencesPresentes } from "./recensement";
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
  surChoisirEssence,
  zoneVisee,
}: {
  game: GameApi;
  snapshot: Snapshot;
  geste: ReglagesDeGeste;
  /** Ouvre le volet de choix des essences. */
  surChoisirEssence: () => void;
  /**
   * La cellule sous le curseur, s'il y en a une : le recensement des essences
   * porte sur le disque visé plutôt que sur toute la parcelle (#156).
   */
  zoneVisee?: { x: number; y: number } | undefined;
}) {
  const {
    mode,
    setMode,
    especeId,
    avecManchon,
    rayonChaulage,
    setRayonChaulage,
    semainesSaison,
    setSemainesSaison,
    densiteCible,
    setDensiteCible,
    critereEclaircie,
    setCritereEclaircie,
    especeEclaircie,
    setEspeceEclaircie,
    mainOuvertePanneau,
    setMainOuvertePanneau,
  } = geste;

  // Ce que l'éclaircie va garder : c'est l'arithmétique que le joueur ne peut
  // pas faire de tête, et sans elle « densité visée » ne veut rien dire.
  const tigesGardees = Math.max(
    0,
    Math.round((densiteCible * Math.PI * rayonChaulage * rayonChaulage) / 10_000),
  );

  // Qui est là, dans le cercle qu'on vise — ou sur toute la parcelle tant
  // qu'on ne vise rien (#156). Recalculé au survol : c'est une somme sur
  // quelques milliers de tiges, et le panneau ne se rend qu'aux changements de
  // cellule (`survol` n'est annoncé qu'aux changements, `VueParcelle`).
  const presentes = useMemo(
    () =>
      essencesPresentes(
        snapshot.trees,
        zoneVisee ? { x: zoneVisee.x, y: zoneVisee.y, rayonM: rayonChaulage } : undefined,
      ),
    [snapshot.trees, zoneVisee, rayonChaulage],
  );
  /** Ce que l'éclaircie par essence abattrait, si une essence est choisie. */
  const visee = presentes.find((e) => e.especeId === especeEclaircie);
  const tigesVisees = visee?.tiges;
  const nomVise = visee?.nom ?? "";

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
          {/*
            Les vingt-cinq boutons d'essence tenaient ici et pesaient la moitié
            du panneau. Choisir ce qu'on plante mérite sa propre page : elle
            montre l'arbre, sa gamme de pH et ce qui tient sur ce terrain.
          */}
          <button
            type="button"
            style={{ ...btn(true), display: "block", textAlign: "left", width: "100%" }}
            onClick={surChoisirEssence}
          >
            🌳 {getEspece(especeId).nom}
            <span style={{ opacity: 0.85 }}>
              {" "}
              — {getEspece(especeId).economie.prixPlantEur} €{avecManchon ? " + manchon" : ""} ·
              changer…
            </span>
          </button>
          <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 4 }}>
            Clic sur la parcelle = 1 plant (1 h, espacement ≥ 1 m).
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
          <button
            type="button"
            style={btn(critereEclaircie === "espece")}
            onClick={() => setCritereEclaircie("espece")}
            title="N'abattre qu'une essence, et toutes ses tiges dans le disque"
          >
            par essence (on nettoie une espèce)
          </button>
          {/*
            **Le nettoyage sélectif, enfin atteignable (#156).** Le moteur sait
            faire depuis longtemps — `critere: "espece"` prélève toutes les
            tiges de l'essence dans le disque — et rien dans l'interface ne
            permettait de le demander. Conséquence mesurée en partie : un
            joueur qui veut ouvrir un roncier fauche en boucle, alors que
            `faucher` n'écrit que dans la strate herbacée et ne touche aucun
            ligneux bas.
          */}
          {critereEclaircie === "espece" && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "var(--encre-douce)", fontSize: 13 }}>
                {zoneVisee
                  ? `Dans le cercle de ${rayonChaulage} m visé :`
                  : "Sur toute la parcelle (survolez pour viser un cercle) :"}
              </div>
              {presentes.length === 0 ? (
                <div style={{ color: "var(--encre-douce)", fontSize: 13 }}>aucune tige ici.</div>
              ) : (
                presentes.slice(0, 12).map((e) => (
                  <button
                    key={e.especeId}
                    type="button"
                    style={btn(especeEclaircie === e.especeId)}
                    onClick={() => setEspeceEclaircie(e.especeId)}
                    title={`la plus haute fait ${e.hauteurMaxM.toFixed(1)} m`}
                  >
                    {e.nom}{" "}
                    <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.75 }}>
                      {e.tiges}
                    </span>
                  </button>
                ))
              )}
              {presentes.length > 12 && (
                <div style={{ color: "var(--encre-douce)", fontSize: 13 }}>
                  … et {presentes.length - 12} autres essences, moins nombreuses.
                </div>
              )}
            </div>
          )}
          <br />
          {/*
            La densité visée ne veut rien dire pour le critère par essence : le
            moteur y prend TOUTES les tiges de l'essence, quel qu'en soit le
            nombre. L'afficher quand même ferait une promesse que l'action ne
            tient pas.
          */}
          {critereEclaircie !== "espece" && (
            <>
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
              {densiteCible} tiges/ha ·{" "}
            </>
          )}
          rayon{" "}
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
            {critereEclaircie === "espece" ? (
              tigesVisees === undefined ? (
                <>Choisissez l'essence à nettoyer dans la liste ci-dessus.</>
              ) : (
                <>
                  Un cercle de {rayonChaulage} m fait{" "}
                  {Math.round(Math.PI * rayonChaulage * rayonChaulage)} m² : on y abat les{" "}
                  <strong>
                    {tigesVisees} tiges de {nomVise}
                  </strong>{" "}
                  et rien d'autre.
                </>
              )
            ) : (
              <>
                Un cercle de {rayonChaulage} m fait{" "}
                {Math.round(Math.PI * rayonChaulage * rayonChaulage)} m² : à {densiteCible}{" "}
                tiges/ha, on y <strong>garde {tigesGardees} tiges</strong> et on abat tout le reste,
                en commençant par les{" "}
                {critereEclaircie === "parLeHaut" ? "plus grandes" : "plus petites"}.
              </>
            )}
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
