/**
 * **La glandée** (issue #197) — une production de semences, qui n'est pas une récolte.
 *
 * Mesuré avant ce lot, sur un peuplement mûr de vingt-cinq chênes de dix-huit
 * mètres, les cinquante-deux semaines de l'année :
 *
 *     fruitsKg = 0,0
 *
 * Le moteur savait qu'un pommier donne des pommes qu'on vend. Il ne savait pas
 * qu'un chêne donne des glands. Le bloc `fruits` de l'atlas décrit une **récolte**
 * — un prix au kilo, une fenêtre de cueillette, des semaines de fraîcheur — et
 * onze espèces sur vingt-six en portent un. Le chêne n'en a pas, le hêtre non
 * plus. Les deux notions partagent un mot et rien d'autre : **une glandée ne se
 * vend pas, elle tombe et elle nourrit.**
 *
 * D'où un bloc `semences` séparé sur la fiche, et ce module qui le lit.
 *
 * ─── **ce qui fait la glandée**, **et qui n'est pas la quantité** ────────────────────
 *
 * On pourrait croire qu'il suffisait d'écrire un rendement moyen. Ce serait
 * passer à côté du seul fait qui compte : une glandée est **synchrone et
 * irrégulière**. Les chênes d'un massif fructifient la même année, et cette
 * année-là dix à cinquante fois plus que les autres.
 *
 * Ce n'est pas une curiosité, c'est la stratégie : les mangeurs de graines sont
 * **noyés** une année sur quatre, et c'est comme ça que le chêne se régénère malgré
 * eux. Un rendement moyen et régulier donnerait l'inverse — une population de
 * prédateurs calée sur l'offre, qui mange tout, tous les ans.
 *
 * Le mécanisme ne tient donc que si les mangeurs sont dimensionnés par la
 * glandée de **l'an passé** (`PRELEVEMENT_PAR_LA_FAUNE`). Sans ce décalage d'un
 * an, une glandée irrégulière ne vaut pas mieux qu'une glandée régulière de
 * même total, et tout ce fichier ne serait qu'un détour. C'est mesuré :
 * `tests/ecology/glandee.test.ts`.
 *
 * ─── **aucun tirage dans le flux principal**, **et aucun état** ──────────────────────
 *
 * L'année pleine est tirée d'une graine locale dérivée de l'identifiant de la
 * partie et de l'année — même précaution et même forme que `graineDeChute`
 * (`boisMort.ts`) et `graineDeBoutis` (`sanglier.ts`). Une partie sans chêne ne
 * bouge pas d'un cheveu.
 *
 * Et rien n'est stocké : la production d'une année est une **fonction** de la
 * parcelle, de l'année et de la graine. La glandée de l'an passé se recalcule
 * avec les houppiers d'aujourd'hui, donc à un ou deux pour cent près (un
 * houppier grossit lentement) — une approximation assumée qui évite un champ
 * d'état, une migration de sauvegarde et un ordre de clés de plus.
 */

import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import { crownRadiusM } from "./light";
import type { TreeState } from "./trees";

/**
 * Semences tombées d'un arbre en un an, kg, pour un mètre carré de houppier —
 * **moyenne** pluriannuelle, années pleines et années creuses confondues.
 *
 * Le houppier plutôt que la tige : c'est la surface qui capte la lumière, donc
 * celle qui porte les fleurs, et c'est aussi elle qui module la production par
 * la taille de l'arbre sans qu'on ait à écrire une courbe d'âge. Un chêne qui
 * vient d'atteindre `maturiteAns` a un petit houppier et produit peu ; un
 * vétéran en produit vingt fois plus. Rien d'autre à dire.
 */
export interface Semences {
  /** kg de semences tombées par m² de houppier et par an, en **moyenne** */
  kgParM2HouppierAn: number;
  /**
   * Intervalle moyen entre deux glandées, années. 1 signifie « pas de
   * glandée » : une production régulière, année après année.
   */
  periodeAns: number;
  /**
   * Ce que porte une année pleine, en multiple de la moyenne. Doit rester sous
   * `periodeAns` : une année pleine ne peut pas porter plus que la période
   * entière n'en produit.
   */
  facteurAnneePleine: number;
}

/**
 * Ce que porte une année **creuse**, en multiple de la moyenne.
 *
 * Déduit, jamais déclaré, et c'est délibéré : la moyenne est ainsi conservée
 * par construction. Une glandée redistribue la production dans le temps, elle
 * ne la crée pas — sans quoi « à production totale égale » ne voudrait rien
 * dire et le témoin du lot serait faux.
 *
 *     periode × 1 = (periode − 1) × creux + pleine
 */
export function facteurAnneeCreuse(s: Semences): number {
  if (s.periodeAns <= 1) return 1;
  return Math.max(0, (s.periodeAns - s.facteurAnneePleine) / (s.periodeAns - 1));
}

/**
 * Graine propre à une année de glandée : l'espèce, l'année et la partie.
 *
 * L'espèce entre dans le hachage pour que chênes et hêtres ne fructifient pas
 * aux mêmes années — ils sont synchrones **chacun de son côté**, ce qui est le
 * fait. Et la partie y entre pour que deux parties ne voient pas la même suite
 * d'années pleines, ce que `graineDeChute` n'avait pas à faire (un identifiant
 * d'arbre varie déjà d'une partie à l'autre, une année non).
 */
export function graineDeGlandee(especeId: string, annee: number, graineParcelle: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < especeId.length; i++) {
    h = (h ^ especeId.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  h = (h + Math.imul(annee, 2654435761) + Math.imul(graineParcelle, 40503)) >>> 0;
  // **L'avalanche n'est pas une coquetterie, et l'essai l'a attrapée.** Les
  // graines locales voisines de ce dépôt (`graineDeChute`, `graineDeBoutis`)
  // s'arrêtent à la somme parce que leurs entrées balaient tout le domaine :
  // un identifiant d'arbre, un indice de cellule. Ici deux des trois entrées
  // sont minuscules — une année, et des parties qu'on numérote 1 et 2 dans un
  // essai. Sans ce brassage final, changer de partie déplaçait la graine de
  // quarante mille sur quatre milliards : deux parties voyaient les **mêmes**
  // années de glandée, sur deux siècles, et l'essai le montre.
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Cette année-là est-elle une année pleine pour cette espèce-là ?
 *
 * Tirage de Bernoulli à 1/`periodeAns`, donc des intervalles irréguliers de
 * moyenne `periodeAns`. **Ce que ça laisse de côté** : un vrai chêne vide ses
 * réserves en fructifiant et ne peut pas recommencer l'année suivante, si bien
 * que deux glandées d'affilée sont plus rares que ce tirage ne le dit (ici une
 * année sur seize pour le chêne, au lieu de presque jamais). Poser cette année
 * réfractaire demanderait de contraindre la fréquence en retour, et la
 * satiété des prédateurs — qui est le fait à reproduire — ne tient pas à
 * elle *(à instruire)*.
 */
export function estAnneePleine(
  especeId: string,
  semences: Semences,
  annee: number,
  graineParcelle: number,
): boolean {
  if (semences.periodeAns <= 1) return false;
  const g = graineDeGlandee(especeId, annee, graineParcelle);
  return g / 2 ** 32 < 1 / semences.periodeAns;
}

/** Ce que porte l'année, en multiple de la moyenne de l'espèce. */
export function facteurDeLAnnee(
  especeId: string,
  semences: Semences,
  annee: number,
  graineParcelle: number,
): number {
  if (semences.periodeAns <= 1) return 1;
  return estAnneePleine(especeId, semences, annee, graineParcelle)
    ? semences.facteurAnneePleine
    : facteurAnneeCreuse(semences);
}

/** Semences qu'un arbre laisse tomber dans l'année, kg. Zéro avant maturité. */
export function glandeeDeLArbreKg(espece: EspeceV0, arbre: TreeState, facteur: number): number {
  const semences = espece.semences;
  if (!semences || !arbre.alive) return 0;
  if (arbre.ageWeeks < espece.regeneration.maturiteAns * 52) return 0;
  const r = crownRadiusM(arbre.heightM, espece.lumiere.houppierRatio, arbre.diametreCm);
  return Math.PI * r * r * semences.kgParM2HouppierAn * facteur;
}

/**
 * Glandée d'une espèce sur toute la parcelle une année donnée, kg — et ce
 * qu'elle aurait valu une année moyenne, qui sert de référence à tout le reste.
 */
export function glandeeDeLaParcelleKg(
  arbres: readonly TreeState[],
  especeId: string,
  annee: number,
  graineParcelle: number,
): { produiteKg: number; moyenneKg: number } {
  const espece = getEspece(especeId);
  const semences = espece.semences;
  if (!semences) return { produiteKg: 0, moyenneKg: 0 };
  const facteur = facteurDeLAnnee(especeId, semences, annee, graineParcelle);
  let moyenneKg = 0;
  for (const arbre of arbres) {
    if (arbre.especeId !== especeId) continue;
    moyenneKg += glandeeDeLArbreKg(espece, arbre, 1);
  }
  return { produiteKg: moyenneKg * facteur, moyenneKg };
}

/**
 * Ce que les mangeurs de graines prélèvent l'année qui **suit** une glandée
 * moyenne, en multiple de cette glandée.
 *
 * Mulots, campagnols, écureuils, geais : en année ordinaire, la prédation des
 * glands est presque totale — les relevés de chênaies tempérées donnent
 * couramment 80 à 100 % de la fructification consommée ou cachée avant le
 * printemps, et c'est précisément pourquoi le chêne ne se régénère pas dans une
 * chênaie ordinaire *(à confirmer sur une série de relevés)*.
 *
 * Le décalage d'un an n'est pas un raffinement, **c'est le mécanisme** : une
 * population de rongeurs est dimensionnée par la nourriture de l'automne
 * précédent. Une glandée tombe donc sur des mangeurs calés sur une année
 * creuse, et elle passe.
 *
 * On applique le prélèvement espèce par espèce, comme si chaque essence avait
 * ses propres mangeurs. C'est une simplification : un mulot mange des glands et
 * des faînes indifféremment, et une glandée de chêne protège aussi les faînes
 * de l'année. *(À lever quand la faune en individus (#187) portera ses
 * ressources — ce prélèvement de fond est exactement ce qu'elle remplacera.)*
 */
export const PRELEVEMENT_PAR_LA_FAUNE = 0.9;

/**
 * Glands qu'un sanglier prélève en un an, kg.
 *
 * Le repère le plus net vient de l'élevage : dans la montanera ibérique, un
 * porc à l'engrais consomme six à dix kilogrammes de glands par jour pendant
 * deux à trois mois — quatre cents à neuf cents kilos sur la saison, et c'est
 * un animal qu'on gave exprès. Un sanglier sauvage est plus petit, mange
 * varié, et ne trouve la glandée au sol que quatre mois par an. On retient le
 * bas de cette fourchette, quatre cents kilos *(à calibrer)*.
 *
 * L'ordre de grandeur se recoupe par l'autre bout : deux à trois kilos de
 * nourriture par jour, la glandée dominant le régime d'automne et d'hiver, font
 * deux à trois cents kilos. Les deux lectures se tiennent à un facteur deux
 * près, ce qui est l'exactitude disponible ici.
 *
 * **Le sanglier ne suit pas la glandée de l'an passé, contrairement aux
 * rongeurs**, et c'est écrit dans `sanglier.ts` : son domaine vital fait cinq
 * cents à deux mille hectares, sa densité est imposée par le paysage, et ce que
 * porte une parcelle de quelques hectares ne la fixe pas. Il arrive avec un
 * appétit, pas avec une population.
 */
export const RATION_SANGLIER_KG_AN = 400;

/**
 * Ce qui reste d'une glandée après les mangeurs, kg.
 *
 * Forme exponentielle et pas une soustraction tronquée à zéro, pour la raison
 * que `sanglier.ts` a déjà payée : une grandeur posée sur une borne bascule
 * d'un extrême à l'autre pour un centième de rien. Ici elle fait mieux que
 * l'éviter, elle dit la bonne chose — un mangeur ne trouve pas la dernière
 * graine d'un tapis, et il ne trouve pas non plus la millième quand elles sont
 * partout.
 *
 * **Et c'est la même loi qu'avant, généralisée.** `partGlandeeRestante` valait
 * exp(−k × densité) : un prélèvement proportionnel à la densité, sur une
 * production supposée constante. On remplace la production supposée par la
 * production réelle, et rien d'autre.
 */
export function glandeeSurvivanteKg(
  produiteKg: number,
  produiteAnPasseKg: number,
  sanglierParHa: number,
  aireHa: number,
): number {
  if (produiteKg <= 0) return 0;
  const ration =
    PRELEVEMENT_PAR_LA_FAUNE * Math.max(0, produiteAnPasseKg) +
    RATION_SANGLIER_KG_AN * Math.max(0, sanglierParHa) * Math.max(0, aireHa);
  return produiteKg * Math.exp(-ration / produiteKg);
}

/**
 * Ce que la glandée survivante de l'année vaut pour la régénération, rapporté à
 * une année moyenne dont rien n'aurait été mangé.
 *
 * C'est le nombre que `regeneration.ts` multiplie à `semisParAn`, et il est
 * conçu pour valoir exactement **1** quand la production est régulière et que
 * personne ne mange : le moteur d'avant ce lot est un cas particulier de
 * celui-ci.
 */
export function glandeeRelative(
  arbres: readonly TreeState[],
  especeId: string,
  annee: number,
  graineParcelle: number,
  sanglierParHa: number,
  aireHa: number,
): number {
  const { produiteKg, moyenneKg } = glandeeDeLaParcelleKg(arbres, especeId, annee, graineParcelle);
  if (moyenneKg <= 0) return 0;
  const anPasse = glandeeDeLaParcelleKg(arbres, especeId, annee - 1, graineParcelle);
  const survivante = glandeeSurvivanteKg(produiteKg, anPasse.produiteKg, sanglierParHa, aireHa);
  return survivante / moyenneKg;
}
