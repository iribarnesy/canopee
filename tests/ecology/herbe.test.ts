/**
 * La strate herbacée (critères B8 et E9, ch4-B, ch7).
 * Ce qu'elle doit produire, et qu'un sol nu ne produisait pas :
 *  - elle colonise d'elle-même un terrain découvert ;
 *  - elle dispute l'eau et l'azote aux jeunes plants — la première cause
 *    d'échec des plantations, d'autant plus forte que le sol est pauvre ;
 *  - la faucher sauve la plantation ;
 *  - elle disparaît sous un couvert fermé.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import type { GameAction } from "../../src/engine/actions";
import { advanceWeek } from "../../src/engine/game";
import { capaciteHerbacee, facteurEauHerbacee, HERBACEES } from "../../src/engine/herbacees";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt, type Station } from "../../src/engine/state";
import type { StationClimat } from "../../src/engine/stations";
import { LANDE_SECHE, LIMON_RICHE } from "../../src/engine/stations";

function simuler(
  sc: StationClimat,
  especeId: string,
  actions: GameAction[],
  ans: number,
  stationOverride: Partial<Station> = {},
) {
  const station: Station = { ...sc.station, coteM: 30, voisinage: [], ...stationOverride };
  const serie = serieMeteoPour(sc.station.id);
  if (!serie) throw new Error("série manquante");
  const weather = serieToWeeks(serie);
  let state = createGameState(station, rngStateFromSeed(3));
  state = plantAt(state, especeId, 15, 15, 0.3);
  // **LE PLANT PORTE UN MANCHON, ET DANS TOUS LES BRAS** (#184). Depuis que la
  // fauche emporte les tiges ligneuses qu'elle atteint, un plant de trente
  // centimètres part avec l'herbe : c'est le fait, un gyrobroyeur ne trie pas.
  // Ce qui distingue un dégagement d'une fauche de prairie est qu'on a protégé
  // ce qu'on veut garder. La protection est posée dans TOUS les bras, fauchés
  // ou non — sans quoi le témoin ne différerait plus par la seule fauche.
  const protection: GameAction = { type: "proteger", week: 0, treeIds: [1] };
  let couvertureFinale = 0;
  for (let i = 0; i < ans * 52; i++) {
    const w = weather[i % weather.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, [protection, ...actions]);
    state = r.state;
    couvertureFinale = r.fluxes.herbeCouvertureMean;
  }
  const arbre = state.trees.find((t) => t.id === 1);
  return { hauteur: arbre?.alive ? arbre.heightM : 0, couverture: couvertureFinale };
}

/** Fauche deux fois par an pendant `ans` années, autour du plant. */
function fauches(ans: number): GameAction[] {
  const actions: GameAction[] = [];
  for (let an = 0; an < ans; an++) {
    for (const decalage of [16, 26]) {
      actions.push({ type: "faucher", week: an * 52 + decalage, x: 15, y: 15, rayonM: 2.5 });
    }
  }
  return actions;
}

describe("dynamique du tapis herbacé", () => {
  it("une parcelle ouverte s'enherbe d'elle-même", () => {
    const { couverture } = simuler(LIMON_RICHE, "betula_pendula", [], 3, { herbeInitiale: 0 });
    expect(couverture).toBeGreaterThan(0.5);
  });

  it("sous un couvert fermé, les graminées disparaissent", () => {
    // Le seuil de lumière n'est plus unique : c'est le point de compensation de
    // chaque espèce (herbacees.ts). Les deux graminées lâchent sous 12-15 % de
    // la pleine lumière ; ce qui tient plus bas est de la plante d'ombre, et
    // c'est le sujet de `herbacees.test.ts`.
    const graminees = HERBACEES.filter((h) => h.lumiere.compensation >= 0.1);
    expect(graminees.length).toBeGreaterThan(0);
    for (const h of graminees) {
      expect(capaciteHerbacee(h, 0.05, 6)).toBe(0);
    }
    // À 60 % de lumière, au moins une espèce couvre presque tout, quel que soit
    // le pH : c'est ce qui fait qu'une trouée s'enherbe.
    for (const ph of [4.5, 6, 7.5]) {
      const meilleure = Math.max(...HERBACEES.map((h) => capaciteHerbacee(h, 0.6, ph)));
      expect(meilleure).toBeGreaterThan(0.8);
    }
  });

  it("elle recule quand le sol de surface s'assèche (l'herbe grille la première)", () => {
    // La sécheresse joue sur ce qui est VERT, pas sur l'emprise (herbacees.ts) :
    // c'est le feuillage qui grille, la souche reste.
    for (const h of HERBACEES) {
      expect(facteurEauHerbacee(h, 0.1)).toBeLessThan(facteurEauHerbacee(h, 1));
    }
  });
});

describe("concurrence herbacée sur les jeunes plants", () => {
  // **CE BANC MESURAIT UN BOGUE, ET IL A FALLU #201 POUR LE VOIR.**
  //
  // Il affirmait « faucher fait NETTEMENT mieux pousser un plant sur sol
  // pauvre », +30,0 % mesurés contre +20 % exigés, et il avait déjà été réécrit
  // une fois pour cesser d'épingler son propre chiffre à six millièmes près.
  // L'énoncé est vrai sur le terrain — l'entretien du pied est le premier
  // facteur de réussite d'une plantation. Le moteur, lui, le produisait pour
  // une autre raison que la bonne.
  //
  // `applyFaucher` versait au sol `coupe * 4` grammes d'azote et `* 25` de
  // carbone, **sans que rien ne les retire de nulle part** : la strate
  // herbacée n'était ni au bilan carbone ni au bilan azote, et aucune propriété
  // de conservation n'exerçait cette action. Faucher FABRIQUAIT de l'engrais et
  // le versait au pied du plant.
  //
  // #201 a retiré cette création. Attribution faite avec le retour de litière
  // de la strate désactivé, pour séparer les deux moitiés du lot :
  //
  //     +30,0 %   avant #201
  //      +1,9 %   dépôt de fauche retiré, retour de la strate désactivé
  //      +1,3 %   lot complet
  //
  // **Vingt-huit des trente points venaient de l'engrais fantôme.** Ce qui
  // reste — un à deux points — est la concurrence réellement libérée par la
  // coupe, sur quatre ans de fauche relevés à douze ans, donc avec un tapis qui
  // a eu huit ans pour revenir.
  //
  // On n'abaisse donc pas le seuil de 1,2 à 1,01 : **l'affirmation se retire.**
  // Un seuil ajusté sur deux points n'enregistrerait que l'état du jour, et
  // surtout il ferait croire que le moteur tient un fait qu'il ne tient plus.
  // Ce qui reste vérifiable est en dessous, et une issue porte le manque :
  // la concurrence herbacée de ce moteur est trop faible (#210).
  const gain = (sc: StationClimat, especeId: string) => {
    const sans = simuler(sc, especeId, [], 12);
    const avec = simuler(sc, especeId, fauches(4), 12);
    return { rapport: avec.hauteur / sans.hauteur, sans: sans.hauteur };
  };
  // **LE BANC FAISAIT VARIER DEUX CHOSES À LA FOIS** (#210). Le bras « pauvre »
  // était un PIN sur lande, le bras « riche » un BOULEAU sur limon : leur
  // différence portait donc la station ET l'espèce, alors que l'essai ne
  // prétend parler que de la station. Mesuré en carré complet, rapport
  // fauché/non fauché à douze ans :
  //
  //                       pin      bouleau    couverture herbacée
  //     pauvre (lande)   1,0207    1,0132           0,223
  //     riche  (limon)   1,0003    0,9988           0,963
  //
  // La station pèse environ deux points, l'espèce sept dixièmes : le contraste
  // était majoritairement le bon, mais **un tiers du signal venait de l'espèce**
  // — sur un signal qui ne fait déjà que deux points, ce n'est pas une nuance.
  // L'espèce est donc fixée, et c'est le pin qui reste, parce qu'il vit sur les
  // deux stations et que le bouleau n'a rien à faire sur une lande sèche.
  //
  // Ce qui VARIE ENCORE entre les deux bras, et qu'on ne peut pas fixer : la
  // couverture herbacée, 0,22 contre 0,96. Mais c'est une CONSÉQUENCE de la
  // station, pas un facteur indépendant — une lande sèche porte peu d'herbe,
  // c'est ce qu'être une lande sèche veut dire. Le noter tout de même, parce
  // qu'il explique la moitié du résultat : il y a peu à faucher sur la lande.
  const pauvre = gain(LANDE_SECHE, "pinus_sylvestris");
  const riche = gain(LIMON_RICHE, "pinus_sylvestris");

  it("faucher ne NUIT pas, et le sens reste le bon sur sol pauvre", () => {
    // Le signe, et rien de plus : retirer un concurrent ne coûte jamais au
    // plant. C'est tout ce que le moteur soutient aujourd'hui.
    expect(pauvre.rapport).toBeGreaterThan(1);
  });

  it("sur sol riche, l'entretien ne rapporte rien — et ça, c'est toujours vrai", () => {
    // Celui-ci n'a pas bougé et il n'avait pas à bouger : sur un sol qui ne
    // manque de rien, ce que l'herbe prend ne manque à personne. C'est la
    // moitié du contraste qui survit intacte, parce qu'elle ne reposait sur
    // aucun apport fantôme.
    expect(riche.rapport).toBeLessThan(1.1);
    // Et l'arbre a bien poussé : 2,54 m à douze ans pour le pin sur limon
    // riche, contre 1,67 sur la lande. Ce n'est pas un témoin mort.
    expect(riche.sans).toBeGreaterThan(2);
    expect(riche.sans).toBeGreaterThan(pauvre.sans);
  });

  it("le contraste pauvre/riche garde son sens, mais il ne fait plus que deux points", () => {
    // **L'ÉCART ÉTAIT LA PROPRIÉTÉ, et il l'est resté — c'est son AMPLITUDE qui
    // était fausse.** Trente points mesurés, vingt exigés ; il en reste deux.
    // Le sol pauvre décide encore, le sol riche ne décide toujours pas, mais un
    // gestionnaire qui lirait ce moteur conclurait que l'entretien du pied est
    // accessoire — et ce serait faux.
    expect(pauvre.rapport - riche.rapport).toBeGreaterThan(0);
    // Et on épingle le PLAFOND plutôt que le plancher, ce qui est l'inverse de
    // ce que ce banc faisait : tant que l'écart reste sous dix points, le
    // moteur n'a pas retrouvé le fait, et l'issue reste ouverte. Le jour où il
    // le dépassera, cette ligne tombera — et ce sera la bonne nouvelle.
    expect(pauvre.rapport - riche.rapport).toBeLessThan(0.1);
  });
});

describe("stabilité du tapis (pas d'oscillation artificielle)", () => {
  it("une zone fauchée rejoint le niveau général et n'y ré-oscille plus", () => {
    const station: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [] };
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(3));
    const actions: GameAction[] = [{ type: "faucher", week: 3 * 52 + 20, x: 10, y: 10, rayonM: 4 }];
    const ecarts: number[] = [];
    for (let i = 0; i < 6 * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, actions).state;
      // Après un an de reprise, la zone fauchée ne doit plus se distinguer.
      if (i > 4 * 52 + 20) {
        const fauchee = state.soil.herbeCouverture[10 * 30 + 10] ?? 0;
        const temoin = state.soil.herbeCouverture[25 * 30 + 25] ?? 0;
        ecarts.push(Math.abs(fauchee - temoin));
      }
    }
    expect(Math.max(...ecarts)).toBeLessThan(0.25);
  });

  it("la couverture ne fait pas le yo-yo d'une semaine sur l'autre", () => {
    // Le tapis ne doit changer de sens qu'au rythme des saisons : il recule en
    // été, repart à l'automne. S'il inverse toutes les deux ou trois semaines,
    // c'est qu'il réagit à sa propre consommation — c'est ce qui se voyait à
    // l'écran sous forme de cercles de fauche clignotants.
    const station: Station = { ...LIMON_RICHE.station, coteM: 30, voisinage: [] };
    const serie = serieMeteoPour("limon-riche");
    if (!serie) throw new Error("série manquante");
    const weather = serieToWeeks(serie);
    let state = createGameState(station, rngStateFromSeed(3));
    const actions: GameAction[] = [{ type: "faucher", week: 3 * 52 + 20, x: 10, y: 10, rayonM: 4 }];
    const fauchee: number[] = [];
    const temoin: number[] = [];
    for (let i = 0; i < 6 * 52; i++) {
      const w = weather[i % weather.length];
      if (!w) throw new Error("météo manquante");
      state = advanceWeek(state, w, actions).state;
      // On observe à partir d'un mois après la fauche : la repousse elle-même
      // est un mouvement légitime.
      if (i > 3 * 52 + 24) {
        fauchee.push(state.soil.herbeCouverture[10 * 30 + 10] ?? 0);
        temoin.push(state.soil.herbeCouverture[25 * 30 + 25] ?? 0);
      }
    }
    /**
     * Inversions de sens VISIBLES : on ignore les variations sous 2 % de
     * couverture (le gibier prélève un peu d'herbe chaque semaine, ce qui
     * dentelle la courbe sans que rien ne se voie à l'écran). Ce qu'on
     * traque, c'est l'alternance ample, celle qui faisait clignoter.
     */
    const inversionsVisibles = (serieCouverture: readonly number[]): number => {
      let n = 0;
      let sens = 0;
      for (let i = 1; i < serieCouverture.length; i++) {
        const delta = (serieCouverture[i] ?? 0) - (serieCouverture[i - 1] ?? 0);
        const sg = Math.sign(delta);
        if (sg !== 0 && sens !== 0 && sg !== sens && Math.abs(delta) > 0.02) n++;
        if (sg !== 0) sens = sg;
      }
      return n;
    };
    // 2,5 ans d'observation, soit une dizaine de saisons : au plus une
    // inversion ample par saison. Sans mémoire hydrique on en comptait 22 et
    // 30 ; avec, 4 et 9 — le rythme des saisons, pas celui des semaines.
    expect(inversionsVisibles(fauchee)).toBeLessThan(14);
    expect(inversionsVisibles(temoin)).toBeLessThan(14);
  });
});
