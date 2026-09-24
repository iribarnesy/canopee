/**
 * **La carie du tronc** (issue #182).
 *
 * Après le bloc tempêtes, le moteur tenait l'élancement, l'espacement,
 * l'ancrage, le sol gorgé, la prise au vent, la densité du bois, la naïveté
 * d'après-ouverture et la blessure de houppier — et traitait tous ses arbres
 * comme **sains**. Or une part importante des arbres qu'une tempête casse étaient
 * déjà pourris ; c'est même la raison pour laquelle ils cassent au lieu de
 * verser.
 *
 * Ce fichier vérifie surtout une chose, et c'est celle qu'on n'a pas écrite :
 * un tronc creux est un **tube**, donc sa résistance va comme `1 − p⁴`, donc un
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
  AVANCEE_CARIE_CM_AN,
  CARIE_INITIALE,
  facteurCarie,
  facteurCarieAncrage,
  partCariee,
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
    const R = 10;
    let c = prochaineCarie(undefined, true, true, R, 0.5);
    expect(c?.rayonCm).toBeGreaterThanOrEqual(CARIE_INITIALE * R);
    const installee = c?.rayonCm ?? 0;
    // Même sans nouvelle blessure, elle avance.
    c = prochaineCarie(c, false, false, R, 0.5);
    expect(c?.rayonCm).toBeGreaterThan(installee);
    // Et un arbre jamais blessé reste sain, quel que soit le temps qui passe.
    let sain = prochaineCarie(undefined, false, false, R, 0.5);
    for (let an = 0; an < 200; an++) sain = prochaineCarie(sain, false, false, R, 0.5);
    expect(sain).toBeUndefined();
  });

  it("mais elle ne POURSUIT pas l'arbre : le mur de compartimentation la borne", () => {
    // Le CODIT, et c'est lui qui décide de tout. À la blessure l'arbre dresse
    // une barrière sur le bois qu'il a **ce jour-là** ; l'aubier fabriqué ensuite
    // reste hors d'atteinte. Un tronc de 10 cm de rayon blessé aujourd'hui ne
    // pourrira jamais au-delà de ces 10 cm-là, même dans mille ans.
    let c = prochaineCarie(undefined, true, false, 10, 0.5);
    for (let an = 0; an < 500; an++) c = prochaineCarie(c, false, false, 10, 0.5);
    expect(c?.rayonCm).toBeCloseTo(10, 6);
    expect(partCariee(c, 20)).toBe(1);
    // Et s'il a grossi entre-temps, la **même** colonne ne fait plus qu'une part
    // du tronc : le chêne de futaie porte sa cicatrice de jeunesse sans en
    // souffrir à cent ans.
    expect(partCariee(c, 60)).toBeCloseTo(1 / 3, 6);
    expect(facteurCarie(partCariee(c, 60))).toBeGreaterThan(0.99);
  });

  it("un arbre VIGOUREUX distance sa carie, un arbre qui végète se fait rattraper", () => {
    // La conséquence qu'on n'a pas écrite. Deux arbres blessés au même rayon,
    // l'un qui pousse et l'autre non, cinquante ans plus tard.
    const R0 = 8;
    let vif = prochaineCarie(undefined, true, false, R0, 0.5);
    let lent = vif;
    let rVif = R0;
    for (let an = 0; an < 50; an++) {
      rVif += 0.25; // accroissement radial d'un sujet vigoureux, cm/an
      vif = prochaineCarie(vif, false, false, rVif, 0.5);
      lent = prochaineCarie(lent, false, false, R0, 0.5);
    }
    expect(partCariee(lent, 2 * R0)).toBe(1);
    expect(partCariee(vif, 2 * rVif)).toBeLessThan(0.45);
  });

  it("un bois dense se carie plus lentement, et c'est un trait déjà déclaré", () => {
    // `bois.densite` sert déjà de résistance à la décomposition pour une
    // chandelle (boisMort.ts). C'est la même propriété, lue sur un vivant.
    const chene = getEspece("quercus_pubescens").bois.densite;
    const saule = getEspece("salix_alba").bois.densite;
    expect(chene).toBeGreaterThan(saule);
    const depart = { rayonCm: 2, barriereCm: 30 };
    const apresChene = prochaineCarie(depart, false, false, 30, chene);
    const apresSaule = prochaineCarie(depart, false, false, 30, saule);
    expect(apresChene?.rayonCm).toBeLessThan(apresSaule?.rayonCm ?? 0);
    expect(AVANCEE_CARIE_CM_AN).toBeGreaterThan(0);
  });
});

describe("en partie : le vieil arbre creux naît des coups de vent", () => {
  it("un siècle de tempêtes fabrique des chênes creux", () => {
    // La conséquence qu'on n'a pas écrite : les plaies de tempête s'accumulent,
    // la carie ne se referme pas, et il sort une population de vieux arbres
    // creux — ceux-là mêmes que le moteur compte comme habitats (J3, #183).
    //
    // **le premier relevé en donnait cinq fois trop**, et c'est ce banc qui l'a
    // dit. Il comptait 46 chênes cariés sur 163 vivants dont 43 creux au-delà
    // de la moitié de leur rayon : un quart du peuplement, à l'âge où une
    // futaie de chêne est précisément du bois d'œuvre. La cause n'était ni la
    // vitesse de la carie ni la compartimentation, mais le **seuil d'entrée**, qui
    // n'existait pas : la moindre brindille arrachée inoculait, et comme
    // `houppierArrache` mord dès 27 m/s, tout le monde finissait blessé. Avec
    // `PLAIE_OUVRANTE` — une plaie doit atteindre le bois de cœur pour ouvrir
    // une porte —, le relevé tombe à **9 cariés sur 165 vivants, dont 8 creux
    // au-delà de la moitié**, soit 5 % du peuplement. C'est l'ordre de grandeur
    // d'une futaie réelle, et c'est bien la tempête qui inocule, plus la brise.
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
    const caries = vivants.filter((t) => t.carie !== undefined);
    const creux = vivants.filter((t) => partCariee(t.carie, t.diametreCm) > 0.5);
    expect(caries.length).toBeGreaterThan(3);
    expect(creux.length).toBeGreaterThan(0);
    // Et une franche minorité : le seuil est posé bien en dessous des 5,5 %
    // mesurés, mais il interdit le quart de peuplement d'avant.
    expect(caries.length).toBeLessThan(vivants.length / 5);
    // Mais pas **tous** : un arbre jamais blessé reste sain, et c'est la moitié du
    // mécanisme. Une carie qui toucherait tout le monde serait de la
    // vieillesse déguisée, or `tickTree` fait déjà décliner la vigueur.
    expect(caries.length).toBeLessThan(vivants.length);
  }, 900_000);
});
