/**
 * L'écran de jeu : parcelle en vue OBLIQUE (les arbres montrent leur hauteur,
 * triés du fond vers l'avant) sur le sol en vue de dessus, HUD, fil
 * d'événements, actions (planter, couper, récolter, chauler, embaucher).
 * Rendu Canvas 2D — l'isométrique complète viendra comme couche visuelle.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formeSaisonniere,
  rechauffementFranceC,
  rechauffementGlobalC,
  SCENARIOS,
  type ScenarioId,
} from "../engine/climat";
import { type EauDeSurface, profondeurNappeCm, resumeEau, SANS_EAU } from "../engine/eau_surface";
import { getEspece } from "../engine/especes";
import {
  type Bordures,
  bordersUniformes,
  entourageDeLaStation,
  frequentationDesBordures,
  PAYSAGES,
  resumeBordures,
} from "../engine/paysage";
import {
  ALTITUDE_SERIE_M,
  altitudeParCellule,
  anomalieAltitudeC,
  anomalieExpositionC,
  coefficientRuissellement,
  facteurExpositionRayonnement,
  penteParCellule,
  type Relief,
  RUISSELLEMENT_AMONT,
} from "../engine/relief";
import { STATIONS_V0 } from "../engine/stations";
import type { Orientation } from "../render/projection";
import { lignesDuBilan } from "./bilan";
import { EditeurTerrain, terrainInitial } from "./EditeurTerrain";
import type { Niveau } from "./niveaux";
import { NIVEAUX_LIVRES } from "./niveauxLivres";
import { PlanEau } from "./PlanEau";
import { Avis } from "./panneaux/Avis";
import { Bandeau } from "./panneaux/Bandeau";
import { CarteDuSol } from "./panneaux/CarteDuSol";
import { FinDeNiveau } from "./panneaux/FinDeNiveau";
import { PanneauAction } from "./panneaux/PanneauAction";
import { PanneauArbres } from "./panneaux/PanneauArbres";
import { PanneauBilan } from "./panneaux/PanneauBilan";
import { PanneauEssences } from "./panneaux/PanneauEssences";
import { PanneauJournal } from "./panneaux/PanneauJournal";
import { PanneauMenu } from "./panneaux/PanneauMenu";
import { PanneauNiveau } from "./panneaux/PanneauNiveau";
import { PanneauScores } from "./panneaux/PanneauScores";
import { PanneauSelection } from "./panneaux/PanneauSelection";
import { PanneauSuivis } from "./panneaux/PanneauSuivis";
import { useReglagesDeGeste } from "./panneaux/reglages";
import { btn, panel, SCENE, VOLET } from "./panneaux/styles";
import { Angle, BoutonDeVolet, useVolets, Volet } from "./panneaux/Volet";
import { arbresAPoser, donneesSolDe } from "./parcelle";
import {
  chargerProfils,
  enregistrerProfil,
  lireProfilExporte,
  PROFILS_LIVRES,
  type ProfilDepart,
  supprimerProfil,
} from "./profils";
import type { SaveGame } from "./protocol";
import {
  type EntreeSauvegarde,
  essencesPlantees,
  listerSauvegardes,
  reglagesDeLaPartie,
  supprimerSauvegarde,
} from "./sauvegardes";
import { useBilan } from "./useBilan";
import { useEllipse, vitesseDeRelecture } from "./useEllipse";
import { useGame } from "./useGame";
import { useNiveau } from "./useNiveau";
import { useSuivis } from "./useSuivis";
import { VueParcelle } from "./VueParcelle";

function StartScreen({
  onStart,
  onResume,
  onNiveau,
}: {
  onStart: (
    stationId: string,
    seed: number,
    meteo: "reelle" | "synthetique",
    scenario: ScenarioId,
    bordures: Bordures,
    relief: Relief,
    eau: EauDeSurface,
    nappeCm: number,
    partBassin: number,
    maturationAns: number,
    anneeDepart: number,
    economie: boolean,
  ) => void;
  /** reprendre la partie que la liste désigne (#147) */
  onResume: (entree: EntreeSauvegarde) => void;
  /** lancer un niveau : il pose lui-même ses réglages (#188) */
  onNiveau: (niveau: Niveau) => void;
}) {
  const [stationId, setStationId] = useState(STATIONS_V0[0]?.station.id ?? "");
  const [seed, setSeed] = useState(42);
  const [scenario, setScenario] = useState<ScenarioId>("ssp245");
  const [bordures, setBordures] = useState<Bordures>(bordersUniformes(PAYSAGES[1]?.id ?? "bocage"));
  const [cotesSeparees, setCotesSeparees] = useState(false);
  const [anneeDepart, setAnneeDepart] = useState(2026);
  const [relief, setRelief] = useState<Relief>(
    STATIONS_V0[0]?.station.relief ?? {
      altitudeM: 120,
      pentePct: 0,
      expositionDeg: 180,
      forme: "plan",
      bassinAmontHa: 0,
    },
  );
  const [eau, setEau] = useState<EauDeSurface>(SANS_EAU);
  const [partBassin, setPartBassin] = useState(0);
  /**
   * Le bac à sable est-il ouvert ? (#189)
   *
   * Un ÉTAT et pas une page à part : les deux écrans partagent les réglages,
   * et revenir de l'un à l'autre ne doit rien perdre de ce qu'on a posé.
   *
   * L'entrée pousse une entrée d'historique, et la sortie la consomme. C'est ce
   * qui fait que le bouton retour du navigateur remonte d'UN écran et pas de
   * deux, comme #148 l'a établi pour la sortie de partie — avec un écran de
   * plus, la règle doit continuer de valoir.
   */
  const [bac, setBac] = useState(false);
  const sortieDuBac = useRef(false);
  const entrerDansLeBac = () => {
    sortieDuBac.current = false;
    history.pushState({ canopee: "bac" }, "");
    setBac(true);
  };
  const quitterLeBac = () => {
    sortieDuBac.current = true;
    if (window.history.state?.canopee === "bac") history.back();
    setBac(false);
  };
  useEffect(() => {
    if (!bac) return;
    const surRetour = () => {
      if (sortieDuBac.current) return;
      sortieDuBac.current = true;
      setBac(false);
    };
    window.addEventListener("popstate", surRetour);
    return () => window.removeEventListener("popstate", surRetour);
  }, [bac]);

  const [profils, setProfils] = useState<ProfilDepart[]>(() => chargerProfils());
  const [nomProfil, setNomProfil] = useState("");
  const [importTexte, setImportTexte] = useState("");
  const [messageProfil, setMessageProfil] = useState("");
  const [nappeCm, setNappeCm] = useState(STATIONS_V0[0]?.station.profondeurNappeEquilibreCm ?? 300);
  const [terrain, setTerrain] = useState<number[] | undefined>(undefined);
  const [maturationAns, setMaturationAns] = useState(0);
  /**
   * L'argent contraint-il la partie ? Certaines questions ne sont pas
   * économiques — une succession sur deux siècles, l'effet du chêne-liège sur
   * le feu — et devoir d'abord tenir une trésorerie pour y répondre n'ajoute
   * pas de réalisme (actions.ts).
   */
  const [economie, setEconomie] = useState(true);
  /**
   * LES PARTIES SAUVEGARDÉES (#147) : on ne les lit qu'au montage. La liste ne
   * change pas sous nos yeux — c'est le jeu qui écrit dedans, et il n'y a pas
   * de jeu tant que cet écran est là.
   */
  const [parties, setParties] = useState<EntreeSauvegarde[]>(() => listerSauvegardes(localStorage));
  const [partieChoisie, setPartieChoisie] = useState<string>();
  const choisieEntree = parties.find((e) => e.id === partieChoisie);

  /**
   * PRÉ-REMPLIR L'ÉCRAN avec les réglages d'une partie (#147).
   *
   * Tout sauf la graine : c'est elle qu'on change pour éprouver un résultat.
   * Les valeurs absentes de la sauvegarde sont celles que la partie n'avait pas
   * choisies — on laisse alors ce qui est à l'écran, plutôt que d'inventer un
   * défaut qui n'a jamais été le sien.
   */
  const appliquerLesReglages = (save: SaveGame): void => {
    // **Une station qu'on ne connaît plus ne se choisit pas.** Une sauvegarde
    // d'une version où la station s'appelait autrement laisserait sinon
    // l'écran sur un identifiant inexistant, et « Démarrer » n'ouvrirait
    // jamais de partie — un cul-de-sac sans un mot. Le reste des réglages, lui,
    // se charge quand même.
    if (STATIONS_V0.some((s) => s.station.id === save.stationId)) setStationId(save.stationId);
    setScenario(save.scenario);
    setAnneeDepart(save.anneeDepart);
    setSeed(Math.floor(Math.random() * 10_000));
    setBordures(save.bordures ?? bordersUniformes(save.paysageId));
    if (save.relief) {
      setRelief(save.relief);
      setTerrain(save.relief.altitudesM ? [...save.relief.altitudesM] : undefined);
    }
    if (save.eau) setEau(save.eau);
    if (save.nappeCm !== undefined) setNappeCm(save.nappeCm);
    if (save.partBassin !== undefined) setPartBassin(save.partBassin);
    setMaturationAns(save.maturationAns ?? 0);
    setEconomie(save.economie ?? true);
  };

  const choisie = STATIONS_V0.find((s) => s.station.id === stationId);
  /**
   * Choisir un terrain remet le relief d'origine de la station — c'est celui
   * qui va avec ce sol, un podzol landais n'est pas sur un flanc de montagne —
   * et abandonne le modelage, qui valait pour une parcelle d'une autre taille.
   *
   * Tout se fait ICI, dans le gestionnaire de clic, et non dans un effet : un
   * effet se déclenche APRÈS le rendu, si bien qu'un joueur qui choisissait
   * une station puis ouvrait l'éditeur voyait son modelage effacé dans la
   * foulée par l'effet en retard.
   */
  const choisirStation = (id: string) => {
    setStationId(id);
    const s = STATIONS_V0.find((x) => x.station.id === id);
    if (s) setRelief(s.station.relief);
    setTerrain(undefined);
    setEau((e) => (e.type === "terrain" ? SANS_EAU : e));
    if (s?.station.profondeurNappeEquilibreCm !== undefined) {
      setNappeCm(s.station.profondeurNappeEquilibreCm);
    }
  };
  // Ce que l'entourage donnera vraiment, calculé par le moteur lui-même : les
  // semis annoncés par un paysage sont filtrés par ce que CE sol supporte.
  const entourage = useMemo(
    () =>
      choisie
        ? entourageDeLaStation(bordures, choisie.station.phInitial, choisie.station.ruMm)
        : null,
    [bordures, choisie],
  );
  const semisParAn = entourage?.voisinage.reduce((s, v) => s + v.semisParAn, 0) ?? 0;
  const essences = [...(entourage?.voisinage ?? [])]
    .sort((a, b) => b.semisParAn - a.semisParAn)
    .slice(0, 3)
    .map((v) => getEspece(v.especeId).nom.toLowerCase());

  // Le terrain dessiné remplace la silhouette paramétrique (relief.ts), et il
  // impose l'eau déduite : on ne déclare plus rien, c'est le modelé qui parle.
  const reliefFinal: Relief = terrain ? { ...relief, altitudesM: terrain } : relief;

  // Ce que le relief change, calculé par le moteur : température avec
  // l'altitude, rayonnement avec l'exposition, part de la pluie qui file en
  // surface au lieu de s'infiltrer, et ce qui arrive du bassin d'amont.
  const anomalieC = anomalieAltitudeC(relief, ALTITUDE_SERIE_M);
  const rayonnement = facteurExpositionRayonnement(relief);
  const anomalieExposition = anomalieExpositionC(relief);
  // Quand le terrain est dessiné, la pente n'est plus un réglage : elle se lit
  // sur le modelé, exactement comme le moteur la lira (relief.ts).
  const penteEffective = useMemo(() => {
    if (!terrain || !choisie) return relief.pentePct;
    const pentes = penteParCellule(terrain, {
      widthM: choisie.station.coteM,
      heightM: choisie.station.coteM,
    });
    let somme = 0;
    for (const p of pentes) somme += p;
    return somme / pentes.length;
  }, [terrain, choisie, relief.pentePct]);
  const ruissellementNu = coefficientRuissellement(penteEffective, 0.1, 0.5);
  const ruissellementCouvert = coefficientRuissellement(penteEffective, 0.95, 0.5);
  const pluieHebdoMm = (choisie?.climat.rainAnnualMm ?? 800) / 52;
  const surfaceHa = (choisie?.station.coteM ?? 100) ** 2 / 10000;
  const amontMm = (pluieHebdoMm * RUISSELLEMENT_AMONT * relief.bassinAmontHa) / surfaceHa;

  // Aperçu du champ de nappe sur CETTE parcelle : mêmes fonctions que le
  // moteur, appliquées au terrain et au relief choisis.
  const nappe = useMemo(() => {
    if (!choisie || eau.type === "aucune") return undefined;
    const dims = { widthM: choisie.station.coteM, heightM: choisie.station.coteM };
    const champ = profondeurNappeCm(
      eau,
      altitudeParCellule(reliefFinal, dims),
      dims,
      choisie.station.profil,
    );
    let proche = Number.POSITIVE_INFINITY;
    let loin = 0;
    for (const v of champ) {
      if (Number.isFinite(v)) {
        proche = Math.min(proche, v);
        loin = Math.max(loin, v);
      }
    }
    return { proche: Number.isFinite(proche) ? proche : 0, loin };
  }, [choisie, eau, reliefFinal]);

  /** L'état courant de l'écran, figé en profil. */
  const profilCourant = (nom: string): ProfilDepart => ({
    version: 1,
    nom,
    stationId,
    bordures,
    relief: reliefFinal,
    eau,
    nappeCm,
    partBassinSemblable: partBassin,
    scenario,
    anneeDepart,
    maturationAns,
  });

  /** Repose tout l'écran dans l'état décrit par un profil. */
  const appliquerProfil = (p: ProfilDepart) => {
    setStationId(p.stationId);
    setBordures(p.bordures);
    setCotesSeparees(new Set(Object.values(p.bordures)).size > 1);
    setRelief(p.relief);
    setTerrain(p.relief.altitudesM ? [...p.relief.altitudesM] : undefined);
    setEau(p.eau);
    setNappeCm(p.nappeCm);
    setPartBassin(p.partBassinSemblable);
    setScenario(p.scenario);
    setAnneeDepart(p.anneeDepart);
    setMaturationAns(p.maturationAns);
    setNomProfil(p.nom);
  };

  const setCote = (cote: keyof Bordures, id: string) =>
    setBordures(cotesSeparees ? { ...bordures, [cote]: id } : bordersUniformes(id));

  const selecteur = (cote: keyof Bordures, libelle: string) => (
    <label className="cote">
      <span className="cote-nom">{libelle}</span>
      <select value={bordures[cote]} onChange={(e) => setCote(cote, e.target.value)}>
        {PAYSAGES.map((p) => (
          <option key={p.id} value={p.id} title={p.description}>
            {p.court}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="depart">
      {bac ? (
        <>
          <h2>Bac à sable</h2>
          <p className="accroche">
            Un sol, un entourage, un climat — et cinquante ans devant vous. Rien n'est
            scripté&nbsp;: tout ce qui arrivera découlera de ces choix-là.
          </p>
          <p className="seg">
            <button type="button" style={btn()} onClick={quitterLeBac}>
              ← Retour
            </button>
          </p>
        </>
      ) : (
        <>
          <h2>Jouer</h2>
          <p className="accroche">
            Une parcelle, un objectif, et le temps qu'il faut à un arbre pour pousser.
          </p>
        </>
      )}

      {/*
        LES NIVEAUX SONT LA PORTE (#189), et les quatorze réglages sont passés
        derrière un mode. `v1.md` : « Un écran de démarrage qui n'est pas un banc
        d'essai. Aujourd'hui il demande quatorze réglages […] Un niveau pose ces
        réglages lui-même ; le joueur ne les voit pas. »

        Le bac à sable NE DISPARAÎT PAS, et c'est écrit noir sur blanc dans le
        même document : « c'est lui qui permettra aux experts de reproduire une
        situation précise et de contester un résultat ». Le premier public du
        jeu est celui des experts de sol et de biodiversité ; leur retirer les
        réglages leur retirerait le moyen de contester.
      */}
      {!bac && (
        <section className="carte">
          <h3>Niveaux</h3>
          <p className="sous">
            Un objectif, des étapes, et une fin. Les réglages du terrain sont posés par le niveau.
          </p>
          {NIVEAUX_LIVRES.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onNiveau(n)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginTop: 8,
                padding: "10px 12px",
                border: "1px solid var(--trait)",
                borderLeft: "6px solid var(--foret)",
                borderRadius: 8,
                background: "var(--carte)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <strong>▶ {n.nom}</strong>
              <div className="sous" style={{ marginTop: 2 }}>
                {n.enonce}
              </div>
            </button>
          ))}
        </section>
      )}

      {/*
        LE BAC À SABLE A SA PROPRE CARTE, et pas un bouton glissé sous les
        niveaux : ce n'est pas une variante d'un niveau, c'est l'autre porte. La
        capture de la première version le montrait mieux qu'un raisonnement — le
        bouton, posé au bas de la carte « Niveaux », avait l'air d'en dépendre.
      */}
      {!bac && (
        <section className="carte">
          <h3>Bac à sable</h3>
          <p className="sous">
            Poser soi-même le sol, l'entourage, le relief, le climat, et regarder ce qui arrive.
            Sans objectif ni fin — c'est le mode qui permet de reproduire une situation précise, ou
            de contester un résultat.
          </p>
          <button type="button" style={btn()} onClick={entrerDansLeBac}>
            ⚙ Régler une partie
          </button>
        </section>
      )}

      {/*
        LES PARTIES SAUVEGARDÉES (#147). Il y en avait une seule, et démarrer
        une partie l'écrasait au premier autosave : « changer des paramètres,
        lancer, sortir — et plus aucun moyen de relire les paramètres de la
        partie précédente ». Rien de nouveau n'est stocké pour autant : la
        sauvegarde portait déjà tout, il lui manquait un rangement et de quoi
        se relire.
      */}
      {!bac && parties.length > 0 && (
        <section className="carte">
          <h3>Parties sauvegardées</h3>
          <p className="sous">
            Cliquez une partie pour relire ses réglages : la reprendre, ou repartir des mêmes
            conditions avec une autre graine.
          </p>
          <div className="seg">
            {parties.map((e) => (
              <button
                key={e.id}
                type="button"
                style={btn(e.id === partieChoisie)}
                onClick={() => setPartieChoisie(e.id === partieChoisie ? undefined : e.id)}
                title={`${e.save.actions.length} actions · ${new Date(e.quand).toLocaleString("fr-FR")}`}
              >
                {e.nom}
              </button>
            ))}
          </div>
          {choisieEntree && (
            <div style={{ marginTop: 8 }}>
              <table style={{ borderCollapse: "collapse", marginBottom: 8 }}>
                <tbody>
                  {reglagesDeLaPartie(choisieEntree.save).map((l) => (
                    <tr key={l.quoi}>
                      <td style={{ paddingRight: 12, color: "var(--encre-douce)" }}>{l.quoi}</td>
                      <td>{l.valeur}</td>
                    </tr>
                  ))}
                  {essencesPlantees(choisieEntree.save).length > 0 && (
                    <tr>
                      <td style={{ paddingRight: 12, color: "var(--encre-douce)" }}>Plantations</td>
                      <td>{essencesPlantees(choisieEntree.save).join(", ")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <button type="button" style={btn(true)} onClick={() => onResume(choisieEntree)}>
                ▶ Reprendre cette partie
              </button>
              {/*
                **Repartir de ces réglages, graine libre.** C'est la porte du
                mode expert : contester un résultat suppose de pouvoir rejouer
                exactement les mêmes conditions — sauf le hasard, qu'on change
                justement pour voir si le résultat tient.
              */}
              <button
                type="button"
                style={btn()}
                onClick={() => {
                  appliquerLesReglages(choisieEntree.save);
                  setPartieChoisie(undefined);
                  setMessageProfil(
                    `Réglages de « ${choisieEntree.nom} » chargés, avec une graine neuve.`,
                  );
                }}
              >
                ⚙ Repartir de ces réglages
              </button>
              <button
                type="button"
                style={btn()}
                onClick={() => {
                  setParties(supprimerSauvegarde(localStorage, choisieEntree.id));
                  setPartieChoisie(undefined);
                }}
                title="Effacer cette sauvegarde"
              >
                🗑 Oublier
              </button>
            </div>
          )}
        </section>
      )}

      {bac && (
        <>
          <section className="carte">
            <h3>Le terrain</h3>
            <p className="sous">
              Le sol décide de ce qu'il retient d'eau, de ce qu'il minéralise, de ce qu'il supporte.
            </p>
            <div className="seg">
              {STATIONS_V0.map((s) => (
                <button
                  key={s.station.id}
                  type="button"
                  style={btn(s.station.id === stationId)}
                  onClick={() => choisirStation(s.station.id)}
                >
                  {s.station.nom}
                </button>
              ))}
            </div>
            {choisie && (
              <p className="glose">
                {choisie.station.coteM} × {choisie.station.coteM} m · réserve utile{" "}
                {choisie.station.ruMm.toFixed(0)} mm · pH {choisie.station.phInitial.toFixed(1)} ·{" "}
                {choisie.climat.rainAnnualMm} mm de pluie par an ·{" "}
                {choisie.station.relief.pentePct > 0
                  ? `pente ${choisie.station.relief.pentePct} % à ${choisie.station.relief.altitudeM} m`
                  : `terrain plat à ${choisie.station.relief.altitudeM} m`}
              </p>
            )}
          </section>

          <section className="carte">
            <h3>Ce qu'il y a autour</h3>
            <p className="sous">
              L'entourage décide du gibier, des semis qui arrivent tout seuls, de l'azote qui tombe
              du ciel, du vent et des départs de feu.
            </p>
            {cotesSeparees ? (
              <div className="compas">
                <div />
                {selecteur("nord", "NORD")}
                <div />
                {selecteur("ouest", "OUEST")}
                <div className="parcelle">votre parcelle</div>
                {selecteur("est", "EST")}
                <div />
                {selecteur("sud", "SUD")}
                <div />
              </div>
            ) : (
              <div className="seg">
                {PAYSAGES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={btn(p.id === bordures.nord)}
                    onClick={() => setCote("nord", p.id)}
                    title={p.description}
                  >
                    {p.court}
                  </button>
                ))}
              </div>
            )}
            <p style={{ margin: "10px 0 0", fontSize: 13 }}>
              <label style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={cotesSeparees}
                  onChange={(e) => setCotesSeparees(e.target.checked)}
                />{" "}
                un entourage différent de chaque côté
              </label>
            </p>
            <p className="glose" style={{ minHeight: 0 }}>
              {cotesSeparees
                ? resumeBordures(bordures)
                : PAYSAGES.find((p) => p.id === bordures.nord)?.description}
            </p>
            {entourage && (
              <div className="effets">
                <span title="densité de cervidés : ils broutent les pousses et frottent les jeunes tiges">
                  🦌 {entourage.gibierParHa.toFixed(1)} cervidé/ha
                </span>
                <span title="semis arrivant du voisinage, après filtrage par ce que ce sol supporte">
                  🌱 {semisParAn} semis/an{essences.length > 0 && ` — ${essences.join(", ")}`}
                </span>
                <span title="dépôts atmosphériques d'azote (élevages, trafic, cultures)">
                  💧 {entourage.depositionNKgHaAn.toFixed(0)} kg N/ha/an
                </span>
                <span title="exposition au vent : un côté ouvert suffit à laisser passer">
                  💨 vent {(entourage.ventExposition * 100).toFixed(0)} %
                </span>
                <span title="fréquentation humaine : d'où partent les feux">
                  🔥 départs ×{frequentationDesBordures(bordures).toFixed(1)}
                </span>
              </div>
            )}
          </section>

          <section className="carte">
            <h3>Le relief</h3>
            <p className="sous">
              L'eau et la chaleur ne se répartissent pas à plat : une pente fait filer la pluie, un
              versant sud grille, un vallon reçoit ce que le bassin d'amont lui envoie.
            </p>
            <div className="reglages">
              <label htmlFor="altitude">Altitude</label>
              <input
                id="altitude"
                type="range"
                min={20}
                max={1600}
                step={20}
                value={relief.altitudeM}
                onChange={(e) => setRelief({ ...relief, altitudeM: Number(e.target.value) })}
              />
              <span className="valeur">{relief.altitudeM} m</span>

              <label htmlFor="pente">Pente</label>
              <input
                id="pente"
                type="range"
                min={0}
                max={45}
                step={1}
                value={relief.pentePct}
                disabled={terrain !== undefined}
                title={
                  terrain
                    ? "La pente se lit sur le terrain que vous avez dessiné"
                    : "Pente moyenne de la parcelle"
                }
                onChange={(e) => setRelief({ ...relief, pentePct: Number(e.target.value) })}
              />
              <span className="valeur">
                {terrain ? `${penteEffective.toFixed(1)} % (dessinée)` : `${relief.pentePct} %`}
              </span>

              <label htmlFor="amont">Bassin amont</label>
              <input
                id="amont"
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={relief.bassinAmontHa}
                onChange={(e) => setRelief({ ...relief, bassinAmontHa: Number(e.target.value) })}
              />
              <span className="valeur">{relief.bassinAmontHa.toFixed(1)} ha</span>

              <span className="intitule">Exposition</span>
              <div className="choix">
                {(
                  [
                    [0, "Nord (ubac)"],
                    [90, "Est"],
                    [180, "Sud (adret)"],
                    [270, "Ouest"],
                  ] as const
                ).map(([deg, libelle]) => (
                  <button
                    key={deg}
                    type="button"
                    style={btn(relief.expositionDeg === deg)}
                    disabled={relief.pentePct === 0 && !terrain}
                    title={
                      relief.pentePct === 0
                        ? "Sans pente, l'exposition ne change rien"
                        : "Le versant que regarde la pente"
                    }
                    onClick={() => setRelief({ ...relief, expositionDeg: deg })}
                  >
                    {libelle}
                  </button>
                ))}
              </div>

              <span className="intitule">Forme</span>
              <div className="choix">
                {(
                  [
                    ["plan", "Versant régulier", "Une pente d'un seul tenant."],
                    [
                      "vallon",
                      "Vallon (entonnoir)",
                      "Les versants convergent : l'eau se concentre au milieu de la parcelle.",
                    ],
                    [
                      "croupe",
                      "Croupe (dos d'âne)",
                      "Le terrain bombe : l'eau s'écarte des deux côtés et le sommet reste sec.",
                    ],
                  ] as const
                ).map(([forme, libelle, aide]) => (
                  <button
                    key={forme}
                    type="button"
                    style={btn(relief.forme === forme)}
                    disabled={terrain !== undefined}
                    title={terrain ? "Sans effet : votre terrain dessiné fait foi" : aide}
                    onClick={() => setRelief({ ...relief, forme })}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
            </div>
            <div className="effets">
              <span title="0,6 °C de moins par 100 m d'altitude, et l'écart entre adret et ubac">
                🌡 {anomalieC + anomalieExposition >= 0 ? "+" : ""}
                {(anomalieC + anomalieExposition).toFixed(1)} °C
                <span className="detail">
                  {" "}
                  (altitude {anomalieC >= 0 ? "+" : ""}
                  {anomalieC.toFixed(1)}, exposition {anomalieExposition >= 0 ? "+" : ""}
                  {anomalieExposition.toFixed(1)})
                </span>
              </span>
              <span title="un versant sud reçoit plus d'énergie : il évapore plus et sèche plus tôt">
                ☀️ rayonnement {rayonnement >= 1 ? "+" : ""}
                {((rayonnement - 1) * 100).toFixed(0)} %
              </span>
              <span title="part de la pluie qui file en surface au lieu de s'infiltrer">
                💧 ruissellement {(ruissellementNu * 100).toFixed(0)} % à nu ·{" "}
                {(ruissellementCouvert * 100).toFixed(0)} % sous couvert
              </span>
              <span title="eau reçue du bassin situé au-dessus, en semaine de pluie moyenne">
                ⬇️ {amontMm.toFixed(1)} mm/sem d'amont
              </span>
              <span title="la forme décide de la façon dont l'eau se rassemble ou s'écarte">
                {relief.forme === "vallon"
                  ? "🕳 l'eau converge au milieu"
                  : relief.forme === "croupe"
                    ? "⛰ l'eau s'écarte, le sommet sèche"
                    : "▱ versant régulier, l'eau descend tout droit"}
              </span>
            </div>
          </section>

          <section className="carte">
            <h3>L'eau de surface</h3>
            <p className="sous">
              Un ruisseau ou une mare, ce n'est pas un décor : c'est une nappe sous vos pieds. Elle
              affleure au bord, s'enfonce en s'éloignant, et c'est elle — pas une règle sur les
              espèces — qui fait pousser l'aulne là où le hêtre se noie.
            </p>
            <div className="reglages" style={{ marginBottom: 12 }}>
              <label htmlFor="nappe">Nappe</label>
              <input
                id="nappe"
                type="range"
                min={30}
                max={800}
                step={10}
                value={nappeCm}
                onChange={(e) => setNappeCm(Number(e.target.value))}
                title="Profondeur d'équilibre de la nappe, celle que le réseau régional impose"
              />
              <span className="valeur">{(nappeCm / 100).toFixed(1)} m</span>

              <label htmlFor="bassin">Bassin semblable</label>
              <input
                id="bassin"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(partBassin * 100)}
                onChange={(e) => setPartBassin(Number(e.target.value) / 100)}
                title="Part du bassin versant qui subit le même sort que la parcelle"
              />
              <span className="valeur">{Math.round(partBassin * 100)} %</span>
            </div>
            <p className="glose" style={{ minHeight: 0, marginTop: 0 }}>
              {partBassin === 0
                ? "Parcelle isolée : quoi qu'il lui arrive, la région tient le niveau de la nappe."
                : partBassin >= 0.9
                  ? "La parcelle vaut pour tout son bassin : si elle brûle, le massif brûle, et la nappe régionale remonte avec."
                  : "Une partie du bassin suit le sort de la parcelle : la nappe régionale bouge, mais moins qu'elle."}
            </p>
            <p className="glose" style={{ minHeight: 0, marginTop: 0 }}>
              {nappeCm <= 100
                ? "Nappe affleurante : le sol reste engorgé, seules les espèces qui le tolèrent tiendront."
                : nappeCm <= 250
                  ? "Nappe à portée des racines : elles iront y puiser en été, et la forêt la fera baisser en transpirant."
                  : "Nappe profonde : la parcelle ne vit que de sa pluie."}{" "}
              Elle est plus PLATE que le terrain — sous une butte elle s'enfonce, dans un creux elle
              affleure.
            </p>
            <div className="seg">
              {(
                [
                  ["aucune", "Aucune"],
                  ["ruisseau", "Un ruisseau"],
                  ["mare", "Une mare"],
                ] as const
              ).map(([type, libelle]) => (
                <button
                  key={type}
                  type="button"
                  style={btn(eau.type === type)}
                  onClick={() =>
                    setEau(
                      type === "aucune"
                        ? SANS_EAU
                        : type === "ruisseau"
                          ? { type, cote: "sud", bergeM: 0.3 }
                          : { type, xRel: 0.5, yRel: 0.5, rayonM: 4, bergeM: 0.6 },
                    )
                  }
                >
                  {libelle}
                </button>
              ))}
            </div>
            {eau.type !== "aucune" && (
              <div className="reglages" style={{ marginTop: 10 }}>
                {eau.type === "mare" && (
                  <>
                    <label htmlFor="rayon">Rayon</label>
                    <input
                      id="rayon"
                      type="range"
                      min={2}
                      max={12}
                      step={1}
                      value={eau.rayonM ?? 4}
                      onChange={(e) => setEau({ ...eau, rayonM: Number(e.target.value) })}
                    />
                    <span className="valeur">{eau.rayonM ?? 4} m</span>
                  </>
                )}
                <label htmlFor="berge">Encaissement</label>
                <input
                  id="berge"
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={eau.bergeM}
                  onChange={(e) => setEau({ ...eau, bergeM: Number(e.target.value) })}
                />
                <span className="valeur">{eau.bergeM.toFixed(1)} m</span>
              </div>
            )}
            {eau.type !== "aucune" && choisie && (
              <PlanEau eau={eau} coteM={choisie.station.coteM} onChange={setEau} />
            )}
            {nappe && (
              <div className="effets">
                <span title="profondeur de la nappe sous la cellule la plus proche de l'eau">
                  💧 nappe à {nappe.proche.toFixed(0)} cm au bord
                </span>
                <span title="profondeur de la nappe au point le plus éloigné de l'eau">
                  🏜 {nappe.loin > 350 ? "hors de portée" : `${nappe.loin.toFixed(0)} cm`} au plus
                  loin
                </span>
                <span>{resumeEau(eau)}</span>
              </div>
            )}
          </section>

          <section className="carte">
            <h3>Modeler le terrain</h3>
            <p className="sous">
              Facultatif. Creusez, montez, lissez — et l'eau apparaît d'elle-même là où le terrain
              la retient. Ce n'est pas un décor : la cuvette qui tient l'eau tiendra une nappe, et
              la nappe fera la ripisylve.
            </p>
            <div className="seg">
              <button
                type="button"
                style={btn(terrain !== undefined)}
                onClick={() => {
                  if (terrain) {
                    setTerrain(undefined);
                    if (eau.type === "terrain") setEau(SANS_EAU);
                  } else if (choisie) {
                    setTerrain(terrainInitial(choisie.station.coteM, relief.pentePct));
                    setEau({ type: "terrain", bergeM: 0 });
                  }
                }}
              >
                {terrain ? "↩ revenir au relief paramétré" : "✎ dessiner le terrain"}
              </button>
            </div>
            {terrain && choisie && (
              <div style={{ marginTop: 10 }}>
                <EditeurTerrain
                  coteM={choisie.station.coteM}
                  pluieAnnuelleMm={choisie.climat.rainAnnualMm}
                  profil={choisie.station.profil}
                  valeur={terrain}
                  onChange={setTerrain}
                />
              </div>
            )}
          </section>

          <section className="carte">
            <h3>Avant votre arrivée</h3>
            <p className="sous">
              Un terrain qu'on vient de modeler n'est qu'une topographie. L'humus, l'herbe, les
              semis venus du voisinage et la ceinture d'arbres autour de l'eau demandent du temps —
              on peut le lui donner d'avance.
            </p>
            <div className="reglages">
              <label htmlFor="maturation">Vieillissement</label>
              <input
                id="maturation"
                type="range"
                min={0}
                max={120}
                step={5}
                value={maturationAns}
                onChange={(e) => setMaturationAns(Number(e.target.value))}
              />
              <span className="valeur">
                {maturationAns === 0 ? "aucun" : `${maturationAns} ans`}
              </span>
            </div>
            <p className="glose" style={{ minHeight: 0 }}>
              {maturationAns === 0
                ? "Vous arrivez sur le terrain tel qu'il est décrit ci-dessus."
                : `Le moteur simule ${maturationAns} ans sans vous (${anneeDepart - maturationAns}-${anneeDepart}), puis vous arrivez. Ce qui aura poussé aura poussé tout seul.`}
            </p>
          </section>

          <section className="carte">
            <h3>Le climat</h3>
            <p className="sous">Ce qu'on plante aujourd'hui vivra dedans.</p>
            <div className="seg">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  style={btn(sc.id === scenario)}
                  onClick={() => setScenario(sc.id)}
                  title={sc.description}
                >
                  {sc.nom}
                </button>
              ))}
            </div>
            <p className="glose">{SCENARIOS.find((sc) => sc.id === scenario)?.description}</p>
            {(() => {
              const sc = SCENARIOS.find((x) => x.id === scenario);
              if (!sc || sc.id === "stable") return null;
              const monde = rechauffementGlobalC(sc, 2100);
              const france = rechauffementFranceC(sc, 2100);
              const f = sc.fourchetteFrance2100;
              return (
                <div className="effets">
                  <span title="réchauffement moyen du globe en 2100, vs 1850-1900 (GIEC AR6)">
                    🌍 monde +{monde.toFixed(1)} °C
                  </span>
                  <span title="réchauffement annuel moyen en France — c'est celui que subit la parcelle">
                    🇫🇷 France <strong>+{france.toFixed(1)} °C</strong>
                    {f && ` [${f[0].toFixed(1)} ; ${f[1].toFixed(1)}]`}
                  </span>
                  <span title="l'été se réchauffe bien plus que la moyenne annuelle">
                    ☀️ été français +{(france * formeSaisonniere(28)).toFixed(1)} °C
                  </span>
                  <span title="l'hiver se réchauffe moins que l'été, mais plus que le globe">
                    ❄️ hiver +{(france * formeSaisonniere(2)).toFixed(1)} °C
                  </span>
                </div>
              );
            })()}
            <details style={{ marginTop: 8, fontSize: 13, color: "var(--encre-douce)" }}>
              <summary style={{ cursor: "pointer" }}>D'où viennent ces chiffres</summary>
              <p style={{ marginTop: 6 }}>
                Le réchauffement mondial vient du sixième rapport du GIEC. Les valeurs françaises,
                elles, ne s'en déduisent pas par une simple règle de trois : la France se réchauffe
                environ une fois et demie plus vite que le globe, et ses étés presque deux fois —
                l'assèchement des sols supprimant l'évaporation qui les tempérait.
              </p>
              <p>
                Ces valeurs sont celles de l'
                <strong>estimation observationnellement contrainte</strong> (Ribes et al., CMIP6),
                qui sert de base aux paliers <strong>TRACC</strong>, le référentiel français
                d'adaptation. Elles sont nettement plus chaudes que les projections régionales
                EURO-CORDEX diffusées par DRIAS-2020, surtout en été : la plupart de ces modèles
                régionaux ne font varier ni les aérosols ni l'effet physiologique du CO₂ sur les
                stomates, et sous-estiment de ce fait le réchauffement estival. Pour quoi que ce
                soit qui ressemble à de la planification, ce sont les paliers TRACC qu'on attend de
                vous, pas des sorties SSP brutes.
              </p>
            </details>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>Année de départ</span>
              <div className="seg">
                {[2026, 2040].map((a) => (
                  <button
                    key={a}
                    type="button"
                    style={btn(a === anneeDepart)}
                    onClick={() => setAnneeDepart(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 13, marginLeft: 8 }}>Graine du hasard</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
                style={{ width: 80 }}
                title="Deux parties avec la même graine se déroulent à l'identique."
              />
            </div>
            <div className="seg" style={{ marginTop: 8 }}>
              <button
                type="button"
                style={btn(economie)}
                onClick={() => setEconomie(true)}
                title="La trésorerie contraint : plants à payer, découvert limité, faillite possible"
              >
                💶 L'argent compte
              </button>
              <button
                type="button"
                style={btn(!economie)}
                onClick={() => setEconomie(false)}
                title="Le compte tourne et s'affiche, mais ne bloque rien : ni découvert refusé, ni faillite"
              >
                🌱 Écologie seule
              </button>
            </div>
            <p className="glose" style={{ minHeight: 0 }}>
              {economie
                ? "Les plants se paient, le découvert est plafonné, et une trésorerie trop longtemps négative met fin à la partie."
                : "Le compte continue de tourner et reste affiché — savoir ce qu'aurait coûté une conduite est instructif — mais il ne bloque plus rien. Le plafond d'heures de travail, lui, reste : une journée fait le même nombre d'heures qu'on ait de l'argent ou non."}
            </p>
          </section>

          <section className="carte">
            <h3>Profils de départ</h3>
            <p className="sous">
              Figer tout ce qui précède — terrain, entourage, relief, eau, climat — pour rejouer
              plusieurs parties dans les mêmes conditions. La graine du hasard, elle, reste libre :
              c'est en la changeant qu'on distingue ce qui tient du terrain de ce qui tient de la
              chance.
            </p>
            <div className="seg" style={{ marginBottom: 8 }}>
              <input
                type="text"
                value={nomProfil}
                placeholder="nom du profil"
                onChange={(e) => setNomProfil(e.target.value)}
                style={{ width: 200 }}
              />
              <button
                type="button"
                style={btn()}
                disabled={nomProfil.trim().length === 0}
                onClick={() => {
                  const profil = profilCourant(nomProfil.trim());
                  setProfils(enregistrerProfil(profil));
                  setMessageProfil(`« ${profil.nom} » enregistré.`);
                }}
              >
                Enregistrer
              </button>
              <button
                type="button"
                style={btn()}
                onClick={() => {
                  const texte = JSON.stringify(
                    profilCourant(nomProfil.trim() || "profil"),
                    null,
                    2,
                  );
                  setImportTexte(texte);
                  setMessageProfil("Profil courant écrit ci-dessous : copiez-le pour le garder.");
                }}
              >
                Exporter en JSON
              </button>
            </div>
            <div className="seg" style={{ marginBottom: 8 }}>
              {PROFILS_LIVRES.map((p) => (
                <button
                  key={p.nom}
                  type="button"
                  style={{ ...btn(), marginRight: 10 }}
                  onClick={() => {
                    appliquerProfil(p);
                    setMessageProfil(`« ${p.nom} » chargé — profil livré, la graine reste à vous.`);
                  }}
                  title="Situation réelle livrée avec le jeu : elle se charge, se joue, et se modifie sans être écrasée"
                >
                  📍 {p.nom}
                </button>
              ))}
            </div>
            {profils.length > 0 && (
              <div className="seg" style={{ marginBottom: 8 }}>
                {profils.map((p) => (
                  <span key={p.nom} style={{ display: "inline-flex" }}>
                    <button type="button" style={btn()} onClick={() => appliquerProfil(p)}>
                      ↺ {p.nom}
                    </button>
                    <button
                      type="button"
                      style={{ ...btn(), marginRight: 10 }}
                      title={`Oublier « ${p.nom} »`}
                      onClick={() => {
                        setProfils(supprimerProfil(p.nom));
                        setMessageProfil(`« ${p.nom} » oublié.`);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={importTexte}
              onChange={(e) => setImportTexte(e.target.value)}
              placeholder="Collez ici un profil exporté pour le charger"
              rows={3}
              style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 11 }}
            />
            <div className="seg" style={{ marginTop: 6 }}>
              <button
                type="button"
                style={btn()}
                disabled={importTexte.trim().length === 0}
                onClick={() => {
                  const lu = lireProfilExporte(importTexte);
                  if (typeof lu === "string") setMessageProfil(lu);
                  else {
                    appliquerProfil(lu);
                    setMessageProfil(`« ${lu.nom} » chargé.`);
                  }
                }}
              >
                Charger ce JSON
              </button>
            </div>
            {messageProfil && (
              <p className="glose" style={{ minHeight: 0 }}>
                {messageProfil}
              </p>
            )}
          </section>

          <p className="seg">
            <button
              type="button"
              style={{ ...btn(true), padding: "8px 20px", fontSize: 14, fontWeight: 600 }}
              onClick={() =>
                onStart(
                  stationId,
                  seed,
                  "reelle",
                  scenario,
                  bordures,
                  reliefFinal,
                  eau,
                  nappeCm,
                  partBassin,
                  maturationAns,
                  anneeDepart,
                  economie,
                )
              }
            >
              Démarrer
            </button>
          </p>
        </>
      )}
    </div>
  );
}

export function GameView({ surPartie }: { surPartie?: (enPartie: boolean) => void }) {
  const game = useGame();
  const geste = useReglagesDeGeste();
  // Les gestes sont ouverts d'entrée : un écran où tout est rangé ne dit pas
  // au joueur qui arrive qu'il y a quelque chose à faire.
  const volets = useVolets({ bg: "gestes" });
  // Le clic sur la parcelle a besoin de savoir quel geste est armé et avec
  // quels réglages ; le panneau, lui, reçoit l'objet entier.
  const {
    mode,
    especeId,
    avecManchon,
    rayonChaulage,
    densiteCible,
    critereEclaircie,
    especeEclaircie,
  } = geste;
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  // L'orientation de la caméra vit dans `VueParcelle` ; elle remonte ici pour
  // que la carte du sol se présente comme la vue (#145).
  const [orientation, setOrientation] = useState<Orientation>(0);

  const { station, snapshot } = game;
  /**
   * ─── LE BOUTON RETOUR DU NAVIGATEUR (#148) ──────────────────────────────
   *
   * Lancer une partie n'écrivait rien dans l'historique : « retour » quittait
   * le site en pleine partie, et c'est par ce chemin que des paramètres de
   * partie ont été perdus. Le réflexe « retour = un écran en arrière » est
   * celui de tout le monde.
   *
   * Une partie pousse donc UNE entrée, et le retour la consomme pour revenir à
   * l'écran titre — par le même chemin que « Sauvegarder et quitter », c'est-à-
   * dire en sauvegardant d'abord, et non par un déchargement de page.
   *
   * Les deux références évitent chacune un piège. `quitter` parce que la
   * fonction du jeu change d'identité à chaque rendu : un effet qui en
   * dépendrait pousserait une entrée d'historique par rendu. `sortieDemandee`
   * parce que le bouton, lui, appelle `history.back()` pour consommer l'entrée
   * — et ce retour-là ne doit pas déclencher une seconde sortie.
   */
  const enPartie = Boolean(station && snapshot);
  const quitter = useRef(game.quit);
  quitter.current = game.quit;
  const sortieDemandee = useRef(false);
  /**
   * Le retour du navigateur DEMANDE à sortir, il ne sort pas (#188).
   *
   * Le geste est trop facile à faire sans le vouloir — un coup de pouce sur un
   * pavé tactile — et il coûtait une partie en cours : la parcelle disparaît, il
   * faut retrouver la sauvegarde et la relancer. La partie est sauvegardée, donc
   * rien n'est perdu, mais rien ne le dit non plus au moment où l'écran se vide.
   *
   * On repousse donc l'entrée d'historique consommée par le retour — sinon un
   * second retour sortirait vraiment du site — et on pose la question.
   */
  const [sortieAConfirmer, setSortieAConfirmer] = useState(false);
  useEffect(() => {
    if (!enPartie) return;
    sortieDemandee.current = false;
    history.pushState({ canopee: "partie" }, "");
    const surRetour = () => {
      if (sortieDemandee.current) return;
      history.pushState({ canopee: "partie" }, "");
      setSortieAConfirmer(true);
    };
    window.addEventListener("popstate", surRetour);
    return () => window.removeEventListener("popstate", surRetour);
  }, [enPartie]);

  /** Quitter par le bouton : on consomme l'entrée d'historique qu'on a poussée. */
  const quitterLaPartie = () => {
    sortieDemandee.current = true;
    if (window.history.state?.canopee === "partie") history.back();
    game.quit();
  };
  /**
   * LES ARBRES SUIVIS et leur journal (#149). Le worker en tient la liste, lui
   * aussi, mais pour une seule raison : arrêter le temps quand l'un meurt.
   */
  const suivis = useSuivis(snapshot, game.suivre, game.rembobinage.enCours !== undefined);
  const enNiveau = useNiveau(game);

  /**
   * Lancer un niveau : ses réglages sont ceux de sa fiche, et rien n'est
   * demandé au joueur (#188, #189).
   *
   * L'ordre des deux messages compte : `newGame` remet le niveau à zéro dans le
   * worker — une partie neuve n'hérite pas de la précédente — donc c'est
   * APRÈS qu'on installe celui qu'on lance.
   */
  const lancerLeNiveau = (niveau: Niveau) => {
    const d = niveau.depart;
    game.newGame(
      d.stationId,
      niveau.seed,
      niveau.meteo,
      d.scenario,
      d.bordures,
      d.relief,
      d.eau,
      d.nappeCm,
      d.partBassinSemblable,
      d.maturationAns,
      d.anneeDepart,
      niveau.economie,
    );
    game.rangerLeNiveau(niveau.id, []);
  };

  // La coquille du site a besoin de savoir si une partie tourne : en jeu elle
  // s'efface, la parcelle prend la fenêtre entière.
  useEffect(() => {
    surPartie?.(Boolean(station && snapshot));
  }, [station, snapshot, surPartie]);
  const selectedTrees = useMemo(
    () => (snapshot ? snapshot.trees.filter((t) => selectedIds.has(t.id)) : []),
    [snapshot, selectedIds],
  );
  /**
   * L'instantané porte TOUS les arbres, chandelles comprises (snapshot.ts) :
   * elles se dessinent, mais elles ne se comptent pas comme un peuplement.
   */
  const vivants = useMemo(
    () => (snapshot ? snapshot.trees.filter((t) => !t.chandelle) : []),
    [snapshot],
  );

  /**
   * Le sol et les arbres dans la forme que la couche visuelle attend
   * (`src/game/parcelle.ts`). Rien n'est calculé ici : chaque champ vient du
   * protocole, et les deux conversions sont mémorisées parce que la scène
   * compare des RÉFÉRENCES pour décider ce qu'elle doit recuire — lui donner un
   * tableau neuf à chaque rendu de React lui ferait tout refaire.
   */
  const solAPoser = useMemo(
    () =>
      station && snapshot
        ? donneesSolDe({
            coteM: station.coteM,
            // L'HORIZON DE SURFACE, parce que `soilWater` ne rapporte que
            // lui : le rapport des deux est le remplissage de cette couche-là.
            // Passer la réserve du profil entier ferait paraître la parcelle
            // sèche en permanence (#190).
            ruMm: station.ruHorizonSurfaceMm,
            altitudesM: station.altitudesM,
            bassinAmontHa: station.bassinAmontHa,
            waterMm: snapshot.soilWater,
            herbe: snapshot.soilHerbe,
            herbeBiomasse: snapshot.soilHerbeBiomasse,
            litiereCG: snapshot.soilLitiereCG,
            lumiere: snapshot.soilLumiere,
            herbeHumidite: snapshot.soilHerbeHumidite,
            herbeEmprises: snapshot.soilHerbeEmprises,
            herbesIds: snapshot.herbesIds,
            enEau: station.enEau,
            debordementMm: snapshot.soilDebordementMm,
            boisAuSol: snapshot.soilBoisAuSol,
            boisEnTravers: snapshot.soilBoisEnTravers,
          })
        : undefined,
    [station, snapshot],
  );

  /**
   * Le journal du dernier instantané, joué comme une ellipse (§5.11) : les
   * morts, les chutes, les gestes, l'incendie. C'est ce qui fait qu'un arbre
   * coupé TOMBE au lieu de s'escamoter.
   */
  const ellipse = useEllipse(snapshot, station, game.speed);

  /**
   * LE BILAN DE LA PÉRIODE (#128, §6.8 №2) : ce qui s'est passé pendant qu'on
   * avançait, groupé et situé. Il vit à côté des marqueurs de l'ellipse et sur
   * la même durée qu'eux — voir `useBilan.ts`.
   */
  // **La période ne se referme pas parce qu'on la revoit (#128).** L'horloge
  // repart pendant une relecture, et sans cette garde le bilan qu'on venait
  // rejouer s'effacerait au moment même où l'on appuie sur « revoir ».
  const bilan = useBilan(game.bilan, game.speed > 0 && game.rembobinage.enCours === undefined);

  /**
   * CE QUI S'EST PASSÉ PENDANT TOUT LE NIVEAU, pour l'écran de fin.
   *
   * La partie entière et non la période : c'est le même bilan, lu sur l'autre
   * fenêtre. Calculé à part parce qu'un écran de fin ne s'ouvre qu'une fois,
   * et qu'une partie de vingt ans porte plus de lignes qu'une pause.
   */
  const bilanDuNiveau = useMemo(() => lignesDuBilan(game.bilan.partie), [game.bilan.partie]);

  /**
   * **Le temps attend la fin d'une animation bloquante (#163).**
   *
   * Le retour de partie : « c'est mieux d'attendre la fin d'une animation que
   * de couper. Par exemple, si on chaule pendant que les semaines s'écoulent,
   * actuellement ça coupe l'animation ». C'est ici que ça se joue — le worker
   * sait retenir son horloge, l'ellipse sait combien de temps, et ce lien-là
   * est le seul endroit qui connaisse les deux.
   *
   * Le nettoyage RELÂCHE toujours, et ce n'est pas une précaution de style :
   * sans lui, changer de vitesse ou fermer la partie pendant une chute
   * laisserait le worker retenu pour de bon, c'est-à-dire un jeu figé sans que
   * rien ne l'indique.
   */
  const retenir = game.attendre;
  const retenuJusqua = useRef(0);
  const minuteurDAttente = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    // **Sur l'ELLIPSE et non sur sa durée**, et c'est le premier piège : deux
    // semaines de suite portent souvent la même attente — une chute, 900 ms,
    // une chute, 900 ms. Un effet qui dépend du nombre ne se rejouerait pas et
    // une semaine sur deux couperait son animation.
    if (ellipse.attenteMs <= 0) return;
    // **Et pas de relâchement au changement de dépendance, ce qui est le
    // second piège — mesuré, celui-là.** Un nettoyage d'effet ordinaire
    // relâchait la retenue dès que l'ellipse suivante arrivait : relevé dans
    // le navigateur, les paires retenir/relâcher duraient 80 à 220 ms au lieu
    // des 900 attendues, et le jeu avançait exactement comme s'il n'y avait
    // pas de retenue du tout (58 instantanés en 20 s, avant comme après).
    // L'instantané suivant annulait donc la retenue au lieu que la retenue
    // empêche l'instantané suivant — c'est-à-dire le défaut qu'on corrige,
    // reproduit dans sa correction.
    const fin = performance.now() + ellipse.attenteMs;
    if (fin <= retenuJusqua.current) return;
    retenuJusqua.current = fin;
    retenir(true);
    clearTimeout(minuteurDAttente.current);
    minuteurDAttente.current = setTimeout(() => {
      retenuJusqua.current = 0;
      retenir(false);
    }, ellipse.attenteMs);
  }, [ellipse, retenir]);
  // Le relâchement de sûreté, au démontage seulement : une partie qu'on quitte
  // pendant une chute ne doit pas laisser un worker retenu pour de bon.
  useEffect(
    () => () => {
      clearTimeout(minuteurDAttente.current);
      retenir(false);
    },
    [retenir],
  );
  /** Hauteur de coupe de chaque tige abattue, par identifiant de tige. */
  const coupeDeLaTige = useMemo(
    () => new Map(ellipse.tiges.map((t) => [t.id, t.hauteurDeCoupeM])),
    [ellipse],
  );

  const arbresPoses = useMemo(
    () =>
      station && snapshot
        ? arbresAPoser([...snapshot.trees, ...ellipse.tiges], {
            coteM: station.coteM,
            week: snapshot.week,
            altitudesM: station.altitudesM,
            pheno: snapshot.pheno,
            seTorche: ellipse.seTorche,
          }).map((a) =>
            // Une tige abattue pivote autour de sa COUPE et non du sol : à fort
            // zoom, une souche de recépage fait une vingtaine de pixels, et une
            // cépée qui tomberait au ras du sol traverserait sa propre souche.
            a.id < 0 ? { ...a, z: a.z + (coupeDeLaTige.get(a.id) ?? 0) } : a,
          )
        : [],
    [station, snapshot, ellipse, coupeDeLaTige],
  );

  /**
   * La cellule survolée, et ce que le moteur en dit.
   *
   * Elle vit dans un état de React alors que le reste du survol vit dans des
   * références : c'est qu'elle sert à POSER UNE QUESTION au worker, pas à
   * dessiner. La vue ne l'annonce qu'aux changements de cellule — une question
   * par pixel parcouru noierait le worker pour rien.
   */
  const [survol, setSurvol] = useState<{ x: number; y: number }>();

  /**
   * **Ce qu'on lit est lu**, y compris ce qui arrive pendant qu'on le lit : le
   * compte de nouveautés ne doit pas monter sous les yeux de qui a justement
   * le volet ouvert. `marquerLu` est stable et remet à zéro un zéro sans
   * refaire de rendu, donc l'effet peut se rejouer à chaque événement.
   */
  const marquerLu = suivis.marquerLu;
  // Ce qu'on a sous les yeux : le dernier événement quand le volet est ouvert,
  // et rien du tout quand il est fermé. C'est LUI la dépendance de l'effet —
  // dire « le volet est ouvert ET le journal a changé » demanderait une
  // dépendance dont l'effet ne se sert pas, ce que le linteur refuse à juste
  // titre. Le premier élément change de référence à chaque arrivée, y compris
  // quand le journal est plein et que sa longueur, elle, ne bouge plus.
  const enLecture = volets.estOuvert("bd", "suivis") ? (suivis.journal[0] ?? null) : undefined;
  useEffect(() => {
    if (enLecture !== undefined) marquerLu();
  }, [enLecture, marquerLu]);

  /**
   * Où la vue va d'elle-même, quand elle y va.
   *
   * **La mort d'un suivi passe devant l'incendie (#149)** : les deux cadrages
   * sont le même mécanisme, et quand ils tombent ensemble c'est l'arbre qu'on
   * regardait qui l'emporte — le feu, lui, se voit de toute façon.
   */
  const cadrageAuto = suivis.cadrerSur ?? ellipse.cadrerSur;

  /**
   * OÙ LE JOUEUR A DEMANDÉ D'ALLER : la ligne du bilan qu'il a cliquée (#128).
   *
   * Un objet NEUF à chaque clic, parce que la vue n'applique un cadrage qu'une
   * fois par cible (`VueParcelle`) : recliquer la même ligne après avoir fait
   * glisser la parcelle doit y ramener.
   *
   * **Il retient CONTRE QUOI il a été posé, et c'est ce qui le périme.** Il
   * passe devant les deux cadrages automatiques — c'est lui qu'on vient de
   * demander — mais dès que l'un d'eux a du neuf à montrer, il rend la main :
   * un arbre suivi qui meurt pendant qu'on lit le bilan est plus urgent que la
   * ligne qu'on vient de cliquer. Écrit comme une comparaison et non comme un
   * effet qui remet à zéro : un effet aurait deux états à tenir d'accord, donc
   * une image où les deux se contredisent.
   */
  const [cadrageDemande, setCadrageDemande] = useState<{
    ou: { x: number; y: number };
    contre: { x: number; y: number } | undefined;
  }>();
  const cadrage =
    cadrageDemande && cadrageDemande.contre === cadrageAuto ? cadrageDemande.ou : cadrageAuto;

  /**
   * LA BARRE ESPACE met en marche et arrête, où qu'on ait cliqué.
   *
   * `preventDefault` sert deux fois : il empêche la page de défiler, et il
   * empêche la barre d'activer le bouton qui a le focus. C'est voulu — après
   * un clic sur « ×13 », le focus reste sur ce bouton, et sans ça la barre
   * rejouerait ce clic au lieu de mettre en pause. Les boutons restent
   * atteignables à la touche Entrée, qui est l'autre activateur.
   *
   * On ne prend pas la main quand on écrit : un champ de saisie a besoin de
   * ses espaces. Il n'y en a pas dans l'écran de jeu aujourd'hui, mais les
   * volets en gagneront.
   */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const cible = e.target as HTMLElement | null;
      const balise = cible?.tagName;
      if (balise === "INPUT" || balise === "TEXTAREA" || balise === "SELECT") return;
      if (cible?.isContentEditable) return;
      e.preventDefault();
      game.basculer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [game.basculer]);

  // **Le refus vient du moteur, jamais d'une règle refaite ici.** Le worker
  // applique la plantation sur l'état courant et jette le résultat, ne gardant
  // que les refus (`prevoir`). La règle du mètre, le plafond d'heures et le
  // découvert sont donc ceux du moteur, sans copie qui dériverait.
  const cleDuPreavis =
    mode === "planter" && survol
      ? `planter:${survol.x},${survol.y},${especeId},${avecManchon ? 1 : 0},${game.revision}`
      : undefined;
  useEffect(() => {
    if (!cleDuPreavis || !survol) return;
    game.prevoir(cleDuPreavis, {
      type: "planter",
      especeId,
      positions: [{ x: survol.x + 0.5, y: survol.y + 0.5 }],
      avecManchon,
    });
  }, [cleDuPreavis, survol, especeId, avecManchon, game.prevoir]);

  if (!station || !snapshot) {
    return (
      <div>
        {game.replayProgress && (
          <p>
            {game.replayProgress.phase === "vieillissement"
              ? `Le terrain vieillit sans vous… ${Math.round(game.replayProgress.done / 52)} ans sur ${Math.round(game.replayProgress.total / 52)}.`
              : `Rechargement de la partie… ${Math.round(game.replayProgress.done / 52)} ans rejoués.`}
          </p>
        )}
        <StartScreen
          onStart={game.newGame}
          onResume={(entree) => game.resume(entree.save, entree.id)}
          onNiveau={lancerLeNiveau}
        />
      </div>
    );
  }

  /**
   * Un clic sur la parcelle : le geste en cours s'applique là, ou bien on
   * sélectionne l'arbre qui s'y trouve.
   *
   * **Un geste vise une CELLULE, une sélection vise un ARBRE**, et la vue rend
   * les deux. Pour le geste, la cellule suffit : sur un terrain accidenté un
   * même pixel recouvre plusieurs cellules et `celluleSousLeCurseurVue` rend
   * celle qu'on voit, à un demi-mètre près — sans importance quand le geste le
   * plus fin porte sur un disque de huit mètres.
   *
   * Pour la sélection, non. On désignait l'arbre par la distance de sa cellule
   * au clic, c'est-à-dire en visant le SOL : il fallait toucher le pied, un
   * houppier penché ne comptait pas, et sur un semis de trente centimètres
   * personne ne trouvait la cible. La vue vise maintenant le sprite — ce qu'on
   * voit de l'arbre EST l'arbre — et `idArbre` est sa réponse.
   */
  /**
   * Ce que le geste armé couvre, pour que la vue le montre sous le curseur.
   *
   * Les rayons viennent des réglages du panneau, et le zéro de la plantation
   * est le bon zéro : un plant occupe un point, et l'espacement minimal est
   * une règle du moteur qu'on ne redit pas ici.
   */
  const empriseDuGeste: { rayonM: number } | undefined =
    mode === "selection"
      ? undefined
      : mode === "planter"
        ? { rayonM: 0 }
        : { rayonM: rayonChaulage };

  const refusDuPreavis =
    cleDuPreavis && game.prevision?.cle === cleDuPreavis ? game.prevision.refusals : [];

  /** L'arbre adulte à annoncer sous le curseur, quand on plante. */
  const fantome =
    mode === "planter"
      ? (() => {
          const espece = getEspece(especeId);
          if (!espece) return undefined;
          return {
            especeId,
            hauteurM: Math.max(0.6, espece.hauteurMaxM * 0.75),
            hauteurMaxM: espece.hauteurMaxM,
            houppierRatio: espece.lumiere.houppierRatio,
            refuse: refusDuPreavis.length > 0,
          };
        })()
      : undefined;

  const surClicParcelle = (
    cellule: { x: number; y: number },
    multiple: boolean,
    idArbre: number | undefined,
  ) => {
    const mx = cellule.x + 0.5;
    const my = cellule.y + 0.5;
    if (mode === "planter") {
      game.dispatch({
        type: "planter",
        especeId,
        positions: [{ x: mx, y: my }],
        avecManchon,
      });
    } else if (mode === "chauler") {
      game.dispatch({ type: "chauler", x: mx, y: my, rayonM: rayonChaulage });
    } else if (mode === "boisMort") {
      game.dispatch({ type: "ramasserBoisMort", x: mx, y: my, rayonM: rayonChaulage });
    } else if (mode === "faucher") {
      game.dispatch({ type: "faucher", x: mx, y: my, rayonM: rayonChaulage });
    } else if (mode === "cloturer") {
      game.dispatch({ type: "cloturer", x: mx, y: my, rayonM: rayonChaulage });
    } else if (mode === "brf") {
      game.dispatch({ type: "epandreBrf", x: mx, y: my, rayonM: rayonChaulage, part: 1 });
    } else if (mode === "eclaircir") {
      // Par essence, c'est l'essence qui décide et non la densité : le moteur
      // prend toutes ses tiges dans le disque (#156). Sans essence choisie, on
      // ne lance rien — une éclaircie par essence sans essence abattrait zéro
      // tige en facturant le déplacement.
      if (critereEclaircie === "espece" && !especeEclaircie) return;
      game.dispatch({
        type: "eclaircir",
        x: mx,
        y: my,
        rayonM: rayonChaulage,
        densiteCibleParHa: densiteCible,
        critere: critereEclaircie,
        ...(critereEclaircie === "espece" ? { especeId: especeEclaircie } : {}),
        devenir: "vendre",
      });
    } else if (multiple) {
      // Maj/ctrl : on ajoute ou on retire, et un clic dans le vide ne défait
      // pas la sélection qu'on est en train de construire.
      if (idArbre !== undefined) {
        const suite = new Set(selectedIds);
        if (suite.has(idArbre)) suite.delete(idArbre);
        else suite.add(idArbre);
        setSelectedIds(suite);
      }
    } else {
      setSelectedIds(idArbre === undefined ? new Set() : new Set([idArbre]));
    }
  };

  return (
    <div style={SCENE}>
      {/*
        La parcelle, en isométrique — et elle est le FOND de l'écran, pas un
        panneau parmi d'autres. La scène PixiJS vit dans `VueParcelle` et se
        redimensionne avec son conteneur, ici la fenêtre entière. Tout le reste
        est posé PAR-DESSUS : un volet qui s'ouvre recouvre la vue au lieu de la
        rétrécir, sinon la parcelle se recadrerait sous les yeux du joueur à
        chaque ouverture.
      */}
      <div style={{ position: "absolute", inset: 0 }}>
        {solAPoser && (
          <VueParcelle
            sol={solAPoser}
            semaineAnnee={snapshot.week % 52}
            arbres={arbresPoses}
            bordures={station.bordures}
            hauteurMaxDe={(id) => getEspece(id).hauteurMaxM}
            ombreDe={(a) => a.partFoliaire}
            surClic={surClicParcelle}
            surbrillance={selectedIds}
            {...(empriseDuGeste ? { emprise: empriseDuGeste } : {})}
            {...(fantome ? { fantome } : {})}
            surSurvol={setSurvol}
            deformer={ellipse.deformer}
            mourant={ellipse.mourant}
            remodeler={ellipse.remodeler}
            surOrientation={setOrientation}
            saison={ellipse.saison}
            voiler={ellipse.voiler}
            feu={ellipse.feu}
            marqueurs={ellipse.marqueurs}
            {...(cadrage ? { cadrerSur: cadrage } : {})}
          />
        )}
      </div>

      {/*
        LE SEUL AFFICHAGE PERMANENT : la date, l'argent, les heures, la météo,
        et les vitesses. Tout le reste est derrière un bouton — rien de tout
        cela n'a besoin d'être relu à chaque semaine de jeu.
      */}
      {/*
        **Empilés, et pas posés chacun à sa hauteur.** La fiche du niveau
        portait un `top: 104` — la hauteur du bandeau, recopiée — et la ligne
        de relecture (#128) l'a fait diverger sur-le-champ : la fiche est venue
        couvrir les boutons de vitesse. Une colonne les tient dans l'ordre, et
        personne n'a plus à connaître la hauteur de l'autre.

        `pointerEvents` ne s'ouvre que sur les cartes : la colonne elle-même
        s'étend sur toute la hauteur laissée libre, et sans ça elle avalerait
        les clics destinés à la parcelle.
      */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <div style={{ ...VOLET, position: "static", pointerEvents: "auto" }}>
          <Bandeau game={game} snapshot={snapshot} />
        </div>
        {/*
          L'OBJECTIF (#188), sous le bandeau et par-dessus la vue : c'est le
          seul endroit que l'œil retrouve sans chercher, et un objectif qu'on
          doit aller ouvrir n'en est pas un.
        */}
        {enNiveau.niveau && enNiveau.avancement && (
          <div style={{ pointerEvents: "auto" }}>
            <PanneauNiveau niveau={enNiveau.niveau} avancement={enNiveau.avancement} />
          </div>
        )}
      </div>
      {/*
        LA SORTIE SE CONFIRME. Un retour accidentel vidait l'écran sans un mot ;
        la partie était bien sauvegardée, mais rien ne le disait — d'où cette
        phrase, qui répond à la seule question qu'on se pose à cet instant.
      */}
      {sortieAConfirmer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(30, 26, 18, 0.55)",
            backdropFilter: "blur(2px)",
            zIndex: 45,
          }}
        >
          <section
            style={{ ...panel, maxWidth: 420, padding: "18px 22px" }}
            aria-label="Quitter la partie ?"
          >
            <h2 style={{ margin: 0, fontSize: "1.1em" }}>Quitter la partie ?</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.85 }}>
              Elle est sauvegardée : vous la retrouverez dans « Parties sauvegardées », sur l'écran
              d'accueil.
            </p>
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                style={btn(true)}
                onClick={() => {
                  setSortieAConfirmer(false);
                  quitterLaPartie();
                }}
              >
                💾 Sauvegarder et quitter
              </button>
              <button type="button" style={btn()} onClick={() => setSortieAConfirmer(false)}>
                ↩ Continuer à jouer
              </button>
            </div>
          </section>
        </div>
      )}

      {enNiveau.niveau && enNiveau.avancement && enNiveau.fini && (
        <FinDeNiveau
          niveau={enNiveau.niveau}
          avancement={enNiveau.avancement}
          annees={snapshot.week / 52}
          bilan={bilanDuNiveau}
          surRejouer={() => {
            if (enNiveau.niveau) lancerLeNiveau(enNiveau.niveau);
          }}
          // `quitterLaPartie` et non `game.quit` : la sortie doit CONSOMMER
          // l'entrée d'historique poussée à l'entrée en partie (#148), sinon
          // le bouton retour du navigateur ramènerait à une partie finie.
          surQuitter={quitterLaPartie}
        />
      )}

      {/*
        Les avis ne sont derrière aucun bouton : ce sont des choses qui
        arrivent, et on ne pense pas à aller les chercher.
      */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: 440,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <Avis
          game={game}
          vivants={vivants}
          rejouer={ellipse.rejouable ? ellipse.rejouer : undefined}
        />
      </div>

      {/* En haut à droite : la partie, et l'arbre qu'on vient de cliquer. */}
      <Angle
        coin="hd"
        volet={
          volets.estOuvert("hd", "partie") ? (
            <Volet titre="La partie" largeur={340} surFermer={() => volets.fermer("hd")}>
              <PanneauMenu game={game} surQuitter={quitterLaPartie} />
            </Volet>
          ) : selectedTrees.length > 0 ? (
            <Volet
              titre={
                selectedTrees.length === 1
                  ? "L'arbre sélectionné"
                  : `${selectedTrees.length} arbres sélectionnés`
              }
              largeur={380}
              surFermer={() => setSelectedIds(new Set())}
            >
              <PanneauSelection
                game={game}
                vivants={vivants}
                tous={snapshot.trees}
                selectedTrees={selectedTrees}
                setSelectedIds={setSelectedIds}
                suivis={suivis.suivis}
                basculerSuivi={suivis.basculer}
              />
            </Volet>
          ) : undefined
        }
      >
        <BoutonDeVolet
          ouvert={volets.estOuvert("hd", "partie")}
          surClic={() => volets.basculer("hd", "partie")}
        >
          ⚙ La partie
        </BoutonDeVolet>
      </Angle>

      {/* En bas à gauche : ce qu'on FAIT à la parcelle. */}
      <Angle
        coin="bg"
        volet={
          volets.estOuvert("bg", "gestes") ? (
            <Volet titre="Gestes" largeur={390} surFermer={() => volets.fermer("bg")}>
              <PanneauAction
                game={game}
                snapshot={snapshot}
                geste={geste}
                surChoisirEssence={() => volets.basculer("bg", "essences")}
                // Le centre de la cellule, comme le clic : `survol` donne des
                // indices entiers, et viser le coin décalerait le recensement
                // d'un demi-mètre par rapport au disque qui sera appliqué.
                zoneVisee={survol ? { x: survol.x + 0.5, y: survol.y + 0.5 } : undefined}
              />
            </Volet>
          ) : volets.estOuvert("bg", "essences") ? (
            // Le volet de choix remplace celui des gestes dans le même angle,
            // et sa croix y ramène : on est parti d'ici, on y revient.
            <Volet
              titre="Qu'est-ce qu'on plante ?"
              largeur={520}
              surFermer={() => volets.basculer("bg", "gestes")}
            >
              <PanneauEssences
                snapshot={snapshot}
                station={station}
                especeId={geste.especeId}
                setEspeceId={geste.setEspeceId}
                avecManchon={geste.avecManchon}
                setAvecManchon={geste.setAvecManchon}
                seulementTenables={geste.seulementTenables}
                setSeulementTenables={geste.setSeulementTenables}
              />
            </Volet>
          ) : volets.estOuvert("bg", "sol") ? (
            <Volet titre="Diagnostic de sol" largeur={400} surFermer={() => volets.fermer("bg")}>
              <CarteDuSol
                snapshot={snapshot}
                station={station}
                especeId={geste.especeId}
                orientation={orientation}
              />
            </Volet>
          ) : undefined
        }
      >
        <BoutonDeVolet
          ouvert={volets.estOuvert("bg", "gestes")}
          surClic={() => volets.basculer("bg", "gestes")}
        >
          🌱 Gestes
        </BoutonDeVolet>
        <BoutonDeVolet
          ouvert={volets.estOuvert("bg", "sol")}
          surClic={() => volets.basculer("bg", "sol")}
        >
          🗺 Sol
        </BoutonDeVolet>
      </Angle>

      {/* En bas à droite : ce qu'on LIT de la parcelle. */}
      <Angle
        coin="bd"
        volet={
          volets.estOuvert("bd", "arbres") ? (
            <Volet titre="Les arbres" largeur={400} surFermer={() => volets.fermer("bd")}>
              <PanneauArbres
                snapshot={snapshot}
                vivants={vivants}
                recolteAuto={game.recolteAuto}
                reglerRecolteAuto={game.reglerRecolteAuto}
                // Cliquer une essence sélectionne toutes ses tiges VIVANTES :
                // c'est ce qui rend la liste agissante. Les chandelles en sont
                // exclues — elles ne se gèrent pas comme des arbres, et le
                // volet « Les arbres » les compte déjà à part.
                surSelectionnerEssence={(especeId) =>
                  setSelectedIds(
                    new Set(vivants.filter((t) => t.especeId === especeId).map((t) => t.id)),
                  )
                }
              />
            </Volet>
          ) : volets.estOuvert("bd", "scores") ? (
            <Volet titre="Scores" largeur={400} surFermer={() => volets.fermer("bd")}>
              <PanneauScores snapshot={snapshot} />
            </Volet>
          ) : volets.estOuvert("bd", "journal") ? (
            <Volet titre="Journal" largeur={420} surFermer={() => volets.fermer("bd")}>
              {/*
                DEUX LECTURES DU MÊME TEMPS, et le §6.8 les veut toutes les
                deux : le bilan groupe et situe, le fil date et détaille.

                Le §6.8 dit « un panneau qui REMPLACE le fil texte quand la
                vitesse est haute ». On les empile plutôt qu'on ne les
                échange, et c'est un écart assumé : un panneau qui change de
                contenu selon la vitesse oblige le joueur à ralentir pour
                relire une ligne qu'il avait sous les yeux. Le bilan est en
                tête parce qu'il est le résumé ; le fil, dessous, garde ce
                que seul le moteur sait dire — le pH sous l'arbre qui a tué.
              */}
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", margin: "2px 0 4px" }}>
                <h3 style={{ margin: 0, fontSize: 13, flex: 1 }}>
                  Ce qui a changé
                  {bilan.depuis > 0 ? ` depuis l'an ${Math.floor(bilan.depuis / 52) + 1}` : ""}
                </h3>
                {/*
                  LE REMBOBINAGE (#128, §6.8 №3), et il n'a pas d'autre bouton.

                  Il est ICI, contre le bilan, parce que c'est là qu'il répond à
                  une question qu'on vient de se poser : on lit « 90 ronces
                  mortes étouffées par l'ombre » et on voudrait l'avoir vu. La
                  période à revoir est exactement celle que le bilan compte —
                  une seule notion, deux façons de la regarder.

                  Il disparaît quand la période est déjà tombée de la fenêtre
                  des points de reprise : mieux vaut pas de bouton qu'un bouton
                  qui ne fait rien.
                */}
                {snapshot.week > bilan.depuis &&
                  game.rembobinage.depuisQuand <= bilan.depuis &&
                  game.rembobinage.enCours === undefined && (
                    <button
                      type="button"
                      style={{ ...btn(), marginRight: 0, marginBottom: 0, fontSize: 12 }}
                      onClick={() =>
                        game.rembobinage.revoir(
                          bilan.depuis,
                          vitesseDeRelecture(snapshot.week - bilan.depuis),
                        )
                      }
                      title="Revenir au début de la période et la rejouer"
                    >
                      ↺ Revoir
                    </button>
                  )}
              </div>
              <PanneauBilan
                lignes={bilan.lignes}
                surCadrer={(ou) => setCadrageDemande({ ou: { ...ou }, contre: cadrageAuto })}
                quandVide="Rien n'a changé depuis que le temps s'est remis à couler."
              />
              <h3 style={{ margin: "12px 0 4px", fontSize: 13 }}>Le fil</h3>
              <PanneauJournal evenements={game.events} />
            </Volet>
          ) : volets.estOuvert("bd", "suivis") ? (
            <Volet titre="Arbres suivis" largeur={420} surFermer={() => volets.fermer("bd")}>
              <PanneauSuivis
                suivis={suivis.suivis}
                journal={suivis.journal}
                tous={snapshot.trees}
                poses={arbresPoses}
                semaine={snapshot.week}
                pheno={snapshot.pheno}
                aLArret={game.speed === 0}
                oublier={suivis.oublier}
                selectionner={(id) => setSelectedIds(new Set([id]))}
              />
            </Volet>
          ) : undefined
        }
      >
        <BoutonDeVolet
          ouvert={volets.estOuvert("bd", "arbres")}
          surClic={() => volets.basculer("bd", "arbres")}
        >
          🌳 Les arbres
        </BoutonDeVolet>
        <BoutonDeVolet
          ouvert={volets.estOuvert("bd", "scores")}
          surClic={() => volets.basculer("bd", "scores")}
        >
          📊 Scores
        </BoutonDeVolet>
        <BoutonDeVolet
          ouvert={volets.estOuvert("bd", "journal")}
          surClic={() => volets.basculer("bd", "journal")}
        >
          📜 Journal{game.events.length > 0 ? ` (${game.events.length})` : ""}
        </BoutonDeVolet>
        {/*
          LE BOUTON EST TOUJOURS LÀ, même sans un seul arbre suivi.

          Il ne l'était pas : « un volet vide de plus sur l'écran d'un joueur
          qui n'a rien demandé ». Le raisonnement se retourne — on ne peut pas
          demander ce qu'on ne voit pas. Dans une partie neuve on ne suit
          personne, donc l'entrée n'existait pas, donc l'outil restait
          introuvable pour qui ne l'avait jamais utilisé. Le volet, lui, sait
          déjà quoi dire quand il est vide : il explique comment suivre un
          arbre.
        */}
        <BoutonDeVolet
          ouvert={volets.estOuvert("bd", "suivis")}
          surClic={() => volets.basculer("bd", "suivis")}
        >
          👁 Suivis{suivis.suivis.size > 0 ? ` (${suivis.suivis.size})` : ""}
          {/* Ce qui est arrivé pendant qu'on regardait ailleurs : une
              notification, et non une pause — seule la mort d'un suivi
              arrête le temps (#149). */}
          {suivis.nouveautes > 0 && ` · ${suivis.nouveautes} 🔔`}
        </BoutonDeVolet>
      </Angle>
    </div>
  );
}
