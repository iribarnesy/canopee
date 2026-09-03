/**
 * La nappe comme STOCK, et non plus comme décor (docs/regles.md §4.4).
 *
 * Jusqu'ici l'eau qui traversait le profil disparaissait : le « drainage »
 * sortait du système, et la profondeur de nappe était un champ figé déduit du
 * terrain et de l'eau libre. Deux conséquences, dont la seconde est grave :
 *
 *  - la nappe ne montait ni ne descendait ;
 *  - surtout, RIEN de ce que fait la végétation ne l'atteignait. Or une forêt
 *    transpire, et ce qu'elle transpire ne percole pas : elle FAIT BAISSER la
 *    nappe. Le fait est massif — dans les Landes de Gascogne, la pinède tient
 *    le plancher hydrique d'un pays de sables plats — et sa contrepartie
 *    l'est autant : après un incendie, la forêt ne pompe plus, la nappe
 *    remonte, et l'hiver suivant les zones brûlées s'inondent.
 *
 * Le modèle est celui d'un aquifère libre par cellule, posé sur un substratum
 * imperméable sous le profil de sol :
 *
 *  - il se RECHARGE de ce qui percole sous le dernier horizon ;
 *  - il ÉCHANGE avec le réseau régional, dans les deux sens. C'est le point
 *    important : à l'échelle d'une parcelle, le niveau d'une nappe n'est pas
 *    décidé localement mais par ce qui la draine à des kilomètres de là. Une
 *    parcelle plus chargée que ce niveau se vide vers la région ; un fond de
 *    vallée, lui, en REÇOIT — et c'est précisément pour cela qu'il est
 *    engorgé. La station déclare donc son niveau d'équilibre, qui est un
 *    relevé de terrain, et le moteur simule l'ÉCART à ce niveau ;
 *  - elle s'écoule aussi latéralement vers l'aval, de proche en proche ;
 *  - son niveau monte comme le stock divisé par la POROSITÉ DRAINABLE : dans
 *    un sable (15 %), cent millimètres d'eau font soixante-dix centimètres de
 *    battement ; dans une argile (5 %), deux mètres.
 *
 * Quand le niveau atteint la base du profil, la nappe entre dans le sol et le
 * mécanisme existant prend le relais — saturation imposée, exutoire bouché,
 * asphyxie des racines (eau_surface.ts). Il n'y a rien à ajouter pour que
 * l'inondation apparaisse : elle est le prolongement de la montée.
 */

import { subordinationAuRelief } from "./eau_surface";
import {
  conductiviteHorizonMmSemaine,
  porositeDrainageMm,
  profondeurTotaleCm,
  type SoilProfile,
} from "./soil";

/**
 * Épaisseur de l'aquifère sous le profil de sol, cm : de la base du sol au
 * substratum imperméable. Huit mètres — assez pour qu'un plateau bien
 * drainé puisse porter une nappe hors de portée des racines *(à calibrer, et à faire dépendre de la géologie le
 * jour où elle existera)*.
 */
export const EPAISSEUR_AQUIFERE_CM = 800;

/**
 * Vitesse d'échange avec le réseau régional, par semaine. Elle décide de la
 * fermeté avec laquelle la région tient le niveau : haute, la nappe locale ne
 * s'écarte jamais de son équilibre ; basse, elle vit sa vie. Trois pourcents par
 * semaine — une trentaine de semaines pour revenir — laissent au couvert
 * végétal de quoi peser sur le niveau, ce qui est le fait qu'on veut
 * représenter *(à calibrer)*.
 *
 * Le niveau réalisé se tient donc un peu AU-DESSUS du niveau déclaré, de la
 * hauteur qu'y met la recharge : les valeurs déclarées par les stations sont
 * calées pour que le niveau réellement atteint soit celui du terrain.
 */
export const ECHANGE_REGIONAL = 0.03;

/**
 * Ce que le réseau régional peut fournir au maximum, mm/semaine. Un fond de
 * vallée reçoit de la nappe amont, mais pas sans limite : vingt millimètres
 * par semaine — mille par an, soit l'équivalent d'une année de pluie en plus —
 * est déjà une alimentation de source généreuse *(à calibrer)*.
 *
 * Sans ce plafond, la boucle s'emballe : la nappe remonte dans un sol déjà
 * saturé, l'eau déborde en surface et s'en va, le déficit se recreuse, et la
 * région remet au pot — jusqu'à huit fois la pluie annuelle.
 */
export const APPORT_REGIONAL_MAX_MM = 20;

/**
 * Vitesse à laquelle le niveau RÉGIONAL suit ce qui arrive à la parcelle, par
 * semaine. Une nappe régionale met des années à bouger : un centième par
 * semaine, soit deux ans pour l'essentiel du chemin *(à calibrer)*.
 */
export const VITESSE_REGIONALE = 0.01;

/** Vidange latérale minimale et maximale, par semaine. */
export const VIDANGE_MINIMALE = 0.005;
export const VIDANGE_MAXIMALE = 0.1;

/**
 * Porosité drainable du matériau qui porte la nappe ∈ ]0,1[ : la part du
 * volume qui se remplit et se vide vraiment. C'est elle qui décide de
 * l'AMPLITUDE du battement — un même apport fait monter une nappe de sable
 * trois fois moins qu'une nappe d'argile.
 */
export function porositeDrainable(profil: SoilProfile): number {
  const fond = profil[profil.length - 1];
  if (!fond || fond.epaisseurCm <= 0) return 0.1;
  return Math.min(0.35, Math.max(0.02, porositeDrainageMm(fond) / (fond.epaisseurCm * 10)));
}

/**
 * Part du stock qui rejoint la cellule d'aval en une semaine. Une nappe
 * s'écoule d'autant plus vite que le matériau conduit bien et que le terrain
 * penche — Darcy, réduit à ce qu'un pas hebdomadaire peut porter.
 */
export function tauxDeVidange(profil: SoilProfile, pentePct: number): number {
  const fond = profil[profil.length - 1];
  if (!fond) return VIDANGE_MINIMALE;
  // Log de la conductivité : entre une argile et un sable il y a trois ordres
  // de grandeur, et une vidange ne varie pas dans ce rapport.
  const conduit = Math.max(0, Math.log10(Math.max(1, conductiviteHorizonMmSemaine(fond)))) / 3.4;
  const gradient = pentePct / 100;
  return Math.min(VIDANGE_MAXIMALE, Math.max(VIDANGE_MINIMALE, 0.3 * conduit * gradient));
}

/**
 * Capacité totale, mm d'eau : celle de l'aquifère PLUS celle du profil de sol
 * au-dessus. C'est ce qui permet à la nappe de monter DANS le sol au lieu de
 * buter sous lui — et donc d'affleurer, de l'engorger et de l'inonder. Sans
 * cela, une nappe pleine s'arrêtait pile à la base du profil et l'inondation
 * était structurellement impossible.
 */
export function capaciteAquifereMm(profil: SoilProfile): number {
  return (EPAISSEUR_AQUIFERE_CM + profondeurTotaleCm(profil)) * 10 * porositeDrainable(profil);
}

/**
 * Profondeur d'équilibre de la nappe, cm sous la surface : le niveau que le
 * réseau régional impose à la parcelle. C'est une donnée de terrain — une
 * station la déclare — et à défaut on la déduit de ce qu'elle dit déjà : une
 * remontée capillaire suppose une nappe à portée des racines, un exutoire lent
 * suppose une nappe qui ne se vide pas.
 */
export function profondeurEquilibreCm(
  profil: SoilProfile,
  remonteeNappeMmSemaine: number,
  drainageExterneMmSemaine: number,
  declaree?: number,
): number {
  if (declaree !== undefined) return declaree;
  const solCm = profondeurTotaleCm(profil);
  const parLaRemontee = Math.min(1, remonteeNappeMmSemaine / 12);
  const parLExutoire = Math.min(1, 20 / Math.max(1, drainageExterneMmSemaine));
  return solCm + (1 - Math.max(parLaRemontee, parLExutoire)) * EPAISSEUR_AQUIFERE_CM;
}

/**
 * Stock correspondant à une profondeur de nappe donnée, mm.
 * Un centimètre de matériau saturé retient `porosité × 10` mm d'eau.
 */
export function stockPourProfondeur(profondeurCm: number, profil: SoilProfile): number {
  const solCm = profondeurTotaleCm(profil);
  const satureeCm = Math.max(0, solCm + EPAISSEUR_AQUIFERE_CM - profondeurCm);
  return satureeCm * porositeDrainable(profil) * 10;
}

/** Profondeur de la nappe sous la surface, cm, pour un stock donné. */
export function profondeurPourStock(stockMm: number, profil: SoilProfile): number {
  const porosite = porositeDrainable(profil);
  if (porosite <= 0) return Number.POSITIVE_INFINITY;
  const satureeCm = stockMm / (porosite * 10);
  return Math.max(0, profondeurTotaleCm(profil) + EPAISSEUR_AQUIFERE_CM - satureeCm);
}

/**
 * Stock d'équilibre de la station, mm — celui vers lequel la région ramène la
 * parcelle, et le point de départ d'une partie.
 */
export function stockEquilibreMm(
  profil: SoilProfile,
  remonteeNappeMmSemaine: number,
  drainageExterneMmSemaine: number,
  declaree?: number,
): number {
  return stockPourProfondeur(
    profondeurEquilibreCm(profil, remonteeNappeMmSemaine, drainageExterneMmSemaine, declaree),
    profil,
  );
}

/**
 * Stock d'équilibre CELLULE PAR CELLULE, mm.
 *
 * Une nappe n'est pas une couche d'eau posée à profondeur constante sous le
 * terrain : c'est une surface, et elle est bien plus PLATE que la
 * topographie. Sous une butte elle est profonde, sous un creux elle affleure —
 * c'est ce qui fait les bas-fonds humides et les crêtes sèches d'un même
 * versant, et c'est exactement ce que le joueur dessine quand il creuse.
 *
 * De combien elle suit le terrain dépend du sol (`subordinationAuRelief`) : un
 * sable très conducteur porte une nappe presque horizontale — donc très
 * profonde sous les hauts —, une argile la garde perchée près de la surface
 * partout. La station déclare la profondeur à l'altitude MOYENNE de la
 * parcelle ; chaque cellule s'en écarte selon sa propre hauteur.
 */
export function stocksEquilibreParCellule(
  profil: SoilProfile,
  altitudesM: readonly number[],
  remonteeNappeMmSemaine: number,
  drainageExterneMmSemaine: number,
  declaree?: number,
): Float32Array {
  const n = altitudesM.length;
  const out = new Float32Array(n);
  const moyenne = altitudesM.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const base = profondeurEquilibreCm(
    profil,
    remonteeNappeMmSemaine,
    drainageExterneMmSemaine,
    declaree,
  );
  const suit = subordinationAuRelief(profil);
  for (let i = 0; i < n; i++) {
    // Une cellule un mètre au-dessus de la moyenne a sa nappe d'autant plus
    // bas — au prorata de ce que le sol laisse la nappe suivre le terrain.
    const ecartCm = ((altitudesM[i] ?? moyenne) - moyenne) * 100 * suit;
    out[i] = stockPourProfondeur(Math.max(0, base + ecartCm), profil);
  }
  return out;
}

/**
 * Nouveau niveau régional après une semaine, mm.
 *
 * Le niveau d'équilibre est une donnée exogène : il vient du réseau qui draine
 * la parcelle, à des kilomètres. Cela suffit tant que ce qui arrive à la
 * parcelle ne lui arrive qu'à elle. Mais quand tout un massif brûle — le cas
 * qui nous occupe — les alentours cessent eux aussi de transpirer, et le
 * niveau régional monte avec.
 *
 * `partSemblable` dit quelle part du bassin subit le même sort que la
 * parcelle : 0 pour une parcelle isolée dans un paysage inchangé, 1 quand elle
 * est représentative de tout son bassin. C'est le seul paramètre qui manquait
 * pour que l'échelle de l'événement compte.
 */
export function nouveauNiveauRegionalMm(
  regionalMm: number,
  stockMoyenParcelleMm: number,
  partSemblable: number,
): number {
  const part = Math.min(1, Math.max(0, partSemblable));
  return regionalMm + (stockMoyenParcelleMm - regionalMm) * part * VITESSE_REGIONALE;
}
