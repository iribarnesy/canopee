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
): number {
  const graine = (grainePartie * 2246822519 + semaineAbsolue * 3266489917 + 374761393) >>> 0;
  const u = rngFloat(rngStateFromSeed(graine)).value;
  const pied = Math.max(0, ventMoyMs) * FACTEUR_RAFALE;
  // La queue : -ln(1-u) est une exponentielle standard. À u proche de 1 elle
  // s'envole, ce qui est exactement ce qu'on veut d'une tempête.
  return Math.min(RAFALE_MAXIMALE_MS, pied * (1 + ECHELLE_TEMPETE * -Math.log(1 - u)));
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
  for (const voisin of arbres) {
    if (!voisin.alive || voisin.id === arbre.id) continue;
    const exces = voisin.heightM - arbre.heightM;
    if (exces <= 0) continue;
    const dx = voisin.x - arbre.x;
    const dy = voisin.y - arbre.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > PORTEE_ABRI * exces) continue;
    abri += (FORCE_ABRI * exces) / Math.max(1.5, d);
  }
  return Math.min(1, abri);
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
    facteurPriseAuVent(exposition.partFoliaire)
  );
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

/** Probabilité qu'un arbre verse ∈ [0,1]. */
export function probabiliteRenversement(arbre: TreeState, exposition: ExpositionAuVent): number {
  const critique = vitesseCritiqueMs(arbre, exposition);
  if (critique <= 0) return 1;
  const exces = rafaleRecue(arbre, exposition) / critique - 1;
  return Math.min(1, Math.max(0, exces / MARGE_RENVERSEMENT));
}

/**
 * Graine propre à un renversement : l'identité de l'arbre et la semaine.
 * Même précaution et même forme que `graineDeChute` (`boisMort.ts`) — le flux
 * principal ne bouge pas, et la partie reste rejouable à l'identique.
 */
export function graineDeChablis(idArbre: number, semaine: number): number {
  return (idArbre * 2654435761 + semaine * 40503 + 0x9e3779b9) >>> 0;
}

/** Cet arbre-là verse-t-il cette semaine-là ? */
export function verse(arbre: TreeState, exposition: ExpositionAuVent, semaine: number): boolean {
  const p = probabiliteRenversement(arbre, exposition);
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
