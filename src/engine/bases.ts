/**
 * Les bases échangeables, et la dérive du pH qui en découle (issue #71).
 *
 * Le pH était une CONSTANTE que seul le joueur pouvait changer : `phInitial`
 * posé par la station, le chaulage qui le remonte, et rien d'autre. Le moteur
 * savait déjà exclure une espèce hors de sa gamme de pH (`facteurGammePh`,
 * critère C7) : la conséquence était en place, c'est la cause qui manquait.
 *
 * ## Le pH cesse d'être un état, il devient une LECTURE
 *
 * Ce fichier ne fait pas dériver le pH par incréments. Il tient un pool de
 * BASES ÉCHANGEABLES — calcium, magnésium, potassium, sodium fixés sur le
 * complexe argilo-humique — et le pH se lit sur le taux de saturation de ce
 * complexe. C'est le sens physique du pH d'un sol, et ça fait TOMBER trois
 * choses qu'il aurait fallu écrire à la main :
 *
 *  - **un sable se chaule facilement et le perd vite**, une argile résiste dans
 *    les deux sens : la capacité d'échange est au dénominateur ;
 *  - **un sol déjà acide s'acidifie de moins en moins** : passé le bas de la
 *    gamme, le complexe est saturé d'aluminium et le pH ne bouge plus
 *    (gamme tampon de l'aluminium, Ulrich) ;
 *  - **le chaulage n'est plus un geste à effet fixe** : la même chaux monte un
 *    podzol de plus d'une unité et un limon argileux de deux dixièmes.
 *
 * ## Ce que ce fichier ne fait pas, et il faut le dire
 *
 * **La pompe à bases n'est pas tracée en profondeur.** La littérature est plus
 * retorse que l'intuition « les résineux acidifient » : Foltran et al. mesurent
 * après 63 et 82 ans de conversion que le HÊTRE acidifie le sol minéral profond
 * PLUS que l'épicéa (−0,5 unité en vingt ans), précisément parce qu'il remonte
 * les bases et les dépose en surface. Le moteur ne tient qu'un pool de SURFACE
 * — comme pour l'azote, le phosphore et le potassium —, donc il dit la première
 * moitié de cette histoire et pas la seconde. Écrit comme tel au référentiel.
 *
 * **La boucle interne prélèvement ↔ litière n'est pas suivie.** Les bases qui
 * montent dans les feuilles et redescendent à l'automne font un flux plus gros
 * que l'altération, mais c'est une boucle : ce qui compte pour le complexe est
 * le BUDGET (altération + dépôts − lessivage) et la charge acide nette. Suivre
 * la boucle demanderait un pool de bases par arbre, pour un résultat qui
 * s'annule.
 */

import type { Horizon } from "./soil";
import { densiteApparente } from "./soil";

/**
 * pH au bas de la gamme, là où le complexe passe à l'aluminium.
 *
 * Ce n'est pas un garde-fou de programmeur : c'est la GAMME TAMPON DE
 * L'ALUMINIUM d'Ulrich. Sous pH 4,2 environ, ce sont les hydroxydes
 * d'aluminium qui consomment les protons, le complexe n'a plus de bases à
 * céder, et une acidification supplémentaire ne fait presque plus bouger le
 * pH — elle libère de l'aluminium, ce qui est un autre problème (toxique pour
 * les racines) que ce fichier ne modélise pas.
 */
export const PH_PLANCHER = 4.1;

/**
 * pH atteint à saturation complète du complexe.
 *
 * Au-delà, un sol ne monte que s'il contient des carbonates libres — un autre
 * régime tampon, que le moteur ne modélise pas. C'est aussi, et ce n'est pas
 * un hasard, le plafond que le chaulage avait déjà (`actions.ts`).
 */
export const PH_SATURE = 7.5;

/**
 * Courbure de la relation pH ↔ taux de saturation.
 *
 * La relation est croissante et concave : les premiers pourcents de saturation
 * remontent peu le pH, les derniers beaucoup. Calée sur deux repères de sols
 * forestiers : un pH de 4,1 à 4,8 pour des sols granitiques à moins de 10 % de
 * saturation, et un pH de 4,8 (saturation « effective ») à 5,5 (saturation
 * « standard ») à 50 % de saturation. La forme ci-dessous donne 4,3 à 10 % et
 * 5,4 à 50 % *(à calibrer : les deux repères sont des faits, l'exposant qui les
 * relie est une convention)*.
 */
export const EXPOSANT_SATURATION = 1.4;

/** pH d'un sol dont le complexe est saturé à `part` ∈ [0,1]. */
export function phDepuisSaturation(part: number): number {
  const s = Math.min(1, Math.max(0, part));
  return PH_PLANCHER + (PH_SATURE - PH_PLANCHER) * s ** EXPOSANT_SATURATION;
}

/**
 * L'inverse : quelle saturation donne ce pH-là.
 *
 * Elle sert à DÉMARRER une partie sans rien déplacer. Les stations déclarent un
 * pH, pas un taux de saturation ; on inverse la courbe au premier tick pour que
 * `phInitial` soit reproduit à l'identique. Sans cette précaution, brancher ce
 * fichier aurait décalé le pH de départ de toutes les stations et de tous les
 * tests, ce qui n'est pas une dérive mais un bug.
 */
export function saturationDepuisPh(ph: number): number {
  const borne = Math.min(PH_SATURE, Math.max(PH_PLANCHER, ph));
  return ((borne - PH_PLANCHER) / (PH_SATURE - PH_PLANCHER)) ** (1 / EXPOSANT_SATURATION);
}

/**
 * Capacité d'échange d'un horizon ramenée à la SURFACE, eq/m².
 *
 * `capaciteEchange` (pk.ts) donne des cmol+/kg ; il faut la masse de terre
 * derrière. Un horizon de 30 cm à 1,3 de densité pèse 390 kg/m², donc un limon
 * à 12 cmol+/kg tient une cinquantaine d'eq/m², soit un demi-million d'eq/ha.
 * À comparer aux 500 à 1000 eq/ha/an que l'altération libère : **le complexe
 * représente des siècles de flux**, et c'est exactement pour ça que la
 * podzolisation se compte en décennies et le pH d'une partie en dixièmes.
 */
export function capaciteEchangeEqM2(h: Horizon): number {
  const cmolParKg = 50 * h.argile + 2 * h.moPct;
  const masseKgM2 = h.epaisseurCm * 10 * densiteApparente(h) * (1 - h.pierrosite);
  return (cmolParKg * masseKgM2) / 100;
}

/**
 * Libération de bases par altération de la roche, eq/m²/semaine.
 *
 * Les budgets de bases donnent 386 eq/ha/an en moyenne sur les sols étudiés,
 * 500 à 1000 sur la majeure partie de l'État de New York, jusqu'à 2000
 * localement ; un budget détaillé sous épicéa sur podzol donne Ca 2,4 + Mg 1,4
 * + K 0,3 + Na 2,3 kg/ha/an, soit environ 250 eq/ha/an — le bas de la
 * fourchette, ce qui est cohérent avec un sable podzolisé.
 *
 * Comme pour le potassium (pk.ts), l'altération se produit dans TOUT le profil
 * et suit l'argile : un sable quartzeux n'a presque rien à libérer. Le plancher
 * est bas — cinq pour cent du taux d'une argile — parce qu'un podzol landais
 * n'est justement pas réalimenté, c'est toute son histoire *(à calibrer)*.
 *
 * Ce que le profil entier donne, mesuré : environ 290 eq/ha/an sur le limon
 * riche et 140 sur la lande. Avec les dépôts en face (120), l'entrée totale
 * reste SOUS le lessivage sorti (650 et 295) — c'est-à-dire qu'un sol forestier
 * qui ne reçoit rien de sa végétation se décalcifie lentement, et que **c'est
 * la litière qui décide du signe**. C'est le résultat qu'on cherchait : si
 * l'altération dominait, aucune essence ne pourrait acidifier quoi que ce soit.
 * Le premier jet le faisait — altération quadruplée par le facteur rhizosphère
 * et dépôts comptés le triple —, et tous les sols remontaient vers la
 * neutralité : un limon de 7,0 à 7,2 en cinquante ans, une lande de 4,5 à 5,0,
 * ce qu'aucune lande n'a jamais fait.
 */
export const ALTERATION_BASES_EQ_HA_AN_POUR_30CM = 450;

export function alterationBasesEqM2Semaine(profil: readonly Horizon[]): number {
  let eqHaAn = 0;
  for (const h of profil) {
    eqHaAn +=
      ALTERATION_BASES_EQ_HA_AN_POUR_30CM *
      (0.05 + 0.95 * h.argile) *
      (1 - h.pierrosite) *
      (h.epaisseurCm / 30);
  }
  // eq/ha → eq/m², puis à la semaine.
  return eqHaAn / 10_000 / 52;
}

/**
 * Dépôts atmosphériques de bases, eq/ha/an — et ce qu'il faut n'y PAS compter.
 *
 * Le premier jet retenait 300, en additionnant poussières calcaires, embruns et
 * particules agricoles. C'est trop, et pour une raison chimique : **les embruns
 * n'apportent aucune alcalinité nette.** Le sodium et le magnésium de la mer
 * arrivent avec leurs anions, chlorure en tête ; c'est un sel neutre, il
 * traverse le complexe et ressort au drainage. Seule la fraction NON MARINE —
 * carbonates des poussières, calcium des particules agricoles — ajoute
 * réellement des bases.
 *
 * Ce que l'erreur faisait, mesuré : la lande sèche REMONTAIT de 4,50 à 4,56 en
 * cinquante ans, alors que c'est le type même du sol qui s'acidifie tout seul.
 * Et ce n'était pas cosmétique — le chêne-liège est exactement à sa borne de pH
 * sur cette station (gamme 4,5-8, donc facteur nul à 4,50) : deux centièmes de
 * pH le faisaient passer de « exclu » à « viable », ce qui change le
 * peuplement, donc le combustible, donc les incendies
 * *(à confirmer sur les relevés MERA de dépôts hors sel marin)*.
 */
export const DEPOSITION_BASES_EQ_HA_AN = 120;

/** Dépôts hebdomadaires, eq/m². */
export const DEPOSITION_BASES_EQ_M2_SEMAINE = DEPOSITION_BASES_EQ_HA_AN / 10_000 / 52;

/**
 * Force de rétention du complexe vis-à-vis des bases.
 *
 * **Ce n'est PAS la constante du potassium, et la première version l'avait
 * reprise telle quelle — au prix d'une erreur de trois ordres de grandeur.** La
 * même forme, oui ; la même valeur, non, et la raison est dans les stocks : le
 * potassium ÉCHANGEABLE du moteur est un petit pool mobile, quand les bases du
 * complexe font un demi-million d'eq/ha. Appliquer le taux du potassium à ce
 * stock-là faisait fuir des dizaines de milliers d'eq/ha/an, et un limon
 * neutre tombait au plancher d'acidité en vingt-cinq ans — mesuré, et
 * évidemment faux.
 *
 * La valeur ci-dessous est calée sur le FLUX, qui lui est mesuré : le lessivage
 * de bases sous forêt tempérée se compte en quelques centaines d'eq/ha/an,
 * c'est-à-dire à peine plus que l'altération, ce qui est bien la raison pour
 * laquelle un sol met des siècles à se décalcifier *(à calibrer sur un budget
 * de bases complet)*.
 */
export const RETENTION_BASES = 0.0023;

/**
 * Lessivage des bases : elles partent avec l'eau qui draine, d'autant moins que
 * le complexe est fourni. Même forme que le potassium (`lessivagePotassiumG`) —
 * c'est la même physique, le potassium EST une de ces bases — mais pas la même
 * échelle, cf. ci-dessus.
 */
export function lessivageBasesEq(
  stockEq: number,
  drainageMm: number,
  eauSolMm: number,
  cecCmolKg: number,
): number {
  const fractionEau = drainageMm / Math.max(1e-9, drainageMm + eauSolMm);
  const retention = cecCmolKg / (cecCmolKg + RETENTION_BASES);
  return stockEq * fractionEau * (1 - retention);
}

/**
 * Teneur en calcium de la litière au-dessous de laquelle sa décomposition
 * ACIDIFIE, mg/g de matière sèche.
 *
 * C'est le pivot du mécanisme, et il porte tout le tri entre espèces. La
 * décomposition d'une litière produit des acides organiques ; les bases que
 * cette même litière contient en neutralisent une partie. Une litière riche
 * entretient un mull et rend au complexe plus qu'elle ne lui prend ; une
 * litière pauvre fait un mor et acidifie.
 *
 * Le seuil est placé dans la zone de transition mull/moder mesurée : sur une
 * forêt de feuillus du nord-est américain, le calcium libéré par unité de
 * masse perdue va de 133 mmol/kg sous érable rouge et 147 sous chêne rouge à
 * 362 sous érable à sucre et 390 sous frêne blanc, avec le hêtre (183) et la
 * pruche (190) au milieu — soit, en mg/g, de 5,3 à 15,6. Le basculement
 * mull/moder se fait dans le bas de cette gamme *(à calibrer)*.
 */
export const CALCIUM_NEUTRE_MG_G = 9;

/**
 * Part de carbone d'une litière sèche : un gramme de matière sèche fait à peu
 * près un demi-gramme de carbone. Le moteur suit la litière en CARBONE
 * (`litterCG`), les teneurs se publient en matière SÈCHE ; ce facteur fait le
 * pont et rien d'autre.
 */
export const PART_C_LITIERE = 0.5;

/**
 * Masse de calcium pour un équivalent de charge, g/eq : 40 g/mol pour deux
 * charges. Ce n'est pas une constante à calibrer, c'est le tableau périodique.
 */
export const G_CALCIUM_PAR_EQ = 20;

/**
 * Charge acide d'une litière, eq par gramme de carbone décomposé.
 *
 * Elle n'est pas choisie : elle est DÉDUITE du seuil ci-dessus, pour que la
 * neutralité soit exacte par construction. Une litière à `CALCIUM_NEUTRE_MG_G`
 * produit en se décomposant exactement autant de protons que ses propres bases
 * en neutralisent ; au-dessus elle rend au complexe, en dessous elle lui prend.
 * Régler la neutralité à deux endroits aurait garanti qu'ils divergent.
 */
export const CHARGE_ACIDE_PAR_G_C = CALCIUM_NEUTRE_MG_G / 1000 / PART_C_LITIERE / G_CALCIUM_PAR_EQ;

/**
 * Effet net d'une litière sur le complexe, eq/m² : positif quand elle rend des
 * bases, négatif quand elle en consomme.
 *
 * On ne lit AUCUN nom d'espèce ni aucun type de feuillage : seulement le
 * calcium déclaré à l'atlas. C'est ce qui fait que le mécanisme n'a pas d'avis
 * sur les résineux — et c'est heureux, parce que la littérature non plus : dans
 * des peuplements appariés, la litière d'épicéa contient DEUX FOIS plus de
 * calcium que celle du pin sylvestre, et la pruche se place au-dessus du chêne
 * rouge. « Résineux » n'est pas une grandeur chimique.
 */
export function effetLitiereEq(carboneDecomposeGM2: number, calciumMgG: number): number {
  const basesRendues = (carboneDecomposeGM2 / PART_C_LITIERE) * (calciumMgG / 1000);
  const net = basesRendues / G_CALCIUM_PAR_EQ - carboneDecomposeGM2 * CHARGE_ACIDE_PAR_G_C;
  return net * AMPLIFICATION_CHARGE;
}

/**
 * Ce par quoi il faut multiplier le budget calcium pour obtenir la charge
 * réelle.
 *
 * Le calcium de la litière n'est qu'UN terme du budget de protons d'un sol. La
 * nitrification de l'azote de cette même litière en produit, la fuite d'acides
 * organiques du mor en produit, et les deux suivent le même flux de
 * décomposition — donc le même signal entre essences. Faute de les modéliser
 * séparément (il y faudrait un budget de protons complet, ce qui est un autre
 * lot), le terme net est multiplié.
 *
 * Trois, et pas un : sans lui, cinquante ans de hêtraie sur limon ne déplaçaient
 * le pH que de 0,05 unité, quand les essais de conversion mesurent 0,2 à 0,5
 * unité en vingt à quatre-vingts ans. Avec, on est dans la fourchette basse de
 * ce qui se mesure, ce qui est la bonne place pour un moteur dont la litière
 * elle-même est environ moitié moindre qu'en forêt réelle *(à calibrer, et le
 * jour où le budget de protons sera écrit, ce facteur doit DISPARAÎTRE)*.
 */
export const AMPLIFICATION_CHARGE = 3;

/**
 * D'OÙ VIENNENT LES VINGT-SIX VALEURS DE `litiere.calciumMgG`.
 *
 * Il faut le dire net : **quatre sont ancrées, les vingt-deux autres sont des
 * placements dans une gamme.** Ce n'est pas rien — la gamme, elle, est mesurée,
 * et le rang des essences ancrées l'est aussi — mais une fiche qui porte 13
 * plutôt que 12 porte un jugement, pas une mesure. Toutes sont marquées
 * *(à confirmer)* par ce commentaire, qui vaut pour la colonne entière.
 *
 * **Ce qui est mesuré :**
 *
 *  - *L'amplitude.* Reich et al. 2005 (Ecology Letters 8:811-818), jardin
 *    commun de quatorze essences en Pologne centrale, trente ans après
 *    plantation : la teneur en calcium de la litière varie **du simple au
 *    quadruple** entre essences. La colonne de l'atlas va de 3,5 à 16, soit un
 *    rapport de 4,6 — les deux extrêmes étant des sous-arbrisseaux de lande et
 *    un frêne, donc un peu au-delà des quatorze arbres du jardin.
 *  - *La chaîne causale elle-même*, par la même étude : c'est le calcium de la
 *    litière qui explique le pH du sol, le calcium échangeable, le TAUX DE
 *    SATURATION, la vitesse de dégradation du plancher forestier et
 *    l'abondance des vers de terre. Le mécanisme de ce fichier n'est donc pas
 *    une hypothèse : il a été mesuré en jardin commun.
 *  - *Le rang de quatre essences*, par Dijkstra (calcium du plancher forestier
 *    sous six essences, nord-ouest du Connecticut) : frêne blanc 390 et érable
 *    à sucre 362 mmol/kg de masse perdue, contre hêtre américain 183, pruche
 *    190, chêne rouge 147, érable rouge 133 — soit 15,6 à 5,3 mg/g.
 *
 * | Espèce de l'atlas | mg/g | Ce sur quoi elle repose |
 * |---|---|---|
 * | frêne | 16 | Dijkstra, *Fraxinus americana* : 390 mmol/kg = 15,6 |
 * | hêtre | 7,5 | Dijkstra, *Fagus grandifolia* : 183 mmol/kg = 7,3 |
 * | chêne pubescent | 6 | Dijkstra, *Quercus rubra* : 147 mmol/kg = 5,9 |
 * | pin sylvestre | 3,8 | peuplements appariés : l'épicéa fait DEUX FOIS le pin sylvestre, et la pruche de Dijkstra donne 7,6 pour un résineux |
 * | chêne-liège, châtaignier | 6 | congénère ou essence de sol acide, calés sur le chêne |
 * | houx, arbousier | 7 / 5,5 | sclérophylles à feuille coriace, placés sous les feuillus tendres |
 * | ajonc, genêt, callune | 4,5 / 5 / 3,5 | les formatrices de mor, au plancher de la gamme — la callune podzolise, c'est le fait de terrain le plus massif des landes |
 * | bouleau | 9 | essence dite améliorante sans l'être franchement : posé AU SEUIL, donc neutre |
 * | aulne, saule, charme, prunellier | 11-12 | feuillus à litière tendre, au-dessus du seuil |
 * | noyer, sureau, cornouiller, fusain, noisetier, aubépine, pommier, abricotier, troène, ronce | 10-15 | litières tendres de sols riches, placées haut |
 *
 * Ce qu'il faudrait pour lever le *(à confirmer)* : une table de teneurs
 * foliaires européennes essence par essence. Les synthèses existent ; aucune
 * n'a été ouverte ici.
 */

/**
 * Bases apportées par un chaulage, eq/m².
 *
 * Une tonne de chaux (CaCO₃) à l'hectare apporte 20 000 eq/ha de calcium :
 * 1000 kg / 50 g par équivalent. La dose retenue ici est celle d'un chaulage
 * d'entretien forestier, une tonne et demie à l'hectare — ce qui remonte un
 * limon d'environ un demi-point, comme le faisait la constante fixe qu'elle
 * remplace, et un sable podzolique de bien davantage *(à confirmer sur les
 * barèmes de chaulage forestier)*.
 */
export const CHAULAGE_EQ_M2 = 3;
