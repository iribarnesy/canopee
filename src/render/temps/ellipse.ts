/**
 * Le PLAN D'UNE ELLIPSE : ce qui a changé, et dans quel ordre le montrer
 * (docs/interface-visuelle.md §5.11).
 *
 * **Ce module existe parce que deux sections du cahier se contredisaient**, et
 * que le commanditaire a tranché en relisant la sienne. Le §6.8 partait de
 * « on ne peut pas ANIMER ce qui s'est passé » — l'animation d'une mort de
 * sécheresse dure trois semaines de jeu, elle n'a pas sa place dans une image
 * à ×512 — et proposait donc des marqueurs qui persistent, un bilan de période
 * et un rembobinage. Le §5.11 dit l'inverse : « une fois le temps réel acquis,
 * l'ellipse n'est plus un cas particulier, c'est une ANIMATION », et le
 * principe « ne dépend pas de la durée : une semaine, un mois, dix ans, c'est
 * la même mécanique avec plus ou moins à montrer ».
 *
 * Les deux se réconcilient sur un mot : la durée de l'animation est une durée
 * de **présentation**, pas une durée de jeu. Une mort de sécheresse ne prend
 * pas trois semaines à montrer, elle prend le temps qu'on lui donne. Ce module
 * ne fait donc qu'une chose : ranger les changements dans un BUDGET de temps
 * d'écran, dans un ordre où les causes précèdent leurs conséquences.
 *
 * **Et il dit quand il n'y arrive pas.** À grande vitesse, mille arbres morts
 * ne tiennent pas dans deux secondes en restant lisibles ; le plan le signale
 * (`deborde`) au lieu de rendre un scintillement de trois millisecondes. C'est
 * là que les mécanismes du §6.8 reprennent la main — le calque des changements
 * et le bilan de période — non plus comme une alternative à l'animation mais
 * comme son repli assumé.
 *
 * **Ce que ce module ne fait pas** : dessiner. Pas un canvas, pas un sprite,
 * aucune interpolation. Il rend un plan, et un plan se teste. Ce qui l'anime
 * viendra au-dessus, et lira ce plan.
 *
 * Module **pur**, comme `projection.ts` ou `squelette.ts`.
 */

import type { GesteVisible } from "../../engine/actions";
import type { ChuteDeChandelle, IncendieResult, MortDeLaSemaine } from "../../engine/tick";
import type { CauseMort } from "../../engine/trees";

/**
 * Le journal des changements, tel que le protocole le livre.
 *
 * **Les quatre canaux existent déjà et aucun n'était lu.** `morts` porte la
 * cause et la position de chaque arbre mort, `chutes` la direction et
 * l'empreinte exacte de chaque chandelle abattue, `gestes` ce que le joueur (ou
 * le gibier) a réellement touché, `incendie` le front rangé par ordre
 * d'arrivée. C'est un journal complet, et il traversait le worker sans
 * lecteur.
 *
 * On accepte PLUSIEURS journaux : franchir dix ans, c'est concaténer dix ans
 * de semaines. Le plan est le même, il a seulement plus à montrer — c'est
 * exactement la propriété que le §5.11 demande.
 */
export interface JournalDeSemaine {
  morts?: readonly MortDeLaSemaine[];
  chutes?: readonly ChuteDeChandelle[];
  gestes?: readonly GesteVisible[];
  incendie?: IncendieResult;
}

/** Ce qu'un acte montre. Une union, pour que le dessin sache quoi faire. */
export type Sujet =
  | {
      quoi: "feu";
      origine: number;
      brulees: readonly number[];
      /**
       * Rang d'arrivée du front sur chaque cellule de `brulees`, même ordre.
       *
       * **Il manquait, et c'est une correction de ce module.** Le sujet ne
       * portait que les cellules brûlées — or `IncendieResult` donne aussi les
       * rangs, et le commentaire du moteur dit à quoi ils servent : « c'est ce
       * qui permet de faire COURIR une ligne de flammes au lieu de noircir un
       * patch d'un coup ». Sans eux, le plan aurait obligé le dessin à
       * noircir d'un coup, c'est-à-dire à perdre la seule chose qui rend un
       * incendie pédagogique.
       */
      rangs: readonly number[];
    }
  | { quoi: "chute"; chutes: readonly ChuteDeChandelle[] }
  | { quoi: "mort"; cause: CauseMort; morts: readonly MortDeLaSemaine[] }
  | { quoi: "geste"; geste: GesteVisible };

/**
 * Un ACTE : un groupe de changements montrés ensemble, sur un créneau.
 *
 * **Groupés, et c'est la demande littérale** : « par exemple animer tous les
 * arbres qui sont morts dans la semaine ». Trente-quatre bouleaux morts de
 * sécheresse font UN acte à trente-quatre sujets, pas trente-quatre actes.
 * Sans ce regroupement, une semaine ordinaire de friche produirait des
 * centaines d'actes de quelques millisecondes.
 */
export interface Acte {
  sujet: Sujet;
  /** début du créneau, ms depuis le début de l'ellipse */
  debutMs: number;
  dureeMs: number;
}

export interface PlanDEllipse {
  actes: readonly Acte[];
  /** durée totale, ms — au plus le budget demandé */
  dureeMs: number;
  /**
   * Vrai si le budget ne permettait pas de tout montrer lisiblement.
   *
   * Le plan reste utilisable — il montre ce qui tient — mais l'appelant doit
   * savoir qu'il a été tronqué, pour basculer sur le calque des changements et
   * le bilan de période (§6.8). Un plan qui mentirait sur ce point ferait
   * défiler des actes de trois millisecondes en prétendant les montrer.
   */
  deborde: boolean;
  /** combien d'actes n'ont pas trouvé de place */
  actesOmis: number;
}

/**
 * Durée minimale d'un acte pour qu'il se voie, ms.
 *
 * Un dixième de seconde : en dessous, un mouvement n'est plus lu comme un
 * mouvement mais comme un saut — c'est le seuil au-delà duquel l'œil suit une
 * trajectoire au lieu de constater un déplacement. C'est ce plancher qui décide
 * qu'une ellipse déborde, et c'est pour ça qu'il est nommé.
 */
export const ACTE_LE_PLUS_COURT_MS = 100;

/**
 * L'ORDRE des actes : les causes avant leurs conséquences.
 *
 * Ce n'est pas une préférence esthétique, c'est ce qui rend une ellipse
 * lisible. Un feu passe, PUIS les arbres qu'il a tués se transforment en
 * chandelles, PUIS certaines tombent — montrer les chutes avant le feu ferait
 * de l'enchaînement un hasard. Les gestes du joueur viennent en tête : c'est
 * lui qui a agi, et le reste de la semaine en découle.
 */
const ORDRE: readonly Sujet["quoi"][] = ["geste", "feu", "mort", "chute"];

/**
 * Range un journal de changements dans un budget de temps d'écran.
 *
 * `budgetMs` est la durée que l'appelant accorde à l'ellipse — la même quelle
 * que soit la période franchie. C'est tout l'intérêt : le joueur qui saute une
 * semaine et celui qui saute dix ans attendent le même temps, l'un voyant
 * quatre actes et l'autre quarante.
 */
export function planDEllipse(
  journaux: readonly JournalDeSemaine[],
  budgetMs: number,
): PlanDEllipse {
  const sujets = regrouper(journaux);
  if (sujets.length === 0 || budgetMs <= 0) {
    return { actes: [], dureeMs: 0, deborde: false, actesOmis: 0 };
  }
  // Combien d'actes tiennent au plancher de lisibilité. Au-delà, on tronque et
  // on le DIT : c'est le repli du §6.8, pas un échec silencieux.
  const tiennent = Math.max(1, Math.floor(budgetMs / ACTE_LE_PLUS_COURT_MS));
  const gardes = sujets.slice(0, tiennent);
  const dureeMs = budgetMs / gardes.length;
  return {
    actes: gardes.map((sujet, i) => ({ sujet, debutMs: i * dureeMs, dureeMs })),
    dureeMs: budgetMs,
    deborde: gardes.length < sujets.length,
    actesOmis: sujets.length - gardes.length,
  };
}

/**
 * Regroupe les journaux en sujets, dans l'ordre de présentation.
 *
 * Le regroupement se fait sur TOUTE la période et non semaine par semaine : dix
 * ans de sécheresse donnent un acte « morts de sécheresse » avec dix ans
 * d'arbres, pas dix actes. C'est encore la même propriété — le principe ne
 * dépend pas de la durée — et c'est ce qui empêche une longue ellipse de
 * déborder pour de mauvaises raisons.
 */
function regrouper(journaux: readonly JournalDeSemaine[]): Sujet[] {
  const gestes: GesteVisible[] = [];
  const chutes: ChuteDeChandelle[] = [];
  const parCause = new Map<CauseMort, MortDeLaSemaine[]>();
  const feux: IncendieResult[] = [];
  for (const j of journaux) {
    if (j.gestes) gestes.push(...j.gestes);
    if (j.chutes) chutes.push(...j.chutes);
    if (j.incendie) feux.push(j.incendie);
    for (const m of j.morts ?? []) {
      const deja = parCause.get(m.cause);
      if (deja) deja.push(m);
      else parCause.set(m.cause, [m]);
    }
  }

  const sujets: Sujet[] = [];
  // Un geste par TYPE, pas un par appel : trois éclaircies dans la période
  // sont une éclaircie à montrer.
  const parType = new Map<string, GesteVisible>();
  for (const g of gestes) {
    const deja = parType.get(g.type);
    if (!deja) {
      parType.set(g.type, g);
      continue;
    }
    parType.set(g.type, fusionnerGestes(deja, g));
  }
  for (const g of parType.values()) sujets.push({ quoi: "geste", geste: g });
  for (const f of feux) {
    sujets.push({
      quoi: "feu",
      origine: f.origine,
      brulees: [...f.brulees],
      rangs: [...f.rangs],
    });
  }
  for (const [cause, morts] of parCause) sujets.push({ quoi: "mort", cause, morts });
  if (chutes.length > 0) sujets.push({ quoi: "chute", chutes });

  // **Trié PAR ORDRE STABLE**, pour qu'un même journal donne toujours le même
  // plan : le rendu est déterministe, le plan aussi (§2.1).
  return sujets.sort((a, b) => ORDRE.indexOf(a.quoi) - ORDRE.indexOf(b.quoi));
}

/** Fusionne deux gestes de même type : leurs arbres, ou leurs cellules. */
function fusionnerGestes(a: GesteVisible, b: GesteVisible): GesteVisible {
  if ("ids" in a && "ids" in b) return { type: a.type, ids: [...a.ids, ...b.ids] };
  if ("cellules" in a && "cellules" in b) {
    return { type: a.type, cellules: [...a.cellules, ...b.cellules] };
  }
  // Deux formes différentes sous le même type : le moteur ne le fait pas, et
  // s'il le faisait, garder le premier vaut mieux qu'inventer une union.
  return a;
}
