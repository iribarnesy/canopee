/**
 * La couche des arbres : du squelette à l'image posée
 * (docs/interface-visuelle.md §3 et §5.4).
 *
 * **La règle du lot L0 vaut ici plus qu'ailleurs : aucune primitive
 * vectorielle par image.** Un hectare de friche à l'an 30 porte 5 436 tiges ;
 * un feuillu de futaie fait mille segments de bois et autant de feuilles.
 * Dessiner ça par image, c'est dix millions de primitives — trois ordres de
 * grandeur au-dessus du budget. Les arbres sont donc **cuits en vignettes** et
 * posés comme des images, exactement comme le terrain.
 *
 * **Ce qui rend la cuisson payable, c'est le PARTAGE.** Une vignette n'est pas
 * cuite par arbre : elle est cuite par **classe** — une espèce, un palier de
 * hauteur, un stade, une saison, une variante. Cinq mille arbres d'une friche
 * se répartissent sur quelques dizaines de classes, et chacun pose une image
 * déjà prête. C'est ce qui fait passer le coût de « par arbre » à « par
 * classe », et c'est toute l'affaire.
 *
 * **Trois choses qu'on ne partage PAS**, parce que les partager se verrait :
 *
 * 1. **la hauteur**, quantifiée en paliers — sans quoi toute une plantation
 *    aurait la même taille au centimètre ;
 * 2. **la variante**, tirée de l'`id` de l'arbre — quatre squelettes différents
 *    par classe suffisent à casser la répétition, et c'est la seule chose que
 *    l'œil attrape dans un peuplement régulier ;
 * 3. **l'état de gestion** — un arbre élagué, trogné ou en cépée n'est pas
 *    l'arbre ordinaire de sa classe.
 *
 * **Le niveau de détail suit le zoom, et il faut qu'il le suive** : L0 a montré
 * que le point de rupture est le zoom RAPPROCHÉ, pas la parcelle entière. À
 * l'échelle de l'hectare, un arbre fait quinze pixels : y cuire mille segments
 * et trois cents feuilles serait payer un détail que personne ne voit. On cuit
 * donc la vignette à la taille où elle sera POSÉE, et le squelette se déroule
 * d'autant moins loin que cette taille est petite.
 *
 * Module **pur du DOM** au sens du dépôt : la fabrique de canvas est injectée,
 * comme pour le terrain, donc il se teste sans navigateur.
 */

import { ficheDe } from "../arbres/especes";
import { contourFeuille, elementsParFeuille } from "../arbres/feuilles";
import type { FicheGraphique } from "../arbres/fiche";
import {
  contourFruit,
  diametreDuGroupeM,
  FRUIT_VERT,
  type Fruit,
  PART_RAMEAUX_FRUITIERS,
} from "../arbres/fruits";
import { contraindre } from "../arbres/port";
import { engendrer, rayonAuPiedM, type Segment, type Sujet } from "../arbres/squelette";
import { type Vue, versEcranVue } from "../camera";
import { eclairer, melange, type Teinte, versCss } from "../palette";
import { METRE_VERTICAL_PX, profondeur, TUILE_LARGEUR_PX } from "../projection";
import { agreger, type MasseFourre, type TigeFourre } from "./fourre";

/** Ce que la couche a besoin de savoir d'un arbre. Un sous-ensemble strict du protocole. */
export interface ArbreAPoser {
  id: number;
  especeId: string;
  x: number;
  y: number;
  /** altitude du sol sous l'arbre, m */
  z: number;
  heightM: number;
  houppierRatio: number;
  hauteurElagueeM?: number;
  /**
   * Avancement du fruit de l'année ∈ [0,1] : `Snapshot.fruitProgress`, tel quel.
   *
   * C'est le moteur qui le fait monter, au rythme du facteur limitant de la
   * semaine (`tick.ts`) — donc un arbre qui souffre porte des fruits qui
   * n'avancent pas, et ça se voit. Le rendu ne le calcule pas et ne le déduit
   * pas d'un calendrier : il le lit.
   */
  fruitProgress?: number;
  /**
   * Fruits mûrs en attente de récolte, kg : `Snapshot.fruitsKg`, tel quel.
   *
   * **C'est l'état le plus FONCTIONNEL de l'arbre**, et le seul de cette liste
   * qui appelle un geste : au-dessus de zéro, il y a quelque chose à récolter,
   * et ça se perd à la fin de la fenêtre (`fenetreRecolteWeeks`). Le rendu ne
   * dessine du fruit mûr que sur ce nombre-là.
   */
  fruitsKg?: number;
  teteTrogneM?: number;
  chandelle?: boolean;
  /** part du feuillage accroché ∈ [0,1] — `partFoliaire` du moteur */
  partFoliaire: number;
  /** avancement de la sénescence ∈ [0,1] — `senescenceFoliaire` */
  senescence: number;
  /** vigueur ∈ [0,1] : un arbre qui végète a le houppier clairsemé */
  vigueur: number;
}

/**
 * Paliers de hauteur, en nombre de classes sur l'amplitude d'une espèce.
 *
 * Douze : au-delà, deux paliers voisins donnent la même image à un pixel près
 * et on cuit pour rien ; en dessous, une plantation régulière montre ses
 * marches.
 */
export const PALIERS_HAUTEUR = 12;

/**
 * Nombre de variantes de squelette par classe.
 *
 * Quatre. C'est peu, et c'est assez : dans un peuplement, ce que l'œil attrape
 * n'est pas la diversité des arbres mais la RÉPÉTITION à l'identique. Quatre
 * variantes la cassent ; huit coûteraient le double pour un gain nul.
 */
export const VARIANTES = 4;

/** Paliers de feuillage : c'est la saison, quantifiée pour le cache. */
export const PALIERS_FEUILLAGE = 6;

/**
 * Les états de fructification qu'on distingue : aucun, en croissance, mûr.
 *
 * **Trois, et pas un de plus, parce que chacun multiplie l'atlas.** La
 * tentation était d'en faire cinq pour montrer le fruit qui tourne — vert, puis
 * jaune, puis rouge — mais le mûrissement progressif n'appelle aucun geste,
 * alors que « il y a quelque chose à récolter » en appelle un et se perd si on
 * le rate (`fenetreRecolteWeeks`). Trois états suffisent à le dire, et ils ne
 * coûtent que pour les dix espèces qui ont un bloc `fruits` côté moteur : les
 * autres restent à zéro et leur clé ne change pas.
 */
export const FRUIT_AUCUN = 0;
export const FRUIT_CROISSANCE = 1;
export const FRUIT_MUR = 2;
export const ETATS_FRUIT = 3;

/**
 * L'état de fructification à cuire, d'après ce que le moteur donne.
 *
 * L'ordre des tests compte : `fruitsKg` l'emporte sur `fruitProgress`, parce
 * qu'un arbre chargé de fruits mûrs a aussi un `fruitProgress` de 1 et que
 * c'est le mûr qui est l'information.
 */
export function etatDuFruit(arbre: ArbreAPoser): number {
  if ((arbre.fruitsKg ?? 0) > 0) return FRUIT_MUR;
  if ((arbre.fruitProgress ?? 0) > 0.02) return FRUIT_CROISSANCE;
  return FRUIT_AUCUN;
}

/**
 * Taille écran d'une FEUILLE, en pixels, à partir de laquelle on la dessine.
 *
 * **Le seuil porte sur la feuille, pas sur l'arbre**, et le premier jet s'était
 * trompé de grandeur. Il déclenchait le détail dès que la vignette faisait
 * quarante pixels de large — or à cette taille, une feuille de bouleau de cinq
 * centimètres mesure **six dixièmes de pixel**. On dessinait donc trois cents
 * contours invisibles par arbre, et les houppiers sortaient vides : la capture
 * montrait des poteaux télégraphiques. En dessous de ce seuil, le bouquet
 * devient une tache, ce qui est la seule chose lisible à cette échelle — même
 * arbitrage que le tapis du sol, un étage plus haut.
 */
export const FEUILLE_DES_PX = 2.5;

/**
 * Taille écran, en pixels, en dessous de laquelle on ne dessine plus de fruit.
 *
 * Plus bas que le seuil de la feuille (2,5), et à dessein : un fruit est plus
 * gros qu'une feuille en général, mais surtout il porte une information
 * d'ACTION — « il y a quelque chose à récolter » — là où une feuille porte du
 * détail. On accepte donc de le dessiner un peu plus petit qu'on ne dessinerait
 * une feuille. En dessous, on n'invente rien : le marqueur du calque des
 * changements (§6.8) est le bon outil pour dire ça à l'échelle de la parcelle.
 */
export const FRUIT_MIN_PX = 1.6;

/**
 * Facteur de recouvrement des taches de feuillage.
 *
 * Des disques semés au hasard se chevauchent : la surface qu'ils couvrent est
 * toujours inférieure à la somme de leurs aires. Mais ici le chevauchement est
 * bien pire que pour un semis uniforme, parce que **les taches suivent les
 * rameaux** : elles s'alignent le long des branches et laissent du vide entre
 * elles. Le facteur théorique d'un semis au hasard — autour de 1,5 — donnait
 * donc des houppiers en grappes de raisin. Deux et quatre dixièmes compense ce
 * groupement ; c'est un chiffre mesuré sur la planche d'essences, pas une
 * constante de géométrie.
 */
export const RECOUVREMENT = 2.4;

/**
 * Nombre de sommets du contour d'une tache de feuillage.
 *
 * Sept : assez pour que le bord soit franchement irrégulier, assez peu pour que
 * la cuisson d'un houppier de mille rameaux reste du même ordre qu'avant.
 */
export const SOMMETS_TACHE = 7;

/**
 * De combien le HAUT d'un houppier est plus clair que son bas.
 *
 * **Le défaut que ça corrige est celui qui faisait le plus « ordinateur ».**
 * Chaque tache prenait `0,9 + 0,2 × hachage` : un écart de clarté TIRÉ AU SORT,
 * donc du bruit, donc aucune information. Résultat, tous les arbres de la
 * parcelle exactement de la même valeur moyenne, sans un côté éclairé ni un
 * dessous sombre — le retour l'a nommé sans détour : « la même couleur exacte
 * sur tous les arbres alors que le soleil est dans une certaine direction,
 * c'est pas normal, ça fait fausse réalité ».
 *
 * Un houppier reçoit la lumière par le dessus : le sommet est franchement plus
 * clair que la base, qui s'ombrage elle-même. C'est le gradient le plus fort
 * d'un arbre, et il ne dépend pas de l'orientation de la caméra — d'où le
 * choix de le porter en priorité.
 *
 * **Ce modelé n'affirme rien, et c'est ce qui l'autorise.** Le principe n° 1
 * interdit au rendu d'inventer ce que le moteur ne sait pas ; il n'interdit pas
 * de donner du VOLUME à une forme, ce qui est un choix de dessin et non une
 * affirmation sur l'état. C'est exactement le précédent déjà tranché pour le
 * terrain, et `lumiere.ts` le dit dans ces termes : « l'ombrage de pente
 * n'affirme rien de tel : il donne du volume à une surface ». La frontière est
 * nette — ce modelé ne dit pas qu'un arbre manque d'eau ni qu'il est malade, il
 * dit qu'un houppier est un volume et pas un aplat. Ce qui serait interdit,
 * c'est d'en déduire une couleur d'état que le moteur ne calcule pas.
 */
export const MODELE_HAUT = 0.3;

/**
 * De combien le côté ÉCLAIRÉ d'un houppier est plus clair que l'autre.
 *
 * Plus faible que le gradient vertical, et pour une raison honnête : la
 * vignette est un panneau face caméra, elle ne tourne pas avec la vue. Un
 * modelé latéral fort mentirait dès la première rotation, puisque le côté
 * éclairé resterait le même quand le soleil passe derrière. Assez pour que
 * l'arbre ait un volume, assez peu pour qu'aucune rotation ne le démente.
 *
 * La lumière vient de la gauche de l'écran, comme celle du terrain
 * (`AZIMUT_MODELE_DEG`, sud-ouest) : les deux modelés doivent aller dans le
 * même sens, sinon la scène a deux soleils et c'est pire que pas de modelé.
 */
export const MODELE_COTE = 0.13;

/**
 * De combien le flanc à l'ombre d'un tronc est assombri.
 *
 * Le trait entier descend d'un cran, et une arête claire vient par-dessus : la
 * moyenne du fût ne monte donc pas — c'est même l'inverse, ce qui est voulu.
 * Un tronc n'est pas l'information qu'on vient chercher dans cette vue, et il
 * n'a aucune raison d'être l'objet le plus clair de l'image.
 */
export const OMBRE_DU_BOIS = 0.86;

/** De combien l'arête éclairée d'un tronc est éclaircie, du côté du soleil. */
export const LUMIERE_DU_BOIS = 1.14;

/**
 * Épaisseur, en pixels, à partir de laquelle un bois reçoit son arête claire.
 *
 * En dessous, l'arête ferait moins d'un pixel : invisible, et payée quand même.
 * C'est ce seuil qui garde le surcoût de cuisson à quelques pour cent — la
 * quasi-totalité des segments d'un houppier sont des brindilles.
 */
export const EPAISSEUR_ARETE_PX = 3;

/**
 * Taille écran maximale d'une vignette cuite, en pixels.
 *
 * Au-delà, on cesse de grossir la vignette et on l'étire : un arbre qui occupe
 * tout l'écran n'a pas besoin d'être cuit à cette taille-là, et la mémoire d'un
 * atlas, elle, est bornée. **Une puissance de deux**, pour que le plafond ne
 * défasse pas la quantification qui le suit.
 *
 * **Deux cent cinquante-six, après un aller-retour instructif.** J'étais passé à
 * 512 parce qu'à 256 les feuilles d'un sujet vu de près ne dépassaient jamais
 * quatre pixels et que le seuil de détail ne se déclenchait pas. Mais ce seuil a
 * lui-même été revu depuis — à `LARGEUR_MIN_VISIBLE_M`, une feuille fait trois
 * pixels et rien n'y changera — et 512 coûte quatre fois plus de pixels à
 * cuire. Mesuré sur la vue Pixi : la cuisson des vignettes tenait la boucle
 * d'images à une dizaine par seconde, et l'atlas restait trois cents classes en
 * retard après la fin du zoom. L'étirement d'un facteur deux par le GPU ne se
 * voit pas ; l'attente, si.
 *
 * **Ce que ce plafond coûte, et qu'il faut assumer en toutes lettres.** À 256,
 * un sujet de seize mètres est cuit sur 384 pixels de haut, soit 24 pixels par
 * mètre : une feuille de hêtre de huit centimètres y fait 1,9 pixel, sous le
 * seuil de `FEUILLE_DES_PX`. Le dessin des feuilles ne se déclenche donc
 * JAMAIS, à aucun zoom — pas seulement de loin. Le critère du §4, « vu de près
 * on distingue les feuilles », n'est pas approché puis manqué : il est hors
 * d'atteinte par construction tant que ce plafond tient, et une planche vue de
 * près ne montre qu'une cuisson de 256 pixels agrandie par le GPU.
 *
 * Le relever reste donc la seule voie, mais pas à l'aveugle : la mesure qui a
 * fait redescendre à 256 date d'avant le tri en espace écran de
 * `posesDesArbres` et d'avant `BUDGET_CUISSON_PX`, qui compte des pixels et
 * non des vignettes. Au zoom où les feuilles compteraient, le tri ne laisse
 * qu'une poignée de classes visibles — ce n'est plus le cas mesuré. Il faut
 * remesurer avant de trancher, pas rejouer l'aller-retour.
 */
export const VIGNETTE_MAX_PX = 256;

/**
 * Budget de cuisson des vignettes, en pixels de vignette et par image.
 *
 * Trois cent mille : de quoi cuire une vignette pleine taille (256 × 384 × 1,5)
 * par image, ou une centaine de vignettes de trente-deux pixels. C'est la même
 * dépense dans les deux cas, ce qui est exactement ce qu'on veut d'un budget.
 */
export const BUDGET_CUISSON_PX = 300_000;

/** La classe d'un arbre : deux arbres de même classe partagent leur image. */
export interface Classe {
  especeId: string;
  palier: number;
  variante: number;
  feuillage: number;
  /** état de gestion, encodé : ni élagué ni trogné = 0 */
  gestion: number;
  /** état de fructification : `FRUIT_AUCUN`, `FRUIT_CROISSANCE` ou `FRUIT_MUR` */
  fruit: number;
  /** taille de cuisson, en pixels de large */
  taillePx: number;
}

/** Quantifie une valeur ∈ [0,1] en `n` paliers, et rend l'indice. */
function palierDe(valeur: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(Math.min(1, Math.max(0, valeur)) * n)));
}

/**
 * La classe d'un arbre pour une vue donnée.
 *
 * **La clé du cache, donc le cœur du coût.** Tout ce qui y entre multiplie le
 * nombre d'images à cuire ; tout ce qui n'y entre pas devient invisible. Le
 * choix de ce qui entre est le vrai travail de ce module.
 */
export function classeDe(arbre: ArbreAPoser, hauteurMaxM: number, vue: Vue): Classe {
  const zoom = vue.cam.zoom;
  // La place que l'arbre occupera à l'écran : c'est ELLE qui décide de la
  // finesse à cuire. Un arbre de quinze pixels ne mérite pas mille segments —
  // c'est le point de rupture que L0 a mesuré, et il est au zoom rapproché.
  const largeurPx = Math.min(
    VIGNETTE_MAX_PX,
    Math.max(4, arbre.heightM * METRE_VERTICAL_PX * zoom * 1.2),
  );
  // La taille de cuisson est elle-même quantifiée en puissances de deux : un
  // zoom continu ne doit pas recuire l'atlas entier à chaque cran de molette.
  // Le plafond s'applique AVANT l'arrondi, sinon il le défait : 320 pixels
  // plafonnés après arrondi ne sont plus une puissance de deux, et la promesse
  // « le zoom ne recuit pas tout » s'évanouit au zoom maximal.
  const taillePx = 2 ** Math.ceil(Math.log2(Math.min(VIGNETTE_MAX_PX, largeurPx)));
  const gestion =
    (arbre.chandelle ? 1 : 0) |
    (arbre.teteTrogneM ? 2 : 0) |
    ((arbre.hauteurElagueeM ?? 0) > 0.5 ? 4 : 0);
  // Le fruit entre dans la clé, sinon un pommier chargé et un pommier nu
  // partageraient la même image — et ce serait le pommier nu qu'on verrait, ou
  // le chargé, au hasard de qui a été cuit le premier.
  const fruit = ficheDe(arbre.especeId)?.fruit ? etatDuFruit(arbre) : FRUIT_AUCUN;
  return {
    especeId: arbre.especeId,
    palier: palierDe(arbre.heightM / Math.max(0.1, hauteurMaxM), PALIERS_HAUTEUR),
    variante: arbre.id % VARIANTES,
    // La sénescence entre dans la clé en même temps que la part foliaire : un
    // houppier plein et doré et un houppier plein et vert ne sont pas la même
    // image, et c'est précisément ce décalage qui fait octobre.
    feuillage:
      palierDe(arbre.partFoliaire, PALIERS_FEUILLAGE) * PALIERS_FEUILLAGE +
      palierDe(arbre.senescence, PALIERS_FEUILLAGE),
    gestion,
    fruit,
    taillePx,
  };
}

/** La clé de cache d'une classe. */
export function cleClasse(c: Classe): string {
  return `${c.especeId}|${c.palier}|${c.variante}|${c.feuillage}|${c.gestion}|${c.fruit}|${c.taillePx}`;
}

/** Une vignette cuite, et où poser son pied. */
export interface Vignette {
  image: HTMLCanvasElement;
  /** décalage du PIED de l'arbre dans l'image, en pixels */
  piedX: number;
  piedY: number;
  /**
   * Hauteur de l'ARBRE dans l'image, en pixels — et non hauteur de l'image.
   *
   * **Sans ce champ, la vignette ne peut pas avoir de marge**, et c'est le
   * défaut qui a coupé les houppiers de la haie. La pose supposait que l'arbre
   * remplissait l'image exactement, du bas au haut : toute place réservée
   * au-dessus de la cime ou sur les côtés aurait posé l'arbre trop petit. La
   * vignette était donc contrainte d'être un rectangle collé au squelette, et
   * un houppier plus large que le tiers de la hauteur débordait — soit tous
   * les arbustes de haie, dont le moteur donne des `houppierRatio` de 0,45 à
   * 0,6, et une bonne part des arbres de plein vent.
   *
   * En le disant, la vignette peut réserver ce qu'elle veut : la pose divise
   * par CE nombre, pas par la hauteur de l'image.
   */
  hautArbrePx: number;
}

/**
 * La fiche de repli, quand une espèce n'a pas encore la sienne.
 *
 * §5.4 : « une essence sans fiche prend le port de sa famille en attendant la
 * sienne », et la vue tourne. Ce repli est cette promesse tenue — un feuillu
 * ordinaire, ni faux ni reconnaissable.
 */
export const FICHE_GENERIQUE: FicheGraphique = {
  especeId: "*",
  port: "boule",
  branchement: {
    angleDeg: 45,
    divergenceDeg: 137,
    ratioLongueur: 0.7,
    dominance: 0.42,
    branchesParNoeud: 3,
    conicite: 0.84,
    tortuosite: 0.26,
  },
  feuillage: { forme: "ovale", feuillesParBouquet: 4, longueurFeuilleM: 0.07, densite: 0.7 },
  couleurs: {
    printemps: { r: 128, g: 164, b: 84 },
    ete: { r: 82, g: 116, b: 62 },
    automne: { r: 168, g: 140, b: 68 },
  },
  ecorce: { r: 112, g: 98, b: 82 },
  references: ["port de famille, en attendant la fiche de l'espèce (§5.4)"],
};

/** La couleur du feuillage, saison comprise. */
export function couleurFeuillage(fiche: FicheGraphique, senescence: number): Teinte {
  const c = fiche.couleurs;
  const s = Math.min(1, Math.max(0, senescence));
  // La sénescence tire l'été vers l'automne. Le printemps, lui, n'est pas ici :
  // il se lit sur la part foliaire qui monte, pas sur le jaunissement.
  return melange(c.ete, c.automne, s);
}

/** Hachage entier → [0,1[. Le même que partout ailleurs dans le rendu. */
function hacher(a: number, b: number, sel: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Cuit la vignette d'une classe.
 *
 * L'arbre est dessiné **de face**, pas en projection isométrique, et c'est
 * volontaire : un arbre est vertical, sa silhouette ne change pas quand la
 * caméra tourne autour de lui. Ce qui tourne, c'est sa PLACE au sol, et ça,
 * c'est l'affaire de `posesDesArbres`. Dessiner le houppier en isométrie
 * l'aplatirait à l'horizontale, ce qui est faux pour tout ce qui est debout.
 */
export function cuireVignette(
  classe: Classe,
  hauteurM: number,
  houppierRatio: number,
  fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  gestionM?: { hauteurElagueeM?: number; teteTrogneM?: number },
): Vignette {
  const fiche = ficheDe(classe.especeId) ?? FICHE_GENERIQUE;
  // La hauteur de l'image est la RÉSOLUTION de cuisson : c'est elle que
  // `taillePx` quantifie, et elle ne dépend pas de l'espèce.
  const hauteur = Math.max(6, Math.round(classe.taillePx * 1.5));

  // **La marge, et pourquoi elle existe.** Le squelette s'arrête au bout du
  // rameau ; la feuille, elle, dépasse encore de sa propre longueur, et la
  // tache de feuillage davantage. Sans marge, la planche de la haie sortait
  // avec des houppiers tranchés net à la verticale — on voyait le bord de la
  // vignette, pas l'arbre.
  const margeM = Math.max(0.05, fiche.feuillage.longueurFeuilleM * 1.5);
  // Combien de pixels vaut un mètre dans cette vignette : la cime PLUS sa marge
  // tiennent dans la hauteur d'image.
  const echelle = (hauteur - 2) / Math.max(0.1, hauteurM + margeM);
  // La largeur suit le houppier réel — `contraindre` le calibre pour qu'il
  // atteigne exactement `houppierRatio × hauteurM`, c'est donc une mesure et
  // non une estimation. Le plafond n'est là que contre un ratio aberrant.
  const demiLargeurM = Math.min(2 * hauteurM, houppierRatio * hauteurM + margeM);
  const largeur = Math.max(4, Math.round(2 * demiLargeurM * echelle));
  const image = fabriquer(largeur, hauteur);
  const ctx = image.getContext("2d");
  if (!ctx) throw new Error("contexte 2d indisponible");

  const piedX = largeur / 2;
  const piedY = hauteur - 1;
  const hautArbrePx = hauteurM * echelle;

  // ── Le fourré bas : une masse, pas un arbre ───────────────────────────
  //
  // **Il prend la MÊME boîte que les arbres, et c'est la correction.** Il avait
  // la sienne — carrée, de côté `taillePx`, remplie sur toute sa hauteur — et
  // le résultat était un rectangle : le monticule était tranché net en bas par
  // une barre sombre rectiligne et coupé à la verticale sur les deux flancs.
  // Visible au zoom ×16 de la friche, où le roncier sortait en pavé.
  //
  // Or `fourreEnArbre` déclare déjà `houppierRatio: 0.5` — « un fourré est
  // aussi large que haut » — et c'est exactement ce que la boîte commune sait
  // lire depuis qu'elle mesure le houppier. Le fourré n'avait pas besoin d'un
  // cas particulier : il avait besoin qu'on lise ce qu'il déclarait.
  if (fiche.fourre) {
    dessinerFourre(ctx, fiche, classe, largeur, piedY, echelle, hauteurM);
    return { image, piedX, piedY, hautArbrePx };
  }

  const sujet: Sujet = {
    id: classe.variante * 7919 + classe.palier * 31,
    hauteurM,
    houppierRatio,
    ...(gestionM?.hauteurElagueeM ? { hauteurElagueeM: gestionM.hauteurElagueeM } : {}),
    ...(gestionM?.teteTrogneM ? { teteTrogneM: gestionM.teteTrogneM } : {}),
    ...(fiche.brinsDeCepee ? { brins: fiche.brinsDeCepee } : {}),
  };
  // **Le squelette est plafonné par la TAILLE de la vignette.** À quinze
  // pixels, mille segments seraient mille traits d'un tiers de pixel : on paie
  // un détail que personne ne voit, et c'est exactement le piège que L0 a
  // mesuré. Le budget croît avec la surface de la vignette.
  const budget = Math.max(12, Math.round(classe.taillePx * classe.taillePx * 0.035));
  const brut = engendrer(sujet, fiche.branchement, budget);
  const houppier = brut.filter((s) => s.ordre >= 1);
  const base = houppier.length > 0 ? Math.min(...houppier.map((s) => s.depart.y)) : 0;
  const sommet = houppier.length > 0 ? Math.max(...houppier.map((s) => s.arrivee.y)) : hauteurM;
  const segments = contraindre(brut, fiche.port, base, sommet, houppierRatio * hauteurM);

  const versPx = (p: { x: number; y: number }) => ({
    sx: piedX + p.x * echelle,
    sy: piedY - p.y * echelle,
  });

  // ── Le bois ───────────────────────────────────────────────────────────
  // Du plus gros au plus fin : les charpentières passent sous les rameaux, ce
  // qui évite les jointures visibles sans avoir à les calculer.
  const parEpaisseur = [...segments].sort((a, b) => b.rayonDepartM - a.rayonDepartM);
  for (const s of parEpaisseur) {
    const a = versPx(s.depart);
    const b2 = versPx(s.arrivee);
    const epaisseur = Math.max(0.6, s.rayonDepartM * 2 * echelle);
    // L'écorce du haut, quand l'espèce en a une : c'est la signature du pin
    // sylvestre, et elle se lit sur la partie haute du fût et les charpentières.
    // L'écorce haute ne vaut que pour le BOIS PORTEUR : le fût et les
    // charpentières. Appliquée aux brindilles, elle semait des filaments orange
    // dans tout le houppier — à l'échelle de la parcelle, un pin sylvestre
    // ressortait en moustaches vives au milieu des verts, ce qui est l'inverse
    // de sa signature. La partie orangée d'un pin, c'est son tronc haut.
    const haut =
      fiche.ecorceHaute &&
      s.depart.y > hauteurM * 0.45 &&
      s.rayonDepartM > rayonAuPiedM(hauteurM) * 0.28;
    // **Les RAMEAUX ne sont pas de la couleur du fût**, et le bouleau l'a montré
    // sans appel : peindre en blanc les brindilles d'un houppier donne un arbre
    // mort en plein été, la ramure crevant le feuillage. C'est aussi faux en
    // botanique — l'écorce blanche du bouleau est celle du tronc et des grosses
    // branches ; ses rameaux de l'année sont brun-rouge sombre. On assombrit
    // donc l'écorce à mesure que le bois s'affine.
    const finesse = Math.min(1, s.rayonDepartM / Math.max(1e-6, rayonAuPiedM(hauteurM) * 0.35));
    const base = haut && fiche.ecorceHaute ? fiche.ecorceHaute : fiche.ecorce;
    // Le fût est un CYLINDRE, et il était peint comme un trait.
    //
    // **C'est ce qui faisait la futaie de mâts blancs.** À l'échelle de la
    // parcelle, une friche de bouleaux sortait en semis de poteaux d'un blanc
    // uniforme — l'objet le plus clair et le plus régulier de l'image, donc
    // celui que l'œil attrape en premier, alors qu'un tronc n'est pas
    // l'information qu'on vient chercher. Le feuillage venait de recevoir son
    // modelé ; le bois, lui, restait un aplat, et l'écart entre les deux se
    // voyait plus que chacun séparément.
    //
    // On assombrit donc le trait entier d'un cran, et on repose par-dessus une
    // arête claire, décalée du côté de la lumière. Deux traits au lieu d'un,
    // mais SEULEMENT sur le bois porteur : sur une brindille d'un pixel, une
    // arête ne se voit pas et coûte quand même. C'est là aussi ce qui borne le
    // surcoût de cuisson à quelques pour cent.
    ctx.strokeStyle = versCss(eclairer(base, (0.55 + 0.45 * finesse) * OMBRE_DU_BOIS));
    ctx.lineWidth = epaisseur;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b2.sx, b2.sy);
    ctx.stroke();
    if (epaisseur >= EPAISSEUR_ARETE_PX) {
      ctx.strokeStyle = versCss(eclairer(base, (0.55 + 0.45 * finesse) * LUMIERE_DU_BOIS));
      ctx.lineWidth = epaisseur * 0.38;
      ctx.beginPath();
      ctx.moveTo(a.sx - epaisseur * 0.26, a.sy);
      ctx.lineTo(b2.sx - epaisseur * 0.26, b2.sy);
      ctx.stroke();
    }
  }

  // ── Le feuillage ──────────────────────────────────────────────────────
  const partFoliaire = Math.floor(classe.feuillage / PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  const senescence = (classe.feuillage % PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  if (partFoliaire > 0.02) {
    const teinte = couleurFeuillage(fiche, senescence);
    dessinerFeuillage(ctx, segments, fiche, teinte, partFoliaire, echelle, versPx, classe);
  }

  // ── Les fruits ────────────────────────────────────────────────────────
  // **Après le feuillage, donc devant lui.** Un fruit caché derrière les
  // feuilles ne sert à rien : il est là pour dire « il y a quelque chose à
  // récolter », ce qui est une information d'action et doit se voir. C'est aussi
  // ce que fait un arbre chargé — les fruits pèsent et pendent sous le
  // feuillage.
  if (fiche.fruit && classe.fruit !== FRUIT_AUCUN) {
    dessinerFruits(ctx, segments, fiche.fruit, classe, echelle, versPx);
  }

  return { image, piedX, piedY, hautArbrePx };
}

/**
 * Dessine un fourré bas : un monticule de touffes, sans bois apparent.
 *
 * **Ni squelette, ni houppier, ni fût**, et c'est tout le propos de la huitième
 * famille (§5.4). Une ronce n'a pas d'architecture visible à cette échelle :
 * c'est un enchevêtrement de tiges arquées dont on ne lit qu'une SURFACE et un
 * PROFIL. Le passage par le générateur d'arbres donnait un petit arbre à fût et
 * à couronne — faux en botanique, et visible sur la capture : les ronciers
 * sortaient en bouquets d'arbustes bien peignés au lieu d'une broussaille.
 *
 * Le monticule est plus large que haut, son sommet est irrégulier, et sa
 * densité vient du comptage des tiges (`fourre.ts`) : deux tiges laissent voir
 * le sol au travers, trente le couvrent.
 */
function dessinerFourre(
  ctx: CanvasRenderingContext2D,
  fiche: FicheGraphique,
  classe: Classe,
  largeur: number,
  pied: number,
  echelle: number,
  hauteurM: number,
): void {
  const densite = Math.floor(classe.feuillage / PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  if (densite <= 0.02) return;
  const senescence = (classe.feuillage % PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  const teinte = couleurFeuillage(fiche, senescence);
  const hautPx = Math.max(2, hauteurM * echelle);
  const demiLargeur = Math.max(2, largeur / 2 - 1);

  // Le nombre de touffes suit la surface à couvrir, comme le feuillage d'un
  // arbre — mais ici la surface est celle du monticule entier.
  const touffes = Math.max(6, Math.round(demiLargeur * hautPx * densite * 0.05));
  const rayon = Math.max(1.2, Math.sqrt((demiLargeur * hautPx * 2.2) / (Math.PI * touffes)));
  // **Les touffes rentrent d'un rayon**, sinon celles des bords sont coupées
  // par le canevas et le monticule sort avec deux flancs verticaux nets. Le
  // même raisonnement que la marge des arbres, au même endroit.
  const demiUtile = Math.max(1, demiLargeur - rayon);
  const epines = fiche.feuillage.forme === "aiguille";
  for (let i = 0; i < touffes; i++) {
    const u = hacher(i, classe.palier, 0x3a91);
    const v = hacher(i * 13, classe.variante, 0x77c3);
    // Un profil de monticule : large en bas, resserré au sommet.
    //
    // **Et non `v²`**, qui était le premier jet : la densité d'un tirage
    // uniforme élevé au carré diverge en zéro, donc la plupart des touffes
    // atterrissaient exactement sur la ligne de sol. Leurs moitiés basses s'y
    // superposaient et s'y faisaient trancher par le bord du canevas : le
    // fourré avait une BARRE sombre rectiligne pour base, ce qu'aucune
    // broussaille n'a. Un exposant plus doux garde le monticule — plus fourni
    // en bas qu'au sommet — sans l'empiler sur une seule ligne.
    const t = v ** 1.35;
    const x = largeur / 2 + (u - 0.5) * 2 * demiUtile * (1 - t * 0.55);
    // La base ondule d'une fraction de rayon : une lisière de roncier n'est pas
    // tirée au cordeau, et il suffit de peu pour que l'œil cesse d'y voir un
    // bord de vignette.
    const assise = pied - rayon * 0.45 * hacher(i * 17, classe.variante, 0x5c07);
    const y = assise - t * hautPx;
    const r = rayon * (0.7 + 0.7 * hacher(i * 7, i, 0x51bd));
    ctx.fillStyle = versCss(eclairer(teinte, 0.86 + 0.28 * v));
    ctx.beginPath();
    for (let n = 0; n < SOMMETS_TACHE; n++) {
      const a = (n / SOMMETS_TACHE) * Math.PI * 2;
      // Un fourré épineux est HÉRISSÉ : ses touffes ont des pointes, là où une
      // ronce ou une callune font des bosses. C'est le peu qui distingue un
      // ajonc d'un roncier quand ni l'un ni l'autre ne fait un mètre.
      const pointe = epines && n % 2 === 0 ? 1.5 : 1;
      const rr = r * pointe * (0.7 + 0.5 * hacher(i * 31 + n, classe.palier, 0x22a7));
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Pose les fruits sur une part des rameaux terminaux.
 *
 * **Le nombre et la couleur viennent du moteur ; la place, du dessin.** Le
 * moteur dit combien de kilos l'arbre porte et où en est le fruit de l'année
 * (`fruitsKg`, `fruitProgress`) ; il ne dit pas — et n'a aucune raison de dire
 * — sur quels rameaux ils pendent. Répartir cette masse sur le houppier est le
 * même travail que répartir le feuillage, et le tirage est déterministe pour la
 * même raison : un fruit qui sauterait d'un rameau à l'autre d'une image à
 * l'autre grouillerait.
 *
 * En dessous d'une taille écran, on ne dessine rien. C'est le même arbitrage
 * que la feuille, mais la conclusion est différente et il faut la dire : une
 * feuille invisible n'est qu'un détail perdu, alors qu'un fruit invisible est
 * une information d'action perdue. À l'échelle de la parcelle, « cet arbre est
 * à récolter » ne se dira donc PAS par un fruit d'un demi-pixel — ça se dira
 * par un marqueur du calque des changements (§6.8), qui est fait pour ça.
 * Peindre trois pixels rouges dans un houppier ne serait ni lisible ni honnête.
 */
function dessinerFruits(
  ctx: CanvasRenderingContext2D,
  segments: readonly Segment[],
  fruit: Fruit,
  classe: Classe,
  echelle: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
): void {
  const unitePx = fruit.longueurM * echelle;
  // Diamètre du groupe que porte un rameau fructifère — déclaré par la fiche
  // quand elle le connaît, estimé sinon.
  const groupePx = diametreDuGroupeM(fruit) * echelle;
  // **La bonne UNITÉ de dessin n'est pas toujours le fruit**, et c'est ce qui
  // fait la différence entre « la fonctionnalité marche pour deux espèces » et
  // « elle marche pour neuf ». Une prunelle fait treize millimètres : à la
  // résolution de cuisson maximale elle mesure sept dixièmes de pixel, donc
  // elle ne serait JAMAIS dessinée, à aucun zoom. Une baie de sureau, un
  // sixième de pixel.
  //
  // Mais ce n'est pas la baie qu'on voit sur un sureau : c'est le CORYMBE, dix
  // centimètres de large, qui tient largement dans quelques pixels. Même chose
  // pour la grappe du troène ou les prunelles serrées le long d'un rameau. On
  // dessine donc le groupe quand le fruit est sous le pixel et que le groupe,
  // lui, n'y est pas — exactement la règle « un bouquet par rameau, pas une
  // feuille » du feuillage, appliquée un étage plus bas.
  //
  // Ce n'est pas une approximation qu'on s'autorise faute de mieux : à cette
  // distance, un amas de baies EST ce que l'œil perçoit, et dessiner une baie
  // isolée de deux pixels serait le mensonge.
  // **Le même seuil pour l'amas que pour le fruit, et non un seuil plus haut.**
  // Le premier jet exigeait une fois et demie, par prudence ; mesuré, ça
  // laissait muets le noisetier (2,1 px) et le cornouiller (1,7 px) alors que
  // leurs amas sont parfaitement lisibles. La prudence était mal placée : un
  // amas est plus visible qu'une feuille à taille égale, parce que ce qui le
  // porte est la COULEUR — un point rouge saturé sur du vert se voit à deux
  // pixels, là où un contour de feuille verte sur du vert n'existe pas.
  const enAmas = unitePx < FRUIT_MIN_PX;
  if (enAmas && groupePx < FRUIT_MIN_PX) return;
  const taillePx = enAmas ? groupePx : unitePx;
  const combien = enAmas ? 1 : fruit.parRameau;
  const contour = contourFruit(enAmas ? "charnu" : fruit.forme);
  const mur = classe.fruit === FRUIT_MUR;
  // La couleur ARRIVE avec la maturité, et c'est l'arrivée qui est
  // l'information. Un fruit vert est un fruit vert : rien ne distingue une
  // pomme d'août d'une prunelle d'août à cette taille.
  const teinte = mur ? fruit.couleur : melange(FRUIT_VERT, fruit.couleur, 0.25);
  const terminaux = segments.filter((s) => s.terminal);
  // En amas, il n'y a qu'une marque par rameau : elle ne s'étale pas, elle EST
  // l'étalement.
  const etalement = enAmas ? 0 : (diametreDuGroupeM(fruit) * echelle) / 2;
  let i = 0;
  for (const s of terminaux) {
    i++;
    if (hacher(i, classe.palier, 0x3ef7) > PART_RAMEAUX_FRUITIERS) continue;
    const bout = versPx(s.arrivee);
    for (let k = 0; k < combien; k++) {
      // Le groupe s'étale autour du bout du rameau, et PEND : un fruit pèse,
      // donc le nuage est décalé vers le bas.
      const a = hacher(i * 31 + k, classe.variante, 0x51c9) * Math.PI * 2;
      const r = Math.sqrt(hacher(i * 17 + k, k, 0x2d81)) * etalement;
      const cx = bout.sx + Math.cos(a) * r;
      const cy = bout.sy + Math.sin(a) * r * 0.8 + taillePx * 0.45;
      // Un peu de modelé, dans le même sens que le feuillage et le bois : la
      // lumière vient de la gauche de l'écran.
      const modele = 1 + 0.16 * (hacher(i + k, 5, 0x77b3) - 0.5);
      ctx.fillStyle = versCss(eclairer(teinte, modele));
      ctx.beginPath();
      for (let n = 0; n < contour.length; n++) {
        const pt = contour[n];
        if (!pt) continue;
        const px = cx + pt.x * taillePx;
        const py = cy + pt.y * taillePx;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Pose les feuilles sur les rameaux terminaux.
 *
 * **Un BOUQUET par rameau, pas une feuille**, et sur TOUT rameau terminal :
 * les deux règles viennent de L0, et chacune corrigeait un défaut visible —
 * une brindille décorée dans un cas, un arbre nu dans l'autre.
 *
 * En dessous d'une certaine taille écran, les feuilles individuelles cessent
 * d'être dessinées et le bouquet devient une tache : à quinze pixels de haut,
 * un arbre n'a pas de feuilles, il a une masse. C'est le même arbitrage que le
 * tapis du sol, à un autre étage.
 */
function dessinerFeuillage(
  ctx: CanvasRenderingContext2D,
  segments: readonly Segment[],
  fiche: FicheGraphique,
  teinte: Teinte,
  partFoliaire: number,
  echelle: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
  classe: Classe,
): void {
  const terminaux = segments.filter((s) => s.terminal);
  const contour = contourFeuille(fiche.feuillage.forme);
  const parFeuille = elementsParFeuille(fiche.feuillage.forme);
  const tailleFeuillePx = fiche.feuillage.longueurFeuilleM * echelle;
  const detaille = tailleFeuillePx >= FEUILLE_DES_PX;
  const aiguilles = fiche.feuillage.forme === "aiguille";

  // **Le rayon d'une tache se déduit de la SURFACE à couvrir, pas de la taille
  // d'une feuille**, et c'est la deuxième moitié de la correction du houppier
  // vide. Une tache dimensionnée sur la feuille faisait 1,3 pixel : cent
  // soixante-dix taches de ce calibre couvraient la moitié du houppier, et
  // l'arbre restait transparent quel que soit son feuillage.
  //
  // Ce qu'on veut est simple à énoncer : le feuillage couvre la part `densite`
  // de la surface projetée du houppier. On mesure donc cette surface, on la
  // divise par le nombre de taches, et on en tire le rayon. Le facteur de
  // recouvrement compense le chevauchement des disques, qui couvrent toujours
  // moins que la somme de leurs aires.
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const s of terminaux) {
    const p = versPx(s.arrivee);
    x0 = Math.min(x0, p.sx);
    x1 = Math.max(x1, p.sx);
    y0 = Math.min(y0, p.sy);
    y1 = Math.max(y1, p.sy);
  }
  const largeurUtile = Math.max(1, x1 - x0);
  const hauteurUtile = Math.max(1, y1 - y0);
  const aireHouppier = (Math.PI / 4) * largeurUtile * hauteurUtile;
  const taches = Math.max(1, terminaux.length * fiche.feuillage.densite * partFoliaire);
  // La densité de la fiche dit la TRANSPARENCE relative d'un houppier — un
  // bouleau à 0,45 laisse voir le ciel, un hêtre à 0,92 non. Prise telle quelle
  // comme taux de couverture, elle donnait des arbres nus : à 45 % de surface
  // couverte, les rameaux blancs d'un bouleau dominent et l'arbre se lit comme
  // un squelette d'hiver. On la remonte donc dans une plage où même le plus
  // transparent des houppiers reste un houppier.
  const couverture = 0.55 + 0.45 * fiche.feuillage.densite;
  const rayonTache = Math.max(
    0.8,
    Math.sqrt((aireHouppier * couverture * RECOUVREMENT) / (Math.PI * taches)),
  );

  let i = 0;
  for (const s of terminaux) {
    i++;
    // La densité de l'espèce ET la part foliaire de la saison décident si ce
    // rameau porte un bouquet. Le tirage est déterministe.
    if (hacher(i, classe.palier, 0x77c1) > fiche.feuillage.densite * partFoliaire) continue;
    const bout = versPx(s.arrivee);
    // La direction du rameau, à l'écran : c'est elle qui oriente une brosse
    // d'aiguilles. Un feuillu n'en a pas besoin, ses bouquets sont ronds.
    const pied = versPx(s.depart);
    const dx = bout.sx - pied.sx;
    const dy = bout.sy - pied.sy;
    const norme = Math.hypot(dx, dy) || 1;
    // **La masse est TOUJOURS posée, et les feuilles viennent dessus.** C'est la
    // formulation exacte du §4 : « vu de loin ça fait une masse ; vu de près on
    // distingue les feuilles ». Le premier jet en faisait une alternative — ou
    // la masse, ou les feuilles — et le résultat était un houppier criblé de
    // taches vertes de trois pixels à travers lequel on voyait toute la ramure :
    // un arbre mort en plein été. Une feuille dessinée ne remplace pas le volume
    // du bouquet auquel elle appartient, elle s'y ajoute.
    //
    // Un peu de modelé au tirage : ça donne du volume à une masse d'aplats sans
    // coûter une passe de plus.
    // **Le modelé, et non plus un tirage au sort.** Un houppier prend la
    // lumière par le dessus et par le côté du soleil ; sa base et son revers
    // s'ombragent eux-mêmes. Les deux coordonnées sont déjà là — la tache est
    // placée, et l'emprise du houppier est mesurée juste au-dessus — donc ça ne
    // coûte pas un calcul de plus par tache, seulement la bonne formule.
    const haut = hauteurUtile > 0 ? (y1 - bout.sy) / hauteurUtile : 0.5;
    const cote = largeurUtile > 0 ? (bout.sx - (x0 + x1) / 2) / (largeurUtile / 2) : 0;
    const modele =
      1 +
      MODELE_HAUT * (haut - 0.5) * 2 +
      MODELE_COTE * -Math.max(-1, Math.min(1, cote)) +
      // Il reste un peu de hasard, mais un peu : c'est la variété d'un
      // feuillage, plus le facteur qui portait à lui seul tout le rendu.
      0.06 * (hacher(i, 3, 0x4411) - 0.5);
    ctx.fillStyle = versCss(eclairer(teinte, modele));
    // Des taches toutes du même calibre se lisent comme une grappe de raisin :
    // on les fait varier du simple au double, ce qui suffit à ce que l'œil y
    // voie une masse.
    const calibre = rayonTache * (0.72 + 0.72 * hacher(i * 7, classe.variante, 0x611d));
    // **Un contour DÉCHIQUETÉ, pas une ellipse.** Une ellipse est une bulle, et
    // un houppier fait de bulles se lit comme du brocoli — c'est ce que la
    // capture montrait au zoom rapproché. Un bord irrégulier ne coûte que
    // quelques sommets de plus et rend au feuillage sa silhouette dentelée,
    // même quand une feuille fait trois pixels et qu'on ne peut pas la dessiner.
    if (aiguilles) {
      // **Une BROSSE, pas une boule.** Un conifère ne porte pas de bouquets
      // ronds : ses aiguilles garnissent le rameau sur toute sa longueur, en
      // brosse allongée dans son axe. Dessiné en taches rondes comme un
      // feuillu, le pin sylvestre sortait — c'est le mot du retour — comme
      // « un feuillu avec des blobs verts », et sa famille entière avec lui.
      // Le port étagé ne suffit pas : ce qui dit « conifère » à l'œil, c'est la
      // texture du feuillage autant que la forme de l'arbre.
      const longueur = Math.max(calibre * 1.4, norme * 0.62);
      const epaisseur = calibre * 0.62;
      const mx = (bout.sx + pied.sx) / 2;
      const my = (bout.sy + pied.sy) / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath();
      // Un fuseau à bords irréguliers : les aiguilles dépassent.
      for (let n = 0; n < SOMMETS_TACHE * 2; n++) {
        const t = n / (SOMMETS_TACHE * 2);
        const a = t * Math.PI * 2;
        const jitter = 0.7 + 0.6 * hacher(i * 37 + n, classe.palier, 0x5c3d);
        ctx.lineTo(Math.cos(a) * longueur * 0.5, Math.sin(a) * epaisseur * jitter);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // **Un contour DÉCHIQUETÉ, pas une ellipse.** Une ellipse est une bulle,
      // et un houppier fait de bulles se lit comme du brocoli — c'est ce que la
      // capture montrait au zoom rapproché. Un bord irrégulier ne coûte que
      // quelques sommets de plus et rend au feuillage sa silhouette dentelée,
      // même quand une feuille fait trois pixels et qu'on ne peut pas la
      // dessiner.
      ctx.beginPath();
      for (let n = 0; n < SOMMETS_TACHE; n++) {
        const a = (n / SOMMETS_TACHE) * Math.PI * 2;
        const r = calibre * (0.72 + 0.5 * hacher(i * 31 + n, classe.palier, 0x22a7));
        const px = bout.sx + Math.cos(a) * r;
        const py = bout.sy + Math.sin(a) * r * 0.82;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (!detaille) continue;
    for (let k = 0; k < fiche.feuillage.feuillesParBouquet; k++) {
      const a1 = hacher(i * 131 + k, classe.variante, 0x1d3b);
      const a2 = hacher(i, k * 17 + classe.palier, 0x9e21);
      // Les feuilles d'un bouquet s'écartent autour du bout du rameau.
      // Une aiguille se pose LE LONG du rameau, une feuille autour de son bout.
      const angle = aiguilles ? Math.atan2(dy, dx) + (a1 - 0.5) * 0.9 : a1 * Math.PI * 2;
      const rayon = tailleFeuillePx * 0.55 * a2;
      const cx = aiguilles
        ? pied.sx + dx * a2 + Math.cos(angle + Math.PI / 2) * rayon * 0.6
        : bout.sx + Math.cos(angle) * rayon;
      const cy = aiguilles
        ? pied.sy + dy * a2 + Math.sin(angle + Math.PI / 2) * rayon * 0.6
        : bout.sy + Math.sin(angle) * rayon * 0.7;
      // Une feuille plus claire quand elle est au-dessus, plus sombre dessous :
      // c'est la seule modulation qui donne du volume à une masse d'aplats.
      const clarte = 0.86 + 0.28 * (1 - (cy - bout.sy) / (tailleFeuillePx + 1e-6) / 2);
      ctx.fillStyle = versCss(eclairer(teinte, Math.min(1.18, Math.max(0.78, clarte))));
      // **Une aiguille est ORIENTÉE, une feuille non.** Les contours sont
      // normalisés pointe en haut ; les laisser tels quels donnait une brosse
      // de pin dont toutes les aiguilles montaient à la verticale, quel que
      // soit l'angle du rameau qui les porte. Une feuille tombée peut être de
      // travers, une aiguille de pin sort du rameau.
      ctx.save();
      ctx.translate(cx, cy);
      if (aiguilles) ctx.rotate(angle + Math.PI / 2);
      for (let e = 0; e < parFeuille; e++) {
        // Les aiguilles vont PAR DEUX : c'est la signature du pin sylvestre.
        const ecart = parFeuille > 1 ? (e - 0.5) * 0.22 : 0;
        ctx.beginPath();
        contour.forEach((p, n) => {
          const px = (p.x + ecart) * tailleFeuillePx;
          const py = -p.y * tailleFeuillePx;
          if (n === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Un arbre placé à l'écran, prêt à être posé. */
export interface PoseArbre {
  arbre: ArbreAPoser;
  classe: Classe;
  sx: number;
  sy: number;
  profondeur: number;
}

/**
 * Où poser chaque arbre, dans l'**ordre du peintre**.
 *
 * La même clé que le terrain — `x + y` dans le repère de la caméra — et c'est
 * délibéré : le relief à l'échelle vraie (D3) impose d'entrelacer sol et arbres
 * dans un seul ordre, sinon une butte au premier plan ne masque pas le pied des
 * arbres derrière elle. Rendre les deux listes triées par la même grandeur est
 * ce qui rendra l'entrelacement possible sans rien réécrire.
 */
/**
 * Sépare les tiges de fourré du reste, et agrège les premières.
 *
 * **C'est là que la huitième famille prend son chemin** (§5.4). Une ronce n'est
 * pas un petit arbre, et sur la friche de l'an 30 il y en a des milliers : les
 * poser une par une, c'est le budget entier dépensé pour du sous-étage, et un
 * dessin faux par-dessus le marché.
 */
export function separerLeFourre(arbres: readonly ArbreAPoser[]): {
  arbres: ArbreAPoser[];
  fourre: MasseFourre[];
} {
  const tiges: TigeFourre[] = [];
  const reste: ArbreAPoser[] = [];
  for (const a of arbres) {
    if (ficheDe(a.especeId)?.fourre) {
      tiges.push({ especeId: a.especeId, x: a.x, y: a.y, z: a.z, heightM: a.heightM });
    } else {
      reste.push(a);
    }
  }
  return { arbres: reste, fourre: agreger(tiges) };
}

/**
 * Une masse de fourré, ramenée à ce qu'un arbre doit être pour la couche.
 *
 * La masse garde son `especeId` — c'est lui qui donne les couleurs — et sa
 * densité devient la part foliaire, parce que c'est bien ce qu'elle dit : un
 * carreau à deux tiges de ronce montre le sol, un carreau à trente ne le montre
 * plus. L'identifiant vient du carreau, pas d'une tige, donc deux images
 * successives donnent la même variante et le fourré ne grouille pas.
 */
export function fourreEnArbre(masse: MasseFourre): ArbreAPoser {
  return {
    id: Math.round(masse.x) * 7919 + Math.round(masse.y),
    especeId: masse.especeId,
    x: masse.x,
    y: masse.y,
    z: masse.z,
    heightM: masse.hauteurM,
    // Un fourré est aussi large que haut : c'est une masse, pas une tige.
    houppierRatio: 0.5,
    partFoliaire: masse.densite,
    senescence: 0,
    vigueur: 1,
  };
}

export function posesDesArbres(
  arbres: readonly ArbreAPoser[],
  hauteurMaxParEspece: (especeId: string) => number,
  vue: Vue,
): PoseArbre[] {
  // **On ne pose que ce qui est visible**, et le lot L0 l'avait annoncé : « le
  // point de rupture est le zoom rapproché, pas la parcelle entière, donc le
  // rendu doit découper par emprise visible ». Sans ce filtre, une friche de
  // cinq mille six cents tiges posait cinq mille six cents sprites par image et
  // demandait à l'atlas cinq cents classes de vignette — alors qu'au zoom
  // rapproché, une trentaine d'arbres sont à l'écran. Mesuré sur la vue Pixi :
  // l'atlas restait cinq cents classes en retard, et il cuisait des arbres que
  // personne ne regardait pendant que le sol attendait son tour.
  //
  // La marge de `celluleVisibles` compte la hauteur : un arbre dont le pied est
  // sous le bord inférieur peut avoir sa cime à l'écran.
  const sortie: PoseArbre[] = [];
  for (const arbre of arbres) {
    if (arbre.heightM <= 0) continue;
    const e = versEcranVue({ x: arbre.x, y: arbre.y, z: arbre.z }, vue);
    // **Le test se fait à l'ÉCRAN, arbre par arbre**, et non sur l'emprise des
    // cellules. Le premier jet réutilisait `celluleVisibles`, dont la marge vaut
    // deux fois la hauteur du plus grand sujet — cinquante mètres pour un chêne
    // de vingt-cinq, soit la moitié de la parcelle. Pour du terrain cette marge
    // ne coûte que quelques cellules cuites pour rien ; pour des arbres, elle
    // laissait passer un millier de sujets au zoom rapproché et l'atlas restait
    // quatre cents classes en retard.
    //
    // Un arbre est visible si son fût, sa cime ou son houppier touchent le
    // cadre. La hauteur ne compte que vers le HAUT — un arbre dont le pied est
    // sous le bord inférieur peut avoir sa cime à l'écran — et la largeur du
    // houppier des deux côtés.
    const hauteurPx = arbre.heightM * METRE_VERTICAL_PX * vue.cam.zoom;
    const demiLargeurPx = arbre.houppierRatio * arbre.heightM * TUILE_LARGEUR_PX * vue.cam.zoom;
    if (
      e.sx + demiLargeurPx < 0 ||
      e.sx - demiLargeurPx > vue.largeurPx ||
      e.sy < -8 ||
      e.sy - hauteurPx > vue.hauteurPx
    ) {
      continue;
    }
    sortie.push({
      arbre,
      classe: classeDe(arbre, hauteurMaxParEspece(arbre.especeId), vue),
      sx: e.sx,
      sy: e.sy,
      profondeur: profondeur(arbre.x, arbre.y, vue.cam),
    });
  }
  sortie.sort((a, b) => a.profondeur - b.profondeur);
  return sortie;
}

/**
 * L'atlas : il tient les vignettes cuites et n'en cuit une qu'une fois.
 *
 * `cuire` est borné par un budget, comme le terrain : au premier affichage
 * d'une parcelle, des dizaines de classes sont à cuire d'un coup, et les cuire
 * toutes ferait le gel de trois secondes que L0 a mesuré. Un arbre dont la
 * classe n'est pas prête est posé dans la classe la plus proche déjà cuite —
 * il est un peu trop grand ou un peu trop petit pendant une image ou deux, ce
 * qui ne se voit pas, alors qu'une saccade se voit.
 */
export class AtlasArbres {
  private readonly vignettes = new Map<string, Vignette>();
  private aCuire: { classe: Classe; hauteurM: number; houppierRatio: number }[] = [];

  constructor(
    private readonly fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  ) {}

  /** Dresse la liste des classes manquantes pour les poses données. */
  public rafraichir(poses: readonly PoseArbre[]): number {
    const vues = new Map<string, { classe: Classe; hauteurM: number; houppierRatio: number }>();
    for (const p of poses) {
      const cle = cleClasse(p.classe);
      if (this.vignettes.has(cle) || vues.has(cle)) continue;
      vues.set(cle, {
        classe: p.classe,
        hauteurM: p.arbre.heightM,
        houppierRatio: p.arbre.houppierRatio,
      });
    }
    this.aCuire = [...vues.values()];
    return this.aCuire.length;
  }

  /**
   * Cuit ce qui tient dans un budget de PIXELS. Rend le nombre de classes
   * réellement cuites.
   *
   * **Le budget compte des pixels et non des vignettes**, et c'est ce qui le
   * rend juste aux deux bouts du zoom. Une vignette de seize pixels et une de
   * deux cent cinquante-six ne coûtent pas la même chose — un facteur deux cent
   * cinquante-six en surface — et un budget « six vignettes par image » signifie
   * donc deux choses opposées selon l'échelle. Mesuré : à la parcelle entière,
   * quatre cent quarante classes minuscules restaient en attente alors qu'on
   * aurait pu toutes les cuire en trois images ; au zoom rapproché, six
   * vignettes pleine taille tenaient la boucle à une dizaine d'images par
   * seconde. Le même nombre, deux erreurs contraires.
   */
  public cuire(
    budgetPx = BUDGET_CUISSON_PX,
    gestion?: (c: Classe) => { hauteurElagueeM?: number; teteTrogneM?: number },
  ): number {
    let faits = 0;
    let depense = 0;
    while (depense < budgetPx) {
      const suivant = this.aCuire.shift();
      if (!suivant) break;
      const cle = cleClasse(suivant.classe);
      if (this.vignettes.has(cle)) continue;
      // La surface de la vignette, à laquelle le coût de cuisson est
      // proportionnel — le squelette lui-même est plafonné par elle.
      depense += suivant.classe.taillePx * suivant.classe.taillePx * 1.5;
      this.vignettes.set(
        cle,
        cuireVignette(
          suivant.classe,
          suivant.hauteurM,
          suivant.houppierRatio,
          this.fabriquer,
          gestion?.(suivant.classe),
        ),
      );
      faits++;
    }
    return faits;
  }

  /** La vignette d'une classe, si elle est prête. */
  public vignette(classe: Classe): Vignette | undefined {
    return this.vignettes.get(cleClasse(classe));
  }

  /** Combien de classes attendent d'être cuites. */
  public get enRetard(): number {
    return this.aCuire.length;
  }

  /** Combien de vignettes l'atlas tient. C'est la grandeur à surveiller. */
  public get taille(): number {
    return this.vignettes.size;
  }

  public vider(): void {
    this.vignettes.clear();
    this.aCuire = [];
  }
}

/**
 * La taille à laquelle POSER une vignette, en pixels.
 *
 * **À ne pas confondre avec `classe.taillePx`, et c'est un piège qui s'est
 * refermé.** `taillePx` est la RÉSOLUTION de cuisson, quantifiée en puissances
 * de deux pour que le cache serve ; la taille de pose est la place réelle que
 * l'arbre occupe à l'écran. Le premier jet collait la vignette à sa résolution :
 * les arbres sortaient trois fois trop grands, et la capture montrait une
 * futaie de mâts blancs plus hauts que la parcelle n'est large.
 *
 * La hauteur d'un mètre à l'écran est `METRE_VERTICAL_PX × zoom`, et la largeur
 * d'un mètre horizontal vaut `TUILE_LARGEUR_PX / 2 × zoom` — les deux sont
 * égales par construction de la projection dimétrique 2:1 (décision D2 : « un
 * cube unité a une hauteur écran égale à la demi-largeur de tuile »). L'échelle
 * est donc uniforme, et une vignette se pose sans déformation.
 */
export function tailleDePose(
  hauteurM: number,
  vignette: Vignette,
  vue: Vue,
): { largeur: number; hauteur: number } {
  // Ce que l'ARBRE doit mesurer à l'écran, en pixels.
  const arbrePx = Math.max(1, hauteurM * METRE_VERTICAL_PX * vue.cam.zoom);
  // Le rapport d'agrandissement de l'image se lit sur l'arbre, pas sur l'image :
  // la vignette réserve une marge au-dessus de la cime et sur les côtés, et
  // diviser par la hauteur d'image poserait l'arbre trop petit d'autant.
  const k = arbrePx / Math.max(1, vignette.hautArbrePx);
  return {
    largeur: Math.max(1, vignette.image.width * k),
    hauteur: Math.max(1, vignette.image.height * k),
  };
}

/**
 * Où poser le pied de la vignette dans l'image, une fois mise à l'échelle.
 *
 * Le pied n'est pas au centre : il est en bas, au milieu de la largeur. Rendre
 * ce décalage à part évite que chaque appelant refasse la même règle de trois.
 */
export function ancrageDePose(
  vignette: Vignette,
  taille: { largeur: number; hauteur: number },
): { dx: number; dy: number } {
  const k = taille.hauteur / Math.max(1, vignette.image.height);
  return {
    dx: vignette.piedX * (taille.largeur / Math.max(1, vignette.image.width)),
    dy: vignette.piedY * k,
  };
}
