/**
 * Cas d'étude : après l'incendie, l'inondation.
 *
 * Notes d'un conseil d'administration d'urgence après les feux de Gironde
 * (Saumos, Landiras, 2022). Le raisonnement des gestionnaires : la forêt fait
 * baisser le niveau de la nappe en transpirant ; là où elle a brûlé, elle ne
 * pompe plus, la nappe remonte, et l'hiver suivant les zones brûlées
 * s'inondent. S'y ajoute la perte de rugosité, qui accélère le ruissellement.
 *
 * Rien de tout cela n'est écrit dans le moteur. On vérifie que la chaîne
 * s'établit d'elle-même, maillon par maillon.
 */

import { describe, expect, it } from "vitest";
import { syntheticYear } from "../../src/engine/meteo";
import { rngStateFromSeed } from "../../src/engine/rng";
import { createGameState, type GameState, plantScattered } from "../../src/engine/state";
import { VALLEE_ENGORGEE } from "../../src/engine/stations";
import { tick } from "../../src/engine/tick";

/** Ce qu'un incendie laisse : plus d'arbres, plus de couvert, plus de litière. */
function bruler(state: GameState): GameState {
  return {
    ...state,
    trees: state.trees.map((t) => ({ ...t, alive: false })),
    soil: {
      ...state.soil,
      herbeCouverture: state.soil.herbeCouverture.map(() => 0),
      litterCG: state.soil.litterCG.map(() => 0),
    },
  };
}

const METEO = syntheticYear(VALLEE_ENGORGEE.climat);

/**
 * Une aulnaie adulte de fond de vallée, là où la nappe est à portée. C'est la
 * station où le mécanisme est le plus lisible : une forêt qui a de l'eau à
 * volonté en consomme beaucoup, donc elle en prive beaucoup la nappe.
 */
function foret(annees: number, partBassinSemblable = 0): GameState {
  let state = createGameState(
    { ...VALLEE_ENGORGEE.station, coteM: 30, voisinage: [], gibierParHa: 0, partBassinSemblable },
    rngStateFromSeed(4),
  );
  state = plantScattered(state, "alnus_glutinosa", 100, 0.5);
  for (let i = 0; i < annees * 52; i++) state = tick(state, METEO[i % 52] as never).state;
  return state;
}

/** Une année de suivi, résumée. */
function suivre(depart: GameState) {
  let s = depart;
  let transpiration = 0;
  let evapotranspiration = 0;
  let ruissellement = 0;
  let nappeHiver = 0;
  let inondee = 0;
  // Deux ans : la nappe met une saison à répondre, ce n'est pas instantané.
  for (let an = 0; an < 2; an++) {
    for (let i = 0; i < 52; i++) {
      const r = tick(s, METEO[i] as never);
      s = r.state;
      if (an === 0) continue;
      transpiration += r.fluxes.transpirationMm;
      evapotranspiration += r.fluxes.transpirationMm + r.fluxes.evapMm;
      ruissellement += r.fluxes.ruissellementSortantMm + r.fluxes.overflowMm;
      if (i >= 48 || i <= 4) nappeHiver += r.fluxes.nappeProfondeurCm / 9;
      inondee = Math.max(inondee, r.fluxes.partInondee);
    }
  }
  return { transpiration, evapotranspiration, ruissellement, nappeHiver, inondee, state: s };
}

describe("la forêt tient la nappe, et l'incendie la relâche", () => {
  const avant = foret(40);
  const intacte = suivre(avant);
  const brulee = suivre(bruler(avant));

  it("1. la forêt rendait plus d'eau à l'air que la parcelle brûlée, et la nappe remonte", () => {
    // **Réécrit sur son critère** (#391). Ce maillon exigeait que la forêt
    // transpire trois fois plus que la parcelle brûlée. Le facteur venait d'un
    // relevé du moteur (730 mm contre 196), pas d'une mesure de terrain : la
    // parcelle brûlée ne transpirait presque pas parce que l'herbe revenue
    // transpirait à 0,3 fois l'ETP, et que l'eau de son sol était comptée dans
    // l'évaporation. L'herbe transpire maintenant au coefficient d'un tapis
    // fermé (FAO-56) : deuxième année après le feu, 522 mm de transpiration et
    // 80 d'évaporation, 602 en tout, contre 855 pour la forêt (sur `main` :
    // 338 contre 771). La nappe d'hiver remonte de 51 cm (55 sur `main`).
    //
    // Ce qui tient la nappe, c'est ce que la parcelle **rend à l'air**, et c'est
    // ce que les gestionnaires girondins disaient : la forêt pompe, brûlée elle
    // pompe moins. Le maillon porte donc sur l'évapotranspiration et sur le sens
    // de la remontée, sans facteur ; le maillon 2 en garde l'ampleur.
    expect(intacte.evapotranspiration).toBeGreaterThan(brulee.evapotranspiration);
    expect(brulee.nappeHiver).toBeLessThan(intacte.nappeHiver);
  });

  it("2. l'eau qu'elle ne prend plus fait REMONTER la nappe, d'un demi-mètre", () => {
    // Le maillon qui manquait : sans stock, cette eau disparaissait du modèle.
    // Mesuré : la nappe d'hiver passe de 77 cm à 26 cm sous la surface (#391 ;
    // 72 et 17 sur `main`).
    expect(brulee.nappeHiver).toBeLessThan(intacte.nappeHiver - 30);
  });

  it("3. remontée jusqu'à l'affleurement : la parcelle brûlée s'inonde", () => {
    expect(brulee.inondee).toBeGreaterThan(0);
  });

  it("4. la rugosité perdue accélère le ruissellement", () => {
    expect(brulee.ruissellement).toBeGreaterThan(intacte.ruissellement);
  });
});

describe("l'échelle de l'incendie compte", () => {
  /** Remontée de nappe après le feu, cm, selon ce que le bassin partage. */
  function remontee(partBassinSemblable: number): number {
    const avant = foret(40, partBassinSemblable);
    return suivre(avant).nappeHiver - suivre(bruler(avant)).nappeHiver;
  }

  it("un massif qui brûle en entier fait remonter la nappe bien plus qu'une parcelle", () => {
    // Le niveau régional est une donnée exogène tant que la parcelle est seule
    // à brûler : la région continue de tenir son niveau. Mais quand tout le
    // bassin subit le même sort, les alentours cessent eux aussi de
    // transpirer, et le niveau régional monte avec (nappe.ts). C'est la
    // différence entre l'incendie d'une parcelle et celui d'un massif — et
    // c'est le second que décrivaient les gestionnaires girondins.
    const isolee = remontee(0);
    const massif = remontee(1);
    expect(isolee).toBeGreaterThan(0);
    expect(massif).toBeGreaterThan(1.5 * isolee);
  });

  it("sans rien partager avec son bassin, la parcelle ne déplace pas la région", () => {
    // Le paramètre a un sens : à zéro, le niveau régional ne bouge pas d'un
    // pouce quoi qu'il arrive sur la parcelle.
    const etat = foret(5, 0);
    let s = etat;
    for (let i = 0; i < 52; i++) s = tick(s, METEO[i] as never).state;
    expect(s.soil.nappeRegionaleMm).toBeCloseTo(etat.soil.nappeRegionaleMm, 6);
  });
});
