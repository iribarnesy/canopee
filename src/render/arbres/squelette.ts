/**
 * Le squelette d'un arbre, par branchement récursif
 * (docs/interface-visuelle.md §4, décision D4).
 *
 * **C'est la pièce qui rend D4 payable.** Vingt-cinq essences reconnaissables,
 * chacune à six stades, chacune élaguée, trognée, recépée ou sénescente : en
 * dessins séparés c'est un produit cartésien. En squelette généré, les stades
 * **sortent gratuitement** — on déroule le même squelette moins loin, et un
 * gaulis EST un jeune arbre. L'élagage, l'étêtage et le recépage aussi : ce
 * sont des coupes dans le squelette, pas d'autres arbres.
 *
 * **Trois contraintes viennent du lot L0, et aucune n'est négociable :**
 *
 * 1. **Le nombre de segments est PLAFONNÉ**, quel que soit le paramétrage. Il
 *    croît en (branches par nœud)^(ordres) : trois branches sur sept ordres
 *    font deux mille segments, et la cuisson d'une silhouette passait de 0,3 à
 *    13,3 ms. Le plafond n'est pas une sécurité, c'est un élément du contrat —
 *    une fiche mal réglée doit dessiner un arbre pauvre, pas geler l'image.
 * 2. **Le feuillage s'accroche à tout rameau TERMINAL**, c'est-à-dire à tout
 *    axe qui n'a pas engendré de filles, et non au dernier ordre de récursion.
 *    Une branche devient trop courte avant d'atteindre l'ordre maximal ; en
 *    liant le feuillage à l'ordre, l'arbre sortait nu.
 * 3. **L'enveloppe du houppier est imposée** par `port.ts` et non espérée du
 *    branchement. Voir `fiche.ts`.
 *
 * **Aucun hasard.** La variation d'un arbre à l'autre — son penchant, sa
 * tortuosité, la place de ses branches — dérive de son `id` par hachage.
 * `Math.random` est interdit dans `src/render` et le garde-fou le vérifie : une
 * capture doit être reproductible, et un bug de rendu doit se rejouer.
 *
 * Module **pur** : il rend des segments en mètres, dans le repère de l'arbre
 * (origine au pied, `y` vers le haut, `x` transversal, `z` en profondeur).
 * Aucun canvas, aucune projection.
 */

import type { Branchement } from "./fiche";

/** Un point dans le repère local de l'arbre, en mètres. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Un segment de bois : un axe entre deux points, avec son épaisseur. */
export interface Segment {
  depart: Point3;
  arrivee: Point3;
  /** rayon au départ, en mètres */
  rayonDepartM: number;
  rayonArriveeM: number;
  /** ordre de branchement : 0 = le fût, 1 = les charpentières, etc. */
  ordre: number;
  /**
   * Vrai si aucun axe ne part de `arrivee` : c'est là que va un bouquet de
   * feuilles. **La règle de L0** — terminal veut dire « sans fille », pas
   * « au dernier ordre ».
   */
  terminal: boolean;
}

/**
 * Plafond dur du nombre de segments d'un arbre.
 *
 * **Deux mille cinq cents, et c'est mesuré, pas choisi.** Au-delà, la cuisson
 * d'une silhouette dépassait le budget d'image du lot L0. Un arbre de futaie
 * lisible en demande deux à six cents ; le plafond n'existe que pour qu'une
 * fiche mal réglée dégrade l'arbre au lieu de geler le jeu.
 */
export const SEGMENTS_MAX = 2500;

/**
 * Longueur en dessous de laquelle un axe ne se divise plus, en mètres.
 *
 * C'est ce qui arrête la récursion pour de vrai : l'ordre maximal n'est qu'un
 * garde-fou. Un rameau de deux centimètres ne porte pas de branche, il porte
 * des feuilles.
 */
export const LONGUEUR_MIN_M = 0.04;

/** Ordre de récursion maximal, quelle que soit la fiche. */
export const ORDRE_MAX = 8;

/** Hachage entier → [0,1[, stable et sans allocation. Le même que le tapis. */
function hacher(a: number, b: number, sel: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ sel) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Ce que le squelette a besoin de savoir de l'arbre à dessiner. */
export interface Sujet {
  /** identifiant du moteur : c'est LUI qui sème toute la variation */
  id: number;
  hauteurM: number;
  /** rayon du houppier / hauteur — vient du moteur (`lumiere.houppierRatio`) */
  houppierRatio: number;
  /**
   * Base du houppier, m : en dessous, plus une branche vivante.
   *
   * **Elle vient du MOTEUR (`baseHouppierM`), et elle remplace deux choses que
   * le rendu faisait à sa place.** Il calculait la longueur du fût par une
   * formule à lui — `1 − 2 × houppierRatio`, rabattue entre 0,15 et 0,5 de la
   * hauteur — c'est-à-dire une approximation privée d'une grandeur écologique,
   * exactement le défaut que le seuil de grillage de l'herbe avait été. Et il
   * traitait l'élagage séparément, alors que l'arbre ne distingue pas les deux
   * façons dont sa couronne remonte.
   *
   * Ce que la formule ne pouvait pas dire, et que le moteur dit : la profondeur
   * de couronne est un RÉSULTAT DE COMPÉTITION, pas un trait d'espèce. Le même
   * chêne est branchu jusqu'en bas en pré et porte quinze mètres de fût nu en
   * futaie — un ratio par espèce donne le même arbre dans les deux cas.
   *
   * La base ne descend jamais : une branche morte ne repousse pas. Elle monte
   * de deux façons que l'arbre confond — l'ombre qui tue les branches basses
   * (élagage naturel), ou le joueur qui les coupe.
   */
  baseHouppierM: number;
  /**
   * Hauteur de la tête de trogne, m. Le fût s'arrête là, et les rejets
   * repartent tous du même point — la silhouette la plus reconnaissable du
   * bocage.
   */
  teteTrogneM?: number;
  /**
   * Nombre de brins d'une cépée ; absent ou 1 = un fût unique.
   *
   * Les brins partent tous du SOL et s'écartent : il n'y a pas de tronc. C'est
   * la seule façon d'obtenir un noisetier qui ne soit pas un pommier en
   * miniature — vérifié en mesurant, ils sortaient identiques au segment près.
   */
  brins?: number;
}

/**
 * Longueur du fût, en mètres : la part de la hauteur qui reste nue sous le
 * houppier.
 *
 * **Déduite du rayon de houppier que le moteur donne, et pas d'un réglage.**
 * Le premier jet posait `1 − ratio × 1,6`, ce qui laissait 44 % de fût nu à un
 * hêtre et donnait, sur la planche d'essences, sept perches surmontées d'un
 * chapeau. La règle juste est géométrique : un houppier de rayon `r` est à peu
 * près aussi haut que large, donc il occupe `2r` de hauteur, et le fût prend ce
 * qui reste. `r = houppierRatio × hauteur`, d'où `fût = hauteur × (1 − 2 ×
 * houppierRatio)`.
 *
 * Les bornes existent pour les deux extrêmes du catalogue : un noisetier
 * (`ratio` 0,5) n'aurait plus de fût du tout, et un pin (`ratio` 0,25) en
 * aurait la moitié — ce qui est vrai d'un vieux pin en plateau, mais pas d'un
 * jeune. Quinze pour cent au minimum, la moitié au plus.
 */

/** Rayon du fût au pied, déduit de la hauteur. */
export function rayonAuPiedM(hauteurM: number): number {
  // Une allométrie grossière mais universelle : le diamètre à hauteur de
  // poitrine vaut environ un centième de la hauteur pour un arbre de futaie.
  // Ce n'est pas une grandeur du moteur — il n'a pas de diamètre — donc c'est
  // au rendu de la poser, et de la poser une seule fois.
  return Math.max(0.004, hauteurM * 0.011);
}

interface Axe {
  depart: Point3;
  direction: Point3;
  longueurM: number;
  rayonM: number;
  ordre: number;
  /**
   * Phase phyllotaxique de l'axe, en radians : l'azimut où partira sa
   * prochaine branche.
   *
   * **C'est ce qui équilibre un houppier, et rien d'autre ne le fait.** La
   * divergence n'a de sens que d'un nœud AU SUIVANT le long d'un même axe —
   * c'est la définition même de la phyllotaxie : chaque feuille, donc chaque
   * bourgeon, donc chaque branche, est décalée d'environ 137° de la
   * précédente, et c'est cette rotation qui fait qu'un arbre ne pousse pas
   * tout d'un côté. La porter sur l'axe, c'est modéliser ça ; la tirer au sort
   * à chaque nœud, c'est le contraire.
   */
  phase: number;
  /**
   * Vrai si l'axe appartient à la FLÈCHE — la chaîne qui prolonge le tronc
   * jusqu'à la cime — et non à une branche latérale.
   *
   * **Cette distinction manquait, et son absence donnait des houppiers plats.**
   * Sans elle, la fille apicale d'une branche latérale héritait du même ratio de
   * prolongement que la flèche : une latérale ne se ramifiait donc pas, elle
   * repartait comme un second tronc. Mesuré sur un hêtre de seize mètres, 44 %
   * des rameaux se retrouvaient dans un dixième de la hauteur du houppier, en
   * un buisson massif à sa base surmonté d'une longue perche nue. C'est la
   * « touffe au sommet d'un bâton » de L0, à l'envers.
   */
  surLaFleche: boolean;
}

function normaliser(v: Point3): Point3 {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

/**
 * Fait tourner `v` de `angle` radians autour de l'axe vertical, puis l'incline
 * de `inclinaison` radians par rapport à sa direction d'origine.
 *
 * Suffisant ici : un branchement se décrit par « de combien je m'écarte de
 * mon axe » et « autour de quel azimut », ce qui est exactement ça.
 */
function devier(direction: Point3, azimut: number, inclinaison: number): Point3 {
  const d = normaliser(direction);
  // Une base orthonormée dont le premier vecteur est `d`. Le choix du second
  // est arbitraire mais doit éviter d'être colinéaire à `d`.
  const aide: Point3 = Math.abs(d.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = normaliser({
    x: d.y * aide.z - d.z * aide.y,
    y: d.z * aide.x - d.x * aide.z,
    z: d.x * aide.y - d.y * aide.x,
  });
  const v = {
    x: d.y * u.z - d.z * u.y,
    y: d.z * u.x - d.x * u.z,
    z: d.x * u.y - d.y * u.x,
  };
  const s = Math.sin(inclinaison);
  const c = Math.cos(inclinaison);
  const ca = Math.cos(azimut);
  const sa = Math.sin(azimut);
  return normaliser({
    x: c * d.x + s * (ca * u.x + sa * v.x),
    y: c * d.y + s * (ca * u.y + sa * v.y),
    z: c * d.z + s * (ca * u.z + sa * v.z),
  });
}

/**
 * Engendre le squelette.
 *
 * Parcours en LARGEUR et non en profondeur, et ce n'est pas un détail de
 * style : c'est ce qui rend le plafond de segments **utile**. En profondeur, le
 * plafond couperait une branche entière au milieu de l'arbre et laisserait les
 * autres complètes — un arbre manchot. En largeur, il coupe le dernier ordre,
 * partout à la fois : l'arbre perd du détail, pas un membre.
 */
export function engendrer(sujet: Sujet, b: Branchement, segmentsMax = SEGMENTS_MAX): Segment[] {
  const segments: Segment[] = [];
  if (sujet.hauteurM <= 0) return segments;

  const brins = Math.max(1, Math.round(sujet.brins ?? 1));
  // Les brins d'une cépée se partagent la matière : chacun est plus fin qu'un
  // fût unique de même hauteur, et c'est ce qui la fait lire comme un buisson.
  const rayon = rayonAuPiedM(sujet.hauteurM) / Math.sqrt(brins);
  // Une cépée n'a PAS de fût : ses brins partent du sol. Une trogne s'arrête à
  // sa tête. Tout le reste monte jusqu'à la base de houppier que le MOTEUR
  // donne — et non plus jusqu'à une part de hauteur calculée ici.
  // **Bornée sous la cime, et ce n'est pas une correction de la grandeur.** Le
  // moteur garantit qu'une base de houppier reste sous la hauteur de l'arbre —
  // elle ne monte que par mort des branches basses, et un arbre sans branche
  // n'existe pas. Mais une scène tronquée, un banc mal réglé ou un arbre en
  // cours de rabattage peuvent présenter le cas, et le générateur ne doit alors
  // pas rendre un arbre PLUS HAUT que celui qu'on lui demande : c'est ce qui
  // arrivait, le fût dépassant la cime et `hauteurAtteinteM` avec.
  //
  // On ne remplace pas la valeur par une estimation — ce serait retomber dans
  // l'approximation privée qu'on vient de retirer. On refuse seulement de
  // dessiner un arbre impossible.
  const baseM = Math.min(sujet.baseHouppierM, sujet.hauteurM * 0.9);
  const troncM = brins > 1 ? 0 : (sujet.teteTrogneM ?? baseM);
  const hautDuFut: Point3 = { x: 0, y: Math.max(0.02, troncM), z: 0 };
  segments.push({
    depart: { x: 0, y: 0, z: 0 },
    arrivee: hautDuFut,
    rayonDepartM: rayon,
    rayonArriveeM: rayon * b.conicite,
    ordre: 0,
    terminal: false,
  });

  // Le houppier part du haut du fût, sauf élagage qui le remonte encore.
  const depart: Point3 = hautDuFut;
  if (depart.y > hautDuFut.y) {
    segments.push({
      depart: hautDuFut,
      arrivee: depart,
      rayonDepartM: rayon * b.conicite,
      rayonArriveeM: rayon * b.conicite * b.conicite,
      ordre: 0,
      terminal: false,
    });
  }

  const resteM = Math.max(0.02, sujet.hauteurM - depart.y);
  // **Le premier axe ne fait PAS toute la hauteur du houppier**, et c'est un
  // bug que le premier jet avait : la flèche se prolonge d'ordre en ordre, et
  // la somme de la chaîne apicale — une série géométrique de raison `q` — vaut
  // `L / (1 - q)`. En partant de la hauteur entière, l'arbre sortait trois fois
  // trop haut. On part donc de ce qu'il faut pour que la SOMME tombe juste.
  const q = Math.min(0.95, b.ratioLongueur * (1 + b.dominance * 0.6));
  const premierM = Math.max(LONGUEUR_MIN_M, resteM * (1 - q));

  const filles: Axe[] = [];
  for (let i = 0; i < brins; i++) {
    // Un brin unique monte droit ; les brins d'une cépée s'ARQUENT, chacun dans
    // sa direction, répartis tout autour du pied. C'est cet écartement qui
    // donne la silhouette de buisson.
    const azimut = (i / brins) * Math.PI * 2 + hacher(sujet.id, i, 0x3f19) * 0.9;
    const ecart = brins === 1 ? 0 : (0.22 + hacher(sujet.id + i, i, 0x60d1) * 0.16) * Math.PI;
    filles.push({
      depart,
      direction: devier({ x: 0, y: 1, z: 0 }, azimut, ecart),
      longueurM: premierM,
      rayonM: rayon * b.conicite * b.conicite,
      ordre: 1,
      // Chaque brin démarre sa propre série phyllotaxique, sans quoi une cépée
      // ferait pousser tous ses brins du même côté à la même hauteur.
      phase: azimut + hacher(sujet.id, i + 64, 0x1d3b) * Math.PI * 2,
      // Chaque brin d'une cépée porte sa propre flèche : une cépée est un
      // faisceau de tiges, pas un arbre à plusieurs branches.
      surLaFleche: true,
    });
  }

  // ── Le houppier, en LARGEUR ───────────────────────────────────────────
  // Et non en profondeur : c'est ce qui rend le plafond de segments utile. En
  // profondeur, il couperait une branche entière au milieu de l'arbre et
  // laisserait les autres complètes — un arbre manchot. En largeur, il coupe le
  // dernier ordre partout à la fois : l'arbre perd du détail, pas un membre.
  let file = filles;
  let ordre = 1;
  while (file.length > 0 && ordre <= ORDRE_MAX) {
    const suivante: Axe[] = [];
    // Un segment par axe de la file, et pour chacun le nombre de filles qu'il
    // engendre. **Compter par axe et non par ordre** : le premier jet marquait
    // non-terminal tout axe d'un ordre où QUELQU'UN avait des filles, ce qui
    // laissait le feuillage au seul dernier ordre — le défaut exact que L0
    // avait relevé, réintroduit par une paresse d'écriture.

    for (const axe of file) {
      const bout: Point3 = {
        x: axe.depart.x + axe.direction.x * axe.longueurM,
        y: axe.depart.y + axe.direction.y * axe.longueurM,
        z: axe.depart.z + axe.direction.z * axe.longueurM,
      };
      segments.push({
        depart: axe.depart,
        arrivee: bout,
        rayonDepartM: axe.rayonM,
        rayonArriveeM: axe.rayonM * b.conicite,
        ordre: axe.ordre,
        terminal: true, // déduit pour de bon par `marquerLesBouts`
      });
      if (axe.longueurM < LONGUEUR_MIN_M) continue;

      for (let k = 0; k < b.branchesParNoeud; k++) {
        // La première fille prolonge l'axe : c'est elle qui porte la dominance
        // apicale. Les suivantes s'en écartent.
        const prolonge = k === 0;
        const alea = hacher(sujet.id * 7919 + segments.length, k, 0x51a3);
        const tortu = (alea - 0.5) * 2 * b.tortuosite;
        // **En verticille, une branche part de la flèche à l'horizontale et
        // reste À PLAT.** Hors de la flèche, elle ne se redresse pas : elle
        // s'ouvre en éventail dans son propre plan, ce qui donne l'étage. Un
        // feuillu, lui, garde le même angle de branchement partout.
        const angleLateral = b.verticille && !axe.surLaFleche ? b.angleDeg * 0.34 : b.angleDeg;
        // **La flèche d'un conifère est DROITE**, et pas « un peu moins tordue
        // que ses branches ». Prendre une fraction de l'angle de branchement
        // donnait treize degrés par pousse à un pin dont les branches partent à
        // soixante-douze : au bout de quatre étages la flèche avait quitté
        // l'axe, et l'arbre n'avait plus de tronc à mi-hauteur. Le contrôle
        // apical d'un conifère est autrement plus fort que ça.
        const angleApical = b.verticille ? 2 : b.angleDeg * 0.18;
        const inclinaison =
          ((prolonge ? angleApical : angleLateral) * Math.PI) / 180 + tortu * 0.35;
        // **L'azimut est propre à CHAQUE nœud**, et le premier jet ne l'était
        // pas : le décalage de base était tiré de `(id, ordre, k)`, donc tous
        // les axes d'un même ordre partaient dans la même direction. Le
        // houppier s'effondrait d'un côté de l'arbre, la flèche restant nue de
        // l'autre — visible d'un coup d'œil sur la planche d'essences, et
        // impossible à corriger en réglant les angles, puisque le défaut était
        // dans la graine et non dans la géométrie.
        //
        // La divergence sépare les filles d'un même nœud ; le décalage tiré du
        // nœud lui-même évite que deux nœuds superposés fassent une palissade.
        // En verticille, les branches d'une même couronne se répartissent
        // RÉGULIÈREMENT autour de l'axe — c'est ce qui fait la couronne — au
        // lieu de suivre la divergence phyllotaxique d'un feuillu.
        //
        // **Le premier jet tirait le décalage sur `(nœud, k)`** : chaque fille
        // recevait un azimut uniforme indépendant, ce qui effaçait purement et
        // simplement la divergence — le terme `k × divergenceDeg` n'était plus
        // qu'un bruit ajouté à un autre bruit. Trois filles tirées au hasard
        // sur le cercle ne se répartissent pas, elles se groupent, et le biais
        // se compose d'ordre en ordre.
        //
        // Mesuré, et c'est net : le décentrement du houppier — distance du
        // barycentre des bouts à l'axe, rapportée au rayon — valait 0,17 à
        // 0,32 pour tous les feuillus à fût unique, contre 0,04 à 0,09 pour
        // les cépées et le pin. Ce n'était pas un hasard de graine : cépées et
        // verticilles sont précisément les deux cas où le code répartissait
        // déjà les azimuts RÉGULIÈREMENT au lieu de les tirer. Les seuls
        // houppiers centrés étaient ceux qui échappaient à cette ligne.
        //
        // **Tirer une rotation par nœud au lieu d'une par fille ne suffit pas**,
        // et la mesure l'a dit aussi : l'aulne, qui ne fait qu'UNE latérale par
        // nœud (`branchesParNoeud: 2`, la première prolongeant l'axe), restait
        // à 0,24. Un nœud à latérale unique est lopsided par nature — aucune
        // répartition au sein du nœud ne peut le corriger, et une rotation
        // tirée au sort ne se compense qu'en moyenne, ce qui demande plus de
        // nœuds qu'un houppier n'en a.
        //
        // Ce qui l'équilibre est la PHYLLOTAXIE, et c'est justement ce que le
        // paramètre `divergenceDeg` désigne dans la vraie plante : la
        // divergence sépare deux nœuds SUCCESSIFS le long d'un axe, pas deux
        // filles d'un même nœud. Un aulne dont les latérales sortent à 0°,
        // 150°, 300°, 90°… tourne autour de sa flèche ; un aulne dont chaque
        // latérale part dans une direction tirée au sort penche.
        //
        // Les filles d'un même nœud, elles, se répartissent RÉGULIÈREMENT — la
        // règle que le verticille appliquait déjà, et qui n'avait aucune raison
        // de lui être réservée.
        const laterales = Math.max(1, b.branchesParNoeud - 1);
        const gigue = ((alea - 0.5) * b.divergenceDeg * 0.22 * Math.PI) / 180;
        const azimut =
          b.verticille && axe.surLaFleche && !prolonge
            ? ((k - 1) / laterales) * Math.PI * 2 + axe.phase
            : axe.phase + ((k - 1) / laterales) * Math.PI * 2 + gigue;
        // La phase avance d'une divergence par nœud : c'est la rotation qui
        // fait le tour de l'axe et répartit les branches sur toute sa longueur.
        const phaseFille = axe.phase + (b.divergenceDeg * Math.PI) / 180;
        // **Le ratio de prolongement dépend de qui prolonge.** Sur la flèche, la
        // fille apicale reprend `q` — c'est ce qui fait monter l'arbre. Sur une
        // branche latérale, elle ne reprend que `ratioLongueur`, franchement
        // plus faible : une branche se ramifie et s'épuise, elle ne recommence
        // pas un tronc. Sans cette différence, les latérales atteignaient la
        // longueur de la flèche elle-même et le houppier s'écrasait en galette.
        const prolongementLateral = b.ratioLongueur;
        const longueur =
          axe.longueurM *
          (prolonge
            ? axe.surLaFleche
              ? q
              : prolongementLateral
            : b.ratioLongueur * (1 - b.dominance * 0.4));
        if (longueur < LONGUEUR_MIN_M * 0.5) continue;
        suivante.push({
          depart: bout,
          direction: devier(axe.direction, azimut, inclinaison),
          longueurM: longueur,
          rayonM: Math.max(0.002, axe.rayonM * b.conicite * (prolonge ? 0.9 : 0.6)),
          ordre: axe.ordre + 1,
          // La flèche poursuit la série de son axe ; une latérale démarre la
          // sienne à partir de la direction qu'elle vient de prendre.
          //
          // **Et non `azimut + phaseFille`**, qui était le premier jet : comme
          // l'azimut d'une latérale VAUT à peu près la phase de son axe, cette
          // somme revenait à doubler la phase à chaque ordre. Doubler un angle
          // modulo 2π n'est pas un brassage, c'est une application chaotique
          // qui a des points fixes et des cycles courts — l'aulne, qui n'a
          // qu'une latérale par nœud et ne peut donc rien compenser au sein du
          // nœud, y tombait et gardait son houppier d'un seul côté.
          phase: prolonge ? phaseFille : azimut + (b.divergenceDeg * Math.PI) / 180,
          surLaFleche: axe.surLaFleche && prolonge,
        });
      }
    }
    // **Le plafond agit ICI**, entre deux ordres : si le prochain ordre ne tient
    // pas, on l'abandonne ENTIER et les axes courants restent terminaux, donc
    // feuillus. C'est ce qui fait perdre du détail à l'arbre et non un membre —
    // et ce qui empêche un arbre tronqué de sortir nu.
    if (segments.length + suivante.length > segmentsMax) break;
    file = suivante;
    ordre++;
  }
  return normaliserLaHauteur(marquerLesBouts(segments), depart.y, sujet.hauteurM);
}

/**
 * Marque terminal tout segment dont le bout ne porte aucun autre segment.
 *
 * **Déduit à la fin, et non tenu à jour pendant la récursion.** Le premier jet
 * marquait un axe non-terminal au moment où il engendrait des filles — ce qui
 * est faux dès que la boucle s'arrête AVANT de poser ces filles, et elle
 * s'arrête de deux façons : le plafond de segments, et l'ordre maximal. Dans le
 * second cas, tout le dernier rang d'axes était perdu et ses parents restaient
 * marqués « a des filles » : **la cime de l'arbre n'avait plus de feuilles**.
 * Mesuré sur un hêtre de seize mètres, les rameaux feuillus s'arrêtaient à
 * 12,5 m.
 *
 * Déduire l'état de la géométrie finale le rend vrai par construction, quelle
 * que soit la façon dont la récursion s'est terminée.
 */
function marquerLesBouts(segments: Segment[]): Segment[] {
  const departs = new Set<string>();
  const cle = (p: Point3) => `${p.x.toFixed(6)}|${p.y.toFixed(6)}|${p.z.toFixed(6)}`;
  for (const s of segments) departs.add(cle(s.depart));
  for (const s of segments) {
    // Le fût n'est jamais terminal : il porte le houppier, et quand il ne
    // porte rien c'est une chandelle, ce qui se décide ailleurs.
    s.terminal = s.ordre > 0 && !departs.has(cle(s.arrivee));
  }
  return segments;
}

/**
 * Étire le houppier pour qu'il atteigne exactement la hauteur voulue.
 *
 * **Sans ça, l'arbre sort en poteau télégraphique**, et c'est mesuré. La chaîne
 * apicale est une série géométrique de raison `q` : sa somme vaut `L / (1 − q)`
 * *à l'infini*. Mais la récursion s'arrête — au huitième ordre, ou plus tôt
 * quand le plafond de segments tranche — et la somme tronquée ne vaut plus que
 * `(1 − qⁿ)` de la limite. Pour un feuillu ordinaire, `q = 0,914` et sept
 * ordres : le houppier n'atteignait que 46 % de sa hauteur, l'arbre s'arrêtait
 * aux trois quarts, et la capture montrait un mât blanc coiffé d'une petite
 * croix — exactement la « touffe au sommet d'un bâton » que L0 avait décrite.
 *
 * On pourrait corriger `premierM` en devinant le nombre d'ordres qui vont
 * réellement se dérouler. C'est fragile : ce nombre dépend du plafond, de la
 * longueur minimale et du paramétrage. Mesurer après coup et étirer est exact
 * par construction, et coûte une passe sur les segments.
 *
 * Seul le houppier est étiré ; le fût garde sa hauteur, sinon l'élagage et la
 * trogne — qui sont des hauteurs en mètres — se déplaceraient.
 */
function normaliserLaHauteur(
  segments: Segment[],
  baseM: number,
  hauteurVoulueM: number,
): Segment[] {
  let sommet = baseM;
  for (const s of segments) sommet = Math.max(sommet, s.arrivee.y, s.depart.y);
  const atteint = sommet - baseM;
  const voulu = hauteurVoulueM - baseM;
  if (atteint <= 1e-6 || voulu <= 0) return segments;
  const k = voulu / atteint;
  if (Math.abs(k - 1) < 1e-6) return segments;
  const etirer = (p: Point3): Point3 =>
    p.y <= baseM ? p : { x: p.x, y: baseM + (p.y - baseM) * k, z: p.z };
  return segments.map((s) =>
    s.ordre === 0 ? s : { ...s, depart: etirer(s.depart), arrivee: etirer(s.arrivee) },
  );
}

/** Les bouts où accrocher un bouquet de feuilles : tout segment terminal. */
export function rameauxTerminaux(segments: readonly Segment[]): Segment[] {
  return segments.filter((s) => s.terminal);
}

/** Hauteur réellement atteinte par le squelette, en mètres. */
export function hauteurAtteinteM(segments: readonly Segment[]): number {
  let h = 0;
  for (const s of segments) h = Math.max(h, s.arrivee.y, s.depart.y);
  return h;
}

/** Rayon horizontal maximal du squelette, en mètres. */
export function rayonAtteintM(segments: readonly Segment[]): number {
  let r = 0;
  for (const s of segments) {
    r = Math.max(r, Math.hypot(s.arrivee.x, s.arrivee.z), Math.hypot(s.depart.x, s.depart.z));
  }
  return r;
}
