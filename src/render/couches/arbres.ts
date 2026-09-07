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

import { getEspece } from "../../engine/especes";
import { HAUTEUR_BROUTAGE_M } from "../../engine/gibier";
import { ficheDe } from "../arbres/especes";
import { contourFeuille, elementsParFeuille, portDuBouquet } from "../arbres/feuilles";
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
  /**
   * Base du houppier, m : `Snapshot.baseHouppierM`, tel quel.
   *
   * **Elle remplace une approximation que le rendu se fabriquait**, et le
   * défaut était le même que celui du seuil de grillage de l'herbe : une
   * grandeur écologique décrétée côté dessin. `longueurDuFutM` tirait la
   * longueur du fût de `houppierRatio` par une formule à lui, ce qui donnait le
   * même arbre en pré et en futaie — alors que la profondeur de couronne est un
   * RÉSULTAT DE COMPÉTITION, et que c'est justement elle qui fait la différence
   * entre un chêne branchu jusqu'au sol et un chêne à quinze mètres de fût nu.
   *
   * Elle absorbe aussi l'élagage : le moteur y range les deux façons dont une
   * couronne remonte — l'ombre qui tue les branches basses, et le joueur qui
   * les coupe — parce que l'arbre ne les distingue pas.
   */
  baseHouppierM: number;
  /**
   * Part de la couronne en fleur ∈ [0,1] : `Snapshot.floraison`, tel quel.
   *
   * **Elle ne se déduit d'aucun autre champ, et surtout pas d'un calendrier.**
   * `fruitProgress` vaut 0 avant la floraison, 0 pendant, et 0 toute l'année
   * pour un arbre immature — les trois cas sont indiscernables. Et la fenêtre
   * est un seuil de degrés-jours : la recalculer ici, c'est en tenir une
   * seconde copie qui dérive d'une semaine ou deux sans que rien ne le signale
   * (§2.1). Le moteur la calcule, l'instantané la transporte, le rendu la lit.
   */
  floraison?: number;
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
  /**
   * L'arbre a été tué par le FEU : `Snapshot.brulEeSemaine` est renseigné.
   *
   * Ce n'est pas la même chandelle qu'un mort de sécheresse, et la différence
   * est actionnable : le moteur note qu'un arbre brûlé « reste debout : on peut
   * encore le récolter en coupe sanitaire, à prix déprécié, avant que le bois ne
   * bleuisse ». Un fût carbonisé et un fût gris n'appellent pas le même geste.
   *
   * Le rendu ne lit PAS la semaine, seulement sa présence : de combien de temps
   * un charbon pâlit est une question de modèle, et le moteur ne la traite pas.
   */
  brulee?: boolean;
  /**
   * Plant protégé par un manchon : `Snapshot.protege`.
   *
   * Le moteur en fait une action à part (`proteger`) et refuse de protéger un
   * arbre déjà sorti — « hors d'atteinte, protection inutile » au-delà de
   * `HAUTEUR_BROUTAGE_M`. C'est donc un objet posé par le joueur, avec un coût,
   * et savoir quels plants en ont un est directement actionnable.
   */
  protege?: boolean;
  /**
   * Nombre d'étêtages subis : `Snapshot.recepages`.
   *
   * Le rendu n'en lit qu'un SEUIL, et c'est celui du moteur : `biodiversite.ts`
   * compte un arbre comme porteur de cavités si `teteTrogneM` est posé et
   * `recepages >= 2`. Au-delà, la tête est creuse — et c'est ce creux qui fait
   * la valeur faunistique d'une trogne.
   */
  recepages?: number;
  /**
   * La tige a été FROTTÉE par un brocard : `Snapshot.frotteSemaine` est
   * renseigné.
   *
   * **Le dégât de gibier le plus actionnable du modèle, et le seul qui laisse
   * une trace lisible.** Le moteur en fait une histoire complète : les brocards
   * frottent leurs bois au printemps sur les tiges isolées et lisses, entre
   * `FROTTIS_HAUTEUR_MIN_M` et `FROTTIS_HAUTEUR_MAX_M` ; une tige trop fine est
   * annelée et meurt ; une tige déjà marquée est un REPÈRE, et le brocard y
   * revient (`BONUS_ARBRE_REPERE`). C'est cette dernière phrase qui rend le
   * dessin utile : une plaie fraîche ne dit pas seulement « il s'est passé
   * quelque chose », elle dit « ça recommencera ici », et le joueur a une
   * réponse — `proteger`, `cloturer`, ou réguler.
   *
   * Le rendu ne lit PAS la semaine, seulement sa présence, exactement comme
   * pour `brulee` : à quelle vitesse une plaie de frottis se referme est une
   * question de modèle, et le moteur ne la traite pas. La marque reste donc,
   * ce qui est d'ailleurs ce que fait une vraie cicatrice de frottis — elle se
   * bourrelette et se voit des décennies. Sur un arbre devenu grand elle passe
   * simplement sous le seuil de dessin, comme tout ce qui est trop petit.
   */
  frotte?: boolean;
  /**
   * Semaines écoulées depuis la dernière levée d'écorce : `Snapshot.week`
   * moins `Snapshot.derniereLeveeSemaine`. Absent = jamais démasclé.
   *
   * **Le seul arbre du jeu dont le tronc change de couleur par une action du
   * joueur**, et la fiche du chêne-liège le disait avant que quoi que ce soit
   * ne le dessine : liège levé, le tronc est ocre-rouge vif, puis il grisonne
   * à mesure que l'écorce se reforme.
   *
   * **C'est aussi le seul état de cette liste dont le moteur donne la DURÉE.**
   * `especes.ts` porte `ecorce.rotationAns` — dix ans pour le liège — et
   * `ecorceRecoltable` s'en sert pour refuser une levée trop rapprochée. Le
   * rendu peut donc dire où l'arbre en est sans rien inventer, contrairement au
   * charbon d'un fût brûlé ou à la plaie d'un frottis, dont le moteur ne dit
   * pas comment ils vieillissent.
   *
   * Et ce que ça donne à voir est directement actionnable : quand le tronc a
   * fini de grisonner, le liège est refait et l'arbre est de nouveau
   * récoltable. C'est le même signal qu'un fruit mûr.
   */
  semainesDepuisLevee?: number;
  /** part du feuillage accroché ∈ [0,1] — `partFoliaire` du moteur */
  partFoliaire: number;
  /** avancement de la sénescence ∈ [0,1] — `senescenceFoliaire` */
  senescence: number;
  /**
   * Vigueur ∈ [0,1] : `Snapshot.vigueur`, la moyenne lissée du facteur limitant
   * sur les derniers mois.
   *
   * **À ne pas confondre avec le stress**, et le moteur insiste : le stress ne
   * monte que lorsque l'arbre est en danger de mort, la vigueur dit s'il pousse
   * à son potentiel ou s'il végète. Un sujet dominé ou chroniquement assoiffé a
   * une vigueur basse BIEN AVANT d'accumuler du stress — et c'est celui-là que
   * les ravageurs trouvent. C'est donc le signal d'alerte précoce, celui qui
   * laisse encore le temps d'agir, et c'est à ce titre qu'il vaut d'être vu.
   *
   * Elle voyageait déjà jusqu'ici et n'était PAS lue à la cuisson : un arbre
   * qui végétait avait exactement le houppier d'un arbre florissant.
   */
  vigueur: number;
  /**
   * Dommage hydraulique ∈ [0,1] : `Snapshot.dommageHydraulique`, la part du
   * système conducteur mise hors service par l'embolie.
   *
   * **C'est la CIME SÈCHE, et elle ne se répare pas.** L'eau qui monte casse en
   * colonnes sous la sécheresse sévère, et les vaisseaux embolisés ne
   * redeviennent jamais fonctionnels — l'arbre ne récupère qu'en fabriquant du
   * bois neuf, ce qui prend des années. C'est la mémoire des sécheresses
   * passées, et c'est ce qui explique les mortalités DIFFÉRÉES : les arbres ne
   * meurent pas l'année de la sécheresse mais deux ou trois ans après.
   *
   * Un joueur qui ne la voit pas ne comprend pas pourquoi ses arbres meurent
   * un été qui n'a rien d'exceptionnel.
   */
  dommageHydraulique?: number;
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
 * Paliers de la base du houppier, en part de la hauteur de l'arbre.
 *
 * Six : assez pour séparer un arbre branchu jusqu'au sol d'un fût nu sur les
 * trois quarts, assez peu pour que la clé de cache ne se démultiplie pas. La
 * grandeur monte lentement — quelques centimètres par semaine sous la
 * compétition — donc un palier tient des années, et c'est bien ce qu'on veut
 * d'une clé de cache.
 */
export const PALIERS_FUT = 6;

/**
 * Paliers de vigueur et de dommage hydraulique.
 *
 * Quatre chacun, et le compte ne coûte que ce qu'il sert : la très grande
 * majorité des arbres d'une parcelle saine tombent dans le même palier, donc
 * partagent la même vignette. Une clé de cache ne se démultiplie que là où les
 * arbres diffèrent vraiment — et là, on VEUT qu'ils diffèrent à l'écran.
 */
export const PALIERS_SANTE = 4;

/**
 * Paliers de HAUTEUR DE TÊTE d'une trogne, en part de la hauteur de l'arbre.
 *
 * **Elle est entrée dans la clé de cache parce qu'elle n'y était pas, et que ça
 * se voyait.** La classe ne portait qu'un booléen « c'est une trogne » ; la
 * hauteur de tête, elle, voyageait par un rappel passé à la cuisson — que
 * personne n'appelait. Résultat : aucune trogne n'avait de tête, nulle part, et
 * les deux planches censées comparer une tête jeune et une tête creuse
 * rendaient deux images identiques au bit près.
 *
 * Une hauteur de tête ne bouge pas : le moteur coupe toujours au même endroit,
 * c'est la définition d'une trogne. Elle est donc exactement le genre de
 * grandeur qu'une clé de cache accueille sans coûter — quatre paliers séparent
 * la trogne de bord de chemin, étêtée à hauteur d'homme, du saule têtard étêté
 * à trois mètres, et deux trognes de la même parcelle partagent leur vignette.
 */
export const PALIERS_TETE = 4;

/**
 * Nombre d'étêtages à partir duquel la tête d'une trogne est CREUSE.
 *
 * **Le seuil vient du moteur, il n'est pas choisi ici** : `biodiversite.ts`
 * compte un arbre parmi les gros bois porteurs d'habitat si sa hauteur dépasse
 * quinze mètres OU si c'est une trogne d'au moins deux étêtages. Autrement dit,
 * le moteur affirme déjà qu'à partir de deux coupes la tête offre des cavités —
 * et c'est cette affirmation-là qu'on dessine.
 *
 * Ce que le moteur ne dit PAS, en revanche, c'est de combien la tête GROSSIT.
 * Aucune dimension de tête n'existe côté simulation, et le rendu n'en fabrique
 * donc pas : la tête est dessinée à partir du rayon du fût, sans grossir avec
 * les étêtages. Manque porté en issue #19.
 */
export const RECEPAGES_CREUX = 2;

/**
 * Part de feuillage que garde un arbre de vigueur NULLE.
 *
 * Pas zéro : un arbre qui végète n'est pas un arbre mort. La vigueur dit qu'il
 * ne pousse pas à son potentiel, pas qu'il a lâché — le moteur a `chandelle`
 * pour ça, et `partFoliaireOmbrageante` pour la saison. Ce qu'on montre est un
 * houppier CLAIRSEMÉ, à travers lequel on commence à voir la ramure.
 */
export const MANQUE_VIGUEUR = 0.45;

/**
 * De combien le feuillage d'un arbre sans vigueur pâlit et jaunit.
 *
 * **À ne pas confondre avec la sénescence d'automne**, qui est un autre axe de
 * la clé et une autre couleur : une feuille d'octobre est franchement dorée ou
 * rousse, alors qu'un arbre qui végète en juillet est d'un vert MALADE — plus
 * clair, plus jaune, moins saturé. Confondre les deux ferait lire « l'automne
 * arrive » là où le moteur dit « celui-ci ne va pas bien ».
 */
export const PALEUR_SANS_VIGUEUR = 0.35;

/**
 * La teinte d'un feuillage selon la vigueur de l'arbre.
 *
 * Vers un vert-jaune pâle, et non vers la couleur d'automne. Un arbre qui
 * végète garde de la chlorophylle — il en fait moins, et son feuillage est plus
 * clair et plus jaune, ce qui est exactement l'aspect d'une carence.
 */
export function teinteSelonVigueur(teinte: Teinte, vigueur: number): Teinte {
  const manque = Math.min(1, Math.max(0, 1 - vigueur));
  return melange(teinte, VERT_MALADE, PALEUR_SANS_VIGUEUR * manque);
}

/** Le vert d'un feuillage qui manque de tout : clair, jaune, éteint. */
const VERT_MALADE: Teinte = { r: 168, g: 172, b: 104 };

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
export const FRUIT_FLEUR = 1;
export const FRUIT_CROISSANCE = 2;
export const FRUIT_MUR = 3;
export const ETATS_FRUIT = 4;

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
  // La fleur en dernier, et c'est l'ordre du cycle : elle précède le fruit, et
  // le moteur remet `floraison` à zéro dès que la nouaison commence. Les deux
  // ne se chevauchent donc pas — sauf chez l'arbousier, qui fleurit pendant que
  // mûrissent les arbouses de l'an passé, et où c'est bien le fruit mûr qu'on
  // veut voir puisque c'est lui qui appelle un geste.
  if ((arbre.floraison ?? 0) > 0.05) return FRUIT_FLEUR;
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
 * De combien un bouquet de fleurs est plus large que le groupe de fruits qui
 * lui succède, au même bout de rameau.
 *
 * Un arbre noue une petite part de ce qu'il fleurit — quelques dizaines de
 * pommes pour des milliers de fleurs — donc la fleur occupe plus de place que
 * le fruit sur exactement le même rameau. Ce n'est pas une grandeur du moteur :
 * c'est la traduction en dessin du fait qu'une floraison se voit de loin et
 * qu'une fructification demande de s'approcher.
 */
export const FLEUR_ETALEMENT = 1.6;

/** Part de rameaux portant des fleurs. Bien plus qu'en fruits : un arbre en
 * fleur est blanc PARTOUT, alors qu'il porte ses fruits çà et là. */
export const PART_RAMEAUX_FLEURIS = 0.55;

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
  /** vigueur et dommage hydraulique, quantifiés puis empaquetés */
  sante: number;
  /** état de fructification : `FRUIT_AUCUN`, `FRUIT_CROISSANCE` ou `FRUIT_MUR` */
  fruit: number;
  /**
   * Où en est l'écorce de se reformer après un démasclage, en paliers.
   *
   * `PALIERS_LIEGE` (refait, ou espèce sans écorce à lever) à zéro (à vif).
   * L'écart est un GRADIENT et non un drapeau, parce que la grandeur du moteur
   * en est un : `rotationAns` dit combien de temps il faut, pas seulement s'il
   * a coulé.
   */
  liege: number;
  /** taille de cuisson, en pixels de large */
  taillePx: number;
}

/** Quantifie une valeur ∈ [0,1] en `n` paliers, et rend l'indice. */
function palierDe(valeur: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(Math.min(1, Math.max(0, valeur)) * n)));
}

/**
 * Les drapeaux de conduite, dans le champ `gestion` de la classe.
 *
 * Nommés parce qu'ils ne l'étaient pas : quatre `classe.gestion & 8` semés dans
 * le fichier, et le jour où un bit s'est décalé d'un cran, c'est le manchon qui
 * est apparu sur les trognes creuses. Un décalage de bits ne se relit pas.
 */
export const EST_CHANDELLE = 1;
export const EST_BRULEE = 2;
export const EST_PROTEGE = 4;
export const TETE_CREUSE = 8;
export const EST_FROTTE = 16;

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
  // La base du houppier entre dans la clé par PALIERS, comme les autres
  // grandeurs continues : elle change la silhouette du tout au tout — c'est
  // elle qui sépare le chêne de pré du chêne de futaie — mais elle bouge d'un
  // centimètre par semaine, et sans quantification chaque tick invaliderait
  // toutes les vignettes.
  const fut = palierDe(arbre.baseHouppierM / Math.max(0.1, arbre.heightM), PALIERS_FUT);
  // Zéro = pas une trogne ; 1..PALIERS_TETE = étêtée à cette hauteur-là. Un
  // palier de plus que nécessaire, et c'est le prix de ne pas avoir à porter
  // un booléen en double d'une grandeur qui le contient déjà.
  const tete = arbre.teteTrogneM
    ? 1 + palierDe(arbre.teteTrogneM / Math.max(0.1, arbre.heightM), PALIERS_TETE)
    : 0;
  const gestion =
    (arbre.chandelle ? EST_CHANDELLE : 0) |
    (arbre.brulee ? EST_BRULEE : 0) |
    (arbre.protege ? EST_PROTEGE : 0) |
    // Le seuil du MOTEUR, pas le mien : `biodiversite.ts` compte une trogne
    // comme porteuse de cavités à partir de deux étêtages.
    ((arbre.recepages ?? 0) >= RECEPAGES_CREUX ? TETE_CREUSE : 0) |
    (arbre.frotte ? EST_FROTTE : 0) |
    (fut << 5) |
    (tete << 8);
  // La santé : deux grandeurs distinctes, et il faut les deux. La vigueur dit
  // « cet arbre végète » — réversible, et c'est l'alerte précoce ; le dommage
  // hydraulique dit « cet arbre a perdu de la plomberie » — définitif, et c'est
  // ce qui le tuera dans deux ans.
  const sante =
    palierDe(arbre.vigueur, PALIERS_SANTE) * PALIERS_SANTE +
    palierDe(arbre.dommageHydraulique ?? 0, PALIERS_SANTE);
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
    sante,
    fruit,
    liege: palierDe(partEcorceRefaite(arbre), PALIERS_LIEGE),
    taillePx,
  };
}

/**
 * Paliers de reconstitution de l'écorce après démasclage.
 *
 * Quatre pour dix ans de rotation : « à vif », « rougissant », « presque
 * refait », « refait ». Le dernier palier est celui qui compte — c'est lui qui
 * dit que l'arbre est de nouveau récoltable — et les trois autres sont là pour
 * qu'on voie venir. Un palier tient deux ans et demi : c'est très au-dessus de
 * ce qu'une clé de cache craint.
 */
export const PALIERS_LIEGE = 4;

/**
 * Où en est l'écorce de se reformer, ∈ [0,1] — 0 à vif, 1 refaite.
 *
 * **La durée vient du moteur, et c'est ce qui rend cette fonction honnête.**
 * `especes.ts` porte `ecorce.rotationAns` par espèce, et `ecorceRecoltable`
 * s'en sert pour refuser une levée trop rapprochée : le rapport calculé ici est
 * exactement celui que le moteur compare à 1. On ne recopie donc pas une règle,
 * on lit la constante à sa source — comme `satisfactionEnEau` appelle
 * `couvertureMax` plutôt que d'en redire le seuil (§4).
 *
 * Une espèce sans écorce à lever rend 1 : rien à montrer, écorce normale.
 */
export function partEcorceRefaite(arbre: ArbreAPoser): number {
  if (arbre.semainesDepuisLevee === undefined) return 1;
  const rotation = getEspece(arbre.especeId).ecorce?.rotationAns;
  if (!rotation) return 1;
  return Math.min(1, Math.max(0, arbre.semainesDepuisLevee / (rotation * 52)));
}

/** La clé de cache d'une classe. */
export function cleClasse(c: Classe): string {
  return `${c.especeId}|${c.palier}|${c.variante}|${c.feuillage}|${c.gestion}|${c.sante}|${c.fruit}|${c.liege}|${c.taillePx}`;
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

/**
 * Replie la PROFONDEUR du squelette dans la largeur du panneau.
 *
 * **Le `z` du squelette était purement jeté, et une branche pointée vers la
 * caméra disparaissait donc dans le tronc.** La vignette est un panneau vu de
 * face — décision assumée : la silhouette d'un arbre ne doit pas changer quand
 * la caméra tourne autour de lui. Mais « vu de face » ne veut pas dire « sans
 * profondeur » : en ne gardant que `x`, on projetait à zéro tout ce qui partait
 * vers l'avant ou l'arrière.
 *
 * **Ce que ça donnait, et le mécanisme exact — il a fallu deux fausses pistes
 * pour l'établir.** Une ramure OPPOSÉE (`branchesParNoeud: 3`,
 * `divergenceDeg: 90` — cornouiller, sureau, fusain, troène, frêne) ne prend
 * que quatre azimuts : 0, 90, 180, 270 degrés. Leur cosinus, seul facteur lu
 * par la projection, ne prend donc que TROIS valeurs — 1, 0, −1. Les décalages
 * horizontaux se quantifiaient, les bouts de rameaux tombaient sur un réseau de
 * positions, et les bouquets s'empilaient en colonnes verticales : le
 * cornouiller sortait en chapelets de perles. Replier la profondeur ajoute le
 * sinus, qui vaut 0 ou ±1 là où le cosinus vaut ±1 ou 0 : quatre multiplicateurs
 * au lieu de trois, et le réseau se démultiplie d'ordre en ordre.
 *
 * **Mesuré** sur le squelette du cornouiller, 243 bouts après `contraindre` :
 * **35 colonnes distinctes sans le repli, 59 avec.** Un essai le garde.
 *
 * Les deux fausses pistes, parce qu'elles sont instructives. La première :
 * l'allongement du bouquet — or le cornouiller déclare une feuille ovale, son
 * bouquet est une rosette ronde et n'avait aucun allongement à baisser. La
 * seconde : « les branches vers l'objectif s'écrasent sur l'axe du tronc » —
 * mesuré faux, 2 % des bouts seulement passaient près de l'axe, et le repli
 * fait plutôt monter ce chiffre. Ce qui s'écrasait n'était pas la position
 * ABSOLUE mais l'ÉCART : une latérale à angle droit du panneau n'ajoutait rien
 * à l'abscisse de son parent, et sa descendance montait tout droit au-dessus
 * de lui.
 *
 * Le repli est une projection OBLIQUE, du même genre que la dimétrie du sol :
 * une convention fixe du panneau, indépendante de la caméra, où la profondeur
 * compte pour une fraction de la largeur. Un dessin d'architecte fait ça depuis
 * toujours, et pour la même raison — donner une place à ce qui vient vers
 * l'œil sans faire tourner l'objet.
 *
 * Appliqué AVANT `contraindre`, pour que le calibrage de la largeur du houppier
 * voie les coordonnées définitives : replier après aurait fait dépasser les
 * houppiers de la largeur qu'on venait de leur imposer.
 */
export function replier(segments: readonly Segment[]): Segment[] {
  return segments.map((s) => ({
    ...s,
    depart: { x: s.depart.x + s.depart.z * PROFONDEUR_OBLIQUE, y: s.depart.y, z: 0 },
    arrivee: { x: s.arrivee.x + s.arrivee.z * PROFONDEUR_OBLIQUE, y: s.arrivee.y, z: 0 },
  }));
}

/**
 * Ce que vaut un mètre de PROFONDEUR en largeur de panneau.
 *
 * Un peu plus de la moitié : assez pour qu'une branche pointée vers l'objectif
 * ait une existence à l'écran, assez peu pour qu'elle se lise comme une branche
 * vue en raccourci et non comme une branche de côté. C'est le raccourci d'un
 * dessin en perspective cavalière, et il n'a pas à être exact — il a à ne pas
 * être nul.
 */
export const PROFONDEUR_OBLIQUE = 0.55;

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
  baseHouppierM: number,
  teteTrogneM?: number,
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
  //
  // **Le manchon entre dans la marge, et c'est la seule façon de le voir en
  // entier.** Il monte à la hauteur de dent du moteur, qui est justement plus
  // haute que le plant qu'il protège — sinon il ne servirait à rien. Sans cette
  // ligne, la vignette se cadrait sur l'arbre seul et le tube sortait par le
  // haut de l'image : la planche montrait un mur pâle coupé net.
  const margeM = Math.max(
    0.05,
    fiche.feuillage.longueurFeuilleM * 1.5,
    classe.gestion & EST_PROTEGE ? HAUTEUR_BROUTAGE_M - hauteurM : 0,
  );
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
    baseHouppierM,
    ...(teteTrogneM ? { teteTrogneM } : {}),
    ...(fiche.brinsDeCepee ? { brins: fiche.brinsDeCepee } : {}),
  };
  // **Le squelette est plafonné par la TAILLE de la vignette.** À quinze
  // pixels, mille segments seraient mille traits d'un tiers de pixel : on paie
  // un détail que personne ne voit, et c'est exactement le piège que L0 a
  // mesuré. Le budget croît avec la surface de la vignette.
  const budget = Math.max(12, Math.round(classe.taillePx * classe.taillePx * 0.035));
  const brut = replier(engendrer(sujet, fiche.branchement, budget));
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
    const base = teinteDuBois(fiche, haut, classe);
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

  // ── La tête de trogne ─────────────────────────────────────────────────
  // Le fût s'arrête déjà à `teteTrogneM` et les rejets repartent de là : ce qui
  // manquait, c'est le RENFLEMENT — le bourrelet de cicatrisation qu'une coupe
  // répétée au même endroit finit par former, et qui est la silhouette la plus
  // reconnaissable du bocage.
  if (teteTrogneM) {
    dessinerTeteDeTrogne(ctx, fiche, classe, teteTrogneM, hauteurM, echelle, versPx);
  }

  // ── Le tronc démasclé ─────────────────────────────────────────────────
  // Avant le frottis : les deux se posent sur le bas du fût, et une plaie de
  // frottis sur un tronc fraîchement levé reste visible — c'est du bois à nu
  // sur du bois à nu, mais la blessure est plus claire que le liber.
  dessinerDemasclage(ctx, fiche, classe, hauteurM, echelle, versPx);

  // ── La plaie de frottis ───────────────────────────────────────────────
  // AVANT le manchon, et c'est volontaire : les deux ne coexistent pas chez le
  // moteur (`attraitFrottis` rend zéro sur un plant protégé), mais si jamais
  // ils se croisaient, c'est le tube qu'on doit voir par-dessus la plaie — il
  // est ce qui la fait cesser.
  if (classe.gestion & EST_FROTTE) {
    dessinerFrottis(ctx, hauteurM, echelle, versPx);
  }

  // ── Le manchon ────────────────────────────────────────────────────────
  if (classe.gestion & EST_PROTEGE) {
    dessinerManchon(ctx, echelle, piedX, piedY);
  }

  // ── Le feuillage ──────────────────────────────────────────────────────
  const partFoliaire = Math.floor(classe.feuillage / PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  const senescence = (classe.feuillage % PALIERS_FEUILLAGE) / (PALIERS_FEUILLAGE - 1);
  const vigueur = Math.floor(classe.sante / PALIERS_SANTE) / (PALIERS_SANTE - 1);
  const dommage = (classe.sante % PALIERS_SANTE) / (PALIERS_SANTE - 1);
  if (partFoliaire > 0.02) {
    const teinte = couleurFeuillage(fiche, senescence);
    dessinerFeuillage(
      ctx,
      segments,
      fiche,
      teinteSelonVigueur(teinte, vigueur),
      // Un arbre qui végète porte MOINS de feuilles : c'est la première chose
      // qu'on voit d'un sujet dominé, avant même sa couleur.
      partFoliaire * (MANQUE_VIGUEUR + (1 - MANQUE_VIGUEUR) * vigueur),
      echelle,
      versPx,
      classe,
      dommage,
    );
  }

  // ── Les fruits ────────────────────────────────────────────────────────
  // **Après le feuillage, donc devant lui.** Un fruit caché derrière les
  // feuilles ne sert à rien : il est là pour dire « il y a quelque chose à
  // récolter », ce qui est une information d'action et doit se voir. C'est aussi
  // ce que fait un arbre chargé — les fruits pèsent et pendent sous le
  // feuillage.
  if (fiche.fruit && classe.fruit !== FRUIT_AUCUN) {
    // La cime sèche s'applique AUSSI aux fruits : un rameau embolisé ne porte
    // ni feuille ni fruit. Sans ça, un arbre à cime sèche portait des pommes
    // sur du bois mort — le genre de détail qui ne se remarque pas tout de
    // suite et qui, une fois vu, décrédibilise tout le reste.
    dessinerFruits(ctx, segments, fiche.fruit, classe, echelle, versPx, dommage);
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
 * La couleur du bois, selon que l'arbre est vivant, mort debout, ou brûlé.
 *
 * **Les trois cas viennent du moteur, les trois teintes sont du dessin** — la
 * même répartition que partout ailleurs. Le moteur dit `chandelle` (l'arbre
 * n'est plus vivant) et `brulEeSemaine` (le feu l'a tué) ; qu'un bois mort
 * grisonne et qu'un bois carbonisé soit noir n'est pas une affirmation de
 * modèle, c'est ce qu'est du bois mort et du charbon.
 *
 * Ce que le rendu ne fait PAS : lire la semaine pour faire pâlir le charbon
 * avec le temps. De combien un fût brûlé se décolore en trois ans est une
 * question de modèle, et le moteur ne la traite pas.
 */
function teinteDuBois(fiche: FicheGraphique, haut: boolean | undefined, classe: Classe): Teinte {
  if (classe.gestion & EST_BRULEE) return BOIS_BRULE;
  if (classe.gestion & EST_CHANDELLE) return BOIS_MORT;
  return haut && fiche.ecorceHaute ? fiche.ecorceHaute : fiche.ecorce;
}

/**
 * Le tronc démasclé : la bande ocre-rouge du liège levé, qui grisonne.
 *
 * **Une bande posée par-dessus le fût, et pas une couleur de segment**, parce
 * que le démasclage a une LIGNE. On le lève au couteau jusqu'à une hauteur
 * marquée, et la limite est nette — c'est même ce qui rend une subéraie levée
 * reconnaissable de loin. Colorer les segments du squelette donnait l'inverse :
 * le fût d'un chêne-liège tient en un ou deux longs segments, et un segment est
 * coloré tout entier ou pas du tout, si bien que la limite sautait de zéro à
 * quatre mètres selon la découpe du squelette.
 *
 * **Ce que le moteur donne** : la semaine de la levée et la ROTATION
 * (`ecorce.rotationAns`), donc le rapport que `partEcorceRefaite` calcule et
 * que `ecorceRecoltable` compare à 1. Le dernier palier veut dire « le liège
 * est refait » — c'est-à-dire « récoltable », et c'est l'information utile.
 *
 * **Ce que le dessin pose** : la couleur du liber à vif, et la hauteur de
 * démasclage (voir `HAUTEUR_DEMASCLAGE_M`).
 */
function dessinerDemasclage(
  ctx: CanvasRenderingContext2D,
  fiche: FicheGraphique,
  classe: Classe,
  hauteurM: number,
  echelle: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
): void {
  // Rien à montrer : écorce refaite, ou espèce qu'on ne démascle pas.
  if (classe.liege >= PALIERS_LIEGE - 1) return;
  const hautM = Math.min(HAUTEUR_DEMASCLAGE_M, hauteurM * 0.8);
  const bas = versPx({ x: 0, y: 0 });
  const haut = versPx({ x: 0, y: hautM });
  const hautPx = bas.sy - haut.sy;
  if (hautPx < 2) return;
  // Un peu plus étroit que le fût au pied : le tronc s'affine en montant, et
  // une bande à la largeur du pied déborderait en haut.
  const demi = Math.max(0.6, rayonAuPiedM(hauteurM) * echelle * 0.9);
  ctx.fillStyle = versCss(melange(LIEGE_A_VIF, fiche.ecorce, classe.liege / (PALIERS_LIEGE - 1)));
  ctx.beginPath();
  ctx.rect(bas.sx - demi, haut.sy, demi * 2, hautPx);
  ctx.fill();
}

/**
 * Le tronc d'un chêne-liège fraîchement démasclé : ocre-rouge vif.
 *
 * C'est la couleur du liber mis à nu, et elle est spectaculaire — un tronc de
 * subéraie levée se voit de loin, ce qui est exactement pourquoi elle mérite
 * d'être dessinée : elle dit d'un coup d'œil quels arbres viennent d'être
 * récoltés et lesquels attendent encore.
 */
const LIEGE_A_VIF: Teinte = { r: 164, g: 78, b: 44 };

/**
 * Jusqu'où le liège se lève sur le tronc, en mètres.
 *
 * **Une hauteur de PRATIQUE, pas un état de parcelle** : on démascle le fût et
 * la base des charpentières, et cette hauteur ne varie pas d'une subéraie à
 * l'autre. Même statut que la hauteur de frottis — c'est une propriété du
 * geste, comme la forme d'une feuille est une propriété de l'espèce (§4).
 *
 * **Ce qu'on ne fait PAS, et pourquoi ça ne part pas en issue** : la vraie
 * hauteur de démasclage MONTE d'une levée à l'autre — « la couronne monte », et
 * un vieux chêne-liège est démasclé bien plus haut qu'un jeune. C'est un état
 * par arbre, et le moteur ne le porte pas. La différence est qu'il ne le porte
 * pas *par omission* : `especes.ts` fait déjà dépendre le rendement de la
 * taille de l'arbre (`rendementKg × min(1.5, heightM/12)`), ce qui est
 * exactement ce qu'une hauteur de démasclage croissante produirait. Le modèle
 * a donc la conséquence sans la cause, et lui ajouter la cause serait un
 * raffinement, pas un manque.
 */
const HAUTEUR_DEMASCLAGE_M = 2.6;

/** Bois mort sur pied : gris argenté, l'écorce partie. */
const BOIS_MORT: Teinte = { r: 138, g: 132, b: 122 };
/** Bois carbonisé : noir mat, à peine plus clair que le noir pur. */
const BOIS_BRULE: Teinte = { r: 44, g: 40, b: 38 };

/**
 * Le renflement d'une tête de trogne, et sa cavité au-delà de deux étêtages.
 *
 * **Ce que le moteur donne** : `teteTrogneM` (où l'on coupe, toujours au même
 * endroit) et `recepages` (combien de fois). Et il en tire lui-même une
 * conséquence écologique — `biodiversite.ts` compte une trogne d'au moins deux
 * étêtages parmi les gros bois porteurs d'habitat, au même titre qu'un arbre de
 * quinze mètres. C'est cette affirmation-là qu'on dessine : au-delà du seuil, la
 * tête est creuse.
 *
 * **Ce que le moteur ne donne PAS**, et qu'on ne fabrique donc pas : la TAILLE
 * de la tête. Aucune dimension de tête n'existe côté simulation. Le bourrelet
 * est dessiné à partir du rayon du fût — une allométrie déjà posée par le rendu
 * (`rayonAuPiedM`) — et il ne grossit pas avec les étêtages, alors qu'une vraie
 * tête de trogne grossit à chaque coupe. Manque porté en issue #19 plutôt que
 * comblé ici : la taille d'une tête a une conséquence écologique (le volume de
 * cavité, donc ce qui peut y nicher), et une valeur inventée au rendu ne serait
 * jamais confrontée à cette conséquence.
 */
function dessinerTeteDeTrogne(
  ctx: CanvasRenderingContext2D,
  fiche: FicheGraphique,
  classe: Classe,
  teteTrogneM: number,
  hauteurM: number,
  echelle: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
): void {
  const rayonPx = rayonAuPiedM(hauteurM) * echelle;
  if (rayonPx < 1) return;
  const c = versPx({ x: 0, y: teteTrogneM });
  const large = rayonPx * RENFLEMENT_TETE;
  ctx.fillStyle = versCss(teinteDuBois(fiche, false, classe));
  ctx.beginPath();
  ctx.ellipse(c.sx, c.sy, large, large * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  // La cavité : le moteur dit qu'à deux étêtages la tête en porte.
  if (!(classe.gestion & TETE_CREUSE)) return;
  const creux = large * 0.42;
  if (creux < 0.8) return;
  ctx.fillStyle = versCss(CREUX_DE_TROGNE);
  ctx.beginPath();
  ctx.ellipse(c.sx, c.sy - large * 0.12, creux, creux * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** De combien la tête d'une trogne est plus large que le fût qui la porte. */
export const RENFLEMENT_TETE = 2.2;
/** L'ombre d'une cavité : presque noire, jamais tout à fait. */
const CREUX_DE_TROGNE: Teinte = { r: 38, g: 32, b: 28 };

/**
 * La plaie d'un frottis : l'écorce arrachée sur un côté de la tige.
 *
 * **Ce que le moteur donne** : `frotteSemaine`, la semaine du dernier frottis,
 * et toute l'histoire qui va avec — `gibier.ts` décrit des brocards qui
 * frottent leurs bois au printemps sur les tiges isolées à écorce lisse, et
 * qui **reviennent sur celles qu'ils ont déjà marquées** (`BONUS_ARBRE_REPERE`).
 * C'est cette dernière phrase qui fait de la plaie une information utile et pas
 * une décoration : elle annonce le prochain frottis autant qu'elle raconte
 * l'ancien.
 *
 * **Ce qui vient du dessin** : où la plaie se trouve sur la tige, et à quoi
 * ressemble du bois mis à nu. La hauteur du frottis n'est pas une grandeur du
 * moteur et n'a pas à l'être — c'est la hauteur des bois d'un chevreuil, un
 * fait de l'animal, au même titre que la forme d'une feuille est un fait de
 * l'espèce (§4). Le moteur, lui, s'occupe de la hauteur de l'ARBRE, qui est ce
 * qui décide s'il est frottable et s'il en meurt.
 *
 * **Ce que le rendu ne fait PAS** : lire la semaine pour faire cicatriser la
 * plaie. À quelle vitesse un bourrelet recouvre une blessure de frottis est une
 * question de modèle, et le moteur ne la traite pas. La marque reste donc — ce
 * qui se défend, une cicatrice de frottis se voyant des décennies — et sur un
 * arbre devenu grand elle passe simplement sous le seuil de dessin.
 */
function dessinerFrottis(
  ctx: CanvasRenderingContext2D,
  hauteurM: number,
  echelle: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
): void {
  const rayonPx = rayonAuPiedM(hauteurM) * echelle;
  const hautPx = (FROTTIS_HAUT_M - FROTTIS_BAS_M) * echelle;
  // Sous deux pixels de haut ou un de large, la plaie n'est plus qu'un point
  // sombre sur le fût, et un point sombre au hasard sur un tronc ressemble à un
  // défaut de rendu, pas à une blessure.
  if (hautPx < 2 || rayonPx < 0.6) return;
  const bas = versPx({ x: 0, y: FROTTIS_BAS_M });
  const haut = versPx({ x: 0, y: FROTTIS_HAUT_M });
  // **Sur un CÔTÉ de la tige, et pas au milieu.** Un brocard frotte de flanc :
  // la plaie est une bande verticale décalée, et c'est ce décalage qui la fait
  // lire comme une écorce arrachée plutôt que comme une ombre de tronc.
  const cx = bas.sx + rayonPx * 0.3;
  const cy = (bas.sy + haut.sy) / 2;
  const demiH = Math.abs(bas.sy - haut.sy) / 2;
  const demiL = Math.max(0.6, rayonPx * 0.65);
  // **Deux passes, et la première est celle qui fait la lecture.** Une simple
  // tache claire sur un fût ne se lit pas comme une plaie : elle se lit comme
  // le côté éclairé du tronc, qui est déjà dessiné juste au-dessus par la même
  // méthode. Ce qui distingue une écorce ARRACHÉE, c'est son bord — le lambeau
  // sombre qui reste autour du bois mis à nu. On pose donc l'ourlet d'abord,
  // le bois clair ensuite, un peu plus petit.
  ctx.fillStyle = versCss(OURLET_DE_FROTTIS);
  ctx.beginPath();
  ctx.ellipse(cx, cy, demiL + 0.7, demiH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = versCss(BOIS_A_NU);
  ctx.beginPath();
  ctx.ellipse(cx, cy, demiL, demiH * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Le bois mis à nu par un frottis : clair, presque blanc, puis il grisonne. */
const BOIS_A_NU: Teinte = { r: 212, g: 198, b: 170 };

/** Le lambeau d'écorce qui reste autour de la plaie : c'est lui qu'on lit. */
const OURLET_DE_FROTTIS: Teinte = { r: 62, g: 48, b: 38 };

/**
 * Entre quelles hauteurs un brocard frotte, en mètres.
 *
 * **La hauteur des BOIS de l'animal, pas une grandeur de parcelle.** Le moteur
 * dit entre quelles hauteurs une TIGE est frottable (`FROTTIS_HAUTEUR_MIN_M` à
 * `FROTTIS_HAUTEUR_MAX_M`, soit 1,2 à 5 m de haut) — c'est une propriété de
 * l'arbre, et elle décide de ce qui arrive. Où l'animal pose ses bois sur cette
 * tige est une propriété de l'animal, elle ne varie pas d'une parcelle à
 * l'autre, et le moteur n'a aucune raison de la porter.
 */
const FROTTIS_BAS_M = 0.35;
const FROTTIS_HAUT_M = 0.95;

/**
 * Le manchon de protection : un tube pâle au pied du plant.
 *
 * **Sa hauteur vient du moteur** — `HAUTEUR_BROUTAGE_M`, importé de
 * `gibier.ts`, la hauteur de dent au-delà de laquelle « la flèche est hors
 * d'atteinte et le plant est sorti ». C'est exactement l'enjeu de la
 * protection, et le moteur refuse d'ailleurs de protéger un arbre déjà plus
 * haut. La choisir ici aurait été inventer la règle du jeu.
 */
function dessinerManchon(
  ctx: CanvasRenderingContext2D,
  echelle: number,
  piedX: number,
  piedY: number,
): void {
  const haut = HAUTEUR_BROUTAGE_M * echelle;
  if (haut < 2) return;
  const demi = Math.max(0.5, (DIAMETRE_MANCHON_M / 2) * echelle);
  // **Translucide, parce qu'un manchon l'est.** Opaque, le tube effaçait la
  // tige et le plant semblait flotter au-dessus du sol : on ne voyait plus ce
  // qui est protégé, seulement la protection. À travers le plastique on
  // devine la tige, et c'est exactement l'information qu'on veut — le manchon
  // se pose autour de quelque chose.
  ctx.save();
  ctx.globalAlpha = OPACITE_MANCHON;
  ctx.fillStyle = versCss(MANCHON);
  ctx.beginPath();
  ctx.rect(piedX - demi, piedY - haut, demi * 2, haut);
  ctx.fill();
  ctx.restore();
}

/** Le manchon : plastique translucide, verdâtre et pâle. */
const MANCHON: Teinte = { r: 186, g: 192, b: 168 };

/**
 * Diamètre d'un manchon de protection, en mètres.
 *
 * **Une dimension absolue, et c'est la correction.** Le tube était dessiné à
 * une fraction de sa propre hauteur — un manchon large de quarante centimètres,
 * plus gros qu'un fût de vingt ans — et la planche du plant protégé sortait en
 * mur pâle. Or un manchon ne s'élargit pas quand il s'allonge : c'est un tube
 * du commerce, et le plant doit y tenir sans plus.
 *
 * Comme la forme d'une feuille ou d'un fruit, ce n'est pas une grandeur que le
 * moteur devrait porter : c'est ce qu'EST l'objet dessiné, pas un état de la
 * parcelle. La HAUTEUR, elle, est un enjeu de simulation — et elle vient donc
 * du moteur (`HAUTEUR_BROUTAGE_M`).
 */
const DIAMETRE_MANCHON_M = 0.1;

/** Ce que laisse passer le plastique d'un manchon : assez pour deviner la tige. */
const OPACITE_MANCHON = 0.78;

/**
 * Les rameaux qui portent encore du feuillage, une fois la cime sèche retirée.
 *
 * On coupe en HAUTEUR ÉCRAN et non en ordre de branchement : le dommage
 * hydraulique est une histoire de distance aux racines, pas de topologie de
 * l'arbre. Un rameau bas porté par une longue charpentière est mieux alimenté
 * qu'un rameau haut porté par la flèche, et c'est bien ce qu'on veut montrer.
 */
function seuilCimeSeche(
  terminaux: readonly Segment[],
  dommage: number,
  versPx: (p: { x: number; y: number }) => { sx: number; sy: number },
): Segment[] {
  if (dommage <= 0.02 || terminaux.length === 0) return [...terminaux];
  let haut = Number.POSITIVE_INFINITY;
  let bas = Number.NEGATIVE_INFINITY;
  for (const s of terminaux) {
    const y = versPx(s.arrivee).sy;
    haut = Math.min(haut, y);
    bas = Math.max(bas, y);
  }
  if (!(bas > haut)) return [...terminaux];
  // `sy` croît vers le BAS : la limite descend depuis la cime à mesure que le
  // dommage monte.
  const limite = haut + (bas - haut) * dommage;
  return terminaux.filter((s) => versPx(s.arrivee).sy >= limite);
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
  dommageHydraulique = 0,
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
  // **La FLEUR emprunte toute la mécanique du fruit**, et ce n'est pas une
  // paresse : elle occupe la même place — le bout des rameaux fructifères — au
  // même nombre, et elle se heurte au même mur de résolution. Ce qui change est
  // sa couleur, et le fait qu'une floraison COUVRE davantage qu'une fructifi-
  // cation : un pommier porte quelques dizaines de pommes et des milliers de
  // fleurs. D'où un groupe plus large, et jamais de fleur isolée.
  const enFleur = classe.fruit === FRUIT_FLEUR;
  if (enFleur && !fruit.fleur) return;
  const enAmas = enFleur || unitePx < FRUIT_MIN_PX;
  const largeurAmas = enFleur ? groupePx * FLEUR_ETALEMENT : groupePx;
  if (enAmas && largeurAmas < FRUIT_MIN_PX) return;
  const taillePx = enAmas ? largeurAmas : unitePx;
  const combien = enAmas ? 1 : fruit.parRameau;
  const contour = contourFruit(enAmas ? "charnu" : fruit.forme);
  const mur = classe.fruit === FRUIT_MUR;
  // La couleur ARRIVE avec la maturité, et c'est l'arrivée qui est
  // l'information. Un fruit vert est un fruit vert : rien ne distingue une
  // pomme d'août d'une prunelle d'août à cette taille.
  const teinte = enFleur
    ? (fruit.fleur ?? fruit.couleur)
    : mur
      ? fruit.couleur
      : melange(FRUIT_VERT, fruit.couleur, 0.25);
  // **La cime sèche DÉPLACE les fruits, elle n'en retire aucun**, et la
  // distinction a failli m'échapper.
  //
  // Le moteur calcule `fruitsKg` sans le moindre terme de dommage hydraulique :
  // `rendementMaxKg × sizeFactor × fruitProgress × gel × pollinisation ×
  // service`. Il dit donc qu'un arbre à cime sèche porte sa charge ENTIÈRE. Ma
  // première version filtrait les rameaux secs puis parcourait le reste avec la
  // même probabilité d'acceptation : elle dessinait 45 % de fruits en moins sur
  // un arbre à 45 % de cime sèche. C'est-à-dire qu'elle atténuait le signal de
  // RÉCOLTE — le seul de l'arbre qui appelle un geste — au nom d'un mécanisme
  // que le moteur ne modélise pas.
  //
  // Et le « bois mort » n'existe même pas côté moteur : `dommageHydraulique`
  // est un scalaire sur l'arbre, le squelette est une construction du rendu.
  // L'incohérence à résoudre était donc la MIENNE, à l'intérieur du dessin, et
  // il n'y avait aucune raison de la payer avec une grandeur du moteur.
  //
  // On compense : moins de rameaux disponibles, chacun d'autant plus susceptible
  // d'en porter. La charge dessinée ne bouge pas, seule sa place change — et la
  // place a toujours été l'affaire du rendu.
  const tousLesBouts = segments.filter((s) => s.terminal);
  const terminaux = seuilCimeSeche(tousLesBouts, dommageHydraulique, versPx);
  const survie = terminaux.length / Math.max(1, tousLesBouts.length);
  // En amas, il n'y a qu'une marque par rameau : elle ne s'étale pas, elle EST
  // l'étalement.
  const etalement = enAmas ? 0 : (diametreDuGroupeM(fruit) * echelle) / 2;
  let i = 0;
  for (const s of terminaux) {
    i++;
    // Une floraison couvre la couronne, une fructification la pique : le
    // pommier de mai est blanc partout, celui de septembre porte des pommes çà
    // et là. C'est le même arbre et le même rameau — c'est la PART qui change.
    // La part est relevée du taux de survie des rameaux : voir plus haut, la
    // cime sèche déplace les fruits, elle n'en retire pas.
    const part = Math.min(1, (enFleur ? PART_RAMEAUX_FLEURIS : PART_RAMEAUX_FRUITIERS) / survie);
    if (hacher(i, classe.palier, 0x3ef7) > part) continue;
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
  dommageHydraulique = 0,
): void {
  const tous = segments.filter((s) => s.terminal);
  // **La CIME SÈCHE, et elle sèche par le HAUT.** Le dommage hydraulique est la
  // part du système conducteur mise hors service par l'embolie ; ce qui lâche
  // en premier, c'est ce qui est hydrauliquement le plus loin des racines,
  // c'est-à-dire le sommet. Un arbre qui a soif garde son feuillage bas et
  // perd sa cime — et les rameaux nus restent, ce qui distingue une cime sèche
  // d'un arbre simplement défeuillé.
  //
  // Le bois est déjà dessiné à ce stade : ne pas poser de bouquet suffit donc à
  // faire apparaître la ramure, sans une primitive de plus.
  const terminaux = seuilCimeSeche(tous, dommageHydraulique, versPx);
  const contour = contourFeuille(fiche.feuillage.forme);
  const parFeuille = elementsParFeuille(fiche.feuillage.forme);
  const tailleFeuillePx = fiche.feuillage.longueurFeuilleM * echelle;
  const detaille = tailleFeuillePx >= FEUILLE_DES_PX;
  const aiguilles = fiche.feuillage.forme === "aiguille";
  // Le port du bouquet, déduit de la forme de la feuille : c'est ce qui sépare
  // une fronde de frêne d'une rosette de hêtre à l'échelle où l'on joue,
  // c'est-à-dire bien en dessous du seuil où l'on dessine une feuille.
  const port = portDuBouquet(fiche.feuillage.forme);

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
    // **Un seul tracé pour tous les feuillages, et deux nombres pour les
    // distinguer.** Il y avait deux branches — la brosse du conifère et la
    // boule du feuillu — et c'était un faux partage : entre les deux il y a un
    // continuum, et c'est lui qui porte l'identité d'une essence. Une fronde de
    // frêne est à mi-chemin, une rosette de hêtre est à un bout, une brosse de
    // pin à l'autre. Deux branches ne pouvaient pas dire ça, et la boule
    // gagnait par défaut pour tout le monde sauf le pin.
    //
    // **L'AIRE est conservée** quand le bouquet s'allonge : le calibre a été
    // calculé pour qu'un certain nombre de taches couvre la part voulue du
    // houppier, et étirer sans compenser aurait changé la transparence de
    // chaque espèce au passage — un effet de bord qu'on n'a pas demandé.
    const demiLong = calibre * Math.sqrt(port.allongement);
    const demiTrav = calibre / Math.sqrt(port.allongement);
    // Un bouquet allongé se pose LE LONG du rameau, centré sur lui ; un bouquet
    // rond se pose à son bout, là où les feuilles s'assemblent vraiment.
    const surLeRameau = Math.min(1, Math.max(0, (port.allongement - 1) / 1.2));
    const cx = bout.sx - dx * 0.5 * surLeRameau;
    const cy = bout.sy - dy * 0.5 * surLeRameau;
    ctx.save();
    ctx.translate(cx, cy);
    // **Orienté ou pas, jamais à moitié.** Le premier jet multipliait l'ANGLE
    // par le facteur d'allongement, ce qui ne veut rien dire : un rameau à 90°
    // se retrouvait tourné de 81°, un rameau à 10° de 9°, sans rapport avec
    // quoi que ce soit de physique. Les brosses du pin sortaient donc de
    // travers, à peu près verticales quel que soit le rameau qui les portait.
    // Ce qui s'interpole, c'est la FORME — l'allongement — pas la direction :
    // une rosette n'a pas d'axe et n'a donc pas besoin d'être tournée ; dès
    // qu'un bouquet en a un, il suit le rameau, complètement.
    if (port.allongement > 1.15) ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    // **Un contour DÉCHIQUETÉ, pas une ellipse.** Une ellipse est une bulle, et
    // un houppier fait de bulles se lit comme du brocoli — c'est ce que la
    // capture montrait au zoom rapproché. L'amplitude du bord vient maintenant
    // de l'espèce : un chêne est bosselé là où un hêtre est lisse.
    // Plus de sommets sur un bouquet allongé : à même amplitude, un fuseau n'a
    // d'irrégularité visible que sur ses longs côtés, et il en faut assez pour
    // que ce soit une frange et non trois pointes.
    const allonge = port.allongement > 1.2;
    const sommets = allonge ? SOMMETS_TACHE * 2 : SOMMETS_TACHE;
    for (let n = 0; n < sommets; n++) {
      const a = (n / sommets) * Math.PI * 2;
      const jitter =
        1 - port.decoupe / 2 + port.decoupe * hacher(i * 31 + n, classe.palier, 0x22a7);
      // **L'irrégularité est TRANSVERSE sur un bouquet allongé**, et c'est ce
      // qui sépare une brosse d'une étoile. Appliquée aussi au grand axe, elle
      // découpait le fuseau dans sa longueur : les brosses du pin sortaient en
      // feuilles d'érable dentelées — une silhouette de feuillu là où on
      // voulait exactement l'inverse. Des aiguilles sortent DU rameau,
      // perpendiculairement : la frange est sur les flancs, la pointe reste
      // une pointe.
      const px = Math.cos(a) * demiLong * (allonge ? 1 : jitter);
      const py = Math.sin(a) * demiTrav * (allonge ? jitter : 0.82 * jitter);
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
    // Un fourré n'a pas de fût : il est branchu depuis le sol, par définition.
    // Ce n'est pas une valeur inventée faute de mieux — c'est ce que « fourré »
    // veut dire, et le dessin par cellule agrégée ne lit de toute façon pas
    // cette grandeur.
    baseHouppierM: 0,
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
  private aCuire: {
    classe: Classe;
    hauteurM: number;
    houppierRatio: number;
    baseHouppierM: number;
    teteTrogneM?: number;
  }[] = [];

  constructor(
    private readonly fabriquer: (largeur: number, hauteur: number) => HTMLCanvasElement,
  ) {}

  /** Dresse la liste des classes manquantes pour les poses données. */
  public rafraichir(poses: readonly PoseArbre[]): number {
    const vues = new Map<
      string,
      {
        classe: Classe;
        hauteurM: number;
        houppierRatio: number;
        baseHouppierM: number;
        teteTrogneM?: number;
      }
    >();
    for (const p of poses) {
      const cle = cleClasse(p.classe);
      if (this.vignettes.has(cle) || vues.has(cle)) continue;
      vues.set(cle, {
        classe: p.classe,
        hauteurM: p.arbre.heightM,
        baseHouppierM: p.arbre.baseHouppierM,
        houppierRatio: p.arbre.houppierRatio,
        // **En clair, et non par un rappel.** La hauteur de tête voyageait
        // par une fonction `(classe) => hauteur` que la cuisson appelait — et
        // qu'aucun appelant ne fournissait, si bien qu'aucune trogne n'avait
        // de tête. Elle suit maintenant le même chemin que la base de
        // houppier : une grandeur en mètres, portée avec la classe.
        ...(p.arbre.teteTrogneM ? { teteTrogneM: p.arbre.teteTrogneM } : {}),
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
  public cuire(budgetPx = BUDGET_CUISSON_PX): number {
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
          suivant.baseHouppierM,
          suivant.teteTrogneM,
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
