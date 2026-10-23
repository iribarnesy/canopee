/**
 * La strate herbacée (critères B8 et E9, ch4-B, ch7).
 * Ce qu'elle doit produire, et qu'un sol nu ne produisait pas :
 *  - elle colonise d'elle-même un terrain découvert ;
 *  - elle dispute l'eau et l'azote aux jeunes plants — la première cause
 *    d'échec des plantations, d'autant plus forte que le sol est pauvre ;
 *  - la faucher ne libère pas le plant, seuls le désherbage et le paillage le
 *    font (Davies 1985) ;
 *  - elle disparaît sous un couvert fermé.
 * Le moteur s'en est rapproché sans les atteindre (#210, #391) : l'herbe prend
 * maintenant de l'eau au plant, mais la fauche y rapporte encore sur sol riche,
 * et le désherbage y reste sous ce que le terrain mesure.
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
  // **le plant porte un manchon, et dans tous les bras** (#184). Depuis que la
  // fauche emporte les tiges ligneuses qu'elle atteint, un plant de trente
  // centimètres part avec l'herbe : c'est le fait, un gyrobroyeur ne trie pas.
  // Ce qui distingue un dégagement d'une fauche de prairie est qu'on a protégé
  // ce qu'on veut garder. La protection est posée dans **tous** les bras, fauchés
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
    // La sécheresse joue sur ce qui est **vert**, pas sur l'emprise (herbacees.ts) :
    // c'est le feuillage qui grille, la souche reste.
    for (const h of HERBACEES) {
      expect(facteurEauHerbacee(h, 0.1)).toBeLessThan(facteurEauHerbacee(h, 1));
    }
  });
});

describe("concurrence herbacée sur les jeunes plants", () => {
  // **ce banc mesurait un bogue, et il a fallu #201 pour le voir.**
  //
  // Il affirmait « faucher fait **nettement** mieux pousser un plant sur sol
  // pauvre », +30,0 % mesurés contre +20 % exigés, et il avait déjà été réécrit
  // une fois pour cesser d'épingler son propre chiffre à six millièmes près.
  // L'énoncé est vrai sur le terrain — l'entretien du pied est le premier
  // facteur de réussite d'une plantation. Le moteur, lui, le produisait pour
  // une autre raison que la bonne.
  //
  // `applyFaucher` versait au sol `coupe * 4` grammes d'azote et `* 25` de
  // carbone, **sans que rien ne les retire de nulle part** : la strate
  // herbacée n'était ni au bilan carbone ni au bilan azote, et aucune propriété
  // de conservation n'exerçait cette action. Faucher **fabriquait** de l'engrais et
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
  // **le banc faisait varier deux choses à la fois** (#210). Le bras « pauvre »
  // était un **pin** sur lande, le bras « riche » un **bouleau** sur limon : leur
  // différence portait donc la station **et** l'espèce, alors que l'essai ne
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
  // Ce qui **varie encore** entre les deux bras, et qu'on ne peut pas fixer : la
  // couverture herbacée, 0,22 contre 0,96. Mais c'est une **conséquence** de la
  // station, pas un facteur indépendant — une lande sèche porte peu d'herbe,
  // c'est ce qu'être une lande sèche veut dire. Le noter tout de même, parce
  // qu'il explique la moitié du résultat : il y a peu à faucher sur la lande.
  const pauvre = gain(LANDE_SECHE, "pinus_sylvestris");
  const riche = gain(LIMON_RICHE, "pinus_sylvestris");

  it("faucher n'est pas désherber : sur la lande sèche, la fauche ne libère pas le plant", () => {
    // **L'essai disait « faucher ne nuit pas », et la fauche coûte maintenant
    // 11 % au pin sur la lande** (8 % depuis #247, 11 % depuis #310). Le sens est
    // celui du terrain. La cause ne l'est pas : ce commentaire l'attribuait à
    // l'eau, et c'est le **phosphore** (#210).
    //
    // Relevé sur ce banc même, graines 3, 7 et 11, par une copie instrumentée du
    // moteur qui lit chaque semaine les facteurs de la loi du minimum du pin sans
    // changer aucun calcul. Semaines 13 à 43 des quatre années de fauche :
    //
    //                              sans fauche   fauché
    //     phosphore                   0,59        0,50
    //     eau (facteur)               0,94        0,93
    //     satisfaction hydrique       0,65        0,61
    //     azote                    0,95-0,97   0,98-0,99
    //
    // Le phosphore est le facteur limitant de 104 semaines sur 124 dans les deux
    // bras, l'eau de 11 à 12, le pH de 8 à 9. Le pin fauché a un peu moins d'eau,
    // mais son facteur eau ne bouge presque pas. L'écart de phosphore, lui, dure
    // après la dernière coupe (0,54 contre 0,50 de la cinquième à la douzième
    // année). Les variantes, rapport fauché sur non fauché à douze ans :
    //
    //                                          graine 3   graine 7   graine 11
    //     moteur                                0,887      0,890      0,891
    //     eau retirée du minimum du pin         0,888      0,891      0,893
    //     azote retiré du minimum               0,886      0,890      0,888
    //     phosphore retiré du minimum           0,997      0,999      0,998
    //     la strate ne prend plus de phosphore  0,980      0,978      0,982
    //
    // La strate prélève du phosphore avec l'azote qu'elle absorbe, et ne le rend
    // qu'au rythme où l'humus de sa litière se minéralise. Privée de ce
    // prélèvement, l'écart de phosphore entre les bras tombe de 0,09 à 0,02 :
    // neuf des onze points de la perte viennent de là, les deux autres de cet
    // écart résiduel, non attribué. Ce bilan se traite avec celui du potassium
    // (#222).
    //
    // **Le terrain, lui, l'attribue à l'eau** : couper l'herbe ne retire pas le
    // concurrent, elle repousse, garde son système racinaire et transpire
    // davantage ; la fauche n'améliore pas la reprise et peut la dégrader, seuls
    // le désherbage chimique et le paillage la libèrent (Davies 1985,
    // *Forestry* 58 : 167 ; Davies et Gardiner 1989, *Arboriculture Research
    // Note* 59/89/ARB ; Willoughby et al. 2009, *Reducing pesticide use in
    // forestry*). Le moteur n'a ni l'un ni l'autre comme geste (#392). Depuis que
    // la strate boit ce qu'un tapis fermé boit (#391), elle prend de l'eau au
    // plant ; sur ce banc, le rapport ne bouge presque pas (0,893 / 0,898 / 0,893,
    // graines 3, 7, 11) : sur la lande, c'est toujours le phosphore.
    expect(pauvre.rapport).toBeLessThan(1.05);
  });

  it("sur sol riche, l'entretien ne rapporte rien — et ça, c'est toujours vrai", () => {
    // Celui-ci n'a pas bougé et il n'avait pas à bouger : sur un sol qui ne
    // manque de rien, ce que l'herbe prend ne manque à personne. C'est la
    // moitié du contraste qui survit intacte, parce qu'elle ne reposait sur
    // aucun apport fantôme. Relevé sur ce banc (#210) : sur le limon, le pin ne
    // manque ni d'eau, ni d'azote, ni de phosphore, seul le pH le freine (0,77 à
    // 0,80), et la fauche rend 1,001 sur les graines 3, 7 et 11.
    expect(riche.rapport).toBeLessThan(1.1);
    // Et l'arbre a bien poussé : 3,11 m à douze ans pour le pin sur limon
    // riche, contre 2,63 sur la lande (graine 3, relevé de #210). Ce n'est pas
    // un témoin mort.
    expect(riche.sans).toBeGreaterThan(2);
    expect(riche.sans).toBeGreaterThan(pauvre.sans);
  });

  it("la fauche coûte sur sol pauvre, pas sur un sol qui ne manque de rien", () => {
    // **Le sens que cet essai gardait s'est retourné** (#247) : la fauche ne
    // libérait le plant sur sol pauvre que par un gain d'azote. Il gardait
    // ensuite un plafond de dix points entre les deux sols, relevé sur le moteur
    // et sans source ; il est tombé à #310, le lot où l'herbe a puisé son eau dans
    // tout son enracinement : 0,888 et 0,889 sur la lande (graines 3 et 7) contre
    // 1,001 sur le limon. Le plafond est retiré. Ce que dit le terrain est la
    // direction : faucher une graminée accroît sa transpiration et renforce la
    // concurrence pour l'eau (Davies et Gardiner 1989, *Arboriculture Research
    // Note* 59/89/ARB). Prédit avant la mesure sur une graine neuve : lande sous
    // limon, lande entre 0,85 et 0,95. Relevé graine 11 : 0,894 contre 1,001.
    //
    // **Le moteur trouve cette direction par le phosphore, pas par l'eau** (#210,
    // relevé détaillé à l'essai « faucher n'est pas désherber ») : retirer l'eau
    // du minimum du pin ne change pas le rapport, retirer le phosphore le ramène
    // à 1. Le sens est juste, la cause ne l'est pas. Ce qui reste ouvert est ce
    // que l'herbe prend en eau à un jeune plant, et la reprise d'un plant
    // **désherbé**, que le moteur n'a pas de geste pour mesurer.
    expect(pauvre.rapport).toBeLessThan(riche.rapport);
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
     * Inversions de sens **visibles** : on ignore les variations sous 2 % de
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
