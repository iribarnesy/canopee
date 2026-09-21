/**
 * LES ARBRES SUIVIS : un par ligne, avec ce qui leur est arrivé (#149).
 *
 * « Je plante des abricotiers, je veux surveiller très précisément ce qui leur
 * arrive. » Le panneau de sélection dit l'état COURANT d'un arbre ; celui-ci
 * dit son HISTOIRE, accumulée au fil des instantanés, et qui survit à sa mort —
 * c'est même là qu'elle sert le plus.
 *
 * Rien n'est calculé ici : les phrases viennent de `suivis.ts`, qui ne fait que
 * relire ce que le moteur a nommé.
 */

import { Fragment, useMemo } from "react";
import { getEspece } from "../../engine/especes";
import type { ContextePhenologique } from "../../engine/phenologie";
import type { ArbreAPoser } from "../../render/couches/arbres";
import type { SnapshotTree } from "../protocol";
import { type EvenementSuivi, grouperLesSuivis, type QuoiSuivi } from "../suivis";
import { alerteDeLArbre, couleurDeLaPart, ficheDeLArbre, type LigneDeFiche } from "./fiche";
import { btn } from "./styles";
import { type Silhouette, useSilhouettes } from "./useSilhouettes";

/** Une pastille par sorte d'événement, pour survoler la liste des yeux. */
const ICONE: Record<QuoiSuivi, string> = {
  geste: "✋",
  stade: "📏",
  brout: "🦌",
  frottis: "🦌",
  gel: "❄️",
  souffre: "⚠️",
  mort: "✝️",
};

/**
 * La hauteur adulte d'une essence — au niveau du MODULE, et c'est nécessaire :
 * c'est une dépendance d'effet, et une fonction refabriquée à chaque rendu
 * relancerait la cuisson des silhouettes sans fin.
 */
const hauteurMaxDe = (especeId: string): number => getEspece(especeId).hauteurMaxM;

/** « AN 3 · S12 », comme le journal de la partie. */
function quand(semaine: number): string {
  return `AN ${Math.floor(semaine / 52) + 1} · S${semaine % 52}`;
}

/**
 * La date d'un groupe : une semaine, ou la plage qu'il couvre.
 *
 * L'an n'est répété que s'il change — « AN 1 · S1 → AN 1 · S6 » disait deux
 * fois la même chose, sur la ligne où la place manque le plus.
 */
function quandDuGroupe(semaine: number, depuis: number): string {
  if (depuis === semaine) return quand(semaine);
  const memeAn = Math.floor(depuis / 52) === Math.floor(semaine / 52);
  return `${quand(depuis)} → ${memeAn ? `S${semaine % 52}` : quand(semaine)}`;
}

/**
 * Combien d'événements on montre par arbre.
 *
 * Le journal complet est gardé ; c'est l'AFFICHAGE qui est borné. Un arbre
 * suivi cinquante ans finirait par pousser les autres hors de l'écran, et
 * c'est le dernier qui lui est arrivé qu'on vient lire.
 */
const LIGNES_PAR_ARBRE = 6;

/**
 * Combien d'arbres reçoivent leurs silhouettes.
 *
 * **Une borne, et elle vient d'une mesure** : une cuisson coûte 175 ms sur la
 * machine de mesure, et la saison qui avance change la silhouette de tout le
 * monde à la fois. Quatre arbres, c'est huit images à refaire au pire — étalées
 * une par image (`useSilhouettes.ts`). Ce sont les quatre premiers de la liste,
 * donc ceux à qui il vient d'arriver quelque chose.
 */
const SILHOUETTES_MONTREES = 4;

/**
 * La JAUGE d'une ligne : la part, en couleur, sous la valeur.
 *
 * Une barre et un nombre disent la même chose ; la barre se lit sans être lue,
 * et c'est tout ce qu'on lui demande — repérer la ligne à regarder dans une
 * fiche de quinze lignes, sur cent quarante-neuf arbres.
 */
function Jauge({ ligne }: { ligne: LigneDeFiche }) {
  if (ligne.part === undefined) return null;
  const part = Math.min(1, Math.max(0, ligne.part));
  return (
    <div
      style={{
        height: 4,
        borderRadius: 2,
        background: "rgba(60, 50, 30, 0.12)",
        marginTop: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${(part * 100).toFixed(1)}%`,
          height: "100%",
          background: couleurDeLaPart(part, ligne.sens),
        }}
      />
    </div>
  );
}

/** La fiche d'un arbre : un picto, un intitulé, une valeur, une jauge. */
function Fiche({ lignes }: { lignes: readonly LigneDeFiche[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto 1fr",
        columnGap: 7,
        rowGap: 2,
        alignItems: "baseline",
        margin: "3px 0 5px",
        color: "var(--encre-douce)",
      }}
    >
      {lignes.map((l) => (
        <Fragment key={l.quoi}>
          <span title={l.aide}>{l.icone}</span>
          <span title={l.aide}>{l.quoi}</span>
          <span style={{ color: "var(--encre)" }}>
            {l.valeur}
            <Jauge ligne={l} />
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * L'ARBRE, ET LE MÊME EN PLEINE FORME — « voir ce qu'il a en moins que prévu ».
 *
 * Les deux silhouettes sortent de la MÊME cuisson que la parcelle
 * (`portraits.ts`), et le témoin ne change qu'une chose à la fois : même
 * espèce, même taille, mais houppier plein, vert, branchu bas. Ce qui manque à
 * gauche est donc ce que l'arbre a perdu, et non ce que le dessin suppose.
 */
function Silhouettes({ silhouette }: { silhouette?: Silhouette }) {
  // **La place est prise avant l'image.** La cuisson arrive une image plus
  // tard ; sans ce cadre vide, la fiche glisse latéralement au moment où la
  // silhouette apparaît, et c'est exactement le genre de saut qui fait perdre
  // la ligne qu'on était en train de lire.
  if (!silhouette) return <div style={{ width: 158, flexShrink: 0 }} />;
  const { sien, temoin } = silhouette;
  const image = (src: string, legende: string) => (
    <figure style={{ margin: 0, textAlign: "center", width: 74 }}>
      <img
        src={src}
        alt={legende}
        style={{ width: 74, height: 74, objectFit: "contain", display: "block" }}
      />
      <figcaption style={{ fontSize: 11, color: "var(--encre-douce)" }}>{legende}</figcaption>
    </figure>
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        margin: "4px 0",
        width: 158,
        flexShrink: 0,
      }}
    >
      {image(sien, "cet arbre")}
      {temoin && image(temoin, "en pleine forme")}
    </div>
  );
}

/**
 * LE POINT D'ALERTE, devant le nom : la pire grandeur orientée de l'arbre.
 *
 * C'est ce qui permet de balayer une plantation entière au lieu de lire
 * quinze lignes par arbre. Il ne dit rien de plus que la fiche — il dit quelle
 * fiche ouvrir en premier.
 */
function Alerte({ lignes }: { lignes: readonly LigneDeFiche[] }) {
  const pire = alerteDeLArbre(lignes);
  return (
    <span
      title={`Le pire de ses indicateurs remplit ${Math.round(pire * 100)} % de sa jauge.`}
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: 5,
        marginRight: 6,
        background: couleurDeLaPart(pire, "hautMauvais"),
      }}
    />
  );
}

export function PanneauSuivis({
  suivis,
  journal,
  tous,
  poses,
  semaine,
  pheno,
  aLArret,
  oublier,
  selectionner,
}: {
  suivis: ReadonlySet<number>;
  journal: readonly EvenementSuivi[];
  /** TOUS les arbres de l'instantané, chandelles comprises : un suivi mort en est une. */
  tous: readonly SnapshotTree[];
  /**
   * Les arbres POSÉS, tels que la scène les dessine (`arbresAPoser`).
   *
   * C'est d'eux que sort la silhouette du panneau : la refabriquer ici en
   * relisant l'instantané ferait une seconde copie de la pose, et le §2.1 dit
   * ce qu'il advient de deux copies d'une même règle.
   */
  poses: readonly ArbreAPoser[];
  /** la semaine de l'instantané : les « il y a » de la fiche s'y rapportent */
  semaine: number;
  /** le calendrier foliaire de la semaine, pour le feuillage de la fiche */
  pheno: ContextePhenologique;
  /**
   * Le temps est-il arrêté ? Les silhouettes ne se recuisent qu'à l'arrêt —
   * voir `useSilhouettes.ts`, où la mesure est écrite.
   */
  aLArret: boolean;
  oublier: (id: number) => void;
  selectionner: (id: number) => void;
}) {
  /**
   * **Ceux à qui il arrive quelque chose d'abord.** Suivre toute une plantation
   * est le cas que l'issue demande, et cent quarante-neuf bouleaux rangés par
   * identifiant mettent celui qui vient de mourir au milieu de la liste — au
   * moment précis où le temps s'est arrêté pour lui. Le journal est déjà trié
   * du plus récent au plus ancien : la place d'un arbre y est donc son rang.
   */
  const rang = new Map<number, number>();
  journal.forEach((e, i) => {
    if (!rang.has(e.idArbre)) rang.set(e.idArbre, i);
  });
  const ordre = [...suivis].sort(
    (a, b) => (rang.get(a) ?? Number.MAX_SAFE_INTEGER) - (rang.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const dessines = ordre.slice(0, SILHOUETTES_MONTREES).join(",");
  // Les poses des seuls arbres dessinés, et mémorisées : c'est la dépendance de
  // l'effet qui cuit, et un tableau neuf à chaque rendu le relancerait sans fin.
  const posesDessinees = useMemo(() => {
    const voulus = new Set(dessines.split(",").map(Number));
    return poses.filter((p) => voulus.has(p.id));
  }, [poses, dessines]);
  const silhouettes = useSilhouettes(posesDessinees, hauteurMaxDe, aLArret);

  if (suivis.size === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--encre-douce)" }}>
        Personne de suivi pour l'instant. Cliquez un arbre — ou toute une plantation — puis{" "}
        <strong>👁 Suivre</strong> : son journal s'écrit ici, et sa mort arrête le temps.
      </div>
    );
  }

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "var(--encre-douce)", marginBottom: 6 }}>
        {suivis.size} arbre{suivis.size > 1 ? "s" : ""} suivi{suivis.size > 1 ? "s" : ""} — le temps
        s'arrête quand l'un d'eux meurt.
      </div>
      {ordre.map((id) => {
        const arbre = tous.find((t) => t.id === id);
        const lignes = arbre ? ficheDeLArbre(arbre, { semaine, pheno }) : [];
        // **Rangé par la SEMAINE, pas par l'ordre d'arrivée.** Les deux
        // coïncident presque toujours, et « presque » suffit à faire lire un
        // journal qui saute d'une année à l'autre : relevé à l'écran, un lot
        // de semaine 18 se plaçait devant un lot de semaine 28. Le tri est
        // stable, donc les événements d'un même instantané — qui portent tous
        // sa semaine — gardent l'ordre où le moteur les a nommés.
        const sien = grouperLesSuivis(
          journal.filter((e) => e.idArbre === id).sort((a, b) => b.semaine - a.semaine),
        );
        return (
          <div key={id} style={{ marginBottom: 10 }}>
            {/* Le nom seul : la taille et l'âge sont dans la fiche, juste
                dessous, et les dire deux fois ne les dit pas mieux. */}
            <strong>
              {arbre && !arbre.chandelle && <Alerte lignes={lignes} />}
              {arbre ? getEspece(arbre.especeId).nom : `Arbre n°${id}`}
              {arbre?.chandelle && <span style={{ fontWeight: 400 }}> · chandelle</span>}
              {!arbre && <span style={{ fontWeight: 400 }}> · a quitté la parcelle</span>}
            </strong>{" "}
            {arbre && (
              <button
                type="button"
                style={btn()}
                onClick={() => selectionner(id)}
                title="Le sélectionner pour agir dessus"
              >
                Sélectionner
              </button>
            )}
            <button type="button" style={btn()} onClick={() => oublier(id)}>
              Ne plus suivre
            </button>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Silhouettes silhouette={silhouettes.get(id)} />
              <div style={{ flex: 1, minWidth: 0 }}>{arbre && <Fiche lignes={lignes} />}</div>
            </div>
            {sien.length === 0 ? (
              <div style={{ color: "var(--encre-douce)" }}>
                Rien ne lui est arrivé depuis qu'on le suit.
              </div>
            ) : (
              <div className="journal">
                {sien.slice(0, LIGNES_PAR_ARBRE).map((e) => (
                  <div key={`${e.semaine}-${e.quoi}-${e.texte}`} className="entree">
                    <span className="quand">{quandDuGroupe(e.semaine, e.depuisSemaine)}</span>{" "}
                    {ICONE[e.quoi]} {e.texte}
                    {e.fois > 1 && ` (${e.fois} fois)`}
                  </div>
                ))}
                {sien.length > LIGNES_PAR_ARBRE && (
                  <div style={{ color: "var(--encre-douce)" }}>
                    … et {sien.length - LIGNES_PAR_ARBRE} plus anciens
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
