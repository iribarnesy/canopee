/**
 * Ce que partagent les deux bancs de la trouée (docs/realisme.md F7) :
 * `trouees.test.ts`, une hêtraie de 15 m plantée à 8 m (un couvert perméable),
 * et `trouees-couvert-ferme.test.ts`, une hêtraie que le moteur fait pousser à
 * 2 m (un couvert vraiment fermé). La même parcelle, la même trouée, la même
 * pluie de semis et le même comptage.
 */

import { computeGroundLight } from "../../src/engine/light";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt, type Station } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

export const COTE = 40;
/** Rayon des tiges qu'on fait mourir. */
export const RAYON_TROUEE = 8;
/** Rayon de comptage, plus petit : la zone comptée est tout entière dans l'ouverture. */
export const RAYON_COMPTE = 6;
/**
 * Les deux zones sont **symétriques** par rapport au milieu de la parcelle, à la
 * même ordonnée. C'est nécessaire : l'ombre est décalée vers le nord
 * (`SHADOW_NORTH_OFFSET`), et deux zones à des ordonnées différentes ne
 * seraient pas comparables.
 */
export const TROUEE = { x: 12, y: 20 };
export const TEMOIN = { x: 28, y: 20 };
/** Les années comptées après l'ouverture. */
export const ANS = 15;
export const GRAINES = [1, 2, 3, 4, 5];
export const METEO = syntheticYear(LIMON_RICHE.climat);
/**
 * La pluie de semis du paysage : un pionnier, le bouleau (compensation 0,25,
 * donc 50 % de lumière exigés), et une essence d'ombre, le charme (0,03, donc
 * 6 %).
 */
const VOISINAGE: Station["voisinage"] = [
  { especeId: "betula_pendula", semisParAn: 8 },
  { especeId: "carpinus_betulus", semisParAn: 8 },
];
export const STATION: Station = {
  ...LIMON_RICHE.station,
  coteM: COTE,
  gibierParHa: 0,
  voisinage: VOISINAGE,
};

export function dans(x: number, y: number, c: { x: number; y: number }, r: number): boolean {
  const dx = x - c.x;
  const dy = y - c.y;
  return dx * dx + dy * dy <= r * r;
}

export interface Comptage {
  /** recrues de toute espèce sur la parcelle entière */
  total: number;
  trouee: number;
  temoin: number;
  bouleauTrouee: number;
  bouleauTemoin: number;
  charmeTrouee: number;
  charmeTemoin: number;
  /** lumière au sol de la zone de la trouée, en feuilles, l'été de la dernière année */
  lumiereEteTrouee: number;
}

/** La semaine où l'on lit le sol : fin juillet, feuillage plein. */
const SEMAINE_ETE = 28;

/** La lumière d'été moyenne que reçoit le sol de la zone comptée de la trouée. */
export function lumiereEteZone(state: GameState): number {
  const sol = computeGroundLight(state.trees, COTE, COTE, () => 1);
  let somme = 0;
  let n = 0;
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      if (!dans(x + 0.5, y + 0.5, TROUEE, RAYON_COMPTE)) continue;
      somme += sol[y * COTE + x] ?? 1;
      n++;
    }
  }
  return somme / Math.max(1, n);
}

/**
 * Fait mourir de vieillesse les tiges du disque de la trouée : c'est la trouée
 * du cycle sylvigénétique, et elle est provoquée plutôt que subie parce qu'une
 * mort tirée au sort ne tomberait pas au même endroit d'une graine à l'autre —
 * il n'y aurait plus rien à apparier.
 */
export function ouvrir(state: GameState): GameState {
  return {
    ...state,
    trees: state.trees.map((t) =>
      dans(t.x, t.y, TROUEE, RAYON_TROUEE)
        ? { ...t, alive: false, causeMort: "vieillesse" as const }
        : t,
    ),
  };
}

/**
 * Les `ANS` années qui suivent, sous la pluie de semis du paysage, puis le
 * comptage des recrues : les tiges nées après `dernier`, encore debout.
 */
export function compterApres(depart: GameState, dernier: number): Comptage {
  let state = depart;
  let lumiereEteTrouee = 1;
  for (let w = 0; w < ANS * 52; w++) {
    const m = METEO[w % 52];
    if (!m) throw new Error("météo manquante");
    state = tick(state, m).state;
    if (w === (ANS - 1) * 52 + SEMAINE_ETE) lumiereEteTrouee = lumiereEteZone(state);
  }
  const recrues = state.trees.filter((t) => t.id > dernier && t.alive);
  const zone = (c: { x: number; y: number }, id?: string) =>
    recrues.filter(
      (t) => dans(t.x, t.y, c, RAYON_COMPTE) && (id === undefined || t.especeId === id),
    ).length;
  return {
    total: recrues.length,
    trouee: zone(TROUEE),
    temoin: zone(TEMOIN),
    bouleauTrouee: zone(TROUEE, "betula_pendula"),
    bouleauTemoin: zone(TEMOIN, "betula_pendula"),
    charmeTrouee: zone(TROUEE, "carpinus_betulus"),
    charmeTemoin: zone(TEMOIN, "carpinus_betulus"),
    lumiereEteTrouee,
  };
}

/** Écartement du couvert vraiment fermé, m : celui de la plantation de F6. */
export const SERRE = 2;
/** Les années que le moteur laisse pousser le couvert avant d'ouvrir. */
export const ANS_COUVERT = 40;

/**
 * La station du couvert vraiment fermé : la même, sans vent (`ventExposition`
 * 0, comme la chênaie de `glandee`). Ce banc mesure le tri par la lumière ; la
 * tempête qui casse une futaie serrée a son issue (#483).
 */
const STATION_CALME: Station = { ...STATION, ventExposition: 0 };

/**
 * Le couvert vraiment fermé, que le moteur fait pousser : des hêtres plantés à
 * 2 m (0,3 m, le plant par défaut), quarante ans, sans pluie de semis ni vent.
 * Rend l'état au moment d'ouvrir et la lumière d'été de la zone, l'été d'avant.
 */
export function couvertFerme(seed: number): { etat: GameState; lumiere: number } {
  let state = createGameState({ ...STATION_CALME, voisinage: [] }, rngStateFromSeed(seed));
  for (let x = SERRE / 2; x < COTE; x += SERRE) {
    for (let y = SERRE / 2; y < COTE; y += SERRE) {
      state = plantAt(state, "fagus_sylvatica", x, y);
    }
  }
  let lumiere = 1;
  for (let w = 0; w < ANS_COUVERT * 52; w++) {
    const m = METEO[w % 52];
    if (!m) throw new Error("météo manquante");
    state = tick(state, m).state;
    if (w === (ANS_COUVERT - 1) * 52 + SEMAINE_ETE) lumiere = lumiereEteZone(state);
  }
  return { etat: state, lumiere };
}

/** Ouvre (ou non) le couvert, fait tomber la pluie de semis et compte. */
export function apresOuverture(couvert: GameState, trouee: boolean): Comptage {
  const depart: GameState = { ...couvert, station: STATION_CALME };
  return compterApres(trouee ? ouvrir(depart) : depart, couvert.nextTreeId - 1);
}
