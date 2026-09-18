/**
 * Indice de biodiversité (docs/regles.md §13).
 *
 * Un peuplement n'a pas de valeur qu'économique. Ce que le jeu ne mesurait pas
 * jusqu'ici — et qui fait toute la différence entre une pinède monospécifique
 * et une subéraie —, c'est la richesse du milieu :
 *  - combien d'espèces, et dans quel équilibre (une essence à 95 % est un
 *    désert, même si le nombre d'espèces est élevé) ;
 *  - combien de strates : un couvert étagé loge bien plus de monde ;
 *  - des gros arbres, qui sont des habitats à eux seuls (cavités, écorce) ;
 *  - du bois mort, « le grand oublié » (ch4-A) ;
 *  - un couvert permanent, qui protège le sol et abrite toute l'année ;
 *  - des floraisons étalées, pour nourrir les pollinisateurs sans rupture
 *    (ch4-C, les deux périodes de soudure de l'atlas).
 *
 * C'est un proxy honnête, affiché comme tel : il ne remplace pas un inventaire,
 * il classe des situations les unes par rapport aux autres.
 */

import { getEspece } from "./especes";
import { HERBACEES } from "./herbacees";
import { crownRadiusM } from "./light";
import { partFloraison } from "./phenologie";
import type { TreeState } from "./trees";
import { partHabitatDeTrogne } from "./trogne";

export interface IndiceBiodiversite {
  /** nombre d'espèces ligneuses présentes */
  richesse: number;
  /** équitabilité de Shannon ∈ [0,1] : 1 = toutes également représentées */
  equitabilite: number;
  /** diversité des strates de hauteur ∈ [0,1] */
  strates: number;
  /** présence d'arbres-habitats — gros sujets et trognes creuses ∈ [0,1] */
  grosArbres: number;
  /** bois mort au sol ∈ [0,1] */
  boisMort: number;
  /** part du couvert assurée toute l'année (sempervirents) ∈ [0,1] */
  couvertPermanent: number;
  /** étalement des floraisons dans l'année ∈ [0,1] */
  floraisonsEtalees: number;
  /**
   * La MOSAÏQUE ∈ [0,1] : lisière × cœur, normalisé (issue #75). Ce que
   * l'indice ne savait pas voir — deux parcelles portant exactement les mêmes
   * espèces, les mêmes hauteurs et le même bois mort n'abritent pas la même
   * faune selon qu'elles forment un bloc ou une mosaïque.
   */
  mosaique: number;
  /** étagement LOCAL ∈ [0,1] : l'écart-type des hauteurs dans un voisinage */
  etagement: number;
  /** note globale ∈ [0,100] */
  note: number;
}

/** Strates de hauteur (m) : sol, arbustive, sous-étage, canopée. */
/**
 * Hauteur à partir de laquelle une chandelle vaut un arbre-habitat, m. En
 * dessous, le tronc est trop mince pour qu'un pic y creuse une loge.
 */
export const CHANDELLE_HABITAT_M = 8;

const STRATES: readonly number[] = [1, 4, 12, Number.POSITIVE_INFINITY];

/**
 * Rayon du voisinage qui décide si une cellule est en lisière ou au cœur, m.
 *
 * Trois mètres : la portée à laquelle un merle, un lézard ou un carabe
 * « voient » une frontière. Plus court, on compterait chaque trou de couronne
 * comme une lisière ; plus long, une trouée de dix mètres n'en serait plus une
 * *(à calibrer)*.
 */
export const RAYON_VOISINAGE_M = 3;

/**
 * Hauteur de canopée par cellule, m : ce que la cellule porte de plus haut.
 * Zéro là où rien ne pousse — c'est cette carte qui porte les deux grandeurs
 * spatiales.
 */
export function hauteurParCellule(trees: readonly TreeState[], coteM: number): Float32Array {
  const h = new Float32Array(coteM * coteM);
  for (const t of trees) {
    if (!t.alive) continue;
    const espece = getEspece(t.especeId);
    const r = crownRadiusM(t.heightM, espece.lumiere.houppierRatio, t.diametreCm);
    const x0 = Math.max(0, Math.floor(t.x - r));
    const x1 = Math.min(coteM - 1, Math.floor(t.x + r));
    const y0 = Math.max(0, Math.floor(t.y - r));
    const y1 = Math.min(coteM - 1, Math.floor(t.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - t.x;
        const dy = y + 0.5 - t.y;
        if (dx * dx + dy * dy > r * r) continue;
        const i = y * coteM + x;
        if (t.heightM > (h[i] ?? 0)) h[i] = t.heightM;
      }
    }
  }
  return h;
}

/** Ce que l'ARRANGEMENT des arbres vaut, indépendamment des espèces. */
export interface StructureHorizontale {
  /** part de cellules en lisière : voisinage contrasté couvert / ouvert */
  lisiere: number;
  /** part de cellules de cœur : voisinage entièrement couvert */
  coeur: number;
  /** la mosaïque ∈ [0,1] : le PRODUIT des deux, normalisé */
  mosaique: number;
}

/**
 * La structure horizontale : lisière, cœur, et ce que leur rencontre vaut.
 *
 * ## Pourquoi un PRODUIT, et pas une courbe en cloche
 *
 * L'issue pose le vrai problème et le laisse ouvert : « ne pas récompenser le
 * mitage. Une lisière a de la valeur, un peuplement qui n'est QUE de la lisière
 * n'en a pas — les espèces de cœur de massif existent aussi. » Il fallait donc
 * une courbe qui monte puis redescend, et tailler une cloche demande de choisir
 * son sommet à la main.
 *
 * Le produit `lisière × cœur` l'évite : il vaut zéro quand il n'y a que de la
 * lisière (un semis éparpillé n'a pas de cœur), zéro quand il n'y a que du bloc
 * plein (une futaie pleine n'a pas de lisière), et il est maximal quand les deux
 * s'équilibrent. **Le sommet n'est pas choisi, il tombe** de l'énoncé « il faut
 * les deux » — qui est justement ce que dit l'écologie du paysage. Le facteur 4
 * ne fait que ramener ce maximum (un quart, à moitié-moitié) à 1.
 */
export function structureHorizontale(
  trees: readonly TreeState[],
  coteM: number,
): StructureHorizontale {
  const h = hauteurParCellule(trees, coteM);
  const r = Math.round(RAYON_VOISINAGE_M);
  let lisiere = 0;
  let coeur = 0;
  const n = coteM * coteM;
  if (n === 0) return { lisiere: 0, coeur: 0, mosaique: 0 };
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      let couverts = 0;
      let vus = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const vx = x + dx;
          const vy = y + dy;
          if (vx < 0 || vx >= coteM || vy < 0 || vy >= coteM) continue;
          if (dx * dx + dy * dy > r * r) continue;
          vus++;
          if ((h[vy * coteM + vx] ?? 0) > 0) couverts++;
        }
      }
      if (vus === 0) continue;
      // Une lisière est une FRONTIÈRE : du couvert et de l'ouvert à portée.
      if (couverts > 0 && couverts < vus) lisiere++;
      else if (couverts === vus) coeur++;
    }
  }
  const l = lisiere / n;
  const c = coeur / n;
  return { lisiere: l, coeur: c, mosaique: Math.min(1, 4 * l * c) };
}

/**
 * Hétérogénéité VERTICALE locale ∈ [0,1] : l'étagement, et non le damier.
 *
 * L'indice comptait les strates à l'échelle de la PARCELLE, ce qui confond deux
 * situations que rien ne devrait confondre : une parcelle où chaque mètre carré
 * porte trois étages, et une parcelle où un tiers porte des arbres, un tiers des
 * arbustes et un tiers de l'herbe. La première est étagée, la seconde est en
 * blocs, et l'équitabilité de Shannon leur donne la même note.
 *
 * On mesure donc l'écart-type des hauteurs DANS un voisinage, moyenné sur la
 * parcelle. Il est nul sur un peuplement équienne, maximal là où un sous-étage
 * pousse sous une canopée.
 */
export const ECART_TYPE_REFERENCE_M = 6;

export function heterogeneiteVerticale(trees: readonly TreeState[], coteM: number): number {
  const h = hauteurParCellule(trees, coteM);
  const r = Math.round(RAYON_VOISINAGE_M);
  let somme = 0;
  let cellules = 0;
  for (let y = 0; y < coteM; y++) {
    for (let x = 0; x < coteM; x++) {
      let n = 0;
      let s1 = 0;
      let s2 = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const vx = x + dx;
          const vy = y + dy;
          if (vx < 0 || vx >= coteM || vy < 0 || vy >= coteM) continue;
          if (dx * dx + dy * dy > r * r) continue;
          const v = h[vy * coteM + vx] ?? 0;
          n++;
          s1 += v;
          s2 += v * v;
        }
      }
      if (n < 2) continue;
      const variance = Math.max(0, s2 / n - (s1 / n) ** 2);
      somme += Math.sqrt(variance);
      cellules++;
    }
  }
  if (cellules === 0) return 0;
  return Math.min(1, somme / cellules / ECART_TYPE_REFERENCE_M);
}

/**
 * Cumul de degrés-jours base 5 °C qu'une année tempérée atteint, et donc
 * l'étendue de la saison de vol des pollinisateurs. Les stations du moteur
 * tournent entre 1 700 et 2 000 ; 1 800 couvre l'année de février à octobre
 * *(à calibrer)*.
 */
const SAISON_POLLINISATEURS_DJ = 1800;
/** Découpage de cette saison : 30 °C·j, soit environ une semaine d'été. */
const PAS_CALENDRIER_DJ = 30;

/**
 * ÉTALEMENT DES FLORAISONS ∈ [0,1] — critère J6, refait (#70).
 *
 * Ce que la mesure d'avant faisait : un ENSEMBLE de tranches de 250 °C·j, une
 * par espèce ligneuse présente, divisé par quatre. Quatre défauts, et le
 * premier suffit à la disqualifier.
 *
 *  1. **Elle comptait les anémophiles.** Un noisetier et un noyer entraient au
 *     même titre qu'un pommier, alors que leur pollen part au vent et qu'aucun
 *     insecte ne se déplace pour eux. Une noiseraie affichait des floraisons
 *     étalées et ne nourrissait personne.
 *  2. **Elle ignorait la strate basse**, qui est précisément ce qui nourrit
 *     pendant les soudures.
 *  3. **Elle ignorait la DURÉE.** Un ajonc qui tient six mois comptait pour une
 *     tranche, comme un abricotier qui passe en dix jours.
 *  4. **Elle comptait des espèces, pas une couverture.** Un pommier isolé parmi
 *     trois cents hêtres valait une tranche pleine.
 *
 * Ce qu'elle fait maintenant : elle balaie la saison de vol et demande, à
 * chaque pas, ce qui est OUVERT et ce que ça offre. Les sources s'additionnent
 * et saturent — deux tables valent une table garnie —, et la note est la
 * moyenne sur la saison. Un trou dans le calendrier se lit donc comme un trou,
 * ce que l'ensemble de tranches ne savait pas faire.
 */
function etalementDesFloraisons(
  partParEspece: ReadonlyMap<string, number>,
  empriseHerbacee: readonly number[] | undefined,
): number {
  let somme = 0;
  let pas = 0;
  for (let dj = 0; dj < SAISON_POLLINISATEURS_DJ; dj += PAS_CALENDRIER_DJ) {
    let offre = 0;
    for (const [especeId, part] of partParEspece) {
      const f = getEspece(especeId).floraison;
      if (!f || f.nectar <= 0) continue;
      offre += f.nectar * part * partFloraison(f.debutDJ, dj, f.dureeDJ);
    }
    for (const [i, h] of HERBACEES.entries()) {
      const f = h.floraison;
      if (!f || f.nectar <= 0) continue;
      const emprise = empriseHerbacee?.[i] ?? 0;
      if (emprise <= 0) continue;
      offre += f.nectar * emprise * partFloraison(f.debutDJ, dj, f.dureeDJ);
    }
    somme += Math.min(1, offre);
    pas++;
  }
  return pas > 0 ? somme / pas : 0;
}

/** Entropie de Shannon normalisée : 0 = une seule catégorie, 1 = tout équilibré. */
function equitabiliteShannon(effectifs: readonly number[]): number {
  const total = effectifs.reduce((a, b) => a + b, 0);
  const presentes = effectifs.filter((n) => n > 0);
  if (total <= 0 || presentes.length <= 1) return 0;
  let h = 0;
  for (const n of presentes) {
    const p = n / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(presentes.length);
}

export function indiceBiodiversite(
  trees: readonly TreeState[],
  boisMortKgC: number,
  surfaceHa: number,
  /**
   * Côté de la parcelle, m. Les deux grandeurs SPATIALES en ont besoin : sans
   * grille, pas de voisinage, donc ni lisière ni étagement local. Absent, elles
   * valent zéro et l'indice se comporte comme avant — les appelants qui ne
   * décrivent pas une vraie parcelle (un essai sur une liste d'arbres) ne sont
   * pas pénalisés pour une géométrie qu'ils n'ont pas.
   */
  coteM?: number,
  /**
   * Emprise moyenne de chaque herbacée sur la parcelle, dans l'ordre de
   * `HERBACEES` (#70). OPTIONNEL : un essai qui décrit une liste d'arbres n'a
   * pas de tapis, et l'indice se comporte alors comme si le sol était nu —
   * ce qu'il faisait pour tout le monde avant ce lot.
   */
  empriseHerbacee?: readonly number[],
): IndiceBiodiversite {
  const vivants = trees.filter((t) => t.alive);
  // Les CHANDELLES comptent parmi les arbres-habitats, et pas qu'un peu : un
  // tronc mort resté debout est ce que les pics attaquent en premier, et le
  // trou qu'ils abandonnent sert ensuite à des dizaines d'espèces qui ne
  // savent pas creuser. Un arbre vivant sain n'offre rien de tel. Elles se
  // comptent AVANT le cas « pas un arbre vivant » : une parcelle brûlée n'est
  // pas vide de vie, elle en porte une autre.
  const chandelles = trees.filter(
    (t) => !t.alive && t.mortSemaine !== undefined && t.heightM >= CHANDELLE_HABITAT_M,
  ).length;
  if (vivants.length === 0 && chandelles === 0) {
    return {
      richesse: 0,
      equitabilite: 0,
      strates: 0,
      grosArbres: 0,
      boisMort: 0,
      couvertPermanent: 0,
      floraisonsEtalees: 0,
      mosaique: 0,
      etagement: 0,
      note: 0,
    };
  }

  const parEspece = new Map<string, number>();
  const parStrate = new Array<number>(STRATES.length).fill(0);
  let surfaceSempervirente = 0;
  let surfaceTotale = 0;
  let gros = chandelles;
  /**
   * Surface de houppier par espèce : c'est elle, et non le nombre de tiges,
   * qui dit ce qu'une espèce OFFRE en fleur. Un pommier isolé parmi trois
   * cents hêtres ne nourrit pas une parcelle (#70).
   */
  const surfaceParEspece = new Map<string, number>();

  for (const t of vivants) {
    const espece = getEspece(t.especeId);
    parEspece.set(t.especeId, (parEspece.get(t.especeId) ?? 0) + 1);
    const strate = STRATES.findIndex((h) => t.heightM < h);
    if (strate >= 0) parStrate[strate] = (parStrate[strate] ?? 0) + 1;
    // Arbres-habitats : les gros sujets, mais aussi les TROGNES. Une tête de
    // trogne recoupée pendant des décennies se creuse, et ce creux vaut mieux
    // pour la faune qu'un fût sain de vingt mètres — c'est même la raison pour
    // laquelle on protège les vieux têtards de nos haies (critère J3).
    //
    // Le creux se compte en LITRES, pas en oui/non. Un seuil à deux étêtages
    // donnait la même valeur à une tête de trois coupes et à un saule têtard
    // centenaire, alors que l'écart va du litre à la centaine — et que c'est
    // ce volume, et lui seul, qui décide entre une mésange et une chevêche
    // (trogne.ts).
    if (t.heightM >= 15) gros++;
    else gros += partHabitatDeTrogne(t);
    // Le couvert permanent se mesure en surface de houppier, pas en tiges.
    const surface = t.heightM * t.heightM;
    surfaceTotale += surface;
    if (!espece.lumiere.caduc) surfaceSempervirente += surface;
    surfaceParEspece.set(t.especeId, (surfaceParEspece.get(t.especeId) ?? 0) + surface);
  }

  const richesse = parEspece.size;
  const equitabilite = equitabiliteShannon([...parEspece.values()]);
  const strates = equitabiliteShannon(parStrate);
  // Quelques gros arbres à l'hectare suffisent à changer la donne.
  const grosArbres = Math.min(1, gros / surfaceHa / 15);
  // ~20 t C/ha de bois mort est un objectif de forêt riche (ch4-A).
  const boisMort = Math.min(1, boisMortKgC / 1000 / surfaceHa / 20);
  const couvertPermanent = surfaceTotale > 0 ? surfaceSempervirente / surfaceTotale : 0;
  const partParEspece = new Map<string, number>();
  if (surfaceTotale > 0) {
    for (const [id, surf] of surfaceParEspece) partParEspece.set(id, surf / surfaceTotale);
  }
  const floraisonsEtalees = etalementDesFloraisons(partParEspece, empriseHerbacee);
  // L'ARRANGEMENT, enfin (issue #75) : la mosaïque et l'étagement local. Ils
  // ne coûtent rien aux appelants sans géométrie, qui les reçoivent à zéro.
  const spatial = coteM && coteM > 0 ? structureHorizontale(vivants, coteM) : undefined;
  const mosaique = spatial?.mosaique ?? 0;
  const etagement = coteM && coteM > 0 ? heterogeneiteVerticale(vivants, coteM) : 0;

  // Pondération : la richesse et son équilibre pèsent le plus, puis la
  // structure, puis les habitats particuliers.
  //
  // Les deux termes spatiaux prennent leurs douze points sur `strates`, qui
  // passe de 0,20 à 0,08 — et ce n'est pas un arbitrage de place, c'est une
  // correction. `strates` compte les étages à l'échelle de la PARCELLE, donc
  // elle note pareil une forêt étagée et un damier de blocs monostrates.
  // `etagement` mesure ce que `strates` croyait mesurer ; il est juste qu'il en
  // reprenne le poids *(à calibrer)*.
  const note =
    100 *
    (0.25 * Math.min(1, richesse / 6) +
      0.2 * equitabilite +
      0.08 * strates +
      0.07 * etagement +
      0.05 * mosaique +
      0.12 * grosArbres +
      0.1 * boisMort +
      0.08 * couvertPermanent +
      0.05 * floraisonsEtalees);

  return {
    richesse,
    equitabilite,
    strates,
    grosArbres,
    boisMort,
    couvertPermanent,
    floraisonsEtalees,
    mosaique,
    etagement,
    note,
  };
}
