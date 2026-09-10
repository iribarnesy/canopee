/**
 * Le feu (docs/regles.md §7.4, ch5 « concevoir contre le FEU », ch8).
 *
 * Un incendie ne se déclenche pas au hasard : il faut du combustible sec et
 * continu. Il se propage de proche en proche, tue selon ce que chaque espèce
 * sait encaisser — l'écorce de liège traverse ce qui carbonise un pin — et
 * remet le compteur du carbone à zéro. Certaines espèces repartent de souche :
 * le feu ne les élimine pas, il les avantage.
 *
 * Tout l'aléa passe par le PRNG seedé : deux parties de même graine brûlent
 * aux mêmes semaines.
 */

import { getEspece } from "./especes";
import { crownRadiusM } from "./light";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import type { TreeState } from "./trees";

/** Semaines où un départ de feu est possible (fin de printemps → début d'automne). */
export const SAISON_FEU: readonly [number, number] = [18, 42];
/** Remplissage de l'horizon de surface sous lequel la végétation est sèche. */
const SECHERESSE_CRITIQUE = 0.12;
/** Température maximale à partir de laquelle la chaleur commence à compter, °C. */
const CHALEUR_SEUIL_C = 24;
/** Probabilité hebdomadaire de départ de feu quand tout est réuni *(à calibrer)*. */
const PROBA_DEPART_MAX = 0.015;
/** Combustible minimal pour qu'un feu prenne, en indice de charge. */
const CHARGE_MINIMALE = 0.2;
/** Charge au-delà de laquelle le feu passe à coup sûr (lande, résineux). */
const CHARGE_PROPAGATION_CERTAINE = 0.8;
/** Hauteur au-delà de laquelle un arbre est trop haut pour qu'un feu courant l'atteigne. */
const HAUTEUR_REFUGE_M = 12;
/**
 * Vitesse de vent, à 10 m, au-delà de laquelle le feu ne gagne plus rien à ce
 * que le vent forcisse, en m/s *(à calibrer)*.
 *
 * 6 m/s ≈ 22 km/h. L'ordre de grandeur est celui où les indices de danger
 * opérationnels comptent déjà le vent comme aggravant — bien avant les
 * « vents forts » de bulletin. Ce n'est pas un plafond physique : c'est le
 * point où ce modèle-ci cesse de savoir distinguer plus fort de très fort.
 */
const VENT_ATTISANT_MS = 6;
/**
 * Excentricité maximale de l'ellipse du front, atteinte à `VENT_ATTISANT_MS`
 * *(à calibrer)*.
 *
 * Volontairement modeste, et il faut dire pourquoi. Le modèle elliptique
 * chiffre une anisotropie de VITESSE de propagation ; ici le facteur pondère la
 * probabilité d'UN PAS de cellule, et les probabilités se composent le long du
 * chemin : un flanc à 0,5 par pas ne vaut pas 0,5 à dix cellules, il vaut
 * 0,5¹⁰. L'allongement réellement obtenu dépasse donc largement le rapport
 * nominal. Reprendre telle quelle une excentricité juste au sens du modèle de
 * vitesse (0,9 et au-delà à vent modéré) donnerait ici un trait d'une cellule
 * de large, pas une ellipse.
 *
 * À 0,5 : l'arrière inchangé, le flanc une fois et demie, la tête trois fois —
 * soit un rapport tête/arrière de 3 par pas.
 */
const EXCENTRICITE_MAX = 0.5;

/**
 * Le vent tel que le feu le lit : un cap et une vitesse.
 *
 * Le cap suit la convention « vers » de tout le moteur (`WeekWeather.ventVersRad`,
 * `directionRad`, `versLAval`) — la direction du mouvement, pas la provenance.
 */
export interface VentDuFeu {
  /** cap vers lequel le vent souffle, radians */
  readonly versRad: number;
  /** vitesse moyenne à 10 m, m/s */
  readonly vitesseMs: number;
}

/**
 * Absence de vent. Ce n'est pas « pas de donnée » mais un vent nul : à
 * `vitesseMs = 0` l'excentricité est nulle, le front est isotrope, et la
 * propagation retrouve exactement — tirage par tirage — celle d'avant que le
 * vent n'existe. C'est ce qui permet de tester la propagation sans vent.
 */
export const SANS_VENT: VentDuFeu = { versRad: 0, vitesseMs: 0 };

/** Excentricité du front pour une vitesse de vent donnée. 0 = feu en tache. */
export function excentriciteDuFront(vitesseMs: number): number {
  return EXCENTRICITE_MAX * Math.min(1, Math.max(0, vitesseMs) / VENT_ATTISANT_MS);
}

/**
 * Ce que le vent AJOUTE à un pas du front selon son cap, ≥ 1.
 *
 * Forme polaire de l'ellipse dont le point d'allumage occupe un FOYER — la
 * géométrie classique du comportement du feu, et un fait de terrain avant
 * d'être un modèle : un feu poussé par le vent s'allonge en ellipse, avance
 * vite en tête, moins sur les flancs, et recule à peine contre le vent.
 *
 *     f(θ) = (1 + e) / (1 − e·cos θ)
 *
 * avec θ l'angle entre le pas et le vent : (1 + e)/(1 − e) dans le vent (tête),
 * (1 + e) sur le flanc, 1 contre le vent (arrière). Les RAPPORTS sont ceux de
 * l'ellipse et c'est la partie sourcée ; ce qui est CHOISI ici, c'est où placer
 * le 1 — et il va sur l'arrière, de sorte qu'aucun cap ne brûle moins qu'il
 * n'aurait brûlé sans vent.
 *
 * Deux versions ont précédé celle-ci, et leurs deux erreurs disent pourquoi le
 * 1 est là :
 *
 * 1. Normalisé sur la TÊTE (donc plafonné à 1), tout pas se voyait RETIRER
 *    quelque chose et un feu venté brûlait moins qu'un feu par temps calme —
 *    l'inverse du fait à modéliser.
 * 2. Normalisé sur le FLANC, le défaut restait, en plus discret. `propager` est
 *    une percolation SANS BUDGET DE TEMPS : elle tourne jusqu'à épuisement. Dans
 *    un combustible saturé, le pas sous le vent passait DÉJÀ sans tirage, donc
 *    le bonus du vent y était perdu, tandis que la pénalité contre le vent,
 *    elle, mordait pour de bon. Le vent ne pouvait alors que retirer de la
 *    surface. C'est un test de conservation du carbone, écrit pour tout autre
 *    chose, qui l'a montré : son feu de chandelles ne nettoyait plus la
 *    parcelle.
 *
 * Ancrer le 1 sur l'arrière lève les deux : le vent ne peut plus qu'ajouter, la
 * forme reste l'ellipse, et un feu en combustible saturé brûle exactement ce
 * qu'il brûlait avant — mêmes cellules, aucun tirage consommé — parce que tous
 * les facteurs sont ≥ 1 et qu'aucun pas ne se met donc à tirer.
 *
 * Ce que ça surestime, et il faut le dire : un vrai feu d'arrière recule PLUS
 * lentement qu'un feu sans vent, les flammes étant couchées à l'écart du
 * combustible. Ici il recule à la même vitesse. C'est le prix de ne jamais
 * faire mentir le modèle dans le sens « le vent éteint les feux » *(à
 * calibrer)*. Un vent nul rend 1 partout.
 */
export function anisotropieDuFront(capDuPasRad: number, vent: VentDuFeu): number {
  const e = excentriciteDuFront(vent.vitesseMs);
  if (e <= 0) return 1;
  return (1 + e) / (1 - e * Math.cos(capDuPasRad - vent.versRad));
}

export interface ChargeCombustible {
  /** indice de combustible par cellule ∈ [0,~1,5] : herbe sèche + litière + ligneux */
  parCellule: number[];
  moyenne: number;
}

/**
 * Charge de combustible : ce qui peut brûler dans chaque cellule. L'herbe sèche
 * et la litière portent le feu au sol ; les espèces résineuses l'amplifient.
 */
/**
 * Ce qu'un couvert fermé retire au feu DE SURFACE.
 *
 * Sous une futaie feuillue dense, la litière reste humide : le couvert coupe le
 * soleil et le vent, et l'air y est saturé. C'est LA raison pour laquelle les
 * incendies français courent en pinède, en maquis et en lande, et presque
 * jamais en hêtraie — et non parce que le hêtre serait ininflammable en
 * laboratoire. Sans ce facteur, le moteur faisait brûler des hêtraies de
 * Touraine.
 *
 * La valeur portait « à calibrer » depuis le début. Elle ne le porte plus,
 * parce que la littérature opérationnelle du feu la chiffre par deux voies
 * indépendantes, et que les deux tombent au même endroit.
 *
 * LE VENT. Les modèles de comportement du feu appliquent au vent de référence
 * un « facteur d'ajustement » (*wind adjustment factor*) pour obtenir le vent à
 * hauteur de flamme. Rothermel (1983, *How to predict the spread and intensity
 * of forest and range fires*, USDA GTR INT-143, table II-6 p. 33) donne **0,4 à
 * 0,6 pour un combustible exposé** et **0,1 sous une futaie dense**, 0,2 sous
 * une futaie claire — un rapport de 0,17 à 0,25. Scott (2007), repris par
 * Andrews (2012, RMRS-GTR-266, table 7), le tabule directement sur le taux de
 * couvert : 0,30 entre 5 et 10 % de couvert, **0,10 au-delà de 50 %** — un
 * rapport de 0,33.
 *
 * L'HUMIDITÉ. Les mêmes tables corrigent l'humidité du combustible fin mort
 * selon l'ombrage : au cœur de la journée d'été, **+3 points d'humidité pour un
 * combustible ombragé à plus de 50 %** contre 0 pour un combustible exposé
 * (INT-143 table B p. 17), et +4 points dans la version indexée sur le couvert
 * (table D-1 p. 141). Mesuré en forêt tempérée, l'écart est du même ordre :
 * 8 points d'humidité de moins en peuplement ouvert qu'en peuplement fermé,
 * avec 7,8 °C de plus et 24 points d'humidité de l'air en moins (Breigenzer et
 * al. 2026, *Fire Ecology* 22:72).
 *
 * Trois dixièmes, donc — le rapport des vents, qui est le mécanisme le plus
 * fiable des deux. *(L'humidité, elle, s'efface au bout d'une longue
 * sécheresse : Estes et al. ne mesurent aucune différence d'humidité entre
 * peuplements éclaircis et non éclaircis pendant l'été californien. C'est une
 * raison de ne pas empiler les deux effets.)*
 */
export const PORTANCE_SOUS_COUVERT = 0.3;

/**
 * Coefficient du combustible de HOUPPIER, calé pour qu'une couronne isolée
 * porte exactement ce qu'elle portait avant.
 *
 * La charge en hauteur s'ajoutait à chaque recouvrement, sans plafond : dans un
 * peuplement fermé les couronnes se chevauchent, et une cellule finissait par
 * porter cinq fois la charge d'une lande — uniquement à cause du
 * chevauchement, pas de ce dont le couvert est fait. Le moteur en tirait la
 * conclusion inverse de la réalité française, où le feu court en pinède, en
 * maquis et en lande, et presque jamais en hêtraie.
 *
 * La charge sature donc en `1 − e^(−n)` avec `n` le nombre de couronnes qui
 * couvrent la cellule, multipliée par leur inflammabilité MOYENNE : une cellule
 * sous couvert est sous couvert, et ce qui la distingue est ce dont ce couvert
 * est fait. Le coefficient `0,9 / (1 − e⁻¹)` fait qu'à `n = 1` on retrouve
 * exactement l'ancienne valeur `0,9 × inflammabilité` — c'est ce qui permet de
 * corriger la forme SANS déplacer l'échelle sur laquelle la propagation est
 * calibrée. Seuls les peuplements denses changent, et c'est le but.
 */
export const SATURATION_HOUPPIER = 0.9 / (1 - Math.exp(-1));

/**
 * Charge de surface qu'il faut pour qu'un feu atteigne un houppier dont la base
 * est à UN mètre. Au-delà, l'exigence croît comme la puissance 3/2 de cette
 * hauteur.
 *
 * C'est l'amorçage de feu de cime, et il manquait : la charge des houppiers
 * entrait directement dans la propagation, comme si un feu rampant dans la
 * litière pouvait enflammer une cime à vingt mètres. Van Wagner (1977) a posé
 * le critère qui fait référence : le feu de surface doit dépasser une intensité
 * critique, et cette intensité croît comme la **puissance 3/2 de la hauteur de
 * base du houppier**. C'est la raison pour laquelle une futaie élaguée haut ne
 * passe pas en feu de cime là où un fourré s'embrase.
 *
 * *(La STRUCTURE — l'exposant 3/2 — est celle de Van Wagner et elle est solide.
 * Ses coefficients d'origine, eux, s'expriment en kW/m et en teneur en eau du
 * feuillage, deux grandeurs que ce moteur n'a pas : je n'ai pas pu récupérer la
 * publication d'origine pour les transcrire, et je ne les invente pas. La
 * constante ci-dessous est donc CALÉE, pas transcrite, sur un repère qu'on peut
 * discuter : une charge de surface de 1 — une lande sèche en plein soleil —
 * atteint un houppier dont la base est à quatre mètres. À confirmer.)*
 */
export const CHARGE_AMORCAGE_A_UN_METRE = 0.125;

/**
 * Part du houppier qu'un feu de surface donné peut réellement enflammer.
 *
 * La hauteur de base du houppier n'est pas un trait d'espèce : elle se calcule
 * par arbre, l'arbre élaguant lui-même ses branches basses passées sous leur
 * point de compensation (`baseHouppierCible`, light.ts). Un fourré d'ajoncs a
 * donc son houppier au ras du sol et le porte entièrement ; une futaie qui
 * s'est élaguée en grandissant met le sien hors d'atteinte.
 */
export function accessibiliteDuHouppier(baseHouppierM: number, chargeAuSol: number): number {
  if (baseHouppierM <= 0) return 1;
  const requise = CHARGE_AMORCAGE_A_UN_METRE * baseHouppierM ** 1.5;
  if (requise <= 0) return 1;
  return Math.min(1, chargeAuSol / requise);
}

export function portanceDuFeu(lumiereAuSol: number): number {
  return PORTANCE_SOUS_COUVERT + (1 - PORTANCE_SOUS_COUVERT) * Math.min(1, lumiereAuSol);
}

/**
 * Ce qu'une chandelle vaut comme combustible, par rapport au même arbre
 * vivant. Un tronc mort sur pied est du bois sec : il s'enflamme plus
 * facilement qu'un houppier vert, mais il n'en reste qu'un fût — plus de
 * feuillage, moins de matière *(à calibrer)*.
 */
export const BOIS_MORT_SUR_PIED = 1.4;

/**
 * Carbone de bois couché, g/m², au-delà duquel la cellule ne peut plus porter
 * davantage de gros combustible : cinq kilos de carbone par mètre carré, soit
 * environ un tronc de trente centimètres posé en travers.
 */
export const BOIS_AU_SOL_SATURATION_CG = 5000;

export function chargeCombustible(
  trees: readonly TreeState[],
  herbeCouverture: readonly number[],
  litterCG: readonly number[],
  coteM: number,
  lumiereAuSol?: readonly number[],
  boisAuSolCG?: readonly number[],
): ChargeCombustible {
  const n = coteM * coteM;
  const parCellule = new Array<number>(n).fill(0);
  // Deux compartiments, et c'est la distinction qui manquait. Les modèles de
  // comportement du feu (Rothermel 1983, Scott & Burgan 2005) séparent le
  // combustible de SURFACE — herbe, litière, bois couché — de celui du
  // HOUPPIER, parce que le couvert n'agit pas de la même façon sur les deux :
  // il maintient le premier humide et à l'abri du vent, mais il EST le second.
  const auSol = new Array<number>(n).fill(0);
  const inflammabiliteSomme = new Array<number>(n).fill(0);
  const houppiers = new Array<number>(n).fill(0);
  /** Somme des bases de houppier couvrant la cellule, pour en tirer la moyenne. */
  const baseSomme = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    // Herbe (sèche en été) + litière accumulée.
    auSol[i] = 0.6 * (herbeCouverture[i] ?? 0) + 0.4 * Math.min(1, (litterCG[i] ?? 0) / 300);
    // Le bois COUCHÉ compte aussi, mais pas comme de l'herbe : le gros bois
    // s'allume mal et porte mal le front — c'est un combustible qui fait
    // durer et chauffer, pas courir. D'où un poids plus faible et un seuil de
    // saturation bien plus haut : un tronc dépose des kilos de carbone sur son
    // mètre carré là où la litière s'y compte en centaines de grammes.
    auSol[i] =
      (auSol[i] ?? 0) + 0.25 * Math.min(1, (boisAuSolCG?.[i] ?? 0) / BOIS_AU_SOL_SATURATION_CG);
  }
  // Les couronnes ajoutent leur propre combustible sous elles — et les
  // CHANDELLES aussi, davantage même : un tronc mort sur pied est du bois sec,
  // fendillé, sans une goutte d'eau dedans. C'est ce qui fait qu'une parcelle
  // déjà passée au feu ou frappée par la sécheresse rebrûle mieux que celle
  // d'à côté (trees.ts).
  for (const tree of trees) {
    const morte = !tree.alive && tree.mortSemaine !== undefined;
    if (!tree.alive && !morte) continue;
    const espece = getEspece(tree.especeId);
    const r = Math.max(1, crownRadiusM(tree.heightM, espece.lumiere.houppierRatio));
    const x0 = Math.max(0, Math.floor(tree.x - r));
    const x1 = Math.min(coteM - 1, Math.floor(tree.x + r));
    const y0 = Math.max(0, Math.floor(tree.y - r));
    const y1 = Math.min(coteM - 1, Math.floor(tree.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - tree.x;
        const dy = y + 0.5 - tree.y;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * coteM + x;
          // Un résineux ajoute énormément sous lui (aiguilles, résine) ;
          // un feuillu frais, presque rien. On accumule ici de quoi calculer
          // une MOYENNE d'inflammabilité et un taux de recouvrement, pas une
          // somme : voir plus bas.
          inflammabiliteSomme[i] =
            (inflammabiliteSomme[i] ?? 0) +
            espece.feu.inflammabilite * (morte ? BOIS_MORT_SUR_PIED : 1);
          baseSomme[i] = (baseSomme[i] ?? 0) + (tree.baseHouppierM ?? 0);
          houppiers[i] = (houppiers[i] ?? 0) + 1;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    // L'ombre n'amortit QUE le compartiment de surface. L'amortir aussi en
    // hauteur rendait le modèle circulaire — plus un peuplement portait de
    // combustible, plus il faisait d'ombre, moins il pouvait brûler — et un
    // fourré d'ajoncs finissait par ne plus s'enflammer du tout.
    const portance = lumiereAuSol ? portanceDuFeu(lumiereAuSol[i] ?? 1) : 1;
    const chargeAuSol = (auSol[i] ?? 0) * portance;
    const nHouppiers = houppiers[i] ?? 0;
    // Le houppier ne compte que si le feu de surface peut l'atteindre : c'est
    // l'amorçage de feu de cime (`accessibiliteDuHouppier`). Un fourré porte
    // tout son couvert ; une futaie qui s'est élaguée en grandissant met le
    // sien hors de portée d'un feu rampant.
    const enHauteur =
      nHouppiers > 0
        ? SATURATION_HOUPPIER *
          ((inflammabiliteSomme[i] ?? 0) / nHouppiers) *
          (1 - Math.exp(-nHouppiers)) *
          accessibiliteDuHouppier((baseSomme[i] ?? 0) / nHouppiers, chargeAuSol)
        : 0;
    parCellule[i] = chargeAuSol + enHauteur;
  }
  let somme = 0;
  for (let i = 0; i < n; i++) somme += parCellule[i] ?? 0;
  return { parCellule, moyenne: somme / n };
}

export interface DepartFeu {
  rng: RngState;
  /** cellule de départ, ou undefined si rien ne s'allume cette semaine */
  origine?: number;
}

/**
 * Indice de risque d'incendie ∈ [0,1], calculé UNIQUEMENT à partir des
 * conditions du moment : sécheresse du sol de surface, chaleur, combustible
 * disponible et vent qui attise. Aucune station n'est déclarée « à feu » ou
 * « sans feu » — c'est le climat qui décide. Un limon du Nord n'atteint
 * pratiquement jamais ces conditions aujourd'hui, mais les atteindra si les
 * étés se réchauffent et s'assèchent : le risque remonte vers le nord tout
 * seul, comme dans la réalité (ch8).
 */
export function indiceRisqueFeu(
  secheresseSurface: number,
  tMaxC: number,
  chargeMoyenne: number,
  ventExposition: number,
): number {
  if (secheresseSurface > SECHERESSE_CRITIQUE || chargeMoyenne < CHARGE_MINIMALE) return 0;
  const fSecheresse = Math.min(1, (SECHERESSE_CRITIQUE - secheresseSurface) / SECHERESSE_CRITIQUE);
  const fChaleur = Math.min(1, Math.max(0, (tMaxC - CHALEUR_SEUIL_C) / 10));
  const fCombustible = Math.min(1, chargeMoyenne);
  // Le vent est arrivé dans la météo (`WeekWeather.ventMoyMs`) et ce facteur-ci
  // ne le lit VOLONTAIREMENT pas. Le remplacer par la vitesse hebdomadaire
  // reçue a été essayé, et c'était une erreur de deux façons :
  //
  // 1. C'est une recalibration écologique déguisée. Sous régime océanique la
  //    vitesse moyenne est MINIMALE en été, donc en pleine saison des feux :
  //    brancher la moyenne hebdomadaire faisait tomber la fréquence des
  //    départs d'un quart sur la lande, sans que personne l'ait décidé.
  // 2. C'est la mauvaise grandeur. Ce que ce facteur représente, c'est à quel
  //    point un site est exposé aux conditions qui font PARTIR un feu — donc
  //    une climatologie de rafales, pas une moyenne sur sept jours, laquelle
  //    efface précisément les journées de vent qui allument les incendies
  //    français.
  //
  // Le vent sert donc à la FORME du front (`propager`), pas au déclenchement.
  // Faire lire le vent au départ de feu demande une grandeur de rafale et une
  // recalibration assumée de `PROBA_DEPART_MAX` *(à instruire)*.
  const fVent = 0.5 + 0.5 * ventExposition;
  return fSecheresse * fChaleur * fCombustible * fVent;
}

/**
 * Le vent que la parcelle REÇOIT, m/s : le vent régional, rabattu par l'abri.
 * C'est lui qui pousse le front (`propager`), et lui que le rendu doit prendre
 * pour l'amplitude d'un panache ou d'un balancement de houppier.
 *
 * Les deux grandeurs ne sont pas interchangeables et c'était tout le problème :
 * `ventExposition` disait à quel point un site est découvert (0,1 = vallon
 * fermé, 1 = lande atlantique) sans jamais dire s'il ventait ce jour-là. Un
 * vallon abrité sous tempête reçoit plus qu'une lande par temps calme, ce
 * qu'un scalaire d'abri seul ne pouvait pas exprimer.
 */
export function ventRecuParLeSite(ventMoyMs: number, ventExposition: number): number {
  return Math.max(0, ventMoyMs) * Math.max(0, ventExposition);
}

/**
 * Un feu part-il cette semaine ? Le tirage est seedé : la même partie brûle
 * aux mêmes dates.
 */
export function departDeFeu(
  rng: RngState,
  semaineAnnee: number,
  secheresseSurface: number,
  tMaxC: number,
  charge: ChargeCombustible,
  ventExposition: number,
  coteM: number,
  frequentationHumaine = 1,
): DepartFeu {
  if (semaineAnnee < SAISON_FEU[0] || semaineAnnee > SAISON_FEU[1]) return { rng };
  const risque = indiceRisqueFeu(secheresseSurface, tMaxC, charge.moyenne, ventExposition);
  if (risque <= 0) return { rng };
  const tirage = rngFloat(rng);
  // Il ne suffit pas que les conditions soient réunies : il faut une SOURCE.
  // En France, la quasi-totalité des départs est d'origine humaine — mégot,
  // travaux, barbecue, ligne électrique — et non la foudre. À sécheresse et
  // combustible égaux, un massif isolé s'enflamme donc bien moins souvent
  // qu'un bois de lotissement (paysage.ts). Sans ce facteur, le moteur faisait
  // de l'autocombustion : une hêtraie de Touraine brûlait faute de quiconque
  // pour ne PAS y mettre le feu.
  if (tirage.value > PROBA_DEPART_MAX * risque * frequentationHumaine) {
    return { rng: tirage.state };
  }
  // Le départ n'est pas n'importe où : il se produit là où il y a de quoi
  // s'enflammer. On tire une cellule au prorata de sa combustibilité — un
  // fourré d'ajoncs part bien plus souvent qu'un sous-bois frais.
  const position = rngFloat(tirage.state);
  const total = charge.parCellule.reduce((somme, c) => somme + Math.max(0, c), 0);
  if (total <= 0) return { rng: position.state };
  let seuil = position.value * total;
  for (let i = 0; i < charge.parCellule.length; i++) {
    seuil -= Math.max(0, charge.parCellule[i] ?? 0);
    if (seuil <= 0) return { rng: position.state, origine: i };
  }
  return { rng: position.state, origine: coteM * coteM - 1 };
}

/**
 * Charge de combustible à laquelle un feu atteint son intensité maximale
 * *(à calibrer)*.
 */
const CHARGE_INTENSITE_MAX = 1.2;

/**
 * Intensité du feu sur une cellule ∈ [0,1], d'après ce qu'elle avait à brûler.
 *
 * C'est ELLE qui décide qui meurt, en face de la protection que `survitAuFeu`
 * accorde à chaque espèce : l'écorce de liège traverse ce qui carbonise un pin.
 * Elle vivait en une ligne anonyme au milieu du tick, ce qui obligeait
 * quiconque veut reproduire la sélection du moteur — un banc de scènes, le
 * rendu — à la recopier. Deux copies d'une règle dérivent ; elle a maintenant
 * un nom et un seul propriétaire.
 *
 * Le rendu peut la recalculer sans rien demander : `IncendieResult.charges`
 * porte la charge de chaque cellule brûlée, dans le même ordre que `brulees`.
 */
export function intensiteDuFeu(chargeLocale: number): number {
  return Math.min(1, Math.max(0, chargeLocale) / CHARGE_INTENSITE_MAX);
}

/**
 * Chance qu'une cellule s'enflamme quand le feu arrive à sa porte : elle suit
 * ce qu'elle a à offrir au feu. Une lande d'ajoncs ou une pinède s'embrasent à
 * coup sûr ; un sous-bois de feuillus frais et peu chargé éteint souvent le
 * front. C'est ce qui donne leur valeur aux coupures et au choix des essences
 * (ch5 « concevoir contre le FEU »).
 */
export function probabilitePropagation(chargeLocale: number): number {
  if (chargeLocale < CHARGE_MINIMALE) return 0;
  return Math.min(
    1,
    (chargeLocale - CHARGE_MINIMALE) / (CHARGE_PROPAGATION_CERTAINE - CHARGE_MINIMALE),
  );
}

/** Les quatre pas possibles du front, avec leur cap (+x = est, +y = nord). */
const PAS_DU_FRONT: readonly { dx: number; dy: number; capRad: number }[] = [
  { dx: -1, dy: 0, capRad: Math.PI },
  { dx: 1, dy: 0, capRad: 0 },
  { dx: 0, dy: -1, capRad: -Math.PI / 2 },
  { dx: 0, dy: 1, capRad: Math.PI / 2 },
];

/**
 * Propage le feu de proche en proche depuis l'origine. Chaque cellule prend
 * feu selon sa combustibilité — le front s'essouffle dans ce qui brûle mal et
 * fonce dans ce qui brûle bien — ET selon le CAP par lequel le front l'aborde :
 * sous le vent le pas passe presque toujours, contre le vent presque jamais.
 * C'est ce qui fait une ellipse au lieu d'une tache. Tirages seedés.
 *
 * Ce que ça change à l'empreinte des parties, et qui est assumé : la
 * probabilité d'un pas n'est plus celle de la seule cellule visée, donc un pas
 * qui tirait passe parfois librement maintenant, et l'ordre des tirages suit
 * l'ordre d'empilement, qui suit le vent. Toute partie où un feu court en
 * combustible MARGINAL est donc déplacée.
 *
 * Deux cas ne bougent pas, et ce n'est pas un hasard :
 * - `SANS_VENT` : excentricité nulle, anisotropie 1 partout, ordre d'empilement
 *   d'origine — propagation identique tirage par tirage à celle d'avant le vent.
 * - combustible SATURÉ : tous les facteurs valant ≥ 1, aucun pas ne tire, donc
 *   le même ensemble brûle sans consommer un seul tirage, comme avant.
 */
export function propager(
  origine: number,
  charge: ChargeCombustible,
  coteM: number,
  rng: RngState,
  vent: VentDuFeu = SANS_VENT,
): { brulees: Set<number>; rng: RngState } {
  const brulees = new Set<number>();
  const vues = new Set<number>();
  let etat = rng;
  // Le vent ne change pas pendant un incendie : l'ordre d'exploration se
  // calcule UNE fois. Et il compte, parce qu'une cellule n'est décidée qu'à sa
  // PREMIÈRE visite : atteinte d'abord par un pas de flanc, elle serait
  // refusée puis jamais retentée depuis la tête. On empile donc le pas le plus
  // sous le vent EN DERNIER — `file.pop()` dépile par la fin — pour que le
  // front explore d'abord là où il court vite, comme une tête de feu qui
  // prend de l'avance sur ses flancs.
  const pas =
    excentriciteDuFront(vent.vitesseMs) > 0
      ? [...PAS_DU_FRONT].sort(
          (a, b) => Math.cos(a.capRad - vent.versRad) - Math.cos(b.capRad - vent.versRad),
        )
      : PAS_DU_FRONT;
  // Le point d'allumage n'est pas un pas : rien ne l'a « abordé », le vent ne
  // peut donc rien lui retirer. D'où l'anisotropie neutre de sa première ligne.
  const file: { cellule: number; anisotropie: number }[] = [{ cellule: origine, anisotropie: 1 }];
  while (file.length > 0) {
    const tete = file.pop();
    if (tete === undefined || vues.has(tete.cellule)) continue;
    const cellule = tete.cellule;
    vues.add(cellule);
    const proba = probabilitePropagation(charge.parCellule[cellule] ?? 0) * tete.anisotropie;
    // Le vent n'allume rien qui n'ait de quoi brûler : l'anisotropie est un
    // FACTEUR, donc une cellule sous le seuil de charge reste à zéro, aussi
    // fort qu'il vente. C'est ce qui garde leur sens aux coupures.
    if (proba <= 0) continue;
    // `proba` peut dépasser 1 en tête de feu : pas de tirage, le pas passe —
    // exactement ce que faisait un combustible saturé avant que le vent existe.
    if (proba < 1) {
      const tirage = rngFloat(etat);
      etat = tirage.state;
      if (tirage.value > proba) continue; // le front s'éteint ici
    }
    brulees.add(cellule);
    const x = cellule % coteM;
    const y = Math.floor(cellule / coteM);
    for (const { dx, dy, capRad } of pas) {
      const vx = x + dx;
      const vy = y + dy;
      if (vx < 0 || vx >= coteM || vy < 0 || vy >= coteM) continue;
      file.push({ cellule: vy * coteM + vx, anisotropie: anisotropieDuFront(capRad, vent) });
    }
  }
  return { brulees, rng: etat };
}

/**
 * Un arbre survit-il au passage du feu ? L'écorce protège, la taille aussi
 * (un feu courant n'atteint pas la cime d'un grand arbre), l'intensité locale
 * décide du reste.
 */
export function survitAuFeu(tree: TreeState, intensite: number): boolean {
  const espece = getEspece(tree.especeId);
  const protectionTaille = Math.min(0.5, tree.heightM / HAUTEUR_REFUGE_M / 2);
  const protection = Math.min(0.97, espece.feu.resistanceEcorce + protectionTaille);
  return protection > intensite;
}

/**
 * Rang d'arrivée du front sur chaque cellule brûlée : sa distance à l'origine,
 * comptée en cellules à travers ce qui a brûlé. C'est ce qui permet de faire
 * COURIR une ligne de flammes au lieu de noircir un patch d'un coup.
 *
 * Passe pure et POSTÉRIEURE, et c'est ce qui la rend inoffensive : elle lit
 * l'ensemble déjà brûlé et ne consomme aucun tirage. `propager` dépile
 * (`file.pop()`) et l'ordre de consommation du PRNG en dépend, donc tout ce
 * qui touche à SON parcours déplace les parties — le vent l'a fait, en
 * connaissance de cause. Ici, rien : un simple BFS sur un ensemble figé, qui ne
 * peut par construction rien changer au résultat.
 *
 * Le rang reste une distance ISOTROPE en cellules, pas un temps d'arrivée.
 * Sous le vent, le front réel court plus vite en tête que sur les flancs, donc
 * deux cellules de même rang ne s'enflamment pas au même instant. C'est une
 * approximation assumée : la forme allongée, elle, est bien dans `brulees`.
 *
 * Chaque cellule brûlée est joignable depuis l'origine à travers des cellules
 * brûlées (le feu ne saute pas), donc tout l'ensemble est atteint.
 */
export function rangsDuFront(
  brulees: ReadonlySet<number>,
  origine: number,
  coteM: number,
): Map<number, number> {
  const rangs = new Map<number, number>();
  if (!brulees.has(origine)) return rangs;
  rangs.set(origine, 0);
  const file = [origine];
  for (let tete = 0; tete < file.length; tete++) {
    const cellule = file[tete];
    if (cellule === undefined) continue;
    const rang = (rangs.get(cellule) ?? 0) + 1;
    const x = cellule % coteM;
    const y = Math.floor(cellule / coteM);
    const voisins = [
      x > 0 ? cellule - 1 : -1,
      x < coteM - 1 ? cellule + 1 : -1,
      y > 0 ? cellule - coteM : -1,
      y < coteM - 1 ? cellule + coteM : -1,
    ];
    for (const voisin of voisins) {
      if (voisin < 0 || !brulees.has(voisin) || rangs.has(voisin)) continue;
      rangs.set(voisin, rang);
      file.push(voisin);
    }
  }
  return rangs;
}
