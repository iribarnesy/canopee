/**
 * **Ce que dit une mortalité de masse** (#401) : combien, de quoi, et lesquels.
 *
 * Le bandeau disait « ⏸ 16 arbres meurent d'un coup, dont 0 de plus d'un
 * mètre », et un joueur l'a relevé tel quel. Trois défauts dans une phrase :
 * elle appelait « arbres » seize semis de moins d'un mètre ; elle **arrêtait
 * le temps pour eux**, donc pour rien qui se voie à l'écran ; et elle ne disait
 * ni de quoi ils mouraient, ni lesquels c'étaient. Le « dont 0 » était le
 * correctif de #233 pris à son propre piège : il disait honnêtement qu'il n'y
 * avait rien à voir, au lieu de ne pas s'arrêter.
 *
 * **Deux tas, parce que ce ne sont pas deux niveaux d'alerte.** Des semis
 * meurent par centaines certaines semaines sans que la parcelle change — 852
 * des 924 tiges de la scène de #233 faisaient moins d'un mètre : c'est
 * l'éclaircie naturelle d'un recrû. Un arbre qui meurt, on le voit, il laisse
 * un trou, et on veut savoir pourquoi. La frontière est celle de l'écran,
 * `HAUTEUR_TROUVABLE_M` : sous le mètre, un fût ne fait pas huit pixels et ne
 * se cherche pas (#233). Ce n'est pas une règle du moteur, qui ne connaît que
 * des tiges, mais un choix de présentation — comme les seuils de `scenes.ts`,
 * que ce module applique à chaque tas, contre son propre peuplement.
 *
 * Module **pur** : ni worker, ni React. Le worker décide et poste, l'essai lit
 * les phrases sans lancer de partie.
 */

import type { MortDeLaSemaine } from "../engine/tick";
import type { TreeState } from "../engine/trees";
import { HAUTEUR_TROUVABLE_M } from "../render/temps/changements";
import { causeDite, s } from "./mots";
import { estUneMortaliteDeMasse } from "./scenes";

/**
 * Combien de causes la phrase nomme, au plus.
 *
 * Trois : de quoi dire l'essentiel sans que le bandeau devienne un bilan — le
 * bilan de période a déjà sa place, et le journal ses lignes « 💀 » par
 * essence. Les suivantes sont comptées ensemble plutôt que tues : le détail
 * doit retomber sur le nombre annoncé.
 */
export const CAUSES_NOMMEES = 3;

/** Ce que la phrase lit d'une mort : sa cause, la taille de ce qui est mort, et qui. */
type Mort = Pick<MortDeLaSemaine, "cause" | "heightM"> & { id?: number };

/** Ce que le partage lit du peuplement d'avant la semaine. */
type Tige = Pick<TreeState, "alive" | "heightM"> &
  Partial<Pick<TreeState, "id" | "brulEeSemaine" | "renverseSemaine">>;

/** Une mort qui compte parmi les arbres, et non parmi les semis. */
export function estUnArbre(heightM: number): boolean {
  return heightM >= HAUTEUR_TROUVABLE_M;
}

/** Les morts d'une semaine en deux tas, et ce que chaque tas mérite. */
export interface MortaliteDeLaSemaine<M extends Mort> {
  /** ce qui faisait un mètre et plus : ça se voit, ça se cherche */
  arbres: M[];
  /** le reste : des semis, qu'on ne voit pas tomber */
  semis: M[];
  /** les arbres meurent en masse : c'est une scène, elle arrête le temps */
  scene: boolean;
  /**
   * les semis meurent en masse : une ligne au journal, **sans** arrêter le
   * temps. Jugée sur les semis seuls, comme la scène l'est sur les arbres — un
   * été sec qui emporte trois semis sur cinq mille ne vaut pas une ligne.
   */
  semisEnMasse: boolean;
}

/**
 * Partager les morts de la semaine, et juger chaque tas **contre le sien**.
 *
 * `avant` est le peuplement d'avant la semaine, chandelles comprises : on n'y
 * compte que ce qui vivait. Juger les morts contre toutes les tiges, comme on
 * le faisait, mêlait les deux tas des deux côtés de la fraction : une vraie
 * hécatombe de pommiers se noyait dans deux mille ronces de vingt
 * centimètres, et seize brins suffisaient à arrêter le temps dès que le
 * peuplement était petit — c'est le cas relevé.
 *
 * **Une mort déjà dite ne se redit pas.** Un arbre que le feu a tué sur pied,
 * ou que la tempête a couché, reste récupérable un an : le moteur ne le met
 * dans `morts` qu'à la fin de ce délai (`CHABLIS_RECUPERABLE_SEMAINES`). Sans
 * ce tri, un incendie annoncé la semaine où il brûle revenait un an plus tard
 * en « 30 arbres meurent d'un coup, tous brûlés ». L'incendie et la tempête
 * ont leur bandeau et leur scène ; ces morts-là n'en refont pas.
 */
export function lireLaMortalite<M extends Mort>(
  morts: readonly M[],
  avant: readonly Tige[],
): MortaliteDeLaSemaine<M> {
  const dejaDites = new Set<number>();
  for (const t of avant) {
    if (t.id === undefined) continue;
    if (t.brulEeSemaine !== undefined || t.renverseSemaine !== undefined) dejaDites.add(t.id);
  }
  const arbres: M[] = [];
  const semis: M[] = [];
  for (const m of morts) {
    if (m.id !== undefined && dejaDites.has(m.id)) continue;
    (estUnArbre(m.heightM) ? arbres : semis).push(m);
  }
  let arbresAvant = 0;
  let semisAvant = 0;
  for (const t of avant) {
    if (!t.alive) continue;
    if (estUnArbre(t.heightM)) arbresAvant++;
    else semisAvant++;
  }
  return {
    arbres,
    semis,
    scene: estUneMortaliteDeMasse(arbres.length, arbresAvant),
    semisEnMasse: estUneMortaliteDeMasse(semis.length, semisAvant),
  };
}

/**
 * Ce qui les a tués, les causes les plus fréquentes d'abord.
 *
 * Rend la **fin** de la phrase, séparateur compris, parce que la tournure
 * change avec le nombre de causes : une seule se dit « tous de sécheresse » —
 * « 12 de sécheresse » répéterait le compte qu'on vient de lire —, plusieurs
 * se détaillent après un tiret.
 *
 * L'accord se fait au **masculin**, quelle que soit l'essence : le sujet est
 * « arbre » ou « semis », comme dans `raisonDesMorts` (`worker.ts`) — c'est ce
 * qui rend la phrase juste sans connaître le genre de ce qui est mort.
 */
export function ceQuiLesATues(morts: readonly Pick<MortDeLaSemaine, "cause">[]): string {
  const parCause = new Map<MortDeLaSemaine["cause"], number>();
  for (const m of morts) parCause.set(m.cause, (parCause.get(m.cause) ?? 0) + 1);
  // Le tri est stable : à égalité, la cause rencontrée la première passe devant.
  const rangees = [...parCause].sort((a, b) => b[1] - a[1]);
  const [seule] = rangees;
  if (!seule) return "";
  if (rangees.length === 1) {
    const [cause, n] = seule;
    return n >= 2 ? `, tous ${causeDite(cause, n)}` : `, ${causeDite(cause, 1)}`;
  }
  const dites = rangees.slice(0, CAUSES_NOMMEES).map(([cause, n]) => `${n} ${causeDite(cause, n)}`);
  const reste = rangees.slice(CAUSES_NOMMEES).reduce((total, [, n]) => total + n, 0);
  if (reste > 0) dites.push(`${reste} ${reste >= 2 ? "d'autres causes" : "d'une autre cause"}`);
  return ` — ${dites.join(", ")}`;
}

/** « meurt » ou « meurent » : le verbe suit le compte. */
function meurent(n: number): string {
  return n >= 2 ? "meurent" : "meurt";
}

/**
 * Le bandeau de la pause : les arbres, de quoi, et les semis **à part**.
 *
 * « 12 arbres meurent d'un coup — 9 de sécheresse, 3 étouffés par l'ombre ; et
 * 40 semis ». Les semis ne sont qu'un compte, sans leurs causes : ils ne sont
 * pas ce qui a arrêté le temps, et leur détail est au journal. Et ils ne sont
 * dits que s'il y en a — la phrase n'écrit jamais « 0 ».
 */
export function direLaMortaliteDesArbres(
  arbres: readonly Pick<MortDeLaSemaine, "cause">[],
  semis: number,
): string {
  const n = arbres.length;
  const etLesSemis = semis > 0 ? ` ; et ${semis} semis` : "";
  return `${n} arbre${s(n)} ${meurent(n)} d'un coup${ceQuiLesATues(arbres)}${etLesSemis}`;
}

/**
 * La ligne du journal d'une hécatombe de semis : « 40 semis meurent cette
 * semaine — 31 de sécheresse, 9 étouffés par l'ombre ».
 *
 * Une ligne de **plus** que les « 💀 » par essence, et pas à leur place : elles
 * disent qui, celle-ci dit que c'est en masse — ce que vingt lignes de
 * « 3 bouleaux morts de sécheresse (semis) » ne laissent pas voir.
 */
export function direLaMortaliteDesSemis(semis: readonly Pick<MortDeLaSemaine, "cause">[]): string {
  const n = semis.length;
  return `${n} semis ${meurent(n)} cette semaine${ceQuiLesATues(semis)}`;
}
