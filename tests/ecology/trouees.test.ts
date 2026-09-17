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
 * comparateur est APPARIÉ : la même zone, la même graine, la même météo, avec
 * et sans la trouée. Seule la trouée change, donc seule elle peut expliquer
 * l'écart.
 *
 * ET IL DOIT L'ÊTRE. Cet essai a d'abord porté un second comparateur, croisé :
 * dans une même partie, la zone ouverte contre une zone témoin restée sous
 * couvert. Il est tombé au premier déplacement du flux aléatoire, et la
 * remesure a montré que le défaut était dans le comparateur, pas dans le
 * moteur — sur certaines graines, la zone témoin est elle-même une ouverture
 * naturelle (17 recrues dont 9 bouleaux SANS qu'on ait rien creusé). Une
 * hêtraie n'est pas un couvert homogène, ce qui est précisément l'objet de F7 :
 * on ne peut donc pas prendre un point quelconque du peuplement pour un témoin
 * fermé. Apparier la même zone avec elle-même est la seule façon de neutraliser
 * ça.
 *
 * Deux espèces arrivent ensemble, et ce n'est pas une complication gratuite :
 * le bouleau (compensation 0,25, donc 50 % de lumière exigés) ne peut
 * s'installer que dans une ouverture, le charme (0,03, donc 6 %) s'installe
 * aussi sous le couvert. Le charme est le TÉMOIN QU'IL Y A QUELQUE CHOSE À
 * MESURER : s'il ne recrutait nulle part, un « zéro bouleau sous couvert » ne
 * prouverait rien — la parcelle pourrait être bloquée pour une tout autre
 * raison.
 *
 * ELLE L'ÉTAIT, ET C'EST CORRIGÉ (#95). Le plafond de recouvrement des
 * couronnes se comptait sur la PARCELLE ENTIÈRE : une hêtraie plantée à trois
 * mètres y atteint un recouvrement de 6 à 16 pour un plafond de 2,5, et plus
 * aucun semis ne s'installait nulle part — trouée comprise, alors que la
 * lumière y remontait à 1,00. La première version de cet essai est morte de ça,
 * et l'écartement de HUIT mètres du `describe` ci-dessous est l'écartement de
 * repli qu'il a fallu prendre : le seul qui reste sous le plafond parcellaire.
 *
 * Le plafond est devenu local, et le second `describe` plante donc à trois
 * mètres — une futaie vraiment dense, qui était le cas intéressant et qui était
 * hors de portée. Le dispositif de repli reste ici parce qu'il mesure autre
 * chose et le mesure bien : sous un couvert PERMÉABLE, la trouée concentre et
 * trie, là où le couvert serré, lui, oppose un zéro franc.
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
function hetraie(seed: number, ouvrir: { x: number; y: number } | null, ecart = ECART): Comptage {
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
  for (let x = ecart / 2; x < COTE; x += ecart) {
    for (let y = ecart / 2; y < COTE; y += ecart) {
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
    // Mesuré sur le code livré : 130 à 179 recrues par partie fermée, dont 3 à
    // 9 charmes dans chacune des deux zones comptées.
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
    // Mesuré sur le code livré, recrues dans la zone (12,20) : 17 / 17 / 14 /
    // 23 / 17 avec la trouée, contre 6 / 9 / 12 / 10 / 5 sans elle. La
    // direction tient sur les cinq graines — et sur huit, en élargissant la
    // campagne. Le RAPPORT, lui, va de 1,2 à 3,4, et c'est pourquoi il n'est
    // pas épinglé (docs/realisme.md, « ce qu'un test écologique a le droit
    // d'affirmer »).
    for (const p of parties) {
      expect(p.trouee.trouee).toBeGreaterThan(p.fermee.trouee);
    }
  });

  // IL Y AVAIT ICI UN TROISIÈME ESSAI, ET IL ÉTAIT MAL FONDÉ. Il comparait, dans
  // une seule partie, la zone ouverte à la zone témoin restée sous couvert. Le
  // lot des tempêtes, du sanglier et de la strate herbacée a déplacé le flux
  // aléatoire, et il est tombé sur la graine 1 : 16 recrues dans la trouée
  // contre 21 dans le témoin.
  //
  // La remesure a montré que ce n'était NI un décalage de flux innocent, NI une
  // régression du mécanisme, mais un défaut du comparateur lui-même. Dans la
  // partie SANS trouée de cette graine, la zone témoin porte déjà 17 recrues
  // dont 9 bouleaux, contre 4 dans la zone de la future trouée : sur cette
  // graine, le « témoin sous couvert fermé » est lui-même une ouverture
  // naturelle. Le comparateur supposait un témoin fermé et rien ne le
  // garantissait — la hêtraie n'est pas un couvert homogène, c'est tout l'objet
  // de F7.
  //
  // Il n'est pas remplacé par un seuil plus bas, ce qui aurait été l'erreur que
  // `realisme.md` décrit : il est retiré parce que sa prémisse est fausse. Ce
  // qu'il prétendait montrer est démontré par le comparateur apparié ci-dessus
  // (5/5, et 8/8 sur la campagne élargie).
  //
  // J'AVAIS GARDÉ UNE COMPARAISON CROISÉE POUR LE BOULEAU, en me disant qu'elle
  // était fondée là où celle des totaux ne l'était pas. Elle est tombée au lot
  // suivant (#84, le plancher racinaire) sur une égalité 13 contre 13, et c'est
  // la même prémisse fausse qui lâchait : elle suppose un témoin FERMÉ, et rien
  // ne le garantit — y compris pour le bouleau, puisque la zone témoin est
  // parfois une ouverture naturelle. Retirée pour la même raison que l'autre, et
  // non parce qu'un seuil manquait de marge. Ce qu'elle disait est porté par
  // l'appariement, qui ne suppose rien.

  it("ce n'est pas « plus de semis », c'est un TRI : le pionnier n'entre que par la trouée", () => {
    // La trouée ne se contente pas d'ajouter des tiges, elle change QUI
    // s'installe. Le bouleau exige 50 % de lumière (compensation 0,25) : il
    // n'a presque nulle part où s'installer sous le couvert, et l'ouverture lui
    // rend toute la place.
    //
    // Le comparateur est APPARIÉ, comme celui des totaux et pour la même
    // raison : la même zone, la même graine, avec et sans la trouée.
    //
    // Mesuré sur le code livré, bouleaux dans la zone (12,20) : 14 / 12 / 11 /
    // 13 / 12 avec la trouée, contre 3 / 3 / 4 / 1 / 0 sans elle. Un facteur 4
    // à l'infini, là où les recrues TOUTES ESPÈCES confondues ne font qu'un
    // facteur 1,2 à 3,4 : c'est bien un tri, pas un supplément.
    for (const p of parties) {
      expect(p.trouee.bouleauTrouee).toBeGreaterThan(p.fermee.bouleauTrouee);
    }
  });
});

/**
 * LA LIMITE ÉCRITE DE CET ESSAI EST TOMBÉE (#95).
 *
 * Le `describe` ci-dessus plante à HUIT mètres, et pas par choix : au-delà, le
 * plafond de recouvrement — qui se comptait sur la PARCELLE ENTIÈRE — bloquait
 * toute installation partout, trouée comprise. Une hêtraie serrée atteint un
 * recouvrement de 6 à 16 pour un plafond de 2,5, et l'essai ne pouvait donc pas
 * éprouver la trouée dans une futaie vraiment dense, qui est pourtant le cas
 * intéressant. Il fallait même un garde-fou — une seconde espèce tolérante,
 * dont la présence prouvait qu'il y avait quelque chose à mesurer — parce que
 * sans lui un « zéro recrue sous couvert » aurait décroché le ✅ pour la
 * mauvaise raison.
 *
 * Le plafond est devenu LOCAL. Cette futaie-ci est plantée à TROIS mètres, elle
 * porte un recouvrement de 6,8 à 9,5, et elle n'a besoin d'aucun garde-fou :
 * son témoin fermé ne recrute rien parce qu'il est vraiment fermé, et sa
 * trouée recrute parce qu'elle est vraiment ouverte. C'est F7 sans détour.
 */
describe("une trouée dans un couvert VRAIMENT fermé", () => {
  /** Trois mètres : le recouvrement dépasse trois fois le plafond. */
  const SERRE = 3;
  const parties: { seed: number; trouee: Comptage; fermee: Comptage }[] = [];

  beforeAll(() => {
    for (const seed of GRAINES) {
      parties.push({
        seed,
        trouee: hetraie(seed, TROUEE, SERRE),
        fermee: hetraie(seed, null, SERRE),
      });
    }
  }, 600_000);

  it("le couvert fermé ne recrute RIEN, et l'ouverture recrute", () => {
    // Mesuré sur le code livré, recrues dans la zone (12,20) : 3 / 2 / 4 / 6 / 4
    // avec la trouée, contre 0 / 0 / 0 / 0 / 0 sans elle — et la parcelle
    // fermée entière n'en compte que 0 à 4. Aucun seuil n'est épinglé : ce qui
    // est affirmé, c'est un zéro d'un côté et un non-zéro de l'autre, sur les
    // cinq graines.
    for (const p of parties) {
      expect(p.fermee.trouee, `graine ${p.seed}`).toBe(0);
      expect(p.trouee.trouee, `graine ${p.seed}`).toBeGreaterThan(0);
    }
  });

  it("et le pionnier entre par là, alors qu'il n'entrait nulle part", () => {
    // Le bouleau exige 50 % de lumière : sous ce couvert-là, il n'a aucune
    // chance. Mesuré : 0 / 1 / 3 / 4 / 1 bouleaux dans la trouée. La direction
    // ne peut pas s'exiger graine par graine — une trouée de huit mètres dans
    // une futaie de quinze n'est pas toujours assez claire pour lui, et la
    // graine 1 n'en installe aucun — mais le total, lui, est sans ambiguïté.
    const dansLaTrouee = parties.reduce((s, p) => s + p.trouee.bouleauTrouee, 0);
    const sousCouvert = parties.reduce((s, p) => s + p.fermee.bouleauTrouee, 0);
    expect(sousCouvert).toBe(0);
    expect(dansLaTrouee).toBeGreaterThan(3);
  });
});
