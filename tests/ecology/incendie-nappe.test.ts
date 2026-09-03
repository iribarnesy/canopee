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
      ruissellement += r.fluxes.ruissellementSortantMm + r.fluxes.overflowMm;
      if (i >= 48 || i <= 4) nappeHiver += r.fluxes.nappeProfondeurCm / 9;
      inondee = Math.max(inondee, r.fluxes.partInondee);
    }
  }
  return { transpiration, ruissellement, nappeHiver, inondee, state: s };
}

describe("la forêt tient la nappe, et l'incendie la relâche", () => {
  const avant = foret(40);
  const intacte = suivre(avant);
  const brulee = suivre(bruler(avant));

  it("1. la forêt transpirait : brûlée, elle ne transpire plus", () => {
    // Mesuré : 730 mm par an avant, 196 après.
    expect(intacte.transpiration).toBeGreaterThan(3 * brulee.transpiration);
  });

  it("2. l'eau qu'elle ne prend plus fait REMONTER la nappe, d'un demi-mètre", () => {
    // Le maillon qui manquait : sans stock, cette eau disparaissait du modèle.
    // Mesuré : la nappe d'hiver passe de 74 cm à 20 cm sous la surface.
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
