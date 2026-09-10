/**
 * Les MORTS, une mise en scène par cause (docs/interface-visuelle.md §6.3).
 *
 * **Ce module passe par la CUISSON et non par la pose, et c'est le point qui
 * décide de tout le reste.** Une chute est un mouvement : un panneau qu'on
 * incline suffit, et l'atlas ne bouge pas. Une mort de sécheresse n'est pas un
 * mouvement — c'est un feuillage qui jaunit, roussit, puis tombe. Rien de ça ne
 * s'obtient en déformant une image déjà cuite ; il faut la recuire. Le §5.11 le
 * dit dans ces termes : « les autres actes du plan […] passent par la CUISSON
 * de la vignette et non par la pose : ce sont des changements de couleur et de
 * feuillage, que la classe porte déjà. »
 *
 * **Ce qui rend ça possible sans rien inventer**, et c'est la raison pour
 * laquelle l'exercice tient debout : les quatre grandeurs qu'une mort fait
 * bouger — `partFoliaire`, `senescence`, `vigueur`, `dommageHydraulique` — sont
 * des champs du MOTEUR, que la classe de vignette quantifie déjà en paliers.
 * Une mort part donc d'un état que le moteur donne (l'arbre vivant de
 * l'instantané d'avant) et arrive à un état que le moteur donne aussi (la
 * chandelle de l'instantané d'après). Ce module ne fabrique que l'ENTRE-DEUX,
 * ce qui est la définition même d'une animation d'ellipse.
 *
 * **Ce que ça coûte, et j'avais écrit ici le contraire.** J'avais raisonné
 * « la classe est quantifiée, donc une mort ne traverse que quelques paliers
 * déjà cuits ». Faux : la clé de classe est un PRODUIT, et chaque tuple de
 * paliers se croise avec l'espèce, le palier de hauteur et la variante.
 *
 * D'où la quantification de l'avancement lui-même (`PALIERS_DE_MORT`), qui est
 * le remède que tout le reste du rendu emploie : une grandeur continue ne doit
 * jamais entrer telle quelle dans une clé de cache. Le coût devient alors
 * BORNÉ et prévisible, ce qui est le point — compté exactement sur un banc de
 * 1 868 arbres vivants (`npm run apercu:classes`) :
 *
 * 659 classes au repos ; la mort la plus chère (sécheresse, vieillesse) en
 * ajoute quatre fois autant, la moins chère aucune. Le facteur vaut exactement
 * le nombre d'états de CLASSE que la cause traverse — d'où l'intérêt de ne
 * faire bouger que les grandeurs que le §6.3 nomme, et pas une de plus.
 *
 * Deux choses que ce compte apprend, et qu'aucun raisonnement ne donnait :
 *
 *  - **les trois morts qui font DISPARAÎTRE l'arbre coûtent zéro** — labour,
 *    abroutissement, écrasement ne touchent que la pose. La séparation des deux
 *    canaux n'est donc pas qu'une question de principe, elle se paie ou se
 *    gagne ;
 *  - **le coût ne dépend pas du nombre de morts.** Trente-quatre bouleaux qui
 *    meurent ensemble au même palier partagent leurs vignettes. Le cas
 *    pathologique n'est pas « beaucoup de morts » mais « beaucoup d'ESPÈCES qui
 *    meurent », et il est atteint par un banc qui tue toute la parcelle — pas
 *    par une semaine de jeu, qui en tue deux ou trois.
 *
 * **Et une mesure au navigateur qu'il faut savoir ne pas croire** : j'ai
 * d'abord compté « les classes recuites » en échantillonnant seize images sur
 * soixante et en les additionnant. Ça donnait 965 puis 1 364 pour deux
 * variantes du même code, ce qui n'a aucun sens — la somme d'un échantillon
 * n'est pas un total. Le compte exact se fait hors navigateur, sur les clés.
 *
 * Ce qui reste continu, c'est ce qui va à la POSE : l'opacité et la hauteur ne
 * touchent aucune clé et gagnent à être lisses.
 *
 * **La trajectoire par cause vient du §6.3 et pas de moi.** Le cahier décrit
 * les onze mises en scène ; ce fichier les traduit en « quelle grandeur bouge,
 * dans quelle fenêtre de l'acte », et rien de plus.
 *
 * Module **pur** : des nombres, aucun canvas, aucun sprite.
 */

import type { MortDeLaSemaine } from "../../engine/tick";
import type { CauseMort } from "../../engine/trees";

/**
 * L'état d'un arbre en train de mourir, à un instant de son acte.
 *
 * Les quatre premiers champs remplacent ceux de l'arbre avant qu'on en calcule
 * la classe : ils vont donc à la CUISSON. Les deux derniers vont à la POSE, et
 * ne servent qu'aux morts qui font disparaître l'arbre.
 */
export interface EtatMourant {
  partFoliaire: number;
  senescence: number;
  vigueur: number;
  dommageHydraulique: number;
  /** vrai dès que l'arbre doit se dessiner en chandelle */
  chandelle: boolean;
  /**
   * Vrai dès que l'écorce doit se dessiner CHARBONNÉE ; absent = laisser
   * l'instantané décider.
   *
   * **Aucune des onze causes du §6.3 ne s'en sert, et c'est pour le torchage du
   * §6.4** (`feu.ts`) : un arbre que le front atteint noircit dès que la flamme
   * lèche son écorce, bien avant d'être un tronc mort sur pied. Entre les deux,
   * on voit un arbre noir qui a encore des feuilles — ce qui est exactement ce
   * qu'on voit d'un arbre en train d'être torché.
   *
   * Optionnel plutôt que faux par défaut : une mort de sécheresse n'a rien à
   * dire sur l'écorce, et si elle rendait `false`, elle EFFACERAIT la trace d'un
   * incendie passé sur un arbre que la sécheresse achève cinq ans plus tard.
   */
  brulee?: boolean;
  /** opacité du sprite ∈ [0,1] */
  opacite: number;
  /** échelle verticale du sprite ∈ ]0,1] */
  hauteur: number;
}

/** L'état de départ : ce que l'instantané d'avant disait de l'arbre vivant. */
export interface ArbreVivant {
  partFoliaire: number;
  senescence: number;
  vigueur: number;
  dommageHydraulique: number;
}

/**
 * Comment une cause se raconte : quelle part de l'acte chaque chose prend.
 *
 * Trois nombres et deux drapeaux suffisent aux onze causes, et c'est ce qui
 * m'a convaincu que le découpage était le bon. `jaunit` et `defeuille` sont des
 * FENÊTRES dans l'acte — « la sénescence monte entre 0 et 0,5 », « les feuilles
 * tombent entre 0,4 et 0,9 » — et leur chevauchement fait la différence entre
 * une sécheresse (jaunit puis tombe) et une défoliation de ravageurs (tombe
 * sans jaunir).
 */
interface Trajectoire {
  /** fenêtre où la sénescence monte, en parts de l'acte */
  jaunit?: [number, number];
  /** vers quoi elle monte — la chlorose garde ses feuilles jaunes */
  jaunitVers?: number;
  /** fenêtre où la part foliaire tombe */
  defeuille?: [number, number];
  /** ce qu'il en reste à la fin : la maladie garde ses feuilles brunes */
  defeuilleVers?: number;
  /** fenêtre où la vigueur tombe — l'arbre végète avant de mourir */
  fane?: [number, number];
  /** fenêtre où le dommage hydraulique monte : la cime se dégarnit */
  cimeSeche?: [number, number];
  /** fenêtre où le sprite s'efface : seulement pour ce qui DISPARAÎT */
  seffaceEntre?: [number, number];
  /** fenêtre où le sprite rapetisse : le plant brouté rentre en boule */
  rapetisseEntre?: [number, number];
  /** part de l'acte au bout de laquelle la vignette devient une chandelle */
  chandelleA: number;
}

/**
 * Les onze causes, telles que le §6.3 les décrit.
 *
 * On lit la table du cahier ligne à ligne ; ce qui suit n'est que sa
 * traduction. Les commentaires citent le cahier plutôt que de le paraphraser,
 * parce que c'est lui qui a autorité sur la mise en scène.
 */
export const TRAJECTOIRES: Record<CauseMort, Trajectoire> = {
  // « le feuillage jaunit puis roussit → les feuilles tombent → squelette
  // gris ». C'est la demande explicite du commanditaire, et la seule des onze
  // dont le cahier dit qu'elle l'est.
  // Pas de `cimeSeche` ici, et c'est une correction : je l'avais ajoutée, le
  // §6.3 ne la demande pas, et chaque grandeur qui bouge multiplie les classes
  // à cuire. La cime sèche est la signature de la VIEILLESSE — « cime dégarnie
  // progressive sur des années » — pas d'une sécheresse d'un été.
  secheresse: {
    jaunit: [0, 0.45],
    defeuille: [0.35, 0.85],
    chandelleA: 0.85,
  },
  // « jaunissement PAR LE BAS, feuillage terne » : le terne, c'est la vigueur,
  // que `teinteSelonVigueur` désature déjà. Le « par le bas » n'est pas
  // dessinable sur un panneau — la vignette n'a pas de gradient vertical de
  // feuillage — et je ne fais donc pas semblant.
  engorgement: {
    fane: [0, 0.4],
    jaunit: [0.15, 0.6],
    defeuille: [0.5, 0.9],
    chandelleA: 0.9,
  },
  // « étiolement : l'arbre s'étire, pâlit, se dégarnit, puis s'efface sans
  // bruit. Une mort discrète — c'est la plus fréquente en régénération, elle ne
  // doit pas voler la vedette. » D'où l'absence de jaunissement : rien qui
  // attire l'œil, et un effacement qui finit le travail.
  ombre: {
    fane: [0, 0.5],
    defeuille: [0.1, 0.7],
    seffaceEntre: [0.6, 1],
    chandelleA: 0.7,
  },
  // « cime dégarnie progressive sur des années, grosses branches mortes, puis
  // la chandelle » : le dommage hydraulique est exactement la grandeur que le
  // rendu dessine en cime sèche.
  vieillesse: {
    cimeSeche: [0, 0.6],
    defeuille: [0.4, 0.9],
    chandelleA: 0.9,
  },
  // « chlorose : le feuillage jaunit ENTRE LES NERVURES EN GARDANT SA FORME, la
  // croissance s'arrête ». Donc pas de défeuillaison avant la fin : c'est la
  // seule cause où l'arbre meurt avec sa couronne entière.
  solHorsGamme: {
    jaunit: [0, 0.7],
    jaunitVers: 0.8,
    fane: [0.2, 0.8],
    defeuille: [0.85, 1],
    chandelleA: 1,
  },
  // Le feu ne passe pas par ici : le §6.4 lui donne sa propre mise en scène, et
  // la vignette porte déjà `brulee`. Une trajectoire neutre plutôt qu'une
  // absence, pour que la table reste exhaustive et le type sûr.
  feu: { chandelleA: 0 },
  // « le plant rapetisse par paliers, en boule, puis disparaît ». Rapetisser
  // est un changement de TAILLE, donc la pose : la classe ne sait pas dessiner
  // un arbre plus petit que sa hauteur.
  abroutissement: {
    rapetisseEntre: [0, 0.75],
    seffaceEntre: [0.6, 1],
    chandelleA: 1.1,
  },
  // « défoliation qui progresse, couronne trouée » : la part foliaire tombe, et
  // elle tombe SANS jaunir — une feuille mangée n'est pas une feuille d'automne.
  ravageurs: {
    defeuille: [0, 0.8],
    fane: [0.3, 0.9],
    chandelleA: 0.9,
  },
  // « disparition immédiate, terre retournée » : 0,5 s dans le cahier, donc
  // presque tout l'acte est déjà fini quand il commence. La terre retournée,
  // c'est le VOILE du geste `labourer`, qui joue dans le même plan.
  labour: {
    seffaceEntre: [0, 0.3],
    chandelleA: 1.1,
  },
  // « dessèchement d'une branche puis de l'ensemble, feuilles qui restent
  // accrochées et brunes ». D'où `defeuilleVers` : la couronne ne se vide pas,
  // elle brunit sur pied. C'est la signature d'un chancre.
  maladie: {
    fane: [0, 0.35],
    jaunit: [0.1, 0.7],
    defeuille: [0.3, 0.9],
    defeuilleVers: 0.45,
    chandelleA: 0.9,
  },
  // « écorce arrachée au pied, l'arbre GARDE SES FEUILLES puis s'effondre d'un
  // coup (annelé) ». Rien ne bouge, donc, jusqu'au dernier moment : c'est une
  // mort sans préavis, et c'est ce qui la rend lisible.
  frottis: {
    defeuille: [0.85, 1],
    chandelleA: 0.9,
  },
  // « écrasé par la chute d'un arbre mort » : le cahier n'en donne pas de mise
  // en scène. Ce qu'on peut dire honnêtement est qu'il disparaît d'un coup, en
  // même temps que l'arbre qui le tue — et les deux actes jouent dans le même
  // plan, donc la simultanéité se voit.
  ecrasement: {
    rapetisseEntre: [0, 0.25],
    seffaceEntre: [0, 0.35],
    chandelleA: 1.1,
  },
};

/** Où en est une fenêtre à cet avancement : 0 avant, 1 après, linéaire dedans. */
export function dansLaFenetre(avancement: number, fenetre?: [number, number]): number {
  if (!fenetre) return 0;
  const [debut, fin] = fenetre;
  if (avancement <= debut) return 0;
  if (avancement >= fin) return 1;
  return (avancement - debut) / Math.max(1e-6, fin - debut);
}

/**
 * L'état d'un arbre mourant à un avancement donné de son acte.
 *
 * `vivant` est ce que l'instantané d'avant disait : on part de LÀ et non d'un
 * arbre en pleine forme, sinon un arbre qui végétait depuis trois ans
 * reverdirait au moment de mourir.
 */
export function mourirEnCours(
  cause: CauseMort,
  vivant: ArbreVivant,
  avancement: number,
): EtatMourant {
  const t = TRAJECTOIRES[cause];
  const brut = Math.min(1, Math.max(0, avancement));
  // **L'avancement est quantifié pour les grandeurs de CLASSE et continu pour
  // celles de POSE.** Les premières entrent dans une clé de cache, et une
  // grandeur continue dans une clé de cache est un cache qui ne sert à rien —
  // c'est la règle que `palierDe` applique partout ailleurs dans le rendu, et
  // l'oublier ici a coûté 965 recuissons là où il en faut cinq fois moins.
  const a = Math.round(brut * (PALIERS_DE_MORT - 1)) / (PALIERS_DE_MORT - 1);
  const versJaune = t.jaunitVers ?? 1;
  const resteFeuille = t.defeuilleVers ?? 0;
  return {
    senescence: vivant.senescence + (versJaune - vivant.senescence) * dansLaFenetre(a, t.jaunit),
    partFoliaire:
      vivant.partFoliaire + (resteFeuille - vivant.partFoliaire) * dansLaFenetre(a, t.defeuille),
    vigueur: vivant.vigueur * (1 - dansLaFenetre(a, t.fane)),
    dommageHydraulique:
      vivant.dommageHydraulique + (1 - vivant.dommageHydraulique) * dansLaFenetre(a, t.cimeSeche),
    chandelle: a >= t.chandelleA,
    // L'opacité et la hauteur suivent l'avancement BRUT : elles ne touchent pas
    // la clé de classe, et un effacement en cinq marches se verrait.
    opacite: 1 - dansLaFenetre(brut, t.seffaceEntre),
    // Jamais tout à fait zéro : un sprite de hauteur nulle n'est pas un arbre
    // qui a rapetissé, c'est un sprite dégénéré que Pixi pose n'importe où. Le
    // maximum explicite plutôt que la seule soustraction : celle-ci passe
    // sous la borne d'un cheveu en flottant, et une borne qu'on franchit d'un
    // cheveu n'est pas une borne.
    hauteur: Math.max(
      RAPETISSEMENT_MAXIMAL,
      1 - dansLaFenetre(brut, t.rapetisseEntre) * (1 - RAPETISSEMENT_MAXIMAL),
    ),
  };
}

/** Ce qu'il reste de haut à un plant qui a rapetissé jusqu'au bout. */
export const RAPETISSEMENT_MAXIMAL = 0.22;

/**
 * Combien d'états distincts une mort traverse, du vivant au mort.
 *
 * **Cinq, et ce nombre est un budget de CUISSON, pas un réglage esthétique.**
 * Chaque état supplémentaire multiplie les vignettes à cuire par le nombre
 * d'espèces, de paliers de hauteur et de variantes présents — c'est le produit
 * qui a fait 965 recuissons quand l'avancement était continu. À cinq, on lit
 * encore les étapes (vert → jaunissant → jaune → dégarni → chandelle) et le
 * coût reste borné et prévisible : au plus cinq fois les classes du repos.
 *
 * Le chiffre est aussi celui des paliers de feuillage, et ce n'est pas un
 * hasard : rien ne sert à distinguer plus d'états que la vignette n'en sait
 * dessiner.
 */
export const PALIERS_DE_MORT = 5;

/** L'état FINAL d'une mort : ce que l'arbre doit être quand l'acte est passé. */
export function mortAccomplie(cause: CauseMort, vivant: ArbreVivant): EtatMourant {
  return mourirEnCours(cause, vivant, 1);
}

/**
 * Les morts d'un acte, groupées par cause.
 *
 * Le plan groupe déjà par cause (`ellipse.ts` en fait un acte par cause), donc
 * ceci ne sert qu'aux appelants qui reçoivent un journal brut.
 */
export function parCause(morts: readonly MortDeLaSemaine[]): Map<CauseMort, MortDeLaSemaine[]> {
  const par = new Map<CauseMort, MortDeLaSemaine[]>();
  for (const m of morts) {
    const deja = par.get(m.cause);
    if (deja) deja.push(m);
    else par.set(m.cause, [m]);
  }
  return par;
}
