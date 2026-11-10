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
function foret(annees: number, partBassinSemblable = 0, graine = 4): GameState {
  let state = createGameState(
    { ...VALLEE_ENGORGEE.station, coteM: 30, voisinage: [], gibierParHa: 0, partBassinSemblable },
    rngStateFromSeed(graine),
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
    // Depuis #380 et #381, l'aquifère n'est plus abaissé de l'eau que la
    // saturation imposée lui prenait : 598 contre 853 mm rendus à l'air, et la
    // nappe d'hiver remonte de 88 cm.
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
    // 72 et 17 sur `main`), puis de 90 à 2 cm (#380, #381).
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
  /**
   * Remontée de nappe après le feu, cm, selon ce que le bassin partage, et le
   * niveau régional au bout du suivi, forêt intacte et forêt brûlée.
   */
  function echelle(partBassinSemblable: number, graine: number) {
    const avant = foret(40, partBassinSemblable, graine);
    const intacte = suivre(avant);
    const brulee = suivre(bruler(avant));
    return {
      remontee: intacte.nappeHiver - brulee.nappeHiver,
      regionalIntacte: intacte.state.soil.nappeRegionaleMm,
      regionalBrulee: brulee.state.soil.nappeRegionaleMm,
    };
  }

  it("un massif qui brûle en entier fait remonter la nappe plus qu'une parcelle, par la région", () => {
    // Le niveau régional est une donnée exogène tant que la parcelle est seule
    // à brûler : la région continue de tenir son niveau. Mais quand tout le
    // bassin subit le même sort, les alentours cessent eux aussi de
    // transpirer, et le niveau régional monte avec (nappe.ts). C'est la
    // différence entre l'incendie d'une parcelle et celui d'un massif — et
    // c'est le second que décrivaient les gestionnaires girondins.
    //
    // **Relu sur son critère (#467, décision du propriétaire), et c'est
    // signalé.** L'essai exigeait, sur la seule graine 4, une remontée du
    // massif au-delà de 1,5 fois celle de la parcelle. Le 1,5 n'avait pas de
    // source (il valait 2, puis 1,6 depuis #380 et #381), et il ne contraignait
    // plus rien : 1,498 et 1,512 pour deux écritures de la même loi qui ne
    // diffèrent que par l'arrondi de quelques opérations, 1,496 à 1,525 sur
    // quatre graines, 1,52 à 1,65 avec l'élagage à la cime, 1,60 à 1,62 sur le
    // couvert seul. Ce que l'essai affirme, c'est que le massif remonte plus
    // **parce que** la région remonte avec lui. Il se lit donc sur quatre
    // graines : la remontée du massif dépasse celle de la parcelle, et le
    // niveau régional, immobile pour la parcelle seule, remonte après le feu
    // du massif. L'écart vaut 39 à 50 cm, de l'ordre de la remontée régionale
    // (une cinquantaine de millimètres d'aquifère en deux ans, environ 50 cm
    // de nappe). Coût : huit forêts de quarante ans au lieu de deux ; en CI, le
    // fichier passe de 81 à 288 s.
    for (const graine of [4, 1, 2, 3]) {
      const isolee = echelle(0, graine);
      const massif = echelle(1, graine);
      expect(isolee.remontee, `graine ${graine}`).toBeGreaterThan(0);
      expect(massif.remontee, `graine ${graine}`).toBeGreaterThan(isolee.remontee);
      expect(isolee.regionalBrulee, `graine ${graine}`).toBeCloseTo(isolee.regionalIntacte, 6);
      expect(massif.regionalBrulee, `graine ${graine}`).toBeGreaterThan(massif.regionalIntacte);
    }
  }, 1_200_000);

  it("sans rien partager avec son bassin, la parcelle ne déplace pas la région", () => {
    // Le paramètre a un sens : à zéro, le niveau régional ne bouge pas d'un
    // pouce quoi qu'il arrive sur la parcelle.
    const etat = foret(5, 0);
    let s = etat;
    for (let i = 0; i < 52; i++) s = tick(s, METEO[i] as never).state;
    expect(s.soil.nappeRegionaleMm).toBeCloseTo(etat.soil.nappeRegionaleMm, 6);
  });
});
