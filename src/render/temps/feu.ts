/**
 * Le FRONT D'INCENDIE : une ligne de flammes qui court, puis de la cendre
 * (docs/interface-visuelle.md §6.4).
 *
 * **Le moteur a tout préparé pour ça, et il l'a écrit noir sur blanc.** Le
 * commentaire de `rangsDuFront` dans `feu.ts` dit : « c'est ce qui permet de
 * faire COURIR une ligne de flammes au lieu de noircir un patch d'un coup ».
 * `IncendieResult` porte donc l'origine, les cellules brûlées, et le RANG
 * d'arrivée du front sur chacune — sa distance à l'origine à travers ce qui a
 * brûlé. Le rendu n'a aucune propagation à refaire : il lit un rang et le
 * compare à l'avancement de l'acte.
 *
 * **Et il n'a presque aucune machinerie à ajouter, ce qui est le signe que le
 * découpage précédent était bon.** Un front est un ensemble de cellules
 * teintées, animées à la POSE — exactement ce que le voile des gestes de zone
 * dessine déjà (`voile.ts`, `couches/voile.ts`). Les deux rendent des
 * `CelluleVoilee` et passent par la même couche de losanges. Une flamme au sol
 * et un nuage de chaux ne sont pas la même chose, mais ils se DESSINENT de la
 * même façon, et il n'y avait pas de raison d'en écrire deux fois.
 *
 * Ce qui ne passe pas par ici, et c'est délibéré :
 *
 *  - **le torchage d'un arbre** — la couronne qui s'embrase et la chandelle
 *    noire qui reste. La classe de vignette porte déjà `brulee`, et la mort de
 *    cause `feu` la met en place dès le premier instant (`mort.ts`). C'est de
 *    la CUISSON, pas de la pose ;
 *  - **les rejets de souche au printemps suivant** : ils arriveront comme des
 *    recrues dans un instantané ultérieur, et le calque des changements les
 *    pointera sans rien de plus.
 *
 * **La fumée, les flammes et les braises sont arrivées ensuite, et elles ne
 * changent rien à ce partage** : ce sont des PARTICULES, c'est-à-dire des
 * images à poser dans le monde à une hauteur donnée, et leur position est une
 * fonction PURE de (ce que le moteur a brûlé, l'avancement de l'acte, l'horloge
 * de l'ellipse). Rien ne s'accumule d'une image à l'autre — pas de tableau de
 * particules vivantes, pas d'intégration, pas d'état. C'est ce qui rend une
 * capture figée (`?ellipse=0.7`) reproductible au pixel, et c'est aussi ce qui
 * permet de tester un panache sans navigateur.
 *
 * Module **pur** : des cellules, des teintes et des positions, aucun sprite.
 */

import type { Teinte } from "../palette";
import { type ArbreVivant, dansLaFenetre, type EtatMourant, PALIERS_DE_MORT } from "./mort";
import type { CelluleVoilee } from "./voile";

/**
 * Ce que le rendu lit d'un incendie. Le sous-ensemble de `IncendieResult` dont
 * le dessin a besoin — écrit en clair pour que ce module se teste sans
 * fabriquer un résultat de moteur complet, et pour dire exactement ce qu'il
 * consomme.
 */
export interface FrontDIncendie {
  /** cellules brûlées, dans l'ordre où le front les a atteintes */
  brulees: ArrayLike<number>;
  /** rang d'arrivée du front sur chaque cellule de `brulees`, même ordre */
  rangs: ArrayLike<number>;
  /**
   * Charge de combustible de chaque cellule, même ordre — ce DANS QUOI le feu
   * a brûlé (`IncendieResult.charges`).
   *
   * Optionnelle, et c'est le seul champ qui le soit : les scènes cuites avant
   * que le moteur ne l'expose n'en portent pas, et une flamme de hauteur
   * moyenne vaut mieux qu'un plantage. Mais quand elle est là, c'est elle qui
   * décide de la hauteur des flammes.
   */
  charges?: ArrayLike<number>;
}

/**
 * Largeur du front, en rangs.
 *
 * **C'est ce qui fait la différence entre un front et une tache qui grandit.**
 * À un rang, on voit un liseré d'un mètre courir — trop fin pour se lire à la
 * parcelle. À dix, tout ce qui a brûlé flambe en même temps et on ne voit plus
 * où le feu EST. Trois rangs, c'est une ligne de flammes de trois mètres de
 * profondeur : ce qu'on voit d'un feu courant.
 */
export const RANGS_DU_FRONT = 3;

/**
 * Sur combien de rangs du front un arbre se torche, de la première flamme à la
 * chandelle noire.
 *
 * Sept, soit un peu plus du double de la profondeur du front : une couronne
 * met plus de temps à brûler que l'herbe sous elle, et c'est ce décalage qui
 * fait qu'on voit des torches DERRIÈRE la ligne de flammes — ce qu'on voit
 * d'un feu courant qui monte dans les arbres.
 */
export const TORCHAGE_EN_RANGS = 7;

/**
 * De combien la tête du front DÉPASSE le dernier rang, en rangs.
 *
 * **Le dépassement doit couvrir la plus longue chose que l'incendie met en
 * scène, et un essai a attrapé les deux fois où ce n'était pas le cas.** La
 * première : sans dépassement du tout, les dernières cellules flambaient encore
 * à la fin de l'acte ; avec la seule largeur du front, elles finissaient en
 * braise et non en cendre, faute du rang de refroidissement. La seconde : un
 * arbre sur le dernier rang était encore en train de flamber quand l'acte
 * s'achevait, parce qu'un torchage dure sept rangs là où le refroidissement
 * d'une cellule en dure quatre — sa couronne aurait brûlé indéfiniment.
 *
 * L'état final doit être celui que l'instantané d'après décrira : du sol brûlé
 * et des chandelles noires. D'où le maximum, et non l'un des deux.
 */
export const DEPASSEMENT_DU_FRONT = Math.max(RANGS_DU_FRONT + 1, TORCHAGE_EN_RANGS);

/**
 * Les trois états d'une cellule que le feu traverse.
 *
 * **La flamme est claire et la cendre est sombre, et l'écart entre les deux est
 * ce qui rend le front lisible** : il court comme une ligne claire sur du
 * noir, dans le sens du rang croissant. Le §6.4 en attend la pédagogie des
 * coupures — « c'est la carte de combustibilité qui devient visible » — et
 * c'est le contraste qui la donne, pas la couleur exacte.
 */
export const FLAMME: Teinte = { r: 252, g: 196, b: 82 };
export const BRAISE: Teinte = { r: 196, g: 84, b: 34 };
export const CENDRE: Teinte = { r: 34, g: 30, b: 28 };

/**
 * Opacité de la flamme au sol, au plus fort du front.
 *
 * **Baissée quand les carreaux sont devenus des taches étalées.** Une tache
 * fait deux fois la cellule et se recouvre donc avec ses voisines : à 0,92,
 * l'intérieur du front devenait un aplati opaque. Une tache seule reste
 * maintenant translucide — c'est le bord de la brûlure — et les taches empilées
 * font le cœur opaque du brûlé, dégradé compris.
 *
 * **Deux tiers et non la moitié, et c'est la capture qui a repris la main** :
 * une tache fondue couvre bien moins que le carré qu'elle occupe, donc
 * l'empilement compense moins que je ne l'avais estimé. À 0,46, le brûlé sortait
 * vert olive et la trame de cellules du terrain se voyait à travers.
 */
export const OPACITE_DE_LA_FLAMME = 0.68;

/**
 * Opacité de la cendre.
 *
 * Pas totale : le sol brûlé reste du SOL, et ce qu'il portait — un tronc
 * couché, une souche — doit rester lisible dessous. C'est aussi ce qui évite
 * qu'un incendie laisse un trou noir découpé au ciseau dans la parcelle.
 */
export const OPACITE_DE_LA_CENDRE = 0.6;

/**
 * Combien de variantes de TACHE DE BRÛLURE sont cuites.
 *
 * Quatre et non trois : une tache de brûlure est posée sur des milliers de
 * cellules d'un seul coup, là où une flamme n'apparaît qu'à cent soixante
 * exemplaires. Une variante de plus se remarque à cette échelle-là.
 */
export const VARIANTES_DE_BRULURE = 4;

/**
 * Un nombre reproductible tiré de deux entiers.
 *
 * **Pas un générateur, une FONCTION.** Un générateur à état donnerait des
 * particules qui changent de place à chaque image alors qu'elles sont censées
 * être les mêmes, et une capture figée ne serait pas reproductible. Ici, la
 * phase d'une flamme est une fonction de sa cellule : elle est stable d'une
 * image à l'autre sans que rien ne soit gardé.
 */
function alea(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Mélange linéaire de deux teintes. */
function melanger(a: Teinte, b: Teinte, part: number): Teinte {
  const t = Math.min(1, Math.max(0, part));
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * L'état du front à un avancement donné de son acte.
 *
 * Trois zones, du rang le plus haut au plus bas : ce que le front n'a pas
 * encore atteint (rien de dessiné — la parcelle est intacte, et c'est
 * important : un feu qui noircirait d'avance raconterait le contraire de ce
 * qui se passe), la ligne de flammes, et la cendre derrière.
 *
 * À l'avancement 1, tout ce qui a brûlé est en cendre : c'est l'état final, et
 * il correspond à ce que l'instantané d'après dira du sol.
 */
/**
 * Où en est la TÊTE du front, en rangs, à un avancement donné.
 *
 * Extrait parce que TOUT ce qui dessine un incendie en dépend — la cendre, les
 * flammes, la fumée, les braises, les couronnes qui flambent. Deux copies de
 * cette formule et le panache se décalerait du front d'un rang, ce qui se
 * verrait tout de suite : de la fumée là où il n'y a plus de feu.
 *
 * Le dépassement du dernier rang est expliqué avec `DEPASSEMENT_DU_FRONT`.
 */
export function teteDuFront(front: FrontDIncendie, avancement: number): number {
  const n = Math.min(front.brulees.length, front.rangs.length);
  let rangMax = 0;
  for (let i = 0; i < n; i++) rangMax = Math.max(rangMax, front.rangs[i] ?? 0);
  return Math.min(1, Math.max(0, avancement)) * (rangMax + DEPASSEMENT_DU_FRONT);
}

export function frontEnCours(front: FrontDIncendie, avancement: number): CelluleVoilee[] {
  const n = Math.min(front.brulees.length, front.rangs.length);
  if (n === 0) return [];
  const tete = teteDuFront(front, avancement);
  const sorties: CelluleVoilee[] = [];
  for (let i = 0; i < n; i++) {
    const cellule = front.brulees[i] ?? 0;
    const depuis = tete - (front.rangs[i] ?? 0);
    if (depuis <= 0) continue;
    // La variante de tache, tirée de la cellule : deux voisines ne portent pas
    // la même, sinon l'étalement reforme une trame — plus grosse, mais une
    // trame quand même.
    const brulure = Math.floor(alea(cellule, 31) * VARIANTES_DE_BRULURE) % VARIANTES_DE_BRULURE;
    if (depuis < RANGS_DU_FRONT) {
      // Dans le front : la flamme s'assombrit vers la braise à mesure qu'on
      // s'éloigne de sa tête.
      const part = depuis / RANGS_DU_FRONT;
      sorties.push({
        cellule,
        teinte: melanger(FLAMME, BRAISE, part),
        opacite: OPACITE_DE_LA_FLAMME,
        brulure,
      });
      continue;
    }
    // Derrière : la braise se refroidit en cendre sur un rang de plus, sinon la
    // flamme devient noire d'un pixel à l'autre.
    const refroidi = Math.min(1, depuis - RANGS_DU_FRONT);
    sorties.push({
      cellule,
      teinte: melanger(BRAISE, CENDRE, refroidi),
      opacite: OPACITE_DE_LA_FLAMME + (OPACITE_DE_LA_CENDRE - OPACITE_DE_LA_FLAMME) * refroidi,
      brulure,
    });
  }
  return sorties;
}

/**
 * Le rang le plus élevé du front, c'est-à-dire jusqu'où le feu est allé.
 *
 * Utile à l'appelant pour deux choses : savoir si un incendie mérite un acte
 * plus long qu'un autre (un feu de trois cellules et un feu d'un hectare ne se
 * racontent pas dans le même temps), et cadrer la caméra sur l'origine, ce que
 * le §6.4 demande.
 */
export function porteeDuFront(front: FrontDIncendie): number {
  let rangMax = 0;
  const n = Math.min(front.brulees.length, front.rangs.length);
  for (let i = 0; i < n; i++) rangMax = Math.max(rangMax, front.rangs[i] ?? 0);
  return rangMax;
}

// ─────────────────────────────────────────────────────────────────────────────
// Les particules : les flammes, la lueur, le panache et les braises (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce qu'une particule DESSINE. La forme décide de la texture, de l'ancre et du
 * mode de fusion — un feu s'ajoute à ce qu'il éclaire, une fumée le recouvre —
 * mais c'est la couche de pose qui en tire les conséquences, pas ce module.
 */
export type FormeDeFeu = "lueur" | "flamme" | "coeur" | "fumee" | "traine" | "braise";

/**
 * Une particule : une image à poser dans le monde, à une hauteur.
 *
 * **Des mètres et pas des pixels**, parce qu'une flamme et un panache sont des
 * objets du monde : ils grandissent quand on zoome, à la différence d'un
 * marqueur du calque des changements, qui est de l'interface. La conversion est
 * la même que pour les arbres — un mètre vaut `METRE_VERTICAL_PX × zoom`, dans
 * les deux directions, par construction de la projection dimétrique.
 */
export interface Particule {
  /**
   * La cellule du PIED, c'est-à-dire d'où la particule est partie.
   *
   * Elle sert à deux choses : lire l'altitude du sol (le panache pend au-dessus
   * de son pied, pas au-dessus du terrain qu'il survole) et vérifier, dans les
   * essais, qu'aucune particule ne sort d'une cellule que le moteur n'a pas
   * brûlée.
   */
  cellule: number;
  /** position en mètres de parcelle — pas celle du pied : la fumée dérive */
  x: number;
  y: number;
  /** hauteur au-dessus du sol du pied, en mètres */
  hM: number;
  /** encombrement à l'écran, en mètres */
  largeurM: number;
  hauteurM: number;
  forme: FormeDeFeu;
  /** laquelle des variantes cuites de cette forme — les flammes se répètent */
  variante: number;
  teinte: Teinte;
  opacite: number;
}

/**
 * La teinte d'un cœur de flamme : presque blanche.
 *
 * **C'est ce qui fait qu'un feu se lit comme du feu et non comme du papier
 * orange.** Une flamme a un dégradé de température — blanc-jaune au ras du
 * combustible, orange au milieu, rouge sombre aux pointes — et une seule teinte
 * ne peut pas le rendre. Le cœur est donc un second panneau, plus petit et plus
 * clair, posé sur le premier.
 */
export const COEUR: Teinte = { r: 255, g: 244, b: 208 };

/** La teinte de la lueur au sol, autour de ce qui brûle. */
export const LUEUR: Teinte = { r: 255, g: 158, b: 70 };

/**
 * Les deux teintes de la fumée.
 *
 * De la suie au ras des flammes — un feu d'herbe fume noir, parce qu'il brûle
 * mal — puis un gris pâle en montant, où le panache se dilue. Une seule teinte
 * donnait un nuage plat ; le dégradé lui donne le volume, gratuitement, puisque
 * chaque bouffée porte déjà son avancement.
 */
export const SUIE: Teinte = { r: 58, g: 52, b: 48 };
export const FUMEE_PALE: Teinte = { r: 148, g: 141, b: 134 };

/**
 * Opacité d'une bouffée de fumée, au plus dense.
 *
 * **Basse, et c'est ce qui fait une colonne plutôt qu'un chapelet de ballons.**
 * La capture l'a montré à 0,56 : deux bouffées qui se recouvrent en opacité
 * normale donnent un recouvrement franchement plus dense que chacune, donc des
 * bords visibles, donc des boules. À un tiers, l'accumulation de seize bouffées
 * construit un dégradé continu — la colonne est dense en son cœur, où elles se
 * recouvrent le plus, et floue sur ses bords, où une seule passe.
 */
export const OPACITE_DE_LA_FUMEE = 0.42;

/**
 * Sur quelle part du haut du panache la fumée se dilue.
 *
 * **La moitié, et pas un tiers : c'est ce qui remplace le chapeau du
 * champignon par une dissolution.** Une dilution tardive rend les plus grosses
 * bouffées — celles du sommet — encore pleinement opaques, donc le panache
 * finit sur un bord franc, ce qui est le contraire de la fumée. En diluant sur
 * la moitié haute, la colonne s'épaissit et pâlit en même temps, et se perd.
 */
export const DILUTION_DU_SOMMET = 0.55;

/** Opacité de la lueur posée au sol. */
export const OPACITE_DE_LA_LUEUR = 0.42;

/**
 * Hauteur d'une flamme, en mètres, sur la charge de combustible de référence.
 *
 * **Elle VARIE maintenant d'une cellule à l'autre, et c'est le moteur qui le
 * dit.** `IncendieResult.charges` porte la charge de chaque cellule brûlée
 * depuis que le moteur l'expose ; le rendu n'a donc plus à dessiner toutes ses
 * flammes à la même hauteur de convention. Deux mètres et demi restent la
 * hauteur sur la charge de référence — celle d'une pelouse ordinaire, voir
 * `CHARGE_DE_REFERENCE` — et la loi ci-dessous en écarte les autres cellules.
 *
 * Une flamme d'herbe haute monte à peu près à deux fois la hauteur du
 * combustible, d'où l'ordre de grandeur *(à calibrer : les modèles de
 * comportement du feu donnent la longueur de flamme en fonction de l'intensité
 * de Byram, que le moteur ne calcule pas)*.
 */
export const HAUTEUR_DE_FLAMME_M = 2.5;

/**
 * La charge de combustible sur laquelle `HAUTEUR_DE_FLAMME_M` est calée.
 *
 * **Ce n'est PAS `CHARGE_PLEINE_INTENSITE` du moteur, et le premier jet s'y est
 * trompé.** J'avais pris la charge à laquelle le feu tue tout ce qui n'a pas
 * d'écorce (1,2), en trouvant l'accord élégant. Mesuré ensuite : la friche de
 * démonstration brûle à 0,53–0,60 de charge médiane, donc toutes ses flammes
 * sortaient à 0,7 de la hauteur de référence — trois pixels au zoom de
 * parcelle, une ligne brillante au lieu de langues.
 *
 * Les deux nombres répondent à deux questions différentes. « À quelle charge le
 * feu devient-il létal » est une question d'écologie ; « quelle est la charge
 * d'une pelouse ordinaire » est la question de dessin, parce que c'est ELLE que
 * le joueur voit brûler la plupart du temps et c'est sur elle qu'il faut caler
 * l'échelle. Six dixièmes, soit la médiane mesurée de ce qui brûle sur les deux
 * scènes de feu. Une lande d'ajoncs à 1,7 monte alors à une fois et demie cette
 * hauteur, et un sous-bois frais à 0,2 tombe à la moitié : c'est le rapport
 * qu'on veut voir, et il est maintenant dans la bonne plage de lisibilité.
 */
export const CHARGE_DE_REFERENCE = 0.6;

/**
 * Ce que la charge locale fait à la hauteur d'une flamme, en multiple.
 *
 * **Une racine et non une proportionnelle.** Une cellule dix fois plus chargée
 * ne fait pas des flammes dix fois plus hautes : la longueur de flamme croît
 * comme une puissance de l'intensité nettement inférieure à un (modèles de
 * Byram, exposant voisin de 0,46 sur l'intensité). La racine carrée en est
 * l'approximation habituelle, et elle a la bonne propriété de dessin : un pré
 * ras garde une flamme visible au lieu de disparaître, et un ajonc ne fait pas
 * un mur de dix mètres.
 *
 * Bornée en haut, parce qu'une charge exceptionnelle — un tas de rémanents —
 * ne doit pas produire une flamme plus haute que les arbres.
 */
export const FLAMME_LA_PLUS_HAUTE = 2.2;

export function partDeLaCharge(charge: number): number {
  return Math.min(FLAMME_LA_PLUS_HAUTE, Math.sqrt(Math.max(0, charge) / CHARGE_DE_REFERENCE));
}

/** Largeur d'une flamme, en mètres. Une langue est plus haute que large. */
export const LARGEUR_DE_FLAMME_M = 1.6;

/**
 * Plancher de hauteur d'une flamme, en mètres.
 *
 * Le battement et la retombée se multiplient : au fond du front et au bas du
 * battement, leur produit tend vers zéro, et une langue de zéro mètre n'est
 * pas une flamme mais un point qui clignote.
 */
export const FLAMME_LA_PLUS_BASSE_M = 0.35;

/**
 * Combien de flammes au plus, quel que soit le nombre de cellules en feu.
 *
 * **Un front de cent rangs a deux mille cellules en flammes à son plus large**,
 * mesuré sur la scène de démonstration : une langue de feu par cellule, ce sont
 * deux mille panneaux à trier et à poser par image, pour un résultat qui n'est
 * plus une ligne de flammes mais un mur opaque. Cent soixante suffisent à
 * dessiner une ligne : au-delà, elles se recouvrent.
 */
export const FLAMMES_MAX = 160;

/** Période du battement d'une flamme, en millisecondes de l'ellipse. */
export const PERIODE_DE_FLAMME_MS = 240;

/**
 * Maille de la lueur au sol, en mètres.
 *
 * La lueur n'est pas une flamme, c'est ce que les flammes ÉCLAIRENT : elle se
 * pose par tache large, une tous les sept mètres de front, et non par cellule.
 * C'est le §6.4 qui la demande dès le départ du feu — « une lueur sur la
 * cellule d'origine » — et au départ il n'y a qu'une maille, donc une lueur.
 */
export const MAILLE_DES_LUEURS_M = 7;

/** Diamètre d'une tache de lueur, en mètres. */
export const DIAMETRE_DE_LUEUR_M = 15;

/** Combien de taches de lueur au plus. */
export const LUEURS_MAX = 48;

/**
 * Maille des colonnes de fumée, en mètres.
 *
 * **C'est la bonne UNITÉ qui décide ici, et la question s'est posée comme
 * toujours.** Une bouffée par cellule en flammes, ce sont deux mille bouffées
 * et un brouillard ; une seule colonne pour tout l'incendie, c'est un panache
 * qui ne dit plus où le feu est. Ce qu'on voit d'un feu courant, c'est une
 * suite de colonnes le long du front, espacées de quelques dizaines de mètres,
 * qui se rejoignent en altitude. Une tous les quinze mètres, donc.
 *
 * **Une maille et non un échantillonnage par indice**, et c'est la raison qui
 * compte : un pas d'indice change de cellules à chaque image quand le front
 * grandit, et les colonnes se téléporteraient. Une maille SPATIALE tient une
 * colonne en place tant que le front traverse son carré.
 */
export const MAILLE_DES_COLONNES_M = 9;

/**
 * Combien de colonnes de fumée au plus.
 *
 * Vingt-deux, et le premier jet en mettait douze. Mesuré sur la scène de
 * démonstration : le front traverse jusqu'à trente-deux mailles de douze mètres
 * à son plus large, et douze colonnes sur trente-deux donnaient un incendie à
 * cheminées — des panaches isolés au lieu d'une masse. Vingt-deux les fait se
 * rejoindre.
 */
export const COLONNES_MAX = 30;

/**
 * Combien de bouffées dans une colonne.
 *
 * Seize, et il a fallu deux captures pour retrouver ce nombre : en resserrant
 * les colonnes et en diluant leur sommet, j'avais aussi baissé leur nombre et
 * leur opacité — trois coupes à la fois, et le panache le plus large de l'acte
 * n'était plus qu'un voile pâle autour du front. **Une densité se règle sur une
 * grandeur à la fois.**
 */
export const BOUFFEES_PAR_COLONNE = 16;

/** Jusqu'où monte le panache, en mètres. */
export const HAUTEUR_DU_PANACHE_M = 28;

/**
 * Taille d'une bouffée au ras du feu, puis au sommet du panache, en mètres.
 *
 * **Le RAPPORT entre les deux compte plus que les deux nombres, et la capture
 * l'a montré : à un contre cinq, chaque colonne se lisait comme un
 * champignon** — un pied fin et un chapeau. Une colonne de fumée ne pousse pas
 * comme ça : elle part déjà large, parce qu'elle part de plusieurs mètres de
 * flammes. Six mètres au pied, dix-sept au sommet.
 */
export const BOUFFEE_LA_PLUS_PETITE_M = 6;
export const BOUFFEE_LA_PLUS_GRANDE_M = 17;

/** Temps qu'une bouffée met à monter, en millisecondes de l'ellipse. */
export const MONTEE_DU_PANACHE_MS = 900;

/**
 * De combien le panache DÉRIVE sur toute sa hauteur, en mètres, au vent le
 * plus fort.
 *
 * Trente pour vingt-huit mètres de montée, soit une inclinaison de quarante-six
 * degrés au vent le plus fort : c'est ce qu'on voit d'un feu d'herbe sur un
 * plateau. À vingt, la capture montrait une colonne qu'on aurait dite droite —
 * l'inclinaison existait dans les nombres et pas à l'écran.
 */
export const DERIVE_LA_PLUS_FORTE_M = 30;

/**
 * Sur combien de rangs derrière le front le sol FUME encore.
 *
 * **C'est ce qui manquait le plus, et la capture l'a rendu évident** : un
 * anneau de flammes avec des colonnes au-dessus et un trou noir au milieu ne se
 * lit pas comme un incendie, parce qu'un incendie ne s'arrête pas de fumer dès
 * que la flamme est passée. Ce qui a brûlé fume, bas et large, pendant un
 * moment — et c'est cette traîne qui relie le front à son panache au lieu de
 * laisser des ballons flotter au-dessus du vide.
 *
 * Seize rangs : de quoi couvrir une bande derrière le front, pas tout le brûlé.
 * Une parcelle qui fumerait entièrement jusqu'à la fin de l'acte cacherait la
 * cendre, c'est-à-dire ce que l'instantané d'après va décrire.
 */
export const RANGS_QUI_FUMENT = 16;

/** Maille de la traîne, en mètres, et combien de bouffées basses au plus. */
export const MAILLE_DE_LA_TRAINE_M = 9;
export const TRAINEES_MAX = 70;

/** Ce qu'une bouffée de traîne mesure et jusqu'où elle s'élève, en mètres. */
export const TRAINE_LA_PLUS_PETITE_M = 8;
export const TRAINE_LA_PLUS_GRANDE_M = 17;
export const HAUTEUR_DE_LA_TRAINE_M = 6;

/**
 * Opacité d'une bouffée de traîne.
 *
 * Très basse : la traîne est une brume, pas un nuage. Elle doit laisser voir la
 * cendre en dessous — sinon elle remplace l'état du sol par une couverture
 * grise, et le joueur ne verra pas ce que le feu a laissé.
 */
export const OPACITE_DE_LA_TRAINE = 0.22;

/** Le temps qu'une bouffée de traîne met à se dissiper, en millisecondes. */
export const DISSIPATION_MS = 1500;

/** Combien de braises au plus. */
export const BRAISES_MAX = 110;

/** Jusqu'où monte une braise, en mètres, et en combien de temps. */
export const MONTEE_DE_BRAISE_M = 15;
export const VOL_DE_BRAISE_MS = 1050;

/**
 * Taille d'une braise, en mètres.
 *
 * **Bien plus grosse qu'une vraie braise, et c'est assumé.** Au zoom de
 * parcelle, un mètre fait quatre pixels : une escarbille de dix centimètres
 * serait un demi-pixel, c'est-à-dire rien. Ce qu'on dessine ici n'est pas la
 * braise mais l'étincelle qu'on en voit — et une étincelle se voit de loin
 * parce qu'elle brille, pas parce qu'elle est grande. Un mètre quarante la rend
 * visible sans qu'elle se lise comme un objet.
 */
export const TAILLE_DE_BRAISE_M = 1.4;

/** Combien de variantes de langue de flamme et de bouffée sont cuites. */
export const VARIANTES = 3;

/** Partie fractionnaire, positive. C'est le cycle de vie d'une particule. */
function cycle(v: number): number {
  return v - Math.floor(v);
}

/**
 * Les cellules qui FLAMBENT à cet avancement, avec leur place dans le front.
 *
 * `part` vaut 0 sur la tête du front et tend vers 1 au fond, là où la flamme
 * retombe en braise. C'est la seule grandeur dont les particules aient besoin
 * en plus de la position : elle décide de la hauteur d'une flamme et de sa
 * couleur, exactement comme elle décide de la teinte du losange au sol.
 *
 * **Vide à l'avancement 1, et c'est ce qui éteint le feu tout seul** : la tête
 * a dépassé le dernier rang de la largeur du front plus un, donc plus rien
 * n'est en flammes, donc il n'y a plus une flamme, plus une braise, plus une
 * bouffée. Il ne reste que la cendre du calque au sol — ce que l'instantané
 * d'après décrira. Aucun cas particulier à écrire pour la fin de l'acte.
 */
export function cellulesEnFlammes(
  front: FrontDIncendie,
  avancement: number,
): { cellule: number; part: number; charge: number }[] {
  const n = Math.min(front.brulees.length, front.rangs.length);
  if (n === 0) return [];
  const tete = teteDuFront(front, avancement);
  const sorties: { cellule: number; part: number; charge: number }[] = [];
  for (let i = 0; i < n; i++) {
    const depuis = tete - (front.rangs[i] ?? 0);
    if (depuis <= 0 || depuis >= RANGS_DU_FRONT) continue;
    sorties.push({
      cellule: front.brulees[i] ?? 0,
      part: depuis / RANGS_DU_FRONT,
      // Absente sur une vieille scène : on prend la charge de référence, ce qui
      // redonne exactement la hauteur de convention d'avant.
      charge: front.charges?.[i] ?? CHARGE_DE_REFERENCE,
    });
  }
  return sorties;
}

/**
 * Les cellules qui FUMENT encore, derrière le front.
 *
 * `part` vaut 0 juste derrière la flamme et 1 au bout des `RANGS_QUI_FUMENT` :
 * c'est de quoi faire une traîne qui s'éteint en s'éloignant du feu, ce qui est
 * ce qu'on voit — le sol fume fort là où la flamme vient de passer.
 */
export function cellulesQuiFument(
  front: FrontDIncendie,
  avancement: number,
): { cellule: number; part: number }[] {
  const n = Math.min(front.brulees.length, front.rangs.length);
  if (n === 0) return [];
  const tete = teteDuFront(front, avancement);
  const sorties: { cellule: number; part: number }[] = [];
  for (let i = 0; i < n; i++) {
    const derriere = tete - (front.rangs[i] ?? 0) - RANGS_DU_FRONT;
    if (derriere <= 0 || derriere >= RANGS_QUI_FUMENT) continue;
    sorties.push({ cellule: front.brulees[i] ?? 0, part: derriere / RANGS_QUI_FUMENT });
  }
  return sorties;
}

/** Le centre d'une cellule, en mètres de parcelle. */
function centreDe(cellule: number, coteM: number): { x: number; y: number } {
  return { x: (cellule % coteM) + 0.5, y: Math.floor(cellule / coteM) + 0.5 };
}

/**
 * Vers où la fumée penche, et de combien.
 *
 * **Le moteur le SAIT maintenant, et cette fonction ne devine plus rien.**
 * Elle a d'abord fait pencher chaque colonne à l'opposé de l'origine de
 * l'incendie, puis toutes dans le sens de l'avance nette du front : deux
 * conventions déclarées, en attendant que `WeekWeather` porte un vent. Le
 * moteur porte désormais `TickResult.vent` — un secteur et une force, dérivés
 * de la rose de la station et du régime de la semaine (`engine/vent.ts`) —
 * et c'est lui qu'on lit.
 *
 * Ce que ça change à l'image, et ce n'est pas rien : **le panache d'un incendie
 * penche du même côté que celui du voisin, et il ne penche pas dans le sens du
 * feu quand le feu remonte le vent.** Un front qui descend le vent et un front
 * qui le remonte se dessinaient pareil ; maintenant, non.
 *
 * `force` est le `force` du vent de la semaine ∈ [0,1], donc l'inclinaison
 * suit la météo : une colonne droite un jour calme, couchée un jour de vent.
 */
function penchantDuVent(vent: VentAPencher): { dx: number; dy: number; force: number } {
  return {
    dx: Math.cos(vent.versRad),
    dy: Math.sin(vent.versRad),
    force: Math.min(1, Math.max(0, vent.force)),
  };
}

/**
 * Ce que le rendu lit du vent : où il souffle, et combien il pousse.
 *
 * Le sous-ensemble de `VentDeLaSemaine` dont le dessin a besoin — écrit en
 * clair pour que ce module se teste sans fabriquer un résultat de moteur
 * complet, comme `FrontDIncendie`.
 */
export interface VentAPencher {
  /** direction VERS laquelle il souffle, radians (0 = +x = est, sens trigo) */
  versRad: number;
  /** force ∈ [0,1] */
  force: number;
}

/**
 * Le vent qu'on prend quand l'instantané n'en porte pas.
 *
 * Nul, et pas « un vent moyen » : une scène cuite avant que le moteur ne
 * rapporte le vent ne doit pas se lire comme une parcelle particulière. Force
 * zéro donne une colonne droite, ce qui est la lecture honnête de « on ne sait
 * pas ».
 */
export const SANS_VENT: VentAPencher = { versRad: 0, force: 0 };

/**
 * Ce qui brûle AU SOL : la lueur et les langues de flamme.
 *
 * Posé sous les arbres, parce qu'un feu courant est à leurs pieds : on le voit
 * entre les troncs. Ce qui monte au-dessus du couvert — la fumée, les braises —
 * est rendu par `panacheDuFeu` et posé par-dessus tout.
 *
 * `phaseMs` est l'horloge de l'ELLIPSE et non celle du navigateur : c'est ce
 * qui fait qu'une lecture figée l'est vraiment, jusqu'au battement des flammes.
 */
export function feuAuSol(
  front: FrontDIncendie,
  avancement: number,
  phaseMs: number,
  coteM: number,
): Particule[] {
  const flambent = cellulesEnFlammes(front, avancement);
  if (flambent.length === 0) return [];
  const sorties: Particule[] = [];

  // La LUEUR d'abord : une tache large par maille de front, aplatie de moitié
  // parce qu'elle est posée AU SOL et que le sol est vu de biais. C'est le seul
  // endroit du feu qui éclaire quelque chose d'autre que lui-même.
  const mailles = new Set<number>();
  const parRangee = Math.ceil(coteM / MAILLE_DES_LUEURS_M) + 1;
  for (const f of flambent) {
    if (mailles.size >= LUEURS_MAX) break;
    const c = centreDe(f.cellule, coteM);
    const clef =
      Math.floor(c.y / MAILLE_DES_LUEURS_M) * parRangee + Math.floor(c.x / MAILLE_DES_LUEURS_M);
    if (mailles.has(clef)) continue;
    mailles.add(clef);
    const battement = 0.82 + 0.18 * Math.sin(2 * Math.PI * cycle(phaseMs / 430 + alea(clef, 3)));
    sorties.push({
      cellule: f.cellule,
      x: c.x,
      y: c.y,
      hM: 0,
      largeurM: DIAMETRE_DE_LUEUR_M,
      hauteurM: DIAMETRE_DE_LUEUR_M / 2,
      forme: "lueur",
      variante: 0,
      teinte: LUEUR,
      opacite: OPACITE_DE_LA_LUEUR * battement * (1 - 0.4 * f.part),
    });
  }

  // Les LANGUES, échantillonnées à pas régulier. Le pas est en indices et non
  // en maille : une flamme scintille, elle a le droit de changer de cellule
  // d'une image à l'autre — c'est même ce qui donne le grouillement du feu.
  const pas = Math.max(1, Math.ceil(flambent.length / FLAMMES_MAX));
  for (let i = 0; i < flambent.length; i += pas) {
    const f = flambent[i];
    if (!f) continue;
    const c = centreDe(f.cellule, coteM);
    const phase = alea(f.cellule, 1);
    const bat = cycle(phaseMs / PERIODE_DE_FLAMME_MS + phase);
    // La langue bat en hauteur, et retombe à mesure qu'elle s'éloigne de la
    // tête du front : au fond, c'est de la braise et non plus une flamme.
    const ondule = 0.6 + 0.4 * Math.sin(2 * Math.PI * bat);
    const vigueur = (1 - 0.6 * f.part) * (0.7 + 0.6 * alea(f.cellule, 2));
    // **La charge de la cellule décide de la hauteur**, et c'est ce qui rend la
    // carte de combustibilité visible sur la flamme elle-même et plus seulement
    // sur la vitesse du front (§6.4).
    const haut = Math.max(
      FLAMME_LA_PLUS_BASSE_M,
      HAUTEUR_DE_FLAMME_M * partDeLaCharge(f.charge) * ondule * vigueur,
    );
    // La largeur suit la hauteur, mais moins : une langue reste une langue.
    const large =
      LARGEUR_DE_FLAMME_M *
      (0.75 + 0.5 * alea(f.cellule, 4)) *
      (0.6 + 0.4 * partDeLaCharge(f.charge));
    const teinte = melanger(FLAMME, BRAISE, f.part * 0.85);
    sorties.push({
      cellule: f.cellule,
      x: c.x,
      y: c.y,
      hM: 0,
      largeurM: large,
      hauteurM: haut,
      forme: "flamme",
      variante: Math.floor(alea(f.cellule, 5) * VARIANTES) % VARIANTES,
      teinte,
      opacite: OPACITE_DE_LA_FLAMME * (0.8 + 0.2 * ondule),
    });
    // Le CŒUR : la même langue, plus petite et presque blanche. C'est le
    // dégradé de température, et c'est lui qui empêche la flamme de se lire
    // comme un morceau de papier orange.
    sorties.push({
      cellule: f.cellule,
      x: c.x,
      y: c.y,
      hM: 0,
      largeurM: large * 0.52,
      hauteurM: haut * 0.58,
      forme: "coeur",
      variante: Math.floor(alea(f.cellule, 6) * VARIANTES) % VARIANTES,
      teinte: COEUR,
      opacite: 0.75 * (1 - f.part),
    });
  }
  return sorties;
}

/**
 * Ce qui MONTE : le panache et les braises.
 *
 * Posé au-dessus des arbres, et c'est le seul calque du rendu qui ait le droit
 * de masquer un houppier : de la fumée passe devant ce qu'elle survole, sinon
 * ce n'est pas de la fumée.
 */
export function panacheDuFeu(
  front: FrontDIncendie,
  avancement: number,
  phaseMs: number,
  coteM: number,
  vent: VentAPencher,
): Particule[] {
  const flambent = cellulesEnFlammes(front, avancement);
  // **Plus rien qui flambe, plus rien qui fume.** La traîne aussi s'arrête ici,
  // et c'est volontaire : le dernier rang du front vient de refroidir, l'acte
  // est fini, et ce que l'instantané d'après décrit est un sol de cendre. Une
  // brume qui survivrait à l'acte se retrouverait figée sur la parcelle jusqu'à
  // la prochaine ellipse.
  if (flambent.length === 0) return [];
  const sorties: Particule[] = [];
  // Une seule pour tout l'incendie : un vent est uniforme sur un hectare.
  const pente = penchantDuVent(vent);

  // Les COLONNES, une par maille de front traversée.
  //
  // **Parcourues à PAS RÉGULIER et non dans l'ordre**, et c'est une correction
  // mesurée : `cellulesEnFlammes` rend ses cellules dans l'ordre du rang, donc
  // prendre les premières mailles rencontrées jusqu'au plafond ne retenait que
  // le bord INTÉRIEUR du front — les colonnes sortaient de la cendre au lieu de
  // suivre la ligne de feu. Un pas qui balaie tout l'ensemble les répartit.
  const mailles = new Set<number>();
  const parRangee = Math.ceil(coteM / MAILLE_DES_COLONNES_M) + 1;
  const pasDesColonnes = Math.max(1, Math.floor(flambent.length / (COLONNES_MAX * 3)));
  for (let k = 0; k < flambent.length; k += pasDesColonnes) {
    const f = flambent[k];
    if (!f) continue;
    if (mailles.size >= COLONNES_MAX) break;
    const pied = centreDe(f.cellule, coteM);
    const clef =
      Math.floor(pied.y / MAILLE_DES_COLONNES_M) * parRangee +
      Math.floor(pied.x / MAILLE_DES_COLONNES_M);
    if (mailles.has(clef)) continue;
    mailles.add(clef);
    const decalage = alea(clef, 7);
    for (let j = 0; j < BOUFFEES_PAR_COLONNE; j++) {
      // Le cycle d'une bouffée : elle naît au ras du feu, grossit, pâlit et
      // s'efface. Les bouffées d'une colonne sont décalées d'une fraction de
      // cycle, ce qui en fait un filet continu et non un chapelet.
      const u = cycle(phaseMs / MONTEE_DU_PANACHE_MS + j / BOUFFEES_PAR_COLONNE + decalage);
      const derive = DERIVE_LA_PLUS_FORTE_M * pente.force * u ** 1.5;
      const serpente = 1.1 * Math.sin(u * 5 + decalage * 6.283);
      // Une bouffée GROSSIT en montant : c'est ce qui fait un panache et non
      // une file de billes, et c'est vrai — l'air chaud se dilate et se mêle.
      const taille =
        BOUFFEE_LA_PLUS_PETITE_M + (BOUFFEE_LA_PLUS_GRANDE_M - BOUFFEE_LA_PLUS_PETITE_M) * u;
      sorties.push({
        cellule: f.cellule,
        x: pied.x + pente.dx * derive - pente.dy * serpente,
        y: pied.y + pente.dy * derive + pente.dx * serpente,
        hM: HAUTEUR_DU_PANACHE_M * u,
        largeurM: taille,
        hauteurM: taille,
        forme: "fumee",
        variante: (j + Math.floor(alea(clef, 8) * VARIANTES)) % VARIANTES,
        // Elle reste SUIE longtemps : un feu d'herbe fume noir parce qu'il
        // brûle mal, et le premier jet pâlissait en `u ** 0.7`, ce qui donnait
        // de la ouate blanche dès le tiers de la montée.
        teinte: melanger(SUIE, FUMEE_PALE, u ** 1.5),
        // **Un PLATEAU et non une décroissance, et la capture a tranché.** Avec
        // une opacité qui tombe dès la naissance de la bouffée, les grosses
        // bouffées du haut du panache étaient les plus transparentes : le
        // panache grossissait en devenant invisible, et il se lisait comme un
        // filet de vapeur au lieu d'une colonne de fumée. Elle monte donc à
        // pleine densité, la garde sur les deux tiers de la montée, et ne se
        // dilue qu'au sommet.
        opacite:
          OPACITE_DE_LA_FUMEE * Math.min(1, u / 0.1) * Math.min(1, (1 - u) / DILUTION_DU_SOMMET),
      });
    }
  }

  // La TRAÎNE : ce qui a brûlé fume encore, bas et large.
  //
  // Elle est indispensable et elle ne coûte presque rien : sans elle, le
  // panache flotte au-dessus d'un trou noir et l'incendie se lit comme des
  // ballons posés sur un anneau. Elle penche du même côté que le panache — c'est
  // le même vent — mais beaucoup moins, parce qu'elle ne monte presque pas.
  const fument = cellulesQuiFument(front, avancement);
  const traines = new Set<number>();
  const parRangeeTraine = Math.ceil(coteM / MAILLE_DE_LA_TRAINE_M) + 1;
  const pasDeLaTraine = Math.max(1, Math.floor(fument.length / (TRAINEES_MAX * 3)));
  for (let k = 0; k < fument.length; k += pasDeLaTraine) {
    const f = fument[k];
    if (!f) continue;
    if (traines.size >= TRAINEES_MAX) break;
    const c = centreDe(f.cellule, coteM);
    const clef =
      Math.floor(c.y / MAILLE_DE_LA_TRAINE_M) * parRangeeTraine +
      Math.floor(c.x / MAILLE_DE_LA_TRAINE_M);
    if (traines.has(clef)) continue;
    traines.add(clef);
    // Elle se dissipe sur son propre cycle, plus lent que celui du panache :
    // une brume ne bat pas, elle s'en va.
    const u = cycle(phaseMs / DISSIPATION_MS + alea(clef, 21));
    const taille =
      TRAINE_LA_PLUS_PETITE_M + (TRAINE_LA_PLUS_GRANDE_M - TRAINE_LA_PLUS_PETITE_M) * u;
    sorties.push({
      cellule: f.cellule,
      x: c.x + pente.dx * HAUTEUR_DE_LA_TRAINE_M * pente.force * u,
      y: c.y + pente.dy * HAUTEUR_DE_LA_TRAINE_M * pente.force * u,
      hM: HAUTEUR_DE_LA_TRAINE_M * u,
      largeurM: taille,
      // Aplatie : une brume au ras du sol s'étale plus qu'elle ne monte.
      hauteurM: taille * 0.55,
      forme: "traine",
      variante: Math.floor(alea(clef, 22) * VARIANTES) % VARIANTES,
      teinte: melanger(SUIE, FUMEE_PALE, 0.35 + 0.4 * u),
      // Elle s'éteint doublement : avec son propre cycle, et à mesure que la
      // cellule s'éloigne du front.
      opacite: OPACITE_DE_LA_TRAINE * Math.min(1, u / 0.15) * (1 - u) ** 0.6 * (1 - f.part),
    });
  }

  // Les BRAISES, échantillonnées comme les flammes. Elles montent plus vite et
  // moins haut que la fumée, et elles s'éteignent en tombant vers le rouge :
  // c'est ce qui donne l'échelle du feu, parce qu'une braise est petite et
  // qu'on en voit beaucoup.
  const pas = Math.max(1, Math.ceil(flambent.length / BRAISES_MAX));
  for (let i = 0; i < flambent.length; i += pas) {
    const f = flambent[i];
    if (!f) continue;
    const pied = centreDe(f.cellule, coteM);
    const decalage = alea(f.cellule, 11);
    const u = cycle(phaseMs / VOL_DE_BRAISE_MS + decalage);
    const derive = 0.7 * DERIVE_LA_PLUS_FORTE_M * pente.force * u ** 1.6;
    const zigzag = 1.4 * Math.sin(u * 9 + decalage * 6.283);
    sorties.push({
      cellule: f.cellule,
      x: pied.x + pente.dx * derive - pente.dy * zigzag,
      y: pied.y + pente.dy * derive + pente.dx * zigzag,
      hM: MONTEE_DE_BRAISE_M * u * (0.5 + 0.9 * alea(f.cellule, 12)),
      largeurM: TAILLE_DE_BRAISE_M,
      hauteurM: TAILLE_DE_BRAISE_M,
      forme: "braise",
      variante: 0,
      teinte: melanger(COEUR, BRAISE, u ** 0.6),
      opacite: 0.95 * Math.min(1, u / 0.06) * (1 - u) ** 0.8,
    });
  }
  return sorties;
}

/**
 * La teinte dont un incendie charge le CIEL (§6.4, « ciel orangé »).
 *
 * Un feu de cette taille éclaire tout ce qui est autour de lui : la brume du
 * hors-parcelle, les champs voisins, la fumée elle-même. C'est un ajout de
 * lumière et non un filtre — d'où une teinte franche, posée en fusion additive
 * et à faible opacité.
 */
export const CIEL: Teinte = { r: 255, g: 146, b: 56 };

/**
 * Combien de cellules doivent flamber en même temps pour que le ciel soit
 * pleinement chargé.
 *
 * Trois cents, mesuré sur la scène de démonstration : le front y culmine à 257
 * cellules en flammes au plus large de sa course, ce qui donne un ciel presque
 * plein. Un départ de feu de quarante cellules, lui, ne charge le ciel qu'au
 * huitième — un feu naissant n'orange pas l'horizon, et c'est bien ce que le
 * §6.4 décrit en distinguant « une lueur sur la cellule d'origine » de la
 * colonne et du ciel.
 */
export const CELLULES_POUR_UN_CIEL_PLEIN = 300;

/**
 * Opacité de l'embrasement du ciel, au plus fort.
 *
 * Faible, et c'est une contrainte plus qu'un réglage : ce voile couvre TOUTE
 * l'image, y compris l'interface de la carte et le décor. Au-delà, il ne
 * raconte plus un incendie, il déteint sur le jeu — et le joueur perd la
 * lecture des couleurs de sol dont il a besoin pour décider.
 */
export const CIEL_LE_PLUS_CHARGE = 0.17;

/**
 * De combien le ciel est chargé par l'incendie, ∈ [0,1].
 *
 * **La grandeur vient du moteur** : c'est le nombre de cellules qui flambent au
 * même instant, rapporté à ce qui fait un ciel plein. Rien d'inventé, et rien
 * de constant — le ciel s'allume quand le front s'élargit et s'éteint quand il
 * s'essouffle, ce qui est la même pédagogie que le front lui-même, vue de loin.
 */
export function chargeDuCiel(front: FrontDIncendie, avancement: number): number {
  const n = cellulesEnFlammes(front, avancement).length;
  return Math.min(1, n / CELLULES_POUR_UN_CIEL_PLEIN);
}

// ─────────────────────────────────────────────────────────────────────────────
// Le TORCHAGE : un arbre que le front atteint (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un arbre que l'incendie a tué, tel que le rendu le lit.
 *
 * **Ce qui rend le torchage possible sans rien inventer, et ce n'est pas le
 * journal.** Le moteur ne rapporte PAS une mort par le feu au moment du feu :
 * un arbre brûlé reste « récupérable en coupe sanitaire » pendant
 * `CHABLIS_RECUPERABLE_SEMAINES` — un an — et n'entre dans `morts` qu'après
 * (issue #52). Un incendie et ses victimes n'arrivent donc jamais dans le même
 * journal, et une mise en scène qui attendrait ça n'aurait jamais rien à
 * montrer.
 *
 * Mais l'INSTANTANÉ le dit : `brulEeSemaine` porte la semaine où le feu a tué
 * l'arbre. Un arbre dont cette semaine tombe dans l'intervalle du journal a
 * brûlé pendant l'ellipse qu'on est en train de jouer — exactement le même
 * raisonnement que pour les recrues, reconnues à leur `ageWeeks`.
 *
 * Et le MOMENT vient du front : le rang de sa cellule dit quand la ligne de
 * flammes l'atteint. Un arbre ne s'embrase donc pas quand l'acte commence, il
 * s'embrase quand le feu arrive à son pied — ce qui est la seule chose qui
 * puisse rendre un torchage lisible plutôt que décoratif.
 */
export interface ArbreQuiSeTorche {
  id: number;
  x: number;
  y: number;
  /** sa cellule, celle qui porte son rang dans le front */
  cellule: number;
  hauteurM: number;
  /** base du houppier, m : en dessous, c'est du tronc, et le tronc ne flambe pas */
  baseHouppierM: number;
  /** rayon du houppier, m */
  rayonHouppierM: number;
  /** le rang du front sur sa cellule : c'est QUAND il s'embrase */
  rang: number;
}

/**
 * Où en est le torchage d'un arbre, ∈ [0,1], ou `undefined` si le feu ne l'a
 * pas encore atteint.
 */
export function avancementDuTorchage(tete: number, rang: number): number | undefined {
  const depuis = tete - rang;
  if (depuis <= 0) return undefined;
  return Math.min(1, depuis / TORCHAGE_EN_RANGS);
}

/**
 * À quel avancement du torchage la couronne est le plus embrasée, et sur quelle
 * largeur.
 *
 * Le pic n'est pas au début : il faut que le feu monte. Et il n'est pas non
 * plus au milieu — une couronne s'embrase vite et brûle longtemps, donc la
 * montée est plus raide que la retombée.
 */
export const TORCHE_LA_PLUS_VIVE = 0.32;
export const LARGEUR_DE_LA_TORCHE = 0.5;

/** Combien de langues de flamme dans une couronne qui flambe. */
export const FLAMMES_PAR_TORCHE = 5;

/**
 * Combien d'arbres au plus flambent en même temps à l'écran.
 *
 * Mesuré : la friche de démonstration perd 222 tiges dans le même incendie.
 * Comme un torchage ne dure que sept rangs sur cent soixante-seize, elles ne
 * flambent pas toutes ensemble — mais un feu qui traverse un peuplement dense
 * en embraserait bien plus que ce qu'on peut poser, et le plafond est là pour
 * que le coût ne dépende pas de la densité du peuplement.
 */
export const TORCHES_MAX = 60;

/** Combien de braises une couronne qui flambe lâche. */
export const BRAISES_PAR_TORCHE = 3;

/** Jusqu'où montent les braises d'une couronne, en multiples de sa hauteur. */
export const ENVOL_DES_BRAISES = 1.5;

/**
 * De combien la couronne d'un arbre flambe, ∈ [0,1].
 *
 * Une bosse : elle s'embrase, elle brûle, elle s'éteint. Zéro avant que le feu
 * arrive et zéro quand il ne reste qu'une chandelle noire — c'est ce dernier
 * zéro qui compte, parce qu'une chandelle qui flamberait encore à la fin de
 * l'acte dirait que le feu n'est pas passé.
 */
export function vivaciteDeLaTorche(u: number): number {
  const d = Math.abs(u - TORCHE_LA_PLUS_VIVE);
  return Math.max(0, 1 - d / LARGEUR_DE_LA_TORCHE);
}

/**
 * Les flammes et les braises d'une couronne qui flambe.
 *
 * Dans le houppier et pas au pied : `baseHouppierM` dit où commence ce qui peut
 * brûler, et un fût nu de six mètres ne s'embrase pas. C'est ce qui distingue
 * visuellement un arbre élagué d'un arbre branchu jusqu'en bas — et c'est
 * précisément la pédagogie de l'élagage contre le feu (§6.4, « la pédagogie des
 * coupures »).
 */
export function flammesDeTorche(torche: ArbreQuiSeTorche, u: number, phaseMs: number): Particule[] {
  const vive = vivaciteDeLaTorche(u);
  if (vive <= 0) return [];
  const bas = Math.min(torche.baseHouppierM, torche.hauteurM * 0.85);
  const hautDuHouppier = Math.max(0.4, torche.hauteurM - bas);
  const rayon = Math.max(0.3, torche.rayonHouppierM);
  const sorties: Particule[] = [];
  for (let j = 0; j < FLAMMES_PAR_TORCHE; j++) {
    const angle = alea(torche.id, j) * Math.PI * 2;
    const loin = rayon * (0.15 + 0.7 * alea(torche.id, j + 20));
    const bat = cycle(phaseMs / PERIODE_DE_FLAMME_MS + alea(torche.id, j + 40));
    const ondule = 0.6 + 0.4 * Math.sin(2 * Math.PI * bat);
    // Répartie sur la hauteur du houppier, et un peu au-dessus : une couronne
    // qui flambe dépasse sa propre cime.
    const dansLeHouppier = alea(torche.id, j + 60);
    const haut = hautDuHouppier * (0.5 + 0.5 * ondule) * vive;
    sorties.push({
      cellule: torche.cellule,
      x: torche.x + Math.cos(angle) * loin,
      y: torche.y + Math.sin(angle) * loin,
      hM: bas + hautDuHouppier * dansLeHouppier * 0.8,
      largeurM: Math.max(0.4, rayon * 0.75),
      hauteurM: Math.max(FLAMME_LA_PLUS_BASSE_M, haut),
      forme: "flamme",
      variante: Math.floor(alea(torche.id, j + 80) * VARIANTES) % VARIANTES,
      teinte: melanger(FLAMME, BRAISE, 0.2 + 0.5 * u),
      opacite: OPACITE_DE_LA_FLAMME * (0.6 + 0.4 * ondule) * vive,
    });
  }
  // Les braises : c'est ce que le §6.4 appelle « les particules montent », et
  // c'est le seul signe qui se voie d'un torchage vu de loin.
  for (let j = 0; j < BRAISES_PAR_TORCHE; j++) {
    const decalage = alea(torche.id, j + 100);
    const vol = cycle(phaseMs / VOL_DE_BRAISE_MS + decalage);
    const angle = alea(torche.id, j + 120) * Math.PI * 2;
    sorties.push({
      cellule: torche.cellule,
      x: torche.x + Math.cos(angle) * rayon * vol * 1.4,
      y: torche.y + Math.sin(angle) * rayon * vol * 1.4,
      hM: torche.hauteurM * (0.6 + ENVOL_DES_BRAISES * vol),
      largeurM: TAILLE_DE_BRAISE_M,
      hauteurM: TAILLE_DE_BRAISE_M,
      forme: "braise",
      variante: 0,
      teinte: melanger(COEUR, BRAISE, vol ** 0.6),
      opacite: 0.9 * vive * (1 - vol) ** 0.7,
    });
  }
  return sorties;
}

/**
 * Ce que le torchage fait à l'ÉTAT de l'arbre, c'est-à-dire à sa vignette.
 *
 * **Trois grandeurs seulement, et c'est un budget de cuisson.** La couronne se
 * défeuille, la vigueur tombe, l'arbre passe charbonné puis chandelle. Le
 * jaunissement n'y est pas : un feuillage brûlé ne jaunit pas, il noircit, et
 * c'est `brulee` qui le dit dans la classe.
 *
 * L'avancement est QUANTIFIÉ pour les mêmes raisons que dans `mort.ts` — une
 * grandeur continue dans une clé de cache est un cache qui ne sert à rien.
 */
export function torchageEnCours(avantLeFeu: ArbreVivant, u: number): EtatMourant {
  const brut = Math.min(1, Math.max(0, u));
  const a = Math.round(brut * (PALIERS_DE_MORT - 1)) / (PALIERS_DE_MORT - 1);
  return {
    senescence: avantLeFeu.senescence,
    // La couronne se vide entre le premier tiers et les deux tiers.
    partFoliaire: avantLeFeu.partFoliaire * (1 - dansLaFenetre(a, [0.15, 0.65])),
    vigueur: avantLeFeu.vigueur * (1 - dansLaFenetre(a, [0, 0.5])),
    dommageHydraulique: avantLeFeu.dommageHydraulique,
    // **Charbonné AVANT d'être une chandelle**, et l'ordre compte : l'écorce
    // noircit dès que la flamme la léche, alors qu'il faut que la couronne ait
    // fini de brûler pour que ce soit un tronc mort sur pied. Entre les deux, on
    // voit un arbre noir qui a encore des feuilles — ce qui est exactement ce
    // qu'on voit d'un arbre en train d'être torché.
    brulee: brut >= CHARBONNE_A,
    chandelle: brut >= CHANDELLE_A,
    opacite: 1,
    hauteur: 1,
  };
}

/** À quel avancement du torchage l'écorce est noircie, puis l'arbre une chandelle. */
export const CHARBONNE_A = 0.2;
export const CHANDELLE_A = 0.7;
