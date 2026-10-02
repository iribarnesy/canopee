/**
 * **La crue comme événement** (issues #288 et #127).
 *
 * Le moteur savait qu'une parcelle était inondée une semaine donnée — la nappe
 * à moins de cinq centimètres sous une part de ses cellules, `partInondee` —,
 * il ne savait pas qu'une crue **commence**, culmine et **se retire**. Le rendu,
 * qui joue la crue comme il joue l'incendie, n'avait donc que la différence
 * entre deux instantanés, et c'est précisément la reconstruction qu'il refuse.
 *
 * Ce module ne fabrique aucune eau et ne tue personne : il **raconte** ce que le
 * tick a déjà calculé. Aucune grandeur de la simulation ne le lit, aucun tirage
 * n'est consommé, et une partie avec ou sans lui est la même au bit près.
 *
 * ## D'où vient une crue dans ce moteur
 *
 * D'une seule chose : **la nappe qui affleure**. Deux chemins y mènent, et le
 * tick les a déjà réunis dans une même profondeur de nappe par cellule :
 *
 *  - l'**aquifère** qui se remplit — un fond de vallée l'hiver, quand la pluie
 *    et le réseau régional rechargent plus vite que l'exutoire ne vide ;
 *  - l'**eau libre** qui monte — un ruisseau ou une mare dont le bassin verse,
 *    et dont la nappe soulève celle des berges (`hauteurDeCrueM`).
 *
 * L'eau qui **court** n'en fait pas partie, et c'est le défaut que #288 a mis au
 * jour : `debordementParCellule` additionne, le long de la pente, toute l'eau
 * qui **traverse** une cellule. Sur le talweg d'un vallon dont le bassin d'amont
 * fait six hectares, toute l'eau du bassin entre par une cellule d'un mètre
 * carré et descend la parcelle de cellule en cellule : 650 m³ passent par sa
 * sortie dans la semaine d'un orage de 90 mm, soit « 652 835 mm » si on le lit
 * comme une lame. C'est un **débit**, borné par la
 * pluie de la semaine, et non une hauteur d'eau. Une crue qui s'en servirait
 * pour son emprise inonderait chaque semaine de pluie la ligne du ruisseau, et
 * pour ses lames poserait 650 m d'eau sur le lit.
 *
 * ## L'événement
 *
 * Il **commence** la semaine où l'emprise inondée dépasse `SEUIL_DEBUT_CRUE` de
 * la parcelle, et il **finit** la première semaine où elle retombe sous
 * `SEUIL_FIN_CRUE`. Deux seuils plutôt qu'un : un fond de vallée en hiver
 * oscille d'une semaine à l'autre autour de quelques pour cent, et un seuil
 * unique y découpait une même saison en événements d'une semaine.
 *
 * Chaque semaine de crue rend un `CrueResult`. La **phase** se lit sur
 * l'emprise : elle grandit, c'est la montée ; elle cesse de grandir après une
 * montée, c'est le pic ; elle continue de se réduire, c'est le retrait. Une
 * seconde vague dans la même saison repart en montée sans ouvrir un autre
 * événement — c'est le même hiver d'eau.
 *
 * ## Ce que la définition ne sait pas faire
 *
 * Les deux seuils sont des parts **de la parcelle**, et c'est leur limite. Ce
 * qui est inondé en permanence — sur le fond de vallée, la rangée du pied de
 * la parcelle, où la nappe converge — pèse d'autant plus que la parcelle est
 * petite : 1 % d'un hectare, 2,7 % d'un carré de trente mètres. Au-dessus du
 * seuil de fin, la crue ne se ferme plus jamais. Les parcelles du jeu font un
 * hectare ; une parcelle plus petite demanderait de retirer de l'emprise ce
 * qui ne sèche jamais, ce qui suppose une mémoire plus longue que celle d'une
 * crue *(à trancher)*.
 */

import type { CauseMort } from "./trees";

/**
 * Profondeur de nappe sous laquelle une cellule compte comme **inondée**, cm.
 *
 * C'est le seuil que le moteur emploie depuis toujours pour `partInondee`, et
 * celui que le rendu lit déjà pour poser sa lame (docs/interface-visuelle.md
 * §6.5). Une nappe à cinq centimètres, c'est un sol saturé jusqu'en surface :
 * la frange capillaire d'un limon dépasse largement cette épaisseur, donc la
 * surface est détrempée et l'eau de pluie y reste *(à calibrer)*.
 */
export const NAPPE_AFFLEURANTE_CM = 5;

/**
 * Part de la parcelle inondée à partir de laquelle une crue commence.
 *
 * Cinq pour cent : le seuil auquel #288 comptait déjà ses « semaines de crue »
 * sur le fond de vallée. Ce n'est pas une ancre — aucune définition
 * hydrologique d'une crue ne se rapporte à la surface d'une parcelle — mais un
 * seuil de lecture : au-dessous, une poignée de cellules dans un creux ; au-
 * dessus, une nappe qui se voit sur le terrain *(à calibrer)*.
 */
export const SEUIL_DEBUT_CRUE = 0.05;

/**
 * Part inondée sous laquelle la crue est finie.
 *
 * Plus bas que le seuil de début, pour qu'un hiver qui fléchit une semaine
 * avant de repartir reste un seul événement : c'est l'hystérésis ordinaire
 * d'un détecteur à seuil. La valeur elle-même n'a pas d'ancre *(à calibrer)* ;
 * ce qu'elle change sur le fond de vallée est relevé dans docs/realisme.md (A22).
 */
export const SEUIL_FIN_CRUE = 0.02;

export type PhaseDeCrue = "montée" | "pic" | "retrait";

/** Un arbre mort d'engorgement sur l'emprise d'une crue, la semaine même. */
export interface VictimeDeCrue {
  id: number;
  /** hauteur de l'arbre à sa mort, m */
  hauteurM: number;
}

/**
 * La crue d'une semaine, telle qu'on peut la raconter **et** la dessiner — sur
 * le modèle d'`IncendieResult`. Émise **chaque** semaine où une crue est en
 * cours, et seulement celles-là : la semaine qui suit la dernière n'en porte
 * pas, et c'est ainsi que le rendu sait que l'eau est partie.
 */
export interface CrueResult {
  /**
   * L'événement : la semaine (`state.week`) où il a commencé. Toutes les
   * semaines d'une même crue portent le même, et deux crues n'en partagent
   * jamais un.
   */
  id: number;
  /** rang de cette semaine dans l'événement, 0 pour la première */
  semaine: number;
  phase: PhaseDeCrue;
  /**
   * De combien le plan d'eau **libre** est monté cette semaine, m
   * (`hauteurDeCrueM`). Zéro sans ruisseau ni mare : la nappe d'un fond de
   * vallée monte aussi, mais sous terre, et ce qui s'en voit est l'emprise qui
   * grandit, pas une surface d'eau qui s'élève.
   */
  monteeM: number;
  /**
   * Les cellules inondées cette semaine, rangées par ordre d'arrivée de l'eau :
   * d'abord par `rangs` croissant, puis du plus bas au plus haut — une nappe
   * affleure d'abord dans les creux, un plan d'eau gagne d'abord ce qui est à
   * son niveau (`ordreDeDescente`, lu à l'envers). L'eau libre elle-même n'y est
   * pas : un ruisseau dans son lit n'est pas une crue.
   */
  cellules: Int32Array;
  /**
   * La semaine de l'événement où l'eau a atteint chaque cellule, même ordre :
   * 0 pour celles de la première semaine. C'est ce qui fait **courir** la montée
   * d'une semaine à l'autre, comme `IncendieResult.rangs` fait courir un front.
   * Une cellule qui s'est asséchée puis a été reprise compte comme une arrivée
   * neuve.
   */
  rangs: Int32Array;
  /**
   * L'eau posée sur chaque cellule cette semaine, mm, même ordre — jamais
   * négative, et nulle sur un sol détrempé qu'aucune pluie n'a mouillé.
   *
   * La plus haute de deux eaux, comme le tick prend la plus haute de deux
   * nappes : la **hauteur du plan d'eau en crue au-dessus du sol**, quand un
   * ruisseau ou une mare monte plus haut que la cellule ; sinon **ce que la
   * cellule elle-même a refusé** — la pluie qu'un sol saturé ne prend plus,
   * et ce que sa nappe fait ressortir. Ni l'une ni l'autre ne compte l'eau qui
   * ne fait que traverser : celle-là est un débit (`debordementParCellule`).
   */
  lamesMm: Float32Array;
  /**
   * Les arbres morts d'**engorgement** cette semaine sur l'emprise. Ils sont
   * aussi dans `TickResult.morts`, la même semaine : c'est la même mort, que
   * la crue nomme, pas une seconde.
   */
  victimes: VictimeDeCrue[];
  /** l'emprise la plus large atteinte depuis le début de l'événement, cellules */
  emprisePic: number;
}

/**
 * Ce que la crue en cours doit se rappeler d'une semaine à l'autre — dans
 * l'état, puisqu'une partie reprise d'une sauvegarde doit raconter la même
 * crue. Absente hors crue.
 */
export interface MemoireDeCrue {
  id: number;
  /** nombre de semaines déjà rapportées */
  semaines: number;
  /** phase de la dernière semaine rapportée */
  phase: PhaseDeCrue;
  /** emprise de la dernière semaine, cellules */
  emprise: number;
  emprisePic: number;
  /** cellules inondées la dernière semaine, et la semaine d'arrivée de chacune */
  cellules: number[];
  arrivees: number[];
}

/** Ce que le tick sait de la semaine, et que la crue lit. */
export interface SemaineDeCrue {
  /** `state.week` de la semaine simulée */
  semaine: number;
  nCells: number;
  /** profondeur de nappe par cellule cette semaine, cm */
  nappeCm: ArrayLike<number>;
  /** cellules d'eau libre, à exclure de l'emprise ; absent s'il n'y en a pas */
  enEau?: readonly boolean[];
  /** rang de chaque cellule du plus bas (0) au plus haut */
  rangDAltitude: ArrayLike<number>;
  /** de combien l'eau libre monte cette semaine, cm (`hauteurDeCrueM`) */
  crueCm: number;
  /** profondeur de la nappe d'eau libre au repos, cm (`Infinity` hors portée) */
  nappeReposCm: ArrayLike<number>;
  /** ce que chaque cellule a refusé d'elle-même cette semaine, mm */
  refusPropreMm: ArrayLike<number>;
  /** les morts de la semaine, et la cellule de chacun */
  morts: readonly { id: number; cause: CauseMort; heightM: number; cellule: number }[];
}

/**
 * Une semaine de plus dans l'histoire de la crue : le récit de la semaine s'il
 * y a une crue en cours, et la mémoire à garder pour la suivante.
 */
export function suivreLaCrue(
  memoire: MemoireDeCrue | undefined,
  s: SemaineDeCrue,
): { crue?: CrueResult; memoire?: MemoireDeCrue } {
  const inondees: number[] = [];
  for (let i = 0; i < s.nCells; i++) {
    if ((s.nappeCm[i] ?? Number.POSITIVE_INFINITY) > NAPPE_AFFLEURANTE_CM) continue;
    if (s.enEau?.[i]) continue;
    inondees.push(i);
  }
  const part = s.nCells > 0 ? inondees.length / s.nCells : 0;
  if (memoire ? part < SEUIL_FIN_CRUE : part < SEUIL_DEBUT_CRUE) return {};

  const id = memoire?.id ?? s.semaine;
  const rangSemaine = memoire?.semaines ?? 0;
  const arriveeConnue = new Map<number, number>();
  if (memoire) {
    for (let k = 0; k < memoire.cellules.length; k++) {
      const c = memoire.cellules[k];
      if (c !== undefined) arriveeConnue.set(c, memoire.arrivees[k] ?? rangSemaine);
    }
  }
  const rangDe = (i: number) => arriveeConnue.get(i) ?? rangSemaine;
  inondees.sort(
    (a, b) => rangDe(a) - rangDe(b) || (s.rangDAltitude[a] ?? 0) - (s.rangDAltitude[b] ?? 0),
  );

  const n = inondees.length;
  const phase: PhaseDeCrue = !memoire
    ? "montée"
    : n > memoire.emprise
      ? "montée"
      : memoire.phase === "montée"
        ? "pic"
        : "retrait";

  const cellules = Int32Array.from(inondees);
  const rangs = Int32Array.from(inondees, rangDe);
  const lamesMm = new Float32Array(n);
  const emprise = new Set<number>();
  for (let k = 0; k < n; k++) {
    const i = inondees[k] ?? 0;
    emprise.add(i);
    const repos = s.nappeReposCm[i] ?? Number.POSITIVE_INFINITY;
    const auDessusDuSolMm = Number.isFinite(repos) ? 10 * Math.max(0, s.crueCm - repos) : 0;
    lamesMm[k] = Math.max(auDessusDuSolMm, Math.max(0, s.refusPropreMm[i] ?? 0));
  }
  const victimes: VictimeDeCrue[] = [];
  for (const m of s.morts) {
    if (m.cause === "engorgement" && emprise.has(m.cellule)) {
      victimes.push({ id: m.id, hauteurM: m.heightM });
    }
  }
  const emprisePic = Math.max(memoire?.emprisePic ?? 0, n);
  return {
    crue: {
      id,
      semaine: rangSemaine,
      phase,
      monteeM: s.crueCm / 100,
      cellules,
      rangs,
      lamesMm,
      victimes,
      emprisePic,
    },
    memoire: {
      id,
      semaines: rangSemaine + 1,
      phase,
      emprise: n,
      emprisePic,
      cellules: inondees,
      arrivees: Array.from(rangs),
    },
  };
}
