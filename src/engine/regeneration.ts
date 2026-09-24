/**
 * Régénération naturelle (docs/regles.md §8, ch4-B) : une fois par an, les
 * adultes en âge de grainer et le paysage voisin (`station.voisinage`)
 * produisent des semis. Tous les tirages passent par le PRNG seedé.
 * `semisParAn` représente les établissements **potentiels** (après l'entonnoir de
 * mortalité graine→semis, ch4-B) ; le filtre restant est écologique :
 * - lumière au sol ≥ 2 × le point de compensation de l'espèce (un héliophile
 *   ne s'installe pas sous couvert, un sciaphile si) ;
 * - pas d'arbre vivant à moins de 1,2 m (concurrence immédiate) ;
 * - plafond de densité (auto-éclaircie des fourrés, en attendant la V1).
 * La suite (sécheresse, ombre croissante) relève de la mortalité normale.
 */

import { leveeParM2 } from "./banqueGraines";
import type { EspeceV0 } from "./especes";
import { getEspece } from "./especes";
import type { GrilleLue } from "./grid";
import {
  crownRadiusM,
  type IndexOmbres,
  indexerOmbres,
  lumiereAuPointIndexee,
  type PartOmbrageante,
} from "./light";
import type { RngState } from "./rng";
import { rngFloat } from "./rng";
import { diametreInitialCm, phFactor, type TreeState, tirerVigueurIndividuelle } from "./trees";

/** distance moyenne de dispersion par le vent, m (exponentielle) */
const WIND_MEAN_DISTANCE_M = 25;
/**
 * Plafond d'auto-éclaircie, exprimé en **recouvrement** et non en nombre de tiges.
 *
 * Un plafond fixe — on avait 1 500 tiges/ha — est faux aux deux bouts : un
 * fourré de ronces et d'épineux en compte plusieurs milliers, une futaie
 * adulte quelques centaines. Ce qui sature un peuplement, ce n'est pas un
 * nombre, c'est la **place** : la somme des couronnes rapportée à la surface du
 * sol. Un peuplement stratifié en superpose deux à trois épaisseurs — au-delà,
 * il ne reste plus assez de lumière pour qu'un semis de plus s'installe.
 *
 * C'est la loi d'auto-éclaircie, sous la forme la plus directe que permette un
 * moteur qui connaît les houppiers : elle donne des milliers de tiges quand
 * elles font trente centimètres, et quelques centaines quand elles font vingt
 * mètres, sans qu'on ait à choisir un chiffre pour chaque étape.
 *
 * **Et la valeur n'a pas bougé en devenant locale** (#95), ce qui n'allait pas de
 * soi : l'issue prévoyait qu'un plafond local demanderait une autre valeur. La
 * mesure dit le contraire, et c'est une propriété de la grandeur elle-même. Le
 * recouvrement local **moyen** d'un peuplement homogène égale son recouvrement
 * global — mesuré sur quatre peuplements, 6,79 contre 6,32, 7,69 contre 7,72,
 * 2,19 contre 2,14, 0,96 contre 1,02. Une moyenne de parts vaut la part de la
 * somme ; ce que la portée change n'est pas le niveau, c'est la **variance**. Le
 * plafond continue donc de dire la même chose des peuplements homogènes, et ne
 * dit autre chose que là où le peuplement ne l'est pas — ce qui est exactement
 * ce qu'on voulait corriger.
 */
const RECOUVREMENT_MAX = 2.5;
/**
 * Le rayon où la place se dispute, m — l'emprise d'**un** houppier adulte.
 *
 * Le plafond était **parcellaire** : tant que la somme des couronnes dépassait
 * 2,5 fois la surface, plus aucun semis ne s'installait nulle part, y compris
 * sous une ouverture en pleine lumière. Une futaie dense qui perd un bouquet
 * d'arbres doit régénérer dans son ouverture, quelle que soit la densité du
 * reste (#95).
 *
 * **Six mètres**, **et le choix se mesure**. Un houppier de hêtre adulte fait sept
 * mètres de rayon, un de quinze mètres de haut en fait cinq : le disque de six
 * mètres est l'ordre de grandeur de la place qu'**une** couronne prendra, donc de
 * ce qu'un semis dispute vraiment. Balayé de trois à huit mètres sur une
 * hêtraie serrée de quinze mètres, le recouvrement au centre d'une trouée de
 * huit mètres vaut 0,00 / 0,14 / 0,51 / 0,99 / 1,98 : au-delà de six, le
 * voisinage recommence à voir la matrice et l'ouverture s'efface — à douze
 * mètres, la maille des paniers de `light.ts`, il n'en reste presque rien
 * (1,21 contre 1,02 pour la matrice). La maille de douze mètres reste l'**index** ;
 * elle ne peut pas être la portée *(à calibrer)*.
 */
const RAYON_VOISINAGE_M = 6;
/** Maille de l'index spatial, m — la même que `light.ts`, et pour la même raison. */
const PANIER_M = 12;
const MIN_SPACING_M = 1.2;
/**
 * Taille d'un semis qui vient de s'installer, m — **plafond**, pas valeur fixe.
 *
 * Trente centimètres conviennent à un chêne, dont le gland porte assez de
 * réserves pour ça. Ils ne conviennent pas à la callune, dont l'adulte plafonne
 * à **soixante** centimètres : elle naissait à la moitié de sa taille finale et
 * sautait entièrement sa phase pionnière — celle qui dure des années dans la
 * nature, et pendant laquelle elle est vulnérable au broutage, à la concurrence
 * herbacée et au piétinement. Le défaut touchait tous les sous-arbrisseaux de
 * l'atlas, et il faussait dans le sens de la facilité.
 */
const SEEDLING_HEIGHT_MAX_M = 0.3;

/**
 * Part de la hauteur adulte qu'un semis atteint à l'installation.
 *
 * On passe par la taille **adulte** faute de mieux. Ce qui détermine vraiment la
 * taille d'une plantule, c'est la réserve de la **graine** : un gland fait un semis
 * de vingt centimètres, une graine de callune — qui est une poussière — fait
 * une plantule de quelques millimètres. Or la taille des graines n'est pas dans
 * l'atlas, et elle suit grossièrement celle de la plante. C'est donc une
 * approximation, mais elle corrige le **sens** de l'erreur *(à calibrer)*.
 *
 * Le plafond joue dès trois mètres de hauteur adulte, c'est-à-dire pour tous
 * les arbres : eux ne changent pas d'un centimètre.
 */
const PART_ADULTE_AU_SEMIS = 0.1;

/** Taille à l'installation, bornée par le plafond. */
export function hauteurDuSemisM(hauteurAdulteM: number): number {
  return Math.min(SEEDLING_HEIGHT_MAX_M, PART_ADULTE_AU_SEMIS * hauteurAdulteM);
}

export interface RecruitmentInput {
  trees: readonly TreeState[];
  rng: RngState;
  coteM: number;
  /** semis annuels arrivant du paysage hors-parcelle */
  voisinage: readonly { especeId: string; semisParAn: number }[];
  /** feuillage ombrageant de chaque arbre : le filtre lumière des semis en dépend */
  partOmbrageante: PartOmbrageante;
  /** pH par cellule (un semis ne s'installe pas hors de sa gamme) */
  ph: GrilleLue;
  /**
   * Lumière au sol par cellule : elle sert au geai, qui cache ses glands en
   * terrain découvert pour les retrouver.
   */
  lumiereAuSol: readonly number[];
  /**
   * Banque de graines du sol, graines/m² par espèce (banqueGraines.ts). C'est
   * la mémoire du passé de la parcelle : ce qui y a poussé et grainé y attend
   * sous terre, parfois des décennies.
   */
  banqueGraines?: Readonly<Record<string, number>>;
  /** La parcelle a-t-elle brûlé depuis la dernière levée ? Le feu scarifie. */
  aBrule?: boolean;
  /**
   * Ce que vaut la glandée **survivante** de l'année, par espèce, rapporté à une
   * année moyenne dont rien n'aurait été mangé (`glandee.ts`).
   *
   * Remplace l'ancienne `partGlandeeRestante`, qui était une part ∈ [0,1] de
   * sangliers sur une production supposée constante. Ce nombre-ci n'est pas
   * borné à 1 : une année de glandée en vaut trois, et c'est tout l'objet du
   * mécanisme — les mangeurs de graines sont noyés, et le chêne passe.
   */
  glandeeRelative?: Readonly<Record<string, number>>;
  /**
   * Part de la parcelle retournée par les sangliers dans l'année ∈ [0,1]. Un
   * boutis déchire le tapis et enfouit la litière : il **ouvre** un lit de
   * germination, ce dont profitent les petites graines — l'exact contraire de
   * ce que la même bête fait aux glands.
   */
  partRetournee?: number;
  nextTreeId: number;
}

export interface RecruitmentResult {
  newTrees: TreeState[];
  rng: RngState;
  nextTreeId: number;
}

/**
 * Combien d'**établissements** pour une graine levée de la banque.
 *
 * Le rapport est écrasant, et il doit l'être : sous une lande installée, la
 * banque d'ajoncs compte des centaines de graines par m², et un feu en fait
 * lever la moitié. Cela ferait des millions de plantules sur une parcelle d'un
 * hectare — dont l'immense majorité meurt dans l'année, et dont ce moteur, qui
 * suit ses ligneux un par un, ne peut de toute façon pas tenir le compte.
 *
 * La valeur est donc **calée** sur l'échelle de représentation du moteur, pas sur
 * la démographie réelle : une lande brûlée doit y revenir en lande, à la
 * densité d'ajoncs que le moteur manipule habituellement (quelques centièmes de
 * pied au m²), pas à celle du terrain. Le plafond de recouvrement des couronnes
 * fait le reste du travail *(à calibrer)*.
 */
const ETABLISSEMENTS_PAR_LEVEE = 0.00002;

/**
 * Plafond de tentatives issues de la banque, par an et pour toute la parcelle.
 *
 * Ce n'est pas de l'écologie, c'est une protection, et elle a été gagnée à la
 * dure : la première version sans plafond a fait passer la suite d'essais de
 * deux minutes à **deux heures et demie**. Une banque d'ajoncs bien remplie lève
 * des centaines de milliers de graines au m² après un feu ; même avec un taux
 * d'établissement minuscule, cela crée assez d'individus pour que chaque tick
 * suivant coûte dix fois plus cher.
 *
 * Le plafond n'enlève rien au mécanisme : le peuplement d'après-feu est de
 * toute façon limité par le recouvrement des couronnes quelques années plus
 * tard. Il empêche seulement le moteur de matérialiser un à un des semis qui
 * mourront tous.
 */
const MAX_LEVEES_PAR_AN = 300;

function draw(rng: RngState): { rng: RngState; value: number } {
  const r = rngFloat(rng);
  return { rng: r.state, value: r.value };
}

/** Position d'un semis selon le mode de dissémination de l'espèce (ch4-C). */
/**
 * Où atterrit un semis : le noyau de dispersion dépend entièrement du mode de
 * dissémination de l'espèce (exporté pour les tests écologiques).
 */
/**
 * Où sort un drageon : dans un anneau serré autour de la mère.
 *
 * Un drageon naît sur une racine traçante, à quelques mètres du pied au plus.
 * Le noyau est donc tout autre que celui d'une graine — pas de queue lointaine,
 * pas de dépendance au mode de dissémination : la tache avance par son bord.
 *
 * On tire dans l'anneau [portée/3, portée] plutôt que dans le disque entier :
 * un drageon qui sortirait au pied de sa mère serait de toute façon écarté par
 * l'espacement minimal, et le tirer là ne ferait que gâcher des tentatives.
 */
export function positionDeDrageon(
  rng: RngState,
  parent: TreeState | null,
  espece: EspeceV0,
): { rng: RngState; x: number; y: number } {
  const portee = espece.regeneration.drageonne?.porteeM ?? 0;
  if (!parent || portee <= 0) {
    const r = draw(rng);
    return { rng: r.rng, x: -1, y: -1 };
  }
  const a = draw(rng);
  const b = draw(a.rng);
  const distance = portee * (1 / 3 + (2 / 3) * a.value);
  const angle = 2 * Math.PI * b.value;
  return {
    rng: b.rng,
    x: parent.x + distance * Math.cos(angle),
    y: parent.y + distance * Math.sin(angle),
  };
}

export function drawPosition(
  rng: RngState,
  espece: EspeceV0,
  parent: TreeState | null,
  coteM: number,
  lumiereAuSol: readonly number[],
): { rng: RngState; x: number; y: number } {
  let r = draw(rng);
  const u1 = r.value;
  r = draw(r.rng);
  const u2 = r.value;
  // Semis venu du hors-parcelle : position uniforme (vent/oiseaux depuis la lisière).
  if (!parent) return { rng: r.rng, x: u1 * coteM, y: u2 * coteM };

  switch (espece.regeneration.dissemination) {
    case "oiseaux":
      // Avec les fientes : n'importe où sur la parcelle.
      return { rng: r.rng, x: u1 * coteM, y: u2 * coteM };
    case "geai": {
      // Le geai cache ses glands loin du parent, et surtout **en découvert** :
      // il doit pouvoir les retrouver. On tire quelques emplacements et on
      // garde le plus ouvert — c'est ce biais, et non une règle sur les
      // chênes, qui les fait coloniser les friches et se régénérer mal sous
      // leur propre couvert.
      let meilleur = { x: u1 * coteM, y: u2 * coteM, lumiere: -1 };
      let etat = r.rng;
      for (let essai = 0; essai < 4; essai++) {
        const a = draw(etat);
        const b = draw(a.rng);
        etat = b.rng;
        const x = a.value * coteM;
        const y = b.value * coteM;
        const cellule = Math.floor(y) * coteM + Math.floor(x);
        const lumiere = lumiereAuSol[cellule] ?? 1;
        if (lumiere > meilleur.lumiere) meilleur = { x, y, lumiere };
      }
      return { rng: etat, x: meilleur.x, y: meilleur.y };
    }
    case "vent": {
      const distance = -WIND_MEAN_DISTANCE_M * Math.log(1 - Math.min(u1, 0.999));
      const angle = 2 * Math.PI * u2;
      return {
        rng: r.rng,
        x: parent.x + distance * Math.cos(angle),
        y: parent.y + distance * Math.sin(angle),
      };
    }
    case "gravite": {
      // Sous la couronne et à peine au-delà (faînes, glands roulés).
      const reach =
        crownRadiusM(parent.heightM, espece.lumiere.houppierRatio, parent.diametreCm) * 1.5 + 2;
      const distance = reach * Math.sqrt(u1);
      const angle = 2 * Math.PI * u2;
      return {
        rng: r.rng,
        x: parent.x + distance * Math.cos(angle),
        y: parent.y + distance * Math.sin(angle),
      };
    }
  }
}

/**
 * Ce qu'un sol entièrement retourné ajouterait aux semis à graine légère.
 *
 * Un boutis enlève le matelas de feuilles et met la terre à nu : c'est le lit
 * de germination dont une graine de bouleau a besoin et qu'une litière fermée
 * lui refuse. Doubler les tentatives sur une parcelle intégralement retournée
 * est un ordre de grandeur, pas une mesure *(à calibrer)* — et la part
 * réellement retournée en un an se compte en pourcents (sanglier.ts), donc
 * l'effet réel est petit et progressif.
 */
export const BONUS_SOL_RETOURNE = 1;

/** Un houppier vu comme un disque : tout ce dont le plafond local a besoin. */
interface Houppier {
  x: number;
  y: number;
  r: number;
}

/**
 * Aire commune à deux disques, m².
 *
 * **Le découpage n'est pas un raffinement**, il fait la mesure. Compter pour sa
 * surface **entière** un houppier dont le centre est dehors mais qui mord sur le
 * voisinage donne un recouvrement local trois à cinq fois trop haut — mesuré
 * en écrivant la campagne de #95, où la première version annonçait 17,75 de
 * médiane là où la parcelle entière tenait 6,32. Un plafond calé sur ce
 * chiffre-là n'aurait plus rien laissé s'installer nulle part.
 */
function aireCommune(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2);
}

/**
 * Range un houppier dans tous les paniers où une **tentative** pourrait le voir —
 * son disque **élargi** du rayon de voisinage, pas son disque seul.
 *
 * C'est ce qui permet à la lecture de ne consulter qu'un panier, celui du point
 * tiré, au lieu d'en balayer neuf et d'y dédoublonner : si un houppier peut
 * mordre sur le voisinage d'un point, il est déjà dans le panier de ce point.
 * `light.ts` fait le même arrangement pour la même raison — la différence est
 * qu'une ombre s'interroge en un **point** et la place dans un **disque**, d'où
 * l'élargissement.
 */
function rangerHouppier(paniers: Map<number, Houppier[]>, h: Houppier): void {
  const portee = h.r + RAYON_VOISINAGE_M;
  const bx0 = Math.floor((h.x - portee) / PANIER_M);
  const bx1 = Math.floor((h.x + portee) / PANIER_M);
  const by0 = Math.floor((h.y - portee) / PANIER_M);
  const by1 = Math.floor((h.y + portee) / PANIER_M);
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const key = by * 100_000 + bx;
      const list = paniers.get(key);
      if (list) list.push(h);
      else paniers.set(key, [h]);
    }
  }
}

/** Part du voisinage d'un point déjà couverte par des houppiers. */
function recouvrementLocal(paniers: Map<number, Houppier[]>, x: number, y: number): number {
  const key = Math.floor(y / PANIER_M) * 100_000 + Math.floor(x / PANIER_M);
  const list = paniers.get(key);
  if (!list) return 0;
  let aire = 0;
  for (const h of list) {
    aire += aireCommune(h.r, RAYON_VOISINAGE_M, Math.hypot(h.x - x, h.y - y));
  }
  return aire / (Math.PI * RAYON_VOISINAGE_M * RAYON_VOISINAGE_M);
}

export function yearlyRecruitment(input: RecruitmentInput): RecruitmentResult {
  const { trees, coteM, voisinage, partOmbrageante } = input;
  let rng = input.rng;
  let nextTreeId = input.nextTreeId;
  const newTrees: TreeState[] = [];
  // La place déjà prise, rangée par voisinage. Les semis qu'on ajoute y entrent
  // aussi : c'est ce qui empêche une année exceptionnelle d'en installer mille
  // au même endroit.
  /**
   * L'index d'ombres, bâti **une fois** pour l'année. `lightAtPoint` le
   * reconstruisait à chaque tentative d'installation, et le peuplement ne bouge
   * pas entre deux : à quatre mille tiges, c'était le deuxième poste de calcul
   * du tick (#99).
   */
  const ombres: IndexOmbres = indexerOmbres(trees, partOmbrageante);
  const paniers = new Map<number, Houppier[]>();
  for (const t of trees) {
    if (!t.alive) continue;
    const r = crownRadiusM(t.heightM, getEspece(t.especeId).lumiere.houppierRatio, t.diametreCm);
    if (r > 0) rangerHouppier(paniers, { x: t.x, y: t.y, r });
  }

  /**
   * `parDrageon` change une chose, et c'est toute la différence : un drageon
   * n'est pas un semis. Il reste **relié** à sa mère, qui le nourrit le temps qu'il
   * s'installe, et il n'a donc pas besoin de trouver sa lumière tout seul.
   * C'est précisément ce qui permet à un fourré de prunelliers d'avancer sous
   * son propre couvert, là où aucune graine de la même espèce ne lèverait.
   */
  const tryEstablish = (especeId: string, parent: TreeState | null, parDrageon = false) => {
    const espece = getEspece(especeId);
    const pos = parDrageon
      ? positionDeDrageon(rng, parent, espece)
      : drawPosition(rng, espece, parent, coteM, input.lumiereAuSol);
    rng = pos.rng;
    // La place se dispute **là où la graine tombe**, et plus à l'échelle de la
    // parcelle (#95). La lecture reste au même endroit du flux aléatoire :
    // après le tirage de position, avant tout le reste.
    if (recouvrementLocal(paniers, pos.x, pos.y) >= RECOUVREMENT_MAX) return;
    if (pos.x < 0 || pos.x >= coteM || pos.y < 0 || pos.y >= coteM) return; // perdu hors parcelle
    // Filtres écologiques : lumière ≥ 2 × compensation, pH dans la gamme. Le
    // drageon échappe au filtre lumière, et à lui seul : le pH du sol où il
    // sort, la place disponible et la concurrence immédiate le concernent
    // autant qu'un semis.
    if (
      !parDrageon &&
      lumiereAuPointIndexee(ombres, pos.x, pos.y) < 2 * espece.lumiere.compensation
    )
      return;
    const cellPh = input.ph[Math.floor(pos.y) * coteM + Math.floor(pos.x)] ?? 7;
    if (phFactor(espece, cellPh) < 0.2) return;
    // Concurrence immédiate : pas d'installation collée à un vivant.
    for (const t of trees) {
      if (!t.alive) continue;
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      if (dx * dx + dy * dy < MIN_SPACING_M * MIN_SPACING_M) return;
    }
    for (const t of newTrees) {
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      if (dx * dx + dy * dy < MIN_SPACING_M * MIN_SPACING_M) return;
    }
    rangerHouppier(paniers, {
      x: pos.x,
      y: pos.y,
      // Semis **projeté** : il n'a pas encore de diamètre propre, on lui prête
      // celui d'une tige sans histoire — donc la forme de référence.
      r: crownRadiusM(
        hauteurDuSemisM(espece.hauteurMaxM),
        espece.lumiere.houppierRatio,
        diametreInitialCm(hauteurDuSemisM(espece.hauteurMaxM)),
      ),
    });
    // Un semis naturel a sa vigueur propre, comme un plant de pépinière.
    const tirageVigueur = tirerVigueurIndividuelle(rng);
    rng = tirageVigueur.rng;
    newTrees.push({
      vigueurIndividuelle: tirageVigueur.vigueur,
      id: nextTreeId++,
      especeId,
      x: pos.x,
      y: pos.y,
      ageWeeks: 0,
      heightM: hauteurDuSemisM(espece.hauteurMaxM),
      diametreCm: diametreInitialCm(hauteurDuSemisM(espece.hauteurMaxM)),
      stress: 0,
      alive: true,
      uptakeYearG: 0,
      fruitsKg: 0,
      fruitProgress: 0,
      bloomFrosted: false,
      rootDepthCm: 20,
      hauteurElagueeM: 0,
      pousseTendreM: 0,
      vigueur: 1,
      dommageHydraulique: 0,
      protege: false,
      recepages: 0,
    });
  };

  /**
   * Combien de tentatives cette année : la partie entière, plus une de plus
   * avec la probabilité de la décimale. Sans ça, un taux inférieur à 1 ne
   * produirait jamais rien — or c'est le régime normal des espèces dont les
   * graines sont lourdes et convoitées, qui ne placent pas un semis par pied
   * et par an.
   */
  const tentatives = (taux: number): number => {
    const entier = Math.floor(taux);
    const reste = taux - entier;
    if (reste <= 0) return entier;
    const r = rngFloat(rng);
    rng = r.state;
    return entier + (r.value < reste ? 1 : 0);
  };

  // 1. Pluie de semis du paysage voisin (non contrôlable, docs/regles.md §8).
  for (const v of voisinage) {
    const n = tentatives(v.semisParAn);
    for (let k = 0; k < n; k++) tryEstablish(v.especeId, null);
  }

  // 1 bis. La **banque de graines** du sol, pour les espèces qui en font une. Elle
  // ne dépend ni des adultes présents ni du voisinage : c'est ce que la
  // parcelle a gardé de son passé, et le feu la réveille (banqueGraines.ts).
  //
  // Les levées passent par le **même** entonnoir que les autres semis — lumière,
  // pH, place disponible, concurrence immédiate — parce qu'une graine réveillée
  // par le feu n'est pas dispensée d'écologie.
  for (const [especeId, stockParM2] of Object.entries(input.banqueGraines ?? {})) {
    const espece = getEspece(especeId);
    const levees = leveeParM2(espece, stockParM2, input.aBrule ?? false) * coteM * coteM;
    const n = Math.min(MAX_LEVEES_PAR_AN, tentatives(levees * ETABLISSEMENTS_PAR_LEVEE));
    for (let k = 0; k < n; k++) tryEstablish(especeId, null);
  }

  // 1 ter. Les **drageons** : la conquête par la racine, pas par la graine. Un
  // fourré de prunelliers n'avance pas en semant au loin, il pousse sa tache
  // d'un mètre par an depuis ses propres racines — et c'est ce qui en fait un
  // problème de gestion dans une haie, puisque la tache avance dans le champ.
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const drageon = espece.regeneration.drageonne;
    if (!drageon) continue;
    if (tree.ageWeeks < espece.regeneration.maturiteAns * 52) continue;
    const n = tentatives(drageon.parAn);
    for (let k = 0; k < n; k++) tryEstablish(tree.especeId, tree, true);
  }

  // 2. Semis des adultes de la parcelle en âge de grainer.
  //
  // Le **sanglier** se joue ici, et dans les deux sens (sanglier.ts). Il mange ce
  // qui tombe et reste — les graines lourdes, celles dont le mode de
  // dissémination est `geai` ou `gravite` — et il ouvre des lits de germination
  // en retournant le sol, ce dont profitent celles qui arrivent par le vent ou
  // par les oiseaux. Aucune espèce n'est nommée : le trait tranche.
  const litOuvert = 1 + BONUS_SOL_RETOURNE * (input.partRetournee ?? 0);
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    if (tree.ageWeeks < espece.regeneration.maturiteAns * 52) continue;
    // **Le trait de taille de graine, enfin.** Ce bloc triait sur
    // `dissemination === "geai"`, et le commentaire qu'il portait disait
    // pourquoi c'était un pis-aller : le mode de dissémination ne dit pas le
    // poids. Il avait d'abord rangé l'ajonc et le genêt (`gravite`, graines
    // dures de deux millimètres) à côté de la faîne, ce qui faisait manger des
    // graines d'ajonc aux sangliers, ne refermait plus la nurse d'une lande et
    // faisait pousser un pin abrité moins qu'un pin nu (1,38 m → 0,92 m).
    // `geai` corrigeait ça — mais laissait dehors la faîne du hêtre, qui est
    // bien mangée, et le commentaire appelait un trait de taille de graine
    // *(à instruire)*.
    //
    // Le bloc `semences` **est** ce trait (#197). Le porter, c'est produire une
    // graine assez grosse pour qu'on s'en nourrisse et assez lourde pour
    // qu'elle reste au sol ; ne pas le porter, c'est une samare. Le hêtre
    // rejoint donc les chênes, et l'ajonc reste dehors — sans qu'aucune espèce
    // ne soit nommée nulle part.
    const taux =
      espece.regeneration.semisParAn *
      (espece.semences ? (input.glandeeRelative?.[tree.especeId] ?? 1) : litOuvert);
    const n = tentatives(taux);
    for (let k = 0; k < n; k++) tryEstablish(tree.especeId, tree);
  }

  return { newTrees, rng, nextTreeId };
}
