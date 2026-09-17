/**
 * Lumière spatiale (docs/regles.md §5) : chaque arbre reçoit la lumière qui
 * traverse les couronnes des arbres PLUS HAUTS dont l'ombre couvre sa
 * position (Beer-Lambert par couronne traversée, k = 0,5). L'ombre d'une
 * couronne est décalée vers le NORD (+y) d'une fraction de la hauteur —
 * le soleil est au sud en France : planter en lignes est-ouest ou nord-sud
 * n'a pas le même effet. Les caducs n'ombragent pas hors saison de végétation,
 * sauf les marcescents, qui gardent leurs feuilles mortes jusqu'au printemps.
 * Un index spatial (paniers de 12 m) borne le coût quand la régénération
 * multiplie les tiges.
 */

import { getEspece } from "./especes";
import type { TreeState } from "./trees";

const BEER_LAMBERT_K = 0.5;
/**
 * Décalage de l'ombre vers le nord, en fraction de la hauteur (moyenne
 * annuelle, lat ~45°).
 *
 * Exporté parce que le RENDU le lit : une ombre dessinée dans une autre
 * direction que celle où le moteur la calcule mentirait sur qui ombrage qui,
 * et c'est précisément ce que le §0 de `docs/interface-visuelle.md` interdit.
 * Le soleil est donc au sud à l'écran comme dans le modèle.
 */
export const SHADOW_NORTH_OFFSET = 0.4;
const BUCKET_M = 12;
/**
 * Extinction maximale (saturation douce) : les couronnes superposées se
 * chevauchent et laissent des trouées de ciel, elles ne s'empilent pas en
 * couches parfaites. exp(−4,5) ≈ 1,1 % de lumière au sol — l'ordre de grandeur
 * mesuré sous les couverts les plus sombres *(à calibrer)*.
 *
 * C'est une ASYMPTOTE : l'extinction brute a beau valoir huit, vingt ou un
 * million, la valeur rendue tend vers 4,5 sans jamais l'atteindre. Il reste donc
 * toujours `exp(−MAX_EXTINCTION)` = 1,11 % de lumière, partout, quoi qu'on
 * empile. L'intention est juste — un sous-bois n'est jamais noir, il y a des
 * trouées de ciel et des taches de soleil — mais la VALEUR n'est pas sourcée :
 * les sous-bois mesurés descendent sous 2 % et n'ont pas de mur.
 *
 * EXPORTÉE parce que ce plancher porte une conséquence qu'aucune simulation ne
 * révèle : une espèce dont le seuil de stress d'ombre passe dessous devient
 * immortelle à l'ombre. Ce seuil vaut `2 × STRESS_ONSET × compensation`, soit
 * 0,9 fois la compensation — et non la compensation, qui ne gouverne que
 * l'arrêt de la croissance. Le hêtre est dans ce cas (0,0090 contre 0,0111), et
 * c'est pourquoi une hêtraie plantée à deux mètres garde ses 361 tiges au bout
 * de cent vingt ans (#65).
 *
 * VINGT-TROIS POUR CENT D'ÉCART, c'est-à-dire un équilibre sur le fil : deux
 * constantes indépendantes se croisent là, et recalibrer l'une ou l'autre
 * renverserait le résultat sans que personne l'ait décidé. Dans la réalité le
 * hêtre dominé MEURT, par famine carbonée — un budget cumulé, pas un seuil
 * instantané (#96). `lumiere.test.ts` épingle le rapport entre les deux.
 */
export const MAX_EXTINCTION = 4.5;

/**
 * ─── LE HOUPPIER SUIT LE DIAMÈTRE, PAS LA HAUTEUR ────────────────────────────
 *
 * Ce que la formule d'avant disait : `rayon = houppierRatio × hauteur`. Une
 * perche étiolée de dix mètres et onze centimètres recevait donc le houppier
 * d'un dominant de dix mètres — un parasol sur un fil. C'est le « port serré »
 * que B10 déclare manquant depuis toujours, et il a fini par coûter quelque
 * chose de mesurable : l'effet protecteur du mélange contre les ravageurs est
 * tombé de 2,66–3,07 × à 1,88–2,24 × le jour où l'étiolement (#97) s'est mis à
 * faire monter les dominés, parce que `ravageurs.ts` épand la vulnérabilité de
 * chaque hôte sur le disque de son houppier (#105).
 *
 * **La loi est celle du tube** (Shinozaki et al. 1964), la même qui gouverne
 * déjà la charge d'entretien dans `reserves.ts` : la section d'aubier est
 * proportionnelle à la surface foliaire qu'elle alimente. Une couronne de rayon
 * `r` et d'indice foliaire `λ` porte `π r² λ` de feuille, alimentée par une
 * section `∝ D²` — donc **`r ∝ D`**. C'est aussi l'allométrie que les
 * forestiers emploient depuis toujours : les tables de largeur de houppier se
 * lisent contre le DIAMÈTRE, jamais contre la hauteur.
 *
 * **Et le lot est l'identité pour un arbre normalement conformé.** Le rayon
 * vaut exactement l'ancien quand la tige porte l'élancement d'une tige sans
 * histoire — `diametreInitialCm` pose `D = 2 h`, soit H/D 50. En dessous la
 * couronne s'élargit, au-dessus elle se resserre :
 *
 * | H/D | 35 (au large) | 50 (référence) | 90 (perche) | 129 (extrême) |
 * |---|---|---|---|---|
 * | rayon / ancien | 1,43 × | **1,00 ×** | 0,56 × | 0,39 × |
 *
 * Le gradient va dans le bon sens des deux côtés : l'arbre de plein vent étale
 * sa couronne — un chêne isolé de vingt mètres porte vingt-cinq mètres de
 * houppier, ce que l'ancienne formule ne savait pas produire — et la perche la
 * referme.
 */

/**
 * Élancement auquel le rayon vaut exactement l'ancienne formule. C'est celui
 * que le moteur prête à une tige sans histoire (`trees.ts:diametreInitialCm`,
 * `D = 2 h`) ; la constante est recopiée ici plutôt qu'importée parce que
 * `trees.ts` dépend déjà de ce module.
 */
export const ELANCEMENT_HOUPPIER_REFERENCE = 50;

/**
 * Ce que la couronne ne peut pas dépasser, en multiple de l'ancienne formule.
 *
 * Garde-fou, pas calibration : il correspond à H/D 31, en dessous de tout ce
 * que le moteur produit (le plus trapu mesuré est à 35, au large). Il existe
 * pour qu'une tige anormalement courte — un recépage, une trogne rabattue — ne
 * reçoive pas une couronne absurde *(à calibrer le jour où une telle tige
 * apparaîtra vraiment)*.
 */
export const ELARGISSEMENT_HOUPPIER_MAX = 1.6;

/**
 * Rayon du houppier, m. Proportionnel au DIAMÈTRE (modèle du tube), calé pour
 * redonner `houppierRatio × hauteur` à l'élancement de référence.
 *
 * Une tige sans diamètre enregistré retombe sur l'ancienne formule : c'est un
 * semis qu'on projette, pas un arbre déformé.
 */
export function crownRadiusM(heightM: number, houppierRatio: number, diametreCm: number): number {
  const h = Math.max(0, heightM);
  const base = houppierRatio * h;
  if (!(diametreCm > 0) || h <= 0) return base;
  const elancement = (100 * h) / diametreCm;
  return base * Math.min(ELARGISSEMENT_HOUPPIER_MAX, ELANCEMENT_HOUPPIER_REFERENCE / elancement);
}

/**
 * Profondeur maximale d'un houppier, en fraction de la hauteur : un arbre venu
 * seul garde ses branches presque jusqu'au sol *(à calibrer)*.
 *
 * C'est un PLAFOND, pas un trait d'espèce. La profondeur réelle, elle, se
 * calcule — voir `baseHouppierCible`.
 */
export const PROFONDEUR_HOUPPIER_MAX = 0.9;

/**
 * Hauteur en dessous de laquelle les branches ne paient plus leur respiration,
 * m — la base du houppier vers laquelle l'arbre tend (docs/realisme.md B10).
 *
 * Ce n'est PAS une constante d'espèce, et c'est tout l'enjeu : le même chêne
 * garde ses branches jusqu'en bas au milieu d'un pré et s'auto-élague sur
 * quinze mètres en futaie serrée. Ce que l'espèce apporte, c'est le SEUIL
 * (`lumiere.compensation`, déjà sourcé par l'atlas) et l'opacité de sa propre
 * couronne (`lumiere.lai`) ; la compétition apporte le reste.
 *
 * Le calcul suit le mécanisme physiologique de l'élagage naturel. Une branche
 * à la profondeur relative p sous la cime reçoit ce que laisse passer le
 * feuillage au-dessus d'elle — Beer-Lambert, la même loi qu'ailleurs :
 *
 *     lumière(p) = lumièreCime × exp(−k · lai · p)
 *
 * Elle vit tant que ça reste au-dessus du point de compensation, d'où la
 * profondeur vivante :
 *
 *     p* = ln(lumièreCime / compensation) / (k · lai)
 *
 * Ce que ça donne, et c'est le test qui compte : en pleine lumière, hêtre
 * comme pin gardent une couronne pleine (l'arbre de plein vent est branchu,
 * quelle que soit l'espèce). À 30 % de lumière, le hêtre garde toujours tout —
 * compensation 0,01, il patiente — et le pin, compensation 0,25, se retrouve
 * avec un houppier réduit au tiers de sa hauteur. C'est exactement la futaie
 * de pins au fût nu et le sous-bois de hêtres branchus jusqu'en bas.
 */
export function baseHouppierCible(
  heightM: number,
  lumiereCime: number,
  compensation: number,
  lai: number,
): number {
  if (heightM <= 0) return 0;
  const opacite = BEER_LAMBERT_K * lai;
  if (opacite <= 0 || compensation <= 0) return 0;
  // Une cime déjà sous son point de compensation : plus une seule branche ne
  // paie sa respiration, pas même la plus haute. C'est la limite continue du
  // calcul (ln(1) = 0), et c'est un arbre qui ne pousse plus. Il ne MEURT pas
  // pour autant : le stress ne monte qu'à 0,9 fois la compensation
  // (`fLumSurvival`, trees.ts), et entre les deux l'arbre patiente sur ses
  // réserves.
  if (lumiereCime <= compensation) return heightM;
  const profondeurVivante = Math.log(lumiereCime / compensation) / opacite;
  const profondeur = Math.min(PROFONDEUR_HOUPPIER_MAX, profondeurVivante);
  return heightM * (1 - profondeur);
}

/**
 * Part de couronne qui reste, une fois retirée la tranche basse ∈ [0,1].
 *
 * Deux causes se rejoignent dans `baseHouppierM` et le modèle ne les
 * distingue pas, parce que l'arbre non plus : l'élagage naturel (la branche
 * meurt d'ombre) et l'élagage à la scie (le joueur la coupe pour la bille
 * d'œuvre). Dans les deux cas la couronne perd sa tranche basse, et intercepte
 * moins.
 *
 * C'est LINÉAIRE en profondeur de couronne, donc probablement un peu fort —
 * les branches basses sont les plus ombragées, donc les moins fournies.
 * Affiner demande une source sur la distribution verticale du feuillage.
 */
export function partHouppier(heightM: number, baseHouppierM: number): number {
  const profondeurMax = PROFONDEUR_HOUPPIER_MAX * heightM;
  if (profondeurMax <= 0) return 1;
  // La base est bornée ici plutôt que chez chaque appelant : un arbre rabattu
  // (recépage, trogne, rejet de souche) a une base héritée qui peut dépasser
  // sa nouvelle hauteur, et une profondeur négative n'aurait aucun sens.
  const base = Math.max(0, Math.min(heightM, baseHouppierM));
  return Math.max(0, Math.min(1, (heightM - base) / profondeurMax));
}

interface Shadow {
  cx: number;
  cy: number;
  r2: number;
  heightM: number;
  extinction: number;
}

/** Ombres actives (arbres vivants, en feuilles), indexées par panier spatial. */
/**
 * Part du feuillage d'un arbre qui INTERCEPTE la lumière ∈ [0,1]. Un booléen ne
 * suffit pas : le bouleau est en feuilles quand le frêne est encore nu, et un
 * houppier à moitié sorti ne fait pas la même ombre qu'un houppier plein
 * (phenologie.ts). Ce qui ombre n'est pas ce qui assimile — les feuilles mortes
 * d'un marcescent comptent ici et nulle part ailleurs.
 */
export type PartOmbrageante = (tree: TreeState) => number;

function buildShadowIndex(
  trees: readonly TreeState[],
  part: PartOmbrageante,
): Map<number, Shadow[]> {
  const buckets = new Map<number, Shadow[]>();
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const feuillage = part(tree);
    if (feuillage <= 0) continue;
    const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm);
    if (r <= 0) continue;
    const shadow: Shadow = {
      cx: tree.x,
      cy: tree.y + SHADOW_NORTH_OFFSET * tree.heightM,
      r2: r * r,
      heightM: tree.heightM,
      // L'indice foliaire suit le déploiement : c'est là que la phénologie
      // entre dans la loi de Beer-Lambert. Et l'élagage y entre aussi : une
      // couronne dont on a retiré la tranche basse intercepte moins.
      extinction:
        BEER_LAMBERT_K *
        espece.lumiere.lai *
        feuillage *
        partHouppier(tree.heightM, tree.baseHouppierM ?? 0),
    };
    const bx0 = Math.floor((shadow.cx - r) / BUCKET_M);
    const bx1 = Math.floor((shadow.cx + r) / BUCKET_M);
    const by0 = Math.floor((shadow.cy - r) / BUCKET_M);
    const by1 = Math.floor((shadow.cy + r) / BUCKET_M);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = by * 100_000 + bx;
        const list = buckets.get(key);
        if (list) list.push(shadow);
        else buckets.set(key, [shadow]);
      }
    }
  }
  return buckets;
}

function extinctionAt(
  buckets: Map<number, Shadow[]>,
  x: number,
  y: number,
  heightM: number,
): number {
  const key = Math.floor(y / BUCKET_M) * 100_000 + Math.floor(x / BUCKET_M);
  const list = buckets.get(key);
  if (!list) return 0;
  let extinction = 0;
  for (const s of list) {
    // Plus haut = ombrage plein ; codominant (dans les 25 % sous la cible) =
    // ombrage latéral partiel.
    //
    // CE COMMENTAIRE JUSTIFIAIT LE TERME PAR L'AUTO-ÉCLAIRCIE — « sans lui, une
    // cohorte dense de même hauteur ne se gênerait jamais et l'auto-éclaircie
    // n'émergerait pas » — et la campagne de #65 a mesuré le contraire. Terme
    // ANNULÉ (poids 0), une pineraie plantée à 2 m passe quand même de 361 à
    // 59-69 tiges en cent vingt ans, contre 47-54 au poids d'aujourd'hui. Elle
    // s'éclaircit donc sans lui, et à peine moins vite.
    //
    // Ce qui l'éclaircit n'est pas la lumière : sur ~310 morts, les RAVAGEURS en
    // prennent 205 à 244 et les CHABLIS 55 à 98 ; l'ombre, 4 à 7. La mortalité
    // densité-dépendante de ce moteur passe par la pression parasitaire et le
    // vent. Le poids ne déplace ni l'élancement, ni l'auto-éclaircie, ni le
    // tempo de la succession, ni le tri des espèces.
    //
    // Le terme reste — il est physiquement juste, un voisin de même taille
    // ombrage bel et bien de côté — mais il ne porte AUCUNE des conclusions
    // qu'on lui prêtait. Ce qui porte, c'est le SEUIL : le passer de 0,75 à 0
    // effondre le peuplement (45 tiges au lieu de 276 à cent vingt ans). Ce
    // n'est pas une piste de calibration pour autant, c'est une absurdité
    // physique — à seuil nul, un semis de deux mètres ombrage une cime de
    // vingt-cinq. Ça prouve seulement que le mécanisme est vivant.
    let weight: number;
    if (s.heightM > heightM) weight = 1;
    else if (s.heightM > 0.75 * heightM && s.heightM < heightM) weight = 0.4;
    else continue;
    const dx = x - s.cx;
    const dy = y - s.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= s.r2) {
      // Pénombre : l'ombre est pleine à l'aplomb du houppier et s'estompe vers
      // son bord (couronne moins épaisse, lumière latérale). C'est ce dégradé
      // qui crée les micro-situations d'abri — un sujet planté EN LISIÈRE d'une
      // nurse est protégé du vent et du rayonnement sans être étouffé (ch1-A).
      extinction += weight * s.extinction * (1 - d2 / s.r2);
    }
  }
  // Une ou deux couronnes s'additionnent pleinement ; les empilements profonds
  // saturent (chevauchements, trouées de ciel) vers MAX_EXTINCTION.
  if (extinction <= 2) return extinction;
  const span = MAX_EXTINCTION - 2;
  return 2 + span * (1 - Math.exp(-(extinction - 2) / span));
}

/**
 * Lumière relative ∈ [0,1] reçue par chaque arbre vivant (index aligné sur
 * `trees`, 1 pour les morts). `part` donne le feuillage ombrageant de chaque arbre.
 */
export function computeLight(trees: readonly TreeState[], part: PartOmbrageante): number[] {
  const buckets = buildShadowIndex(trees, part);
  return trees.map((tree) =>
    tree.alive ? Math.exp(-extinctionAt(buckets, tree.x, tree.y, tree.heightM)) : 1,
  );
}

/** Lumière relative au sol en un point (pour l'installation des semis). */
export function lightAtPoint(
  trees: readonly TreeState[],
  x: number,
  y: number,
  part: PartOmbrageante,
): number {
  const buckets = buildShadowIndex(trees, part);
  return Math.exp(-extinctionAt(buckets, x, y, 0));
}

/**
 * L'index d'ombres, bâti une fois pour plusieurs interrogations.
 *
 * `lightAtPoint` est commode et coûte cher : elle RECONSTRUIT l'index à chaque
 * appel. Tant qu'on lui demandait un point, ça ne se voyait pas ; la
 * régénération, elle, lui en demande des centaines dans la même année, et le
 * peuplement ne bouge pas entre deux. À quatre mille tiges, cette
 * reconstruction est le deuxième poste du tick — 11 % du temps, plus 4 % pour
 * la lecture elle-même (#99).
 *
 * Les deux chemins partagent le même index et le même parcours, donc la même
 * somme dans le même ordre : le résultat est identique au bit près.
 */
export type IndexOmbres = ReturnType<typeof buildShadowIndex>;

export function indexerOmbres(trees: readonly TreeState[], part: PartOmbrageante): IndexOmbres {
  return buildShadowIndex(trees, part);
}

export function lumiereAuPointIndexee(ombres: IndexOmbres, x: number, y: number): number {
  return Math.exp(-extinctionAt(ombres, x, y, 0));
}

/**
 * Abri au vent d'un point ∈ [0,1] (docs/regles.md §3, ch5 « haie brise-vent »).
 * Contrairement à l'ombre et aux racines, la protection au vent PORTE LOIN :
 * une haie abrite sur 10 à 20 fois sa hauteur. C'est ce découplage qui rend
 * l'agroforesterie payante en milieu venté — on protège sans concurrencer,
 * à condition d'espacer.
 */
export function windShelterAt(
  trees: readonly TreeState[],
  x: number,
  y: number,
  selfId?: number,
): number {
  let shelter = 0;
  for (const t of trees) {
    if (!t.alive || t.id === selfId || t.heightM < 0.5) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Au-delà de 12 hauteurs, l'effet est nul ; tout près, il plafonne.
    if (d > 12 * t.heightM) continue;
    shelter += (0.12 * t.heightM) / Math.max(1.5, d);
    // L'abri SATURE, et c'est ce qui rend l'arrêt exact : tous les termes qui
    // restent sont positifs (`heightM` vaut au moins 0,5), donc une somme déjà
    // au-dessus de 1 ne peut plus que monter et le `min` rendra 1 de toute
    // façon. Sur un fourré de quatre mille tiges, la plupart des points sont
    // abrités bien avant la fin de la boucle (#99).
    if (shelter >= 1) return 1;
  }
  return Math.min(1, shelter);
}

/**
 * L'abri au vent, rangé par paniers — même résultat, sans le balayage complet.
 *
 * `windShelterAt` coûtait le PEUPLEMENT ENTIER par arbre et par semaine, donc un
 * n² hebdomadaire : c'est le premier poste de calcul du tick dès qu'une parcelle
 * se peuple, 9,7 % du temps à 2 300 tiges et une part qui grandit avec le carré
 * (#99). Or la boucle jette la plupart des voisins sur un test de distance.
 *
 * Chaque arbre est donc rangé dans les paniers que sa PORTÉE couvre — douze fois
 * sa hauteur, la distance au-delà de laquelle il n'abrite plus rien — et une
 * interrogation ne lit que le panier de son point. Un sous-arbrisseau de
 * soixante centimètres porte à sept mètres et n'encombre qu'un panier ; un arbre
 * de vingt mètres porte plus loin que la parcelle et entre dans tous, ce qui est
 * exactement ce qu'il faut puisqu'il abrite tout le monde.
 *
 * LE RÉSULTAT EST LE MÊME AU BIT PRÈS, et ça ne va pas de soi : une somme de
 * flottants n'est pas associative, donc changer l'ORDRE des voisins changerait
 * les derniers chiffres et pourrait déplacer un seuil quelque part dans la
 * suite. Les arbres sont insérés dans l'ordre de `trees`, si bien que chaque
 * panier les garde dans cet ordre et que la somme parcourt la même suite de
 * termes qu'avant. Le test `abri.test.ts` le vérifie sur un vrai peuplement.
 */
export type IndexAbriVent = Map<number, TreeState[]>;

export function indexerAbriVent(trees: readonly TreeState[], coteM: number): IndexAbriVent {
  const paniers: IndexAbriVent = new Map();
  const bMax = Math.floor(Math.max(0, coteM) / BUCKET_M);
  for (const t of trees) {
    // Les mêmes exclus que dans la boucle de référence : ils ne seraient
    // jamais sommés, autant ne pas les ranger.
    if (!t.alive || t.heightM < 0.5) continue;
    const portee = 12 * t.heightM;
    const bx0 = Math.max(0, Math.floor((t.x - portee) / BUCKET_M));
    const bx1 = Math.min(bMax, Math.floor((t.x + portee) / BUCKET_M));
    const by0 = Math.max(0, Math.floor((t.y - portee) / BUCKET_M));
    const by1 = Math.min(bMax, Math.floor((t.y + portee) / BUCKET_M));
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = by * 100_000 + bx;
        const list = paniers.get(key);
        if (list) list.push(t);
        else paniers.set(key, [t]);
      }
    }
  }
  return paniers;
}

export function abriVentIndexe(
  paniers: IndexAbriVent,
  x: number,
  y: number,
  selfId?: number,
): number {
  const list = paniers.get(Math.floor(y / BUCKET_M) * 100_000 + Math.floor(x / BUCKET_M));
  if (!list) return 0;
  let shelter = 0;
  for (const t of list) {
    if (t.id === selfId) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Le panier est un SURENSEMBLE : il retient les arbres dont la portée
    // touche la maille, pas ceux dont elle atteint le point. Le même test que
    // la référence tranche, et c'est lui qui garantit l'égalité.
    if (d > 12 * t.heightM) continue;
    shelter += (0.12 * t.heightM) / Math.max(1.5, d);
    if (shelter >= 1) return 1;
  }
  return Math.min(1, shelter);
}

/**
 * Lumière relative au sol de CHAQUE cellule (microclimat : l'évaporation est
 * réduite sous couvert, docs/regles.md §3).
 */
export function computeGroundLight(
  trees: readonly TreeState[],
  widthM: number,
  heightM: number,
  part: PartOmbrageante,
): number[] {
  const buckets = buildShadowIndex(trees, part);
  const out = new Array<number>(widthM * heightM);
  for (let y = 0; y < heightM; y++) {
    for (let x = 0; x < widthM; x++) {
      out[y * widthM + x] = Math.exp(-extinctionAt(buckets, x + 0.5, y + 0.5, 0));
    }
  }
  return out;
}
