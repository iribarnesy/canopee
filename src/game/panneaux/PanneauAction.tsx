import { useMemo } from "react";
import type { ActionRefusal } from "../../engine/actions";
import { getEspece } from "../../engine/especes";
import { aireM2DeLaZone, type Zone } from "../../engine/zone";
import {
  auMoinsUnKilo,
  CULTURES,
  cultureDuMoteur,
  fenetreDeSemisDite,
  type GesteDuChamp,
  grainLu,
  LABOUR_EXPLIQUE,
  MOISSON_EXPLIQUEE,
  moissonExpliquee,
  semaineDite,
  semisExplique,
} from "../cultures";
import { DOSE_MIN, ENGRAIS, FORMES_ENGRAIS } from "../fertilisation";
import { auFilDuTexte, capitale, de } from "../mots";
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
  fertiliser: "la dose est épandue sur toute la zone",
  labourer: "le sol est retourné, mis à nu",
  semer: "la culture est semée sur la place libre",
  moissonner: "le grain part en vente, la paille reste",
};

/**
 * Comment on nomme une zone dans une phrase — « le cercle de 8 m », « la bande
 * de 42 × 4 m ».
 *
 * Le rayon du réglage sert de repli : tant qu'on ne vise rien, il n'y a pas de
 * zone, mais il y a un rayon armé et le joueur a le droit de savoir ce qu'il
 * ferait.
 */
function ditLaZone(zone: Zone | undefined, rayonM: number): string {
  if (!zone) return `le cercle de ${rayonM} m`;
  if (zone.zone !== "bande") return `le cercle de ${zone.rayonM} m`;
  return `la bande de ${Math.round(zone.longueurM)} × ${Math.round(zone.largeurM)} m`;
}

/**
 * **Disque ou bande**, et la mesure qui va avec (#205).
 *
 * Le moteur sait traiter les deux depuis #186 ; l'interface ne savait demander
 * qu'un disque. Une allée agroforestière *est* une bande : tant qu'on ne
 * pouvait viser qu'un cercle, on labourait jusqu'au pied des rangs — ce
 * qu'aucun agroforestier ne fait, et ce qui coûte 77 % de son volume au noyer
 * d'allée (#184).
 *
 * **Le même réglage pour les six gestes de zone**, comme le rayon : c'est une
 * façon de travailler, pas un paramètre par outil.
 */
function FormeDuChantier({ geste, legende }: { geste: ReglagesDeGeste; legende?: string }) {
  const {
    rayonChaulage,
    setRayonChaulage,
    traceBande,
    setTraceBande,
    largeurBande,
    setLargeurBande,
  } = geste;
  return (
    <>
      <button type="button" style={btn(!traceBande)} onClick={() => setTraceBande(false)}>
        ⬤ Disque
      </button>
      <button type="button" style={btn(traceBande)} onClick={() => setTraceBande(true)}>
        ▬ Bande
      </button>
      {traceBande ? (
        <>
          {" "}
          largeur{" "}
          <input
            type="range"
            min={1}
            max={20}
            value={largeurBande}
            onChange={(e) => setLargeurBande(Number(e.target.value))}
            style={{ verticalAlign: "middle", width: 70 }}
          />{" "}
          {largeurBande} m{legende ? ` — ${legende}.` : ""}
          <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 2 }}>
            Un clic pour le départ, un second pour l'arrivée : la longueur et l'orientation viennent
            du tracé. Le long des rangs, c'est une allée.
          </div>
        </>
      ) : (
        <>
          {" "}
          rayon{" "}
          <input
            type="range"
            min={3}
            max={20}
            value={rayonChaulage}
            onChange={(e) => setRayonChaulage(Number(e.target.value))}
            style={{ verticalAlign: "middle", width: 70 }}
          />{" "}
          {rayonChaulage} m{legende ? ` — ${legende}.` : ""}
        </>
      )}
    </>
  );
}

/**
 * **Fertiliser** (#435) : la forme, puis la dose **dans l'unité de la forme**.
 *
 * Le moteur sait épandre de l'ammonitrate et du fumier depuis #140, de la
 * potasse depuis #395, et aucun bouton ne le lui demandait. Trois formes qui ne
 * font pas la même chose — c'est l'intérêt du geste —, donc trois boutons et
 * une phrase qui dit ce que chacune fait, avant le clic.
 *
 * Le curseur s'arrête au plafond du moteur (`doseMax`, la constante même qu'il
 * lit pour refuser) : on ne peut pas armer une dose qu'il refuserait. Et
 * l'unité change avec la forme — kg N/ha pour l'azote, kg K₂O/ha pour la
 * potasse —, chaque forme gardant sa propre dose (`reglages.ts`).
 */
function ChoixDeLEngrais({ geste }: { geste: ReglagesDeGeste }) {
  const { formeEngrais, setFormeEngrais, dosesEngrais, setDoseEngrais } = geste;
  const fiche = ENGRAIS[formeEngrais];
  const dose = dosesEngrais[formeEngrais];
  return (
    <div style={{ marginTop: 6 }}>
      {FORMES_ENGRAIS.map((forme) => (
        <button
          key={forme}
          type="button"
          style={btn(formeEngrais === forme)}
          onClick={() => setFormeEngrais(forme)}
          title={ENGRAIS[forme].explication}
        >
          {ENGRAIS[forme].icone} {ENGRAIS[forme].nom}
        </button>
      ))}
      <div style={{ marginTop: 2 }}>
        Dose{" "}
        <input
          type="range"
          min={DOSE_MIN}
          max={fiche.doseMax}
          step={1}
          value={dose}
          onChange={(e) => setDoseEngrais(formeEngrais, Number(e.target.value))}
          style={{ verticalAlign: "middle", width: 110 }}
          aria-label={`Dose ${de(auFilDuTexte(fiche.nom))}, ${fiche.unite}`}
        />{" "}
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>
          {dose} {fiche.unite}
        </strong>
        <span style={{ color: "var(--encre-douce)", fontSize: 13 }}>
          {" "}
          · au plus {fiche.doseMax}
        </span>
      </div>
      <div style={{ color: "var(--encre-douce)", fontSize: 13, margin: "2px 0 6px" }}>
        {fiche.explication}
      </div>
      <FormeDuChantier geste={geste} legende={LEGENDE_RAYON.fertiliser ?? ""} />
    </div>
  );
}

/**
 * La réponse du moteur au geste du champ qu'on vise (#451), telle que `prevoir`
 * la rend : ses refus, et pour une moisson qui passerait, le grain qu'elle
 * emporterait.
 */
export interface PreavisDuChamp {
  refusals: readonly ActionRefusal[];
  /** tonnes de grain sur pied dans la zone — seulement pour une moisson acceptée */
  grainT?: number | undefined;
}

/** Une ligne d'explication, à l'encre douce, comme celles des autres gestes. */
const EXPLICATION = { color: "var(--encre-douce)", fontSize: 13, margin: "2px 0 6px" } as const;

/**
 * **Ce que le moteur répond, avant le clic** (#451).
 *
 * Le panneau ne décide pas si l'on est « dans la saison » : la fenêtre de semis
 * est une règle du moteur, la place libre aussi, et ce qu'il y a à moissonner
 * se lit sur pied. Au survol, le moteur répond par `prevoir` pour la zone
 * visée et la semaine ouverte, et c'est cette réponse qui s'écrit ici — sa
 * raison mot pour mot quand il refuserait, le grain qu'il vendrait quand on
 * moissonne.
 */
function CeQueRepondLeMoteur({
  geste,
  zoneVisee,
  traceBande,
  preavis,
}: {
  geste: GesteDuChamp;
  zoneVisee: Zone | undefined;
  traceBande: boolean;
  preavis: PreavisDuChamp | undefined;
}) {
  const ligne = { fontSize: 13, marginTop: 4 } as const;
  if (!zoneVisee) {
    return (
      <div style={{ ...ligne, color: "var(--encre-douce)" }}>
        {traceBande ? "Tracez la bande" : "Survolez la parcelle"} : le moteur dira si le geste passe
        là, cette semaine.
      </div>
    );
  }
  // La réponse arrive en quelques millisecondes ; rien plutôt qu'une ligne qui
  // clignoterait à chaque cellule survolée.
  if (!preavis) return null;
  if (preavis.refusals.length > 0) {
    return (
      <div style={{ ...ligne, color: "#8a4b2d" }}>
        ⚠ Ici, cette semaine, le moteur refuserait :{" "}
        {preavis.refusals.map((r) => r.reason).join(" ; ")}.
      </div>
    );
  }
  if (geste === "moissonner" && preavis.grainT !== undefined) {
    return (
      <div style={{ ...ligne, color: "var(--foret)" }}>
        {auMoinsUnKilo(preavis.grainT) ? (
          <>
            ✓ Ici, cette semaine : <strong>{grainLu(preavis.grainT)} de grain</strong> sur pied, que
            la moisson vendrait.
          </>
        ) : (
          <>
            ✓ Le moteur moissonnerait ici, mais il n'y a <strong>pas un kilo de grain</strong> sur
            pied : l'engin serait payé pour rien, et la culture quitterait le champ.
          </>
        )}
      </div>
    );
  }
  return (
    <div style={{ ...ligne, color: "var(--foret)" }}>
      ✓ Ici, cette semaine, le moteur l'accepterait.
    </div>
  );
}

/**
 * **Labourer, semer, moissonner** (#451) : les trois gestes du champ.
 *
 * Le moteur sait faire pousser une culture depuis #136, et aucun bouton ne le
 * lui demandait. Chacun dit **avant le clic** ce que le moteur en publie — le
 * prix et ce que le labour coûte au sol, la fenêtre de semis et la place libre,
 * la date de moisson de la fiche et le prix du grain — puis, au survol, ce que
 * le moteur répondrait là (`CeQueRepondLeMoteur`). Disque ou bande, comme les
 * autres gestes de zone : une parcelle d'essai de blé est une bande.
 */
function GesteDuChampArme({
  geste,
  reglages,
  semaineAnnee,
  zoneVisee,
  preavis,
}: {
  geste: GesteDuChamp;
  reglages: ReglagesDeGeste;
  /** la semaine de l'année ouverte, 0 à 51 — celle que le moteur compare */
  semaineAnnee: number;
  zoneVisee: Zone | undefined;
  preavis: PreavisDuChamp | undefined;
}) {
  const { cultureId, setCultureId, traceBande } = reglages;
  const choisie = cultureDuMoteur(cultureId);
  /** « Nous sommes en semaine 12, en mars » : de quoi comparer à la fenêtre. */
  const maintenant = <>Nous sommes en {semaineDite(semaineAnnee)}.</>;
  return (
    <div style={{ marginTop: 6 }}>
      {geste === "labourer" && <div style={EXPLICATION}>{LABOUR_EXPLIQUE}</div>}
      {geste === "semer" && (
        <>
          {/*
            Les cultures du moteur, dans son ordre — aujourd'hui le seul blé
            tendre d'hiver. Aucune liste tenue ici : le jour où il apprend
            l'orge, le bouton apparaît.
          */}
          {CULTURES.length === 0 ? (
            <div style={EXPLICATION}>Le moteur ne connaît aucune culture à semer.</div>
          ) : (
            CULTURES.map((c) => (
              <button
                key={c.id}
                type="button"
                style={btn(cultureId === c.id)}
                onClick={() => setCultureId(c.id)}
                title={c.nomLatin}
              >
                🌱 {c.nom}
              </button>
            ))
          )}
          {choisie && (
            <div style={EXPLICATION}>
              <strong>Fenêtre de semis</strong> du moteur : {fenetreDeSemisDite(choisie)}.{" "}
              {maintenant} {semisExplique(choisie)}
            </div>
          )}
        </>
      )}
      {geste === "moissonner" && (
        <div style={EXPLICATION}>
          {CULTURES.map((c) => (
            <div key={c.id}>{moissonExpliquee(c)}</div>
          ))}
          {maintenant} {MOISSON_EXPLIQUEE}
        </div>
      )}
      <FormeDuChantier geste={reglages} legende={LEGENDE_RAYON[geste] ?? ""} />
      <CeQueRepondLeMoteur
        geste={geste}
        zoneVisee={zoneVisee}
        traceBande={traceBande}
        preavis={preavis}
      />
    </div>
  );
}

export function PanneauAction({
  game,
  snapshot,
  geste,
  surChoisirEssence,
  zoneVisee,
  preavis,
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
  /**
   * La zone que le geste armé demanderait si on cliquait maintenant (#205).
   *
   * **La zone entière et non son centre** : depuis la bande, le panneau ne peut
   * plus reconstituer l'emprise à partir d'un point et du rayon — une bande a
   * une longueur, une largeur et une orientation, et c'est le tracé du joueur
   * qui les donne.
   */
  zoneVisee?: Zone | undefined;
  /**
   * Ce que le moteur répond au geste du champ armé, sur la zone visée (#451) :
   * `prevoir`, plus le grain sur pied pour une moisson. Absent tant qu'on ne
   * vise rien ou que la réponse n'est pas arrivée.
   */
  preavis?: PreavisDuChamp | undefined;
}) {
  const {
    mode,
    setMode,
    especeId,
    avecManchon,
    rayonChaulage,
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
    traceBande,
  } = geste;

  /**
   * La zone sur laquelle le panneau raisonne.
   *
   * Celle qu'on vise, ou le disque du réglage tant qu'on ne vise rien : le
   * joueur doit pouvoir lire ce que son rayon fait **avant** de survoler la
   * parcelle. En bande, il n'y a rien à supposer — la longueur vient du tracé —
   * donc on ne montre l'arithmétique qu'une fois le tracé commencé.
   */
  const zonePourLeDevis: Zone | undefined =
    zoneVisee ?? (traceBande ? undefined : { x: 0, y: 0, rayonM: rayonChaulage });
  /** L'aire vient du moteur : un disque et une bande ne se mesurent pas pareil. */
  const aireM2 = zonePourLeDevis ? aireM2DeLaZone(zonePourLeDevis) : undefined;
  // Ce que l'éclaircie va garder : c'est l'arithmétique que le joueur ne peut
  // pas faire de tête, et sans elle « densité visée » ne veut rien dire.
  const tigesGardees =
    aireM2 === undefined ? undefined : Math.max(0, Math.round((densiteCible * aireM2) / 10_000));

  // Qui est là, dans le cercle qu'on vise — ou sur toute la parcelle tant
  // qu'on ne vise rien (#156). Recalculé au survol : c'est une somme sur
  // quelques milliers de tiges, et le panneau ne se rend qu'aux changements de
  // cellule (`survol` n'est annoncé qu'aux changements, `VueParcelle`).
  const presentes = useMemo(
    () => essencesPresentes(snapshot.trees, zoneVisee),
    [snapshot.trees, zoneVisee],
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
        style={btn(mode === "fertiliser")}
        onClick={() => setMode("fertiliser")}
        title="Épandre de l'ammonitrate, du fumier ou de la potasse sur une zone"
      >
        🧪 Fertiliser
      </button>
      {/*
        **Les gestes du champ** (#451), dans l'ordre où on les fait : préparer le
        lit, semer, récolter. Rangés après la fertilisation, avec laquelle ils
        font les dispositifs des essais du blé.
      */}
      <button
        type="button"
        style={btn(mode === "labourer")}
        onClick={() => setMode("labourer")}
        title="Retourner le sol d'une zone : un lit de semence, au prix de l'humus et des mycorhizes"
      >
        🚜 Labourer
      </button>
      <button
        type="button"
        style={btn(mode === "semer")}
        onClick={() => setMode("semer")}
        title="Semer une culture sur la place libre d'une zone, dans sa fenêtre de semis"
      >
        🌱 Semer
      </button>
      <button
        type="button"
        style={btn(mode === "moissonner")}
        onClick={() => setMode("moissonner")}
        title="Moissonner une zone : le grain sur pied part en vente, la paille reste au champ"
      >
        🌾 Moissonner
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

      {mode === "fertiliser" && <ChoixDeLEngrais geste={geste} />}

      {(mode === "labourer" || mode === "semer" || mode === "moissonner") && (
        <GesteDuChampArme
          geste={mode}
          reglages={geste}
          semaineAnnee={snapshot.week % 52}
          zoneVisee={zoneVisee}
          preavis={preavis}
        />
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
                  ? `Dans ${ditLaZone(zoneVisee, rayonChaulage)} visée :`
                  : traceBande
                    ? "Sur toute la parcelle (tracez la bande pour viser) :"
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
          <FormeDuChantier geste={geste} />
          <div style={{ color: "var(--encre-douce)", fontSize: 13, marginTop: 4 }}>
            {critereEclaircie === "espece" ? (
              tigesVisees === undefined ? (
                <>Choisissez l'essence à nettoyer dans la liste ci-dessus.</>
              ) : (
                <>
                  {capitale(ditLaZone(zonePourLeDevis, rayonChaulage))}
                  {aireM2 === undefined ? "" : ` fait ${Math.round(aireM2)} m²`} : on y abat{" "}
                  <strong>
                    {tigesVisees === 1 ? "la seule tige" : `les ${tigesVisees} tiges`}{" "}
                    {de(auFilDuTexte(nomVise))}
                  </strong>{" "}
                  et rien d'autre.
                </>
              )
            ) : tigesGardees === undefined ? (
              <>Tracez la bande : la longueur décide de ce qu'on garde.</>
            ) : (
              <>
                {capitale(ditLaZone(zonePourLeDevis, rayonChaulage))} fait {Math.round(aireM2 ?? 0)}{" "}
                m² : à {densiteCible} tiges/ha, on y <strong>garde {tigesGardees} tiges</strong> et
                on abat tout le reste, en commençant par les{" "}
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
          <FormeDuChantier
            geste={geste}
            {...(LEGENDE_RAYON[mode] ? { legende: LEGENDE_RAYON[mode] } : {})}
          />
        </div>
      )}
    </>
  );
}
