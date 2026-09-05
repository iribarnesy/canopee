/**
 * L'effet nurse (docs/regles.md §7.5, ch1-A) : sur la lande sèche et ventée,
 * un couvert d'ajoncs abrite ses voisins — moins de vent, moins de
 * rayonnement, donc moins de transpiration — mais leur dispute aussi l'eau.
 * Tout se joue à la DISTANCE : à bonne distance la facilitation l'emporte,
 * collé à la nurse c'est la compétition qui gagne.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";

const STATION = { ...LANDE_SECHE.station, coteM: 40, voisinage: [] };
const serie = serieMeteoPour("lande-seche");
if (!serie) throw new Error("série lande manquante");
const WEATHER = serieToWeeks(serie);

/** Hauteur atteinte par un sujet planté au centre, entouré ou non d'ajoncs. */
/**
 * Hauteur atteinte, MOYENNÉE sur plusieurs graines. Une seule ne suffit plus :
 * depuis que chaque arbre porte sa vigueur propre (trees.ts), comparer un
 * individu à un individu revient à comparer deux tirages. On neutralise la
 * vigueur pour isoler l'abri, ET on répète — parce que le reste de la partie
 * (semis du voisinage, ravageurs) tire lui aussi dans le même générateur.
 */
function hauteurApres(especeId: string, nurses: number, distanceM: number, years: number) {
  const graines = [11, 29, 47];
  const mesures = graines.map((g) => hauteurUneGraine(especeId, nurses, distanceM, years, g));
  return mesures.reduce((a, b) => a + b, 0) / mesures.length;
}

function hauteurUneGraine(
  especeId: string,
  nurses: number,
  distanceM: number,
  years: number,
  graine: number,
) {
  let state = createGameState(STATION, rngStateFromSeed(graine));
  for (let a = 0; a < nurses; a++) {
    const angle = (2 * Math.PI * a) / Math.max(1, nurses);
    state = plantAt(
      state,
      "ulex_europaeus",
      20 + distanceM * Math.cos(angle),
      20 + distanceM * Math.sin(angle),
      2.2, // ajoncs déjà installés (une lande, quoi)
    );
  }
  state = plantAt(state, especeId, 20, 20, 0.3);
  const id = state.nextTreeId - 1;
  // On NEUTRALISE la vigueur individuelle : cet essai isole l'effet nurse, et
  // il compare un arbre à un autre. Avec ±20 % de dispersion individuelle
  // (trees.ts), c'est le tirage qui déciderait, pas l'abri.
  state = {
    ...state,
    trees: state.trees.map((t) => ({ ...t, vigueurIndividuelle: 1 })),
  };
  for (let i = 0; i < years * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    state = advanceWeek(state, w, []).state;
  }
  const sujet = state.trees.find((t) => t.id === id);
  return sujet?.alive ? sujet.heightM : 0;
}

describe("effet nurse sur lande sèche et ventée", () => {
  // Le chêne-liège tolère l'ombre en jeunesse : pour lui, l'abri est tout bénéfice.
  const liegeNu = hauteurApres("quercus_suber", 0, 0, 12);
  const liegeAbrite = hauteurApres("quercus_suber", 6, 3, 12);
  const liegeColle = hauteurApres("quercus_suber", 6, 1.2, 12);
  // Le pin est franchement héliophile : trop près, l'ombre lui coûte plus que
  // l'abri ne lui rapporte.
  const pinNu = hauteurApres("pinus_sylvestris", 0, 0, 12);
  const pinAbrite = hauteurApres("pinus_sylvestris", 6, 3, 12);
  const pinColle = hauteurApres("pinus_sylvestris", 6, 1.2, 12);

  it("le chêne-liège, adapté au sable acide, s'installe même nu (mais végète)", () => {
    // Sans entretien, la strate herbacée lui dispute l'eau et l'azote : il
    // survit sur la lande, il n'y prospère pas.
    expect(liegeNu).toBeGreaterThan(0.35);
  });

  it("abrité à bonne distance, il pousse mieux qu'à découvert", () => {
    // Le vent lui coûte plus que l'ombre — mais à BONNE DISTANCE seulement.
    expect(liegeAbrite).toBeGreaterThan(liegeNu);
  });

  it("même pour le sciaphile, il existe une bonne distance — et ce n'est pas zéro", () => {
    // ATTENTION à ce test : son verdict a changé DEUX FOIS, et l'historique
    // vaut plus que la conclusion du jour.
    //
    // Version 1 — « l'abri et l'ombre s'annulent » : on mesurait 0,38 m collé
    // contre 0,39 m à découvert. C'était l'égalité de deux zéros, l'azote
    // bridant tout le monde autour de 0,4 ; rien ne poussait, donc rien ne se
    // distinguait.
    //
    // Version 2 — « plus c'est près, mieux c'est » : une fois le besoin
    // d'azote ramené à un budget réel, on lisait 0,53 collé / 0,44 à trois
    // mètres / 0,37 à découvert.
    //
    // Version 3, celle-ci — le frein d'extraction est passé à une saturation
    // de Michaelis-Menten (`DEMI_SATURATION_G_M2`, nitrogen.ts) et l'ordre
    // s'inverse à nouveau : 0,78 à trois mètres contre 0,58 collé. Quand
    // l'azote cesse d'être le facteur qui décide de tout, la concurrence pour
    // l'eau et la lumière reprend la main, et se coller à sa nurse se paie.
    //
    // Ce qui SURVIT aux trois versions, et qui est donc le vrai résultat :
    // abrité à bonne distance bat toujours découvert. L'optimum de distance
    // — assez près pour couper le vent, assez loin pour ne pas se disputer
    // l'eau — est le résultat classique de la littérature sur les plantes
    // nurses, et c'est celui que le moteur donne maintenant. La leçon de
    // méthode, elle, est que trois graines ne suffisent pas à rendre une
    // conclusion robuste si le mécanisme sous-jacent, lui, est faux.
    //
    // (Trace de la version 2 :) Le verdict a changé avec la recalibration de l'azote
    // (`AZOTE_HOUPPIER_G_M2_AN`, trees.ts). Tant que l'azote bridait tout le
    // monde autour de 0,4, aucun des trois traitements ne poussait vraiment :
    // on mesurait 0,38 m collé contre 0,39 m à découvert et on en concluait
    // que l'abri et l'ombre s'annulaient. C'était l'égalité de deux zéros.
    // Une fois l'azote rendu à un budget réaliste, l'essai mesure enfin ce
    // qu'il prétendait mesurer, et il retrouve ce que l'en-tête de ce fichier
    // annonçait depuis toujours : « le chêne-liège tolère l'ombre en jeunesse,
    // pour lui l'abri est tout bénéfice ». Sur une lande sèche et ventée, plus
    // il est près de la nurse, mieux il pousse — 0,53 m collé, 0,44 m à trois
    // mètres, 0,37 m à découvert. Ce qui n'a pas bougé, et qui est le fond de
    // l'affaire : la bonne distance dépend du TEMPÉRAMENT, et l'héliophile,
    // lui, paie l'ombre (essai suivant).
    expect(liegeAbrite).toBeGreaterThan(liegeColle);
    expect(liegeAbrite).toBeGreaterThan(liegeNu);
  });

  it("l'héliophile, lui, paie l'ombre : collé à la nurse il fait moins bien qu'à distance", () => {
    expect(pinColle).toBeLessThan(pinAbrite);
  });

  it("à bonne distance, l'abri profite aux deux tempéraments", () => {
    expect(pinAbrite).toBeGreaterThan(pinNu);
  });
});

describe("le brise-vent porte plus loin que l'ombre", () => {
  it("une nurse à 5 m protège encore, sans faire d'ombre", () => {
    // 8 ans : sur cette lande, un incendie finit par passer au-delà et
    // brouillerait la comparaison (cf. feu.test.ts).
    const nu = hauteurApres("pinus_sylvestris", 0, 0, 8);
    const loin = hauteurApres("pinus_sylvestris", 6, 5, 8);
    expect(loin).toBeGreaterThan(nu);
  });
});
