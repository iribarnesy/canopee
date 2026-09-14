/**
 * La dendrométrie : ce que mesure un arbre, et comment son volume s'en déduit.
 *
 * ─── LE DÉFAUT QUE CE MODULE CORRIGE ─────────────────────────────────────────
 * Le moteur portait deux allométries écrites séparément et jamais confrontées :
 * un volume en `0,015 h²` et un diamètre en `2 h`. Or le volume d'un tronc
 * s'écrit `V = f × g × h`, où `g` est la section à 1,30 m et `f` le FACTEUR DE
 * FORME — la part du cylindre circonscrit que le tronc occupe réellement. Par
 * construction `f < 1` : un tronc ne peut pas remplir plus que son cylindre.
 *
 * Le `f` que les deux fonctions du moteur impliquaient l'une pour l'autre
 * allait de 9,55 à 5 m de haut à 1,59 à trente mètres. Autrement dit, un arbre
 * du moteur pesait de 1,6 à 9,6 fois un CYLINDRE PLEIN de son propre diamètre.
 * Sur pied, une hêtraie de quatre-vingts ans affichait 2 388 m³/ha et 781 t C/ha
 * aérien, là où une futaie bien venue en porte de l'ordre de 400 m³/ha.
 *
 * Personne ne pouvait s'en apercevoir : le carbone n'est vérifié que par
 * CONSERVATION, et un stock faux d'un facteur six se conserve parfaitement.
 *
 * ─── LE PRINCIPE RETENU ──────────────────────────────────────────────────────
 * On ne recale pas un coefficient, on fait découler le volume de la géométrie.
 * Le diamètre de référence est CONSERVÉ tel qu'il était (`2 × hauteur`, soit un
 * élancement H/D de 50, ce qui est la valeur courante d'une tige forestière) :
 * ce n'est pas lui qui était faux. Le volume s'y conforme désormais au lieu de
 * le contredire.
 *
 * ─── CE QUI RESTE À FAIRE, ET C'EST UN AUTRE LOT ─────────────────────────────
 * L'élancement vaut 50 pour TOUT arbre, toujours : le diamètre n'est pas encore
 * une grandeur portée par l'individu. Tant qu'il ne l'est pas, un sujet de
 * verger et une perche de plantation serrée ont la même forme, et « serré =
 * élancé » (E10) reste hors de portée — comme la finesse du tri qu'une tempête
 * devrait opérer.
 */

/**
 * Facteur de forme d'une tige : la part du cylindre circonscrit qu'elle occupe.
 *
 * 0,5 est la valeur classique de la mensuration forestière pour une tige
 * feuillue ou résineuse de futaie *(à affiner par essence : les résineux
 * élancés montent un peu plus haut, les feuillus branchus un peu plus bas)*.
 */
export const FACTEUR_DE_FORME = 0.5;

/**
 * Ce que le branchage ajoute au volume de la seule tige, pour la BIOMASSE.
 *
 * La distinction n'existait pas : le moteur vendait en scierie le même volume
 * qu'il comptait en carbone, donc il vendait les branches au prix du tronc.
 * Elles pèsent pourtant, et c'est tout ce qu'on leur demande ici *(1,3 est
 * l'ordre de grandeur usuel d'un facteur d'expansion feuillu, à confirmer par
 * essence)*.
 */
export const EXPANSION_BRANCHES = 1.3;

/**
 * Élancement H/D d'une tige de futaie : hauteur en cm sur diamètre en cm.
 *
 * 50 est la valeur que portait déjà `diametreCm` sous la forme `2 × hauteur`,
 * et elle est raisonnable — un arbre de vingt mètres fait quarante centimètres
 * de diamètre. Ce qui manque, c'est qu'elle VARIE : de l'ordre de 30 pour un
 * sujet venu au large, de 90 à 100 pour une perche de peuplement serré, et
 * c'est cet écart qui décide du risque de chablis.
 */
export const ELANCEMENT_REFERENCE = 50;

/** Diamètre à 1,30 m d'une tige de cet élancement, cm. */
export function diametreDeReferenceCm(heightM: number): number {
  return (100 * Math.max(0, heightM)) / ELANCEMENT_REFERENCE;
}

/** Section à 1,30 m, m². */
export function sectionM2(diametreCm: number): number {
  const rayonM = Math.max(0, diametreCm) / 200;
  return Math.PI * rayonM * rayonM;
}

/** Volume de la TIGE, m³ — ce qui part en scierie ou en bûches. */
export function volumeTigeM3(heightM: number, diametreCm: number): number {
  return FACTEUR_DE_FORME * sectionM2(diametreCm) * Math.max(0, heightM);
}

/** Volume AÉRIEN, m³ — tige et branchage, ce qui porte la biomasse. */
export function volumeAerienM3(heightM: number, diametreCm: number): number {
  return volumeTigeM3(heightM, diametreCm) * EXPANSION_BRANCHES;
}

/**
 * ─── L'ÉLANCEMENT DEVIENT UNE PROPRIÉTÉ DE L'INDIVIDU ────────────────────────
 *
 * Le coefficient d'élancement H/D est L'indicateur du risque de chablis en
 * sylviculture française : au-dessus de 80, un peuplement est réputé fragile ;
 * en dessous de 70, stable. Tant qu'il vaut 50 pour tout arbre, le moteur ne
 * peut ni le dire ni le faire sentir.
 *
 * Ce qui le fait varier n'est pas l'essence mais la CONCURRENCE. Un arbre venu
 * au large épaissit : il a de la lumière partout, rien ne le presse de monter,
 * et il investit dans un tronc conique et ferme. Un arbre en peuplement serré
 * court après la lumière de ses voisins et file en hauteur sans grossir — c'est
 * la perche, et c'est elle qui casse.
 *
 * On module donc l'élancement MARGINAL — celui du bois déposé cette semaine —
 * par la lumière que l'arbre reçoit. Un individu garde ainsi la mémoire de son
 * histoire : ce qu'il a poussé à l'ombre reste élancé même s'il est dégagé
 * ensuite, ce qui est précisément ce qu'on observe après une éclaircie trop
 * tardive.
 *
 * *(Les deux bornes sont raisonnées à partir des fourchettes usuelles — 25 à 40
 * pour un sujet de plein vent, 90 à 100 pour une perche de plantation serrée —
 * et non tirées d'une table : à calibrer.)*
 */

/** Élancement d'un arbre venu au large : trapu, conique, ferme au vent. */
export const ELANCEMENT_AU_LARGE = 35;

/** Élancement d'une tige qui court après la lumière : la perche. */
export const ELANCEMENT_SOUS_COUVERT = 100;

/** Élancement que vise le bois déposé cette semaine, selon la lumière reçue. */
export function elancementCible(lumiere: number): number {
  const l = Math.min(1, Math.max(0, lumiere));
  return ELANCEMENT_SOUS_COUVERT + (ELANCEMENT_AU_LARGE - ELANCEMENT_SOUS_COUVERT) * l;
}

/**
 * Diamètre après une pousse de `dHauteurM`, cm. Le tronc s'épaissit à la
 * mesure de ce qu'il monte, divisé par l'élancement que la lumière lui impose.
 */
export function diametreApresPousse(
  diametreCm: number,
  dHauteurM: number,
  lumiere: number,
): number {
  if (dHauteurM <= 0) return diametreCm;
  return diametreCm + (100 * dHauteurM) / elancementCible(lumiere);
}

/** Élancement H/D d'un arbre, sans unité : hauteur et diamètre en cm. */
export function elancementDe(heightM: number, diametreCm: number): number {
  return diametreCm > 0 ? (100 * heightM) / diametreCm : Number.POSITIVE_INFINITY;
}
