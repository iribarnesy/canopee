/**
 * **Qui habite la parcelle** (#255, le rendu de #187).
 *
 * Le moteur installe des **individus** — pas une densité —, et c'est un choix
 * d'architecture pris pour une raison qui est entièrement ici : *« on veut des
 * individus, pour que le joueur s'attache, et pour qu'une mésange vient nicher
 * chez toi soit un événement de la partie »*. Tant que rien ne les montrait,
 * le lot payait le prix du modèle par individu sans en toucher le bénéfice.
 *
 * **L'unité de ce panneau est l'individu, pas l'effectif**, et les nombres du
 * moteur l'imposent : une vieille chênaie d'un hectare porte une à trois
 * mésanges bleues, zéro ou une buse, zéro ou une colonie de chauves-souris. Une
 * interface qui supposerait des dizaines se tromperait de registre.
 *
 * **Chaque habitant est ancré à un arbre**, et c'est ce qui rend la liste
 * actionnable : on clique, l'arbre se sélectionne, et la conduite du joueur a
 * désormais un visage — abattre celui-là expulsera quelqu'un de nommé.
 *
 * Rien n'est calculé ici. Les fiches viennent de `faune.ts`, les phrases de
 * `mots.ts`.
 */

import { getEspece } from "../../engine/especes";
import { especeFaune, type IndividuFaune, type TypeDeGite } from "../../engine/faune";
import { laFaune } from "../mots";
import type { SnapshotTree } from "../protocol";
import { btn } from "./styles";

/**
 * Le pictogramme du **gîte**, et non de la bête.
 *
 * C'est ce que le moteur donne : `gite` dit où l'animal loge, et rien dans la
 * fiche ne dit s'il a des plumes, des poils ou six pattes. Un picto par gîte
 * est donc lisible **et** vrai ; un picto par taxon serait une classification
 * que nous aurions inventée.
 */
const ICONE_GITE: Record<TypeDeGite, string> = {
  cavite: "🕳",
  hutte: "🪺",
  aire: "🪶",
  boisDeCoeur: "🪵",
  // **Une bougie pour une chandelle**, et ce n'est pas un jeu de mots gratuit :
  // c'est le terme forestier que le jeu emploie partout pour un arbre mort sur
  // pied. Le picto « arbre sans feuilles » (U+1FABE) serait plus juste et il
  // n'existe pas dans les polices — relevé à l'écran, il s'affichait en carré
  // vide.
  chandelle: "🕯",
};

/** Ce que chaque gîte est, en trois mots, pour qui ne connaît pas le terme. */
const DIT_LE_GITE: Record<TypeDeGite, string> = {
  cavite: "loge dans un creux",
  hutte: "hutte de branches",
  aire: "aire dans une fourche",
  boisDeCoeur: "galeries dans le bois de cœur",
  chandelle: "bois mort sur pied",
};

/** « an 3 », comme partout ailleurs — et « avant vous » pour ce qui précède la partie. */
function depuisQuand(semaineInstallation: number, semaine: number): string {
  if (semaineInstallation < 0) return "installé avant votre arrivée";
  const ans = Math.floor((semaine - semaineInstallation) / 52);
  if (ans <= 0) return "installé cette année";
  return `installé il y a ${ans} an${ans > 1 ? "s" : ""}`;
}

/**
 * Une ligne par habitant : l'espèce, son arbre, depuis quand, et s'il a faim.
 *
 * **La faim est dite parce qu'elle est un avertissement**, et le moteur l'a
 * voulu ainsi : un individu ne déménage pas pour une mauvaise semaine, il
 * échoue à nourrir sa nichée deux saisons de suite et alors il s'en va
 * (`saisonsMaigres`). Le joueur a donc une année pour comprendre — c'est
 * exactement le genre de chose qu'une interface doit laisser voir.
 */
function Habitant({
  individu,
  hote,
  semaine,
  selectionner,
  allerVoir,
}: {
  individu: IndividuFaune;
  hote: SnapshotTree | undefined;
  semaine: number;
  selectionner: (id: number) => void;
  allerVoir: (ou: { x: number; y: number }) => void;
}) {
  const espece = especeFaune(individu.especeId);
  if (!espece) return null;
  const maigres = individu.saisonsMaigres ?? 0;
  return (
    <div style={{ borderTop: "1px solid var(--trait)", padding: "5px 0" }}>
      <div>
        {ICONE_GITE[espece.gite]} <strong>{laFaune(espece.id, espece.nom)}</strong>{" "}
        <em style={{ color: "var(--encre-douce)" }}>{espece.nomLatin}</em>
      </div>
      <div style={{ color: "var(--encre-douce)" }}>
        {DIT_LE_GITE[espece.gite]} · {depuisQuand(individu.depuisSemaine, semaine)}
      </div>
      {maigres > 0 && (
        <div style={{ color: "var(--alerte, #a4442c)" }}>
          ⚠️ la table ne suffit plus depuis {maigres} saison{maigres > 1 ? "s" : ""} — il partira à
          la suivante
        </div>
      )}
      {hote ? (
        <button
          type="button"
          style={{ ...btn(), marginLeft: 0 }}
          title="Le sélectionner et aller le voir sur la parcelle"
          onClick={() => {
            selectionner(hote.id);
            // **Et la vue y va.** Une liste d'habitants qui ne mène pas à
            // l'arbre laisse le joueur chercher une tige parmi mille : c'est
            // le contraire de s'attacher à un individu.
            allerVoir({ x: individu.x + 0.5, y: individu.y + 0.5 });
          }}
        >
          {getEspece(hote.especeId).nom} · {hote.heightM.toFixed(1)} m
          {hote.chandelle ? " · chandelle" : ""}
        </button>
      ) : (
        <div style={{ color: "var(--encre-douce)" }}>son arbre n'est plus dans l'instantané</div>
      )}
    </div>
  );
}

export function PanneauHabitants({
  faune,
  tous,
  semaine,
  fauneEteinte,
  selectionner,
  allerVoir,
}: {
  /** les habitants, tels que le moteur les tient (`state.faune`) */
  faune: readonly IndividuFaune[];
  /** **tous** les arbres de l'instantané : un gîte peut être dans une chandelle */
  tous: readonly SnapshotTree[];
  semaine: number;
  /**
   * La faune est-elle éteinte dans cette partie ?
   *
   * **Ce n'est pas la même chose qu'une parcelle inhabitée**, et le dire est la
   * seule façon honnête de traiter une sauvegarde d'avant #255 : elle n'a jamais
   * eu d'habitants, et elle n'en aura pas — la rejouer avec ferait diverger la
   * parcelle qu'on a quittée.
   */
  fauneEteinte: boolean;
  selectionner: (id: number) => void;
  /** Centrer la vue sur un point de la parcelle, en mètres (centre de cellule). */
  allerVoir: (ou: { x: number; y: number }) => void;
}) {
  if (fauneEteinte) {
    return (
      <div style={{ fontSize: 13, color: "var(--encre-douce)" }}>
        Cette partie a été commencée avant que la faune n'existe, et elle continue sans : les
        individus ajoutent des tirages, donc la rejouer avec eux en ferait une autre parcelle. Une
        partie neuve les aura.
      </div>
    );
  }
  if (faune.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--encre-douce)" }}>
        Personne encore. Un gîte se prend quand un arbre en offre un <strong>et</strong> que la
        parcelle nourrit son occupant : il faut des arbres assez gros pour se creuser, et de quoi
        manger autour. Ça vient tout seul, mais ça prend des années.
      </div>
    );
  }
  // Les plus fragiles en tête : celui qui a faim est le seul sur lequel on
  // puisse encore agir, et c'est la raison d'ouvrir ce volet.
  const ordre = [...faune].sort(
    (a, b) =>
      (b.saisonsMaigres ?? 0) - (a.saisonsMaigres ?? 0) || a.depuisSemaine - b.depuisSemaine,
  );
  const especes = new Set(faune.map((f) => f.especeId)).size;
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "var(--encre-douce)", marginBottom: 6 }}>
        {faune.length} habitant{faune.length > 1 ? "s" : ""}, {especes} espèce
        {especes > 1 ? "s" : ""} — chacun tient à son arbre : l'abattre l'expulse.
      </div>
      {ordre.map((individu) => (
        <Habitant
          key={individu.id}
          individu={individu}
          hote={tous.find((t) => t.id === individu.arbreId)}
          semaine={semaine}
          selectionner={selectionner}
          allerVoir={allerVoir}
        />
      ))}
    </div>
  );
}
