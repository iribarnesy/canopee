/**
 * Ravageurs et auxiliaires (docs/regles.md §7.4 ; critères G2, G3, J5).
 *
 * Ce module répond à une question que le jeu posait sans pouvoir y répondre :
 * **à quoi sert la diversité ?** Jusqu'ici l'indice de biodiversité
 * s'observait sans rien changer. Ici il paie, et il paie par un mécanisme, pas
 * par un bonus : les auxiliaires (parasitoïdes, prédateurs, mésanges,
 * chauves-souris) ont besoin de strates, d'essences variées, de fleurs et de
 * bois mort pour tenir toute l'année ; là où ils tiennent, une pullulation
 * n'atteint jamais son plein régime.
 *
 * La chaîne complète, entièrement locale et sans seuil scripté :
 *  - un arbre stressé se défend mal (moins de résine, moins de tanins) : c'est
 *    lui, et pas son voisin vigoureux, qui devient une ressource ;
 *  - la population de ravageurs croît là où cette ressource s'accumule, et
 *    d'autant plus vite qu'il fait chaud (les générations s'enchaînent) ;
 *  - les auxiliaires freinent cette croissance à hauteur de ce que l'habitat
 *    local leur offre ;
 *  - les insectes essaiment vers les cellules voisines ;
 *  - les dégâts retombent sur les arbres au prorata de leur sensibilité **et** de
 *    leur état — ce qui referme la spirale : un arbre attaqué s'affaiblit et
 *    devient plus attaquable.
 *
 * D'où sort tout seul le scénario classique : sécheresse → peuplement pur et
 * stressé → pullulation ; et son contraire : le même peuplement, mélangé et
 * étagé, encaisse.
 *
 * Non modélisé en V1 : espèces de ravageurs distinctes (un seul « ravageur
 * générique » par sensibilité), maladies datées (chalarose), cycles
 * pluriannuels, lutte biologique active.
 */

import { volumeCaviteTotalL } from "./cavites";
import { getEspece } from "./especes";
import { AUXILIAIRES_SUFFISANTS } from "./faune";
import type { GridDims } from "./grid";
import { forEachDiscCell } from "./grid";
import { crownRadiusM } from "./light";
import type { TreeState } from "./trees";

/** Un arbre parfaitement sain n'est pas indemne, mais presque. */
export const VULNERABILITE_PLANCHER = 0.15;

/** Température moyenne hebdo en dessous de laquelle les populations stagnent, °C. */
export const T_BASE_RAVAGEUR = 8;

/**
 * Croissance hebdomadaire d'une population en pleine activité. Un insecte
 * xylophage enchaîne deux ou trois générations par été, chacune multipliant
 * les effectifs par des dizaines : doubler en une dizaine de jours est un
 * ordre de grandeur prudent *(à calibrer)*.
 */
export const TAUX_CROISSANCE = 0.8;

/** Déclin hebdomadaire spontané en pleine activité (mortalité, dispersion hors parcelle). */
export const DECLIN = 0.08;

/**
 * Perte hebdomadaire hors saison d'activité.
 *
 * Les ravageurs **hivernent** — sous l'écorce, dans la litière, en diapause. Les
 * faire repartir de rien chaque printemps était mon erreur : ça interdisait
 * toute pullulation, puisqu'une saison ne suffit jamais à passer de
 * l'inoculum au ravage. C'est justement l'accumulation sur deux ou trois
 * années consécutives de sécheresse qui fait les crises de scolytes
 * *(à calibrer)*.
 */
export const PERTE_HIVERNAGE = 0.02;

/**
 * Mortalité hebdomadaire supplémentaire qu'un habitat parfait pour les
 * auxiliaires inflige à la population de ravageurs.
 *
 * C'est une **prédation**, pas un frein à la croissance — et la différence est
 * tout sauf cosmétique. Un frein ne fait que retarder l'arrivée au plateau :
 * la pullulation finit au même niveau, un peu plus tard. Une mortalité, elle,
 * abaisse l'équilibre, et au-delà d'un certain habitat elle dépasse la
 * natalité : la population n'explose jamais. C'est ce que fait un peuplement
 * mélangé et étagé qui loge des mésanges, des parasitoïdes et des
 * chauves-souris *(à calibrer)*.
 */
export const PREDATION_MAX = 0.75;

/** Fond permanent : les ravageurs sont toujours là, à bas bruit. */
export const INOCULUM = 0.02;

/** Part de la population qui essaime vers les cellules voisines chaque semaine. */
export const DISPERSION = 0.15;

/** Points de stress infligés par semaine à pleine pullulation sur un hôte totalement sensible. */
export const DEGAT_MAX = 1.2;

/** Ressource (hôte sensible et affaibli) à laquelle la pullulation sature. */
export const RESSOURCE_SATURATION = 1.2;

/** Nombre d'essences au-delà duquel la richesse du voisinage ne rapporte plus. */
const RICHESSE_SUFFISANTE = 4;

/**
 * Litres de cavité à l'hectare qui saturent l'offre de gîtes *(à calibrer)*.
 *
 * Même rôle que les 20 t/ha de bois mort auxquels ce nombre se substitue quand
 * il est plus généreux : au-delà, un auxiliaire de plus ne trouve pas un gîte
 * de plus, c'est autre chose qui le limite. L'ordre de grandeur est celui d'un
 * bocage âgé, et c'est la cible que la sylviculture à but de biodiversité se
 * donne : cinq à dix gros arbres-habitats à l'hectare, à une centaine de litres
 * de creux pièce (`CAVITE_HABITAT_L`, trogne.ts). Relevé sur cent vingt ans de
 * chênes, une parcelle qui a eu ses coups de vent en offre 7 800 L/ha — elle
 * est donc largement au-dessus de la cible, et le terme y sature.
 */
export const CAVITES_SUFFISANTES_L_HA = 1000;

/**
 * Côté du bloc sur lequel on agrège la diversité, m. Les auxiliaires ne
 * perçoivent pas leur environnement au mètre carré : une mésange prospecte un
 * hectare, un parasitoïde quelques dizaines de mètres. Évaluer la richesse
 * cellule par cellule donnait toujours « une seule essence », pur ou mélangé —
 * c'est-à-dire aucun effet de la diversité. On agrège donc par blocs de 10 m,
 * fenêtre de 3×3 blocs.
 */
export const BLOC_AUXILIAIRES_M = 10;

/** Strates de hauteur qui comptent pour l'habitat des auxiliaires, m. */
const STRATES: readonly number[] = [1, 4, 12, Number.POSITIVE_INFINITY];

/**
 * À quel point cet arbre est exploitable cette semaine : sa sensibilité
 * d'espèce, multipliée par son incapacité du moment à se défendre.
 */
export function vulnerabilite(especeId: string, vigueur: number): number {
  const espece = getEspece(especeId);
  const affaiblissement = Math.min(1, Math.max(0, 1 - vigueur));
  return (
    espece.ravageurs.sensibilite *
    (VULNERABILITE_PLANCHER + (1 - VULNERABILITE_PLANCHER) * affaiblissement)
  );
}

/** La chaleur enchaîne les générations ; le froid les arrête. */
export function facteurChaleur(tMeanC: number): number {
  return Math.max(0, Math.min(1.4, (tMeanC - T_BASE_RAVAGEUR) / 12));
}

/**
 * Ce qu'un hôte hivernal ajoute à la survie des ravageurs sous son couvert.
 *
 * Certaines plantes hébergent les ravageurs pendant l'hiver et les relâchent
 * au printemps sur les cultures voisines : le fusain d'Europe est l'hôte
 * d'hiver du puceron noir, exactement comme le prunellier l'est de la
 * lucilie. Ce n'est pas un défaut de l'espèce — c'est un chaînon de son cycle,
 * et le connaître change la façon de composer une haie *(à calibrer)*.
 */
export const ABRI_HIVERNAL_EFFET = 0.5;

export interface CarteBiotique {
  /** ressource exploitable par cellule (hôtes sensibles et affaiblis) */
  ressource: Float64Array;
  /** qualité de l'habitat des auxiliaires par cellule ∈ [0,1] */
  habitat: Float64Array;
  /**
   * Présence d'hôtes hivernaux par cellule ∈ [0,1] : là où ils poussent, les
   * ravageurs passent mieux l'hiver et repartent plus vite au printemps.
   */
  abriHivernal: Float64Array;
}

/**
 * Dresse, en une passe sur les arbres, ce que chaque cellule offre aux deux
 * camps : de quoi manger pour les ravageurs, de quoi vivre pour ceux qui les
 * mangent.
 */
export function carteBiotique(
  trees: readonly TreeState[],
  herbeCouverture: readonly number[],
  boisMortTHa: number,
  dims: GridDims,
  auxiliairesInstalles?: ArrayLike<number>,
): CarteBiotique {
  // Les **cavités** comptent parmi les gîtes, au même titre que le bois mort et
  // dans le même terme (#182). Un tronc creux est un abri d'hiver et un site
  // de nid — c'est ce qui loge les mésanges et les chauves-souris que le
  // commentaire de tête de ce module nomme sans que rien ne les porte.
  //
  // Le terme prend le **plus généreux** des deux et ne les additionne pas, et ce
  // n'est pas une précaution d'écriture : ce que ce 0,15 mesure est « y a-t-il
  // où se loger », et cette question-là **sature**. Un peuplement qui a déjà
  // vingt tonnes de bois mort à l'hectare ne loge pas mieux parce qu'il a
  // aussi des creux. La conséquence est qu'à cavités nulles la carte est
  // rigoureusement celle d'avant — le lot se neutralise tout seul, et un
  // essai l'épingle.
  //
  // Les creux, **eux**, sont spatialisés, là où le pool de bois mort ne l'est pas :
  // une cavité est sur un arbre, à un endroit. Ils s'agrègent donc par bloc et
  // se lisent dans la même fenêtre de 3×3 que la richesse — celle que le
  // commentaire de `BLOC_AUXILIAIRES_M` justifie par la prospection d'une
  // mésange. Un vieux têtard creux vaut pour son voisinage, pas pour la
  // parcelle entière.
  const n = dims.widthM * dims.heightM;
  const ressource = new Float64Array(n);
  const habitat = new Float64Array(n);
  // Là où des hôtes hivernaux poussent, les ravageurs passent mieux l'hiver.
  const abriHivernal = new Float64Array(n);
  // Une essence = un bit ; une strate = un bit. Compter les bits d'un entier
  // coûte moins cher que de tenir un Set par cellule.
  const nbx = Math.max(1, Math.ceil(dims.widthM / BLOC_AUXILIAIRES_M));
  const nby = Math.max(1, Math.ceil(dims.heightM / BLOC_AUXILIAIRES_M));
  const essencesBloc = new Int32Array(nbx * nby);
  const stratesBloc = new Int32Array(nbx * nby);
  const especeBit = new Map<string, number>();

  const cavitesBloc = new Float64Array(nbx * nby);
  for (const tree of trees) {
    if (!tree.alive) continue;
    const espece = getEspece(tree.especeId);
    let bit = especeBit.get(tree.especeId);
    if (bit === undefined) {
      bit = 1 << especeBit.size;
      especeBit.set(tree.especeId, bit);
    }
    const strate = STRATES.findIndex((h) => tree.heightM < h);
    const strateBit = strate >= 0 ? 1 << strate : 0;
    const vuln = vulnerabilite(tree.especeId, tree.vigueur);
    const r = crownRadiusM(tree.heightM, espece.lumiere.houppierRatio, tree.diametreCm);
    const abrite = espece.ravageurs.hoteHivernal === true;
    forEachDiscCell(dims, tree.x, tree.y, r, (i) => {
      if (abrite) abriHivernal[i] = Math.min(1, (abriHivernal[i] ?? 0) + 1);
      ressource[i] = (ressource[i] ?? 0) + vuln;
    });
    const bx = Math.min(nbx - 1, Math.max(0, Math.floor(tree.x / BLOC_AUXILIAIRES_M)));
    const by = Math.min(nby - 1, Math.max(0, Math.floor(tree.y / BLOC_AUXILIAIRES_M)));
    const b = by * nbx + bx;
    essencesBloc[b] = (essencesBloc[b] ?? 0) | (bit ?? 0);
    stratesBloc[b] = (stratesBloc[b] ?? 0) | strateBit;
    cavitesBloc[b] = (cavitesBloc[b] ?? 0) + volumeCaviteTotalL(tree);
  }

  // Fenêtre de 3×3 blocs : ce que l'auxiliaire a sous les yeux depuis son nid.
  const essencesVues = new Int32Array(nbx * nby);
  const stratesVues = new Int32Array(nbx * nby);
  const cavitesVues = new Float64Array(nbx * nby);
  for (let by = 0; by < nby; by++) {
    for (let bx = 0; bx < nbx; bx++) {
      let e = 0;
      let st = 0;
      let cav = 0;
      let blocsVus = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx;
          const y = by + dy;
          if (x < 0 || y < 0 || x >= nbx || y >= nby) continue;
          e |= essencesBloc[y * nbx + x] ?? 0;
          st |= stratesBloc[y * nbx + x] ?? 0;
          cav += cavitesBloc[y * nbx + x] ?? 0;
          blocsVus++;
        }
      }
      essencesVues[by * nbx + bx] = e;
      stratesVues[by * nbx + bx] = st;
      // En litres par hectare de ce qu'on voit, et non en litres tout court :
      // un bloc de bord n'a que quatre voisins, et sans ça il serait pauvre
      // par le seul fait d'être au bord.
      const haVues = (blocsVus * BLOC_AUXILIAIRES_M * BLOC_AUXILIAIRES_M) / 10_000;
      cavitesVues[by * nbx + bx] = haVues > 0 ? cav / haVues : 0;
    }
  }

  // Bois mort : le pool n'est pas spatialisé dans le moteur, on l'applique donc
  // uniformément. *Limite assumée* — un tas de rémanents devrait valoir pour
  // son voisinage, pas pour la parcelle entière.
  const partBoisMort = Math.min(1, boisMortTHa / 20);
  for (let i = 0; i < n; i++) {
    const bx = Math.min(nbx - 1, Math.floor((i % dims.widthM) / BLOC_AUXILIAIRES_M));
    const by = Math.min(nby - 1, Math.floor(Math.floor(i / dims.widthM) / BLOC_AUXILIAIRES_M));
    const b = by * nbx + bx;
    const richesse = popcount(essencesVues[b] ?? 0);
    const nStrates = popcount(stratesVues[b] ?? 0);
    const partCavites = Math.min(1, (cavitesVues[b] ?? 0) / CAVITES_SUFFISANTES_L_HA);
    // **et quand la faune existe en individus, le proxy s'efface** (#187 lot 3).
    // Les deux lignes disent la même chose à deux niveaux de preuve : les gîtes
    // disent « il y a où se loger », les individus disent « quelqu'un est logé ».
    // La seconde contient la première — on ne s'installe pas sans cavité — et
    // lui ajoute ce qui manquait : la table doit nourrir. Une cavité vide ne
    // mange pas de pucerons.
    //
    // Absent, on retombe au bit près sur la carte d'avant ce lot : c'est le
    // contrôle de neutralité que réclame le traitement F16, et il est
    // **structurel**, pas mesuré.
    const partGite =
      auxiliairesInstalles === undefined
        ? Math.max(partBoisMort, partCavites)
        : Math.min(1, (auxiliairesInstalles[i] ?? 0) / AUXILIAIRES_SUFFISANTS);
    habitat[i] =
      0.4 * Math.min(1, richesse / RICHESSE_SUFFISANTE) +
      0.25 * Math.min(1, nStrates / 3) +
      0.2 * Math.min(1, herbeCouverture[i] ?? 0) +
      0.15 * partGite;
  }
  return { ressource, habitat, abriHivernal };
}

function popcount(v: number): number {
  let x = v - ((v >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/**
 * Fait évoluer la population d'une cellule : croissance logistique bornée par
 * la ressource, freinée par les auxiliaires, moins le déclin spontané.
 */
export function prochainePression(
  pression: number,
  ressource: number,
  habitat: number,
  chaleur: number,
  abriHivernal = 0,
): number {
  if (ressource <= 0) return Math.max(0, pression - DECLIN * pression);
  const plafond = Math.min(1, ressource / RESSOURCE_SATURATION);
  // Natalité comme prédation suivent l'activité : l'hiver, tout s'arrête, et
  // la population attend au lieu de disparaître.
  const natalite = TAUX_CROISSANCE * chaleur;
  // La perte d'hivernage est ce qui empêche une population de repartir chaque
  // printemps là où elle était : un hôte hivernal la réduit, et c'est
  // précisément par là qu'il pèse sur le peuplement voisin.
  const perteHivernage = PERTE_HIVERNAGE * (1 - Math.min(1, abriHivernal) * ABRI_HIVERNAL_EFFET);
  const mortalite =
    (DECLIN + PREDATION_MAX * Math.min(1, habitat)) * Math.min(1, chaleur) + perteHivernage;
  const base = Math.max(pression, INOCULUM);
  const suivant = base + base * (natalite * (1 - base / Math.max(plafond, 1e-6)) - mortalite);
  return Math.min(1, Math.max(0, suivant));
}

/** Essaimage vers les huit voisines : une pullulation ne reste pas sur place. */
export function disperser(pression: Float64Array, dims: GridDims): Float64Array {
  const { widthM: w, heightM: h } = dims;
  const sortie = new Float64Array(pression.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let somme = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          somme += pression[ny * w + nx] ?? 0;
          n++;
        }
      }
      const moyenneVoisins = n > 0 ? somme / n : 0;
      sortie[i] = (1 - DISPERSION) * (pression[i] ?? 0) + DISPERSION * moyenneVoisins;
    }
  }
  return sortie;
}

/** Points de stress infligés à un arbre cette semaine. */
export function degatsSurArbre(tree: TreeState, pressionMoyenne: number): number {
  return DEGAT_MAX * pressionMoyenne * vulnerabilite(tree.especeId, tree.vigueur);
}

/**
 * Ce que le **même** arbre aurait encaissé en pleine vigueur.
 *
 * L'écart avec `degatsSurArbre` est la part du dégât qui n'existe **que** parce que
 * l'arbre ne se défend plus — il ne refait ni ses tanins ni sa résine faute de
 * carbone. Cette part-là est à porter au compte de ce qui l'affame, pas des
 * ravageurs : sans elle, un dominé meurt « de ravageurs » alors que la seule
 * chose qui a changé chez lui est l'ombre (#103).
 *
 * Ce n'est pas une heuristique, c'est la décomposition de `vulnerabilite` :
 * le plancher est ce qu'un arbre sain paie de toute façon, le reste est
 * proportionnel à son affaiblissement.
 */
export function degatsAPleineVigueur(tree: TreeState, pressionMoyenne: number): number {
  return DEGAT_MAX * pressionMoyenne * vulnerabilite(tree.especeId, 1);
}
