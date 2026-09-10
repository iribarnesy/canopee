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

/** Opacité de la flamme, au plus fort du front. */
export const OPACITE_DE_LA_FLAMME = 0.92;

/**
 * Opacité de la cendre.
 *
 * Pas totale : le sol brûlé reste du SOL, et ce qu'il portait — un tronc
 * couché, une souche — doit rester lisible dessous. C'est aussi ce qui évite
 * qu'un incendie laisse un trou noir découpé au ciseau dans la parcelle.
 */
export const OPACITE_DE_LA_CENDRE = 0.78;

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
 * **Le front dépasse le dernier rang de sa largeur PLUS UN**, et l'essai a
 * attrapé le « plus un » : sans dépassement du tout, les dernières cellules
 * flamberaient encore à la fin de l'acte et le feu se figerait en pleine
 * flamme ; avec `RANGS_DU_FRONT` seulement, elles finissaient en BRAISE et non
 * en cendre, puisqu'il leur manquait le rang de refroidissement. L'état final
 * doit être celui que l'instantané d'après décrira : du sol brûlé.
 *
 * Extrait parce que TOUT ce qui dessine un incendie en dépend — la cendre, les
 * flammes, la fumée, les braises. Deux copies de cette formule et le panache se
 * décalerait du front d'un rang, ce qui se verrait tout de suite : de la fumée
 * là où il n'y a plus de feu.
 */
function teteDuFront(front: FrontDIncendie, avancement: number): number {
  const n = Math.min(front.brulees.length, front.rangs.length);
  let rangMax = 0;
  for (let i = 0; i < n; i++) rangMax = Math.max(rangMax, front.rangs[i] ?? 0);
  return Math.min(1, Math.max(0, avancement)) * (rangMax + RANGS_DU_FRONT + 1);
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
    if (depuis < RANGS_DU_FRONT) {
      // Dans le front : la flamme s'assombrit vers la braise à mesure qu'on
      // s'éloigne de sa tête.
      const part = depuis / RANGS_DU_FRONT;
      sorties.push({
        cellule,
        teinte: melanger(FLAMME, BRAISE, part),
        opacite: OPACITE_DE_LA_FLAMME,
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
export const OPACITE_DE_LA_FUMEE = 0.34;

/**
 * Sur quelle part du haut du panache la fumée se dilue.
 *
 * Un tiers : la bouffée garde sa densité pendant les deux tiers de sa montée,
 * puis s'efface. C'est ce qui donne une colonne et non un filet.
 */
export const DILUTION_DU_SOMMET = 0.34;

/** Opacité de la lueur posée au sol. */
export const OPACITE_DE_LA_LUEUR = 0.42;

/**
 * Hauteur d'une flamme de feu courant, en mètres.
 *
 * **C'est une convention de dessin, et elle est déclarée comme telle** : le
 * moteur sait ce qui a brûlé et dans quel ordre, il ne dit pas la hauteur de
 * flamme. Deux mètres et demi, c'est ce que fait un feu d'herbe haute — la
 * flamme monte à peu près à deux fois la hauteur du combustible. Ce qui serait
 * une INVENTION, en revanche, ce serait de la faire varier d'une cellule à
 * l'autre en prétendant montrer le combustible : `IncendieResult` ne porte pas
 * la charge par cellule (issue ouverte). Elle varie donc de ce que le rendu
 * sait vraiment — la position dans le front — et d'un battement.
 */
export const HAUTEUR_DE_FLAMME_M = 2.5;

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
export const MAILLE_DES_COLONNES_M = 12;

/**
 * Combien de colonnes de fumée au plus.
 *
 * Vingt-deux, et le premier jet en mettait douze. Mesuré sur la scène de
 * démonstration : le front traverse jusqu'à trente-deux mailles de douze mètres
 * à son plus large, et douze colonnes sur trente-deux donnaient un incendie à
 * cheminées — des panaches isolés au lieu d'une masse. Vingt-deux les fait se
 * rejoindre.
 */
export const COLONNES_MAX = 22;

/** Combien de bouffées dans une colonne. */
export const BOUFFEES_PAR_COLONNE = 16;

/** Jusqu'où monte le panache, en mètres. */
export const HAUTEUR_DU_PANACHE_M = 28;

/** Taille d'une bouffée au ras du feu, puis au sommet du panache, en mètres. */
export const BOUFFEE_LA_PLUS_PETITE_M = 3.5;
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
export const MAILLE_DE_LA_TRAINE_M = 11;
export const TRAINEES_MAX = 44;

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
export const OPACITE_DE_LA_TRAINE = 0.17;

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
 * parce qu'elle brille, pas parce qu'elle est grande. Un mètre dix la rend
 * visible sans qu'elle se lise comme un objet.
 */
export const TAILLE_DE_BRAISE_M = 1.1;

/** Combien de variantes de langue de flamme et de bouffée sont cuites. */
export const VARIANTES = 3;

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
): { cellule: number; part: number }[] {
  const n = Math.min(front.brulees.length, front.rangs.length);
  if (n === 0) return [];
  const tete = teteDuFront(front, avancement);
  const sorties: { cellule: number; part: number }[] = [];
  for (let i = 0; i < n; i++) {
    const depuis = tete - (front.rangs[i] ?? 0);
    if (depuis <= 0 || depuis >= RANGS_DU_FRONT) continue;
    sorties.push({ cellule: front.brulees[i] ?? 0, part: depuis / RANGS_DU_FRONT });
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
 * **Le moteur ne sait pas d'où vient le vent, et il faut le dire clairement.**
 * `ventExposition` est un SCALAIRE ∈ [0,1] — l'abri que les boisements voisins
 * donnent à la parcelle (`paysage.ts`) — et `WeekWeather` ne porte ni direction
 * ni vitesse de vent. Le §6.4 demande pourtant « un panache incliné par le
 * vent ». Il y a donc une grandeur qui manque, et l'issue #50 est ouverte pour
 * elle.
 *
 * **En attendant, la convention retenue est la seule qui ne soit pas une
 * invention : le vent est INFÉRÉ de l'avance nette du front.** Ce qui pousse un
 * feu, c'est le vent ; un front qui a globalement progressé vers le nord-est a
 * donc eu du vent de sud-ouest, et son panache penche vers le nord-est. La
 * direction se lit sur l'origine de l'incendie et sur les cellules qui flambent
 * à cet instant — deux données du moteur — et l'AMPLITUDE vient honnêtement de
 * `ventExposition` : un vallon abrité garde une colonne droite, un plateau
 * ouvert la couche.
 *
 * **Une seule direction pour tout l'incendie, et c'est une correction contre le
 * premier jet.** Il faisait pencher chaque colonne à l'opposé de l'origine,
 * localement : la capture montrait une gerbe qui s'ouvrait en éventail, c'est-à-
 * dire un vent qui souffle vers l'extérieur dans toutes les directions à la
 * fois. Un vent est uniforme sur un hectare ; les colonnes penchent donc toutes
 * du même côté, et c'est aussi ce qui les fait se rejoindre en altitude au lieu
 * de s'écarter.
 *
 * Un front parfaitement symétrique donne une avance nette nulle, donc une
 * colonne droite — et c'est la bonne lecture : ce feu-là n'a montré aucune
 * direction. Mesuré sur la scène de démonstration, l'avance nette vaut de 10 à
 * 23 % du rayon moyen du front, et 100 % à la fin, quand il ne reste que le
 * dernier coin à brûler.
 */
function penchantDuFront(
  flambent: readonly { cellule: number }[],
  origine: number,
  coteM: number,
  exposition: number,
): { dx: number; dy: number; force: number } {
  const force = 0.3 + 0.7 * Math.min(1, Math.max(0, exposition));
  const o = centreDe(origine, coteM);
  let sx = 0;
  let sy = 0;
  for (const f of flambent) {
    const c = centreDe(f.cellule, coteM);
    sx += c.x - o.x;
    sy += c.y - o.y;
  }
  const d = Math.hypot(sx, sy);
  // Au départ du feu, le front EST l'origine : la colonne monte droite, ce qui
  // est exactement ce qu'on voit d'un feu qui vient de prendre.
  if (d < 1e-6) return { dx: 0, dy: 0, force };
  return { dx: sx / d, dy: sy / d, force };
}

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
    const haut = Math.max(FLAMME_LA_PLUS_BASSE_M, HAUTEUR_DE_FLAMME_M * ondule * vigueur);
    const large = LARGEUR_DE_FLAMME_M * (0.75 + 0.5 * alea(f.cellule, 4));
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
  origine: number,
  exposition: number,
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
  const pente = penchantDuFront(flambent, origine, coteM, exposition);

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
