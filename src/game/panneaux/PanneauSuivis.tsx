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

import { Fragment, useCallback, useMemo, useState } from "react";
import { getEspece } from "../../engine/especes";
import type { ContextePhenologique } from "../../engine/phenologie";
import type { ArbreAPoser } from "../../render/couches/arbres";
import type { SnapshotTree } from "../protocol";
import { type EvenementSuivi, grouperLesSuivis, type QuoiSuivi } from "../suivis";
import {
  alerteDeLArbre,
  couleurDeLaPart,
  ficheDeLArbre,
  type LigneDeFiche,
  pireLigne,
} from "./fiche";
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
 * Le côté d'une silhouette, en pixels.
 *
 * **Quatre-vingt-seize et non soixante-quatorze**, et c'est un retour de partie
 * qui l'a demandé : « on voit que l'arbre a une touffe en haut et une touffe en
 * bas, alors que le modèle a juste une touffe en haut ». Les deux touffes sont
 * vraies — un sujet qui végète porte moins de feuilles, et les trouées entre
 * verticilles se voient — mais à soixante-quatorze pixels elles se lisaient
 * comme deux objets au lieu d'un houppier clairsemé. L'image est cuite en 128 :
 * l'agrandir ne coûte rien et ne fait que montrer ce qui y était déjà.
 */
const TAILLE_SILHOUETTE = 96;

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
  if (!silhouette) return <div style={{ width: 2 * TAILLE_SILHOUETTE + 10, flexShrink: 0 }} />;
  const { sien, temoin } = silhouette;
  const image = (src: string, legende: string) => (
    <figure style={{ margin: 0, textAlign: "center", width: TAILLE_SILHOUETTE }}>
      <img
        src={src}
        alt={legende}
        style={{
          width: TAILLE_SILHOUETTE,
          height: TAILLE_SILHOUETTE,
          objectFit: "contain",
          display: "block",
        }}
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
        width: 2 * TAILLE_SILHOUETTE + 10,
        flexShrink: 0,
      }}
    >
      {image(sien, "cet arbre")}
      {temoin && image(temoin, "en pleine forme")}
    </div>
  );
}

/**
 * CE QU'ON LIT SANS DÉPLIER : la taille, l'âge, et la grandeur qui alerte.
 *
 * Trois choses, pas quinze : la ligne repliée sert à décider s'il faut
 * l'ouvrir. La grandeur nommée est celle qui tient la pastille — inutile de
 * dire « vigueur 92 % » sur un arbre dont c'est le stress qui parle.
 */
function resume(arbre: SnapshotTree | undefined, lignes: readonly LigneDeFiche[]): string {
  if (!arbre) return " · a quitté la parcelle";
  const taille = ` · ${arbre.heightM.toFixed(1)} m · ${Math.floor(arbre.ageWeeks / 52)} ans`;
  if (arbre.chandelle) return `${taille} · chandelle`;
  const pire = pireLigne(lignes);
  return pire ? `${taille} · ${pire.quoi.toLowerCase()} ${pire.valeur}` : taille;
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

/** L'état déplié des lignes, et de quoi le changer. */
function useOuverts(): {
  ouverts: ReadonlySet<number>;
  basculer: (id: number, ouvert: boolean) => void;
} {
  const [ouverts, setOuverts] = useState<ReadonlySet<number>>(new Set());
  const basculer = useCallback((id: number, ouvert: boolean) => {
    setOuverts((avant) => {
      if (avant.has(id) === ouvert) return avant;
      const suite = new Set(avant);
      if (ouvert) suite.add(id);
      else suite.delete(id);
      return suite;
    });
  }, []);
  return { ouverts, basculer };
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
   * **LES PLUS FAIBLES EN HAUT**, par vigueur croissante.
   *
   * C'est ce qu'on vient chercher : « qu'on regarde le détail que des arbres
   * où on voit qu'ils sont dans le rouge ». Le premier jet rangeait par
   * dernier événement — utile quand le temps venait de s'arrêter sur une mort,
   * inutile le reste du temps, où la liste se réordonnait sous les yeux à
   * chaque brout. La vigueur, elle, ne bouge que lentement : la liste tient en
   * place, et son haut est l'endroit où regarder.
   *
   * Deux cas n'ont pas de vigueur, et ils ne vont pas au même bout : une
   * CHANDELLE passe devant tout le monde — c'est l'arbre pour lequel le temps
   * s'est arrêté, et le pire état où un suivi puisse être — tandis qu'un arbre
   * qui a quitté la parcelle ferme la marche : il n'y a plus rien à en faire.
   */
  const rang = (id: number): number => {
    const arbre = tous.find((t) => t.id === id);
    if (!arbre) return 2;
    if (arbre.chandelle) return -1;
    return arbre.vigueur;
  };
  const ordre = [...suivis].sort((a, b) => rang(a) - rang(b));
  const { ouverts, basculer } = useOuverts();
  // **Ce qui est ouvert, et rien d'autre.** Les silhouettes ne se cuisent que
  // pour les lignes dépliées : replier par défaut ne rend pas seulement la
  // liste lisible, ça supprime la dépense là où elle n'a pas lieu d'être.
  const dessines = ordre
    .filter((id) => ouverts.has(id))
    .slice(0, SILHOUETTES_MONTREES)
    .join(",");
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
        {suivis.size} arbre{suivis.size > 1 ? "s" : ""} suivi{suivis.size > 1 ? "s" : ""}, le moins
        vigoureux en tête — le temps s'arrête quand l'un d'eux meurt.
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
        const ouvert = ouverts.has(id);
        return (
          <details
            key={id}
            open={ouvert}
            style={{ marginBottom: 6, borderTop: "1px solid var(--trait)", paddingTop: 5 }}
            onToggle={(e) => basculer(id, e.currentTarget.open)}
          >
            {/*
              **Une LIGNE par arbre, dépliable.** « Ce serait bien que les
              lignes soient repliées par défaut, pour qu'on regarde le détail
              que des arbres où on voit qu'ils sont dans le rouge. » La pastille
              et le mot qui la suit sont donc tout ce qu'on lit d'abord ; le
              reste — fiche, silhouettes, journal — attend qu'on le demande.
              C'est aussi ce qui rend les silhouettes gratuites : on ne cuit que
              ce qui est ouvert.
            */}
            <summary style={{ cursor: "pointer", listStyle: "revert" }}>
              <strong>
                {arbre && !arbre.chandelle && <Alerte lignes={lignes} />}
                {arbre ? getEspece(arbre.especeId).nom : `Arbre n°${id}`}
              </strong>
              <span style={{ color: "var(--encre-douce)" }}>{resume(arbre, lignes)}</span>
            </summary>
            <div style={{ marginTop: 4 }}>
              {arbre && (
                <>
                  <button
                    type="button"
                    style={btn()}
                    onClick={() => selectionner(id)}
                    title="Le sélectionner pour agir dessus"
                  >
                    Sélectionner
                  </button>
                  <button type="button" style={btn()} onClick={() => oublier(id)}>
                    Ne plus suivre
                  </button>
                </>
              )}
              {!arbre && (
                <button type="button" style={btn()} onClick={() => oublier(id)}>
                  Ne plus suivre
                </button>
              )}
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
          </details>
        );
      })}
    </div>
  );
}
