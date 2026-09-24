/**
 * Le dispositif partagé des essais de hauteur : la table de référence, la
 * station acide des calcifuges, et la fonction qui fait pousser huit sujets.
 *
 * **Il vit dans son propre module parce que le fichier a été scindé**. Les essais
 * de hauteur étaient le plus gros poste de la suite — 700 s à eux seuls, soit
 * 16 % du total — et `vitest --shard` répartit des **fichiers** : tant qu'ils
 * tenaient dans un seul, aucun découpage de la CI ne pouvait passer sous ces
 * 700 s. Le coupage est fait de façon à ne **recalculer aucune espèce** : les
 * essais de forme ne lisent que le hêtre, le bouleau et le châtaignier, et ils
 * suivent leur espèce dans son fichier.
 *
 * Ce module n'est pas un `.test.ts` : il n'est donc pas collecté, et chaque
 * fichier qui l'importe a sa propre mémoïsation.
 */

import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { horizon } from "../../src/engine/soil";
import { createGameState, plantScattered } from "../../src/engine/state";
import { LIMON_RICHE, stationDepuisProfil } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/**
 * **le limon riche**, **mais acide** — la station des calcifuges.
 *
 * Le limon riche titre pH 7,0 en surface. Le châtaignier (pH 4→6,5) et le houx
 * (4→7) y meurent de chlorose : on ne peut pas les comparer à une table sur une
 * station qui les tue. Même texture, même matière organique, même azote, même
 * climat — seul le pH change, et il vaut alors ce qu'il vaut sous une
 * châtaigneraie du Limousin. C'est la même convention que pour le limon riche :
 * cette station-là **vaut** la classe médiane, pour les essences qui l'habitent.
 */
export const LIMON_ACIDE = {
  station: stationDepuisProfil({
    ...LIMON_RICHE.station,
    id: "limon-acide",
    nom: "Limon profond acide",
    profil: [
      horizon(35, { sable: 20, limon: 65, argile: 15 }, { moPct: 2.2, ph: 5.2 }),
      horizon(65, { sable: 20, limon: 65, argile: 15 }, { moPct: 0.8, ph: 5 }),
    ],
    initialMineralNKgHa: 60,
  }),
  climat: LIMON_RICHE.climat,
};

export interface Reference {
  nom: string;
  /** absente quand la table n'est **pas** comparable à vingt ans (voir le châtaignier) */
  h20?: number;
  h40: number;
  /** station de référence, quand ce n'est pas le limon riche */
  sc?: typeof LIMON_RICHE;
}

/**
 * Hauteur dominante **tabulée** à 20 et 40 ans, classe médiane.
 *
 * On ne compare pas à dix ans : les tables ne descendent pas sous quinze ans,
 * et les valeurs à dix ans qui circulent sont des extrapolations — ce n'est pas
 * de la vérité terrain, et le moteur n'a pas à s'y caler. Le début de courbe
 * est vérifié autrement, par sa **forme** (dernier essai du fichier).
 */
export const TABLE: Record<string, Reference> = {
  // Jansen 1996, beuk, GK 8 (gamme 4→12), d'après Carbonnier 1971 et Schober 1972.
  fagus_sylvatica: { nom: "Hêtre", h20: 7.7, h40: 16.0 },
  // Jansen 1996, groveden, GK 8 (gamme 4→12), d'après Faber 1996a.
  pinus_sylvestris: { nom: "Pin sylvestre", h20: 8.1, h40: 15.5 },
  // Jansen 1996, zwarte els, GK 6 (gamme 4→8), d'après Mitscherlich 1945.
  alnus_glutinosa: { nom: "Aulne", h20: 12.6, h40: 18.0 },
  // Jansen 1996, es, GK 6 (gamme 4→9), d'après Volquardts 1958.
  fraxinus_excelsior: { nom: "Frêne", h20: 9.0, h40: 16.5 },
  // Lockow & Lockow 2009, **première** table de production du charme (avant elle,
  // on le taxait par analogie avec le hêtre) : bonité absolue HO100 = 25 m
  // (II,25 Ekl.), classe médiane de la gamme 18→31 m. Colonne HO, p. 46.
  // Géographie à décoter : plaine du nord-est allemand, subcontinentale sèche.
  // Recoupement dans la bonne zone : le CNPF (2025) recommande pour le charme
  // français les tables **néerlandaises** de chêne, qui donnent 15,4 m à quarante
  // ans — 6 % sous celle-ci. Les deux encadrent le moteur, qui était sous les
  // deux.
  carpinus_betulus: { nom: "Charme", h20: 9.9, h40: 16.3 },
  // Faisceau de courbes des **taillis** de châtaignier en France (Lemaire 2005,
  // SUF-IDF, publié par le CRPF Île-de-France–Centre 2013). Les seules valeurs
  // écrites du faisceau sont les hauteurs dominantes à 25 ans : 21 / 18,5 / 16
  // / 13,5 / 11 / 8,5 m pour les classes 1 à 6, soit 14,75 m à la médiane. La
  // hauteur à quarante ans est **lue sur le graphique** *(à confirmer)*.
  //
  // Pas de repère à vingt ans, et c'est délibéré : ce sont des courbes de
  // **taillis**. Un rejet de souche part sur un système racinaire fait, il devance
  // donc un semis en jeunesse, et le moteur ne sait pas rendre cet écart (sa
  // forme de croissance dépend de la taille, pas de l'âge). Comparer les deux
  // à vingt ans mesurerait ce décalage-là, pas la vitesse de l'essence. Ce
  // qu'on en vérifie est le **signe**, dans l'essai suivant.
  castanea_sativa: { nom: "Châtaignier", h40: 18.7, sc: LIMON_ACIDE },
};

/** À quarante ans : garde-fou serré, puisque deux espèces y sont calées. */
export const TOLERANCE_CALAGE = 0.15;
/** À vingt ans : vérification tenue à l'écart, aucune espèce n'y est calée. */
export const TOLERANCE_TENUE_A_LECART = 0.2;
const GRAINES = [17, 43];
const PLANTS = 8;

/**
 * Mémoïsation : plusieurs essais réclament la même espèce (le hêtre sert de
 * témoin au bouleau et de sujet à l'essai de forme). Chaque appel coûte deux
 * parties de quarante ans ; les recalculer serait payer trois fois le même
 * résultat déterministe.
 */
const CACHE = new Map<string, Record<number, number>>();

/**
 * Hauteur moyenne des sujets plantés, aux jalons demandés, moyennée sur les
 * graines. `anMax` borne la simulation : un arbuste dont la mesure de terrain
 * s'arrête à douze ans ne coûte pas une partie de quarante.
 */
export function hauteurs(
  especeId: string,
  anMax = 40,
  sc = LIMON_RICHE,
  coteM = 60,
): Record<number, number> {
  const cle = `${especeId}|${anMax}|${sc.station.id}|${coteM}`;
  const enCache = CACHE.get(cle);
  if (enCache) return enCache;
  const jalons = [3, 5, 8, 10, 12, 20, 40].filter((an) => an <= anMax);
  const weather = syntheticYear(sc.climat);
  // Parcelle réduite (60 × 60 m) : mêmes dynamiques, essai plus rapide.
  const station = { ...sc.station, coteM, gibierParHa: 0, voisinage: [] };
  const cumul: Record<number, number> = {};
  for (const j of jalons) cumul[j] = 0;
  for (const graine of GRAINES) {
    let state = createGameState(station, rngStateFromSeed(graine));
    state = plantScattered(state, especeId, PLANTS, 0.3);
    for (let i = 0; i < anMax * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = tick(state, w).state;
      const an = (i + 1) / 52;
      if (!jalons.includes(an)) continue;
      const vivants = state.trees.filter((t) => t.alive && t.id <= PLANTS);
      const moyenne = vivants.length
        ? vivants.reduce((s, t) => s + t.heightM, 0) / vivants.length
        : 0;
      cumul[an] = (cumul[an] ?? 0) + moyenne;
    }
  }
  const mesure: Record<number, number> = {};
  for (const j of jalons) mesure[j] = (cumul[j] ?? 0) / GRAINES.length;
  CACHE.set(cle, mesure);
  return mesure;
}

/** Hauteur simulée à un jalon, ou l'échec explicite si le jalon n'a pas été mesuré. */
export function a(mesure: Record<number, number>, an: number): number {
  const h = mesure[an];
  if (h === undefined) throw new Error(`jalon ${an} ans non mesuré`);
  return h;
}
