/**
 * **Les oiseaux qui fréquentent la parcelle sans y nicher** (issue #296).
 *
 * `faune.ts` tient les nicheurs installés, un par un, chacun ancré à l'arbre qui
 * porte son gîte. Il ne tenait rien des oiseaux qu'on voit le plus : la grive
 * qui vide une haie d'aubépine en novembre, le merle et le troglodyte qui vivent
 * dans le fourré, la fauvette qui s'arrête deux jours sur un sureau avant de
 * passer la Méditerranée. Une parcelle sans vieil arbre creux n'avait donc
 * **aucun oiseau**, quelle que soit sa haie — alors que c'est précisément ce que
 * l'agroforesterie change.
 *
 * ── **l'autre moitié de la règle de partage** ─────────────────────────────────
 *
 * `faune.ts` l'écrit en tête : *« est un individu ce qui s'ancre dans la
 * parcelle par un nid, une loge ou une hutte ; est une densité de paysage ce qui
 * ne fait que la traverser »*. Ce module est la seconde moitié de cette phrase,
 * et elle n'avait jamais été écrite pour les oiseaux. Rien ici n'a d'identité :
 * une fréquentation est un **nombre d'oiseaux par semaine et par guilde**, tiré
 * de ce que la parcelle offre cette semaine-là, et du calendrier de la guilde.
 *
 * Une grive mauvis venue de Scandinavie ne s'installe pas chez vous ; elle passe,
 * mange, et repart quand la haie est vide. Lui donner un nom et un arbre serait
 * mentir sur ce qu'elle est.
 *
 * ── **ce que le moteur lit**, **et ce qu'il n'invente pas** ──────────────────
 *
 * Deux ressources, et toutes deux sont des grandeurs que le moteur portait déjà :
 *
 *  - **les baies** : la couronne d'un arbre **mûr** dont l'essence déclare une
 *    fenêtre `baies` (`especes.ts`) qui contient la semaine. Le bloc est neuf,
 *    mais il ne porte que deux semaines par fiche, lues chez Snow & Snow ;
 *  - **le fourré** : la couronne d'une tige vivante haute d'au moins un mètre et
 *    branchue jusqu'à un mètre du sol. C'est la hauteur (`heightM`) et la base
 *    du houppier (`baseHouppierM`) que la lumière fait déjà monter — un fût de
 *    futaie élagué par l'ombre cesse d'être un fourré sans que rien ne le dise.
 *
 * Les deux se comptent en **mètres carrés couverts**, sur la grille d'un mètre
 * de la parcelle, et pas en somme des couronnes : un roncier de quatre mille
 * tiges qui se chevauchent ne vaut pas quatre mille buissons, il vaut la
 * surface qu'il couvre.
 *
 * ── **ce que ce module ne fait pas**, **et pourquoi c'est dit** ──────────────
 *
 * **Les oiseaux ne mangent pas les fruits du joueur.** `fruitsKg` est une
 * récolte, que le moteur jette déjà à la fin de sa fenêtre de cueillette — il
 * suppose donc, sans le dire, que quelqu'un mange ce qu'on ne ramasse pas. Faire
 * prélever les grives dans `fruitsKg` toucherait le verger et jamais l'aubépine,
 * qui n'a pas de récolte : ce serait le contraire de leur biologie, et la faute
 * même que la glandée a corrigée chez l'écureuil (#197). Les fenêtres `baies`
 * sont des saisons **observées**, fin comprise : elles contiennent déjà ce que les
 * oiseaux emportent. Ce qui reste ouvert est écrit dans `docs/realisme.md`.
 *
 * **Les oiseaux ne sèment pas encore.** La dissémination « oiseaux »
 * (`regeneration.ts`) pose toujours ses graines au hasard sur la parcelle, alors
 * que ce module sait maintenant où les frugivores mangent et où ils se posent.
 * C'est un vrai chantier (il déplacerait les naissances, donc toutes les parties),
 * pas une ligne : il a son issue.
 *
 * **Le commutateur est celui de la faune.** Éteint (`station.faune`), le tick
 * ne parcourt rien et rend le même tableau figé, comme pour les nicheurs.
 */

import { getEspece } from "./especes";
import { tirageLocal } from "./faune";
import { forEachDiscCell, type GridDims } from "./grid";
import { crownRadiusM } from "./light";
import type { TreeState } from "./trees";

/**
 * Ce qui attire une guilde.
 *
 *  - `baies` — la couronne d'un arbre mûr qui porte, cette semaine, des baies
 *    mûres (`EspeceV0.baies`) ;
 *  - `fourre` — la couronne basse et branchue d'une tige vivante, où l'on niche
 *    et où l'on se cache.
 */
export type RessourceDePassage = "baies" | "fourre";

/**
 * Une période de présence d'une guilde, et ce qu'elle cherche pendant ce temps.
 *
 * Une guilde peut en avoir plusieurs : la fauvette de passage cherche un abri au
 * printemps et des baies en automne, et ce n'est pas la même parcelle qui
 * l'attire aux deux saisons.
 */
export interface PresenceDeGuilde {
  /** première semaine de l'année (0-51), comprise */
  debutSemaine: number;
  /** dernière semaine de l'année, comprise — peut enjamber le nouvel an */
  finSemaine: number;
  ressource: RessourceDePassage;
  /**
   * Oiseaux par mètre carré de ressource. **Chaque valeur porte sa dérivation**
   * dans l'atlas plus bas : c'est le seul chiffre qui fait d'une surface une
   * foule, et il ne doit pas être réglé sur le moteur.
   */
  oiseauxParM2: number;
}

/** Une guilde d'oiseaux qui fréquente la parcelle sans y nicher. */
export interface GuildeDePassage {
  id: string;
  nom: string;
  /** qui elle rassemble, en clair — pour qu'un lecteur sache ce qu'on compte */
  membres: string;
  presences: readonly PresenceDeGuilde[];
}

/**
 * Densité des **passereaux de haie** au mètre carré de fourré.
 *
 * Newton (2017, « In praise of hedgerows », *British Birds* 110 : 77-91) résume
 * la littérature : en saison de nidification, **5 à 14 couples par kilomètre de
 * haie**, davantage dans les haies hautes et larges. Le moteur ne connaît pas de « kilomètre de haie », il connaît
 * des mètres carrés de couronne : on divise par la largeur d'une haie, et le
 * Countryside Survey 2000 en donne la classe la plus fréquente — **68 % des haies
 * de Grande-Bretagne font 1 à 2 m de large** (Barr et al. 2004, rapport M03 du
 * CS2000, « Hedgerows », NERC Open Research Archive 4798). Avec le
 * milieu de la fourchette de Newton et la borne haute de la largeur :
 *
 *     9,5 couples/km × 2 oiseaux ÷ 2 000 m²/km = 0,0095 oiseau/m²
 *
 * Deux limites, et elles vont en sens contraire. La largeur prise à 2 m plutôt
 * qu'à 1,5 compte un peu **moins** d'oiseaux par mètre carré. Et appliquer une
 * densité de **haie** à un **massif** de fourré en compte **trop** : une haie est
 * toute en lisière, et ses oiseaux mangent dans le champ voisin. Un hectare de
 * roncier plein recevrait ici 95 oiseaux, ce que personne n'a mesuré *(à
 * confirmer)*.
 */
export const OISEAUX_DE_HAIE_PAR_M2 = (9.5 * 2) / 2000;

/**
 * Densité des **frugivores** au mètre carré de couronne en baies.
 *
 * Tellería, Ramírez & Pérez-Tris (2005, *Biological Conservation* 124 :
 * 493-502, annexe A) comptent en janvier, sur quatre hivers, **16,9 à 20,8
 * oiseaux disséminateurs** (fauvettes à tête noire et mélanocéphales,
 * rouges-gorges, quatre grives et merles) par transect de 500 m sur 50 m, soit
 * 2,5 ha, et **8,2 à 15,3 plantes porteuses de baies mûres** sur la bande de 10 m
 * (0,5 ha) où ils les recensent. En moyenne des quatre hivers (19,6 oiseaux,
 * 11,4 plantes), et ramené à la même surface :
 *
 *     19,6 oiseaux ÷ (11,4 buissons × 5) ≈ 0,34 oiseau par buisson en fruits
 *
 * Il faut une surface par buisson pour en faire une densité au mètre carré, et la
 * source ne la donne pas : un lentisque de deux à trois mètres de diamètre couvre
 * de l'ordre de **7 m²** *(à confirmer)*, d'où **0,049 oiseau/m²**.
 *
 * Un recoupement indépendant, et il tombe dans le même ordre de grandeur. Une
 * haie d'aubépine non taillée porte **0,1 à 0,2 kg de cenelles par mètre carré**
 * de face (Sparks, Robinson & Downing 2000, *Aspects of Applied Biology* 58 :
 * 421-424 : 219 à 421 g par 2,5 m² de haie non coupée), mangées entre octobre et
 * début décembre, où il n'en reste qu'un dixième (Croxton & Sparks 2004,
 * *Agriculture, Ecosystems & Environment* 104 : 663-666). Si une grive avale à peu près son
 * propre poids de fruits par jour, soit ~70 g *(à confirmer)*, ce stock nourrit
 * de l'ordre de **0,02 oiseau/m²** sur la saison — deux à trois fois moins, ce qui est
 * l'écart attendu entre un quartier d'hiver méditerranéen, où se concentrent
 * fauvettes et rouges-gorges, et une haie du nord de la Loire. **C'est donc une
 * borne haute** pour une parcelle tempérée.
 */
export const FRUGIVORES_PAR_M2_DE_BAIES = 0.34 / 7;

/**
 * **l'atlas des guildes de passage.** Trois, celles que nomme l'issue, et aucune
 * ligne du mécanisme ne les connaît : ce qui suit est une fiche, comme `FAUNE`.
 */
export const GUILDES_DE_PASSAGE: readonly GuildeDePassage[] = [
  {
    id: "hivernants_frugivores",
    nom: "hivernants frugivores",
    membres: "grives mauvis et litornes, merles et rouges-gorges venus du nord",
    presences: [
      {
        // La grive mauvis est en France « de la mi-octobre au début du
        // printemps » (VivArmor Nature 2022, fiche Grive mauvis), avec des
        // arrivées maximales en novembre-décembre d'après les reprises de bagues
        // (Claessens 1990, *Gibier Faune Sauvage* 7 : 1-20, résumé par la fiche
        // espèce de la fédération des chasseurs des Alpes-Maritimes), et une
        // migration de retour qui commence de mi à fin février. Semaine 42
        // (mi-octobre) à semaine 11 (l'équinoxe). La fin compte peu : il ne reste
        // alors presque plus de baies sur aucune fiche.
        debutSemaine: 42,
        finSemaine: 11,
        ressource: "baies",
        oiseauxParM2: FRUGIVORES_PAR_M2_DE_BAIES,
      },
    ],
  },
  {
    id: "passereaux_de_haie",
    nom: "passereaux de haie",
    membres: "merle noir, rouge-gorge, troglodyte, accenteur mouchet, fauvettes",
    presences: [
      {
        // **Toute l'année.** Merle, rouge-gorge, troglodyte et accenteur sont
        // sédentaires en France, et les rouges-gorges et merles venus du nord
        // les rejoignent l'hiver. La densité est celle de la **nidification**
        // (Newton 2017) ; qu'elle vaille aussi l'hiver est *(à confirmer)* —
        // les fauvettes partent, d'autres arrivent.
        debutSemaine: 0,
        finSemaine: 51,
        ressource: "fourre",
        oiseauxParM2: OISEAUX_DE_HAIE_PAR_M2,
      },
    ],
  },
  {
    id: "migrateurs_de_passage",
    nom: "migrateurs de passage",
    membres: "fauvettes à tête noire et des jardins, pouillots, gobemouches",
    presences: [
      {
        // **Le passage de printemps** : dans le Rhône, le pouillot fitis arrive
        // autour de l'équinoxe, avril réunit plus de la moitié des données avec
        // un pic à la deuxième décade, et mai n'en compte plus que le dixième
        // d'avril (LPO Rhône, « l'oiseau du mois », septembre 2016). L'oiseau
        // cherche un abri et des insectes, pas de baies — il n'y en a plus.
        // Semaines 11 à 17 (l'équinoxe à fin avril).
        // La densité reprend celle de la haie, faute de mesure d'une halte
        // migratoire au mètre carré *(à calibrer)*.
        debutSemaine: 11,
        finSemaine: 17,
        ressource: "fourre",
        oiseauxParM2: OISEAUX_DE_HAIE_PAR_M2,
      },
      {
        // **Le passage d'automne** : 90 % des gobemouches noirs passent entre la
        // dernière pentade d'août et la dernière de septembre (Frey & Tissier
        // 2017, *L'Effraie* 45 : 24-28), et les fauvettes s'engraissent alors
        // sur le sureau. En halte dans un jeune bois suisse, filets ouverts du
        // 7 août au 21 octobre, la fauvette à tête noire se prend plus près des
        // sureaux en fruits, 80 % des fientes à graines des fauvettes à tête
        // noire et des jardins portent des graines de sureau, et les rouges-gorges
        // et accenteurs de passage arrivent en masse après le 1er septembre (von
        // Hirschheydt, Schiegg & Suter 2005, *Der Ornithologische Beobachter*
        // 102 : 1-14). Semaines 33 à 42 (mi-août à la fin des filets). La
        // fauvette à tête noire est la première espèce du décompte de Tellería,
        // d'où la même densité au mètre carré.
        debutSemaine: 33,
        finSemaine: 42,
        ressource: "baies",
        oiseauxParM2: FRUGIVORES_PAR_M2_DE_BAIES,
      },
    ],
  },
];

/**
 * Hauteur minimale d'une tige pour faire du fourré, m.
 *
 * C'est le bas de la strate arbustive de `biodiversite.ts` : en dessous, une
 * callune ou un semis sont de la végétation basse, pas un buisson où poser un
 * nid de merle.
 */
export const HAUTEUR_FOURRE_MIN_M = 1;

/**
 * Hauteur maximale de la base du houppier pour faire du fourré, m *(à
 * calibrer)*.
 *
 * Une haie est feuillue depuis le sol — le Countryside Survey 2000 trouve la base
 * du couvert sous 0,5 m dans 69 % des haies britanniques — et c'est sous deux
 * mètres que nichent le merle, l'accenteur et la fauvette grisette. Un mètre
 * laisse dans le fourré un buisson que le moteur fait monter jusqu'à 10 % de sa
 * hauteur (`PROFONDEUR_HOUPPIER_MAX`), et en sort un fruitier conduit en
 * demi-tige ou un fût que l'ombre a élagué.
 */
export const BASE_FOURRE_MAX_M = 1;

/** La semaine est-elle dans la fenêtre [début, fin], fenêtre qui peut enjamber le nouvel an ? */
export function dansLaFenetre(semaine: number, debut: number, fin: number): boolean {
  const s = ((semaine % 52) + 52) % 52;
  return debut <= fin ? s >= debut && s <= fin : s >= debut || s <= fin;
}

/** L'arbre offre-t-il du fourré ? */
export function offreDuFourre(tree: TreeState): boolean {
  return (
    tree.alive &&
    tree.heightM >= HAUTEUR_FOURRE_MIN_M &&
    (tree.baseHouppierM ?? 0) <= BASE_FOURRE_MAX_M
  );
}

/** L'arbre porte-t-il, cette semaine, des baies mûres ? */
export function porteDesBaies(tree: TreeState, semaine: number): boolean {
  if (!tree.alive) return false;
  const espece = getEspece(tree.especeId);
  const baies = espece.baies;
  if (baies === undefined) return false;
  if (tree.ageWeeks < espece.regeneration.maturiteAns * 52) return false;
  return dansLaFenetre(semaine, baies.debutSemaine, baies.finSemaine);
}

/**
 * Nombre d'arbres nommés par guilde, au plus.
 *
 * Le rendu en a besoin pour poser l'oiseau là où il mange, pas au hasard ; il
 * n'a pas besoin des quatre mille tiges d'un roncier. Les plus grandes couronnes
 * d'abord, ce qui est aussi l'ordre où un oiseau les voit.
 */
export const ARBRES_NOMMES_MAX = 24;

/** Ce que la parcelle reçoit d'une guilde cette semaine. */
export interface FrequentationDeGuilde {
  guildeId: string;
  /** ce que la guilde cherche cette semaine-là */
  ressource: RessourceDePassage;
  /** surface couverte par la ressource, m² (cellules d'un mètre, sans double compte) */
  surfaceM2: number;
  /** espérance du nombre d'oiseaux, avant d'en faire un entier */
  attendus: number;
  /**
   * **Le nombre d'oiseaux de la semaine**, entier. La partie fractionnaire de
   * l'espérance est tirée sur une graine **locale** (guilde, semaine), comme les
   * installations de `faune.ts` : elle ne touche pas au flux principal, et la
   * moyenne sur l'année reste celle qu'on attend.
   */
  oiseaux: number;
  /**
   * Les arbres qui attirent, par id, du plus couvrant au moins couvrant — au plus
   * `ARBRES_NOMMES_MAX`. Tous vivants et présents dans la parcelle de fin de
   * semaine.
   */
  arbres: readonly number[];
}

/**
 * Graine **locale** de l'arrondi d'une fréquentation : la guilde, la semaine et la
 * partie.
 *
 * Même construction que `graineDeGlandee`, et pour la même raison : deux des
 * trois entrées sont petites (une semaine, une graine de partie qu'un essai
 * numérote 1 et 2), si bien que sans brassage final deux parties tireraient les
 * mêmes arrondis semaine après semaine. Le flux principal n'est pas touché.
 */
export function graineDePassage(guildeId: string, semaine: number, graineParcelle: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < guildeId.length; i++) {
    h = (h ^ guildeId.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  h = (h + Math.imul(semaine, 2654435761) + Math.imul(graineParcelle, 40503)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Une ressource peinte sur la grille, et qui l'a peinte. */
interface Couverture {
  surfaceM2: number;
  arbres: number[];
}

function couvrir(
  trees: readonly TreeState[],
  dims: GridDims,
  retenu: (tree: TreeState) => boolean,
): Couverture {
  const grille = new Uint8Array(dims.widthM * dims.heightM);
  const contributeurs: { id: number; aire: number }[] = [];
  let surfaceM2 = 0;
  for (const tree of trees) {
    if (!retenu(tree)) continue;
    const espece = getEspece(tree.especeId);
    const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm);
    forEachDiscCell(dims, tree.x, tree.y, r, (i) => {
      if (grille[i] === 0) {
        grille[i] = 1;
        surfaceM2++;
      }
    });
    contributeurs.push({ id: tree.id, aire: r * r });
  }
  contributeurs.sort((a, b) => b.aire - a.aire || a.id - b.id);
  return {
    surfaceM2,
    arbres: contributeurs.slice(0, ARBRES_NOMMES_MAX).map((c) => c.id),
  };
}

/**
 * **La fréquentation de la semaine**, guilde par guilde.
 *
 * Une entrée par guilde **présente** au calendrier cette semaine-là, même quand la
 * parcelle n'en attire aucune : « les grives sont dans la région, et votre
 * parcelle n'a rien pour elles » est une information, et elle se distingue de
 * « ce n'est pas la saison ». Les guildes absentes du calendrier n'ont pas
 * d'entrée.
 *
 * `semaine` est la semaine **absolue** de la partie : elle sert entière à la
 * graine locale, et réduite à l'année au calendrier. `graineParcelle` est la
 * graine de la partie (`GameState.graineMarche`), pour que deux parties
 * n'arrondissent pas de la même façon.
 */
export function frequentationOiseaux(
  trees: readonly TreeState[],
  semaine: number,
  dims: GridDims,
  graineParcelle: number,
): FrequentationDeGuilde[] {
  const semaineDeLAnnee = semaine % 52;
  const resultat: FrequentationDeGuilde[] = [];
  // Chaque ressource n'est peinte qu'une fois par semaine, même si deux guildes
  // la lisent.
  let fourre: Couverture | undefined;
  let baies: Couverture | undefined;
  for (const guilde of GUILDES_DE_PASSAGE) {
    const presence = guilde.presences.find((p) =>
      dansLaFenetre(semaineDeLAnnee, p.debutSemaine, p.finSemaine),
    );
    if (presence === undefined) continue;
    let couverture: Couverture;
    if (presence.ressource === "fourre") {
      fourre ??= couvrir(trees, dims, offreDuFourre);
      couverture = fourre;
    } else {
      baies ??= couvrir(trees, dims, (t) => porteDesBaies(t, semaineDeLAnnee));
      couverture = baies;
    }
    const attendus = couverture.surfaceM2 * presence.oiseauxParM2;
    const entiers = Math.floor(attendus);
    const tirage = tirageLocal(graineDePassage(guilde.id, semaine, graineParcelle));
    const oiseaux = entiers + (tirage < attendus - entiers ? 1 : 0);
    resultat.push({
      guildeId: guilde.id,
      ressource: presence.ressource,
      surfaceM2: couverture.surfaceM2,
      attendus,
      oiseaux,
      arbres: oiseaux > 0 ? couverture.arbres : [],
    });
  }
  return resultat;
}
