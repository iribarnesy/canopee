/**
 * L'effet nurse (docs/regles.md §7.5, ch1-A) : sur la lande sèche et ventée,
 * un couvert d'ajoncs abrite ses voisins — moins de vent, moins de
 * rayonnement, donc moins de transpiration — mais leur dispute aussi l'eau.
 * Tout se joue à la **distance** : à bonne distance la facilitation l'emporte,
 * collé à la nurse c'est la compétition qui gagne.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, plantAt } from "../../src/engine/state";
import { LANDE_SECHE } from "../../src/engine/stations";
import { volumeTigeM3 } from "../../src/engine/trees";

const STATION = { ...LANDE_SECHE.station, coteM: 40, voisinage: [] };
const serie = serieMeteoPour("lande-seche");
if (!serie) throw new Error("série lande manquante");
const WEATHER = serieToWeeks(serie);

/**
 * Ce qu'a fait le sujet planté au centre, **moyenné** sur plusieurs graines. Une
 * seule ne suffit plus : depuis que chaque arbre porte sa vigueur propre
 * (trees.ts), comparer un individu à un individu revient à comparer deux
 * tirages. On neutralise la vigueur pour isoler l'abri, **et** on répète — parce
 * que le reste de la partie (semis du voisinage, ravageurs) tire lui aussi dans
 * le même générateur.
 *
 * **On mesure le volume, et ce choix est une correction.** Cet essai lisait la
 * hauteur, en la prenant pour de la vigueur. Depuis que l'ombre fait **filer** une
 * tige au lieu de la raboter (`trees.ts`, étiolement), les deux grandeurs se
 * sont séparées : le chêne-liège collé à sa nurse est le **plus haut** des trois
 * (0,80 m contre 0,76 à trois mètres) et le plus chétif de loin — 0,89 cm de
 * diamètre contre 2,66, soit huit fois moins de bois, et un H/D de 90 quand
 * celui de ses voisins vaut 29. C'est une perche d'ombre, pas un arbre qui
 * prospère. Le volume, lui, ne se laisse pas tromper : il dit la même chose
 * avant et après le lot.
 */
const GRAINES = [11, 29, 47, 1];
// **La graine 1 est ajoutée, et c'est dit** (#391, décision de l'utilisateur).
// Les comparaisons se font sur les paires que le feu épargne, et il en faut au
// moins deux par essence. À la fusion du mort sur pied (#432), les feux de la
// lande ont changé : sur 11, 29 et 47, il ne restait qu'une paire de pins. La
// règle, écrite avant de voir les graines : ajouter 1, 2, 3, ... dans l'ordre,
// s'arrêter à la première qui donne le compte, garder toutes celles ajoutées.
// La 1 suffit (liège et pin épargnés tous deux).

/** Le sujet de chaque graine, dans l'ordre de `GRAINES`. */
function parGraine(especeId: string, nurses: number, distanceM: number, years: number) {
  return GRAINES.map((g) => sujetUneGraine(especeId, nurses, distanceM, years, g));
}

function mesureApres(especeId: string, nurses: number, distanceM: number, years: number) {
  const mesures = parGraine(especeId, nurses, distanceM, years);
  const moyenne = (f: (m: (typeof mesures)[number]) => number) =>
    mesures.reduce((s, m) => s + f(m), 0) / mesures.length;
  return {
    hauteurM: moyenne((m) => m.hauteurM),
    volumeM3: moyenne((m) => m.volumeM3),
  };
}

/** Le volume de tige, la grandeur qui dit « pousse mieux » sans se tromper. */
function volumeApres(especeId: string, nurses: number, distanceM: number, years: number) {
  return mesureApres(especeId, nurses, distanceM, years).volumeM3;
}

function sujetUneGraine(
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
  // On **neutralise** la vigueur individuelle : cet essai isole l'effet nurse, et
  // il compare un arbre à un autre. Avec ±20 % de dispersion individuelle
  // (trees.ts), c'est le tirage qui déciderait, pas l'abri.
  state = {
    ...state,
    trees: state.trees.map((t) => ({ ...t, vigueurIndividuelle: 1 })),
  };
  let brule = false;
  for (let i = 0; i < years * 52; i++) {
    const w = WEATHER[i % WEATHER.length];
    if (!w) throw new Error("météo manquante");
    const r = advanceWeek(state, w, []);
    state = r.state;
    if (r.morts.some((m) => m.id === id && m.cause === "feu")) brule = true;
  }
  const sujet = state.trees.find((t) => t.id === id);
  if (!sujet?.alive) return { hauteurM: 0, volumeM3: 0, brule };
  return {
    hauteurM: sujet.heightM,
    volumeM3: volumeTigeM3(sujet.diametreCm, sujet.heightM),
    brule,
  };
}

/**
 * **Les paires que le feu épargne** (#391) : les graines où ni l'un ni l'autre
 * des deux sujets comparés n'est mort par le feu. L'ajonc est un combustible ;
 * un feu qui passe tue le sujet abrité ou le sujet à découvert selon où il
 * passe, et c'est alors lui, pas l'abri, qui décide de la comparaison. Le feu
 * est un vrai coût de la nurse ; ce n'est pas ce que ces essais mesurent.
 */
function epargnees<T extends { brule: boolean }>(a: readonly T[], b: readonly T[]) {
  return GRAINES.flatMap((_, k) => {
    const x = a[k];
    const y = b[k];
    return x && y && !x.brule && !y.brule ? [{ a: x, b: y }] : [];
  });
}

describe("effet nurse sur lande sèche et ventée", () => {
  const moyenne = (v: readonly { volumeM3: number }[]) =>
    v.reduce((s, m) => s + m.volumeM3, 0) / v.length;
  // Le chêne-liège tolère l'ombre en jeunesse : pour lui, l'abri est tout bénéfice.
  const liegesNus = parGraine("quercus_suber", 0, 0, 12);
  const liegesAbrites = parGraine("quercus_suber", 6, 3, 12);
  const liegesColles = parGraine("quercus_suber", 6, 1.2, 12);
  const liegeHauteurNu = liegesNus.reduce((s, m) => s + m.hauteurM, 0) / liegesNus.length;
  /** Abrité contre découvert, puis abrité contre collé, sur les seules paires épargnées. */
  const abriteNu = epargnees(liegesAbrites, liegesNus);
  const abriteColle = epargnees(liegesAbrites, liegesColles);
  // Le pin est franchement héliophile : trop près, l'ombre lui coûte plus que
  // l'abri ne lui rapporte.
  const pinsNus = parGraine("pinus_sylvestris", 0, 0, 12);
  const pinsAbrites = parGraine("pinus_sylvestris", 6, 3, 12);
  const pinAbrite = moyenne(pinsAbrites);
  const pinColle = volumeApres("pinus_sylvestris", 6, 1.2, 12);

  it("le chêne-liège, adapté au sable acide, s'installe même nu (mais végète)", () => {
    // Sans entretien, la strate herbacée lui dispute l'eau et l'azote : il
    // survit sur la lande, il n'y prospère pas.
    expect(liegeHauteurNu).toBeGreaterThan(0.35);
  });

  it("abrité à bonne distance, il pousse mieux qu'à découvert", () => {
    // Le vent lui coûte plus que l'ombre — mais à **bonne distance** seulement.
    //
    // **Sur les paires que le feu épargne** (#391, décision de l'utilisateur), le
    // critère déjà retenu pour le pin. À la fusion du mort sur pied (#432), le
    // feu de la graine 11 s'est mis à tuer le liège abrité, et la moyenne, qui
    // comptait ce brûlé pour zéro, faisait perdre l'abri (0,000389 contre
    // 0,000456 m³). Le seuil ne bouge pas : il en faut deux, et l'abrité doit
    // battre le découvert.
    expect(abriteNu.length).toBeGreaterThanOrEqual(2);
    expect(moyenne(abriteNu.map((p) => p.a))).toBeGreaterThan(moyenne(abriteNu.map((p) => p.b)));
  });

  it("même pour le sciaphile, il existe une bonne distance — et ce n'est pas zéro", () => {
    // **Attention** à ce test : son verdict a changé **trois fois**, et l'historique
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
    // Ce qui **survit** aux quatre versions, et qui est donc le vrai résultat :
    // abrité à bonne distance bat toujours découvert. L'optimum de distance
    // — assez près pour couper le vent, assez loin pour ne pas se disputer
    // l'eau — est le résultat classique de la littérature sur les plantes
    // nurses, et c'est celui que le moteur donne maintenant. La leçon de
    // méthode, elle, est que trois graines ne suffisent pas à rendre une
    // conclusion robuste si le mécanisme sous-jacent, lui, est faux.
    //
    // Version 4 — et celle-ci ne change pas le verdict, elle change la
    // **grandeur**. Depuis que l'ombre fait filer une tige (étiolement, #97), la
    // hauteur ne mesure plus la vigueur : le liège collé est le plus **haut** des
    // trois (0,80 m contre 0,76) et de loin le plus chétif — 0,025 dm³ de bois
    // contre 0,213, H/D 90 contre 29. L'essai lisait donc, sans le savoir, une
    // grandeur que le moteur venait de rendre ambiguë. Mesuré en volume, le
    // classement est le même **avant** et **après** le lot (0,040 puis 0,025 contre
    // 0,212 puis 0,213) : la conclusion écologique tient, c'est le thermomètre
    // qui était faux. Quatrième leçon du même essai, et la plus générale : une
    // conclusion n'est pas robuste tant qu'on n'a pas vérifié que sa **grandeur**
    // **de mesure** dit encore ce qu'on croit.
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
    // l'affaire : la bonne distance dépend du **tempérament**, et l'héliophile,
    // lui, paie l'ombre (essai suivant).
    //
    // (Depuis #391, les deux comparaisons se font sur les paires que le feu
    // épargne, comme pour le pin ; voir l'essai précédent.)
    expect(abriteColle.length).toBeGreaterThanOrEqual(2);
    expect(moyenne(abriteColle.map((p) => p.a))).toBeGreaterThan(
      moyenne(abriteColle.map((p) => p.b)),
    );
    expect(abriteNu.length).toBeGreaterThanOrEqual(2);
    expect(moyenne(abriteNu.map((p) => p.a))).toBeGreaterThan(moyenne(abriteNu.map((p) => p.b)));
  });

  it("l'héliophile, lui, paie l'ombre : collé à la nurse il fait moins bien qu'à distance", () => {
    expect(pinColle).toBeLessThan(pinAbrite);
  });

  it("à bonne distance, l'abri profite aux deux tempéraments", () => {
    // **Réécrit sur son critère** (#391) : on ne compare que les paires que le
    // feu épargne. L'ajonc est un combustible, et sur cette lande un feu passe
    // en douze ans sur certaines graines : il tue le sujet abrité ou le sujet à
    // découvert selon où il passe, et c'est lui, pas l'abri, qui décidait de
    // l'essai. Sur `main` avant #391, le pin à découvert de la graine 47 brûlait,
    // et l'essai passait grâce à cela ; depuis, c'est le pin abrité de la graine
    // 11. Sans feu, l'abri gagne dans les cinq paires des deux copies (0,00339
    // à 0,00349 m³ contre 0,00287). Le feu est un vrai coût de la nurse ; ce
    // n'est pas ce que l'essai mesure.
    //
    // À la fusion du mort sur pied (#432), un feu de plus passe sur la graine 47
    // et tue le pin à découvert : il ne restait que la paire de la graine 29. La
    // graine 1 a été ajoutée par la règle écrite à `GRAINES`.
    const paires = epargnees(pinsAbrites, pinsNus);
    // Il en faut au moins deux, sans quoi la comparaison redevient celle d'un
    // individu à un autre.
    expect(paires.length).toBeGreaterThanOrEqual(2);
    expect(moyenne(paires.map((p) => p.a))).toBeGreaterThan(moyenne(paires.map((p) => p.b)));
  });
});

describe("le brise-vent porte plus loin que l'ombre", () => {
  it("une nurse à 5 m protège encore, sans faire d'ombre", () => {
    // 8 ans : sur cette lande, un incendie finit par passer au-delà et
    // brouillerait la comparaison (cf. feu.test.ts).
    const nu = volumeApres("pinus_sylvestris", 0, 0, 8);
    const loin = volumeApres("pinus_sylvestris", 6, 5, 8);
    expect(loin).toBeGreaterThan(nu);
  });
});
