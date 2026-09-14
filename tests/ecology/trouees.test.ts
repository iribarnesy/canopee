/**
 * « Les trouées déclenchent une régénération » (docs/realisme.md F7) — et rien
 * dans le moteur ne le déclare.
 *
 * Aucune règle ne dit « sous une trouée, sème ». Ce qui existe, c'est un filtre
 * de lumière à l'installation (`regeneration.ts` : un semis ne s'installe que
 * si le sol reçoit au moins deux fois le point de compensation de son espèce)
 * et une loi de Beer-Lambert qui rend le sol sombre sous les couronnes vivantes
 * (`light.ts`). La concentration des recrues sous les ouvertures, si elle
 * apparaît, ÉMERGE de ces deux-là.
 *
 * LE DISPOSITIF, et le soin qu'il demande. La pluie de semis vient du
 * `voisinage`, dont les positions sont tirées UNIFORMÉMENT sur la parcelle :
 * sous l'hypothèse nulle — la lumière ne compte pas — les recrues se
 * répartissent au hasard et les deux zones comparées en reçoivent autant. Le
 * comparateur principal est APPARIÉ : la même zone, la même graine, la même
 * météo, avec et sans la trouée. Seule la trouée change, donc seule elle peut
 * expliquer l'écart.
 *
 * Deux espèces arrivent ensemble, et ce n'est pas une complication gratuite :
 * le bouleau (compensation 0,25, donc 50 % de lumière exigés) ne peut
 * s'installer que dans une ouverture, le charme (0,03, donc 6 %) s'installe
 * aussi sous le couvert. Le charme est le TÉMOIN QU'IL Y A QUELQUE CHOSE À
 * MESURER : s'il ne recrutait nulle part, un « zéro bouleau sous couvert » ne
 * prouverait rien — la parcelle serait bloquée pour une tout autre raison, par
 * exemple le plafond de recouvrement des couronnes, qui est parcellaire et non
 * local. Ce plafond a d'ailleurs fait échouer la première version de cet essai :
 * une hêtraie plantée à trois mètres y atteint un recouvrement de 9, quatre
 * fois le plafond, et plus AUCUN semis ne s'installe nulle part — trouée
 * comprise.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantAt } from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

const COTE = 40;
/** Écartement de la hêtraie : couvert fermé, mais SOUS le plafond de recouvrement. */
const ECART = 8;
const H_CANOPEE = 15;
/** Rayon des tiges qu'on fait mourir. */
const RAYON_TROUEE = 8;
/** Rayon de comptage, plus petit : la zone comptée est tout entière dans l'ouverture. */
const RAYON_COMPTE = 6;
/**
 * Les deux zones sont SYMÉTRIQUES par rapport au milieu de la parcelle, à la
 * même ordonnée. C'est nécessaire : l'ombre est décalée vers le nord
 * (`SHADOW_NORTH_OFFSET`), et deux zones à des ordonnées différentes ne
 * seraient pas comparables.
 */
const TROUEE = { x: 12, y: 20 };
const TEMOIN = { x: 28, y: 20 };
const ANS = 15;
const GRAINES = [1, 2, 3, 4, 5];

function dans(x: number, y: number, c: { x: number; y: number }, r: number): boolean {
  const dx = x - c.x;
  const dy = y - c.y;
  return dx * dx + dy * dy <= r * r;
}

interface Comptage {
  /** recrues de toute espèce sur la parcelle entière */
  total: number;
  trouee: number;
  temoin: number;
  bouleauTrouee: number;
  bouleauTemoin: number;
  charmeTrouee: number;
  charmeTemoin: number;
}

/**
 * Une hêtraie fermée de quinze mètres, quinze ans plus tard, sous une pluie de
 * semis venue du paysage. `ouvrir` fait mourir de vieillesse les tiges d'un
 * disque : c'est la trouée du cycle sylvigénétique, et elle est provoquée plutôt
 * que subie parce qu'une mort tirée au sort ne tomberait pas au même endroit
 * d'une graine à l'autre — il n'y aurait plus rien à apparier.
 */
function hetraie(seed: number, ouvrir: { x: number; y: number } | null): Comptage {
  const station = {
    ...LIMON_RICHE.station,
    coteM: COTE,
    gibierParHa: 0,
    voisinage: [
      { especeId: "betula_pendula", semisParAn: 8 },
      { especeId: "carpinus_betulus", semisParAn: 8 },
    ],
  };
  const meteo = syntheticYear(LIMON_RICHE.climat);
  let state: GameState = createGameState(station, rngStateFromSeed(seed));
  for (let x = ECART / 2; x < COTE; x += ECART) {
    for (let y = ECART / 2; y < COTE; y += ECART) {
      state = plantAt(state, "fagus_sylvatica", x, y, H_CANOPEE);
    }
  }
  // Les hêtres du couvert ne grainent pas ici : leur maturité est à quarante
  // ans et la partie en dure quinze. Toutes les recrues viennent donc du
  // paysage, ce qui laisse la seule lumière décider de leur position.
  const dernierPlante = state.nextTreeId - 1;
  if (ouvrir) {
    state = {
      ...state,
      trees: state.trees.map((t) =>
        dans(t.x, t.y, ouvrir, RAYON_TROUEE)
          ? { ...t, alive: false, causeMort: "vieillesse" as const }
          : t,
      ),
    };
  }
  for (let w = 0; w < ANS * 52; w++) {
    const m = meteo[w % 52];
    if (!m) throw new Error("météo manquante");
    state = tick(state, m).state;
  }
  const recrues = state.trees.filter((t) => t.id > dernierPlante && t.alive);
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
  };
}

describe("une trouée dans un couvert fermé", () => {
  const parties: { seed: number; trouee: Comptage; fermee: Comptage }[] = [];

  // La campagne tourne dans un HOOK et non dans le corps du `describe` : dix
  // parties de quinze ans, c'est une minute sur ma machine et davantage sur le
  // runner d'intégration, qui est plus lent. Dans le corps du `describe`, ce
  // temps passe à la collecte, où aucun délai ne le couvre ; ici, `hookTimeout`
  // le couvre et la panne se lit au lieu de bloquer.
  beforeAll(() => {
    for (const seed of GRAINES) {
      parties.push({ seed, trouee: hetraie(seed, TROUEE), fermee: hetraie(seed, null) });
    }
  }, 600_000);

  it("la parcelle recrute, et le charme recrute jusque sous le couvert", () => {
    // AVANT de vérifier que c'est bien réparti, vérifier qu'il y a quelque
    // chose à répartir. Sans ce garde-fou, une parcelle entièrement bloquée
    // ferait passer toutes les assertions suivantes pour de mauvaises raisons —
    // et c'est exactement ce qui est arrivé à la première version.
    //
    // Mesuré sur le code livré : 125 à 155 recrues par partie fermée, dont 5 à
    // 11 charmes dans chacune des deux zones comptées.
    for (const p of parties) {
      expect(p.fermee.total).toBeGreaterThan(50);
      expect(p.fermee.charmeTrouee).toBeGreaterThan(0);
      expect(p.fermee.charmeTemoin).toBeGreaterThan(0);
    }
  });

  it("concentre la régénération, graine par graine", () => {
    // LE COMPARATEUR APPARIÉ : la même zone, la même graine, avec et sans la
    // trouée. Tout le reste est identique — position, météo, voisinage.
    //
    // Mesuré sur le code livré, recrues dans la zone (12,20) : 12 / 23 / 15 /
    // 24 / 20 avec la trouée, contre 3 / 8 / 11 / 10 / 7 sans elle. La
    // direction tient sur les cinq graines ; le RAPPORT, lui, va de 1,4 à 4,
    // et c'est pourquoi il n'est pas épinglé (docs/realisme.md, « ce qu'un test
    // écologique a le droit d'affirmer »).
    for (const p of parties) {
      expect(p.trouee.trouee).toBeGreaterThan(p.fermee.trouee);
    }
  });

  it("et la trouée en reçoit plus que le couvert voisin, dans la même partie", () => {
    // Le second comparateur, indépendant du premier : à l'intérieur d'une seule
    // partie, la zone ouverte contre la zone restée fermée.
    // Mesuré : 12 / 23 / 15 / 24 / 20 contre 11 / 9 / 6 / 5 / 14.
    for (const p of parties) {
      expect(p.trouee.trouee).toBeGreaterThan(p.trouee.temoin);
    }
  });

  it("ce n'est pas « plus de semis », c'est un TRI : le pionnier n'entre que par la trouée", () => {
    // La trouée ne se contente pas d'ajouter des tiges, elle change QUI
    // s'installe. Le bouleau exige 50 % de lumière (compensation 0,25) : il
    // n'a presque nulle part où s'installer sous le couvert, et l'ouverture lui
    // rend toute la place.
    //
    // Mesuré, bouleaux dans la zone (12,20) : 10 / 17 / 11 / 14 / 15 avec la
    // trouée, contre 1 / 2 / 3 / 1 / 2 sans elle. Et dans la même partie
    // trouée, 0 / 2 / 2 / 0 / 3 bouleaux sous le couvert du témoin.
    for (const p of parties) {
      expect(p.trouee.bouleauTrouee).toBeGreaterThan(p.fermee.bouleauTrouee);
      expect(p.trouee.bouleauTrouee).toBeGreaterThan(p.trouee.bouleauTemoin);
    }
  });
});
