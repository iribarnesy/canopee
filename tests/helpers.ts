import { syntheticYear, type WeekWeather } from "../src/engine/meteo";
import { rngStateFromSeed } from "../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../src/engine/state";
import type { StationClimat } from "../src/engine/stations";
import { tick } from "../src/engine/tick";

/**
 * **Combien de temps la parcelle Nil de Broadbalk avait été labourée avant
 * 1843**, en années (#324) : le vieillissement des essais qui la prennent pour
 * point zéro (C16, `culture.test.ts` et `labour-desserre.test.ts`).
 *
 * Broadbalk n'est pas parti d'un sol neuf. « Both experiments started with low
 * stocks of SOC: 30.1 t/ha (1.15% C) in Hoosfield and 28.8 t/ha (1.00% C) in
 * Broadbalk. This is because the fields had been in arable cropping for several
 * hundred years before the start of the experiments » (Poulton et al. 2018,
 * *Global Change Biology* 24 : 2563). Deux cents ans est le plus court de ces
 * « plusieurs siècles ».
 *
 * Ces siècles-là ne sont pas ceux du moteur : le même article les donne en
 * assolement, avec du fumier une année sur cinq. Le vieillissement des essais
 * se fait sous leur propre conduite, blé continu sans apport, labouré chaque
 * automne : c'est le plus simple, et il n'ajoute aucun mécanisme. Il ne met
 * pas le sol à l'équilibre, parce que le moteur n'en a pas : mesuré sur
 * quatre cents ans, le blé sans apport baisse encore de 13 % tous les vingt
 * ans sur main, de 8 % avec la rosette d'hiver (#324, #346).
 */
export const CHAMP_LABOURE_AVANT_BROADBALK_ANS = 200;

export interface RunOptions {
  /** densité de cervidés ; 0 par défaut pour isoler ce qu'on mesure */
  gibierParHa?: number;
  /** pluie de semis du paysage ; vide par défaut, même raison */
  voisinage?: { especeId: string; semisParAn: number }[];
  seed?: number;
  /** plantations initiales, positions pseudo-aléatoires seedées */
  plantations?: { especeId: string; count: number; heightM?: number }[];
  /** série météo à rejouer (défaut : année synthétique de la station) */
  weather?: WeekWeather[];
}

/** Simule n années sur une station, avec plantation initiale optionnelle. */
export function runYears(sc: StationClimat, years: number, opts: RunOptions = {}): GameState {
  const weather = opts.weather ?? syntheticYear(sc.climat);
  // Ces essais isolent une tolérance (eau, engorgement, lumière, pH) : on met
  // donc le gibier de côté, sans quoi c'est lui qu'on mesure. Les dégâts de
  // cervidés ont leurs propres tests (gibier.test.ts).
  // Ni gibier, ni pluie de semis venue du paysage : ces essais isolent une
  // tolérance ou une réponse à la lumière, pas la dynamique du voisinage.
  const station = {
    ...sc.station,
    gibierParHa: opts.gibierParHa ?? 0,
    voisinage: opts.voisinage ?? [],
  };
  let state = createGameState(station, rngStateFromSeed(opts.seed ?? 42));
  for (const p of opts.plantations ?? []) {
    state = plantScattered(state, p.especeId, p.count, p.heightM ?? 0.3);
  }
  for (let i = 0; i < years * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    state = tick(state, w).state;
  }
  return state;
}

/**
 * Hauteur moyenne des arbres vivants d'une espèce (0 si tous morts).
 * `maxId` restreint à la cohorte plantée au départ (les recrues de la
 * régénération naturelle ont des ids supérieurs).
 */
export function meanHeight(state: GameState, especeId: string, maxId = Infinity): number {
  const alive = state.trees.filter((t) => t.especeId === especeId && t.alive && t.id <= maxId);
  if (alive.length === 0) return 0;
  return alive.reduce((s, t) => s + t.heightM, 0) / alive.length;
}

export function aliveCount(state: GameState, especeId: string, maxId = Infinity): number {
  return state.trees.filter((t) => t.especeId === especeId && t.alive && t.id <= maxId).length;
}
