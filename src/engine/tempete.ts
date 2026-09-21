/**
 * Les tempêtes, et le chablis qu'elles couchent (issue #55).
 *
 * Le moteur connaissait le vent comme un agent DESSÉCHANT — il gonfle la
 * demande évaporative (A7), une haie l'abrite (E5), il pousse le feu — et
 * jamais comme un agent CASSANT. Un arbre pouvait mourir de soif à cause du
 * vent ; il ne pouvait pas verser. La seule façon de se retrouver au sol était
 * le joueur qui abat, ou une chandelle déjà morte qui finit par tomber.
 *
 * Le symptôme le plus net était lexical : le mot « chablis » est partout dans
 * le vocabulaire du moteur et n'y désigne jamais une tempête — `DECOTE_CHABLIS`
 * est la décote d'un bois BRÛLÉ, `CHABLIS_RECUPERABLE_SEMAINES` le délai de
 * récupération d'un arbre tué par le FEU. Et `marche.ts` explique longuement
 * l'effondrement des prix après Lothar et Klaus : le moteur enseignait la
 * conséquence d'un événement qu'il ne savait pas produire.
 *
 * ## Une rafale, pas un vent moyen
 *
 * La casse mécanique ne se joue pas sur la moyenne hebdomadaire — c'est
 * structurellement la mauvaise grandeur. Elle se joue sur la RAFALE, le pic de
 * quelques secondes. Ce fichier tire donc, pour chaque semaine, un maximum de
 * rafale dont la moyenne du vent fixe le pied et dont une queue exponentielle
 * fait le sommet.
 *
 * Deux conséquences TOMBENT de ce choix, sans qu'on ait eu à les écrire :
 *
 *  - **les tempêtes sont hivernales**, parce que la vitesse moyenne du vent
 *    l'est déjà (`meteo.ts` : maximum en janvier, minimum fin juillet). Une
 *    rafale de 40 m/s demande un tirage sur mille en janvier et un sur un
 *    million en juillet ;
 *  - **un caduc nu paie moins qu'un résineux**, parce que la prise au vent se
 *    lit sur la part foliaire (`phenologie.ts`) et que les tempêtes atlantiques
 *    arrivent quand les feuillus sont dénudés.
 *
 * ## Aucun tirage dans le flux principal
 *
 * Ni la rafale ni le renversement ne puisent dans le flux séquentiel : la
 * première dérive de la graine de partie et de la semaine (comme l'indice du
 * marché, `marche.ts`), le second de l'identité de l'arbre et de la semaine
 * (comme la direction de chute, `boisMort.ts`). L'issue prévoyait le contraire
 * et portait le label `flux-aléatoire` ; il n'a pas eu lieu d'être. Aucune
 * partie sans tempête ne change d'un cheveu.
 *
 * ## Ce que ce lot ne fait pas
 *
 *  - **La fragilité d'après-éclaircie et de lisière** : un peuplement qu'on
 *    vient d'ouvrir reste vulnérable plusieurs années, le temps que les arbres
 *    restants épaississent. Il y faudrait une mémoire par arbre de l'ouverture
 *    récente, que le moteur n'a pas.
 *  - **L'amplification climatique.** L'issue a raison : la fréquence des
 *    tempêtes est le bon endroit où brancher `AMPLIFICATION_EXTREMES`, et le
 *    vent moyen le mauvais. Mais `tick` ne connaît pas le scénario — la météo
 *    lui arrive déjà dérivée par `meteoDerivee`, qui ne connaît pas la graine de
 *    partie et ne peut donc pas tirer de rafale. Les deux moitiés du mécanisme
 *    sont dans deux fonctions qui ne se voient pas ; les réunir est un lot.
 *  - **Le bois couché ne brûle pas pendant son année de récupération.** Un
 *    chablis n'entre dans le pool de bois au sol qu'à la fin du délai, et
 *    `feu.ts` ignore un arbre mort tant qu'il n'a pas de `mortSemaine` : douze
 *    mois de troncs par terre sont donc invisibles au feu. C'est déjà vrai des
 *    arbres tués par le feu lui-même, et le corriger touche `feu.ts` plus que
 *    ce fichier.
 *  - **Le tri par l'élancement est faible**, et pour une raison mesurée
 *    ailleurs : le moteur ne produit que des H/D de 35 à 49, quand la
 *    sylviculture en mesure de 25 à 100. Deux causes ont été éliminées par la
 *    mesure (#65, #79) ; celle qui reste est l'étiolement — une tige à l'ombre
 *    stagne au lieu de filer (#97).
 */

import { rngFloat, rngStateFromSeed } from "./rng";
import type { TreeState } from "./trees";

/**
 * Rapport entre la rafale maximale d'une semaine et la vitesse MOYENNE du vent
 * de cette semaine, hors tempête.
 *
 * Le facteur de rafale usuel — pointe de trois secondes sur moyenne de dix
 * minutes — vaut 1,4 à 1,6 en terrain dégagé. Ici la moyenne est HEBDOMADAIRE,
 * ce qui est bien plus lisse qu'une moyenne de dix minutes : le rapport au
 * maximum de la semaine est donc plus grand *(à calibrer)*.
 */
export const FACTEUR_RAFALE = 2.5;

/**
 * Échelle de la queue exponentielle des rafales, en part du pied.
 *
 * C'est elle qui décide de la période de retour des tempêtes, et elle est calée
 * sur ce que Météo-France donne des rafales extrêmes de plaine : une
 * CINQUANTENNALE autour de 40-45 m/s (145-160 km/h), soit la classe de Klaus
 * dans les Landes et de Lothar sur le Bassin parisien.
 *
 * Ce que la valeur ci-dessous produit, mesuré sur vingt mille ans de tirage :
 * 28 m/s tous les 1,6 ans, 36 m/s tous les dix ans, 40 m/s tous les vingt-cinq
 * ans, 45 m/s tous les quatre-vingts. Les coups de vent ordinaires reviennent
 * donc chaque hiver et ne couchent rien — c'est voulu : le seuil de dégât est
 * celui de l'ARBRE, pas celui de la rafale *(à calibrer : la cinquantennale est
 * un fait, la loi qui l'entoure est une convention)*.
 */
export const ECHELLE_TEMPETE = 0.35;

/**
 * Rafale maximale physiquement admise, m/s.
 *
 * Une queue exponentielle n'a pas de borne : sur vingt mille ans de tirage elle
 * produisait 87 m/s, soit 313 km/h, ce qu'aucune station de plaine française n'a
 * jamais relevé. On la coupe à 55 m/s (198 km/h), l'ordre de grandeur des
 * records de plaine et de côte — les 216 km/h de la pointe du Raz sont d'un
 * autre monde, celui des caps exposés *(à confirmer sur les annales de
 * Météo-France)*.
 */
export const RAFALE_MAXIMALE_MS = 55;

/**
 * Rafale maximale de la semaine, m/s, à la hauteur de référence de 10 m.
 *
 * Dérivée de la graine de partie et de la semaine ABSOLUE : deux parties
 * identiques voient les mêmes tempêtes, et aucune ne puise dans le flux
 * principal (`marche.ts` pour le même procédé).
 */
export function rafaleDeLaSemaine(
  grainePartie: number,
  semaineAbsolue: number,
  ventMoyMs: number,
  facteurClimat = 1,
): number {
  const graine = (grainePartie * 2246822519 + semaineAbsolue * 3266489917 + 374761393) >>> 0;
  const u = rngFloat(rngStateFromSeed(graine)).value;
  const pied = Math.max(0, ventMoyMs) * FACTEUR_RAFALE;
  // La queue : -ln(1-u) est une exponentielle standard. À u proche de 1 elle
  // s'envole, ce qui est exactement ce qu'on veut d'une tempête.
  //
  // `facteurClimat` est la moitié manquante de F19 : la trajectoire climatique
  // arrive jusqu'ici, alors que le scénario ne parvenait pas au tick. Il vaut 1
  // aujourd'hui et le restera tant que le CHIFFRE manquera (`climat.ts`,
  // `AMPLIFICATION_RAFALE`) — mais la plomberie, elle, ne manque plus. Il
  // multiplie le PIED de la loi et non son sommet : un climat plus venteux
  // décale toute la distribution, il ne rallonge pas seulement sa queue.
  const tire = pied * (1 + ECHELLE_TEMPETE * -Math.log(1 - u));
  return Math.min(RAFALE_MAXIMALE_MS, tire * Math.max(0, facteurClimat));
}

/**
 * Rafale au-dessous de laquelle on ne regarde même pas les arbres, m/s.
 *
 * 25 m/s (90 km/h) : en dessous, aucun arbre du moteur n'atteint sa vitesse
 * critique, et parcourir le peuplement coûterait du temps pour rien. Ce n'est
 * pas un seuil de dégât — c'est un filtre de calcul, et il doit rester SOUS le
 * plus fragile des cas possibles.
 */
export const RAFALE_MINIMALE_MS = 25;

/**
 * Longueur de rugosité du couvert, m : ce que vaut `z₀` dans le profil
 * logarithmique du vent. 0,1 m est l'ordre de grandeur d'une prairie rase ou
 * d'une lande basse ; un couvert forestier serait dix fois plus rugueux, et ce
 * fichier ne le distingue pas *(à calibrer)*.
 */
export const RUGOSITE_M = 0.1;
/** Hauteur de référence des mesures de vent, m (convention météorologique). */
export const HAUTEUR_ANEMOMETRE_M = 10;

/**
 * Part de la rafale de référence qu'un houppier reçoit à sa hauteur : le profil
 * logarithmique du vent, la loi de base de la couche limite.
 *
 * Un semis de cinquante centimètres en reçoit le tiers, un fût de vingt mètres
 * un sixième de plus que l'anémomètre. C'est ce qui fait qu'une tempête couche
 * les grands et épargne le sous-étage, sans qu'on ait à l'écrire.
 */
export function partDeRafaleAHauteur(hauteurM: number): number {
  const z = Math.max(RUGOSITE_M * 2, hauteurM);
  return Math.log(z / RUGOSITE_M) / Math.log(HAUTEUR_ANEMOMETRE_M / RUGOSITE_M);
}

/**
 * Vitesse critique d'un arbre bien ancré, trapu et dénudé, m/s.
 *
 * Les modèles de risque de chablis (famille ForestGALES) donnent des vitesses
 * critiques de 15 à 45 m/s selon l'essence, le sol et la conduite. Cette borne
 * haute est celle d'un cas favorable ; tous les facteurs ci-dessous la rabotent
 * *(à calibrer)*.
 */
export const VITESSE_CRITIQUE_BASE_MS = 46;

/** H/D en dessous duquel l'élancement ne coûte plus rien : un arbre de plein vent. */
export const ELANCEMENT_STABLE = 40;
/** H/D au-delà duquel une perche est réputée instable en sylviculture. */
export const ELANCEMENT_CRITIQUE = 100;
/** Ce que l'élancement critique retire de la vitesse critique, en part. */
export const PERTE_ELANCEMENT = 0.55;

/**
 * Ce que l'élancement laisse de la résistance ∈ [0,45 ; 1].
 *
 * Le rapport hauteur/diamètre est L'indicateur du risque de chablis en
 * sylviculture française : au-delà de 80 on parle de peuplement instable, en
 * dessous de 50 de peuplement ferme. La rampe est écrite sur cette gamme.
 *
 * **`ELANCEMENT_CRITIQUE` est INATTEIGNABLE, et ce n'est pas la faute de ce
 * fichier.** L'allocation d'ombre de `trees.ts` plafonne H/D à 80 : la moitié
 * haute de cette rampe est donc du code mort, et en pratique le facteur ne
 * descend jamais sous 0,92 puisque les peuplements ne produisent que 35 à 49.
 *
 * #79 a essayé d'ouvrir la fenêtre en descendant cette allocation, et la mesure
 * l'a refusé : des tiges plus fines résistent moins au FEU, l'incendie leur
 * vole les victimes que `climat.test.ts` compte pour montrer que le
 * réchauffement tue, et une conclusion climatique se renversait pour quatre
 * points d'amplitude. Le compte rendu est sur `ALLOCATION_DIAMETRE_OMBRE`.
 *
 * Ce qui ouvrira cette rampe est ailleurs : une tige à l'ombre doit FILER au
 * lieu de stagner (#97). Le cadran est écrit sur la bonne gamme ; c'est
 * l'aiguille qui n'y arrive pas.
 */
export function facteurElancement(hauteurM: number, diametreCm: number): number {
  if (diametreCm <= 0) return 1;
  const hd = (hauteurM * 100) / diametreCm;
  const part = (hd - ELANCEMENT_STABLE) / (ELANCEMENT_CRITIQUE - ELANCEMENT_STABLE);
  return 1 - PERTE_ELANCEMENT * Math.min(1, Math.max(0, part));
}

/**
 * Rapport profondeur d'ancrage / hauteur au-delà duquel un arbre tient tout ce
 * qu'il peut tenir.
 *
 * C'est un rapport, et pas une profondeur, parce que le renversement est une
 * affaire de MOMENTS : le vent pousse sur la cime avec un bras de levier qui
 * est la hauteur, la motte résiste avec un bras qui est sa profondeur. Une
 * profondeur absolue dirait qu'un semis de deux mètres à trente centimètres de
 * racines est mal ancré, ce qui est faux — il l'est très bien pour sa taille,
 * et c'est mesurable : au premier jet, une profondeur absolue couchait des
 * semis et épargnait les dominants, soit l'exact inverse d'une tempête.
 *
 * SIX POUR CENT, ET C'EST UN RETOUR, PAS UNE NOUVEAUTÉ. Le premier jet demandait
 * six, calé sur de vraies hêtraies et aulnaies de quarante ans (0,054 à 0,073).
 * Il a été abandonné pour quatre, parce que le même hêtre poussé quatre-vingt-dix
 * ans sur un site jamais sec ne tenait que 0,019 à 0,035 : toute une population
 * légitime se retrouvait au fond du barème et la tempête couchait seize hêtres
 * sur soixante-quatre en cinq ans.
 *
 * Ce n'était pas la plasticité racinaire qui déraillait, c'était son PLANCHER —
 * ce fichier le disait déjà en renvoyant à #84, « le vrai sujet est ailleurs ».
 * Le plancher est corrigé, il croît avec la maturité, et le hêtre jamais assoiffé
 * tient maintenant 0,039 (79 cm à 20,5 m) contre 0,059 pour l'assoiffé (96 cm à
 * 16,4 m). Les deux régimes se tiennent dans un rapport de 1,5 au lieu de 2,7,
 * et six pour cent redevient ce qu'il était : la valeur mesurée.
 *
 * FORESTGALES RECOUPE, et c'est ce qui achève de la fonder. Les modèles de cette
 * famille classent un sol SUPERFICIEL à 80 cm ou moins. Pour un arbre de vingt
 * mètres, 80 cm valent précisément un ratio de 0,04 — donc l'ancien seuil
 * déclarait « complètement ancré » ce que la littérature appelle superficiel.
 * À 0,06, l'ancrage complet demande 120 cm au même arbre, soit la classe
 * profonde, et le sol superficiel conserve 0,93 de sa résistance.
 */
export const ANCRAGE_SUFFISANT_RATIO = 0.06;
/**
 * Ce qui reste de résistance à un arbre à peine ancré, en part.
 *
 * Un cinquième, et pas deux : les modèles de la famille ForestGALES traitent
 * l'enracinement en CLASSES (superficiel, moyen, profond) dont les
 * multiplicateurs sur le moment de renversement se tiennent dans un rapport de
 * l'ordre de 0,8 à 1, pas de 0,6 à 1. Le premier jet en faisait le terme
 * dominant de la vitesse critique, devant l'élancement et la prise au vent.
 *
 * Cette valeur-ci n'a pas bougé avec #84, et c'est voulu : elle dit l'AMPLITUDE
 * de l'effet d'ancrage, que la correction des racines ne remet pas en cause.
 * C'est le SEUIL au-dessus qui était faussé, pas l'écart entre bien et mal
 * ancré *(à confirmer sur les tables d'enracinement de ForestGALES)*.
 */
export const ANCRAGE_MINIMAL = 0.8;

/**
 * Ce que l'ancrage laisse de la résistance ∈ [0,8 ; 1].
 *
 * Aucun trait nouveau, et pas même une lecture de fiche : c'est
 * `TreeState.rootDepthCm`, la profondeur que CET arbre-là a réellement
 * explorée. Elle porte déjà tout ce qu'il faut — l'espèce (un pivot vise plus
 * bas qu'un traçant), la taille du sujet, et ce que le sol laisse pénétrer.
 *
 * Elle porte aussi quelque chose qu'on n'aurait pas pensé à écrire : la
 * PLASTICITÉ. Un arbre qui n'a jamais eu soif garde un chevelu superficiel
 * (`nouvelleProfondeurRacines`, trees.ts) — il est donc plus facile à
 * déraciner. « Les hivers doux et humides font des arbres qui versent » n'est
 * écrit nulle part : ça tombe de deux mécanismes qui ne se connaissaient pas.
 */
export function facteurAncrage(profondeurEffectiveCm: number, hauteurM: number): number {
  if (hauteurM <= 0) return 1;
  const ratio = profondeurEffectiveCm / (100 * hauteurM);
  const part = Math.min(1, Math.max(0, ratio / ANCRAGE_SUFFISANT_RATIO));
  return ANCRAGE_MINIMAL + (1 - ANCRAGE_MINIMAL) * part;
}

/** Ce qu'un sol saturé AU-DELÀ DE CE QUE L'ESPÈCE SUPPORTE retire à la tenue. */
export const PERTE_ENGORGEMENT = 0.45;

/**
 * Ce que l'état du sol laisse de la résistance ∈ [0,55 ; 1].
 *
 * C'est LE facteur des grandes tempêtes, et il était déjà dans l'état du
 * moteur : les dégâts de Lothar et de Klaus se sont concentrés là où le sol
 * était gorgé d'eau, parce qu'un sol saturé lâche les racines. Les tempêtes
 * atlantiques arrivent après des semaines de pluie, ce qui n'est pas une
 * coïncidence — et le moteur le produit tout seul, sans qu'on ait à corréler
 * quoi que ce soit : `waterlogging` monte en hiver, la rafale aussi.
 *
 * Ce qui compte est l'engorgement AU-DELÀ de ce que l'espèce supporte, et la
 * forme est celle que `trees.ts:waterloggingFactor` utilise déjà pour la
 * croissance. Sans ce correctif, l'aulnaie d'un fond de vallée — une espèce à
 * `toleranceEngorgement` de 1, chez elle dans l'eau — se faisait coucher tous
 * les deux ans : mesuré. Un arbre qui vit là a des racines faites pour ce
 * sol-là ; c'est le hêtre égaré dans le bas-fond qui verse.
 */
export function facteurSolGorge(engorgement: number, toleranceEngorgement: number): number {
  const tol = Math.min(1, Math.max(0, toleranceEngorgement));
  if (tol >= 1) return 1;
  const exces = Math.max(0, Math.min(1, engorgement) - tol) / (1 - tol);
  return 1 - PERTE_ENGORGEMENT * exces;
}

/** Ce qu'un houppier en pleine feuille retire à la résistance, en part. */
export const PERTE_PRISE_AU_VENT = 0.35;

/**
 * Ce que la prise au vent laisse de la résistance ∈ [0,65 ; 1].
 *
 * La part foliaire OMBRAGEANTE est la bonne grandeur : c'est celle qui
 * intercepte, feuilles mortes des marcescents comprises (`phenologie.ts`), et
 * une feuille morte accrochée prend le vent aussi bien qu'une verte. De là
 * sort, sans qu'on l'écrive, le fait de terrain le plus massif des tempêtes
 * françaises : en décembre le chêne est nu et l'épicéa non.
 */
export function facteurPriseAuVent(partFoliaire: number): number {
  return 1 - PERTE_PRISE_AU_VENT * Math.min(1, Math.max(0, partFoliaire));
}

/**
 * Où le fût casse, en part de la hauteur, quand l'arbre n'a pas de houppier
 * dégagé.
 *
 * Un volis casse là où le moment appliqué l'emporte sur ce que la section peut
 * tenir, c'est-à-dire À LA BASE DU HOUPPIER : au-dessus la prise au vent est
 * maximale, au-dessous le tronc s'épaissit vite. Le moteur connaît cette
 * hauteur (`TreeState.baseHouppierM`) — mais elle vaut zéro sur un arbre resté
 * branchu, et casser au ras du sol ne serait plus un volis, ce serait un
 * recépage. D'où ce plancher *(à calibrer)*.
 */
export const HAUTEUR_VOLIS_MINIMALE_PART = 1 / 3;

/** Hauteur à laquelle le fût de cet arbre-là casse, m. */
export function hauteurDeVolisM(hauteurM: number, baseHouppierM: number): number {
  return Math.max(hauteurM * HAUTEUR_VOLIS_MINIMALE_PART, Math.min(baseHouppierM, hauteurM * 0.8));
}

/** Hauteur en dessous de laquelle une tige plie au lieu de verser, m. */
export const HAUTEUR_SOUPLE_M = 5;
/** Hauteur à partir de laquelle la souplesse ne protège plus du tout, m. */
export const HAUTEUR_RIGIDE_M = 12;

/**
 * Ce que la SOUPLESSE ajoute à la résistance d'une jeune tige ∈ [0,1].
 *
 * Elle vaut 0 sous cinq mètres — la tige se couche et se relève, elle ne
 * s'arrache pas — et 1 au-delà de douze, où l'arbre encaisse en tronc rigide.
 * Ce n'est pas un ajustement de confort : les modèles de risque de chablis ne
 * sont pas définis sous une hauteur dominante d'une dizaine de mètres, et
 * aucune statistique de dégâts ne compte les fourrés. La rampe évite la
 * falaise qu'un seuil sec créerait entre un arbre de 11,9 m et un de 12,1 m
 * *(à calibrer)*.
 */
export function facteurSouplesse(hauteurM: number): number {
  const part = (hauteurM - HAUTEUR_SOUPLE_M) / (HAUTEUR_RIGIDE_M - HAUTEUR_SOUPLE_M);
  return Math.min(1, Math.max(0, part));
}

/** Ce que voit un arbre au moment du coup de vent. */
export interface ExpositionAuVent {
  /** rafale de référence de la semaine, m/s (à 10 m) */
  rafaleMs: number;
  /** exposition de la station ∈ [0,1] */
  ventExposition: number;
  /** abri apporté par les voisins ∈ [0,1] (`light.ts:windShelterAt`) */
  abriVent: number;
  /** engorgement de l'horizon de surface ∈ [0,1] */
  engorgement: number;
  /** ce que l'espèce tolère d'engorgement ∈ [0,1] (`especes.ts:eau`) */
  toleranceEngorgement: number;
  /** part foliaire ombrageante de l'arbre cette semaine ∈ [0,1] */
  partFoliaire: number;
  /** profondeur réellement explorée par les racines, cm (`TreeState.rootDepthCm`) */
  profondeurEffectiveCm: number;
}

/** Ce que l'abri des voisins peut retirer, au plus, à la rafale reçue. */
export const ABRI_MAX = 0.5;

/**
 * Portée de l'abri, en multiples de la hauteur qui DÉPASSE. Même ordre que
 * l'abri de haie (`light.ts:windShelterAt`) : ce qui protège protège loin.
 */
export const PORTEE_ABRI = 12;
/** Force de l'abri par mètre de dépassement et par mètre de distance. */
export const FORCE_ABRI = 0.12;

/**
 * Abri qu'un arbre reçoit de ses voisins AU NIVEAU DE SA CIME ∈ [0,1].
 *
 * Pourquoi ne pas réutiliser `windShelterAt` (light.ts), qui existe déjà et
 * calcule un abri : parce qu'il répond à une autre question. Il a été écrit
 * pour la haie brise-vent (E5) — de quoi un JEUNE PLANT est-il protégé, près du
 * sol — et il compte tout voisin d'une certaine taille, où qu'il soit par
 * rapport au sujet. Dans un peuplement, il sature donc à 1 pour tout le monde :
 * chacun s'abrite de ses semblables, et plus rien ne verse. Mesuré, et c'est
 * ce qui a fait tomber zéro arbre en soixante ans au premier jet.
 *
 * Ce qui abrite une CIME, c'est ce qui la dépasse. La somme ne compte donc que
 * le DÉPASSEMENT des voisins plus hauts, d'où trois comportements qui sont ceux
 * du terrain, et qu'on n'a pas eu à écrire :
 *
 *  - une futaie régulière ne s'abrite pas elle-même — tout le monde est au
 *    même niveau, personne ne dépasse, tout le monde prend la rafale. C'est
 *    Klaus dans les pins landais alignés ;
 *  - un sous-étage est protégé par sa canopée, et ne verse pas ;
 *  - un arbre isolé ou un dominant qui émerge prend tout.
 */
export function abriAuVent(
  arbres: readonly TreeState[],
  arbre: Pick<TreeState, "id" | "x" | "y" | "heightM">,
): number {
  let abri = 0;
  // Le voisinage qui compte pour l'abri de PEUPLEMENT : un rayon de deux
  // hauteurs, et seulement les tiges d'une taille comparable (cf. plus bas).
  const rayonPeuplement = RAYON_PEUPLEMENT * Math.max(0.5, arbre.heightM);
  let pairs = 0;
  for (const voisin of arbres) {
    if (!voisin.alive || voisin.id === arbre.id) continue;
    const dx = voisin.x - arbre.x;
    const dy = voisin.y - arbre.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= rayonPeuplement && voisin.heightM >= PART_HAUTEUR_PAIR * arbre.heightM) pairs++;
    const exces = voisin.heightM - arbre.heightM;
    if (exces <= 0) continue;
    if (d > PORTEE_ABRI * exces) continue;
    abri += (FORCE_ABRI * exces) / Math.max(1.5, d);
  }
  return Math.min(
    1,
    abri + abriDuPeuplement(espacementSurHauteur(pairs, rayonPeuplement, arbre.heightM)),
  );
}

/**
 * Rayon du voisinage qui fait peuplement, en hauteurs d'arbre.
 *
 * Deux hauteurs : c'est l'ordre de grandeur sur lequel une canopée fait
 * rugosité pour l'un de ses membres. Au-delà, ce qui pousse ne partage plus la
 * même quantité de mouvement que lui *(à calibrer)*.
 */
export const RAYON_PEUPLEMENT = 2;

/**
 * Part de la hauteur du sujet au-dessous de laquelle un voisin ne fait plus
 * peuplement avec lui.
 *
 * **Sans ce filtre, la régénération abriterait la futaie**, ce qui est
 * exactement faux : un dominant entouré de semis est un arbre isolé. Sept
 * dixièmes, parce qu'un étage dominé de cette hauteur-là partage encore la
 * canopée *(à calibrer)*.
 */
export const PART_HAUTEUR_PAIR = 0.7;

/**
 * Espacement moyen entre tiges comparables, rapporté à la hauteur : le fameux
 * S/H des modèles de risque de chablis.
 *
 * On le déduit du COMPTE de voisins dans un disque, ce qui suppose qu'ils y
 * sont répartis à peu près régulièrement — c'est l'hypothèse que fait aussi la
 * sylviculture quand elle publie un espacement moyen *(à confirmer sur un
 * peuplement volontairement agrégé)*.
 */
export function espacementSurHauteur(pairs: number, rayonM: number, hauteurM: number): number {
  if (hauteurM <= 0) return Number.POSITIVE_INFINITY;
  // Aucun pair : l'arbre est seul, donc de plein vent.
  if (pairs <= 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt((Math.PI * rayonM * rayonM) / pairs) / hauteurM;
}

/**
 * S/H au-delà duquel un arbre est de plein vent : plus aucun abri de peuplement.
 *
 * Un demi : au-delà d'un espacement égal à la moitié de la hauteur, les
 * houppiers ne se touchent plus et chaque tige prend le vent pour elle seule.
 * C'est le haut de la gamme sur laquelle les modèles de la famille
 * ForestGALES font jouer le rapport espacement/hauteur *(à calibrer)*.
 */
export const ESPACEMENT_PLEIN_VENT = 0.5;

/**
 * Ce qu'un abri de PEUPLEMENT retire, au plus, à la rafale reçue.
 *
 * **Il est volontairement plus faible que l'abri de surcime, et c'est un
 * garde-fou historique.** Le premier jet de ce module avait réutilisé
 * `windShelterAt`, qui saturait à 1 pour tout le monde dans n'importe quel
 * peuplement : plus rien ne versait, zéro arbre couché en soixante ans. Un
 * terme collectif mal borné refait exactement cette faute. Un tiers laisse donc
 * une futaie serrée nettement plus sûre qu'une parcelle ouverte, sans jamais la
 * rendre invulnérable — et un essai l'exige *(à calibrer)*.
 */
export const ABRI_PEUPLEMENT_MAX = 1 / 3;

/**
 * ABRI QUE LA FUTAIE DONNE À CHACUN DE SES MEMBRES ∈ [0 ; ABRI_PEUPLEMENT_MAX].
 *
 * Ce que `abriAuVent` ne savait pas dire, et qui bloquait F18 (#179). Il ne
 * comptait que les voisins QUI DÉPASSENT, si bien qu'une futaie régulière
 * n'abritait personne : les seuls arbres à avoir de l'abri à perdre étaient les
 * dominés, et les dominés sont trop courts pour verser. Aucune ouverture ne
 * pouvait donc faire verser quoi que ce soit de plus.
 *
 * Les modèles de la famille ForestGALES ne raisonnent pas en « qui dépasse
 * qui » mais sur le rapport de l'ESPACEMENT à la HAUTEUR : plus les tiges sont
 * serrées, plus la quantité de mouvement se partage, et plus le moment appliqué
 * à chacune est faible. C'est ce rapport-là qu'on lit.
 *
 * Trois choses tombent de cette forme, et aucune n'est écrite :
 *
 *  - **un dominant de futaie fermée est abrité**, ce qui était le trou ;
 *  - **un arbre de lisière l'est moins** qu'un arbre d'intérieur — il a moins
 *    de voisins, donc un espacement local plus grand. La distance à la lisière
 *    n'a pas à être calculée, elle se lit dans le comptage ;
 *  - **une éclaircie découvre les DOMINANTS**, ceux qui versent, et c'est ce
 *    que la mémoire d'abri (#177) attendait pour mordre.
 */
export function abriDuPeuplement(espacementSurHauteurLocal: number): number {
  if (!Number.isFinite(espacementSurHauteurLocal)) return 0;
  const part = 1 - espacementSurHauteurLocal / ESPACEMENT_PLEIN_VENT;
  return ABRI_PEUPLEMENT_MAX * Math.min(1, Math.max(0, part));
}

/**
 * En combien d'années un arbre s'habitue à un nouveau régime de vent.
 *
 * L'épaississement du tronc et de l'ancrage sous la contrainte mécanique — la
 * thigmomorphogenèse — est un fait mesuré, et il se compte en années. La
 * sylviculture en tire sa règle de terrain : un peuplement fraîchement
 * éclairci est à risque pendant quelques années, et c'est pour ça qu'on
 * n'éclaircit ni tard ni fort *(à calibrer : l'ordre de grandeur de la période
 * critique est documenté, la forme de la décroissance ne l'est pas)*.
 */
export const MEMOIRE_ABRI_ANS = 5;

/**
 * Nouvelle mémoire d'abri après une année passée sous `abriActuel`.
 *
 * Un lissage exponentiel, mis à jour une fois l'an et non chaque semaine — et
 * c'est un choix de COÛT, à dire : `abriAuVent` parcourt le peuplement pour
 * chaque arbre, donc un n² ; le faire cinquante-deux fois par an pour une
 * constante de temps de cinq ans serait payer très cher une précision qui ne
 * change rien.
 */
export function memoireDAbri(abriHabituel: number, abriActuel: number): number {
  const a = 1 / MEMOIRE_ABRI_ANS;
  return abriHabituel + a * (abriActuel - abriHabituel);
}

/**
 * NAÏVETÉ AU VENT ∈ [0,1] : de combien l'abri a chuté sous celui auquel
 * l'arbre est habitué (critère F18).
 *
 * Une seule soustraction, et elle couvre les trois causes que le critère
 * nomme — l'éclaircie, la lisière neuve, la trouée d'un chablis — sans qu'aucune
 * ne soit écrite. Ce sont toutes des chutes d'abri.
 *
 * Et les deux cas qui ne doivent RIEN donner ne donnent rien : un arbre qui a
 * toujours poussé au large a une mémoire basse, donc aucune naïveté — c'est
 * l'arbre de plein vent, celui qui tient ; et un arbre qu'on vient d'ABRITER
 * (un voisin qui pousse, une haie qui monte) n'est pas naïf non plus, il est
 * simplement mieux protégé, d'où le plancher à zéro.
 */
export function naiveteAuVent(abriHabituel: number | undefined, abriActuel: number): number {
  if (abriHabituel === undefined) return 0;
  return Math.min(1, Math.max(0, abriHabituel - abriActuel));
}

/** Ce qu'une découverte complète retire à la tenue, en part. */
export const PERTE_NAIVETE = 0.25;

/**
 * Ce que la naïveté laisse de résistance ∈ [0,75 ; 1].
 *
 * Elle s'applique aux DEUX ruines, et c'est voulu : ce qui n'a pas suivi est
 * le fût autant que l'ancrage. Un arbre élevé à l'abri est effilé ET mal
 * amarré, et c'est précisément pour ça qu'une éclaircie tardive et forte est
 * la faute que Lothar a fait payer le plus cher.
 */
export function facteurNaivete(naivete: number): number {
  return 1 - PERTE_NAIVETE * Math.min(1, Math.max(0, naivete));
}

/** Rafale que l'arbre reçoit vraiment à la cime, m/s. */
export function rafaleRecue(arbre: TreeState, exposition: ExpositionAuVent): number {
  const abri = 1 - ABRI_MAX * Math.min(1, Math.max(0, exposition.abriVent));
  return (
    exposition.rafaleMs *
    Math.min(1, Math.max(0, exposition.ventExposition)) *
    abri *
    partDeRafaleAHauteur(arbre.heightM)
  );
}

/** Vitesse de rafale à laquelle cet arbre-là verse, m/s. */
export function vitesseCritiqueMs(arbre: TreeState, exposition: ExpositionAuVent): number {
  return (
    (VITESSE_CRITIQUE_BASE_MS / facteurSouplesse(arbre.heightM)) *
    facteurElancement(arbre.heightM, arbre.diametreCm) *
    facteurAncrage(exposition.profondeurEffectiveCm, arbre.heightM) *
    facteurSolGorge(exposition.engorgement, exposition.toleranceEngorgement) *
    facteurPriseAuVent(exposition.partFoliaire) *
    facteurNaivete(naiveteAuVent(arbre.abriHabituel, exposition.abriVent)) *
    facteurCarieAncrage(arbre.pourriture ?? 0)
  );
}

/**
 * Densité de bois de référence, sur laquelle la vitesse de volis est calée.
 * Un feuillu moyen de l'atlas ; les vingt-six fiches vont de 0,28 à 0,90.
 */
export const DENSITE_BOIS_REFERENCE = 0.5;

/** Élancement H/D de l'arbre de référence : une futaie ferme, ni perche ni têtard. */
export const ELANCEMENT_REFERENCE = 50;

/**
 * Vitesse à laquelle le FÛT casse, pour l'arbre de référence en pleine feuille,
 * m/s.
 *
 * L'ancre n'est pas un nombre isolé, c'est un RAPPORT : les modèles de la
 * famille ForestGALES calculent deux vitesses critiques — renversement et
 * rupture — et les publient dans la même bande de 15 à 45 m/s. Aucune des deux
 * ne domine par construction ; ce qui décide est le sol et le bois. La valeur
 * ci-dessous est donc posée pour que l'arbre de référence ait, sur sol ferme et
 * bien ancré, une vitesse de rupture du même ordre que sa vitesse de
 * renversement (27 m/s). Ce qui trie ensuite, c'est tout le reste
 * *(à calibrer : la bande est mesurée, l'égalité au point de référence est une
 * convention)*.
 */
export const VITESSE_CRITIQUE_VOLIS_MS = 42;

/**
 * Ce que la densité du bois laisse de résistance à la rupture.
 *
 * Le module de rupture d'un bois suit sa DENSITÉ — c'est l'une des relations
 * les mieux établies de la science du bois, et elle dispense d'un trait
 * nouveau : `bois.densite` est à l'atlas depuis #68, sourcée espèce par espèce.
 * La racine carrée vient de ce que la vitesse critique varie comme la racine du
 * moment résistant, lequel est proportionnel au module de rupture.
 *
 * Un saule à 0,42 casse donc à 0,92 de la référence, un chêne pubescent à 0,65
 * à 1,14 — et « bois tendre » cesse d'être une intuition pour devenir un
 * chiffre que la fiche porte déjà.
 */
export function facteurDensiteBois(densite: number): number {
  return Math.sqrt(Math.max(0.05, densite) / DENSITE_BOIS_REFERENCE);
}

/**
 * Ce que la GÉOMÉTRIE du fût laisse de résistance à la rupture.
 *
 * C'est ici que le volis se sépare vraiment du renversement, et pas seulement
 * par les facteurs qu'on lui retire. Une motte résiste par un bras de levier
 * qui est sa profondeur ; un fût résiste par son MODULE DE SECTION, qui varie
 * comme le CUBE du diamètre. Le moment appliqué, lui, croît avec la hauteur et
 * la surface du houppier — qu'on suppose homothétique, donc en h².
 *
 * D'où `u ∝ √(d³ / h³)`, soit l'élancement à la puissance −3/2 : la rupture est
 * bien plus sensible à l'élancement que le renversement, qui n'en dépend que
 * par une rampe linéaire. Une perche de H/D 100 casse à un tiers de la vitesse
 * qui casserait un arbre de plein vent *(à calibrer : l'homothétie du houppier
 * est une convention, le moteur sait calculer un rayon de houppier réel)*.
 */
export function facteurGeometrieFut(hauteurM: number, diametreCm: number): number {
  if (diametreCm <= 0 || hauteurM <= 0) return 0;
  const hd = (hauteurM * 100) / diametreCm;
  return (ELANCEMENT_REFERENCE / hd) ** 1.5;
}

/**
 * Vitesse de rafale à laquelle le FÛT de cet arbre-là casse, m/s (critère F17).
 *
 * **Ce qui n'entre PAS dans ce calcul est ce qui fait tout le lot.** Ni
 * `facteurAncrage`, ni `facteurSolGorge` : un fût casse aussi bien sur un sol
 * gelé que sur un sol gorgé, parce que la rupture se joue dans le bois et non
 * dans la terre. De cette absence sort, sans qu'on l'écrive, le fait de terrain
 * que les tempêtes françaises montrent partout :
 *
 *  - **fond de vallon gorgé** → l'ancrage lâche avant le fût, ça DÉRACINE ;
 *  - **sol ferme, tige élancée ou bois tendre** → ça CASSE.
 *
 * La souplesse, en revanche, protège des deux : une tige de trois mètres plie
 * et se relève, elle ne casse pas plus qu'elle ne s'arrache.
 */
export function vitesseCritiqueVolisMs(
  arbre: TreeState,
  densiteBois: number,
  exposition: ExpositionAuVent,
): number {
  return (
    (VITESSE_CRITIQUE_VOLIS_MS / facteurSouplesse(arbre.heightM)) *
    facteurDensiteBois(densiteBois) *
    facteurGeometrieFut(arbre.heightM, arbre.diametreCm) *
    facteurPriseAuVent(exposition.partFoliaire) *
    facteurNaivete(naiveteAuVent(arbre.abriHabituel, exposition.abriVent)) *
    facteurCarie(arbre.pourriture ?? 0)
  );
}

/** Les deux façons dont une tempête ruine un arbre. */
export type ModeDeRuine = "chablis" | "volis";

/**
 * Ce qui cède EN PREMIER : la motte ou le fût.
 *
 * Pas un tirage entre deux modes, pas une part posée à la main — une
 * comparaison. Le mode qui l'emporte est celui dont la vitesse critique est la
 * plus basse, exactement comme ForestGALES tranche entre ses deux calculs.
 */
export function modeDeRuine(
  arbre: TreeState,
  densiteBois: number,
  exposition: ExpositionAuVent,
): ModeDeRuine {
  return vitesseCritiqueVolisMs(arbre, densiteBois, exposition) <
    vitesseCritiqueMs(arbre, exposition)
    ? "volis"
    : "chablis";
}

/**
 * Marge au-delà de la vitesse critique à laquelle un arbre verse à coup sûr.
 *
 * Une tempête ne rase pas un peuplement d'un coup ni ne l'épargne d'un coup :
 * à vitesse critique atteinte, quelques sujets versent ; à 40 % au-dessus, tous.
 * Ce qui décide entre deux arbres identiques tient à ce que le modèle ne voit
 * pas — une racine pourrie, un défaut de tronc, une turbulence *(à calibrer)*.
 */
export const MARGE_RENVERSEMENT = 0.4;

/**
 * Probabilité qu'un arbre soit ruiné ∈ [0,1], quel que soit le mode.
 *
 * C'est la PLUS BASSE des deux vitesses critiques qui décide, parce qu'un arbre
 * cède par son point faible : le fût casse ou la motte lâche, selon ce qui
 * lâche en premier (critère F17). `densiteBois` à `undefined` neutralise le
 * volis — c'est ce que le banc utilise comme témoin.
 */
export function probabiliteRenversement(
  arbre: TreeState,
  exposition: ExpositionAuVent,
  densiteBois?: number,
): number {
  const critique =
    densiteBois === undefined
      ? vitesseCritiqueMs(arbre, exposition)
      : Math.min(
          vitesseCritiqueMs(arbre, exposition),
          vitesseCritiqueVolisMs(arbre, densiteBois, exposition),
        );
  if (critique <= 0) return 1;
  const exces = rafaleRecue(arbre, exposition) / critique - 1;
  return Math.min(1, Math.max(0, exces / MARGE_RENVERSEMENT));
}

/**
 * Part de la vitesse critique à partir de laquelle le vent ARRACHE DES BRANCHES
 * sans ruiner l'arbre (critère F17, le troisième mode).
 *
 * Bien en dessous de la ruine, et c'est tout l'intérêt : la casse partielle est
 * le dégât le plus FRÉQUENT d'une tempête, celui qu'on voit après chaque coup
 * de vent sans que rien ne soit par terre. Six dixièmes de la vitesse critique
 * *(à calibrer : l'existence d'un seuil bien inférieur à la ruine est le fait
 * de terrain, sa valeur est une convention)*.
 */
export const PART_CASSE_BRANCHES = 0.6;

/** Part du houppier qu'un vent juste sous la ruine arrache, au plus. */
export const HOUPPIER_ARRACHE_MAX = 0.4;

/**
 * Part du houppier qu'un coup de vent arrache à un arbre qui TIENT ∈ [0 ; 0,4].
 *
 * Le troisième mode de ruine du critère F17, et le seul qui laisse l'arbre
 * debout : ni motte arrachée, ni fût cassé, mais des branches en moins. C'est
 * une rampe et non un seuil — un vent à peine suffisant casse une branche, un
 * vent proche de la ruine écime.
 *
 * Elle se lit sur le MÊME rapport que la ruine, la rafale reçue sur la vitesse
 * critique, et c'est ce qui la rend cohérente sans rien coûter : tout ce qui
 * fragilise un arbre — son élancement, son ancrage, le sol gorgé, sa prise au
 * vent, l'abri qu'il a perdu — le rend du même coup plus facile à ébrancher.
 */
export function houppierArrache(rafaleRecueMs: number, critiqueMs: number): number {
  if (critiqueMs <= 0) return HOUPPIER_ARRACHE_MAX;
  const part = (rafaleRecueMs / critiqueMs - PART_CASSE_BRANCHES) / (1 - PART_CASSE_BRANCHES);
  return HOUPPIER_ARRACHE_MAX * Math.min(1, Math.max(0, part));
}

/**
 * Part de houppier qu'un arbre reconstitue par semaine.
 *
 * Un arbre ébranché refait des pousses, mais pas en un an : il lui faut
 * quelques saisons pour retrouver sa surface foliaire. Même forme que la
 * récupération d'un dommage hydraulique (`trees.ts`), qui est la mémoire d'une
 * sécheresse — celle-ci est la mémoire d'une tempête *(à calibrer)*.
 */
export const REPOUSSE_HOUPPIER_PAR_SEMAINE = 0.004;

/** Le houppier perdu d'un arbre, une semaine plus tard. */
export function prochainHouppierPerdu(perdu: number, arrache: number): number {
  return Math.min(
    HOUPPIER_ARRACHE_MAX,
    Math.max(0, Math.max(perdu, arrache) - REPOUSSE_HOUPPIER_PAR_SEMAINE),
  );
}

/**
 * Part du rayon qu'une plaie neuve ouvre d'emblée à la carie.
 *
 * Une blessure n'est pas une carie : c'est une PORTE. Ce qui entre est petit,
 * et c'est ensuite que ça travaille *(à calibrer)*.
 */
export const CARIE_INITIALE = 0.05;

/**
 * Progression annuelle d'une colonne de carie installée, en part du rayon, sur
 * un bois de densité de référence.
 *
 * Les colonnes de carie d'un arbre vivant s'étendent de quelques centimètres
 * par an en hauteur et bien plus lentement en rayon. Un pour cent du rayon par
 * an met un siècle à creuser un tronc, ce qui est l'ordre de grandeur d'un
 * vieux chêne creux *(à calibrer)*.
 */
export const PROGRESSION_CARIE_PAR_AN = 0.01;

/**
 * LA CARIE D'UN TRONC, une année plus tard (critère F17, #182).
 *
 * **Elle ne guérit jamais, et c'est ce qui la distingue d'une plaie.** Un
 * houppier arraché repousse ; une colonne de carie ne fait que monter. C'est ce
 * qui rend un vieil arbre plusieurs fois blessé cumulativement fragile, et
 * c'est le fait de terrain.
 *
 * Le bois dense se carie plus lentement — et ce n'est pas un trait nouveau :
 * `dureeChandelleSemaines` (boisMort.ts) fait déjà de la densité la résistance
 * à la décomposition d'un arbre MORT. C'est la même propriété du bois, lue sur
 * un arbre vivant.
 */
export function prochaineCarie(pourriture: number, blesse: boolean, densiteBois: number): number {
  const installee = pourriture > 0 || blesse;
  if (!installee) return 0;
  const depart = Math.max(pourriture, blesse ? CARIE_INITIALE : 0);
  const vitesse = PROGRESSION_CARIE_PAR_AN * (DENSITE_BOIS_REFERENCE / Math.max(0.05, densiteBois));
  return Math.min(1, depart + vitesse);
}

/**
 * Ce que la carie laisse de résistance à la RUPTURE ∈ ]0 ; 1].
 *
 * **Un tronc creux est un TUBE, et c'est tout le lot.** Le module de section
 * d'un tube vaut `d³(1 − p⁴)` où `p` est la part du rayon cariée, et la vitesse
 * critique va comme la racine de ce module. La puissance QUATRE est ce qui
 * produit le fait le plus contre-intuitif de l'arboriculture, celui qu'on n'a
 * pas eu à écrire : **un arbre creux à la moitié de son rayon ne perd que 3 %
 * de sa vitesse critique**, et c'est pour ça qu'un vieux chêne creux tient des
 * siècles.
 *
 * C'est aussi la base de la règle du `t/R` : on ne s'inquiète qu'en dessous
 * d'une paroi saine du tiers du rayon, soit `p > 0,67` — où cette formule
 * donne encore 0,90. Le seuil n'est écrit nulle part ; il tombe de l'exposant.
 */
export function facteurCarie(pourriture: number): number {
  const p = Math.min(1, Math.max(0, pourriture));
  return Math.sqrt(Math.max(0.01, 1 - p ** 4));
}

/**
 * Ce que la carie DU PIED laisse de tenue à l'ancrage ∈ [0,7 ; 1].
 *
 * Plus faible que sur la rupture, et linéaire : une carie de pied pourrit les
 * contreforts et les grosses racines, mais la motte tient encore par le reste
 * du système. C'est le versant « déracinement » d'un champignon de carie comme
 * l'armillaire *(à calibrer)*.
 */
export const PERTE_ANCRAGE_CARIE = 0.3;

export function facteurCarieAncrage(pourriture: number): number {
  return 1 - PERTE_ANCRAGE_CARIE * Math.min(1, Math.max(0, pourriture));
}

/**
 * Graine propre à un renversement : l'identité de l'arbre et la semaine.
 * Même précaution et même forme que `graineDeChute` (`boisMort.ts`) — le flux
 * principal ne bouge pas, et la partie reste rejouable à l'identique.
 */
export function graineDeChablis(idArbre: number, semaine: number): number {
  return (idArbre * 2654435761 + semaine * 40503 + 0x9e3779b9) >>> 0;
}

/** Cet arbre-là est-il ruiné cette semaine-là ? */
export function verse(
  arbre: TreeState,
  exposition: ExpositionAuVent,
  semaine: number,
  densiteBois?: number,
): boolean {
  const p = probabiliteRenversement(arbre, exposition, densiteBois);
  if (p <= 0) return false;
  return rngFloat(rngStateFromSeed(graineDeChablis(arbre.id, semaine))).value < p;
}

/**
 * Un arbre est-il candidat au chablis, avant même de regarder le vent ?
 *
 * En dessous de `HAUTEUR_SOUPLE_M` la tige plie : sa vitesse critique est
 * infinie, et le test évite de la calculer sur toute une régénération.
 */
export function candidatAuChablis(arbre: TreeState): boolean {
  return arbre.alive && arbre.heightM > HAUTEUR_SOUPLE_M;
}
