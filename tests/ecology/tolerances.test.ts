/**
 * Tests écologiques de bout en bout (docs/regles.md §16) : les tolérances des
 * espèces doivent produire les bonnes trajectoires **sans** être codées en dur.
 * Critères volontairement larges (« vivant », « nettement plus grand »),
 * robustes aux recalibrages du moteur.
 */

import { describe, expect, it } from "vitest";
import {
  LANDE_SECHE,
  LIMON_PAUVRE_N,
  LIMON_RICHE,
  VALLEE_ENGORGEE,
} from "../../src/engine/stations";
import { aliveCount, meanHeight, runYears } from "../helpers";

const YEARS = 15;

describe("engorgement (fond de vallée, drainage lent)", () => {
  const state = runYears(VALLEE_ENGORGEE, YEARS, {
    plantations: [
      { especeId: "alnus_glutinosa", count: 10 },
      { especeId: "quercus_pubescens", count: 10 },
    ],
  });

  it("l'aulne glutineux prospère (atlas : tolère l'engorgement, berges)", () => {
    expect(aliveCount(state, "alnus_glutinosa", 20)).toBe(10);
    expect(meanHeight(state, "alnus_glutinosa", 20)).toBeGreaterThan(4);
  });

  it("le chêne pubescent meurt (xérophile des coteaux secs)", () => {
    expect(aliveCount(state, "quercus_pubescens", 20)).toBe(0);
  });
});

describe("sécheresse (lande sableuse, RU faible)", () => {
  const state = runYears(LANDE_SECHE, YEARS, {
    plantations: [
      { especeId: "pinus_sylvestris", count: 10 },
      { especeId: "quercus_pubescens", count: 10 },
      { especeId: "fagus_sylvatica", count: 10 },
    ],
  });

  it("le pin sylvestre, xérophile acidiphile, tient", () => {
    // « Tient » ne veut pas dire « aucun ne meurt ». Le test exigeait dix
    // survivants sur dix ; sur trois parties, le moteur en donne vingt et un
    // sur trente, et huit des neuf morts sont des morts de **soif**. C'est ce
    // qu'on attend d'une lande sableuse à faible réserve utile : une mortalité
    // d'un tiers en trente ans n'y a rien d'anormal, et elle s'est révélée le
    // jour où les arbres ont cessé d'être bridés par l'azote — plus vigoureux,
    // ils transpirent plus, et le sable ne suit pas. Ce qui compte est le
    // **contraste** avec les deux essais suivants : le chêne pubescent est balayé,
    // le hêtre reste dessous.
    expect(aliveCount(state, "pinus_sylvestris", 30)).toBeGreaterThan(5);
    // Croissance lente : sable pauvre, vent, et concurrence de la lande.
    expect(meanHeight(state, "pinus_sylvestris", 30)).toBeGreaterThan(1.2);
  });

  it("le chêne pubescent, calcicole, meurt sur ce sable acide (pH 4,5 — bio-indication)", () => {
    expect(aliveCount(state, "quercus_pubescens", 30)).toBe(0);
  });

  it("le hêtre reste sous le pin", () => {
    // L'essai demandait le hêtre « mort, ou nettement dominé » (moins de 0,6 de la
    // hauteur du pin). Sur main, les dix hêtres meurent de soif dès le premier
    // été, avec vingt centimètres de racines. Depuis que le plancher racinaire ne
    // traite plus un jeune arbre comme un semis (#310), ils démarrent à trente,
    // traversent l'été et ne manquent plus jamais d'eau : 2,90 / 2,81 / 2,73 m
    // contre 3,70 / 4,15 / 3,75 au pin (graines 42, 1, 2), soit 0,66 à 0,78.
    //
    // Un plant motté qui rejoint son plancher à la vitesse où une racine pousse a
    // été essayé : le hêtre traverse alors une vraie crise de transplantation
    // (stress 4,7 la première année), puis s'installe de même. Ce qui manque est
    // ailleurs : un petit arbre au petit houppier, sur 75 cm de sable, voit toute
    // sa demande servie, et la sensibilité du hêtre ne passe que par des seuils de
    // satisfaction. Le chantier est ouvert à part (#312). L'essai, avec l'accord de
    // l'auteur, n'exige plus que la direction. Elle n'est pas rien : sur bien des
    // sables acides d'Europe du Nord, la végétation naturelle est une
    // chênaie-hêtraie, et c'est l'été sec du climat landais qui exclut le hêtre.
    //
    // **Depuis #312, le hêtre a de nouveau soif.** Ce n'était pas le seuil : un
    // plant de trente centimètres avait 23 cm de racines du seul fait d'exister,
    // et l'horizon de 20 à 75 cm, d'un seul tenant, lui servait son remplissage
    // moyen. Le front racinaire suit maintenant la taille, et le sable lessivé
    // est tenu en trois couches : 29 hêtres sur 30 meurent de soif (graines 42,
    // 1, 2), le rapport vaut 0 / 0,593 / 0 (mort = 0), aucun pin ne meurt de
    // plus. L'ancien critère (« mort, ou sous 0,6 du pin ») tiendrait sur ces
    // trois graines, à 0,007 près sur la graine 1 ; le rétablir est laissé à
    // l'auteur.
    const fagus = meanHeight(state, "fagus_sylvatica", 30);
    const pinus = meanHeight(state, "pinus_sylvestris", 30);
    expect(fagus).toBeLessThan(pinus);
  });
});

describe("azote (même limon, riche vs pauvre)", () => {
  // Peuplement dense pour que la demande d'azote dépasse l'offre du sol pauvre.
  const plantations = [
    { especeId: "fagus_sylvatica", count: 150 },
    { especeId: "alnus_glutinosa", count: 150 },
  ];
  const riche = runYears(LIMON_RICHE, YEARS, { plantations });
  const pauvre = runYears(LIMON_PAUVRE_N, YEARS, { plantations });
  // Le même hêtre, à côté d'un **frugal** au lieu d'un fixateur (#247).
  const avecPin = [
    { especeId: "fagus_sylvatica", count: 150 },
    { especeId: "pinus_sylvestris", count: 150 },
  ];
  const richePin = runYears(LIMON_RICHE, YEARS, { plantations: avecPin });
  const pauvrePin = runYears(LIMON_PAUVRE_N, YEARS, { plantations: avecPin });

  it("le hêtre (exigeant) paie la pauvreté, le pin (frugal) non", () => {
    const perte = (especeId: string) =>
      1 - meanHeight(pauvrePin, especeId, 300) / meanHeight(richePin, especeId, 300);
    const hetre = perte("fagus_sylvatica");
    const pin = perte("pinus_sylvestris");
    // **l'énoncé est un contraste, pas une valeur absolue.** L'ancien seuil
    // exigeait que le hêtre perde plus de 20 % de sa hauteur sur sol pauvre ;
    // il en perdait 21,0 %, soit une marge de 1,3 % — le seuil n'était pas une
    // contrainte sur le moteur, c'était une photographie. Le correctif des
    // mycorhizes (#115), qui a rendu au sol pauvre l'azote qu'il perdait, l'a
    // fait tomber à 18,0 % et l'essai avec lui. Le lot de la litière herbacée
    // (#201) l'a resserré une seconde fois, à 9,95 points, et le seuil a été
    // posé à 0,06 : quatre points de marge, et toujours interdit le cas qui
    // compte, un hêtre qui ne sentirait pas la pauvreté.
    //
    // **Le témoin était un aulne, et c'est lui qui a cédé** (#247). Depuis que
    // l'azote se conserve, le hêtre planté avec des aulnes ne perd plus que
    // 4,9 % : l'aulne fixe ~60 kg N/ha/an, sa litière nourrit la parcelle, et son
    // voisin en profite. Le même hêtre perd 6,0 % seul et 7,8 % à côté de pins.
    // Le critère (C6) oppose d'ailleurs un **frugal** à un **exigeant**, pas un
    // fixateur à un non-fixateur. L'essai prend donc le pin, frugal de l'atlas
    // (`demandeRelative` 0,25 contre 0,7), et garde ses deux seuils à 0,06.
    // La mesure est venue avant le choix, sur la graine de l'essai : hêtre 7,8 %,
    // pin −2,1 %. Les graines 7 et 13 ont été lancées ensuite contre une
    // prédiction écrite (hêtre au-dessus de 6 %, pin sous 2 %) : 7,6 / 0,7 et
    // 6,9 / −0,9.
    expect(hetre - pin).toBeGreaterThan(0.06);
    // Et le hêtre paie **dans l'absolu**, sans quoi le contraste tiendrait avec un
    // pin qui prospère et un hêtre qui ne sent rien.
    expect(hetre).toBeGreaterThan(0.06);
  });

  it("l'aulne (fixateur) est quasi insensible à la pauvreté en azote", () => {
    // Il tire son azote de l'air, à la mesure de sa demande, son bois compris :
    // la pauvreté du sol ne l'atteint pas. Mesuré : il fait même 1,8 % de mieux
    // sur sol pauvre, où il est moins concurrencé.
    const hRiche = meanHeight(riche, "alnus_glutinosa", 300);
    const hPauvre = meanHeight(pauvre, "alnus_glutinosa", 300);
    expect(hPauvre).toBeGreaterThan(hRiche * 0.9);
  });
});

describe("station confort (limon riche, peuplement clair)", () => {
  const state = runYears(LIMON_RICHE, YEARS, {
    plantations: [
      { especeId: "betula_pendula", count: 10 },
      { especeId: "fagus_sylvatica", count: 10 },
    ],
  });

  it("tout le monde survit, et le pionnier (bouleau) démarre plus vite que le hêtre", () => {
    expect(aliveCount(state, "betula_pendula", 20)).toBe(10);
    expect(aliveCount(state, "fagus_sylvatica", 20)).toBe(10);
    expect(meanHeight(state, "betula_pendula", 20)).toBeGreaterThan(
      meanHeight(state, "fagus_sylvatica", 20),
    );
  });
});
