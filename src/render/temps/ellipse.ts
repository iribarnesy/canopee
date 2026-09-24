/**
 * Le **plan d'une ellipse** : ce qui a changé, et dans quel ordre le montrer
 * (docs/interface-visuelle.md §5.11).
 *
 * **Ce module existe parce que deux sections du cahier se contredisaient**, et
 * que le commanditaire a tranché en relisant la sienne. Le §6.8 partait de
 * « on ne peut pas **animer** ce qui s'est passé » — l'animation d'une mort de
 * sécheresse dure trois semaines de jeu, elle n'a pas sa place dans une image
 * à ×512 — et proposait donc des marqueurs qui persistent, un bilan de période
 * et un rembobinage. Le §5.11 dit l'inverse : « une fois le temps réel acquis,
 * l'ellipse n'est plus un cas particulier, c'est une **animation** », et le
 * principe « ne dépend pas de la durée : une semaine, un mois, dix ans, c'est
 * la même mécanique avec plus ou moins à montrer ».
 *
 * Les deux se réconcilient sur un mot : la durée de l'animation est une durée
 * de **présentation**, pas une durée de jeu. Une mort de sécheresse ne prend
 * pas trois semaines à montrer, elle prend le temps qu'on lui donne. Ce module
 * ne fait donc qu'une chose : ranger les changements dans un **budget** de temps
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
import type {
  ChuteDeChandelle,
  FranchissementDeStade,
  IncendieResult,
  MortDeLaSemaine,
  NaissanceDeLaSemaine,
  TempeteResult,
} from "../../engine/tick";
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
 * On accepte **plusieurs** journaux : franchir dix ans, c'est concaténer dix ans
 * de semaines. Le plan est le même, il a seulement plus à montrer — c'est
 * exactement la propriété que le §5.11 demande.
 */
export interface JournalDeSemaine {
  morts?: readonly MortDeLaSemaine[];
  chutes?: readonly ChuteDeChandelle[];
  gestes?: readonly GesteVisible[];
  incendie?: IncendieResult;
  /**
   * La tempête de la semaine (`Snapshot.tempete`).
   *
   * **Il faut l'événement, pas l'état**, et le piège est pire que pour le feu :
   * un chablis n'est rapporté mort qu'un an plus tard
   * (`CHABLIS_RECUPERABLE_SEMAINES`), une semaine où `tempete` vaut
   * `undefined`. Se raccrocher aux `morts` ferait jouer la rafale avec un an
   * de retard.
   */
  tempete?: TempeteResult;
  /**
   * Les semis installés depuis le dernier instantané (`Snapshot.naissances`).
   *
   * **Le rendu les déduisait, et il avait tort de devoir le faire.** Il
   * reconnaissait une recrue à son `ageWeeks` inférieur à l'intervalle du
   * journal — ce qui marchait, mais confondait « arrivé depuis la dernière
   * fois » avec « jeune », et perdait toute naissance suivie d'une mort dans le
   * même intervalle. Le moteur les rapporte maintenant, avec leur position.
   */
  naissances?: readonly NaissanceDeLaSemaine[];
  /**
   * Les tiges que la **croissance** a fait changer de stade
   * (`Snapshot.franchissements`).
   *
   * Le stade lui-même se calcule de la hauteur (`stadeDe`), donc le rendu le
   * connaît déjà ; ce qu'il ne peut pas faire, c'est comparer deux instants.
   * D'où l'événement, et lui seul.
   */
  franchissements?: readonly FranchissementDeStade[];
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
       * qui permet de faire **courir** une ligne de flammes au lieu de noircir un
       * patch d'un coup ». Sans eux, le plan aurait obligé le dessin à
       * noircir d'un coup, c'est-à-dire à perdre la seule chose qui rend un
       * incendie pédagogique.
       */
      rangs: readonly number[];
      /**
       * Charge de combustible de chaque cellule de `brulees`, même ordre.
       *
       * **C'est dans quoi le feu a brûlé**, et le moteur le dit depuis qu'il
       * expose `IncendieResult.charges`. Le rang dit où le front passe et
       * quand ; la charge dit avec quelle violence, et c'est elle qui donne la
       * hauteur des flammes — hautes dans l'ajonc, basses dans le pré. Sans
       * elle le rendu les dessinait toutes à la même hauteur de convention.
       */
      charges: readonly number[];
    }
  | {
      quoi: "tempete";
      /** la rafale de référence à 10 m, m/s : à quelle force jouer l'acte */
      rafaleMs: number;
      /**
       * Le cap vers lequel le vent poussait, radians.
       *
       * **C'est la direction du mouvement, pas la provenance** — le contresens
       * est signalé par le moteur lui-même. Il est le même pour toutes les
       * victimes d'une même semaine, et c'est ce qui fait qu'elles penchent du
       * même côté : la signature d'une tempête sur le terrain.
       */
      versRad: number;
      victimes: readonly { id: number; hauteurM: number }[];
    }
  | { quoi: "chute"; chutes: readonly ChuteDeChandelle[] }
  | { quoi: "mort"; cause: CauseMort; morts: readonly MortDeLaSemaine[] }
  | { quoi: "geste"; geste: GesteVisible };

/**
 * Un **acte** : un groupe de changements montrés ensemble, sur un créneau.
 *
 * **Groupés, et c'est la demande littérale** : « par exemple animer tous les
 * arbres qui sont morts dans la semaine ». Trente-quatre bouleaux morts de
 * sécheresse font **un** acte à trente-quatre sujets, pas trente-quatre actes.
 * Sans ce regroupement, une semaine ordinaire de friche produirait des
 * centaines d'actes de quelques millisecondes.
 */
export interface Acte {
  sujet: Sujet;
  /** début du créneau, ms depuis le début de l'ellipse */
  debutMs: number;
  dureeMs: number;
  /**
   * Cet acte **retient**-il l'horloge ? (#163)
   *
   * **Le commanditaire a renversé la politique, et il faut le dire en toutes
   * lettres** : jusqu'ici la vitesse imposait sa durée à l'animation — « une
   * animation remplacée avant sa fin bouge sans rien dire », donc on la
   * comprimait dans le temps d'écran d'une semaine. La demande est l'inverse :
   * « c'est mieux d'attendre la fin d'une animation que de couper ». Un acte
   * bloquant va donc jusqu'au bout, et le temps du jeu l'attend.
   *
   * Tout ce qui vient du **journal** est bloquant, et c'est cohérent : le journal
   * ne rapporte que des événements, c'est-à-dire des choses qui arrivent une
   * fois et qu'on manque si on ne les montre pas. Le non bloquant est
   * l'ambiance — le vent sur les feuillages, les oiseaux (§5.11 point 1) — et
   * la **croissance**, qui court sur toute l'ellipse sans rien retenir.
   */
  bloquant: boolean;
}

export interface PlanDEllipse {
  actes: readonly Acte[];
  /** durée totale, ms — au plus le budget demandé, sauf au rythme naturel */
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
 * Le temps qu'un acte demande pour se lire, ms, par nature d'acte (#163).
 *
 * **Une première calibration, et elle s'assume comme telle.** Rien dans le
 * moteur ne dit combien de temps une chute doit prendre à l'écran : c'est une
 * durée de **présentation**, donc un choix. Les valeurs partent de ce que le
 * mouvement demande pour être suivi — un quart de tour de fût se lit en une
 * seconde environ, un feuillage qui jaunit puis tombe demande davantage parce
 * que c'est un changement d'état et non un déplacement, et un front d'incendie
 * doit parcourir la parcelle (c'est #157 : il se jouait en 100 ms).
 *
 * Elles sont toutes au-dessus d'`ACTE_LE_PLUS_COURT_MS`, qui reste le plancher
 * en dessous duquel un mouvement n'est plus lu comme un mouvement.
 */
export const DUREE_NATURELLE_MS: Readonly<Record<Sujet["quoi"], number>> = {
  // Le joueur vient d'agir : c'est l'acte qu'il attend, et il ouvre la semaine.
  geste: 1000,
  // Le front traverse la parcelle. Long exprès — voir #157.
  feu: 2500,
  // Une rafale couche ses victimes ensemble, échelonnées.
  tempete: 1200,
  // Un changement d'**état** et non un déplacement : jaunir, se défeuiller, griser.
  mort: 1400,
  // Un quart de tour autour du pied, accéléré comme une chute libre.
  chute: 900,
};

/**
 * Les natures d'acte qui retiennent l'horloge.
 *
 * Toutes, aujourd'hui : le journal ne rapporte que des événements. La table
 * existe pour que le jour où une animation d'ambiance entrera dans un plan,
 * elle y entre comme non bloquante et non comme une exception écrite ailleurs.
 */
const BLOQUANT: Readonly<Record<Sujet["quoi"], boolean>> = {
  geste: true,
  feu: true,
  tempete: true,
  mort: true,
  chute: true,
};

/**
 * **l'ordre** des actes : les causes avant leurs conséquences.
 *
 * Ce n'est pas une préférence esthétique, c'est ce qui rend une ellipse
 * lisible. Un feu passe, **puis** les arbres qu'il a tués se transforment en
 * chandelles, **puis** certaines tombent — montrer les chutes avant le feu ferait
 * de l'enchaînement un hasard. Les gestes du joueur viennent en tête : c'est
 * lui qui a agi, et le reste de la semaine en découle.
 */
const ORDRE: readonly Sujet["quoi"][] = ["geste", "feu", "tempete", "mort", "chute"];

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
    return VIDE;
  }
  // Combien d'actes tiennent au plancher de lisibilité. Au-delà, on tronque et
  // on le **dit** : c'est le repli du §6.8, pas un échec silencieux.
  const tiennent = Math.max(1, Math.floor(budgetMs / ACTE_LE_PLUS_COURT_MS));
  const gardes = sujets.slice(0, tiennent);
  const dureeMs = budgetMs / gardes.length;
  return {
    actes: gardes.map((sujet, i) => ({
      sujet,
      debutMs: i * dureeMs,
      dureeMs,
      bloquant: BLOQUANT[sujet.quoi],
    })),
    dureeMs: budgetMs,
    deborde: gardes.length < sujets.length,
    actesOmis: sujets.length - gardes.length,
  };
}

/** Un plan qui n'a rien à jouer. */
const VIDE: PlanDEllipse = { actes: [], dureeMs: 0, deborde: false, actesOmis: 0 };

/**
 * Le même plan, mais chaque acte prend le **temps qu'il lui faut** (#163).
 *
 * **C'est l'inverse de `planDEllipse`, et c'est la demande** : là-bas un
 * budget se partage entre les actes, quitte à les réduire sous le plancher de
 * lisibilité ou à en omettre ; ici chaque acte reçoit sa durée naturelle et le
 * plan dure ce que ça fait. Rien n'est omis, rien n'est comprimé — et c'est à
 * l'appelant de retenir l'horloge pendant ce temps-là, faute de quoi
 * l'instantané suivant remplacerait l'animation en cours, ce qui est
 * exactement le défaut qu'on vient corriger.
 *
 * Le regroupement, l'ordre et le débordement ne changent pas : trente-quatre
 * bouleaux morts de sécheresse restent **un** acte, et les causes précèdent
 * toujours leurs conséquences.
 */
export function planAuRythmeNaturel(journaux: readonly JournalDeSemaine[]): PlanDEllipse {
  const sujets = regrouper(journaux);
  if (sujets.length === 0) return VIDE;
  let debutMs = 0;
  const actes = sujets.map((sujet) => {
    const dureeMs = DUREE_NATURELLE_MS[sujet.quoi];
    const acte = { sujet, debutMs, dureeMs, bloquant: BLOQUANT[sujet.quoi] };
    debutMs += dureeMs;
    return acte;
  });
  return { actes, dureeMs: debutMs, deborde: false, actesOmis: 0 };
}

/** Le temps pendant lequel un plan **retient** l'horloge, ms. */
export function dureeBloquanteMs(plan: PlanDEllipse): number {
  let fin = 0;
  for (const acte of plan.actes) {
    if (acte.bloquant) fin = Math.max(fin, acte.debutMs + acte.dureeMs);
  }
  return fin;
}

/**
 * Regroupe les journaux en sujets, dans l'ordre de présentation.
 *
 * Le regroupement se fait sur **toute** la période et non semaine par semaine : dix
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
  const tempetes: TempeteResult[] = [];
  for (const j of journaux) {
    if (j.gestes) gestes.push(...j.gestes);
    if (j.chutes) chutes.push(...j.chutes);
    if (j.incendie) feux.push(j.incendie);
    // Une tempête par **acte**, et non fusionnées : deux rafales de deux hivers
    // n'ont pas le même cap, et les confondre coucherait les arbres de l'une
    // dans le sens de l'autre.
    if (j.tempete) tempetes.push(j.tempete);
    for (const m of j.morts ?? []) {
      const deja = parCause.get(m.cause);
      if (deja) deja.push(m);
      else parCause.set(m.cause, [m]);
    }
  }

  const sujets: Sujet[] = [];
  // Un geste par **type**, pas un par appel : trois éclaircies dans la période
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
      charges: [...f.charges],
    });
  }
  for (const t of tempetes) {
    sujets.push({
      quoi: "tempete",
      rafaleMs: t.rafaleMs,
      versRad: t.versRad,
      victimes: [...t.victimes],
    });
  }
  for (const [cause, morts] of parCause) sujets.push({ quoi: "mort", cause, morts });
  if (chutes.length > 0) sujets.push({ quoi: "chute", chutes });

  // **Trié par ordre stable**, pour qu'un même journal donne toujours le même
  // plan : le rendu est déterministe, le plan aussi (§2.1).
  return sujets.sort((a, b) => ORDRE.indexOf(a.quoi) - ORDRE.indexOf(b.quoi));
}

/**
 * Fusionne deux gestes de même type : leurs arbres, ou leurs cellules.
 *
 * **`retire` se fusionne aussi, et c'était un défaut.** Cette fonction a été
 * écrite avant que le champ n'existe : elle reconstruisait `{ type, ids }` et
 * laissait tomber le reste. Tant que personne ne lisait `retire`, la perte ne
 * se voyait pas ; depuis que la mise en scène des gestes s'y appuie (§6.2),
 * deux éclaircies dans la même ellipse auraient fait disparaître les arbres de
 * la première sans les faire tomber.
 *
 * Absent des deux côtés, il reste absent — `brouter` et `frotter` n'en ont pas,
 * et une liste vide ne veut pas dire la même chose que « pas de volume
 * retiré ».
 */
function fusionnerGestes(a: GesteVisible, b: GesteVisible): GesteVisible {
  if ("ids" in a && "ids" in b) {
    const retire = [...(a.retire ?? []), ...(b.retire ?? [])];
    return {
      type: a.type,
      ids: [...a.ids, ...b.ids],
      ...(retire.length > 0 ? { retire } : {}),
    };
  }
  if ("cellules" in a && "cellules" in b) {
    return { type: a.type, cellules: [...a.cellules, ...b.cellules] };
  }
  // Deux formes différentes sous le même type : le moteur ne le fait pas, et
  // s'il le faisait, garder le premier vaut mieux qu'inventer une union.
  return a;
}
