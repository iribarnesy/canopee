/**
 * Lumière spatiale (docs/regles.md §5) : chaque arbre reçoit la lumière qui
 * traverse les couronnes voisines dont l'ombre couvre sa position, chacune au
 * prorata de la part de son houppier qui **dépasse** le sien (Beer-Lambert par
 * couronne traversée, k = 0,5 ; voir `poidsDuVoisin`). L'ombre d'une
 * couronne est décalée vers le **nord** (+y) d'une fraction de la hauteur —
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
 * Exporté parce que le **rendu** le lit : une ombre dessinée dans une autre
 * direction que celle où le moteur la calcule mentirait sur qui ombrage qui,
 * et c'est précisément ce que le §0 de `docs/interface-visuelle.md` interdit.
 * Le soleil est donc au sud à l'écran comme dans le modèle.
 */
export const SHADOW_NORTH_OFFSET = 0.4;
const BUCKET_M = 12;
/**
 * ─── **l'extinction n'a pas de plafond** (#484) ─────────────────────────────────
 *
 * Les ombres des couronnes s'additionnent telles quelles, et la lumière vaut
 * `exp(−extinction)` jusqu'au bout : au centre des ombres de deux couronnes de
 * hêtre superposées, il passe 0,09 % de la lumière, et il n'y a pas de mur.
 *
 * Il y avait un plafond. `saturer` laissait passer l'extinction jusqu'à un coude
 * à 2, puis la menait doucement vers `MAX_EXTINCTION` = 4,5 : il restait
 * toujours exp(−4,5) = 1,1 % de lumière, quoi qu'on empile. Le plafond portait
 * *(à calibrer)*, le coude ni source ni marque. Le coude avait été posé quand le
 * centre d'une couronne de hêtre valait `k · lai` = 1,75 ; depuis que la
 * pénombre est rapportée à sa moyenne (#438, #464), il vaut 3,5, et une seule
 * couronne passait le coude à l'aplomb de son tronc. Sous la hêtraie fermée que
 * le moteur fait pousser (plantée à 2 m, quarante ans), la saturation ajoutait
 * 1,3 à 1,5 point aux 3 à 4 % de lumière d'été au sol ; sous le hêtre, le
 * terrain en mesure 1 à 3 % (Hagemeier et Leuschner 2019, *Forests* 10 : 925, lu
 * par extrait *(à confirmer)*). Sans elle, le k effectif du couvert fermé
 * (−ln(lumière) / LAI des couronnes) remonte de 0,29-0,35 à 0,39-0,43 sur
 * quatre graines sur cinq, au bord de la gamme mesurée sur LAI direct
 * (0,40-0,48 en plantation, Bréda 2003, *J. Exp. Bot.* 54 : 2403, tableau 1) ;
 * la cinquième garde un trou d'auto-éclaircie (0,26 → 0,30).
 *
 * Les trouées de ciel et les taches de soleil que le plafond voulait dire sont
 * des trous **entre** les couronnes, et le moteur les a déjà : chaque couronne a
 * un bord, la pénombre s'y estompe, et une cellule ne reçoit l'ombre que des
 * houppiers qui la couvrent. Le plafond les ajoutait une seconde fois, partout.
 *
 * Il rendait aussi le hêtre immortel à l'ombre : son seuil de stress, 0,9 fois sa
 * compensation (0,0090), passait sous 0,0111 (#65). La famine carbonée (#96)
 * porte cette mort depuis, et le propriétaire a décidé, le 12 novembre, qu'un
 * hêtre dominé peut mourir d'ombre (#484). `lumiere.test.ts` épingle qu'aucune
 * espèce n'est plus hors d'atteinte.
 */

/**
 * ─── **le houppier suit le diamètre**, **pas la hauteur** ────────────────────────────
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
 * lisent contre le **diamètre**, jamais contre la hauteur.
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
 * Rayon du houppier, m. Proportionnel au **diamètre** (modèle du tube), calé pour
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
 * C'est un **plafond**, pas un trait d'espèce. La profondeur réelle, elle, se
 * calcule — voir `baseHouppierCible`.
 */
export const PROFONDEUR_HOUPPIER_MAX = 0.9;

/**
 * Hauteur en dessous de laquelle les branches ne paient plus leur respiration,
 * m — la base du houppier vers laquelle l'arbre tend (docs/realisme.md B10).
 *
 * Ce n'est **pas** une constante d'espèce, et c'est tout l'enjeu : le même chêne
 * garde ses branches jusqu'en bas au milieu d'un pré et s'auto-élague sur
 * quinze mètres en futaie serrée. Ce que l'espèce apporte, c'est le **seuil**
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
 *
 * **C'est le cas d'une lumière égale à tous les niveaux.** Dans le tick, la base
 * lit sa propre lumière, niveau par niveau, où l'ombre des voisins s'ajoute à
 * celle du feuillage de l'arbre (`profondeurVivanteParNiveaux`, #467) ; sans
 * voisin, les deux calculs donnent la même base.
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
  // calcul (ln(1) = 0), et c'est un arbre qui ne pousse plus. Il ne **meurt** pas
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
 * C'est **linéaire** en profondeur de couronne, donc probablement un peu fort —
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

/**
 * ─── **la pénombre répartit le feuillage d'une couronne**, **elle ne l'enlève pas** ───
 *
 * L'ombre d'un houppier est pleine à l'aplomb du tronc et s'estompe vers le
 * bord, en `1 − d²/r²` (B3) : c'est l'épaisseur qu'on traverse à la verticale
 * d'une couronne en paraboloïde, de feuillage uniforme. Sur le disque entier,
 * ce profil vaut **un demi** en moyenne.
 *
 * Le trait `lai` dit le feuillage d'une couronne rapporté à sa projection au
 * sol : un point sous deux ou trois couronnes retrouve le LAI de peuplement
 * (especes.ts). Posée telle quelle sur `k · lai`, la pénombre retirait donc à
 * chaque couronne la moitié de ses feuilles. Une aulnaie de douze ans dont les
 * houppiers couvraient 141 à 148 % du sol laissait 63 à 65 % de la lumière au
 * sol l'été, un LAI effectif de 0,9 ; à vingt ans encore 41 %, là où une
 * aulnaie adulte porte 4,8 m² de feuilles par m² de sol (Eschenbach et Kappen
 * 1996). Une couronne isolée n'interceptait que 55 à 64 % de ce que son
 * feuillage intercepte réparti uniformément (#438).
 *
 * Le profil est donc rapporté à sa moyenne : au centre l'extinction vaut deux
 * fois `k · lai`, au bord zéro, et sur le disque la couronne porte exactement
 * le feuillage que l'atlas lui prête. Le deux n'est pas un réglage, c'est
 * l'inverse de la moyenne du profil : il conserve la surface foliaire. Ce
 * qu'une couronne isolée intercepte remonte à 88-93 % de celle qui aurait le
 * même feuillage réparti uniformément ; le reste est l'agrégation du feuillage
 * au centre du houppier, que les mesures optiques retrouvent aussi (les
 * méthodes indirectes sous-estiment le LAI de 25 à 50 % pour cette raison,
 * Bréda 2003).
 */
const MOYENNE_PENOMBRE = 0.5;

interface Shadow {
  /** l'arbre qui la porte : un houppier ne s'ombrage pas lui-même */
  id: number;
  cx: number;
  cy: number;
  r2: number;
  heightM: number;
  /** profondeur du houppier vivant, m : celle que suppose `partHouppier` */
  profondeurM: number;
  /** extinction à l'aplomb du tronc : `k · lai`, rapportée à la moyenne de la pénombre */
  extinction: number;
}

/** Ombres actives (arbres vivants, en feuilles), indexées par panier spatial. */
/**
 * Part du feuillage d'un arbre qui **intercepte** la lumière ∈ [0,1]. Un booléen ne
 * suffit pas : le bouleau est en feuilles quand le frêne est encore nu, et un
 * houppier à moitié sorti ne fait pas la même ombre qu'un houppier plein
 * (phenologie.ts). Ce qui ombre n'est pas ce qui assimile — les feuilles mortes
 * d'un marcescent comptent ici et nulle part ailleurs.
 */
export type PartOmbrageante = (tree: TreeState) => number;

/**
 * `decalageNord` dit **d'où vient la lumière** qu'on suit : le soleil moyen, au
 * sud, pour l'ombre (`SHADOW_NORTH_OFFSET`) ; le zénith pour le couvert qui
 * surplombe un point (zéro, `couvertAuDessusDuSol`).
 */
function buildShadowIndex(
  trees: readonly TreeState[],
  part: PartOmbrageante,
  decalageNord = SHADOW_NORTH_OFFSET,
): Map<number, Shadow[]> {
  const buckets = new Map<number, Shadow[]>();
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    const feuillage = part(tree);
    if (feuillage <= 0) continue;
    const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm);
    if (r <= 0) continue;
    const partGardee = partHouppier(tree.heightM, tree.baseHouppierM ?? 0);
    const shadow: Shadow = {
      id: tree.id,
      cx: tree.x,
      cy: tree.y + decalageNord * tree.heightM,
      r2: r * r,
      heightM: tree.heightM,
      profondeurM: profondeurHouppierM(tree),
      // L'indice foliaire suit le déploiement : c'est là que la phénologie
      // entre dans la loi de Beer-Lambert. Et l'élagage y entre aussi : une
      // couronne dont on a retiré la tranche basse intercepte moins. La
      // pénombre répartit ensuite ce feuillage du centre au bord sans en
      // changer la somme (`MOYENNE_PENOMBRE`).
      extinction: (BEER_LAMBERT_K * espece.lumiere.lai * feuillage * partGardee) / MOYENNE_PENOMBRE,
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

/**
 * Profondeur du houppier vivant d'un arbre, m : sa part gardée de la profondeur
 * maximale, celle que suppose `partHouppier`. Le houppier va de
 * `hauteur − profondeur` à la cime.
 */
function profondeurHouppierM(tree: TreeState): number {
  return (
    partHouppier(tree.heightM, tree.baseHouppierM ?? 0) * PROFONDEUR_HOUPPIER_MAX * tree.heightM
  );
}

/**
 * Sous cette profondeur, m, un houppier se lit comme un point, à sa cime. C'est
 * une tolérance de calcul, pas un paramètre : elle évite de diviser par une
 * profondeur nulle (un point au sol, un arbre rabattu sans couronne) ou presque
 * nulle, où la différence des deux intégrales ne garderait plus de chiffre juste.
 */
const PROFONDEUR_PONCTUELLE_M = 1e-6;

/**
 * Hauteur cumulée de la part d'un houppier voisin qui dépasse chaque niveau, m :
 * l'intégrale, du niveau `z` jusqu'en haut, de la part du houppier de cime `h` et
 * de profondeur `d` située au-dessus du niveau courant. Cette part vaut 1 sous la
 * base du houppier, décroît linéairement dans sa profondeur (feuillage uniforme,
 * comme le suppose `partHouppier`) et vaut 0 au-dessus de la cime.
 */
function partAuDessusCumuleeM(z: number, h: number, d: number): number {
  if (z >= h) return 0;
  if (z >= h - d) return ((h - z) * (h - z)) / (2 * d);
  return h - z - d / 2;
}

/**
 * ─── **le poids d'un voisin** : la part de son houppier qui dépasse le mien ───────
 *
 * Un niveau de mon houppier reçoit l'ombre du feuillage voisin qui est au-dessus
 * de lui : la part du houppier voisin qui le dépasse. Le poids de ce voisin est
 * cette part, **moyennée sur toute la profondeur de mon houppier**, de sa base à
 * sa cime :
 *
 * | hauteur du voisin / la mienne (houppiers à 0,9 de la hauteur) | 0,5 | 0,75 | 1 | 1,1 | 1,5 | 2 | 3 |
 * |---|---|---|---|---|---|---|---|
 * | poids | 0,20 | 0,35 | **0,50** | 0,56 | 0,70 | 0,80 | 0,90 |
 *
 * Un voisin de même hauteur pèse un demi : la moitié haute de son houppier dépasse
 * la moitié basse du mien. Personne ne l'a posé, et la loi n'a aucune constante.
 * Elle est continue partout ; elle vaut 1 pour un point au sol, dont la lumière,
 * celle des semis et le couvert du sol ne changent pas ; un voisin plus court
 * ombrage le bas de mon houppier.
 *
 * **La lumière d'un arbre devient donc celle de son houppier**, pas celle de sa
 * cime. C'est elle qui nourrit la croissance, le budget carbone, l'étiolement et
 * la transpiration. Le moteur suit un seul soleil moyen, au sud, à 68° ; la
 * lumière basse du matin, du soir et de l'hiver, et le ciel diffus de côté, que
 * les houppiers voisins de même taille interceptent, n'y existent pas. Lire
 * l'ombre sur tout le houppier en rend une part : c'est l'ombrage latéral entre
 * égaux, celui qui affame les dominés et fait monter les perches (B6, F6, E10).
 *
 * **Ce que cette loi remplace** (#467). Un voisin plus haut d'un centimètre
 * ombrageait à plein, un voisin de même hauteur pas du tout, un voisin plus court
 * d'un centimètre à 0,4 : trois poids autour de l'égalité, et deux nombres sans
 * source, le 0,4 et la bande des 75 % de la hauteur. Un hêtre de canopée à peine
 * plus court que son voisin du sud tombait à 5 % de lumière à sa cime, et mourait
 * de faim en cinq ans. Le 0,4 et le 0,75 sont tombés.
 *
 * Lue en un **seul niveau** (`baseM` = `cimeM`), la même loi donne la part du
 * houppier voisin qui dépasse ce niveau. C'est ce que lit l'élagage naturel,
 * niveau par niveau, jusqu'à la base du houppier
 * (`profondeurVivanteParNiveaux`).
 */
export function poidsDuVoisin(
  cimeVoisinM: number,
  profondeurVoisinM: number,
  cimeM: number,
  baseM: number,
): number {
  if (profondeurVoisinM <= 0) return 0;
  const profondeur = cimeM - baseM;
  if (profondeur <= PROFONDEUR_PONCTUELLE_M) {
    return Math.max(0, Math.min(1, (cimeVoisinM - cimeM) / profondeurVoisinM));
  }
  const moyenne =
    (partAuDessusCumuleeM(baseM, cimeVoisinM, profondeurVoisinM) -
      partAuDessusCumuleeM(cimeM, cimeVoisinM, profondeurVoisinM)) /
    profondeur;
  return Math.max(0, Math.min(1, moyenne));
}

/**
 * Les houppiers voisins qui couvrent un arbre, gardés le temps de le lire : de quoi
 * relire leur ombre à n'importe quel niveau de son houppier. Un tampon réutilisé
 * d'un arbre à l'autre, pour ne rien allouer par arbre et par semaine.
 */
export interface VoisinsOmbre {
  n: number;
  /** cime de chaque voisin, m */
  cimeM: number[];
  /** profondeur de son houppier vivant, m */
  profondeurM: number[];
  /** son ombre en ce point, pénombre comprise, avant la part qui dépasse */
  ombre: number[];
}

export function voisinsOmbreVides(): VoisinsOmbre {
  return { n: 0, cimeM: [], profondeurM: [], ombre: [] };
}

/**
 * Ce que les couronnes voisines éteignent au point (x, y) sur
 * un houppier qui va de `baseM` à `cimeM`. Un point au sol se lit avec `baseM` =
 * `cimeM` = 0. `selfId` écarte le houppier de l'arbre lu. Si `voisins` est donné,
 * chaque houppier qui couvre le point y est rangé, pour l'élagage.
 */
function sommerOmbres(
  buckets: Map<number, Shadow[]>,
  x: number,
  y: number,
  cimeM: number,
  baseM: number,
  selfId: number,
  voisins: VoisinsOmbre | null,
): number {
  if (voisins) voisins.n = 0;
  const key = Math.floor(y / BUCKET_M) * 100_000 + Math.floor(x / BUCKET_M);
  const list = buckets.get(key);
  if (!list) return 0;
  let extinction = 0;
  for (const s of list) {
    if (s.id === selfId) continue;
    const dx = x - s.cx;
    const dy = y - s.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > s.r2) continue;
    const poids = poidsDuVoisin(s.heightM, s.profondeurM, cimeM, baseM);
    if (poids <= 0 && !voisins) continue;
    // Pénombre : l'ombre est pleine à l'aplomb du houppier et s'estompe vers
    // son bord (couronne moins épaisse, lumière latérale). C'est ce dégradé
    // qui crée les micro-situations d'abri — un sujet planté **en lisière** d'une
    // nurse est protégé du vent et du rayonnement sans être étouffé (ch1-A).
    // Il est rapporté à sa moyenne dans `buildShadowIndex`.
    const penombre = 1 - d2 / s.r2;
    if (voisins && s.profondeurM > 0) {
      const k = voisins.n++;
      voisins.cimeM[k] = s.heightM;
      voisins.profondeurM[k] = s.profondeurM;
      voisins.ombre[k] = s.extinction * penombre;
    }
    if (poids > 0) extinction += poids * s.extinction * penombre;
  }
  return extinction;
}

/** Extinction en un point au sol. */
function extinctionAt(buckets: Map<number, Shadow[]>, x: number, y: number): number {
  return sommerOmbres(buckets, x, y, 0, 0, -1, null);
}

/**
 * ─── **l'élagage naturel, niveau par niveau** ────────────────────────────────────
 *
 * Profondeur vivante du houppier, en fraction de la hauteur (#467). Une branche
 * au niveau y reçoit l'ombre de deux feuillages : celui des voisins qui la
 * dépassent, chacun pour la part de son houppier au-dessus de y (la loi de
 * `poidsDuVoisin`, lue en ce seul niveau), et celui de l'arbre au-dessus d'elle
 * (Beer-Lambert sur sa propre couronne, comme `baseHouppierCible`). Elle vit tant
 * que cette lumière reste au-dessus du point de compensation de l'espèce ; la
 * base du houppier est le niveau où elle y tombe. **La base lit sa propre
 * lumière.**
 *
 * Au sommet, c'est la lumière de cime ; sur tout le houppier, c'est en moyenne la
 * lumière du houppier de B6. Dans une plantation équienne, ce sont les
 * houppiers voisins à hauteur des branches basses qui les tuent : un égal ne
 * dépasse pas une cime, mais la moitié haute de son houppier dépasse la moitié
 * basse du mien. Lue à la seule cime, la loi laissait une pineraie plantée à
 * 2 m sans aucun élagage en vingt-cinq ans (part nue 0,10 sur trois graines).
 *
 * Sans voisins, c'est exactement `baseHouppierCible`. Aucune constante
 * nouvelle : la compensation et `lai` de l'espèce, `PROFONDEUR_HOUPPIER_MAX`.
 *
 * **Le calcul est en forme fermée.** L'extinction des voisins est linéaire par
 * morceaux en fonction du niveau : chaque houppier voisin y entre à sa cime et
 * pèse à plein sous sa base. On parcourt les morceaux depuis la cime ; sur celui
 * où la lumière passe sous la compensation, l'équation est linéaire et se résout
 * d'un coup. Tant que l'ombre saturait au-delà d'une extinction voisine de 2, ce
 * morceau-là demandait une dichotomie ; la saturation est tombée (#484).
 *
 * Rend 1 dans les cas dégénérés (arbre sans hauteur, espèce sans seuil), soit
 * une base au sol, comme `baseHouppierCible`.
 */
export function profondeurVivanteParNiveaux(
  heightM: number,
  voisins: VoisinsOmbre | null,
  facteur: number,
  compensation: number,
  lai: number,
): number {
  if (heightM <= 0) return 1;
  const opacite = BEER_LAMBERT_K * lai;
  if (opacite <= 0 || compensation <= 0) return 1;
  const P = PROFONDEUR_HOUPPIER_MAX;
  // Marge de log-lumière au-dessus de la compensation, à la profondeur p, pour
  // une extinction voisine e : décroissante en p.
  const marge0 = Math.log(facteur / compensation);
  const marge = (p: number, e: number): number => marge0 - e - opacite * p;
  const n = voisins?.n ?? 0;
  // Extinction voisine et pente au sommet (p = 0), et les ruptures de pente.
  let e = 0;
  let pente = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const v = voisins as VoisinsOmbre;
    const h = v.cimeM[i] ?? 0;
    const d = v.profondeurM[i] ?? 0;
    const o = v.ombre[i] ?? 0;
    if (d <= 0 || o <= 0) continue;
    // Le houppier voisin entre au niveau de sa cime (pA) et pèse à plein sous sa
    // base (pB) ; entre les deux, sa part croît de heightM / d par unité de p.
    const pA = 1 - h / heightM;
    const pB = 1 - (h - d) / heightM;
    const pas = (o * heightM) / d;
    e += o * Math.max(0, Math.min(1, (h - heightM) / d));
    if (pA <= 0 && pB > 0) pente += pas;
    if (pA > 0 && pA < P) m = insererRupture(m, pA, pas);
    if (pB > 0 && pB < P) m = insererRupture(m, pB, -pas);
  }
  if (marge(0, e) <= 0) return 0;
  let p0 = 0;
  for (let k = 0; k <= m; k++) {
    const p1 = k < m ? (RUPTURES_P[k] ?? P) : P;
    const e1 = e + pente * (p1 - p0);
    if (marge(p1, e1) <= 0) return racineSurUnMorceau(p0, p1, e, pente, marge0, opacite);
    p0 = p1;
    e = e1;
    if (k < m) pente += RUPTURES_PENTE[k] ?? 0;
  }
  return P;
}

/** Les ruptures de pente de l'extinction voisine, rangées par profondeur (tampon réutilisé). */
const RUPTURES_P: number[] = [];
const RUPTURES_PENTE: number[] = [];

/** Range une rupture à sa place (insertion : il y en a quelques dizaines au plus). */
function insererRupture(m: number, p: number, dPente: number): number {
  let j = m;
  while (j > 0 && (RUPTURES_P[j - 1] ?? 0) > p) {
    RUPTURES_P[j] = RUPTURES_P[j - 1] ?? 0;
    RUPTURES_PENTE[j] = RUPTURES_PENTE[j - 1] ?? 0;
    j--;
  }
  RUPTURES_P[j] = p;
  RUPTURES_PENTE[j] = dPente;
  return m + 1;
}

/**
 * La profondeur où la marge s'annule entre p0 et p1, l'extinction voisine y
 * valant e0 + pente × (p − p0) : une équation linéaire. La racine est gardée dans
 * le morceau, dont l'arrondi pourrait la faire sortir d'un cheveu.
 */
function racineSurUnMorceau(
  p0: number,
  p1: number,
  e0: number,
  pente: number,
  marge0: number,
  opacite: number,
): number {
  const p = (marge0 - e0 + pente * p0) / (pente + opacite);
  return Math.min(p1, Math.max(p0, p));
}

/**
 * Les lumières de chaque arbre vivant (index alignés sur `trees`) : celle de son
 * **houppier** ∈ [0,1], qui le nourrit (1 pour les morts), et la **profondeur
 * vivante** de son houppier en fraction de sa hauteur, que vise l'élagage
 * naturel (`profondeurVivanteParNiveaux`). Une seule passe pour les deux.
 *
 * `facteurs` multiplie la lumière de chaque arbre, uniformément sur sa hauteur :
 * c'est l'ombre de l'entourage de la parcelle (lisiere.ts), que le tick connaît.
 */
export function lumieresDesArbres(
  trees: readonly TreeState[],
  part: PartOmbrageante,
  facteurs?: readonly number[],
): { houppier: number[]; profondeurVivante: number[] } {
  const buckets = buildShadowIndex(trees, part);
  const houppier = new Array<number>(trees.length);
  const profondeurVivante = new Array<number>(trees.length);
  const voisins = voisinsOmbreVides();
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const facteur = facteurs?.[i] ?? 1;
    if (!tree?.alive) {
      houppier[i] = facteurs ? facteur : 1;
      profondeurVivante[i] = PROFONDEUR_HOUPPIER_MAX;
      continue;
    }
    const baseM = tree.heightM - profondeurHouppierM(tree);
    const ext = sommerOmbres(buckets, tree.x, tree.y, tree.heightM, baseM, tree.id, voisins);
    houppier[i] = facteurs ? Math.exp(-ext) * facteur : Math.exp(-ext);
    const { compensation, lai } = getEspece(tree.especeId).lumiere;
    profondeurVivante[i] = profondeurVivanteParNiveaux(
      tree.heightM,
      voisins,
      facteur,
      compensation,
      lai,
    );
  }
  return { houppier, profondeurVivante };
}

/**
 * Lumière relative ∈ [0,1] reçue par le **houppier** de chaque arbre vivant (index
 * aligné sur `trees`, 1 pour les morts). `part` donne le feuillage ombrageant de
 * chaque arbre.
 */
export function computeLight(trees: readonly TreeState[], part: PartOmbrageante): number[] {
  return lumieresDesArbres(trees, part).houppier;
}

/** Lumière relative au sol en un point (pour l'installation des semis). */
export function lightAtPoint(
  trees: readonly TreeState[],
  x: number,
  y: number,
  part: PartOmbrageante,
): number {
  const buckets = buildShadowIndex(trees, part);
  return Math.exp(-extinctionAt(buckets, x, y));
}

/**
 * L'index d'ombres, bâti une fois pour plusieurs interrogations.
 *
 * `lightAtPoint` est commode et coûte cher : elle **reconstruit** l'index à chaque
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
  return Math.exp(-extinctionAt(ombres, x, y));
}

/**
 * Abri au vent d'un point ∈ [0,1] (docs/regles.md §3, ch5 « haie brise-vent »).
 * Contrairement à l'ombre et aux racines, la protection au vent **porte loin** :
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
    // L'abri **sature**, et c'est ce qui rend l'arrêt exact : tous les termes qui
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
 * `windShelterAt` coûtait le **peuplement entier** par arbre et par semaine, donc un
 * n² hebdomadaire : c'est le premier poste de calcul du tick dès qu'une parcelle
 * se peuple, 9,7 % du temps à 2 300 tiges et une part qui grandit avec le carré
 * (#99). Or la boucle jette la plupart des voisins sur un test de distance.
 *
 * Chaque arbre est donc rangé dans les paniers que sa **portée** couvre — douze fois
 * sa hauteur, la distance au-delà de laquelle il n'abrite plus rien — et une
 * interrogation ne lit que le panier de son point. Un sous-arbrisseau de
 * soixante centimètres porte à sept mètres et n'encombre qu'un panier ; un arbre
 * de vingt mètres porte plus loin que la parcelle et entre dans tous, ce qui est
 * exactement ce qu'il faut puisqu'il abrite tout le monde.
 *
 * **Le résultat est le même au bit près**, et ça ne va pas de soi : une somme de
 * flottants n'est pas associative, donc changer l'**ordre** des voisins changerait
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
    // Le panier est un **surensemble** : il retient les arbres dont la portée
    // touche la maille, pas ceux dont elle atteint le point. Le même test que
    // la référence tranche, et c'est lui qui garantit l'égalité.
    if (d > 12 * t.heightM) continue;
    shelter += (0.12 * t.heightM) / Math.max(1.5, d);
    if (shelter >= 1) return 1;
  }
  return Math.min(1, shelter);
}

/**
 * ─── **le couvert au-dessus**, **qui n'est pas l'ombre** ──────────────────────────────
 *
 * L'ombre suit le soleil : elle tombe au nord de l'arbre, à 0,4 fois sa hauteur,
 * et l'entourage de la parcelle en porte sa part (lisiere.ts). Le jour, c'est ce
 * qui compte. La nuit, il n'y a pas de soleil : ce qui garde un point du gel
 * radiatif, c'est ce qui le **surplombe** et lui cache le ciel froid vers lequel il
 * rayonne (microclimat.ts). Les deux cartes ne se confondent pas : un semis à
 * l'aplomb d'un houppier est couvert sans être forcément à l'ombre de midi, et
 * la bande qu'un bois voisin ombrage au sud de la parcelle n'a rien au-dessus
 * d'elle (#407).
 *
 * Le couvert au-dessus est donc la même loi que l'ombre — Beer-Lambert à travers
 * les houppiers, feuillage de saison compris, pénombre vers le bord du
 * houppier — prise **à la verticale** : sans décalage vers le nord, et sans
 * l'entourage. Il vaut `1 − lumière zénithale` ∈ [0,1] : 0 en plein découvert,
 * près de 1 sous une futaie fermée.
 *
 * *(Limite assumée : ce qui compte vraiment pour le rayonnement nocturne est le
 * **facteur de vue du ciel**, et il voit aussi de côté. Sous un houppier isolé, la
 * projection verticale l'exagère — le ciel reste visible tout autour ; près
 * d'une lisière haute ou au fond d'une trouée étroite, elle l'ignore, alors que
 * le minimum y remonte (Groot et Carlson 1996 : il baisse linéairement avec la
 * part de ciel vue). Le moteur ne calcule pas ce facteur ; la projection
 * verticale est ce qu'il sait de ce qui surplombe un point.)*
 */
export function couvertAuDessusDuSol(
  trees: readonly TreeState[],
  widthM: number,
  heightM: number,
  part: PartOmbrageante,
): number[] {
  const buckets = buildShadowIndex(trees, part, 0);
  const out = new Array<number>(widthM * heightM);
  for (let y = 0; y < heightM; y++) {
    for (let x = 0; x < widthM; x++) {
      out[y * widthM + x] = 1 - Math.exp(-extinctionAt(buckets, x + 0.5, y + 0.5));
    }
  }
  return out;
}

/**
 * Le couvert au-dessus de **chaque** arbre ∈ [0,1] (index aligné sur `trees`, 0 pour
 * les morts) : les houppiers voisins dont la projection le couvre, chacun au
 * prorata de la part qui dépasse son houppier, lue sur tout le houppier comme
 * l'ombre (`poidsDuVoisin`). Ce qui abrite les fleurs d'un fruitier d'une nuit
 * de gel, c'est ce qui pousse au-dessus d'elles, et elles sont dans tout le
 * houppier ; pas le bois voisin qui lui prend le soleil du soir.
 */
export function couvertAuDessusDesArbres(
  trees: readonly TreeState[],
  part: PartOmbrageante,
): number[] {
  const buckets = buildShadowIndex(trees, part, 0);
  return trees.map((tree) => {
    if (!tree.alive) return 0;
    const baseM = tree.heightM - profondeurHouppierM(tree);
    const ext = sommerOmbres(buckets, tree.x, tree.y, tree.heightM, baseM, tree.id, null);
    return 1 - Math.exp(-ext);
  });
}

/**
 * Lumière relative au sol de **chaque** cellule (microclimat : l'évaporation est
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
      out[y * widthM + x] = Math.exp(-extinctionAt(buckets, x + 0.5, y + 0.5));
    }
  }
  return out;
}
