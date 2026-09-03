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
import type { TreeState } from "./trees";

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
      note: 0,
    };
  }

  const parEspece = new Map<string, number>();
  const parStrate = new Array<number>(STRATES.length).fill(0);
  let surfaceSempervirente = 0;
  let surfaceTotale = 0;
  let gros = chandelles;
  const moisFloraison = new Set<number>();

  for (const t of vivants) {
    const espece = getEspece(t.especeId);
    parEspece.set(t.especeId, (parEspece.get(t.especeId) ?? 0) + 1);
    const strate = STRATES.findIndex((h) => t.heightM < h);
    if (strate >= 0) parStrate[strate] = (parStrate[strate] ?? 0) + 1;
    // Arbres-habitats : les gros sujets, mais aussi les TROGNES. Une tête de
    // trogne recoupée pendant des décennies se creuse, et ce creux vaut mieux
    // pour la faune qu'un fût sain de vingt mètres — c'est même la raison pour
    // laquelle on protège les vieux têtards de nos haies (critère J3).
    if (t.heightM >= 15 || (t.teteTrogneM !== undefined && t.recepages >= 2)) gros++;
    // Le couvert permanent se mesure en surface de houppier, pas en tiges.
    const surface = t.heightM * t.heightM;
    surfaceTotale += surface;
    if (!espece.lumiere.caduc) surfaceSempervirente += surface;
    if (espece.fruits) moisFloraison.add(Math.floor(espece.fruits.floraisonDJ / 250));
  }

  const richesse = parEspece.size;
  const equitabilite = equitabiliteShannon([...parEspece.values()]);
  const strates = equitabiliteShannon(parStrate);
  // Quelques gros arbres à l'hectare suffisent à changer la donne.
  const grosArbres = Math.min(1, gros / surfaceHa / 15);
  // ~20 t C/ha de bois mort est un objectif de forêt riche (ch4-A).
  const boisMort = Math.min(1, boisMortKgC / 1000 / surfaceHa / 20);
  const couvertPermanent = surfaceTotale > 0 ? surfaceSempervirente / surfaceTotale : 0;
  const floraisonsEtalees = Math.min(1, moisFloraison.size / 4);

  // Pondération : la richesse et son équilibre pèsent le plus, puis la
  // structure, puis les habitats particuliers.
  const note =
    100 *
    (0.25 * Math.min(1, richesse / 6) +
      0.2 * equitabilite +
      0.2 * strates +
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
    note,
  };
}
