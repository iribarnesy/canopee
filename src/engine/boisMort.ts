/**
 * La chute des chandelles, et ce qu'un tronc fait par terre.
 *
 * Un arbre mort tenait debout des années puis quittait la parcelle sans rien
 * laisser : son carbone passait dans un pool global, indifférent à l'endroit
 * où l'arbre avait vécu. C'est deux fois faux. Un tronc qui s'abat tombe
 * QUELQUE PART, dans une direction, et ce qu'il devient — humus, abri,
 * obstacle à l'eau, écrasement de ce qui poussait dessous — se joue sur les
 * quelques mètres carrés qu'il recouvre, pas sur la parcelle entière.
 *
 * Le bois mort AU SOL n'est pas non plus le même objet que le bois mort
 * DEBOUT. Il se décompose plus vite, parce qu'il touche la terre et reste
 * humide, là où une chandelle sèche au vent ; et il n'abrite pas les mêmes
 * espèces (les pics veulent du debout, les carabes et les salamandres du
 * couché). D'où deux stocks distincts plutôt qu'un seul.
 */

import type { GridDims } from "./grid";
import { rngFloat, rngStateFromSeed } from "./rng";

/**
 * Décomposition du bois mort AU SOL, par an. Plus rapide que les 5 % du bois
 * debout (`DEADWOOD_DECAY_PER_YEAR`, carbon.ts) : le contact avec le sol
 * apporte l'humidité et les décomposeurs, et c'est cette humidité qui limite
 * la décomposition d'une chandelle. Les chroniques de bois mort en forêt
 * tempérée donnent des temps de résidence de l'ordre de la décennie pour du
 * gros bois couché contre plusieurs décennies pour du bois sec sur pied ;
 * l'ordre de grandeur du rapport est solide, la valeur exacte l'est moins.
 */
export const DECOMPOSITION_AU_SOL_PAR_AN = 0.09;

/**
 * Pente à partir de laquelle la chute suit franchement l'aval, en %. En deçà,
 * le hasard garde sa part : un arbre de plaine tombe où son défaut le porte.
 * Au-delà, la gravité tranche.
 */
export const PENTE_ORIENTANT_LA_CHUTE_PCT = 40;

/**
 * Part de hasard qui SUBSISTE quand la pente est franche, ∈ [0,1] — ±63° de
 * dispersion autour de l'aval.
 *
 * Sans elle, la contrainte atteignait 1 et tous les arbres d'un versant raide
 * tombaient exactement dans l'axe de la pente. C'est faux, et la conséquence
 * était visible : plus un seul tronc en travers là où l'érosion fait le plus de
 * dégâts, donc un mécanisme de barrage éteint précisément où il compte.
 *
 * La littérature va dans ce sens et ne va pas plus loin. Rentch et al. (huit
 * peuplements de chênes anciens, *J. Torrey Bot. Soc.* 137) concluent que « la
 * forte variation des directions de chute empêche d'établir une relation
 * statistique constante » avec la pente ou le vent, et pointent l'asymétrie du
 * houppier comme troisième larron. Côté ripisylve, on ne mesure une tendance
 * nettement plus marquée vers l'aval qu'AU-DESSUS de 40 % de pente — d'où le
 * seuil ci-dessus, qui valait 30 sans source. La tendance est donc réelle, son
 * ampleur modeste, et elle n'efface jamais le hasard *(à calibrer : aucune de
 * ces sources ne publie d'écart-type angulaire directement réutilisable)*.
 */
export const DISPERSION_RESIDUELLE = 0.35;

/**
 * Part de la cellule qu'un mètre de tronc couche recouvre. Un tronc adulte
 * fait quelques dizaines de centimètres de diamètre : il masque une fraction
 * du mètre carré qu'il traverse, pas sa totalité.
 */
export const EMPRISE_PAR_METRE_DE_TRONC = 0.3;

/**
 * Carbone d'un mètre de tronc couché, kg C/m. Un tronc de trente centimètres
 * de diamètre fait environ 0,07 m³ par mètre ; à 500 kg/m³ de bois sec dont la
 * moitié est du carbone, cela donne une quinzaine de kilos de carbone par
 * mètre. Cette densité linéique sert à relire une masse déposée comme une
 * LONGUEUR de tronc : un gros arbre couvre du terrain, une branchette non.
 */
export const MASSE_LINEIQUE_TRONC_KGC_PAR_M = 15;

/**
 * Direction dans laquelle une chandelle s'abat, en radians (0 = +x, sens
 * trigonométrique). Sur une pente marquée, l'arbre tombe vers l'aval ; à plat,
 * il tombe n'importe où. Entre les deux, le hasard est resserré autour de
 * l'aval à mesure que la pente se redresse — une seule formule, pas deux cas.
 */
export function directionDeChute(
  altitudes: readonly number[],
  dims: GridDims,
  x: number,
  y: number,
  graine: number,
): number {
  const { radians: aval, pentePct } = versLAval(altitudes, dims, x, y);
  const contrainte =
    (1 - DISPERSION_RESIDUELLE) * Math.min(1, pentePct / PENTE_ORIENTANT_LA_CHUTE_PCT);
  const ecart = (rngFloat(rngStateFromSeed(graine)).value * 2 - 1) * Math.PI;
  return aval + ecart * (1 - contrainte);
}

/**
 * Graine propre à une chute : l'identité de l'arbre et la semaine, mélangées.
 * Deux parties identiques font tomber le même arbre dans le même sens, et la
 * partie reste rejouable — mais la chute ne PUISE PAS dans le flux principal.
 *
 * Cette précaution n'est pas de la coquetterie. Le flux est unique et
 * séquentiel : un mécanisme qui y ajoute un seul tirage décale tous les
 * suivants, et trois conclusions écologiques du dépôt ont basculé le jour où
 * les chandelles ont commencé à tirer un angle. Elles ne mesuraient pas un
 * effet, elles lisaient un jet de dés particulier — mais le moteur n'a pas à
 * rebattre les cartes de tout le monde chaque fois qu'on lui ajoute une
 * mécanique.
 */
export function graineDeChute(idArbre: number, semaine: number): number {
  return (idArbre * 2654435761 + semaine * 40503) >>> 0;
}

/**
 * Azimut de la plus grande pente descendante et son intensité. Le gradient est
 * pris sur les voisines opposées (différences centrées) : c'est la pente du
 * terrain sous l'arbre, pas celle d'une seule voisine.
 */
export function versLAval(
  altitudes: readonly number[],
  dims: GridDims,
  x: number,
  y: number,
): { radians: number; pentePct: number } {
  const { widthM: w, heightM: h } = dims;
  // Le `Math.floor` n'est pas une précaution : un arbre a des coordonnées
  // FLOTTANTES, et sans lui l'index calculé tombait entre deux cases. Le
  // tableau rendait alors `undefined` pour ses quatre voisines, donc une pente
  // nulle, donc une chute au hasard — sur un versant à 60 % comme à plat. Le
  // test unitaire ne le voyait pas : il appelait avec des entiers.
  const a = (cx: number, cy: number) => {
    const ix = Math.min(w - 1, Math.max(0, Math.floor(cx)));
    const iy = Math.min(h - 1, Math.max(0, Math.floor(cy)));
    return altitudes[iy * w + ix] ?? 0;
  };
  const dzdx = (a(x + 1, y) - a(x - 1, y)) / 2;
  const dzdy = (a(x, y + 1) - a(x, y - 1)) / 2;
  const norme = Math.hypot(dzdx, dzdy);
  // Le gradient monte ; la chute descend : d'où le signe.
  return { radians: Math.atan2(-dzdy, -dzdx), pentePct: norme * 100 };
}

/** Une cellule recouverte par un tronc couché, et sur quelle longueur. */
export interface CelluleSousLeTronc {
  cellule: number;
  /** longueur de tronc reposant sur cette cellule, m */
  longueurM: number;
}

/**
 * Les cellules que le tronc recouvre en tombant : une ligne partant du pied,
 * longue de la hauteur de l'arbre. Ce qui sort de la parcelle est perdu pour
 * elle — un arbre de bordure couche la moitié de son tronc chez le voisin.
 */
export function empreinteDeChute(
  x: number,
  y: number,
  hauteurM: number,
  radians: number,
  dims: GridDims,
): CelluleSousLeTronc[] {
  const { widthM: w, heightM: h } = dims;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  // Un pas d'un demi-mètre : assez fin pour ne pas sauter une cellule en
  // diagonale, assez grossier pour ne pas coûter cher sur un tronc de 30 m.
  const PAS_M = 0.5;
  const parCellule = new Map<number, number>();
  for (let d = 0; d < hauteurM; d += PAS_M) {
    const cx = Math.floor(x + dx * d);
    const cy = Math.floor(y + dy * d);
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const i = cy * w + cx;
    parCellule.set(i, (parCellule.get(i) ?? 0) + Math.min(PAS_M, hauteurM - d));
  }
  return [...parCellule].map(([cellule, longueurM]) => ({ cellule, longueurM }));
}

/**
 * Un tronc qui tombe casse-t-il ce qui pousse dessous ? La règle est celle de
 * la masse : ce qui reçoit plus lourd que soi casse. Un semis disparaît sous
 * n'importe quel tronc, un baliveau plie sous une branche et casse sous un
 * chêne, un arbre adulte encaisse. Aucun seuil par espèce : c'est la masse des
 * deux protagonistes qui décide, et elle se lit déjà dans le carbone.
 */
export function ecrasePar(masseQuiTombeKgC: number, masseDeboutKgC: number): boolean {
  return masseQuiTombeKgC > masseDeboutKgC;
}

/**
 * Ce qu'un tronc couché ajoute à la couverture du sol de sa cellule, ∈ [0,1].
 * Il protège la terre de la pluie comme le ferait un paillage, et c'est un
 * effet reconnu du bois mort en travers de la pente : ce qui est dessous ne
 * part pas.
 *
 * Cet effet-là ne dépend PAS de l'orientation : un tronc couché dans le sens
 * de la pente abrite la terre sous lui exactement comme un tronc en travers.
 * C'est le barrage qui demande d'être en travers, pas le paillage.
 */
export function couvertureDuBoisAuSol(longueurM: number): number {
  return Math.min(1, longueurM * EMPRISE_PAR_METRE_DE_TRONC);
}

/**
 * Longueur de tronc couché portée par une cellule, m, relue depuis sa masse
 * de carbone (g C/m²). Une cellule fait un mètre carré : cette longueur est
 * donc aussi une densité linéique, m de tronc par m².
 */
export function longueurDeTroncM(boisAuSolCG: number): number {
  return boisAuSolCG / 1000 / MASSE_LINEIQUE_TRONC_KGC_PAR_M;
}

/**
 * TRANSVERSALITÉ d'un tronc, ∈ [0,1] : le sinus de l'angle entre son axe et la
 * direction que suit l'eau. C'est le cœur du sujet et c'est de la géométrie,
 * pas un réglage — un tronc en travers oppose toute sa longueur au courant, un
 * tronc dans le sens de la pente n'en oppose rien et fait même gouttière. La
 * valeur absolue parce qu'un tronc n'a pas de sens : couché vers l'est ou vers
 * l'ouest, il barre pareil.
 *
 * Ce n'est pas une invention du moteur : c'est la « longueur efficace »
 * Lₑ = sin φ × L d'Adams, Dixon, Wilcox & McWethy (2023), *Earth Surface
 * Processes and Landforms* 48 : 1665-1678, équation (1), reprise de Myronidis
 * et al. (2010), où φ est le plus petit angle entre l'axe du tronc et la
 * direction de l'écoulement.
 */
export function transversalite(radiansTronc: number, radiansAval: number): number {
  return Math.abs(Math.sin(radiansTronc - radiansAval));
}

/**
 * Sinus en deçà duquel un tronc ne barre plus rien : sin 30°.
 *
 * Les essais sur table basculante d'Adams et al. (2023) — dix-huit passages,
 * six orientations, trois inclinaisons — ne trouvent AUCUNE accumulation
 * derrière un tronc orienté à moins de 30° de la direction du courant, et rien
 * du tout en deçà de 15° de la ligne de plus grande pente, quelle que soit
 * l'inclinaison. Les relevés de terrain disent la même chose autrement : Smith
 * & Swanson (1987) au mont Saint Helens trouvent que plus de 90 % des troncs
 * qui stockent quelque chose font au moins 45° avec l'écoulement.
 *
 * La longueur efficace seule ne dirait pas ça — elle vaut encore la moitié à
 * 30°. Le seuil est un fait mesuré : sous cet angle l'eau longe le tronc au
 * lieu de buter dessus.
 */
export const SINUS_BARRANT_MINIMAL = 0.5;

/**
 * Efficacité barrante d'un tronc, ∈ [0,1] : sa longueur efficace, ramenée à
 * zéro sous le seuil de 30° et rééchelonnée au-dessus. Une seule formule, pas
 * un cas « en travers » et un cas « le long » — et c'est cette valeur-là, et
 * non le sinus brut, que le sol retient d'un tronc qu'on lui pose dessus.
 */
export function partBarrante(transversalite: number): number {
  return Math.max(0, (transversalite - SINUS_BARRANT_MINIMAL) / (1 - SINUS_BARRANT_MINIMAL));
}

/** Longueur de tronc EN TRAVERS portée par une cellule, m/m². */
export function longueurEnTraversM(boisAuSolCG: number, partEnTravers: number): number {
  return longueurDeTroncM(boisAuSolCG) * Math.min(1, Math.max(0, partEnTravers));
}

/* ─────────────────────────── Ce qu'un barrage fait ──────────────────────── */

/**
 * Diamètre du tronc que décrit `MASSE_LINEIQUE_TRONC_KGC_PAR_M`, m. Les deux
 * constantes parlent du MÊME objet — trente centimètres, 0,07 m³ par mètre,
 * 500 kg/m³ de bois sec à moitié carbone — et doivent bouger ensemble. Le
 * diamètre compte parce que c'est la hauteur du barrage : c'est lui, et non la
 * masse, qui fixe ce qu'un tronc peut retenir derrière lui.
 */
export const DIAMETRE_TRONC_M = 0.3;

/** Côté d'une cellule, m : une flaque ne remonte pas au-delà. */
const COTE_CELLULE_M = 1;

/**
 * Volume du coin amont d'un tronc couché, m³ par mètre de tronc EFFICACE.
 *
 * C'est l'équation (3) d'Adams, Dixon, Wilcox & McWethy (2023), « Fire-produced
 * coarse woody debris and its role in sediment storage on hillslopes », *Earth
 * Surface Processes and Landforms* 48 : 1665-1678, elle-même reprise de
 * Myronidis et al. (2010) pour les troncs posés sur courbe de niveau :
 *
 *   S = (d·Lₑ/2) · (d/tanθ − πd/4)
 *
 * un coin triangulaire de hauteur d qui remonte d/tanθ vers l'amont, moins le
 * demi-cylindre qu'occupe le tronc lui-même. Deux conséquences qu'on ne
 * choisit pas, elles sortent de la géométrie : plus la pente est raide, moins
 * le tronc retient (le coin est court), et au-delà de 52 % de tangente — soit
 * une pente de 127 % — il ne retient plus rien du tout, le tronc surplombe son
 * propre tas.
 *
 * *Adaptation à la grille* : le coin ne peut pas remonter au-delà de la cellule
 * où il est, sinon il empiéterait sur une cellule que le moteur traite à part.
 * L'extension amont est donc bornée à un mètre, ce qui plafonne le coin sur les
 * pentes douces. Sans cette borne il divergerait à plat *(à confirmer : la
 * borne est une commodité de maillage, pas un fait de terrain)*.
 *
 * Ordre de grandeur obtenu : 0,065 m³ par mètre efficace à 40 % de pente,
 * 0,11 m³ sur pente douce. C'est bien le bon ordre : Wagenbrenner, MacDonald &
 * Rough (2006), *Hydrological Processes* 20 : 2989-3006, mesurent sur 210
 * troncs du Colorado 16,3 m³/ha pour 680 m de tronc à l'hectare, soit 0,024 m³
 * par mètre posé et 0,049 m³ par mètre EFFICACE — leur longueur efficace ne
 * faisait que 49 % de la longueur posée. Robichaud, Pierson, Brown &
 * Wagenbrenner (2008), *Hydrological Processes* 22 : 159-170, mesurent 0,098 m³
 * derrière un tronc barrant une placette de 5 m, soit 0,020 m³/m.
 */
export function volumeDuCoinM3ParM(pentePct: number): number {
  const tan = pentePct / 100;
  if (tan <= 0) return 0;
  const d = DIAMETRE_TRONC_M;
  const remonteeM = Math.min(COTE_CELLULE_M, d / tan);
  return Math.max(0, (d * remonteeM) / 2 - (Math.PI * d * d) / 8);
}

/**
 * Part du coin géométrique qui sert vraiment. La géométrie dit ce qu'un coin
 * PEUT contenir ; le terrain dit ce qu'il contient effectivement, et c'est bien
 * moins — parce que l'eau contourne les bouts du tronc et le franchit bien
 * avant qu'il ne soit plein.
 *
 * Robichaud, Pierson, Brown & Wagenbrenner (2008), *Hydrological Processes*
 * 22 : 159-170, sont formels : « runoff and sediment were observed going over
 * the top and around the ends of the barriers **even when the barriers were
 * less than half filled** ». Sur vingt-neuf observations de franchissement,
 * trois seulement portaient sur un barrage plein et cinq sur un barrage à
 * moitié. Leur simulation de pluie n'a mobilisé que 7 % de la capacité de
 * stockage des troncs (10 % pour les fascines, 28 % pour les fossés).
 *
 * On retient 0,3, au-dessus de leurs 7 % de mobilisation ponctuelle mais bien
 * en dessous du coin théorique *(à calibrer — c'est la constante qui décide de
 * la force du mécanisme)*.
 */
export const PART_UTILE_DU_COIN = 0.3;

/**
 * Ce qu'un barrage peut ENCORE contenir, m³ sur sa cellule (donc par m²).
 *
 * Un tronc ne retient pas indéfiniment : son coin se remplit, et le jour où le
 * dépôt atteint le haut du tronc, l'eau et la terre passent par-dessus comme
 * s'il n'était pas là. Robichaud et al. (2008, *International Journal of
 * Wildland Fire* 17 : 255-273) ne trouvent aucun effet des barrages de bois
 * au-delà d'une pluie de temps de retour deux ans ; Napper (2006) relève que
 * leur stockage baisse de 10 à 15 % à chaque averse successive. C'est ce
 * plafond-là qui interdit à trois troncs d'arrêter une crue.
 *
 * L'ensevelissement se lit dans le colluvium déjà accumulé sur la cellule
 * (`epaisseurPerdueCm` négative), sans nouveau champ d'état : quand la cellule
 * a regagné l'équivalent d'un diamètre de tronc, le tronc est enterré.
 */
export function capaciteDuCoinM3M2(
  longueurEnTraversM: number,
  pentePct: number,
  depotAccumuleCm: number,
): number {
  if (longueurEnTraversM <= 0) return 0;
  const enfoui = Math.min(1, Math.max(0, depotAccumuleCm) / (100 * DIAMETRE_TRONC_M));
  return volumeDuCoinM3ParM(pentePct) * longueurEnTraversM * (1 - enfoui) * PART_UTILE_DU_COIN;
}

/**
 * Part de l'écoulement d'une cellule qu'un barrage INTERCEPTE, ∈ [0,1] : un
 * tronc plus court que la cellule laisse l'eau passer par ses bouts. Au-delà
 * d'un mètre de tronc en travers, la cellule est barrée sur toute sa largeur et
 * en rajouter ne barre pas davantage.
 */
export function interception(longueurEnTraversM: number): number {
  return Math.min(1, Math.max(0, longueurEnTraversM));
}

/**
 * Part maximale du ruissellement traversant qu'un barrage détourne vers le sol.
 *
 * La fourchette mesurée est large et toutes ses bornes tiennent debout :
 *
 *  - **−71 %** de lame et de débit de pointe pour un tronc unique en travers
 *    d'une placette de 5 × 20 m à 57 % de pente, sous pluie simulée à 26 mm/h
 *    (Robichaud, Pierson, Brown & Wagenbrenner 2008, *Hydrological Processes*
 *    22 : 159-170) ;
 *  - **−56 %** en méta-analyse sur neuf paires traité/témoin de barrages
 *    (Girona-García, Vieira, Silva, Fernández, Robichaud & Keizer 2021,
 *    *Earth-Science Reviews* 217 : 103611, taille d'effet −0,82, p < 0,05) ;
 *  - **−52 %** sur trois ans en bassin de l'Èbre (Badía, Sánchez, Aznar & Martí
 *    2015, *Geoderma* 237-238 : 298-307), avec une efficacité qui DÉCROÎT quand
 *    l'intensité de pluie monte ;
 *  - **−25 %** seulement en Calabre, où l'on s'est contenté de faire pivoter sur
 *    la courbe de niveau des troncs déjà tombés (Bombino et al. 2023,
 *    *Water* 15(13) : 2378).
 *
 * On prend 0,4, milieu de cette fourchette. Elle est mesurée sur des dispositifs
 * ENTRETENUS, calés dans une tranchée et remblayés ; un chablis posé sur ses
 * branches fait moins *(à confirmer)*.
 */
export const RETENUE_MAX = 0.4;

/**
 * Part du sédiment traversant qu'un barrage peigne.
 *
 * Robichaud et al. (2008, *Hydrological Processes* 22) mesurent 87 % d'efficacité
 * de piégeage à la première averse et moins de 50 % à la fin de la saison ; la
 * méta-analyse de Girona-García et al. (2021) donne −55 % d'érosion pour les
 * barrages (trente-huit paires, p < 0,01). On prend 0,6, entre les deux
 * *(à calibrer)*.
 */
export const PIEGEAGE_MAX = 0.6;

/**
 * Lame d'eau, mm, qu'un barrage de bois détourne du ruissellement.
 *
 * Deux termes, et il faut les deux : une EFFICACITÉ, qui dit quelle part du
 * courant le tronc met en flaque, et une CAPACITÉ, qui dit combien cette flaque
 * peut contenir. Sans le second, une ligne de troncs arrêterait une crue.
 *
 * *Approximation assumée* : la flaque est comptée une fois par semaine, alors
 * qu'elle se vide et se remplit à chaque averse. C'est donc l'estimation basse.
 */
export function lameRetenueMm(
  longueurEnTraversM: number,
  lameRuisseleeMm: number,
  pentePct: number,
  depotAccumuleCm: number,
): number {
  if (longueurEnTraversM <= 0 || lameRuisseleeMm <= 0) return 0;
  return Math.min(
    lameRuisseleeMm * RETENUE_MAX * interception(longueurEnTraversM),
    1000 * capaciteDuCoinM3M2(longueurEnTraversM, pentePct, depotAccumuleCm),
  );
}

/**
 * Terre, kg/m², qu'un barrage de bois retient derrière lui en une semaine.
 *
 * Même coin, mais rempli de terre au lieu d'eau : d'où la conversion par la
 * densité apparente de l'horizon qui se dépose. Et même plafond — le jour où le
 * coin est plein, le tronc ne piège plus.
 */
export function sedimentPiegeKgM2(
  longueurEnTraversM: number,
  enTransitKgM2: number,
  pentePct: number,
  depotAccumuleCm: number,
  densiteApparenteTM3: number,
): number {
  if (longueurEnTraversM <= 0 || enTransitKgM2 <= 0) return 0;
  return Math.min(
    enTransitKgM2 * PIEGEAGE_MAX * interception(longueurEnTraversM),
    capaciteDuCoinM3M2(longueurEnTraversM, pentePct, depotAccumuleCm) * densiteApparenteTM3 * 1000,
  );
}
