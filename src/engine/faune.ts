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
 * Il ne fait pas non plus se reproduire ni mourir (lot 2) : un individu
 * s'installe, et il reste tant que son gîte tient.
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
}

/** Pourquoi un individu a quitté la parcelle. */
export type CauseDepart = "arbreDisparu" | "giteTropPetit";

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
      const chance = espece.colonisationParAn * partDuTerritoire(espece, aireParcelleM2);
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
