/**
 * LA FAUNE EN INDIVIDUS (issue #187, lot 1 : « l'animal existe »).
 *
 * Jusqu'ici, tout ce qui vole ou court dans ce moteur était une GRANDEUR. Les
 * cervidés et le sanglier sont une densité de paysage dont la parcelle capte
 * une part (`gibier.ts`, `sanglier.ts`) ; les ravageurs sont une population par
 * cellule, mais anonyme ; et les auxiliaires n'existent même pas — `ravageurs.ts`
 * écrit `PREDATION_MAX · habitat`, c'est-à-dire qu'il les suppose.
 *
 * Ce module pose l'autre modèle, et **c'est un choix d'architecture pris
 * explicitement** : on veut des individus, pour que le joueur s'attache, et pour
 * qu'« une mésange vient nicher chez toi » soit un événement de la partie.
 *
 * ── LA RÈGLE DE PARTAGE : CE QUI S'ANCRE CONTRE CE QUI TRAVERSE ──────────────
 *
 * Une buse dont le domaine vital fait 300 ha n'habite pas une parcelle de deux
 * hectares : elle la survole. Celle qui y NICHE, en revanche, en est un
 * individu, et abattre son arbre l'expulse.
 *
 * > **Est un INDIVIDU ce qui s'ancre dans la parcelle par un nid, une loge ou
 * > une hutte. Est une DENSITÉ DE PAYSAGE ce qui ne fait que la traverser.**
 *
 * Cette règle n'est pas une commodité de modélisation, c'est la bonne biologie,
 * et elle fait trois choses d'un coup : elle BORNE l'effectif (un gîte est une
 * place, et il n'y en a qu'un nombre fini), elle donne l'ÉVÉNEMENT (l'arbre qui
 * tombe expulse quelqu'un de nommé, sans que rien ne soit scripté), et elle
 * PLAFONNE LE COÛT (un rapace à 1 000 m de rayon ne touche que les cellules de
 * la parcelle, donc il ne coûte pas plus cher qu'une mésange).
 *
 * ── CE QUE CE LOT FAIT, ET CE QU'IL NE FAIT PAS ──────────────────────────────
 *
 * Il fait exister l'animal : une fiche, une identité, une installation sur un
 * gîte libre, un départ quand le gîte disparaît. **Il ne touche aucun critère
 * vert du référentiel**, et c'est délibéré : la part « gîte » de l'habitat des
 * auxiliaires reste le proxy qu'elle est aujourd'hui (`ravageurs.ts`), et ce
 * sera le lot 3 de la faire payer. Un effectif qui ne fait rien encore, mais
 * qu'on peut voir naître et partir.
 *
 * **Lot 2 — LA TABLE.** Un gîte ne suffit pas : un nichoir dans un désert reste
 * vide. L'installation demande donc un gîte ET une table, comme le moteur
 * l'exige déjà des pollinisateurs (G4), et un individu qui ne mange pas deux
 * saisons de suite s'en va. Les ressources lues existaient déjà : la table n'a
 * rien inventé, elle a déclaré qui prélève quoi — et elle en a RETIRÉ deux sur
 * quatre après mesure, ce que `Ressource` raconte juste en dessous.
 *
 * Il ne fait toujours pas se reproduire ni mourir de vieillesse : un individu
 * s'installe, il reste tant que son gîte tient et que la table suit, et il part
 * sinon.
 *
 * ── LA LIMITE À CONNAÎTRE : LA PARCELLE NE VOIT PAS SES VOISINS ──────────────
 *
 * Le territoire exclut les congénères DE LA PARCELLE, et rien d'autre. Sur une
 * parcelle plus petite qu'un territoire, le modèle dit donc « si le couple du
 * coin niche ici, il niche ici » et ne peut pas savoir qu'il niche déjà trois
 * cents mètres plus loin. C'est une borne SUPÉRIEURE, pas une densité.
 *
 * Ce qui la rend acceptable est la rareté (`partDuTerritoire`) : sur un demi-
 * hectare, l'installation d'une buse est un événement d'une vie, pas d'une
 * décennie. Ce qui la lèverait vraiment est le voisinage (`station.voisinage`),
 * qui dirait ce que le paysage porte déjà. Ce n'est pas ce lot.
 *
 * ── LE COMMUTATEUR, ET LA VRAIE RAISON DE L'AVOIR ────────────────────────────
 *
 * `station.faune` allume le mécanisme. Le coût de calcul ne le justifie PAS —
 * mesuré sur la branche du prototype, la faune par bloc est plate à 500
 * individus, dans le bruit. Il vaut pour deux autres raisons : la
 * reproductibilité (les individus ajoutent des tirages, donc une partie avec
 * faune diverge d'une partie sans), et surtout **il EST le contrôle de
 * neutralité** — éteint, le tick ne fait rien de plus, pas même une allocation,
 * et l'empreinte de la partie est celle d'avant.
 */

import { diametreCaviteCm, hauteurCaviteM, volumeCaviteTotalL } from "./cavites";
import { forEachDiscCell, type GridDims, type GrilleLue } from "./grid";
import type { TreeState } from "./trees";

/**
 * Où l'animal s'ancre. Ce n'est pas une étiquette décorative : les trois types
 * ne se jugent pas sur les mêmes grandeurs.
 *
 *  - `cavite` — l'animal loge DANS l'arbre. Ce qui décide est le creux : son
 *    volume, l'ouverture qu'il peut porter, sa hauteur au-dessus du sol.
 *  - `hutte` — l'animal construit un dôme de branchages DANS la ramure. Ce qui
 *    décide est le support : un arbre assez gros, assez haut.
 *  - `aire` — un nid de branches posé sur une fourche maîtresse. Même logique
 *    que la hutte, en beaucoup plus exigeant.
 */
export type TypeDeGite = "cavite" | "hutte" | "aire";

/**
 * CE QUI NOURRIT, et d'où le moteur le tire.
 *
 * Deux postes, et **il y en avait quatre dans le premier jet**. Ce qui les a
 * ramenés à deux est une mesure, pas une opinion — voir plus bas.
 *
 *  - `invertebres` — `soil.ravageurs`. Ce que `ravageurs.ts` appelle une
 *    pullulation, une mésange l'appelle un garde-manger : c'est la même
 *    biomasse de chenilles et de larves, vue des deux bouts. **C'est un PROXY
 *    et il faut le dire** : cette grandeur suit la dynamique des ravageurs, pas
 *    la phénologie des chenilles de mai. Ce qu'elle rend justement, c'est que
 *    des arbres nourrissent des insectivores et qu'un champ nu n'en nourrit pas.
 *  - `micromammiferes` — `soil.herbeBiomasse`. Le moteur ne modélise pas les
 *    campagnols ; il tient l'herbe où ils vivent, et la relation est réelle —
 *    une prairie haute en porte, un sol nu n'en porte pas. Ce n'est pas une
 *    mesure de la proie, c'est une mesure de son habitat. Conséquence juste et
 *    non voulue : une buse préfère l'ouvert au couvert.
 *
 * ── LES DEUX QUI ONT ÉTÉ RETIRÉS, ET POURQUOI ────────────────────────────────
 *
 * **Le nectar** (`soil.ressourceFlorale`) n'a aucun consommateur dans l'atlas :
 * la guilde des pollinisateurs viendra, et la ressource avec elle. Déclarer un
 * poste que personne ne lit, c'est le laisser dériver sans que rien ne le dise.
 *
 * **Les fruits** ont demandé une mesure pour être compris, et c'est la plus
 * instructive du lot. Un peuplement mûr de chênes rend `fruitsKg = 0` toute
 * l'année, toutes semaines confondues. Ce n'est pas un défaut de fructification :
 * le bloc `fruits` de l'atlas décrit une RÉCOLTE — ce qu'un verger donne au
 * joueur — et onze espèces sur vingt-six en portent un. **La glandée n'existe
 * pas dans ce moteur.** Un écureuil nourri aux `fruitsKg` mangerait le verger et
 * jamais les chênes, ce qui est le contraire de sa biologie. L'écureuil et le
 * loir restent donc SANS table, jugés sur leur seul gîte comme au lot 1, et la
 * glandée est sortie en #197 — c'est un mécanisme à part entière, pas un champ
 * à brancher.
 */
export type Ressource = "invertebres" | "micromammiferes";

/**
 * Une fiche de faune. **C'est une FICHE, jamais un `if (especeId === …)`** : ce
 * que l'atlas déclare ici, le moteur le lit sans savoir de quelle bête il
 * s'agit. Ajouter une guilde entière ne doit demander aucune ligne de code.
 */
export interface EspeceFaune {
  id: string;
  nom: string;
  nomLatin: string;
  gite: TypeDeGite;
  /**
   * Volume de loge, litres — ce que l'animal occupe dans le creux *(à
   * calibrer ; ancré sur le volume intérieur des nichoirs normalisés, qui est
   * la seule mesure publiée de ce que ces espèces acceptent)*. Ignoré hors
   * `cavite`.
   */
  volumeLogeL: number;
  /**
   * Diamètre d'entrée, mm. **C'est le chiffre le mieux documenté de cette
   * fiche** : les diamètres de trou des nichoirs sont normalisés espèce par
   * espèce, précisément parce qu'ils trient (LPO, Nichoirs et mangeoires ;
   * Schwegler). Ignoré hors `cavite`.
   */
  entreeMinMm: number;
  /** Hauteur minimale du gîte au-dessus du sol, m *(à calibrer)*. */
  hauteurGiteMinM: number;
  /**
   * Diamètre minimal du support porteur, cm — une fourche qui tient une aire,
   * une ramure qui tient une hutte *(à calibrer)*. Ignoré pour `cavite`.
   */
  supportMinCm: number;
  /**
   * Rayon du domaine vital, m. C'est la DISTANCE MINIMALE entre deux gîtes de
   * la même espèce : un couple n'en tolère pas un autre dans son territoire, et
   * c'est ce qui borne l'effectif bien avant que les gîtes ne manquent.
   */
  territoireM: number;
  /**
   * Semaine de l'année où l'espèce cherche son gîte. Un oiseau prospecte au
   * printemps, un écureuil bâtit sa hutte en fin d'hiver, un loir sort
   * d'hibernation en mai. C'est une donnée de fiche, pas un cas particulier du
   * code : le moteur ne fait que comparer `week % 52`.
   */
  semaineInstallation: number;
  /**
   * Probabilité qu'un gîte libre et convenable trouve preneur cette année-là
   * ∈ ]0,1] *(à calibrer)*. Ce n'est pas une commodité : un gîte vacant ne se
   * remplit pas d'office, il faut qu'un individu du paysage passe par là. Plus
   * l'espèce est rare et exigeante, plus c'est long.
   */
  colonisationParAn: number;
  /**
   * **CE QUE L'ANIMAL MANGE**, et ce qu'il lui en faut (lot 2).
   *
   * Le gîte ne suffit pas : un nichoir dans un désert reste vide.
   *
   * **FACULTATIF, et l'absence est une position tenue** : une espèce dont la
   * nourriture n'existe pas encore dans le moteur est jugée sur son seul gîte,
   * comme au lot 1. Mieux vaut une table manquante et dite qu'une table
   * branchée sur une grandeur qui ne veut pas ce qu'on croit — c'est ce qui
   * serait arrivé à l'écureuil, faute de glandée.
   */
  table?: { ressource: Ressource; seuil: number };
  /**
   * Semaine de l'année où l'on fait le BILAN de la table. Ignorée sans table.
   *
   * Ce n'est pas la semaine d'installation : on s'installe au printemps et on
   * échoue à nourrir sa nichée plus tard. Une donnée de fiche, comme le reste.
   */
  semaineBilan?: number;
}

/**
 * L'ATLAS DE FAUNE — première fournée, celle que #183 a rendue possible.
 *
 * Les cavernicoles d'abord, parce que le moteur sait depuis peu compter les
 * litres de creux d'un arbre (`cavites.ts`) et que c'est le volume, et lui
 * seul, qui décide de qui peut nicher. Puis l'écureuil et la buse, parce que la
 * consigne était « toute la faune qui peut s'installer » et qu'un modèle qui ne
 * saurait faire que des mésanges aurait mal vieilli : la hutte et l'aire
 * obligent à traiter le gîte CONSTRUIT, qui ne se juge pas comme un creux.
 *
 * Les territoires sont des ordres de grandeur d'ouvrages de terrain, arrondis,
 * et convertis en rayon d'un disque de même surface. Les volumes de loge sont
 * les plus incertains — un creux naturel n'a pas les dimensions d'un nichoir —
 * et c'est pourquoi ils portent tous *(à calibrer)*.
 */
export const FAUNE: readonly EspeceFaune[] = [
  {
    id: "mesange_bleue",
    nom: "mésange bleue",
    nomLatin: "Cyanistes caeruleus",
    gite: "cavite",
    volumeLogeL: 2,
    entreeMinMm: 28,
    hauteurGiteMinM: 2,
    supportMinCm: 0,
    // ~1 ha par couple en futaie feuillue → rayon 56 m.
    territoireM: 56,
    semaineInstallation: 13,
    colonisationParAn: 0.7,
    table: { ressource: "invertebres", seuil: 0.004 },
    semaineBilan: 20,
  },
  {
    id: "mesange_charbonniere",
    nom: "mésange charbonnière",
    nomLatin: "Parus major",
    gite: "cavite",
    volumeLogeL: 3,
    entreeMinMm: 32,
    hauteurGiteMinM: 2,
    supportMinCm: 0,
    // ~1,5 ha par couple → rayon 69 m.
    territoireM: 69,
    semaineInstallation: 13,
    colonisationParAn: 0.7,
    table: { ressource: "invertebres", seuil: 0.004 },
    semaineBilan: 20,
  },
  {
    id: "pic_epeiche",
    nom: "pic épeiche",
    nomLatin: "Dendrocopos major",
    gite: "cavite",
    volumeLogeL: 4,
    entreeMinMm: 50,
    hauteurGiteMinM: 4,
    supportMinCm: 0,
    // ~7 ha par couple → rayon 150 m.
    territoireM: 150,
    semaineInstallation: 14,
    colonisationParAn: 0.4,
    table: { ressource: "invertebres", seuil: 0.003 },
    semaineBilan: 22,
  },
  {
    id: "chouette_cheveche",
    nom: "chouette chevêche",
    nomLatin: "Athene noctua",
    gite: "cavite",
    volumeLogeL: 15,
    entreeMinMm: 70,
    // Bas, et c'est voulu : la chevêche est l'emblème des têtards de saule, et
    // une tête de trogne est à hauteur d'homme. Lui demander cinq mètres
    // l'aurait exclue du gîte qui la définit.
    hauteurGiteMinM: 1.5,
    supportMinCm: 0,
    // ~20 ha par couple en bocage → rayon 250 m.
    territoireM: 250,
    semaineInstallation: 12,
    colonisationParAn: 0.25,
    table: { ressource: "micromammiferes", seuil: 0.5 },
    semaineBilan: 26,
  },
  {
    id: "loir_gris",
    nom: "loir gris",
    nomLatin: "Glis glis",
    gite: "cavite",
    volumeLogeL: 3,
    entreeMinMm: 40,
    hauteurGiteMinM: 2,
    supportMinCm: 0,
    territoireM: 45,
    semaineInstallation: 20,
    colonisationParAn: 0.5,
  },
  {
    id: "ecureuil_roux",
    nom: "écureuil roux",
    nomLatin: "Sciurus vulgaris",
    gite: "hutte",
    volumeLogeL: 0,
    entreeMinMm: 0,
    hauteurGiteMinM: 6,
    supportMinCm: 15,
    // ~5 ha par individu → rayon 126 m.
    territoireM: 126,
    semaineInstallation: 6,
    colonisationParAn: 0.5,
  },
  {
    id: "buse_variable",
    nom: "buse variable",
    nomLatin: "Buteo buteo",
    gite: "aire",
    volumeLogeL: 0,
    entreeMinMm: 0,
    hauteurGiteMinM: 10,
    supportMinCm: 35,
    // Les aires voisines sont distantes de 1 à 2 km ; c'est cette distance-là
    // qui borne, pas les 300 ha du domaine vital — lequel déborde très
    // largement la parcelle et n'y décide de rien.
    territoireM: 700,
    semaineInstallation: 8,
    colonisationParAn: 0.2,
    table: { ressource: "micromammiferes", seuil: 0.6 },
    semaineBilan: 24,
  },
];

const PAR_ID = new Map(FAUNE.map((e) => [e.id, e]));

export function especeFaune(id: string): EspeceFaune | undefined {
  return PAR_ID.get(id);
}

/** Un individu installé : une identité, une espèce, et l'arbre qui le porte. */
export interface IndividuFaune {
  id: number;
  especeId: string;
  /** l'arbre qui porte le gîte — c'est l'ancrage, et c'est ce qui le fera partir */
  arbreId: number;
  /** position du gîte, m (celle de son arbre) */
  x: number;
  y: number;
  /** semaine d'installation, pour le journal et pour l'âge */
  depuisSemaine: number;
  /**
   * Saisons consécutives où la table n'a pas suffi (lot 2). Absent = aucune.
   *
   * **Un animal ne déménage pas pour une mauvaise semaine.** Il échoue à
   * nourrir sa nichée sur un printemps, puis sur un second, et alors il s'en
   * va. Sans cette mémoire on obtiendrait une faune qui clignote et un journal
   * illisible ; avec elle, une mauvaise année est un avertissement et deux une
   * décision.
   */
  saisonsMaigres?: number;
}

/** Pourquoi un individu a quitté la parcelle. */
export type CauseDepart = "arbreDisparu" | "giteTropPetit" | "tableVide";

export interface InstallationFaune {
  individu: IndividuFaune;
}

export interface DepartFaune {
  individu: IndividuFaune;
  cause: CauseDepart;
}

/**
 * L'arbre offre-t-il le support d'un gîte CONSTRUIT (hutte, aire) ?
 *
 * Une chandelle sèche ne porte pas d'aire : il faut une ramure. C'est le seul
 * endroit où `alive` compte, et il compte pour une raison physique.
 */
function supporteUnGiteConstruit(tree: TreeState, espece: EspeceFaune): boolean {
  return (
    tree.alive && tree.diametreCm >= espece.supportMinCm && tree.heightM >= espece.hauteurGiteMinM
  );
}

/**
 * Le creux de l'arbre convient-il à l'espèce, indépendamment de qui l'occupe
 * déjà ? Trois conditions, et chacune est une grandeur que le moteur sait déjà
 * produire depuis #183.
 */
function creuxConvient(tree: TreeState, espece: EspeceFaune): boolean {
  if (volumeCaviteTotalL(tree) < espece.volumeLogeL) return false;
  // **L'ENTRÉE NE PEUT PAS ÊTRE PLUS LARGE QUE LA CHAMBRE.** C'est une borne
  // géométrique, pas une modélisation de l'entrée elle-même : dans la réalité
  // c'est le pic qui creuse le trou, et il le fait à SA taille. Ce que le
  // moteur peut affirmer sans rien inventer, c'est qu'une chevêche ne passe pas
  // par un fût dont l'alésage fait quatre centimètres. La condition est donc
  // NÉCESSAIRE et pas suffisante, et c'est écrit plutôt que masqué.
  if (diametreCaviteCm(tree) * 10 < espece.entreeMinMm) return false;
  return hauteurCaviteM(tree) >= espece.hauteurGiteMinM;
}

/**
 * Litres de creux déjà pris par les occupants d'un arbre.
 *
 * Un vieux chêne creux à deux cents litres loge plusieurs pensionnaires — c'est
 * le fait de terrain, un arbre-habitat porte des dendromicrohabitats multiples
 * — mais il n'en loge pas cinquante : ce qui les limite d'abord est le budget
 * de litres, et ensuite, bien plus vite, le territoire de chacun.
 */
function litresOccupes(individus: readonly IndividuFaune[], arbreId: number): number {
  let total = 0;
  for (const ind of individus) {
    if (ind.arbreId !== arbreId) continue;
    total += especeFaune(ind.especeId)?.volumeLogeL ?? 0;
  }
  return total;
}

/** Un gîte construit est exclusif : une seule aire, une seule hutte par arbre. */
function porteDejaCeGite(
  individus: readonly IndividuFaune[],
  arbreId: number,
  gite: TypeDeGite,
): boolean {
  return individus.some(
    (ind) => ind.arbreId === arbreId && especeFaune(ind.especeId)?.gite === gite,
  );
}

/** Y a-t-il déjà un congénère dans le territoire ? */
function territoireLibre(
  individus: readonly IndividuFaune[],
  espece: EspeceFaune,
  x: number,
  y: number,
): boolean {
  const r2 = espece.territoireM * espece.territoireM;
  for (const ind of individus) {
    if (ind.especeId !== espece.id) continue;
    const dx = ind.x - x;
    const dy = ind.y - y;
    if (dx * dx + dy * dy < r2) return false;
  }
  return true;
}

/**
 * Graine LOCALE d'une tentative d'installation — modèle `graineDeChute`
 * (boisMort.ts).
 *
 * Elle ne consomme pas le flux aléatoire principal, et c'est la règle du dépôt :
 * un mécanisme qui tire au sort n'a presque jamais besoin du flux commun, et
 * s'en servir déplacerait toutes les parties existantes. Trois entrées, parce
 * que trois choses distinguent une tentative d'une autre : l'arbre, l'espèce et
 * l'année.
 */
export function graineInstallation(idArbre: number, idEspece: string, semaine: number): number {
  let h = 2166136261;
  for (let i = 0; i < idEspece.length; i++) {
    h ^= idEspece.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (idArbre * 2654435761 + h + semaine * 40503) >>> 0;
}

/** Un flottant dans [0,1[ tiré d'une graine locale, sans état à faire circuler. */
function tirageLocal(graine: number): number {
  let x = graine >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 4294967296;
}

/**
 * Les individus qui PARTENT, parce que leur ancrage n'est plus là.
 *
 * Deux causes, et aucune n'est un tirage : l'arbre a quitté la parcelle (abattu,
 * ou sa chandelle s'est abattue — `tick.ts` le retire alors de `state.trees`),
 * ou le gîte a cessé de convenir. La seconde arrive vraiment : une trogne qu'on
 * rabat ne perd pas son creux, mais un arbre dont on récolte la bille, si.
 */
export function departs(
  individus: readonly IndividuFaune[],
  trees: readonly TreeState[],
): DepartFaune[] {
  if (individus.length === 0) return [];
  const parId = new Map(trees.map((t) => [t.id, t]));
  const sortants: DepartFaune[] = [];
  for (const individu of individus) {
    const arbre = parId.get(individu.arbreId);
    if (arbre === undefined) {
      sortants.push({ individu, cause: "arbreDisparu" });
      continue;
    }
    const espece = especeFaune(individu.especeId);
    if (espece === undefined) continue;
    const tientEncore =
      espece.gite === "cavite"
        ? creuxConvient(arbre, espece)
        : supporteUnGiteConstruit(arbre, espece);
    if (!tientEncore) sortants.push({ individu, cause: "giteTropPetit" });
  }
  return sortants;
}

/**
 * La part d'un territoire d'espèce que la parcelle représente ∈ ]0,1].
 *
 * **C'est la règle qui empêche le modèle de devenir absurde**, et elle est le
 * prolongement direct de « ce qui s'ancre contre ce qui traverse ». Un couple
 * de buses occupe seul cent cinquante hectares : la chance que SON aire tombe
 * sur vos six mille mètres carrés n'est pas celle d'un couple de mésanges, dont
 * le territoire fait un hectare et tient tout entier chez vous.
 *
 * Sans ce facteur, une parcelle de jardin abritait une buse, une chevêche et un
 * écureuil à coup sûr en dix ans — soit, ramené à l'hectare, des densités de
 * dix à cent fois ce que le terrain donne. Avec, les espèces à grand domaine
 * deviennent ce qu'elles sont : rares, et méritées. C'est aussi pourquoi
 * agrandir la parcelle ne fait pas qu'ajouter des arbres — elle devient une
 * fraction plus grande d'un territoire, et des espèces changent de statut.
 */
function partDuTerritoire(espece: EspeceFaune, aireParcelleM2: number): number {
  const aireTerritoireM2 = Math.PI * espece.territoireM * espece.territoireM;
  if (aireTerritoireM2 <= 0) return 1;
  return Math.min(1, aireParcelleM2 / aireTerritoireM2);
}

/**
 * Ce que le moteur donne à lire pour nourrir la faune.
 *
 * Passé en argument plutôt que lu depuis `GameState` : ce module ne connaît ni
 * le sol ni le tick, et c'est ce qui permet de l'éprouver sur une parcelle
 * fabriquée à la main.
 */
export interface TableDeLaParcelle {
  /** `soil.ravageurs`, par cellule */
  invertebres: GrilleLue;
  /** `soil.herbeBiomasse`, par cellule — le PROXY des micromammifères */
  micromammiferes: GrilleLue;
}

/**
 * Ce que le territoire d'un individu offre, dans son unité propre et rapporté
 * à la cellule (ou à l'hectare pour les fruits).
 *
 * **Seules les cellules DE LA PARCELLE comptent**, parce que ce sont les seules
 * que le moteur connaisse — et c'est la même limite que partout ailleurs ici :
 * la parcelle ne voit pas ses voisins. Ce qu'on en fait est traité par
 * `satisfaction`, pas ici.
 */
export function offreDuTerritoire(
  espece: EspeceFaune,
  x: number,
  y: number,
  dims: GridDims,
  table: TableDeLaParcelle,
): number {
  if (espece.table === undefined) return Number.POSITIVE_INFINITY;
  const grille =
    espece.table.ressource === "invertebres" ? table.invertebres : table.micromammiferes;

  let total = 0;
  let cellules = 0;
  forEachDiscCell(dims, x, y, espece.territoireM, (i) => {
    total += grille[i] ?? 0;
    cellules++;
  });
  return cellules > 0 ? total / cellules : 0;
}

/**
 * À quel point la parcelle NOURRIT cet individu ∈ [0,1].
 *
 * **Le point délicat du lot, et il se règle avec une notion déjà écrite.** Un
 * demi-hectare peut affamer une mésange, dont l'hectare de territoire tient
 * presque entier chez vous. Il ne peut pas affamer une buse, qui chasse sur
 * cent cinquante hectares dont vous n'êtes que quatre millièmes : ce que vous
 * faites de votre herbe ne décide de rien pour elle. Le manque ne compte donc
 * qu'à hauteur de ce que la parcelle pèse dans le territoire — exactement le
 * facteur qui rend déjà l'installation d'une buse rare.
 *
 * Une seule formule, et elle rend les deux comportements :
 *
 *     satisfaction = 1 − part_du_territoire × manque
 *
 * où le manque va de 0 (le seuil est atteint) à 1 (rien du tout).
 */
export function satisfaction(espece: EspeceFaune, offre: number, aireParcelleM2: number): number {
  // Sans table déclarée, l'espèce est jugée sur son seul gîte : elle est
  // toujours contente, et c'est le comportement du lot 1.
  const seuil = espece.table?.seuil;
  if (seuil === undefined || seuil <= 0) return 1;
  const manque = Math.min(1, Math.max(0, 1 - offre / seuil));
  return 1 - partDuTerritoire(espece, aireParcelleM2) * manque;
}

/**
 * En dessous de quoi une saison compte pour maigre *(à calibrer)*.
 *
 * La moitié : la parcelle ne nourrit que la moitié de ce qu'il faudrait, pour
 * la part du territoire qu'elle représente.
 */
export const SATISFACTION_SUFFISANTE = 0.5;

/**
 * Saisons maigres consécutives au bout desquelles l'animal s'en va *(à
 * calibrer)*. Deux : une mauvaise année est un accident, deux sont un lieu.
 */
export const SAISONS_MAIGRES_AVANT_DEPART = 2;

/**
 * Le BILAN DE TABLE de la semaine : qui a faim, et qui s'en va.
 *
 * Rend les individus mis à jour — leur compteur de saisons maigres a bougé — et
 * ceux qui partent. Ne fait rien hors des semaines de bilan déclarées par les
 * fiches, donc dort cinquante semaines sur cinquante-deux comme l'installation.
 */
export function bilanDeTable(
  individus: readonly IndividuFaune[],
  dims: GridDims,
  table: TableDeLaParcelle,
  semaine: number,
  aireParcelleM2: number,
): { individus: IndividuFaune[]; partants: DepartFaune[] } {
  const semaineDeLAnnee = semaine % 52;
  const restants: IndividuFaune[] = [];
  const partants: DepartFaune[] = [];
  let quelquUnABouge = false;

  for (const individu of individus) {
    const espece = especeFaune(individu.especeId);
    if (espece?.table === undefined || espece.semaineBilan !== semaineDeLAnnee) {
      restants.push(individu);
      continue;
    }
    const offre = offreDuTerritoire(espece, individu.x, individu.y, dims, table);
    const contente = satisfaction(espece, offre, aireParcelleM2) >= SATISFACTION_SUFFISANTE;
    const maigres = contente ? 0 : (individu.saisonsMaigres ?? 0) + 1;
    if (maigres >= SAISONS_MAIGRES_AVANT_DEPART) {
      partants.push({ individu, cause: "tableVide" });
      quelquUnABouge = true;
      continue;
    }
    if (maigres !== (individu.saisonsMaigres ?? 0)) {
      restants.push(
        maigres === 0
          ? { ...individu, saisonsMaigres: 0 }
          : { ...individu, saisonsMaigres: maigres },
      );
      quelquUnABouge = true;
      continue;
    }
    restants.push(individu);
  }

  // Rendre le MÊME tableau quand rien n'a bougé : le bilan tombe une fois par
  // an et par espèce, et le reste du temps il ne doit rien coûter, pas même une
  // copie.
  return { individus: quelquUnABouge ? restants : (individus as IndividuFaune[]), partants };
}

/**
 * Les individus qui S'INSTALLENT cette semaine.
 *
 * Le balayage n'a lieu que les semaines d'installation déclarées par les fiches
 * — une par espèce et par an —, donc ce mécanisme dort cinquante semaines sur
 * cinquante-deux. Les arbres sont parcourus dans l'ordre de la parcelle, et
 * chaque installation est prise en compte pour la suivante : le premier arrivé
 * prend le territoire, ce qui est exactement ce qui se passe.
 */
export function installations(
  individus: readonly IndividuFaune[],
  trees: readonly TreeState[],
  semaine: number,
  premierId: number,
  aireParcelleM2: number,
  dims: GridDims,
  table: TableDeLaParcelle,
): InstallationFaune[] {
  const semaineDeLAnnee = semaine % 52;
  const especes = FAUNE.filter((e) => e.semaineInstallation === semaineDeLAnnee);
  if (especes.length === 0) return [];

  const presents: IndividuFaune[] = [...individus];
  const nouveaux: InstallationFaune[] = [];
  let prochainId = premierId;
  for (const espece of especes) {
    for (const arbre of trees) {
      if (espece.gite === "cavite") {
        if (!creuxConvient(arbre, espece)) continue;
        const reste = volumeCaviteTotalL(arbre) - litresOccupes(presents, arbre.id);
        if (reste < espece.volumeLogeL) continue;
      } else {
        if (!supporteUnGiteConstruit(arbre, espece)) continue;
        if (porteDejaCeGite(presents, arbre.id, espece.gite)) continue;
      }
      if (!territoireLibre(presents, espece, arbre.x, arbre.y)) continue;
      // **UN GÎTE ET UNE TABLE, ET LA PLUS RARE DÉCIDE.** C'est l'idiome que le
      // moteur applique déjà aux pollinisateurs (G4, `min(habitat, ressource)`),
      // et il aurait été incohérent que la faune en individus l'ignore. Ici la
      // table ne ferme pas la porte, elle rend le lieu moins attirant : une
      // parcelle à demi nourrissante reçoit deux fois moins de candidats, ce
      // qui est plus proche du terrain qu'un seuil.
      const nourriture = satisfaction(
        espece,
        offreDuTerritoire(espece, arbre.x, arbre.y, dims, table),
        aireParcelleM2,
      );
      const chance =
        espece.colonisationParAn * partDuTerritoire(espece, aireParcelleM2) * nourriture;
      const tirage = tirageLocal(graineInstallation(arbre.id, espece.id, semaine));
      if (tirage >= chance) continue;
      const individu: IndividuFaune = {
        id: prochainId++,
        especeId: espece.id,
        arbreId: arbre.id,
        x: arbre.x,
        y: arbre.y,
        depuisSemaine: semaine,
      };
      presents.push(individu);
      nouveaux.push({ individu });
    }
  }
  return nouveaux;
}

/**
 * Nombre de territoires d'INSECTIVORES qui se recouvrent sur une cellule
 * au-delà duquel un auxiliaire de plus n'y change plus rien (issue #187, lot 3).
 *
 * Un bois feuillu tempéré bien pourvu porte de l'ordre de trois à cinq couples
 * d'insectivores cavernicoles à l'hectare — mésanges pour l'essentiel, un pic
 * par plusieurs hectares. Trois territoires superposés situent donc le moteur au
 * bas de cette fourchette, ce qui est le bon côté pour un seuil de SATURATION :
 * on ne veut pas qu'il soit atteint par une parcelle médiocre *(à confirmer)*.
 */
export const AUXILIAIRES_SUFFISANTS = 3;

/**
 * Combien d'insectivores INSTALLÉS couvrent chaque cellule de leur territoire
 * (issue #187, lot 3).
 *
 * **C'est ce qui fait cesser le proxy.** `ravageurs.ts` estimait jusqu'ici la
 * part « gîte » de l'habitat des auxiliaires par des litres de cavité et des
 * tonnes de bois mort, c'est-à-dire par *« y a-t-il de quoi loger »*. Or une
 * cavité vide ne mange pas de pucerons. Ce que ce lot substitue au proxy est
 * *« y a-t-il effectivement quelqu'un de logé »* — et ce quelqu'un n'existe que
 * si le gîte lui va ET si la table le nourrit (lot 2), donc le nouveau terme
 * contient l'ancien et lui ajoute la condition qui manquait.
 *
 * Seules les espèces dont la table est faite d'INVERTÉBRÉS comptent : une
 * chevêche mange des campagnols, un écureuil des graines, et ni l'une ni
 * l'autre n'écrête une pullulation de chenilles. Aucune espèce n'est nommée —
 * c'est le champ `table.ressource` de la fiche qui tranche.
 *
 * Le territoire est peint UNIFORMÉMENT sur son disque. Une décroissance depuis
 * le gîte serait plus fine, et elle est à instruire ; en l'état on ne saurait
 * pas la caler, et une forme inventée vaudrait moins qu'un disque assumé.
 */
export function couvertureAuxiliaires(
  individus: readonly IndividuFaune[],
  dims: GridDims,
): Float64Array {
  const couverture = new Float64Array(dims.widthM * dims.heightM);
  for (const individu of individus) {
    const espece = especeFaune(individu.especeId);
    if (espece?.table?.ressource !== "invertebres") continue;
    forEachDiscCell(dims, individu.x, individu.y, espece.territoireM, (i) => {
      couverture[i] = (couverture[i] ?? 0) + 1;
    });
  }
  return couverture;
}
