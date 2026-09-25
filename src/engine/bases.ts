/**
 * Les bases échangeables, et la dérive du pH qui en découle (issue #71).
 *
 * Le pH était une **constante** que seul le joueur pouvait changer : `phInitial`
 * posé par la station, le chaulage qui le remonte, et rien d'autre. Le moteur
 * savait déjà exclure une espèce hors de sa gamme de pH (`facteurGammePh`,
 * critère C7) : la conséquence était en place, c'est la cause qui manquait.
 *
 * ## Le pH cesse d'être un état, il devient une **lecture**
 *
 * Ce fichier ne fait pas dériver le pH par incréments. Il tient un pool de
 * **bases échangeables** — calcium, magnésium, potassium, sodium fixés sur le
 * complexe argilo-humique — et le pH se lit sur le taux de saturation de ce
 * complexe. C'est le sens physique du pH d'un sol, et ça fait **tomber** trois
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
 * ## Le budget est stratifié, et il **circule** (#170)
 *
 * Deux pools : la surface et le sous-sol. Chaque horizon reçoit l'altération
 * qu'il produit — le fond en fait 63 à 79 % du total, parce qu'il fait les deux
 * tiers de l'épaisseur —, la surface reçoit en plus les dépôts atmosphériques
 * et ce que la litière rend, elle **lessive vers le fond** au lieu de lessiver vers
 * le néant, les racines pompent au fond, et c'est en passant sous la zone
 * racinaire qu'une base quitte la parcelle.
 *
 * Ce qui en sort, mesuré sur cinquante ans de limon riche : sans un arbre le
 * sous-sol trouve son équilibre (7,000 → 7,018) pendant que la surface décroche
 * (7,00 → 6,80) ; sous une hêtraie le fond baisse (→ 6,976) et la surface
 * décroche plus fort (→ 6,62) ; sous un frêne la surface tient 0,18 unité
 * au-dessus du sol nu. **C'est la végétation qui décide du sens**, et c'est
 * exactement ce que dit le critère C15.
 *
 * ## Ce que ce fichier ne fait pas, et il faut le dire
 *
 * **Le profil n'a que deux compartiments.** Un sol réel n'a pas une surface et
 * un fond, il a un gradient ; ce que ce fichier sait dire est « la surface
 * s'enrichit, le fond s'appauvrit », pas à quelle profondeur. C'est le plus
 * petit découpage qui exprime la pompe à bases, et il vaut mieux le dire
 * grossier que le maquiller *(à raffiner en N horizons le jour où l'azote, le
 * phosphore et le potassium le seront aussi — les quatre pools ont la même
 * plomberie et doivent bouger ensemble)*.
 *
 * **Personne ne lit encore le pool profond.** Le moteur sait dire que le fond
 * s'appauvrit ; il ne sait pas encore ce que l'appauvrissement fait aux racines
 * qui y poussent. Brancher le pH profond sur la tolérance des espèces demande
 * de décider ce qu'une racine ressent quand ses deux horizons diffèrent, ce qui
 * est une affirmation distincte et qui a besoin de sa propre mesure.
 *
 * **La boucle interne prélèvement ↔ litière n'est pas suivie en surface.** Les
 * bases qui montent dans les feuilles et redescendent à l'automne font un flux
 * plus gros que l'altération, mais tant qu'elles partent et reviennent au même
 * horizon, c'est une boucle : ce qui compte pour le complexe est le **budget**
 * (altération + dépôts − lessivage) et la charge acide nette. La suivre
 * demanderait un pool de bases par arbre, pour un résultat qui s'annule. Ce
 * n'est que la part **profonde** qui est un transport, et c'est elle, et elle
 * seule, que `prelevementProfondEq` débite.
 */

import type { Horizon } from "./soil";
import { densiteApparente } from "./soil";

/**
 * pH au bas de la gamme, là où le complexe passe à l'aluminium.
 *
 * Ce n'est pas un garde-fou de programmeur : c'est la **gamme tampon de**
 * **l'aluminium** d'Ulrich. Sous pH 4,2 environ, ce sont les hydroxydes
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
 * Elle sert à **démarrer** une partie sans rien déplacer. Les stations déclarent un
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
 * Capacité d'échange d'un horizon ramenée à la **surface**, eq/m².
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
 * Le même complexe, mais pour **tout ce qui est sous l'horizon de surface**, eq/m².
 *
 * L'ordre de grandeur, mesuré sur le limon riche : le sous-sol (65 cm) porte
 * 779 000 eq/ha de capacité contre 520 000 pour l'horizon de surface (35 cm).
 * Le fond est le gros réservoir, et c'est bien pour ça qu'un arbre peut y
 * puiser cinquante ans sans le vider — 8 100 eq/ha sous hêtraie, soit 1,2 %.
 */
export function capaciteEchangeProfondeEqM2(profil: readonly Horizon[]): number {
  let eq = 0;
  for (let h = 1; h < profil.length; h++) {
    const horizon = profil[h];
    if (horizon) eq += capaciteEchangeEqM2(horizon);
  }
  return eq;
}

/**
 * La même capacité vue comme une **densité**, cmol+/kg, moyennée sur le sous-sol au
 * prorata des masses de terre.
 *
 * `lessivageBasesEq` a besoin des deux formes : le stock (eq/m²) pour savoir ce
 * qu'il y a à perdre, la densité (cmol+/kg) pour savoir avec quelle force le
 * complexe le retient. Une moyenne pondérée par l'épaisseur seule dirait faux
 * dès qu'un horizon est plus caillouteux ou plus dense que l'autre.
 */
export function capaciteEchangeProfondeCmolKg(profil: readonly Horizon[]): number {
  let masse = 0;
  let cmol = 0;
  for (let h = 1; h < profil.length; h++) {
    const horizon = profil[h];
    if (!horizon) continue;
    const m = horizon.epaisseurCm * 10 * densiteApparente(horizon) * (1 - horizon.pierrosite);
    masse += m;
    cmol += m * (50 * horizon.argile + 2 * horizon.moPct);
  }
  return masse > 0 ? cmol / masse : 0;
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
 * Comme pour le potassium (pk.ts), l'altération se produit dans **tout** le profil
 * et suit l'argile : un sable quartzeux n'a presque rien à libérer. Le plancher
 * est bas — cinq pour cent du taux d'une argile — parce qu'un podzol landais
 * n'est justement pas réalimenté, c'est toute son histoire *(à calibrer)*.
 *
 * Ce que le profil entier donne, mesuré : environ 290 eq/ha/an sur le limon
 * riche et 140 sur la lande. Avec les dépôts en face (120), l'entrée totale
 * reste **sous** le lessivage sorti (650 et 295) — c'est-à-dire qu'un sol forestier
 * qui ne reçoit rien de sa végétation se décalcifie lentement, et que **c'est
 * la litière qui décide du signe**. C'est le résultat qu'on cherchait : si
 * l'altération dominait, aucune essence ne pourrait acidifier quoi que ce soit.
 * Le premier jet le faisait — altération quadruplée par le facteur rhizosphère
 * et dépôts comptés le triple —, et tous les sols remontaient vers la
 * neutralité : un limon de 7,0 à 7,2 en cinquante ans, une lande de 4,5 à 5,0,
 * ce qu'aucune lande n'a jamais fait.
 */
export const ALTERATION_BASES_EQ_HA_AN_POUR_30CM = 450;

function alterationHorizonEqHaAn(h: Horizon): number {
  return (
    ALTERATION_BASES_EQ_HA_AN_POUR_30CM *
    (0.05 + 0.95 * h.argile) *
    (1 - h.pierrosite) *
    (h.epaisseurCm / 30)
  );
}

/** eq/ha/an → eq/m²/semaine. */
function parSemaine(eqHaAn: number): number {
  return eqHaAn / 10_000 / 52;
}

/**
 * Ce que libère l'**horizon de surface**, eq/m²/semaine.
 *
 * Jusqu'à l'issue #170 cette fonction sommait tout le profil et créditait la
 * surface, ce qui faisait remonter au jour des bases libérées à un mètre de
 * fond. Chaque horizon crédite désormais **son** pool : c'est ce qui permet au
 * sous-sol d'avoir un budget, et pas seulement un compteur de prélèvement.
 */
export function alterationBasesSurfaceEqM2Semaine(profil: readonly Horizon[]): number {
  const h = profil[0];
  return h ? parSemaine(alterationHorizonEqHaAn(h)) : 0;
}

/**
 * Ce que libère tout ce qui est **sous** l'horizon de surface, eq/m²/semaine.
 *
 * C'est la plus grosse part, et de loin : 63 à 79 % du total selon la station,
 * parce que le sous-sol fait les deux tiers de l'épaisseur du profil. Le lui
 * rendre change la nature du pool profond — il cesse d'être un compteur de
 * pompe pour devenir un budget qu'on peut mettre en défaut.
 */
export function alterationBasesProfondeEqM2Semaine(profil: readonly Horizon[]): number {
  let eqHaAn = 0;
  for (let i = 1; i < profil.length; i++) {
    const h = profil[i];
    if (h) eqHaAn += alterationHorizonEqHaAn(h);
  }
  return parSemaine(eqHaAn);
}

/**
 * Dépôts atmosphériques de bases, eq/ha/an — et ce qu'il faut n'y **pas** compter.
 *
 * Le premier jet retenait 300, en additionnant poussières calcaires, embruns et
 * particules agricoles. C'est trop, et pour une raison chimique : **les embruns
 * n'apportent aucune alcalinité nette.** Le sodium et le magnésium de la mer
 * arrivent avec leurs anions, chlorure en tête ; c'est un sel neutre, il
 * traverse le complexe et ressort au drainage. Seule la fraction **non marine** —
 * carbonates des poussières, calcium des particules agricoles — ajoute
 * réellement des bases.
 *
 * Ce que l'erreur faisait, mesuré : la lande sèche **remontait** de 4,50 à 4,56 en
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
 * **Ce n'est pas la constante du potassium, et la première version l'avait
 * reprise telle quelle — au prix d'une erreur de trois ordres de grandeur.** La
 * même forme, oui ; la même valeur, non, et la raison est dans les stocks : le
 * potassium **échangeable** du moteur est un petit pool mobile, quand les bases du
 * complexe font un demi-million d'eq/ha. Appliquer le taux du potassium à ce
 * stock-là faisait fuir des dizaines de milliers d'eq/ha/an, et un limon
 * neutre tombait au plancher d'acidité en vingt-cinq ans — mesuré, et
 * évidemment faux.
 *
 * La valeur ci-dessous est calée sur le **flux**, qui lui est mesuré : le lessivage
 * de bases sous forêt tempérée se compte en quelques centaines d'eq/ha/an,
 * c'est-à-dire à peine plus que l'altération, ce qui est bien la raison pour
 * laquelle un sol met des siècles à se décalcifier *(à calibrer sur un budget
 * de bases complet)*.
 *
 * **Elle n'a pas été retouchée quand le budget a été stratifié (#170), et le
 * balayage qui le justifie vaut d'être écrit.** La cascade fait sortir du
 * profil 817 eq/ha/an sur le limon riche là où la surface seule en sortait 650,
 * et la dérive du sol nu passe de 0,125 à 0,203 unité en cinquante ans. La
 * tentation était de baisser la rétention pour revenir aux anciens chiffres.
 * Mesuré sur quatre valeurs (0,0023 / 0,0015 / 0,0011 / 0,0008), c'est
 * impossible : dès 0,0016 le limon **acide** cesse de se décalcifier et remonte, et
 * à 0,0011 la lande sèche remonte aussi — c'est-à-dire l'erreur exacte que la
 * calibration des dépôts avait servi à corriger. Aucune valeur ne satisfait les
 * deux bouts. Ce qui coinçait n'était donc pas la constante mais un **seuil**
 * **d'essai** calé sur le moteur ; cf. `bases.test.ts`.
 */
export const RETENTION_BASES = 0.0023;

/**
 * Lessivage des bases : elles partent avec l'eau qui draine, d'autant moins que
 * le complexe est fourni. Même forme que le potassium (`lessivagePotassiumG`) —
 * c'est la même physique, le potassium **est** une de ces bases — mais pas la même
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
 * **acidifie**, mg/g de matière sèche.
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
 * près un demi-gramme de carbone. Le moteur suit la litière en **carbone**
 * (`litterCG`), les teneurs se publient en matière **sèche** ; ce facteur fait le
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
 * Elle n'est pas choisie : elle est **déduite** du seuil ci-dessus, pour que la
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
 * On ne lit **aucun** nom d'espèce ni aucun type de feuillage : seulement le
 * calcium déclaré à l'atlas. C'est ce qui fait que le mécanisme n'a pas d'avis
 * sur les résineux — et c'est heureux, parce que la littérature non plus : dans
 * des peuplements appariés, la litière d'épicéa contient **deux fois** plus de
 * calcium que celle du pin sylvestre, et la pruche se place au-dessus du chêne
 * rouge. « Résineux » n'est pas une grandeur chimique.
 */
export function effetLitiereEq(carboneDecomposeGM2: number, calciumMgG: number): number {
  const net =
    basesLitiereEq(carboneDecomposeGM2, calciumMgG) - carboneDecomposeGM2 * CHARGE_ACIDE_PAR_G_C;
  return net * AMPLIFICATION_CHARGE;
}

/**
 * Ce qu'un complexe peut réellement **tamponner** d'une charge acide, eq/m².
 *
 * Un stock de bases échangeables ne peut pas être négatif : quand il est vide,
 * ce sont les protons et l'aluminium qui occupent les sites. `effetLitiereEq`
 * rend un effet négatif quand la litière est sous le seuil de calcium — le
 * mécanisme est juste, une litière pauvre acidifie — mais il était encaissé
 * **sans plancher**, si bien que le pool descendait sous zéro et que tout ce qui
 * se calcule dessus partait avec lui.
 *
 * Ce que ça coûtait, mesuré (#234). Lande sèche, station telle qu'elle est
 * déclarée, cent cinquante ans, une graine : la première cellule bascule à
 * l'**an 58** — exactement quand la lande se boise, 1630 tiges à l'an 45 contre
 * 3226 à l'an 58 — et la moyenne de la parcelle franchit zéro vers l'an 105
 * pour finir à **−5,4 eq/m²**. Et le stock impossible se propageait :
 * `lessivageBasesEq` rend, sur un stock négatif, un lessivage **négatif**, que le
 * tick **ajoute** au pool profond. Le sous-sol perdait des bases qui n'avaient
 * jamais existé — 19 % de sa perte sur la période, 0,53 des 2,75 eq/m².
 *
 * **Personne ne l'avait vu parce que le pH est borné et que le pool ne l'était
 * pas** : `phDepuisSaturation` ramène la saturation dans `[0,1]`, donc le pH lu
 * restait au plancher, parfaitement correct, pendant que le stock plongeait. Or
 * le pH est la seule grandeur que le reste du moteur consulte. Et le budget des
 * bases **passait** : il était cohérent avec lui-même. Il comptait simplement un
 * stock physiquement impossible — ce qui est le défaut que C14 ne pouvait pas
 * attraper.
 *
 * Ce que cette fonction rend n'est donc **pas** un `Math.max(0, …)` déguisé : la
 * part que le complexe n'a pas pu neutraliser ne disparaît pas du bilan, elle
 * est comptée à part (`basesAcideNonTamponneEqHa`). Borner sans ce poste aurait
 * remplacé une création de bases négatives par une **destruction d'acidité**, ce
 * qui est le même défaut dans l'autre sens.
 *
 * Ce qu'elle ne fait pas, et c'est un autre lot : **modéliser ce que cette
 * acidité devient**. En réalité, sous un certain taux de saturation, ce n'est
 * plus le complexe qui encaisse mais la matrice minérale, et elle relargue de
 * l'aluminium — toxique pour les racines. C'est la gamme tampon d'Ulrich que
 * `PH_PLANCHER` nomme déjà sans la simuler. Le poste de sortie dit **combien**
 * de protons y arrivent ; il ne dit pas ce qu'ils y font.
 */
export function acideTamponnable(stockEq: number, chargeAcideEq: number): number {
  return Math.min(Math.max(0, chargeAcideEq), Math.max(0, stockEq));
}

/**
 * Les bases que **porte** une litière, eq/m² : son calcium, converti en charges.
 *
 * C'est le terme positif de `effetLitiereEq`, sorti pour être réutilisé — et
 * ce n'est pas une commodité de programmeur. Ce calcium-là est compté **deux**
 * **fois** dans le moteur, aux deux bouts du même voyage : rendu à la surface
 * quand la feuille se décompose, et retiré du sous-sol quand l'arbre l'y a
 * pris. Les deux doivent lire la même grandeur, sans quoi la pompe fabrique ou
 * détruit du calcium selon le sens du vent.
 */
export function basesLitiereEq(carboneGM2: number, calciumMgG: number): number {
  return ((carboneGM2 / PART_C_LITIERE) * (calciumMgG / 1000)) / G_CALCIUM_PAR_EQ;
}

/**
 * **la pompe à bases** : ce qu'un arbre retire au sous-sol, eq/m² (critère C15).
 *
 * Le calcium d'une litière n'arrive pas de nulle part — l'arbre est allé le
 * chercher, et il l'a cherché là où sont ses racines. D'où la forme : les
 * bases de la litière, multipliées par la part du système racinaire qui
 * travaille **sous** l'horizon de surface.
 *
 * ## Ce qui est prélevé au fond, et ce qui ne l'est pas
 *
 * Ce que l'arbre prend dans l'horizon de **surface** n'est pas débité, et c'est
 * délibéré : il le rend au même endroit en perdant sa feuille, donc la boucle
 * s'annule (cf. l'en-tête de ce fichier). Seule la part profonde est un
 * **transport**, et c'est celle-là qui appauvrit quelque chose.
 *
 * ## Pourquoi le débit n'est **pas** amplifié
 *
 * La surface reçoit `(calcium − protons) × AMPLIFICATION_CHARGE`, un budget de
 * **protons** dont le calcium n'est qu'un terme. Ici on déplace du calcium, une
 * masse : elle ne se multiplie pas par trois en descendant d'un horizon. Les
 * deux nombres ne sont donc pas symétriques, et ils n'ont pas à l'être — ils
 * ne disent pas la même chose. Conséquence pratique, et c'est ce que le banc
 * vérifie : **le budget de surface se referme sans aucun terme de pompe**. Ce
 * que l'arbre remonte n'atteint la surface que par la litière.
 *
 * ## Ce qu'aucun nom d'espèce ne décide
 *
 * `calciumMgG` et la profondeur des racines sont deux traits de l'atlas, lus
 * par individu. Le frêne (16 mg/g, 120 cm) est le pompeur de manuel, la
 * callune (3,5 mg/g, 40 cm) son exact opposé — et ni l'un ni l'autre n'est
 * écrit ici.
 */
export function prelevementProfondEq(
  carboneLitiereGM2: number,
  calciumMgG: number,
  partRacinesProfondes: number,
): number {
  return basesLitiereEq(carboneLitiereGM2, calciumMgG) * partRacinesProfondes;
}

/**
 * Ce par quoi il faut multiplier le budget calcium pour obtenir la charge
 * réelle.
 *
 * Le calcium de la litière n'est qu'**un** terme du budget de protons d'un sol. La
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
 * jour où le budget de protons sera écrit, ce facteur doit **disparaître**)*.
 */
export const AMPLIFICATION_CHARGE = 3;

/**
 * **d'où viennent les vingt-six valeurs de** `litiere.calciumMgG`.
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
 *    litière qui explique le pH du sol, le calcium échangeable, le **taux de**
 *    **saturation**, la vitesse de dégradation du plancher forestier et
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
 * | pin sylvestre | 3,8 | peuplements appariés : l'épicéa fait **deux fois** le pin sylvestre, et la pruche de Dijkstra donne 7,6 pour un résineux |
 * | chêne-liège, châtaignier | 6 | congénère ou essence de sol acide, calés sur le chêne |
 * | houx, arbousier | 7 / 5,5 | sclérophylles à feuille coriace, placés sous les feuillus tendres |
 * | ajonc, genêt, callune | 4,5 / 5 / 3,5 | les formatrices de mor, au plancher de la gamme — la callune podzolise, c'est le fait de terrain le plus massif des landes |
 * | bouleau | 9 | essence dite améliorante sans l'être franchement : posé **au seuil**, donc neutre |
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
