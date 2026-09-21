/**
 * LA CARIE DU TRONC (issue #182).
 *
 * Après le bloc tempêtes, le moteur tenait l'élancement, l'espacement,
 * l'ancrage, le sol gorgé, la prise au vent, la densité du bois, la naïveté
 * d'après-ouverture et la blessure de houppier — et traitait tous ses arbres
 * comme SAINS. Or une part importante des arbres qu'une tempête casse étaient
 * déjà pourris ; c'est même la raison pour laquelle ils cassent au lieu de
 * verser.
 *
 * Ce fichier vérifie surtout une chose, et c'est celle qu'on n'a pas écrite :
 * un tronc creux est un TUBE, donc sa résistance va comme `1 − p⁴`, donc un
 * arbre creux à la moitié de son rayon ne perd presque rien.
 */

import { describe, expect, it } from "vitest";
import { serieMeteoPour } from "../../src/data/meteo";
import { getEspece } from "../../src/engine/especes";
import { advanceWeek } from "../../src/engine/game";
import { serieToWeeks } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import {
  createGameState,
  type GameState,
  plantScattered,
  type Station,
} from "../../src/engine/state";
import { LIMON_RICHE } from "../../src/engine/stations";
import {
  CARIE_INITIALE,
  facteurCarie,
  facteurCarieAncrage,
  PROGRESSION_CARIE_PAR_AN,
  prochaineCarie,
} from "../../src/engine/tempete";

describe("un tronc creux est un TUBE, et c'est tout le lot", () => {
  it("creux à la MOITIÉ de son rayon, il ne perd presque rien", () => {
    // Le fait le plus contre-intuitif de l'arboriculture, et celui qui fait
    // qu'un vieux chêne creux tient des siècles. Il n'est écrit nulle part :
    // il tombe de la puissance quatre du module de section d'un tube.
    expect(facteurCarie(0)).toBe(1);
    expect(facteurCarie(0.5)).toBeGreaterThan(0.95);
    // Et la règle du t/R : on ne s'inquiète qu'en dessous d'une paroi saine du
    // tiers du rayon. À ce seuil-là, la perte est encore d'un dixième.
    expect(facteurCarie(2 / 3)).toBeGreaterThan(0.85);
    expect(facteurCarie(2 / 3)).toBeLessThan(0.95);
    // C'est au-delà que ça s'effondre, et vite.
    expect(facteurCarie(0.9)).toBeLessThan(0.65);
    expect(facteurCarie(0.95)).toBeLessThan(0.5);
  });

  it("elle mange le FÛT plus que la motte", () => {
    // Deux versants d'un même champignon : la carie du tronc ronge la section,
    // celle du pied ronge les contreforts. La première va en p⁴, la seconde
    // est linéaire et bornée — la motte tient encore par le reste du système.
    expect(facteurCarie(0.9)).toBeLessThan(facteurCarieAncrage(0.9));
    expect(facteurCarieAncrage(1)).toBeGreaterThan(0.6);
    expect(facteurCarieAncrage(0)).toBe(1);
  });

  it("elle ne guérit JAMAIS, et c'est ce qui la distingue d'une plaie", () => {
    // Un houppier arraché repousse ; une colonne de carie ne fait que monter.
    let p = 0;
    p = prochaineCarie(p, true, 0.5);
    expect(p).toBeGreaterThanOrEqual(CARIE_INITIALE);
    const installee = p;
    // Même sans nouvelle blessure, elle avance.
    p = prochaineCarie(p, false, 0.5);
    expect(p).toBeGreaterThan(installee);
    // Et un arbre jamais blessé reste sain, quel que soit le temps qui passe.
    let sain = 0;
    for (let an = 0; an < 200; an++) sain = prochaineCarie(sain, false, 0.5);
    expect(sain).toBe(0);
  });

  it("un bois dense se carie plus lentement, et c'est un trait déjà déclaré", () => {
    // `bois.densite` sert déjà de résistance à la décomposition pour une
    // chandelle (boisMort.ts). C'est la même propriété, lue sur un vivant.
    const chene = getEspece("quercus_pubescens").bois.densite;
    const saule = getEspece("salix_alba").bois.densite;
    expect(chene).toBeGreaterThan(saule);
    const apresChene = prochaineCarie(0.2, false, chene);
    const apresSaule = prochaineCarie(0.2, false, saule);
    expect(apresChene).toBeLessThan(apresSaule);
    expect(PROGRESSION_CARIE_PAR_AN).toBeGreaterThan(0);
  });
});

describe("en partie : le vieil arbre creux naît des coups de vent", () => {
  it("un siècle de tempêtes fabrique des chênes creux", () => {
    // La conséquence qu'on n'a pas écrite : les plaies de tempête s'accumulent,
    // la carie ne se referme pas, et il sort une population de vieux arbres
    // creux — ceux-là mêmes que le moteur compte déjà comme habitats (J3).
    // Relevé : à cent vingt ans, 49 chênes cariés sur 163 vivants, dont 41
    // creux au-delà de la moitié de leur rayon.
    const COTE = 40;
    const station: Station = { ...LIMON_RICHE.station, coteM: COTE, voisinage: [] };
    const serie = serieMeteoPour(LIMON_RICHE.station.id);
    if (!serie) throw new Error("série manquante");
    const meteo = serieToWeeks(serie);
    let s: GameState = plantScattered(
      createGameState(station, rngStateFromSeed(7)),
      "quercus_pubescens",
      300,
    );
    for (let i = 0; i < 120 * 52; i++) {
      const w = meteo[i % meteo.length];
      if (!w) throw new Error("météo manquante");
      s = advanceWeek(s, w, []).state;
    }
    const vivants = s.trees.filter((t) => t.alive);
    const caries = vivants.filter((t) => (t.pourriture ?? 0) > 0);
    const creux = vivants.filter((t) => (t.pourriture ?? 0) > 0.5);
    expect(caries.length).toBeGreaterThan(10);
    expect(creux.length).toBeGreaterThan(0);
    // Mais pas TOUS : un arbre jamais blessé reste sain, et c'est la moitié du
    // mécanisme. Une carie qui toucherait tout le monde serait de la
    // vieillesse déguisée, or `tickTree` fait déjà décliner la vigueur.
    expect(caries.length).toBeLessThan(vivants.length);
  }, 900_000);
});
